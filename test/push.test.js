// Push-уведомления (решение Евгения 20.11.2026 — проверить, что работают):
// подписка сохраняется, «Проверить» реально отправляет зашифрованный push с подписью VAPID,
// уведомление сайта встаёт в очередь, мёртвая подписка (410) удаляется сама.
// Вместо сервиса Google/Apple — свой HTTPS-сервер на 127.0.0.1 с временным сертификатом.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:https'
import { createECDH, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './helpers.js'

// Временный самоподписанный сертификат. Нет openssl — тест пропускается, а не падает.
const certDir = mkdtempSync(join(tmpdir(), 'aladdin-push-'))
const ssl = spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
  '-keyout', join(certDir, 'k.pem'), '-out', join(certDir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1'], { encoding: 'utf8' })
const skip = ssl.status !== 0 && 'нет openssl для временного сертификата'

let S, admin, fake, fakePort
const got = []
let answer = 201

before(async () => {
  if (skip) return
  fake = createServer({ key: readFileSync(join(certDir, 'k.pem')), cert: readFileSync(join(certDir, 'c.pem')) }, (req, res) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => { got.push({ method: req.method, url: req.url, headers: req.headers, size: Buffer.concat(chunks).length }); res.writeHead(answer); res.end() })
  })
  await new Promise(r => fake.listen(0, '127.0.0.1', r))
  fakePort = fake.address().port
  // Сервер приложения доверяет временному сертификату только в этом тесте
  S = await startServer({ NODE_TLS_REJECT_UNAUTHORIZED: '0' })
  admin = (await S.login('+79101234567')).cookie
})
after(async () => { fake?.close(); await S?.stop(); rmSync(certDir, { recursive: true, force: true }) })

const b64url = (buf) => Buffer.from(buf).toString('base64url')
function browserSubscription(path) {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys()
  return { endpoint: `https://127.0.0.1:${fakePort}${path}`, keys: { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(randomBytes(16)) } }
}
async function employee(phone) {
  const branch_id = S.db.prepare('SELECT MIN(id) id FROM branches').get().id
  const r = await S.call('/api/admin/users', { cookie: admin, method: 'POST', body: { name: 'Пуш ' + phone.slice(-2), phone, password: 'push-test-2026', role: 'employee', branch_id } })
  assert.equal(r.status, 200, r.text)
  return { id: r.json.id, cookie: (await S.login(phone, 'push-test-2026')).cookie }
}

test('подписка, проверочный push, очередь и удаление мёртвой подписки', { skip }, async () => {
  const { id, cookie } = await employee('+79990000401')
  const info = await S.call('/api/push', { cookie })
  assert.equal(info.status, 200)
  assert.ok(info.json.key && info.json.key.length > 40, 'сервер отдаёт публичный ключ VAPID')

  // Подписка только на https и с ключами браузера
  const bad = await S.call('/api/push/subscribe', { cookie, method: 'POST', body: { subscription: { endpoint: 'http://evil.example/x', keys: { p256dh: 'a', auth: 'b' } } } })
  assert.equal(bad.status, 400)
  const sub = browserSubscription('/push/dev-1')
  const ok = await S.call('/api/push/subscribe', { cookie, method: 'POST', body: { subscription: sub, device: 'Тест', tz: 'Europe/Moscow' } })
  assert.equal(ok.status, 200, ok.text)
  assert.equal(ok.json.devices.length, 1)

  // «Проверить уведомления» — push уходит сразу, зашифрованный и с подписью VAPID
  const t = await S.call('/api/push/test', { cookie, method: 'POST', body: {} })
  assert.equal(t.status, 200, t.text)
  assert.equal(t.json.sent, 1)
  const hit = got.at(-1)
  assert.equal(hit.method, 'POST')
  assert.equal(hit.url, '/push/dev-1')
  assert.equal(hit.headers['content-encoding'], 'aes128gcm')
  assert.match(hit.headers.authorization, /^vapid t=.+, k=.+/)
  assert.ok(hit.size > 0, 'есть зашифрованное тело')

  // Уведомление на сайте (ручная награда) встаёт в очередь push
  const g = await S.call('/api/admin/grant', { cookie: admin, method: 'POST', body: { user_id: id, theme: 'legend', reason: 'проверка push' } })
  assert.equal(g.status, 200, g.text)
  const q = S.db.prepare('SELECT payload FROM push_queue WHERE user_id = ?').all(id)
  assert.equal(q.length, 1)
  assert.equal(JSON.parse(q[0].payload).title, 'Открыта особая тема оформления')

  // Чужую подписку другой сотрудник отписать не может
  const other = await employee('+79990000402')
  await S.call('/api/push/unsubscribe', { cookie: other.cookie, method: 'POST', body: { endpoint: sub.endpoint } })
  assert.equal(S.db.prepare('SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?').get(id).c, 1)

  // Сервис push ответил 410 (приложение удалили) — подписка удаляется сама
  answer = 410
  const dead = await S.call('/api/push/test', { cookie, method: 'POST', body: {} })
  assert.equal(dead.status, 400)
  assert.equal(S.db.prepare('SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?').get(id).c, 0)
})
