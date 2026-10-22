import { Icon, Modal } from '../ui'

// Цвет бренда: задан админом или выбран по названию — чтобы бренды различались
const PALETTE = ['#7C5CBF', '#E8833A', '#3FA7BF', '#3FBF7F', '#D9577B', '#C69E34', '#5C7CE0', '#9A6B4F']
export function brandColor(b) {
  if (b?.color) return b.color
  const s = String(b?.name || '')
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function BrandLogo({ brand, size = 56 }) {
  const color = brandColor(brand)
  if (brand?.logo) {
    return <span className="brand-logo" style={{ width: size, height: size, '--c': color }}><img src={brand.logo} alt="" /></span>
  }
  const initials = String(brand?.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return <span className="brand-logo" style={{ width: size, height: size, '--c': color, fontSize: size * 0.34 }}>{initials}</span>
}

// Освоение вкуса: 5 делений. 3+ — «знаю», 5 — выучен (корона)
export const MASTERY_LABEL = (box) => box === null || box === undefined ? 'Новый' : box >= 5 ? 'Выучен' : box >= 3 ? 'Знаю' : 'Учу'
export function Mastery({ box }) {
  const b = box ?? -1
  return (
    <span className="mastery" aria-label={`Освоение: ${MASTERY_LABEL(box)}`}>
      {[0, 1, 2, 3, 4].map(i => <i key={i} className={i < b ? 'on' : ''} />)}
      {b >= 5 && <Icon.trophy size={13} style={{ color: 'var(--reward-text)', marginLeft: 3 }} />}
    </span>
  )
}

export const STRENGTH_LABEL = { 'лёгкая': 'Лёгкая', 'средняя': 'Средняя', 'высокая': 'Высокая' }

export function FlavorFacts({ f }) {
  const tags = (f.tags || []).filter(t => !/крепост|холод/.test(t))
  return (
    <div className="col" style={{ gap: 12 }}>
      {f.description && <p style={{ fontSize: 15.5, lineHeight: 1.6 }}>{f.description}</p>}
      <div className="row wrap" style={{ gap: 6 }}>
        {f.strength && <span className="badge"><Icon.bolt size={12} />{STRENGTH_LABEL[f.strength] || f.strength} крепость</span>}
        <span className={'badge' + (f.cold ? ' brand' : '')}>{f.cold ? '❄ С холодом' : 'Без холода'}</span>
        {f.line && <span className="badge">Линейка: {f.line}</span>}
        {tags.map(t => <span key={t} className="badge">{t}</span>)}
      </div>
      {f.tip && (
        <div className="callout tip" style={{ margin: 0 }}>
          <span className="ico"><Icon.message size={18} /></span>
          <div><b>Как рассказать клиенту</b><br />{f.tip}</div>
        </div>
      )}
      {f.mix && (
        <div className="callout" style={{ margin: 0 }}>
          <span className="ico"><Icon.sparkles size={18} /></span>
          <div><b>С чем миксуют</b><br />{f.mix}</div>
        </div>
      )}
    </div>
  )
}

export function FlavorModal({ f, onClose, onTrain }) {
  return (
    <Modal title={f.name} onClose={onClose} width={480}
      footer={onTrain && <button className="btn" onClick={onTrain}><Icon.target size={17} />Тренировать этот бренд</button>}>
      <div className="row" style={{ gap: 14, marginBottom: 14 }}>
        {f.image
          ? <img src={f.image} alt="" className="flavor-img" />
          : <span className="flavor-img placeholder"><Icon.target size={28} /></span>}
        <div>
          <div className="small muted bold">{f.brand}</div>
          <div className="row" style={{ gap: 8, marginTop: 6 }}><Mastery box={f.box} /><span className="small muted">{MASTERY_LABEL(f.box)}</span></div>
          {(f.correct > 0 || f.wrong > 0) && <div className="tiny muted" style={{ marginTop: 4 }}>верно {f.correct} · ошибок {f.wrong}</div>}
        </div>
      </div>
      <FlavorFacts f={f} />
      {!f.in_quiz && <p className="hint" style={{ marginTop: 12 }}>Этот вкус пока не участвует в тренировке</p>}
    </Modal>
  )
}
