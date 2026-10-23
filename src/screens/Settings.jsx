import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, Avatar, PageHead, useToast, ROLE_LABEL } from '../ui'
import { maskPhone } from './Login'
import { NAV_STYLES, getNavStyle, setNavStyle } from '../navStyle'

export default function Settings() {
  const { user, setUser, branch } = useApp()
  const toast = useToast()
  const nav = useNavigate()
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [next2, setNext2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [navStyle, setNav] = useState(getNavStyle)

  async function savePassword(e) {
    e.preventDefault()
    setErr('')
    if (next.length < 6) return setErr('Новый пароль — минимум 6 символов')
    if (next !== next2) return setErr('Пароли не совпадают')
    setBusy(true)
    try {
      await api.changePassword(cur, next)
      setCur(''); setNext(''); setNext2('')
      toast('Пароль изменён', 'success')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function toggle(field, value) {
    setUser(u => ({ ...u, [field]: value }))
    try { await api.patchMe({ [field]: value }) } catch (e) {
      setUser(u => ({ ...u, [field]: !value }))
      toast(e.message, 'error')
    }
  }

  async function restartTour() {
    await api.patchMe({ onboarding_done: false })
    setUser(u => ({ ...u, onboarding_done: false }))
    nav('/onboarding')
  }

  async function logout() {
    try { await api.logout() } catch {}
    window.location.href = '/'
  }

  return (
    <main className="page narrow">
      <PageHead title="Настройки" />

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 14 }}>
          <Avatar id={user.avatar_id} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bold" style={{ fontSize: 16 }}>{user.name}</div>
            <div className="small muted">{maskPhone(user.phone)}</div>
            <div className="small muted">{ROLE_LABEL[user.role]}{branch ? ` · ${branch.name}` : ''}</div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>Оформление и звук</h3>
        <Link to="/themes" className="row between" style={{ minHeight: 52, color: 'inherit', borderBottom: '1px solid var(--border)' }}>
          <span className="row" style={{ gap: 10 }}><Icon.palette size={19} style={{ color: 'var(--brand-text)' }} /><b style={{ fontWeight: 650 }}>Тема оформления</b></span>
          <Icon.chevR size={18} style={{ color: 'var(--text-muted)' }} />
        </Link>
        <Toggle label="Звук при получении награды" checked={user.sound} onChange={v => toggle('sound', v)} />
        <Toggle label="Меньше анимаций" hint="Награды показываются без конфетти и движения" checked={user.reduce_motion} onChange={v => toggle('reduce_motion', v)} />
      </section>

      <section className="card only-mobile" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Нижнее меню</h3>
        <p className="small muted" style={{ marginBottom: 12 }}>Как выглядят кнопки разделов внизу экрана. Сохраняется на этом телефоне</p>
        <div className="nav-picks">
          {NAV_STYLES.map(st => (
            <button key={st.id} type="button" className={"nav-pick" + (navStyle === st.id ? " on" : "")} aria-pressed={navStyle === st.id}
              onClick={() => { setNavStyle(st.id); setNav(st.id) }}>
              <span className={"nav-mini " + st.id} aria-hidden="true"><i /><i /><i /><i /><i /></span>
              <b>{st.name}</b>
              <span className="tiny muted">{st.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, marginBottom: 14 }}>Сменить пароль</h3>
        <form onSubmit={savePassword} className="col" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="cur">Текущий пароль</label>
            <input id="cur" className="input" type="password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="next">Новый пароль</label>
              <input id="next" className="input" type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="field">
              <label htmlFor="next2">Ещё раз</label>
              <input id="next2" className="input" type="password" value={next2} onChange={e => setNext2(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <span className="hint">Минимум 6 символов</span>
          {err && <div className="error" role="alert">{err}</div>}
          <button className="btn" disabled={busy || !cur || !next || !next2}>{busy ? 'Сохраняем…' : 'Сменить пароль'}</button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>Обучение</h3>
        <p className="small muted" style={{ marginBottom: 12 }}>Короткий тур по разделам сайта. Прогресс уроков он не затрагивает.</p>
        <button className="btn ghost block" onClick={restartTour}><Icon.refresh size={16} /> Пройти тур заново</button>
      </section>

      <button className="btn danger block" onClick={logout}><Icon.logout size={17} /> Выйти из аккаунта</button>

      <p className="tiny muted center" style={{ marginTop: 20, lineHeight: 1.7 }}>
        Аладдин · платформа обучения<br />Данные видны только внутри компании
      </p>
    </main>
  )
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="row between" style={{ minHeight: 56, cursor: 'pointer', gap: 16, borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
      <span>
        <b style={{ fontWeight: 650, display: 'block' }}>{label}</b>
        {hint && <span className="small muted">{hint}</span>}
      </span>
      <span className="switch">
        <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
        <span />
      </span>
    </label>
  )
}
