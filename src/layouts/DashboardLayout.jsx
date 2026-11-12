import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import Sidebar from '../components/Sidebar.jsx'
import Header from '../components/Header.jsx'

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const year = new Date().getFullYear()
  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-shell">
        <Header onMenu={() => setSidebarOpen(true)} />
        <main className="page-content"><Outlet /></main>
        <footer className="app-footer">
          <span>© {year} TailorPro Studio</span>
          <span className="app-footer-craft">Crafted with care <Sparkles size={12} aria-hidden="true" /></span>
        </footer>
      </div>
    </div>
  )
}
