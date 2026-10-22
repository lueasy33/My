import { readFileSync, readdirSync, unlinkSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, setMeta, DATA_DIR } from './db.js'
import { hashPassword, normalisePhone } from './auth.js'

// ─────────────────────────────────────────────────────────────
// Запуск на пустой базе (боевой сервер без демо-данных).
// Справочники, без которых сайт не работает, создаются сами:
// темы, достижения, товары магазина, категории.
// Первый администратор — из переменных окружения ADMIN_PHONE / ADMIN_PASSWORD.
// ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const content = (f) => JSON.parse(readFileSync(join(__dirname, '..', 'content', f), 'utf8'))

export function initDatabase() {
  // Темы всегда синхронизируем с content/themes.json — это источник правды
  setMeta('themes', content('themes.json'))

  if (!db.prepare('SELECT COUNT(*) c FROM achievements').get().c) {
    const ins = db.prepare('INSERT INTO achievements(code,title,description,icon,kind,rule,xp,coil,sort) VALUES (?,?,?,?,?,?,?,?,?)')
    for (const a of content('achievements.json')) ins.run(a.code, a.title, a.description, a.icon, a.kind, JSON.stringify(a.rule), a.xp, a.coil, a.sort)
  }

  if (!db.prepare('SELECT COUNT(*) c FROM shop_items').get().c) {
    const items = [
      ['avatar', 'ava_03_iskra', 'Искра', 120, 1], ['avatar', 'ava_04_vitrazh', 'Витраж', 150, 1],
      ['avatar', 'ava_02_dym', 'Дым', 180, 1], ['avatar', 'ava_06_mirazh', 'Мираж', 200, 1],
      ['avatar', 'ava_05_polunochnik', 'Полуночник', 200, 1], ['avatar', 'ava_08_pero', 'Перо', 220, 1],
      ['avatar', 'ava_07_hranitel', 'Хранитель', 280, 1], ['avatar', 'ava_10_klyuch', 'Ключ', 300, 1],
      ['avatar', 'ava_09_drakon', 'Дракон', 350, 1],
      ['avatar', 'ava_11_zolotoy-kalyan', 'Золотой кальян', 0, 0], ['avatar', 'ava_12_legenda-smeny', 'Легенда смены', 0, 0],
      ['status', 'status_znatok', 'Знаток табака', 220, 1], ['status', 'gentleman', 'Джентльмен', 250, 1],
      ['status', 'master', 'Мастер смены', 320, 1],
      ['theme', 'vintage', 'Винтаж', 250, 1], ['theme', 'midnight', 'Полночь', 300, 1], ['theme', 'neon', 'Неон', 350, 1]
    ]
    const ins = db.prepare('INSERT INTO shop_items(kind, ref, title, price, purchaseable, sort) VALUES (?,?,?,?,?,?)')
    items.forEach((it, i) => ins.run(...it, i + 1))
  }

  if (!db.prepare('SELECT COUNT(*) c FROM categories').get().c) {
    const ins = db.prepare('INSERT INTO categories(title, icon, sort) VALUES (?,?,?)')
    ;['Кальяны', 'Табак', 'Вейпы', 'Жидкости', 'Одноразовые устройства', 'Продажи', 'Стандарты']
      .forEach((t, i) => ins.run(t, 'book', i + 1))
  }

  // Первый администратор. Создаётся один раз, когда в базе ещё нет ни одного админа.
  const phone = normalisePhone(process.env.ADMIN_PHONE || '')
  const password = process.env.ADMIN_PASSWORD || ''
  const hasAdmin = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND archived_at IS NULL").get().c
  if (!hasAdmin && phone && password.length >= 8) {
    const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)
    if (exists) {
      db.prepare("UPDATE users SET role = 'admin', password_hash = ?, status = 'active', archived_at = NULL WHERE id = ?").run(hashPassword(password), exists.id)
    } else {
      db.prepare(`INSERT INTO users(phone, name, password_hash, role, onboarding_done) VALUES (?,?,?,?,1)`)
        .run(phone, process.env.ADMIN_NAME || 'Администратор', hashPassword(password), 'admin')
    }
    console.log(`  Создан администратор ${phone}`)
  } else if (!hasAdmin) {
    console.log('')
    console.log('  ВНИМАНИЕ: в базе нет администратора.')
    console.log('  Задайте ADMIN_PHONE и ADMIN_PASSWORD (не короче 8 символов) и перезапустите,')
    console.log('  или выполните:  npm run admin -- +79001234567 "Имя Фамилия" пароль')
    console.log('')
  }
}

// ─── Резервные копии ─────────────────────────────────────────
// Раз в сутки — снимок базы в data/backups. Храним 14 последних.
// VACUUM INTO делает согласованную копию без остановки сайта.
export function startBackups() {
  const dir = process.env.BACKUP_DIR || join(DATA_DIR, 'backups')
  mkdirSync(dir, { recursive: true })
  const run = () => {
    try {
      const day = new Date().toISOString().slice(0, 10)
      const file = join(dir, `aladdin-${day}.db`)
      if (existsSync(file)) return
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
      const old = readdirSync(dir).filter(f => /^aladdin-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -14)
      for (const f of old) unlinkSync(join(dir, f))
    } catch (e) {
      console.error('Резервная копия не создана:', e.message)
    }
  }
  run()
  setInterval(run, 60 * 60 * 1000).unref() // проверяем каждый час, копия — раз в день
}
