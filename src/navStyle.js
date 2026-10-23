// Вид нижнего меню на телефоне. Это настройка устройства, а не аккаунта:
// хранится в браузере и не мешает, если её нет.
export const NAV_STYLES = [
  { id: 'floating', name: 'Плавающее', hint: 'Отдельная панель над краем экрана' },
  { id: 'pill', name: 'Пилюля', hint: 'Активный раздел — в цветной капсуле' },
  { id: 'fab', name: 'Кнопка в центре', hint: 'Средний раздел — большая круглая кнопка' },
  { id: 'dock', name: 'Док', hint: 'Стеклянная панель, как в iOS' },
  { id: 'gradient', name: 'Градиент', hint: 'Яркая панель в цветах темы' },
  { id: 'line', name: 'С полоской', hint: 'Классика с бегущей полоской сверху' }
]

const KEY = 'navStyle'

export function getNavStyle() {
  try {
    const v = localStorage.getItem(KEY)
    if (NAV_STYLES.some(s => s.id === v)) return v
  } catch {}
  return 'floating'
}

export function applyNavStyle(id = getNavStyle()) {
  document.documentElement.dataset.nav = id
}

export function setNavStyle(id) {
  try { localStorage.setItem(KEY, id) } catch {}
  applyNavStyle(id)
}
