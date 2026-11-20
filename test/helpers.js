// Общие помощники автотестов: свой сервер на временной базе с демо-данными.
// Рабочая база в data/ не трогается; временная папка удаляется после прогона.

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHmac } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import assert from 'node:assert/strict'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Временная папка теста удаляется после того, как сервер реально завершился:
// на Windows база держится открытой, пока процесс жив, и rmSync молча не срабатывал —
// папки aladdin-test-* копились в %TEMP% и забили диск.
export async function cleanupDir(dir, proc) {
  if (proc && proc.exitCode === null && proc.signalCode === null) {
    const exited = new Promise(r => proc.once('exit', r))
    proc.kill()
    await Promise.race([exited, new Promise(r => setTimeout(r, 5000))])
  }
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
  catch (e) { console.warn('не удалось удалить временную папку теста', dir, e.code) }
}
export const DEMO_PASSWORD = 'aladdin2026'
export const SESSION_SECRET = 'x'.repeat(64)

// Поднимает сервер. Возвращает { call, login, db, stop, env }.
export async function startServer(extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aladdin-test-'))
  const port = 19000 + Math.floor(Math.random() * 3000)
  const base = `http://127.0.0.1:${port}`
  const env = {
    ...process.env,
    DB_PATH: join(dir, 'aladdin.db'),
    PORT: String(port),
    SESSION_SECRET,
    BACKUPS: '0',
    REMINDERS: '0',
    LOG_LEVEL: 'error',
    ...extraEnv
  }
  const seed = spawnSync(process.execPath, ['server/seed.js'], { cwd: root, env, encoding: 'utf8' })
  assert.equal(seed.status, 0, 'seed упал: ' + seed.stderr)
  const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env, stdio: 'ignore' })
  let up = false
  for (let i = 0; i < 150 && !up; i++) {
    try { up = (await fetch(base + '/api/health')).ok } catch { /* ещё стартует */ }
    if (!up) await new Promise(r => setTimeout(r, 100))
  }
  assert.ok(up, 'сервер не поднялся')
  const db = new DatabaseSync(env.DB_PATH)

  async function call(path, { cookie, method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* не json */ }
    return { status: res.status, json, text, headers: res.headers }
  }

  async function login(phone, password = DEMO_PASSWORD) {
    const r = await call('/api/auth/login', { method: 'POST', body: { phone, password } })
    const cookie = (r.headers.get('set-cookie') || '').split(';')[0]
    return { ...r, cookie }
  }

  async function stop() {
    try { db.close() } catch { /* уже закрыта */ }
    await cleanupDir(dir, server)
  }

  return { call, login, db, stop, env, base }
}

// Токен сессии в том же формате, что server/auth.js (для проверок подделки)
export function makeToken(payload, secret = SESSION_SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `aladdin_session=${body}.${sig}`
}
