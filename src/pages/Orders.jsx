import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { formatCurrency } from '../services/formatters.js'
import { createOrderId, getOrderBalance, getTotalOrderValue, getTotalPaid, normalizeMoney } from '../services/orderAccounting.js'
import { activeOrderStatuses, createOrderRecord, getAllowedOrderStatuses, orderStatuses } from '../services/orderWorkflow.js'
import { AddButton, Button, FormField, Modal, PageHeading, SearchBox, Select, TableFrame } from '../components/UI.jsx'
import CompleteOrderModal from '../components/CompleteOrderModal.jsx'
import DataTable from '../components/DataTable.jsx'
import { getMeasurementGarmentsForOrder } from '../data/measurementTemplates.js'
import { validateDeletion, validateEntity } from '../services/validation.js'

const garments = ['Shirt', 'Formal shirt', 'Trouser', 'Suit/Blazer', 'Two-piece suit', 'Kurta', 'Blouse', 'Suit', 'Dress', 'Anarkali suit', 'Evening dress']
const blank = { customerId: '', garment: 'Formal shirt', tailor: '', dueDate: '', amount: '', advance: '' }
const newCustomerOption = '__new_customer__'

export default function Orders() {
  const { orders, customers, measurements, staff, payments, settings, createCustomer, createOrder, updateOrder, transitionOrder, completeOrderWithPayment, deleteRecord } = useAppData()
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
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '', city: '' })
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [customerFeedback, setCustomerFeedback] = useState(null)
  const [savingOrder, setSavingOrder] = useState(false)
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
  const openCreate = () => { setEditing(null); setForm({ ...blank, measurementId: '' }); setNewCustomer({ name: '', phone: '', email: '', address: '', city: '' }); setCustomerFeedback(null); setModalOpen(true) }
  const openEdit = (order) => { setEditing(order); setForm({ customerId: order.customerId, garment: order.garment, measurementId: order.measurementId || '', tailor: order.tailor || '', dueDate: order.dueDate, amount: order.amount, advance: order.advance }); setCustomerFeedback(null); setModalOpen(true) }
  const addCustomerFromOrder = async () => {
    if (savingCustomer) return
    const values = Object.fromEntries(Object.entries(newCustomer).map(([field, value]) => [field, value.trim()]))
    const candidate = { ...values, id: 'pending-customer', joined: new Date().toISOString().slice(0, 10) }
    const validation = validateEntity('customers', candidate, { customers, orders, measurements, payments, staff, inventory: [] })
    if (!validation.valid) {
      setCustomerFeedback({ type: 'error', text: validation.error })
      return
    }

    setSavingCustomer(true)
    setCustomerFeedback(null)
    try {
      const { record, error } = await createCustomer({ ...values, joined: candidate.joined })
      if (!record) {
        setCustomerFeedback({ type: 'error', text: error || 'Customer could not be saved. Check the repository status and try again.' })
        return
      }
      setForm((current) => ({ ...current, customerId: record.id, measurementId: '' }))
      setNewCustomer({ name: '', phone: '', email: '', address: '', city: '' })
      setCustomerFeedback({ type: 'success', text: `${record.name} was saved and selected for this order.` })
    } finally {
      setSavingCustomer(false)
    }
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
  const save = async (event) => {
    event.preventDefault()
    if (savingOrder) return
    setSavingOrder(true)
    const customer = customers.find((item) => item.id === form.customerId)
    if (!customer) {
      setCustomerFeedback({ type: 'error', text: form.customerId === newCustomerOption ? 'Save the new customer first to select them for this order.' : 'Select a customer before saving this order.' })
      setSavingOrder(false)
      return
    }
    if (!editing && customer.archived) {
      setCustomerFeedback({ type: 'error', text: 'Cannot create a new order for an archived customer. Restore the customer first.' })
      setSavingOrder(false)
      return
    }
    const orderValues = { customerId: customer.id, customer: customer.name, garment: form.garment, ...(editing ? { measurementId: form.measurementId || null } : form.measurementId ? { measurementId: form.measurementId } : {}), tailor: form.tailor, dueDate: form.dueDate, amount: normalizeMoney(form.amount), advance: normalizeMoney(form.advance || 0) }
    if (editing) {
      const validation = validateEntity('orders', { ...editing, ...orderValues }, { customers, measurements, orders, payments, staff, inventory: [] }, { existing: editing })
      if (!validation.valid) {
        window.alert(validation.error)
        setSavingOrder(false)
        return
      }
      if (!await updateOrder(editing.id, orderValues)) {
        setSavingOrder(false)
        return
      }
    } else {
      const id = createOrderId()
      const order = createOrderRecord(orderValues, id)
      const data = { customers, measurements, orders, payments, staff, inventory: [] }
      const validation = validateEntity('orders', order, data)
      if (!validation.valid) {
        window.alert(validation.error)
        setSavingOrder(false)
        return
      }
      if (orderValues.advance > 0) {
        const paymentValidation = validateEntity('payments', {
          id: 'pending-advance',
          orderId: id,
          customer: customer.name,
          date: new Date().toISOString().slice(0, 10),
          amount: orderValues.advance,
          method: 'Cash',
          type: 'Advance',
        }, { ...data, orders: [order, ...orders] })
        if (!paymentValidation.valid) {
          window.alert(paymentValidation.error)
          setSavingOrder(false)
          return
        }
      }
      const initialPayment = orderValues.advance > 0
        ? { orderId: id, customer: customer.name, date: new Date().toISOString().slice(0, 10), amount: orderValues.advance, method: 'Cash', type: 'Advance' }
        : undefined
      if (!await createOrder(order, initialPayment)) {
        setSavingOrder(false)
        return
      }
    }
    setModalOpen(false)
    setSavingOrder(false)
  }
  const remove = (order) => {
    const validation = validateDeletion('orders', order, { payments })
    if (!validation.valid) {
      window.alert(validation.error)
      return
    }
    if (window.confirm(`Delete order ${order.id}?`)) deleteRecord('orders', order.id)
  }
  const columns = [
    { key: 'id', label: 'ORDER', render: (order) => <Link className="order-link" to={`/orders/${order.id}`}>{order.id}</Link> },
    { key: 'customer', label: 'CUSTOMER', render: (order) => <span className="customer-cell"><span className="mini-avatar">{order.customer.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><strong>{order.customer}</strong></span> },
    { key: 'garment', label: 'GARMENT', render: (order) => <strong>{order.garment}</strong> },
    { key: 'tailor', label: 'ASSIGNED TAILOR', render: (order) => order.tailor ? <span className="customer-cell"><span className="mini-avatar">{order.tailor.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><strong>{order.tailor}</strong></span> : <span className="muted-cell">Unassigned</span> },
    { key: 'dueDate', label: 'DUE DATE', render: (order) => new Date(`${order.dueDate}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
    { key: 'status', label: 'STATUS', render: (order) => { const allowedStatuses = getAllowedOrderStatuses(order); const pendingStatus = pendingStatuses[order.id]; return <Select className={`status-select ${pendingStatus ? 'status-select-pending' : ''}`} value={pendingStatus || order.status} disabled={Boolean(pendingStatus)} onChange={(event) => changeStatus(order, event.target.value)} aria-label={`Set status for ${order.id}`} aria-busy={Boolean(pendingStatus)}>{orderStatuses.map((status) => <option key={status} disabled={!allowedStatuses.includes(status)}>{status}</option>)}</Select> } },
    { key: 'amount', label: 'TOTAL', render: (order) => <span className="amount-cell">{money(order.amount)}</span> },
    { key: 'actions', label: '', render: (order) => <span className="row-actions"><Link title="View order" aria-label="View order" to={`/orders/${order.id}`}><Eye size={15} /></Link><button title="Edit order" aria-label="Edit order" onClick={() => openEdit(order)}><Pencil size={15} /></button><button title="Delete order" aria-label="Delete order" onClick={() => remove(order)}><Trash2 size={15} /></button></span> },
  ]
  const availableMeasurements = measurements
    .filter((profile) => profile.customerId === form.customerId && getMeasurementGarmentsForOrder(form.garment).includes(profile.garment))
    .sort((left, right) => Number(right.version) - Number(left.version))

  return <>
    <PageHeading eyebrow="MADE TO MEASURE" title="Orders" description="From first fitting to final handoff, all in one place." action={<AddButton onClick={openCreate}>Create order</AddButton>} />
    <div className="order-summary-strip"><div><span>Open orders</span><strong>{orders.filter((order) => activeOrderStatuses.includes(order.status)).length}</strong></div><div><span>Ready for pickup</span><strong>{orders.filter((order) => order.status === 'Ready').length}</strong></div><div><span>Collected</span><strong>{money(getTotalPaid(payments))}</strong></div><div><span>Average order</span><strong>{money(orders.length ? getTotalOrderValue(orders) / orders.length : 0)}</strong></div></div>
    <TableFrame className="orders-table" title="All orders" note={`${filtered.length} orders · status updates save automatically`}>
      <div className="toolbar-inline"><SearchBox value={query} onChange={setQuery} placeholder="Search order, customer or garment..." /><Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter orders by status"><option>All status</option><option>Active orders</option>{orderStatuses.map((status) => <option key={status}>{status}</option>)}</Select><Select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort orders"><option value="date-new">Sort by: Date (NEW)</option><option value="date-old">Sort by: Date (OLD)</option><option value="price-high">Sort by: Price (high to low)</option><option value="price-low">Sort by: Price (low to high)</option></Select></div>
      <DataTable columns={columns} rows={sortedOrders} emptyMessage="No orders match your filters." />
    </TableFrame>
    {completionOrder && <CompleteOrderModal
      order={completionOrder}
      balance={getOrderBalance(completionOrder, payments)}
      money={money}
      busy={completingOrder}
      onClose={() => setCompletionOrder(null)}
      onConfirm={confirmCompletion}
    />}
    {modalOpen && <Modal title={editing ? 'Edit order' : 'Create an order'} description="Make a note of the details and we’ll take it from here." onClose={() => setModalOpen(false)} wide><form className="form-stack" onSubmit={save}>
      <div className="form-grid">
        <FormField label="Customer"><Select required disabled={Boolean(editing && payments.some((payment) => payment.orderId === editing.id))} value={form.customerId} onChange={(event) => { const customerId = event.target.value; setForm({ ...form, customerId, measurementId: '' }); setCustomerFeedback(null) }}><option value="">Select a customer</option>{customers.filter((customer) => !customer.archived || (editing && editing.customerId === customer.id)).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}{!editing && <option value={newCustomerOption}>+ Add a new customer…</option>}</Select>{editing && payments.some((payment) => payment.orderId === editing.id) && <small className="field-note">Customer is locked after payments are recorded.</small>}</FormField>
        {form.customerId === newCustomerOption && <div className="inline-customer-create">
          <div className="inline-customer-heading"><strong>New customer</strong><small>Required: name and phone number.</small></div>
          <div className="form-grid">
            <FormField label="Customer name"><input required value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} placeholder="Full name" /></FormField>
            <FormField label="Phone number"><input required type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} placeholder="Phone number" /></FormField>
            <FormField label="Email address"><input type="email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} placeholder="Optional" /></FormField>
            <FormField label="City"><input value={newCustomer.city} onChange={(event) => setNewCustomer({ ...newCustomer, city: event.target.value })} placeholder="Optional" /></FormField>
            <FormField label="Address"><input value={newCustomer.address} onChange={(event) => setNewCustomer({ ...newCustomer, address: event.target.value })} placeholder="Optional" /></FormField>
          </div>
          {customerFeedback && <p className={`customer-feedback customer-feedback-${customerFeedback.type}`} role={customerFeedback.type === 'error' ? 'alert' : 'status'}>{customerFeedback.text}</p>}
          <Button type="button" disabled={savingCustomer} onClick={addCustomerFromOrder}>{savingCustomer ? 'Saving customer…' : 'Save & select customer'}</Button>
        </div>}
        <FormField label="Garment type"><Select value={form.garment} onChange={(event) => setForm({ ...form, garment: event.target.value, measurementId: '' })}>{garments.map((garment) => <option key={garment}>{garment}</option>)}</Select></FormField>
        <FormField label="Previous measurement profile"><Select value={form.measurementId || ''} onChange={(event) => setForm({ ...form, measurementId: event.target.value })}><option value="">No profile linked</option>{availableMeasurements.map((profile) => <option key={profile.id} value={profile.id}>Version {profile.version} · {profile.garment} · {profile.unit || 'in'}</option>)}</Select>{availableMeasurements.length === 0 && form.customerId && <small className="field-note">No saved profile for this customer and garment yet.</small>}</FormField>
        <FormField label="Assign tailor"><Select value={form.tailor} onChange={(event) => setForm({ ...form, tailor: event.target.value })}><option value="">Unassigned</option>{staff.map((member) => <option key={member.id}>{member.name}</option>)}</Select></FormField>
        <FormField label="Delivery date"><input type="date" required min={new Date().toISOString().slice(0, 10)} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></FormField>
        <FormField label={`Order total (${settings.currency})`}><input type="number" required min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" /></FormField>
        <FormField label={editing ? `Advance recorded (${settings.currency})` : `Advance payment (${settings.currency})`}><input type="number" min="0" step="0.01" max={form.amount || undefined} disabled={Boolean(editing)} value={form.advance} onChange={(event) => setForm({ ...form, advance: event.target.value })} placeholder="0" />{editing && <small className="field-note">Record additional payments in Payments to preserve the ledger.</small>}</FormField>
      </div>
      {customerFeedback?.type === 'success' && form.customerId !== newCustomerOption && <p className="customer-feedback customer-feedback-success" role="status">{customerFeedback.text}</p>}
      <div className="modal-actions"><Button type="button" variant="secondary" disabled={savingOrder || savingCustomer} onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={savingOrder || savingCustomer}>{savingOrder ? 'Saving order…' : editing ? 'Save changes' : 'Create order'}</Button></div>
    </form></Modal>}
  </>
}
