import { useEffect, useState, createContext, useContext, useCallback, useRef } from 'react'
import { Routes, Route, NavLink, useLocation, Navigate, Link } from 'react-router-dom'
import { api } from './api'
import { Icon, Avatar, PageSkeleton, RewardWindow } from './ui'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import Library from './screens/Library'
import Course from './screens/Course'
import Lesson from './screens/Lesson'
import Profile from './screens/Profile'
import Ranking from './screens/Ranking'
import Shop from './screens/Shop'
import Themes from './screens/Themes'
import Search from './screens/Search'
import Onboarding from './screens/Onboarding'
import Settings from './screens/Settings'
import Notifications from './screens/Notifications'
import Flavors from './screens/Flavors'
import FlavorSession from './screens/FlavorSession'
import FlavorBrand from './screens/FlavorBrand'
import Analytics from './screens/Analytics'
import Admin from './screens/admin/Admin'
import { THEMES } from './theme'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export default function App() {
  const [user, setUser] = useState(undefined)
  const [branch, setBranch] = useState(null)
  const [rewards, setRewards] = useState([])
  const location = useLocation()
  const checking = useRef(false)

  const load = useCallback(async () => {
    try {
      const res = await api.me()
      setUser(res.user)
      setBranch(res.branch)
      return res.user
    } catch {
      setUser(null)
      return null
    }
  }, [])

  // Одна точка показа наград (спецификация 5.13): после любого действия экран
  // зовёт checkRewards(), и всё, что сотрудник ещё не видел, показывается по очереди.
  const checkRewards = useCallback(async () => {
    if (checking.current) return
    checking.current = true
    try {
      const res = await api.rewards()
      if (res.items.length) setRewards(res.items)
    } catch {} finally { checking.current = false }
  }, [])

  const refresh = useCallback(async () => { await load(); await checkRewards() }, [load, checkRewards])

  useEffect(() => { load().then(u => { if (u) checkRewards() }) }, [load, checkRewards])

  useEffect(() => {
    const out = () => setUser(null)
    window.addEventListener('aladdin:logout', out)
    return () => window.removeEventListener('aladdin:logout', out)
  }, [])

  // Тема — атрибут на <html>. Никаких цветов в компонентах.
  useEffect(() => {
    const theme = user?.theme || 'dark'
    document.documentElement.dataset.theme = theme
    const t = THEMES.find(x => x.slug === theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta && t) meta.content = t['bg-base']
  }, [user?.theme])

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', !!user?.reduce_motion)
  }, [user?.reduce_motion])

  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])

  async function closeRewards() {
    const ids = rewards.map(r => r.id)
    setRewards([])
    try { await api.ackRewards(ids) } catch {}
    load()
  }

  if (user === undefined) {
    return <div className="boot"><div className="boot-mark"><img src="/assets/svg/ava_01_ugolek.svg" alt="" /></div></div>
  }
  if (user === null) return <Login onLogin={() => refresh()} />
  if (!user.onboarding_done && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  if (location.pathname === '/onboarding') {
    return (
      <Ctx.Provider value={{ user, setUser, reload: load, refresh, checkRewards, branch }}>
        <Onboarding />
      </Ctx.Provider>
    )
  }

  const focus = location.pathname.startsWith('/lesson/') || location.pathname === '/flavors/session'
  const staff = user.role !== 'employee'

  return (
    <Ctx.Provider value={{ user, setUser, reload: load, refresh, checkRewards, branch }}>
      <div className={'shell' + (focus ? ' focus' : '')}>
        <Sidebar />
        <div className="shell-main">
          {!focus && <TopBar />}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/course/:id" element={<Course />} />
            <Route path="/lesson/:id" element={<Lesson />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/themes" element={<Themes />} />
            <Route path="/search" element={<Search />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/flavors" element={<Flavors />} />
            <Route path="/flavors/session" element={<FlavorSession />} />
            <Route path="/flavors/brand/:id" element={<FlavorBrand />} />
            <Route path="/analytics" element={staff ? <Analytics /> : <Navigate to="/" />} />
            <Route path="/admin/*" element={staff ? <Admin /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
        {!focus && <TabBar />}
        {rewards.length > 0 && (
          <RewardWindow items={rewards} onClose={closeRewards} sound={user.sound} reduceMotion={user.reduce_motion} />
        )}
      </div>
    </Ctx.Provider>
  )
}

function navItems(user) {
  const staff = user.role !== 'employee'
  const main = [
    { to: '/', label: 'Главная', icon: Icon.home, end: true },
    { to: '/library', label: 'Обучение', icon: Icon.book },
    { to: '/flavors', label: 'Вкусы', icon: Icon.target },
    { to: '/ranking', label: 'Рейтинг', icon: Icon.trophy },
    { to: '/shop', label: 'Магазин', icon: Icon.bag },
    { to: '/profile', label: 'Профиль', icon: Icon.user }
  ]
  const manage = staff ? [
    { to: '/admin', label: 'Управление', icon: Icon.grid, end: true },
    { to: '/admin/content', label: 'Контент', icon: Icon.book },
    { to: '/admin/workshop', label: 'Мастерская', icon: Icon.sparkles },
    { to: '/admin/users', label: 'Сотрудники', icon: Icon.users },
    { to: '/admin/reviews', label: 'Проверки', icon: Icon.check },
    { to: '/analytics', label: 'Аналитика', icon: Icon.chart }
  ] : []
  return { main, manage }
}

function Sidebar() {
  const { user, branch } = useApp()
  const { main, manage } = navItems(user)
  return (
    <aside className="sidebar" aria-label="Меню">
      <Link to="/" className="brand">
        <span className="brand-mark"><img src="/assets/svg/ava_01_ugolek.svg" alt="" /></span>
        <span>
          <b>Аладдин</b>
          <small>обучение</small>
        </span>
      </Link>
      <nav className="side-nav">
        {main.map(i => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => isActive ? 'on' : ''}>
            <i.icon size={19} />{i.label}
          </NavLink>
        ))}
        {manage.length > 0 && <div className="side-label">Управление</div>}
        {manage.map(i => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => isActive ? 'on' : ''}>
            <i.icon size={19} />{i.label}
          </NavLink>
        ))}
      </nav>
      <Link to="/profile" className="side-user">
        <Avatar id={user.avatar_id} size={38} />
        <span style={{ minWidth: 0 }}>
          <b>{user.name}</b>
          <small>{user.status || branch?.name || (user.role === 'admin' ? 'Администратор' : '')}</small>
        </span>
      </Link>
      <div className="side-stats">
        <span title="Уровень"><Icon.star size={15} />{user.level} ур.</span>
        <span title="COIL" className="reward"><Icon.coin size={15} />{user.coil.toLocaleString('ru')}</span>
        <span title="Серия дней" className="reward"><Icon.flame size={15} />{user.streak}</span>
      </div>
    </aside>
  )
}

function TopBar() {
  const { user } = useApp()
  const location = useLocation()
  return (
    <header className="topbar">
      <Link to="/" className="topbar-brand" aria-label="На главную">
        <span className="brand-mark sm"><img src="/assets/svg/ava_01_ugolek.svg" alt="" /></span>
        <b>Аладдин</b>
      </Link>
      <div className="topbar-right">
        <Link to="/search" className={'icon-btn' + (location.pathname === '/search' ? ' on' : '')} aria-label="Поиск">
          <Icon.search size={20} />
        </Link>
        <Link to="/shop" className="coil-chip" aria-label={`${user.coil} COIL`}>
          <Icon.coin size={16} />{user.coil.toLocaleString('ru')}
        </Link>
        <Link to="/notifications" className={'icon-btn' + (location.pathname === '/notifications' ? ' on' : '')} aria-label={`Уведомления${user.unread ? `, новых: ${user.unread}` : ''}`}>
          <Icon.bell size={20} />
          {user.unread > 0 && <span className="dot">{user.unread > 9 ? '9+' : user.unread}</span>}
        </Link>
        <Link to="/profile" className="topbar-avatar" aria-label="Профиль">
          <Avatar id={user.avatar_id} size={32} />
        </Link>
      </div>
    </header>
  )
}

function TabBar() {
  const { user } = useApp()
  const staff = user.role !== 'employee'
  const tabs = [
    { to: '/', label: 'Главная', icon: Icon.home, end: true },
    { to: '/library', label: 'Обучение', icon: Icon.book },
    staff
      ? { to: '/admin', label: 'Админка', icon: Icon.grid }
      : { to: '/ranking', label: 'Рейтинг', icon: Icon.trophy },
    { to: '/shop', label: 'Магазин', icon: Icon.bag },
    { to: '/profile', label: 'Профиль', icon: Icon.user }
  ]
  // Индекс активного раздела двигает подсветку — она плавно переезжает между вкладками
  const { pathname } = useLocation()
  const active = tabs.findIndex(t => t.end ? pathname === t.to : pathname.startsWith(t.to))
  return (
    <nav className="tabbar" aria-label="Основная навигация">
      <div className="tabbar-inner" style={{ '--i': Math.max(active, 0), '--n': tabs.length }} data-active={active >= 0 ? '' : undefined}>
        <span className="tab-indicator" aria-hidden="true" />
        {tabs.map((t, i) => (
          <NavLink key={t.to} to={t.to} end={t.end}
            className={({ isActive }) => 'tab' + (isActive ? ' active' : '') + (i === 2 ? ' center' : '')}>
            <span className="tab-icon"><t.icon size={22} /></span>
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
