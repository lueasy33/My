import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, PageSkeleton, LoadError, useToast, answerSound } from '../ui'
import { FlavorFacts, Mastery, brandColor } from './flavorUi'

const KEYS = ['1', '2', '3', '4']

// Сессия как в Duolingo: новый вкус — карточка знакомства, затем вопрос.
// После ответа снизу выезжает плашка: зелёная «Верно!» или красная с правильным ответом.
// Ошибки повторяются в конце сессии (без влияния на расписание повторений).
export default function FlavorSession() {
  const { user, refresh } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const brand = params.get('brand') || ''
  const [queue, setQueue] = useState(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState(null)
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [stats, setStats] = useState({ correct: 0, total: 0, combo: 0, best: 0, xp: 0, coil: 0 })
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError(null); setQueue(null); setIdx(0); setPicked(null); setFeedback(null); setSummary(null)
    setStats({ correct: 0, total: 0, combo: 0, best: 0, xp: 0, coil: 0 })
    try {
      const r = await api.flavorSession(brand)
      setQueue(r.items); setTitle(r.brand || 'Тренировка дня')
    } catch (e) { setError(e) }
  }
  useEffect(() => { load() }, [brand])

  const item = queue?.[idx]
  const questions = queue ? queue.filter(x => x.type !== 'intro').length : 0

  // Клавиатура: 1–4 — варианты, Enter — дальше
  useEffect(() => {
    const h = (e) => {
      if (!item || summary) return
      if (e.key === 'Enter') { e.preventDefault(); item.type === 'intro' || feedback ? next() : picked !== null && check() }
      const n = KEYS.indexOf(e.key)
      if (n >= 0 && !feedback && item.options?.[n]) setPicked(item.options[n].id)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  async function check() {
    if (picked === null || busy) return
    setBusy(true)
    try {
      const r = await api.flavorAnswer({ flavor_id: item.flavor_id, type: item.type, choice: picked, retry: !!item.retry })
      setFeedback(r)
      if (user.sound) answerSound(r.correct)
      setStats(s => {
        const combo = r.correct ? s.combo + 1 : 0
        return { correct: s.correct + (r.correct ? 1 : 0), total: s.total + 1, combo, best: Math.max(s.best, combo), xp: s.xp + r.gained.xp, coil: s.coil + r.gained.coil }
      })
      // Ошибку повторим в конце — один раз
      if (!r.correct && !item.retry) setQueue(qq => [...qq, { ...item, retry: true }])
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function next() {
    setPicked(null); setFeedback(null)
    if (idx < queue.length - 1) { setIdx(i => i + 1); return }
    try {
      const firstTry = stats
      const r = await api.flavorFinish(firstTry.correct, firstTry.total)
      setSummary({ ...r, ...firstTry })
      refresh()
    } catch (e) { toast(e.message, 'error') }
  }

  async function quit() { nav(brand ? `/flavors/brand/${brand}` : '/flavors') }

  if (error) return <main className="page lesson-page"><LoadError error={error} onRetry={load} /></main>
  if (!queue) return <main className="page lesson-page"><PageSkeleton /></main>

  if (!queue.length) {
    return (
      <main className="page lesson-page">
        <div className="card center" style={{ padding: 34 }}>
          <span className="list-ico success" style={{ margin: '0 auto', width: 56, height: 56 }}><Icon.check size={28} /></span>
          <h2 style={{ fontSize: 20, marginTop: 12 }}>На сегодня всё повторено</h2>
          <p className="muted" style={{ marginTop: 6 }}>Новые повторения появятся, когда подойдёт срок. Загляни в коллекцию или выбери бренд.</p>
          <button className="btn block" style={{ marginTop: 18 }} onClick={() => nav('/flavors')}>К вкусам</button>
        </div>
      </main>
    )
  }

  if (summary) {
    const acc = summary.total ? Math.round((summary.correct / summary.total) * 100) : 0
    return (
      <main className="page lesson-page">
        <div className="card center session-end">
          <div className="session-end-badge">{summary.perfect ? <Icon.trophy size={40} /> : <Icon.check size={40} />}</div>
          <h1 style={{ fontSize: 26, marginTop: 14 }}>{summary.perfect ? 'Без единой ошибки!' : acc >= 70 ? 'Отличная тренировка!' : 'Тренировка завершена'}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{title}</p>
          <div className="session-stats">
            <div><b className="reward">+{summary.xp + (summary.gained?.xp || 0)}</b><span>XP</span></div>
            <div><b style={{ color: acc >= 70 ? 'var(--success-text)' : 'var(--warning-text)' }}>{acc}%</b><span>точность</span></div>
            <div><b className="reward"><Icon.flame size={18} />{summary.best}</b><span>серия ответов</span></div>
          </div>
          {(summary.coil + (summary.gained?.coil || 0)) > 0 && <span className="chip-reward" style={{ marginTop: 14 }}><Icon.coin size={15} />+{summary.coil + (summary.gained?.coil || 0)} COIL</span>}
          <p className="small muted" style={{ marginTop: 16 }}>Ошибки вернутся завтра, верные ответы — через 3, 7 и 21 день. Так вкусы запоминаются надолго.</p>
          <div className="col" style={{ gap: 8, marginTop: 20 }}>
            <button className="btn block" onClick={load}><Icon.refresh size={17} />Ещё тренировка</button>
            <button className="btn ghost block" onClick={quit}>Готово</button>
          </div>
        </div>
      </main>
    )
  }

  const answeredBefore = queue.slice(0, idx).filter(x => x.type !== 'intro' && !x.retry).length
  const progress = Math.min(100, (answeredBefore / Math.max(1, questions)) * 100)

  return (
    <div className="session">
      <header className="session-top">
        <button className="icon-btn" onClick={quit} aria-label="Выйти из тренировки"><Icon.x size={22} /></button>
        <div className="bar session-bar"><i style={{ width: `${progress}%` }} /></div>
        {stats.combo >= 2 && <span className="chip-reward combo"><Icon.flame size={15} />{stats.combo}</span>}
      </header>

      <main className="page lesson-page session-body" key={idx}>
        {item.retry && <div className="badge warn" style={{ marginBottom: 12 }}><Icon.refresh size={12} />Повторим ошибку</div>}

        {item.type === 'intro' ? (
          <>
            <div className="eyebrow" style={{ color: 'var(--brand-text)', marginBottom: 10 }}><Icon.sparkles size={13} /> Новый вкус</div>
            <div className="row" style={{ gap: 14, marginBottom: 16 }}>
              {item.flavor.image
                ? <img src={item.flavor.image} alt="" className="flavor-img" />
                : <span className="flavor-tile-img placeholder" style={{ width: 84, height: 84, fontSize: 34, '--c': brandColor({ name: item.flavor.brand }) }}>{item.flavor.name.slice(0, 1)}</span>}
              <div>
                <h1 style={{ fontSize: 28 }}>{item.flavor.name}</h1>
                <div className="muted bold">{item.flavor.brand}</div>
              </div>
            </div>
            <FlavorFacts f={item.flavor} />
          </>
        ) : (
          <>
            <h2 className="session-prompt">{item.prompt}</h2>
            {item.subject && (
              <div className="session-subject">
                {item.subject.image && <img src={item.subject.image} alt="" />}
                <div><b>{item.subject.name}</b>{item.subject.brand && <span className="muted"> · {item.subject.brand}</span>}</div>
              </div>
            )}
            {item.clue && (
              <div className="session-subject" style={{ display: 'block' }}>
                <p style={{ fontSize: 16 }}>«{item.clue.description}»</p>
                {item.clue.tags?.length > 0 && <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>{item.clue.tags.map(t => <span key={t} className="badge">{t}</span>)}</div>}
              </div>
            )}
            <div className={'col session-options' + (item.type === 'cold' || item.type === 'strength' ? ' compact' : '')} role="radiogroup">
              {item.options.map((o, i) => {
                const isPicked = String(picked) === String(o.id)
                const isRight = feedback && String(feedback.right) === String(o.id)
                const isWrong = feedback && isPicked && !feedback.correct
                return (
                  <button key={o.id} className={'option' + (isRight ? ' correct' : isWrong ? ' wrong' : isPicked ? ' picked' : '')}
                    disabled={!!feedback} onClick={() => setPicked(o.id)} role="radio" aria-checked={isPicked}>
                    <span className="key">{KEYS[i]}</span>
                    <span style={{ flex: 1 }}>{o.label}{o.sub && <span className="tiny muted" style={{ display: 'block' }}>{o.sub}</span>}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </main>

      <footer className={'session-foot' + (feedback ? (feedback.correct ? ' ok' : ' bad') : '')}>
        <div className="session-foot-inner">
          {feedback && (
            <div className="session-feedback">
              <b>{feedback.correct ? (stats.combo >= 3 ? `Отлично! ${stats.combo} подряд` : 'Верно!') : 'Не совсем'}</b>
              {!feedback.correct && <span>Правильно: <b>{(item.options.find(o => String(o.id) === String(feedback.right)) || {}).label}</b></span>}
              <span className="small">
                <b>{feedback.flavor.name}</b> ({feedback.flavor.brand}){feedback.flavor.description ? ` — ${feedback.flavor.description}` : ''}
              </span>
              <span className="row" style={{ gap: 8 }}><Mastery box={feedback.box} />{feedback.gained.xp > 0 && <span className="tiny bold reward">+{feedback.gained.xp} XP</span>}</span>
            </div>
          )}
          {item.type === 'intro' ? (
            <button className="btn block" onClick={next}>Запомнил, дальше <Icon.arrowR size={18} /></button>
          ) : feedback ? (
            <button className={'btn block ' + (feedback.correct ? 'success' : 'danger-fill')} onClick={next}>Продолжить</button>
          ) : (
            <button className="btn block" disabled={picked === null || busy} onClick={check}>Проверить</button>
          )}
        </div>
      </footer>
    </div>
  )
}
