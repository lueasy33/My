// Дедлайны от даты приёма (решение Евгения 20.11.2026): урок «через N дней после приёма».
// Пустая дата приёма = день, когда завели аккаунт, — новичок в первый день не «опаздывает».

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer } from './helpers.js'

let S, admin
before(async () => {
  S = await startServer()
  admin = (await S.login('+79101234567')).cookie
})
after(() => S?.stop())

const PASS = 'srok-ot-priema-2026'
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
const plusDays = (day, n) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10)

async function employee(phone, hired_at) {
  const branch_id = S.db.prepare('SELECT MIN(id) id FROM branches').get().id
  const r = await S.call('/api/admin/users', { cookie: admin, method: 'POST', body: { name: 'Срок ' + phone.slice(-2), phone, password: PASS, role: 'employee', branch_id, hired_at } })
  assert.equal(r.status, 200, r.text)
  return { id: r.json.id, cookie: (await S.login(phone, PASS)).cookie }
}

test('новичок без даты приёма: дедлайны считаются от сегодня, ни одного «сегодня» и просрочек', async () => {
  const { cookie } = await employee('+79990000301', '')
  const r = await S.call('/api/dashboard', { cookie })
  assert.equal(r.status, 200, r.text)
  assert.ok(r.json.deadlines.length > 0, 'в демо-курсах есть дедлайны')
  for (const d of r.json.deadlines) assert.ok(d.days_left >= 1, `${d.title}: ${d.days_left} дн.`)
  // Урок 1 курса «Основы кальяна» — 5 дней от приёма
  const l1 = S.db.prepare("SELECT id, deadline_days FROM lessons WHERE title = 'Устройство кальяна'").get()
  const d1 = r.json.deadlines.find(d => d.id === l1.id)
  assert.equal(d1.deadline, plusDays(TODAY, l1.deadline_days))
})

test('принят 30 дней назад: тот же урок уже просрочен и виден админу в «Просрочках»', async () => {
  const hired = plusDays(TODAY, -30)
  const { id, cookie } = await employee('+79990000302', hired)
  const lib = await S.call('/api/library?filter=overdue', { cookie })
  assert.equal(lib.status, 200, lib.text)
  assert.ok(lib.json.courses.length > 0 && lib.json.courses.every(c => c.days_left < 0), 'есть просроченный курс')
  const att = await S.call('/api/admin/attention', { cookie: admin })
  const mine = att.json.rows.filter(x => x.user_id === id)
  assert.ok(mine.length > 0, 'просрочки сотрудника есть у админа')
  for (const x of mine) assert.ok(x.days_overdue > 0)
})

test('админ задаёт срок в днях — общая дата урока стирается; мусор не принимается', async () => {
  const l = S.db.prepare("SELECT id FROM lessons WHERE title = 'Сборка и запуск'").get()
  let r = await S.call(`/api/admin/lessons/${l.id}`, { cookie: admin, method: 'PATCH', body: { deadline: '2030-01-01', deadline_days: 9 } })
  assert.equal(r.status, 200, r.text)
  let row = S.db.prepare('SELECT deadline, deadline_days FROM lessons WHERE id = ?').get(l.id)
  assert.equal(row.deadline_days, 9)
  assert.equal(row.deadline, null)
  r = await S.call(`/api/admin/lessons/${l.id}`, { cookie: admin, method: 'PATCH', body: { deadline_days: "-1' OR 1=1" } })
  assert.equal(r.status, 200, r.text)
  row = S.db.prepare('SELECT deadline_days FROM lessons WHERE id = ?').get(l.id)
  assert.equal(row.deadline_days, null)
  // Сотрудник менять срок не может
  const { cookie } = await employee('+79990000303', '')
  r = await S.call(`/api/admin/lessons/${l.id}`, { cookie, method: 'PATCH', body: { deadline_days: 1 } })
  assert.equal(r.status, 403)
})
