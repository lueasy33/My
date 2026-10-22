import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, PageSkeleton, ProgressBar, LoadError, PageHead, Tabs, Avatar, useLoad, plural } from '../ui'

export default function Analytics() {
  const { user } = useApp()
  const [period, setPeriod] = useState('month')
  const [branch, setBranch] = useState('')
  const { data, error, reload } = useLoad(() => api.analytics({ period, branch }), [period, branch])

  return (
    <main className="page wide">
      <PageHead title="Аналитика"
        sub={branch ? 'Выбранный филиал' : 'Вся сеть'}
        action={<a className="btn ghost sm" href={api.analyticsExportUrl({ period, branch })} download><Icon.download size={16} />Выгрузить в Excel</a>} />

      <div className="row wrap" style={{ gap: 10, marginBottom: 18 }}>
        <Tabs size="sm" value={period} onChange={setPeriod} items={[['week', 'Неделя'], ['month', 'Месяц'], ['quarter', 'Квартал']]} />
        {user.role === 'admin' && data?.branchList?.length > 1 && (
          <select className="select" style={{ width: 'auto', minHeight: 42, fontSize: 14 }} value={branch} onChange={e => setBranch(e.target.value)} aria-label="Филиал">
            <option value="">Все филиалы</option>
            {data.branchList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {error ? <LoadError error={error} onRetry={reload} /> : !data ? <PageSkeleton /> : <Body data={data} period={period} />}
    </main>
  )
}

function Body({ data, period }) {
  const { kpi, people, hard, courseStats, attention, weeks, branches } = data
  const maxLessons = Math.max(1, ...weeks.map(w => w.lessons))
  const pLabel = { week: 'за неделю', month: 'за месяц', quarter: 'за квартал' }[period]

  return (
    <>
      <div className="kpis">
        <Kpi v={`${kpi.activePeriod}/${kpi.people}`} k={`учились ${pLabel}`} delta={kpi.activePeriod - kpi.activePrev} />
        <Kpi v={kpi.passedPeriod} k={`уроков пройдено ${pLabel}`} delta={kpi.passedPeriod - kpi.passedPrev} />
        <Kpi v={`${kpi.avgPercent}%`} k="среднее прохождение" />
        <Kpi v={kpi.overdue} k="просроченных уроков" danger={kpi.overdue > 0} />
      </div>

      <div className="dash-grid" style={{ marginTop: 6 }}>
        <section className="section">
          <div className="section-head"><h2>Динамика · уроки по неделям</h2></div>
          <div className="card">
            <div className="chart-bars" role="img" aria-label="Пройдено уроков по неделям">
              {weeks.map((w, i) => (
                <div key={i} className="b" title={`${w.lessons} уроков, ${w.xp} XP`}>
                  <em>{w.lessons || ''}</em>
                  <i style={{ height: `${(w.lessons / maxLessons) * 100}%`, opacity: i === weeks.length - 1 ? 1 : .65 }} />
                  <span>{w.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2>Требует внимания</h2><Link to="/admin">Просрочки</Link></div>
          {attention.length === 0 ? (
            <div className="empty" style={{ padding: 22 }}><p className="small muted">Отстающих нет</p></div>
          ) : (
            <div className="col" style={{ gap: 6 }}>
              {attention.map(a => (
                <Link key={a.id} to={`/admin/users?open=${a.id}`} className="list-row" style={{ minHeight: 52 }}>
                  <span className="list-ico warn"><Icon.alert size={17} /></span>
                  <span className="list-main"><b>{a.name}</b><span>{a.reason}{a.branch ? ` · ${a.branch}` : ''}</span></span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {branches.length > 1 && (
        <section className="section">
          <div className="section-head"><h2>Филиалы</h2><span className="small muted">средний XP на человека — честно для маленьких точек</span></div>
          <div className="table-wrap">
            <table className="dtable">
              <thead><tr><th>Филиал</th><th>Людей</th><th>Прохождение</th><th>Средний балл</th><th>Просрочки</th><th>XP на чел.</th></tr></thead>
              <tbody>
                {branches.map(b => (
                  <tr key={b.id}>
                    <td className="bold">{b.name}</td>
                    <td>{b.people}</td>
                    <td style={{ minWidth: 140 }}><div className="row" style={{ gap: 8 }}><span className="mono" style={{ width: 36 }}>{b.percent}%</span><div style={{ flex: 1 }}><ProgressBar percent={b.percent} thin /></div></div></td>
                    <td className="mono">{b.avg_score ? `${b.avg_score}%` : '—'}</td>
                    <td style={{ color: b.overdue ? 'var(--danger-text)' : undefined }} className="mono">{b.overdue}</td>
                    <td className="mono reward">{b.avg_xp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="dash-grid">
        <section className="section">
          <div className="section-head"><h2>Курсы</h2><span className="small muted">прошли целиком</span></div>
          <div className="col" style={{ gap: 8 }}>
            {courseStats.map(c => (
              <div key={c.id} className="card tight">
                <div className="row between" style={{ marginBottom: 8, gap: 10 }}>
                  <span className="bold" style={{ fontSize: 14 }}>{c.title}</span>
                  <span className="small muted bold" style={{ flex: 'none' }}>{c.finished} из {kpi.people}</span>
                </div>
                <ProgressBar percent={c.percent} />
                {c.started > c.finished && <p className="tiny muted" style={{ marginTop: 6 }}>Начали, но не закончили: {c.started - c.finished}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2>Проблемные вопросы</h2></div>
          {hard.length === 0 ? (
            <div className="empty" style={{ padding: 22 }}><p className="small muted">Ошибок пока нет</p></div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {hard.map(h => (
                <div key={h.id} className="card tight">
                  <p className="small bold" style={{ lineHeight: 1.45 }}>{h.prompt}</p>
                  <div className="row between" style={{ marginTop: 6 }}>
                    <span className="tiny muted">{h.lesson}</span>
                    <span className="badge danger">{h.rate}% ошибок · {h.tries} {plural(h.tries, 'ответ', 'ответа', 'ответов')}</span>
                  </div>
                </div>
              ))}
              <p className="tiny muted">Частые ошибки — сигнал, что материал непонятен или вопрос сформулирован неудачно</p>
            </div>
          )}
        </section>
      </div>

      <PeopleTable people={people} />
    </>
  )
}

function PeopleTable({ people }) {
  const [sort, setSort] = useState({ key: 'percent', dir: -1 })
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const low = q.trim().toLowerCase()
    return people
      .filter(p => !low || p.name.toLowerCase().includes(low) || String(p.branch || '').toLowerCase().includes(low))
      .sort((a, b) => {
        const x = a[sort.key] ?? '', y = b[sort.key] ?? ''
        return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'ru')) * sort.dir
      })
  }, [people, sort, q])
  const th = (key, label) => (
    <th className="sortable" onClick={() => setSort(s => ({ key, dir: s.key === key ? -s.dir : -1 }))} aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      {label}{sort.key === key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
    </th>
  )
  return (
    <section className="section">
      <div className="section-head">
        <h2>Сотрудники · {people.length}</h2>
        <input className="input" style={{ maxWidth: 240, minHeight: 40, fontSize: 14 }} placeholder="Найти по имени" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table className="dtable">
          <thead><tr>{th('name', 'Сотрудник')}{th('branch', 'Филиал')}{th('level', 'Ур.')}{th('percent', 'Прохождение')}{th('avg_score', 'Балл')}{th('overdue', 'Просрочки')}{th('xp_period', 'XP за период')}{th('last_active_day', 'Был')}</tr></thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id}>
                <td><Link to={`/admin/users?open=${p.id}`} className="bold" style={{ color: 'var(--text-primary)' }}>{p.name}</Link></td>
                <td className="muted">{p.branch || '—'}</td>
                <td className="mono">{p.level}</td>
                <td style={{ minWidth: 130 }}><div className="row" style={{ gap: 8 }}><span className="mono" style={{ width: 36 }}>{p.percent}%</span><div style={{ flex: 1 }}><ProgressBar percent={p.percent} thin /></div></div></td>
                <td className="mono" style={{ color: p.avg_score && p.avg_score < 60 ? 'var(--danger-text)' : undefined }}>{p.avg_score ? `${p.avg_score}%` : '—'}</td>
                <td className="mono" style={{ color: p.overdue ? 'var(--danger-text)' : undefined }}>{p.overdue}</td>
                <td className="mono reward">{p.xp_period}</td>
                <td className="muted small">{p.last_active_day ? new Date(p.last_active_day).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : 'не заходил'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Kpi({ v, k, danger, delta }) {
  return (
    <div className="kpi">
      <div className="v" style={{ color: danger ? 'var(--danger-text)' : undefined }}>{v}</div>
      <div className="k">{k}</div>
      {delta !== undefined && delta !== 0 && (
        <div className={'d ' + (delta > 0 ? 'up' : 'down')}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)} к прошлому периоду</div>
      )}
    </div>
  )
}
