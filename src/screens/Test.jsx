import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Icon, ProgressBar, plural } from '../ui'

const KEYS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З']

export default function Test({ data, onDone, onBack, next }) {
  const { test, lesson, attemptsUsed } = data
  const [answers, setAnswers] = useState({})
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState('quiz') // quiz | sending | result
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  const qs = test.questions
  const q = qs[idx]
  const attemptsLeft = test.attempts_allowed - attemptsUsed

  // Ответы не теряются при случайном уходе со страницы
  const draftKey = `test-draft-${test.id}`
  useEffect(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(draftKey) || 'null'); if (saved) setAnswers(saved) } catch {}
  }, [draftKey])
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify(answers)) } catch {}
  }, [answers, draftKey])

  async function submit() {
    setPhase('sending'); setErr('')
    try {
      const res = await api.submitTest(test.id, answers)
      try { sessionStorage.removeItem(draftKey) } catch {}
      setResult(res)
      setPhase('result')
      window.scrollTo(0, 0)
      onDone?.(res)
    } catch (e) {
      setErr(e.message)
      setPhase('quiz')
    }
  }

  function pick(qq, value) {
    setAnswers(a => {
      if (qq.type === 'multi') {
        const cur = Array.isArray(a[qq.id]) ? a[qq.id] : []
        return { ...a, [qq.id]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] }
      }
      return { ...a, [qq.id]: [value] }
    })
  }

  const isPicked = (qq, value) => {
    const a = answers[qq.id]
    return Array.isArray(a) && a.includes(value)
  }

  if (phase === 'result' && result) {
    return <ResultView result={result} lesson={lesson} questions={qs} onBack={onBack} next={next} />
  }

  if (phase === 'sending') {
    return (
      <div className="card center" style={{ padding: 40 }}>
        <div className="skel" style={{ height: 64, borderRadius: 14 }} />
        <p className="muted" style={{ marginTop: 14 }}>Проверяем ответы…</p>
      </div>
    )
  }

  const answered = (qq) => qq.type === 'open'
    ? String(answers[qq.id] || '').trim().length >= 3
    : (answers[qq.id] || []).length > 0
  const canNext = answered(q)
  const allDone = qs.every(answered)

  return (
    <div>
      <div className="row between small" style={{ marginBottom: 10 }}>
        <span className="muted bold">Вопрос {idx + 1} из {qs.length}</span>
        <span className="muted">попытка {attemptsUsed + 1} из {test.attempts_allowed}</span>
      </div>
      <ProgressBar percent={((idx + 1) / qs.length) * 100} />

      <div style={{ marginTop: 24 }}>
        <p className="small muted bold" style={{ marginBottom: 8 }}>
          {q.type === 'multi' ? 'Выбери все правильные варианты'
            : q.type === 'open' ? 'Ответь своими словами — проверит администратор'
            : q.type === 'boolean' ? 'Верно или неверно?'
            : 'Выбери один ответ'}
        </p>
        <h2 style={{ fontSize: 21, lineHeight: 1.4, marginBottom: 20, fontWeight: 750 }}>{q.prompt}</h2>

        {q.type === 'open' ? (
          <div className="field">
            <textarea className="textarea" rows={6} placeholder="Напиши ответ…" maxLength={4000}
              value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
            <span className="hint">Ориентир: 2–4 предложения.</span>
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }} role={q.type === 'multi' ? 'group' : 'radiogroup'}>
            {q.options.map((opt, i) => (
              <button key={i} className={'option' + (isPicked(q, i) ? ' picked' : '')}
                onClick={() => pick(q, i)} role={q.type === 'multi' ? 'checkbox' : 'radio'} aria-checked={isPicked(q, i)}>
                <span className={'key' + (q.type === 'multi' ? ' box' : '')}>{q.type === 'multi' && isPicked(q, i) ? <Icon.check size={16} /> : KEYS[i]}</span>
                <span style={{ flex: 1 }}>{opt}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {err && <div className="callout danger" role="alert"><span className="ico"><Icon.alert size={18} /></span><div>{err}</div></div>}

      <div className="row" style={{ gap: 10, marginTop: 26 }}>
        {idx > 0 && (
          <button className="btn ghost" onClick={() => setIdx(i => i - 1)} aria-label="Предыдущий вопрос">
            <Icon.chevL size={18} />
          </button>
        )}
        {idx < qs.length - 1 ? (
          <button className="btn" style={{ flex: 1 }} disabled={!canNext} onClick={() => setIdx(i => i + 1)}>
            Дальше <Icon.chevR size={18} />
          </button>
        ) : (
          <button className="btn" style={{ flex: 1 }} disabled={!allDone} onClick={submit}>
            Проверить ответы
          </button>
        )}
      </div>

      {qs.length > 1 && (
        <div className="row wrap" style={{ gap: 6, justifyContent: 'center', marginTop: 18 }}>
          {qs.map((qq, i) => (
            <button key={qq.id} onClick={() => setIdx(i)} aria-label={`Вопрос ${i + 1}`}
              style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 800, fontSize: 12.5,
                background: i === idx ? 'var(--brand-500)' : answered(qq) ? 'var(--brand-soft)' : 'var(--surface-1)',
                color: i === idx ? 'var(--text-on-brand)' : answered(qq) ? 'var(--brand-text)' : 'var(--text-muted)' }}>
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {attemptsLeft <= 1 && <p className="small muted center" style={{ marginTop: 14 }}>Это последняя попытка — не торопись</p>}
    </div>
  )
}

/* ─── Результат: разбор важнее процента ─────────────────────── */
function ResultView({ result, lesson, questions, onBack, next }) {
  const nav = useNavigate()
  const { attempt, review, reward, attempts_left, pass_score, pause_minutes } = result
  const opts = (qid) => questions.find(x => x.id === qid)?.options || []

  if (attempt.pending) {
    return (
      <div className="col" style={{ gap: 14 }}>
        <div className="card center" style={{ padding: '30px 20px' }}>
          <span className="list-ico warn" style={{ margin: '0 auto', width: 56, height: 56 }}><Icon.clock size={28} /></span>
          <h2 style={{ fontSize: 21, marginTop: 12 }}>Ответ отправлен на проверку</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Тестовые вопросы ты сдал ({attempt.correct} из {attempt.auto}). Открытый ответ проверит администратор — награда начислится после проверки.
          </p>
        </div>
        <button className="btn block" onClick={() => nav(`/course/${lesson.course_id}`)}>Вернуться к курсу</button>
      </div>
    )
  }

  const wrong = review.filter(r => r.ok === false)
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card center" style={{ padding: '28px 20px' }}>
        <span className={`badge ${attempt.passed ? 'success' : 'danger'}`} style={{ fontSize: 13 }}>
          {attempt.passed ? <><Icon.check size={13} />Сдано</> : 'Не сдано'}
        </span>
        <div className="result-score" style={{ marginTop: 14, color: attempt.passed ? 'var(--success-text)' : 'var(--danger-text)' }}>{attempt.score}%</div>
        <p className="muted" style={{ marginTop: 8 }}>
          {attempt.correct} из {attempt.auto} верно · проходной балл {pass_score}%
        </p>

        {reward && !reward.repeat && (reward.xp > 0 || reward.coil > 0) && (
          <div className="reward-xp">
            {reward.xp > 0 && <span className="chip-reward"><Icon.bolt size={15} />+{reward.xp} XP</span>}
            {reward.coil > 0 && <span className="chip-reward"><Icon.coin size={15} />+{reward.coil} COIL</span>}
          </div>
        )}
        {reward?.repeat && <p className="small muted" style={{ marginTop: 10 }}>Повторная попытка не добавляет XP, но улучшает твою статистику</p>}
        {reward?.courseComplete && (
          <div className="card reward-bg tight" style={{ marginTop: 16 }}>
            <div className="eyebrow reward">Курс пройден</div>
            <div className="bold" style={{ marginTop: 2 }}>{reward.courseComplete}</div>
          </div>
        )}
      </div>

      {review.length > 0 && (
        <section>
          <div className="section-head"><h2>{wrong.length ? `Разбор · ${wrong.length} ${plural(wrong.length, 'ошибка', 'ошибки', 'ошибок')}` : 'Разбор'}</h2></div>
          {wrong.length === 0 ? (
            <div className="card tight center" style={{ color: 'var(--success-text)' }}>
              <Icon.check size={22} />
              <div className="bold" style={{ marginTop: 4 }}>Без единой ошибки</div>
            </div>
          ) : (
            <div className="col" style={{ gap: 10 }}>
              {review.filter(r => r.ok === false).map(r => (
                <div key={r.id} className="review-item bad">
                  <div className="bold" style={{ marginBottom: 8, fontSize: 14.5 }}>{r.prompt}</div>
                  <div className="small" style={{ color: 'var(--danger-text)' }}>Твой ответ: {fmtAnswer(r.given, opts(r.id))}</div>
                  {r.correct && <div className="small" style={{ color: 'var(--success-text)', marginTop: 3 }}>Верно: {fmtAnswer(r.correct, opts(r.id))}</div>}
                  {r.explanation && <p className="small muted" style={{ marginTop: 8, lineHeight: 1.6 }}>{r.explanation}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="col" style={{ gap: 10 }}>
        {attempt.passed && next && <Link to={`/lesson/${next.id}`} className="btn block">Следующий урок <Icon.arrowR size={18} /></Link>}
        {attempt.passed && !next && <Link to={`/course/${lesson.course_id}`} className="btn block">К курсу</Link>}
        {!attempt.passed && attempts_left > 0 && (
          <div className="card tight center small muted">
            Перечитай урок — особенно места из разбора. Новая попытка откроется через {pause_minutes} мин · осталось попыток: {attempts_left}
          </div>
        )}
        {!attempt.passed && attempts_left === 0 && (
          <div className="card tight center small muted">Попытки закончились. Обратись к администратору — он поможет.</div>
        )}
        <button className="btn ghost block" onClick={onBack}>Вернуться к уроку</button>
      </div>
    </div>
  )
}

function fmtAnswer(val, options) {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'string') return val
  const arr = Array.isArray(val) ? val : [val]
  if (!arr.length) return '—'
  return arr.map(i => options[Number(i)] ?? `вариант ${Number(i) + 1}`).join(', ')
}
