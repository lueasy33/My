import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Icon, Empty } from '../ui'

const CHIPS = ['кальян', 'мятный', 'крепкий', 'сладкий', 'цитрус', 'уголь']

export default function Search() {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); setBusy(false); return }
    setBusy(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try { setRes(await api.search(q.trim())) } catch { setRes({ courses: [], lessons: [], flavors: [] }) } finally { setBusy(false) }
    }, 280)
    return () => clearTimeout(timer.current)
  }, [q])

  const empty = res && !res.courses.length && !res.lessons.length && !res.flavors.length

  return (
    <main className="page narrow">
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <input className="input" type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Курс, урок, вкус, бренд…" style={{ paddingLeft: 44, minHeight: 52 }} autoFocus aria-label="Поиск" />
        <Icon.search size={19} style={{ position: 'absolute', left: 15, top: 17, color: 'var(--text-muted)' }} />
      </div>

      {!q && (
        <>
          <p className="small muted bold" style={{ marginBottom: 10 }}>Попробуй</p>
          <div className="scroll-x" style={{ flexWrap: 'wrap' }}>
            {CHIPS.map(c => <button key={c} className="pill" onClick={() => setQ(c)}>{c}</button>)}
          </div>
          <p className="small muted" style={{ marginTop: 20, lineHeight: 1.7 }}>
            Ищем по названиям курсов и уроков, а ещё по вкусам — по названию, бренду и тегам.
          </p>
        </>
      )}

      {busy && <p className="small muted">Ищем…</p>}
      {empty && !busy && <Empty icon={<Icon.search size={26} />} title="Ничего не нашлось" text={`По запросу «${q}» пусто. Попробуй другое слово.`} />}

      {res && !busy && (
        <div className="col" style={{ gap: 22 }}>
          {res.courses.length > 0 && (
            <section>
              <div className="section-head"><h2>Курсы</h2></div>
              <div className="col" style={{ gap: 8 }}>
                {res.courses.map(c => (
                  <Link key={c.id} to={`/course/${c.id}`} className="list-row">
                    <span className="list-ico"><Icon.book size={19} /></span>
                    <span className="list-main"><b>{c.title}</b></span>
                    <Icon.chevR size={17} style={{ color: 'var(--text-muted)' }} />
                  </Link>
                ))}
              </div>
            </section>
          )}
          {res.lessons.length > 0 && (
            <section>
              <div className="section-head"><h2>Уроки</h2></div>
              <div className="col" style={{ gap: 8 }}>
                {res.lessons.map(l => (
                  <Link key={l.id} to={`/lesson/${l.id}`} className="list-row">
                    <span className="list-ico"><Icon.play size={18} /></span>
                    <span className="list-main"><b>{l.title}</b><span>{l.course}</span></span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {res.flavors.length > 0 && (
            <section>
              <div className="section-head"><h2>Вкусы · {res.flavors.length}</h2></div>
              <div className="col" style={{ gap: 8 }}>
                {res.flavors.map(f => (
                  <div key={f.id} className="card tight">
                    <div className="row between" style={{ gap: 8 }}>
                      <div style={{ minWidth: 0 }}><b>{f.name}</b><div className="small muted">{f.brand}</div></div>
                      {f.strength && <span className="badge">{f.strength}</span>}
                    </div>
                    {f.description && <p className="small muted" style={{ marginTop: 6 }}>{f.description}</p>}
                    {f.tags?.length > 0 && (
                      <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>
                        {f.tags.filter(t => !t.includes('крепость')).map((t, i) => <span key={i} className="badge">{t}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}
