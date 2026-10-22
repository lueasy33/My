import { useState } from 'react'
import { api } from '../api'
import { Icon } from '../ui'

// Маска: +7 (910) 123-45-67
// Храним национальный номер (до 10 цифр). Префикс «+7» — оформление, а не данные:
// иначе первая введённая цифра съедалась префиксом (номер съезжал на разряд).
export function nationalPhone(raw) {
  const all = String(raw).replace(/\D/g, '')
  let n = String(raw).startsWith('+7') ? all.slice(1) : all
  if (n.length > 10) n = n[0] === '8' || n[0] === '7' ? n.slice(1) : n
  return n.slice(0, 10)
}

export function maskPhone(raw) {
  const n = nationalPhone(raw)
  if (!n.length) return ''
  let out = '+7 (' + n.slice(0, 3)
  if (n.length >= 3) out += ')'
  if (n.length > 3) out += ' ' + n.slice(3, 6)
  if (n.length > 6) out += '-' + n.slice(6, 8)
  if (n.length > 8) out += '-' + n.slice(8, 10)
  return out
}

export default function Login({ onLogin }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  const digits = nationalPhone(phone)

  async function submit(e) {
    e.preventDefault()
    if (digits.length < 10) { setErr('Введите номер полностью — 10 цифр после +7'); return }
    setErr(''); setBusy(true)
    try {
      await api.login('+7' + digits, password)
      onLogin()
    } catch (e) {
      setErr(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="brand-mark"><img src="/assets/svg/ava_01_ugolek.svg" alt="" /></div>
        <div className="center" style={{ marginBottom: 26 }}>
          <h1 style={{ fontSize: 26 }}>Аладдин</h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 14.5 }}>Обучение для своих. Войди, чтобы продолжить</p>
        </div>

        <div className="col" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="phone">Номер телефона</label>
            <input id="phone" className={'input' + (err && digits.length < 10 ? ' err' : '')} inputMode="tel" autoComplete="username"
              value={maskPhone(phone)} onChange={e => setPhone(e.target.value)}
              placeholder="+7 (___) ___-__-__" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="pass">Пароль</label>
            <div className="pass-wrap">
              <input id="pass" className="input" type={show ? 'text' : 'password'}
                autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="Пароль от администратора" />
              <button type="button" className="icon-btn" onClick={() => setShow(s => !s)} aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}>
                {show ? <Icon.eyeOff size={19} /> : <Icon.eye size={19} />}
              </button>
            </div>
          </div>

          {err && <div className="error" role="alert">{err}</div>}

          <button className="btn block" disabled={busy || !digits || !password}>
            {busy ? 'Проверяем…' : 'Войти'}
          </button>

          <button type="button" className="btn ghost plain block sm" onClick={() => setForgot(f => !f)}>
            Забыли пароль?
          </button>
          {forgot && (
            <div className="card flat small muted" style={{ lineHeight: 1.6 }}>
              Пароль выдаёт администратор. Напиши или позвони ему — он задаст новый,
              и ты сможешь сменить его в настройках.
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
