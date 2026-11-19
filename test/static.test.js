// Раздача сайта и файлов: страницы, сборка, загрузки админа, перемотка видео (Range).
// Нужна сборка интерфейса (npm run build); без неё проверки страниц пропускаются.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, root } from './helpers.js'

const built = existsSync(join(root, 'build', 'index.html'))
let S
before(async () => { S = await startServer() })
after(() => S?.stop())

test('главная, внутренние адреса и сборка отдаются', { skip: !built && 'нет build/ — сначала npm run build' }, async () => {
  const home = await fetch(S.base + '/')
  assert.equal(home.status, 200)
  assert.match(await home.text(), /<div id="root">/)
  assert.equal(home.headers.get('cache-control'), 'no-cache', 'index.html не должен кэшироваться')
  for (const p of ['/sw.js']) {
    if (!existsSync(join(root, 'build', p.slice(1)))) continue
    const sw = await fetch(S.base + p)
    assert.equal(sw.status, 200, p)
    assert.equal(sw.headers.get('cache-control'), 'no-cache', p)
  }
  // Внутренний адрес приложения открывается напрямую (обновление страницы на телефоне)
  const deep = await fetch(S.base + '/course/1')
  assert.equal(deep.status, 200)
  assert.match(deep.headers.get('content-type'), /text\/html/)
  const js = readdirSync(join(root, 'build', 'assets')).find(f => f.endsWith('.js'))
  const asset = await fetch(S.base + '/assets/' + js)
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-type'), /javascript/)
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=2592000')
  const mf = await fetch(S.base + '/manifest.webmanifest')
  assert.equal(mf.status, 200)
})

test('неизвестный адрес API — 404 в JSON, а не страница', async () => {
  const r = await S.call('/api/nichego-net')
  assert.equal(r.status, 404)
  assert.equal(r.json.error, 'Не найдено')
})

test('выход за пределы папки загрузок закрыт', async () => {
  for (const p of ['/uploads/..%2fserver%2findex.js', '/uploads/../server/index.js', '/uploads/%2e%2e/data/session-secret', '/..%2f..%2fpackage.json']) {
    const r = await fetch(S.base + p)
    const text = await r.text()
    assert.ok(!text.includes('import Fastify') && !text.includes('"dependencies"'), `утечка файла по ${p}`)
  }
})

test('админ загружает файл, он отдаётся с перемоткой; чужой тип отклоняется', async () => {
  const { cookie } = await S.login('+79101234567')
  const content = 'x'.repeat(1000)
  const form = new FormData()
  form.append('file', new Blob([content], { type: 'text/plain' }), 'памятка.txt')
  const up = await fetch(S.base + '/api/admin/upload', { method: 'POST', headers: { cookie }, body: form })
  assert.equal(up.status, 200)
  const info = await up.json()
  assert.equal(info.kind, 'file')
  assert.match(info.url, /^\/uploads\/[a-z0-9]+-[0-9a-f]{12}\.txt$/, 'имя файла должно быть случайным')

  const part = await fetch(S.base + info.url, { headers: { range: 'bytes=0-99' } })
  assert.equal(part.status, 206)
  assert.equal((await part.text()).length, 100)

  const bad = new FormData()
  bad.append('file', new Blob(['<script>'], { type: 'text/html' }), 'vzlom.html')
  const no = await fetch(S.base + '/api/admin/upload', { method: 'POST', headers: { cookie }, body: bad })
  assert.equal(no.status, 400)
})
