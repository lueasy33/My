import { db } from '../db.js'
import { requireAuth } from '../index.js'
import { awardXp, awardCoil, checkAchievements, finishLesson, XP, COIL } from '../economy.js'
import { canSeeCourse, courseFilterSql, lessonLocks, isStaff } from '../access.js'

// ─────────────────────────────────────────────────────────────
// Обучение: библиотека, курс, урок, тест.
// Главное правило безопасности: правильные ответы НЕ уходят в браузер
// до сдачи попытки. Проверка только на сервере.
// ─────────────────────────────────────────────────────────────

const TZ_DAY = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(ms))
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

export default async function learnRoutes(app) {
  // Библиотека: категории → курсы с прогрессом
  app.get('/api/library', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const f = courseFilterSql(u)
    const cats = db.prepare('SELECT * FROM categories ORDER BY sort, id').all()
    const courses = db.prepare(`
      SELECT c.*, cat.title AS category, cat.color AS category_color,
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS lessons_total,
        (SELECT COUNT(*) FROM lessons l JOIN progress p ON p.lesson_id = l.id
          WHERE l.course_id = c.id AND l.published = 1 AND p.user_id = ? AND p.status = 'passed') AS lessons_done,
        (SELECT MIN(l.deadline) FROM lessons l
          LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
          WHERE l.course_id = c.id AND l.published = 1 AND l.deadline IS NOT NULL
            AND (p.status IS NULL OR p.status != 'passed')) AS next_deadline
      FROM courses c LEFT JOIN categories cat ON cat.id = c.category_id
      WHERE ${f.sql} AND c.published = 1
    `).all(u.id, u.id, ...f.params)

    const FILTERS = ['all', 'active', 'overdue', 'week', 'done']
    const filter = FILTERS.includes(req.query.filter) ? req.query.filter : 'all'
    const today = TZ_DAY(Date.now())

    const enriched = courses
      .filter(c => c.lessons_total > 0)
      .map(c => ({ ...courseCard(c), days_left: c.next_deadline ? daysBetween(today, c.next_deadline) : null }))
    const pass = (c) => {
      if (filter === 'active') return !c.complete && c.lessons_done > 0
      if (filter === 'done') return c.complete
      if (filter === 'overdue') return c.days_left !== null && c.days_left < 0 && !c.complete
      if (filter === 'week') return c.days_left !== null && c.days_left >= 0 && c.days_left <= 7 && !c.complete
      return true
    }
    // Порядок — это приоритет (спецификация 5.2): обязательные и срочные сверху,
    // завершённые вниз.
    const IMP = { required: 0, recommended: 1, extra: 2 }
    const picked = enriched.filter(pass).sort((a, b) =>
      (a.complete - b.complete) ||
      ((IMP[a.importance] ?? 9) - (IMP[b.importance] ?? 9)) ||
      ((a.days_left ?? 1e9) - (b.days_left ?? 1e9)) ||
      a.id - b.id)

    const counts = {
      all: enriched.length,
      active: enriched.filter(c => !c.complete && c.lessons_done > 0).length,
      done: enriched.filter(c => c.complete).length,
      overdue: enriched.filter(c => c.days_left !== null && c.days_left < 0 && !c.complete).length
    }

    reply.send({
      filter, count: picked.length, counts,
      categories: cats.map(c => ({ ...c, courses: picked.filter(x => x.category_id === c.id) })).filter(c => c.courses.length),
      courses: picked
    })
  })

  app.get('/api/course/:id', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const course = db.prepare(`
      SELECT c.*, cat.title AS category, cat.color AS category_color FROM courses c
      LEFT JOIN categories cat ON cat.id = c.category_id WHERE c.id = ?
    `).get(req.params.id)
    if (!canSeeCourse(u, course)) return reply.code(404).send({ error: 'Курс не найден' })

    const staff = isStaff(u)
    const lessons = db.prepare(`
      SELECT l.id, l.title, l.description, l.sort, l.minutes, l.deadline, l.published, l.version,
        p.status, p.updated_at,
        (SELECT COUNT(*) FROM blocks b WHERE b.lesson_id = l.id) AS blocks,
        (SELECT COUNT(*) FROM questions q JOIN tests t ON t.id = q.test_id WHERE t.lesson_id = l.id) AS questions
      FROM lessons l LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
      WHERE l.course_id = ? ${staff ? '' : 'AND l.published = 1'}
      ORDER BY l.sort, l.id
    `).all(u.id, course.id)
    const locks = lessonLocks(u, course.id)
    const published = lessons.filter(l => l.published)
    const done = published.filter(l => l.status === 'passed').length
    const next = published.find(l => l.status !== 'passed' && !locks.has(l.id))

    reply.send({
      course: courseCard({ ...course, lessons_total: published.length, lessons_done: done }),
      lessons: lessons.map(l => ({ ...l, has_test: l.questions > 0, locked: locks.has(l.id) })),
      next_lesson_id: next?.id || null,
      reward: { xp: XP.course, coil: COIL.course }
    })
  })

  // Урок: блоки + метаданные теста, без ответов
  app.get('/api/lesson/:id', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const lesson = db.prepare(`
      SELECT l.*, c.title AS course, c.id AS course_id, c.category_id, c.published AS course_published, c.branch_id
      FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = ?
    `).get(req.params.id)
    const course = lesson && { published: lesson.course_published, branch_id: lesson.branch_id }
    const staff = isStaff(u)
    if (!lesson || !canSeeCourse(u, course) || (!lesson.published && !staff)) {
      return reply.code(404).send({ error: 'Урок не найден' })
    }
    if (lessonLocks(u, lesson.course_id).has(lesson.id)) {
      return reply.code(403).send({ error: 'Сначала пройдите предыдущий урок курса', locked: true, course_id: lesson.course_id })
    }

    const positions = Object.fromEntries(db.prepare(
      'SELECT block_id, seconds FROM video_positions WHERE user_id = ?').all(u.id).map(r => [r.block_id, r.seconds]))
    const blocks = db.prepare('SELECT id, type, content, sort FROM blocks WHERE lesson_id = ? ORDER BY sort')
      .all(lesson.id).map(b => ({ ...b, content: JSON.parse(b.content), position: positions[b.id] || 0 }))

    const test = db.prepare('SELECT * FROM tests WHERE lesson_id = ?').get(lesson.id)
    const questions = test ? db.prepare('SELECT id, type, prompt, options, sort FROM questions WHERE test_id = ? ORDER BY sort')
      .all(test.id).map(q => ({ ...q, options: q.type === 'boolean' ? ['Верно', 'Неверно'] : JSON.parse(q.options) })) : []
    const testMeta = test && questions.length ? {
      id: test.id, pass_score: test.pass_score, attempts_allowed: test.attempts_allowed,
      pause_minutes: test.pause_minutes, questions
    } : null

    const progress = db.prepare('SELECT * FROM progress WHERE user_id = ? AND lesson_id = ?').get(u.id, lesson.id)
    const lastAttempt = test ? db.prepare(
      'SELECT id, score, passed, pending, created_at FROM attempts WHERE user_id = ? AND test_id = ? ORDER BY id DESC LIMIT 1'
    ).get(u.id, test.id) : null

    const siblings = db.prepare(`SELECT id, title, sort FROM lessons WHERE course_id = ? ${staff ? '' : 'AND published = 1'} ORDER BY sort, id`)
      .all(lesson.course_id)

    if (!progress && !staff) {
      db.prepare("INSERT OR IGNORE INTO progress(user_id, lesson_id, lesson_version, status) VALUES (?,?,?,'in_progress')")
        .run(u.id, lesson.id, lesson.version)
    } else if (progress && progress.status === 'in_progress') {
      db.prepare("UPDATE progress SET updated_at = datetime('now') WHERE id = ?").run(progress.id)
    }

    const { branch_id, course_published, ...lessonOut } = lesson
    reply.send({
      lesson: lessonOut, blocks, test: testMeta, progress: progress || null,
      preview: !lesson.published,
      lastAttempt,
      siblings, index: siblings.findIndex(s => s.id === lesson.id) + 1,
      attemptsUsed: test ? db.prepare('SELECT COUNT(*) c FROM attempts WHERE user_id = ? AND test_id = ?').get(u.id, test.id).c : 0
    })
  })

  // Видео помнит позицию остановки (спецификация 5.2)
  app.post('/api/video/:blockId/position', { preHandler: requireAuth }, async (req, reply) => {
    const seconds = Math.max(0, Number(req.body?.seconds) || 0)
    db.prepare(`INSERT INTO video_positions(user_id, block_id, seconds) VALUES (?,?,?)
      ON CONFLICT(user_id, block_id) DO UPDATE SET seconds = excluded.seconds, updated_at = datetime('now')`)
      .run(req.user.id, Number(req.params.blockId), seconds)
    reply.send({ ok: true })
  })

  // Прочитал урок без теста — засчитываем. С тестом — просто отмечаем активность.
  app.post('/api/lesson/:id/complete', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const lesson = db.prepare(`SELECT l.*, c.published AS course_published, c.branch_id FROM lessons l
      JOIN courses c ON c.id = l.course_id WHERE l.id = ? AND l.published = 1`).get(req.params.id)
    if (!lesson || !canSeeCourse(u, { published: lesson.course_published, branch_id: lesson.branch_id })) {
      return reply.code(404).send({ error: 'Урок не найден' })
    }
    if (lessonLocks(u, lesson.course_id).has(lesson.id)) {
      return reply.code(403).send({ error: 'Сначала пройдите предыдущий урок курса' })
    }
    const hasTest = db.prepare(`SELECT COUNT(*) c FROM questions q JOIN tests t ON t.id = q.test_id WHERE t.lesson_id = ?`)
      .get(lesson.id).c > 0

    let reward = null
    if (!hasTest) {
      reward = finishLesson(u.id, lesson.id, lesson.version)
      checkAchievements(u.id)
    } else {
      db.prepare("INSERT OR IGNORE INTO progress(user_id, lesson_id, lesson_version, status) VALUES (?,?,?,'in_progress')")
        .run(u.id, lesson.id, lesson.version)
    }
    reply.send({ ok: true, test_required: hasTest, reward })
  })

  // Сдача теста. Всё считается здесь.
  app.post('/api/test/:id/attempt', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const test = db.prepare(`SELECT t.*, l.id AS lesson_id, l.version, l.course_id, l.published AS lesson_published,
        c.published AS course_published, c.branch_id
      FROM tests t JOIN lessons l ON l.id = t.lesson_id JOIN courses c ON c.id = l.course_id WHERE t.id = ?`)
      .get(req.params.id)
    if (!test || !test.lesson_published || !canSeeCourse(u, { published: test.course_published, branch_id: test.branch_id })) {
      return reply.code(404).send({ error: 'Тест не найден' })
    }
    if (lessonLocks(u, test.course_id).has(test.lesson_id)) {
      return reply.code(403).send({ error: 'Сначала пройдите предыдущий урок курса' })
    }
    const pendingNow = db.prepare('SELECT 1 FROM attempts WHERE user_id = ? AND test_id = ? AND pending = 1').get(u.id, test.id)
    if (pendingNow) return reply.code(409).send({ error: 'Предыдущий ответ ещё на проверке у администратора' })

    const used = db.prepare('SELECT COUNT(*) c FROM attempts WHERE user_id = ? AND test_id = ?').get(u.id, test.id).c
    if (used >= test.attempts_allowed) {
      return reply.code(429).send({ error: 'Попытки закончились. Обратитесь к администратору', attempts_left: 0 })
    }
    const last = db.prepare('SELECT created_at FROM attempts WHERE user_id = ? AND test_id = ? ORDER BY id DESC LIMIT 1')
      .get(u.id, test.id)
    if (last) {
      const since = (Date.now() - new Date(last.created_at.replace(' ', 'T') + 'Z').getTime()) / 60000
      if (since < test.pause_minutes) {
        return reply.code(429).send({
          error: `Пауза между попытками: ещё ${Math.ceil(test.pause_minutes - since)} мин`,
          pause_left: Math.ceil(test.pause_minutes - since)
        })
      }
    }

    const answers = req.body?.answers || {}
    const questions = db.prepare('SELECT * FROM questions WHERE test_id = ? ORDER BY sort').all(test.id)
    if (!questions.length) return reply.code(400).send({ error: 'В тесте нет вопросов' })
    let correct = 0
    let open = 0
    const review = []

    for (const q of questions) {
      const given = answers[q.id]
      if (q.type === 'open') {
        open += 1
        const text = String(given ?? '').trim().slice(0, 4000)
        answers[q.id] = text
        review.push({ id: q.id, prompt: q.prompt, type: q.type, given: text, ok: null, open: true })
        continue
      }
      const right = JSON.parse(q.correct)
      let ok = false
      if (q.type === 'multi') {
        const a = Array.isArray(given) ? [...new Set(given.map(Number))].sort() : []
        const b = [...right].map(Number).sort()
        ok = a.length === b.length && a.every((v, i) => v === b[i])
      } else {
        ok = Array.isArray(given) && Number(given[0]) === Number(right[0])
      }
      if (ok) correct += 1
      review.push({
        id: q.id, prompt: q.prompt, type: q.type, given: given ?? null, ok,
        correct: test.show_answers ? right : null,
        explanation: test.show_answers ? q.explanation : ''
      })
    }

    const auto = questions.length - open
    const score = auto ? Math.round((correct / auto) * 100) : 0
    const pending = open > 0 && (auto === 0 || score >= test.pass_score)
    const passed = !pending && open === 0 && score >= test.pass_score
    const status = pending ? 'pending' : (passed ? 'passed' : 'failed')

    const ins = db.prepare('INSERT INTO attempts(user_id, test_id, answers, score, passed, pending) VALUES (?,?,?,?,?,?)')
      .run(u.id, test.id, JSON.stringify(answers), score, passed ? 1 : 0, pending ? 1 : 0)

    const prior = db.prepare('SELECT status FROM progress WHERE user_id = ? AND lesson_id = ?').get(u.id, test.lesson_id)
    let reward = null
    if (passed) {
      if (prior?.status !== 'passed') {
        reward = finishLesson(u.id, test.lesson_id, test.version)
        reward.xp += awardXp(u.id, XP.test, 'test', String(test.id))
        reward.coil += awardCoil(u.id, COIL.test, 'test', String(test.id))
        if (score === 100) {
          reward.xp += awardXp(u.id, XP.testPerfect, 'test_perfect', String(test.id))
          reward.coil += awardCoil(u.id, COIL.testPerfect, 'test_perfect', String(test.id))
        }
      } else {
        reward = { xp: 0, coil: 0, repeat: true }
      }
      checkAchievements(u.id)
    } else if (prior?.status !== 'passed') {
      // Уже сданный урок неудачная пересдача не «проваливает»
      db.prepare(`INSERT INTO progress(user_id, lesson_id, lesson_version, status) VALUES (?,?,?,?)
        ON CONFLICT(user_id, lesson_id) DO UPDATE SET status = excluded.status, updated_at = datetime('now')`)
        .run(u.id, test.lesson_id, test.version, status)
    }
    if (pending) {
      // Администраторам — сигнал, что есть что проверить
      const heads = db.prepare(`SELECT id FROM users WHERE archived_at IS NULL AND status = 'active' AND role = 'admin'`).all()
      for (const h of heads) {
        db.prepare('INSERT INTO notifications(user_id, kind, title, body, link) VALUES (?,?,?,?,?)')
          .run(h.id, 'review', 'Открытый ответ ждёт проверки', u.name, '/admin/reviews')
      }
    }

    const fresh = db.prepare('SELECT xp, coil, level FROM users WHERE id = ?').get(u.id)
    reply.send({
      attempt: { id: ins.lastInsertRowid, score, passed, pending, correct, auto, total: questions.length },
      review,
      reward,
      user: fresh,
      pass_score: test.pass_score,
      pause_minutes: test.pause_minutes,
      attempts_left: Math.max(0, test.attempts_allowed - used - 1)
    })
  })
}

function courseCard(c) {
  const done = c.lessons_done || 0
  const total = c.lessons_total || 0
  return {
    id: c.id, title: c.title, description: c.description, cover: c.cover,
    category: c.category, category_id: c.category_id, category_color: c.category_color || '',
    importance: c.importance, minutes: c.minutes, published: !!c.published, branch_id: c.branch_id,
    next_deadline: c.next_deadline || null,
    lessons_total: total, lessons_done: done,
    percent: total ? Math.round((done / total) * 100) : 0,
    complete: total > 0 && done >= total
  }
}
