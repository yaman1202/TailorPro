import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Check, CircleDollarSign, Scissors, UserRound } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { formatCurrency } from '../services/formatters.js'
import { getOrderBalance, getPaidForOrder } from '../services/orderAccounting.js'
import { getAllowedOrderStatuses, orderStatuses } from '../services/orderWorkflow.js'
import { Badge, Button, Card, PageHeading, Select } from '../components/UI.jsx'

export default function OrderDetails() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { orders, payments, transitionOrder, measurements, settings } = useAppData()
  const money = (value) => formatCurrency(value, settings.currency)
  const order = orders.find((item) => item.id === orderId)
  if (!order) return <><PageHeading eyebrow="ORDER NOT FOUND" title="We couldn’t find that order." description="It may have been removed or the link may be incorrect." action={<Button variant="secondary" onClick={() => navigate('/orders')}>Back to orders</Button>} /></>
  const orderPayments = payments.filter((payment) => payment.orderId === order.id)
  const paid = getPaidForOrder(payments, order.id)
  const remaining = getOrderBalance(order, payments)
  const relatedMeasurements = measurements.filter((item) => item.customerId === order.customerId)
  const linkedMeasurement = measurements.find((item) => item.id === order.measurementId)
  const changeStatus = async (nextStatus) => {
    if (nextStatus === 'Cancelled' && !window.confirm(`Cancel order ${order.id}? Its payment history will remain in the ledger.`)) return
    await transitionOrder(order.id, nextStatus)
  }
  return <>
    <Link className="back-link" to="/orders"><ArrowLeft size={15} />All orders</Link>
    <PageHeading eyebrow={`ORDER ${order.id}`} title={order.garment} description={`Created ${new Date(`${order.createdAt}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · ${order.customer}`} action={<Select value={order.status} onChange={(event) => changeStatus(event.target.value)} aria-label="Update order status">{orderStatuses.map((status) => <option key={status} disabled={!getAllowedOrderStatuses(order).includes(status)}>{status}</option>)}</Select>} />
    <div className="detail-grid"><div className="detail-main">
      <Card><div className="card-heading"><div><div className="eyebrow">ORDER PROGRESS</div><h2>Workroom timeline</h2></div><Badge>{order.status}</Badge></div><div className="timeline">{orderStatuses.filter((status) => status !== 'Cancelled').map((status, index) => { const current = orderStatuses.indexOf(order.status); const done = index < current; const active = status === order.status; return <div key={status} className={`timeline-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}><span className="timeline-mark">{done ? <Check size={14} /> : index + 1}</span><div><strong>{status}</strong>{active && <small>Current stage · updated just now</small>}</div>{active && <i />}</div> })}</div></Card>
      <Card><div className="card-heading"><div><div className="eyebrow">PAYMENT ACTIVITY</div><h2>Payment history</h2></div><Link className="text-link" to="/payments">Open ledger</Link></div>{orderPayments.length ? orderPayments.map((payment) => <div className="payment-history-row" key={payment.id}><div className="payment-mark"><CircleDollarSign size={17} /></div><div><strong>{payment.type} payment</strong><small>{payment.method} · {new Date(`${payment.date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</small></div><strong>{money(payment.amount)}</strong></div>) : <p className="form-hint">No payments have been recorded for this order yet.</p>}</Card>
    </div><aside className="detail-aside">
      <Card className="detail-amount"><div className="eyebrow">ORDER VALUE</div><strong>{money(order.amount)}</strong><div className="balance-line"><span>Paid so far</span><strong>{money(paid)}</strong></div><div className="balance-line"><span>Balance due</span><strong>{money(remaining)}</strong></div><div className="balance-progress"><i style={{ width: `${Math.min(100, order.amount ? paid / order.amount * 100 : 0)}%` }} /></div><Link className="button button-secondary full-button" to="/payments">Manage payments</Link></Card>
      <Card><div className="eyebrow">THE FITTING</div><h2 className="small-card-title">Order details</h2><div className="detail-info"><span><UserRound size={15} />Customer</span><strong>{order.customer}</strong></div><div className="detail-info"><span><Scissors size={15} />Assigned to</span><strong>{order.tailor || 'Not assigned'}</strong></div><div className="detail-info"><span><CalendarDays size={15} />Delivery date</span><strong>{new Date(`${order.dueDate}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></div><div className="detail-info"><span>Saved fitting profiles</span><strong>{relatedMeasurements.length}</strong></div>
        {linkedMeasurement ? <section className="order-measurement"><div className="order-measurement-heading"><strong>{linkedMeasurement.garment} · Version {linkedMeasurement.version}</strong><span>{linkedMeasurement.unit || 'in'}</span></div><div className="order-measurement-values">{Object.entries(linkedMeasurement.values || {}).map(([field, value]) => <span key={field}>{field}<strong>{value} {linkedMeasurement.unit || 'in'}</strong></span>)}</div></section> : <p className="form-hint">No measurement profile is linked to this order. Existing customer history is unchanged.</p>}
        <Link className="text-link detail-link" to="/measurements">View measurements</Link></Card>
    </aside></div>
  </>
}
