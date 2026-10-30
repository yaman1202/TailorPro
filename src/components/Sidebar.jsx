import { NavLink } from 'react-router-dom'
import { Scissors, LayoutDashboard, Users, Ruler, ClipboardList, CreditCard, UserRoundCog, Layers3, Settings, ChevronRight, PanelLeftClose } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'

const sections = [
  { title: 'Workspace', links: [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    { label: 'Orders', to: '/orders', icon: ClipboardList },
    { label: 'Customers', to: '/customers', icon: Users },
    { label: 'Measurements', to: '/measurements', icon: Ruler },
  ] },
  { title: 'Business', links: [
    { label: 'Payments', to: '/payments', icon: CreditCard },
    { label: 'Staff', to: '/staff', icon: UserRoundCog },
    { label: 'Inventory', to: '/inventory', icon: Layers3 },
  ] },
]

export default function Sidebar({ open, onClose }) {
  const { settings, orders } = useAppData()
  const initials = (settings.owner || 'Yaman Renuka').split(' ').map((word) => word[0]).slice(0, 2).join('').toUpperCase()
  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-row"><div className="brand-mark"><Scissors size={19} strokeWidth={1.8} /></div><div className="brand-name">tailor<span>pro</span><small>ATELIER MANAGEMENT</small></div><button className="sidebar-close" onClick={onClose} aria-label="Close sidebar"><PanelLeftClose size={18} /></button></div>
        <div className="workspace-switch"><span className="workspace-avatar">{(settings.businessName || 'Atelier TailorPro')[0]}</span><div><strong>{settings.businessName || 'Atelier TailorPro'}</strong><small>Professional plan</small></div><ChevronRight size={15} /></div>
        <nav className="side-nav">
          {sections.map((section) => <div className="nav-section" key={section.title}><div className="nav-label">{section.title}</div>{section.links.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} onClick={onClose} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{to === '/orders' && <small>{String(orders.length).padStart(2, '0')}</small>}</NavLink>)}</div>)}
        </nav>
        <div className="sidebar-bottom"><NavLink to="/settings" onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Settings size={17} /><span>Settings</span></NavLink><div className="profile-card"><div className="profile-avatar">{initials}</div><div><strong>{settings.owner || 'Yaman Renuka'}</strong><small>Studio owner</small></div><NavLink to="/settings" aria-label="Profile settings">···</NavLink></div><div className="sidebar-footnote">MADE FOR THE ART OF FIT</div></div>
      </aside>
    </>
  )
}
