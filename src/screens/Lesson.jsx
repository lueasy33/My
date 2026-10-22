import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, PageSkeleton, LoadError, useToast, fmtSize, parseDate } from '../ui'
import Test from './Test'

/* ─── Чтение урока: блоки из данных, а не из вёрстки ─────────── */
export default function Lesson() {
  const { id } = useParams()
  const nav = useNavigate()
  const { refresh } = useApp()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('read')
  const [scrolled, setScrolled] = useState(0)
  const [busy, setBusy] = useState(false)
  const [reward, setReward] = useState(null)
  const [, tick] = useState(0)

  async function load() {
    setError(null)
    try {
      const d = await api.lesson(id)
      setData(d)
      setMode(d.progress?.status === 'passed' ? 'done' : d.progress?.status === 'pending' ? 'pending' : 'read')
    } catch (e) {
      setError(e)
      if (e.data?.locked) toast('Сначала пройди предыдущий урок курса')
    }
  }

  useEffect(() => { setData(null); setReward(null); setScrolled(0); load() }, [id])

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight
      setScrolled(h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 100)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [data, mode])

  // Обратный отсчёт паузы между попытками
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 15000)
    return () => clearInterval(t)
  }, [])

  if (error) {
    return (
      <main className="page lesson-page">
        <button className="btn ghost sm plain" style={{ marginLeft: -10, marginBottom: 12 }} onClick={() => error.data?.course_id ? nav(`/course/${error.data.course_id}`) : nav(-1)}>
          <Icon.chevL size={18} /> Назад
        </button>
        <LoadError error={error} onRetry={error.status === 403 ? null : load} />
      </main>
    )
  }
  if (!data) return <main className="page lesson-page"><PageSkeleton /></main>

  const { lesson, blocks, test, siblings, index, attemptsUsed, lastAttempt } = data
  const attemptsLeft = test ? test.attempts_allowed - attemptsUsed : 0
  const pauseLeft = (() => {
    if (!lastAttempt || !test || lastAttempt.passed) return 0
    const since = (Date.now() - parseDate(lastAttempt.created_at).getTime()) / 60000
    return Math.max(0, Math.ceil(test.pause_minutes - since))
  })()
  const exhausted = test && attemptsLeft <= 0 && data.progress?.status !== 'passed'
  const next = siblings[siblings.findIndex(s => s.id === lesson.id) + 1]

  async function finishReading() {
    if (test) { setMode('test'); window.scrollTo(0, 0); return }
    setBusy(true)
    try {
      const res = await api.completeLesson(lesson.id)
      setReward(res.reward)
      setMode('done')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      refresh()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <>
      <header className="lesson-top">
        <button className="icon-btn" onClick={() => nav(`/course/${lesson.course_id}`)} aria-label="К курсу">
          <Icon.chevL size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tiny muted bold ellipsis">{lesson.course} · урок {index} из {siblings.length}</div>
          <div className="bold ellipsis" style={{ fontSize: 14.5 }}>{mode === 'test' ? `Тест: ${lesson.title}` : lesson.title}</div>
        </div>
        {mode === 'test' && (
          <button className="btn ghost xs" onClick={() => setMode('read')}>К уроку</button>
        )}
        <div className="progress-line"><i style={{ width: `${mode === 'read' ? scrolled : 100}%` }} /></div>
      </header>

      <main className="page lesson-page">
        {data.preview && (
          <div className="callout warn" style={{ marginTop: 0 }}>
            <span className="ico"><Icon.eye size={18} /></span>
            <div>Предпросмотр черновика. Сотрудники этот урок пока не видят.</div>
          </div>
        )}

        {mode === 'test' && test ? (
          <Test data={data} onDone={async (res) => {
            await refresh()
            setData(d => ({
              ...d,
              attemptsUsed: d.attemptsUsed + 1,
              lastAttempt: { ...res.attempt, created_at: new Date().toISOString() },
              progress: { ...(d.progress || {}), status: res.attempt.pending ? 'pending' : res.attempt.passed ? 'passed' : (d.progress?.status === 'passed' ? 'passed' : 'failed') }
            }))
          }} onBack={() => { load(); window.scrollTo(0, 0) }} next={next} />
        ) : (
          <>
            <h1 style={{ fontSize: 26, lineHeight: 1.2, marginBottom: 8 }}>{lesson.title}</h1>
            <div className="course-meta" style={{ marginBottom: 22 }}>
              <span><Icon.clock size={13} />≈{lesson.minutes} мин</span>
              {test && <span><Icon.target size={13} />тест · {test.questions.length} {test.questions.length < 5 ? 'вопроса' : 'вопросов'}</span>}
              {lesson.deadline && <span><Icon.calendar size={13} />до {new Date(lesson.deadline + 'T00:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long' })}</span>}
            </div>

            {mode === 'done' && <DoneCard reward={reward} next={next} courseId={lesson.course_id} />}
            {mode === 'pending' && (
              <div className="card" style={{ marginBottom: 22, borderColor: 'color-mix(in srgb, var(--warning) 40%, var(--border))' }}>
                <div className="row" style={{ gap: 12 }}>
                  <span className="list-ico warn"><Icon.clock size={20} /></span>
                  <div><b>Ответ на проверке</b><p className="small muted">Администратор проверит открытый ответ, и награда начислится. Мы пришлём уведомление.</p></div>
                </div>
              </div>
            )}

            {lesson.description && <p className="muted" style={{ fontSize: 16, marginBottom: 18 }}>{lesson.description}</p>}
            <article className="lesson-body">
              {blocks.length === 0 && <div className="empty"><p className="muted">В уроке пока нет материалов</p></div>}
              {blocks.map(b => <Block key={b.id} block={b} />)}
            </article>

            {mode === 'read' && (
              <div className="lesson-actions">
                {exhausted ? (
                  <div className="center small muted" style={{ padding: '6px 0' }}>
                    <b style={{ color: 'var(--text-primary)' }}>Попытки закончились.</b> Обратись к администратору — он поможет разобраться.
                  </div>
                ) : (
                  <>
                    <button className="btn block" onClick={finishReading} disabled={busy || (!!test && pauseLeft > 0)}>
                      {busy ? 'Сохраняем…' : test ? (pauseLeft > 0 ? `Новая попытка через ${pauseLeft} мин` : 'Перейти к тесту') : 'Завершить урок'}
                      {!busy && !pauseLeft && <Icon.arrowR size={18} />}
                    </button>
                    {test && (
                      <p className="tiny muted center" style={{ marginTop: 7 }}>
                        {data.progress?.status === 'failed' ? `Тест не сдан. Осталось попыток: ${attemptsLeft}` : `Проходной балл ${test.pass_score}% · попыток: ${attemptsLeft}`}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {mode === 'done' && test && data.progress?.status === 'passed' && attemptsLeft > 0 && (
              <button className="btn ghost block" style={{ marginTop: 24 }} disabled={pauseLeft > 0} onClick={() => { setMode('test'); window.scrollTo(0, 0) }}>
                <Icon.refresh size={17} /> Пройти тест ещё раз — улучшить результат
              </button>
            )}
          </>
        )}
      </main>
    </>
  )
}

function DoneCard({ reward, next, courseId }) {
  return (
    <div className="card reward-bg" style={{ marginBottom: 22 }}>
      <div className="row" style={{ gap: 12 }}>
        <span className="list-ico success"><Icon.check size={20} /></span>
        <div style={{ flex: 1 }}>
          <b>Урок пройден</b>
          <p className="small muted">{reward && (reward.xp || reward.coil) ? 'Награда начислена' : 'Повторное чтение XP не добавляет — но освежает память'}</p>
        </div>
      </div>
      {reward && (reward.xp > 0 || reward.coil > 0) && (
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          {reward.xp > 0 && <span className="chip-reward"><Icon.bolt size={15} />+{reward.xp} XP</span>}
          {reward.coil > 0 && <span className="chip-reward"><Icon.coin size={15} />+{reward.coil} COIL</span>}
        </div>
      )}
      <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
        {next && <Link to={`/lesson/${next.id}`} className="btn sm" style={{ flex: 1 }}>Следующий урок <Icon.arrowR size={17} /></Link>}
        <Link to={`/course/${courseId}`} className="btn ghost sm" style={{ flex: next ? 'none' : 1 }}>К курсу</Link>
      </div>
    </div>
  )
}

/* ─── Видео ─────────────────────────────────────────────────── */
// Внешние видеохостинги встраиваются плеером площадки; свои файлы — через <video>.
export function videoEmbed(src, start = 0) {
  const s = String(src || '').trim()
  let m
  if ((m = s.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/))) {
    return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&autoplay=1${start ? `&start=${Math.floor(start)}` : ''}`
  }
  if ((m = s.match(/rutube\.ru\/(?:video|play\/embed)\/([\w]+)/))) return `https://rutube.ru/play/embed/${m[1]}?autoplay=1`
  if ((m = s.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/))) return `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2&autoplay=1`
  return null
}

function Video({ block }) {
  const c = block.content
  const [playing, setPlaying] = useState(false)
  const ref = useRef(null)
  const last = useRef(0)
  const src = c.src || ''
  const embed = videoEmbed(src, block.position)

  function save(force) {
    const v = ref.current
    if (!v) return
    const t = v.currentTime
    if (!force && Math.abs(t - last.current) < 5) return
    last.current = t
    // Досмотрел до конца — в следующий раз начнём сначала
    const pos = v.duration && t > v.duration - 3 ? 0 : t
    api.videoPosition(block.id, pos).catch(() => {})
  }

  if (!src) return <div className="media missing"><span><Icon.video size={24} /><br />Видео ещё не добавлено</span></div>

  return (
    <figure className="media">
      <div className="video-box">
        {!playing ? (
          <button className="video-cover" onClick={() => setPlaying(true)} aria-label={`Смотреть видео: ${c.title || ''}`}>
            <span className="play-btn"><Icon.play size={30} /></span>
            <small>{c.title || 'Видео урока'}{block.position > 5 ? ` · продолжить с ${fmtTime(block.position)}` : ''}</small>
          </button>
        ) : embed ? (
          <iframe src={embed} title={c.title || 'Видео'} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        ) : (
          <video ref={ref} src={src} controls autoPlay playsInline preload="metadata"
            onLoadedMetadata={e => { if (block.position > 5 && block.position < e.currentTarget.duration - 3) e.currentTarget.currentTime = block.position }}
            onTimeUpdate={() => save(false)} onPause={() => save(true)} onEnded={() => save(true)} />
        )}
      </div>
      {c.title && <figcaption>{c.title}</figcaption>}
    </figure>
  )
}

function fmtTime(s) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/* ─── Рендер блоков контента ────────────────────────────────── */
export function Block({ block }) {
  const c = block.content || {}
  if (block.type === 'photo') {
    if (!c.src) return <div className="media missing"><span><Icon.image size={24} /><br />Изображение ещё не добавлено</span></div>
    return (
      <figure className="media">
        <img src={c.src} alt={c.alt || c.caption || ''} loading="lazy"
          onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling?.classList?.remove('hidden') }} />
        <div className="media missing hidden"><span><Icon.image size={24} /><br />Не удалось загрузить изображение</span></div>
        {c.caption && <figcaption>{c.caption}</figcaption>}
      </figure>
    )
  }
  if (block.type === 'video') return <Video block={block} />
  if (block.type === 'file') {
    if (!c.href) return null
    return (
      <a href={c.href} className="file-card" target="_blank" rel="noopener noreferrer" download={c.href.startsWith('/uploads/') ? (c.name || true) : undefined}>
        <span className="list-ico"><Icon.file size={20} /></span>
        <span className="list-main">
          <b>{c.title || c.name || 'Файл'}</b>
          <span>{[fileExt(c.href, c.name), c.size ? (typeof c.size === 'number' ? fmtSize(c.size) : c.size) : ''].filter(Boolean).join(' · ') || 'Открыть'}</span>
        </span>
        <Icon.download size={19} style={{ color: 'var(--text-muted)' }} />
      </a>
    )
  }

  // Текстовый блок: набор абзацев, заголовков, списков, таблиц
  const items = c.blocks || []
  return items.map((it, i) => {
    if (it.t === 'h') return <h3 key={i}>{it.text}</h3>
    if (it.t === 'p') return <p key={i}>{renderInline(it)}</p>
    if (it.t === 'quote') return <blockquote key={i}>{it.text}</blockquote>
    if (it.t === 'note') {
      const ico = it.tone === 'danger' || it.tone === 'warn' ? <Icon.alert size={18} /> : <Icon.sparkles size={18} />
      return <div key={i} className={'callout ' + (it.tone || 'tip')}><span className="ico">{ico}</span><div>{it.text}</div></div>
    }
    if (it.t === 'list') {
      const Tag = it.ordered ? 'ol' : 'ul'
      return <Tag key={i}>{(it.items || []).filter(x => String(x).trim()).map((x, j) => <li key={j}>{renderInline({ text: x })}</li>)}</Tag>
    }
    if (it.t === 'table') {
      return (
        <div key={i} className="table-wrap" style={{ margin: '16px 0' }}>
          <table className="dtable">
            <thead><tr>{it.head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
            <tbody>{it.rows.map((r, j) => <tr key={j}>{r.map((cell, k) => <td key={k}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    }
    return null
  })
}

function fileExt(href, name) {
  const m = String(name || href || '').match(/\.([a-z0-9]{2,5})(?:$|\?)/i)
  return m ? m[1].toUpperCase() : ''
}

// Термины с подсказкой, **жирный** и ссылки. Без HTML — только безопасная разметка.
function renderInline(p) {
  let parts = [String(p.text || '')]
  for (const w of p.words || []) {
    parts = parts.flatMap(part => {
      if (typeof part !== 'string') return [part]
      const idx = part.indexOf(w.w)
      if (idx === -1) return [part]
      return [part.slice(0, idx), <abbr key={w.w + idx} className="term" title={w.hint} tabIndex={0}>{w.w}</abbr>, part.slice(idx + w.w.length)]
    })
  }
  parts = parts.flatMap((part, n) => {
    if (typeof part !== 'string') return [part]
    return part.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).map((s, k) => {
      if (/^\*\*[^*]+\*\*$/.test(s)) return <strong key={`b${n}-${k}`}>{s.slice(2, -2)}</strong>
      if (/^https?:\/\//.test(s)) return <a key={`a${n}-${k}`} href={s} target="_blank" rel="noopener noreferrer">{s}</a>
      return s
    })
  })
  return parts
}
