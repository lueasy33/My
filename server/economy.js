import { db, getMeta } from './db.js'
import { queuePush } from './push.js'

// ─────────────────────────────────────────────────────────────
// Экономика. Числа — стартовая настройка из спецификации (раздел 7),
// вынесены в одно место, чтобы их можно было крутить после первого месяца.
// ─────────────────────────────────────────────────────────────
export const XP = {
  lesson: 10,
  test: 15,
  testPerfect: 10,
  course: 30,
  streak7: 20,
  flavorTrain: 30,
  flavorAnswer: 3
}

export const COIL = {
  lesson: 15,
  test: 10,
  testPerfect: 15,
  course: 40,
  dailyLogin: 5,
  streak7: 30,
  streak14: 70,
  streak30: 200,
  achievement: 30,
  flavorTrain: 18,
  flavorAnswer: 2
}

// Пороги уровней: до 10 фиксированные, дальше +450 за уровень.
const THRESHOLDS = [0, 50, 120, 220, 360, 540, 760, 1030, 1360, 1760]

export function levelForXp(xp) {
  let level = 1
  for (let i = 0; i < THRESHOLDS.length; i++) if (xp >= THRESHOLDS[i]) level = i + 1
  if (level >= 10) {
    let extra = xp - THRESHOLDS[9]
    level = 10 + Math.floor(extra / 450)
  }
  return level
}

export function xpForLevel(level) {
  if (level <= 10) return THRESHOLDS[Math.max(0, level - 1)]
  return THRESHOLDS[9] + (level - 10) * 450
}

export function levelProgress(xp) {
  const level = levelForXp(xp)
  const cur = xpForLevel(level)
  const next = xpForLevel(level + 1)
  const span = Math.max(1, next - cur)
  return { level, xp, current: xp - cur, span, percent: Math.round(((xp - cur) / span) * 100) }
}

// ─── Уведомления и очередь наград ────────────────────────────────────────────
// Каждое уведомление на сайте заодно уходит push-ом на телефон (если человек подписан)
export function notify(userId, kind, title, body = '', link = '') {
  db.prepare('INSERT INTO notifications(user_id, kind, title, body, link) VALUES (?,?,?,?,?)')
    .run(userId, kind, title, body, link)
  queuePush(userId, { kind, title, body, link })
}

// Любая награда показывается одним окном (спецификация 5.13). Сюда кладём то,
// что сотрудник ещё не видел; клиент забирает очередь после каждого действия
// и при входе — так ручные награды админа тоже не теряются.
export function queueReward(userId, payload) {
  db.prepare('INSERT INTO pending_rewards(user_id, kind, payload) VALUES (?,?,?)')
    .run(userId, payload.kind || 'achievement', JSON.stringify(payload))
}

export function pendingRewards(userId) {
  return db.prepare('SELECT id, kind, payload, created_at FROM pending_rewards WHERE user_id = ? AND seen_at IS NULL ORDER BY id')
    .all(userId).map(r => ({ id: r.id, ...JSON.parse(r.payload || '{}'), kind: r.kind }))
}

// ─── Начисления ──────────────────────────────────────────────────────────────
// Идемпотентное начисление. Уникальный индекс в БД — последняя линия обороны:
// даже при гонке двух запросов второе начисление физически не пройдёт.
export function awardXp(userId, amount, reason, ref = '') {
  if (amount <= 0) return 0
  const res = db.prepare(
    'INSERT OR IGNORE INTO xp_tx(user_id, amount, reason, ref) VALUES(?,?,?,?)'
  ).run(userId, amount, reason, ref)
  if (res.changes === 0) return 0
  const before = db.prepare('SELECT level FROM users WHERE id = ?').get(userId).level
  db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(amount, userId)
  const { xp } = db.prepare('SELECT xp FROM users WHERE id = ?').get(userId)
  const nextLevel = levelForXp(xp)
  if (nextLevel > before) {
    db.prepare('UPDATE users SET level = ? WHERE id = ?').run(nextLevel, userId)
    onLevelUp(userId, before, nextLevel)
  }
  return amount
}

export function awardCoil(userId, amount, reason, ref = '') {
  if (amount <= 0) return 0
  const res = db.prepare(
    'INSERT OR IGNORE INTO coil_tx(user_id, amount, reason, ref) VALUES(?,?,?,?)'
  ).run(userId, amount, reason, ref)
  if (res.changes === 0) return 0
  db.prepare('UPDATE users SET coil = coil + ? WHERE id = ?').run(amount, userId)
  return amount
}

export function spendCoil(userId, amount, reason, ref = '') {
  const user = db.prepare('SELECT coil FROM users WHERE id = ?').get(userId)
  if (!user || user.coil < amount) return { ok: false, missing: amount - (user?.coil || 0) }
  db.prepare('UPDATE users SET coil = coil - ? WHERE id = ?').run(amount, userId)
  db.prepare('INSERT INTO coil_tx(user_id, amount, reason, ref) VALUES(?,?,?,?)')
    .run(userId, -amount, reason, ref)
  return { ok: true }
}

// ─── Прохождение урока ───────────────────────────────────────────────────────
// Одна точка для всех путей: урок без теста, сданный тест, зачтённый открытый ответ.
// Раньше курс засчитывался только после теста, и курс из уроков без тестов
// никогда не давал бонус «Курс завершён».
export function finishLesson(userId, lessonId, version) {
  const lesson = db.prepare('SELECT id, course_id, version, title FROM lessons WHERE id = ?').get(lessonId)
  if (!lesson) return { xp: 0, coil: 0 }
  const ex = db.prepare('SELECT status FROM progress WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId)
  if (ex) {
    db.prepare("UPDATE progress SET status = 'passed', lesson_version = ?, updated_at = datetime('now') WHERE user_id = ? AND lesson_id = ?")
      .run(version ?? lesson.version, userId, lessonId)
  } else {
    db.prepare("INSERT INTO progress(user_id, lesson_id, lesson_version, status) VALUES (?,?,?,'passed')")
      .run(userId, lessonId, version ?? lesson.version)
  }

  const reward = { xp: 0, coil: 0 }
  reward.xp += awardXp(userId, XP.lesson, 'lesson', String(lessonId))
  reward.coil += awardCoil(userId, COIL.lesson, 'lesson', String(lessonId))

  const left = db.prepare(`
    SELECT COUNT(*) c FROM lessons l
    WHERE l.course_id = ? AND l.published = 1
      AND NOT EXISTS (SELECT 1 FROM progress p WHERE p.lesson_id = l.id AND p.user_id = ? AND p.status = 'passed')
  `).get(lesson.course_id, userId).c
  if (left === 0) {
    const gotXp = awardXp(userId, XP.course, 'course', String(lesson.course_id))
    if (gotXp) {
      const gotCoil = awardCoil(userId, COIL.course, 'course', String(lesson.course_id))
      reward.xp += gotXp; reward.coil += gotCoil
      const course = db.prepare('SELECT title, cover FROM courses WHERE id = ?').get(lesson.course_id)
      reward.courseComplete = course.title
      queueReward(userId, {
        kind: 'course', title: course.title, description: 'Курс пройден целиком',
        icon: 'ach_04_pervyy-kurs', xp: gotXp, coil: gotCoil
      })
      notify(userId, 'course', `Курс пройден: ${course.title}`, `+${gotXp} XP, +${gotCoil} COIL`, '/course/' + lesson.course_id)
    }
  }
  return reward
}

// ─── Автодостижения ──────────────────────────────────────────────────────────
// Правило хранится в данных (achievements.rule), а не в ифах по коду: админ может
// добавить награду без правки сервера.
//
// Типы правил:
//   lessons        — пройдено N уроков
//   courses        — полностью пройдено N курсов
//   course         — пройден конкретный курс (course_id)
//   course_perfect — все тесты курса на 100%
//   perfect        — N тестов на 100%
//   streak         — серия N дней
//   purchases      — N покупок в магазине
//   level          — достигнут уровень N
//   patient        — тест сдан с N-й попытки
//   night          — урок пройден после 22:00
//   early          — урок сдан за N дней до дедлайна
//   comeback       — возвращение после N дней отсутствия
export function checkAchievements(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!user) return []

  const passed = db.prepare("SELECT COUNT(*) c FROM progress WHERE user_id = ? AND status = 'passed'").get(userId).c
  // Тесты на 100% считаем по тестам, а не по попыткам: пересдача одного теста
  // на 100% не должна давать «Пять отличных».
  const perfect = db.prepare('SELECT COUNT(DISTINCT test_id) c FROM attempts WHERE user_id = ? AND score = 100 AND passed = 1').get(userId).c
  // Заказы призов тоже покупки (кроме отменённых)
  const purchased = db.prepare('SELECT COUNT(*) c FROM purchases WHERE user_id = ?').get(userId).c
    + db.prepare("SELECT COUNT(*) c FROM prize_orders WHERE user_id = ? AND status != 'cancelled'").get(userId).c
  const owned = db.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?').all(userId).map(r => r.achievement_id)
  const all = db.prepare("SELECT * FROM achievements WHERE kind = 'auto'").all()

  // Курсы, где пройдены ВСЕ опубликованные уроки.
  const doneCourses = db.prepare(`
    SELECT c.id FROM courses c
    WHERE c.published = 1 AND EXISTS (SELECT 1 FROM lessons l WHERE l.course_id = c.id AND l.published = 1)
      AND NOT EXISTS (
        SELECT 1 FROM lessons l WHERE l.course_id = c.id AND l.published = 1
          AND NOT EXISTS (SELECT 1 FROM progress p WHERE p.lesson_id = l.id AND p.user_id = ? AND p.status = 'passed')
      )
  `).all(userId).map(r => r.id)

  const granted = []
  for (const a of all) {
    if (owned.includes(a.id)) continue
    let rule = {}
    try { rule = JSON.parse(a.rule || '{}') } catch { continue }
    let ok = false

    if (rule.type === 'lessons' && passed >= rule.count) ok = true
    if (rule.type === 'perfect' && perfect >= rule.count) ok = true
    if (rule.type === 'level' && user.level >= rule.level) ok = true
    if (rule.type === 'purchases' && purchased >= rule.count) ok = true
    if (rule.type === 'streak' && user.streak >= rule.days) ok = true
    if (rule.type === 'courses' && doneCourses.length >= rule.count) ok = true
    if (rule.type === 'course' && doneCourses.includes(Number(rule.course_id))) ok = true

    // Все тесты конкретного курса на 100%.
    if (rule.type === 'course_perfect') {
      const row = db.prepare(`
        SELECT COUNT(*) total,
          SUM(CASE WHEN (SELECT MAX(score) FROM attempts a WHERE a.test_id = t.id AND a.user_id = ? AND a.passed = 1) = 100 THEN 1 ELSE 0 END) good
        FROM tests t JOIN lessons l ON l.id = t.lesson_id
        WHERE l.course_id = ? AND l.published = 1
      `).get(userId, Number(rule.course_id))
      if (row && row.total > 0 && row.good === row.total) ok = true
    }

    // Сдан с N-й попытки или позже.
    if (rule.type === 'patient') {
      const hit = db.prepare(`
        SELECT 1 FROM tests t
        WHERE EXISTS (
          SELECT 1 FROM attempts a WHERE a.test_id = t.id AND a.user_id = ? AND a.passed = 1
            AND (SELECT COUNT(*) FROM attempts b WHERE b.test_id = t.id AND b.user_id = ?) >= ?
        ) LIMIT 1
      `).get(userId, userId, Number(rule.attempts || 3))
      if (hit) ok = true
    }

    // Урок пройден после 22:00 по МЕСТНОМУ времени (Тула, UTC+3).
    if (rule.type === 'night') {
      const hit = db.prepare(`
        SELECT 1 FROM progress
        WHERE user_id = ? AND status = 'passed'
          AND CAST(strftime('%H', updated_at, '+3 hours') AS INTEGER) >= 22
        LIMIT 1
      `).get(userId)
      if (hit) ok = true
    }

    // Сдано заранее: дата сдачи минимум на N дней раньше дедлайна урока.
    if (rule.type === 'early') {
      const hit = db.prepare(`
        SELECT 1 FROM progress p JOIN lessons l ON l.id = p.lesson_id
        WHERE p.user_id = ? AND p.status = 'passed' AND l.deadline IS NOT NULL
          AND julianday(l.deadline) - julianday(date(p.updated_at, '+3 hours')) >= ?
        LIMIT 1
      `).get(userId, Number(rule.days || 3))
      if (hit) ok = true
    }

    // Возвращение: разрыв между входами больше N дней (пишется в meta при входе).
    if (rule.type === 'comeback') {
      const gap = db.prepare('SELECT value FROM meta WHERE key = ?').get(`comeback_${userId}`)
      if (gap && Number(gap.value) >= Number(rule.days || 30)) ok = true
    }

    if (ok) grantAchievement(userId, a)
    if (ok) granted.push(a)
  }
  return granted
}

// Выдача достижения: запись, начисление, уведомление и окно награды.
export function grantAchievement(userId, a, { by = null, reason = '' } = {}) {
  const res = db.prepare('INSERT OR IGNORE INTO user_achievements(user_id, achievement_id, granted_by, reason) VALUES (?,?,?,?)')
    .run(userId, a.id, by, reason)
  if (res.changes === 0) return false
  const xp = a.xp ? awardXp(userId, a.xp, 'achievement', a.code) : 0
  const coil = a.coil ? awardCoil(userId, a.coil, 'achievement', a.code) : 0
  // К достижению может быть привязана аватарка или статус — выдаём вместе с ним
  const extras = []
  for (const [kind, ref] of [['avatar', a.reward_avatar], ['status', a.reward_status]]) {
    if (ref && grantItem(userId, kind, ref)) {
      const t = db.prepare('SELECT title FROM shop_items WHERE kind = ? AND ref = ?').get(kind, ref)?.title
      extras.push(`${kind === 'avatar' ? 'аватарка' : 'статус'} «${t || 'новый'}»`)
    }
  }
  queueReward(userId, {
    kind: 'achievement', title: a.title, description: a.description, icon: a.icon,
    xp, coil, extras,
    note: reason ? `От администратора: ${reason}` : ''
  })
  notify(userId, 'achievement', `Новое достижение: ${a.title}`, reason || a.description, '/profile')
  return true
}

// ─── Аватарки и статусы, полученные не покупкой ─────────────────────────────
// Аватарки — в users.earned_avatars, статусы — в users.earned_statuses.
// Возвращает true, если предмета у сотрудника ещё не было.
export function grantItem(userId, kind, ref) {
  const col = kind === 'avatar' ? 'earned_avatars' : kind === 'status' ? 'earned_statuses' : null
  if (!col || !ref) return false
  const u = db.prepare(`SELECT ${col} AS list FROM users WHERE id = ?`).get(userId)
  if (!u) return false
  const list = JSON.parse(u.list || '[]')
  if (list.includes(ref)) return false
  list.push(ref)
  db.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).run(JSON.stringify(list), userId)
  return true
}

// Статусы сотрудника: купленные и полученные наградой
export function ownedStatuses(user) {
  const bought = db.prepare(`SELECT s.ref FROM purchases p JOIN shop_items s ON s.id = p.item_id
    WHERE p.user_id = ? AND s.kind = 'status'`).all(user.id).map(r => r.ref)
  return [...new Set([...bought, ...JSON.parse(user.earned_statuses || '[]')])]
}

function onLevelUp(userId, from, to) {
  const themes = getMeta('themes', [])
  for (let l = from + 1; l <= to; l++) {
    const opened = themes.filter(t => t.unlock === 'level' && Number(t.level) === l).map(t => t.name)
    const body = opened.length ? `Открыта тема «${opened.join('», «')}»` : 'Новый уровень — так держать'
    notify(userId, 'level', `Уровень ${l}!`, body, opened.length ? '/themes' : '/profile')
    queueReward(userId, {
      kind: 'level', title: `Уровень ${l}`, description: body, level: l, unlocked: opened
    })
  }
}

// ─── Темы ────────────────────────────────────────────────────────────────────
// Тема открыта, если: базовая; уровень достаточный; выдана вручную; куплена в магазине.
// Покупка — альтернатива уровню (спецификация 7.4), поэтому проверяется для любых тем.
export function themeUnlocked(user, theme, boughtSlugs) {
  if (!theme) return false
  if (user.role === 'admin') return true
  if (theme.unlock === 'default') return true
  if (theme.unlock === 'level' && user.level >= Number(theme.level)) return true
  const manual = JSON.parse(user.theme_unlocks || '[]')
  if (manual.includes(theme.slug)) return true
  return boughtSlugs.includes(theme.slug)
}

export function boughtThemes(userId) {
  return db.prepare(`SELECT s.ref FROM purchases p JOIN shop_items s ON s.id = p.item_id
    WHERE p.user_id = ? AND s.kind = 'theme'`).all(userId).map(r => r.ref)
}

export const STREAK_BONUS = { 7: COIL.streak7, 14: COIL.streak14, 30: COIL.streak30, 60: COIL.streak30 }
