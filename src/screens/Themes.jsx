import { api } from '../api'
import { useApp } from '../App'
import { Icon, PageSkeleton, LoadError, PageHead, useLoad, useToast } from '../ui'
import { THEMES } from '../theme'

export default function Themes() {
  const { user, setUser } = useApp()
  const toast = useToast()
  const { data, error, reload } = useLoad(() => api.themes(), [])

  if (error) return <main className="page"><LoadError error={error} onRetry={reload} /></main>
  if (!data) return <main className="page"><PageSkeleton /></main>

  async function apply(t) {
    if (!t.unlocked) {
      toast(t.unlock === 'level' ? `Откроется на ${t.level} уровне — или купи в магазине` : 'Эта тема — особая награда от руководства')
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
      <PageHead title="Оформление" sub={`Открыто ${open} из ${data.themes.length}. Новые темы — с узорами и рисунками — открываются с уровнем. Сейчас у тебя ${data.level}`} />

      <div className="themes">
        {data.themes.map(t => {
          const m = THEMES.find(x => x.slug === t.slug) || {}
          const active = user.theme === t.slug
          return (
            <button key={t.slug} className={'theme-card' + (active ? ' on' : '') + (t.unlocked ? '' : ' locked')}
              onClick={() => apply(t)} aria-pressed={active} aria-label={`${t.name}${t.unlocked ? '' : ', закрыта'}`}>
              {/* Превью само берёт цвета, узор и рисунок своей темы через data-theme */}
              <div className="theme-preview" data-theme={t.slug}>
                <div className="tp-card"><span className="tp-dot brand" /><span className="tp-dot muted" /></div>
                <div className="tp-card"><span className="tp-dot reward" /><span className="tp-dot text" /></div>
              </div>
              {!t.unlocked && <span className="badge lock-badge"><Icon.lock size={11} />{t.unlock === 'level' ? `${t.level} ур.` : 'награда'}</span>}
              <div className="theme-meta">
                <span className="small bold">{t.name}</span>
                {active ? <Icon.check size={17} style={{ color: 'var(--brand-text)' }} />
                  : <span className="tiny muted">{m.pattern ? 'с узором' : t.dark ? 'тёмная' : 'светлая'}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </main>
  )
}
