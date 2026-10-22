import { useState } from 'react'
import { api } from '../../api'
import { Icon, PageSkeleton, LoadError, PageHead, Empty, useLoad, useToast, fmtAgo } from '../../ui'

export default function Reviews() {
  const toast = useToast()
  const { data, error, reload } = useLoad(() => api.admin.reviews(), [])
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(null)

  if (error) return <LoadError error={error} onRetry={reload} />
  if (!data) return <PageSkeleton />

  async function verdict(id, v) {
    setBusy(id)
    try {
      await api.admin.verdict(id, v, notes[id] || '')
      toast(v === 'accept' ? 'Зачтено — сотрудник получил награду' : 'Не зачтено — сотрудник получит уведомление', 'success')
      await reload()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(null) }
  }

  return (
    <>
      <PageHead title="Проверки" sub="Открытые ответы сотрудников. До проверки урок «на проверке», награда ждёт" />
      {data.reviews.length === 0 ? (
        <Empty icon={<Icon.check size={26} />} title="Всё проверено" text="Новых открытых ответов нет. Мы пришлём уведомление, когда появятся." />
      ) : (
        <div className="col" style={{ gap: 14, maxWidth: 820 }}>
          {data.reviews.map(r => (
            <div key={r.id} className="card">
              <div className="row between" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
                <div>
                  <div className="bold" style={{ fontSize: 16 }}>{r.name}</div>
                  <div className="small muted">{r.course} · {r.lesson}{r.branch ? ` · ${r.branch}` : ''}</div>
                </div>
                <span className="badge warn">{fmtAgo(r.created_at)}</span>
              </div>
              <p className="small muted" style={{ marginBottom: 12 }}>Тестовая часть: {r.score}%</p>
              {r.open.map(q => (
                <div key={q.id} style={{ marginBottom: 12 }}>
                  <p className="bold" style={{ marginBottom: 6, fontSize: 14.5 }}>{q.prompt}</p>
                  {q.hint && <p className="tiny muted" style={{ marginBottom: 6 }}>Ориентир: {q.hint}</p>}
                  <div className="card flat" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{q.answer || '—'}</div>
                </div>
              ))}
              <div className="field" style={{ marginTop: 4 }}>
                <label>Комментарий сотруднику (необязательно)</label>
                <input className="input" value={notes[r.id] || ''} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} placeholder="Например: хорошо, но не забудь про продувку" />
              </div>
              <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn success sm" disabled={busy === r.id} onClick={() => verdict(r.id, 'accept')}><Icon.check size={16} />Зачесть</button>
                <button className="btn danger sm" disabled={busy === r.id} onClick={() => verdict(r.id, 'reject')}>Не зачесть</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
