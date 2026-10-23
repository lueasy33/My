// Генератор тем с узорами и рисунками.
//   node scripts/gen-themes.mjs
// Описание каждой темы — пара строк ниже (фон, акцент, награда, узор, рисунок).
// Скрипт сам выводит остальные цвета и подбирает их так, чтобы текст читался
// (контраст ≥ 4.5:1, как и у 24 основных тем), затем:
//   • дописывает темы в content/themes.json (помечены "generated": true);
//   • переписывает блок «Темы с узорами» в конце src/tokens.css.
// Повторный запуск безопасен: прошлые сгенерированные темы заменяются.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const THEMES_FILE = join(root, 'content', 'themes.json')
const TOKENS_FILE = join(root, 'src', 'tokens.css')
const MARK = '/* ═══ Темы с узорами и рисунками — сгенерировано scripts/gen-themes.mjs, руками не править ═══ */'

// ─── Цвет ────────────────────────────────────────────────────
const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }
const toHex = (c) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)) }
const lum = (h) => { const c = hex(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2] }
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05) }
// Сдвигаем цвет к белому или чёрному, пока он не станет читаемым на всех фонах
function readable(color, bgs, target = 4.6) {
  const towards = lum(bgs[0]) < .25 ? '#FFFFFF' : '#000000'
  for (let t = 0; t <= 1.001; t += .02) {
    const c = mix(color, towards, t)
    if (bgs.every(b => contrast(c, b) >= target)) return c
  }
  return towards
}
const alpha = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})` }
const svg = (body, w, h) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`

// ─── Узоры: повторяющаяся текстура на фоне страницы ─────────
// fg — цвет линий, a — прозрачность. Возвращают [картинка, размер].
const PATTERNS = {
  dots: (fg, a) => [`radial-gradient(${alpha(fg, a * 1.6)} 1.3px, transparent 1.8px)`, '18px 18px'],
  grid: (fg, a) => [`linear-gradient(${alpha(fg, a)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(fg, a)} 1px, transparent 1px)`, '28px 28px'],
  stripes: (fg, a) => [`repeating-linear-gradient(45deg, ${alpha(fg, a)} 0 2px, transparent 2px 14px)`, 'auto'],
  checks: (fg, a) => [`conic-gradient(${alpha(fg, a * .6)} 25%, transparent 0 50%, ${alpha(fg, a * .6)} 0 75%, transparent 0)`, '44px 44px'],
  zigzag: (fg, a) => [`linear-gradient(135deg, ${alpha(fg, a)} 25%, transparent 25%) -12px 0, linear-gradient(225deg, ${alpha(fg, a)} 25%, transparent 25%) -12px 0, linear-gradient(315deg, ${alpha(fg, a)} 25%, transparent 25%), linear-gradient(45deg, ${alpha(fg, a)} 25%, transparent 25%)`, '24px 24px'],
  argyle: (fg, a) => [`linear-gradient(45deg, ${alpha(fg, a * .7)} 25%, transparent 25%, transparent 75%, ${alpha(fg, a * .7)} 75%), linear-gradient(-45deg, ${alpha(fg, a * .7)} 25%, transparent 25%, transparent 75%, ${alpha(fg, a * .7)} 75%)`, '36px 36px'],
  waves: (fg, a) => [svg(`<path d='M0 20 Q15 8 30 20 T60 20' fill='none' stroke='${fg}' stroke-opacity='${a * 2}' stroke-width='1.6'/>`, 60, 32), '60px 32px'],
  hex: (fg, a) => [svg(`<path d='M14 0l14 8v16l-14 8L0 24V8z M14 32v16' fill='none' stroke='${fg}' stroke-opacity='${a * 2}' stroke-width='1.2'/>`, 28, 48), '28px 48px'],
  stars: (fg, a) => [svg(`<g fill='${fg}' fill-opacity='${a * 3}'><circle cx='12' cy='18' r='1.2'/><circle cx='70' cy='40' r='.9'/><circle cx='40' cy='80' r='1.4'/><circle cx='95' cy='95' r='1'/><circle cx='100' cy='12' r='.8'/><path d='M60 6l1.6 4.4L66 12l-4.4 1.6L60 18l-1.6-4.4L54 12l4.4-1.6z'/><path d='M22 98l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z'/></g>`, 120, 120), '120px 120px'],
  moroccan: (fg, a) => [svg(`<path d='M24 0c4 8 12 12 24 12-12 0-20 4-24 12-4-8-12-12-24-12 12 0 20-4 24-12zM24 24c4 8 12 12 24 12-12 0-20 4-24 12-4-8-12-12-24-12 12 0 20-4 24-12z' fill='none' stroke='${fg}' stroke-opacity='${a * 2.2}' stroke-width='1.3'/>`, 48, 48), '48px 48px'],
  triangles: (fg, a) => [svg(`<path d='M0 34 L20 0 L40 34 Z' fill='${fg}' fill-opacity='${a}'/><path d='M20 34 L40 68 L0 68 Z' fill='${fg}' fill-opacity='${a * .5}'/>`, 40, 68), '40px 68px'],
  bubbles: (fg, a) => [svg(`<g fill='none' stroke='${fg}' stroke-opacity='${a * 2}' stroke-width='1.2'><circle cx='20' cy='24' r='10'/><circle cx='66' cy='18' r='5'/><circle cx='52' cy='64' r='14'/><circle cx='14' cy='78' r='4'/><circle cx='88' cy='86' r='7'/></g>`, 100, 100), '100px 100px'],
  grain: (fg, a) => [svg(`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${hex(fg)[0] / 255} 0 0 0 0 ${hex(fg)[1] / 255} 0 0 0 0 ${hex(fg)[2] / 255} 0 0 0 ${a * 5} 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/>`.replace('%23', '#'), 160, 160), '160px 160px'],
  topo: (fg, a) => [svg(`<g fill='none' stroke='${fg}' stroke-opacity='${a * 1.8}' stroke-width='1'><path d='M-10 40 C30 10 60 70 100 40 S170 10 210 40'/><path d='M-10 80 C30 50 60 110 100 80 S170 50 210 80'/><path d='M-10 120 C30 90 60 150 100 120 S170 90 210 120'/><path d='M-10 160 C30 130 60 190 100 160 S170 130 210 160'/></g>`, 200, 200), '200px 200px'],
  smoke: (fg, a) => [svg(`<g fill='none' stroke='${fg}' stroke-opacity='${a * 2}' stroke-width='1.4' stroke-linecap='round'><path d='M20 110 C10 90 34 80 24 60 S30 30 44 20'/><path d='M84 120 C74 98 100 88 90 66 S96 38 110 26'/><path d='M150 108 C140 86 164 76 154 54 S160 26 174 14'/></g>`, 190, 130), '190px 130px'],
  leaves: (fg, a) => [svg(`<g fill='${fg}' fill-opacity='${a * 1.4}'><path d='M20 40 C20 20 40 10 50 10 C50 30 36 42 20 40Z'/><path d='M70 90 C70 70 90 60 100 60 C100 80 86 92 70 90Z'/><path d='M84 24 C94 30 96 42 92 50 C82 46 78 34 84 24Z'/><path d='M20 96 C30 100 34 110 30 118 C20 114 16 104 20 96Z'/></g>`, 120, 120), '120px 120px'],
  plus: (fg, a) => [svg(`<path d='M15 9v12M9 15h12' stroke='${fg}' stroke-opacity='${a * 2.4}' stroke-width='1.6' stroke-linecap='round'/>`, 30, 30), '30px 30px'],
  lanterns: (fg, a) => [svg(`<g fill='none' stroke='${fg}' stroke-opacity='${a * 2.2}' stroke-width='1.3'><path d='M30 0v10'/><path d='M22 14h16l4 10-4 18H22l-4-18z'/><path d='M26 42v4h8v-4'/><path d='M90 40v10'/><path d='M84 54h12l3 8-3 14H84l-3-14z'/></g>`, 120, 110), '120px 110px'],
  scales: (fg, a) => [svg(`<g fill='none' stroke='${fg}' stroke-opacity='${a * 2}' stroke-width='1.2'><path d='M0 20a20 20 0 0 1 40 0'/><path d='M8 20a12 12 0 0 1 24 0'/><path d='M-20 40a20 20 0 0 1 40 0M20 40a20 20 0 0 1 40 0'/><path d='M-12 40a12 12 0 0 1 24 0M28 40a12 12 0 0 1 24 0'/></g>`, 40, 40), '40px 40px'],
  confetti: (fg, a, c2) => [svg(`<g fill-opacity='${a * 3}'><rect x='10' y='14' width='6' height='3' rx='1' fill='${fg}' transform='rotate(30 13 15)'/><rect x='60' y='40' width='6' height='3' rx='1' fill='${c2}' transform='rotate(-20 63 41)'/><circle cx='34' cy='70' r='2' fill='${c2}'/><circle cx='88' cy='16' r='1.6' fill='${fg}'/><rect x='80' y='80' width='6' height='3' rx='1' fill='${fg}' transform='rotate(60 83 81)'/></g>`, 100, 100), '100px 100px'],
  rain: (fg, a) => [svg(`<g stroke='${fg}' stroke-opacity='${a * 2.2}' stroke-width='1.2' stroke-linecap='round'><path d='M10 0l-4 14M40 30l-4 14M70 10l-4 14M26 60l-4 14M58 70l-4 14'/></g>`, 80, 90), '80px 90px'],
  circuit: (fg, a) => [svg(`<g fill='none' stroke='${fg}' stroke-opacity='${a * 2}' stroke-width='1.2'><path d='M0 20h30l10 10v30h40'/><path d='M60 0v20l10 10h30'/><path d='M20 100V70l10-10'/></g><g fill='${fg}' fill-opacity='${a * 3}'><circle cx='80' cy='60' r='2.5'/><circle cx='100' cy='30' r='2.5'/><circle cx='30' cy='60' r='2.5'/></g>`, 100, 100), '100px 100px'],
  snow: (fg, a) => [svg(`<g stroke='${fg}' stroke-opacity='${a * 2.4}' stroke-width='1.2' stroke-linecap='round'><path d='M20 12v16M12 20h16M14 14l12 12M26 14L14 26'/><path d='M80 62v10M75 67h10'/></g><g fill='${fg}' fill-opacity='${a * 2.4}'><circle cx='56' cy='26' r='1.4'/><circle cx='30' cy='84' r='1.8'/><circle cx='96' cy='14' r='1'/></g>`, 110, 100), '110px 100px']
}

// ─── Рисунки: крупная картинка в правом нижнем углу экрана ───
const ART = {
  moon: (c) => svg(`<path d='M250 60a110 110 0 1 0 90 170 90 90 0 1 1-90-170z' fill='${c}'/><g fill='${c}'><path d='M120 70l5 13 13 5-13 5-5 13-5-13-13-5 13-5z'/><circle cx='80' cy='150' r='3'/><circle cx='170' cy='40' r='2.5'/></g>`, 360, 360),
  lamp: (c) => svg(`<g fill='${c}'><path d='M70 250c30 26 160 30 200 0 10 20-20 40-100 40S56 270 70 250z'/><path d='M80 248c0-36 40-64 90-64s90 28 90 64z'/><path d='M260 220c30-6 56-30 76-62-6 40-30 74-70 86z'/><path d='M84 226c-26-10-40-34-40-56 14 16 30 26 46 30z'/><ellipse cx='170' cy='180' rx='18' ry='8'/><path d='M166 172c0-24 8-40 4-60 10 20 4 40 4 60z'/><rect x='130' y='290' width='80' height='14' rx='7'/></g>`, 360, 340),
  hookah: (c) => svg(`<g fill='${c}'><rect x='150' y='40' width='60' height='22' rx='8'/><path d='M160 62h40l-8 30h-24z'/><rect x='174' y='92' width='12' height='120'/><path d='M180 212c-56 0-88 34-88 70s40 52 88 52 88-16 88-52-32-70-88-70z'/><path d='M186 150c50 10 90 40 110 90l-12 6c-18-40-52-70-98-80z'/></g>`, 360, 360),
  dunes: (c) => svg(`<g fill='${c}'><path d='M0 260c60-40 120-40 180 0s120 40 180 0v100H0z'/><path d='M0 300c80-30 160-20 240 10 50 18 90 18 120 4v46H0z' fill-opacity='.7'/><circle cx='260' cy='110' r='42'/></g>`, 360, 360),
  mountains: (c) => svg(`<g fill='${c}'><path d='M0 330 110 150l60 90 50-70 140 160z'/><path d='M80 210l30-60 30 50-20-10-10 20z' fill-opacity='.6'/><circle cx='280' cy='80' r='30' fill-opacity='.7'/></g>`, 360, 340),
  palm: (c) => svg(`<g fill='${c}'><path d='M176 340c-6-80 4-150 24-210l12 4c-18 60-26 126-20 206z'/><path d='M206 130c-40-40-100-40-140-10 50-6 90 4 140 22z'/><path d='M206 130c20-50 80-70 130-50-50 10-90 28-124 58z'/><path d='M206 130c-10-50 10-90 50-110-20 40-30 76-42 112z'/><path d='M206 130c-60 0-100 30-120 70 40-30 80-46 122-58z'/><path d='M206 130c50 0 96 30 110 80-36-34-72-52-112-64z'/></g>`, 360, 360),
  sun: (c) => svg(`<g fill='${c}'><circle cx='240' cy='240' r='70'/><g stroke='${c}' stroke-width='10' stroke-linecap='round'>${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<path d='M${240 + Math.cos(a) * 92} ${240 + Math.sin(a) * 92}L${240 + Math.cos(a) * 124} ${240 + Math.sin(a) * 124}'/>` }).join('')}</g></g>`, 360, 360),
  skyline: (c) => svg(`<g fill='${c}'><path d='M0 360V280h40v-30h20v30h30V230a40 40 0 0 1 80 0v50h20V200l10-30 10 30v80h30v-60a30 30 0 0 1 60 0v60h40v80z'/><circle cx='130' cy='186' r='6'/><path d='M126 186v-20h8v20z'/></g>`, 360, 360),
  planet: (c) => svg(`<g fill='${c}'><circle cx='200' cy='190' r='86'/><ellipse cx='200' cy='190' rx='160' ry='34' fill='none' stroke='${c}' stroke-width='12' transform='rotate(-18 200 190)'/><circle cx='70' cy='70' r='4'/><circle cx='320' cy='320' r='5'/></g>`, 360, 360),
  sakura: (c) => svg(`<g fill='${c}'><path d='M360 40C260 80 200 160 170 260l-10-4c30-100 96-184 196-226z'/>${[[250, 120], [200, 190], [300, 80], [170, 260]].map(([x, y]) => Array.from({ length: 5 }, (_, i) => `<ellipse cx='${x}' cy='${y - 14}' rx='9' ry='15' transform='rotate(${i * 72} ${x} ${y})'/>`).join('')).join('')}</g>`, 360, 340),
  waves: (c) => svg(`<g fill='none' stroke='${c}' stroke-width='14' stroke-linecap='round'><path d='M10 220c40-40 80-40 120 0s80 40 120 0 80-40 100-20'/><path d='M10 270c40-40 80-40 120 0s80 40 120 0 80-40 100-20' stroke-opacity='.7'/><path d='M10 320c40-40 80-40 120 0s80 40 120 0 80-40 100-20' stroke-opacity='.45'/></g>`, 360, 360),
  snowflake: (c) => svg(`<g stroke='${c}' stroke-width='12' stroke-linecap='round' fill='none'>${Array.from({ length: 6 }, (_, i) => `<g transform='rotate(${i * 60} 220 200)'><path d='M220 200V70'/><path d='M220 110l-24-24M220 110l24-24'/><path d='M220 150l-18-18M220 150l18-18'/></g>`).join('')}</g>`, 360, 360),
  // Лист с прорезями: прорези — маской, чтобы сквозь них был виден фон
  monstera: (c) => svg(`<mask id='m'><rect width='360' height='360' fill='white'/><g stroke='black' stroke-width='9' stroke-linecap='round'><path d='M330 330 190 190'/><path d='M250 250 210 300M250 250 300 210M210 210 160 240M210 210 240 160'/></g></mask><path mask='url(#m)' d='M350 350C210 340 120 260 130 130 250 110 340 190 350 350z' fill='${c}'/>`, 360, 360),
  flame: (c) => svg(`<g fill='${c}'><path d='M200 340c-70 0-110-50-100-110 8-46 50-70 56-130 40 30 70 70 66 120 16-12 24-32 24-52 34 30 60 70 54 110-8 40-40 62-100 62z'/></g>`, 360, 360),
  crystal: (c) => svg(`<g fill='${c}'><path d='M200 40l60 90-60 210-60-210z'/><path d='M120 120l40 40-30 130-50-120z' fill-opacity='.7'/><path d='M290 140l40 50-50 110-20-130z' fill-opacity='.6'/></g>`, 360, 360),
  coffee: (c) => svg(`<g fill='${c}'><path d='M90 180h180v40a90 90 0 0 1-180 0z'/><path d='M270 196h20a30 30 0 0 1 0 60h-26l6-16h20a14 14 0 0 0 0-28h-20z'/><rect x='70' y='310' width='220' height='12' rx='6'/></g><g fill='none' stroke='${c}' stroke-width='9' stroke-linecap='round'><path d='M140 150c-14-20 14-30 0-50'/><path d='M180 150c-14-20 14-30 0-50'/><path d='M220 150c-14-20 14-30 0-50'/></g>`, 360, 360)
}

// ─── 50 тем ─────────────────────────────────────────────────
// [slug, название, тёмная?, фон, акцент, награда, узор, рисунок, уровень]
const LIST = [
  ['bazaar', 'Восточный базар', true, '#1A0F14', '#C2416B', '#E0A63A', 'moroccan', 'lamp', 3],
  ['lamp', 'Лампа джинна', true, '#0F0B1E', '#8E5CF0', '#E8B93C', 'stars', 'lamp', 3],
  ['nightsky', 'Ночное небо', true, '#070A18', '#4D6CFA', '#F2C65A', 'stars', 'moon', 4],
  ['desert', 'Пустыня', false, '#F4E7D2', '#B5561F', '#9A6A12', 'waves', 'dunes', 4],
  ['oasis', 'Оазис', true, '#08201C', '#1FA383', '#E3B23C', 'leaves', 'palm', 5],
  ['hookahlounge', 'Кальянная', true, '#120E0C', '#D26A2E', '#E7B65A', 'smoke', 'hookah', 5],
  ['smokeyjazz', 'Дымный джаз', true, '#101014', '#B07BE0', '#D9A441', 'smoke', 'moon', 6],
  ['tobacco', 'Табачный лист', true, '#17120B', '#B98A3E', '#E0B860', 'grain', 'hookah', 6],
  ['mint', 'Мята', false, '#EAF7F1', '#138A64', '#8C6A10', 'leaves', 'monstera', 7],
  ['watermelon', 'Арбуз', false, '#FCEEEE', '#D2344F', '#2E8A3E', 'dots', 'sun', 7],
  ['blueberry', 'Черника', true, '#0C0D24', '#5B6CF0', '#E5B54A', 'bubbles', 'planet', 8],
  ['peach', 'Персик', false, '#FFF1E8', '#E0662C', '#A0600F', 'bubbles', 'sun', 8],
  ['grape', 'Виноград', true, '#170A1F', '#A04BD6', '#D9A441', 'bubbles', 'crystal', 9],
  ['citrus', 'Цитрус', false, '#FBF8E3', '#C27A00', '#7A8F00', 'dots', 'sun', 9],
  ['cherry', 'Вишня', true, '#1C070C', '#E0405E', '#E4B04A', 'confetti', 'sakura', 10],
  ['matcha', 'Матча', false, '#EEF2E2', '#5E7F2A', '#8A6A1E', 'grain', 'monstera', 10],
  ['espresso', 'Эспрессо', true, '#140D09', '#C07A45', '#E1B067', 'grain', 'coffee', 11],
  ['latte', 'Латте', false, '#F6EEE4', '#8A5A35', '#9A6E1C', 'dots', 'coffee', 11],
  ['aurora', 'Северное сияние', true, '#05141A', '#2FC4B2', '#C9A5F5', 'topo', 'mountains', 12],
  ['glacier', 'Ледник', false, '#EAF3F8', '#2273A8', '#8A6A1E', 'snow', 'snowflake', 12],
  ['blizzard', 'Метель', true, '#0B121A', '#6BA6E0', '#E2C064', 'snow', 'snowflake', 13],
  ['lava', 'Лава', true, '#160805', '#F0532A', '#F2B33C', 'topo', 'flame', 13],
  ['volcano', 'Вулкан', true, '#120A0A', '#D9362B', '#E99B3A', 'triangles', 'mountains', 14],
  ['deepsea', 'Глубина', true, '#03121C', '#1C8FC9', '#E5C05A', 'bubbles', 'waves', 14],
  ['lagoon', 'Лагуна', false, '#E6F6F6', '#0B8288', '#977214', 'waves', 'waves', 15],
  ['jungle', 'Джунгли', true, '#071709', '#3DA552', '#E0B840', 'leaves', 'monstera', 15],
  ['bamboo', 'Бамбук', false, '#F0F3E4', '#4E7A27', '#8A6A1E', 'stripes', 'monstera', 16],
  ['sakuranight', 'Ночная сакура', true, '#180B16', '#E064A6', '#E7BD5A', 'scales', 'sakura', 16],
  ['origami', 'Оригами', false, '#F7F4EF', '#C8452D', '#8F6A12', 'triangles', 'crystal', 17],
  ['kyoto', 'Киото', true, '#14100E', '#C9473A', '#D8B062', 'scales', 'sun', 17],
  ['pixel', 'Пиксели', true, '#0D0B1A', '#38D27C', '#F5C543', 'checks', 'planet', 18],
  ['synthwave', 'Синтвейв', true, '#120626', '#F03DBE', '#F7B730', 'grid', 'sun', 18],
  ['matrix', 'Матрица', true, '#020A04', '#22C55E', '#C9D84A', 'rain', 'crystal', 19],
  ['circuit', 'Микросхема', true, '#06101A', '#22A8E0', '#E5C35A', 'circuit', 'planet', 19],
  ['blueprint', 'Чертёж', true, '#0A1A33', '#5AA0F0', '#F0C75A', 'grid', 'skyline', 20],
  ['notebook', 'Тетрадь', false, '#F6F7FB', '#3557C9', '#9A6E12', 'grid', 'crystal', 20],
  ['kraft', 'Крафт', false, '#EBDDC8', '#8B4A22', '#7A5B12', 'grain', 'coffee', 21],
  ['marble', 'Мрамор', false, '#F2F1EF', '#6E5A8A', '#8C6A16', 'topo', 'crystal', 21],
  ['velvet', 'Бархат', true, '#160812', '#B5336E', '#E2B45A', 'argyle', 'moon', 22],
  ['royal', 'Королевская', true, '#0E0A22', '#6E48D6', '#E9BE4A', 'argyle', 'crystal', 22],
  ['emeraldpalace', 'Изумрудный дворец', true, '#04140F', '#16A06C', '#E2B848', 'moroccan', 'skyline', 23],
  ['sultan', 'Султан', true, '#1A0A08', '#C23A2A', '#EDC152', 'moroccan', 'skyline', 23],
  ['lantern', 'Фонарики', true, '#160B05', '#E8862E', '#F2C25A', 'lanterns', 'moon', 24],
  ['ramadan', 'Полумесяц', true, '#08101E', '#3C8CC9', '#EFC85E', 'lanterns', 'moon', 24],
  ['party', 'Вечеринка', true, '#12081E', '#E04BD2', '#F5C33B', 'confetti', 'planet', 25],
  ['candy', 'Карамель', false, '#FFF0F6', '#D63384', '#9A6A10', 'confetti', 'sun', 25],
  ['zigzag', 'Зигзаг', false, '#F3F0FA', '#6A3FC4', '#8F6A12', 'zigzag', 'crystal', 26],
  ['honeycomb', 'Соты', false, '#FBF3DC', '#B26B00', '#7E6A10', 'hex', 'sun', 26],
  ['carbon', 'Карбон', true, '#0A0A0C', '#8A8F9C', '#D9B24A', 'argyle', 'crystal', 27],
  ['plus', 'Минимал+', false, '#F5F5F7', '#2C2C34', '#8A6A16', 'plus', 'crystal', 27]
]

// ─── Сборка токенов темы ────────────────────────────────────
function build([slug, name, dark, bg, brand, reward, pattern, art, level]) {
  const W = '#FFFFFF', K = '#000000'
  const surface1 = dark ? mix(mix(bg, brand, .07), W, .05) : mix(bg, W, .65)
  const surface2 = dark ? mix(mix(bg, brand, .10), W, .10) : mix(mix(bg, brand, .05), K, .05)
  const border = dark ? mix(mix(bg, brand, .16), W, .14) : mix(mix(bg, brand, .10), K, .14)
  const bgs = [bg, surface1, surface2]
  const textPrimary = readable(dark ? mix(W, brand, .06) : mix(K, brand, .14), bgs, 12)
  const textMuted = readable(mix(textPrimary, bg, .42), bgs, 4.6)
  const brandText = readable(brand, bgs, 4.6)
  const rewardText = readable(reward, bgs, 4.6)
  const onBrand = contrast(W, brand) >= contrast('#120A14', brand) ? '#FFFFFF' : '#120A14'
  const t = {
    slug, name, dark, unlock: 'level', level, generated: true, pattern, art,
    'bg-base': bg, 'surface-1': surface1, 'surface-2': surface2, border,
    'text-primary': textPrimary, 'text-muted': textMuted,
    'brand-500': brand, 'brand-700': mix(brand, K, .25), 'brand-soft': dark ? mix(bg, brand, .24) : mix(bg, brand, .14),
    'brand-text': brandText, 'focus-ring': brandText, skeleton: surface2,
    'reward-500': reward, 'reward-300': mix(reward, W, .3),
    ember: '#E8833A',
    success: dark ? '#3FBF7F' : '#25754B', danger: dark ? '#F25C55' : '#B1433E', warning: dark ? '#E0A33A' : '#886122',
    'text-on-brand': onBrand,
    'success-text': readable(dark ? '#3FBF7F' : '#25754B', bgs), 'danger-text': readable(dark ? '#F25C55' : '#B1433E', bgs),
    'warning-text': readable(dark ? '#E0A33A' : '#886122', bgs), 'reward-text': rewardText
  }
  // Узор — цветом акцента, едва заметный; рисунок — крупно, ещё бледнее
  const fg = dark ? mix(brand, W, .25) : mix(brand, K, .1)
  const [pImg, pSize] = PATTERNS[pattern](fg, dark ? .055 : .07, reward)
  const artImg = ART[art](alpha(dark ? mix(brand, W, .2) : brand, dark ? .13 : .11))
  return { t, css: { pImg, pSize, artImg } }
}

const TOKEN_ORDER = ['bg-base', 'surface-1', 'surface-2', 'border', 'text-primary', 'text-muted', 'brand-500', 'brand-700', 'brand-soft', 'brand-text',
  'focus-ring', 'skeleton', 'reward-500', 'reward-300', 'reward-text', 'ember', 'success', 'success-text', 'danger', 'danger-text', 'warning', 'warning-text', 'text-on-brand']

const base = JSON.parse(readFileSync(THEMES_FILE, 'utf8')).filter(t => !t.generated)
const built = LIST.map(build)
const slugs = new Set(base.map(t => t.slug))
for (const { t } of built) if (slugs.has(t.slug)) throw new Error('Повтор slug: ' + t.slug)

// legend — особая тема-награда — остаётся последней
const legend = base.filter(t => t.unlock === 'manual')
const all = [...base.filter(t => t.unlock !== 'manual'), ...built.map(b => b.t), ...legend]
writeFileSync(THEMES_FILE, JSON.stringify(all, null, 2) + '\n')

let tokens = readFileSync(TOKENS_FILE, 'utf8')
const cut = tokens.indexOf(MARK)
if (cut >= 0) tokens = tokens.slice(0, cut).trimEnd() + '\n'
const dark = base.find(t => t.slug === 'dark')
const block = [
  '', MARK,
  '/* Сначала сброс: у обычных тем узора нет, и превью не наследует узор страницы */',
  '[data-theme] { --bg-pattern: none; --bg-pattern-size: auto; --bg-art: none; }',
  '/* Тёмная ещё раз под атрибутом — чтобы её превью работало внутри любой другой темы */',
  `[data-theme="dark"] {\n${TOKEN_ORDER.map(k => `  --${k}: ${dark[k]};`).join('\n')}\n}`,
  '',
  ...built.map(({ t, css }) => `/* ${t.name} · узор «${t.pattern}», рисунок «${t.art}» */\n[data-theme="${t.slug}"] {\n${TOKEN_ORDER.map(k => `  --${k}: ${t[k]};`).join('\n')}\n  --bg-pattern: ${css.pImg};\n  --bg-pattern-size: ${css.pSize};\n  --bg-art: ${css.artImg};\n}\n`)
].join('\n')
writeFileSync(TOKENS_FILE, tokens + block)

console.log(`Тем: ${all.length} (новых ${built.length}).`)
for (const { t } of built) {
  const worst = Math.min(...[t['text-muted'], t['brand-text'], t['reward-text']].flatMap(c => [t['bg-base'], t['surface-1'], t['surface-2']].map(b => contrast(c, b))))
  if (worst < 4.5) console.log('  низкий контраст:', t.slug, worst.toFixed(2))
}
