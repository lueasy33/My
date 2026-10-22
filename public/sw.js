// Service Worker «Аладдин».
// Задача — не «офлайн-сайт», а конкретный сценарий: продавец в ТЦ теряет сеть,
// уже открытый урок должен читаться, а сайт — открываться.
//
// Стратегии:
//   навигация   → сеть, при провале — оболочка из кэша
//   /assets/    → cache-first (картинки и сборка, имена файлов уникальны)
//   GET /api    → сеть, при обрыве — последний снимок
//   POST и т.п. → только сеть. Действия НЕ откладываются: покупка или ответ теста,
//                 отправленные «потом», путают человека и могут списать COIL дважды.
//   /uploads/   → только сеть (видео отдаётся частями, кэшировать его нельзя)

const VERSION = 'v3'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`
const API = `api-${VERSION}`

const SHELL_FILES = ['/', '/manifest.webmanifest', '/assets/svg/ava_01_ugolek.svg']

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL)
    await Promise.allSettled(SHELL_FILES.map(f => c.add(f)))
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => !k.endsWith(VERSION)).map(k => caches.delete(k)))
    self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Вход и выход: снимки данных прошлого пользователя удаляем —
  // компьютер в магазине общий, чужой профиль не должен открыться без сети.
  if (url.pathname === '/api/auth/logout' || url.pathname === '/api/auth/login') {
    event.waitUntil(caches.delete(API))
    return
  }
  if (req.method !== 'GET' || url.pathname.startsWith('/uploads/')) return

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(req) } catch {
        const c = await caches.open(SHELL)
        return (await c.match('/')) || Response.error()
      }
    })())
    return
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res.ok) (await caches.open(API)).put(req, res.clone())
        return res
      } catch {
        const hit = await (await caches.open(API)).match(req)
        if (hit) return hit
        return new Response(JSON.stringify({ offline: true, error: 'Нет сети' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } })
      }
    })())
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const c = await caches.open(ASSETS)
      const hit = await c.match(req)
      if (hit) return hit
      try {
        const res = await fetch(req)
        if (res.status === 200) c.put(req, res.clone())
        return res
      } catch {
        const fallback = /\.(webp|png|svg|jpe?g)$/.test(url.pathname) && await (await caches.open(SHELL)).match('/assets/svg/ava_01_ugolek.svg')
        return fallback || new Response('', { status: 504 })
      }
    })())
  }
})

// ─── Push (на будущее: сервер пока не рассылает) ────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Аладдин', body: 'Новое уведомление', url: '/' }
  try { if (event.data) data = { ...data, ...event.data.json() } } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/assets/png-512/ava_01_ugolek.png',
    badge: '/assets/png-256/ava_01_ugolek.png',
    data: { url: data.url }
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.includes(self.location.origin)) { c.navigate(target); return c.focus() }
    }
    return self.clients.openWindow(target)
  })())
})
