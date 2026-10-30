import { useMemo, useState } from 'react'
import { Pencil, Phone, Trash2, UserRoundPlus } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { AddButton, Badge, Button, Card, FormField, Modal, PageHeading, SearchBox, TableFrame } from '../components/UI.jsx'
import DataTable from '../components/DataTable.jsx'
import { isActiveOrder } from '../services/orderWorkflow.js'
import { validateDeletion, validateEntity } from '../services/validation.js'

const blank = { name: '', role: 'Tailor', phone: '', email: '', active: true }
const roles = ['Master Tailor', 'Senior Tailor', 'Tailor', 'Finishing Specialist', 'Studio Assistant']

export default function Staff() {
  const { staff, orders, customers, measurements, payments, inventory, addRecord, updateRecord, deleteRecord } = useAppData()
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blank)
  const filtered = useMemo(() => staff.filter((member) => `${member.name} ${member.role} ${member.phone} ${member.email}`.toLowerCase().includes(query.toLowerCase())), [staff, query])
  const workload = (name) => orders.filter((order) => order.tailor === name && isActiveOrder(order)).length
  const openNew = () => { setEditing(null); setForm(blank); setModalOpen(true) }
  const openEdit = (member) => { setEditing(member); setForm({ name: member.name, role: member.role, phone: member.phone, email: member.email, active: member.active }); setModalOpen(true) }
  const save = async (event) => {
    event.preventDefault()
    const values = { ...form, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() }
    const record = { ...values, id: editing?.id || 'pending-staff' }
    const validation = validateEntity('staff', record, { customers, measurements, orders, payments, staff, inventory }, { existing: editing || undefined })
    if (!validation.valid) {
      window.alert(validation.error)
      return
    }
    if (editing) {
      if (!await updateRecord('staff', editing.id, values)) return
    } else if (!await addRecord('staff', values)) return
    setModalOpen(false)
  }
  const remove = (member) => {
    const validation = validateDeletion('staff', member, { orders })
    if (!validation.valid) {
      window.alert(validation.error)
      return
    }
    if (window.confirm(`Remove ${member.name} from the team?`)) deleteRecord('staff', member.id)
  }
  const columns = [
    { key: 'name', label: 'TEAM MEMBER', render: (member) => <span className="customer-cell"><span className="mini-avatar staff-avatar">{member.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></span> },
    { key: 'role', label: 'ROLE', render: (member) => <Badge tone="version">{member.role}</Badge> },
    { key: 'phone', label: 'PHONE', render: (member) => <span className="contact-cell"><Phone size={14} />{member.phone}</span> },
    { key: 'workload', label: 'ACTIVE ORDERS', render: (member) => <span className="workload-cell"><span className="workload-bar"><i style={{ width: `${Math.min(100, workload(member.name) * 22)}%` }} /></span><strong>{workload(member.name)}</strong></span> },
    { key: 'active', label: 'STATUS', render: (member) => <Badge tone={member.active ? 'active' : 'inactive'}>{member.active ? 'Active' : 'Away'}</Badge> },
    { key: 'actions', label: '', render: (member) => <span className="row-actions"><button title="Edit staff member" aria-label="Edit staff member" onClick={() => openEdit(member)}><Pencil size={15} /></button><button title="Remove staff member" aria-label="Remove staff member" onClick={() => remove(member)}><Trash2 size={15} /></button></span> },
  ]
  return <>
    <PageHeading eyebrow="THE HANDS BEHIND THE CRAFT" title="Our people" description="A thoughtful team makes every finished piece special." action={<AddButton icon={UserRoundPlus} onClick={openNew}>Add team member</AddButton>} />
    <div className="staff-overview">{roles.slice(0, 4).map((role, index) => <Card className="role-card" key={role}><span className={`role-icon role-${index}`}>{['✳', '✂', '◌', '⌁'][index]}</span><div><span>{role}</span><strong>{staff.filter((member) => member.role === role).length}</strong></div></Card>)}</div>
    <TableFrame title="Team roster" note={`${staff.length} people · order workload updates automatically`}><div className="toolbar-inline"><SearchBox value={query} onChange={setQuery} placeholder="Search team members..." /><span className="result-count">{filtered.length} people</span></div><DataTable columns={columns} rows={filtered} emptyMessage="No team members match your search." /></TableFrame>
    {modalOpen && <Modal title={editing ? 'Edit team member' : 'Add team member'} description="Keep your studio roster up to date." onClose={() => setModalOpen(false)}><form className="form-stack" onSubmit={save}><FormField label="Full name"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Kavita Rao" /></FormField><FormField label="Role"><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></FormField><FormField label="Phone number"><input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></FormField><FormField label="Email address"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></FormField><FormField label="Availability"><select value={form.active ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, active: event.target.value === 'yes' })}><option value="yes">Active</option><option value="no">Away</option></select></FormField><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit">{editing ? 'Save changes' : 'Add to team'}</Button></div></form></Modal>}
  </>
}
