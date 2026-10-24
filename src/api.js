const base = ''

async function req(path, opts = {}) {
  let res
  try {
    res = await fetch(base + path, {
      credentials: 'include',
      ...opts,
      headers: opts.raw ? (opts.headers || {}) : { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.raw ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined)
    })
  } catch {
    const err = new Error('Нет связи с сервером. Проверьте интернет')
    err.status = 0
    throw err
  }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
  if (!res.ok) {
    const err = new Error(data?.error || (res.status >= 500 ? 'Ошибка на сервере. Попробуйте позже' : 'Ошибка запроса'))
    err.status = res.status
    err.data = data
    // Сессия истекла — возвращаем на экран входа
    if (res.status === 401 && !path.startsWith('/api/auth') && path !== '/api/me') window.dispatchEvent(new Event('aladdin:logout'))
    throw err
  }
  return data
}

const q = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
  return s ? '?' + s : ''
}

export const api = {
  login: (phone, password) => req('/api/auth/login', { method: 'POST', body: { phone, password } }),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  me: () => req('/api/me'),
  patchMe: (body) => req('/api/me', { method: 'PATCH', body }),
  changePassword: (current, next) => req('/api/me/password', { method: 'POST', body: { current, next } }),

  dashboard: () => req('/api/dashboard'),
  notifications: (history) => req('/api/notifications' + (history ? '?history=1' : '')),
  readNotifications: (ids) => req('/api/notifications/read', { method: 'POST', body: ids ? { ids } : {} }),
  deleteNotification: (id) => req(`/api/notifications/${id}`, { method: 'DELETE' }),
  clearNotifications: () => req('/api/notifications', { method: 'DELETE' }),
  rewards: () => req('/api/rewards/pending'),
  ackRewards: (ids) => req('/api/rewards/ack', { method: 'POST', body: { ids } }),

  library: (filter) => req('/api/library' + q({ filter })),
  course: (id) => req(`/api/course/${id}`),
  lesson: (id) => req(`/api/lesson/${id}`),
  completeLesson: (id) => req(`/api/lesson/${id}/complete`, { method: 'POST' }),
  submitTest: (id, answers) => req(`/api/test/${id}/attempt`, { method: 'POST', body: { answers } }),
  videoPosition: (blockId, seconds) => req(`/api/video/${blockId}/position`, { method: 'POST', body: { seconds } }),

  themes: () => req('/api/themes'),
  profile: () => req('/api/profile'),
  ranking: (scope, period) => req('/api/ranking' + q({ scope, period })),
  shop: () => req('/api/shop'),
  buy: (item_id) => req('/api/shop/buy', { method: 'POST', body: { item_id } }),
  orderPrize: (item_id) => req('/api/shop/order', { method: 'POST', body: { item_id } }),
  push: () => req('/api/push'),
  pushSubscribe: (subscription, device, tz) => req('/api/push/subscribe', { method: 'POST', body: { subscription, device, tz } }),
  pushUnsubscribe: (endpoint) => req('/api/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  pushTest: () => req('/api/push/test', { method: 'POST' }),
  pushDiag: (diag) => req('/api/push/diag', { method: 'POST', body: diag }),
  pushPrefs: (body) => req('/api/push/prefs', { method: 'PATCH', body }),
  select: (kind, ref) => req('/api/shop/select', { method: 'POST', body: { kind, ref } }),

  analytics: (params = {}) => req('/api/analytics' + q(params)),
  analyticsExportUrl: (params = {}) => '/api/analytics/export' + q(params),

  flavors: () => req('/api/flavors'),
  flavorBrand: (id) => req(`/api/flavors/brands/${id}`),
  flavorItem: (id) => req(`/api/flavors/item/${id}`),
  flavorSession: (brand) => req('/api/flavors/session' + q({ brand, size: 10 })),
  flavorAnswer: (body) => req('/api/flavors/answer', { method: 'POST', body }),
  flavorFinish: (correct, total) => req('/api/flavors/session/finish', { method: 'POST', body: { correct, total } }),
  search: (text) => req(`/api/search?q=${encodeURIComponent(text)}`),

  admin: {
    overview: () => req('/api/admin/overview'),
    attention: () => req('/api/admin/attention'),
    contact: (body) => req('/api/admin/attention/contact', { method: 'POST', body }),
    audit: () => req('/api/admin/audit'),
    users: (archived) => req('/api/admin/users' + q({ archived: archived ? 1 : '' })),
    user: (id) => req(`/api/admin/users/${id}`),
    createUser: (body) => req('/api/admin/users', { method: 'POST', body }),
    updateUser: (id, body) => req(`/api/admin/users/${id}`, { method: 'PATCH', body }),
    archiveUser: (id) => req(`/api/admin/users/${id}`, { method: 'DELETE' }),
    branches: () => req('/api/admin/branches'),
    createBranch: (body) => req('/api/admin/branches', { method: 'POST', body }),
    updateBranch: (id, body) => req(`/api/admin/branches/${id}`, { method: 'PATCH', body }),
    createCategory: (body) => req('/api/admin/categories', { method: 'POST', body }),
    updateCategory: (id, body) => req(`/api/admin/categories/${id}`, { method: 'PATCH', body }),
    deleteCategory: (id) => req(`/api/admin/categories/${id}`, { method: 'DELETE' }),
    content: () => req('/api/admin/content'),
    createCourse: (body) => req('/api/admin/courses', { method: 'POST', body }),
    updateCourse: (id, body) => req(`/api/admin/courses/${id}`, { method: 'PATCH', body }),
    deleteCourse: (id, force) => req(`/api/admin/courses/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }),
    orderLessons: (id, ids) => req(`/api/admin/courses/${id}/order`, { method: 'PUT', body: { ids } }),
    lesson: (id) => req(`/api/admin/lessons/${id}`),
    createLesson: (body) => req('/api/admin/lessons', { method: 'POST', body }),
    updateLesson: (id, body) => req(`/api/admin/lessons/${id}`, { method: 'PATCH', body }),
    deleteLesson: (id, force) => req(`/api/admin/lessons/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }),
    saveBlocks: (id, blocks) => req(`/api/admin/lessons/${id}/blocks`, { method: 'PUT', body: { blocks } }),
    saveTest: (id, body) => req(`/api/admin/lessons/${id}/test`, { method: 'PUT', body }),
    upload: (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return req('/api/admin/upload', { method: 'POST', body: fd, raw: true })
    },
    reviews: () => req('/api/admin/reviews'),
    verdict: (id, verdict, note) => req(`/api/admin/reviews/${id}`, { method: 'POST', body: { verdict, note } }),
    grant: (body) => req('/api/admin/grant', { method: 'POST', body }),
    revoke: (body) => req('/api/admin/revoke', { method: 'POST', body }),
    achievements: () => req('/api/admin/achievements'),
    createAchievement: (body) => req('/api/admin/achievements', { method: 'POST', body }),
    updateAchievement: (id, body) => req(`/api/admin/achievements/${id}`, { method: 'PATCH', body }),
    deleteAchievement: (id) => req(`/api/admin/achievements/${id}`, { method: 'DELETE' }),
    shopItems: () => req('/api/admin/shop'),
    prizeOrders: () => req('/api/admin/prize-orders'),
    closePrizeOrder: (id, status, note) => req(`/api/admin/prize-orders/${id}`, { method: 'PATCH', body: { status, note } }),
    freeAvatars: () => req('/api/admin/shop/free-avatars'),
    createShopItem: (body) => req('/api/admin/shop', { method: 'POST', body }),
    updateShopItem: (id, body) => req(`/api/admin/shop/${id}`, { method: 'PATCH', body }),
    deleteShopItem: (id) => req(`/api/admin/shop/${id}`, { method: 'DELETE' }),
    flavors: () => req('/api/admin/flavors'),
    createFlavor: (body) => req('/api/admin/flavors', { method: 'POST', body }),
    updateFlavor: (id, body) => req(`/api/admin/flavors/${id}`, { method: 'PATCH', body }),
    deleteFlavor: (id) => req(`/api/admin/flavors/${id}`, { method: 'DELETE' }),
    createFlavorBrand: (body) => req('/api/admin/flavor-brands', { method: 'POST', body }),
    updateFlavorBrand: (id, body) => req(`/api/admin/flavor-brands/${id}`, { method: 'PATCH', body }),
    deleteFlavorBrand: (id) => req(`/api/admin/flavor-brands/${id}`, { method: 'DELETE' }),
    importFlavors: (rows) => req('/api/admin/flavors/import', { method: 'POST', body: { rows } })
  }
}
