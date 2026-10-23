// Напоминания по расписанию — чтобы они приходили, даже если человек не заходит на сайт.
// Раньше напоминание о дедлайне появлялось, только когда сотрудник сам открывал главную,
// то есть именно тому, кто и так учится. Теперь сервер проверяет всех раз в 30 минут.
import { db } from './db.js'
import { courseFilterSql } from './access.js'
import { notify } from './economy.js'

const TZ_DAY = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(ms))
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10
  return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many
}
const hourIn = (tz) => {
  try { return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz || 'Europe/Moscow' }).format(new Date())) }
  catch { return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Moscow' }).format(new Date())) }
}

// Дедлайны: за 2 дня и при просрочке — по одному разу на урок (общая с главной логика)
export function deadlineReminders(user) {
  const f = courseFilterSql({ ...user, role: 'employee' })
  const today = TZ_DAY(Date.now())
  const list = db.prepare(`
    SELECT l.id, l.title, c.title AS course, l.deadline
    FROM lessons l JOIN courses c ON c.id = l.course_id
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.published = 1 AND ${f.sql} AND l.deadline IS NOT NULL
      AND (p.status IS NULL OR p.status != 'passed')
  `).all(user.id, ...f.params)
  const remind = db.prepare('INSERT OR IGNORE INTO sent_reminders(user_id, lesson_id, kind) VALUES (?,?,?)')
  for (const d of list) {
    const days = Math.round((Date.parse(d.deadline) - Date.parse(today)) / 86400000)
    const kind = days < 0 ? 'overdue' : days <= 2 ? 'soon' : null
    if (!kind || !remind.run(user.id, d.id, kind).changes) continue
    if (kind === 'soon') notify(user.id, 'deadline', days === 0 ? 'Дедлайн сегодня' : `До дедлайна ${days} ${plural(days, 'день', 'дня', 'дней')}`, `${d.course}: ${d.title}`, '/lesson/' + d.id)
    else notify(user.id, 'deadline', `Урок просрочен на ${-days} ${plural(-days, 'день', 'дня', 'дней')}`, `${d.course}: ${d.title}`, '/lesson/' + d.id)
  }
}

// Серия под угрозой: вечером, если сегодня ещё не заходил, а серия уже есть
function streakReminder(user) {
  const today = TZ_DAY(Date.now())
  if (user.streak < 2 || user.last_active_day === today) return
  const yesterday = TZ_DAY(Date.now() - 86400000)
  if (user.last_active_day !== yesterday) return // серия уже прервалась — не дёргаем
  const h = hourIn(user.tz)
  if (h < 18 || h >= 21) return
  const key = 'streak:' + today
  if (!db.prepare('INSERT OR IGNORE INTO sent_reminders(user_id, lesson_id, kind) VALUES (?, 0, ?)').run(user.id, key).changes) return
  notify(user.id, 'streak_risk', `Серия ${user.streak} ${plural(user.streak, 'день', 'дня', 'дней')} под угрозой`, 'Загляни сегодня хотя бы на минуту — пройди урок или тренировку вкусов', '/')
}

function runAll() {
  try {
    const people = db.prepare("SELECT * FROM users WHERE archived_at IS NULL AND status = 'active' AND role = 'employee'").all()
    for (const u of people) {
      deadlineReminders(u)
      streakReminder(u)
    }
  } catch (e) {
    console.error('Напоминания не разосланы:', e.message)
  }
}

export function startReminders() {
  setTimeout(runAll, 15000).unref()
  setInterval(runAll, 30 * 60 * 1000).unref()
}
