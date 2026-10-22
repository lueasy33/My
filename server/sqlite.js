// ─────────────────────────────────────────────────────────────────────────────
// Адаптер базы данных.
//
// Зачем: better-sqlite3 — нативная библиотека. На Windows без Visual Studio она
// пытается собраться из исходников и падает. Это ломает запуск у человека,
// который просто скачал папку.
//
// Решение: использовать встроенный в Node.js модуль node:sqlite (с 22.5).
// Компиляция не нужна вообще: он часть Node. Адаптер добавляет то, чего в нём
// нет, но чем пользуется код: pragma() и transaction().
//
// Если better-sqlite3 всё-таки установлен (например, на сервере), берём его:
// он быстрее. Порядок: better-sqlite3 → node:sqlite.
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Проверяем библиотеку по-настоящему, а не только её наличие.
// require() на better-sqlite3 успешен и тогда, когда нативный модуль собран под
// другую версию Node: падение происходит позже, при new Database(). Поэтому
// пробуем открыть базу в памяти прямо здесь.
let Database = null
let engine = 'node:sqlite'

try {
  const Candidate = require('better-sqlite3')
  const probe = new Candidate(':memory:')
  probe.close()
  Database = Candidate
  engine = 'better-sqlite3'
} catch {
  Database = null
  engine = 'node:sqlite'
}

// node:sqlite в Node 22-24 помечен экспериментальным и печатает предупреждение
// в консоль. Для человека, который просто запустил start.bat, это выглядит как
// ошибка. Гасим ТОЛЬКО это предупреждение, остальные оставляем.
if (engine === 'node:sqlite') {
  const orig = process.emitWarning
  process.emitWarning = (warning, ...args) => {
    const text = typeof warning === 'string' ? warning : warning?.message || ''
    if (/SQLite is an experimental feature/i.test(text)) return
    return orig.call(process, warning, ...args)
  }
}

// node:sqlite принимает только null/number/string/bigint/Buffer.
// better-sqlite3 тоже не любит boolean и undefined, но падает иначе.
// Приводим значения здесь — тогда вызывающему коду не нужно об этом думать.
function normalise(v) {
  if (v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString()
  return v
}

function normaliseAll(args) {
  return args.map(a => (Array.isArray(a) ? a.map(normalise) : normalise(a)))
}

// ─── Обёртка над node:sqlite, повторяющая нужную часть API better-sqlite3 ───
function nodeSqliteAdapter(path) {
  const { DatabaseSync } = require('node:sqlite')
  const raw = new DatabaseSync(path)

  let depth = 0 // для вложенных транзакций через SAVEPOINT

  function wrapStatement(sql) {
    const stmt = raw.prepare(sql)
    return {
      run: (...args) => {
        const r = stmt.run(...normaliseAll(args))
        // better-sqlite3 отдаёт BigInt-совместимое число; приводим к number,
        // чтобы JSON и сравнения в коде работали как раньше.
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }
      },
      get: (...args) => stmt.get(...normaliseAll(args)),
      all: (...args) => stmt.all(...normaliseAll(args))
    }
  }

  const db = {
    prepare: wrapStatement,
    exec: (sql) => raw.exec(sql),
    // better-sqlite3: db.pragma('journal_mode = WAL') возвращает значение
    pragma: (sql) => {
      const text = `PRAGMA ${sql}`
      try {
        return raw.prepare(text).all()
      } catch {
        return raw.exec(text)
      }
    },
    // better-sqlite3: db.transaction(fn) -> функция. Внутри BEGIN/COMMIT.
    transaction: (fn) => (...args) => {
      const savepoint = `sp_${depth}`
      depth++
      try {
        raw.exec(depth === 1 ? 'BEGIN' : `SAVEPOINT ${savepoint}`)
        const out = fn(...args)
        raw.exec(depth === 1 ? 'COMMIT' : `RELEASE ${savepoint}`)
        return out
      } catch (e) {
        try {
          raw.exec(depth === 1 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}`)
        } catch { /* транзакция уже могла быть закрыта базой */ }
        throw e
      } finally {
        depth--
      }
    },
    close: () => raw.close(),
    get _engine() { return 'node:sqlite' }
  }

  return db
}

export function createDatabase(path) {
  if (engine === 'better-sqlite3') {
    const db = new Database(path)
    return db
  }
  return nodeSqliteAdapter(path)
}

export const engineName = engine
