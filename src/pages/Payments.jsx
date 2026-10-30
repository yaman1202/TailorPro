import { useMemo, useRef, useState } from 'react'
import { ArrowDownLeft, CircleDollarSign, CreditCard, WalletCards } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { formatCurrency } from '../services/formatters.js'
import { canAcceptPayment, getOrderBalance, getOutstandingBalance, getTotalOrderValue, getTotalPaid, normalizeMoney, paymentMethods } from '../services/orderAccounting.js'
import { AddButton, Badge, Button, Card, FormField, Modal, PageHeading, SearchBox, Select, TableFrame } from '../components/UI.jsx'
import DataTable from '../components/DataTable.jsx'
import { validateEntity } from '../services/validation.js'

const emptyForm = { orderId: '', amount: '', method: 'UPI', type: 'Balance' }

export default function Payments() {
  const { orders, payments, customers, measurements, staff, inventory, recordPayment: savePayment, settings } = useAppData()
  const money = (value) => formatCurrency(value, settings.currency)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [paymentError, setPaymentError] = useState('')
  const recordingPayment = useRef(false)
  const totals = useMemo(() => {
    return { paid: getTotalPaid(payments), orderValue: getTotalOrderValue(orders), outstanding: getOutstandingBalance(orders, payments) }
  }, [orders, payments])
  const filtered = payments.filter((payment) => `${payment.orderId} ${payment.customer} ${payment.method} ${payment.type}`.toLowerCase().includes(query.toLowerCase()))
  const selectedOrder = orders.find((order) => order.id === form.orderId)
  const selectedBalance = selectedOrder ? getOrderBalance(selectedOrder, payments) : 0
  const recordPayment = async (event) => {
    event.preventDefault()
    if (recordingPayment.current) return
    recordingPayment.current = true
    const date = new Date().toISOString().slice(0, 10)
    const payment = { orderId: selectedOrder?.id || '', customer: selectedOrder?.customer || '', date, amount: normalizeMoney(form.amount), method: form.method, type: form.type }
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
      }
    } finally {
      recordingPayment.current = false
    }
  }
  const columns = [
    { key: 'id', label: 'TRANSACTION', render: (payment) => <span className="transaction-id">PAY-{payment.id.slice(-5).toUpperCase()}</span> },
    { key: 'customer', label: 'CUSTOMER', render: (payment) => <span className="customer-cell"><span className="mini-avatar">{payment.customer.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><strong>{payment.customer}</strong></span> },
    { key: 'orderId', label: 'ORDER', render: (payment) => <span className="order-link">{payment.orderId}</span> },
    { key: 'date', label: 'DATE', render: (payment) => new Date(`${payment.date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
    { key: 'method', label: 'METHOD', render: (payment) => <span className="method-cell"><CreditCard size={14} />{payment.method}</span> },
    { key: 'type', label: 'TYPE', render: (payment) => <Badge tone={payment.type}>{payment.type}</Badge> },
    { key: 'amount', label: 'AMOUNT', render: (payment) => <strong className="amount-cell">{money(payment.amount)}</strong> },
  ]
  return <>
    <PageHeading eyebrow="THE LEDGER" title="Payments" description="Every rupee accounted for, from advance to final fitting." action={<AddButton onClick={() => { setForm(emptyForm); setPaymentError(''); setModalOpen(true) }}>Record payment</AddButton>} />
    <div className="stats-grid payment-stats"><Card className="stat-card"><div className="stat-top"><span>Collected to date</span><span className="stat-icon green"><ArrowDownLeft size={17} /></span></div><strong>{money(totals.paid)}</strong><div className="stat-bottom"><span>{payments.length} recorded payments</span></div></Card><Card className="stat-card"><div className="stat-top"><span>Outstanding balance</span><span className="stat-icon coral"><CircleDollarSign size={17} /></span></div><strong>{money(totals.outstanding)}</strong><div className="stat-bottom"><span>Across non-cancelled orders</span></div></Card><Card className="stat-card"><div className="stat-top"><span>Total order value</span><span className="stat-icon gold"><WalletCards size={17} /></span></div><strong>{money(totals.orderValue)}</strong><div className="stat-bottom"><span>{orders.length} orders</span></div></Card></div>
    <TableFrame title="Payment history" note="A complete record of customer payments"><div className="toolbar-inline"><SearchBox value={query} onChange={setQuery} placeholder="Search customer, order or method..." /><span className="result-count">{filtered.length} transactions</span></div><DataTable columns={columns} rows={filtered} emptyMessage="No payments match your search." /></TableFrame>
    {modalOpen && <Modal title="Record a payment" description="Payments are linked to an order and reflected in its balance." onClose={() => setModalOpen(false)}><form className="form-stack" onSubmit={recordPayment}><FormField label="Order"><Select required value={form.orderId} onChange={(event) => { setForm({ ...form, orderId: event.target.value, amount: '' }); setPaymentError('') }}><option value="">Select an order</option>{orders.filter((order) => canAcceptPayment(order, payments)).map((order) => <option key={order.id} value={order.id}>{order.id} · {order.customer} · balance {money(getOrderBalance(order, payments))}</option>)}</Select></FormField>{selectedOrder && <div className="balance-callout"><span>Remaining balance</span><strong>{money(selectedBalance)}</strong></div>}<div className="form-grid"><FormField label={`Payment amount (${settings.currency})`}><input type="number" min="0.01" step="0.01" max={selectedBalance} required value={form.amount} onChange={(event) => { setForm({ ...form, amount: event.target.value }); setPaymentError('') }} /></FormField><FormField label="Payment type"><Select value={form.type} onChange={(event) => { setForm({ ...form, type: event.target.value }); setPaymentError('') }}><option>Balance</option><option>Advance</option><option>Partial</option></Select></FormField><FormField label="Payment method"><Select value={form.method} onChange={(event) => { setForm({ ...form, method: event.target.value }); setPaymentError('') }}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</Select></FormField></div>{paymentError && <p className="form-hint" role="alert">{paymentError}</p>}<div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={!canAcceptPayment(selectedOrder, payments) || Number(form.amount) > selectedBalance}>Save payment</Button></div></form></Modal>}
  </>
}
