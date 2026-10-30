import { useMemo, useState } from 'react'
import { AlertTriangle, Layers3, Pencil, Trash2 } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { formatCurrency } from '../services/formatters.js'
import { AddButton, Badge, Button, Card, FormField, Modal, PageHeading, SearchBox, TableFrame } from '../components/UI.jsx'
import DataTable from '../components/DataTable.jsx'
import { validateEntity } from '../services/validation.js'

const blank = { name: '', category: 'Fabric', sku: '', quantity: '', unit: 'metres', reorderAt: '', price: '' }

export default function Inventory() {
  const { inventory, settings, addRecord, updateRecord, deleteRecord } = useAppData()
  const money = (value) => formatCurrency(value, settings.currency)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All items')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const lowStock = inventory.filter((item) => Number(item.quantity) <= Number(item.reorderAt))
  const filtered = useMemo(() => inventory.filter((item) => `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All items' || (filter === 'Low stock' ? Number(item.quantity) <= Number(item.reorderAt) : item.category === filter))), [inventory, query, filter])
  const openNew = () => { setEditing(null); setForm(blank); setModalOpen(true) }
  const openEdit = (item) => { setEditing(item); setForm({ ...item, quantity: String(item.quantity), reorderAt: String(item.reorderAt), price: String(item.price) }); setModalOpen(true) }
  const save = async (event) => {
    event.preventDefault()
    const values = { ...form, name: form.name.trim(), sku: form.sku.trim(), quantity: Number(form.quantity), reorderAt: Number(form.reorderAt), price: Number(form.price) }
    const record = { ...values, id: editing?.id || 'pending-inventory' }
    const validation = validateEntity('inventory', record, { customers: [], measurements: [], orders: [], payments: [], staff: [], inventory }, { existing: editing || undefined })
    if (!validation.valid) {
      window.alert(validation.error)
      return
    }
    if (editing) {
      if (!await updateRecord('inventory', editing.id, values)) return
    } else if (!await addRecord('inventory', values)) return
    setModalOpen(false)
  }
  const adjust = (item, delta) => updateRecord('inventory', item.id, { quantity: Math.max(0, Number(item.quantity) + delta) })
  const remove = (item) => { if (window.confirm(`Remove ${item.name} from inventory?`)) deleteRecord('inventory', item.id) }
  const columns = [
    { key: 'name', label: 'ITEM', render: (item) => <span className="inventory-item"><span className="inventory-symbol"><Layers3 size={16} /></span><span><strong>{item.name}</strong><small>{item.sku}</small></span></span> },
    { key: 'category', label: 'CATEGORY', render: (item) => <Badge tone={item.category}>{item.category}</Badge> },
    { key: 'quantity', label: 'IN STOCK', render: (item) => <span className={`stock-quantity ${Number(item.quantity) <= Number(item.reorderAt) ? 'stock-low' : ''}`}><strong>{item.quantity}</strong> {item.unit}{Number(item.quantity) <= Number(item.reorderAt) && <AlertTriangle size={14} />}</span> },
    { key: 'reorderAt', label: 'REORDER AT', render: (item) => <span className="muted-cell">{item.reorderAt} {item.unit}</span> },
    { key: 'price', label: 'UNIT COST', render: (item) => money(item.price) },
    { key: 'actions', label: 'ADJUST', render: (item) => <div className="stock-actions"><button onClick={() => adjust(item, -1)} aria-label={`Decrease ${item.name} stock`} disabled={Number(item.quantity) === 0}>−</button><button onClick={() => adjust(item, 1)} aria-label={`Increase ${item.name} stock`}>+</button><button className="stock-edit" onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`}><Pencil size={14} /></button><button className="stock-edit" onClick={() => remove(item)} aria-label={`Delete ${item.name}`}><Trash2 size={14} /></button></div> },
  ]
  return <>
    <PageHeading eyebrow="MATERIALS & FINISHES" title="Inventory" description="Keep the right materials close at hand." action={<AddButton onClick={openNew}>Add item</AddButton>} />
    <div className="inventory-banner"><div className="inventory-banner-icon"><AlertTriangle size={18} /></div><div><strong>{!settings.lowStockAlerts ? 'Stock alerts are paused' : lowStock.length ? `${lowStock.length} item${lowStock.length > 1 ? 's' : ''} running low` : 'Stock levels look healthy'}</strong><p>{settings.lowStockAlerts && lowStock.length ? lowStock.map((item) => item.name).join(' · ') : settings.lowStockAlerts ? 'You’re all set for upcoming fittings.' : 'Low-stock levels remain visible in the stock room.'}</p></div><span className="inventory-banner-count">{settings.lowStockAlerts ? lowStock.length.toString().padStart(2, '0') : '—'}</span></div>
    <div className="inventory-stats"><Card><span>Total items</span><strong>{inventory.length}</strong></Card><Card><span>Fabric varieties</span><strong>{inventory.filter((item) => item.category === 'Fabric').length}</strong></Card><Card><span>Accessories</span><strong>{inventory.filter((item) => item.category !== 'Fabric').length}</strong></Card><Card><span>Low-stock alerts</span><strong className={lowStock.length ? 'warning-text' : ''}>{lowStock.length}</strong></Card></div>
    <TableFrame title="Stock room" note="Manage fabrics, trims and studio essentials"><div className="toolbar-inline"><SearchBox value={query} onChange={setQuery} placeholder="Search inventory..." /><div className="toolbar-actions"><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All items</option><option>Low stock</option><option>Fabric</option><option>Accessory</option></select></div></div><DataTable columns={columns} rows={filtered} emptyMessage="No inventory items match your search." /></TableFrame>
    {modalOpen && <Modal title={editing ? 'Edit inventory item' : 'Add inventory item'} description="Keep your stock room details current." onClose={() => setModalOpen(false)}><form className="form-stack" onSubmit={save}><FormField label="Item name"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Cotton poplin — white" /></FormField><div className="form-grid"><FormField label="Category"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Fabric</option><option>Accessory</option></select></FormField><FormField label="SKU"><input required value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></FormField><FormField label="Quantity"><input type="number" required min="0" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></FormField><FormField label="Unit"><select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}><option>metres</option><option>pieces</option><option>spools</option><option>rolls</option></select></FormField><FormField label="Low-stock threshold"><input type="number" required min="0" step="1" value={form.reorderAt} onChange={(event) => setForm({ ...form, reorderAt: event.target.value })} /></FormField><FormField label={`Unit cost (${settings.currency})`}><input type="number" required min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></FormField></div><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit">{editing ? 'Save changes' : 'Add item'}</Button></div></form></Modal>}
  </>
}
