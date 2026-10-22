import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Icon, PageSkeleton, ProgressBar, LoadError, Empty, Tabs, PageHead, useLoad, plural, daysLabel, IMPORTANCE } from '../ui'

// Цвет обложки по категории: курс узнаётся по цвету, а не по тексту (бриф 10.5).
// Если админ не задал цвет категории — берём из палитры по номеру.
const PALETTE = ['#7C5CBF', '#E8833A', '#3FA7BF', '#3FBF7F', '#D9577B', '#C69E34', '#5C7CE0', '#9A6B4F']
export function categoryColor(id, color) {
  return color || PALETTE[(Number(id) || 0) % PALETTE.length]
}

const COVERS = {
  cover_kalyun: 'ach_13_osnovy-kalyana',
  cover_tobacco: 'ach_14_tabak',
  cover_standards: 'ach_15_bezopasnost',
  cover_sales: 'ach_21_pervaya-pokupka',
  cover_default: 'ach_01_pervyy-shag'
}

export function Cover({ id, complete, size = 56, color }) {
  // Загруженная обложка — на всю плитку
  if (/^(\/uploads\/|https?:)/.test(String(id || ''))) {
    return (
      <div className="cover" style={{ width: size, height: size, '--cover': color }}>
        <img src={id} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div className="cover" style={{ width: size, height: size, '--cover': complete ? 'var(--success)' : color }}>
      <img src={`/assets/webp-256/${COVERS[id] || COVERS.cover_default}.webp`} alt="" loading="lazy" />
    </div>
  )
}

export default function Library() {
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState(() => { try { return localStorage.getItem('libView') || 'grid' } catch { return 'grid' } })
  const { data, error, reload } = useLoad(() => api.library(filter), [filter])

  function toggleView(v) { setView(v); try { localStorage.setItem('libView', v) } catch {} }

  return (
    <main className="page wide">
      <PageHead title="Обучение" sub={data ? `${data.counts.all} ${plural(data.counts.all, 'курс', 'курса', 'курсов')} · сначала обязательные и срочные` : ' '}
        action={<>
          <Link to="/search" className="btn ghost sm icon" aria-label="Поиск"><Icon.search size={18} /></Link>
          <div className="only-desktop">
            <div className="segmented sm">
              <button className={view === 'grid' ? 'on' : ''} onClick={() => toggleView('grid')} aria-label="Плиткой"><Icon.grid size={16} /></button>
              <button className={view === 'list' ? 'on' : ''} onClick={() => toggleView('list')} aria-label="Списком"><Icon.list size={16} /></button>
            </div>
          </div>
        </>} />

      <div style={{ marginBottom: 18 }}>
        <Tabs value={filter} onChange={setFilter} items={[
          ['all', 'Все', data?.counts.all],
          ['active', 'В работе', data?.counts.active],
          ['done', 'Завершённые', data?.counts.done],
          ['overdue', 'Просроченные', data?.counts.overdue || null]
        ]} />
      </div>

      {error ? <LoadError error={error} onRetry={reload} />
        : !data ? <PageSkeleton />
        : data.courses.length === 0 ? (
          <Empty icon={<Icon.book size={26} />}
            title={filter === 'all' ? 'Курсов пока нет' : filter === 'overdue' ? 'Просрочек нет' : filter === 'done' ? 'Пока ничего не завершено' : 'Нет курсов в работе'}
            text={filter === 'all' ? 'Администратор ещё не опубликовал курсы. Загляни позже.' : filter === 'overdue' ? 'Так держать — всё сдано вовремя.' : 'Открой курс из вкладки «Все» и пройди первый урок.'}
            action={filter !== 'all' && <button className="btn ghost sm" onClick={() => setFilter('all')}>Показать все</button>} />
        ) : (
          <div className="col" style={{ gap: 28 }}>
            {data.categories.map(cat => (
              <section key={cat.id}>
                <div className="section-head">
                  <h2 className="row" style={{ gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: categoryColor(cat.id, cat.color) }} />
                    {cat.title}
                  </h2>
                  <span className="small muted bold">{cat.courses.length}</span>
                </div>
                <div className={'course-grid' + (view === 'list' ? ' list' : '')}>
                  {cat.courses.map(c => <CourseCard key={c.id} c={c} />)}
                </div>
              </section>
            ))}
          </div>
        )}
    </main>
  )
}

function CourseCard({ c }) {
  const imp = IMPORTANCE[c.importance] || IMPORTANCE.extra
  const overdue = c.days_left !== null && c.days_left < 0 && !c.complete
  return (
    <Link to={`/course/${c.id}`} className={'course-card' + (c.complete ? ' done' : '') + (overdue ? ' overdue' : '')}>
      <div className="course-top">
        <Cover id={c.cover} complete={c.complete} color={categoryColor(c.category_id, c.category_color)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
            {c.complete
              ? <span className="badge success"><Icon.check size={12} /> Пройден</span>
              : <span className={imp.cls}>{imp.label}</span>}
            {c.days_left !== null && !c.complete && (
              <span className={'badge ' + (overdue ? 'danger' : c.days_left <= 2 ? 'warn' : '')}>
                {overdue ? <Icon.alert size={12} /> : <Icon.calendar size={12} />}{daysLabel(c.days_left)}
              </span>
            )}
          </div>
          <h3>{c.title}</h3>
        </div>
      </div>
      {c.description && <p className="small muted clamp2">{c.description}</p>}
      <div style={{ marginTop: 'auto' }}>
        <div className="course-meta" style={{ marginBottom: 8 }}>
          <span><Icon.book size={13} />{c.lessons_done}/{c.lessons_total} {plural(c.lessons_total, 'урок', 'урока', 'уроков')}</span>
          <span><Icon.clock size={13} />≈{c.minutes} мин</span>
          <span style={{ marginLeft: 'auto', color: c.complete ? 'var(--success-text)' : 'var(--brand-text)' }}>{c.percent}%</span>
        </div>
        <ProgressBar percent={c.percent} thin />
      </div>
    </Link>
  )
}
