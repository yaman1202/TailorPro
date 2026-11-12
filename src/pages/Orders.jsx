import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, Clock3, Coins, Eye, Pencil, Ruler, Scissors, Trash2, TrendingUp } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { formatCurrency } from '../services/formatters.js'
import { getNonCancelledOrderValue, getOrderBalance, getTotalPaid } from '../services/orderAccounting.js'
import { activeOrderStatuses, getAllowedOrderStatuses, isCancelledOrder, orderStatuses } from '../services/orderWorkflow.js'
import { AddButton, PageHeading, SearchBox, Select, TableFrame } from '../components/UI.jsx'
import CompleteOrderModal from '../components/CompleteOrderModal.jsx'
import DataTable from '../components/DataTable.jsx'
import OrderFormModal from '../components/OrderFormModal.jsx'
import { getMeasurementGarmentsForOrder } from '../data/measurementTemplates.js'
import { validateDeletion } from '../services/validation.js'

const quickStatusChips = ['All status', 'Active orders', 'New', 'Stitching', 'Quality Check', 'Ready', 'Completed']

export default function Orders() {
  const { orders, measurements, payments, settings, transitionOrder, completeOrderWithPayment, deleteRecord } = useAppData()
  const money = (value) => formatCurrency(value, settings.currency)
  const [searchParams] = useSearchParams()
  const requestedStatus = searchParams.get('status')
  const initialStatus = searchParams.get('filter') === 'active'
    ? 'Active orders'
    : orderStatuses.includes(requestedStatus) ? requestedStatus : 'All status'
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [sortBy, setSortBy] = useState('date-new')
  const [pendingStatuses, setPendingStatuses] = useState({})
  const [completionOrder, setCompletionOrder] = useState(null)
  const [completingOrder, setCompletingOrder] = useState(false)
  const [expandedMeasurementOrder, setExpandedMeasurementOrder] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [feedback, setFeedback] = useState(null)

  const filtered = useMemo(() => orders.filter((order) => {
    const matchesSearch = `${order.id} ${order.customer} ${order.garment}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = statusFilter === 'All status'
      || (statusFilter === 'Active orders' ? activeOrderStatuses.includes(order.status) : order.status === statusFilter)
    return matchesSearch && matchesStatus
  }), [orders, query, statusFilter])

  const sortedOrders = useMemo(() => [...filtered].sort((left, right) => {
    if (sortBy === 'date-old') return (left.createdAt || '').localeCompare(right.createdAt || '')
    if (sortBy === 'price-high') return Number(right.amount || 0) - Number(left.amount || 0)
    if (sortBy === 'price-low') return Number(left.amount || 0) - Number(right.amount || 0)
    return (right.createdAt || '').localeCompare(left.createdAt || '')
  }), [filtered, sortBy])

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (order) => {
    setEditing(order)
    setModalOpen(true)
  }

  const changeStatus = async (order, nextStatus) => {
    if (pendingStatuses[order.id]) return
    if (nextStatus === 'Completed') {
      setCompletionOrder(order)
      return
    }
    if (nextStatus === 'Cancelled' && !window.confirm(`Cancel order ${order.id}? Its payment history will remain in the ledger.`)) return
    setPendingStatuses((current) => ({ ...current, [order.id]: nextStatus }))
    const updatedOrder = await transitionOrder(order.id, nextStatus)
    setPendingStatuses((current) => {
      return Object.fromEntries(Object.entries(current).filter(([id]) => id !== order.id))
    })
    if (!updatedOrder) return
  }

  const confirmCompletion = async (method) => {
    if (!completionOrder || completingOrder) return
    setCompletingOrder(true)
    const result = await completeOrderWithPayment(completionOrder.id, method)
    setCompletingOrder(false)
    if (result.record) {
      setCompletionOrder(null)
      return ''
    }
    return result.error
  }

  const remove = async (order) => {
    setFeedback(null)
    const validation = validateDeletion('orders', order, { payments })
    if (!validation.valid) {
      setFeedback({ type: 'error', text: validation.error })
      return
    }
    if (window.confirm(`Delete order ${order.id}?`)) {
      const deleted = await deleteRecord('orders', order.id)
      if (deleted) setFeedback({ type: 'success', text: `Order ${order.id} was deleted.` })
    }
  }

  const renderMeasurementPanel = (order) => {
    const linkedProfile = measurements.find((profile) => profile.id === order.measurementId)
    const relevantGarments = getMeasurementGarmentsForOrder(order.garment)
    const latestByGarment = new Map()
    measurements
      .filter((profile) => profile.customerId === order.customerId && relevantGarments.includes(profile.garment))
      .sort((left, right) => Number(right.version) - Number(left.version))
      .forEach((profile) => {
        if (!latestByGarment.has(profile.garment)) latestByGarment.set(profile.garment, profile)
      })
    const profiles = linkedProfile ? [linkedProfile] : [...latestByGarment.values()]
    return (
      <div className="order-measurement-panel">
        <div className="order-measurement-panel-heading">
          <Ruler size={16} />
          <strong>{order.customer} · {order.garment} measurements</strong>
        </div>
        {profiles.length ? profiles.map((profile) => (
          <section className="order-measurement-profile" key={profile.id}>
            <div className="order-measurement-profile-heading">
              <strong>{profile.garment} · Version {profile.version}</strong>
              <span>{profile.unit || 'in'}</span>
            </div>
            <div className="order-measurement-values">
              {Object.entries(profile.values || {}).map(([field, value]) => (
                <span key={field}>{field}<strong>{value} {profile.unit || 'in'}</strong></span>
              ))}
            </div>
          </section>
        )) : (
          <p className="form-hint">
            No saved fitting profile for this garment.{' '}
            <Link className="text-link" to={`/measurements?customerId=${encodeURIComponent(order.customerId)}&open=1`}>
              Record measurements
            </Link>
          </p>
        )}
      </div>
    )
  }

  const columns = [
    { key: 'id', label: 'ORDER', render: (order) => <Link className="order-link" to={`/orders/${order.id}`}>{order.id}</Link> },
    {
      key: 'customer',
      label: 'CUSTOMER',
      render: (order) => (
        <div className="order-customer-cell">
          <span className="customer-cell">
            <span className="mini-avatar">{order.customer.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>
            <strong>{order.customer}</strong>
          </span>
          <button
            type="button"
            className="measurement-toggle"
            aria-expanded={expandedMeasurementOrder === order.id}
            onClick={() => setExpandedMeasurementOrder((current) => current === order.id ? null : order.id)}
          >
            <Ruler size={13} />
            {expandedMeasurementOrder === order.id ? 'Hide measurements' : 'Show measurements'}
            <ChevronDown size={13} />
          </button>
        </div>
      ),
    },
    { key: 'garment', label: 'GARMENT', render: (order) => <strong>{order.garment}</strong> },
    {
      key: 'tailor',
      label: 'ASSIGNED TAILOR',
      render: (order) => (order.tailor ? (
        <span className="customer-cell">
          <span className="mini-avatar">{order.tailor.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>
          <strong>{order.tailor}</strong>
        </span>
      ) : (
        <span className="muted-cell">Unassigned</span>
      )),
    },
    {
      key: 'dueDate',
      label: 'DUE DATE',
      render: (order) => new Date(`${order.dueDate}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (order) => {
        const allowedStatuses = getAllowedOrderStatuses(order)
        const pendingStatus = pendingStatuses[order.id]
        return (
          <Select
            className={`status-select ${pendingStatus ? 'status-select-pending' : ''}`}
            value={pendingStatus || order.status}
            disabled={Boolean(pendingStatus)}
            onChange={(event) => changeStatus(order, event.target.value)}
            aria-label={`Set status for ${order.id}`}
            aria-busy={Boolean(pendingStatus)}
          >
            {orderStatuses.map((status) => (
              <option key={status} disabled={!allowedStatuses.includes(status)}>{status}</option>
            ))}
          </Select>
        )
      },
    },
    {
      key: 'amount',
      label: 'TOTAL',
      render: (order) => {
        const balance = getOrderBalance(order, payments)
        return (
          <div className="amount-stack">
            <span className="amount-cell">{money(order.amount)}</span>
            {order.status !== 'Cancelled' ? (
              <small className={`table-subtext ${balance > 0 ? 'amount-due-sub' : 'amount-paid-sub'}`}>
                {balance > 0 ? `Due ${money(balance)}` : 'Paid in full'}
              </small>
            ) : (
              <small className="table-subtext muted-cell">Cancelled</small>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      label: '',
      render: (order) => (
        <span className="row-actions">
          <Link title="View order" aria-label="View order" to={`/orders/${order.id}`}><Eye size={15} /></Link>
          <button title="Edit order" aria-label="Edit order" onClick={() => openEdit(order)}><Pencil size={15} /></button>
          <button title="Delete order" aria-label="Delete order" onClick={() => remove(order)}><Trash2 size={15} /></button>
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeading
        eyebrow="MADE TO MEASURE"
        title="Orders"
        description="From first fitting to final handoff, all in one place."
        action={<AddButton onClick={openCreate}>Create order</AddButton>}
      />

      {feedback && (
        <div className={`customer-feedback customer-feedback-${feedback.type} customer-feedback-inline`} role={feedback.type === 'error' ? 'alert' : 'status'}>
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="order-summary-strip">
        <div>
          <span><Scissors size={14} aria-hidden="true" /> Open orders</span>
          <strong>{orders.filter((order) => activeOrderStatuses.includes(order.status)).length}</strong>
        </div>
        <div>
          <span><Clock3 size={14} aria-hidden="true" /> Ready for pickup</span>
          <strong>{orders.filter((order) => order.status === 'Ready').length}</strong>
        </div>
        <div>
          <span><Coins size={14} aria-hidden="true" /> Collected</span>
          <strong>{money(getTotalPaid(payments))}</strong>
        </div>
        <div>
          <span><TrendingUp size={14} aria-hidden="true" /> Average order</span>
          <strong>{money(orders.filter((order) => !isCancelledOrder(order)).length ? getNonCancelledOrderValue(orders) / orders.filter((order) => !isCancelledOrder(order)).length : 0)}</strong>
        </div>
      </div>

      <TableFrame className="orders-table" title="All orders" note={`${filtered.length} orders · status updates save automatically`}>
        <div className="filter-pills" role="tablist" aria-label="Quick order status filter">
          {quickStatusChips.map((chip) => (
            <button
              key={chip}
              type="button"
              role="tab"
              aria-selected={statusFilter === chip}
              className={`filter-pill ${statusFilter === chip ? 'active' : ''}`}
              onClick={() => setStatusFilter(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="toolbar-inline">
          <SearchBox value={query} onChange={setQuery} placeholder="Search order, customer or garment..." />
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter orders by status">
            <option>All status</option>
            <option>Active orders</option>
            {orderStatuses.map((status) => <option key={status}>{status}</option>)}
          </Select>
          <Select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort orders">
            <option value="date-new">Sort by: Date (NEW)</option>
            <option value="date-old">Sort by: Date (OLD)</option>
            <option value="price-high">Sort by: Price (high to low)</option>
            <option value="price-low">Sort by: Price (low to high)</option>
          </Select>
        </div>
        <DataTable
          columns={columns}
          rows={sortedOrders}
          emptyMessage="No orders match your filters."
          expandedRowIds={expandedMeasurementOrder ? [expandedMeasurementOrder] : []}
          renderExpandedRow={renderMeasurementPanel}
        />
      </TableFrame>

      {completionOrder && (
        <CompleteOrderModal
          order={completionOrder}
          balance={getOrderBalance(completionOrder, payments)}
          money={money}
          busy={completingOrder}
          onClose={() => setCompletionOrder(null)}
          onConfirm={confirmCompletion}
        />
      )}

      {modalOpen && (
        <OrderFormModal
          editing={editing}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
