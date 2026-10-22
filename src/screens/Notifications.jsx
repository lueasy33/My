import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, PageSkeleton, LoadError, Empty, PageHead, Tabs, useLoad, useToast, fmtAgo } from '../ui'

const KIND = {
  deadline: { icon: Icon.calendar, cls: 'warn' },
  lesson: { icon: Icon.book, cls: '' },
  course: { icon: Icon.book, cls: '' },
  achievement: { icon: Icon.medal, cls: 'gold' },
  avatar: { icon: Icon.user, cls: 'gold' },
  status: { icon: Icon.star, cls: 'gold' },
  level: { icon: Icon.star, cls: 'gold' },
  theme: { icon: Icon.palette, cls: 'gold' },
  streak: { icon: Icon.flame, cls: 'gold' },
  review: { icon: Icon.check, cls: 'success' }
}

// Лента — только новое. Прочитанное (открыл, нажал «×» или «Прочитать все»)
// сразу уходит в «Историю», откуда его можно удалить совсем.
export default function Notifications() {
  const { reload: reloadUser } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState('new')
  const { data, error, reload, setData } = useLoad(() => api.notifications(tab === 'history'), [tab])

  function drop(ids) {
    setData(d => d && ({ ...d, items: d.items.filter(n => !ids.includes(n.id)), history_count: d.history_count + ids.length }))
  }

  async function open(n) {
    if (tab === 'new') {
      drop([n.id])
      api.readNotifications([n.id]).then(reloadUser).catch(() => {})
    }
    if (n.link) nav(n.link)
  }

  async function dismiss(e, n) {
    e.stopPropagation()
    try {
      if (tab === 'new') { drop([n.id]); await api.readNotifications([n.id]) }
      else { setData(d => ({ ...d, items: d.items.filter(x => x.id !== n.id) })); await api.deleteNotification(n.id) }
      reloadUser()
    } catch (err) { toast(err.message, 'error'); reload() }
  }

  async function readAll() {
    try { drop(data.items.map(n => n.id)); await api.readNotifications(); reloadUser() } catch (e) { toast(e.message, 'error') }
  }

  async function clearHistory() {
    try { await api.clearNotifications(); setData(d => ({ ...d, items: [], history_count: 0 })); toast('История очищена', 'success') } catch (e) { toast(e.message, 'error') }
  }

  return (
    <main className="page narrow">
      <PageHead title="Уведомления"
        action={tab === 'new'
          ? data?.items.length > 0 && <button className="btn ghost sm" onClick={readAll}><Icon.check size={16} />Прочитать все</button>
          : data?.items.length > 0 && <button className="btn ghost sm" onClick={clearHistory}><Icon.trash size={16} />Очистить историю</button>} />

      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} items={[['new', 'Новые', tab === 'new' ? data?.items.length : null], ['history', 'История', data?.history_count || null]]} />
      </div>

      {error ? <LoadError error={error} onRetry={reload} />
        : !data ? <PageSkeleton />
        : data.items.length === 0 ? (
          tab === 'new'
            ? <Empty icon={<Icon.bell size={26} />} title="Новых уведомлений нет" text="Здесь появятся новые уроки, дедлайны и награды" />
            : <Empty icon={<Icon.list size={26} />} title="История пуста" />
        ) : (
          <div className="col" style={{ gap: 8 }}>
            {data.items.map(n => {
              const k = KIND[n.kind] || { icon: Icon.info, cls: '' }
              return (
                <div key={n.id} className={'notif' + (tab === 'new' ? ' unread' : '')} role="button" tabIndex={0}
                  onClick={() => open(n)} onKeyDown={e => e.key === 'Enter' && open(n)} style={{ cursor: n.link || tab === 'new' ? 'pointer' : 'default' }}>
                  <span className={'list-ico ' + k.cls}><k.icon size={19} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: 14.5 }}>{n.title}</b>
                    {n.body && <span className="small muted" style={{ display: 'block' }}>{n.body}</span>}
                    <span className="tiny muted">{fmtAgo(n.created_at)}</span>
                  </span>
                  <button className="btn ghost plain xs icon" onClick={e => dismiss(e, n)} aria-label={tab === 'new' ? 'Отметить прочитанным' : 'Удалить'} title={tab === 'new' ? 'Прочитано' : 'Удалить'}>
                    <Icon.x size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
    </main>
  )
}
