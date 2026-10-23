import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, PageSkeleton, LoadError, Modal, Tabs, PageHead, Empty, useLoad, useToast, avatarSrc, fmtDate, RARITY } from '../ui'

const ORDER_STATUS = {
  new: ['badge gold', 'Ждёт выдачи'],
  done: ['badge success', 'Выдан'],
  cancelled: ['badge', 'Отменён, COIL вернулись']
}

function StatusTag({ rarity }) {
  const r = RARITY[rarity] || RARITY.common
  return <span className={r.cls} style={{ marginTop: 4 }}>{r.label}</span>
}

export default function Shop() {
  const { user, refresh, reload: reloadUser } = useApp()
  const nav = useNavigate()
  const toast = useToast()
  const { data, error, reload } = useLoad(() => api.shop(), [])
  const [params] = useSearchParams()
  const [tab, setTab] = useState(() => params.get('tab'))
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  if (error) return <main className="page"><LoadError error={error} onRetry={reload} /></main>
  if (!data) return <main className="page"><PageSkeleton /></main>

  const prizes = data.items.filter(i => i.kind === 'prize')
  const current = tab || (prizes.length ? 'prize' : 'avatar')
  const items = data.items.filter(i => i.kind === current)
  const isAdmin = user.role === 'admin'

  async function buy(item) {
    setBusy(true)
    try {
      if (item.kind === 'prize') {
        await api.orderPrize(item.id)
        toast('Заказ принят — администратор выдаст приз', 'success')
      } else await api.buy(item.id)
      setConfirm(null)
      await Promise.all([reload(), refresh()])
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function apply(item) {
    try {
      if (item.kind === 'theme') {
        await api.patchMe({ theme: item.ref })
        await reloadUser()
        toast('Тема применена', 'success')
      } else {
        await api.select(item.kind, item.ref)
        await Promise.all([reload(), reloadUser()])
        toast(item.kind === 'avatar' ? 'Аватарка выбрана' : 'Статус выбран', 'success')
      }
      reload()
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <main className="page wide">
      <PageHead title="Магазин" sub="Трать COIL на призы, аватарки, статусы и темы"
        action={<div className="row" style={{ gap: 8 }}>
          {isAdmin && <Link className="btn soft sm" to={`/admin/workshop?tab=${current}`}><Icon.plus size={16} />Добавить товар</Link>}
          <span className="coil-chip" style={{ height: 40, fontSize: 16 }}><Icon.coin size={18} />{data.balance.toLocaleString('ru')}</span>
        </div>} />

      <div style={{ marginBottom: 18 }}>
        <Tabs value={current} onChange={setTab} items={[['prize', 'Призы', prizes.length], ['avatar', 'Аватарки'], ['status', 'Статусы'], ['theme', 'Темы']]} />
      </div>

      {items.length === 0 ? <Empty icon={current === 'prize' ? <Icon.gift size={26} /> : <Icon.bag size={26} />} title="Здесь пока пусто"
        text={current === 'prize' ? 'Призы — настоящие подарки за COIL: мерч, скидки, сладости. Их добавляет администратор' : 'Администратор скоро добавит товары'}
        action={isAdmin && <Link className="btn sm" to={`/admin/workshop?tab=${current}`}><Icon.plus size={16} />Добавить</Link>} /> : (
        <div className="shop-grid">
          {items.map(item => (
            <div key={item.id} className={'shop-item' + (item.owned ? ' owned' : '') + (!item.purchaseable && !item.owned ? ' limited' : '')}>
              {item.kind === 'avatar'
                ? <img className="thumb" src={avatarSrc(item.ref, 256)} alt="" loading="lazy" style={!item.owned && !item.purchaseable ? { filter: 'grayscale(.6)' } : undefined} />
                : item.kind === 'theme' && item.swatch
                  ? <div className="thumb" style={{ background: item.swatch[0], border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, padding: 14, borderRadius: 18 }}>
                      <i style={{ height: 14, borderRadius: 5, background: item.swatch[1] }} />
                      <i style={{ height: 8, width: '60%', borderRadius: 4, background: item.swatch[2] }} />
                    </div>
                  : item.image
                    ? <img className="thumb" src={item.image} alt="" loading="lazy" style={{ objectFit: 'contain', background: 'var(--surface-2)', padding: 8 }} />
                    : <div className="thumb" style={{ color: 'var(--brand-text)', background: 'var(--brand-soft)' }}>{item.kind === 'prize' ? <Icon.gift size={34} /> : <Icon.star size={34} />}</div>}

              <div>
                <div className="bold" style={{ lineHeight: 1.3 }}>{item.title}</div>
                {item.kind === 'status' && <StatusTag rarity={item.rarity} />}
                {item.description && <div className="tiny muted" style={{ marginTop: 4 }}>{item.description}</div>}
                {item.kind === 'theme' && item.level && <div className="tiny muted">или бесплатно на {item.level} уровне</div>}
                {item.kind === 'prize' && item.stock !== null && <div className={'tiny bold ' + (item.stock > 0 ? 'muted' : '')} style={{ marginTop: 4, color: item.stock > 0 ? undefined : 'var(--danger-text)' }}>{item.stock > 0 ? `Осталось: ${item.stock}` : 'Закончился'}</div>}
                {item.ordered > 0 && <div className="tiny" style={{ marginTop: 4, color: 'var(--success-text)' }}>Заказано тобой: {item.ordered}</div>}
              </div>

              <div style={{ marginTop: 'auto' }}>
                {item.kind === 'prize' && item.stock === 0 ? (
                  <button className="btn ghost sm block" disabled>Нет в наличии</button>
                ) : item.owned ? (
                  item.selected
                    ? <span className="badge success"><Icon.check size={12} />{item.kind === 'theme' ? 'Включена' : 'Выбрано'}</span>
                    : <button className="btn ghost sm block" onClick={() => apply(item)}>{item.kind === 'theme' ? 'Включить' : 'Выбрать'}</button>
                ) : !item.purchaseable ? (
                  <span className="badge gold"><Icon.medal size={12} />Только за достижение</span>
                ) : item.missing > 0 ? (
                  <button className="btn ghost sm block" disabled title={`Не хватает ${item.missing} COIL`}>
                    <Icon.coin size={15} />{item.price} · не хватает {item.missing}
                  </button>
                ) : (
                  <button className="btn sm block" onClick={() => setConfirm(item)}><Icon.coin size={15} />{item.price}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {current === 'prize' && data.orders?.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Мои заказы</h2></div>
          <div className="card flush">
            {data.orders.map(o => (
              <div key={o.id} className="order-row">
                <span className="order-thumb">{o.image ? <img src={o.image} alt="" /> : <Icon.gift size={20} />}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="bold ellipsis">{o.title}</div>
                  <div className="tiny muted">{fmtDate(o.created_at)} · {o.price} COIL{o.note ? ` · ${o.note}` : ''}</div>
                </div>
                <span className={ORDER_STATUS[o.status][0]}>{ORDER_STATUS[o.status][1]}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>Как заработать COIL</h2></div>
        <div className="card">
          <div className="grid-auto" style={{ gap: 8 }}>
            {[['Пройти урок', 15], ['Сдать тест', 10], ['Тест на 100%', 15], ['Завершить курс', 40], ['Зайти в день', 5], ['Серия 7 дней', 30], ['Тренировка вкусов', 18]].map(([l, v]) => (
              <div key={l} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="muted bold">{l}</span>
                <span className="mono bold reward">+{v}</span>
              </div>
            ))}
          </div>
          <button className="btn soft sm" style={{ marginTop: 14 }} onClick={() => nav('/library')}><Icon.book size={16} />К урокам</button>
        </div>
      </section>

      {confirm && (
        <Modal title={confirm.kind === 'prize' ? `Заказать «${confirm.title}»?` : `Купить «${confirm.title}»?`} onClose={() => setConfirm(null)} width={380}
          footer={<>
            <button className="btn ghost" onClick={() => setConfirm(null)}>Отмена</button>
            <button className="btn" disabled={busy || data.balance < confirm.price} onClick={() => buy(confirm)}>
              {busy ? 'Минутку…' : `Списать ${confirm.price} COIL`}
            </button>
          </>}>
          <div className="row between" style={{ padding: '6px 0' }}><span className="muted">Баланс</span><span className="mono bold">{data.balance}</span></div>
          <div className="row between" style={{ padding: '6px 0' }}><span className="muted">Цена</span><span className="mono bold" style={{ color: 'var(--danger-text)' }}>− {confirm.price}</span></div>
          <div className="divider" style={{ margin: '8px 0' }} />
          <div className="row between"><span className="bold">Останется</span><span className="mono bold reward" style={{ fontSize: 18 }}>{data.balance - confirm.price}</span></div>
          <p className="small muted" style={{ marginTop: 14 }}>{confirm.kind === 'prize'
            ? 'COIL спишутся сразу. Администратор получит заказ и выдаст приз лично. Если заказ отменят, COIL вернутся.'
            : 'Возврата покупки нет. COIL — внутренняя валюта, на деньги не обменивается.'}</p>
        </Modal>
      )}
    </main>
  )
}
