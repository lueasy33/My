import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, PageSkeleton, LoadError, PageHead, useLoad, useToast } from '../ui'
import { THEMES } from '../theme'

// Как сотрудник получает тему — подпись на карточке
function howToGet(t) {
  if (t.unlock === 'default') return 'открыта сразу'
  if (t.unlock === 'level') return `${t.level} уровень${t.price ? ` или ${t.price} COIL` : ''}`
  if (t.unlock === 'shop') return t.price ? `магазин · ${t.price} COIL` : 'сейчас не продаётся'
  return 'особая награда'
}

const GROUPS = [
  ['default', 'Открыты сразу', 'Есть у всех с первого дня'],
  ['level', 'За уровни', 'Открываются сами по мере учёбы — проходи уроки и тесты, заходи каждый день'],
  ['shop', 'В магазине', 'Только за COIL — заработай их активностью и купи в магазине'],
  ['manual', 'Особые', 'Выдаёт администратор за выдающиеся заслуги']
]

export default function Themes() {
  const { user, setUser } = useApp()
  const toast = useToast()
  const nav = useNavigate()
  const { data, error, reload } = useLoad(() => api.themes(), [])

  if (error) return <main className="page"><LoadError error={error} onRetry={reload} /></main>
  if (!data) return <main className="page"><PageSkeleton /></main>

  const isAdmin = user.role === 'admin'

  async function apply(t) {
    if (!t.unlocked) {
      if (t.unlock === 'shop' && !t.price) toast('Эта тема сейчас не продаётся')
      else if (t.unlock === 'shop' || (t.unlock === 'level' && t.price)) {
        toast(t.unlock === 'shop' ? `Тема продаётся в магазине за ${t.price} COIL` : `Откроется на ${t.level} уровне — или купи раньше за ${t.price} COIL`)
        nav('/shop?tab=theme')
      } else toast(t.unlock === 'level' ? `Откроется на ${t.level} уровне` : 'Эта тема — особая награда от администратора')
      return
    }
    const prev = user.theme
    setUser(u => ({ ...u, theme: t.slug }))
    try {
      await api.patchMe({ theme: t.slug })
    } catch (e) {
      setUser(u => ({ ...u, theme: prev }))
      toast(e.message, 'error')
    }
  }

  const open = data.themes.filter(t => t.unlocked).length

  return (
    <main className="page wide">
      <PageHead title="Оформление" sub={isAdmin
        ? `Всего ${data.themes.length} тем. Вам как администратору открыты все — на карточках видно, как их получают сотрудники`
        : `Открыто ${open} из ${data.themes.length}. Остальные нужно заслужить: уровнем или за COIL в магазине. Сейчас у тебя ${data.level} уровень`} />

      {GROUPS.map(([key, title, hint]) => {
        const list = data.themes.filter(t => t.unlock === key)
        if (!list.length) return null
        return (
          <section key={key} className="section" style={{ marginTop: key === 'default' ? 0 : undefined }}>
            <div className="section-head">
              <h2>{title} <span className="muted" style={{ fontWeight: 600 }}>· {list.filter(t => t.unlocked).length}/{list.length}</span></h2>
            </div>
            <p className="small muted" style={{ margin: '-6px 0 12px' }}>{hint}</p>
            <div className="themes">
              {list.map(t => {
                const m = THEMES.find(x => x.slug === t.slug) || {}
                const active = user.theme === t.slug
                return (
                  <button key={t.slug} className={'theme-card' + (active ? ' on' : '') + (t.unlocked ? '' : ' locked')}
                    onClick={() => apply(t)} aria-pressed={active} aria-label={`${t.name}${t.unlocked ? '' : ', закрыта: ' + howToGet(t)}`}>
                    {/* Превью само берёт цвета, узор и рисунок своей темы через data-theme */}
                    <div className="theme-preview" data-theme={t.slug}>
                      <div className="tp-card"><span className="tp-dot brand" /><span className="tp-dot muted" /></div>
                      <div className="tp-card"><span className="tp-dot reward" /><span className="tp-dot text" /></div>
                    </div>
                    {!t.unlocked && (
                      <span className={'badge lock-badge' + (t.unlock === 'shop' && t.price ? ' gold' : '')}>
                        {t.unlock === 'shop' && t.price ? <><Icon.coin size={11} />{t.price}</> : <><Icon.lock size={11} />{t.unlock === 'level' ? `${t.level} ур.` : t.unlock === 'shop' ? 'нет' : 'награда'}</>}
                      </span>
                    )}
                    <div className="theme-meta">
                      <span style={{ minWidth: 0 }}>
                        <span className="small bold" style={{ display: 'block' }}>{t.name}</span>
                        <span className="tiny muted">{isAdmin || !t.unlocked ? howToGet(t) : m.pattern ? 'с узором' : t.dark ? 'тёмная' : 'светлая'}</span>
                      </span>
                      {active && <Icon.check size={17} style={{ color: 'var(--brand-text)' }} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </main>
  )
}
