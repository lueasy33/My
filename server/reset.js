// Удаление базы и повторное наполнение демо-данными.
// Отдельный файл вместо `rm -f` в package.json: та команда не работает в Windows.
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'data')

for (const f of ['aladdin.db', 'aladdin.db-wal', 'aladdin.db-shm']) {
  const p = join(dataDir, f)
  if (existsSync(p)) rmSync(p)
}
console.log('База удалена. Наполняю заново…')

await import('./seed.js')
