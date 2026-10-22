import { Link, useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, PageSkeleton, ProgressBar, LoadError, useLoad, useToast, plural, daysLabel, IMPORTANCE } from '../ui'
import { Cover, categoryColor } from './Library'

export default function Course() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useApp()
  const { data, error, reload } = useLoad(() => api.course(id), [id])

  if (error) return <main className="page"><LoadError error={error} onRetry={reload} /></main>
  if (!data) return <main className="page"><PageSkeleton /></main>

  const { course, lessons, next_lesson_id, reward } = data
  const imp = IMPORTANCE[course.importance] || IMPORTANCE.extra
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const staff = user.role !== 'employee'

  return (
    <main className="page narrow">
      <button className="btn ghost sm plain" style={{ marginLeft: -10, marginBottom: 8 }} onClick={() => nav(-1)}>
        <Icon.chevL size={18} /> Назад
      </button>

      <div className="row" style={{ gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
        <Cover id={course.cover} complete={course.complete} size={76} color={categoryColor(course.category_id, course.category_color)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
            <span className="badge">{course.category || 'Без категории'}</span>
            {course.complete ? <span className="badge success"><Icon.check size={12} />Пройден</span> : <span className={imp.cls}>{imp.label}</span>}
            {!course.published && <span className="badge warn">Черновик</span>}
          </div>
          <h1 style={{ fontSize: 23, lineHeight: 1.25 }}>{course.title}</h1>
        </div>
      </div>
      {course.description && <p className="muted" style={{ marginBottom: 18, fontSize: 15 }}>{course.description}</p>}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row between small" style={{ marginBottom: 8 }}>
          <span className="muted bold">{course.lessons_done} из {course.lessons_total} {plural(course.lessons_total, 'урока', 'уроков', 'уроков')}</span>
          <span className="mono bold" style={{ color: 'var(--brand-text)', fontSize: 17 }}>{course.percent}%</span>
        </div>
        <ProgressBar percent={course.percent} />
        <div className="course-meta" style={{ marginTop: 12 }}>
          <span><Icon.clock size={13} />≈{course.minutes} мин</span>
          <span className="reward"><Icon.trophy size={13} />+{reward.xp} XP и +{reward.coil} COIL за весь курс</span>
        </div>
        {next_lesson_id && (
          <Link to={`/lesson/${next_lesson_id}`} className="btn block" style={{ marginTop: 14 }}>
            {course.lessons_done ? 'Продолжить' : 'Начать курс'} <Icon.arrowR size={18} />
          </Link>
        )}
      </div>

      <div className="section-head"><h2>Уроки</h2>{!staff && <span className="small muted">открываются по порядку</span>}</div>
      <div className="lesson-list">
        {lessons.map((l, i) => {
          const done = l.status === 'passed'
          const isNext = l.id === next_lesson_id
          const days = l.deadline ? Math.round((new Date(l.deadline + 'T00:00:00') - today) / 86400000) : null
          const inner = (
            <>
              <span className={'lesson-num' + (done ? ' done' : isNext ? ' next' : '')}>
                {done ? <Icon.check size={16} /> : l.locked ? <Icon.lock size={15} /> : i + 1}
              </span>
              <span className="list-main">
                <b style={{ whiteSpace: 'normal' }}>{l.title}</b>
                <span className="row wrap" style={{ gap: 10, marginTop: 3, display: 'flex' }}>
                  <span className="row" style={{ gap: 3 }}><Icon.clock size={12} />{l.minutes} мин</span>
                  {l.has_test && <span className="row" style={{ gap: 3 }}><Icon.target size={12} />тест</span>}
                  {l.status === 'pending' && <span className="badge warn">на проверке</span>}
                  {l.status === 'failed' && <span className="badge danger">не сдан</span>}
                  {!l.published && <span className="badge warn">черновик</span>}
                  {days !== null && !done && <span className={'badge ' + (days < 0 ? 'danger' : days <= 2 ? 'warn' : '')}>{daysLabel(days)}</span>}
                </span>
              </span>
              {!l.locked && <Icon.chevR size={18} style={{ color: 'var(--text-muted)', flex: 'none' }} />}
            </>
          )
          return l.locked ? (
            <button key={l.id} className={'lesson-row locked'} style={{ textAlign: 'left', font: 'inherit', color: 'inherit', width: '100%' }}
              onClick={() => toast('Сначала пройди предыдущий урок')} aria-disabled="true">{inner}</button>
          ) : (
            <Link key={l.id} to={`/lesson/${l.id}`} className={'lesson-row' + (isNext ? ' next' : '')}>{inner}</Link>
          )
        })}
      </div>
    </main>
  )
}
