// Создать администратора или задать ему новый пароль.
//   npm run admin -- +79001234567 "Марина Соколова" новый-пароль
import { db } from './db.js'
import { hashPassword, normalisePhone } from './auth.js'

const [rawPhone, name, password] = process.argv.slice(2)
const phone = normalisePhone(rawPhone)

if (!/^\+7\d{10}$/.test(phone) || !name || !password || password.length < 8) {
  console.log('Использование: npm run admin -- +79001234567 "Имя Фамилия" пароль')
  console.log('Пароль — не короче 8 символов.')
  process.exit(1)
}

const ex = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)
if (ex) {
  db.prepare("UPDATE users SET name = ?, role = 'admin', password_hash = ?, status = 'active', archived_at = NULL WHERE id = ?")
    .run(name, hashPassword(password), ex.id)
  console.log(`Готово: ${name} (${phone}) — администратор, пароль обновлён.`)
} else {
  db.prepare('INSERT INTO users(phone, name, password_hash, role, onboarding_done) VALUES (?,?,?,?,1)')
    .run(phone, name, hashPassword(password), 'admin')
  console.log(`Готово: создан администратор ${name} (${phone}).`)
}
