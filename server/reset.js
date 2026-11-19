// Удаление базы и повторное наполнение демо-данными.
// Отдельный файл вместо `rm -f` в package.json: та команда не работает в Windows.
// Стирает всех сотрудников и их прогресс, поэтому без FORCE=1 не работает.
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Та же база, что у сервера и seed (DB_PATH), а не всегда data/aladdin.db
const dbPath = process.env.DB_PATH || join(root, 'data', 'aladdin.db')

if (String(process.env.FORCE || '').trim() !== '1') {
  console.log('')
  console.log('  ОСТАНОВЛЕНО: reset удаляет базу целиком — всех сотрудников, прогресс и COIL.')
  console.log('  Если это точно нужно, сначала сделайте резервную копию data/, затем:')
  console.log('    Windows:      set FORCE=1 && npm run reset')
  console.log('    Mac / Linux:  FORCE=1 npm run reset')
  console.log('')
  process.exit(1)
}

for (const p of [dbPath, dbPath + '-wal', dbPath + '-shm']) {
  if (existsSync(p)) rmSync(p)
}
console.log('База удалена. Наполняю заново…')

await import('./seed.js')
