import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Icon } from '../../ui'
import Overview from './Overview'
import Users from './Users'
import Branches from './Branches'
import Content from './Content'
import LessonEditor from './LessonEditor'
import Reviews from './Reviews'
import Grants from './Grants'
import Workshop from './Workshop'
import AdminFlavors from './AdminFlavors'
import Audit from './Audit'

export default function Admin() {
  const items = [
    { to: '/admin', label: 'Обзор', icon: Icon.grid, end: true },
    { to: '/admin/content', label: 'Контент', icon: Icon.book },
    { to: '/admin/workshop', label: 'Мастерская', icon: Icon.sparkles },
    { to: '/admin/users', label: 'Сотрудники', icon: Icon.users },
    { to: '/admin/branches', label: 'Филиалы', icon: Icon.store },
    { to: '/admin/reviews', label: 'Проверки', icon: Icon.check },
    { to: '/admin/grants', label: 'Выдать награду', icon: Icon.medal },
    { to: '/analytics', label: 'Аналитика', icon: Icon.chart },
    { to: '/admin/flavors', label: 'Вкусы', icon: Icon.target },
    { to: '/admin/audit', label: 'Журнал', icon: Icon.list }
  ]

  return (
    <main className="page wide">
      <nav className="admin-tabs" aria-label="Разделы управления">
        {items.map(i => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => isActive ? 'on' : ''}>
            <i.icon size={16} />{i.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="users" element={<Users />} />
        <Route path="branches" element={<Branches />} />
        <Route path="content" element={<Content />} />
        <Route path="lesson/:id" element={<LessonEditor />} />
        <Route path="workshop" element={<Workshop />} />
        <Route path="awards" element={<Navigate to="/admin/workshop" replace />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="flavors" element={<AdminFlavors />} />
        <Route path="grants" element={<Grants />} />
        <Route path="audit" element={<Audit />} />
        <Route path="*" element={<Navigate to="/admin" />} />
      </Routes>
    </main>
  )
}
