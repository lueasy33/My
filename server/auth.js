import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'
import { SESSION_SECRET } from './secret.js'

// Секрет берётся из server/secret.js: при первом запуске он генерируется
// случайным и сохраняется в data/session-secret. Жёстко прописанной строки
// в коде больше нет — иначе любой, кто видел исходники, мог подделать сессию.
const SECRET = SESSION_SECRET
const TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 дней — продавцу не должно быть больно

// scrypt: встроен в Node, не тянет нативные зависимости, спокойно проходит аудит
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$')
    if (algo !== 'scrypt') return false
    const candidate = scryptSync(String(password), salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

// Подписанный токен сессии. Никаких JWT-библиотек: полезной нагрузки мало.
export function signSession(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TTL_MS })).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function readSession(token) {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url')
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (!data.exp || data.exp < Date.now()) return null
    return data
  } catch {
    return null
  }
}

export const COOKIE = 'aladdin_session'

export function normalisePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return '+7' + digits.slice(1)
  if (digits.length === 10) return '+7' + digits
  return digits ? '+' + digits : ''
}
