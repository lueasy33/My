// Секрет для подписи сессионных cookie.
//
// Проблема: раньше при отсутствии переменной окружения бралась строка из кода.
// Такой секрет знает каждый, кто видел исходники, — значит можно подделать
// cookie администратора и войти под ним. Для локального запуска это не страшно,
// но на сервере в интернете это дыра.
//
// Решение: при первом запуске генерируем случайный секрет и кладём в файл
// data/session-secret. Человеку ничего настраивать не нужно, а у каждого
// запуска секрет свой. Переменная окружения по-прежнему главнее — на сервере
// её можно задать явно.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'data', 'session-secret')

function loadOrCreate() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  try {
    if (existsSync(file)) {
      const saved = readFileSync(file, 'utf8').trim()
      if (saved.length >= 32) return saved
    }
  } catch { /* файл нечитаем — создадим заново */ }

  const secret = randomBytes(32).toString('hex')
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, secret, { mode: 0o600 })
  } catch { /* нет прав на запись — работаем со случайным на этот запуск */ }
  return secret
}

export const SESSION_SECRET = loadOrCreate()

// Предупреждаем, если секрет пришёл из переменной окружения но слишком короткий:
// короткий секрет подбирается перебором.
if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
  console.warn('ВНИМАНИЕ: SESSION_SECRET короче 32 символов. Сгенерируйте длинный: openssl rand -hex 32')
}
