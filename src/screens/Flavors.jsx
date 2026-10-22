import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Icon, PageSkeleton, ProgressBar, LoadError, PageHead, Tabs, Empty, useLoad, plural } from '../ui'
import { BrandLogo, brandColor } from './flavorUi'

// Тренажёр вкусов в духе Duolingo: путь из брендов, цель дня, серия,
// короткие сессии. Плюс «Коллекция» — справочник всех брендов и вкусов.
export default function Flavors() {
  const nav = useNavigate()
  const { data, error, reload } = useLoad(() => api.flavors(), [])
  const [tab, setTab] = useState('path')
  const [q, setQ] = useState('')

  if (error) return <main className="page"><LoadError error={error} onRetry={reload} /></main>
  if (!data) return <main className="page"><PageSkeleton /></main>
  if (!data.brands.length) return <main className="page"><Empty icon={<Icon.target size={26} />} title="Вкусов пока нет" text="Администратор ещё не добавил бренды и вкусы" /></main>

  const goalDone = data.today.sessions >= data.today.goal
  const work = data.due + Math.min(data.fresh, 4)
  const low = q.trim().toLowerCase()

  return (
    <main className="page">
      <PageHead title="Вкусы" sub={`Знаю ${data.known} из ${data.total} · выучено ${data.mastered}`} />

      <div className="flavor-hero">
        <div className="flavor-hero-stats">
          <div className={'goal-ring' + (goalDone ? ' done' : '')} aria-label={goalDone ? 'Цель дня выполнена' : 'Цель дня — одна тренировка'}>
            {goalDone ? <Icon.check size={26} /> : <Icon.target size={24} />}
          </div>
          <div>
            <b>{goalDone ? 'Цель дня выполнена!' : 'Цель дня — 1 тренировка'}</b>
            <span className="small muted" style={{ display: 'block' }}>
              {data.today.answered ? `Сегодня ${data.today.correct} из ${data.today.answered} верно` : 'Пара минут — и вкусы запоминаются'}
            </span>
          </div>
          <span className="chip-reward" style={{ marginLeft: 'auto' }} title="Дней подряд с тренировкой"><Icon.flame size={16} />{data.streak}</span>
        </div>
        <button className="btn gold block" style={{ marginTop: 14, minHeight: 54, fontSize: 16 }} disabled={!data.quiz} onClick={() => nav('/flavors/session')}>
          <Icon.play size={18} />{work ? `Тренировка дня · ${work} ${plural(work, 'вкус', 'вкуса', 'вкусов')}` : 'Повторить вкусы'}
        </button>
        {data.due > 0 && <p className="tiny muted center" style={{ marginTop: 8 }}>{data.due} {plural(data.due, 'вкус ждёт', 'вкуса ждут', 'вкусов ждут')} повторения</p>}
      </div>

      <div style={{ margin: '22px 0 16px' }}>
        <Tabs value={tab} onChange={setTab} items={[['path', 'Путь'], ['collection', 'Коллекция', data.total]]} />
      </div>

      {tab === 'path' ? (
        <div className="flavor-path">
          {data.brands.map((b, i) => {
            const percent = b.total ? Math.round((b.known / b.total) * 100) : 0
            const done = b.total > 0 && b.mastered === b.total
            return (
              <div key={b.id} className={'path-node ' + (i % 2 ? 'right' : 'left')}>
                <Link to={`/flavors/brand/${b.id}`} className={'path-circle' + (done ? ' done' : '')} style={{ '--c': brandColor(b), '--p': percent }} aria-label={b.name}>
                  <BrandLogo brand={b} size={64} />
                  {done && <span className="path-crown"><Icon.trophy size={16} /></span>}
                </Link>
                <div className="path-label">
                  <b>{b.name}</b>
                  <span className="tiny muted">{b.known}/{b.total} знаю{b.due ? ` · ${b.due} на повтор` : ''}</span>
                  <button className="btn soft xs" style={{ marginTop: 6 }} disabled={!b.quiz} onClick={() => nav(`/flavors/session?brand=${b.id}`)}>
                    <Icon.play size={13} />Учить
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <input className="input" placeholder="Найти бренд" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 14 }} />
          <div className="grid-auto">
            {data.brands.filter(b => !low || b.name.toLowerCase().includes(low)).map(b => (
              <Link key={b.id} to={`/flavors/brand/${b.id}`} className="card hover" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <BrandLogo brand={b} size={56} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block' }}>{b.name}</b>
                  <span className="small muted">{b.total} {plural(b.total, 'вкус', 'вкуса', 'вкусов')}{b.country ? ` · ${b.country}` : ''}</span>
                  <div style={{ marginTop: 8 }}><ProgressBar percent={b.total ? (b.known / b.total) * 100 : 0} thin /></div>
                </div>
              </Link>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 16 }}>В коллекции — все бренды и вкусы магазина: описание, крепость, холод, как рассказать клиенту и с чем миксуют.</p>
        </>
      )}
    </main>
  )
}
