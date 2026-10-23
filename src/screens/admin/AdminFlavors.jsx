import { useState, useMemo } from 'react'
import { api } from '../../api'
import { Icon, PageSkeleton, LoadError, PageHead, Modal, Empty, useLoad, useToast, useConfirm, plural } from '../../ui'
import { BrandLogo } from '../flavorUi'
import ImageUpload from './ImageUpload'

const STRENGTHS = [['', 'Не указана'], ['лёгкая', 'Лёгкая'], ['средняя', 'Средняя'], ['высокая', 'Высокая']]

// Полное управление вкусами: бренды и вкусы — создать, изменить, скрыть, удалить.
// Вкус попадает в тренировку сотрудников, только если у него есть описание.
export default function AdminFlavors() {
  const toast = useToast()
  const [ask, confirmNode] = useConfirm()
  const { data, error, reload } = useLoad(() => api.admin.flavors(), [])
  const [brandId, setBrandId] = useState(null)
  const [q, setQ] = useState('')
  const [brandForm, setBrandForm] = useState(null)
  const [flavorForm, setFlavorForm] = useState(null)
  const [importing, setImporting] = useState(false)

  const brand = data?.brands.find(b => b.id === brandId) || data?.brands[0] || null
  const list = useMemo(() => {
    if (!data) return []
    const low = q.trim().toLowerCase()
    return data.flavors.filter(f => low ? (f.name.toLowerCase().includes(low) || String(f.brand).toLowerCase().includes(low)) : f.brand_id === brand?.id)
  }, [data, q, brand])

  if (error) return <LoadError error={error} onRetry={reload} />
  if (!data) return <PageSkeleton />

  const noDesc = data.flavors.filter(f => !f.description).length
  const run = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok, 'success'); await reload(); return r || true } catch (e) { toast(e.message, 'error'); return false } }

  async function saveBrand(e) {
    e.preventDefault()
    const body = { name: brandForm.name, description: brandForm.description, country: brandForm.country, logo: brandForm.logo, color: brandForm.color, published: brandForm.published }
    const r = await run(() => brandForm.id ? api.admin.updateFlavorBrand(brandForm.id, body) : api.admin.createFlavorBrand(body), brandForm.id ? 'Бренд сохранён' : 'Бренд создан')
    if (r) { if (!brandForm.id && r.id) setBrandId(r.id); setBrandForm(null) }
  }
  async function deleteBrand() {
    const b = brandForm
    if (!(await ask({ title: `Удалить бренд ${b.name}?`, text: b.flavors ? `Вместе с ним удалятся ${b.flavors} ${plural(b.flavors, 'вкус', 'вкуса', 'вкусов')} и прогресс сотрудников по ним. Если бренд просто временно не продаётся — лучше скрыть его.` : 'Бренд удалится.', ok: 'Удалить', danger: true }))) return
    if (await run(() => api.admin.deleteFlavorBrand(b.id), 'Бренд удалён')) { setBrandForm(null); setBrandId(null) }
  }

  async function saveFlavor(e) {
    e.preventDefault()
    const f = flavorForm
    const body = { brand_id: Number(f.brand_id), name: f.name, description: f.description, tags: f.tagsText.split(',').map(t => t.trim()).filter(Boolean), strength: f.strength, cold: f.cold, image: f.image, tip: f.tip, mix: f.mix, line: f.line, published: f.published, in_quiz: f.in_quiz }
    const r = await run(() => f.id ? api.admin.updateFlavor(f.id, body) : api.admin.createFlavor(body))
    if (r) {
      toast(r.in_quiz === false && f.in_quiz ? 'Сохранено. В тренировку вкус попадёт, когда появится описание' : 'Вкус сохранён', 'success')
      setFlavorForm(null)
    }
  }
  async function deleteFlavor() {
    if (!(await ask({ title: `Удалить вкус ${flavorForm.name}?`, text: 'Вкус пропадёт из коллекции, а прогресс сотрудников по нему удалится. Чтобы просто убрать из продажи — выключите «Показывать сотрудникам».', ok: 'Удалить', danger: true }))) return
    if (await run(() => api.admin.deleteFlavor(flavorForm.id), 'Вкус удалён')) setFlavorForm(null)
  }

  const openFlavor = (f) => setFlavorForm(f
    ? { ...f, tagsText: (f.tags || []).join(', '), cold: !!f.cold, published: !!f.published, in_quiz: !!f.in_quiz }
    : { brand_id: brand?.id || '', name: '', description: '', tagsText: '', strength: '', cold: false, image: '', tip: '', mix: '', line: '', published: true, in_quiz: true })

  return (
    <>
      <PageHead title="Вкусы" sub={`${data.brands.length} ${plural(data.brands.length, 'бренд', 'бренда', 'брендов')} · ${data.flavors.length} ${plural(data.flavors.length, 'вкус', 'вкуса', 'вкусов')}${noDesc ? ` · ${noDesc} без описания` : ''}`}
        action={<>
          <button className="btn ghost sm" onClick={() => setImporting(true)}><Icon.upload size={16} />Импорт</button>
          <button className="btn ghost sm" onClick={() => setBrandForm({ name: '', description: '', country: '', logo: '', color: '', published: true })}><Icon.plus size={16} />Бренд</button>
          <button className="btn sm" disabled={!data.brands.length} onClick={() => openFlavor(null)}><Icon.plus size={16} />Вкус</button>
        </>} />

      {noDesc > 0 && (
        <div className="callout warn" style={{ marginTop: 0 }}>
          <span className="ico"><Icon.alert size={18} /></span>
          <div><b>{noDesc} {plural(noDesc, 'вкус', 'вкуса', 'вкусов')} без описания</b> — они видны в коллекции, но не попадают в тренировку. Описание — это фраза, которую продавец повторит клиенту.</div>
        </div>
      )}

      {data.brands.length === 0 ? (
        <Empty icon={<Icon.target size={26} />} title="Брендов пока нет" text="Создайте первый бренд, а затем добавьте в него вкусы — или загрузите таблицу через «Импорт»"
          action={<button className="btn sm" onClick={() => setBrandForm({ name: '', description: '', country: '', logo: '', color: '', published: true })}><Icon.plus size={16} />Создать бренд</button>} />
      ) : (
        <div className="split">
          <aside className="card tight" style={{ padding: 8 }}>
            {data.brands.map(b => (
              <button key={b.id} className={'brand-row' + (brand?.id === b.id && !q ? ' on' : '')} onClick={() => { setBrandId(b.id); setQ('') }}>
                <BrandLogo brand={b} size={34} />
                <span className="list-main"><b>{b.name}</b><span>{b.flavors} {plural(b.flavors, 'вкус', 'вкуса', 'вкусов')}{!b.published ? ' · скрыт' : ''}</span></span>
              </button>
            ))}
          </aside>

          <div className="col" style={{ gap: 12, minWidth: 0 }}>
            {brand && !q && (
              <div className="card row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <BrandLogo brand={brand} size={64} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <h2 style={{ fontSize: 20 }}>{brand.name}</h2>
                    {!brand.published && <span className="badge warn">Скрыт от сотрудников</span>}
                    {brand.country && <span className="badge">{brand.country}</span>}
                  </div>
                  <p className="small muted" style={{ marginTop: 6 }}>{brand.description || 'Описание бренда не заполнено'}</p>
                </div>
                <button className="btn ghost xs icon" aria-label="Изменить бренд" onClick={() => setBrandForm({ ...brand, published: !!brand.published })}><Icon.edit size={15} /></button>
              </div>
            )}

            <div className="row" style={{ gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input className="input" placeholder="Найти вкус во всех брендах" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 40, minHeight: 44 }} />
                <Icon.search size={17} style={{ position: 'absolute', left: 13, top: 14, color: 'var(--text-muted)' }} />
              </div>
              {brand && !q && <button className="btn sm" onClick={() => openFlavor(null)}><Icon.plus size={16} />Вкус в {brand.name}</button>}
            </div>

            {list.length === 0 ? <Empty icon={<Icon.target size={26} />} title={q ? 'Ничего не нашли' : 'В бренде пока нет вкусов'} /> : (
              <div className="table-wrap">
                <table className="dtable stack">
                  <thead><tr><th>Вкус</th><th>Крепость</th><th>Холод</th><th>Тренировка</th><th>Ошибок</th><th></th></tr></thead>
                  <tbody>
                    {list.map(f => (
                      <tr key={f.id} style={{ cursor: 'pointer', opacity: f.published ? 1 : .55 }} onClick={() => openFlavor(f)}>
                        <td>
                          <div className="row" style={{ gap: 10 }}>
                            {f.image ? <img src={f.image} alt="" width={36} height={36} style={{ borderRadius: 9, objectFit: 'cover' }} /> : null}
                            <div style={{ minWidth: 0 }}>
                              <b>{f.name}</b>{q && <span className="small muted"> · {f.brand}</span>}
                              <div className="small muted clamp2">{f.description || <span style={{ color: 'var(--warning-text)' }}>нет описания</span>}</div>
                            </div>
                          </div>
                        </td>
                        <td className="small" data-label="Крепость">{f.strength || '—'}</td>
                        <td data-label="Холод">{f.cold ? '❄' : '—'}</td>
                        <td data-label="Тренировка">{!f.published ? <span className="badge">скрыт</span> : f.in_quiz ? <span className="badge success">да</span> : <span className="badge warn">нет</span>}</td>
                        <td className="mono small" data-label="Ошибок">{f.correct + f.wrong ? `${Math.round(f.wrong / (f.correct + f.wrong) * 100)}%` : '—'}</td>
                        <td className="stack-hide"><Icon.edit size={15} style={{ color: 'var(--text-muted)' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {brandForm && (
        <Modal title={brandForm.id ? 'Бренд' : 'Новый бренд'} onClose={() => setBrandForm(null)} width={520}
          footer={<>
            {brandForm.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={deleteBrand}><Icon.trash size={16} /></button>}
            <button className="btn ghost" onClick={() => setBrandForm(null)}>Отмена</button>
            <button className="btn" form="brand-form">Сохранить</button>
          </>}>
          <form id="brand-form" onSubmit={saveBrand} className="col" style={{ gap: 12 }}>
            <ImageUpload label="Логотип" shape="circle" maxMb={2} value={brandForm.logo} onChange={url => setBrandForm(f => ({ ...f, logo: url }))} />
            {brandForm.logo && <button type="button" className="btn ghost xs" style={{ alignSelf: 'flex-start' }} onClick={() => setBrandForm(f => ({ ...f, logo: '' }))}>Убрать логотип</button>}
            <div className="form-grid two">
              <div className="field"><label>Название</label><input className="input" required value={brandForm.name} onChange={e => setBrandForm(f => ({ ...f, name: e.target.value }))} placeholder="MUST HAVE" autoFocus /></div>
              <div className="field"><label>Страна</label><input className="input" value={brandForm.country || ''} onChange={e => setBrandForm(f => ({ ...f, country: e.target.value }))} placeholder="Россия" /></div>
            </div>
            <div className="field"><label>Описание бренда</label><textarea className="textarea" rows={3} value={brandForm.description || ''} onChange={e => setBrandForm(f => ({ ...f, description: e.target.value }))} placeholder="Чем бренд отличается, кому советовать" /></div>
            <div className="row" style={{ gap: 12 }}>
              <label className="field" style={{ flex: 'none' }}><span className="label">Цвет</span>
                <input type="color" value={brandForm.color || '#7C5CBF'} onChange={e => setBrandForm(f => ({ ...f, color: e.target.value }))} style={{ width: 52, height: 44, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
              </label>
              <label className="check" style={{ marginTop: 18 }}><input type="checkbox" checked={brandForm.published} onChange={e => setBrandForm(f => ({ ...f, published: e.target.checked }))} />Показывать сотрудникам</label>
            </div>
          </form>
        </Modal>
      )}

      {flavorForm && (
        <Modal title={flavorForm.id ? 'Вкус' : 'Новый вкус'} onClose={() => setFlavorForm(null)} width={620}
          footer={<>
            {flavorForm.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={deleteFlavor}><Icon.trash size={16} /></button>}
            <button className="btn ghost" onClick={() => setFlavorForm(null)}>Отмена</button>
            <button className="btn" form="flavor-form">Сохранить</button>
          </>}>
          <form id="flavor-form" onSubmit={saveFlavor} className="col" style={{ gap: 12 }}>
            <div className="form-grid two">
              <div className="field">
                <label>Бренд</label>
                <select className="select" required value={flavorForm.brand_id} onChange={e => setFlavorForm(f => ({ ...f, brand_id: e.target.value }))}>
                  {data.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Название вкуса</label><input className="input" required value={flavorForm.name} onChange={e => setFlavorForm(f => ({ ...f, name: e.target.value }))} placeholder="GRAPE MINT" /></div>
            </div>
            <div className="field">
              <label>Описание — какой это вкус</label>
              <textarea className="textarea" rows={2} value={flavorForm.description} onChange={e => setFlavorForm(f => ({ ...f, description: e.target.value }))} placeholder="Спелый виноград с мятной свежестью" />
              <span className="hint">Одна понятная фраза. Без неё вкус не попадёт в тренировку</span>
            </div>
            <div className="form-grid two">
              <div className="field">
                <label>Крепость</label>
                <select className="select" value={flavorForm.strength} onChange={e => setFlavorForm(f => ({ ...f, strength: e.target.value }))}>
                  {STRENGTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field"><label>Линейка</label><input className="input" value={flavorForm.line} onChange={e => setFlavorForm(f => ({ ...f, line: e.target.value }))} placeholder="Классика, Black…" /></div>
            </div>
            <div className="field"><label>Теги через запятую</label><input className="input" value={flavorForm.tagsText} onChange={e => setFlavorForm(f => ({ ...f, tagsText: e.target.value }))} placeholder="фрукт, ягода, десерт" /></div>
            <label className="check"><input type="checkbox" checked={flavorForm.cold} onChange={e => setFlavorForm(f => ({ ...f, cold: e.target.checked }))} />С холодом (мята, лёд)</label>
            <div className="field"><label>Как рассказать клиенту</label><textarea className="textarea" rows={2} value={flavorForm.tip} onChange={e => setFlavorForm(f => ({ ...f, tip: e.target.value }))} placeholder="Например: «Если любите свежие фруктовые — этот точно зайдёт»" /></div>
            <div className="field"><label>С чем миксуют</label><input className="input" value={flavorForm.mix} onChange={e => setFlavorForm(f => ({ ...f, mix: e.target.value }))} placeholder="Хорош с цитрусовыми и ягодными" /></div>
            <ImageUpload label="Фото пачки или вкуса (необязательно)" shape="cover" maxMb={5} value={flavorForm.image} onChange={url => setFlavorForm(f => ({ ...f, image: url }))} />
            {flavorForm.image && <button type="button" className="btn ghost xs" style={{ alignSelf: 'flex-start' }} onClick={() => setFlavorForm(f => ({ ...f, image: '' }))}>Убрать фото</button>}
            <div className="row wrap" style={{ gap: 16 }}>
              <label className="check"><input type="checkbox" checked={flavorForm.published} onChange={e => setFlavorForm(f => ({ ...f, published: e.target.checked }))} />Показывать сотрудникам</label>
              <label className="check"><input type="checkbox" checked={flavorForm.in_quiz} onChange={e => setFlavorForm(f => ({ ...f, in_quiz: e.target.checked }))} />Участвует в тренировке</label>
            </div>
            {flavorForm.id && (flavorForm.learners > 0) && <p className="hint">Учат {flavorForm.learners} чел. · верных ответов {flavorForm.correct}, ошибок {flavorForm.wrong}</p>}
          </form>
        </Modal>
      )}

      {importing && <Import onClose={() => setImporting(false)} onDone={reload} />}
      {confirmNode}
    </>
  )
}

function Import({ onClose, onDone }) {
  const toast = useToast()
  const [csv, setCsv] = useState('')
  const [msg, setMsg] = useState('')
  async function run() {
    try {
      const rows = csv.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
        const [brand, name, description, tags, strength, cold] = line.split(';')
        return { brand, name, description, tags, strength, cold }
      })
      const r = await api.admin.importFlavors(rows)
      setMsg(r.message); setCsv(''); onDone()
    } catch (e) { toast(e.message, 'error') }
  }
  return (
    <Modal title="Импорт вкусов" onClose={onClose} width={620}
      footer={<><button className="btn ghost" onClick={onClose}>Закрыть</button><button className="btn" disabled={!csv.trim()} onClick={run}>Импортировать</button></>}>
      <p className="small muted" style={{ marginBottom: 10 }}>
        Одна строка — один вкус: <code>бренд;название;описание;теги через запятую;крепость;холод (да/нет)</code>.
        Таблицу из Excel можно сохранить как CSV с разделителем «;» и вставить сюда. Новые бренды создадутся сами, повторы пропустятся.
      </p>
      <textarea className="textarea" rows={8} value={csv} onChange={e => setCsv(e.target.value)} placeholder="AL FAKHER;GRAPE MINT;Виноград с мятой;фрукт, холод;лёгкая;да" />
      {msg && <p className="small" style={{ marginTop: 10, color: 'var(--success-text)' }}>{msg}</p>}
    </Modal>
  )
}
