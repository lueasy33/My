import { db } from '../db.js'
import { requireAuth } from '../index.js'
import { awardXp, awardCoil, XP, COIL } from '../economy.js'
import { courseFilterSql } from '../access.js'

// ─────────────────────────────────────────────────────────────
// Вкусы: коллекция брендов и вкусов + тренажёр в духе Duolingo.
//
// Повторение — упрощённый SM-2 по «ящикам»: ящик 0 → завтра, 1 → через 3 дня,
// 2 → 7, 3 → 21, 4–5 → 60. Ошибка возвращает вкус в ящик 0.
// Ящик 3 и выше — «знаю», ящик 5 — «выучен» (корона).
// Правильные ответы в браузер до ответа не уходят: проверка на сервере.
// ─────────────────────────────────────────────────────────────

const BOX_DAYS = [1, 3, 7, 21, 60, 60]
const MAX_BOX = 5
const NEW_PER_SESSION = 4
export const STRENGTHS = ['лёгкая', 'средняя', 'высокая']

const dayMsk = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(ms))
const dueDate = (box) => dayMsk(Date.now() + BOX_DAYS[Math.min(box, MAX_BOX)] * 86400000)

const publicFlavor = (f, p) => ({
  id: f.id, brand_id: f.brand_id, brand: f.brand, name: f.name, description: f.description, image: f.image,
  tags: JSON.parse(f.tags || '[]'), strength: f.strength, cold: !!f.cold, tip: f.tip, mix: f.mix, line: f.line,
  in_quiz: !!f.in_quiz, box: p?.box ?? null, correct: p?.correct || 0, wrong: p?.wrong || 0
})

function progressMap(userId) {
  return Object.fromEntries(db.prepare('SELECT * FROM flavor_progress WHERE user_id = ?').all(userId).map(p => [p.flavor_id, p]))
}

// Видимые сотруднику бренды и вкусы — только опубликованные
const visibleFlavors = () => db.prepare(`SELECT f.*, b.name AS brand FROM flavors f JOIN flavor_brands b ON b.id = f.brand_id
  WHERE f.published = 1 AND b.published = 1 ORDER BY b.sort, b.id, f.sort, f.name`).all()

export default async function flavorRoutes(app) {
  // Главная тренажёра: путь по брендам, цель дня, общий прогресс
  app.get('/api/flavors', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const prog = progressMap(u.id)
    const all = visibleFlavors()
    const today = dayMsk(Date.now())
    const brands = db.prepare('SELECT * FROM flavor_brands WHERE published = 1 ORDER BY sort, id').all().map(b => {
      const fl = all.filter(f => f.brand_id === b.id)
      const quiz = fl.filter(f => f.in_quiz)
      return {
        id: b.id, name: b.name, logo: b.logo, color: b.color, country: b.country, description: b.description,
        total: fl.length, quiz: quiz.length,
        started: fl.filter(f => prog[f.id]).length,
        known: fl.filter(f => (prog[f.id]?.box ?? -1) >= 3).length,
        mastered: fl.filter(f => (prog[f.id]?.box ?? -1) >= MAX_BOX).length,
        due: quiz.filter(f => prog[f.id] && prog[f.id].due_at <= today && prog[f.id].box < MAX_BOX).length
      }
    }).filter(b => b.total > 0)
    const quiz = all.filter(f => f.in_quiz)
    const todayRow = db.prepare('SELECT COUNT(*) sessions, COALESCE(SUM(correct),0) correct, COALESCE(SUM(total),0) total FROM flavor_sessions WHERE user_id = ? AND day = ?').get(u.id, today)
    // Серия тренировок: дни подряд, в которые была хотя бы одна сессия
    const days = db.prepare('SELECT DISTINCT day FROM flavor_sessions WHERE user_id = ? ORDER BY day DESC LIMIT 400').all(u.id).map(r => r.day)
    const prevDay = (d) => new Date(Date.parse(d + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10)
    let streak = 0
    let expect = days[0] === today ? today : prevDay(today)
    for (const d of days) {
      if (d === expect) { streak++; expect = prevDay(expect) } else if (d < expect) break
    }
    reply.send({
      total: all.length, quiz: quiz.length,
      started: all.filter(f => prog[f.id]).length,
      known: all.filter(f => (prog[f.id]?.box ?? -1) >= 3).length,
      mastered: all.filter(f => (prog[f.id]?.box ?? -1) >= MAX_BOX).length,
      due: quiz.filter(f => prog[f.id] && prog[f.id].due_at <= today && prog[f.id].box < MAX_BOX).length,
      fresh: quiz.filter(f => !prog[f.id]).length,
      today: { sessions: todayRow.sessions, correct: todayRow.correct, answered: todayRow.total, goal: 1 },
      streak,
      brands
    })
  })

  // Бренд: описание и вся коллекция его вкусов с прогрессом
  app.get('/api/flavors/brands/:id', { preHandler: requireAuth }, async (req, reply) => {
    const b = db.prepare('SELECT * FROM flavor_brands WHERE id = ? AND published = 1').get(req.params.id)
    if (!b) return reply.code(404).send({ error: 'Бренд не найден' })
    const prog = progressMap(req.user.id)
    const flavors = visibleFlavors().filter(f => f.brand_id === b.id).map(f => publicFlavor(f, prog[f.id]))
    reply.send({ brand: { id: b.id, name: b.name, logo: b.logo, color: b.color, country: b.country, description: b.description }, flavors })
  })

  app.get('/api/flavors/item/:id', { preHandler: requireAuth }, async (req, reply) => {
    const f = visibleFlavors().find(x => x.id === Number(req.params.id))
    if (!f) return reply.code(404).send({ error: 'Вкус не найден' })
    const p = db.prepare('SELECT * FROM flavor_progress WHERE user_id = ? AND flavor_id = ?').get(req.user.id, f.id)
    reply.send({ flavor: publicFlavor(f, p) })
  })

  // Сессия: ~10 заданий. Новый вкус сначала показывается карточкой «знакомство»,
  // потом — вопросом. Типы вопросов зависят от того, насколько вкус уже знаком.
  app.get('/api/flavors/session', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const size = Math.min(15, Math.max(5, Number(req.query.size) || 10))
    const brandId = Number(req.query.brand) || null
    const today = dayMsk(Date.now())
    const prog = progressMap(u.id)
    const all = visibleFlavors()
    const quiz = all.filter(f => f.in_quiz)
    const pool = brandId ? quiz.filter(f => f.brand_id === brandId) : quiz
    if (!pool.length) return reply.send({ items: [] })

    const box = (f) => prog[f.id]?.box ?? -1
    const due = shuffle(pool.filter(f => prog[f.id] && prog[f.id].due_at <= today && box(f) < MAX_BOX))
    const weak = shuffle(pool.filter(f => prog[f.id] && box(f) <= 1 && !due.includes(f)))
    const fresh = pool.filter(f => !prog[f.id])
    const known = shuffle(pool.filter(f => prog[f.id] && !due.includes(f) && !weak.includes(f)))
    // В тренировке бренда добираем знакомыми вкусами, чтобы сессия не была пустой
    const picked = [...due, ...weak, ...fresh.slice(0, NEW_PER_SESSION), ...(brandId ? known : [])]
      .filter((f, i, a) => a.indexOf(f) === i).slice(0, size)
    if (!picked.length) return reply.send({ items: [], done: true })

    const brands = db.prepare('SELECT id, name FROM flavor_brands WHERE published = 1').all()
    const items = []
    for (const f of shuffle(picked)) {
      const isNew = !prog[f.id]
      if (isNew) items.push({ type: 'intro', flavor: publicFlavor(f) })
      items.push(makeQuestion(f, box(f), quiz, brands))
    }
    reply.send({ items, brand: brandId ? brands.find(b => b.id === brandId)?.name : null })
  })

  app.post('/api/flavors/answer', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const { flavor_id, type, choice, retry } = req.body || {}
    const flavor = db.prepare('SELECT f.*, b.name AS brand FROM flavors f JOIN flavor_brands b ON b.id = f.brand_id WHERE f.id = ?').get(flavor_id)
    if (!flavor) return reply.code(404).send({ error: 'Вкус не найден' })

    const right = correctChoice(flavor, type)
    const ok = String(choice) === String(right)
    // Повтор ошибки в конце сессии не двигает ящик: иначе ошибку можно «отыграть» сразу
    if (!retry) {
      const cur = db.prepare('SELECT * FROM flavor_progress WHERE user_id = ? AND flavor_id = ?').get(u.id, flavor.id)
      const nextBox = ok ? Math.min((cur?.box ?? -1) + 1, MAX_BOX) : 0
      db.prepare(`
        INSERT INTO flavor_progress(user_id, flavor_id, box, due_at, correct, wrong, updated_at)
        VALUES (?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(user_id, flavor_id) DO UPDATE SET
          box = excluded.box, due_at = excluded.due_at,
          correct = correct + excluded.correct, wrong = wrong + excluded.wrong, updated_at = excluded.updated_at
      `).run(u.id, flavor.id, Math.max(0, nextBox), dueDate(Math.max(0, nextBox)), ok ? 1 : 0, ok ? 0 : 1)
    }
    // XP и COIL — за верный ответ, один раз в день на вкус. За ошибку награды нет.
    const tag = `${flavor.id}:${dayMsk(Date.now())}`
    const xp = ok && !retry ? awardXp(u.id, XP.flavorAnswer, 'flavor', tag) : 0
    const coil = ok && !retry ? awardCoil(u.id, COIL.flavorAnswer, 'flavor', tag) : 0
    const box = db.prepare('SELECT box FROM flavor_progress WHERE user_id = ? AND flavor_id = ?').get(u.id, flavor.id)?.box ?? 0
    reply.send({ correct: ok, right, flavor: publicFlavor(flavor), box, gained: { xp, coil } })
  })

  app.post('/api/flavors/session/finish', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const day = dayMsk(Date.now())
    const correct = Math.max(0, Number(req.body?.correct) || 0)
    const total = Math.max(0, Number(req.body?.total) || 0)
    db.prepare('INSERT INTO flavor_sessions(user_id, correct, total, day) VALUES (?,?,?,?)').run(u.id, correct, total, day)
    // Бонус за первую тренировку дня и отдельно — за тренировку без ошибок
    let xp = awardXp(u.id, XP.flavorTrain, 'flavor_train', day)
    let coil = awardCoil(u.id, COIL.flavorTrain, 'flavor_train', day)
    const perfect = total >= 5 && correct === total
    if (perfect) {
      xp += awardXp(u.id, 10, 'flavor_perfect', day)
      coil += awardCoil(u.id, 10, 'flavor_perfect', day)
    }
    reply.send({ gained: { xp, coil }, perfect })
  })

  // Поиск по вкусам — тот самый пятый таб, которого не было в ТЗ.
  // Ищем по трём вещам сразу: текст (название/бренд/описание), теги и крепость.
  // «крепкий» обязано найти «высокая крепость» — поэтому матчим по стему, а не по точной строке.
  app.get('/api/search', { preHandler: requireAuth }, async (req, reply) => {
    const raw = String(req.query.q || '').trim().toLowerCase()
    if (raw.length < 2) return reply.send({ courses: [], lessons: [], flavors: [], total: 0 })
    // lower() в SQLite не понимает кириллицу: «Кальян» не находился по «кальян».
    // Курсов и уроков немного — фильтруем в JS, с учётом филиала сотрудника.
    const low = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е')
    const qn = low(raw)
    const f = courseFilterSql({ ...req.user, role: 'employee' })
    const courses = db.prepare(`SELECT c.id, c.title, c.description FROM courses c WHERE ${f.sql}`).all(...f.params)
      .filter(c => low(c.title).includes(qn) || low(c.description).includes(qn)).slice(0, 5)
    const lessons = db.prepare(`
      SELECT l.id, l.title, c.title AS course FROM lessons l JOIN courses c ON c.id = l.course_id
      WHERE l.published = 1 AND ${f.sql}
    `).all(...f.params).filter(l => low(l.title).includes(qn)).slice(0, 8)

    // Нормализация: ё→е, убираем окончания у слов запроса, чтобы «крепкий» == «крепкая»
    const stem = (w) => w
      .replace(/ё/g, 'е')
      .replace(/(ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ых|их|ую|юю|а|я|у|ю|е|и|ы|й|ь)$/u, '')
    const stop = new Set(['без', 'и', 'с', 'на', 'для', 'не', 'очень', 'вкус', 'вкусный', 'вкуса'])
    // Синонимы: продавец говорит «мятный», в данных лежит тег «холод».
    // Без этого словаря поиск формально работает, но не находит то, что человек имеет в виду.
    const SYN = {
      'мятн': 'холод', 'мят': 'холод', 'свеж': 'холод', 'прохлад': 'холод',
      'крепк': 'высокая', 'сильн': 'высокая', 'мощн': 'высокая',
      'легк': 'лёгкая', 'мягк': 'лёгкая', 'нежн': 'лёгкая',
      'сладк': 'десерт', 'десертн': 'десерт', 'конфет': 'десерт',
      'фрукт': 'фрукт', 'ягод': 'ягода', 'цитрус': 'цитрус'
    }
    const words = raw.replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/u).filter(w => w.length >= 2 && !stop.has(w))
    const stems = [...new Set(words.map(stem))].filter(w => w.length >= 3)
    const synonyms = [...new Set(stems.map(w => SYN[w]).filter(Boolean))]
    const needles = [...new Set([...stems, ...synonyms])]

    // «без холода» должно вернуть НЕхолодные. Без этого отрицание читается как утверждение.
    const negated = /без\s+(холод|мяты|мят|сладк|крепк|лёгк|легк)/u.test(raw.replace(/ё/g, 'е'))
    const negTarget = negated ? (raw.match(/без\s+([a-zа-яё]+)/u)?.[1] || '').replace(/ё/g, 'е') : ''

    const norm = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е')
    const all = db.prepare(`SELECT f.id, f.brand_id, b.name AS brand, f.name, f.description, f.tags, f.strength, f.cold, f.in_quiz
      FROM flavors f JOIN flavor_brands b ON b.id = f.brand_id WHERE f.published = 1 AND b.published = 1`).all()
      .map(f => ({ ...f, tags: JSON.parse(f.tags || '[]'), _hay: norm([f.name, f.brand, f.description].join(' ')) }))

    // Прямое совпадение по тексту — вес 3, по тегу/крепости/холоду — вес 2.
    const scored = []
    for (const f of all) {
      let score = 0
      if (f._hay.includes(norm(raw))) score += 3
      const tagHay = norm(f.tags.join(' ') + ' ' + f.strength)
      for (const st of needles) {
        if (f._hay.includes(st)) score += 3
        if (tagHay.includes(st)) score += 2
      }
      // Структурные признаки надёжнее строк: холод и крепость — отдельные поля.
      if (synonyms.includes('холод') && f.cold) score += 3
      if (synonyms.includes('высокая') && f.strength === 'высокая') score += 3
      if (synonyms.includes('лёгкая') && f.strength === 'лёгкая') score += 3
      if (synonyms.includes('десерт') && f.tags.includes('десерт')) score += 3
      if (negated) {
        // при отрицании фильтруем, а не ранжируем
        const t = negTarget
        if (t.startsWith('холод') && f.cold) score = 0
        if (t.startsWith('сладк') && f.tags.includes('десерт')) score = 0
        if (t.startsWith('крепк') && f.strength === 'высокая') score = 0
        if (t.startsWith('легк') && f.strength === 'лёгкая') score = 0
        if (!t.startsWith('холод') && score === 0) score = 1 // остальные слова запроса игнорируем мягко
      }
      if (score > 0) scored.push({ f, score })
    }
    scored.sort((a, b) => b.score - a.score || a.f.name.localeCompare(b.f.name))

    const flavors = scored.slice(0, 20).map(({ f }) => ({
      id: f.id, brand_id: f.brand_id, brand: f.brand, name: f.name, description: f.description,
      tags: f.tags, strength: f.strength, cold: !!f.cold
    }))

    reply.send({ courses, lessons, flavors, total: courses.length + lessons.length + flavors.length })
  })
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Вопросы ─────────────────────────────────────────────────
// name     — по описанию узнать вкус (варианты: вкусы, лучше того же бренда)
// describe — по названию выбрать описание
// cold     — есть ли холод
// strength — какая крепость
// brand    — чей это вкус
// Новым вкусам — простые «name/describe», знакомым — вперемешку все типы.
function makeQuestion(f, box, quiz, brands) {
  const types = ['name', 'describe']
  if (box >= 1) {
    types.push('cold')
    if (STRENGTHS.includes(f.strength)) types.push('strength')
    if (brands.length >= 3) types.push('brand')
  }
  const type = types[Math.floor(Math.random() * types.length)]
  const subject = { name: f.name, brand: f.brand, image: f.image }

  // Дистракторы: сначала вкусы того же бренда, потом — других
  const others = (need) => {
    const same = shuffle(quiz.filter(x => x.brand_id === f.brand_id && x.id !== f.id))
    const rest = shuffle(quiz.filter(x => x.brand_id !== f.brand_id))
    return [...same, ...rest].slice(0, need)
  }

  if (type === 'name') {
    const opts = shuffle([f, ...others(3)])
    return {
      type, flavor_id: f.id, prompt: 'Какой это вкус?',
      clue: { description: f.description, tags: JSON.parse(f.tags || '[]').filter(t => !/крепост/.test(t)), brand: f.brand },
      options: opts.map(x => ({ id: x.id, label: x.name, sub: x.brand }))
    }
  }
  if (type === 'describe') {
    const opts = shuffle([f, ...others(3).filter(x => x.description)])
    return {
      type, flavor_id: f.id, prompt: 'Как описать этот вкус клиенту?', subject,
      options: opts.map(x => ({ id: x.id, label: x.description }))
    }
  }
  if (type === 'cold') {
    return {
      type, flavor_id: f.id, prompt: 'Есть ли в этом вкусе холод (мята, лёд)?', subject,
      options: [{ id: 'yes', label: 'Да, с холодом' }, { id: 'no', label: 'Нет, без холода' }]
    }
  }
  if (type === 'strength') {
    return {
      type, flavor_id: f.id, prompt: 'Какая крепость у этого табака?', subject,
      options: STRENGTHS.map(s => ({ id: s, label: s[0].toUpperCase() + s.slice(1) }))
    }
  }
  const opts = shuffle([brands.find(b => b.id === f.brand_id), ...shuffle(brands.filter(b => b.id !== f.brand_id)).slice(0, 3)].filter(Boolean))
  return {
    type: 'brand', flavor_id: f.id, prompt: 'Чей это вкус?', subject: { name: f.name, image: f.image },
    options: opts.map(b => ({ id: b.id, label: b.name }))
  }
}

function correctChoice(f, type) {
  if (type === 'cold') return f.cold ? 'yes' : 'no'
  if (type === 'strength') return f.strength
  if (type === 'brand') return f.brand_id
  return f.id
}
