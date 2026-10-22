import { db } from './db.js'

// ─────────────────────────────────────────────────────────────
// Доступ к контенту. Проверяется на сервере для каждого запроса,
// а не скрытием кнопок в интерфейсе (спецификация, раздел 11).
// Роли две: сотрудник и администратор.
// ─────────────────────────────────────────────────────────────

export const isStaff = (u) => !!u && u.role === 'admin'

// Курс виден сотруднику, если опубликован и открыт всем или его филиалу.
// Администратор видит всё, включая черновики.
export function canSeeCourse(user, course) {
  if (!course) return false
  if (user.role === 'admin') return true
  const branchOk = course.branch_id == null || course.branch_id === user.branch_id
  return !!course.published && branchOk
}

export function canEditCourse(user, course) {
  return !!course && user.role === 'admin'
}

// SQL-условие видимости курса для списков (алиас таблицы courses — c)
export function courseFilterSql(user) {
  if (user.role === 'admin') return { sql: '1=1', params: [] }
  return { sql: 'c.published = 1 AND (c.branch_id IS NULL OR c.branch_id = ?)', params: [user.branch_id] }
}

// Уроки курса идут по порядку: следующий открывается, когда сдан предыдущий
// (спецификация, сценарий сотрудника, шаг 5). Администратору открыто всё.
export function lessonLocks(user, courseId) {
  const lessons = db.prepare(`
    SELECT l.id, p.status FROM lessons l
    LEFT JOIN progress p ON p.lesson_id = l.id AND p.user_id = ?
    WHERE l.course_id = ? AND l.published = 1 ORDER BY l.sort, l.id
  `).all(user.id, courseId)
  const locked = new Set()
  if (isStaff(user)) return locked
  let prevPassed = true
  for (const l of lessons) {
    if (!prevPassed) locked.add(l.id)
    prevPassed = l.status === 'passed'
  }
  return locked
}
