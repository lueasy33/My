import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, useToast } from '../ui'
import { pushState, enablePush, disablePush, isIOS } from '../pushClient'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hh = (h) => String(h).padStart(2, '0') + ':00'

// Подсказка для iPhone: push работает только у сайта на экране «Домой»
function IosHint() {
  return (
    <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
      <li>Откройте сайт в <b>Safari</b></li>
      <li>Нажмите <b>«Поделиться»</b> <span className="muted">(квадрат со стрелкой внизу)</span></li>
      <li>Выберите <b>«На экран Домой»</b> → «Добавить»</li>
      <li>Откройте «Аладдин» с главного экрана и включите уведомления здесь</li>
    </ol>
  )
}

export default function PushSettings() {
  const { user } = useApp()
  const toast = useToast()
  const [state, setState] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setState(await pushState().catch(() => 'unsupported'))
    setInfo(await api.push().catch(() => null))
  }
  useEffect(() => { load() }, [])

  async function turnOn() {
    setBusy(true)
    try {
      await enablePush()
      toast('Уведомления включены', 'success')
      await load()
      await api.pushTest().catch(() => {})
    } catch (e) {
      // Если запретил сам браузер, ниже сразу появится пошаговая подсказка — короткого сообщения хватит
      toast(Notification.permission === 'denied' ? 'Браузер запретил уведомления — ниже написано, где их включить' : e.message, 'error')
      await load()
    } finally { setBusy(false) }
  }
  async function turnOff() {
    setBusy(true)
    try { await disablePush(); toast('Уведомления на этом устройстве выключены'); await load() } finally { setBusy(false) }
  }
  async function test() {
    try { await api.pushTest(); toast('Отправили — уведомление придёт через пару секунд', 'success') } catch (e) { toast(e.message, 'error') }
  }
  async function setPref(patch) {
    try { const r = await api.pushPrefs(patch); setInfo(i => ({ ...i, prefs: r.prefs })) } catch (e) { toast(e.message, 'error') }
  }

  if (state === null || !info) return null
  const prefs = info.prefs
  const serverOff = !info.key

  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <div className="row between" style={{ gap: 10, marginBottom: 6 }}>
        <h3 style={{ fontSize: 16 }}>Уведомления на телефон</h3>
        {state === 'on' && <span className="badge success"><Icon.check size={12} />включены</span>}
      </div>
      <p className="small muted" style={{ marginBottom: 12 }}>Приходят, даже когда сайт закрыт: дедлайны, проверенные ответы, награды, выданные призы</p>

      {serverOff ? (
        <p className="hint">Push-уведомления на сервере пока не настроены — обратитесь к администратору</p>
      ) : state === 'ios-install' ? (
        <div className="card flat tight">
          <b className="small">На iPhone уведомления работают из приложения на главном экране</b>
          <IosHint />
        </div>
      ) : state === 'unsupported' ? (
        <p className="hint">Этот браузер не умеет присылать уведомления. Откройте сайт в Chrome, Яндекс Браузере или Safari (iPhone — через экран «Домой»)</p>
      ) : state === 'denied' ? (
        <div className="card flat tight small">
          <b>Браузер запретил уведомления для этого сайта.</b>
          <DeniedHelp />
          <button className="btn soft sm" style={{ marginTop: 10 }} onClick={() => location.reload()}><Icon.refresh size={15} />Я разрешил — проверить</button>
        </div>
      ) : state === 'off' ? (
        <button className="btn block" disabled={busy} onClick={turnOn}><Icon.bell size={17} />{busy ? 'Включаем…' : 'Включить уведомления'}</button>
      ) : (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn soft sm" onClick={test}><Icon.bell size={15} />Проверить</button>
          <button className="btn ghost sm" disabled={busy} onClick={turnOff}>Выключить на этом устройстве</button>
        </div>
      )}

      {(state === 'on' || info.devices?.length > 0) && !serverOff && (
        <>
          <div style={{ marginTop: 14 }}>
            <PrefToggle label="Обучение" hint="Новые курсы, дедлайны, проверенные ответы" checked={prefs.learning} onChange={v => setPref({ learning: v })} />
            <PrefToggle label="Награды" hint="Достижения, уровни, призы, новые темы" checked={prefs.rewards} onChange={v => setPref({ rewards: v })} />
            <PrefToggle label="Серия дней" hint="Вечером, если сегодня ещё не заходил" checked={prefs.streak} onChange={v => setPref({ streak: v })} />
            {user.role === 'admin' && <PrefToggle label="Работа администратора" hint="Заказы призов, ответы на проверку" checked={prefs.admin} onChange={v => setPref({ admin: v })} />}
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Тихие часы — ничего не приходит, всё накопленное придёт одним сообщением утром</label>
            <div className="row" style={{ gap: 8 }}>
              <select className="select" value={prefs.quiet[0]} onChange={e => setPref({ quiet: [Number(e.target.value), prefs.quiet[1]] })} aria-label="С">
                {HOURS.map(h => <option key={h} value={h}>с {hh(h)}</option>)}
              </select>
              <select className="select" value={prefs.quiet[1]} onChange={e => setPref({ quiet: [prefs.quiet[0], Number(e.target.value)] })} aria-label="До">
                {HOURS.map(h => <option key={h} value={h}>до {hh(h)}</option>)}
              </select>
            </div>
            {prefs.quiet[0] === prefs.quiet[1] && <span className="hint">Одинаковое время — тихих часов нет</span>}
          </div>
          {info.devices?.length > 0 && (
            <p className="tiny muted" style={{ marginTop: 10 }}>Подключено: {info.devices.map(d => d.device || 'устройство').join(', ')}</p>
          )}
        </>
      )}
    </section>
  )
}

// Где включить уведомления, если браузер их запретил — по конкретному браузеру и системе
function DeniedHelp() {
  const ua = navigator.userAgent
  const android = /android/i.test(ua)
  const yandex = /yabrowser/i.test(ua)
  const browser = yandex ? 'Яндекс Браузер' : /samsungbrowser/i.test(ua) ? 'Samsung Internet' : /edg//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : 'Chrome'
  const steps = android ? [
    <>Настройки телефона → <b>Приложения</b> → <b>{browser}</b> → <b>Уведомления</b> → включить</>,
    yandex
      ? <>В Яндекс Браузере: <b>☰</b> → <b>Настройки</b> → <b>Уведомления</b> → <b>Уведомления от сайтов</b> → нажмите <b>«Очистить настройки сайтов»</b> — это снимет прежний запрет</>
      : <>В браузере: <b>⋮</b> → <b>Настройки</b> → <b>Настройки сайтов</b> → <b>Уведомления</b> → включить, у этого сайта — «Разрешить»</>,
    <>Обновите страницу и снова нажмите «Включить уведомления»</>
  ] : [
    <>Нажмите на значок замка или настроек слева от адреса сайта</>,
    <><b>Уведомления</b> → <b>Разрешить</b></>,
    <>Обновите страницу и снова нажмите «Включить уведомления»</>
  ]
  return (
    <ol style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.65 }}>
      {steps.map((s, i) => <li key={i}>{s}</li>)}
    </ol>
  )
}

function PrefToggle({ label, hint, checked, onChange }) {
  return (
    <label className="row between" style={{ minHeight: 52, cursor: 'pointer', gap: 16, borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
      <span><b style={{ fontWeight: 650, display: 'block' }}>{label}</b><span className="small muted">{hint}</span></span>
      <span className="switch"><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} /><span /></span>
    </label>
  )
}

// Карточка на главной: предлагает включить push, пока человек не включил или не закрыл её
export function PushPrompt() {
  const toast = useToast()
  const [state, setState] = useState(null)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('pushPromptHidden') === '1' } catch { return false } })
  useEffect(() => { if (!hidden) pushState().then(setState).catch(() => setState('unsupported')) }, [hidden])

  if (hidden || !['off', 'ios-install'].includes(state)) return null
  const hide = () => { try { localStorage.setItem('pushPromptHidden', '1') } catch {} ; setHidden(true) }

  async function on() {
    try { await enablePush(); toast('Уведомления включены', 'success'); api.pushTest().catch(() => {}); setState('on') }
    catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className="card push-prompt">
      <span className="push-ico"><Icon.bell size={22} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Не пропускай дедлайны и награды</b>
        <p className="small muted" style={{ margin: '2px 0 10px' }}>
          {state === 'ios-install' && isIOS() ? 'Добавь сайт на экран «Домой» — тогда уведомления будут приходить, как от приложения' : 'Уведомления придут на телефон, даже когда сайт закрыт'}
        </p>
        <div className="row wrap" style={{ gap: 8 }}>
          {state === 'off' ? <button className="btn sm" onClick={on}>Включить</button> : <Link className="btn sm" to="/settings">Как это сделать</Link>}
          <button className="btn ghost sm" onClick={hide}>Не сейчас</button>
        </div>
      </div>
    </div>
  )
}
