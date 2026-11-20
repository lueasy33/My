// Демо-данные согласованы сами с собой: баланс = сумма журнала, положенные
// авто-достижения выданы, лишних окон наград нет, картинки уроков существуют.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { startServer, root } from './helpers.js'

let S
before(async () => { S = await startServer() })
after(() => S?.stop())

const users = () => S.db.prepare('SELECT * FROM users').all()

test('после seed у каждого баланс COIL и XP равен сумме журнала', () => {
  for (const u of users()) {
    const coil = S.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM coil_tx WHERE user_id = ?').get(u.id).s
    const xp = S.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM xp_tx WHERE user_id = ?').get(u.id).s
    assert.equal(u.coil, coil, `${u.name}: coil ${u.coil}, а в журнале ${coil}`)
    assert.equal(u.xp, xp, `${u.name}: xp ${u.xp}, а в журнале ${xp}`)
  }
})

test('после seed выданы все положенные авто-достижения', () => {
  const all = S.db.prepare("SELECT id, code, rule FROM achievements WHERE kind = 'auto'").all()
  let checked = 0
  for (const u of users()) {
    const owned = new Set(S.db.prepare('SELECT achievement_id a FROM user_achievements WHERE user_id = ?').all(u.id).map(r => r.a))
    const passed = S.db.prepare("SELECT COUNT(*) c FROM progress WHERE user_id = ? AND status = 'passed'").get(u.id).c
    const perfect = S.db.prepare('SELECT COUNT(DISTINCT test_id) c FROM attempts WHERE user_id = ? AND score = 100 AND passed = 1').get(u.id).c
    for (const a of all) {
      const r = JSON.parse(a.rule)
      const due = (r.type === 'streak' && u.streak >= r.days)
        || (r.type === 'lessons' && passed >= r.count)
        || (r.type === 'perfect' && perfect >= r.count)
        || (r.type === 'level' && u.level >= r.level)
      if (!due) continue
      checked++
      assert.ok(owned.has(a.id), `${u.name}: положено «${a.code}», но не выдано`)
    }
  }
  assert.ok(checked > 0, 'проверять было нечего — seed изменился?')
  // Пример из разбора: серия 12 дней — значит «Серия 3» и «Серия 7» получены
  const admin = S.db.prepare("SELECT id, streak FROM users WHERE phone = '+79101234567'").get()
  assert.ok(admin.streak >= 7)
  const codes = S.db.prepare('SELECT a.code FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ?')
    .all(admin.id).map(r => r.code)
  assert.ok(codes.includes('ach_09_seriya-3') && codes.includes('ach_10_seriya-7'), codes.join(','))
})

test('демо-достижения — прошлое: без окон наград, новых уведомлений и с правильной ценой', () => {
  assert.equal(S.db.prepare('SELECT COUNT(*) c FROM pending_rewards').get().c, 0, 'окна наград всплывут при входе')
  assert.equal(S.db.prepare('SELECT COUNT(*) c FROM user_achievements WHERE seen = 0').get().c, 0)
  assert.equal(S.db.prepare("SELECT COUNT(*) c FROM notifications WHERE created_at >= datetime('now','-1 hour') AND kind = 'achievement'").get().c, 0)
  // Цены достижений после seed не обнулены
  const a = S.db.prepare("SELECT xp, coil FROM achievements WHERE code = 'ach_09_seriya-3'").get()
  assert.deepEqual({ ...a }, { xp: 10, coil: 30 })
})

test('«в команде» не меньше текущей серии', () => {
  for (const u of users()) {
    if (!u.streak) continue
    const days = S.db.prepare("SELECT julianday('now') - julianday(?) d").get(u.created_at).d
    assert.ok(days >= u.streak, `${u.name}: в команде ${Math.floor(days)} дн., а серия ${u.streak}`)
    assert.ok(u.best_streak >= u.streak, `${u.name}: лучшая серия меньше текущей`)
  }
})

test('картинки уроков в демо указывают на существующие файлы', () => {
  const blocks = S.db.prepare("SELECT id, content FROM blocks WHERE type = 'photo'").all()
  assert.ok(blocks.length > 0)
  for (const b of blocks) {
    const { src } = JSON.parse(b.content)
    if (!src?.startsWith('/assets/')) continue
    assert.ok(existsSync(join(root, 'public', src)), `блок ${b.id}: нет файла ${src}`)
  }
})

test('старая база с битой картинкой урока 1 чинится при запуске', () => {
  const bad = '/assets/webp-512/l1_scheme.webp'
  const id = S.db.prepare("INSERT INTO blocks(lesson_id, type, content, sort) VALUES ((SELECT MIN(id) FROM lessons), 'photo', ?, 99)")
    .run(JSON.stringify({ src: bad, alt: 'x', caption: 'y' })).lastInsertRowid
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./server/db.js')"],
    { cwd: root, env: S.env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const { src } = JSON.parse(S.db.prepare('SELECT content FROM blocks WHERE id = ?').get(id).content)
  assert.notEqual(src, bad)
  assert.ok(existsSync(join(root, 'public', src)), src)
  S.db.prepare('DELETE FROM blocks WHERE id = ?').run(id)
})

test('у ветеранов есть XP за последние 30 дней — рейтинг «Месяц» не пустой', () => {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().replace('T', ' ').slice(0, 19)
  const rows = S.db.prepare(`SELECT u.name, u.streak, (SELECT COALESCE(SUM(x.amount),0) FROM xp_tx x
    WHERE x.user_id = u.id AND x.created_at >= ? AND x.reason != 'opening') xp
    FROM users u WHERE u.role = 'employee' AND u.streak >= 3 AND u.last_active_day = date('now')`).all(since)
  assert.ok(rows.length >= 3, 'мало активных ветеранов в демо')
  for (const r of rows) assert.ok(r.xp > 0, `${r.name}: 0 XP за месяц при серии ${r.streak}`)
  // История не пишется в будущее и не спорит с сегодняшним тренажёром
  assert.equal(S.db.prepare("SELECT COUNT(*) c FROM xp_tx WHERE created_at > datetime('now')").get().c, 0)
})

test('в магазине есть демо-призы: кружка, скидка, выходной', () => {
  const prizes = S.db.prepare("SELECT title, price, purchaseable FROM shop_items WHERE kind = 'prize'").all()
  assert.ok(prizes.length >= 3)
  for (const p of prizes) assert.ok(p.price > 0 && p.purchaseable === 1, p.title)
  for (const w of [/кружка/i, /скидка/i, /выходной/i]) assert.ok(prizes.some(p => w.test(p.title)), String(w))
})

test('демо-админка не «горит»: просрочек немного, у разных людей и свежие', async () => {
  const { cookie } = await S.login('+79101234567')
  const r = await S.call('/api/admin/attention', { cookie })
  assert.equal(r.status, 200)
  const rows = r.json.rows
  assert.ok(rows.length >= 3 && rows.length <= 6, `просрочек ${rows.length}, ждём 3–6`)
  const people = new Set(rows.map(x => x.user_id))
  assert.ok(people.size >= 3, `просрочки только у ${people.size} человек`)
  for (const x of rows) assert.ok(x.days_overdue >= 1 && x.days_overdue <= 14, `${x.name}: ${x.lesson} просрочен на ${x.days_overdue} дн.`)
  // Ветераны прошли положенное по стажу
  const veteran = S.db.prepare("SELECT COUNT(*) c FROM progress p JOIN users u ON u.id = p.user_id WHERE u.phone = '+79101112233' AND p.status = 'passed'").get().c
  assert.ok(veteran >= 5, `у Ирины пройдено ${veteran}`)
})
