import { useState } from 'react'
import { api } from '../../api'
import { PageSkeleton, LoadError, PageHead, useLoad, fmtDate } from '../../ui'
import { label } from './Overview'

export default function Audit() {
  const { data, error, reload } = useLoad(() => api.admin.audit(), [])
  const [q, setQ] = useState('')
  if (error) return <LoadError error={error} onRetry={reload} />
  if (!data) return <PageSkeleton />
  const low = q.trim().toLowerCase()
  const items = data.items.filter(i => !low || String(i.actor || '').toLowerCase().includes(low) || label(i.action).includes(low))
  return (
    <>
      <PageHead title="Журнал действий" sub="Кто что создал, изменил и выдал — последние 300 записей"
        action={<input className="input" style={{ minHeight: 42, maxWidth: 240 }} placeholder="Поиск" value={q} onChange={e => setQ(e.target.value)} />} />
      <div className="table-wrap">
        <table className="dtable">
          <thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Подробности</th></tr></thead>
          <tbody>
            {items.map(i => {
              let p = {}
              try { p = JSON.parse(i.payload || '{}') } catch {}
              const details = [p.title, p.name, p.reason, p.verdict === 'accept' ? 'зачтено' : p.verdict === 'reject' ? 'не зачтено' : null].filter(Boolean).join(' · ')
              return (
                <tr key={i.id}>
                  <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.created_at, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="bold">{i.actor || 'система'}</td>
                  <td>{label(i.action)}</td>
                  <td className="small muted">{details}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
