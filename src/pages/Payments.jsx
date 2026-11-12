import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, CircleDollarSign, CreditCard, WalletCards } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { formatCurrency, getLocalDateKey } from '../services/formatters.js'
import {
  canAcceptPayment,
  getNonCancelledOrderValue,
  getOrderBalance,
  getOutstandingBalance,
  getTotalPaid,
  normalizeMoney,
  paymentMethods,
  paymentTypes,
  toMinorUnits,
} from '../services/orderAccounting.js'
import { isCancelledOrder } from '../services/orderWorkflow.js'
import { AddButton, Badge, Button, Card, FormField, Modal, PageHeading, SearchBox, Select, TableFrame } from '../components/UI.jsx'
import DataTable from '../components/DataTable.jsx'
import { validateEntity } from '../services/validation.js'

const emptyForm = { orderId: '', amount: '', method: 'UPI', type: 'Balance' }

export default function Payments() {
  const { orders, payments, customers, measurements, staff, inventory, recordPayment: savePayment, settings } = useAppData()
  const money = (value) => formatCurrency(value, settings.currency)
  const [query, setQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState('All methods')
  const [typeFilter, setTypeFilter] = useState('All types')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [paymentError, setPaymentError] = useState('')
  const recordingPayment = useRef(false)

  const ordersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders])
  const nonCancelledCount = useMemo(() => orders.filter((order) => !isCancelledOrder(order)).length, [orders])

  const totals = useMemo(() => ({
    paid: getTotalPaid(payments),
    orderValue: getNonCancelledOrderValue(orders),
    outstanding: getOutstandingBalance(orders, payments),
  }), [orders, payments])

  const resolveCustomerName = (payment) => ordersById.get(payment.orderId)?.customer || payment.customer

  const filtered = useMemo(() => payments.filter((payment) => {
    const customerName = ordersById.get(payment.orderId)?.customer || payment.customer
    const matchesSearch = `${payment.orderId} ${customerName} ${payment.method} ${payment.type}`
      .toLowerCase()
      .includes(query.toLowerCase())
    const matchesMethod = methodFilter === 'All methods' || payment.method === methodFilter
    const matchesType = typeFilter === 'All types' || payment.type === typeFilter
    return matchesSearch && matchesMethod && matchesType
  }), [payments, ordersById, query, methodFilter, typeFilter])

  const selectedOrder = orders.find((order) => order.id === form.orderId)
  const selectedBalance = selectedOrder ? getOrderBalance(selectedOrder, payments) : 0
  const enteredMinorUnits = toMinorUnits(form.amount)
  const balanceMinorUnits = toMinorUnits(selectedBalance)

  const recordPayment = async (event) => {
    event.preventDefault()
    if (recordingPayment.current) return
    recordingPayment.current = true
    const date = getLocalDateKey()
    const payment = {
      orderId: selectedOrder?.id || '',
      customer: selectedOrder?.customer || '',
      date,
      amount: normalizeMoney(form.amount),
      method: form.method,
      type: form.type,
    }
    const validation = validateEntity('payments', { ...payment, id: 'pending-payment' }, { customers, measurements, orders, payments, staff, inventory })
    if (!validation.valid) {
      setPaymentError(validation.error)
      recordingPayment.current = false
      return
    }
    try {
      if (await savePayment(payment)) {
        setModalOpen(false)
        setForm(emptyForm)
        setPaymentError('')
      } else {
        setPaymentError('Payment could not be saved. Review any error notice above and try again.')
      }
    } finally {
      recordingPayment.current = false
    }
  }

  const columns = [
    { key: 'id', label: 'TRANSACTION', render: (payment) => <span className="transaction-id" title={payment.id}>PAY-{payment.id.slice(-5).toUpperCase()}</span> },
    {
      key: 'customer',
      label: 'CUSTOMER',
      render: (payment) => {
        const name = resolveCustomerName(payment)
        return (
          <span className="customer-cell">
            <span className="mini-avatar">{name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>
            <strong>{name}</strong>
          </span>
        )
      },
    },
    { key: 'orderId', label: 'ORDER', render: (payment) => <Link className="order-link" to={`/orders/${payment.orderId}`}>{payment.orderId}</Link> },
    { key: 'date', label: 'DATE', render: (payment) => new Date(`${payment.date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
    { key: 'method', label: 'METHOD', render: (payment) => <span className="method-cell"><CreditCard size={14} />{payment.method}</span> },
    { key: 'type', label: 'TYPE', render: (payment) => <Badge tone={payment.type}>{payment.type}</Badge> },
    { key: 'amount', label: 'AMOUNT', render: (payment) => <strong className="amount-cell">{money(payment.amount)}</strong> },
  ]

  return <>
    <PageHeading eyebrow="THE LEDGER" title="Payments" description="Every payment accounted for, from advance to final fitting." action={<AddButton onClick={() => { setForm(emptyForm); setPaymentError(''); setModalOpen(true) }}>Record payment</AddButton>} />
    <div className="stats-grid payment-stats">
      <Card className="stat-card"><div className="stat-top"><span>Collected to date</span><span className="stat-icon green"><ArrowDownLeft size={17} /></span></div><strong>{money(totals.paid)}</strong><div className="stat-bottom"><span>{payments.length} recorded payments</span></div></Card>
      <Card className="stat-card"><div className="stat-top"><span>Outstanding balance</span><span className="stat-icon coral"><CircleDollarSign size={17} /></span></div><strong>{money(totals.outstanding)}</strong><div className="stat-bottom"><span>Across non-cancelled orders</span></div></Card>
      <Card className="stat-card"><div className="stat-top"><span>Total order value</span><span className="stat-icon gold"><WalletCards size={17} /></span></div><strong>{money(totals.orderValue)}</strong><div className="stat-bottom"><span>{nonCancelledCount} active or completed orders</span></div></Card>
    </div>
    <TableFrame title="Payment history" note="A complete record of customer payments">
      <div className="toolbar-inline">
        <SearchBox value={query} onChange={setQuery} placeholder="Search customer, order or method..." />
        <Select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} aria-label="Filter payments by method">
          <option>All methods</option>
          {paymentMethods.map((method) => <option key={method}>{method}</option>)}
        </Select>
        <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter payments by type">
          <option>All types</option>
          {paymentTypes.map((type) => <option key={type}>{type}</option>)}
        </Select>
        <span className="result-count">{filtered.length} transactions</span>
      </div>
      <DataTable columns={columns} rows={filtered} emptyMessage="No payments match your search." />
    </TableFrame>
    {modalOpen && (
      <Modal title="Record a payment" description="Payments are linked to an order and reflected in its balance." onClose={() => setModalOpen(false)}>
        <form className="form-stack" onSubmit={recordPayment}>
          <FormField label="Order">
            <Select required value={form.orderId} onChange={(event) => { setForm({ ...form, orderId: event.target.value, amount: '' }); setPaymentError('') }}>
              <option value="">Select an order</option>
              {orders.filter((order) => canAcceptPayment(order, payments)).map((order) => (
                <option key={order.id} value={order.id}>
                  {order.id} · {order.customer} · balance {money(getOrderBalance(order, payments))}
                </option>
              ))}
            </Select>
          </FormField>
          {selectedOrder && <div className="balance-callout"><span>Remaining balance</span><strong>{money(selectedBalance)}</strong></div>}
          <div className="form-grid">
            <FormField label={`Payment amount (${settings.currency})`}>
              <input type="number" min="0.01" step="0.01" max={selectedBalance} required value={form.amount} onChange={(event) => { setForm({ ...form, amount: event.target.value }); setPaymentError('') }} />
            </FormField>
            <FormField label="Payment type">
              <Select value={form.type} onChange={(event) => { setForm({ ...form, type: event.target.value }); setPaymentError('') }}>
                <option>Balance</option>
                <option>Advance</option>
                <option>Partial</option>
              </Select>
            </FormField>
            <FormField label="Payment method">
              <Select value={form.method} onChange={(event) => { setForm({ ...form, method: event.target.value }); setPaymentError('') }}>
                {paymentMethods.map((method) => <option key={method}>{method}</option>)}
              </Select>
            </FormField>
          </div>
          {paymentError && <p className="customer-feedback customer-feedback-error" role="alert">{paymentError}</p>}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!canAcceptPayment(selectedOrder, payments) || enteredMinorUnits <= 0 || enteredMinorUnits > balanceMinorUnits}>Save payment</Button>
          </div>
        </form>
      </Modal>
    )}
  </>
}
