import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, Menu, Search } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { Modal, SearchBox } from './UI.jsx'
import { isActiveOrder } from '../services/orderWorkflow.js'

const pageNames = {
  '/': 'Dashboard',
  '/customers': 'Customers',
  '/measurements': 'Measurements',
  '/orders': 'Orders',
  '/payments': 'Payments',
  '/staff': 'Staff',
  '/inventory': 'Inventory',
  '/settings': 'Settings',
}

export default function Header({ onMenu }) {
  const { settings, customers, orders, inventory } = useAppData()
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const title = pageNames[location.pathname] || (location.pathname.startsWith('/orders/') ? 'Order details' : 'Studio')
  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []
    return [
      ...customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(term)).map((customer) => ({ id: customer.id, title: customer.name, detail: 'Customer profile', to: '/customers' })),
      ...orders.filter((order) => `${order.id} ${order.customer} ${order.garment}`.toLowerCase().includes(term)).map((order) => ({ id: order.id, title: order.id, detail: `${order.customer} · ${order.garment}`, to: `/orders/${order.id}` })),
    ].slice(0, 7)
  }, [customers, orders, query])
  const lowStock = settings.lowStockAlerts ? inventory.filter((item) => Number(item.quantity) <= Number(item.reorderAt)) : []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)
  const upcomingOrders = settings.reminders ? orders.filter((order) => {
    const due = new Date(`${order.dueDate}T00:00:00`)
    return isActiveOrder(order) && due >= today && due <= nextWeek
  }) : []

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const closeSearch = () => { setSearchOpen(false); setQuery('') }

  return <>
    <header className="topbar">
      <button className="mobile-menu" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button>
      <div className="topbar-crumb">Studio <span>/</span> <strong>{title}</strong></div>
      <div className="topbar-actions">
        <button className="header-search" aria-label="Search your studio" onClick={() => setSearchOpen(true)}><Search size={17} /><span>Search anything</span><kbd>⌘ K</kbd></button>
        <button className="notification-button" aria-label="Studio updates" onClick={() => setNotificationsOpen(true)}><Bell size={18} />{(lowStock.length || upcomingOrders.length) > 0 && <i />}</button>
        <div className="header-divider" />
        <button className="header-business" onClick={() => navigate('/settings')} aria-label="Open business settings"><span className="business-avatar">{settings.businessName?.[0] || 'A'}</span><span>{settings.businessName || 'Atelier TailorPro'}</span><ChevronDown size={14} /></button>
      </div>
    </header>
    {searchOpen && <Modal title="Search your studio" description="Find a customer or jump straight to an order." onClose={closeSearch}><div className="form-stack"><SearchBox value={query} onChange={setQuery} placeholder="Try a name, order number or garment..." />{query.trim() ? results.length ? <div className="search-results">{results.map((result) => <Link key={`${result.to}-${result.id}`} to={result.to} onClick={closeSearch}><span><strong>{result.title}</strong><small>{result.detail}</small></span><span>↗</span></Link>)}</div> : <p className="form-hint">No matching customers or orders.</p> : <p className="form-hint">Your search stays within this workspace.</p>}</div></Modal>}
    {notificationsOpen && <Modal title="Studio updates" description="A quick look at what needs your attention." onClose={() => setNotificationsOpen(false)}><div className="notification-list">{lowStock.length > 0 && <Link to="/inventory" onClick={() => setNotificationsOpen(false)}><span className="notification-mark">!</span><span><strong>{lowStock.length} stock item{lowStock.length > 1 ? 's' : ''} below reorder level</strong><small>{lowStock.map((item) => item.name).join(' · ')}</small></span></Link>}{upcomingOrders.length > 0 && <Link to="/orders" onClick={() => setNotificationsOpen(false)}><span className="notification-mark">✳</span><span><strong>{upcomingOrders.length} delivery{upcomingOrders.length > 1 ? ' dates' : ' date'} coming up this week</strong><small>{upcomingOrders.map((order) => `${order.id} · ${order.customer}`).join(' · ')}</small></span></Link>}{!lowStock.length && !upcomingOrders.length && <p className="form-hint">You’re all caught up.</p>}</div><div className="modal-actions"><button className="button button-secondary" onClick={() => setNotificationsOpen(false)}>Close</button></div></Modal>}
  </>
}
