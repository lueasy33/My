// «Старт 50» (решение Евгения 20.11.2026): в первый день новичок получает не больше 50 COIL.
// Урок, тест, 100 % и курс — всегда полностью; вход, достижения, тренажёр режутся;
// ручные награды админа — вне лимита. Баланс всегда = сумма журнала.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer } from './helpers.js'

let S, admin
before(async () => {
  S = await startServer()
  admin = (await S.login('+79101234567')).cookie
})
after(() => S?.stop())

const PASS = 'novichok-2026'
async function newcomer(phone) {
  const branch_id = S.db.prepare('SELECT MIN(id) id FROM branches').get().id
  const r = await S.call('/api/admin/users', { cookie: admin, method: 'POST', body: { name: 'Новичок ' + phone.slice(-2), phone, password: PASS, role: 'employee', branch_id } })
  assert.equal(r.status, 200, r.text)
  const { cookie } = await S.login(phone, PASS)
  assert.ok(cookie)
  return { id: r.json.id, cookie }
}
const ledger = (uid) => S.db.prepare('SELECT amount, reason, ref FROM coil_tx WHERE user_id = ? ORDER BY id').all(uid).map(r => ({ ...r }))
const sumBy = (uid, reason) => ledger(uid).filter(r => r.reason === reason).reduce((s, r) => s + r.amount, 0)
const balanceMatches = (uid) => {
  const u = S.db.prepare('SELECT coil FROM users WHERE id = ?').get(uid)
  assert.equal(u.coil, ledger(uid).reduce((s, r) => s + r.amount, 0), 'баланс ≠ журнал')
}
const quizFlavors = (n) => S.db.prepare(`SELECT f.id FROM flavors f JOIN flavor_brands b ON b.id = f.brand_id
  WHERE f.published = 1 AND b.published = 1 AND f.in_quiz = 1 ORDER BY f.id LIMIT ?`).all(n).map(r => r.id)
const answer = (cookie, flavor_id) => S.call('/api/flavors/answer', { cookie, method: 'POST', body: { flavor_id, type: 'name', choice: flavor_id } })

// Первый урок первого курса и его тест с правильными ответами из базы
function firstTest() {
  const t = S.db.prepare(`SELECT t.id FROM tests t JOIN lessons l ON l.id = t.lesson_id
    WHERE l.published = 1 AND l.course_id = (SELECT MIN(id) FROM courses WHERE published = 1 AND branch_id IS NULL)
    ORDER BY l.sort, l.id LIMIT 1`).get()
  const qs = S.db.prepare('SELECT id, type, correct FROM questions WHERE test_id = ?').all(t.id)
  assert.ok(qs.length && qs.every(q => q.type !== 'open'), 'в тесте первого урока есть открытый вопрос')
  return { id: t.id, answers: Object.fromEntries(qs.map(q => [q.id, JSON.parse(q.correct)])) }
}

test('новичок в первый день: учёба полностью, всё остальное — в пределах 50 COIL', async () => {
  const { id, cookie } = await newcomer('+79990000101')
  const t = firstTest()
  const r = await S.call(`/api/test/${t.id}/attempt`, { cookie, method: 'POST', body: { answers: t.answers } })
  assert.equal(r.status, 200, r.text)
  assert.equal(r.json.attempt.score, 100)
  // За учёбу — по правилу COIL, без среза
  assert.equal(sumBy(id, 'lesson'), 15)
  assert.equal(sumBy(id, 'test'), 10)
  assert.equal(sumBy(id, 'test_perfect'), 15)
  assert.equal(r.json.reward.coil, 40)

  for (const f of quizFlavors(5)) await answer(cookie, f)
  const fin = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: {} })
  assert.equal(fin.json.perfect, true)

  const day = ledger(id).reduce((s, r) => s + r.amount, 0)
  assert.ok(day <= 50, `за первый день ${day} COIL: ${JSON.stringify(ledger(id))}`)
  assert.equal(day, 50, 'до лимита должно дойти: 40 за учёбу + вход + достижения')
  // Ответ API и окна наград показывают фактическое начисление
  const flavorGot = sumBy(id, 'flavor_train') + sumBy(id, 'flavor_perfect')
  assert.equal(fin.json.gained.coil, flavorGot)
  for (const p of S.db.prepare("SELECT payload FROM pending_rewards WHERE user_id = ? AND kind = 'achievement'").all(id)) {
    const pl = JSON.parse(p.payload)
    const code = S.db.prepare('SELECT code FROM achievements WHERE title = ?').get(pl.title)?.code
    const got = ledger(id).find(x => x.reason === 'achievement' && x.ref === code)?.amount ?? 0
    assert.equal(pl.coil, got, `окно «${pl.title}» показывает не то, что начислено`)
  }
  balanceMatches(id)

  // Срезанное не начисляется повторно: тот же вкус и та же тренировка ещё раз — 0
  const again = await answer(cookie, quizFlavors(1)[0])
  assert.equal(again.json.gained.coil, 0)
  const rows = ledger(id).length
  const fin2 = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: {} })
  assert.equal(fin2.json.gained?.coil ?? 0, 0)
  const keys = ledger(id).map(r => `${r.reason}|${r.ref}`)
  assert.equal(new Set(keys).size, keys.length, 'одна награда записана дважды')
  assert.ok(ledger(id).length >= rows)
  balanceMatches(id)
})

test('ручная награда админа в первый день начисляется полностью и не съедает лимит', async () => {
  const { id, cookie } = await newcomer('+79990000102')
  const a = S.db.prepare("SELECT id, coil FROM achievements WHERE kind = 'manual' AND coil > 0 ORDER BY sort LIMIT 1").get()
  assert.ok(a, 'нет ручного достижения с COIL')
  const g = await S.call('/api/admin/grant', { cookie: admin, method: 'POST', body: { user_id: id, achievement_id: a.id, reason: 'Помог на смене' } })
  assert.equal(g.status, 200, g.text)
  assert.equal(sumBy(id, 'achievement'), a.coil)
  // Лимит считается без ручной награды: тренировка всё ещё даёт COIL
  for (const f of quizFlavors(4)) await answer(cookie, f)
  const fin = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: {} })
  assert.equal(fin.status, 200)
  const capped = ledger(id).filter(r => !(r.reason === 'achievement')).reduce((s, r) => s + r.amount, 0)
  assert.equal(capped, 5 + 4 * 2 + 18 + 10, 'вход + ответы + тренировка в пределах 50 — без среза')
  balanceMatches(id)
})

test('на второй день бонусы идут как обычно', async () => {
  const { id, cookie } = await newcomer('+79990000103')
  // Первый день был вчера: сдвигаем его начисления на сутки назад
  S.db.prepare("UPDATE coil_tx SET created_at = datetime(created_at, '-1 day'), ref = ref || '-вчера' WHERE user_id = ?").run(id)
  for (const f of quizFlavors(5)) {
    const r = await answer(cookie, f)
    assert.equal(r.json.gained.coil, 2)
  }
  const fin = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: {} })
  assert.equal(fin.json.perfect, true)
  assert.equal(fin.json.gained.coil, 18 + 10)
  balanceMatches(id)
})

test('сотрудник с перенесённым балансом — не новичок', async () => {
  const uid = S.db.prepare("SELECT id FROM users WHERE phone = '+79107778899'").get().id
  assert.ok(S.db.prepare("SELECT amount FROM coil_tx WHERE user_id = ? AND reason = 'opening'").get(uid).amount > 0)
  const { cookie } = await S.login('+79107778899')
  for (const f of quizFlavors(5)) await answer(cookie, f)
  const fin = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: {} })
  assert.equal(fin.json.gained.coil, 18 + 10)
  balanceMatches(uid)
})
