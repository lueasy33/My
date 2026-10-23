import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import { useApp } from '../../App'
import { Icon, Avatar, PageSkeleton, LoadError, PageHead, Modal, Tabs, Empty, ProgressBar, useLoad, useToast, useConfirm, fmtDate, ROLE_LABEL, iconSrc } from '../../ui'
import { maskPhone, nationalPhone } from '../Login'

function genPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  const rnd = crypto.getRandomValues(new Uint32Array(8))
  for (const n of rnd) s += abc[n % abc.length]
  return s
}

const STATUS_LABEL = { lessons: { passed: 'сдан', failed: 'не сдан', pending: 'на проверке', in_progress: 'начат' } }

export default function Users() {
  const { user: me } = useApp()
  const isAdmin = me.role === 'admin'
  const toast = useToast()
  const [ask, confirmNode] = useConfirm()
  const [params, setParams] = useSearchParams()
  const [archived, setArchived] = useState(false)
  const { data, error, reload } = useLoad(() => Promise.all([api.admin.users(archived), api.admin.branches()]).then(([u, b]) => ({ users: u.users, branches: b.branches })), [archived])
  const [q, setQ] = useState('')
  const [branch, setBranch] = useState('')
  const [role, setRole] = useState('')
  const [edit, setEdit] = useState(null)     // форма создания/редактирования
  const [secret, setSecret] = useState(null) // пароль, показанный один раз
  const [card, setCard] = useState(null)

  const openId = params.get('open')
  useEffect(() => {
    if (openId) api.admin.user(openId).then(setCard).catch(e => toast(e.message, 'error'))
  }, [openId, toast])

  const list = useMemo(() => {
    if (!data) return []
    const low = q.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return data.users.filter(u =>
      (!low || u.name.toLowerCase().includes(low) || (digits.length >= 3 && u.phone.includes(digits))) &&
      (!branch || String(u.branch_id) === branch) && (!role || u.role === role))
  }, [data, q, branch, role])

  if (error) return <LoadError error={error} onRetry={reload} />
  if (!data) return <PageSkeleton />

  async function save(e) {
    e.preventDefault()
    const f = edit
    if (nationalPhone(f.phone).length !== 10) return toast('Проверьте номер телефона', 'error')
    try {
      const body = { name: f.name, phone: '+7' + nationalPhone(f.phone), role: f.role, branch_id: f.branch_id ? Number(f.branch_id) : null, hired_at: f.hired_at || null }
      if (f.id) {
        await api.admin.updateUser(f.id, body)
        toast('Сохранено', 'success')
      } else {
        await api.admin.createUser({ ...body, password: f.password })
        setSecret({ name: f.name, phone: maskPhone(f.phone), password: f.password })
      }
      setEdit(null)
      reload()
    } catch (e) { toast(e.message, 'error') }
  }

  async function resetPassword(u) {
    const ok = await ask({ title: 'Задать новый пароль?', text: `Старый пароль ${u.name} перестанет работать. Новый покажем один раз — передай его сотруднику.`, ok: 'Задать новый' })
    if (!ok) return
    const password = genPassword()
    try {
      await api.admin.updateUser(u.id, { password })
      setSecret({ name: u.name, phone: maskPhone(u.phone), password })
    } catch (e) { toast(e.message, 'error') }
  }

  async function toggleBlock(u) {
    const blocking = u.status === 'active'
    if (blocking && !(await ask({ title: `Заблокировать ${u.name}?`, text: 'Сотрудник не сможет войти. История обучения сохранится, разблокировать можно в любой момент.', ok: 'Заблокировать', danger: true }))) return
    try {
      await api.admin.updateUser(u.id, { status: blocking ? 'blocked' : 'active' })
      toast(blocking ? 'Заблокирован' : 'Разблокирован', 'success')
      reload()
    } catch (e) { toast(e.message, 'error') }
  }

  async function archive(u) {
    if (!(await ask({ title: `Отправить ${u.name} в архив?`, text: 'Для уволенных сотрудников. Вход закроется, но вся статистика останется — человека можно вернуть из архива.', ok: 'В архив', danger: true }))) return
    try { await api.admin.archiveUser(u.id); toast('Сотрудник в архиве', 'success'); setCard(null); reload() } catch (e) { toast(e.message, 'error') }
  }

  async function restore(u) {
    try { await api.admin.updateUser(u.id, { restore: true }); toast('Сотрудник возвращён', 'success'); reload() } catch (e) { toast(e.message, 'error') }
  }

  function closeCard() { setCard(null); if (openId) { params.delete('open'); setParams(params, { replace: true }) } }

  return (
    <>
      <PageHead title="Сотрудники" sub="Аккаунты создаёт только администратор — регистрации нет"
        action={isAdmin && <button className="btn sm" onClick={() => setEdit({ name: '', phone: '', password: genPassword(), role: 'employee', branch_id: data.branches[0]?.id || '', hired_at: '' })}><Icon.plus size={16} />Добавить</button>} />

      <div className="row wrap" style={{ gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <input className="input" placeholder="Имя или телефон" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 40, minHeight: 44 }} />
          <Icon.search size={17} style={{ position: 'absolute', left: 13, top: 14, color: 'var(--text-muted)' }} />
        </div>
        {isAdmin && (
          <>
            <select className="select" style={{ width: 'auto', minHeight: 44 }} value={branch} onChange={e => setBranch(e.target.value)} aria-label="Филиал">
              <option value="">Все филиалы</option>
              {data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="select" style={{ width: 'auto', minHeight: 44 }} value={role} onChange={e => setRole(e.target.value)} aria-label="Роль">
              <option value="">Все роли</option>
              <option value="employee">Сотрудники</option>
              <option value="admin">Администраторы</option>
            </select>
            <Tabs size="sm" value={archived ? 'arch' : 'act'} onChange={v => setArchived(v === 'arch')} items={[['act', 'Работают'], ['arch', 'Архив']]} />
          </>
        )}
      </div>

      {list.length === 0 ? <Empty icon={<Icon.users size={26} />} title={archived ? 'Архив пуст' : 'Никого не нашли'} text={q ? 'Попробуйте другой запрос' : ''} /> : (
        <div className="table-wrap">
          <table className="dtable stack">
            <thead><tr><th>Сотрудник</th><th>Филиал</th><th>Прогресс</th><th>Ур.</th><th>Был</th><th></th></tr></thead>
            <tbody>
              {list.map(u => (
                <tr key={u.id}>
                  <td>
                    <button className="row" style={{ gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit' }}
                      onClick={() => api.admin.user(u.id).then(setCard).catch(e => toast(e.message, 'error'))}>
                      <Avatar id={u.avatar_id} size={34} />
                      <span style={{ minWidth: 0 }}>
                        <b style={{ display: 'block' }}>{u.name}</b>
                        <span className="small muted">{maskPhone(u.phone)}</span>
                      </span>
                    </button>
                    <div className="row" style={{ gap: 4, marginTop: 4, marginLeft: 44 }}>
                      {u.role !== 'employee' && <span className="badge brand">{ROLE_LABEL[u.role]}</span>}
                      {u.status === 'blocked' && !u.archived_at && <span className="badge danger">Заблокирован</span>}
                    </div>
                  </td>
                  <td className="muted" data-label="Филиал">{u.branch || '—'}</td>
                  <td style={{ minWidth: 120 }} data-label="Прогресс"><div className="row" style={{ gap: 8 }}><span className="mono small" style={{ width: 34 }}>{u.percent}%</span><div style={{ flex: 1 }}><ProgressBar percent={u.percent} thin /></div></div></td>
                  <td className="mono" data-label="Уровень">{u.level}</td>
                  <td className="small muted" data-label="Был">{u.last_active_day ? fmtDate(u.last_active_day) : 'не заходил'}</td>
                  <td className="stack-actions">
                    {isAdmin && (
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        {archived ? (
                          <button className="btn ghost xs" onClick={() => restore(u)}>Вернуть</button>
                        ) : (
                          <>
                            <button className="btn ghost xs icon" title="Изменить" aria-label="Изменить" onClick={() => setEdit({ id: u.id, name: u.name, phone: u.phone, role: u.role, branch_id: u.branch_id || '', hired_at: u.hired_at || '' })}><Icon.edit size={15} /></button>
                            <button className="btn ghost xs icon" title="Новый пароль" aria-label="Новый пароль" onClick={() => resetPassword(u)}><Icon.lock size={15} /></button>
                            {u.id !== me.id && <button className="btn ghost xs" onClick={() => toggleBlock(u)}>{u.status === 'active' ? 'Блок' : 'Разблок'}</button>}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <Modal title={edit.id ? 'Изменить сотрудника' : 'Новый сотрудник'} onClose={() => setEdit(null)} width={520}
          footer={<><button className="btn ghost" onClick={() => setEdit(null)}>Отмена</button><button className="btn" form="user-form">{edit.id ? 'Сохранить' : 'Создать'}</button></>}>
          <form id="user-form" onSubmit={save} className="col" style={{ gap: 12 }}>
            <div className="field"><label>Фамилия и имя</label><input className="input" required value={edit.name} onChange={e => setEdit(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
            <div className="form-grid two">
              <div className="field"><label>Телефон (логин)</label><input className="input" inputMode="tel" required value={maskPhone(edit.phone)} onChange={e => setEdit(f => ({ ...f, phone: e.target.value }))} placeholder="+7 (___) ___-__-__" /></div>
              <div className="field"><label>Дата приёма</label><input className="input" type="date" value={edit.hired_at || ''} onChange={e => setEdit(f => ({ ...f, hired_at: e.target.value }))} /></div>
              <div className="field">
                <label>Роль</label>
                <select className="select" value={edit.role} onChange={e => setEdit(f => ({ ...f, role: e.target.value }))}>
                  <option value="employee">Сотрудник</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>
              <div className="field">
                <label>Филиал</label>
                <select className="select" value={edit.branch_id} onChange={e => setEdit(f => ({ ...f, branch_id: e.target.value }))} required={edit.role !== 'admin'}>
                  {edit.role === 'admin' && <option value="">Без филиала</option>}
                  {data.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            {!edit.id && (
              <div className="field">
                <label>Пароль</label>
                <div className="row" style={{ gap: 8 }}>
                  <input className="input" required minLength={6} value={edit.password} onChange={e => setEdit(f => ({ ...f, password: e.target.value }))} style={{ fontFamily: 'monospace' }} />
                  <button type="button" className="btn ghost icon" title="Сгенерировать" aria-label="Сгенерировать пароль" onClick={() => setEdit(f => ({ ...f, password: genPassword() }))}><Icon.refresh size={17} /></button>
                </div>
                <span className="hint">Покажем ещё раз после создания — передай его сотруднику. Потом посмотреть пароль будет нельзя, только задать новый.</span>
              </div>
            )}
          </form>
          {edit.id && edit.id !== me.id && (
            <button className="btn danger sm" style={{ marginTop: 16 }} onClick={() => { const u = data.users.find(x => x.id === edit.id); setEdit(null); archive(u) }}>
              <Icon.archive size={16} />Уволен — в архив
            </button>
          )}
        </Modal>
      )}

      {secret && (
        <Modal title="Данные для входа" onClose={() => setSecret(null)} width={400}
          footer={<button className="btn" onClick={() => setSecret(null)}>Готово, передал</button>}>
          <p className="muted small" style={{ marginBottom: 14 }}>Пароль показывается один раз. Скопируй и отправь сотруднику — он сможет сменить его в настройках.</p>
          <div className="card flat">
            <div className="small muted">{secret.name}</div>
            <div className="bold" style={{ marginTop: 6 }}>Телефон: {secret.phone}</div>
            <div className="bold" style={{ fontSize: 20, fontFamily: 'monospace', marginTop: 4 }}>{secret.password}</div>
          </div>
          <button className="btn soft block sm" style={{ marginTop: 12 }} onClick={() => {
            navigator.clipboard?.writeText(`Вход в обучение «Аладдин»: ${window.location.origin}\nТелефон: ${secret.phone}\nПароль: ${secret.password}`)
              .then(() => toast('Скопировано', 'success')).catch(() => toast('Не удалось скопировать — выдели текст вручную', 'error'))
          }}><Icon.copy size={16} />Скопировать сообщение для сотрудника</button>
        </Modal>
      )}

      {card && (
        <Modal title={card.user.name} onClose={closeCard} width={620}>
          <div className="row" style={{ gap: 14, marginBottom: 14 }}>
            <Avatar id={card.user.avatar_id} size={56} />
            <div>
              <div className="small muted">{ROLE_LABEL[card.user.role]} · {card.user.branch || 'без филиала'}</div>
              <div className="small muted">{maskPhone(card.user.phone)}{card.user.hired_at ? ` · принят ${fmtDate(card.user.hired_at, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</div>
              <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                <span className="badge gold">{card.user.level} ур. · {card.user.xp} XP</span>
                <span className="badge gold">{card.user.coil} COIL</span>
                <span className="badge">серия {card.user.streak}</span>
              </div>
            </div>
          </div>
          <div className="section-head"><h2 style={{ fontSize: 15 }}>Уроки</h2></div>
          <div className="table-wrap">
            <table className="dtable">
              <thead><tr><th>Урок</th><th>Статус</th><th>Лучший балл</th><th>Попыток</th></tr></thead>
              <tbody>
                {card.lessons.map(l => {
                  const overdue = l.deadline && l.status !== 'passed' && new Date(l.deadline) < new Date()
                  return (
                    <tr key={l.id}>
                      <td><b style={{ fontWeight: 650 }}>{l.title}</b><div className="tiny muted">{l.course}</div></td>
                      <td>{l.status ? <span className={'badge ' + (l.status === 'passed' ? 'success' : l.status === 'failed' ? 'danger' : 'warn')}>{STATUS_LABEL.lessons[l.status]}</span> : overdue ? <span className="badge danger">просрочен</span> : <span className="muted small">—</span>}</td>
                      <td className="mono">{l.best != null ? `${l.best}%` : '—'}</td>
                      <td className="mono">{l.tries || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {card.achievements.length > 0 && (
            <>
              <div className="section-head" style={{ marginTop: 18 }}><h2 style={{ fontSize: 15 }}>Достижения · {card.achievements.length}</h2></div>
              <div className="row wrap" style={{ gap: 8 }}>
                {card.achievements.map((a, i) => <img key={i} src={iconSrc(a.icon)} title={`${a.title}${a.reason ? ' — ' + a.reason : ''}`} alt={a.title} width={44} height={44} />)}
              </div>
            </>
          )}
        </Modal>
      )}
      {confirmNode}
    </>
  )
}
