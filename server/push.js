// Push-уведомления: приходят на телефон, даже когда сайт закрыт.
//
// Как устроено:
//   1. Браузер сотрудника подписывается (Настройки → «Уведомления на телефон»)
//      и присылает адрес подписки — он хранится в push_subscriptions.
//   2. Каждое уведомление на сайте (notify) кладёт push в очередь push_queue.
//      Если у человека тихие часы — с отметкой «отправить утром».
//   3. Раз в 20 секунд очередь разбирается и отправляется через сервис push
//      браузера (Google, Apple, Mozilla). Мёртвые подписки удаляются сами.
//
// Ключи VAPID создаются при первом запуске в data/vapid.json — как ключ сессий.
// Их можно задать и переменными VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
import webpush from 'web-push'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { db, DATA_DIR } from './db.js'

let ready = false
let publicKey = ''

function loadKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
  }
  const file = join(DATA_DIR, 'vapid.json')
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const keys = webpush.generateVAPIDKeys()
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(file, JSON.stringify(keys), { mode: 0o600 })
  return keys
}

export function initPush() {
  try {
    const keys = loadKeys()
    // Сервисы push требуют контакт отправителя: адрес сайта или почту
    const subject = process.env.VAPID_SUBJECT || (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : 'mailto:admin@aladdin.local')
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey)
    publicKey = keys.publicKey
    ready = true
  } catch (e) {
    console.error('Push-уведомления выключены:', e.message)
  }
}

export const pushPublicKey = () => (ready ? publicKey : '')

// ─── Настройки человека ─────────────────────────────────────
// Категории можно выключать по отдельности; тихие часы — [с, до] по местному времени
export const DEFAULT_PREFS = { learning: true, rewards: true, streak: true, admin: true, quiet: [22, 9] }

export function prefsOf(user) {
  let p = {}
  try { p = JSON.parse(user.push_prefs || '{}') } catch {}
  return { ...DEFAULT_PREFS, ...p }
}

// Тип уведомления → категория. Для админа «ответ ждёт проверки» и «заказ приза» — рабочие
function categoryOf(kind, role) {
  if (role === 'admin' && (kind === 'review' || kind === 'prize')) return 'admin'
  if (['deadline', 'course', 'lesson', 'review'].includes(kind)) return 'learning'
  if (kind === 'streak_risk') return 'streak'
  return 'rewards'
}

// Местный час человека: часовой пояс берём из его браузера, по умолчанию — Москва
function localHour(tz, ms = Date.now()) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz || 'Europe/Moscow' }).format(new Date(ms)))
  } catch {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Moscow' }).format(new Date(ms)))
  }
}
const inQuiet = (hour, [from, to]) => from === to ? false : from < to ? hour >= from && hour < to : hour >= from || hour < to
const sqlTime = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19)

// Когда можно отправить: сейчас или в первую минуту после тихих часов
function sendTime(user, prefs) {
  const now = Date.now()
  if (!inQuiet(localHour(user.tz, now), prefs.quiet)) return sqlTime(now)
  for (let m = 15; m <= 24 * 60; m += 15) {
    const t = now + m * 60000
    if (!inQuiet(localHour(user.tz, t), prefs.quiet)) return sqlTime(t)
  }
  return sqlTime(now)
}

// Вызывается из notify(): ставит push в очередь, если человек подписан и не выключил категорию
export function queuePush(userId, { kind, title, body, link }) {
  if (!ready) return
  const user = db.prepare('SELECT id, role, push_prefs, tz FROM users WHERE id = ? AND archived_at IS NULL').get(userId)
  if (!user) return
  if (!db.prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ?').get(userId)) return
  const prefs = prefsOf(user)
  if (prefs[categoryOf(kind, user.role)] === false) return
  const payload = JSON.stringify({ title, body: body || '', url: link || '/', tag: kind })
  db.prepare('INSERT INTO push_queue(user_id, payload, send_after) VALUES (?,?,?)').run(userId, payload, sendTime(user, prefs))
}

// ─── Отправка ───────────────────────────────────────────────
async function sendTo(sub, payload) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 24 * 3600, urgency: 'normal' })
    db.prepare("UPDATE push_subscriptions SET fails = 0, last_sent_at = datetime('now') WHERE id = ?").run(sub.id)
    return true
  } catch (e) {
    // 404/410 — подписки больше нет (удалили приложение, сбросили разрешение)
    if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id)
    else db.prepare('UPDATE push_subscriptions SET fails = fails + 1 WHERE id = ?').run(sub.id)
    db.prepare('DELETE FROM push_subscriptions WHERE id = ? AND fails >= 10').run(sub.id)
    return false
  }
}

export async function sendNow(userId, payload) {
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId)
  const results = await Promise.all(subs.map(s => sendTo(s, JSON.stringify(payload))))
  return results.filter(Boolean).length
}

let busy = false
async function drain() {
  if (busy || !ready) return
  busy = true
  try {
    const due = db.prepare("SELECT * FROM push_queue WHERE send_after <= datetime('now') ORDER BY id LIMIT 200").all()
    if (!due.length) return
    db.prepare(`DELETE FROM push_queue WHERE id IN (${due.map(() => '?').join(',')})`).run(...due.map(d => d.id))
    // Если за ночь накопилось много — одно сообщение-сводка, а не пачка
    const byUser = new Map()
    for (const d of due) byUser.set(d.user_id, [...(byUser.get(d.user_id) || []), JSON.parse(d.payload)])
    for (const [userId, list] of byUser) {
      if (list.length > 3) {
        await sendNow(userId, { title: `У тебя ${list.length} новых уведомлений`, body: list.slice(0, 3).map(p => p.title).join(' · '), url: '/notifications', tag: 'summary' })
      } else {
        for (const p of list) await sendNow(userId, p)
      }
    }
  } catch (e) {
    console.error('Ошибка отправки push:', e.message)
  } finally {
    busy = false
  }
}

export function startPushWorker() {
  initPush()
  if (!ready) return
  setInterval(drain, 20000).unref()
}

export function subscribe(userId, sub, device = '', tz = '') {
  const endpoint = String(sub?.endpoint || '')
  const p256dh = String(sub?.keys?.p256dh || ''), auth = String(sub?.keys?.auth || '')
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth || endpoint.length > 1000) return false
  // Один браузер — одна подписка; если на этом устройстве вошёл другой человек, подписка переходит к нему
  db.prepare(`INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth, device) VALUES (?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device, fails = 0`)
    .run(userId, endpoint, p256dh, auth, String(device).slice(0, 120))
  if (tz && tz.length < 64) {
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); db.prepare('UPDATE users SET tz = ? WHERE id = ?').run(tz, userId) } catch {}
  }
  return true
}

export function unsubscribe(userId, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, String(endpoint || ''))
}

export const devicesOf = (userId) => db.prepare('SELECT id, device, created_at, last_sent_at FROM push_subscriptions WHERE user_id = ? ORDER BY id').all(userId)
