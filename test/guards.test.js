// Сброс входов при смене пароля/блокировке и защита базы от случайного стирания.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer, makeToken, root, DEMO_PASSWORD } from './helpers.js'

const ADMIN = '+79101234567'
let S
before(async () => { S = await startServer() })
after(() => S?.stop())

const uidOf = (phone) => S.db.prepare('SELECT id FROM users WHERE phone = ?').get(phone).id
const me = (cookie) => S.call('/api/me', { cookie }).then(r => r.status)

test('сотрудник сменил пароль: другие телефоны выкинуты, этот остаётся', async () => {
  const phone = '+79104445566'
  const phoneA = await S.login(phone) // его телефон
  const phoneB = await S.login(phone) // «украденный» вход
  assert.equal(await me(phoneB.cookie), 200)

  const r = await S.call('/api/me/password', { cookie: phoneA.cookie, method: 'POST', body: { current: DEMO_PASSWORD, next: 'новый-пароль-1' } })
  assert.equal(r.status, 200)
  const fresh = (r.headers.get('set-cookie') || '').split(';')[0]
  assert.ok(fresh, 'новый вход для этого телефона не выдан')

  assert.equal(await me(phoneB.cookie), 401, 'старый вход на другом телефоне жив')
  assert.equal(await me(phoneA.cookie), 401, 'старая cookie этого телефона должна смениться новой')
  assert.equal(await me(fresh), 200)
  assert.equal((await S.login(phone)).status, 401, 'старый пароль ещё работает')
  assert.equal((await S.login(phone, 'новый-пароль-1')).status, 200)
})

test('админ сменил пароль сотруднику — его старые входы недействительны', async () => {
  const phone = '+79102223344'
  const emp = await S.login(phone)
  const adm = await S.login(ADMIN)
  const r = await S.call(`/api/admin/users/${uidOf(phone)}`, { cookie: adm.cookie, method: 'PATCH', body: { password: 'выдан-админом' } })
  assert.equal(r.status, 200)
  assert.equal(await me(emp.cookie), 401)
  assert.equal(await me(adm.cookie), 200, 'админа выкинуло вместе с сотрудником')
})

test('блокировка и разблокировка не оживляют старый вход', async () => {
  const phone = '+79101112233'
  const emp = await S.login(phone)
  const adm = await S.login(ADMIN)
  const id = uidOf(phone)
  assert.equal((await S.call(`/api/admin/users/${id}`, { cookie: adm.cookie, method: 'PATCH', body: { status: 'blocked' } })).status, 200)
  assert.equal(await me(emp.cookie), 401)
  assert.equal((await S.call(`/api/admin/users/${id}`, { cookie: adm.cookie, method: 'PATCH', body: { status: 'active' } })).status, 200)
  assert.equal(await me(emp.cookie), 401, 'после разблокировки старая cookie снова пустила')
  assert.equal((await S.login(phone)).status, 200, 'после разблокировки не войти заново')
})

test('cookie, выданные до обновления (без номера версии), продолжают работать', async () => {
  const id = uidOf('+79105556677')
  const v = S.db.prepare('SELECT session_version v FROM users WHERE id = ?').get(id).v
  assert.equal(v, 0)
  assert.equal(await me(makeToken({ uid: id, exp: Date.now() + 3600_000 })), 200)
})

test('seed и reset не стирают базу с людьми без FORCE=1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aladdin-guard-'))
  const env = { ...process.env, DB_PATH: join(dir, 'g.db'), SESSION_SECRET: 'x'.repeat(64), FORCE: '' }
  const run = (script, extra = {}) => spawnSync(process.execPath, [`server/${script}`], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' })
  try {
    assert.equal(run('seed.js').status, 0, 'первый запуск на пустой базе должен работать (как в start.bat)')
    const again = run('seed.js')
    assert.equal(again.status, 1)
    assert.match(again.stdout, /ОСТАНОВЛЕНО/)
    const reset = run('reset.js')
    assert.equal(reset.status, 1)
    assert.ok(existsSync(env.DB_PATH), 'reset удалил базу без FORCE')
    // «set FORCE=1 && …» в Windows даёт значение с пробелом — тоже должно работать
    assert.equal(run('seed.js', { FORCE: '1 ' }).status, 0)
    assert.equal(run('reset.js', { FORCE: '1' }).status, 0)
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* Windows может держать файл */ }
  }
})
