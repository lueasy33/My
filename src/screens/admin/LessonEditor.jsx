import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../../api'
import { Icon, PageSkeleton, LoadError, Tabs, useToast, useConfirm, fmtSize } from '../../ui'
import { Block, videoEmbed } from '../Lesson'

const TYPES = [
  { k: 'text', label: 'Текст', icon: Icon.text, hint: 'Абзацы, заголовки, списки, врезки' },
  { k: 'photo', label: 'Фото', icon: Icon.image, hint: 'JPG, PNG, WebP до 10 МБ' },
  { k: 'video', label: 'Видео', icon: Icon.video, hint: 'Файл MP4 или ссылка YouTube / RuTube / VK' },
  { k: 'file', label: 'Файл', icon: Icon.file, hint: 'PDF, Word, Excel, презентации до 50 МБ' }
]
const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.k, t.label]))
const PART_LABEL = { p: 'Абзац', h: 'Заголовок', list: 'Список', note: 'Врезка', quote: 'Цитата' }

export default function LessonEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [ask, confirmNode] = useConfirm()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('blocks')
  const [preview, setPreview] = useState(false)

  async function load() {
    try {
      const d = await api.admin.lesson(id)
      setData(d); setBlocks(d.blocks); setDirty(false)
    } catch (e) { setError(e) }
  }
  useEffect(() => { load() }, [id])

  // Несохранённая работа не должна пропадать молча
  useEffect(() => {
    if (!dirty) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  if (error) return <LoadError error={error} onRetry={load} />
  if (!data) return <PageSkeleton />

  const { lesson, course, editable } = data

  async function leave() {
    if (dirty && !(await ask({ title: 'Уйти без сохранения?', text: 'Изменения в материалах урока пропадут.', ok: 'Уйти', danger: true }))) return
    nav('/admin/content')
  }

  async function saveBlocks() {
    setSaving(true)
    try {
      const res = await api.admin.saveBlocks(lesson.id, blocks.map(b => ({ id: typeof b.id === 'number' ? b.id : null, type: b.type, content: b.content })))
      setBlocks(res.blocks)
      setDirty(false)
      toast('Сохранено', 'success')
      return true
    } catch (e) { toast(e.message, 'error'); return false } finally { setSaving(false) }
  }

  async function togglePublish() {
    if (!lesson.published && dirty && !(await saveBlocks())) return
    if (lesson.published && !(await ask({ title: 'Снять урок с публикации?', text: 'Сотрудники перестанут его видеть. Прогресс сохранится.', ok: 'Снять' }))) return
    try {
      await api.admin.updateLesson(lesson.id, { published: !lesson.published })
      toast(lesson.published ? 'Урок снят с публикации' : course.published ? 'Урок опубликован — сотрудникам ушло уведомление' : 'Урок опубликован. Не забудьте опубликовать курс', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  function update(i, patch) { setBlocks(bs => bs.map((b, j) => j === i ? { ...b, ...patch } : b)); setDirty(true) }
  function move(i, dir) {
    setBlocks(bs => { const a = [...bs]; const j = i + dir; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a })
    setDirty(true)
  }
  async function remove(i) {
    if (!(await ask({ title: 'Удалить блок?', text: 'Блок пропадёт после сохранения урока.', ok: 'Удалить', danger: true }))) return
    setBlocks(bs => bs.filter((_, j) => j !== i)); setDirty(true)
  }
  function add(type) {
    const empty = type === 'text' ? { blocks: [{ t: 'p', text: '' }] } : type === 'photo' ? { src: '', alt: '', caption: '' } : type === 'video' ? { title: '', src: '' } : { title: '', href: '', name: '', size: 0 }
    setBlocks(bs => [...bs, { id: 'new' + Date.now(), type, content: empty }])
    setDirty(true)
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50)
  }

  return (
    <>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div className="row" style={{ gap: 8, minWidth: 0 }}>
          <button className="icon-btn" onClick={leave} aria-label="К контенту"><Icon.chevL size={20} /></button>
          <div style={{ minWidth: 0 }}>
            <div className="small muted bold ellipsis">{course.title}</div>
            <h1 style={{ fontSize: 21 }} className="ellipsis">{lesson.title}</h1>
            <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
              {lesson.published ? <span className="badge success">Опубликован · версия {lesson.version}</span> : <span className="badge warn">Черновик</span>}
              {!course.published && <span className="badge">Курс не опубликован</span>}
              {data.stats.passed > 0 && <span className="badge">прошли {data.stats.passed}</span>}
            </div>
          </div>
        </div>
        {editable && (
          <div className="row" style={{ gap: 8 }}>
            <Link to={`/lesson/${lesson.id}`} className="btn ghost sm" title="Посмотреть как сотрудник"><Icon.eye size={16} /><span className="only-desktop">Просмотр</span></Link>
            {tab === 'blocks' && <button className="btn ghost sm" onClick={saveBlocks} disabled={!dirty || saving}>{saving ? 'Сохраняем…' : dirty ? 'Сохранить' : 'Сохранено'}</button>}
            <button className={'btn sm ' + (lesson.published ? 'ghost' : '')} onClick={togglePublish}>{lesson.published ? 'Снять' : 'Опубликовать'}</button>
          </div>
        )}
      </div>

      {!editable && <div className="callout warn" style={{ marginTop: 0 }}><span className="ico"><Icon.lock size={18} /></span><div>Это общий курс сети — менять его может только администратор. Здесь режим просмотра.</div></div>}

      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} items={[['blocks', 'Материалы', blocks.length], ['test', 'Тест', data.test?.questions.length || 0], ['settings', 'Настройки']]} />
      </div>

      {tab === 'blocks' && (
        <div className="split">
          <aside className="card tight">
            <p className="small muted bold" style={{ marginBottom: 8 }}>Добавить блок</p>
            <div className="col" style={{ gap: 6 }}>
              {TYPES.map(t => (
                <button key={t.k} className="list-row" style={{ minHeight: 52, padding: '8px 10px' }} onClick={() => add(t.k)} disabled={!editable}>
                  <span className="list-ico" style={{ width: 34, height: 34 }}><t.icon size={17} /></span>
                  <span className="list-main"><b style={{ fontSize: 13.5 }}>{t.label}</b><span style={{ whiteSpace: 'normal', fontSize: 11.5 }}>{t.hint}</span></span>
                </button>
              ))}
            </div>
            <div className="divider" />
            <label className="row between small" style={{ cursor: 'pointer' }}>
              <span className="bold">Предпросмотр</span>
              <span className="switch"><input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} /><span /></span>
            </label>
            <p className="tiny muted" style={{ marginTop: 10, lineHeight: 1.5 }}>Сохранение не видно сотрудникам, пока урок не опубликован. Правка опубликованного урока видна сразу после сохранения.</p>
          </aside>

          <div className="col" style={{ gap: 12 }}>
            {blocks.length === 0 && <div className="empty"><p className="muted">Пустой урок. Добавьте первый блок — обычно это текст.</p></div>}
            {preview ? (
              <div className="card lesson-body">{blocks.map(b => <Block key={b.id} block={{ ...b, position: 0 }} />)}</div>
            ) : blocks.map((b, i) => (
              <div key={b.id} className="block-editor">
                <div className="block-editor-head">
                  <span className="badge brand">{i + 1} · {TYPE_LABEL[b.type]}</span>
                  {editable && (
                    <div className="row" style={{ gap: 2 }}>
                      <button className="btn ghost plain xs icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Выше"><Icon.chevU size={16} /></button>
                      <button className="btn ghost plain xs icon" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Ниже"><Icon.chevD size={16} /></button>
                      <button className="btn ghost plain xs icon" onClick={() => remove(i)} aria-label="Удалить блок"><Icon.trash size={16} /></button>
                    </div>
                  )}
                </div>
                <fieldset disabled={!editable} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
                  <div className="block-editor-body">
                    <BlockForm block={b} onChange={content => update(i, { content })} />
                  </div>
                </fieldset>
              </div>
            ))}
            {dirty && editable && (
              <div className="lesson-actions" style={{ marginTop: 8 }}>
                <button className="btn block" onClick={saveBlocks} disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить изменения'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'test' && <TestEditor lessonId={lesson.id} initial={data.test} editable={editable} onSaved={load} />}
      {tab === 'settings' && <Settings lesson={lesson} editable={editable} onSaved={load} onDeleted={() => nav('/admin/content')} ask={ask} />}
      {confirmNode}
    </>
  )
}

/* ─── Формы блоков ──────────────────────────────────────────── */
function BlockForm({ block, onChange }) {
  const c = block.content || {}
  const set = (patch) => onChange({ ...c, ...patch })

  if (block.type === 'text') {
    const parts = c.blocks || []
    const setPart = (j, patch) => set({ blocks: parts.map((p, k) => k === j ? { ...p, ...patch } : p) })
    return (
      <>
        {parts.map((it, j) => (
          <div key={j} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
            <select className="select" style={{ width: 118, flex: 'none', fontSize: 13, minHeight: 44, padding: '6px 28px 6px 10px', backgroundPosition: 'calc(100% - 16px) 19px, calc(100% - 11px) 19px' }}
              value={it.t} onChange={e => setPart(j, { t: e.target.value, items: it.items || (it.text ? it.text.split('\n') : []), text: it.text || (it.items || []).join('\n') })} aria-label="Тип абзаца">
              {Object.entries(PART_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <div style={{ flex: 1, minWidth: 0 }} className="col">
              <textarea className="textarea" rows={it.t === 'h' ? 1 : it.t === 'list' ? 4 : 3} style={{ minHeight: it.t === 'h' ? 44 : 80, fontSize: it.t === 'h' ? 17 : 15, fontWeight: it.t === 'h' ? 750 : 400 }}
                value={it.t === 'list' ? (it.items || []).join('\n') : (it.text || '')}
                placeholder={it.t === 'list' ? 'Каждый пункт — с новой строки' : it.t === 'h' ? 'Заголовок раздела' : 'Текст. **Жирный** — в двойных звёздочках'}
                onChange={e => setPart(j, it.t === 'list' ? { items: e.target.value.split('\n') } : { text: e.target.value })} />
              {it.t === 'note' && (
                <div className="row" style={{ gap: 6 }}>
                  {[['tip', 'Совет'], ['warn', 'Внимание'], ['danger', 'Важно']].map(([k, l]) => (
                    <button key={k} type="button" className={'pill' + ((it.tone || 'tip') === k ? ' on' : '')} style={{ minHeight: 34 }} onClick={() => setPart(j, { tone: k })}>{l}</button>
                  ))}
                </div>
              )}
              {it.t === 'list' && (
                <label className="check" style={{ minHeight: 30, fontSize: 13 }}><input type="checkbox" checked={!!it.ordered} onChange={e => setPart(j, { ordered: e.target.checked })} />Нумерованный</label>
              )}
            </div>
            <button type="button" className="btn ghost plain xs icon" aria-label="Удалить абзац" onClick={() => set({ blocks: parts.filter((_, k) => k !== j) })}><Icon.x size={15} /></button>
          </div>
        ))}
        <div className="row wrap" style={{ gap: 6 }}>
          {Object.entries(PART_LABEL).map(([k, l]) => (
            <button key={k} type="button" className="btn ghost xs" onClick={() => set({ blocks: [...parts, k === 'list' ? { t: k, items: [''] } : { t: k, text: '' }] })}><Icon.plus size={13} />{l}</button>
          ))}
        </div>
      </>
    )
  }

  if (block.type === 'photo') {
    return (
      <>
        <Upload kind="photo" accept="image/jpeg,image/png,image/webp,image/gif" value={c.src}
          onUploaded={f => set({ src: f.url, alt: c.alt || '' })} />
        {c.src && <img src={c.src} alt="" className="preview-thumb" />}
        <div className="field"><label>Подпись под фото</label><input className="input" value={c.caption || ''} onChange={e => set({ caption: e.target.value })} /></div>
        <div className="field"><label>Описание для незрячих</label><input className="input" value={c.alt || ''} onChange={e => set({ alt: e.target.value })} placeholder="Что изображено" /></div>
        <LinkField label="Или ссылка на изображение" value={c.src} onChange={v => set({ src: v })} />
      </>
    )
  }

  if (block.type === 'video') {
    const embed = videoEmbed(c.src)
    return (
      <>
        <div className="field"><label>Название</label><input className="input" value={c.title || ''} onChange={e => set({ title: e.target.value })} placeholder="Как собрать кальян за 2 минуты" /></div>
        <Upload kind="video" accept="video/mp4,video/webm,video/quicktime" value={c.src} onUploaded={f => set({ src: f.url })} />
        <LinkField label="Или ссылка на YouTube, RuTube, VK Видео" value={c.src} onChange={v => set({ src: v })} />
        {c.src && <p className="hint">{embed ? 'Видео с хостинга — встроим его плеер.' : c.src.startsWith('/uploads/') ? 'Загруженный файл. Сотрудник сможет перематывать, менять скорость и продолжать с места остановки.' : 'Прямая ссылка на видеофайл.'}</p>}
        <p className="hint">Большие видео лучше выкладывать на RuTube или YouTube (ссылка «по ссылке») — так они быстрее грузятся по мобильному интернету.</p>
      </>
    )
  }

  return (
    <>
      <div className="field"><label>Название для сотрудника</label><input className="input" value={c.title || ''} onChange={e => set({ title: e.target.value })} placeholder="Прайс-лист на октябрь" /></div>
      <Upload kind="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" value={c.href} fileName={c.name}
        onUploaded={f => set({ href: f.url, name: f.name, size: f.size, title: c.title || f.name.replace(/\.[^.]+$/, '') })} />
      <LinkField label="Или ссылка на файл" value={c.href} onChange={v => set({ href: v })} />
    </>
  )
}

function LinkField({ label, value, onChange }) {
  const external = value && !String(value).startsWith('/uploads/') ? value : ''
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" value={external} onChange={e => onChange(e.target.value.trim())} placeholder="https://…" inputMode="url" />
    </div>
  )
}

function Upload({ kind, accept, value, fileName, onUploaded }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef(null)
  const uploaded = value && String(value).startsWith('/uploads/')

  async function send(file) {
    if (!file) return
    const limits = { photo: 10, video: 500, file: 50 }
    if (file.size > limits[kind] * 1024 * 1024) return toast(`Файл больше ${limits[kind]} МБ`, 'error')
    setBusy(true)
    try {
      const res = await api.admin.upload(file)
      onUploaded(res)
      toast('Файл загружен — не забудьте сохранить урок', 'success')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <label className={'dropzone' + (drag ? ' drag' : '')}
      onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files[0]) }}>
      <input ref={input} type="file" accept={accept} onChange={e => send(e.target.files[0])} />
      <Icon.upload size={22} />
      {busy ? <b>Загружаем…</b> : uploaded
        ? <><b>Загружено{fileName ? `: ${fileName}` : ''}</b><span>Нажмите или перетащите, чтобы заменить</span></>
        : <><b>Перетащите файл сюда или нажмите</b><span>{kind === 'photo' ? 'JPG, PNG, WebP — до 10 МБ' : kind === 'video' ? 'MP4 или WebM — до 500 МБ' : 'PDF, Word, Excel, PowerPoint — до 50 МБ'}</span></>}
    </label>
  )
}

/* ─── Настройки урока ───────────────────────────────────────── */
function Settings({ lesson, editable, onSaved, onDeleted, ask }) {
  const toast = useToast()
  const [f, setF] = useState({ title: lesson.title, minutes: lesson.minutes, deadline: lesson.deadline || '', description: lesson.description || '' })

  async function save(e) {
    e.preventDefault()
    try {
      await api.admin.updateLesson(lesson.id, { ...f, minutes: Number(f.minutes) || 8, deadline: f.deadline || null })
      toast('Настройки сохранены', 'success'); onSaved()
    } catch (e) { toast(e.message, 'error') }
  }

  async function remove() {
    if (!(await ask({ title: 'Удалить урок?', text: 'Урок, его материалы и тест удалятся без возможности восстановления.', ok: 'Удалить', danger: true }))) return
    try { await api.admin.deleteLesson(lesson.id); toast('Урок удалён', 'success'); onDeleted() } catch (e) { toast(e.message, 'error') }
  }

  return (
    <form className="card" onSubmit={save} style={{ maxWidth: 640 }}>
      <fieldset disabled={!editable} style={{ border: 'none', margin: 0, padding: 0 }} className="col">
        <div className="field"><label>Название урока</label><input className="input" required value={f.title} onChange={e => setF(x => ({ ...x, title: e.target.value }))} /></div>
        <div className="field"><label>Короткое описание</label><textarea className="textarea" rows={2} value={f.description} onChange={e => setF(x => ({ ...x, description: e.target.value }))} placeholder="Что сотрудник узнает в этом уроке" /></div>
        <div className="form-grid two">
          <div className="field"><label>Время прохождения, мин</label><input className="input" type="number" min="1" value={f.minutes} onChange={e => setF(x => ({ ...x, minutes: e.target.value }))} /></div>
          <div className="field">
            <label>Дедлайн</label>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" type="date" value={f.deadline} onChange={e => setF(x => ({ ...x, deadline: e.target.value }))} />
              {f.deadline && <button type="button" className="btn ghost icon" aria-label="Убрать дедлайн" onClick={() => setF(x => ({ ...x, deadline: '' }))}><Icon.x size={16} /></button>}
            </div>
            <span className="hint">Мягкий: опоздавшие не блокируются, а попадают в «Просрочки»</span>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
          <button className="btn">Сохранить</button>
          <button type="button" className="btn danger" onClick={remove}><Icon.trash size={16} />Удалить урок</button>
        </div>
        <p className="hint">Награда за урок одинакова для всех: +10 XP и +15 COIL, за тест ещё +15 XP и +10 COIL, за 100% — бонус.</p>
      </fieldset>
    </form>
  )
}

/* ─── Редактор теста ──────────────────────────────────────── */
function TestEditor({ lessonId, initial, editable, onSaved }) {
  const toast = useToast()
  const [cfg, setCfg] = useState({
    pass_score: initial?.pass_score ?? 70,
    attempts_allowed: initial?.attempts_allowed ?? 3,
    pause_minutes: initial?.pause_minutes ?? 10,
    show_answers: initial ? !!initial.show_answers : true
  })
  const [qs, setQs] = useState(initial?.questions?.length ? initial.questions : [])
  const [dirty, setDirty] = useState(false)

  function addQ(type = 'single') {
    setQs(v => [...v, { type, prompt: '', options: type === 'single' || type === 'multi' ? ['', '', ''] : [], correct: type === 'boolean' ? [0] : [], explanation: '' }])
    setDirty(true)
  }
  function upd(i, patch) { setQs(v => v.map((q, j) => j === i ? { ...q, ...patch } : q)); setDirty(true) }

  async function save() {
    try {
      const res = await api.admin.saveTest(lessonId, { ...cfg, questions: qs })
      toast(`Тест сохранён · ${res.count} вопр.`, 'success')
      setDirty(false); onSaved()
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <fieldset disabled={!editable} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }} className="col">
      <div className="card">
        <div className="form-grid two" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[['pass_score', 'Проходной балл, %'], ['attempts_allowed', 'Попыток'], ['pause_minutes', 'Пауза между, мин']].map(([k, l]) => (
            <div key={k} className="field">
              <label>{l}</label>
              <input className="input" type="number" min="0" value={cfg[k]} onChange={e => { setCfg(c => ({ ...c, [k]: Number(e.target.value) })); setDirty(true) }} />
            </div>
          ))}
        </div>
        <label className="check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={cfg.show_answers} onChange={e => { setCfg(c => ({ ...c, show_answers: e.target.checked })); setDirty(true) }} />
          Показывать правильные ответы и пояснения после попытки
        </label>
      </div>

      {qs.length === 0 && <div className="empty"><p className="muted">В уроке пока нет теста. Без теста урок засчитывается по кнопке «Завершить».</p></div>}

      {qs.map((q, i) => (
        <div key={i} className="block-editor">
          <div className="block-editor-head">
            <span className="badge brand">Вопрос {i + 1}</span>
            <div className="row" style={{ gap: 2 }}>
              <button className="btn ghost plain xs icon" disabled={i === 0} onClick={() => { setQs(v => { const a = [...v]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a }); setDirty(true) }} aria-label="Выше"><Icon.chevU size={16} /></button>
              <button className="btn ghost plain xs icon" disabled={i === qs.length - 1} onClick={() => { setQs(v => { const a = [...v]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return a }); setDirty(true) }} aria-label="Ниже"><Icon.chevD size={16} /></button>
              <button className="btn ghost plain xs icon" onClick={() => { setQs(v => v.filter((_, j) => j !== i)); setDirty(true) }} aria-label="Удалить вопрос"><Icon.trash size={16} /></button>
            </div>
          </div>
          <div className="block-editor-body">
            <select className="select" value={q.type} onChange={e => {
              const t = e.target.value
              upd(i, { type: t, correct: t === 'boolean' ? [0] : [], options: t === 'single' || t === 'multi' ? (q.options?.length ? q.options : ['', '', '']) : [] })
            }}>
              <option value="single">Один правильный ответ</option>
              <option value="multi">Несколько правильных</option>
              <option value="boolean">Верно / неверно</option>
              <option value="open">Открытый ответ — проверит администратор</option>
            </select>
            <textarea className="textarea" rows={2} placeholder={q.type === 'boolean' ? 'Утверждение, например: «Жидкости можно смешивать без ограничений»' : 'Формулировка вопроса'}
              value={q.prompt} onChange={e => upd(i, { prompt: e.target.value })} />

            {q.type === 'boolean' && (
              <div className="row" style={{ gap: 8 }}>
                {['Верно', 'Неверно'].map((l, j) => (
                  <button key={j} type="button" className={'option' + (q.correct?.[0] === j ? ' picked' : '')} style={{ minHeight: 48, flex: 1 }} onClick={() => upd(i, { correct: [j] })}>
                    <span className="key">{q.correct?.[0] === j ? <Icon.check size={15} /> : j + 1}</span>{l}
                  </button>
                ))}
              </div>
            )}

            {(q.type === 'single' || q.type === 'multi') && (
              <div className="col" style={{ gap: 6 }}>
                {q.options.map((o, j) => {
                  const right = q.correct.includes(j)
                  return (
                    <div key={j} className="row" style={{ gap: 6 }}>
                      <button type="button" className={'option' + (right ? ' picked' : '')} style={{ padding: 0, minHeight: 44, width: 44, flex: 'none', justifyContent: 'center' }}
                        onClick={() => upd(i, { correct: q.type === 'multi' ? (right ? q.correct.filter(c => c !== j) : [...q.correct, j]) : [j] })}
                        aria-label={right ? 'Правильный ответ' : 'Отметить правильным'} title="Отметить правильным">
                        {right ? <Icon.check size={17} style={{ color: 'var(--brand-text)' }} /> : <span className="muted bold">{j + 1}</span>}
                      </button>
                      <input className="input" style={{ minHeight: 44 }} value={o} placeholder={`Вариант ${j + 1}`}
                        onChange={e => upd(i, { options: q.options.map((x, k) => k === j ? e.target.value : x) })} />
                      <button type="button" className="btn ghost plain xs icon" disabled={q.options.length <= 2} aria-label="Удалить вариант"
                        onClick={() => upd(i, { options: q.options.filter((_, k) => k !== j), correct: q.correct.filter(c => c !== j).map(c => c > j ? c - 1 : c) })}><Icon.x size={14} /></button>
                    </div>
                  )
                })}
                <div className="row between">
                  <button type="button" className="btn ghost xs" disabled={q.options.length >= 8} onClick={() => upd(i, { options: [...q.options, ''] })}><Icon.plus size={13} />Вариант</button>
                  <span className={'hint' + (q.correct.length ? '' : ' error')}>{q.correct.length ? 'Галочка — правильный ответ' : 'Нажмите номер слева, чтобы отметить правильный ответ'}</span>
                </div>
              </div>
            )}

            {q.type === 'open' && <p className="hint">Сотрудник отвечает текстом. Урок засчитается после проверки администратором — в разделе «Проверки».</p>}

            <div className="field">
              <label>{q.type === 'open' ? 'Подсказка для проверяющего' : 'Пояснение — покажем, если ошибся'}</label>
              <input className="input" value={q.explanation || ''} onChange={e => upd(i, { explanation: e.target.value })} placeholder={q.type === 'open' ? 'Что должно быть в хорошем ответе' : 'Почему правильный ответ именно такой'} />
            </div>
          </div>
        </div>
      ))}

      {editable && (
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn ghost sm" onClick={() => addQ('single')}><Icon.plus size={15} />Вопрос</button>
          <button type="button" className="btn ghost sm" onClick={() => addQ('boolean')}><Icon.plus size={15} />Верно / неверно</button>
          <button type="button" className="btn ghost sm" onClick={() => addQ('open')}><Icon.plus size={15} />Открытый</button>
          <button type="button" className="btn sm" style={{ marginLeft: 'auto' }} onClick={save} disabled={!dirty}>{dirty ? 'Сохранить тест' : 'Тест сохранён'}</button>
        </div>
      )}
    </fieldset>
  )
}
