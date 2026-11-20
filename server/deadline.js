// Дедлайн урока считается от даты приёма сотрудника (решение Евгения 20.11.2026):
// lessons.deadline_days — «через сколько дней после приёма сдать урок».
// Пустая дата приёма = день, когда завели аккаунт (по Москве), — новичок не «опаздывает» в первый день.
// Старое поле lessons.deadline (одна дата на всех) — запасной вариант для уроков без deadline_days.
// Вся логика здесь, чтобы главная, курсы, напоминания, админка и достижения считали одинаково.

export const hireDaySql = (u = 'u') => `COALESCE(${u}.hired_at, date(${u}.created_at, '+3 hours'))`

// Дедлайн урока l для сотрудника u (оба — псевдонимы таблиц в запросе)
export const dueSql = (l = 'l', u = 'u') =>
  `COALESCE(date(${hireDaySql(u)}, '+' || ${l}.deadline_days || ' days'), ${l}.deadline)`

// То же для одного сотрудника, когда таблицы users в запросе нет. id приводится к целому — подстановка безопасна.
export const dueForUserSql = (userId, l = 'l') =>
  `COALESCE(date((SELECT ${hireDaySql('hu')} FROM users hu WHERE hu.id = ${Math.trunc(Number(userId)) || 0}), '+' || ${l}.deadline_days || ' days'), ${l}.deadline)`

// Срок в днях из формы админки: целое 0…365 или null (без дедлайна)
export function cleanDays(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 365 ? n : null
}
