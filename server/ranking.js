// Рейтинг — одна функция для страницы «Рейтинг», главной и профиля.
// Раньше главная считала место за всё время по users.xp, а страница — за месяц
// по журналу, и у одного человека выходило «7 место» и «1 место» одновременно.
// Период по умолчанию — «месяц» (как вкладка по умолчанию на странице рейтинга);
// в ответе всегда есть поле period, чтобы подпись совпадала с цифрой.

import { db } from './db.js'

export const PERIODS = ['week', 'month', 'all']
export const DEFAULT_PERIOD = 'month'

export function normPeriod(p) {
  return PERIODS.includes(p) ? p : DEFAULT_PERIOD
}

// «Неделя» и «месяц» — скользящие 7 и 30 дней по журналу xp_tx (без стартовых сумм)
function since(period) {
  if (period === 'all') return null
  return new Date(Date.now() - (period === 'week' ? 7 : 30) * 86400000).toISOString().replace('T', ' ').slice(0, 19)
}

// Сотрудники в рейтинге, отсортированные: XP за период, при равенстве — больше уроков, потом имя.
export function rankedPeople(period) {
  const from = since(period)
  const people = db.prepare(`
    SELECT u.id AS user_id, u.name, u.xp, u.level, u.avatar_id, u.status_ref, u.branch_id, b.name AS branch,
      ${from ? "(SELECT COALESCE(SUM(x.amount),0) FROM xp_tx x WHERE x.user_id = u.id AND x.created_at >= ? AND x.reason != 'opening')" : 'u.xp'} AS xp_period,
      (SELECT COUNT(*) FROM progress p WHERE p.user_id = u.id AND p.status = 'passed') AS lessons
    FROM users u LEFT JOIN branches b ON b.id = u.branch_id
    WHERE u.archived_at IS NULL AND u.status = 'active' AND u.role != 'admin'
  `).all(...(from ? [from] : []))
  return people.sort((a, b) => (b.xp_period - a.xp_period) || (b.lessons - a.lessons) || a.name.localeCompare(b.name, 'ru'))
}

// Место сотрудника в сети и в филиале — те же числа, что на странице рейтинга.
export function myRank(user, period = DEFAULT_PERIOD) {
  if (user.role === 'admin') return null
  const people = rankedPeople(period)
  const company = people.findIndex(p => p.user_id === user.id) + 1
  const mates = user.branch_id ? people.filter(p => p.branch_id === user.branch_id) : []
  const branch = mates.findIndex(p => p.user_id === user.id) + 1
  return {
    period,
    company: company || null,
    companyTotal: people.length,
    branch: user.branch_id ? (branch || null) : null,
    branchTotal: user.branch_id ? mates.length : null
  }
}
