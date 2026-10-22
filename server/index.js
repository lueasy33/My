import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { readFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, getMeta, UPLOAD_DIR } from './db.js'
import { COOKIE, readSession, verifyPassword, normalisePhone, signSession, hashPassword } from './auth.js'
import {
  levelProgress, awardCoil, awardXp, checkAchievements, notify, themeUnlocked, boughtThemes,
  pendingRewards, COIL, XP, STREAK_BONUS
} from './economy.js'
import { courseFilterSql } from './access.js'
import { initDatabase, startBackups } from './init.js'
import learnRoutes from './routes/learn.js'
import gameRoutes, { statusTitle } from './routes/game.js'
import adminRoutes from './routes/admin.js'
import flavorRoutes from './routes/flavors.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// trustProxy: в интернете сайт работает за HTTPS-прокси (Caddy/nginx).
// Без этого сервер не узнает, что запрос пришёл по https, и cookie не получит флаг secure,
// а лимит попыток входа считался бы по IP прокси — один на всех.
export const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'warn' },
  trustProxy: process.env.TRUST_PROXY !== '0',
  bodyLimit: 2 * 1024 * 1024
})

// Базовые защитные заголовки. Встраивание сайта в чужие страницы запрещено,
// браузер не угадывает тип файла, адрес страницы не уходит на сторонние сайты.
app.addHook('onSend', async (req, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('X-Frame-Options', 'SAMEORIGIN')
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (req.protocol === 'https') reply.header('Strict-Transport-Security', 'max-age=31536000')
  if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store')
  return payload
})

// Пустое тело с Content-Type: application/json — не ошибка, а пустой объект.
// Клиент всегда шлёт этот заголовок; без парсера POST /complete отвечал 400.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (!body || body.trim() === '') return done(null, {})
  try { done(null, JSON.parse(body)) } catch (e) { e.statusCode = 400; done(e, undefined) }
})

await app.register(cookie)
// Статика: в dev — public/ (картинки), в production — build/ (всё, включая картинки).
// Раньше /assets/ смотрел только в public/, и JS из build/assets не находился:
// сервер отдавал index.html вместо модуля, браузер его отвергал.
const staticRoot = join(root, 'build')
// wildcard: false ОТКЛЮЧАЕТ раздачу файлов: маршрут /assets/* не регистрируется,
// и сервер отдаёт index.html вместо JS. Браузер такой модуль отвергает — белый экран.
await app.register(fastifyStatic, {
  root: existsSync(staticRoot) ? staticRoot : join(root, 'public'),
  prefix: '/',
  decorateReply: false,
  // index.html не кэшируем: иначе после обновления сайта браузер держит старую версию
  setHeaders: (res, path) => {
    if (path.endsWith('.html') || path.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache')
    else res.setHeader('Cache-Control', 'public, max-age=2592000')
  }
})

// Загруженные материалы уроков. Отдаются с поддержкой Range — видео перематывается
// и грузится по частям, а не целиком.
await app.register(fastifyStatic, {
  root: UPLOAD_DIR,
  prefix: '/uploads/',
  decorateReply: false,
  maxAge: '30d'
})

// ─── Контекст пользователя ─────────────────────────────────────
app.decorateRequest('user', null)

app.addHook('onRequest', async (req, reply) => {
  const raw = req.cookies[COOKIE]
  const session = readSession(raw)
  if (!session) return
  let user = db.prepare('SELECT * FROM users WHERE id = ? AND archived_at IS NULL').get(session.uid)
  if (!user || user.status === 'blocked') return
  // Серия дней считается по заходам, а не по вводу пароля: сессия живёт 30 дней,
  // и раньше у того, кто не выходил из аккаунта, серия навсегда оставалась на месте.
  if (req.url.startsWith('/api/') && user.last_active_day !== TZ_DAY(Date.now())) {
    bumpStreak(user)
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  }
  req.user = user
})

export function requireAuth(req, reply, done) {
  if (!req.user) return reply.code(401).send({ error: 'Требуется вход' })
  done()
}

export function requireRole(...roles) {
  return (req, reply, done) => {
    if (!req.user) return reply.code(401).send({ error: 'Требуется вход' })
    if (!roles.includes(req.user.role)) return reply.code(403).send({ error: 'Недостаточно прав' })
    done()
  }
}

function publicUser(u) {
  const p = levelProgress(u.xp)
  return {
    id: u.id, phone: u.phone, name: u.name, role: u.role, branch_id: u.branch_id,
    xp: u.xp, coil: u.coil, level: p.level, levelProgress: p,
    avatar_id: u.avatar_id || 'ava_01_ugolek', earned_avatars: JSON.parse(u.earned_avatars || '[]'),
    status: statusTitle(u.status_ref), status_ref: u.status_ref || null,
    theme: u.theme, lang: u.lang, streak: u.streak, onboarding_done: !!u.onboarding_done,
    sound: !!u.sound, reduce_motion: !!u.reduce_motion,
    must_change_password: !!u.must_change_password,
    unread: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(u.id).c
  }
}

// ─── Авторизация ───────────────────────────────────────────────
const attempts = new Map()

app.post('/api/auth/login', async (req, reply) => {
  const { phone, password } = req.body || {}
  const norm = normalisePhone(phone)
  const key = norm + ':' + (req.ip || '')
  const rec = attempts.get(key) || { n: 0, until: 0 }

  if (rec.until > Date.now()) {
    const mins = Math.ceil((rec.until - Date.now()) / 60000)
    return reply.code(429).send({ error: `Слишком много попыток. Повторите через ${mins} мин.` })
  }

  const user = db.prepare('SELECT * FROM users WHERE phone = ? AND archived_at IS NULL').get(norm)
  const ok = user && user.status === 'active' && verifyPassword(password, user.password_hash)

  if (!ok) {
    rec.n += 1
    if (rec.n >= 5) { rec.until = Date.now() + 15 * 60000; rec.n = 0 }
    attempts.set(key, rec)
    // Одно сообщение на оба случая — не подсказываем, что именно неверно
    return reply.code(401).send({ error: 'Неверный номер или пароль' })
  }

  attempts.delete(key)
  const token = signSession({ uid: user.id })
  reply.setCookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    // ВАЖНО: secure только при реальном HTTPS. Раньше флаг ставился по NODE_ENV,
    // и при запуске на http://localhost браузер просто не отправлял cookie:
    // человек входил и его сразу выбрасывало обратно на экран входа.
    secure: req.protocol === 'https',
    maxAge: 60 * 60 * 24 * 30
  })
  bumpStreak(user)
  reply.send({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) })
})

// День считаем по Москве (UTC+3), а не по времени сервера. Иначе вход в 00:30 по Москве
// на сервере в UTC засчитывается как вчерашний день и серия не растёт.
export const TZ_DAY = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(ms))

// Чистая функция расчёта серии: отдельно от записи в БД, чтобы проверять время явно.
// now — момент входа (мс), last — дата прошлого входа ('YYYY-MM-DD' по Москве) или null.
export function nextStreak(now, last, streak) {
  const today = TZ_DAY(now)
  if (last === today) return { today, streak, changed: false }
  const yesterday = TZ_DAY(now - 86400000)
  return { today, streak: last === yesterday ? (streak || 0) + 1 : 1, changed: true }
}

function bumpStreak(user) {
  const { today, streak, changed } = nextStreak(Date.now(), user.last_active_day, user.streak)
  if (!changed) return

  // Возвращение после долгого перерыва: достижение «Возвращение» не может быть
  // вычислено по текущим данным — разрыв между входами нигде не сохранён.
  // Поэтому считаем его в момент входа и кладём в meta, а достижение читает оттуда.
  if (user.last_active_day) {
    const gap = Math.floor((Date.parse(today) - Date.parse(user.last_active_day)) / 86400000)
    if (gap >= 30) {
      db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        .run(`comeback_${user.id}`, String(gap))
    }
  }
  db.prepare('UPDATE users SET streak = ?, last_active_day = ?, best_streak = MAX(best_streak, ?) WHERE id = ?').run(streak, today, streak, user.id)
  // Ежедневный бонус и серия — только тем, кто учится. Админ в рейтинге не участвует.
  if (user.role === 'admin') return
  awardCoil(user.id, COIL.dailyLogin, 'daily', today)
  if (STREAK_BONUS[streak]) {
    // ref с датой: серия 7 дней, набранная второй раз через месяц, снова даёт бонус
    const bonus = awardCoil(user.id, STREAK_BONUS[streak], 'streak', `${streak}:${today}`)
    if (bonus) notify(user.id, 'streak', `Серия ${streak} дней!`, `+${bonus} COIL`, '/profile')
  }
  if (streak === 7) awardXp(user.id, XP.streak7, 'streak', `7:${today}`)
  if (streak > 1 && !STREAK_BONUS[streak]) notify(user.id, 'streak', `Серия ${streak} ${plural(streak, 'день', 'дня', 'дней')}`, `+${COIL.dailyLogin} COIL за вход`, '/profile')
  checkAchievements(user.id)
}

app.post('/api/auth/logout', async (req, reply) => {
  reply.clearCookie(COOKIE, { path: '/' })
  reply.send({ ok: true })
})

app.get('/api/me', async (req, reply) => {
  if (!req.user) return reply.code(401).send({ error: 'Требуется вход' })
  const branch = req.user.branch_id
    ? db.prepare('SELECT id, name, address FROM branches WHERE id = ?').get(req.user.branch_id)
    : null
  reply.send({ user: publicUser(req.user), branch })
})

app.patch('/api/me', async (req, reply) => {
  if (!req.user) return reply.code(401).send({ error: 'Требуется вход' })
  const { theme, lang, avatar_id, onboarding_done, sound, reduce_motion } = req.body || {}
  const fields = []
  const values = []
  if (theme) {
    // Проверка разблокировки на СЕРВЕРЕ, а не только в интерфейсе.
    // Иначе закрытую тему можно поставить прямым запросом из DevTools.
    const all = getMeta('themes', [])
    const t = all.find(x => x.slug === String(theme))
    if (!t) return reply.code(400).send({ error: 'Неизвестная тема' })
    if (!themeUnlocked(req.user, t, boughtThemes(req.user.id))) {
      return reply.code(403).send({ error: t.unlock === 'level' ? `Тема откроется на ${t.level} уровне` : 'Эта тема выдаётся только как особая награда' })
    }
    fields.push('theme = ?'); values.push(t.slug)
  }
  if (lang) { fields.push('lang = ?'); values.push(String(lang) === 'en' ? 'en' : 'ru') }
  if (avatar_id) {
    const owned = ['ava_01_ugolek', ...JSON.parse(req.user.earned_avatars || '[]')]
    if (!owned.includes(avatar_id)) return reply.code(400).send({ error: 'Аватарка ещё не открыта' })
    fields.push('avatar_id = ?'); values.push(avatar_id)
  }
  if (onboarding_done !== undefined) { fields.push('onboarding_done = ?'); values.push(onboarding_done ? 1 : 0) }
  if (sound !== undefined) { fields.push('sound = ?'); values.push(sound ? 1 : 0) }
  if (reduce_motion !== undefined) { fields.push('reduce_motion = ?'); values.push(reduce_motion ? 1 : 0) }
  if (!fields.length) return reply.send({ ok: true })
  values.push(req.user.id)
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  reply.send({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) })
})

app.post('/api/me/password', async (req, reply) => {
  if (!req.user) return reply.code(401).send({ error: 'Требуется вход' })
  const { current, next } = req.body || {}
  if (!verifyPassword(current, req.user.password_hash)) {
    return reply.code(400).send({ error: 'Текущий пароль неверен' })
  }
  if (!next || String(next).length < 6) return reply.code(400).send({ error: 'Минимум 6 символов' })
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(hashPassword(next), req.user.id)
  reply.send({ ok: true })
})

// ─── Дашборд ───────────────────────────────────────────────────
app.get('/api/dashboard', { preHandler: requireAuth }, async (req, reply) => {
  const u = req.user
  const f = courseFilterSql({ ...u, role: 'employee' })
  const today = TZ_DAY(Date.now())

  const continueLesson = db.prepare(`
    SELECT l.id, l.title, l.minutes, c.title AS course, c.id AS course_id, p.updated_at,
      (SELECT COUNT(*) FROM lessons x WHERE x.course_id = c.id AND x.published = 1) AS course_total,
      (SELECT COUNT(*) FROM lessons x JOIN progress px ON px.lesson_id = x.id
        WHERE x.course_id = c.id AND x.published = 1 AND px.user_id = ? AND px.status = 'passed') AS course_done
    FROM progress p JOIN lessons l ON l.id = p.lesson_id JOIN courses c ON c.id = l.course_id
    WHERE p.user_id = ? AND p.status IN ('in_progress','failed') AND l.published = 1 AND ${f.sql}
    ORDER BY p.updated_at DESC LIMIT 1
  `).get(u.id, u.id, ...f.params)

  // Если продолжать нечего — предлагаем первый незавершённый курс по приоритету
  const suggestion = continueLesson ? null : db.prepare(`
    SELECT c.id, c.title, c.importance, c.description,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS total,
      (SELECT COUNT(*) FROM lessons l JOIN progress p ON p.lesson_id = l.id
        WHERE l.course_id = c.id AND l.published = 1 AND p.user_id = ? AND p.status = 'passed') AS done
    FROM courses c WHERE ${f.sql}
    ORDER BY CASE c.importance WHEN 'required' THEN 0 WHEN 'recommended' THEN 1 ELSE 2 END, c.id
  `).all(u.id, ...f.params).find(c => c.total > 0 && c.done < c.total) || null

  const deadlines = db.prepare(`
    SELECT l.id, l.title, c.title AS course, c.id AS course_id, l.deadline
    FROM lessons l JOIN courses c ON c.id = l.course_id
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.published = 1 AND ${f.sql} AND l.deadline IS NOT NULL
      AND (p.status IS NULL OR p.status != 'passed')
    ORDER BY l.deadline ASC LIMIT 3
  `).all(u.id, ...f.params).map(d => ({ ...d, days_left: Math.round((Date.parse(d.deadline) - Date.parse(today)) / 86400000) }))

  // Напоминания о дедлайнах (спецификация 5.12): за 2 дня и при просрочке — по одному разу
  const remind = db.prepare('INSERT OR IGNORE INTO sent_reminders(user_id, lesson_id, kind) VALUES (?,?,?)')
  for (const d of deadlines) {
    const kind = d.days_left < 0 ? 'overdue' : d.days_left <= 2 ? 'soon' : null
    if (kind && remind.run(u.id, d.id, kind).changes) {
      if (kind === 'soon') notify(u.id, 'deadline', d.days_left === 0 ? 'Дедлайн сегодня' : `До дедлайна ${d.days_left} ${plural(d.days_left, 'день', 'дня', 'дней')}`, `${d.course}: ${d.title}`, '/lesson/' + d.id)
      else notify(u.id, 'deadline', `Урок просрочен на ${-d.days_left} ${plural(-d.days_left, 'день', 'дня', 'дней')}`, `${d.course}: ${d.title}`, '/lesson/' + d.id)
    }
  }

  const recent = db.prepare(`
    SELECT a.id, a.title, a.icon, a.description, ua.granted_at FROM user_achievements ua
    JOIN achievements a ON a.id = ua.achievement_id
    WHERE ua.user_id = ? ORDER BY ua.granted_at DESC LIMIT 6
  `).all(u.id)

  // Место считаем среди тех же людей, что в рейтинге: активные, без админов
  const pool = "archived_at IS NULL AND status = 'active' AND role != 'admin'"
  const rankCompany = db.prepare(`SELECT COUNT(*) + 1 c FROM users WHERE xp > ? AND ${pool}`).get(u.xp).c
  const rankBranch = u.branch_id
    ? db.prepare(`SELECT COUNT(*) + 1 c FROM users WHERE xp > ? AND branch_id = ? AND ${pool}`).get(u.xp, u.branch_id).c
    : null
  const totalUsers = db.prepare(`SELECT COUNT(*) c FROM users WHERE ${pool}`).get().c
  const totalBranch = u.branch_id
    ? db.prepare(`SELECT COUNT(*) c FROM users WHERE branch_id = ? AND ${pool}`).get(u.branch_id).c
    : 0

  const progressRow = db.prepare(`
    SELECT COUNT(*) total,
      SUM(CASE WHEN p.status = 'passed' THEN 1 ELSE 0 END) passed
    FROM lessons l JOIN courses c ON c.id = l.course_id
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.published = 1 AND ${f.sql}
  `).get(u.id, ...f.params)
  const passed = progressRow.passed || 0
  const totalLessons = progressRow.total || 0

  reply.send({
    continue: continueLesson || null,
    suggestion,
    deadlines,
    recent,
    rank: u.role === 'admin' ? null : { company: rankCompany, companyTotal: totalUsers, branch: rankBranch, branchTotal: totalBranch },
    progress: { passed, total: totalLessons, percent: totalLessons ? Math.round((passed / totalLessons) * 100) : 0 },
    unread: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(u.id).c,
    rewards: pendingRewards(u.id).length
  })
})

// ─── Уведомления ───────────────────────────────────────────────
// Лента показывает непрочитанные. Прочитанные уходят в «Историю» (по запросу ?history=1),
// откуда их можно удалить совсем.
app.get('/api/notifications', { preHandler: requireAuth }, async (req, reply) => {
  const history = req.query.history === '1'
  reply.send({
    items: db.prepare(`SELECT * FROM notifications WHERE user_id = ? AND read_at IS ${history ? 'NOT NULL' : 'NULL'}
      ORDER BY id DESC LIMIT 60`).all(req.user.id),
    history_count: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NOT NULL').get(req.user.id).c
  })
})

// Отметить прочитанными: все или выбранные (ids)
app.post('/api/notifications/read', { preHandler: requireAuth }, async (req, reply) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : null
  if (ids) {
    const st = db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND id = ? AND read_at IS NULL")
    for (const id of ids) st.run(req.user.id, id)
  } else {
    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id)
  }
  reply.send({ ok: true })
})

app.delete('/api/notifications/:id', { preHandler: requireAuth }, async (req, reply) => {
  db.prepare('DELETE FROM notifications WHERE user_id = ? AND id = ?').run(req.user.id, Number(req.params.id))
  reply.send({ ok: true })
})

// Очистить историю — удаляет только прочитанные
app.delete('/api/notifications', { preHandler: requireAuth }, async (req, reply) => {
  db.prepare('DELETE FROM notifications WHERE user_id = ? AND read_at IS NOT NULL').run(req.user.id)
  reply.send({ ok: true })
})

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

await app.register(learnRoutes)
await app.register(gameRoutes)
await app.register(flavorRoutes)
await app.register(adminRoutes)

// ─── SPA fallback и PWA ────────────────────────────────────────
const dist = join(root, 'build')

app.get('/manifest.webmanifest', (req, reply) => {
  reply.type('application/manifest+json').send(JSON.stringify({
    name: 'Аладдин LMS', short_name: 'Аладдин', start_url: '/', display: 'standalone',
    background_color: '#0C0A14', theme_color: '#0C0A14', lang: 'ru',
    icons: [
      { src: '/assets/png-512/ava_01_ugolek.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/assets/png-512/ava_01_ugolek.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }))
})

try {
  // Фронтенд уже зарегистрирован выше (staticRoot = build). Здесь — только fallback на SPA.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'Не найдено' })
    reply.type('text/html').send(readFileSync(join(staticRoot, 'index.html'), 'utf8'))
  })
} catch {
  app.log.warn('dist не собран — только API')
}

const port = Number(process.env.PORT) || 8080
const startedAt = new Date().toISOString()

initDatabase()
if (process.env.BACKUPS !== '0') startBackups()

// Проверка живости: какой процесс отвечает. Нужна, чтобы тесты не гонялись
// против устаревшей копии на другом порту.
app.get('/api/health', async () => ({
  ok: true,
  started: startedAt,
  uptimeSec: Math.round(process.uptime()),
  pid: process.pid,
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c
}))

try {
  await app.listen({ port, host: '0.0.0.0' })
} catch (e) {
  if (e.code === 'EADDRINUSE') {
    console.log('')
    console.log(`ПОРТ ${port} УЖЕ ЗАНЯТ.`)
    console.log('Скорее всего, программа уже запущена в другом окне.')
    console.log('Найдите и закройте то окно, или запустите на другом порту:')
    console.log(`  PORT=${port + 1} npm start`)
    console.log('')
    process.exit(1)
  }
  throw e
}

// Печатаем не только localhost: по этому адресу с телефона в той же Wi-Fi сети
// открывается тот же интерфейс. Человеку не нужно искать IP вручную.
const nets = os.networkInterfaces()
// 169.254.x.x — link-local: такой адрес Windows выдаёт, когда Wi-Fi ещё не получил
// IP. С телефона по нему не подключиться, поэтому в подсказку он попадать не должен.
const lan = Object.values(nets).flat()
  .filter(n => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))
  .map(n => n.address)

console.log('')
console.log('  Аладдин LMS запущен')
console.log('')
console.log(`  На этом компьютере:  http://localhost:${port}`)
if (lan.length) {
  for (const ip of lan) console.log(`  С телефона (Wi-Fi):  http://${ip}:${port}`)
} else {
  console.log('  С телефона: подключите компьютер к Wi-Fi и запустите заново')
}
console.log('')
console.log('  Окно не закрывайте — здесь работает сервер. Остановить: Ctrl+C')
console.log('')
