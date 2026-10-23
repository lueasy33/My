import { db, setMeta } from './db.js'
import { hashPassword } from './auth.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Токены и темы — берём из пакета дизайна, не переписываем руками.
export const THEMES = JSON.parse(readFileSync(join(__dirname, '..', 'content', 'themes.json'), 'utf8'))

function clear() {
  const tables = ['prize_orders', 'pending_rewards', 'video_positions', 'sent_reminders', 'overdue_notes', 'uploads', 'media',
    'flavor_sessions', 'flavor_progress', 'flavors', 'flavor_brands', 'purchases', 'shop_items', 'notifications', 'audit_log',
    'user_achievements', 'achievements', 'coil_tx', 'xp_tx', 'progress', 'attempts', 'questions',
    'tests', 'blocks', 'lessons', 'courses', 'categories', 'users', 'branches', 'meta']
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run()
  db.prepare("DELETE FROM sqlite_sequence").run()
}

clear()

// ─── Филиалы ───────────────────────────────────────────────────
const branches = [
  ['Аладдин · Центр', 'Тула, ул. Советская, 12'],
  ['Аладдин · Пролетарский', 'Тула, пр. Ленина, 88'],
  ['Аладдин · Заречье', 'Тула, ул. Октябрьская, 4'],
  ['Аладдин · Новомосковск', 'Новомосковск, ул. Комсомольская, 31']
]
const insB = db.prepare('INSERT INTO branches(name, address) VALUES(?,?)')
const branchIds = branches.map(([n, a]) => insB.run(n, a).lastInsertRowid)

// ─── Пользователи ──────────────────────────────────────────────
const pass = hashPassword('aladdin2026')
const insertUser = db.prepare(`INSERT INTO users
  (phone, name, password_hash, role, branch_id, xp, coil, level, avatar_id, earned_avatars, streak, last_active_day, onboarding_done)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)

insertUser.run('+79101234567', 'Марина Соколова', pass, 'admin', null, 2480, 1860, 12, 'ava_09_drakon', JSON.stringify(['ava_09_drakon', 'ava_01_ugolek', 'ava_05_polunochnik']), 12, today(), 1)
insertUser.run('+79101112233', 'Ирина Ковалёва', pass, 'employee', branchIds[0], 1180, 940, 9, 'ava_07_hranitel', JSON.stringify(['ava_07_hranitel', 'ava_01_ugolek']), 21, today(), 1)
insertUser.run('+79102223344', 'Дмитрий Волков', pass, 'employee', branchIds[1], 760, 610, 7, 'ava_03_iskra', JSON.stringify(['ava_03_iskra']), 4, today(), 1)
insertUser.run('+79103334455', 'Алексей Гусев', pass, 'employee', branchIds[0], 420, 310, 6, 'ava_01_ugolek', JSON.stringify(['ava_01_ugolek']), 7, today(), 1)
insertUser.run('+79104445566', 'Никита Морозов', pass, 'employee', branchIds[0], 305, 240, 5, 'ava_02_dym', JSON.stringify(['ava_02_dym']), 3, today(), 1)
insertUser.run('+79105556677', 'Анна Лебедева', pass, 'employee', branchIds[1], 260, 215, 4, 'ava_04_vitrazh', JSON.stringify(['ava_04_vitrazh']), 9, today(), 1)
insertUser.run('+79106667788', 'Сергей Панов', pass, 'employee', branchIds[1], 140, 95, 3, 'ava_01_ugolek', JSON.stringify(['ava_01_ugolek']), 1, '2026-10-14', 1)
insertUser.run('+79107778899', 'Ольга Романова', pass, 'employee', branchIds[2], 95, 60, 2, 'ava_06_mirazh', '[]', 2, today(), 1)
insertUser.run('+79108889900', 'Тимур Асланов', pass, 'employee', branchIds[2], 55, 40, 2, 'ava_01_ugolek', '[]', 0, '2026-10-10', 1)
insertUser.run('+79109990011', 'Виктория Смирнова', pass, 'employee', branchIds[3], 0, 0, 1, 'ava_01_ugolek', '[]', 0, null, 0)


function today() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Категории ─────────────────────────────────────────────────
const categories = [
  ['Кальяны', 'kalyun', 1],
  ['Табак', 'tobacco', 2],
  ['Вейпы', 'vape', 3],
  ['Жидкости', 'liquid', 4],
  ['Одноразовые устройства', 'pod', 5],
  ['Продажи', 'sales', 6],
  ['Стандарты', 'standards', 7]
]
const insCat = db.prepare('INSERT INTO categories(title, icon, sort) VALUES(?,?,?)')
const catIds = Object.fromEntries(categories.map(([t, i, s]) => [t, insCat.run(t, i, s).lastInsertRowid]))

// ─── Курсы и уроки ─────────────────────────────────────────────
// Контент реальный: его можно читать и проверять. Именно поэтому MVP «учит».
const insCourse = db.prepare(`INSERT INTO courses
  (category_id, title, description, cover, importance, minutes, published, created_by)
  VALUES (?,?,?,?,?,?,1,1)`)
const insLesson = db.prepare(`INSERT INTO lessons(course_id, title, sort, version, minutes, published, deadline) VALUES (?,?,?,1,?,1,?)`)
const insBlock = db.prepare('INSERT INTO blocks(lesson_id, type, content, sort) VALUES (?,?,?,?)')
const insTest = db.prepare('INSERT INTO tests(lesson_id, pass_score, attempts_allowed, pause_minutes, show_answers) VALUES (?,?,?,?,1)')
const insQ = db.prepare('INSERT INTO questions(test_id, type, prompt, options, correct, explanation, block_ref, sort) VALUES (?,?,?,?,?,?,?,?)')

function block(lessonId, type, content, sort) {
  return insBlock.run(lessonId, type, JSON.stringify(content), sort).lastInsertRowid
}

// ═══ Курс 1: Основы кальяна ═══════════════════════════════════
const c1 = insCourse.run(catIds['Кальяны'], 'Основы кальяна: с нуля до продавца',
  'Что такое кальян, как он устроен, как собрать и что говорить клиенту. Обязательный курс для всех новых сотрудников.',
  'cover_kalyun', 'required', 42).lastInsertRowid

// Урок 1
const l1 = insLesson.run(c1, 'Устройство кальяна', 1, 8, datePlus(5)).lastInsertRowid
const b1 = block(l1, 'text', { blocks: [
  { t: 'p', text: 'Кальян состоит из четырёх частей: колба, шахта, чаша и шланг.', words: [
    { w: 'колба', hint: 'Стеклянный или акриловый сосуд с водой — там охлаждается и фильтруется дым.' },
    { w: 'шахта', hint: 'Вертикальная трубка, соединяющая чашу с колбой. Чем длиннее, тем сильнее охлаждение.' },
    { w: 'чаша', hint: 'Глиняная, силиконовая или металлическая ёмкость для табака. От неё зависит жар.' },
    { w: 'шланг', hint: 'Трубка с мундштуком, через которую тянут дым.' }
  ] },
  { t: 'p', text: 'Понимание устройства помогает не только собрать его правильно, но и объяснить клиенту, за что он платит. Разница между кальяном за 3 000 и за 12 000 рублей — это чаще всего не «красота», а материалы и качество продувки.' },
  { t: 'h', text: 'Что делает каждая часть' },
  { t: 'list', items: [
    'Колба — охлаждение дыма и задержка части взвесей. Чем больше воды, тем мягче тяга.',
    'Шахта — путь дыма. Внутри неё стоит клапан, который не даёт дыму идти обратно в чашу.',
    'Чаша — место, где тлеет табак под углями. Материал чаши влияет на прогрев.',
    'Шланг — то, что клиент держит в руках. Гибридный шланг не пропускает запах предыдущего табака.'
  ] },
  { t: 'note', tone: 'tip', text: 'Скажите клиенту простую фразу: «Четыре части — колба, шахта, чаша, шланг. Всё остальное — удобство». Это работает лучше, чем перечисление брендов.' }
]}, 1)
const l1b2 = block(l1, 'photo', { src: '/assets/webp-512/l1_scheme.webp', alt: 'Схема устройства кальяна', caption: 'Четыре части кальяна: колба, шахта, чаша, шланг' }, 2)
block(l1, 'text', { blocks: [
  { t: 'h', text: 'Вода в колбе' },
  { t: 'p', text: 'Вода охлаждает дым и задерживает часть взвесей. Чем меньше воды, тем крепче и суше дым; чем больше — тем мягче тяга. Оптимально — на 2–3 см выше нижнего среза шахты, не больше.' },
  { t: 'quote', text: 'Слишком много воды — тяга станет лёгкой, но дым потеряет вкус. Слишком мало — будет горчить и жечь горло.' }
]}, 3)

const t1 = insTest.run(l1, 70, 3, 10).lastInsertRowid
insQ.run(t1, 'single', 'Что из перечисленного входит в устройство кальяна?',
  JSON.stringify(['Только колба и шланг', 'Колба, шахта, чаша и шланг', 'Колба и чаша', 'Шахта и мундштук']),
  JSON.stringify([1]), 'Все четыре части — обязательны. Мундштук — сменная насадка на шланг, а не отдельная часть.',
  'ua-1', 1)
insQ.run(t1, 'single', 'Что произойдёт, если налить слишком много воды?',
  JSON.stringify(['Дым станет крепче', 'Тяга станет легче, дым мягче', 'Кальян не затянется совсем', 'Табак быстрее сгорит']),
  JSON.stringify([1]), 'Вода охлаждает дым и задерживает взвеси. Чем её больше, тем ниже концентрация и мягче тяга.',
  'water', 2)
insQ.run(t1, 'multi', 'Какие части отвечают за охлаждение дыма?',
  JSON.stringify(['Колба с водой', 'Длинная шахта', 'Мундштук', 'Чаша']),
  JSON.stringify([0, 1]), 'Колба охлаждает водой, длинная шахта — за счёт расстояния. Мундштук и чаша не охлаждают.',
  'ua-1', 3)
insQ.run(t1, 'boolean', 'Чем длиннее шахта, тем сильнее охлаждается дым. Верно?',
  JSON.stringify(['Верно', 'Неверно']), JSON.stringify([0]),
  'Да: путь дыма длиннее — он успевает остыть. Поэтому высокие кальяны дают более мягкий дым.', 'ua-1', 4)
insQ.run(t1, 'single', 'Клиент спрашивает, за что он платит 12 000 ₽ вместо 3 000 ₽. Что ответить?',
  JSON.stringify(['За бренд, разницы в дыме нет', 'За материалы, качество продувки и срок службы', 'За красивую упаковку', 'За гарантию магазина']),
  JSON.stringify([1]), 'Разница — в материалах и качестве продувки. Это честный ответ, и он не обесценивает дешёвый вариант.',
  null, 5)

// Урок 2
const l2 = insLesson.run(c1, 'Сборка и запуск', 2, 10, datePlus(12)).lastInsertRowid
block(l2, 'text', { blocks: [
  { t: 'h', text: 'Порядок сборки' },
  { t: 'list', ordered: true, items: [
    'Налейте воду в колбу — на 2–3 см выше нижнего среза шахты.',
    'Вставьте шахту и проверьте герметичность: заткните шланг пальцем — вода должна забулькать один раз и остановиться.',
    'Установите блюдце и уплотнитель чаши.',
    'Забейте табак: рыхло, не касаясь калауда, оставляя воздух между волокнами.',
    'Поставьте калауд или фольгу, затем угли по краям, не в центр.',
    'Дайте прогреться 3–5 минут и только потом делайте первую затяжку.'
  ] },
  { t: 'note', tone: 'warn', text: 'Проверка герметичности — не формальность. 8 из 10 жалоб «кальян не тянется» — это неплотное соединение, а не табак.' },
  { t: 'h', text: 'Как понять, что кальян готов' },
  { t: 'p', text: 'Первая затяжка должна быть лёгкой и вкусной. Если чувствуется горечь — жар слишком высокий: уберите один уголь и подождите минуту. Если дым слабый — добавьте уголь или проверьте, не забит ли табак слишком плотно.' }
]}, 1)
block(l2, 'text', { blocks: [
  { t: 'h', text: 'Типичные ошибки новичка' },
  { t: 'table', head: ['Симптом', 'Причина', 'Что делать'], rows: [
    ['Горчит', 'Перегрев, угли в центре', 'Сдвинуть угли к краю, убрать один'],
    ['Не тянется', 'Неплотное соединение или плотная забивка', 'Проверить уплотнители, разрыхлить табак'],
    ['Вкус пропал через 15 минут', 'Табак высох, мало жара', 'Добавить уголь, накрыть колпаком'],
    ['Вода в шланге', 'Перелив или наклон', 'Слить лишнее, продуть шланг']
  ] }
]}, 2)

const t2 = insTest.run(l2, 70, 3, 10).lastInsertRowid
insQ.run(t2, 'single', 'Сколько воды наливать в колбу?',
  JSON.stringify(['До самого верха', 'На 2–3 см выше нижнего среза шахты', 'Совсем немного, на дно', 'Половину колбы']),
  JSON.stringify([1]), 'Ориентир — нижний срез шахты плюс 2–3 см. Больше — потеря вкуса, меньше — горчит.', 'water', 1)
insQ.run(t2, 'boolean', 'Угли нужно ставить в центр чаши, чтобы лучше прогрелось.',
  JSON.stringify(['Верно', 'Неверно']), JSON.stringify([1]),
  'Неверно. Угли ставятся по краям: в центре табак сгорит и даст горечь.', null, 2)
insQ.run(t2, 'multi', 'Что проверить, если кальян плохо тянется?',
  JSON.stringify(['Герметичность соединений', 'Плотность забивки табака', 'Цвет колбы', 'Количество углей']),
  JSON.stringify([0, 1, 3]), 'Цвет колбы на тягу не влияет. Остальные три — реальные причины.', null, 3)
insQ.run(t2, 'single', 'Какой шаг идёт первым при сборке кальяна?',
  JSON.stringify(['Прогрев угля', 'Заливка воды', 'Набивка табака', 'Проверка герметичности']), JSON.stringify([1]),
  'Сначала вода: без неё дальше ничего не имеет смысла. Потом шахта, герметичность, табак, уголь.',
  null, 4)

// Урок 3
const l3 = insLesson.run(c1, 'Уход и чистка', 3, 7, null).lastInsertRowid
block(l3, 'text', { blocks: [
  { t: 'h', text: 'После каждой сессии' },
  { t: 'list', items: [
    'Слить воду, промыть колбу тёплой водой без агрессивных средств.',
    'Продуть шахту — внутри остаётся конденсат, он даёт запах.',
    'Промыть чашу, просушить полностью: влажный табак в чаше — источник плесени.',
    'Шланг не мыть водой, если он не моющийся: вода разрушает внутреннюю спираль. Продуть и протереть снаружи.'
  ] },
  { t: 'h', text: 'Раз в неделю' },
  { t: 'p', text: 'Полная разборка, замачивание стекла в тёплом растворе соды на 20 минут, замена воды в колбе. Уплотнители проверять на трещины — они дешевле, чем репутация заведения.' },
  { t: 'note', tone: 'danger', text: 'Никогда не используйте один шланг на разных гостей без сменного мундштука. Это санитарная норма, а не пожелание.' }
]}, 1)

const t3 = insTest.run(l3, 70, 3, 10).lastInsertRowid
insQ.run(t3, 'boolean', 'Моющийся шланг можно промывать водой.',
  JSON.stringify(['Верно', 'Неверно']), JSON.stringify([0]),
  'Верно, если шланг моющийся. Немоющийся промывать нельзя — разрушится внутренняя спираль.', null, 1)
insQ.run(t3, 'single', 'Что делать с чашей после сессии?',
  JSON.stringify(['Оставить до следующего раза', 'Промыть и полностью просушить', 'Протереть насухо без мытья', 'Замочить на ночь']),
  JSON.stringify([1]), 'Промыть и высушить. Влажная чаша — риск плесени и постороннего запаха.', null, 2)

// ═══ Курс 2: Табак и вкусы ════════════════════════════════════
const c2 = insCourse.run(catIds['Табак'], 'Табак: крепость, жар и вкус',
  'Как не путать лёгкий табак с крепким, почему один и тот же вкус ведёт себя по-разному и что говорить клиенту.',
  'cover_tobacco', 'required', 28).lastInsertRowid

const l4 = insLesson.run(c2, 'Крепость и жар', 1, 9, datePlus(3)).lastInsertRowid
block(l4, 'text', { blocks: [
  { t: 'h', text: 'Три параметра, которые определяют вкус' },
  { t: 'p', text: 'Крепость — это количество никотина в табаке. Жар — температура, которую получает табак. Влажность — сколько сока осталось в листе. Один и тот же «виноград с мятой» у разных брендов может ощущаться по-разному именно из-за этих трёх параметров, а не из-за названия.' },
  { t: 'table', head: ['Крепость', 'Что чувствует гость', 'Кому предлагать'], rows: [
    ['Лёгкая', 'Мягко, почти без удара по горлу', 'Новичкам, девушкам, тем кто «не курит»'],
    ['Средняя', 'Заметный удар, но без горечи', 'Опытным, большинству гостей'],
    ['Крепкая', 'Сильный удар, быстрое насыщение', 'Тем, кто просит «покрепче», по опыту']
  ] },
  { t: 'note', tone: 'tip', text: 'Никогда не предлагайте крепкий табак человеку, который курит кальян впервые. Первый опыт с крепким — это головная боль и отказ от продукта навсегда.' }
]}, 1)
block(l4, 'text', { blocks: [
  { t: 'h', text: 'Жар: почему вкус уходит' },
  { t: 'p', text: 'Большинство вкусов раскрываются при 180–220 °C. Ниже — вкус есть, но дыма мало. Выше — сахар в табаке горит, и появляется горечь, которую невозможно «спасти» добавлением табака.' },
  { t: 'list', items: [
    'Сладкие и десертные вкусы переносят высокий жар хуже — горят быстрее.',
    'Холодные и мятные — устойчивее, но при перегреве дают резкость.',
    'Табачные (burley, virginia) — требуют ровного жара и не любят спешки.'
  ] }
]}, 2)

const t4 = insTest.run(l4, 70, 3, 10).lastInsertRowid
insQ.run(t4, 'multi', 'Что определяет ощущение от табака?',
  JSON.stringify(['Крепость', 'Жар', 'Влажность листа', 'Цвет упаковки']),
  JSON.stringify([0, 1, 2]), 'Цвет упаковки — маркетинг. Остальные три — физика продукта.', null, 1)
insQ.run(t4, 'single', 'Клиент курит кальян впервые. Что предложить?',
  JSON.stringify(['Самый крепкий — чтобы прочувствовал', 'Лёгкий фруктовый или десертный', 'Табачный без ароматизаторов', 'На выбор клиента, без рекомендаций']),
  JSON.stringify([1]), 'Первый опыт должен быть приятным. Лёгкий фруктовый — безопасный выбор.', null, 2)
insQ.run(t4, 'single', 'Почему сладкий вкус горчит быстрее мятного?',
  JSON.stringify(['В нём больше сахара, он горит при высоком жаре', 'Он всегда крепче', 'Мята нейтрализует горечь', 'Это миф, разницы нет']),
  JSON.stringify([0]), 'Сахар в табаке карамелизуется и горит при перегреве. Мятные вкусы устойчивее.', 'heat', 3)

const l5 = insLesson.run(c2, 'Как описать вкус клиенту', 2, 6, null).lastInsertRowid
block(l5, 'text', { blocks: [
  { t: 'h', text: 'Одна фраза, а не абзац' },
  { t: 'p', text: 'У продавца нет времени на лекцию. Нужна одна фраза, которую клиент поймёт и запомнит. Не «это насыщенный десертный вкус с нотами», а «сливочная овсянка с ягодами, мягко, без холодка».' },
  { t: 'list', items: [
    'Скажите, что это на вкус — через знакомую еду.',
    'Скажите про холодок: есть он или нет.',
    'Скажите про крепость: лёгкий, средний, крепкий.',
    'Спросите, что клиент обычно берёт — и предложите рядом.'
  ] },
  { t: 'note', tone: 'tip', text: 'Формула: «[знакомая еда], [холодок], [крепость]». Пример: «Лимонный пирог, без холодка, средний».' }
]}, 1)

const t5 = insTest.run(l5, 70, 3, 10).lastInsertRowid
insQ.run(t5, 'single', 'Какой вкус описан как «виноград с мятой»?',
  JSON.stringify(['Cherry Cola', 'Grape Mint', 'Lemon Ice', 'Coffee Caramel']), JSON.stringify([1]),
  'Виноград с холодной мятой. Это ориентир для продавца, а не формула из урока.',
  null, 1)
insQ.run(t5, 'single', 'Из чего состоит формула описания вкуса?',
  JSON.stringify(['Бренд + цена + страна', 'Знакомая еда + холодок + крепость', 'Название + цвет + аромат', 'Только крепость']),
  JSON.stringify([1]), 'Формула из трёх частей. Бренд и цену клиент увидит сам.', null, 2)

// ═══ Курс 3: Стандарты и безопасность ═════════════════════════
const c3 = insCourse.run(catIds['Стандарты'], 'Стандарты сервиса и безопасность',
  'Как вести себя с гостем, что делать в конфликте и почему 18+ — это не формальность.',
  'cover_standards', 'required', 20).lastInsertRowid

const l6 = insLesson.run(c3, 'Возрастные ограничения', 1, 5, datePlus(1)).lastInsertRowid
block(l6, 'text', { blocks: [
  { t: 'h', text: '18+ — это закон, а не правило магазина' },
  { t: 'p', text: 'Продажа табачной и никотинсодержащей продукции лицам младше 18 лет запрещена. Продавец обязан усомниться и попросить документ. «Выглядит взросло» — не основание.' },
  { t: 'list', items: [
    'Просите документ у всех, кто выглядит моложе 25 лет. Это стандарт, а не оскорбление.',
    'Если документа нет — отказ. Вежливый, но однозначный.',
    'Не обсуждайте с гостем, «сколько ему лет». Просто скажите: «Без документа продать не могу».',
    'Спорный случай — зовите руководителя смены, не решайте сами.'
  ] },
  { t: 'note', tone: 'danger', text: 'Штраф за продажу несовершеннолетнему — до 500 000 ₽ для организации. Один такой случай перекрывает месячную выручку точки.' }
]}, 1)

const t6 = insTest.run(l6, 70, 3, 10).lastInsertRowid
insQ.run(t6, 'boolean', 'Если гость выглядит взросло, документ можно не просить.',
  JSON.stringify(['Верно', 'Неверно']), JSON.stringify([1]),
  'Неверно. Просим у всех, кто выглядит моложе 25 лет. Внешность не является доказательством.', null, 1)
insQ.run(t6, 'single', 'Гость отказывается показать документ. Что делать?',
  JSON.stringify(['Продать, если он ведёт себя уверенно', 'Отказать вежливо и однозначно', 'Позвонить в полицию', 'Спросить у других гостей']),
  JSON.stringify([1]), 'Отказ — единственный законный вариант. Спорный случай передаётся руководителю.', null, 2)

const l7 = insLesson.run(c3, 'Конфликт с гостем', 2, 6, null).lastInsertRowid
block(l7, 'text', { blocks: [
  { t: 'h', text: 'Четыре шага' },
  { t: 'list', ordered: true, items: [
    'Выслушайте, не перебивая. Дайте выговориться — это снижает градус быстрее любых аргументов.',
    'Признайте факт, а не вину: «Понимаю, ждать 20 минут — это долго».',
    'Предложите конкретное действие с сроком: «Сейчас проверю и вернусь через 2 минуты».',
    'Вернитесь с результатом. Даже если результат отрицательный — вернуться обязательно.'
  ] },
  { t: 'note', tone: 'warn', text: 'Не спорьте при других гостях. Если конфликт не гаснет — отведите гостя в сторону или позовите руководителя.' }
]}, 1)

const t7 = insTest.run(l7, 70, 3, 10).lastInsertRowid
insQ.run(t7, 'single', 'Первый шаг в конфликте?',
  JSON.stringify(['Объяснить, что гость неправ', 'Выслушать, не перебивая', 'Позвать охрану', 'Предложить скидку']),
  JSON.stringify([1]), 'Сначала выслушать. Аргументы до того, как человек выговорился, не работают.', null, 1)

// ═══ Курс 4: Продажи (черновик) ═══════════════════════════════
const c4 = insCourse.run(catIds['Продажи'], 'Допродажи без навязывания',
  'Как предложить второе, не испортив впечатление. Черновик — готовится к публикации.',
  'cover_sales', 'recommended', 15).lastInsertRowid
db.prepare('UPDATE courses SET published = 0 WHERE id = ?').run(c4)
insLesson.run(c4, 'Три момента для предложения', 1, 8, null)

// ─── Достижения ────────────────────────────────────────────────
const ach = JSON.parse(readFileSync(join(__dirname, '..', 'content', 'achievements.json'), 'utf8'))
const insA = db.prepare(`INSERT INTO achievements(code,title,description,icon,kind,rule,xp,coil,sort) VALUES (?,?,?,?,?,?,?,?,?)`)
for (const a of ach) {
  insA.run(a.code, a.title, a.description, a.icon, a.kind, JSON.stringify(a.rule), a.xp, a.coil, a.sort)
}

// ─── Магазин ───────────────────────────────────────────────────
const shop = [
  ['avatar', 'ava_03_iskra', 'Искра', 120, 1, 1],
  ['avatar', 'ava_04_vitrazh', 'Витраж', 150, 1, 2],
  ['avatar', 'ava_02_dym', 'Дым', 180, 1, 3],
  ['avatar', 'ava_06_mirazh', 'Мираж', 200, 1, 4],
  ['avatar', 'ava_08_pero', 'Перо', 220, 1, 5],
  ['avatar', 'ava_07_hranitel', 'Хранитель', 280, 1, 6],
  ['avatar', 'ava_10_klyuch', 'Ключ', 300, 1, 7],
  ['avatar', 'ava_09_drakon', 'Дракон', 350, 1, 8],
  ['avatar', 'ava_11_zolotoy-kalyan', 'Золотой кальян', 0, 0, 9],
  ['avatar', 'ava_12_legenda-smeny', 'Легенда смены', 0, 0, 10],
  ['avatar', 'ava_05_polunochnik', 'Полуночник', 200, 1, 11],
  ['status', 'gentleman', 'Джентльмен', 250, 1, 12],
  ['status', 'master', 'Мастер смены', 320, 1, 13],
  ['theme', 'vintage', 'Винтаж', 250, 1, 14],
  ['theme', 'sepia', 'Сепия', 250, 1, 15],
  ['theme', 'midnight', 'Полночь', 300, 1, 16],
  ['theme', 'emerald', 'Изумруд', 300, 1, 17]
]
const insS = db.prepare('INSERT INTO shop_items(kind, ref, title, price, purchaseable, sort) VALUES (?,?,?,?,?,?)')
for (const s of shop) insS.run(...s)

// ─── Вкусы (из content/flavors.json — 40 стартовых позиций) ────
const flavors = JSON.parse(readFileSync(join(__dirname, '..', 'content', 'flavors.json'), 'utf8'))
const BRAND_INFO = {
  'MUST HAVE': ['Россия', 'Один из самых продаваемых брендов. Яркие, узнаваемые вкусы, средняя крепость — безопасный выбор для новичка.'],
  'DOGMA': ['Россия', 'Крепкий табак на основе тёмного листа. Для тех, кто курит давно и хочет плотного дыма.'],
  'AL FAKHER': ['ОАЭ', 'Классика из Эмиратов, лёгкий светлый лист. Хорош для первого кальяна и для тех, кто не любит крепость.'],
  'ADMIRAL ACBAR': ['Россия', 'Десертные и необычные вкусы. Хорошо держит жар, подходит для долгих сессий.'],
  'SAPPHIRE CROWN': ['Россия', 'Премиальная линейка с чистыми, точными вкусами без химии.']
}
const insBr = db.prepare('INSERT INTO flavor_brands(name, country, description, sort) VALUES (?,?,?,?)')
const brandIds = {}
for (const [i, name] of [...new Set(flavors.map(f => f.brand))].entries()) {
  const [country, desc] = BRAND_INFO[name] || ['', '']
  brandIds[name] = insBr.run(name, country, desc, i + 1).lastInsertRowid
}
const insF = db.prepare(`INSERT INTO flavors(brand,brand_id,name,description,tags,strength,cold,in_quiz,status,note) VALUES (?,?,?,?,?,?,?,?,?,?)`)
for (const f of flavors) {
  insF.run(f.brand, brandIds[f.brand], f.name, f.desc, JSON.stringify(f.tags), f.strength, f.cold ? 1 : 0,
    f.inQuiz && f.status !== 'требует проверки' && f.desc ? 1 : 0, f.status, f.note)
}

// ─── Прогресс и история ────────────────────────────────────────
const insProg = db.prepare('INSERT INTO progress(user_id, lesson_id, lesson_version, status) VALUES (?,?,?,?)')
insProg.run(4, l1, 1, 'passed')
insProg.run(4, l2, 1, 'passed')
insProg.run(4, l3, 1, 'in_progress')
insProg.run(5, l1, 1, 'passed')
insProg.run(6, l1, 1, 'passed')
insProg.run(6, l2, 1, 'failed')
insProg.run(7, l1, 1, 'passed')
insProg.run(8, l1, 1, 'in_progress')

const insAtt = db.prepare('INSERT INTO attempts(user_id, test_id, answers, score, passed, pending, created_at) VALUES (?,?,?,?,?,?,?)')
insAtt.run(4, t1, JSON.stringify({ 1: [1], 2: [0], 3: [0, 1], 4: [0], 5: [1] }), 80, 1, 0, '2026-10-12 19:20')
insAtt.run(4, t2, JSON.stringify({ 1: [1], 2: [1], 3: [0, 1, 3], 4: 'text' }), 100, 1, 0, '2026-10-15 20:10')
insAtt.run(6, t1, JSON.stringify({ 1: [0], 2: [1], 3: [0], 4: [1], 5: [1] }), 40, 0, 0, '2026-10-16 18:40')
insAtt.run(5, t1, JSON.stringify({ 1: [1], 2: [1], 3: [0, 1], 4: [0], 5: [1] }), 100, 1, 0, '2026-10-11 12:00')
insAtt.run(7, t1, JSON.stringify({ 1: [1], 2: [1], 3: [0], 4: [1], 5: [1] }), 80, 1, 0, '2026-10-10 16:30')

// Достижения сотрудникам
const ua = db.prepare('INSERT OR IGNORE INTO user_achievements(user_id, achievement_id, granted_at, seen) VALUES (?,?,?,1)')
const achByCode = Object.fromEntries(db.prepare('SELECT id, code FROM achievements').all().map(a => [a.code, a.id]))
ua.run(4, achByCode['ach_01_pervyy-shag'], '2026-10-12 19:21')
ua.run(4, achByCode['ach_06_otlichnik'], '2026-10-15 20:11')
ua.run(4, achByCode['ach_10_seriya-7'], '2026-10-16 09:00')
ua.run(5, achByCode['ach_01_pervyy-shag'], '2026-10-11 12:01')
ua.run(6, achByCode['ach_01_pervyy-shag'], '2026-10-08 17:00')
ua.run(7, achByCode['ach_01_pervyy-shag'], '2026-10-10 16:31')

// COIL/XP история
const insC = db.prepare('INSERT OR IGNORE INTO coil_tx(user_id, amount, reason, ref, created_at) VALUES (?,?,?,?,?)')
insC.run(4, 15, 'lesson', 'l1', '2026-10-12 19:00')
insC.run(4, 10, 'test', 'a1', '2026-10-12 19:20')
insC.run(4, 15, 'lesson', 'l2', '2026-10-15 19:50')
insC.run(4, 15, 'test_perfect', 'a2', '2026-10-15 20:10')
insC.run(5, 15, 'lesson', 'l1', '2026-10-11 11:40')
insC.run(6, 15, 'lesson', 'l1', '2026-10-08 16:40')

// Уведомления
const insN = db.prepare('INSERT INTO notifications(user_id, kind, title, body, link, created_at) VALUES (?,?,?,?,?,?)')
insN.run(4, 'deadline', 'До дедлайна 2 дня', 'Курс «Табак»: Крепость и жар', '/course/' + c2, '2026-10-17 09:00')
insN.run(4, 'achievement', 'Новое достижение: Отличник', 'Тест сдан на 100%', '/profile', '2026-10-15 20:11')
insN.run(4, 'level', 'Уровень 6!', 'Открыта тема «Кофе»', '/themes', '2026-10-15 20:12')
insN.run(5, 'lesson', 'Новый урок в курсе «Кальяны»', 'Уход и чистка', '/course/' + c1, '2026-10-16 10:00')
insN.run(6, 'deadline', 'Урок просрочен на 3 дня', 'Устройство кальяна', '/lesson/' + l1, '2026-10-16 09:00')

// ─── Мета ──────────────────────────────────────────────────────
setMeta('themes', THEMES)
setMeta('seeded_at', new Date().toISOString())

// ─── Пересчёт уровней по XP ────────────────────────────────────
const { levelForXp } = await import('./economy.js')

// Баланс в users — кэш для чтения. Источник правды — журнал.
// Стартовые суммы пишем в журнал как opening, иначе баланс не сходится
// с историей и пункт 16 приёмки проверить нельзя.
// opening = целевой баланс минус уже записанная история.
// Иначе стартовые суммы лягут поверх исторических начислений и разойдутся.
const insOC = db.prepare("INSERT OR IGNORE INTO coil_tx(user_id, amount, reason, ref) VALUES (?,?,'opening','seed')")
for (const u of db.prepare('SELECT id, coil FROM users').all()) {
  const seen = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM coil_tx WHERE user_id = ?").get(u.id).s
  insOC.run(u.id, u.coil - seen)
}

const insOX = db.prepare("INSERT OR IGNORE INTO xp_tx(user_id, amount, reason, ref) VALUES (?,?,'opening','seed')")
for (const u of db.prepare('SELECT id, xp FROM users').all()) {
  const seen = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM xp_tx WHERE user_id = ?").get(u.id).s
  insOX.run(u.id, u.xp - seen)
}

for (const u of db.prepare('SELECT id, xp FROM users').all()) {
  db.prepare('UPDATE users SET level = ? WHERE id = ?').run(levelForXp(u.xp), u.id)
}

console.log('✓ База заполнена')
console.log(`  пользователей: ${db.prepare('SELECT COUNT(*) c FROM users').get().c}`)
console.log(`  курсов: ${db.prepare('SELECT COUNT(*) c FROM courses').get().c}`)
console.log(`  уроков: ${db.prepare('SELECT COUNT(*) c FROM lessons').get().c}`)
console.log(`  вопросов: ${db.prepare('SELECT COUNT(*) c FROM questions').get().c}`)
console.log(`  вкусов: ${db.prepare('SELECT COUNT(*) c FROM flavors').get().c}`)

function datePlus(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
