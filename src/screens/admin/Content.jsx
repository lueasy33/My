import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { useApp } from '../../App'
import { Icon, PageSkeleton, LoadError, PageHead, Modal, Empty, useLoad, useToast, useConfirm, plural, IMPORTANCE } from '../../ui'
import { Cover, categoryColor } from '../Library'
import ImageUpload from './ImageUpload'

export default function Content() {
  const { user } = useApp()
  const isAdmin = user.role === 'admin'
  const nav = useNavigate()
  const toast = useToast()
  const [ask, confirmNode] = useConfirm()
  const { data, error, reload } = useLoad(() => api.admin.content(), [])
  const [course, setCourse] = useState(null)   // форма курса
  const [lesson, setLesson] = useState(null)   // форма нового урока
  const [cats, setCats] = useState(false)
  const [filter, setFilter] = useState('')

  if (error) return <LoadError error={error} onRetry={reload} />
  if (!data) return <PageSkeleton />

  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok, 'success'); await reload() } catch (e) { toast(e.message, 'error') } }

  async function saveCourse(e) {
    e.preventDefault()
    const body = { title: course.title, description: course.description, category_id: Number(course.category_id) || null, importance: course.importance, minutes: Number(course.minutes) || 15, branch_id: course.branch_id ? Number(course.branch_id) : null, cover: course.cover || '' }
    await run(async () => {
      if (course.id) await api.admin.updateCourse(course.id, body)
      else await api.admin.createCourse(body)
      setCourse(null)
    }, course.id ? 'Курс сохранён' : 'Курс создан как черновик')
  }

  async function addLesson(e) {
    e.preventDefault()
    try {
      const res = await api.admin.createLesson({ course_id: lesson.course_id, title: lesson.title, minutes: Number(lesson.minutes) || 8, deadline: lesson.deadline || null })
      nav('/admin/lesson/' + res.id)
    } catch (e) { toast(e.message, 'error') }
  }

  async function publish(c) {
    if (c.published && !(await ask({ title: 'Снять курс с публикации?', text: 'Сотрудники перестанут его видеть. Их прогресс сохранится.', ok: 'Снять' }))) return
    run(() => api.admin.updateCourse(c.id, { published: !c.published }), c.published ? 'Курс снят с публикации' : 'Курс опубликован — сотрудникам ушло уведомление')
  }

  async function removeCourse(c) {
    if (!(await ask({ title: `Удалить «${c.title}»?`, text: 'Курс и все его уроки удалятся без возможности восстановления.', ok: 'Удалить', danger: true }))) return
    try {
      await api.admin.deleteCourse(c.id)
    } catch (e) {
      if (!e.data?.needs_confirm) return toast(e.message, 'error')
      // По курсу уже учились — второе, явное подтверждение с последствиями
      if (!(await ask({ title: `Курс проходили ${e.data.learners} ${plural(e.data.learners, 'сотрудник', 'сотрудника', 'сотрудников')}`, text: 'Их прогресс и результаты тестов по этому курсу удалятся навсегда и пропадут из аналитики. Уже начисленные XP, COIL и достижения останутся у сотрудников.', ok: 'Удалить вместе с прогрессом', danger: true }))) return
      try { await api.admin.deleteCourse(c.id, true) } catch (e2) { return toast(e2.message, 'error') }
    }
    toast('Курс удалён', 'success')
    await reload()
  }

  async function move(c, i, dir) {
    const ids = c.lessons.map(l => l.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    run(() => api.admin.orderLessons(c.id, ids))
  }

  const courses = data.courses.filter(c => !filter || String(c.category_id) === filter)
  const drafts = data.courses.filter(c => !c.published).length

  return (
    <>
      <PageHead title="Контент" sub={`${data.courses.length - drafts} опубликовано · ${drafts} ${plural(drafts, 'черновик', 'черновика', 'черновиков')}`}
        action={<>
          {isAdmin && <button className="btn ghost sm" onClick={() => setCats(true)}><Icon.list size={16} />Категории</button>}
          <button className="btn sm" onClick={() => setCourse({ title: '', description: '', category_id: filter || data.categories[0]?.id || '', importance: 'recommended', minutes: 15, branch_id: '' })}><Icon.plus size={16} />Курс</button>
        </>} />

      <div className="scroll-x" style={{ marginBottom: 16 }}>
        <button className={'pill' + (!filter ? ' on' : '')} onClick={() => setFilter('')}>Все</button>
        {data.categories.map(c => (
          <button key={c.id} className={'pill' + (filter === String(c.id) ? ' on' : '')} onClick={() => setFilter(String(c.id))}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: categoryColor(c.id, c.color) }} />{c.title}
          </button>
        ))}
      </div>

      {courses.length === 0 ? (
        <Empty icon={<Icon.book size={26} />} title="Курсов пока нет" text="Создайте курс, добавьте в него уроки, а потом опубликуйте"
          action={<button className="btn sm" onClick={() => setCourse({ title: '', description: '', category_id: filter || data.categories[0]?.id || '', importance: 'recommended', minutes: 15, branch_id: '' })}><Icon.plus size={16} />Создать курс</button>} />
      ) : (
        <div className="col" style={{ gap: 14 }}>
          {courses.map(c => {
            const imp = IMPORTANCE[c.importance] || IMPORTANCE.extra
            return (
              <div key={c.id} className="course-admin">
                <div className="course-admin-head">
                  <Cover id={c.cover} size={48} color={categoryColor(c.category_id, data.categories.find(x => x.id === c.category_id)?.color)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 6, marginBottom: 4 }}>
                      {c.published ? <span className="badge success">Опубликован</span> : <span className="badge warn">Черновик</span>}
                      <span className={imp.cls}>{imp.label}</span>
                      {c.branch && <span className="badge brand">Только {c.branch}</span>}
                    </div>
                    <div className="bold" style={{ fontSize: 16 }}>{c.title}</div>
                    <div className="small muted">{c.category || 'Без категории'} · {c.lessons_published} из {c.lessons_count} {plural(c.lessons_count, 'урока', 'уроков', 'уроков')} опубликовано</div>
                  </div>
                  {c.editable && (
                    <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn ghost xs icon" aria-label="Настройки курса" title="Настройки курса" onClick={() => setCourse({ ...c, category_id: c.category_id || '', branch_id: c.branch_id || '' })}><Icon.edit size={15} /></button>
                      <button className={'btn xs ' + (c.published ? 'ghost' : '')} onClick={() => publish(c)}>{c.published ? 'Снять' : 'Опубликовать'}</button>
                    </div>
                  )}
                </div>
                <div className="course-admin-lessons">
                  {c.lessons.length === 0 && <p className="small muted" style={{ padding: '8px 10px' }}>Уроков пока нет</p>}
                  {c.lessons.map((l, i) => (
                    <div key={l.id} className="lesson-admin-row">
                      {c.editable && (
                        <span className="col" style={{ gap: 0 }}>
                          <button className="btn plain xs icon" style={{ minHeight: 22, background: 'none', color: 'var(--text-muted)' }} disabled={i === 0} onClick={() => move(c, i, -1)} aria-label="Выше"><Icon.chevU size={14} /></button>
                          <button className="btn plain xs icon" style={{ minHeight: 22, background: 'none', color: 'var(--text-muted)' }} disabled={i === c.lessons.length - 1} onClick={() => move(c, i, 1)} aria-label="Ниже"><Icon.chevD size={14} /></button>
                        </span>
                      )}
                      <Link to={`/admin/lesson/${l.id}`} className="lesson-link">
                        <span className="lesson-num" style={{ width: 28, height: 28, fontSize: 12.5 }}>{i + 1}</span>
                        <span className="list-main">
                          <b style={{ fontSize: 14 }}>{l.title}</b>
                          <span>{l.blocks} {plural(l.blocks, 'блок', 'блока', 'блоков')} · {l.questions ? `тест: ${l.questions} вопр.` : 'без теста'}{l.deadline ? ` · до ${new Date(l.deadline).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}` : ''}</span>
                        </span>
                      </Link>
                      {!l.published && <span className="badge warn">черновик</span>}
                      <Link to={`/lesson/${l.id}`} className="btn ghost xs icon" aria-label="Посмотреть как сотрудник" title="Посмотреть как сотрудник"><Icon.eye size={15} /></Link>
                    </div>
                  ))}
                  {c.editable && (
                    <div className="row" style={{ gap: 8, padding: '6px 4px 2px' }}>
                      <button className="btn ghost xs" onClick={() => setLesson({ course_id: c.id, course: c.title, title: '', minutes: 8, deadline: '' })}><Icon.plus size={14} />Урок</button>
                      {!c.published && c.lessons.length === 0 && <button className="btn ghost xs" style={{ color: 'var(--danger-text)' }} onClick={() => removeCourse(c)}><Icon.trash size={14} />Удалить курс</button>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {course && (
        <Modal title={course.id ? 'Настройки курса' : 'Новый курс'} onClose={() => setCourse(null)} width={540}
          footer={<><button className="btn ghost" onClick={() => setCourse(null)}>Отмена</button><button className="btn" form="course-form">{course.id ? 'Сохранить' : 'Создать черновик'}</button></>}>
          <form id="course-form" onSubmit={saveCourse} className="col" style={{ gap: 12 }}>
            <div className="field"><label>Название</label><input className="input" required value={course.title} onChange={e => setCourse(f => ({ ...f, title: e.target.value }))} placeholder="Основы кальяна: с нуля до продавца" autoFocus /></div>
            <div className="field"><label>Описание</label><textarea className="textarea" rows={3} value={course.description || ''} onChange={e => setCourse(f => ({ ...f, description: e.target.value }))} placeholder="Чему научится сотрудник — 1–2 предложения" /></div>
            <div className="form-grid two">
              <div className="field">
                <label>Категория</label>
                <select className="select" value={course.category_id} onChange={e => setCourse(f => ({ ...f, category_id: e.target.value }))}>
                  <option value="">Без категории</option>
                  {data.categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Важность</label>
                <select className="select" value={course.importance} onChange={e => setCourse(f => ({ ...f, importance: e.target.value }))}>
                  <option value="required">Обязательный</option>
                  <option value="recommended">Рекомендуемый</option>
                  <option value="extra">Дополнительный</option>
                </select>
              </div>
              <div className="field"><label>Время на курс, мин</label><input className="input" type="number" min="1" value={course.minutes} onChange={e => setCourse(f => ({ ...f, minutes: e.target.value }))} /></div>
              <div className="field">
                <label>Кому доступен</label>
                <select className="select" value={course.branch_id} onChange={e => setCourse(f => ({ ...f, branch_id: e.target.value }))}>
                  <option value="">Всей сети</option>
                  {data.branches.map(b => <option key={b.id} value={b.id}>Только {b.name}</option>)}
                </select>
              </div>
            </div>
            <ImageUpload label="Обложка курса" shape="cover" maxMb={2}
              value={/^(\/uploads\/|https?:)/.test(course.cover || '') ? course.cover : ''}
              onChange={url => setCourse(f => ({ ...f, cover: url }))} />
            {/^(\/uploads\/|https?:)/.test(course.cover || '') && (
              <button type="button" className="btn ghost xs" style={{ alignSelf: 'flex-start' }} onClick={() => setCourse(f => ({ ...f, cover: 'cover_default' }))}>Вернуть стандартную обложку</button>
            )}
          </form>
          {course.id && course.editable && (
            <button className="btn danger sm" style={{ marginTop: 16 }} onClick={() => { const c = course; setCourse(null); removeCourse(c) }}><Icon.trash size={15} />Удалить курс</button>
          )}
        </Modal>
      )}

      {lesson && (
        <Modal title="Новый урок" onClose={() => setLesson(null)} width={460}
          footer={<><button className="btn ghost" onClick={() => setLesson(null)}>Отмена</button><button className="btn" form="lesson-form">Создать и открыть</button></>}>
          <p className="small muted" style={{ marginBottom: 12 }}>Курс: {lesson.course}</p>
          <form id="lesson-form" onSubmit={addLesson} className="col" style={{ gap: 12 }}>
            <div className="field"><label>Название урока</label><input className="input" required value={lesson.title} onChange={e => setLesson(f => ({ ...f, title: e.target.value }))} placeholder="Устройство кальяна" autoFocus /></div>
            <div className="form-grid two">
              <div className="field"><label>Время, мин</label><input className="input" type="number" min="1" value={lesson.minutes} onChange={e => setLesson(f => ({ ...f, minutes: e.target.value }))} /></div>
              <div className="field"><label>Дедлайн (необязательно)</label><input className="input" type="date" value={lesson.deadline} onChange={e => setLesson(f => ({ ...f, deadline: e.target.value }))} /></div>
            </div>
          </form>
        </Modal>
      )}

      {cats && <Categories categories={data.categories} onClose={() => setCats(false)} onChanged={reload} />}
      {confirmNode}
    </>
  )
}

function Categories({ categories, onClose, onChanged }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [color, setColor] = useState('#7C5CBF')
  const run = async (fn) => { try { await fn(); await onChanged() } catch (e) { toast(e.message, 'error') } }
  return (
    <Modal title="Категории" onClose={onClose} width={480}>
      <p className="small muted" style={{ marginBottom: 12 }}>Категория отвечает на вопрос «про что это». Цвет — цвет обложек её курсов.</p>
      <div className="col" style={{ gap: 6 }}>
        {categories.map(c => (
          <div key={c.id} className="row" style={{ gap: 8 }}>
            <input type="color" value={categoryColor(c.id, c.color)} onChange={e => run(() => api.admin.updateCategory(c.id, { color: e.target.value }))}
              style={{ width: 40, height: 40, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} aria-label="Цвет" />
            <input className="input" defaultValue={c.title} style={{ minHeight: 42 }} onBlur={e => e.target.value.trim() && e.target.value !== c.title && run(() => api.admin.updateCategory(c.id, { title: e.target.value }))} />
            <span className="small muted" style={{ width: 54, textAlign: 'right' }}>{c.courses} к.</span>
            <button className="btn ghost xs icon" disabled={c.courses > 0} title={c.courses ? 'Сначала перенесите курсы' : 'Удалить'} aria-label="Удалить" onClick={() => run(() => api.admin.deleteCategory(c.id))}><Icon.trash size={15} /></button>
          </div>
        ))}
      </div>
      <form className="row" style={{ gap: 8, marginTop: 14 }} onSubmit={e => { e.preventDefault(); if (!title.trim()) return; run(async () => { await api.admin.createCategory({ title, color }); setTitle('') }) }}>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 40, height: 40, border: 'none', background: 'none', padding: 0 }} aria-label="Цвет новой категории" />
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Новая категория" style={{ minHeight: 42 }} />
        <button className="btn sm"><Icon.plus size={15} /></button>
      </form>
    </Modal>
  )
}
