import { api } from './api'

// Состояние push на этом устройстве:
//   unsupported — браузер не умеет (старый или встроенный в приложение)
//   ios-install — iPhone: push работает только у сайта, добавленного на экран «Домой»
//   denied      — человек запретил уведомления в настройках браузера
//   off / on    — можно включить / уже включено
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

export async function pushState() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

const b64 = (s) => {
  const pad = '='.repeat((4 - s.length % 4) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

function deviceName() {
  const ua = navigator.userAgent
  const os = /android/i.test(ua) ? 'Android' : isIOS() ? 'iPhone' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : 'Компьютер'
  const br = /yabrowser/i.test(ua) ? 'Яндекс Браузер' : /edg\//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'браузер'
  return `${os} · ${br}${isStandalone() ? ' (приложение)' : ''}`
}

// Включение: разрешение → подписка в браузере → адрес подписки на сервер
export async function enablePush() {
  const { key } = await api.push()
  if (!key) throw new Error('На сервере push-уведомления выключены')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Уведомления запрещены. Разрешите их в настройках браузера для этого сайта' : 'Разрешение не дано')
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) })
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  return api.pushSubscribe(sub.toJSON(), deviceName(), tz)
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
}
