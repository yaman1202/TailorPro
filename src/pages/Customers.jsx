import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Mail, MapPin, Pencil, Phone } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { AddButton, Button, FormField, Modal, PageHeading, SearchBox, Select, TableFrame } from '../components/UI.jsx'
import DataTable from '../components/DataTable.jsx'
import { validateEntity } from '../services/validation.js'

const blank = { name: '', phone: '', email: '', address: '', city: '' }

export default function Customers() {
  const { customers, orders, measurements, payments, staff, inventory, createCustomer, updateRecord } = useAppData()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [archiveFilter, setArchiveFilter] = useState(searchParams.get('filter') === 'new' ? 'New this week' : 'Active')

  const filtered = useMemo(() => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const weekStart = new Date(today)
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - 6)
    return customers.filter((customer) => {
      const matchesSearch = `${customer.name} ${customer.phone} ${customer.email || ''} ${customer.city || ''}`
        .toLowerCase()
        .includes(query.toLowerCase())
      if (!matchesSearch) return false
      if (archiveFilter === 'Active') return !customer.archived
      if (archiveFilter === 'Archived') return Boolean(customer.archived)
      if (archiveFilter === 'New this week') {
        const joined = customer.joined ? new Date(`${customer.joined}T00:00:00`) : null
        return !customer.archived && joined && joined >= weekStart && joined <= today
      }
      return true
    })
  }, [customers, query, archiveFilter])

  const openNew = () => { setEditing(null); setForm(blank); setFeedback(null); setSelected(null); setModalOpen(true) }
  const openEdit = (customer) => { setEditing(customer); setForm({ name: customer.name, phone: customer.phone, email: customer.email || '', address: customer.address || '', city: customer.city || '' }); setFeedback(null); setSelected(null); setModalOpen(true) }

  const save = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFeedback(null)
    const values = Object.fromEntries(Object.entries(form).map(([field, value]) => [field, value.trim()]))
    const record = { ...values, id: editing?.id || 'pending-customer', joined: editing?.joined || new Date().toISOString().slice(0, 10) }
    const data = { customers, orders, measurements, payments, staff, inventory }
    const validation = validateEntity('customers', record, data, { existing: editing || undefined })
    if (!validation.valid) {
      setFeedback({ type: 'error', text: validation.error })
      setSaving(false)
      return
    }
    try {
      let saved
      if (editing) {
        saved = await updateRecord('customers', editing.id, values)
      } else {
        const result = await createCustomer({ ...values, joined: record.joined })
        saved = result.record
        if (!saved) {
          setFeedback({ type: 'error', text: result.error || 'Customer could not be saved. Check the repository status and try again.' })
          return
        }
      }
      if (!saved) {
        setFeedback({ type: 'error', text: 'Customer could not be saved. Check the repository status and try again.' })
        return
      }
      setEditing(null)
      setModalOpen(false)
      setFeedback({ type: 'success', text: `${saved.name} was saved.` })
    } finally {
      setSaving(false)
    }
  }

  const toggleArchive = async (customer) => {
    if (customer.archived) {
      const saved = await updateRecord('customers', customer.id, { archived: false })
      if (saved) {
        setFeedback({ type: 'success', text: `${customer.name} was restored to active customers.` })
        if (selected?.id === customer.id) setSelected({ ...customer, archived: false })
      }
    } else {
      if (window.confirm(`Archive ${customer.name}? Historical orders and measurement records will be preserved.`)) {
        const saved = await updateRecord('customers', customer.id, { archived: true })
        if (saved) {
          setFeedback({ type: 'success', text: `${customer.name} was archived.` })
          if (selected?.id === customer.id) setSelected({ ...customer, archived: true })
        }
      }
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'CUSTOMER',
      render: (customer) => (
        <button className="customer-button" onClick={() => setSelected(customer)}>
          <span className="mini-avatar">{customer.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>
          <span>
            <strong>{customer.name} {customer.archived && <span className="count-pill">Archived</span>}</strong>
            <small>Joined {new Date(`${customer.joined}T12:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</small>
          </span>
        </button>
      ),
    },
    { key: 'phone', label: 'PHONE', render: (customer) => <span className="contact-cell"><Phone size={14} />{customer.phone}</span> },
    { key: 'email', label: 'EMAIL', render: (customer) => <span className="muted-cell">{customer.email || '—'}</span> },
    { key: 'city', label: 'LOCATION', render: (customer) => <span className="contact-cell"><MapPin size={14} />{customer.city || '—'}</span> },
    { key: 'orders', label: 'ORDERS', render: (customer) => <span className="count-pill">{orders.filter((order) => order.customerId === customer.id).length}</span> },
    {
      key: 'actions',
      label: '',
      render: (customer) => (
        <span className="row-actions">
          <button title="Edit customer" aria-label="Edit customer" onClick={() => openEdit(customer)}>
            <Pencil size={15} />
          </button>
          <button
            title={customer.archived ? 'Restore customer' : 'Archive customer'}
            aria-label={customer.archived ? 'Restore customer' : 'Archive customer'}
            onClick={() => toggleArchive(customer)}
          >
            {customer.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          </button>
        </span>
      ),
    },
  ]

  const activeCount = customers.filter((c) => !c.archived).length
  const archivedCount = customers.filter((c) => c.archived).length

  return <>
    <PageHeading eyebrow="YOUR CLIENTELE" title="Customers" description="Build lasting relationships with every fitting." action={<AddButton onClick={openNew}>Add customer</AddButton>} />
    {feedback && <div className={`customer-feedback customer-feedback-${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.text}</div>}
    <div className="page-summary">
      <span><strong>{activeCount}</strong> active {activeCount === 1 ? 'customer' : 'customers'} {archivedCount > 0 && `(${archivedCount} archived)`}</span>
      <span>Keep every fitting personal.</span>
    </div>
    <TableFrame title="All customers" note="Customer profiles and contact details">
      <div className="toolbar-inline">
        <SearchBox value={query} onChange={setQuery} placeholder="Search name, phone or email..." />
        <Select value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value)}>
          <option value="Active">Active customers</option>
          <option value="New this week">New this week</option>
          <option value="Archived">Archived customers</option>
          <option value="All">All customers</option>
        </Select>
        <span className="result-count">{filtered.length} results</span>
      </div>
      <DataTable columns={columns} rows={filtered} emptyMessage="No customers match your search." />
    </TableFrame>
    {modalOpen && <CustomerForm editing={editing} form={form} setForm={setForm} onSave={save} onClose={() => setModalOpen(false)} saving={saving} feedback={feedback} />}
    {selected && <Modal title={selected.name} description={selected.archived ? 'Customer profile (Archived)' : 'Customer profile'} onClose={() => setSelected(null)}>
      <div className="profile-details">
        <div className="profile-avatar large">{selected.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</div>
        <span><Mail size={15} />{selected.email || 'No email saved'}</span>
        <span><Phone size={15} />{selected.phone}</span>
        <span><MapPin size={15} />{[selected.address, selected.city].filter(Boolean).join(', ') || 'No address saved'}</span>
      </div>
      <div className="modal-section">
        <h3>Order history</h3>
        {orders.filter((order) => order.customerId === selected.id).map((order) => (
          <div className="history-row" key={order.id}>
            <span><strong>{order.id}</strong><small>{order.garment}</small></span>
            <span>{order.status}</span>
          </div>
        ))}
        {!orders.some((order) => order.customerId === selected.id) && <p className="form-hint">No orders yet.</p>}
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={() => openEdit(selected)}>Edit profile</Button>
        <Button variant="secondary" onClick={() => toggleArchive(selected)}>{selected.archived ? 'Restore customer' : 'Archive customer'}</Button>
        <Button onClick={() => setSelected(null)}>Done</Button>
      </div>
    </Modal>}
  </>
}

function CustomerForm({ editing, form, setForm, onSave, onClose, saving, feedback }) {
  return <Modal title={editing ? 'Edit customer' : 'Add customer'} description={editing ? 'Update this customer’s contact details.' : 'After saving, you’ll go straight to their measurement profile.'} onClose={onClose}><form onSubmit={onSave} className="form-stack">
    <FormField label="Customer name"><input required autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Ananya Iyer" /></FormField>
    <FormField label="Phone number"><input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98765 43210" /></FormField>
    <FormField label="Email address"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@email.com" /></FormField>
    <FormField label="Address"><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Street address" /></FormField>
    <FormField label="City"><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Mumbai" /></FormField>
    {feedback?.type === 'error' && <p className="customer-feedback customer-feedback-error" role="alert">{feedback.text}</p>}
    <div className="modal-actions"><Button variant="secondary" type="button" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add & record measurements'}</Button></div>
  </form></Modal>
}
