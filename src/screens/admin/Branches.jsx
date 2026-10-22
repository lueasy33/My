import { useState } from 'react'
import { api } from '../../api'
import { Icon, PageSkeleton, LoadError, PageHead, Modal, ProgressBar, Empty, useLoad, useToast, useConfirm, plural } from '../../ui'

export default function Branches() {
  const toast = useToast()
  const [ask, confirmNode] = useConfirm()
  const { data, error, reload } = useLoad(() => api.admin.branches(), [])
  const [edit, setEdit] = useState(null)

  if (error) return <LoadError error={error} onRetry={reload} />
  if (!data) return <PageSkeleton />

  async function save(e) {
    e.preventDefault()
    try {
      const body = { name: edit.name, address: edit.address }
      if (edit.id) await api.admin.updateBranch(edit.id, body)
      else await api.admin.createBranch(body)
      toast(edit.id ? 'Филиал сохранён' : 'Филиал создан', 'success')
      setEdit(null); reload()
    } catch (e) { toast(e.message, 'error') }
  }

  async function archive(b) {
    if (!(await ask({ title: `Архивировать «${b.name}»?`, text: 'Филиал пропадёт из списков. История обучения его сотрудников сохранится.', ok: 'В архив', danger: true }))) return
    try { await api.admin.updateBranch(b.id, { archived: true }); toast('Филиал в архиве', 'success'); setEdit(null); reload() } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <PageHead title="Филиалы" sub={`${data.branches.length} ${plural(data.branches.length, 'магазин', 'магазина', 'магазинов')} сети`}
        action={<button className="btn sm" onClick={() => setEdit({ name: '', address: '' })}><Icon.plus size={16} />Добавить</button>} />

      {data.branches.length === 0 ? <Empty icon={<Icon.store size={26} />} title="Филиалов пока нет" text="Добавьте первый магазин — к нему привязываются сотрудники" /> : (
        <div className="grid-auto">
          {data.branches.map(b => (
            <div key={b.id} className="card">
              <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="bold" style={{ fontSize: 16 }}>{b.name}</div>
                  <div className="small muted">{b.address || 'адрес не указан'}</div>
                </div>
                <button className="btn ghost xs icon" aria-label="Изменить" onClick={() => setEdit({ id: b.id, name: b.name, address: b.address || '' })}><Icon.edit size={15} /></button>
              </div>
              <div className="row between small" style={{ marginTop: 14 }}>
                <span className="muted">Сотрудников</span><span className="bold">{b.people}</span>
              </div>
              <div className="row between small" style={{ marginTop: 6 }}>
                <span className="muted">Средний балл тестов</span><span className="bold">{b.avg_score ? `${b.avg_score}%` : '—'}</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="row between small" style={{ marginBottom: 6 }}><span className="muted">Прохождение обучения</span><span className="mono bold">{b.percent}%</span></div>
                <ProgressBar percent={b.percent} thin />
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <Modal title={edit.id ? 'Филиал' : 'Новый филиал'} onClose={() => setEdit(null)} width={460}
          footer={<><button className="btn ghost" onClick={() => setEdit(null)}>Отмена</button><button className="btn" form="branch-form">Сохранить</button></>}>
          <form id="branch-form" onSubmit={save} className="col" style={{ gap: 12 }}>
            <div className="field"><label>Название</label><input className="input" required value={edit.name} onChange={e => setEdit(f => ({ ...f, name: e.target.value }))} placeholder="Аладдин · Центр" autoFocus /></div>
            <div className="field"><label>Адрес</label><input className="input" value={edit.address} onChange={e => setEdit(f => ({ ...f, address: e.target.value }))} placeholder="Тула, ул. Советская, 12" /></div>
          </form>
          {edit.id && <button className="btn danger sm" style={{ marginTop: 16 }} onClick={() => archive(edit)}><Icon.archive size={16} />Архивировать филиал</button>}
        </Modal>
      )}
      {confirmNode}
    </>
  )
}
