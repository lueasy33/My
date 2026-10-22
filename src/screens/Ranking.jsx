import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../App'
import { Avatar, PageSkeleton, LoadError, Empty, Tabs, PageHead, Icon, useLoad, plural } from '../ui'

export default function Ranking() {
  const { user } = useApp()
  const [scope, setScope] = useState('company')
  const [period, setPeriod] = useState('month')
  const { data, error, reload } = useLoad(() => api.ranking(scope, period), [scope, period])

  const periodLabel = { week: 'за неделю', month: 'за месяц', all: 'за всё время' }[period]

  return (
    <main className="page narrow">
      <PageHead title="Рейтинг" sub={`По опыту (XP) ${periodLabel}. При равенстве выше тот, кто прошёл больше уроков`} />

      <div className="col" style={{ gap: 10, marginBottom: 18 }}>
        <Tabs value={scope} onChange={setScope} items={[
          ['company', 'Вся компания'],
          ...(user.branch_id ? [['branch', 'Мой филиал']] : []),
          ['branches', 'Филиалы']
        ]} />
        <Tabs size="sm" value={period} onChange={setPeriod} items={[['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё время']]} />
      </div>

      {error ? <LoadError error={error} onRetry={reload} />
        : !data ? <PageSkeleton />
        : data.rows.length === 0 ? <Empty icon={<Icon.trophy size={26} />} title="Пока пусто" text="За этот период ещё никто не набрал опыт" />
        : data.scope === 'branches' ? <Branches rows={data.rows} />
        : <People rows={data.rows} me={data.me} total={data.total} />}
    </main>
  )
}

function People({ rows, me, total }) {
  const top = rows.slice(0, 3)
  const rest = rows.slice(3)
  const meVisible = me && rows.some(r => r.me)
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top
  return (
    <>
      {top.length === 3 && (
        <div className="podium">
          {order.map(p => (
            <div key={p.user_id} className={`podium-col p${p.rank}`}>
              <Avatar id={p.avatar_id} size={p.rank === 1 ? 64 : 52} ring={p.rank === 1} />
              <div className="place">{p.rank}</div>
              <b>{p.name.split(' ')[0]}</b>
              <div className="mono bold reward small">{p.xp.toLocaleString('ru')} XP</div>
            </div>
          ))}
        </div>
      )}
      <div className="col" style={{ gap: 6 }}>
        {(top.length === 3 ? rest : rows).map(p => <Row key={p.user_id} p={p} />)}
      </div>
      {me && !meVisible && (
        <div className="rank-me-sticky"><Row p={me} /></div>
      )}
      {me && <p className="small muted center" style={{ marginTop: 14 }}>Ты на {me.rank} месте из {total}</p>}
    </>
  )
}

function Row({ p }) {
  return (
    <div className={'rank-row' + (p.me ? ' me' : '')}>
      <span className="place" style={{ color: p.rank <= 3 ? 'var(--reward-text)' : undefined }}>{p.rank}</span>
      <Avatar id={p.avatar_id} size={38} />
      <div className="list-main">
        <b>{p.name}{p.me ? ' · ты' : ''}</b>
        <span>{p.status ? <span className="status-tag">{p.status}</span> : null}{p.status ? ' · ' : ''}{p.branch || 'Без филиала'} · {p.level} ур.</span>
      </div>
      <div className="mono bold reward" style={{ fontSize: 15 }}>{p.xp.toLocaleString('ru')}</div>
    </div>
  )
}

function Branches({ rows }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      <p className="small muted" style={{ marginBottom: 2 }}>Средний XP на сотрудника — чтобы размер точки не решал</p>
      {rows.map(b => (
        <div key={b.id} className={'rank-row' + (b.mine ? ' me' : '')}>
          <span className="place" style={{ color: b.rank <= 3 ? 'var(--reward-text)' : undefined }}>{b.rank}</span>
          <span className="list-ico"><Icon.store size={19} /></span>
          <div className="list-main"><b>{b.branch}{b.mine ? ' · мой' : ''}</b><span>{b.people} {plural(b.people, 'сотрудник', 'сотрудника', 'сотрудников')}</span></div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono bold reward">{b.avg_xp.toLocaleString('ru')}</div>
            <div className="tiny muted">XP в среднем</div>
          </div>
        </div>
      ))}
    </div>
  )
}
