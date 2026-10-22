import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, PageSkeleton, ProgressBar, LevelRing, LoadError, useLoad, plural, daysLabel, IMPORTANCE, iconSrc } from '../ui'

export { plural }

export default function Dashboard() {
  const { user, branch } = useApp()
  const { data, error, reload } = useLoad(() => api.dashboard(), [])

  if (error) return <main className="page"><LoadError error={error} onRetry={reload} /></main>
  if (!data) return <main className="page"><PageSkeleton /></main>

  const p = user.levelProgress
  const hour = new Date().getHours()
  const greet = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'
  const firstName = user.name.split(' ')[0]

  return (
    <main className="page">
      <section className="hero">
        <div className="row" style={{ alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="muted small bold">{greet}</div>
            <h1 style={{ marginTop: 2 }}>{firstName}</h1>
            <div className="small muted" style={{ marginTop: 2 }}>
              {user.status ? <span className="status-tag">{user.status}</span> : null}
              {user.status && branch ? ' · ' : ''}{branch?.name}
            </div>
          </div>
          <Link to="/profile" aria-label="Уровень и профиль"><LevelRing level={user.level} percent={p.percent} size={72} /></Link>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="row between small" style={{ marginBottom: 7 }}>
            <span className="muted bold">До уровня {user.level + 1}</span>
            <span className="mono bold reward">{p.span - p.current} XP</span>
          </div>
          <ProgressBar percent={p.percent} gold />
        </div>

        <div className="hero-stats">
          <div className="stat"><div className="v reward"><Icon.bolt size={17} />{user.xp.toLocaleString('ru')}</div><div className="k">опыт, XP</div></div>
          <Link to="/shop" className="stat" style={{ color: 'inherit' }}><div className="v reward"><Icon.coin size={17} />{user.coil.toLocaleString('ru')}</div><div className="k">COIL</div></Link>
          <div className="stat"><div className="v reward"><Icon.flame size={17} />{user.streak}</div><div className="k">{plural(user.streak, 'день', 'дня', 'дней')} подряд</div></div>
        </div>
      </section>

      {data.continue ? (
        <Link to={`/lesson/${data.continue.id}`} className="continue-card">
          <span className="play"><Icon.play size={22} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="meta">Продолжить · {data.continue.course}</span>
            <h3 className="ellipsis">{data.continue.title}</h3>
            <span className="meta">урок {Math.min(data.continue.course_done + 1, data.continue.course_total)} из {data.continue.course_total} · ≈{data.continue.minutes} мин</span>
          </span>
          <Icon.arrowR size={20} />
        </Link>
      ) : data.suggestion ? (
        <Link to={`/course/${data.suggestion.id}`} className="continue-card">
          <span className="play"><Icon.book size={22} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="meta">{data.suggestion.done ? 'Продолжи курс' : 'Начни с курса'} · {IMPORTANCE[data.suggestion.importance]?.label.toLowerCase()}</span>
            <h3 className="clamp2">{data.suggestion.title}</h3>
            <span className="meta">{data.suggestion.done} из {data.suggestion.total} {plural(data.suggestion.total, 'урока', 'уроков', 'уроков')}</span>
          </span>
          <Icon.arrowR size={20} />
        </Link>
      ) : data.progress.total > 0 ? (
        <div className="card reward-bg center" style={{ marginTop: 14 }}>
          <Icon.trophy size={26} style={{ color: 'var(--reward-text)' }} />
          <h3 style={{ marginTop: 6, fontSize: 16 }}>Все курсы пройдены</h3>
          <p className="small muted" style={{ marginTop: 4 }}>Новые уроки появятся — пришлём уведомление. А пока потренируй вкусы.</p>
        </div>
      ) : null}

      <div className="dash-grid">
        <div>
          {data.deadlines.length > 0 && (
            <section className="section">
              <div className="section-head"><h2>Ближайшие дедлайны</h2></div>
              <div className="col" style={{ gap: 8 }}>
                {data.deadlines.map(d => {
                  const overdue = d.days_left < 0
                  const soon = d.days_left >= 0 && d.days_left <= 2
                  return (
                    <Link key={d.id} to={`/lesson/${d.id}`} className="list-row">
                      <span className={'list-ico ' + (overdue ? 'danger' : soon ? 'warn' : '')}>
                        {overdue ? <Icon.alert size={19} /> : <Icon.calendar size={19} />}
                      </span>
                      <span className="list-main"><b>{d.title}</b><span>{d.course}</span></span>
                      <span className={`badge ${overdue ? 'danger' : soon ? 'warn' : ''}`}>{daysLabel(d.days_left)}</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <h2>Мой прогресс</h2>
              <Link to="/library">Все курсы</Link>
            </div>
            <div className="card">
              <div className="row between" style={{ marginBottom: 10 }}>
                <span className="small muted bold">Пройдено {data.progress.passed} из {data.progress.total} {plural(data.progress.total, 'урока', 'уроков', 'уроков')}</span>
                <span className="mono bold" style={{ color: 'var(--brand-text)', fontSize: 18 }}>{data.progress.percent}%</span>
              </div>
              <ProgressBar percent={data.progress.percent} />
            </div>
          </section>

          <section className="section">
            <div className="section-head"><h2>Быстрый доступ</h2></div>
            <div className="quick">
              <Link to="/flavors"><Icon.target size={22} style={{ color: 'var(--brand-text)' }} /><div><b>Вкусы</b><br /><span>Тренировка дня</span></div></Link>
              <Link to="/ranking"><Icon.trophy size={22} style={{ color: 'var(--brand-text)' }} /><div><b>Рейтинг</b><br /><span>{data.rank ? `${data.rank.company} место` : 'Вся сеть'}</span></div></Link>
              <Link to="/shop"><Icon.bag size={22} style={{ color: 'var(--brand-text)' }} /><div><b>Магазин</b><br /><span>{user.coil} COIL</span></div></Link>
              <Link to="/themes"><Icon.palette size={22} style={{ color: 'var(--brand-text)' }} /><div><b>Темы</b><br /><span>Оформление</span></div></Link>
            </div>
          </section>
        </div>

        <div>
          {data.rank && (
            <section className="section">
              <div className="section-head"><h2>Моё место</h2><Link to="/ranking">Рейтинг</Link></div>
              <div className="grid2">
                <div className="card tight">
                  <div className="mono" style={{ fontSize: 26, fontWeight: 800 }}>{data.rank.company}<span className="muted small"> / {data.rank.companyTotal}</span></div>
                  <div className="small muted bold">в компании</div>
                </div>
                {data.rank.branch && (
                  <div className="card tight">
                    <div className="mono" style={{ fontSize: 26, fontWeight: 800 }}>{data.rank.branch}<span className="muted small"> / {data.rank.branchTotal}</span></div>
                    <div className="small muted bold">в филиале</div>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head"><h2>Последние награды</h2><Link to="/profile">Все</Link></div>
            {data.recent.length ? (
              <div className="medals" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {data.recent.map(a => (
                  <Link key={a.id} to="/profile" className="medal earned" title={a.title}>
                    <img src={iconSrc(a.icon)} alt={a.title} loading="lazy" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty" style={{ padding: 22 }}>
                <p className="small muted">Пройди первый урок — получишь достижение «Первый шаг»</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
