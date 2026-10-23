import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import { Icon, PageSkeleton, LoadError, PageHead, Modal, Tabs, Empty, useLoad, useToast, useConfirm, avatarSrc, iconSrc, plural, fmtDate, RARITY } from '../../ui'
import { THEMES } from '../../theme'
import ImageUpload from './ImageUpload'

// Мастерская: администратор создаёт достижения, аватарки, статусы и призы
// со своими картинками и решает, как их получают. Здесь же — выдача заказанных призов.

// Условия автодостижений. Список закрытый — каждое правило исполняется на сервере.
const RULES = {
  lessons: { label: 'Пройдено уроков', field: 'count', unit: 'уроков' },
  courses: { label: 'Пройдено курсов целиком', field: 'count', unit: 'курсов' },
  course: { label: 'Пройден конкретный курс', field: 'course_id', course: true },
  course_perfect: { label: 'Конкретный курс на 100%', field: 'course_id', course: true },
  perfect: { label: 'Тестов на 100%', field: 'count', unit: 'тестов' },
  streak: { label: 'Серия дней подряд', field: 'days', unit: 'дней' },
  level: { label: 'Достигнут уровень', field: 'level', unit: 'уровень' },
  purchases: { label: 'Покупок в магазине', field: 'count', unit: 'покупок' },
  patient: { label: 'Сдал тест не с первой попытки', field: 'attempts', unit: 'попытка' },
  early: { label: 'Сдал урок досрочно', field: 'days', unit: 'дней до дедлайна' },
  night: { label: 'Прошёл урок после 22:00', field: null },
  comeback: { label: 'Вернулся после перерыва', field: 'days', unit: 'дней перерыва' }
}

const ruleText = (a, courses) => {
  if (a.kind === 'manual') return 'Выдаётся вручную'
  const r = RULES[a.rule?.type]
  if (!r) return 'Автоматически'
  if (!r.field) return r.label
  const v = a.rule[r.field]
  if (r.course) return `${r.label}: ${courses.find(c => c.id === Number(v))?.title || `курс №${v}`}`
  return `${r.label}: ${v}`
}

export default function Workshop() {
  const toast = useToast()
  const [ask, confirmNode] = useConfirm()
  const { data, error, reload } = useLoad(() => Promise.all([api.admin.achievements(), api.admin.shopItems(), api.admin.content(), api.admin.prizeOrders()])
    .then(([a, s, c, o]) => ({ ...a, shop: s.items, courses: c.courses, orders: o.orders })), [])
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'ach'
  const setTab = (t) => setParams({ tab: t }, { replace: true })
  const [order, setOrder] = useState(null)
  const [ach, setAch] = useState(null)
  const [item, setItem] = useState(null)

  if (error) return <LoadError error={error} onRetry={reload} />
  if (!data) return <PageSkeleton />

  const avatars = data.shop.filter(s => s.kind === 'avatar')
  const statuses = data.shop.filter(s => s.kind === 'status')
  const themes = data.shop.filter(s => s.kind === 'theme')
  const prizes = data.shop.filter(s => s.kind === 'prize')
  const newOrders = data.orders.filter(o => o.status === 'new')

  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok, 'success'); await reload(); return true } catch (e) { toast(e.message, 'error'); return false } }

  function newAch() {
    setAch({ title: '', description: '', icon: '', kind: 'auto', ruleType: 'lessons', ruleValue: 5, xp: 20, coil: 40, reward_avatar: '', reward_status: '' })
  }
  function openAch(a) {
    const r = RULES[a.rule?.type]
    setAch({ ...a, ruleType: a.rule?.type || 'lessons', ruleValue: r?.field ? a.rule[r.field] : 1 })
  }
  async function saveAch(e) {
    e.preventDefault()
    const r = RULES[ach.ruleType]
    const body = {
      title: ach.title, description: ach.description, icon: ach.icon, kind: ach.kind,
      rule: ach.kind === 'auto' ? (r.field ? { type: ach.ruleType, [r.field]: Number(ach.ruleValue) } : { type: ach.ruleType }) : {},
      xp: Number(ach.xp) || 0, coil: Number(ach.coil) || 0, reward_avatar: ach.reward_avatar || '', reward_status: ach.reward_status || ''
    }
    const ok = await run(() => ach.id ? api.admin.updateAchievement(ach.id, body) : api.admin.createAchievement(body),
      ach.id ? 'Достижение сохранено' : 'Достижение создано')
    if (ok) setAch(null)
  }
  async function deleteAch() {
    if (!(await ask({ title: `Удалить «${ach.title}»?`, text: 'Достижение пропадёт из витрины у всех.', ok: 'Удалить', danger: true }))) return
    if (await run(() => api.admin.deleteAchievement(ach.id), 'Удалено')) setAch(null)
  }

  function newItem(kind) {
    setItem({ kind, title: '', description: '', image: '', stock: '', price: kind === 'avatar' ? 150 : kind === 'status' ? 250 : kind === 'prize' ? 500 : 300, purchaseable: true, rarity: 'common', ref: kind === 'theme' ? (THEMES.find(t => t.unlock === 'level' && !themes.some(s => s.ref === t.slug))?.slug || 'neon') : '' })
  }
  function openItem(it) {
    setItem({ ...it, purchaseable: !!it.purchaseable, image: it.kind === 'avatar' ? it.ref : it.image, stock: it.stock ?? '' })
  }
  async function saveItem(e) {
    e.preventDefault()
    if (item.kind === 'avatar' && !item.image) return toast('Загрузите картинку аватарки', 'error')
    const body = { kind: item.kind, ref: item.ref, title: item.title, description: item.description, price: Number(item.price) || 0, purchaseable: item.purchaseable, rarity: item.rarity, image: item.image, stock: item.stock }
    const ok = await run(() => item.id ? api.admin.updateShopItem(item.id, body) : api.admin.createShopItem(body),
      item.id ? 'Сохранено' : 'Создано')
    if (ok) setItem(null)
  }
  async function deleteItem() {
    const used = item.holders > 0 || item.via?.length > 0
    if (!(await ask({ title: `Убрать «${item.title}»?`, text: used ? 'У сотрудников это уже есть или оно привязано к достижению — предмет снимется с продажи, но останется у тех, кто его получил.' : 'Предмет удалится.', ok: 'Убрать', danger: true }))) return
    if (await run(() => api.admin.deleteShopItem(item.id), used ? 'Снято с продажи' : 'Удалено')) setItem(null)
  }

  async function closeOrder(status) {
    const ok = await run(() => api.admin.closePrizeOrder(order.id, status, order.note || ''), status === 'done' ? 'Отмечено: приз выдан' : 'Заказ отменён, COIL возвращены')
    if (ok) setOrder(null)
  }

  const add = { ach: ['Достижение', newAch], prize: ['Приз', () => newItem('prize')], orders: ['Приз', () => { setTab('prize'); newItem('prize') }], avatar: ['Аватарка', () => newItem('avatar')], status: ['Статус', () => newItem('status')], theme: ['Тема', () => newItem('theme')] }[tab] || ['Достижение', newAch]

  return (
    <>
      <PageHead title="Мастерская" sub="Достижения, призы, аватарки и статусы со своими картинками — и как их получают"
        action={<button className="btn sm" onClick={add[1]}><Icon.plus size={16} />{add[0]}</button>} />

      <div style={{ marginBottom: 16 }}>
        <Tabs value={tab} onChange={setTab} items={[
          ['ach', 'Достижения', data.achievements.length], ['prize', 'Призы', prizes.length], ['orders', 'Заказы', newOrders.length], ['avatar', 'Аватарки', avatars.length],
          ['status', 'Статусы', statuses.length], ['theme', 'Темы в магазине', themes.length]
        ]} />
      </div>

      {tab === 'ach' && (
        <div className="workshop-grid">
          {data.achievements.map(a => (
            <button key={a.id} className="workshop-tile" onClick={() => openAch(a)}>
              <span className="workshop-img badge"><img src={iconSrc(a.icon)} alt="" /></span>
              <b>{a.title}</b>
              <span className="tiny muted clamp2">{ruleText(a, data.courses)}</span>
              <span className="row wrap" style={{ gap: 4, justifyContent: 'center' }}>
                {a.xp > 0 && <span className="badge gold">+{a.xp} XP</span>}
                {a.coil > 0 && <span className="badge gold">+{a.coil} COIL</span>}
                {(a.reward_avatar || a.reward_status) && <span className="badge brand"><Icon.sparkles size={11} />{a.reward_avatar ? 'аватарка' : 'статус'}</span>}
              </span>
              <span className="tiny muted">у {a.holders} чел.</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'prize' && (
        prizes.length === 0 ? <Empty icon={<Icon.gift size={26} />} title="Призов пока нет" text="Настоящие подарки за COIL: мерч, скидка в магазине, сладости, выходной. Сотрудник заказывает — вы выдаёте лично и отмечаете здесь" action={<button className="btn sm" onClick={() => newItem('prize')}><Icon.plus size={16} />Создать приз</button>} /> : (
          <div className="workshop-grid">
            {prizes.map(it => (
              <button key={it.id} className="workshop-tile" onClick={() => openItem(it)}>
                <span className="workshop-img badge">{it.image ? <img src={it.image} alt="" style={{ objectFit: 'cover', width: '100%', height: '100%' }} /> : <Icon.gift size={34} style={{ color: 'var(--brand-text)' }} />}</span>
                <b>{it.title}</b>
                {it.purchaseable ? <span className="badge gold"><Icon.coin size={11} />{it.price} COIL</span> : <span className="badge">скрыт</span>}
                <span className="tiny muted">{it.stock === null ? 'без ограничения' : it.stock > 0 ? `осталось ${it.stock}` : 'закончился'}</span>
              </button>
            ))}
          </div>
        )
      )}

      {tab === 'orders' && (
        data.orders.length === 0 ? <Empty icon={<Icon.gift size={26} />} title="Заказов пока нет" text="Когда сотрудник закажет приз, он появится здесь, а вам придёт уведомление" /> : (
          <div className="card flush">
            {data.orders.map(o => (
              <button key={o.id} className="order-row" onClick={() => setOrder({ ...o, note: '' })}>
                <span className="order-thumb">{o.image ? <img src={o.image} alt="" /> : <Icon.gift size={20} />}</span>
                <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <div className="bold ellipsis">{o.title}</div>
                  <div className="tiny muted ellipsis">{o.user_name}{o.branch ? ` · ${o.branch}` : ''} · {fmtDate(o.created_at)}</div>
                </div>
                <span className={o.status === 'new' ? 'badge gold' : o.status === 'done' ? 'badge success' : 'badge'}>{o.status === 'new' ? 'выдать' : o.status === 'done' ? 'выдан' : 'отменён'}</span>
              </button>
            ))}
          </div>
        )
      )}

      {tab === 'avatar' && (
        avatars.length === 0 ? <Empty icon={<Icon.user size={26} />} title="Аватарок пока нет" action={<button className="btn sm" onClick={() => newItem('avatar')}><Icon.plus size={16} />Создать аватарку</button>} /> : (
          <div className="workshop-grid">
            {avatars.map(it => (
              <button key={it.id} className="workshop-tile" onClick={() => openItem(it)}>
                <span className="workshop-img circle"><img src={avatarSrc(it.ref, 256)} alt="" /></span>
                <b>{it.title}</b>
                <ObtainBadge it={it} />
                <span className="tiny muted">у {it.holders} чел.</span>
              </button>
            ))}
          </div>
        )
      )}

      {tab === 'status' && (
        statuses.length === 0 ? <Empty icon={<Icon.star size={26} />} title="Статусов пока нет" text="Статус — подпись под именем в профиле и рейтинге: «Знаток табака», «Легенда смены»" action={<button className="btn sm" onClick={() => newItem('status')}><Icon.plus size={16} />Создать статус</button>} /> : (
          <div className="workshop-grid">
            {statuses.map(it => (
              <button key={it.id} className="workshop-tile" onClick={() => openItem(it)}>
                <span className="workshop-img badge">{it.image ? <img src={it.image} alt="" /> : <Icon.star size={34} style={{ color: 'var(--brand-text)' }} />}</span>
                <b>{it.title}</b>
                <span className={(RARITY[it.rarity] || RARITY.common).cls}>{(RARITY[it.rarity] || RARITY.common).label}</span>
                <ObtainBadge it={it} />
              </button>
            ))}
          </div>
        )
      )}

      {tab === 'theme' && (
        <>
          <p className="small muted" style={{ marginBottom: 12 }}>Темы и так открываются по уровням. Здесь — какие из них можно купить раньше за COIL. Всего тем: {THEMES.length}, новые открываются с уровнем.</p>
          <div className="workshop-grid">
            {themes.map(it => {
              const t = THEMES.find(x => x.slug === it.ref) || {}
              return (
                <button key={it.id} className="workshop-tile" onClick={() => openItem(it)}>
                  <span className="workshop-img badge" style={{ background: t['bg-base'], flexDirection: 'column', gap: 6, padding: 16 }}>
                    <i style={{ display: 'block', width: '100%', height: 14, borderRadius: 5, background: t['surface-1'] }} />
                    <i style={{ display: 'block', width: '60%', height: 8, borderRadius: 4, background: t['brand-500'] }} />
                  </span>
                  <b>{it.title}</b>
                  <ObtainBadge it={it} />
                </button>
              )
            })}
          </div>
        </>
      )}

      {ach && (
        <Modal title={ach.id ? 'Достижение' : 'Новое достижение'} onClose={() => setAch(null)} width={600}
          footer={<>
            {ach.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={deleteAch}><Icon.trash size={16} /></button>}
            <button className="btn ghost" onClick={() => setAch(null)}>Отмена</button>
            <button className="btn" form="ach-form">Сохранить</button>
          </>}>
          <form id="ach-form" onSubmit={saveAch} className="col" style={{ gap: 14 }}>
            <ImageUpload label="Значок" shape="badge" maxMb={1} value={/^(\/|https?:)/.test(ach.icon || '') ? ach.icon : ''}
              preview={ach.icon ? iconSrc(ach.icon) : ''} onChange={url => setAch(f => ({ ...f, icon: url }))} />
            <details className="card flat tight">
              <summary className="small bold" style={{ cursor: 'pointer' }}>Или выбрать из готовых значков</summary>
              <div className="row wrap" style={{ gap: 6, marginTop: 10, maxHeight: 170, overflowY: 'auto' }}>
                {data.free_icons.map(ic => (
                  <button key={ic.name} type="button" onClick={() => setAch(f => ({ ...f, icon: ic.name }))} title={ic.used ? 'уже используется' : ''}
                    className={'icon-pick' + (ach.icon === ic.name ? ' on' : '')} style={{ opacity: ic.used && ach.icon !== ic.name ? .5 : 1 }}>
                    <img src={iconSrc(ic.name)} alt="" />
                  </button>
                ))}
              </div>
            </details>
            <div className="field"><label>Название</label><input className="input" required value={ach.title} onChange={e => setAch(f => ({ ...f, title: e.target.value }))} placeholder="Знаток вкусов" /></div>
            <div className="field"><label>Описание для сотрудника</label><input className="input" value={ach.description || ''} onChange={e => setAch(f => ({ ...f, description: e.target.value }))} placeholder="Что нужно сделать, чтобы получить" /></div>

            <div className="field">
              <label>Как получить</label>
              <div className="segmented">
                <button type="button" className={ach.kind === 'auto' ? 'on' : ''} onClick={() => setAch(f => ({ ...f, kind: 'auto' }))}>Автоматически за действие</button>
                <button type="button" className={ach.kind === 'manual' ? 'on' : ''} onClick={() => setAch(f => ({ ...f, kind: 'manual' }))}>Вручную от админа</button>
              </div>
            </div>
            {ach.kind === 'auto' ? (
              <div className="form-grid two">
                <div className="field">
                  <label>Условие</label>
                  <select className="select" value={ach.ruleType} onChange={e => {
                    const t = e.target.value
                    setAch(f => ({ ...f, ruleType: t, ruleValue: RULES[t].course ? (data.courses[0]?.id || '') : (f.ruleValue || 1) }))
                  }}>
                    {Object.entries(RULES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                  </select>
                </div>
                {RULES[ach.ruleType]?.course ? (
                  <div className="field">
                    <label>Курс</label>
                    <select className="select" value={ach.ruleValue} onChange={e => setAch(f => ({ ...f, ruleValue: e.target.value }))}>
                      {data.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </div>
                ) : RULES[ach.ruleType]?.field ? (
                  <div className="field">
                    <label>Сколько ({RULES[ach.ruleType].unit})</label>
                    <input className="input" type="number" min="1" value={ach.ruleValue} onChange={e => setAch(f => ({ ...f, ruleValue: e.target.value }))} />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="hint">Выдаётся в разделе «Выдать награду» — за то, что не посчитать: наставничество, лучший сервис.</p>
            )}

            <div className="form-grid two">
              <div className="field"><label>XP за получение</label><input className="input" type="number" min="0" max="500" value={ach.xp} onChange={e => setAch(f => ({ ...f, xp: e.target.value }))} /></div>
              <div className="field"><label>COIL за получение</label><input className="input" type="number" min="0" max="1000" value={ach.coil} onChange={e => setAch(f => ({ ...f, coil: e.target.value }))} /></div>
              <div className="field">
                <label>Вместе с ним — аватарка</label>
                <select className="select" value={ach.reward_avatar || ''} onChange={e => setAch(f => ({ ...f, reward_avatar: e.target.value }))}>
                  <option value="">Нет</option>
                  {avatars.map(a => <option key={a.id} value={a.ref}>{a.title}{a.purchaseable ? ' (продаётся)' : ''}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Вместе с ним — статус</label>
                <select className="select" value={ach.reward_status || ''} onChange={e => setAch(f => ({ ...f, reward_status: e.target.value }))}>
                  <option value="">Нет</option>
                  {statuses.map(s => <option key={s.id} value={s.ref}>{s.title}</option>)}
                </select>
              </div>
            </div>
            {ach.reward_avatar && <div className="row" style={{ gap: 10 }}><img src={avatarSrc(ach.reward_avatar)} width={44} height={44} style={{ borderRadius: 99 }} alt="" /><span className="small muted">Эту аватарку сотрудник получит вместе с достижением</span></div>}
            {ach.holders > 0 && <p className="hint">Достижение уже есть у {ach.holders} {plural(ach.holders, 'человека', 'человек', 'человек')}. Новая аватарка или статус выдадутся только тем, кто получит его теперь.</p>}
          </form>
        </Modal>
      )}

      {item && (
        <Modal title={item.id ? ({ avatar: 'Аватарка', status: 'Статус', theme: 'Тема в магазине', prize: 'Приз' }[item.kind]) : ({ avatar: 'Новая аватарка', status: 'Новый статус', theme: 'Тема в магазин', prize: 'Новый приз' }[item.kind])}
          onClose={() => setItem(null)} width={520}
          footer={<>
            {item.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={deleteItem}><Icon.trash size={16} /></button>}
            <button className="btn ghost" onClick={() => setItem(null)}>Отмена</button>
            <button className="btn" form="item-form">Сохранить</button>
          </>}>
          <form id="item-form" onSubmit={saveItem} className="col" style={{ gap: 14 }}>
            {item.kind === 'avatar' && (
              <ImageUpload label="Картинка аватарки" shape="circle" maxMb={2} value={/^(\/|https?:)/.test(item.image || '') ? item.image : ''}
                preview={item.image ? avatarSrc(item.image, 256) : ''} onChange={url => setItem(f => ({ ...f, image: url }))} />
            )}
            {item.kind === 'prize' && (
              <ImageUpload label="Фото приза" shape="badge" maxMb={3} value={item.image} onChange={url => setItem(f => ({ ...f, image: url }))} />
            )}
            {item.kind === 'status' && (
              <ImageUpload label="Значок статуса (необязательно)" shape="badge" maxMb={1} value={item.image} onChange={url => setItem(f => ({ ...f, image: url }))} />
            )}
            {item.kind === 'theme' && !item.id && (
              <div className="field">
                <label>Тема</label>
                <select className="select" value={item.ref} onChange={e => setItem(f => ({ ...f, ref: e.target.value, title: f.title || THEMES.find(t => t.slug === e.target.value)?.name || '' }))}>
                  {THEMES.filter(t => t.unlock !== 'default').map(t => <option key={t.slug} value={t.slug} disabled={themes.some(s => s.ref === t.slug)}>{t.name}{t.unlock === 'level' ? ` — бесплатно с ${t.level} ур.` : t.unlock === 'shop' ? ' — только магазин' : ' — особая'}</option>)}
                </select>
              </div>
            )}
            <div className="field"><label>Название</label><input className="input" required value={item.title} onChange={e => setItem(f => ({ ...f, title: e.target.value }))} placeholder={item.kind === 'status' ? 'Знаток табака' : item.kind === 'avatar' ? 'Золотой кальян' : item.kind === 'prize' ? 'Фирменная толстовка' : 'Неон'} /></div>
            {item.kind !== 'theme' && <div className="field"><label>Описание (необязательно)</label><input className="input" value={item.description || ''} onChange={e => setItem(f => ({ ...f, description: e.target.value }))} placeholder="Короткая подпись в магазине" /></div>}
            {item.kind === 'prize' && (
              <div className="form-grid two">
                <div className="field"><label>Цена, COIL</label><input className="input" type="number" min="0" value={item.price} onChange={e => setItem(f => ({ ...f, price: e.target.value }))} /></div>
                <div className="field"><label>Сколько в наличии</label><input className="input" type="number" min="0" placeholder="без ограничения" value={item.stock} onChange={e => setItem(f => ({ ...f, stock: e.target.value }))} /></div>
              </div>
            )}
            {item.kind === 'prize' && (
              <div className="field">
                <label>В магазине</label>
                <div className="segmented">
                  <button type="button" className={item.purchaseable ? 'on' : ''} onClick={() => setItem(f => ({ ...f, purchaseable: true }))}>Показывать</button>
                  <button type="button" className={!item.purchaseable ? 'on' : ''} onClick={() => setItem(f => ({ ...f, purchaseable: false }))}>Скрыть</button>
                </div>
                <span className="hint">Сотрудник заказывает приз, COIL списываются сразу. Вы выдаёте его лично и отмечаете во вкладке «Заказы». Отмена возвращает COIL</span>
              </div>
            )}
            {item.kind === 'status' && (
              <div className="field">
                <label>Редкость</label>
                <div className="segmented">
                  {Object.entries(RARITY).map(([k, r]) => <button key={k} type="button" className={item.rarity === k ? 'on' : ''} onClick={() => setItem(f => ({ ...f, rarity: k }))}>{r.label}</button>)}
                </div>
              </div>
            )}
            {item.kind !== 'prize' && <><div className="field">
              <label>Как получить</label>
              <div className="segmented">
                <button type="button" className={item.purchaseable ? 'on' : ''} onClick={() => setItem(f => ({ ...f, purchaseable: true }))}>Купить за COIL</button>
                <button type="button" className={!item.purchaseable ? 'on' : ''} onClick={() => setItem(f => ({ ...f, purchaseable: false }))}>Только наградой</button>
              </div>
            </div>
            {item.purchaseable ? (
              <div className="field">
                <label>Цена, COIL</label>
                <input className="input" type="number" min="0" value={item.price} onChange={e => setItem(f => ({ ...f, price: e.target.value }))} />
                <span className="hint">Ориентир из ТЗ: аватарка 120–200, статус 200–350, тема 250–400. Активный сотрудник зарабатывает 300–500 COIL в месяц</span>
              </div>
            ) : item.kind !== 'theme' && (
              <p className="hint">В магазине будет с пометкой «Только за достижение». Привяжите к достижению (вкладка «Достижения» → «Вместе с ним») или выдайте вручную в разделе <Link to="/admin/grants">«Выдать награду»</Link>.</p>
            )}</>}
            {item.via?.length > 0 && <p className="small">Выдаётся за: <b>{item.via.join(', ')}</b></p>}
            {item.holders > 0 && <p className="hint">Уже есть у {item.holders} {plural(item.holders, 'человека', 'человек', 'человек')}{item.kind === 'avatar' ? '. Если замените картинку, она обновится и у них' : ''}</p>}
          </form>
        </Modal>
      )}
      {order && (
        <Modal title={order.title} onClose={() => setOrder(null)} width={460}
          footer={order.status === 'new' ? <>
            <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => closeOrder('cancelled')}>Отменить</button>
            <button className="btn" onClick={() => closeOrder('done')}><Icon.check size={16} />Приз выдан</button>
          </> : <button className="btn ghost" onClick={() => setOrder(null)}>Закрыть</button>}>
          <div className="col" style={{ gap: 10 }}>
            {order.image && <img src={order.image} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 14 }} />}
            <div className="row between small"><span className="muted">Сотрудник</span><b>{order.user_name}</b></div>
            {order.branch && <div className="row between small"><span className="muted">Филиал</span><b>{order.branch}</b></div>}
            <div className="row between small"><span className="muted">Телефон</span><a href={`tel:${order.phone}`} className="bold">{order.phone}</a></div>
            <div className="row between small"><span className="muted">Цена</span><b>{order.price} COIL</b></div>
            <div className="row between small"><span className="muted">Заказан</span><b>{fmtDate(order.created_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</b></div>
            {order.status === 'new' ? (
              <div className="field"><label>Комментарий сотруднику (необязательно)</label>
                <input className="input" value={order.note} onChange={e => setOrder(f => ({ ...f, note: e.target.value }))} placeholder="Заберите в филиале на Ленина в пятницу" />
                <span className="hint">«Отменить» вернёт {order.price} COIL сотруднику</span>
              </div>
            ) : <p className="small muted">{order.status === 'done' ? 'Приз выдан' : 'Заказ отменён'}{order.note ? `: ${order.note}` : ''}</p>}
          </div>
        </Modal>
      )}
      {confirmNode}
    </>
  )
}

function ObtainBadge({ it }) {
  return it.purchaseable
    ? <span className="badge gold"><Icon.coin size={11} />{it.price} COIL</span>
    : <span className="badge brand"><Icon.medal size={11} />только наградой</span>
}
