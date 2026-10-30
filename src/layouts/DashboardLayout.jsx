import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import Header from '../components/Header.jsx'

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const year = new Date().getFullYear()
  return <div className="app-shell"><Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} /><div className="main-shell"><Header onMenu={() => setSidebarOpen(true)} /><main className="page-content"><Outlet /></main><footer className="app-footer"><span>© {year} TailorPro Studio</span><span>Crafted with care <b>✳</b></span></footer></div></div>
}
