import { readdirSync, existsSync, createWriteStream, unlinkSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { randomBytes } from 'node:crypto'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import multipart from '@fastify/multipart'
import { db, UPLOAD_DIR } from '../db.js'
import { requireRole } from '../index.js'
import { hashPassword, normalisePhone } from '../auth.js'
import {
  awardXp, awardCoil, checkAchievements, finishLesson, grantAchievement, grantItem, notify, queueReward, XP, COIL
} from '../economy.js'
import { canSeeCourse, canEditCourse } from '../access.js'

// ─────────────────────────────────────────────────────────────
// Админка. Все проверки прав на сервере. Управляет только администратор.
// ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')

const admin = { preHandler: requireRole('admin') }
const staff = admin

const TZ_DAY = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(ms))

function audit(actorId, action, entity = '', entityId = '', payload = {}) {
  db.prepare('INSERT INTO audit_log(actor_id, action, entity, entity_id, payload) VALUES (?,?,?,?,?)')
    .run(actorId, action, entity, String(entityId), JSON.stringify(payload))
}

// Загрузка файлов: тип определяем по расширению и MIME, размер ограничен по виду.
const UPLOAD_TYPES = {
  photo: { ext: ['.jpg', '.jpeg', '.png', '.webp', '.gif'], maxMb: 10 },
  video: { ext: ['.mp4', '.webm', '.mov', '.m4v'], maxMb: Number(process.env.VIDEO_MAX_MB || 500) },
  file: { ext: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.zip'], maxMb: 50 }
}
function kindForExt(ext) {
  return Object.keys(UPLOAD_TYPES).find(k => UPLOAD_TYPES[k].ext.includes(ext)) || null
}

const cleanDate = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? String(d) : null)

export default async function adminRoutes(app) {
  await app.register(multipart, {
    limits: { fileSize: Math.max(...Object.values(UPLOAD_TYPES).map(t => t.maxMb)) * 1024 * 1024, files: 1 }
  })

  // ─── Загрузка файлов ────────────────────────────────────────
  app.post('/api/admin/upload', staff, async (req, reply) => {
    const file = await req.file()
    if (!file) return reply.code(400).send({ error: 'Файл не получен' })
    const ext = extname(file.filename || '').toLowerCase()
    const kind = kindForExt(ext)
    if (!kind) {
      file.file.resume()
      return reply.code(400).send({ error: 'Такой тип файла не поддерживается. Фото: JPG, PNG, WebP. Видео: MP4, WebM. Документы: PDF, Word, Excel, PowerPoint' })
    }
    const stored = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}${ext}`
    const target = join(UPLOAD_DIR, stored)
    await pipeline(file.file, createWriteStream(target))
    const size = file.file.bytesRead
    if (file.file.truncated || size > UPLOAD_TYPES[kind].maxMb * 1024 * 1024) {
      try { unlinkSync(target) } catch {}
      return reply.code(413).send({ error: `Файл слишком большой. Максимум для этого типа — ${UPLOAD_TYPES[kind].maxMb} МБ` })
    }
    const name = String(file.filename || stored).slice(0, 200)
    const id = db.prepare('INSERT INTO uploads(name, stored, mime, size, kind, uploaded_by) VALUES (?,?,?,?,?,?)')
      .run(name, stored, String(file.mimetype || '').slice(0, 100), size, kind, req.user.id).lastInsertRowid
    audit(req.user.id, 'upload', 'upload', id, { name, kind, size })
    reply.send({ id, url: `/uploads/${stored}`, name, size, kind, mime: file.mimetype })
  })

  // ─── Обзор ──────────────────────────────────────────────────
  app.get('/api/admin/overview', staff, async (req, reply) => {
    const scope = null
    const w = scope ? 'AND u.branch_id = ?' : ''
    const p = scope ? [scope] : []
    const today = TZ_DAY(Date.now())
    const overdue = db.prepare(`
      SELECT COUNT(*) c FROM lessons l JOIN courses c ON c.id = l.course_id AND c.published = 1
      JOIN users u ON u.archived_at IS NULL AND u.status = 'active' AND u.role = 'employee'
        AND (c.branch_id IS NULL OR c.branch_id = u.branch_id)
      LEFT JOIN progress pr ON pr.lesson_id = l.id AND pr.user_id = u.id
      WHERE l.published = 1 AND l.deadline IS NOT NULL AND l.deadline < ?
        AND (pr.status IS NULL OR pr.status != 'passed') ${w}
    `).get(today, ...p).c
    reply.send({
      counts: {
        users: db.prepare(`SELECT COUNT(*) c FROM users u WHERE u.archived_at IS NULL ${w}`).get(...p).c,
        active7: db.prepare(`SELECT COUNT(*) c FROM users u WHERE u.archived_at IS NULL AND u.last_active_day >= date('now','-7 days') ${w}`).get(...p).c,
        branches: db.prepare('SELECT COUNT(*) c FROM branches WHERE archived_at IS NULL').get().c,
        courses: db.prepare('SELECT COUNT(*) c FROM courses WHERE published = 1').get().c,
        drafts: db.prepare('SELECT COUNT(*) c FROM courses WHERE published = 0').get().c,
        lessons: db.prepare('SELECT COUNT(*) c FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.published = 1 AND c.published = 1').get().c,
        flavors: db.prepare('SELECT COUNT(*) c FROM flavors').get().c,
        flavorsNoDesc: db.prepare("SELECT COUNT(*) c FROM flavors WHERE description = ''").get().c,
        pending: db.prepare(`SELECT COUNT(*) c FROM attempts a JOIN users u ON u.id = a.user_id WHERE a.pending = 1 ${w}`).get(...p).c,
        overdue
      },
      pendingReviews: db.prepare(`
        SELECT a.id, u.name, l.title FROM attempts a JOIN users u ON u.id = a.user_id
        JOIN tests t ON t.id = a.test_id JOIN lessons l ON l.id = t.lesson_id
        WHERE a.pending = 1 ${w} ORDER BY a.id LIMIT 5
      `).all(...p),
      recentLog: db.prepare(`
        SELECT al.*, u.name AS actor FROM audit_log al LEFT JOIN users u ON u.id = al.actor_id
        ${scope ? 'WHERE u.branch_id = ?' : ''}
        ORDER BY al.id DESC LIMIT 12
      `).all(...p)
    })
  })

  // ─── Требует внимания (просрочки) ───────────────────────────
  app.get('/api/admin/attention', staff, async (req, reply) => {
    const scope = null
    const today = TZ_DAY(Date.now())
    const rows = db.prepare(`
      SELECT u.id AS user_id, u.name, u.phone, u.branch_id, b.name AS branch,
             l.id AS lesson_id, l.title AS lesson, c.title AS course, l.deadline,
             (SELECT MAX(n.created_at) FROM overdue_notes n
               WHERE n.user_id = u.id AND n.lesson_id = l.id) AS contacted_at,
             (SELECT n.note FROM overdue_notes n
               WHERE n.user_id = u.id AND n.lesson_id = l.id ORDER BY n.id DESC LIMIT 1) AS last_note
      FROM lessons l
      JOIN courses c ON c.id = l.course_id AND c.published = 1
      JOIN users u ON u.archived_at IS NULL AND u.status = 'active' AND u.role = 'employee'
        AND (c.branch_id IS NULL OR c.branch_id = u.branch_id)
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = u.id
      WHERE l.published = 1 AND l.deadline IS NOT NULL AND l.deadline < ?
        AND (p.status IS NULL OR p.status != 'passed')
        ${scope ? 'AND u.branch_id = ?' : ''}
      ORDER BY l.deadline, u.name
      LIMIT 200
    `).all(...(scope ? [today, scope] : [today]))
    reply.send({
      today,
      rows: rows.map(r => ({
        ...r,
        days_overdue: Math.round((Date.parse(today) - Date.parse(r.deadline)) / 86400000),
        contacted: !!r.contacted_at
      }))
    })
  })

  app.post('/api/admin/attention/contact', staff, async (req, reply) => {
    const { user_id, lesson_id, note } = req.body || {}
    const uid = Number(user_id), lid = Number(lesson_id)
    if (!uid || !lid) return reply.code(400).send({ error: 'Укажите сотрудника и урок' })
    const target = db.prepare('SELECT u.id, u.branch_id, u.role FROM users u WHERE u.id = ?').get(uid)
    if (!target || target.role !== 'employee') return reply.code(404).send({ error: 'Сотрудник не найден' })
    if (!db.prepare('SELECT id FROM lessons WHERE id = ?').get(lid)) return reply.code(404).send({ error: 'Урок не найден' })
    const text = String(note || '').trim().slice(0, 500)
    db.prepare('INSERT INTO overdue_notes(user_id, lesson_id, by_user_id, note) VALUES (?,?,?,?)')
      .run(uid, lid, req.user.id, text)
    audit(req.user.id, 'attention.contact', 'user', uid, { lesson_id: lid })
    reply.send({ ok: true })
  })

  // ─── Журнал действий ────────────────────────────────────────
  app.get('/api/admin/audit', admin, async (req, reply) => {
    reply.send({
      items: db.prepare(`SELECT al.*, u.name AS actor FROM audit_log al LEFT JOIN users u ON u.id = al.actor_id
        ORDER BY al.id DESC LIMIT 300`).all()
    })
  })

  // ─── Сотрудники ─────────────────────────────────────────────
  app.get('/api/admin/users', staff, async (req, reply) => {
    const scope = null
    const archived = req.query.archived === '1' && req.user.role === 'admin'
    const total = db.prepare(`SELECT COUNT(*) c FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.published = 1 AND c.published = 1`).get().c
    const rows = db.prepare(`
      SELECT u.id, u.name, u.phone, u.role, u.branch_id, u.xp, u.coil, u.level, u.status, u.avatar_id,
             u.streak, u.last_active_day, u.created_at, u.hired_at, u.archived_at, b.name AS branch,
             (SELECT COUNT(*) FROM progress p WHERE p.user_id = u.id AND p.status = 'passed') AS passed
      FROM users u LEFT JOIN branches b ON b.id = u.branch_id
      WHERE ${archived ? 'u.archived_at IS NOT NULL' : 'u.archived_at IS NULL'} ${scope ? 'AND u.branch_id = ?' : ''}
      ORDER BY u.name
    `).all(...(scope ? [scope] : []))
    reply.send({ users: rows.map(r => ({ ...r, percent: total ? Math.min(100, Math.round((r.passed / total) * 100)) : 0 })) })
  })

  app.get('/api/admin/users/:id', staff, async (req, reply) => {
    const u = db.prepare(`SELECT u.id, u.name, u.phone, u.role, u.branch_id, u.xp, u.coil, u.level, u.status, u.avatar_id,
      u.streak, u.last_active_day, u.created_at, u.hired_at, u.archived_at, b.name AS branch
      FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = ?`).get(req.params.id)
    if (!u) return reply.code(404).send({ error: 'Не найден' })
    const lessons = db.prepare(`
      SELECT l.id, l.title, c.title AS course, l.deadline, p.status, p.updated_at,
        (SELECT MAX(a.score) FROM attempts a JOIN tests t ON t.id = a.test_id WHERE t.lesson_id = l.id AND a.user_id = ?) AS best,
        (SELECT COUNT(*) FROM attempts a JOIN tests t ON t.id = a.test_id WHERE t.lesson_id = l.id AND a.user_id = ?) AS tries
      FROM lessons l JOIN courses c ON c.id = l.course_id
      LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
      WHERE l.published = 1 AND c.published = 1 AND (c.branch_id IS NULL OR c.branch_id = ?)
      ORDER BY c.id, l.sort
    `).all(u.id, u.id, u.id, u.branch_id)
    const achievements = db.prepare(`SELECT a.title, a.icon, ua.granted_at, ua.reason FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ? ORDER BY ua.granted_at DESC`).all(u.id)
    reply.send({ user: u, lessons, achievements })
  })

  app.post('/api/admin/users', admin, async (req, reply) => {
    const { name, phone, password, role, branch_id, hired_at } = req.body || {}
    if (!String(name || '').trim() || !phone || !password) return reply.code(400).send({ error: 'Имя, телефон и пароль обязательны' })
    if (String(password).length < 6) return reply.code(400).send({ error: 'Пароль минимум 6 символов' })
    const norm = normalisePhone(phone)
    if (!/^\+7\d{10}$/.test(norm)) return reply.code(400).send({ error: 'Проверьте номер: нужен российский номер из 11 цифр' })
    if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(norm)) {
      return reply.code(400).send({ error: 'Такой номер уже есть' })
    }
    const r = role === 'admin' ? 'admin' : 'employee'
    if (r !== 'admin' && !branch_id) return reply.code(400).send({ error: 'Выберите филиал' })
    const id = db.prepare(`INSERT INTO users(phone,name,password_hash,role,branch_id,hired_at,must_change_password,onboarding_done)
      VALUES (?,?,?,?,?,?,0,0)`).run(norm, String(name).trim(), hashPassword(password), r, branch_id || null, cleanDate(hired_at)).lastInsertRowid
    audit(req.user.id, 'user.create', 'user', id, { name, role: r })
    reply.send({ id })
  })

  app.patch('/api/admin/users/:id', admin, async (req, reply) => {
    const { name, phone, role, branch_id, status, password, theme_unlock, restore, hired_at } = req.body || {}
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
    if (!u) return reply.code(404).send({ error: 'Не найден' })

    if (restore) {
      db.prepare("UPDATE users SET archived_at = NULL, status = 'active' WHERE id = ?").run(u.id)
      audit(req.user.id, 'user.restore', 'user', u.id)
      return reply.send({ ok: true })
    }
    // Себя нельзя заблокировать или лишить прав администратора — иначе можно остаться без входа
    if (u.id === req.user.id && ((role && role !== 'admin') || status === 'blocked')) {
      return reply.code(400).send({ error: 'Нельзя заблокировать себя или снять с себя права администратора' })
    }

    const fields = [], vals = []
    if (name && String(name).trim()) { fields.push('name = ?'); vals.push(String(name).trim()) }
    if (phone) {
      const norm = normalisePhone(phone)
      if (!/^\+7\d{10}$/.test(norm)) return reply.code(400).send({ error: 'Проверьте номер телефона' })
      if (db.prepare('SELECT 1 FROM users WHERE phone = ? AND id != ?').get(norm, u.id)) return reply.code(400).send({ error: 'Такой номер уже есть' })
      fields.push('phone = ?'); vals.push(norm)
    }
    if (role && ['employee', 'admin'].includes(role)) { fields.push('role = ?'); vals.push(role) }
    if (branch_id !== undefined) { fields.push('branch_id = ?'); vals.push(branch_id || null) }
    if (status && ['active', 'blocked'].includes(status)) { fields.push('status = ?'); vals.push(status) }
    if (hired_at !== undefined) { fields.push('hired_at = ?'); vals.push(cleanDate(hired_at)) }
    if (password) {
      if (String(password).length < 6) return reply.code(400).send({ error: 'Пароль минимум 6 символов' })
      fields.push('password_hash = ?'); vals.push(hashPassword(password))
    }
    if (theme_unlock) {
      const list = JSON.parse(u.theme_unlocks || '[]')
      if (!list.includes(theme_unlock)) list.push(theme_unlock)
      fields.push('theme_unlocks = ?'); vals.push(JSON.stringify(list))
    }
    if (!fields.length) return reply.send({ ok: true })
    vals.push(u.id)
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
    audit(req.user.id, password ? 'user.password' : 'user.update', 'user', u.id, { fields: fields.map(f => f.split(' ')[0]).filter(f => f !== 'password_hash') })
    reply.send({ ok: true })
  })

  // Архив, а не удаление: статистика должна остаться
  app.delete('/api/admin/users/:id', admin, async (req, reply) => {
    if (Number(req.params.id) === req.user.id) return reply.code(400).send({ error: 'Нельзя отправить в архив самого себя' })
    db.prepare("UPDATE users SET archived_at = datetime('now'), status = 'blocked' WHERE id = ?").run(req.params.id)
    db.prepare('UPDATE branches SET head_user_id = NULL WHERE head_user_id = ?').run(req.params.id)
    audit(req.user.id, 'user.archive', 'user', req.params.id)
    reply.send({ ok: true })
  })

  // ─── Филиалы ────────────────────────────────────────────────
  app.get('/api/admin/branches', staff, async (req, reply) => {
    const total = db.prepare(`SELECT COUNT(*) c FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.published = 1 AND c.published = 1`).get().c
    const branches = db.prepare(`
      SELECT b.*, (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.archived_at IS NULL) AS people,
        (SELECT u.name FROM users u WHERE u.id = b.head_user_id) AS head,
        (SELECT COUNT(*) FROM progress p JOIN users u ON u.id = p.user_id
          WHERE u.branch_id = b.id AND u.archived_at IS NULL AND u.role = 'employee' AND p.status = 'passed') AS passed,
        (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.archived_at IS NULL AND u.role = 'employee') AS employees,
        (SELECT ROUND(AVG(a.score)) FROM attempts a JOIN users u ON u.id = a.user_id WHERE u.branch_id = b.id AND a.pending = 0) AS avg_score
      FROM branches b WHERE b.archived_at IS NULL ORDER BY b.id
    `).all().map(b => ({
      ...b,
      percent: total && b.employees ? Math.min(100, Math.round((b.passed / (total * b.employees)) * 100)) : 0,
      avg_score: b.avg_score ?? 0
    }))
    reply.send({ branches })
  })

  app.post('/api/admin/branches', admin, async (req, reply) => {
    const { name, address } = req.body || {}
    if (!String(name || '').trim()) return reply.code(400).send({ error: 'Название обязательно' })
    const id = db.prepare("INSERT INTO branches(name, address, created_at) VALUES (?,?,datetime('now'))")
      .run(String(name).trim(), address || '').lastInsertRowid
    audit(req.user.id, 'branch.create', 'branch', id, { name })
    reply.send({ id })
  })

  app.patch('/api/admin/branches/:id', admin, async (req, reply) => {
    const b = db.prepare('SELECT * FROM branches WHERE id = ?').get(req.params.id)
    if (!b) return reply.code(404).send({ error: 'Не найден' })
    const { name, address, archived } = req.body || {}
    if (archived) {
      const people = db.prepare('SELECT COUNT(*) c FROM users WHERE branch_id = ? AND archived_at IS NULL').get(b.id).c
      if (people > 0) return reply.code(409).send({ error: `В филиале ${people} сотрудников. Сначала переведите их в другой филиал` })
      db.prepare("UPDATE branches SET archived_at = datetime('now') WHERE id = ?").run(b.id)
      audit(req.user.id, 'branch.archive', 'branch', b.id)
      return reply.send({ ok: true })
    }
    db.prepare('UPDATE branches SET name = ?, address = ? WHERE id = ?')
      .run(String(name ?? b.name).trim() || b.name, address ?? b.address, b.id)
    audit(req.user.id, 'branch.update', 'branch', b.id, { name })
    reply.send({ ok: true })
  })

  // ─── Категории ──────────────────────────────────────────────
  app.post('/api/admin/categories', admin, async (req, reply) => {
    const { title, color } = req.body || {}
    if (!String(title || '').trim()) return reply.code(400).send({ error: 'Название обязательно' })
    const sort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM categories').get().m + 1
    const id = db.prepare('INSERT INTO categories(title, icon, sort, color) VALUES (?,?,?,?)')
      .run(String(title).trim(), 'book', sort, color || '').lastInsertRowid
    audit(req.user.id, 'category.create', 'category', id, { title })
    reply.send({ id })
  })

  app.patch('/api/admin/categories/:id', admin, async (req, reply) => {
    const c = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id)
    if (!c) return reply.code(404).send({ error: 'Не найдено' })
    const { title, color, sort } = req.body || {}
    db.prepare('UPDATE categories SET title = ?, color = ?, sort = ? WHERE id = ?')
      .run(String(title ?? c.title).trim() || c.title, color ?? c.color, sort ?? c.sort, c.id)
    audit(req.user.id, 'category.update', 'category', c.id, { title })
    reply.send({ ok: true })
  })

  app.delete('/api/admin/categories/:id', admin, async (req, reply) => {
    const n = db.prepare('SELECT COUNT(*) c FROM courses WHERE category_id = ?').get(req.params.id).c
    if (n) return reply.code(409).send({ error: `В категории ${n} курс(ов). Сначала перенесите их` })
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id)
    audit(req.user.id, 'category.delete', 'category', req.params.id)
    reply.send({ ok: true })
  })

  // ─── Контент ────────────────────────────────────────────────
  app.get('/api/admin/content', staff, async (req, reply) => {
    const scope = null
    const courses = db.prepare(`
      SELECT c.*, cat.title AS category, b.name AS branch,
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lessons_count,
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS lessons_published
      FROM courses c LEFT JOIN categories cat ON cat.id = c.category_id
      LEFT JOIN branches b ON b.id = c.branch_id
      ${scope ? 'WHERE (c.branch_id IS NULL OR c.branch_id = ?)' : ''}
      ORDER BY cat.sort, c.id
    `).all(...(scope ? [scope] : []))
    const lessons = db.prepare(`
      SELECT l.id, l.course_id, l.title, l.sort, l.minutes, l.deadline, l.published, l.version,
        (SELECT COUNT(*) FROM blocks b WHERE b.lesson_id = l.id) AS blocks,
        (SELECT COUNT(*) FROM questions q JOIN tests t ON t.id = q.test_id WHERE t.lesson_id = l.id) AS questions
      FROM lessons l ORDER BY l.sort, l.id
    `).all()
    reply.send({
      categories: db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM courses x WHERE x.category_id = c.id) AS courses
        FROM categories c ORDER BY sort, id`).all(),
      branches: db.prepare('SELECT id, name FROM branches WHERE archived_at IS NULL ORDER BY id').all(),
      courses: courses.map(c => ({
        ...c, editable: canEditCourse(req.user, c),
        lessons: lessons.filter(l => l.course_id === c.id)
      }))
    })
  })

  const loadCourse = (id) => db.prepare('SELECT * FROM courses WHERE id = ?').get(id)

  app.post('/api/admin/courses', staff, async (req, reply) => {
    const { title, description, category_id, importance, minutes, branch_id, cover } = req.body || {}
    if (!String(title || '').trim()) return reply.code(400).send({ error: 'Название обязательно' })
    const branch = branch_id || null
    const c = String(cover || '').trim()
    const id = db.prepare(`INSERT INTO courses(category_id,title,description,cover,importance,minutes,published,branch_id,created_by)
      VALUES (?,?,?,?,?,?,0,?,?)`).run(
      category_id || null, String(title).trim(), description || '', /^(\/uploads\/|https:\/\/)/.test(c) ? c : 'cover_default',
      ['required', 'recommended', 'extra'].includes(importance) ? importance : 'recommended',
      Number(minutes) || 15, branch, req.user.id
    ).lastInsertRowid
    audit(req.user.id, 'course.create', 'course', id, { title })
    reply.send({ id })
  })

  app.patch('/api/admin/courses/:id', staff, async (req, reply) => {
    const course = loadCourse(req.params.id)
    if (!canEditCourse(req.user, course)) return reply.code(403).send({ error: 'Этот курс может менять только администратор' })
    const { title, description, importance, minutes, published, category_id, branch_id, cover } = req.body || {}
    const fields = [], vals = []
    if (title && String(title).trim()) { fields.push('title = ?'); vals.push(String(title).trim()) }
    if (description !== undefined) { fields.push('description = ?'); vals.push(description) }
    if (cover !== undefined) {
      const c = String(cover || '').trim()
      if (c && !/^(\/uploads\/|https:\/\/|cover_[a-z_]+$)/.test(c)) return reply.code(400).send({ error: 'Некорректная обложка' })
      fields.push('cover = ?'); vals.push(c || 'cover_default')
    }
    if (importance && ['required', 'recommended', 'extra'].includes(importance)) { fields.push('importance = ?'); vals.push(importance) }
    if (minutes) { fields.push('minutes = ?'); vals.push(Number(minutes)) }
    if (category_id !== undefined) { fields.push('category_id = ?'); vals.push(category_id || null) }
    if (branch_id !== undefined && req.user.role === 'admin') { fields.push('branch_id = ?'); vals.push(branch_id || null) }
    if (published !== undefined) {
      if (published) {
        const n = db.prepare('SELECT COUNT(*) c FROM lessons WHERE course_id = ? AND published = 1').get(course.id).c
        if (!n) return reply.code(400).send({ error: 'Сначала опубликуйте хотя бы один урок курса' })
      }
      fields.push('published = ?'); vals.push(published ? 1 : 0)
    }
    if (!fields.length) return reply.send({ ok: true })
    vals.push(course.id)
    db.prepare(`UPDATE courses SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
    if (published && !course.published) notifyLearners(course.id, 'course', `Новый курс: ${title || course.title}`, 'Загляни в «Обучение»', '/course/' + course.id)
    audit(req.user.id, published !== undefined ? (published ? 'course.publish' : 'course.unpublish') : 'course.update', 'course', course.id, { title: title || course.title })
    reply.send({ ok: true })
  })

  // Удаление курса. Если по нему уже учились, сначала отвечаем, сколько людей это
  // затронет, и удаляем только с явным подтверждением (?force=1): прогресс по курсу
  // пропадёт, а уже начисленные XP и COIL у сотрудников останутся.
  app.delete('/api/admin/courses/:id', staff, async (req, reply) => {
    const course = loadCourse(req.params.id)
    if (!course) return reply.code(404).send({ error: 'Курс не найден' })
    if (!canEditCourse(req.user, course)) return reply.code(403).send({ error: 'Нет прав на этот курс' })
    const learners = db.prepare('SELECT COUNT(DISTINCT p.user_id) c FROM progress p JOIN lessons l ON l.id = p.lesson_id WHERE l.course_id = ?').get(course.id).c
    if (learners && req.query.force !== '1') return reply.code(409).send({ error: `Курс уже проходили ${learners} чел.`, needs_confirm: true, learners })
    db.transaction(() => {
      for (const l of db.prepare('SELECT id FROM lessons WHERE course_id = ?').all(course.id)) deleteLesson(l.id)
      db.prepare('DELETE FROM courses WHERE id = ?').run(course.id)
    })()
    audit(req.user.id, 'course.delete', 'course', course.id, { title: course.title })
    reply.send({ ok: true })
  })

  // Порядок уроков в курсе
  app.put('/api/admin/courses/:id/order', staff, async (req, reply) => {
    const course = loadCourse(req.params.id)
    if (!canEditCourse(req.user, course)) return reply.code(403).send({ error: 'Нет прав на этот курс' })
    const ids = (req.body?.ids || []).map(Number)
    const upd = db.prepare('UPDATE lessons SET sort = ? WHERE id = ? AND course_id = ?')
    db.transaction(() => ids.forEach((id, i) => upd.run(i + 1, id, course.id)))()
    audit(req.user.id, 'course.order', 'course', course.id)
    reply.send({ ok: true })
  })

  const lessonWithCourse = (id) => {
    const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id)
    return { lesson, course: lesson ? loadCourse(lesson.course_id) : null }
  }

  app.get('/api/admin/lessons/:id', staff, async (req, reply) => {
    const { lesson, course } = lessonWithCourse(req.params.id)
    if (!lesson || !canSeeCourse(req.user, course)) return reply.code(404).send({ error: 'Не найден' })
    const test = db.prepare('SELECT * FROM tests WHERE lesson_id = ?').get(lesson.id)
    reply.send({
      lesson,
      course: { id: course.id, title: course.title, published: !!course.published },
      editable: canEditCourse(req.user, course),
      blocks: db.prepare('SELECT * FROM blocks WHERE lesson_id = ? ORDER BY sort').all(lesson.id)
        .map(b => ({ ...b, content: JSON.parse(b.content) })),
      test: test ? {
        ...test,
        questions: db.prepare('SELECT * FROM questions WHERE test_id = ? ORDER BY sort').all(test.id)
          .map(q => ({ ...q, options: JSON.parse(q.options), correct: JSON.parse(q.correct) }))
      } : null,
      stats: {
        passed: db.prepare("SELECT COUNT(*) c FROM progress WHERE lesson_id = ? AND status = 'passed'").get(lesson.id).c,
        attempts: test ? db.prepare('SELECT COUNT(*) c FROM attempts WHERE test_id = ?').get(test.id).c : 0
      }
    })
  })

  app.post('/api/admin/lessons', staff, async (req, reply) => {
    const { course_id, title, minutes, deadline } = req.body || {}
    const course = loadCourse(course_id)
    if (!canEditCourse(req.user, course)) return reply.code(403).send({ error: 'Нет прав на этот курс' })
    if (!String(title || '').trim()) return reply.code(400).send({ error: 'Название обязательно' })
    const sort = (db.prepare('SELECT COALESCE(MAX(sort),0) m FROM lessons WHERE course_id = ?').get(course.id).m) + 1
    const id = db.prepare('INSERT INTO lessons(course_id,title,sort,version,minutes,deadline,published) VALUES (?,?,?,1,?,?,0)')
      .run(course.id, String(title).trim(), sort, Number(minutes) || 8, cleanDate(deadline)).lastInsertRowid
    audit(req.user.id, 'lesson.create', 'lesson', id, { title })
    reply.send({ id })
  })

  app.patch('/api/admin/lessons/:id', staff, async (req, reply) => {
    const { lesson, course } = lessonWithCourse(req.params.id)
    if (!lesson) return reply.code(404).send({ error: 'Не найден' })
    if (!canEditCourse(req.user, course)) return reply.code(403).send({ error: 'Этот урок может менять только администратор' })
    const { title, minutes, deadline, published, description } = req.body || {}
    const fields = [], vals = []
    if (title && String(title).trim()) { fields.push('title = ?'); vals.push(String(title).trim()) }
    if (description !== undefined) { fields.push('description = ?'); vals.push(String(description)) }
    if (minutes) { fields.push('minutes = ?'); vals.push(Number(minutes)) }
    if (deadline !== undefined) { fields.push('deadline = ?'); vals.push(cleanDate(deadline)) }
    if (published !== undefined) {
      if (published) {
        // Публикация — осознанное действие: пустой урок или тест без правильных ответов не выпускаем
        const blocks = db.prepare('SELECT COUNT(*) c FROM blocks WHERE lesson_id = ?').get(lesson.id).c
        if (!blocks) return reply.code(400).send({ error: 'В уроке нет ни одного блока — сотрудникам нечего читать' })
        const broken = db.prepare(`SELECT COUNT(*) c FROM questions q JOIN tests t ON t.id = q.test_id
          WHERE t.lesson_id = ? AND q.type != 'open' AND q.correct = '[]'`).get(lesson.id).c
        if (broken) return reply.code(400).send({ error: `В тесте ${broken} вопрос(а) без отмеченного правильного ответа` })
      }
      fields.push('published = ?'); vals.push(published ? 1 : 0)
      if (published) fields.push('version = version + 1')
    }
    if (!fields.length) return reply.send({ ok: true })
    vals.push(lesson.id)
    db.prepare(`UPDATE lessons SET ${fields.join(', ')} WHERE id = ?`).run(...vals)
    if (published && !lesson.published && course.published) {
      notifyLearners(course.id, 'lesson', `Новый урок в курсе «${course.title}»`, title || lesson.title, '/lesson/' + lesson.id)
    }
    audit(req.user.id, published !== undefined ? (published ? 'lesson.publish' : 'lesson.unpublish') : 'lesson.update', 'lesson', lesson.id, { title: title || lesson.title })
    reply.send({ ok: true })
  })

  function deleteLesson(id) {
    const test = db.prepare('SELECT id FROM tests WHERE lesson_id = ?').get(id)
    if (test) {
      db.prepare('DELETE FROM attempts WHERE test_id = ?').run(test.id)
      db.prepare('DELETE FROM questions WHERE test_id = ?').run(test.id)
      db.prepare('DELETE FROM tests WHERE id = ?').run(test.id)
    }
    db.prepare('DELETE FROM blocks WHERE lesson_id = ?').run(id)
    db.prepare('DELETE FROM progress WHERE lesson_id = ?').run(id)
    db.prepare('DELETE FROM overdue_notes WHERE lesson_id = ?').run(id)
    db.prepare('DELETE FROM sent_reminders WHERE lesson_id = ?').run(id)
    db.prepare('DELETE FROM lessons WHERE id = ?').run(id)
  }

  app.delete('/api/admin/lessons/:id', staff, async (req, reply) => {
    const { lesson, course } = lessonWithCourse(req.params.id)
    if (!lesson) return reply.code(404).send({ error: 'Не найден' })
    if (!canEditCourse(req.user, course)) return reply.code(403).send({ error: 'Нет прав на этот урок' })
    const learners = db.prepare("SELECT COUNT(DISTINCT user_id) c FROM progress WHERE lesson_id = ? AND status != 'in_progress'").get(lesson.id).c
    if (learners && req.query.force !== '1') return reply.code(409).send({ error: `Урок уже проходили ${learners} чел.`, needs_confirm: true, learners })
    db.transaction(() => deleteLesson(lesson.id))()
    audit(req.user.id, 'lesson.delete', 'lesson', lesson.id, { title: lesson.title })
    reply.send({ ok: true })
  })

  // Блоки: замена всего набора за раз — проще и безопаснее, чем дельта.
  // id существующих блоков сохраняем: к ним привязана позиция видео у сотрудников.
  app.put('/api/admin/lessons/:id/blocks', staff, async (req, reply) => {
    const { lesson, course } = lessonWithCourse(req.params.id)
    if (!lesson) return reply.code(404).send({ error: 'Не найден' })
    if (!canEditCourse(req.user, course)) return reply.code(403).send({ error: 'Нет прав на этот урок' })
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : []
    const TYPES = ['text', 'photo', 'video', 'file']
    db.transaction(() => {
      const keep = blocks.map(b => Number(b.id)).filter(Boolean)
      const existing = db.prepare('SELECT id FROM blocks WHERE lesson_id = ?').all(lesson.id).map(r => r.id)
      for (const id of existing) if (!keep.includes(id)) db.prepare('DELETE FROM blocks WHERE id = ?').run(id)
      blocks.forEach((b, i) => {
        if (!TYPES.includes(b.type)) return
        const content = JSON.stringify(b.content || {})
        if (b.id && existing.includes(Number(b.id))) {
          db.prepare('UPDATE blocks SET type = ?, content = ?, sort = ? WHERE id = ?').run(b.type, content, i + 1, Number(b.id))
        } else {
          db.prepare('INSERT INTO blocks(lesson_id, type, content, sort) VALUES (?,?,?,?)').run(lesson.id, b.type, content, i + 1)
        }
      })
    })()
    audit(req.user.id, 'blocks.update', 'lesson', lesson.id, { count: blocks.length })
    const saved = db.prepare('SELECT * FROM blocks WHERE lesson_id = ? ORDER BY sort').all(lesson.id)
      .map(b => ({ ...b, content: JSON.parse(b.content) }))
    reply.send({ ok: true, blocks: saved })
  })

  app.put('/api/admin/lessons/:id/test', staff, async (req, reply) => {
    const { lesson, course } = lessonWithCourse(req.params.id)
    if (!lesson) return reply.code(404).send({ error: 'Не найден' })
    if (!canEditCourse(req.user, course)) return reply.code(403).send({ error: 'Нет прав на этот урок' })
    const { pass_score, attempts_allowed, pause_minutes, show_answers, questions = [] } = req.body || {}

    // Проверяем вопросы до записи, чтобы не сохранить половину
    const clean = []
    for (const [i, q] of questions.entries()) {
      const prompt = String(q.prompt || '').trim()
      if (!prompt) continue
      const type = ['single', 'multi', 'boolean', 'open'].includes(q.type) ? q.type : 'single'
      let options = []
      let correct = []
      if (type === 'boolean') {
        options = ['Верно', 'Неверно']
        correct = [Number(q.correct?.[0]) === 1 ? 1 : 0]
        if (!q.correct?.length) return reply.code(400).send({ error: `Вопрос ${i + 1}: отметьте «Верно» или «Неверно»` })
      } else if (type !== 'open') {
        const raw = (q.options || []).map(o => String(o || '').trim())
        // Пустые варианты убираем, номера правильных пересчитываем под новый список
        const map = []
        raw.forEach((o, j) => { if (o) { map[j] = options.length; options.push(o) } })
        correct = [...new Set((q.correct || []).map(Number).filter(j => map[j] !== undefined).map(j => map[j]))]
        if (options.length < 2) return reply.code(400).send({ error: `Вопрос ${i + 1}: нужно минимум два варианта ответа` })
        if (!correct.length) return reply.code(400).send({ error: `Вопрос ${i + 1}: отметьте правильный ответ` })
        if (type === 'single') correct = correct.slice(0, 1)
      }
      clean.push({ type, prompt, options, correct, explanation: String(q.explanation || '').trim() })
    }

    db.transaction(() => {
      let test = db.prepare('SELECT * FROM tests WHERE lesson_id = ?').get(lesson.id)
      if (!test) {
        const id = db.prepare('INSERT INTO tests(lesson_id) VALUES (?)').run(lesson.id).lastInsertRowid
        test = { id }
      }
      db.prepare('UPDATE tests SET pass_score = ?, attempts_allowed = ?, pause_minutes = ?, show_answers = ? WHERE id = ?')
        .run(Math.min(100, Math.max(1, Number(pass_score) || 70)), Math.max(1, Number(attempts_allowed) || 3),
          Math.max(0, Number(pause_minutes ?? 10)), show_answers === false ? 0 : 1, test.id)
      db.prepare('DELETE FROM questions WHERE test_id = ?').run(test.id)
      const ins = db.prepare('INSERT INTO questions(test_id,type,prompt,options,correct,explanation,sort) VALUES (?,?,?,?,?,?,?)')
      clean.forEach((q, i) => ins.run(test.id, q.type, q.prompt, JSON.stringify(q.options), JSON.stringify(q.correct), q.explanation, i + 1))
    })()
    audit(req.user.id, 'test.update', 'lesson', lesson.id, { questions: clean.length })
    reply.send({ ok: true, count: clean.length })
  })

  function notifyLearners(courseId, kind, title, body, link) {
    const course = loadCourse(courseId)
    const people = db.prepare(`SELECT id FROM users WHERE archived_at IS NULL AND status = 'active' AND role != 'admin'
      ${course.branch_id ? 'AND branch_id = ?' : ''}`).all(...(course.branch_id ? [course.branch_id] : []))
    for (const p of people) notify(p.id, kind, title, body, link)
  }

  // ─── Проверка открытых ответов ──────────────────────────────
  app.get('/api/admin/reviews', staff, async (req, reply) => {
    const scope = null
    const rows = db.prepare(`
      SELECT a.id, a.answers, a.score, a.created_at, a.test_id, u.id AS user_id, u.name, b.name AS branch,
        l.id AS lesson_id, l.title AS lesson, c.title AS course
      FROM attempts a JOIN users u ON u.id = a.user_id LEFT JOIN branches b ON b.id = u.branch_id
      JOIN tests t ON t.id = a.test_id JOIN lessons l ON l.id = t.lesson_id JOIN courses c ON c.id = l.course_id
      WHERE a.pending = 1 ${scope ? 'AND u.branch_id = ?' : ''}
      ORDER BY a.id
    `).all(...(scope ? [scope] : []))
    reply.send({
      reviews: rows.map(r => {
        const answers = JSON.parse(r.answers || '{}')
        const open = db.prepare("SELECT id, prompt, explanation FROM questions WHERE test_id = ? AND type = 'open' ORDER BY sort").all(r.test_id)
        return { ...r, answers: undefined, open: open.map(q => ({ id: q.id, prompt: q.prompt, hint: q.explanation, answer: answers[q.id] || '' })) }
      })
    })
  })

  app.post('/api/admin/reviews/:id', staff, async (req, reply) => {
    const { verdict, note } = req.body || {}
    if (verdict !== 'accept' && verdict !== 'reject') {
      return reply.code(400).send({ error: "verdict должен быть 'accept' или 'reject'" })
    }
    const attempt = db.prepare(`
      SELECT a.*, u.branch_id AS user_branch FROM attempts a JOIN users u ON u.id = a.user_id WHERE a.id = ?
    `).get(req.params.id)
    if (!attempt) return reply.code(404).send({ error: 'Не найдено' })
    if (!attempt.pending) return reply.code(409).send({ error: 'Эта попытка уже проверена' })
    const test = db.prepare('SELECT t.*, l.version, l.title FROM tests t JOIN lessons l ON l.id = t.lesson_id WHERE t.id = ?').get(attempt.test_id)
    const passed = verdict === 'accept'
    const comment = String(note || '').trim().slice(0, 500)
    const score = passed ? Math.max(attempt.score, test.pass_score) : attempt.score
    db.prepare('UPDATE attempts SET pending = 0, passed = ?, score = ?, reviewed_by = ?, review_note = ? WHERE id = ?')
      .run(passed ? 1 : 0, score, req.user.id, comment, attempt.id)
    let reward = { xp: 0, coil: 0 }
    if (passed) {
      reward = finishLesson(attempt.user_id, test.lesson_id, test.version)
      reward.xp += awardXp(attempt.user_id, XP.test, 'test', String(test.id))
      reward.coil += awardCoil(attempt.user_id, COIL.test, 'test', String(test.id))
      checkAchievements(attempt.user_id)
      queueReward(attempt.user_id, {
        kind: 'review', title: test.title, description: 'Администратор зачёл твой ответ',
        icon: 'ach_17_reglament', xp: reward.xp, coil: reward.coil, note: comment
      })
    } else {
      db.prepare("UPDATE progress SET status = 'failed', updated_at = datetime('now') WHERE user_id = ? AND lesson_id = ?")
        .run(attempt.user_id, test.lesson_id)
    }
    notify(attempt.user_id, 'review',
      passed ? `Тест проверен: сдано, ${score}%` : 'Ответ не зачтён',
      comment || (passed ? 'Урок засчитан' : 'Перечитай урок и попробуй снова'),
      '/lesson/' + test.lesson_id)
    audit(req.user.id, 'review.verdict', 'attempt', attempt.id, { verdict })
    reply.send({ ok: true })
  })

  // ─── Ручные награды ─────────────────────────────────────────
  // Выдать можно: достижение, аватарку, статус или особую тему.
  app.post('/api/admin/grant', admin, async (req, reply) => {
    const { user_id, achievement_id, reason, theme, kind, ref } = req.body || {}
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND archived_at IS NULL').get(user_id)
    if (!target) return reply.code(404).send({ error: 'Сотрудник не найден' })
    if (!String(reason || '').trim()) return reply.code(400).send({ error: 'Укажите причину — она попадёт в историю сотрудника' })
    const note = `От администратора: ${String(reason).trim()}`
    if (theme) {
      const list = JSON.parse(target.theme_unlocks || '[]')
      if (list.includes(theme)) return reply.code(400).send({ error: 'Эта тема уже выдана' })
      list.push(theme)
      db.prepare('UPDATE users SET theme_unlocks = ? WHERE id = ?').run(JSON.stringify(list), target.id)
      queueReward(target.id, { kind: 'theme', title: 'Тема «Легенда»', description: 'Эксклюзивная тема оформления', theme, note })
      notify(target.id, 'theme', 'Открыта особая тема оформления', reason, '/themes')
      audit(req.user.id, 'theme.grant', 'user', target.id, { theme, reason })
      return reply.send({ ok: true })
    }
    if (kind === 'avatar' || kind === 'status') {
      const item = db.prepare('SELECT * FROM shop_items WHERE kind = ? AND ref = ?').get(kind, ref)
      if (!item) return reply.code(404).send({ error: 'Предмет не найден' })
      if (!grantItem(target.id, kind, ref)) return reply.code(400).send({ error: 'Это у сотрудника уже есть' })
      queueReward(target.id, {
        kind, title: item.title, description: kind === 'avatar' ? 'Новая аватарка' : 'Новый статус под именем',
        avatar: kind === 'avatar' ? ref : null, image: kind === 'status' ? item.image : '', note
      })
      notify(target.id, kind, kind === 'avatar' ? `Новая аватарка: ${item.title}` : `Новый статус: ${item.title}`, reason, '/profile')
      audit(req.user.id, `${kind}.grant`, 'user', target.id, { title: item.title, reason })
      return reply.send({ ok: true })
    }
    const a = db.prepare('SELECT * FROM achievements WHERE id = ?').get(achievement_id)
    if (!a) return reply.code(404).send({ error: 'Достижение не найдено' })
    if (!grantAchievement(target.id, a, { by: req.user.id, reason: String(reason).trim() })) {
      return reply.code(400).send({ error: 'Это достижение у сотрудника уже есть' })
    }
    audit(req.user.id, 'achievement.grant', 'user', target.id, { title: a.title, reason })
    reply.send({ ok: true })
  })

  // Снятие награды — с записью в журнале (спецификация 5.4: «нельзя отобрать без следа»)
  app.post('/api/admin/revoke', admin, async (req, reply) => {
    const { user_id, achievement_id, reason } = req.body || {}
    if (!String(reason || '').trim()) return reply.code(400).send({ error: 'Укажите причину' })
    const res = db.prepare('DELETE FROM user_achievements WHERE user_id = ? AND achievement_id = ?').run(user_id, achievement_id)
    if (!res.changes) return reply.code(404).send({ error: 'У сотрудника нет этой награды' })
    audit(req.user.id, 'achievement.revoke', 'user', user_id, { achievement_id, reason })
    reply.send({ ok: true })
  })

  // ─── Мастерская: достижения ─────────────────────────────────
  // Картинка — загруженный файл (/uploads/…), готовая иконка из набора (код) или ссылка https.
  // Остаток приза: пусто — без ограничения, иначе целое от 0
  const cleanStock = (v) => (v === '' || v === null || v === undefined) ? null : Math.max(0, Math.floor(Number(v)) || 0)

  const cleanImage = (v) => {
    const s = String(v || '').trim()
    if (!s) return ''
    if (/^(\/uploads\/|\/assets\/|https:\/\/)/.test(s) && s.length <= 500) return s
    if (/^[a-z0-9_-]+$/i.test(s)) return s
    return null
  }

  app.get('/api/admin/achievements', staff, async (req, reply) => {
    reply.send({
      achievements: db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM user_achievements ua WHERE ua.achievement_id = a.id) AS holders
        FROM achievements a ORDER BY sort`).all()
        .map(a => ({ ...a, rule: JSON.parse(a.rule || '{}') })),
      free_icons: (() => {
        const dir = join(root, 'public', 'assets', 'svg')
        if (!existsSync(dir)) return []
        const used = new Set(db.prepare("SELECT icon FROM achievements WHERE icon != ''").all().map(r => r.icon))
        return readdirSync(dir)
          .filter(f => f.endsWith('.svg') && f.startsWith('ach_'))
          .map(f => f.replace('.svg', ''))
          .sort()
          .map(name => ({ name, used: used.has(name) }))
      })()
    })
  })

  function achievementFields(body, prev = {}) {
    const icon = cleanImage(body.icon ?? prev.icon)
    if (icon === null || !icon) return { error: 'Добавьте картинку достижения' }
    const title = String(body.title ?? prev.title ?? '').trim()
    if (!title) return { error: 'Нужно название' }
    const kind = (body.kind ?? prev.kind) === 'manual' ? 'manual' : 'auto'
    const rule = kind === 'auto' ? (body.rule ?? (prev.rule ? JSON.parse(prev.rule) : {})) : {}
    if (kind === 'auto' && !rule.type) return { error: 'Выберите условие получения' }
    const xp = Math.max(0, Math.min(500, Number(body.xp ?? prev.xp) || 0))
    const coil = Math.max(0, Math.min(1000, Number(body.coil ?? prev.coil) || 0))
    const ra = String(body.reward_avatar ?? prev.reward_avatar ?? '')
    const rs = String(body.reward_status ?? prev.reward_status ?? '')
    if (ra && !db.prepare("SELECT 1 FROM shop_items WHERE kind = 'avatar' AND ref = ?").get(ra)) return { error: 'Аватарка-награда не найдена' }
    if (rs && !db.prepare("SELECT 1 FROM shop_items WHERE kind = 'status' AND ref = ?").get(rs)) return { error: 'Статус-награда не найден' }
    return { title, description: String(body.description ?? prev.description ?? '').trim(), icon, kind, rule: JSON.stringify(rule), xp, coil, reward_avatar: ra, reward_status: rs }
  }

  app.post('/api/admin/achievements', admin, async (req, reply) => {
    const f = achievementFields(req.body || {})
    if (f.error) return reply.code(400).send({ error: f.error })
    const code = `ach_${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
    const sort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM achievements').get().m + 1
    const id = db.prepare(`INSERT INTO achievements(code,title,description,icon,kind,rule,xp,coil,reward_avatar,reward_status,sort)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(code, f.title, f.description, f.icon, f.kind, f.rule, f.xp, f.coil, f.reward_avatar, f.reward_status, sort).lastInsertRowid
    audit(req.user.id, 'achievement.create', 'achievement', id, { title: f.title })
    // Новое автодостижение могли уже заслужить — проверим всех сразу
    if (f.kind === 'auto') for (const u of db.prepare("SELECT id FROM users WHERE archived_at IS NULL AND role = 'employee'").all()) checkAchievements(u.id)
    reply.send({ id })
  })

  app.patch('/api/admin/achievements/:id', admin, async (req, reply) => {
    const a = db.prepare('SELECT * FROM achievements WHERE id = ?').get(req.params.id)
    if (!a) return reply.code(404).send({ error: 'Не найдено' })
    const f = achievementFields(req.body || {}, a)
    if (f.error) return reply.code(400).send({ error: f.error })
    db.prepare(`UPDATE achievements SET title=?, description=?, icon=?, kind=?, rule=?, xp=?, coil=?, reward_avatar=?, reward_status=? WHERE id=?`)
      .run(f.title, f.description, f.icon, f.kind, f.rule, f.xp, f.coil, f.reward_avatar, f.reward_status, a.id)
    audit(req.user.id, 'achievement.update', 'achievement', a.id, { title: f.title })
    reply.send({ ok: true })
  })

  app.delete('/api/admin/achievements/:id', admin, async (req, reply) => {
    const a = db.prepare('SELECT * FROM achievements WHERE id = ?').get(req.params.id)
    if (!a) return reply.code(404).send({ error: 'Не найдено' })
    const holders = db.prepare('SELECT COUNT(*) c FROM user_achievements WHERE achievement_id = ?').get(a.id).c
    if (holders) return reply.code(409).send({ error: `Это достижение уже есть у ${holders} чел. Удалить его нельзя — можно переделать в «ручное», чтобы оно больше не выдавалось само` })
    db.prepare('DELETE FROM achievements WHERE id = ?').run(a.id)
    audit(req.user.id, 'achievement.delete', 'achievement', a.id, { title: a.title })
    reply.send({ ok: true })
  })

  // ─── Мастерская: аватарки, статусы, темы в магазине ─────────
  app.get('/api/admin/shop/free-avatars', staff, async (req, reply) => {
    const dir = join(root, 'public', 'assets', 'svg')
    if (!existsSync(dir)) return reply.send({ avatars: [] })
    const used = new Set(db.prepare("SELECT ref FROM shop_items WHERE kind = 'avatar'").all().map(r => r.ref))
    used.add('ava_01_ugolek')
    reply.send({
      avatars: readdirSync(dir)
        .filter(f => f.endsWith('.svg') && f.startsWith('ava_'))
        .map(f => f.replace('.svg', ''))
        .filter(name => !used.has(name))
        .sort()
    })
  })

  // У кого есть предмет: купили или получили наградой
  function holdersOf(item) {
    const bought = db.prepare('SELECT COUNT(*) c FROM purchases WHERE item_id = ?').get(item.id).c
    const col = item.kind === 'avatar' ? 'earned_avatars' : item.kind === 'status' ? 'earned_statuses' : null
    const earned = col ? db.prepare(`SELECT COUNT(*) c FROM users WHERE ${col} LIKE ?`).get(`%"${item.ref}"%`).c : 0
    return Math.max(bought, earned)
  }

  app.get('/api/admin/shop', staff, async (req, reply) => {
    const rewards = db.prepare("SELECT title, reward_avatar, reward_status FROM achievements WHERE reward_avatar != '' OR reward_status != ''").all()
    reply.send({
      items: db.prepare('SELECT * FROM shop_items ORDER BY kind, sort').all().map(s => ({
        ...s,
        sold: db.prepare('SELECT COUNT(*) c FROM purchases WHERE item_id = ?').get(s.id).c,
        holders: holdersOf(s),
        via: rewards.filter(r => (s.kind === 'avatar' && r.reward_avatar === s.ref) || (s.kind === 'status' && r.reward_status === s.ref)).map(r => r.title)
      }))
    })
  })

  app.post('/api/admin/shop', admin, async (req, reply) => {
    const { kind, ref, title, price, purchaseable, image, description, rarity } = req.body || {}
    if (!['avatar', 'status', 'theme', 'prize'].includes(kind) || !String(title || '').trim()) return reply.code(400).send({ error: 'Заполните название' })
    const img = cleanImage(image)
    if (img === null) return reply.code(400).send({ error: 'Некорректная картинка' })
    // Аватарка из загруженного файла: её код — сам адрес картинки.
    // Так она одинаково показывается везде, без отдельного справочника.
    let code = ref
    if (kind === 'avatar') code = img || ref
    if (kind === 'status') code = `status_${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
    if (kind === 'prize') code = `prize_${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
    if (!code) return reply.code(400).send({ error: kind === 'avatar' ? 'Загрузите картинку аватарки' : 'Выберите тему' })
    if (db.prepare('SELECT 1 FROM shop_items WHERE kind = ? AND ref = ?').get(kind, code)) return reply.code(409).send({ error: 'Такой предмет уже есть' })
    if (Number(price) < 0) return reply.code(400).send({ error: 'Цена не может быть меньше нуля' })
    const sort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM shop_items').get().m + 1
    const id = db.prepare('INSERT INTO shop_items(kind,ref,title,price,purchaseable,sort,image,description,rarity,stock) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(kind, code, String(title).trim(), Number(price) || 0, purchaseable ? 1 : 0, sort,
        kind === 'status' || kind === 'prize' ? (img || '') : '', String(description || '').trim(),
        ['common', 'rare', 'legendary'].includes(rarity) ? rarity : 'common', kind === 'prize' ? cleanStock(req.body.stock) : null).lastInsertRowid
    audit(req.user.id, 'shop.create', 'item', id, { title })
    reply.send({ id, ref: code })
  })

  app.patch('/api/admin/shop/:id', admin, async (req, reply) => {
    const it = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id)
    if (!it) return reply.code(404).send({ error: 'Не найдено' })
    const { title, price, purchaseable, image, description, rarity, stock } = req.body || {}
    if (price !== undefined && Number(price) < 0) return reply.code(400).send({ error: 'Цена не может быть меньше нуля' })
    const img = image === undefined ? undefined : cleanImage(image)
    if (img === null) return reply.code(400).send({ error: 'Некорректная картинка' })
    db.transaction(() => {
      db.prepare('UPDATE shop_items SET title=?, price=?, purchaseable=?, description=?, rarity=? WHERE id=?')
        .run(String(title ?? it.title).trim() || it.title, price ?? it.price, purchaseable === undefined ? it.purchaseable : (purchaseable ? 1 : 0),
          description ?? it.description, ['common', 'rare', 'legendary'].includes(rarity) ? rarity : it.rarity, it.id)
      if (img !== undefined && (it.kind === 'status' || it.kind === 'prize')) db.prepare('UPDATE shop_items SET image = ? WHERE id = ?').run(img, it.id)
      if (stock !== undefined && it.kind === 'prize') db.prepare('UPDATE shop_items SET stock = ? WHERE id = ?').run(cleanStock(stock), it.id)
      // Замена картинки аватарки: переносим новую картинку всем, у кого она уже есть
      if (img && it.kind === 'avatar' && img !== it.ref) {
        db.prepare('UPDATE shop_items SET ref = ? WHERE id = ?').run(img, it.id)
        db.prepare('UPDATE users SET avatar_id = ? WHERE avatar_id = ?').run(img, it.ref)
        db.prepare('UPDATE users SET earned_avatars = REPLACE(earned_avatars, ?, ?) WHERE earned_avatars LIKE ?')
          .run(JSON.stringify(it.ref), JSON.stringify(img), `%${JSON.stringify(it.ref)}%`)
        db.prepare('UPDATE achievements SET reward_avatar = ? WHERE reward_avatar = ?').run(img, it.ref)
      }
    })()
    audit(req.user.id, 'shop.update', 'item', it.id, { title: title ?? it.title })
    reply.send({ ok: true })
  })

  // Полученное остаётся у сотрудника навсегда: предмет, который у кого-то есть,
  // только снимается с продажи
  app.delete('/api/admin/shop/:id', admin, async (req, reply) => {
    const it = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.id)
    if (!it) return reply.code(404).send({ error: 'Не найдено' })
    const inRewards = db.prepare('SELECT COUNT(*) c FROM achievements WHERE reward_avatar = ? OR reward_status = ?').get(it.ref, it.ref).c
    const orders = db.prepare('SELECT COUNT(*) c FROM prize_orders WHERE item_id = ?').get(it.id).c
    if (holdersOf(it) || inRewards || orders) {
      db.prepare('UPDATE shop_items SET purchaseable = 0 WHERE id = ?').run(it.id)
      audit(req.user.id, 'shop.hide', 'item', it.id, { title: it.title })
      return reply.send({ ok: true, hidden: true })
    }
    db.prepare('DELETE FROM shop_items WHERE id = ?').run(it.id)
    audit(req.user.id, 'shop.delete', 'item', it.id, { title: it.title })
    reply.send({ ok: true })
  })

  // ─── Заказы призов ───────────────────────────────────────────
  app.get('/api/admin/prize-orders', staff, async (req, reply) => {
    reply.send({
      orders: db.prepare(`SELECT o.*, u.name AS user_name, u.phone, b.name AS branch, s.image
        FROM prize_orders o JOIN users u ON u.id = o.user_id LEFT JOIN branches b ON b.id = u.branch_id
        LEFT JOIN shop_items s ON s.id = o.item_id
        ORDER BY CASE o.status WHEN 'new' THEN 0 ELSE 1 END, o.id DESC LIMIT 300`).all()
    })
  })

  // Выдан — или отменён с возвратом COIL и приза на склад
  app.patch('/api/admin/prize-orders/:id', admin, async (req, reply) => {
    const o = db.prepare('SELECT * FROM prize_orders WHERE id = ?').get(req.params.id)
    if (!o) return reply.code(404).send({ error: 'Заказ не найден' })
    if (o.status !== 'new') return reply.code(409).send({ error: 'Заказ уже закрыт' })
    const { status, note } = req.body || {}
    if (!['done', 'cancelled'].includes(status)) return reply.code(400).send({ error: 'Неизвестное действие' })
    db.transaction(() => {
      db.prepare("UPDATE prize_orders SET status = ?, note = ?, closed_at = datetime('now') WHERE id = ?").run(status, String(note || '').trim(), o.id)
      if (status === 'cancelled') {
        awardCoil(o.user_id, o.price, 'prize_refund', String(o.id))
        db.prepare('UPDATE shop_items SET stock = stock + 1 WHERE id = ? AND stock IS NOT NULL').run(o.item_id)
      }
    })()
    if (status === 'done') notify(o.user_id, 'prize', `Приз выдан: ${o.title}`, note || 'Спасибо за отличную учёбу!', '/shop')
    else notify(o.user_id, 'prize', `Заказ отменён: ${o.title}`, `${o.price} COIL вернулись на счёт${note ? '. ' + note : ''}`, '/shop')
    audit(req.user.id, 'prize.' + status, 'order', o.id, { title: o.title })
    reply.send({ ok: true })
  })

  // ─── Вкусы: бренды и вкусы целиком под управлением админа ───
  // Вкус попадает в тренировку, только если опубликован и у него есть описание:
  // вопрос без объяснения не учит — продавец угадает, но не расскажет клиенту.
  const STRENGTHS = ['лёгкая', 'средняя', 'высокая']
  const flavorImage = (v) => {
    const s = String(v || '').trim()
    return !s || /^(\/uploads\/|https:\/\/)/.test(s) ? s : null
  }

  app.get('/api/admin/flavors', admin, async (req, reply) => {
    const brands = db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM flavors f WHERE f.brand_id = b.id) AS flavors
      FROM flavor_brands b ORDER BY b.sort, b.id`).all()
    const flavors = db.prepare(`SELECT f.*, b.name AS brand,
        (SELECT COUNT(*) FROM flavor_progress p WHERE p.flavor_id = f.id) AS learners,
        (SELECT COALESCE(SUM(wrong),0) FROM flavor_progress p WHERE p.flavor_id = f.id) AS wrong,
        (SELECT COALESCE(SUM(correct),0) FROM flavor_progress p WHERE p.flavor_id = f.id) AS correct
      FROM flavors f LEFT JOIN flavor_brands b ON b.id = f.brand_id ORDER BY b.sort, f.sort, f.name`).all()
      .map(f => ({ ...f, tags: JSON.parse(f.tags || '[]') }))
    reply.send({ brands, flavors })
  })

  app.post('/api/admin/flavor-brands', admin, async (req, reply) => {
    const { name, description, country, logo, color, published } = req.body || {}
    const n = String(name || '').trim()
    if (!n) return reply.code(400).send({ error: 'Укажите название бренда' })
    if (db.prepare('SELECT 1 FROM flavor_brands WHERE name = ?').get(n)) return reply.code(409).send({ error: 'Такой бренд уже есть' })
    const img = flavorImage(logo)
    if (img === null) return reply.code(400).send({ error: 'Некорректный логотип' })
    const sort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM flavor_brands').get().m + 1
    const id = db.prepare('INSERT INTO flavor_brands(name, description, country, logo, color, sort, published) VALUES (?,?,?,?,?,?,?)')
      .run(n, String(description || '').trim(), String(country || '').trim(), img, String(color || ''), sort, published === false ? 0 : 1).lastInsertRowid
    audit(req.user.id, 'flavor_brand.create', 'flavor_brand', id, { name: n })
    reply.send({ id })
  })

  app.patch('/api/admin/flavor-brands/:id', admin, async (req, reply) => {
    const b = db.prepare('SELECT * FROM flavor_brands WHERE id = ?').get(req.params.id)
    if (!b) return reply.code(404).send({ error: 'Бренд не найден' })
    const { name, description, country, logo, color, published, sort } = req.body || {}
    const n = name !== undefined ? String(name).trim() : b.name
    if (!n) return reply.code(400).send({ error: 'Укажите название бренда' })
    if (n !== b.name && db.prepare('SELECT 1 FROM flavor_brands WHERE name = ? AND id != ?').get(n, b.id)) return reply.code(409).send({ error: 'Такой бренд уже есть' })
    const img = logo === undefined ? b.logo : flavorImage(logo)
    if (img === null) return reply.code(400).send({ error: 'Некорректный логотип' })
    db.transaction(() => {
      db.prepare('UPDATE flavor_brands SET name=?, description=?, country=?, logo=?, color=?, published=?, sort=? WHERE id=?')
        .run(n, description ?? b.description, country ?? b.country, img, color ?? b.color,
          published === undefined ? b.published : (published ? 1 : 0), sort ?? b.sort, b.id)
      // Название бренда продублировано во вкусах (для поиска и старых отчётов)
      if (n !== b.name) db.prepare('UPDATE flavors SET brand = ? WHERE brand_id = ?').run(n, b.id)
    })()
    audit(req.user.id, 'flavor_brand.update', 'flavor_brand', b.id, { name: n })
    reply.send({ ok: true })
  })

  app.delete('/api/admin/flavor-brands/:id', admin, async (req, reply) => {
    const b = db.prepare('SELECT * FROM flavor_brands WHERE id = ?').get(req.params.id)
    if (!b) return reply.code(404).send({ error: 'Бренд не найден' })
    db.transaction(() => {
      db.prepare('DELETE FROM flavor_progress WHERE flavor_id IN (SELECT id FROM flavors WHERE brand_id = ?)').run(b.id)
      db.prepare('DELETE FROM flavors WHERE brand_id = ?').run(b.id)
      db.prepare('DELETE FROM flavor_brands WHERE id = ?').run(b.id)
    })()
    audit(req.user.id, 'flavor_brand.delete', 'flavor_brand', b.id, { name: b.name })
    reply.send({ ok: true })
  })

  function flavorFields(body, prev = {}) {
    const brand = db.prepare('SELECT * FROM flavor_brands WHERE id = ?').get(Number(body.brand_id ?? prev.brand_id))
    if (!brand) return { error: 'Выберите бренд' }
    const name = String(body.name ?? prev.name ?? '').trim()
    if (!name) return { error: 'Укажите название вкуса' }
    const strength = String(body.strength ?? prev.strength ?? '')
    if (strength && !STRENGTHS.includes(strength)) return { error: 'Крепость: лёгкая, средняя или высокая' }
    const image = body.image === undefined ? (prev.image || '') : flavorImage(body.image)
    if (image === null) return { error: 'Некорректная картинка' }
    const tags = Array.isArray(body.tags) ? body.tags : (body.tags === undefined ? JSON.parse(prev.tags || '[]') : String(body.tags).split(','))
    const description = String(body.description ?? prev.description ?? '').trim()
    const wantsQuiz = body.in_quiz === undefined ? (prev.in_quiz ?? 1) : (body.in_quiz ? 1 : 0)
    return {
      brand_id: brand.id, brand: brand.name, name, description, strength, image,
      tags: JSON.stringify(tags.map(t => String(t).trim()).filter(Boolean).slice(0, 12)),
      cold: (body.cold ?? prev.cold) ? 1 : 0,
      tip: String(body.tip ?? prev.tip ?? '').trim(), mix: String(body.mix ?? prev.mix ?? '').trim(), line: String(body.line ?? prev.line ?? '').trim(),
      published: body.published === undefined ? (prev.published ?? 1) : (body.published ? 1 : 0),
      in_quiz: description ? wantsQuiz : 0
    }
  }

  app.post('/api/admin/flavors', admin, async (req, reply) => {
    const f = flavorFields(req.body || {})
    if (f.error) return reply.code(400).send({ error: f.error })
    if (db.prepare('SELECT 1 FROM flavors WHERE brand = ? AND name = ?').get(f.brand, f.name)) return reply.code(409).send({ error: 'Такой вкус у этого бренда уже есть' })
    const sort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM flavors WHERE brand_id = ?').get(f.brand_id).m + 1
    const id = db.prepare(`INSERT INTO flavors(brand, brand_id, name, description, tags, strength, cold, image, tip, mix, line, published, in_quiz, sort, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'')`).run(f.brand, f.brand_id, f.name, f.description, f.tags, f.strength, f.cold, f.image, f.tip, f.mix, f.line, f.published, f.in_quiz, sort).lastInsertRowid
    audit(req.user.id, 'flavor.create', 'flavor', id, { name: f.name })
    reply.send({ id, in_quiz: !!f.in_quiz })
  })

  app.patch('/api/admin/flavors/:id', admin, async (req, reply) => {
    const prev = db.prepare('SELECT * FROM flavors WHERE id = ?').get(req.params.id)
    if (!prev) return reply.code(404).send({ error: 'Вкус не найден' })
    const f = flavorFields(req.body || {}, prev)
    if (f.error) return reply.code(400).send({ error: f.error })
    if (db.prepare('SELECT 1 FROM flavors WHERE brand = ? AND name = ? AND id != ?').get(f.brand, f.name, prev.id)) return reply.code(409).send({ error: 'Такой вкус у этого бренда уже есть' })
    db.prepare(`UPDATE flavors SET brand=?, brand_id=?, name=?, description=?, tags=?, strength=?, cold=?, image=?, tip=?, mix=?, line=?, published=?, in_quiz=? WHERE id=?`)
      .run(f.brand, f.brand_id, f.name, f.description, f.tags, f.strength, f.cold, f.image, f.tip, f.mix, f.line, f.published, f.in_quiz, prev.id)
    audit(req.user.id, 'flavor.update', 'flavor', prev.id, { name: f.name })
    reply.send({ ok: true, in_quiz: !!f.in_quiz })
  })

  app.delete('/api/admin/flavors/:id', admin, async (req, reply) => {
    const f = db.prepare('SELECT * FROM flavors WHERE id = ?').get(req.params.id)
    if (!f) return reply.code(404).send({ error: 'Вкус не найден' })
    db.transaction(() => {
      db.prepare('DELETE FROM flavor_progress WHERE flavor_id = ?').run(f.id)
      db.prepare('DELETE FROM flavors WHERE id = ?').run(f.id)
    })()
    audit(req.user.id, 'flavor.delete', 'flavor', f.id, { name: f.name })
    reply.send({ ok: true })
  })

  // Импорт CSV: бренд;название;описание;теги через запятую;крепость;холод(да/нет).
  // Новые бренды создаются сами. Вкус без описания помечается и в тренировку не идёт.
  app.post('/api/admin/flavors/import', admin, async (req, reply) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
    let added = 0, skipped = 0, noDesc = 0
    db.transaction(() => {
      for (const r of rows) {
        const bName = String(r.brand || '').trim()
        const name = String(r.name || '').trim()
        if (!bName || !name) { skipped++; continue }
        let brand = db.prepare('SELECT * FROM flavor_brands WHERE name = ?').get(bName)
        if (!brand) {
          const sort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM flavor_brands').get().m + 1
          const id = db.prepare('INSERT INTO flavor_brands(name, sort) VALUES (?,?)').run(bName, sort).lastInsertRowid
          brand = { id, name: bName }
        }
        if (db.prepare('SELECT 1 FROM flavors WHERE brand = ? AND name = ?').get(bName, name)) { skipped++; continue }
        const tags = String(r.tags || '').split(/[;,]/).map(t => t.trim()).filter(Boolean)
        const desc = String(r.description || '').trim()
        const strength = STRENGTHS.includes(String(r.strength || '').trim()) ? String(r.strength).trim() : ''
        if (!desc) noDesc++
        db.prepare(`INSERT INTO flavors(brand, brand_id, name, description, tags, strength, cold, in_quiz, status) VALUES (?,?,?,?,?,?,?,?,'')`)
          .run(bName, brand.id, name, desc, JSON.stringify(tags), strength, /да|true|1|yes/i.test(String(r.cold || '')) ? 1 : 0, desc ? 1 : 0)
        added++
      }
    })()
    audit(req.user.id, 'flavor.import', 'flavor', '', { added, skipped, noDesc })
    reply.send({ added, skipped, noDesc, message: `Добавлено ${added}, пропущено ${skipped}. Без описания — ${noDesc} (в тренировку не пойдут, пока не заполните).` })
  })
}
