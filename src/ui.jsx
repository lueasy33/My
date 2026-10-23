import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'

/* ─── Иконки: линейные, 1.9px, скруглённые концы (Lucide-стиль) ─── */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }
function Svg({ children, size = 22, ...p }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...S} {...p}>{children}</svg>
}
export const Icon = {
  home: (p) => <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.5 20v-5.5h5V20" /></Svg>,
  book: (p) => <Svg {...p}><path d="M4 4.5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H4z" /><path d="M20 4.5h-6a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H20z" /></Svg>,
  search: (p) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Svg>,
  gift: (p) => <Svg {...p}><rect x="3.5" y="8" width="17" height="4" rx="1" /><path d="M5 12v8.5h14V12" /><path d="M12 8v12.5" /><path d="M12 8c-1.5-3.5-5.5-3.5-5.5-1S10 8 12 8c2 0 5.5 1.5 5.5-1s-4-2.5-5.5 1" /></Svg>,
  bag: (p) => <Svg {...p}><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></Svg>,
  user: (p) => <Svg {...p}><circle cx="12" cy="8.5" r="3.6" /><path d="M4.8 20a7.4 7.4 0 0 1 14.4 0" /></Svg>,
  flame: (p) => <Svg {...p}><path d="M12 20c3.3 0 6-2.4 6-5.4 0-2.1-1.1-3.8-2.6-5.3C13.9 7.8 12.8 5.6 13 3c-2.7 1.3-5 3.6-5 6.6 0 1 .2 1.8.6 2.5-.9-.2-1.7-.9-2.1-1.9-.9 1.3-1.5 2.9-1.5 4.4C5 17.6 8.7 20 12 20Z" /></Svg>,
  bolt: (p) => <Svg {...p}><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" /></Svg>,
  coin: (p) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M14.6 9.2a3.2 3.2 0 1 0 0 5.6" /></Svg>,
  star: (p) => <Svg {...p}><path d="m12 3.5 2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.1 5.9-.9z" /></Svg>,
  check: (p) => <Svg {...p}><path d="m4.5 12.5 5 5 10-11" /></Svg>,
  chevL: (p) => <Svg {...p}><path d="m14.5 5-7 7 7 7" /></Svg>,
  chevR: (p) => <Svg {...p}><path d="m9.5 5 7 7-7 7" /></Svg>,
  chevU: (p) => <Svg {...p}><path d="m5 14.5 7-7 7 7" /></Svg>,
  chevD: (p) => <Svg {...p}><path d="m5 9.5 7 7 7-7" /></Svg>,
  lock: (p) => <Svg {...p}><rect x="4.5" y="10" width="15" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></Svg>,
  bell: (p) => <Svg {...p}><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></Svg>,
  clock: (p) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.3l3.3 2" /></Svg>,
  calendar: (p) => <Svg {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></Svg>,
  alert: (p) => <Svg {...p}><path d="M12 4 2.8 20h18.4z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.5" r=".9" fill="currentColor" /></Svg>,
  info: (p) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".9" fill="currentColor" /></Svg>,
  sparkles: (p) => <Svg {...p}><path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9z" /><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></Svg>,
  trophy: (p) => <Svg {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5.5H5.5v2A3 3 0 0 0 8 10.5" /><path d="M16 5.5h2.5v2A3 3 0 0 1 16 10.5" /><path d="M12 13v3.5" /><path d="M8.5 20h7l-.7-3.5h-5.6z" /></Svg>,
  palette: (p) => <Svg {...p}><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.9 0-1.6-1.6-1.6-1.6-3 0-1 .9-1.8 2-1.8h1.9a4.2 4.2 0 0 0 4.2-4.2c0-3.4-3.6-6.1-8.5-6.1Z" /><circle cx="7.5" cy="11" r="1.1" fill="currentColor" /><circle cx="10" cy="7.5" r="1.1" fill="currentColor" /><circle cx="15" cy="8" r="1.1" fill="currentColor" /></Svg>,
  grid: (p) => <Svg {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" /></Svg>,
  list: (p) => <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></Svg>,
  chart: (p) => <Svg {...p}><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 20v-6" /><path d="M13 20V9" /><path d="M18 20v-9" /></Svg>,
  users: (p) => <Svg {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19a6 6 0 0 1 12 0" /><path d="M16 6.2a3 3 0 0 1 0 5.6" /><path d="M17.5 19a5.6 5.6 0 0 0-2-4.3" /></Svg>,
  store: (p) => <Svg {...p}><path d="M4 9.5V20h16V9.5" /><path d="M3 9.5 5 4h14l2 5.5a3 3 0 0 1-5.4 1.4 3 3 0 0 1-4.6 0 3 3 0 0 1-4.6 0A3 3 0 0 1 3 9.5Z" /></Svg>,
  settings: (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M19.8 7.5l-1.9 1.1M6.1 15.4l-1.9 1.1" /></Svg>,
  plus: (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  x: (p) => <Svg {...p}><path d="m6 6 12 12M18 6 6 18" /></Svg>,
  arrowR: (p) => <Svg {...p}><path d="M4 12h15" /><path d="m13.5 6 6 6-6 6" /></Svg>,
  copy: (p) => <Svg {...p}><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9" /></Svg>,
  refresh: (p) => <Svg {...p}><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.5h-4.5" /></Svg>,
  logout: (p) => <Svg {...p}><path d="M15 8V5.5a2 2 0 0 0-2-2H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H13a2 2 0 0 0 2-2V16" /><path d="M10 12h10" /><path d="m17 9 3 3-3 3" /></Svg>,
  play: (p) => <Svg {...p}><path d="M8 5.5v13l11-6.5z" /></Svg>,
  file: (p) => <Svg {...p}><path d="M6 3.5h7l5 5V20.5H6z" /><path d="M13 3.5V9h5" /></Svg>,
  image: (p) => <Svg {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="9.5" r="1.8" /><path d="m20.5 15.5-5-5-9 9" /></Svg>,
  video: (p) => <Svg {...p}><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="m16 10.5 5-3v9l-5-3" /></Svg>,
  text: (p) => <Svg {...p}><path d="M5 6.5V5h14v1.5" /><path d="M12 5v14" /><path d="M9.5 19h5" /></Svg>,
  upload: (p) => <Svg {...p}><path d="M12 15.5V4" /><path d="m7.5 8.5 4.5-4.5 4.5 4.5" /><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" /></Svg>,
  download: (p) => <Svg {...p}><path d="M12 4v11.5" /><path d="m7.5 11 4.5 4.5 4.5-4.5" /><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" /></Svg>,
  trash: (p) => <Svg {...p}><path d="M4.5 7h15" /><path d="M9.5 7V4.5h5V7" /><path d="M6.5 7l1 13h9l1-13" /></Svg>,
  edit: (p) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></Svg>,
  eye: (p) => <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></Svg>,
  eyeOff: (p) => <Svg {...p}><path d="M4 4l16 16" /><path d="M10.6 6.6A8.8 8.8 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a15 15 0 0 1-2.7 3.3M6.6 8.1A15 15 0 0 0 2.5 12S6 18.5 12 18.5a8.6 8.6 0 0 0 3.6-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Svg>,
  target: (p) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></Svg>,
  shield: (p) => <Svg {...p}><path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></Svg>,
  message: (p) => <Svg {...p}><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 16V7A1.5 1.5 0 0 1 5 5.5Z" /></Svg>,
  phone: (p) => <Svg {...p}><path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" /></Svg>,
  archive: (p) => <Svg {...p}><rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5" /><path d="M5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="M10 13h4" /></Svg>,
  drag: (p) => <Svg {...p}><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" /></Svg>,
  more: (p) => <Svg {...p}><circle cx="5.5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18.5" cy="12" r="1.2" fill="currentColor" /></Svg>,
  medal: (p) => <Svg {...p}><circle cx="12" cy="14.5" r="5.5" /><path d="M8.5 10 6 3.5h4l2 4.5 2-4.5h4L15.5 10" /><path d="m12 12.3.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z" /></Svg>
}

/* ─── Тосты ─────────────────────────────────────────────────── */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((msg, tone = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setItems(v => [...v.slice(-2), { id, msg, tone }])
    setTimeout(() => setItems(v => v.filter(x => x.id !== id)), 3400)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={'toast ' + t.tone}>
            {t.tone === 'error' ? <Icon.alert size={16} /> : t.tone === 'success' ? <Icon.check size={16} /> : <Icon.info size={16} />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ─── Скелетон ──────────────────────────────────────────────── */
export function Skeleton({ h = 16, w = '100%', r = 8, style }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} />
}

export function PageSkeleton() {
  return (
    <div className="col" style={{ gap: 14 }} aria-busy="true" aria-label="Загрузка">
      <Skeleton h={28} w="45%" r={8} />
      <Skeleton h={110} r={18} />
      <div className="grid2">
        <Skeleton h={80} r={16} /><Skeleton h={80} r={16} />
      </div>
      <Skeleton h={140} r={18} />
    </div>
  )
}

/* ─── Ошибка загрузки ───────────────────────────────────────── */
export function LoadError({ error, onRetry }) {
  return (
    <div className="card center" style={{ padding: '32px 20px' }}>
      <div style={{ color: 'var(--danger-text)', display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Icon.alert size={28} /></div>
      <h3 style={{ fontSize: 16 }}>Не получилось загрузить</h3>
      <p className="muted small" style={{ marginTop: 6 }}>{error?.status === 0 || !navigator.onLine ? 'Похоже, пропал интернет.' : error?.message || 'Попробуйте ещё раз.'}</p>
      {onRetry && <button className="btn ghost sm" style={{ marginTop: 14 }} onClick={onRetry}><Icon.refresh size={15} /> Повторить</button>}
    </div>
  )
}

// Загрузка данных экрана со скелетоном и повтором при ошибке
// Данные привязаны к тому, для чего их запросили (deps). Раньше после смены вкладки
// экран один кадр рисовался со старыми данными другой вкладки и падал
// (рейтинг: «Вся компания» → «Филиалы» давал пустой экран).
export function useLoad(fn, deps = []) {
  const key = JSON.stringify(deps)
  const [state, setState] = useState({ key: null, data: null, error: null })
  const load = useCallback(async () => {
    setState(s => ({ ...s, error: null }))
    try {
      const data = await fn()
      setState({ key, data, error: null })
    } catch (e) { setState({ key, data: null, error: e }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { load() }, [load])
  const fresh = state.key === key
  const setData = useCallback((v) => setState(s => ({ ...s, data: typeof v === 'function' ? v(s.data) : v })), [])
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, reload: load, setData }
}

/* ─── Модальное окно ────────────────────────────────────────── */
export function Modal({ title, onClose, children, width = 440, footer }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    document.body.classList.add('no-scroll')
    return () => { window.removeEventListener('keydown', h); document.body.classList.remove('no-scroll') }
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <div className="modal-head">
          <h3>{title}</h3>
          {onClose && <button className="btn ghost sm icon plain" onClick={onClose} aria-label="Закрыть"><Icon.x size={18} /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

// Подтверждение вместо window.confirm: понятный текст и явная опасная кнопка
export function useConfirm() {
  const [state, setState] = useState(null)
  const ask = useCallback((opts) => new Promise(resolve => setState({ ...opts, resolve })), [])
  const close = (v) => { state?.resolve(v); setState(null) }
  const node = state && (
    <Modal title={state.title || 'Подтвердите'} onClose={() => close(false)} width={400}
      footer={<>
        <button className="btn ghost" onClick={() => close(false)}>{state.cancel || 'Отмена'}</button>
        <button className={'btn ' + (state.danger ? 'danger-fill' : '')} onClick={() => close(true)}>{state.ok || 'Да'}</button>
      </>}>
      {state.text && <p className="muted" style={{ fontSize: 14.5 }}>{state.text}</p>}
    </Modal>
  )
  return [ask, node]
}

/* ─── Окно награды ──────────────────────────────────────────── */
const KIND_LABEL = {
  achievement: 'Достижение', level: 'Новый уровень', course: 'Курс пройден', avatar: 'Аватарка',
  status: 'Статус', theme: 'Тема оформления', review: 'Ответ зачтён', lesson: 'Урок пройден', prize: 'Приз заказан'
}

function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    const notes = [659.25, 880, 1318.5]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'triangle'; o.frequency.value = f
      const t = ctx.currentTime + i * 0.11
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.55)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch {}
}

// Короткий звук ответа в тренажёре: два тона вверх — верно, низкий — ошибка
export function answerSound(ok) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    const notes = ok ? [784, 1046.5] : [220]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = ok ? 'triangle' : 'sine'; o.frequency.value = f
      const t = ctx.currentTime + i * 0.09
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.3)
    })
    setTimeout(() => ctx.close(), 800)
  } catch {}
}

function Confetti() {
  const colors = ['var(--reward-500)', 'var(--reward-300)', 'var(--brand-500)', 'var(--brand-text)', 'var(--ember)']
  const [bits] = useState(() => Array.from({ length: 42 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.35, dur: 1.6 + Math.random() * 1.1,
    rot: Math.random() * 360, drift: (Math.random() - 0.5) * 120, color: colors[i % colors.length],
    w: 6 + Math.random() * 5, h: 9 + Math.random() * 7, round: Math.random() > 0.7
  })))
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{
          left: b.left + '%', background: b.color, width: b.w, height: b.round ? b.w : b.h,
          borderRadius: b.round ? 99 : 2, animationDelay: b.delay + 's', animationDuration: b.dur + 's',
          '--rot': b.rot + 'deg', '--drift': b.drift + 'px'
        }} />
      ))}
    </div>
  )
}

export function RewardWindow({ items, onClose, sound = true, reduceMotion = false }) {
  const [idx, setIdx] = useState(0)
  const item = items[idx]
  const calm = reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  useEffect(() => { if (item && sound) chime() }, [idx, item, sound])
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  if (!item) return null

  const isLast = idx >= items.length - 1
  const visual = item.avatar
    ? <img className="reward-avatar" src={avatarSrc(item.avatar, 256)} alt="" />
    : item.kind === 'level'
      ? <div className="reward-level"><span>{item.level}</span></div>
      : (item.kind === 'status' || item.kind === 'prize') && item.image
        ? <img src={item.image} alt="" />
        : ['theme', 'status', 'prize'].includes(item.kind)
          ? <div className="reward-level">{item.kind === 'theme' ? <Icon.palette size={44} /> : item.kind === 'prize' ? <Icon.gift size={44} /> : <Icon.star size={44} />}</div>
          : <img src={iconSrc(item.icon)} alt="" />

  return (
    <div className="overlay reward-overlay" role="dialog" aria-modal="true" aria-label="Награда">
      {!calm && <Confetti key={idx} />}
      <div className={'reward-card' + (calm ? ' calm' : '')} key={idx}>
        <div className="reward-glow" aria-hidden="true" />
        <div className="reward-medal">{visual}</div>
        <div className="eyebrow reward">{KIND_LABEL[item.kind] || 'Награда'}</div>
        <h2 className="reward-title">{item.title}</h2>
        {item.description && <p className="muted" style={{ marginTop: 6, fontSize: 14.5 }}>{item.description}</p>}
        {item.unlocked?.length > 0 && (
          <p className="small" style={{ marginTop: 8 }}>Открыта тема: <b>{item.unlocked.join(', ')}</b></p>
        )}
        {item.extras?.length > 0 && <p className="small" style={{ marginTop: 8 }}>А ещё: <b>{item.extras.join(', ')}</b></p>}
        {item.note && <p className="reward-note">{item.note}</p>}

        {(item.xp > 0 || item.coil > 0) && (
          <div className="reward-xp">
            {item.xp > 0 && <span className="chip-reward"><Icon.bolt size={16} />+{item.xp} XP</span>}
            {item.coil > 0 && <span className="chip-reward"><Icon.coin size={16} />+{item.coil} COIL</span>}
          </div>
        )}

        <button className="btn block gold" style={{ marginTop: 20 }} autoFocus onClick={() => isLast ? onClose() : setIdx(i => i + 1)}>
          {isLast ? 'Забрать' : `Дальше · ${idx + 2} из ${items.length}`}
        </button>
        {items.length > 1 && !isLast && (
          <button className="btn ghost block plain" style={{ marginTop: 6 }} onClick={onClose}>Пропустить всё</button>
        )}
      </div>
    </div>
  )
}

/* ─── Мелкие блоки ──────────────────────────────────────────── */
export function Avatar({ id = 'ava_01_ugolek', size = 40, ring }) {
  return (
    <img className={'avatar' + (ring ? ' ring' : '')} src={avatarSrc(id, size > 64 ? 256 : 128)}
      width={size} height={size} alt="" style={{ width: size, height: size }}
      onError={e => { e.currentTarget.src = '/assets/webp-128/ava_01_ugolek.webp' }} />
  )
}

// Кольцо уровня: золото — это награда, поэтому прогресс уровня золотой
export function LevelRing({ level, percent, size = 64 }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="level-ring" style={{ width: size, height: size }} aria-label={`Уровень ${level}, ${percent}% до следующего`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#gold)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, percent) / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .8s var(--ease-out)' }} />
        <defs>
          <linearGradient id="gold" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--reward-300)" /><stop offset="1" stopColor="var(--reward-500)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="level-ring-num">
        <b>{level}</b>
        <span>ур.</span>
      </div>
    </div>
  )
}

export function Empty({ icon = <Icon.book size={28} />, title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon}</div>
      <h3 style={{ fontSize: 16 }}>{title}</h3>
      {text && <p className="muted small" style={{ marginTop: 6, maxWidth: 360, marginInline: 'auto' }}>{text}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

export function ProgressBar({ percent, gold, thin }) {
  return (
    <div className={`bar ${gold ? 'gold' : ''} ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  )
}

// Вкладки-категории. Подсветка выбранной плавно переезжает, а сама вкладка
// прокручивается в видимую область, если их больше, чем помещается.
export function Tabs({ value, onChange, items, size }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const measure = () => {
      const el = box.querySelector('button[aria-selected="true"]')
      if (!el) return setPos(null)
      setPos({ x: el.offsetLeft, w: el.offsetWidth })
    }
    measure()
    const el = box.querySelector('button[aria-selected="true"]')
    if (el && box.scrollWidth > box.clientWidth) {
      box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' })
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(box)
    return () => ro?.disconnect()
  }, [value, items.length])
  return (
    <div ref={ref} className={'segmented' + (size === 'sm' ? ' sm' : '') + (pos ? ' slide' : '')} role="tablist">
      {pos && <span className="seg-indicator" aria-hidden="true" style={{ '--x': pos.x - 4 + 'px', '--w': pos.w + 'px', left: 4 }} />}
      {items.map(([k, label, count]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {label}{count !== undefined && count !== null && <span className="count">{count}</span>}
        </button>
      ))}
    </div>
  )
}

export function PageHead({ title, sub, action, back }) {
  return (
    <div className="page-head">
      <div className="row" style={{ gap: 10, minWidth: 0 }}>
        {back}
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {sub && <p className="muted small" style={{ marginTop: 3 }}>{sub}</p>}
        </div>
      </div>
      {action && <div className="row" style={{ gap: 8, flex: 'none' }}>{action}</div>}
    </div>
  )
}

/* ─── Форматирование ────────────────────────────────────────── */
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

// SQLite хранит время в UTC без «Z» — без суффикса браузер прочитал бы его как местное
export function parseDate(s) {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00')
  return new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') || String(s).includes('+') ? '' : 'Z'))
}

export function fmtDate(s, opts = { day: 'numeric', month: 'short' }) {
  const d = parseDate(s)
  return d ? d.toLocaleDateString('ru', opts) : ''
}

export function fmtAgo(s) {
  const d = parseDate(s)
  if (!d) return ''
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`
  const days = Math.round(h / 24)
  if (days < 7) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

export function daysLabel(n) {
  if (n === 0) return 'сегодня'
  if (n === 1) return 'завтра'
  if (n < 0) return `просрочен на ${-n} ${plural(-n, 'день', 'дня', 'дней')}`
  return `через ${n} ${plural(n, 'день', 'дня', 'дней')}`
}

export function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' КБ'
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' МБ'
}

export const IMPORTANCE = {
  required: { label: 'Обязательный', cls: 'badge danger' },
  recommended: { label: 'Рекомендуемый', cls: 'badge warn' },
  extra: { label: 'Дополнительный', cls: 'badge' }
}

export const ROLE_LABEL = { admin: 'Администратор', employee: 'Сотрудник' }

// Редкость статуса (бриф 10.3): обычный, редкий, легендарный
export const RARITY = {
  common: { label: 'Обычный', cls: 'badge' },
  rare: { label: 'Редкий', cls: 'badge brand' },
  legendary: { label: 'Легендарный', cls: 'badge gold' }
}

/* ─── Картинки: готовые из набора или загруженные админом ──────── */
// Загруженная картинка хранится адресом (/uploads/…), готовая — кодом файла из набора.
const isUrl = (s) => /^(\/|https?:)/.test(String(s || ''))
export function avatarSrc(id, size = 128) {
  if (isUrl(id)) return id
  return `/assets/webp-${size >= 200 ? 256 : 128}/${id || 'ava_01_ugolek'}.webp`
}
export function iconSrc(icon) {
  if (isUrl(icon)) return icon
  return `/assets/svg/${icon || 'ach_01_pervyy-shag'}.svg`
}
