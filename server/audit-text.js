// Подписи журнала действий админки — безлично, без рода: «Сотрудник создан · Марина Соколова».
// Раньше фронтенд склеивал имя с глаголом мужского рода («Марина Соколова создал»).
// Сервер отдаёт готовую подпись в поле title; кто сделал — отдельно, в поле actor.

const TEXT = {
  'user.create': 'Сотрудник создан', 'user.update': 'Данные сотрудника изменены',
  'user.archive': 'Сотрудник отправлен в архив', 'user.restore': 'Сотрудник возвращён из архива',
  'user.password': 'Сотруднику задан новый пароль',
  'branch.create': 'Филиал создан', 'branch.update': 'Филиал изменён', 'branch.archive': 'Филиал отправлен в архив',
  'category.create': 'Категория создана', 'category.update': 'Категория изменена', 'category.delete': 'Категория удалена',
  'course.create': 'Курс создан', 'course.update': 'Курс изменён', 'course.publish': 'Курс опубликован',
  'course.unpublish': 'Курс снят с публикации', 'course.delete': 'Курс удалён', 'course.order': 'Порядок уроков изменён',
  'lesson.create': 'Урок создан', 'lesson.update': 'Урок изменён', 'lesson.publish': 'Урок опубликован',
  'lesson.unpublish': 'Урок снят с публикации', 'lesson.delete': 'Урок удалён',
  'blocks.update': 'Материалы урока изменены', 'test.update': 'Тест изменён', 'upload': 'Файл загружен',
  'review.verdict': 'Ответ проверен',
  'achievement.grant': 'Награда выдана', 'achievement.revoke': 'Награда снята',
  'achievement.create': 'Достижение создано', 'achievement.update': 'Достижение изменено', 'achievement.delete': 'Достижение удалено',
  'avatar.grant': 'Аватарка выдана', 'status.grant': 'Статус выдан', 'theme.grant': 'Тема выдана',
  'flavor.create': 'Вкус добавлен', 'flavor.update': 'Вкус изменён', 'flavor.delete': 'Вкус удалён', 'flavor.import': 'Вкусы импортированы',
  'flavor_brand.create': 'Бренд добавлен', 'flavor_brand.update': 'Бренд изменён', 'flavor_brand.delete': 'Бренд удалён',
  'shop.create': 'Товар добавлен', 'shop.update': 'Товар изменён', 'shop.delete': 'Товар удалён', 'shop.hide': 'Товар снят с продажи',
  'prize.done': 'Приз выдан', 'prize.cancelled': 'Заказ приза отменён',
  'attention.contact': 'Связались с сотрудником'
}

export function auditTitle(action) {
  return TEXT[action] || 'Действие в админке'
}

// Добавляет подпись к строкам журнала
export function withAuditTitles(rows) {
  return rows.map(r => ({ ...r, title: auditTitle(r.action) }))
}
