import { useState, useRef } from 'react'
import { api } from '../../api'
import { Icon, useToast } from '../../ui'

// Загрузка картинки для мастерской и обложек.
// Проверки из брифа (раздел 10): вес, минимальный размер 256 px, квадрат для аватарок и значков.
// shape: 'circle' — аватарка (показываем круг и безопасную зону), 'badge' — значок
// (превью на тёмном и светлом фоне), 'cover' — обложка курса.
export default function ImageUpload({ value, onChange, shape = 'badge', maxMb = 2, label = 'Картинка', preview }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [warn, setWarn] = useState('')
  const input = useRef(null)

  function dimensions(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
      img.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
      img.src = url
    })
  }

  async function send(file) {
    if (!file) return
    // SVG не принимаем: в нём может быть скрипт, а файл отдаётся с нашего же адреса
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return toast('Нужна картинка: PNG, JPG или WebP', 'error')
    if (file.size > maxMb * 1024 * 1024) return toast(`Картинка больше ${maxMb} МБ — уменьшите её`, 'error')
    const d = await dimensions(file)
    const notes = []
    if (d && Math.min(d.w, d.h) < 256) notes.push(`картинка маленькая (${d.w}×${d.h}) — будет мыльной, лучше от 512×512`)
    if (d && shape !== 'cover' && Math.abs(d.w - d.h) > Math.max(d.w, d.h) * 0.05) notes.push('картинка не квадратная — края обрежутся')
    setWarn(notes.join('; '))
    setBusy(true)
    try {
      const res = await api.admin.upload(file)
      onChange(res.url)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const src = preview || value
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: 14, alignItems: 'stretch' }}>
        {src ? (
          shape === 'circle' ? (
            <div className="img-preview circle" title="Пунктир — безопасная зона: важное держите внутри">
              <img src={src} alt="" />
              <span className="safe-zone" />
            </div>
          ) : shape === 'badge' ? (
            <div className="row" style={{ gap: 6 }}>
              <div className="img-preview badge dark"><img src={src} alt="" /></div>
              <div className="img-preview badge light"><img src={src} alt="" /></div>
            </div>
          ) : (
            <div className="img-preview cover"><img src={src} alt="" /></div>
          )
        ) : null}
        <label className={'dropzone' + (drag ? ' drag' : '')} style={{ flex: 1, padding: '14px 12px' }}
          onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files[0]) }}>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { send(e.target.files[0]); e.target.value = '' }} />
          <Icon.upload size={20} />
          <b>{busy ? 'Загружаем…' : src ? 'Заменить картинку' : 'Загрузить картинку'}</b>
          <span>{shape === 'cover' ? 'PNG или JPG, лучше 512×512 или 16:9' : `Квадрат 512×512, PNG с прозрачным фоном, до ${maxMb} МБ`}</span>
        </label>
      </div>
      {warn && <span className="hint" style={{ color: 'var(--warning-text)' }}>Обратите внимание: {warn}</span>}
      {shape === 'circle' && src && <span className="hint">Аватарка обрезается по кругу. Пунктир — безопасная зона: лицо или предмет держите внутри</span>}
      {shape === 'badge' && src && <span className="hint">Так значок выглядит на тёмной и светлой теме</span>}
    </div>
  )
}
