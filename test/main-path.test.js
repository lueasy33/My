// Автотест главного пути: вход → урок → тест → COIL → рейтинг.
// Запуск: npm test
//
// Тест поднимает настоящий сервер на отдельной временной базе (демо-данные из seed),
// поэтому рабочая база в data/ не трогается. После прогона временная папка удаляется.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(join(tmpdir(), 'aladdin-test-'))
const port = 18000 + Math.floor(Math.random() * 1000)
const base = `http://127.0.0.1:${port}`
const env = {
  ...process.env,
  DB_PATH: join(dir, 'aladdin.db'),
  PORT: String(port),
  SESSION_SECRET: 'x'.repeat(64),
  BACKUPS: '0',
  REMINDERS: '0',
  LOG_LEVEL: 'error'
}

// Демо-доступ из seed.js (вымышленные люди)
const DEMO_PASSWORD = 'aladdin2026'
const NEW_EMPLOYEE = '+7 910 999-00-11' // Виктория — ещё ничего не проходила
const ADMIN = '+7 910 123-45-67'

let server
let db

before(async () => {
  const seed = spawnSync(process.execPath, ['server/seed.js'], { cwd: root, env, encoding: 'utf8' })
  assert.equal(seed.status, 0, 'seed упал: ' + seed.stderr)
  server = spawn(process.execPath, ['server/index.js'], { cwd: root, env, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/health')).ok) break } catch { /* ещё стартует */ }
    await new Promise(r => setTimeout(r, 100))
  }
  db = new DatabaseSync(env.DB_PATH)
})

after(() => {
  db?.close()
  server?.kill()
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* Windows может держать файл */ }
})

async function call(path, { cookie, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* не json */ }
  return { status: res.status, json, headers: res.headers }
}

async function login(phone, password = DEMO_PASSWORD) {
  const r = await call('/api/auth/login', { method: 'POST', body: { phone, password } })
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0]
  return { ...r, cookie }
}

// Тест урока: первый урок первого курса с тестом. Правильные ответы берём прямо из базы.
function firstTestLesson() {
  const row = db.prepare(`
    SELECT l.id AS lesson_id, t.id AS test_id, l.course_id
    FROM lessons l JOIN tests t ON t.lesson_id = l.id JOIN courses c ON c.id = l.course_id
    WHERE c.published = 1 AND l.published = 1 AND c.branch_id IS NULL
      AND (SELECT COUNT(*) FROM questions q WHERE q.test_id = t.id) > 0
      AND l.sort = (SELECT MIN(sort) FROM lessons WHERE course_id = l.course_id AND published = 1)
    ORDER BY c.id LIMIT 1`).get()
  const questions = db.prepare('SELECT id, type, correct, options FROM questions WHERE test_id = ?').all(row.test_id)
  return { ...row, questions }
}

const rightAnswers = (qs) => Object.fromEntries(qs.map(q => [q.id, JSON.parse(q.correct)]))
// Неверный ответ: для одиночного выбора и «верно/неверно» — любой вариант, кроме правильного
const wrongAnswers = (qs) => Object.fromEntries(qs.map(q => {
  const right = JSON.parse(q.correct).map(Number)
  const count = q.type === 'boolean' ? 2 : JSON.parse(q.options).length
  const wrong = [...Array(count).keys()].find(i => !right.includes(i))
  return [q.id, [wrong]]
}))

const ledgerSum = (userId) => db.prepare('SELECT COALESCE(SUM(amount), 0) s FROM coil_tx WHERE user_id = ?').get(userId).s
const ledgerText = (userId) => JSON.stringify(db.prepare('SELECT reason, ref, amount FROM coil_tx WHERE user_id = ? ORDER BY id').all(userId))

// Сдвигаем время прошлых попыток назад, чтобы не ждать 10 минут паузы
function skipPause(userId, testId) {
  db.prepare("UPDATE attempts SET created_at = datetime('now', '-11 minutes') WHERE user_id = ? AND test_id = ?")
    .run(userId, testId)
}

test('без входа данные закрыты', async () => {
  assert.equal((await call('/api/me')).status, 401)
  assert.equal((await call('/api/library')).status, 401)
})

test('неверный пароль не пускает', async () => {
  const r = await login(NEW_EMPLOYEE, 'не-тот-пароль')
  assert.equal(r.status, 401)
})

test('главный путь: вход → урок → тест → COIL → рейтинг', async (t) => {
  const { cookie, json: loginJson, status } = await login(NEW_EMPLOYEE)
  assert.equal(status, 200)
  assert.ok(cookie, 'нет cookie сессии')
  const userId = loginJson.user.id
  assert.equal(loginJson.user.role, 'employee')

  const L = firstTestLesson()
  const coilBefore = (await call('/api/me', { cookie })).json.user.coil

  await t.test('урок открывается, ответы теста не видны сотруднику', async () => {
    const r = await call(`/api/lesson/${L.lesson_id}`, { cookie })
    assert.equal(r.status, 200)
    assert.ok(r.json.blocks.length > 0, 'в уроке нет блоков')
    assert.equal(r.json.test.id, L.test_id)
    assert.equal(r.json.test.attempts_allowed, 3)
    assert.equal(r.json.test.pause_minutes, 10)
    assert.equal(r.json.test.pass_score, 70)
    const raw = JSON.stringify(r.json.test)
    assert.ok(!raw.includes('"correct"'), 'правильные ответы утекли в урок')
  })

  await t.test('проваленный тест не даёт COIL', async () => {
    const r = await call(`/api/test/${L.test_id}/attempt`, { cookie, method: 'POST', body: { answers: wrongAnswers(L.questions) } })
    assert.equal(r.status, 200)
    assert.equal(r.json.attempt.passed, false)
    assert.equal(r.json.reward, null)
    assert.equal(r.json.attempts_left, 2)
    assert.equal(r.json.user.coil, coilBefore)
  })

  await t.test('повтор сразу — пауза 10 минут', async () => {
    const r = await call(`/api/test/${L.test_id}/attempt`, { cookie, method: 'POST', body: { answers: rightAnswers(L.questions) } })
    assert.equal(r.status, 429)
    assert.ok(r.json.pause_left > 0)
  })

  await t.test('сдал на 100% — COIL по правилу: урок 15 + тест 10 + без ошибок 15', async () => {
    skipPause(userId, L.test_id)
    const r = await call(`/api/test/${L.test_id}/attempt`, { cookie, method: 'POST', body: { answers: rightAnswers(L.questions) } })
    assert.equal(r.status, 200)
    assert.equal(r.json.attempt.passed, true)
    assert.equal(r.json.attempt.score, 100)
    // В курсе больше одного урока, поэтому бонуса за курс (+40) здесь нет
    assert.equal(r.json.reward.coil, 15 + 10 + 15, ledgerText(userId))
    // Журнал COIL: ровно по одной записи на урок, тест и «без ошибок»
    const rows = Object.fromEntries(db.prepare(
      "SELECT reason, amount FROM coil_tx WHERE user_id = ? AND reason IN ('lesson','test','test_perfect')").all(userId)
      .map(x => [x.reason, x.amount]))
    assert.deepEqual(rows, { lesson: 15, test: 10, test_perfect: 15 })
    // Сверху могут прийти достижения («Первый шаг», «Отличник»…) — они тоже в журнале.
    // Баланс всегда равен сумме журнала, и профиль показывает то же число.
    assert.equal(r.json.user.coil, ledgerSum(userId), ledgerText(userId))
    assert.ok(r.json.user.coil >= coilBefore + 40)
    const me = await call('/api/me', { cookie })
    assert.equal(me.json.user.coil, r.json.user.coil, 'баланс в профиле не совпал')
  })

  await t.test('повторная сдача не начисляет COIL за тест второй раз', async () => {
    skipPause(userId, L.test_id)
    const r = await call(`/api/test/${L.test_id}/attempt`, { cookie, method: 'POST', body: { answers: rightAnswers(L.questions) } })
    assert.equal(r.status, 200)
    assert.equal(r.json.reward.coil, 0)
    const again = db.prepare(
      "SELECT COUNT(*) c FROM coil_tx WHERE user_id = ? AND reason IN ('lesson','test','test_perfect')").get(userId).c
    assert.equal(again, 3, ledgerText(userId))
    assert.equal(r.json.user.coil, ledgerSum(userId), ledgerText(userId))
  })

  await t.test('после 3 попыток — больше нельзя', async () => {
    skipPause(userId, L.test_id)
    const r = await call(`/api/test/${L.test_id}/attempt`, { cookie, method: 'POST', body: { answers: rightAnswers(L.questions) } })
    assert.equal(r.status, 429)
    assert.equal(r.json.attempts_left, 0)
  })

  await t.test('рейтинг показывает сотрудника с заработанным опытом', async () => {
    const r = await call('/api/ranking', { cookie })
    assert.equal(r.status, 200)
    assert.ok(r.json.me, 'сотрудника нет в рейтинге')
    assert.ok(r.json.me.xp > 0, 'XP за тест не попал в рейтинг')
    assert.equal(r.json.me.rank, r.json.rows.findIndex(x => x.me) + 1)
  })

  await t.test('сотруднику закрыта админка', async () => {
    assert.equal((await call('/api/admin/overview', { cookie })).status, 403)
  })
})

test('роль «руководитель» убрана, открытые вопросы отключены', async () => {
  const roles = db.prepare('SELECT DISTINCT role FROM users').all().map(r => r.role).sort()
  assert.deepEqual(roles, ['admin', 'employee'])

  const { cookie } = await login(ADMIN)
  const L = firstTestLesson()
  const r = await call(`/api/admin/lessons/${L.lesson_id}/test`, {
    cookie, method: 'PUT',
    body: { questions: [{ type: 'open', prompt: 'Расскажите о вкусе' }] }
  })
  assert.equal(r.status, 400)
  assert.match(r.json.error, /открытые вопросы отключены/)
  // Тест урока не испорчен
  const left = db.prepare('SELECT COUNT(*) c FROM questions WHERE test_id = ?').get(L.test_id).c
  assert.equal(left, L.questions.length)
})
