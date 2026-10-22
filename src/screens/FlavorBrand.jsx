import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Icon, PageSkeleton, ProgressBar, LoadError, Tabs, Empty, useLoad, plural } from '../ui'
import { BrandLogo, Mastery, FlavorModal, brandColor, STRENGTH_LABEL } from './flavorUi'

// Бренд: описание и вся коллекция его вкусов. Отсюда — тренировка по бренду.
export default function FlavorBrand() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, error, reload } = useLoad(() => api.flavorBrand(id), [id])
  const [open, setOpen] = useState(null)
  const [filter, setFilter] = useState('all')

  if (error) return <main className="page"><LoadError error={error} onRetry={reload} /></main>
  if (!data) return <main className="page"><PageSkeleton /></main>

  const { brand, flavors } = data
  const known = flavors.filter(f => (f.box ?? -1) >= 3).length
  const quiz = flavors.filter(f => f.in_quiz).length
  const list = flavors.filter(f =>
    filter === 'new' ? f.box === null : filter === 'learning' ? f.box !== null && f.box < 3 : filter === 'known' ? (f.box ?? -1) >= 3 : true)

  return (
    <main className="page">
      <button className="btn ghost sm plain" style={{ marginLeft: -10, marginBottom: 8 }} onClick={() => nav('/flavors')}>
        <Icon.chevL size={18} /> Все бренды
      </button>

      <section className="hero" style={{ '--c': brandColor(brand) }}>
        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
          <BrandLogo brand={brand} size={76} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{brand.name}</h1>
            <div className="small muted">{flavors.length} {plural(flavors.length, 'вкус', 'вкуса', 'вкусов')}{brand.country ? ` · ${brand.country}` : ''}</div>
          </div>
        </div>
        {brand.description && <p style={{ marginTop: 14, fontSize: 15 }}>{brand.description}</p>}
        <div style={{ marginTop: 16 }}>
          <div className="row between small" style={{ marginBottom: 7 }}>
            <span className="muted bold">Знаю {known} из {flavors.length}</span>
            <span className="mono bold reward">{flavors.length ? Math.round((known / flavors.length) * 100) : 0}%</span>
          </div>
          <ProgressBar percent={flavors.length ? (known / flavors.length) * 100 : 0} gold />
        </div>
        <button className="btn block" style={{ marginTop: 16 }} disabled={!quiz} onClick={() => nav(`/flavors/session?brand=${brand.id}`)}>
          <Icon.play size={17} />{quiz ? `Учить вкусы ${brand.name}` : 'Вкусы бренда ещё не готовы к тренировке'}
        </button>
      </section>

      <div style={{ margin: '22px 0 14px' }}>
        <Tabs size="sm" value={filter} onChange={setFilter} items={[
          ['all', 'Все', flavors.length],
          ['new', 'Новые', flavors.filter(f => f.box === null).length],
          ['learning', 'Учу', flavors.filter(f => f.box !== null && f.box < 3).length],
          ['known', 'Знаю', known]
        ]} />
      </div>

      {list.length === 0 ? <Empty icon={<Icon.target size={26} />} title="Здесь пусто" /> : (
        <div className="flavor-grid">
          {list.map(f => (
            <button key={f.id} className={'flavor-tile' + ((f.box ?? -1) >= 5 ? ' mastered' : '')} onClick={() => setOpen(f)}>
              {f.image ? <img src={f.image} alt="" className="flavor-tile-img" /> : <span className="flavor-tile-img placeholder" style={{ '--c': brandColor(brand) }}>{f.name.slice(0, 1)}</span>}
              <b>{f.name}</b>
              <span className="tiny muted clamp2">{f.description || 'Описание скоро появится'}</span>
              <span className="row wrap" style={{ gap: 4, justifyContent: 'center' }}>
                {f.strength && <span className="badge">{STRENGTH_LABEL[f.strength]}</span>}
                {f.cold && <span className="badge brand">❄</span>}
              </span>
              <Mastery box={f.box} />
            </button>
          ))}
        </div>
      )}

      {open && <FlavorModal f={{ ...open, brand: brand.name }} onClose={() => setOpen(null)} onTrain={open.in_quiz ? () => nav(`/flavors/session?brand=${brand.id}`) : null} />}
    </main>
  )
}
