import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Icon } from '../ui'

// Тур обязателен при первом входе (спецификация 5.10): пропустить нельзя,
// но можно пройти быстро. Тон — как у «Аладдина» в соцсетях: на «ты», коротко.
const STEPS = [
  { icon: Icon.sparkles, title: 'Привет! Это твоё обучение', text: 'Здесь ты прокачиваешь знания по кальянам, табаку, вейпам и сервису. Учишься — получаешь опыт, валюту и награды.' },
  { icon: Icon.book, title: 'Где уроки', text: 'Раздел «Обучение». Сверху всегда то, что обязательно и срочно. Начни с курса «Основы кальяна».' },
  { icon: Icon.play, title: 'Как проходит урок', text: 'Читаешь текст, смотришь фото и видео. Видео запоминает, где ты остановился. Можно учиться урывками — прогресс сохраняется.' },
  { icon: Icon.target, title: 'Тест в конце', text: 'Урок закрывается тестом. Проходной балл — 70%, есть три попытки. После теста увидишь разбор ошибок.' },
  { icon: Icon.bolt, title: 'XP и COIL', text: 'XP — опыт, он повышает уровень. COIL — внутренняя валюта. Их дают за уроки, тесты, курсы и заходы каждый день.' },
  { icon: Icon.bag, title: 'Магазин', text: 'COIL тратишь в магазине на аватарки, статусы и темы. Самые редкие вещи не купить — только заслужить.' },
  { icon: Icon.medal, title: 'Профиль и достижения', text: 'В профиле — твой уровень, витрина достижений и история COIL. Там же можно сменить аватарку и статус.' },
  { icon: Icon.trophy, title: 'Рейтинг', text: 'Смотри своё место в компании и в филиале. Филиалы соревнуются по среднему опыту на человека — честно для маленьких точек.' },
  { icon: Icon.palette, title: 'Темы оформления', text: 'С каждым уровнем открываются новые темы — первая уже на втором. Тур можно пройти заново в настройках. Погнали!' }
]

export default function Onboarding() {
  const { setUser } = useApp()
  const [step, setStep] = useState(0)
  const nav = useNavigate()
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  useEffect(() => {
    const h = e => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') last ? finish() : setStep(i => i + 1)
      if (e.key === 'ArrowLeft') setStep(i => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  async function finish() {
    try {
      const res = await api.patchMe({ onboarding_done: true })
      setUser(res.user)
    } catch {
      setUser(u => ({ ...u, onboarding_done: true }))
    }
    nav('/', { replace: true })
  }

  return (
    <div className="login">
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <span className="small muted bold">Шаг {step + 1} из {STEPS.length}</span>
          <span className="row" style={{ gap: 5 }}>
            {STEPS.map((_, i) => (
              <span key={i} style={{
                width: i === step ? 20 : 7, height: 7, borderRadius: 999,
                background: i <= step ? 'var(--brand-500)' : 'var(--border)',
                transition: 'width .25s var(--ease-out), background .25s'
              }} />
            ))}
          </span>
        </div>

        <div className="login-card" key={step} style={{ maxWidth: 'none', animation: 'popIn 380ms var(--ease-spring)' }}>
          <div className="brand-mark" style={{ width: 72, height: 72, borderRadius: 22, margin: '0 0 20px', color: 'var(--text-on-brand)' }}>
            <s.icon size={36} />
          </div>
          <h2 style={{ fontSize: 24, marginBottom: 10 }}>{s.title}</h2>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.65 }}>{s.text}</p>
        </div>

        <div className="row" style={{ gap: 10, marginTop: 18 }}>
          {step > 0 && (
            <button className="btn ghost" onClick={() => setStep(i => i - 1)} aria-label="Назад"><Icon.chevL size={18} /></button>
          )}
          <button className="btn" style={{ flex: 1 }} onClick={() => last ? finish() : setStep(i => i + 1)}>
            {last ? 'Начать обучение' : 'Далее'} <Icon.arrowR size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
