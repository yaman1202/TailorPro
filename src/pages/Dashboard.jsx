import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, CalendarDays, CirclePlus, Clock3, Scissors, Sparkles } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { formatCurrency } from '../services/formatters.js'
import { getOutstandingBalance, getPaidInPeriod } from '../services/orderAccounting.js'
import { activeOrderStatuses, isActiveOrder } from '../services/orderWorkflow.js'
import { Badge, Card, PageHeading, Trend } from '../components/UI.jsx'

function RevenueChart({ currency, data }) {
  const maxValue = Math.max(0, ...data.map((month) => month.total))
  const scaleMax = maxValue ? Math.ceil(maxValue / 1000) * 1000 : 1000
  const points = data.map((month, index) => `${index * (748 / (data.length - 1))},${140 - (month.total / scaleMax) * 115}`).join(' ')
  const area = `0,140 ${points} 748,140`
  const axis = new Intl.NumberFormat('en-IN', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 0 })
  const axes = [1, 2 / 3, 1 / 3, 0]
  return <div className="chart-wrap"><div className="chart-y-labels">{axes.map((ratio) => <span key={ratio}>{axis.format(scaleMax * ratio)}</span>)}</div><div className="chart-main"><svg viewBox="0 0 748 150" preserveAspectRatio="none" role="img" aria-label="Revenue collected by month over the last twelve months"><defs><linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#c39b55" stopOpacity=".25" /><stop offset="100%" stopColor="#c39b55" stopOpacity="0" /></linearGradient></defs>{[22, 61, 100, 140].map((y) => <line key={y} x1="0" x2="748" y1={y} y2={y} className="chart-grid" />)}<polygon points={area} fill="url(#revenue-fill)" /><polyline points={points} className="chart-line" />{data.map((month, index) => <circle key={month.key} cx={index * (748 / (data.length - 1))} cy={140 - (month.total / scaleMax) * 115} r="3.5" className="chart-dot" />)}</svg><div className="chart-months">{data.map((month) => <span key={month.key}>{month.label}</span>)}</div></div></div>
}

function monthKey(date, offset = 0) {
  const month = new Date(date.getFullYear(), date.getMonth() + offset, 1)
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
}

function percentageChange(current, previous) {
  return previous ? Math.round((current - previous) / previous * 100) : null
}

export default function Dashboard() {
  const { customers, orders, payments, staff, settings } = useAppData()
  const money = (value) => formatCurrency(value, settings.currency)
  const now = new Date()
  const currentMonthKey = monthKey(now)
  const previousMonthKey = monthKey(now, -1)
  const revenueByMonth = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1)
    const key = monthKey(date)
    return {
      key,
      label: date.toLocaleDateString('en-IN', { month: 'short' }),
      total: getPaidInPeriod(payments, key),
    }
  })
  const activeOrders = orders.filter(isActiveOrder)
  const outstanding = getOutstandingBalance(orders, payments)
  const received = getPaidInPeriod(payments, currentMonthKey)
  const previousRevenue = getPaidInPeriod(payments, previousMonthKey)
  const ordersThisMonth = orders.filter((order) => order.createdAt?.startsWith(currentMonthKey)).length
  const previousOrders = orders.filter((order) => order.createdAt?.startsWith(previousMonthKey)).length
  const customersThisMonth = customers.filter((customer) => customer.joined?.startsWith(currentMonthKey)).length
  const previousCustomers = customers.filter((customer) => customer.joined?.startsWith(previousMonthKey)).length
  const orderChange = percentageChange(ordersThisMonth, previousOrders)
  const customerChange = percentageChange(customersThisMonth, previousCustomers)
  const revenueChange = percentageChange(received, previousRevenue)
  const orderCount = (status) => orders.filter((order) => order.status === status).length
  const activeStatuses = activeOrderStatuses
  const statusColors = ['#c49a58', '#54728a', '#7e9c8b', '#d2b37b', '#b4c5bd', '#9c8260']
  const statusTotal = activeStatuses.reduce((sum, status) => sum + orderCount(status), 0)
  let statusProgress = 0
  const statusGradient = statusTotal ? activeStatuses.map((status, index) => {
    const start = statusProgress
    statusProgress += orderCount(status) / statusTotal * 100
    return `${statusColors[index]} ${start}% ${statusProgress}%`
  }).join(', ') : '#efeee9 0% 100%'
  const dateLabel = now.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()

  return <>
    <PageHeading eyebrow={dateLabel} title={`Good morning, ${(settings.owner || 'Yaman Renuka').trim().split(/\s+/)[0]}`} description="Here’s what’s happening at your atelier today." action={<Link className="button button-primary" to="/orders"><CirclePlus size={16} />Create an order</Link>} />
    <div className="stats-grid">
      <Card className="stat-card"><div className="stat-top"><span>Total orders</span><span className="stat-icon gold"><Scissors size={17} /></span></div><strong>{orders.length}</strong><div className="stat-bottom">{orderChange !== null && <Trend direction={orderChange < 0 ? 'down' : 'up'}>{Math.abs(orderChange)}%</Trend>}<span>{orderChange === null ? `${ordersThisMonth} new this month` : 'vs. last month'}</span></div></Card>
      <Card className="stat-card"><div className="stat-top"><span>Total customers</span><span className="stat-icon green"><Sparkles size={17} /></span></div><strong>{customers.length}</strong><div className="stat-bottom">{customerChange !== null && <Trend direction={customerChange < 0 ? 'down' : 'up'}>{Math.abs(customerChange)}%</Trend>}<span>{customerChange === null ? `${customersThisMonth} new this month` : 'vs. last month'}</span></div></Card>
      <Card className="stat-card"><div className="stat-top"><span>Revenue collected</span><span className="stat-icon blue">{settings.currency === 'INR' ? '₹' : settings.currency}</span></div><strong>{money(received)}</strong><div className="stat-bottom">{revenueChange !== null && <Trend direction={revenueChange < 0 ? 'down' : 'up'}>{Math.abs(revenueChange)}%</Trend>}<span>{revenueChange === null ? 'collected this month' : 'vs. last month'}</span></div></Card>
      <Card className="stat-card"><div className="stat-top"><span>Orders in progress</span><span className="stat-icon coral"><Clock3 size={17} /></span></div><strong>{String(activeOrders.length).padStart(2, '0')}</strong><div className="stat-bottom"><span className="stat-neutral">{money(outstanding)}</span><span>order value</span></div></Card>
    </div>
    <div className="dashboard-grid">
      <Card className="revenue-card"><div className="card-heading"><div><div className="eyebrow">YOUR ATELIER AT A GLANCE</div><h2>Revenue overview</h2></div><span className="period-button">Last 12 months <CalendarDays size={14} /></span></div><div className="revenue-total"><strong>{money(received)}</strong>{revenueChange !== null && <Trend direction={revenueChange < 0 ? 'down' : 'up'}>{Math.abs(revenueChange)}%</Trend>}<span>collected this month</span></div><RevenueChart currency={settings.currency} data={revenueByMonth} /></Card>
      <Card className="status-card"><div className="card-heading"><div><div className="eyebrow">LIVE WORKLOAD</div><h2>Order status</h2></div><Link className="text-link" to="/orders">View all <ArrowRight size={14} /></Link></div><div className="status-visual"><div className="status-ring" style={{ background: `conic-gradient(${statusGradient})` }}><div><strong>{activeOrders.length}</strong><span>active orders</span></div></div><div className="status-legend">{activeStatuses.map((status, index) => <div key={status}><span className={`legend-dot legend-${index}`} style={{ background: statusColors[index] }} />{status}<strong>{orderCount(status)}</strong></div>)}</div></div><div className="status-foot"><span>Everything is on track</span><span className="pulse-dot" /></div></Card>
    </div>
    <div className="dashboard-bottom">
      <Card className="recent-card"><div className="card-heading"><div><div className="eyebrow">THE LATEST</div><h2>Recent orders</h2></div><Link className="text-link" to="/orders">All orders <ArrowRight size={14} /></Link></div><div className="table-scroll"><table className="data-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>GARMENT</th><th>DUE DATE</th><th>STATUS</th><th>AMOUNT</th></tr></thead><tbody>{orders.slice(0, 5).map((order) => <tr key={order.id}><td><Link className="order-link" to={`/orders/${order.id}`}>{order.id}</Link></td><td><span className="customer-cell"><span className="mini-avatar">{order.customer.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>{order.customer}</span></td><td>{order.garment}</td><td>{new Date(`${order.dueDate}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td><td><Badge>{order.status}</Badge></td><td className="amount-cell">{money(order.amount)}</td></tr>)}</tbody></table></div></Card>
      <Card className="welcome-card"><div className="welcome-decoration"><span /><span /><span /></div><div className="eyebrow">A LITTLE INSPIRATION</div><h2>Every stitch tells a story.</h2><p>Your craft deserves a studio that works as beautifully as you do.</p><Link to="/measurements" className="welcome-link">Explore measurements <ArrowUpRight size={15} /></Link><div className="welcome-signature">✳ &nbsp; ATELIER NOTES</div></Card>
    </div>
    <div className="dashboard-meta"><span><span className="online-dot" />Studio is open</span><span>{staff.length} team members on your roster</span></div>
  </>
}
