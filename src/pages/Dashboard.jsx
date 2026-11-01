import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, CirclePlus, Clock3, Scissors, Sparkles } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { formatCurrency } from '../services/formatters.js'
import { getPaidInPeriod } from '../services/orderAccounting.js'
import { activeOrderStatuses, isActiveOrder } from '../services/orderWorkflow.js'
import { Badge, Card, Modal, PageHeading, Trend } from '../components/UI.jsx'
import AnimatedNumber from '../components/AnimatedNumber.jsx'

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function MonthCalendar({ year, month, orders }) {
  const firstDay = new Date(year, month, 1)
  const offset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = dateKey(new Date())
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1
    if (day < 1 || day > daysInMonth) return null
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return { day, key, orders: orders.filter((order) => order.dueDate === key) }
  })

  return <section className="calendar-month" aria-label={firstDay.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}>
    <h3>{firstDay.toLocaleDateString('en-IN', { month: 'long' })}</h3>
    <div className="calendar-weekdays">{weekDays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
    <div className="calendar-days">
      {cells.map((cell, index) => cell
        ? <div className={`calendar-day ${cell.orders.length ? 'calendar-day-has-orders' : ''} ${cell.key === today ? 'calendar-day-today' : ''}`} key={cell.key}>
          <span className="calendar-day-number">{cell.day}</span>
          {cell.orders.map((order) => <Link className="calendar-order" key={order.id} to={`/orders/${order.id}`} title={`${order.id} · ${order.customer} · ${order.garment} · ${order.status}`}>
            <span>{order.id}</span><small>{order.customer}</small>
          </Link>)}
        </div>
        : <div className="calendar-day calendar-day-empty" key={`empty-${year}-${month}-${index}`} aria-hidden="true" />)}
    </div>
  </section>
}

function YearCalendar({ year, orders, onYearChange }) {
  const months = Array.from({ length: 12 }, (_, month) => month)
  return <div className="year-calendar">
    <div className="year-calendar-toolbar">
      <button type="button" className="calendar-year-button" onClick={() => onYearChange(year - 1)} aria-label="Show previous year"><ArrowLeft size={16} />Previous year</button>
      <strong>{year}</strong>
      <button type="button" className="calendar-year-button" onClick={() => onYearChange(year + 1)} aria-label="Show next year">Next year<ArrowRight size={16} /></button>
    </div>
    <p className="year-calendar-note">Orders are shown on their delivery dates. Select an order to open its details.</p>
    <div className="year-calendar-grid">{months.map((month) => <MonthCalendar key={`${year}-${month}`} year={year} month={month} orders={orders} />)}</div>
  </div>
}

function RevenueChart({ currency, data, money }) {
  const maxValue = Math.max(0, ...data.map((month) => month.total))
  const scaleMax = maxValue ? Math.ceil(maxValue / 1000) * 1000 : 1000
  const points = data.map((month, index) => `${index * (748 / (data.length - 1))},${140 - (month.total / scaleMax) * 115}`).join(' ')
  const area = `0,140 ${points} 748,140`
  const axis = new Intl.NumberFormat('en-IN', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 0 })
  const axes = [1, 2 / 3, 1 / 3, 0]
  const activeIndex = data.reduce((latest, month, index) => month.total > 0 ? index : latest, -1)
  const activeMonth = activeIndex >= 0 ? data[activeIndex] : null
  const activeX = activeIndex * (748 / (data.length - 1))
  const activeY = activeMonth ? 140 - (activeMonth.total / scaleMax) * 115 : 0
  return <div className="chart-wrap"><div className="chart-y-labels">{axes.map((ratio) => <span key={ratio}>{axis.format(scaleMax * ratio)}</span>)}</div><div className="chart-main"><svg viewBox="0 0 748 150" preserveAspectRatio="none" role="img" aria-label="Revenue collected from January to December"><defs><linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#c39b55" stopOpacity=".25" /><stop offset="100%" stopColor="#c39b55" stopOpacity="0" /></linearGradient></defs>{[22, 61, 100, 140].map((y) => <line key={y} x1="0" x2="748" y1={y} y2={y} className="chart-grid" />)}<polygon points={area} fill="url(#revenue-fill)" /><polyline points={points} className="chart-line" />{data.map((month, index) => <circle key={month.key} cx={index * (748 / (data.length - 1))} cy={140 - (month.total / scaleMax) * 115} r={index === activeIndex ? '5' : '3.5'} className={`chart-dot ${index === activeIndex ? 'chart-dot-active' : ''}`}><title>{`${month.label}: ${money(month.total)}`}</title></circle>)}</svg>{activeMonth && <div className={`chart-tooltip ${activeIndex > 8 ? 'chart-tooltip-right' : ''}`} style={{ left: `${activeX / 748 * 100}%`, top: `${activeY / 150 * 100}%` }}><strong><AnimatedNumber value={activeMonth.total} currency={currency} style="currency" /></strong><span>{activeMonth.label}</span></div>}<div className="chart-months">{data.map((month) => <span key={month.key}>{month.label}</span>)}</div></div></div>
}

function monthKey(date) {
  const month = new Date(date.getFullYear(), date.getMonth(), 1)
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function MiniSparkline({ values }) {
  const max = Math.max(1, ...values)
  const points = values.map((value, index) => `${index * (100 / (values.length - 1))},${26 - value / max * 22}`).join(' ')
  return <svg className="revenue-sparkline" viewBox="0 0 100 30" role="img" aria-label="Revenue trend over the last seven days"><polyline points={points} /></svg>
}

export default function Dashboard() {
  const { customers, measurements, orders, payments, staff, settings } = useAppData()
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
  const [calendarOpen, setCalendarOpen] = useState(false)
  const money = (value) => formatCurrency(value, settings.currency)
  const now = new Date()
  const todayKey = dateKey(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = dateKey(yesterday)
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - 6)
  const isThisWeek = (date) => {
    if (!date) return false
    const value = new Date(`${date}T00:00:00`)
    return value >= weekStart && value <= now
  }
  const isDemo = !orders.length && !customers.length && !payments.length && !measurements.length
  const demoRevenueByMonth = [6500, 8200, 7200, 9800, 11100, 9000, 13500, 12400, 14800, 13200, 16000, 12500]
  const revenueByMonth = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), index, 1)
    const key = monthKey(date)
    return {
      key,
      label: date.toLocaleDateString('en-IN', { month: 'short' }),
      total: isDemo ? demoRevenueByMonth[index] : getPaidInPeriod(payments, key),
    }
  })
  const activeOrders = orders.filter(isActiveOrder)
  const clientsThisWeek = customers.filter((customer) => isThisWeek(customer.joined)).length
  const measurementsThisWeek = measurements.filter((measurement) => isThisWeek(measurement.date)).length
  const receivedToday = payments.filter((payment) => payment.date === todayKey).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const receivedYesterday = payments.filter((payment) => payment.date === yesterdayKey).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const dailyRevenue = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setDate(date.getDate() - (6 - index))
    const key = dateKey(date)
    return payments.filter((payment) => payment.date === key).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  })
  const finishedOrders = orders.filter((order) => order.status === 'Ready').length
  const averageOrderValue = orders.length ? orders.reduce((sum, order) => sum + Number(order.amount || 0), 0) / orders.length : 0
  const orderCount = (status) => orders.filter((order) => order.status === status).length
  const activeStatuses = activeOrderStatuses
  const statusColors = ['#3b82f6', '#ef4444', '#f4c542', '#10b981', '#8b5cf6', '#f97316']
  const demoStatusCounts = { New: 2, Confirmed: 2, Assigned: 1, Stitching: 2, 'Quality Check': 1, Ready: 0 }
  const statusCount = (status) => isDemo ? demoStatusCounts[status] || 0 : orderCount(status)
  const statusTotal = activeStatuses.reduce((sum, status) => sum + statusCount(status), 0)
  let statusProgress = 0
  const statusGradient = statusTotal ? activeStatuses.map((status, index) => {
    const start = statusProgress
    statusProgress += statusCount(status) / statusTotal * 100
    return `${statusColors[index]} ${start}% ${statusProgress}%`
  }).join(', ') : '#efeee9 0% 100%'
  const productionOrders = orders.filter((order) => ['Stitching', 'Quality Check', 'Ready'].includes(order.status)).length
  const productionProgress = isDemo ? 75 : activeOrders.length ? Math.round(productionOrders / activeOrders.length * 100) : 0
  const newClients = isDemo ? 4 : clientsThisWeek
  const newMeasurements = isDemo ? 15 : measurementsThisWeek
  const activeOrdersCount = isDemo ? 3 : activeOrders.length
  const todayRevenue = isDemo ? 12500 : receivedToday
  const revenueTrend = isDemo ? 12 : receivedYesterday ? Math.round((receivedToday - receivedYesterday) / receivedYesterday * 100) : null
  const sparklineValues = isDemo ? [4200, 6100, 5600, 8800, 7200, 10400, 12500] : dailyRevenue
  const readyOrderCount = isDemo ? 2 : finishedOrders
  const averageValue = isDemo ? 3500 : averageOrderValue
  const dateLabel = now.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()

  return <>
    <PageHeading eyebrow={dateLabel} title={`Good morning, ${(settings.owner || 'Yaman Renuka').trim().split(/\s+/)[0]}`} description="Here’s what’s happening at your atelier today." action={<Link className="button button-primary dashboard-create-order" to="/orders"><CirclePlus size={18} />Create an order</Link>} />
    {isDemo && <div className="dashboard-demo-note">Illustrative demo data · Add workspace activity to see your live figures.</div>}
    <div className="stats-grid">
      <Link className="dashboard-stat-link" to="/orders?filter=active" aria-label="View active orders"><Card className="stat-card"><div className="stat-top"><span>Active orders</span><span className="stat-icon gold"><Scissors size={17} /></span></div><strong><AnimatedNumber value={activeOrdersCount} /></strong><div className="stat-progress"><div><span><AnimatedNumber value={productionProgress} suffix="% production progress" /></span></div><i><span style={{ width: `${productionProgress}%` }} /></i></div></Card></Link>
      <Link className="dashboard-stat-link" to="/customers?filter=new" aria-label="View new clients this week"><Card className="stat-card"><div className="stat-top"><span>New clients (This Week)</span><span className="stat-icon green"><Sparkles size={17} /></span></div><strong><AnimatedNumber value={newClients} /></strong><div className="stat-bottom"><span><AnimatedNumber value={newMeasurements} suffix=" new measurements taken" /></span></div></Card></Link>
      <Link className="dashboard-stat-link" to="/payments" aria-label="View payment history"><Card className="stat-card stat-card-revenue"><div className="stat-top"><span>Today’s revenue</span><span className="stat-icon blue">{settings.currency === 'INR' ? '₹' : settings.currency}</span></div><strong><AnimatedNumber value={todayRevenue} currency={settings.currency} style="currency" /></strong><div className="stat-bottom">{revenueTrend !== null && <Trend direction={revenueTrend < 0 ? 'down' : 'up'}><AnimatedNumber value={Math.abs(revenueTrend)} suffix="%" /></Trend>}<span>{revenueTrend === null ? 'received today' : 'vs. yesterday'}</span><MiniSparkline values={sparklineValues} /></div></Card></Link>
      <Link className="dashboard-stat-link" to="/orders?status=Ready" aria-label="View finished orders ready for pickup"><Card className="stat-card"><div className="stat-top"><span>Finished orders (Ready for pickup)</span><span className="stat-icon coral"><Clock3 size={17} /></span></div><strong><AnimatedNumber value={readyOrderCount} /></strong><div className="stat-bottom"><span>Average order value <AnimatedNumber value={averageValue} currency={settings.currency} style="currency" /></span></div></Card></Link>
    </div>
    <div className="dashboard-grid">
      <Card className="revenue-card"><div className="card-heading"><div><div className="eyebrow">YOUR ATELIER AT A GLANCE</div><h2>Revenue overview</h2></div><button type="button" className="period-button" onClick={() => setCalendarOpen(true)} aria-label={`Open order calendar for ${now.getFullYear()}`}>Jan–Dec {now.getFullYear()} <CalendarDays size={14} /></button></div><div className="revenue-total"><strong><AnimatedNumber value={todayRevenue} currency={settings.currency} style="currency" /></strong>{revenueTrend !== null && <Trend direction={revenueTrend < 0 ? 'down' : 'up'}><AnimatedNumber value={Math.abs(revenueTrend)} suffix="%" /></Trend>}<span>received today</span></div><RevenueChart currency={settings.currency} data={revenueByMonth} money={money} /></Card>
      <Card className="status-card"><div className="card-heading"><div><div className="eyebrow">LIVE WORKLOAD</div><h2>Order status</h2></div><Link className="text-link" to="/orders">View all <ArrowRight size={14} /></Link></div><div className="status-visual"><div className="status-ring" style={{ background: `conic-gradient(${statusGradient})` }}><div><strong><AnimatedNumber value={statusTotal} /></strong><span>in production</span></div></div><div className="status-legend">{activeStatuses.map((status, index) => <div key={status}><span className={`legend-dot legend-${index}`} style={{ background: statusColors[index] }} />{status}<strong><AnimatedNumber value={statusCount(status)} /></strong></div>)}</div></div><div className="status-foot"><span>{isDemo ? 'Illustrative sample workload' : 'Live workspace workload'}</span><span className="pulse-dot" /></div></Card>
    </div>
    <div className="dashboard-bottom">
      <Card className="recent-card"><div className="card-heading"><div><div className="eyebrow">THE LATEST</div><h2>Recent orders</h2></div><Link className="text-link" to="/orders">All orders <ArrowRight size={14} /></Link></div><div className="table-scroll"><table className="data-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>GARMENT</th><th>DUE DATE</th><th>STATUS</th><th>AMOUNT</th></tr></thead><tbody>{orders.slice(0, 5).map((order) => <tr key={order.id}><td><Link className="order-link" to={`/orders/${order.id}`}>{order.id}</Link></td><td><span className="customer-cell"><span className="mini-avatar">{order.customer.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>{order.customer}</span></td><td>{order.garment}</td><td>{new Date(`${order.dueDate}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td><td><Badge>{order.status}</Badge></td><td className="amount-cell"><AnimatedNumber value={order.amount} currency={settings.currency} style="currency" /></td></tr>)}</tbody></table></div></Card>
      <Card className="welcome-card"><div className="welcome-decoration"><span /><span /><span /></div><div className="eyebrow">A LITTLE INSPIRATION</div><h2>Every stitch tells a story.</h2><p>Your craft deserves a studio that works as beautifully as you do.</p><Link to="/measurements" className="welcome-link">Explore measurements <ArrowUpRight size={15} /></Link><div className="welcome-signature">✳ &nbsp; ATELIER NOTES</div></Card>
    </div>
    <div className="dashboard-meta"><span><span className="online-dot" />Studio is open</span><span><AnimatedNumber value={staff.length} suffix=" team members on your roster" /></span></div>
    {calendarOpen && <Modal title="Order calendar" description="Browse delivery dates across any year." onClose={() => setCalendarOpen(false)} wide className="year-calendar-modal"><YearCalendar year={calendarYear} orders={orders} onYearChange={setCalendarYear} /></Modal>}
  </>
}
