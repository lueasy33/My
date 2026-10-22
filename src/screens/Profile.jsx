import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon, Avatar, PageSkeleton, ProgressBar, LevelRing, LoadError, Modal, Tabs, useLoad, useToast, plural, fmtDate, fmtAgo, ROLE_LABEL, avatarSrc, iconSrc, RARITY } from '../ui'

function StatTile({ icon: I, label, value, sub, percent, gold, tone, to }) {
  const body = (
    <>
      <span className={'stat-ico' + (gold ? ' gold' : '')}><I size={17} /></span>
      <b className={gold ? 'reward' : ''} style={{ color: tone ? `var(--${tone}-text)` : undefined }}>{value}</b>
      <span className="small muted">{label}</span>
      {sub && <span className="tiny muted">{sub}</span>}
      {percent !== undefined && <span style={{ marginTop: 6 }}><ProgressBar percent={percent} thin /></span>}
    </>
  )
  return to ? <Link to={to} className="stat-tile hover">{body}</Link> : <div className="stat-tile">{body}</div>
}

export default function Profile() {
  const { user, branch, reload: reloadUser } = useApp()
  const toast = useToast()
  const { data, error, reload } = useLoad(() => api.profile(), [])
  const [medal, setMedal] = useState(null)
  const [picker, setPicker] = useState(null) // 'avatar' | 'status'
  const [tab, setTab] = useState('awards')

  if (error) return <main className="page"><LoadError error={error} onRetry={reload} /></main>
  if (!data) return <main className="page"><PageSkeleton /></main>

  const earned = data.achievements.filter(a => a.earned)

  async function choose(kind, ref) {
    try {
      await api.select(kind, ref)
      await Promise.all([reloadUser(), reload()])
      setPicker(null)
      toast(kind === 'avatar' ? 'Аватарка изменена' : ref ? 'Статус изменён' : 'Статус снят', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const s = data.stats
  const lp = data.levelProgress
  const ACT = {
    lesson: { icon: Icon.book, cls: 'success', label: 'Урок пройден' },
    achievement: { icon: Icon.medal, cls: 'gold', label: 'Достижение' },
    purchase: { icon: Icon.bag, cls: '', label: 'Покупка' }
  }

  return (
    <main className="page">
      <section className="hero profile-hero">
        <div className="profile-head">
          <button onClick={() => setPicker('avatar')} aria-label="Сменить аватарку" className="profile-avatar">
            <Avatar id={user.avatar_id} size={96} ring />
            <span className="icon-btn"><Icon.edit size={15} /></span>
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24 }}>{user.name}</h1>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              <button className="badge brand" style={{ cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setPicker('status')}>
                {data.status_info?.image ? <img src={data.status_info.image} alt="" width={14} height={14} /> : <Icon.star size={12} />}
                {data.status || 'Выбрать статус'}
              </button>
              <span className="badge">{ROLE_LABEL[user.role]}</span>
              {branch && <span className="badge">{branch.name}</span>}
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>В команде {s.days} {plural(s.days, 'день', 'дня', 'дней')} · с {fmtDate(data.since, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        <div className="row" style={{ gap: 14, marginTop: 20 }}>
          <LevelRing level={lp.level} percent={lp.percent} size={68} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row between small" style={{ marginBottom: 7 }}>
              <span className="muted bold">До уровня {lp.level + 1} — ещё {lp.span - lp.current} XP</span>
              <span className="mono bold reward">{lp.current} / {lp.span}</span>
            </div>
            <ProgressBar percent={lp.percent} gold />
            {data.nextThemes?.length > 0 && <p className="tiny muted" style={{ marginTop: 6 }}>На {lp.level + 1} уровне откроется тема «{data.nextThemes.join('», «')}»</p>}
          </div>
        </div>
        <div className="hero-stats">
          <div className="stat"><div className="v reward"><Icon.bolt size={16} />{user.xp.toLocaleString('ru')}</div><div className="k">опыт, XP</div></div>
          <div className="stat"><div className="v reward"><Icon.coin size={16} />{user.coil.toLocaleString('ru')}</div><div className="k">COIL</div></div>
          <div className="stat"><div className="v reward"><Icon.flame size={16} />{data.streak}</div><div className="k">{plural(data.streak, 'день', 'дня', 'дней')} подряд</div></div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Статистика</h2></div>
        <div className="stat-grid">
          <StatTile icon={Icon.book} label="Уроков пройдено" value={`${s.lessonsDone}/${s.lessonsTotal}`} percent={s.lessonsTotal ? s.lessonsDone / s.lessonsTotal * 100 : 0} />
          <StatTile icon={Icon.check} label="Курсов завершено" value={`${s.coursesDone}/${s.coursesTotal}`} percent={s.coursesTotal ? s.coursesDone / s.coursesTotal * 100 : 0} />
          <StatTile icon={Icon.target} label="Тестов сдано" value={s.testsPassed} sub={`${s.attempts} ${plural(s.attempts, 'попытка', 'попытки', 'попыток')}`} />
          <StatTile icon={Icon.chart} label="Средний балл" value={s.avgScore ? `${s.avgScore}%` : '—'} tone={s.avgScore >= 80 ? 'success' : s.avgScore && s.avgScore < 60 ? 'danger' : ''} />
          <StatTile icon={Icon.star} label="Тестов на 100%" value={s.perfectTests} gold />
          <StatTile icon={Icon.sparkles} label="Вкусов знаю" value={`${s.flavorsLearned}/${s.flavorsTotal}`} percent={s.flavorsTotal ? s.flavorsLearned / s.flavorsTotal * 100 : 0} to="/flavors" />
          <StatTile icon={Icon.flame} label="Лучшая серия" value={`${s.bestStreak} ${plural(s.bestStreak, 'день', 'дня', 'дней')}`} gold />
          {data.rank && <StatTile icon={Icon.trophy} label="Место в компании" value={`${data.rank.company} из ${data.rank.companyTotal}`} sub={data.rank.branch ? `в филиале ${data.rank.branch} из ${data.rank.branchTotal}` : ''} to="/ranking" />}
          <StatTile icon={Icon.medal} label="Достижений" value={`${earned.length}/${data.achievements.length}`} gold />
          <StatTile icon={Icon.coin} label="COIL заработано за учёбу" value={s.coilEarned.toLocaleString('ru')} sub={`потрачено ${s.coilSpent.toLocaleString('ru')}`} gold />
        </div>
      </section>

      <div className="dash-grid">
        <div>
          {data.next.length > 0 && (
            <section className="section">
              <div className="section-head"><h2>Ближе всего к награде</h2></div>
              <div className="col" style={{ gap: 8 }}>
                {data.next.map(a => (
                  <div key={a.id} className="list-row">
                    <img src={iconSrc(a.icon)} alt="" width={44} height={44} style={{ flex: 'none', filter: 'grayscale(.5)' }} />
                    <span className="list-main">
                      <b>{a.title}</b>
                      <span style={{ whiteSpace: 'normal' }}>{a.description}</span>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                        <span style={{ flex: 1 }}><ProgressBar percent={a.percent} gold thin /></span>
                        <span className="mono tiny bold">{a.current}/{a.target}</span>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head"><h2>Мои курсы</h2><Link to="/library">Все</Link></div>
            {data.courses.length ? (
              <div className="col" style={{ gap: 8 }}>
                {data.courses.map(c => {
                  const done = c.done >= c.total
                  const pct = Math.round(c.done / Math.max(1, c.total) * 100)
                  return (
                    <Link key={c.id} to={`/course/${c.id}`} className="list-row">
                      <span className={'list-ico ' + (done ? 'success' : '')}>{done ? <Icon.check size={19} /> : <Icon.book size={19} />}</span>
                      <span className="list-main">
                        <b>{c.title}</b>
                        <span>{c.done ? `${c.done} из ${c.total} ${plural(c.total, 'урока', 'уроков', 'уроков')}` : 'ещё не начат'}</span>
                        <span style={{ display: 'block', marginTop: 6 }}><ProgressBar percent={pct} thin /></span>
                      </span>
                      <span className="mono bold small" style={{ color: done ? 'var(--success-text)' : 'var(--brand-text)' }}>{pct}%</span>
                    </Link>
                  )
                })}
              </div>
            ) : <div className="empty"><p className="muted small">Курсов пока нет</p></div>}
          </section>
        </div>

        <section className="section">
          <div className="section-head"><h2>Последние действия</h2></div>
          {data.activity.length ? (
            <div className="timeline">
              {data.activity.map((a, i) => {
                const k = ACT[a.kind]
                return (
                  <div key={i} className="timeline-item">
                    <span className={'list-ico ' + k.cls} style={{ width: 34, height: 34 }}><k.icon size={16} /></span>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 14 }}>{a.title}</b>
                      <div className="tiny muted">{k.label}{a.sub ? ` · ${a.sub}` : ''} · {fmtAgo(a.at)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <div className="empty"><p className="muted small">Пройди первый урок — он появится здесь</p></div>}
        </section>
      </div>

      <div style={{ margin: '28px 0 14px' }}>
        <Tabs value={tab} onChange={setTab} items={[
          ['awards', 'Достижения', `${earned.length}/${data.achievements.length}`],
          ['collection', 'Коллекция', data.avatars.length + data.statuses.length],
          ['history', 'История COIL']
        ]} />
      </div>

      {tab === 'awards' && (
        <div className="medals">
          {data.achievements.map(a => (
            <button key={a.id} className={'medal' + (a.earned ? ' earned' : ' locked')} onClick={() => setMedal(a)}
              aria-label={`${a.title}${a.earned ? '' : ' — ещё не получено'}`}>
              <img src={iconSrc(a.icon)} alt="" loading="lazy" />
              {!a.earned && <Icon.lock size={13} className="lock" />}
            </button>
          ))}
        </div>
      )}

      {tab === 'collection' && (
        <>
          <div className="section-head"><h2 style={{ fontSize: 15 }}>Аватарки · {data.avatars.length}</h2><button className="btn ghost xs" onClick={() => setPicker('avatar')}>Сменить</button></div>
          <div className="row wrap" style={{ gap: 10, marginBottom: 20 }}>
            {data.avatars.map(a => (
              <button key={a.ref} onClick={() => choose('avatar', a.ref)} title={a.title} className="avatar-pick" aria-pressed={user.avatar_id === a.ref}>
                <Avatar id={a.ref} size={56} ring={user.avatar_id === a.ref} />
              </button>
            ))}
            <Link to="/shop" className="avatar-pick more" aria-label="Больше в магазине"><Icon.plus size={20} /></Link>
          </div>
          <div className="section-head"><h2 style={{ fontSize: 15 }}>Статусы · {data.statuses.length}</h2></div>
          {data.statuses.length ? (
            <div className="row wrap" style={{ gap: 8 }}>
              {data.statuses.map(st => (
                <button key={st.ref} className={(RARITY[st.rarity] || RARITY.common).cls} style={{ cursor: 'pointer', fontFamily: 'inherit', padding: '6px 12px', fontSize: 13, outline: data.status_ref === st.ref ? '2px solid var(--brand-500)' : 'none' }} onClick={() => choose('status', st.ref)}>
                  {st.image ? <img src={st.image} alt="" width={16} height={16} /> : <Icon.star size={13} />}{st.title}
                </button>
              ))}
            </div>
          ) : <p className="small muted">Статусы покупаются в магазине или выдаются за достижения</p>}
        </>
      )}

      {tab === 'history' && (
        <div className="col" style={{ gap: 6 }}>
          {data.history.length === 0 && <div className="empty"><p className="muted small">Пока пусто — пройди урок, и первые COIL появятся здесь</p></div>}
          {data.history.map((h, i) => (
            <div key={i} className="list-row" style={{ minHeight: 52 }}>
              <span className="list-main"><b style={{ fontWeight: 650 }}>{reasonLabel(h.reason)}</b><span>{fmtDate(h.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
              <span className="mono bold" style={{ color: h.amount > 0 ? 'var(--reward-text)' : 'var(--danger-text)' }}>{h.amount > 0 ? '+' : '−'}{Math.abs(h.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="col" style={{ gap: 8, marginTop: 26 }}>
        <Link to="/themes" className="list-row"><span className="list-ico"><Icon.palette size={19} /></span><span className="list-main"><b>Оформление</b><span>24 темы, открываются по уровням</span></span><Icon.chevR size={18} /></Link>
        <Link to="/settings" className="list-row"><span className="list-ico"><Icon.settings size={19} /></span><span className="list-main"><b>Настройки</b><span>Пароль, звук, анимации, обучение заново</span></span><Icon.chevR size={18} /></Link>
      </div>

      {medal && (
        <Modal title={medal.title} onClose={() => setMedal(null)} width={380}>
          <div className="center">
            <div className={'medal' + (medal.earned ? ' earned' : ' locked')} style={{ width: 120, margin: '0 auto 14px', cursor: 'default' }}>
              <img src={iconSrc(medal.icon)} alt="" />
            </div>
            <p className="muted">{medal.description}</p>
            {medal.earned
              ? <p className="small" style={{ marginTop: 10 }}>Получено {fmtDate(medal.granted_at, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              : <p className="small muted" style={{ marginTop: 10 }}>{medal.kind === 'manual' ? 'Выдаётся администратором за дела, которые не посчитать автоматически' : 'Ещё не получено'}</p>}
            {medal.reason && <p className="reward-note">{medal.reason}</p>}
            {(medal.xp > 0 || medal.coil > 0) && (
              <div className="reward-xp">
                {medal.xp > 0 && <span className="chip-reward"><Icon.bolt size={14} />{medal.xp} XP</span>}
                {medal.coil > 0 && <span className="chip-reward"><Icon.coin size={14} />{medal.coil} COIL</span>}
              </div>
            )}
          </div>
        </Modal>
      )}

      {picker === 'avatar' && (
        <Modal title="Аватарка" onClose={() => setPicker(null)}>
          <div className="shop-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {data.avatars.map(a => (
              <button key={a.ref} className={'shop-item' + (user.avatar_id === a.ref ? ' owned' : '')} style={{ cursor: 'pointer' }} onClick={() => choose('avatar', a.ref)}>
                <img className="thumb" src={avatarSrc(a.ref, 256)} alt="" />
                <span className="small bold">{a.title}</span>
              </button>
            ))}
          </div>
          <Link to="/shop" className="btn ghost block sm" style={{ marginTop: 14 }} onClick={() => setPicker(null)}>Больше аватарок в магазине</Link>
        </Modal>
      )}

      {picker === 'status' && (
        <Modal title="Статус под именем" onClose={() => setPicker(null)}>
          {data.statuses.length ? (
            <div className="col" style={{ gap: 8 }}>
              {data.statuses.map(s => (
                <button key={s.ref} className="list-row" onClick={() => choose('status', s.ref)}>
                  {s.image ? <img src={s.image} alt="" width={40} height={40} style={{ objectFit: 'contain', flex: 'none' }} /> : <span className="list-ico"><Icon.star size={18} /></span>}
                  <span className="list-main"><b>{s.title}</b><span>{(RARITY[s.rarity] || RARITY.common).label}</span></span>
                  {data.status_ref === s.ref && <Icon.check size={18} style={{ color: 'var(--brand-text)' }} />}
                </button>
              ))}
              {data.status_ref && <button className="btn ghost sm" onClick={() => choose('status', null)}>Убрать статус</button>}
            </div>
          ) : (
            <p className="muted">Статусов пока нет. Их можно купить в магазине за COIL или получить за достижения.</p>
          )}
          <Link to="/shop" className="btn ghost block sm" style={{ marginTop: 14 }} onClick={() => setPicker(null)}>Открыть магазин</Link>
        </Modal>
      )}
    </main>
  )
}

export function reasonLabel(r) {
  const map = {
    lesson: 'Урок пройден', test: 'Тест сдан', test_perfect: 'Тест на 100%',
    course: 'Курс завершён', daily: 'Ежедневный вход', streak: 'Серия дней',
    achievement: 'Достижение', purchase: 'Покупка в магазине', flavor: 'Тренировка вкусов',
    flavor_train: 'Сессия вкусов', review: 'Проверка ответа', opening: 'Стартовый баланс'
  }
  return map[r] || r
}
