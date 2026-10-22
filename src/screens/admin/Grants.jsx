import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { Icon, PageSkeleton, LoadError, PageHead, Tabs, useLoad, useToast, avatarSrc, iconSrc } from '../../ui'

export default function Grants() {
  const toast = useToast()
  const { data, error, reload } = useLoad(() => Promise.all([api.admin.users(), api.admin.achievements(), api.admin.shopItems()])
    .then(([u, a, s]) => ({ users: u.users, achievements: a.achievements, shop: s.items })), [])
  const [kind, setKind] = useState('achievement')
  const [form, setForm] = useState({ user_id: '', what: '', reason: '' })
  const [busy, setBusy] = useState(false)

  if (error) return <LoadError error={error} onRetry={reload} />
  if (!data) return <PageSkeleton />

  const options = kind === 'achievement'
    ? data.achievements.filter(a => a.kind === 'manual').map(a => ({ v: String(a.id), title: a.title, img: iconSrc(a.icon), sub: `+${a.xp} XP, +${a.coil} COIL` }))
    : kind === 'avatar'
      ? data.shop.filter(s => s.kind === 'avatar').map(s => ({ v: s.ref, title: s.title, img: avatarSrc(s.ref), round: true, sub: s.purchaseable ? 'продаётся' : 'только наградой' }))
      : kind === 'status'
        ? data.shop.filter(s => s.kind === 'status').map(s => ({ v: s.ref, title: s.title, img: s.image, sub: s.purchaseable ? 'продаётся' : 'только наградой' }))
        : [{ v: 'legend', title: 'Тема «Легенда»', sub: 'эксклюзивная тема оформления' }]
  const picked = options.find(o => o.v === form.what)

  async function grant(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const base = { user_id: Number(form.user_id), reason: form.reason }
      const body = kind === 'achievement' ? { ...base, achievement_id: Number(form.what) }
        : kind === 'theme' ? { ...base, theme: form.what }
        : { ...base, kind, ref: form.what }
      await api.admin.grant(body)
      setForm(f => ({ ...f, reason: '' }))
      toast('Выдано — сотрудник увидит окно награды при следующем заходе', 'success')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <>
      <PageHead title="Выдать награду" sub="За то, что не посчитать автоматически: наставничество, лучший сервис, помощь с открытием точки"
        action={<Link to="/admin/workshop" className="btn ghost sm"><Icon.sparkles size={16} />Мастерская</Link>} />

      <div style={{ marginBottom: 16 }}>
        <Tabs value={kind} onChange={k => { setKind(k); setForm(f => ({ ...f, what: '' })) }}
          items={[['achievement', 'Достижение'], ['avatar', 'Аватарка'], ['status', 'Статус'], ['theme', 'Особая тема']]} />
      </div>

      <form className="card col" onSubmit={grant} style={{ gap: 14, maxWidth: 640 }}>
        <div className="field">
          <label>Сотрудник</label>
          <select className="select" required value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
            <option value="">Выберите сотрудника</option>
            {data.users.filter(u => u.role !== 'admin').map(u => <option key={u.id} value={u.id}>{u.name} · {u.branch || 'без филиала'}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Что выдать</label>
          {options.length === 0 ? (
            <p className="small muted">
              {kind === 'achievement' ? 'Ручных достижений пока нет. ' : 'Пока пусто. '}
              Создайте их в <Link to="/admin/workshop">Мастерской</Link>.
            </p>
          ) : (
            <div className="grant-options">
              {options.map(o => (
                <button key={o.v} type="button" className={'grant-option' + (form.what === o.v ? ' on' : '')} onClick={() => setForm(f => ({ ...f, what: o.v }))}>
                  {o.img ? <img src={o.img} alt="" style={{ borderRadius: o.round ? 99 : 10 }} /> : <span className="list-ico"><Icon.palette size={20} /></span>}
                  <b>{o.title}</b>
                  <span className="tiny muted">{o.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="field">
          <label>За что</label>
          <textarea className="textarea" rows={3} required value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            placeholder="Например: помог новому сотруднику освоиться на смене" />
          <span className="hint">Сотрудник увидит эту подпись в окне награды</span>
        </div>
        <button className="btn gold" disabled={busy || !picked || !form.user_id}><Icon.medal size={18} />{busy ? 'Выдаём…' : picked ? `Выдать «${picked.title}»` : 'Выберите, что выдать'}</button>
      </form>
    </>
  )
}
