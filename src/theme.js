import raw from '../content/themes.json'

export const THEMES = raw

// Загружаем токены в <html data-theme> — но сами значения живут в tokens.css.
// Этот файл нужен только для превью в сетке выбора темы.
export function themeStyle(t) {
  return {
    background: `linear-gradient(135deg, ${t['surface-1']} 0%, ${t['bg-base']} 55%, ${t['surface-2']} 100%)`
  }
}

export function swatches(t) {
  return [t['bg-base'], t['surface-1'], t['brand-500'], t['reward-500']]
}
