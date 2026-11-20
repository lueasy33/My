import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useApp } from '../../App'
import { Icon, PageSkeleton, LoadError, PageHead, Modal, useLoad, useToast, fmtAgo, fmtDate, plural } from '../../ui'

export default function Overview() {
  const { user } = useApp()
  const toast = useToast()
  const { data, error, reload } = useLoad(() => Promise.all([api.admin.overview(), api.admin.attention()]).then(([o, a]) => ({ ...o, attention: a.rows })), [])
  const [contact, setContact] = useState(null)
  const [note, setNote] = useState('')

  if (error) return <LoadError error={error} onRetry={reload} />
  if (!data) return <PageSkeleton />

  const c = data.counts
  const open = data.attention.filter(r => !r.contacted)
  const people = groupByPerson(data.attention)

  async function markContacted() {
    try {
      await api.admin.contact({ user_id: contact.user_id, lesson_id: contact.lesson_id, note })
      setContact(null); setNote('')
      toast('Отметка сохранена', 'success')
      reload()
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <PageHead title={user.role === 'admin' ? 'Управление' : 'Мой филиал'} sub="Главное за сегодня"
        action={<Link to="/admin/content" className="btn sm"><Icon.plus size={16} />Новый урок</Link>} />

      <div className="kpis">
        <Kpi to="/admin/users" v={c.users} k={`${plural(c.users, 'сотрудник', 'сотрудника', 'сотрудников')} · ${c.active7} активны за неделю`} />
        <Kpi to="/admin/content" v={c.courses} k={`${plural(c.courses, 'курс', 'курса', 'курсов')} · ${c.lessons} ${plural(c.lessons, 'урок', 'урока', 'уроков')}${c.drafts ? ` · ${c.drafts} ${plural(c.drafts, 'черновик', 'черновика', 'черновиков')}` : ''}`} />
        {/* Открытых вопросов почти нет — карточка нужна, только когда есть что проверять */}
        {c.pending > 0 && <Kpi to="/admin/reviews" v={c.pending} k={`${plural(c.pending, 'ответ ждёт', 'ответа ждут', 'ответов ждут')} проверки`} warn />}
        <Kpi v={c.overdue} k={plural(c.overdue, 'просроченный урок', 'просроченных урока', 'просроченных уроков')} danger={c.overdue > 0} />
      </div>

      <div className="dash-grid">
        <section className="section">
          <div className="section-head"><h2>Просрочки · требует внимания</h2><span className="small muted" style={{ whiteSpace: 'nowrap' }}>{people.length} {plural(people.length, 'человек', 'человека', 'человек')} · {open.length} без контакта</span></div>
          {data.attention.length === 0 ? (
            <div className="empty"><Icon.check size={24} style={{ color: 'var(--success-text)' }} /><p className="small muted" style={{ marginTop: 6 }}>Просрочек нет — все успевают</p></div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {people.slice(0, 10).map(g => (
                <div key={g.user_id} className="card tight attn-person">
                  <div className="list-row bare">
                    <span className={'list-ico ' + (g.open ? 'danger' : 'success')}>{g.open ? <Icon.alert size={18} /> : <Icon.check size={18} />}</span>
                    <span className="list-main wrap">
                      <b>{g.name}</b>
                      <span>{g.rows.length === 1
                        ? `просрочен на ${g.oldest} ${plural(g.oldest, 'день', 'дня', 'дней')}`
                        : `${g.rows.length} ${plural(g.rows.length, 'урок просрочен', 'урока просрочены', 'уроков просрочено')} · самый старый — ${g.oldest} ${plural(g.oldest, 'день', 'дня', 'дней')}`}{g.branch ? ` · ${g.branch}` : ''}</span>
                    </span>
                    <a className="btn ghost sm icon" href={`tel:${g.phone}`} aria-label={`Позвонить: ${g.name}`}><Icon.phone size={16} /></a>
                  </div>
                  <div className="attn-lessons">
                    {g.rows.map(r => (
                      <div key={r.lesson_id} className="attn-lesson">
                        <span className="list-main wrap">
                          <b>{r.lesson}</b>
                          <span>{r.contacted
                            ? `Связались ${fmtAgo(r.contacted_at)}${r.last_note ? `: ${r.last_note}` : ''}`
                            : `просрочен на ${r.days_overdue} ${plural(r.days_overdue, 'день', 'дня', 'дней')}`}</span>
                        </span>
                        {r.contacted
                          ? <Icon.check size={18} style={{ color: 'var(--success-text)', flex: 'none' }} aria-label="Связались" />
                          : <button className="btn soft sm" onClick={() => setContact(r)}>Связался</button>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {people.length > 10 && <p className="small muted center">и ещё {people.length - 10} {plural(people.length - 10, 'человек', 'человека', 'человек')}</p>}
            </div>
          )}
          <p className="tiny muted" style={{ marginTop: 8 }}>Система не блокирует опоздавших: просрочка — повод поговорить, а не наказание.</p>
        </section>

        <div>
          {data.pendingReviews.length > 0 && (
            <section className="section">
              <div className="section-head"><h2>Ждут проверки</h2><Link to="/admin/reviews">Открыть</Link></div>
              <div className="col" style={{ gap: 6 }}>
                {data.pendingReviews.map(r => (
                  <Link key={r.id} to="/admin/reviews" className="list-row">
                    <span className="list-ico warn"><Icon.message size={18} /></span>
                    <span className="list-main"><b>{r.name}</b><span>{r.title}</span></span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head"><h2>Последние действия</h2>{user.role === 'admin' && <Link to="/admin/audit">Весь журнал</Link>}</div>
            <div className="card tight">
              {data.recentLog.length === 0 && <p className="small muted">Пока пусто</p>}
              {data.recentLog.map(l => (
                <div key={l.id} className="row between small" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 10 }}>
                  <span style={{ minWidth: 0 }}>{l.title || label(l.action)} <span className="muted">· {l.actor || 'система'}</span></span>
                  <span className="tiny muted" style={{ flex: 'none' }}>{fmtDate(l.created_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {contact && (
        <Modal title="Отметить контакт" onClose={() => setContact(null)} width={420}
          footer={<><button className="btn ghost" onClick={() => setContact(null)}>Отмена</button><button className="btn" onClick={markContacted}>Сохранить</button></>}>
          <p className="muted small" style={{ marginBottom: 12 }}>{contact.name} · {contact.lesson}</p>
          <div className="field">
            <label htmlFor="note">О чём договорились</label>
            <textarea id="note" className="textarea" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Например: пройдёт до пятницы" />
          </div>
        </Modal>
      )}
    </>
  )
}

// Просрочки одним списком повторяли имя на каждой строке («Ирина» 4 раза подряд).
// Группа = человек → его уроки; сверху тот, у кого самая старая просрочка без контакта.
function groupByPerson(rows) {
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.user_id)) map.set(r.user_id, { user_id: r.user_id, name: r.name, phone: r.phone, branch: r.branch, rows: [] })
    map.get(r.user_id).rows.push(r)
  }
  const list = [...map.values()]
  for (const g of list) {
    g.rows.sort((a, b) => b.days_overdue - a.days_overdue)
    g.oldest = g.rows[0].days_overdue
    g.open = g.rows.some(r => !r.contacted)
  }
  return list.sort((a, b) => (b.open - a.open) || (b.oldest - a.oldest) || a.name.localeCompare(b.name, 'ru'))
}

function Kpi({ v, k, warn, danger, to }) {
  const body = (
    <>
      <div className="v" style={{ color: danger ? 'var(--danger-text)' : warn ? 'var(--warning-text)' : undefined }}>{v}</div>
      <div className="k">{k}</div>
    </>
  )
  return to ? <Link to={to} className="kpi card hover" style={{ color: 'inherit', padding: '14px 16px' }}>{body}</Link> : <div className="kpi">{body}</div>
}

export function label(action) {
  const map = {
    'user.create': 'создал сотрудника', 'user.update': 'изменил данные сотрудника', 'user.archive': 'отправил сотрудника в архив',
    'user.restore': 'вернул сотрудника из архива', 'user.password': 'задал новый пароль сотруднику',
    'branch.create': 'создал филиал', 'branch.update': 'изменил филиал', 'branch.archive': 'архивировал филиал',
    'category.create': 'создал категорию', 'category.update': 'изменил категорию', 'category.delete': 'удалил категорию',
    'course.create': 'создал курс', 'course.update': 'изменил курс', 'course.publish': 'опубликовал курс', 'course.unpublish': 'снял курс с публикации',
    'course.delete': 'удалил курс', 'course.order': 'изменил порядок уроков',
    'lesson.create': 'создал урок', 'lesson.update': 'изменил урок', 'lesson.publish': 'опубликовал урок', 'lesson.unpublish': 'снял урок с публикации',
    'lesson.delete': 'удалил урок', 'blocks.update': 'изменил материалы урока', 'test.update': 'изменил тест', 'upload': 'загрузил файл',
    'review.verdict': 'проверил ответ', 'achievement.grant': 'выдал награду', 'achievement.revoke': 'снял награду', 'theme.grant': 'выдал тему',
    'achievement.create': 'создал достижение', 'achievement.update': 'изменил достижение',
    'flavor.create': 'добавил вкус', 'flavor.import': 'импортировал вкусы',
    'shop.create': 'добавил товар', 'shop.update': 'изменил товар', 'shop.delete': 'удалил товар', 'shop.hide': 'снял товар с продажи',
    'attention.contact': 'связался с сотрудником'
  }
  return map[action] || action
}
