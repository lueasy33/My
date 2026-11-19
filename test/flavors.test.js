// Тренажёр вкусов: COIL только за проверенные сервером ответы.
// Правило (утверждено Евгением, «как в коде»): +2 COIL за верный ответ (раз в день на вкус),
// +18 за первую тренировку дня, +10 за тренировку без ошибок (от 5 ответов).

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer } from './helpers.js'

let S
before(async () => { S = await startServer() })
after(() => S?.stop())

const quizFlavors = (n) => S.db.prepare(`SELECT f.id FROM flavors f JOIN flavor_brands b ON b.id = f.brand_id
  WHERE f.published = 1 AND b.published = 1 AND f.in_quiz = 1 ORDER BY f.id LIMIT ?`).all(n).map(r => r.id)
const userId = (phone) => S.db.prepare('SELECT id FROM users WHERE phone = ?').get(phone).id
const coilBy = (uid, reason) => S.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM coil_tx WHERE user_id = ? AND reason = ?').get(uid, reason).s
// Для вопроса «Какой это вкус?» правильный вариант — id самого вкуса
const answer = (cookie, flavor_id, right = true, retry = false) => S.call('/api/flavors/answer', {
  cookie, method: 'POST', body: { flavor_id, type: 'name', choice: right ? flavor_id : -1, retry }
})

test('подделка: присланные 5/5 без ответов не дают ни COIL, ни XP', async () => {
  const phone = '+79109990011'
  const { cookie } = await S.login(phone)
  const uid = userId(phone)
  const r = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: { correct: 5, total: 5 } })
  assert.equal(r.status, 200)
  assert.deepEqual(r.json.gained, { xp: 0, coil: 0 })
  assert.equal(r.json.perfect, false)
  assert.equal(coilBy(uid, 'flavor_train') + coilBy(uid, 'flavor_perfect'), 0)
  assert.equal(S.db.prepare('SELECT COUNT(*) c FROM flavor_sessions WHERE user_id = ?').get(uid).c, 0, 'пустая тренировка записалась')
})

test('верный ответ +2 COIL один раз в день на вкус, неверный — 0', async () => {
  const phone = '+79108889900'
  const { cookie } = await S.login(phone)
  const [f1, f2] = quizFlavors(2)
  const ok = await answer(cookie, f1)
  assert.equal(ok.status, 200)
  assert.equal(ok.json.correct, true)
  assert.equal(ok.json.gained.coil, 2)
  assert.equal((await answer(cookie, f1)).json.gained.coil, 0, 'второй раз за день за тот же вкус')
  const bad = await answer(cookie, f2, false)
  assert.equal(bad.json.correct, false)
  assert.equal(bad.json.gained.coil, 0)
})

test('итог тренировки считает сервер: ошибка — без бонуса «без ошибок», цифры браузера игнорируются', async () => {
  const phone = '+79107778899'
  const { cookie } = await S.login(phone)
  const uid = userId(phone)
  const ids = quizFlavors(5)
  for (const id of ids.slice(0, 4)) await answer(cookie, id)
  await answer(cookie, ids[4], false)
  await answer(cookie, ids[4], true, true) // повтор ошибки не превращает тренировку в идеальную
  const r = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: { correct: 5, total: 5 } })
  assert.equal(r.status, 200)
  assert.equal(r.json.total, 5)
  assert.equal(r.json.correct, 4)
  assert.equal(r.json.perfect, false)
  assert.equal(r.json.gained.coil, 18)
  assert.equal(coilBy(uid, 'flavor_perfect'), 0)
  const s = S.db.prepare('SELECT correct, total FROM flavor_sessions WHERE user_id = ?').get(uid)
  assert.deepEqual({ ...s }, { correct: 4, total: 5 })
})

test('тренировка без ошибок: +18 и +10, бонусы раз в день, ответы не считаются дважды', async () => {
  const phone = '+79106667788'
  const { cookie } = await S.login(phone)
  const uid = userId(phone)
  for (const id of quizFlavors(5)) await answer(cookie, id)
  const r = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: {} })
  assert.equal(r.json.total, 5)
  assert.equal(r.json.perfect, true)
  assert.equal(r.json.gained.coil, 18 + 10)
  // Повторное завершение без новых ответов — пусто
  const again = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: { correct: 9, total: 9 } })
  assert.equal(again.json.total, 0)
  assert.deepEqual(again.json.gained, { xp: 0, coil: 0 })
  // Вторая тренировка за день — бонусы уже получены
  for (const id of quizFlavors(5)) await answer(cookie, id)
  const second = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: {} })
  assert.equal(second.json.total, 5)
  assert.equal(second.json.gained.coil, 0)
  assert.equal(coilBy(uid, 'flavor_train'), 18)
  assert.equal(coilBy(uid, 'flavor_perfect'), 10)
})

test('новичок: 4 верных ответа (вся первая тренировка) — бонус «без ошибок» есть', async () => {
  const phone = '+79104445566'
  const { cookie } = await S.login(phone)
  for (const id of quizFlavors(4)) await answer(cookie, id)
  const r = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: {} })
  assert.equal(r.json.total, 4)
  assert.equal(r.json.perfect, true)
  assert.equal(r.json.gained.coil, 18 + 10)
  assert.equal(coilBy(userId(phone), 'flavor_perfect'), 10)
})

test('3 верных ответа — мало для бонуса «без ошибок», только +18 за тренировку', async () => {
  const phone = '+79102223344'
  const { cookie } = await S.login(phone)
  for (const id of quizFlavors(3)) await answer(cookie, id)
  const r = await S.call('/api/flavors/session/finish', { cookie, method: 'POST', body: {} })
  assert.equal(r.json.total, 3)
  assert.equal(r.json.perfect, false)
  assert.equal(r.json.gained.coil, 18)
  assert.equal(coilBy(userId(phone), 'flavor_perfect'), 0)
})

test('скрытый вкус не принимается', async () => {
  const { cookie } = await S.login('+79105556677')
  const [id] = quizFlavors(1)
  S.db.prepare('UPDATE flavors SET published = 0 WHERE id = ?').run(id)
  try {
    const r = await answer(cookie, id)
    assert.equal(r.status, 404)
  } finally {
    S.db.prepare('UPDATE flavors SET published = 1 WHERE id = ?').run(id)
  }
})
