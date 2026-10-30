import { useMemo, useState } from 'react'
import { Mail, MapPin, Pencil, Phone, Trash2 } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { AddButton, Button, FormField, Modal, PageHeading, SearchBox, TableFrame } from '../components/UI.jsx'
import DataTable from '../components/DataTable.jsx'
import { validateDeletion, validateEntity } from '../services/validation.js'

const blank = { name: '', phone: '', email: '', city: '' }

export default function Customers() {
  const { customers, orders, measurements, payments, staff, inventory, addRecord, updateRecord, deleteRecord } = useAppData()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(blank)
  const filtered = useMemo(() => customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.email} ${customer.city}`.toLowerCase().includes(query.toLowerCase())), [customers, query])
  const openNew = () => { setEditing(null); setForm(blank); setSelected(null); setModalOpen(true) }
  const openEdit = (customer) => { setEditing(customer); setForm({ name: customer.name, phone: customer.phone, email: customer.email, city: customer.city }); setSelected(null); setModalOpen(true) }
  const save = async (event) => {
    event.preventDefault()
    const values = { ...form, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), city: form.city.trim() }
    const record = { ...values, id: editing?.id || 'pending-customer', joined: editing?.joined || new Date().toISOString().slice(0, 10) }
    const data = { customers, orders, measurements, payments, staff, inventory }
    const validation = validateEntity('customers', record, data, { existing: editing || undefined })
    if (!validation.valid) {
      window.alert(validation.error)
      return
    }
    const saved = editing
      ? await updateRecord('customers', editing.id, values)
      : await addRecord('customers', { ...values, joined: record.joined })
    if (!saved) return
    setEditing(null)
    setModalOpen(false)
  }
  const remove = (customer) => {
    const validation = validateDeletion('customers', customer, { orders, measurements })
    if (!validation.valid) {
      window.alert(validation.error)
      return
    }
    if (window.confirm(`Delete ${customer.name}?`)) deleteRecord('customers', customer.id)
  }
  const columns = [
    { key: 'name', label: 'CUSTOMER', render: (customer) => <button className="customer-button" onClick={() => setSelected(customer)}><span className="mini-avatar">{customer.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><span><strong>{customer.name}</strong><small>Joined {new Date(`${customer.joined}T12:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</small></span></button> },
    { key: 'phone', label: 'PHONE', render: (customer) => <span className="contact-cell"><Phone size={14} />{customer.phone}</span> },
    { key: 'email', label: 'EMAIL', render: (customer) => <span className="muted-cell">{customer.email || '—'}</span> },
    { key: 'city', label: 'LOCATION', render: (customer) => <span className="contact-cell"><MapPin size={14} />{customer.city || '—'}</span> },
    { key: 'orders', label: 'ORDERS', render: (customer) => <span className="count-pill">{orders.filter((order) => order.customerId === customer.id).length}</span> },
    { key: 'actions', label: '', render: (customer) => <span className="row-actions"><button title="Edit customer" aria-label="Edit customer" onClick={() => openEdit(customer)}><Pencil size={15} /></button><button title="Delete customer" aria-label="Delete customer" onClick={() => remove(customer)}><Trash2 size={15} /></button></span> },
  ]

  return <>
    <PageHeading eyebrow="YOUR CLIENTELE" title="Customers" description="Build lasting relationships with every fitting." action={<AddButton onClick={openNew}>Add customer</AddButton>} />
    <div className="page-summary"><span><strong>{customers.length}</strong> customers in your studio</span><span>Keep every fitting personal.</span></div>
    <TableFrame title="All customers" note="Customer profiles and contact details">
      <div className="toolbar-inline"><SearchBox value={query} onChange={setQuery} placeholder="Search name, phone or email..." /><span className="result-count">{filtered.length} results</span></div>
      <DataTable columns={columns} rows={filtered} emptyMessage="No customers match your search." />
    </TableFrame>
    {modalOpen && <CustomerForm editing={editing} form={form} setForm={setForm} onSave={save} onClose={() => setModalOpen(false)} />}
    {selected && <Modal title={selected.name} description="Customer profile" onClose={() => setSelected(null)}><div className="profile-details"><div className="profile-avatar large">{selected.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</div><span><Mail size={15} />{selected.email || 'No email saved'}</span><span><Phone size={15} />{selected.phone}</span><span><MapPin size={15} />{selected.city || 'No location saved'}</span></div><div className="modal-section"><h3>Order history</h3>{orders.filter((order) => order.customerId === selected.id).map((order) => <div className="history-row" key={order.id}><span><strong>{order.id}</strong><small>{order.garment}</small></span><span>{order.status}</span></div>)}{!orders.some((order) => order.customerId === selected.id) && <p className="form-hint">No orders yet.</p>}</div><div className="modal-actions"><Button variant="secondary" onClick={() => openEdit(selected)}>Edit profile</Button><Button onClick={() => setSelected(null)}>Done</Button></div></Modal>}
  </>
}

function CustomerForm({ editing, form, setForm, onSave, onClose }) {
  return <Modal title={editing ? 'Edit customer' : 'Add customer'} description="A few details to make every visit feel personal." onClose={onClose}><form onSubmit={onSave} className="form-stack">
    <FormField label="Full name"><input required autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Ananya Iyer" /></FormField>
    <FormField label="Phone number"><input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98765 43210" /></FormField>
    <FormField label="Email address"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@email.com" /></FormField>
    <FormField label="City"><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Mumbai" /></FormField>
    <div className="modal-actions"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit">{editing ? 'Save changes' : 'Add customer'}</Button></div>
  </form></Modal>
}
