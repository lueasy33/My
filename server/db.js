import { createDatabase } from './sqlite.js'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'aladdin.db')

mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = createDatabase(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ─────────────────────────────────────────────────────────────
// Схема. Ключевые решения зафиксированы прямо в DDL, а не в коде:
//  • COIL — журнал транзакций, баланс денормализован для скорости,
//    но любое начисление идёт через unique(user_id, reason, ref) — п.16 приёмки.
//  • Прогресс привязан к lesson_version: правка урока не обнуляет историю.
//  • Архив вместо удаления (archived_at), история при переводе сохраняется.
// ─────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  head_user_id INTEGER,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee','manager','admin')),
  branch_id INTEGER REFERENCES branches(id),
  xp INTEGER NOT NULL DEFAULT 0,
  coil INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  avatar_id TEXT,
  earned_avatars TEXT NOT NULL DEFAULT '[]',
  theme_unlocks TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  theme TEXT NOT NULL DEFAULT 'dark',
  lang TEXT NOT NULL DEFAULT 'ru',
  streak INTEGER NOT NULL DEFAULT 0,
  last_active_day TEXT,
  onboarding_done INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  icon TEXT DEFAULT 'book',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover TEXT DEFAULT '',
  importance TEXT NOT NULL DEFAULT 'recommended' CHECK (importance IN ('required','recommended','extra')),
  minutes INTEGER NOT NULL DEFAULT 10,
  branch_id INTEGER REFERENCES branches(id),
  published INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  minutes INTEGER NOT NULL DEFAULT 8,
  published INTEGER NOT NULL DEFAULT 0,
  deadline TEXT
);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, sort);

CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text','photo','video','file','note')),
  content TEXT NOT NULL DEFAULT '{}',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_blocks_lesson ON blocks(lesson_id, sort);

CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  pass_score INTEGER NOT NULL DEFAULT 70,
  attempts_allowed INTEGER NOT NULL DEFAULT 3,
  pause_minutes INTEGER NOT NULL DEFAULT 10,
  show_answers INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('single','multi','boolean')),
  prompt TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  correct TEXT NOT NULL DEFAULT '[]',
  explanation TEXT DEFAULT '',
  block_ref INTEGER,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id, sort);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  test_id INTEGER NOT NULL REFERENCES tests(id),
  answers TEXT NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, test_id, created_at DESC);

CREATE TABLE IF NOT EXISTS progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  lesson_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','passed','pending','failed')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id, status);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'auto' CHECK (kind IN ('auto','manual')),
  rule TEXT NOT NULL DEFAULT '{}',
  xp INTEGER NOT NULL DEFAULT 0,
  coil INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  achievement_id INTEGER NOT NULL REFERENCES achievements(id),
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  granted_by INTEGER REFERENCES users(id),
  reason TEXT DEFAULT '',
  seen INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS coil_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_coil_award ON coil_tx(user_id, reason, ref);
CREATE INDEX IF NOT EXISTS idx_coil_user ON coil_tx(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS xp_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_xp_award ON xp_tx(user_id, reason, ref);

CREATE TABLE IF NOT EXISTS shop_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('avatar','status','theme')),
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  purchaseable INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  item_id INTEGER NOT NULL REFERENCES shop_items(id),
  price INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, item_id)
);

CREATE TABLE IF NOT EXISTS flavors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  strength TEXT DEFAULT '',
  cold INTEGER NOT NULL DEFAULT 0,
  in_quiz INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'на согласовании',
  note TEXT DEFAULT '',
  UNIQUE(brand, name)
);

CREATE TABLE IF NOT EXISTS flavor_progress (
  user_id INTEGER NOT NULL REFERENCES users(id),
  flavor_id INTEGER NOT NULL REFERENCES flavors(id),
  box INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id, flavor_id)
);

CREATE TABLE IF NOT EXISTS overdue_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  by_user_id INTEGER NOT NULL REFERENCES users(id),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('photo','video','file')),
  url TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_progress_lesson_status ON progress(lesson_id, status);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  payload TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)

// Миграции для уже существующей базы (CREATE TABLE IF NOT EXISTS не добавляет колонки).
function addColumn(table, name, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
  if (!cols.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}
addColumn('users', 'last_seen_at', 'last_seen_at TEXT')
// Статус — короткая подпись под именем («Мастер смены»). Хранится ref товара из магазина.
addColumn('users', 'status_ref', 'status_ref TEXT')
addColumn('users', 'hired_at', 'hired_at TEXT')
addColumn('users', 'sound', 'sound INTEGER NOT NULL DEFAULT 1')
addColumn('users', 'reduce_motion', 'reduce_motion INTEGER NOT NULL DEFAULT 0')
addColumn('branches', 'created_at', 'created_at TEXT')
addColumn('categories', 'color', "color TEXT NOT NULL DEFAULT ''")
// Ответ на открытый вопрос и комментарий проверяющего
addColumn('attempts', 'reviewed_by', 'reviewed_by INTEGER')
addColumn('attempts', 'review_note', "review_note TEXT DEFAULT ''")
addColumn('lessons', 'description', "description TEXT NOT NULL DEFAULT ''")
// Мастерская: свои картинки, описание и редкость товаров; награды за достижения
addColumn('shop_items', 'image', "image TEXT NOT NULL DEFAULT ''")
addColumn('shop_items', 'description', "description TEXT NOT NULL DEFAULT ''")
addColumn('shop_items', 'rarity', "rarity TEXT NOT NULL DEFAULT 'common'")
addColumn('achievements', 'reward_avatar', "reward_avatar TEXT NOT NULL DEFAULT ''")
addColumn('achievements', 'reward_status', "reward_status TEXT NOT NULL DEFAULT ''")
addColumn('users', 'earned_statuses', "earned_statuses TEXT NOT NULL DEFAULT '[]'")
addColumn('users', 'best_streak', 'best_streak INTEGER NOT NULL DEFAULT 0')

// Вкусы: бренды — отдельная сущность (логотип, описание), у вкуса — картинка,
// совет продавцу, с чем миксуют, линейка. Всё это ведёт администратор.
db.exec(`
CREATE TABLE IF NOT EXISTS flavor_brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  logo TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS flavor_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  correct INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_flavor_sessions_user ON flavor_sessions(user_id, day);
`)
addColumn('flavors', 'brand_id', 'brand_id INTEGER REFERENCES flavor_brands(id)')
addColumn('flavors', 'image', "image TEXT NOT NULL DEFAULT ''")
addColumn('flavors', 'tip', "tip TEXT NOT NULL DEFAULT ''")
addColumn('flavors', 'mix', "mix TEXT NOT NULL DEFAULT ''")
addColumn('flavors', 'line', "line TEXT NOT NULL DEFAULT ''")
addColumn('flavors', 'published', 'published INTEGER NOT NULL DEFAULT 1')
addColumn('flavors', 'sort', 'sort INTEGER NOT NULL DEFAULT 0')
// Бренды из старого текстового поля переносим в справочник один раз
{
  const ins = db.prepare('INSERT OR IGNORE INTO flavor_brands(name, sort) VALUES (?, ?)')
  const names = db.prepare("SELECT DISTINCT brand FROM flavors WHERE brand_id IS NULL AND brand != ''").all().map(r => r.brand)
  names.forEach((n, i) => ins.run(n, i + 1))
  db.exec('UPDATE flavors SET brand_id = (SELECT b.id FROM flavor_brands b WHERE b.name = flavors.brand) WHERE brand_id IS NULL')
}
db.exec('UPDATE users SET best_streak = streak WHERE best_streak < streak')

// Роль «руководитель» упразднена: остались сотрудник и администратор.
// Бывшие руководители продолжают учиться как сотрудники — их история сохраняется.
db.exec("UPDATE users SET role = 'employee' WHERE role = 'manager'")
db.exec('UPDATE branches SET head_user_id = NULL WHERE head_user_id IS NOT NULL')

// Открытые вопросы. Ограничение CHECK в SQLite нельзя изменить через ALTER,
// поэтому таблица пересобирается один раз — данные копируются как есть.
{
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'questions'").get()
  if (row && !row.sql.includes("'open'")) {
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec(`
      BEGIN;
      CREATE TABLE questions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('single','multi','boolean','open')),
        prompt TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        correct TEXT NOT NULL DEFAULT '[]',
        explanation TEXT DEFAULT '',
        block_ref INTEGER,
        sort INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO questions_new SELECT id, test_id, type, prompt, options, correct, explanation, block_ref, sort FROM questions;
      DROP TABLE questions;
      ALTER TABLE questions_new RENAME TO questions;
      CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id, sort);
      COMMIT;
    `)
    db.exec('PRAGMA foreign_keys = ON')
  }
}

db.exec(`
-- Очередь наград: один механизм показа для всех типов (спецификация 5.13).
-- Начисление уже произошло; здесь только то, что сотрудник ещё не видел.
CREATE TABLE IF NOT EXISTS pending_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_rewards_user ON pending_rewards(user_id, seen_at);

-- Загруженные файлы: фото, видео, документы для уроков
CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  stored TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'file',
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Позиция видео: при возврате видео продолжается с места остановки
CREATE TABLE IF NOT EXISTS video_positions (
  user_id INTEGER NOT NULL REFERENCES users(id),
  block_id INTEGER NOT NULL,
  seconds REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id, block_id)
);

-- Напоминания о дедлайне: чтобы одно и то же не приходило дважды
CREATE TABLE IF NOT EXISTS sent_reminders (
  user_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY(user_id, lesson_id, kind)
);
`)

export const DATA_DIR = dirname(DB_PATH)
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(DATA_DIR, 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })


export function getMeta(key, fallback = null) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
  return row ? JSON.parse(row.value) : fallback
}

export function setMeta(key, value) {
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, JSON.stringify(value))
}
