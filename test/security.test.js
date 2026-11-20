// Автотесты безопасности: чужие данные не утекают, роли и вход защищены.
// Запуск: npm test

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, makeToken, root, DEMO_PASSWORD } from './helpers.js'

const ADMIN = '+79101234567'
const EMPLOYEE = '+79103334455'     // Алексей, филиал №1
const OTHER = '+79105556677'        // Анна, филиал №2
const LIMIT_VICTIM = '+79108889900' // Тимур — на нём проверяем лимит входа

let S // сайт открыт напрямую (настройки по умолчанию)
let P // сайт «за прокси»: прокси на этом же компьютере, ему разрешено передавать адрес клиента
before(async () => {
  [S, P] = await Promise.all([startServer(), startServer({ TRUST_PROXY: '127.0.0.1' })])
})
after(async () => { await S?.stop(); await P?.stop() })

// Курс только для филиала Анны: урок с тестом. Алексей (другой филиал) не должен его видеть.
function makeBranchCourse() {
  const branch = S.db.prepare('SELECT branch_id FROM users WHERE phone = ?').get(OTHER).branch_id
  const course = S.db.prepare("INSERT INTO courses(title, branch_id, published) VALUES ('Только филиал 2', ?, 1)").run(branch).lastInsertRowid
  const lesson = S.db.prepare("INSERT INTO lessons(course_id, title, sort, published) VALUES (?, 'Секретный урок', 1, 1)").run(course).lastInsertRowid
  S.db.prepare("INSERT INTO blocks(lesson_id, type, content) VALUES (?, 'text', '{\"text\":\"секрет\"}')").run(lesson)
  const t = S.db.prepare('INSERT INTO tests(lesson_id) VALUES (?)').run(lesson).lastInsertRowid
  S.db.prepare("INSERT INTO questions(test_id, type, prompt, options, correct) VALUES (?, 'single', 'Вопрос', '[\"а\",\"б\"]', '[1]')").run(t)
  return { course: Number(course), lesson: Number(lesson), test: Number(t) }
}

// Все маршруты, закрытые для сотрудника: берём прямо из исходников, чтобы новый
// маршрут админки автоматически попадал под проверку.
function adminRoutes() {
  const src = readFileSync(join(root, 'server', 'routes', 'admin.js'), 'utf8')
  const list = [...src.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)]
    .map(m => ({ method: m[1].toUpperCase(), path: m[2].replace(/:[a-zA-Z_]+/g, '1') }))
  list.push({ method: 'GET', path: '/api/analytics' }, { method: 'GET', path: '/api/analytics/export' })
  return list
}

test('все маршруты админки: без входа 401, сотруднику 403', async () => {
  const routes = adminRoutes()
  assert.ok(routes.length >= 40, `нашлось мало маршрутов админки: ${routes.length}`)
  const { cookie } = await S.login(EMPLOYEE)
  const leaks = []
  for (const r of routes) {
    const body = r.method === 'GET' || r.method === 'DELETE' ? undefined : {}
    const anon = await S.call(r.path, { method: r.method, body })
    const emp = await S.call(r.path, { method: r.method, body, cookie })
    if (anon.status !== 401 || emp.status !== 403) leaks.push(`${r.method} ${r.path}: без входа ${anon.status}, сотрудник ${emp.status}`)
  }
  assert.deepEqual(leaks, [])
})

test('курс чужого филиала не виден и не сдаётся', async () => {
  const B = makeBranchCourse()
  const { cookie } = await S.login(EMPLOYEE)
  const lib = await S.call('/api/library', { cookie })
  assert.equal(lib.status, 200)
  assert.ok(!lib.json.courses.some(c => c.id === B.course), 'чужой курс в библиотеке')
  assert.equal((await S.call(`/api/course/${B.course}`, { cookie })).status, 404)
  const lesson = await S.call(`/api/lesson/${B.lesson}`, { cookie })
  assert.equal(lesson.status, 404)
  assert.ok(!lesson.text.includes('секрет'), 'текст чужого урока утёк')
  assert.equal((await S.call(`/api/lesson/${B.lesson}/complete`, { cookie, method: 'POST', body: {} })).status, 404)
  assert.equal((await S.call(`/api/test/${B.test}/attempt`, { cookie, method: 'POST', body: { answers: {} } })).status, 404)

  // А своему филиалу — виден
  const own = await S.login(OTHER)
  assert.equal((await S.call(`/api/course/${B.course}`, { cookie: own.cookie })).status, 200)
})

test('урок по порядку: следующий закрыт, пока не сдан предыдущий', async () => {
  const row = S.db.prepare(`
    SELECT l.id FROM lessons l JOIN courses c ON c.id = l.course_id
    WHERE c.published = 1 AND c.branch_id IS NULL AND l.published = 1
      AND l.sort > (SELECT MIN(sort) FROM lessons WHERE course_id = l.course_id AND published = 1)
    ORDER BY c.id, l.sort LIMIT 1`).get()
  const { cookie } = await S.login('+79109990011') // Виктория — ещё ничего не проходила
  const r = await S.call(`/api/lesson/${row.id}`, { cookie })
  assert.equal(r.status, 403)
})

test('ответы теста не уходят в браузер до сдачи', async () => {
  const { cookie } = await S.login(EMPLOYEE)
  const lessons = S.db.prepare(`
    SELECT l.id FROM lessons l JOIN tests t ON t.lesson_id = l.id JOIN courses c ON c.id = l.course_id
    WHERE c.published = 1 AND c.branch_id IS NULL AND l.published = 1`).all()
  assert.ok(lessons.length > 0)
  let checked = 0
  for (const l of lessons) {
    const r = await S.call(`/api/lesson/${l.id}`, { cookie })
    if (r.status !== 200) continue // закрыт по порядку — тоже ничего не отдаёт
    checked++
    for (const q of r.json.test?.questions || []) {
      assert.ok(!('correct' in q), `урок ${l.id}: правильный ответ в вопросе`)
      assert.ok(!('explanation' in q), `урок ${l.id}: пояснение до сдачи`)
    }
  }
  assert.ok(checked > 0, 'ни один урок не открылся')
})

test('чужие телефоны и хэши паролей не видны сотруднику', async () => {
  const { cookie } = await S.login(EMPLOYEE)
  const phones = S.db.prepare('SELECT phone FROM users WHERE phone != ?').all(EMPLOYEE).map(r => r.phone)
  const pages = [
    '/api/ranking', '/api/ranking?scope=branch', '/api/ranking?scope=branches',
    '/api/ranking?period=week', '/api/profile', '/api/dashboard', '/api/me'
  ]
  for (const p of pages) {
    const r = await S.call(p, { cookie })
    assert.equal(r.status, 200, p)
    assert.ok(!/password_hash|scrypt\$/i.test(r.text), `${p}: хэш пароля в ответе`)
    for (const ph of phones) {
      assert.ok(!r.text.includes(ph) && !r.text.includes(ph.slice(2)), `${p}: чужой телефон ${ph}`)
    }
  }
  // Ответ входа тоже без хэша
  const l = await S.login(EMPLOYEE)
  assert.ok(!/password_hash|scrypt\$/.test(l.text))
})

test('лимит входа: после 5 ошибок блок даже с верным паролем', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await S.login(LIMIT_VICTIM, 'неверный-' + i)
    assert.equal(r.status, 401)
    assert.equal(r.json.error, 'Неверный номер или пароль', 'подсказка, что именно неверно')
  }
  const blocked = await S.login(LIMIT_VICTIM)
  assert.equal(blocked.status, 429)
  assert.equal(blocked.cookie, '')
})

test('прямое подключение: подставной X-Forwarded-For и X-Forwarded-Proto не принимаются', async () => {
  const phone = '+79104445566' // в других проверках этого файла не участвует
  // Каждая попытка «с нового адреса» — раньше это обходило лимит 5 ошибок по адресу
  for (let i = 0; i < 5; i++) {
    const r = await S.call('/api/auth/login', {
      method: 'POST', body: { phone, password: 'неверный-' + i }, headers: { 'x-forwarded-for': `203.0.113.${i + 1}` }
    })
    assert.equal(r.status, 401, `попытка ${i + 1}`)
  }
  const blocked = await S.call('/api/auth/login', {
    method: 'POST', body: { phone, password: DEMO_PASSWORD }, headers: { 'x-forwarded-for': '203.0.113.99' }
  })
  assert.equal(blocked.status, 429, 'подставной адрес обошёл лимит входа')

  // Подставной «https» не выдаёт себя за защищённое соединение
  const r = await S.call('/api/auth/login', {
    method: 'POST', body: { phone: '+79102223344', password: DEMO_PASSWORD }, headers: { 'x-forwarded-proto': 'https' }
  })
  assert.equal(r.status, 200)
  assert.doesNotMatch(r.headers.get('set-cookie') || '', /Secure/i)
  assert.equal(r.headers.get('strict-transport-security'), null)
})

test('за своим прокси: адрес клиента и https от прокси принимаются', async () => {
  const r = await P.call('/api/auth/login', {
    method: 'POST', body: { phone: '+79102223344', password: DEMO_PASSWORD }, headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.7' }
  })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('set-cookie') || '', /Secure/i, 'за HTTPS-прокси cookie должна быть Secure')
  assert.ok(r.headers.get('strict-transport-security'), 'за HTTPS-прокси нужен HSTS')
})

test('лимит по номеру: 10 ошибок с разных адресов → номер закрыт для всех адресов', async () => {
  const phone = '+79106667788' // в других проверках этого файла не участвует
  // Разные адреса клиентов реально бывают только за прокси — поэтому сервер P
  const from = (ip, password) => P.call('/api/auth/login', {
    method: 'POST', body: { phone, password }, headers: { 'x-forwarded-for': ip }
  })
  for (let i = 0; i < 10; i++) {
    const r = await from(`10.0.0.${i + 1}`, 'неверный-' + i)
    assert.equal(r.status, 401, `попытка ${i + 1}`)
  }
  // 11-я с нового адреса и с верным паролем — всё равно закрыто
  const blocked = await from('10.0.1.1', DEMO_PASSWORD)
  assert.equal(blocked.status, 429)
  assert.match(blocked.json.error, /Слишком много попыток\. Повтори через \d+ мин\./)
  assert.equal(blocked.headers.get('set-cookie'), null)
  // Другой номер с того же адреса не задет
  const other = await P.call('/api/auth/login', {
    method: 'POST', body: { phone: '+79101112233', password: DEMO_PASSWORD }, headers: { 'x-forwarded-for': '10.0.1.1' }
  })
  assert.equal(other.status, 200)
})

test('успешный вход сбрасывает счётчик по номеру', async () => {
  const phone = '+79107778899'
  const from = (ip, password) => P.call('/api/auth/login', {
    method: 'POST', body: { phone, password }, headers: { 'x-forwarded-for': ip }
  })
  for (let i = 0; i < 9; i++) assert.equal((await from(`10.1.0.${i + 1}`, 'нет-' + i)).status, 401)
  assert.equal((await from('10.1.1.1', DEMO_PASSWORD)).status, 200)
  // После успеха счёт с нуля: ещё 9 ошибок не закрывают номер
  for (let i = 0; i < 9; i++) assert.equal((await from(`10.1.2.${i + 1}`, 'нет-' + i)).status, 401)
  assert.equal((await from('10.1.3.1', DEMO_PASSWORD)).status, 200)
})

test('несуществующий номер — тот же ответ, что и неверный пароль', async () => {
  const r = await S.login('+79990000000', 'что-угодно')
  assert.equal(r.status, 401)
  assert.equal(r.json.error, 'Неверный номер или пароль')
})

test('поддельная или просроченная cookie не пускает', async () => {
  const admin = S.db.prepare('SELECT id FROM users WHERE phone = ?').get(ADMIN).id
  const future = Date.now() + 3600_000
  // Санити-проверка: правильно подписанный токен работает — значит, ниже проверяем именно подпись
  assert.equal((await S.call('/api/me', { cookie: makeToken({ uid: admin, exp: future }) })).status, 200)

  const bad = {
    'чужой секрет': makeToken({ uid: admin, exp: future }, 'y'.repeat(64)),
    'просрочена': makeToken({ uid: admin, exp: Date.now() - 1000 }),
    'без срока': makeToken({ uid: admin }),
    'мусор': 'aladdin_session=abc.def',
    'пустая подпись': 'aladdin_session=' + Buffer.from(JSON.stringify({ uid: admin, exp: future })).toString('base64url') + '.'
  }
  // Подмена uid в чужой настоящей cookie: подпись больше не сходится
  const emp = await S.login(EMPLOYEE)
  const [, sig] = emp.cookie.split('=')[1].split('.')
  bad['подменён uid'] = 'aladdin_session=' + Buffer.from(JSON.stringify({ uid: admin, exp: future })).toString('base64url') + '.' + sig

  for (const [name, cookie] of Object.entries(bad)) {
    assert.equal((await S.call('/api/me', { cookie })).status, 401, name)
    assert.equal((await S.call('/api/admin/overview', { cookie })).status, 401, name)
  }
})

test('заблокированный сотрудник выкидывается сразу', async () => {
  const { cookie } = await S.login(OTHER)
  assert.equal((await S.call('/api/me', { cookie })).status, 200)
  S.db.prepare("UPDATE users SET status = 'blocked' WHERE phone = ?").run(OTHER)
  try {
    assert.equal((await S.call('/api/me', { cookie })).status, 401)
    assert.equal((await S.login(OTHER)).status, 401)
  } finally {
    S.db.prepare("UPDATE users SET status = 'active' WHERE phone = ?").run(OTHER)
  }
})

test('SQL-подстановки в полях не ломают запросы', async () => {
  const inj = "' OR 1=1 --"
  const r = await S.login(inj, inj)
  assert.equal(r.status, 401)
  const { cookie } = await S.login(EMPLOYEE)
  for (const p of [
    `/api/ranking?scope=${encodeURIComponent(inj)}&period=${encodeURIComponent(inj)}`,
    `/api/library?filter=${encodeURIComponent(inj)}`,
    `/api/lesson/${encodeURIComponent('1 OR 1=1')}`
  ]) {
    const x = await S.call(p, { cookie })
    assert.ok(x.status < 500, `${p}: ${x.status}`)
  }
  assert.equal(S.db.prepare('SELECT COUNT(*) c FROM users').get().c, 10, 'таблица пользователей изменилась')
})

test('защитные заголовки на ответах API', async () => {
  const r = await S.call('/api/health')
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN')
  assert.equal(r.headers.get('cache-control'), 'no-store')
  const l = await S.login(EMPLOYEE)
  const sc = l.headers.get('set-cookie') || ''
  assert.match(sc, /HttpOnly/i)
  assert.match(sc, /SameSite=Lax/i)
})

test('в репозитории нет секретов и базы', () => {
  // data/ и .env не должны попадать в git
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8')
  assert.match(ignore, /^data\/$/m)
  assert.match(ignore, /^\.env$/m)
  // В коде сервера нет вшитого секрета сессий и ключей push
  for (const f of readdirSync(join(root, 'server'))) {
    if (!f.endsWith('.js')) continue
    const src = readFileSync(join(root, 'server', f), 'utf8')
    assert.ok(!/SESSION_SECRET\s*=\s*['"`]/.test(src), `${f}: секрет сессии в коде`)
    assert.ok(!/privateKey\s*:\s*['"`][A-Za-z0-9_-]{20,}/.test(src), `${f}: ключ push в коде`)
  }
})

// ─── Решения 19.11.2026: ответы после сдачи, ссылки в уроках, CSP ────────────

function makeOwnCourseWithTest() {
  const branch = S.db.prepare('SELECT branch_id FROM users WHERE phone = ?').get(EMPLOYEE).branch_id
  const course = S.db.prepare("INSERT INTO courses(title, branch_id, published) VALUES ('Свой курс для проверок', ?, 1)").run(branch).lastInsertRowid
  const lesson = S.db.prepare("INSERT INTO lessons(course_id, title, sort, published) VALUES (?, 'Урок для проверок', 1, 1)").run(course).lastInsertRowid
  S.db.prepare("INSERT INTO blocks(lesson_id, type, content) VALUES (?, 'text', '{\"text\":\"текст\"}')").run(lesson)
  const t = S.db.prepare('INSERT INTO tests(lesson_id, show_answers) VALUES (?, 1)').run(lesson).lastInsertRowid
  const q = S.db.prepare("INSERT INTO questions(test_id, type, prompt, options, correct, explanation) VALUES (?, 'single', 'Вопрос', '[\"а\",\"б\"]', '[1]', 'Потому что б')").run(t).lastInsertRowid
  return { course: Number(course), lesson: Number(lesson), test: Number(t), question: Number(q) }
}

test('при провале сервер не присылает правильные ответы и пояснения', async () => {
  const L = makeOwnCourseWithTest()
  const { cookie } = await S.login(EMPLOYEE)
  const r = await S.call(`/api/test/${L.test}/attempt`, { cookie, method: 'POST', body: { answers: { [L.question]: [0] } } })
  assert.equal(r.status, 200)
  assert.equal(r.json.attempt.passed, false)
  const item = r.json.review.find(x => x.id === L.question)
  assert.equal(item.ok, false)
  assert.ok(!('correct' in item) || item.correct === null, 'правильный ответ утёк при провале')
  assert.equal(item.explanation || '', '', 'пояснение утекло при провале')
})

test('после успешной сдачи ответы и пояснения показываются', async () => {
  const L = makeOwnCourseWithTest()
  const { cookie } = await S.login(EMPLOYEE)
  const r = await S.call(`/api/test/${L.test}/attempt`, { cookie, method: 'POST', body: { answers: { [L.question]: [1] } } })
  assert.equal(r.status, 200)
  assert.equal(r.json.attempt.passed, true)
  const item = r.json.review.find(x => x.id === L.question)
  assert.deepEqual(item.correct, [1])
  assert.equal(item.explanation, 'Потому что б')
})

test('ссылка javascript: в уроке не сохраняется', async () => {
  const L = makeOwnCourseWithTest()
  const adm = await S.login(ADMIN)
  const bad = await S.call(`/api/admin/lessons/${L.lesson}/blocks`, { cookie: adm.cookie, method: 'PUT', body: { blocks: [{ type: 'file', content: { href: 'javascript:alert(1)', name: 'x.pdf' } }] } })
  assert.equal(bad.status, 400)
  const good = await S.call(`/api/admin/lessons/${L.lesson}/blocks`, { cookie: adm.cookie, method: 'PUT', body: { blocks: [{ type: 'file', content: { href: '/uploads/x.pdf', name: 'x.pdf' } }] } })
  assert.equal(good.status, 200)
})

test('ссылки «//сайт» и «/\\сайт» (уводят на чужой сайт) не сохраняются, пути и https — сохраняются', async () => {
  const L = makeOwnCourseWithTest()
  const adm = await S.login(ADMIN)
  const save = (type, field, url) => S.call(`/api/admin/lessons/${L.lesson}/blocks`, {
    cookie: adm.cookie, method: 'PUT', body: { blocks: [{ type, content: { [field]: url, name: 'x' } }] }
  })
  for (const url of ['/\\evil.example', '/\\\\evil.example', '//evil.example', ' /\\evil.example', 'data:text/html,x', 'https:\\\\evil.example']) {
    for (const [type, field] of [['file', 'href'], ['photo', 'src'], ['video', 'src']]) {
      assert.equal((await save(type, field, url)).status, 400, `${type}.${field} = ${url}`)
    }
  }
  for (const url of ['/uploads/a.pdf', '/course/1', 'https://example.com/a\\b.pdf', 'http://example.com/x']) {
    assert.equal((await save('file', 'href', url)).status, 200, url)
  }
})

test('CSP-заголовок закрывает чужие скрипты', async () => {
  const r = await S.call('/')
  const csp = r.headers.get('content-security-policy') || ''
  assert.ok(/default-src 'self'/.test(csp), 'нет default-src в CSP')
  assert.ok(/script-src 'self'/.test(csp), 'нет script-src в CSP')
  assert.ok(!/unsafe-eval/.test(csp), 'в CSP разрешён eval')
  assert.ok(/frame-ancestors 'self'/.test(csp), 'нет frame-ancestors')
})
