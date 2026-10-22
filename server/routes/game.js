import { db } from '../db.js'
import { requireAuth } from '../index.js'
import {
  spendCoil, checkAchievements, levelProgress, queueReward, pendingRewards,
  themeUnlocked, boughtThemes, ownedStatuses
} from '../economy.js'
import { courseFilterSql } from '../access.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const THEMES = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'themes.json'), 'utf8'))

export function statusTitle(ref) {
  if (!ref) return null
  return db.prepare("SELECT title FROM shop_items WHERE kind = 'status' AND ref = ?").get(ref)?.title || null
}

export function statusInfo(ref) {
  if (!ref) return null
  const s = db.prepare("SELECT ref, title, image, rarity FROM shop_items WHERE kind = 'status' AND ref = ?").get(ref)
  return s || null
}

export default async function gameRoutes(app) {
  // ─── Очередь наград ─────────────────────────────────────────
  app.get('/api/rewards/pending', { preHandler: requireAuth }, async (req, reply) => {
    reply.send({ items: pendingRewards(req.user.id) })
  })

  app.post('/api/rewards/ack', { preHandler: requireAuth }, async (req, reply) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean)
    const mark = db.prepare("UPDATE pending_rewards SET seen_at = datetime('now') WHERE id = ? AND user_id = ?")
    for (const id of ids) mark.run(id, req.user.id)
    reply.send({ ok: true })
  })

  // ─── Темы ───────────────────────────────────────────────────
  app.get('/api/themes', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const bought = boughtThemes(u.id)
    reply.send({
      active: u.theme,
      level: u.level,
      themes: THEMES.map(t => ({
        slug: t.slug, name: t.name, dark: t.dark, unlock: t.unlock, level: t.level,
        unlocked: themeUnlocked(u, t, bought),
        swatch: [t['bg-base'], t['surface-1'], t['brand-500'], t['reward-500']]
      }))
    })
  })

  // ─── Профиль ────────────────────────────────────────────────
  app.get('/api/profile', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const all = db.prepare('SELECT * FROM achievements ORDER BY sort').all()
    const mine = db.prepare('SELECT achievement_id, granted_at, reason FROM user_achievements WHERE user_id = ?').all(u.id)
    const byId = Object.fromEntries(mine.map(m => [m.achievement_id, m]))
    const history = db.prepare(`
      SELECT amount, reason, created_at FROM coil_tx WHERE user_id = ? AND reason != 'opening'
      ORDER BY id DESC LIMIT 30
    `).all(u.id)
    const courses = db.prepare(`
      SELECT c.id, c.title,
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS total,
        (SELECT COUNT(*) FROM lessons l JOIN progress p ON p.lesson_id = l.id
          WHERE l.course_id = c.id AND l.published = 1 AND p.user_id = ? AND p.status = 'passed') AS done
      FROM courses c WHERE c.published = 1
    `).all(u.id).filter(c => c.done > 0)
    const statuses = ownedStatuses(u).map(statusInfo).filter(Boolean)
    const avatarTitles = Object.fromEntries(db.prepare("SELECT ref, title FROM shop_items WHERE kind = 'avatar'").all().map(r => [r.ref, r.title]))
    avatarTitles.ava_01_ugolek = avatarTitles.ava_01_ugolek || 'Уголёк'
    const avatars = [...new Set(['ava_01_ugolek', ...JSON.parse(u.earned_avatars || '[]')])]
      .map(ref => ({ ref, title: avatarTitles[ref] || 'Аватарка' }))

    // ─── Подробная статистика ───
    const f = courseFilterSql({ ...u, role: 'employee' })
    const visibleCourses = db.prepare(`SELECT c.id, c.title,
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS total,
        (SELECT COUNT(*) FROM lessons l JOIN progress p ON p.lesson_id = l.id
          WHERE l.course_id = c.id AND l.published = 1 AND p.user_id = ? AND p.status = 'passed') AS done
      FROM courses c WHERE ${f.sql}`).all(u.id, ...f.params).filter(c => c.total > 0)
    const lessonsTotal = visibleCourses.reduce((s, c) => s + c.total, 0)
    const lessonsDone = visibleCourses.reduce((s, c) => s + c.done, 0)
    const coursesDone = visibleCourses.filter(c => c.done >= c.total).length
    const tests = db.prepare(`SELECT COUNT(DISTINCT test_id) passed,
        (SELECT COUNT(DISTINCT test_id) FROM attempts WHERE user_id = ? AND score = 100 AND passed = 1) perfect,
        (SELECT ROUND(AVG(score)) FROM attempts WHERE user_id = ? AND pending = 0) avg,
        (SELECT COUNT(*) FROM attempts WHERE user_id = ?) tries
      FROM attempts WHERE user_id = ? AND passed = 1`).get(u.id, u.id, u.id, u.id)
    const pool = "archived_at IS NULL AND status = 'active' AND role != 'admin'"
    const rank = u.role === 'admin' ? null : {
      company: db.prepare(`SELECT COUNT(*) + 1 c FROM users WHERE xp > ? AND ${pool}`).get(u.xp).c,
      companyTotal: db.prepare(`SELECT COUNT(*) c FROM users WHERE ${pool}`).get().c,
      branch: u.branch_id ? db.prepare(`SELECT COUNT(*) + 1 c FROM users WHERE xp > ? AND branch_id = ? AND ${pool}`).get(u.xp, u.branch_id).c : null,
      branchTotal: u.branch_id ? db.prepare(`SELECT COUNT(*) c FROM users WHERE branch_id = ? AND ${pool}`).get(u.branch_id).c : null
    }
    const flavors = db.prepare(`SELECT COUNT(*) total,
        (SELECT COUNT(*) FROM flavor_progress fp JOIN flavors x ON x.id = fp.flavor_id WHERE fp.user_id = ? AND fp.box >= 3) learned
      FROM flavors WHERE published = 1`).get(u.id)
    const coilFlow = db.prepare(`SELECT COALESCE(SUM(CASE WHEN amount > 0 AND reason != 'opening' THEN amount END),0) earned,
        COALESCE(-SUM(CASE WHEN amount < 0 THEN amount END),0) spent FROM coil_tx WHERE user_id = ?`).get(u.id)
    const days = Math.max(1, Math.round((Date.now() - new Date(String(u.created_at).replace(' ', 'T') + 'Z').getTime()) / 86400000))
    const stats = {
      lessonsDone, lessonsTotal, coursesDone, coursesTotal: visibleCourses.length,
      testsPassed: tests.passed || 0, perfectTests: tests.perfect || 0, avgScore: tests.avg || 0, attempts: tests.tries || 0,
      flavorsLearned: flavors.learned || 0, flavorsTotal: flavors.total || 0,
      bestStreak: Math.max(u.best_streak || 0, u.streak), days, coilEarned: coilFlow.earned, coilSpent: coilFlow.spent
    }

    // ─── Ближе всего к получению: прогресс по автодостижениям ───
    const purchases = db.prepare('SELECT COUNT(*) c FROM purchases WHERE user_id = ?').get(u.id).c
    const metric = (rule) => {
      switch (rule.type) {
        case 'lessons': return [lessonsDone, rule.count]
        case 'courses': return [coursesDone, rule.count]
        case 'perfect': return [stats.perfectTests, rule.count]
        case 'streak': return [u.streak, rule.days]
        case 'level': return [u.level, rule.level]
        case 'purchases': return [purchases, rule.count]
        case 'course': { const c = visibleCourses.find(x => x.id === Number(rule.course_id)); return c ? [c.done, c.total] : null }
        default: return null
      }
    }
    const next = all.filter(a => a.kind === 'auto' && !byId[a.id]).map(a => {
      let rule = {}; try { rule = JSON.parse(a.rule || '{}') } catch {}
      const m = metric(rule)
      if (!m || !m[1]) return null
      return { id: a.id, title: a.title, description: a.description, icon: a.icon, current: Math.min(m[0], m[1]), target: m[1], percent: Math.round(Math.min(1, m[0] / m[1]) * 100) }
    }).filter(Boolean).sort((a, b) => b.percent - a.percent).slice(0, 4)

    // ─── Последние действия ───
    const activity = [
      ...db.prepare(`SELECT 'lesson' kind, l.title, c.title AS sub, p.updated_at AS at FROM progress p
        JOIN lessons l ON l.id = p.lesson_id JOIN courses c ON c.id = l.course_id
        WHERE p.user_id = ? AND p.status = 'passed' ORDER BY p.updated_at DESC LIMIT 8`).all(u.id),
      ...db.prepare(`SELECT 'achievement' kind, a.title, a.description AS sub, ua.granted_at AS at FROM user_achievements ua
        JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ? ORDER BY ua.granted_at DESC LIMIT 8`).all(u.id),
      ...db.prepare(`SELECT 'purchase' kind, s.title, p.price || ' COIL' AS sub, p.created_at AS at FROM purchases p
        JOIN shop_items s ON s.id = p.item_id WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 5`).all(u.id)
    ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10)

    // Какие темы откроются на следующем уровне
    const nextThemes = THEMES.filter(t => t.unlock === 'level' && Number(t.level) === u.level + 1).map(t => t.name)

    reply.send({
      stats, rank, next, activity, nextThemes,
      achievements: all.map(a => ({
        id: a.id, code: a.code, title: a.title, description: a.description, icon: a.icon, kind: a.kind,
        xp: a.xp, coil: a.coil,
        earned: !!byId[a.id], granted_at: byId[a.id]?.granted_at || null, reason: byId[a.id]?.reason || ''
      })),
      history,
      courses: visibleCourses,
      statuses,
      avatars,
      status: statusTitle(u.status_ref),
      status_info: statusInfo(u.status_ref),
      status_ref: u.status_ref,
      levelProgress: levelProgress(u.xp),
      streak: u.streak,
      since: u.created_at
    })
  })

  // ─── Рейтинг ────────────────────────────────────────────────
  // GET /api/ranking?scope=company|branch|branches&period=week|month|all
  // Период считается по журналу xp_tx (а не по текущему XP), иначе «за неделю» не получить.
  app.get('/api/ranking', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const scope = ['company', 'branch', 'branches'].includes(req.query.scope) ? req.query.scope : 'company'
    const period = ['week', 'month', 'all'].includes(req.query.period) ? req.query.period : 'all'
    const since = period === 'all' ? null
      : new Date(Date.now() - (period === 'week' ? 7 : 30) * 86400000).toISOString().replace('T', ' ').slice(0, 19)

    const people = db.prepare(`
      SELECT u.id AS user_id, u.name, u.xp, u.level, u.avatar_id, u.status_ref, u.branch_id, b.name AS branch,
        ${since ? "(SELECT COALESCE(SUM(x.amount),0) FROM xp_tx x WHERE x.user_id = u.id AND x.created_at >= ? AND x.reason != 'opening')" : 'u.xp'} AS xp_period,
        (SELECT COUNT(*) FROM progress p WHERE p.user_id = u.id AND p.status = 'passed') AS lessons
      FROM users u LEFT JOIN branches b ON b.id = u.branch_id
      WHERE u.archived_at IS NULL AND u.status = 'active' AND u.role != 'admin'
    `).all(...(since ? [since] : []))

    if (scope === 'branches') {
      const byBranch = new Map()
      for (const p of people) {
        if (!p.branch_id) continue
        const cur = byBranch.get(p.branch_id) || { id: p.branch_id, branch: p.branch, people: 0, sum: 0 }
        cur.people += 1; cur.sum += p.xp_period
        byBranch.set(p.branch_id, cur)
      }
      const rows = [...byBranch.values()]
        .map(b => ({ id: b.id, branch: b.branch, people: b.people, avg_xp: Math.round(b.sum / Math.max(1, b.people)), mine: b.id === u.branch_id }))
        .sort((a, b) => b.avg_xp - a.avg_xp)
        .map((r, i) => ({ ...r, rank: i + 1 }))
      return reply.send({ scope, period, rows, me: rows.find(r => r.mine) || null })
    }

    let pool = people
    if (scope === 'branch') pool = people.filter(p => p.branch_id === u.branch_id)
    // Сортировка по XP; при равенстве — по числу пройденных уроков (спецификация 5.8)
    pool.sort((a, b) => (b.xp_period - a.xp_period) || (b.lessons - a.lessons) || a.name.localeCompare(b.name, 'ru'))
    const statusTitles = Object.fromEntries(db.prepare("SELECT ref, title FROM shop_items WHERE kind = 'status'").all().map(r => [r.ref, r.title]))
    const row = (p, i) => ({
      rank: i + 1, user_id: p.user_id, name: p.name, branch: p.branch, xp: p.xp_period,
      level: p.level, avatar_id: p.avatar_id, status: statusTitles[p.status_ref] || null, me: p.user_id === u.id
    })
    const rows = pool.slice(0, 50).map(row)
    const myIdx = pool.findIndex(p => p.user_id === u.id)
    reply.send({ scope, period, total: pool.length, rows, me: myIdx >= 0 ? row(pool[myIdx], myIdx) : null })
  })

  // ─── Магазин ────────────────────────────────────────────────
  app.get('/api/shop', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const owned = db.prepare('SELECT item_id FROM purchases WHERE user_id = ?').all(u.id).map(r => r.item_id)
    const avatars = JSON.parse(u.earned_avatars || '[]')
    const statuses = ownedStatuses(u)
    const bought = boughtThemes(u.id)
    const items = db.prepare('SELECT * FROM shop_items ORDER BY sort').all().map(i => {
      let has = owned.includes(i.id)
      if (i.kind === 'avatar' && avatars.includes(i.ref)) has = true
      if (i.kind === 'status' && statuses.includes(i.ref)) has = true
      // Тема, уже открытая уровнем, повторно не продаётся
      const theme = i.kind === 'theme' ? THEMES.find(t => t.slug === i.ref) : null
      if (theme && themeUnlocked(u, theme, bought)) has = true
      return {
        id: i.id, kind: i.kind, ref: i.ref, title: i.title, price: i.price,
        image: i.image, description: i.description, rarity: i.rarity,
        purchaseable: !!i.purchaseable,
        owned: has,
        selected: (i.kind === 'avatar' && u.avatar_id === i.ref) || (i.kind === 'status' && u.status_ref === i.ref)
          || (i.kind === 'theme' && u.theme === i.ref),
        swatch: theme ? [theme['bg-base'], theme['surface-1'], theme['brand-500']] : null,
        level: theme?.level || null,
        missing: Math.max(0, i.price - u.coil)
      }
    })
    reply.send({ balance: u.coil, items })
  })

  app.post('/api/shop/buy', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const item = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.body?.item_id)
    if (!item) return reply.code(404).send({ error: 'Товар не найден' })
    if (!item.purchaseable) return reply.code(400).send({ error: 'Не продаётся — только за достижение или вручную' })
    if (db.prepare('SELECT 1 FROM purchases WHERE user_id = ? AND item_id = ?').get(u.id, item.id)) {
      return reply.code(409).send({ error: 'Уже куплено' })
    }
    // Баланс проверяем ВНУТРИ транзакции, на свежем значении из БД.
    // UNIQUE(user_id, item_id) в purchases — вторая линия защиты от двойного списания.
    let balanceError = null
    try {
      db.transaction(() => {
        const fresh = db.prepare('SELECT coil, earned_avatars FROM users WHERE id = ?').get(u.id)
        if (fresh.coil < item.price) {
          balanceError = fresh.coil
          throw new Error('NO_COIL')
        }
        spendCoil(u.id, item.price, 'purchase', String(item.id))
        db.prepare('INSERT INTO purchases(user_id, item_id, price) VALUES (?,?,?)').run(u.id, item.id, item.price)
        if (item.kind === 'avatar') {
          const owned = JSON.parse(fresh.earned_avatars || '[]')
          if (!owned.includes(item.ref)) owned.push(item.ref)
          db.prepare('UPDATE users SET earned_avatars = ?, avatar_id = ? WHERE id = ?').run(JSON.stringify(owned), item.ref, u.id)
        }
        if (item.kind === 'status') db.prepare('UPDATE users SET status_ref = ? WHERE id = ?').run(item.ref, u.id)
      })()
    } catch (e) {
      if (e.message === 'NO_COIL') {
        return reply.code(402).send({ error: `Не хватает ${item.price - balanceError} COIL`, missing: item.price - balanceError })
      }
      if (String(e.message).includes('UNIQUE')) return reply.code(409).send({ error: 'Уже куплено' })
      throw e
    }

    const kindLabel = { avatar: 'аватарку', status: 'статус', theme: 'тему оформления' }[item.kind]
    queueReward(u.id, {
      kind: item.kind, title: item.title, description: `Ты открыл ${kindLabel} «${item.title}»`,
      avatar: item.kind === 'avatar' ? item.ref : null, theme: item.kind === 'theme' ? item.ref : null,
      image: item.kind === 'status' ? item.image : ''
    })
    checkAchievements(u.id)
    const fresh = db.prepare('SELECT coil FROM users WHERE id = ?').get(u.id)
    reply.send({ ok: true, balance: fresh.coil })
  })

  // Выбрать открытую аватарку или статус
  app.post('/api/shop/select', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    const { kind, ref } = req.body || {}
    if (kind === 'avatar') {
      const owned = ['ava_01_ugolek', ...JSON.parse(u.earned_avatars || '[]')]
      if (!owned.includes(ref)) return reply.code(400).send({ error: 'Аватарка ещё не открыта' })
      db.prepare('UPDATE users SET avatar_id = ? WHERE id = ?').run(ref, u.id)
      return reply.send({ ok: true })
    }
    if (kind === 'status') {
      if (ref && !ownedStatuses(u).includes(ref)) return reply.code(400).send({ error: 'Статус ещё не открыт' })
      db.prepare('UPDATE users SET status_ref = ? WHERE id = ?').run(ref || null, u.id)
      return reply.send({ ok: true })
    }
    reply.code(400).send({ error: 'Нельзя выбрать' })
  })

  // ─── Аналитика (руководитель / админ) ───────────────────────
  app.get('/api/analytics', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    if (u.role !== 'admin') return reply.code(403).send({ error: 'Недостаточно прав' })
    reply.send(analytics(u, req.query))
  })

  // Выгрузка в Excel: CSV с BOM и «;» — Excel на русской Windows открывает его сразу
  app.get('/api/analytics/export', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user
    if (u.role !== 'admin') return reply.code(403).send({ error: 'Недостаточно прав' })
    const { people } = analytics(u, req.query)
    const head = ['Сотрудник', 'Филиал', 'Роль', 'Уровень', 'XP', 'Пройдено уроков', 'Прохождение, %', 'Средний балл, %', 'Просрочено', 'Серия, дней', 'Последний вход']
    const esc = (v) => {
      const s = String(v ?? '')
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const roles = { employee: 'сотрудник', admin: 'админ' }
    const lines = [head, ...people.map(p => [p.name, p.branch || '', roles[p.role], p.level, p.xp, p.passed, p.percent, p.avg_score, p.overdue, p.streak, p.last_active_day || ''])]
      .map(r => r.map(esc).join(';'))
    const name = `aladdin-analytics-${new Date().toISOString().slice(0, 10)}.csv`
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${name}"`)
      .send('﻿' + lines.join('\r\n'))
  })
}

function analytics(u, query = {}) {
  const scope = Number(query.branch) || null
  const p = scope ? [scope] : []
  const whereUser = scope ? 'AND u.branch_id = ?' : ''
  const days = { week: 7, month: 30, quarter: 90 }[query.period] || 30
  const since = new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ').slice(0, 19)
  const prevSince = new Date(Date.now() - 2 * days * 86400000).toISOString().replace('T', ' ').slice(0, 19)

  const totalLessons = db.prepare(`
    SELECT COUNT(*) c FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.published = 1 AND c.published = 1
  `).get().c

  const people = db.prepare(`
    SELECT u.id, u.name, u.role, u.xp, u.level, u.streak, u.last_active_day, u.branch_id, b.name AS branch,
      (SELECT COUNT(*) FROM progress p JOIN lessons l ON l.id = p.lesson_id
        WHERE p.user_id = u.id AND p.status = 'passed' AND l.published = 1) AS passed,
      (SELECT ROUND(AVG(a.score)) FROM attempts a WHERE a.user_id = u.id AND a.pending = 0) AS avg_score,
      (SELECT COUNT(*) FROM lessons l JOIN courses c ON c.id = l.course_id
        LEFT JOIN progress pr ON pr.lesson_id = l.id AND pr.user_id = u.id
        WHERE l.deadline IS NOT NULL AND l.deadline < date('now', '+3 hours') AND l.published = 1 AND c.published = 1
          AND (c.branch_id IS NULL OR c.branch_id = u.branch_id)
          AND (pr.status IS NULL OR pr.status != 'passed')) AS overdue,
      (SELECT COALESCE(SUM(x.amount),0) FROM xp_tx x WHERE x.user_id = u.id AND x.created_at >= ? AND x.reason != 'opening') AS xp_period
    FROM users u LEFT JOIN branches b ON b.id = u.branch_id
    WHERE u.archived_at IS NULL AND u.role != 'admin' ${whereUser}
    ORDER BY u.xp DESC
  `).all(since, ...p).map(x => ({
    ...x,
    percent: totalLessons ? Math.min(100, Math.round((x.passed / totalLessons) * 100)) : 0,
    avg_score: x.avg_score ?? 0
  }))

  const ids = people.map(x => x.id)
  const idList = ids.length ? ids.join(',') : '0'
  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0
  const avgPercent = avg(people.map(x => x.percent))
  const scored = people.filter(x => x.avg_score > 0)
  const avgScore = avg(scored.map(x => x.avg_score))
  const overdueTotal = people.reduce((s, x) => s + x.overdue, 0)
  const activeSince = (from, to) => db.prepare(`SELECT COUNT(DISTINCT user_id) c FROM xp_tx
    WHERE user_id IN (${idList}) AND created_at >= ? ${to ? 'AND created_at < ?' : ''} AND reason != 'opening'`).get(...(to ? [from, to] : [from])).c
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)
  const active7 = people.filter(x => x.last_active_day && (Date.parse(today) - Date.parse(x.last_active_day)) < 7 * 86400000).length
  const passedPeriod = db.prepare(`SELECT COUNT(*) c FROM progress WHERE status = 'passed' AND user_id IN (${idList}) AND updated_at >= ?`).get(since).c
  const passedPrev = db.prepare(`SELECT COUNT(*) c FROM progress WHERE status = 'passed' AND user_id IN (${idList}) AND updated_at >= ? AND updated_at < ?`).get(prevSince, since).c

  // Проблемные вопросы: доля ошибок по каждому вопросу (по ответам в попытках)
  const qs = db.prepare(`
    SELECT q.id, q.prompt, q.type, q.correct, l.title AS lesson
    FROM questions q JOIN tests t ON t.id = q.test_id JOIN lessons l ON l.id = t.lesson_id
    WHERE q.type != 'open'
  `).all()
  const attempts = db.prepare(`SELECT test_id, answers FROM attempts WHERE pending = 0 AND user_id IN (${idList})`).all()
  const qTest = Object.fromEntries(db.prepare('SELECT id, test_id FROM questions').all().map(r => [r.id, r.test_id]))
  const stat = new Map()
  for (const a of attempts) {
    let ans = {}
    try { ans = JSON.parse(a.answers) } catch {}
    for (const q of qs) {
      if (qTest[q.id] !== a.test_id) continue
      const right = JSON.parse(q.correct).map(Number).sort()
      const given = ans[q.id]
      const g = Array.isArray(given) ? [...new Set(given.map(Number))].sort() : []
      const ok = q.type === 'multi' ? (g.length === right.length && g.every((v, i) => v === right[i])) : g[0] === right[0]
      const s = stat.get(q.id) || { tries: 0, fails: 0 }
      s.tries++; if (!ok) s.fails++
      stat.set(q.id, s)
    }
  }
  const hard = qs.map(q => ({ id: q.id, prompt: q.prompt, lesson: q.lesson, ...(stat.get(q.id) || { tries: 0, fails: 0 }) }))
    .filter(q => q.tries > 0 && q.fails > 0)
    .map(q => ({ ...q, rate: Math.round((q.fails / q.tries) * 100) }))
    .sort((a, b) => b.rate - a.rate || b.tries - a.tries)
    .slice(0, 6)

  // Курсы: сколько человек прошли курс ЦЕЛИКОМ и сколько начали
  const courseStats = db.prepare(`
    SELECT c.id, c.title, c.importance,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS lessons
    FROM courses c WHERE c.published = 1 ${scope ? 'AND (c.branch_id IS NULL OR c.branch_id = ?)' : ''}
    ORDER BY c.id
  `).all(...p).filter(c => c.lessons > 0).map(c => {
    const per = db.prepare(`SELECT p.user_id, COUNT(*) n FROM progress p JOIN lessons l ON l.id = p.lesson_id
      WHERE l.course_id = ? AND l.published = 1 AND p.status = 'passed' AND p.user_id IN (${idList}) GROUP BY p.user_id`).all(c.id)
    const finished = per.filter(r => r.n >= c.lessons).length
    return { ...c, finished, started: per.length, percent: people.length ? Math.round((finished / people.length) * 100) : 0 }
  })

  // Динамика: пройденные уроки по неделям, последние 8 недель
  const weeks = []
  for (let i = 7; i >= 0; i--) {
    const from = new Date(Date.now() - (i + 1) * 7 * 86400000)
    const to = new Date(Date.now() - i * 7 * 86400000)
    const f = from.toISOString().replace('T', ' ').slice(0, 19)
    const t = to.toISOString().replace('T', ' ').slice(0, 19)
    weeks.push({
      label: to.toLocaleDateString('ru', { day: 'numeric', month: 'short' }),
      lessons: db.prepare(`SELECT COUNT(*) c FROM progress WHERE status = 'passed' AND user_id IN (${idList}) AND updated_at >= ? AND updated_at < ?`).get(f, t).c,
      xp: db.prepare(`SELECT COALESCE(SUM(amount),0) c FROM xp_tx WHERE user_id IN (${idList}) AND created_at >= ? AND created_at < ? AND reason != 'opening'`).get(f, t).c
    })
  }

  // Разрез по филиалам (только для админа)
  const branches = scope ? [] : db.prepare('SELECT id, name FROM branches WHERE archived_at IS NULL ORDER BY id').all().map(b => {
    const ps = people.filter(x => x.branch_id === b.id)
    return {
      id: b.id, name: b.name, people: ps.length,
      percent: avg(ps.map(x => x.percent)),
      avg_score: avg(ps.filter(x => x.avg_score > 0).map(x => x.avg_score)),
      overdue: ps.reduce((s, x) => s + x.overdue, 0),
      avg_xp: avg(ps.map(x => x.xp_period))
    }
  }).filter(b => b.people > 0)

  const attention = people.filter(x => x.overdue > 0 || (x.avg_score && x.avg_score < 60) || !x.last_active_day)
    .slice(0, 8).map(x => ({
      id: x.id, name: x.name, branch: x.branch,
      reason: x.overdue > 0 ? `Просрочено уроков: ${x.overdue}`
        : !x.last_active_day ? 'Ни разу не заходил'
        : `Средний балл ${x.avg_score}%`
    }))

  return {
    period: query.period || 'month',
    kpi: {
      people: people.length, avgPercent, avgScore, overdue: overdueTotal, active7,
      activePeriod: activeSince(since), activePrev: activeSince(prevSince, since),
      passedPeriod, passedPrev
    },
    people, hard, courseStats, attention, weeks, branches,
    branchList: u.role === 'admin' ? db.prepare('SELECT id, name FROM branches WHERE archived_at IS NULL ORDER BY id').all() : []
  }
}
