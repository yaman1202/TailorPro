import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clock3, Pencil, Plus, Ruler, Trash2 } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { AddButton, Badge, Button, FormField, Modal, PageHeading, SearchBox, Select, TableFrame } from '../components/UI.jsx'
import DataTable from '../components/DataTable.jsx'
import { convertMeasurementValues, copyMeasurementValues, measurementFields, measurementTemplates } from '../data/measurementTemplates.js'
import { validateEntity } from '../services/validation.js'

const blankMeasurement = { customerId: '', garment: 'Shirt', unit: 'in', values: {} }
const newCustomerOption = '__new_customer__'
const blankCustomer = { name: '', phone: '', email: '', address: '', city: '' }

function initials(name) {
  return name.split(' ').map((word) => word[0]).slice(0, 2).join('')
}

export default function Measurements() {
  const { measurements, customers, orders, payments, staff, inventory, addRecord, createCustomer } = useAppData()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [historyProfile, setHistoryProfile] = useState(null)
  const [customFieldName, setCustomFieldName] = useState('')
  const [form, setForm] = useState(blankMeasurement)
  const [newCustomer, setNewCustomer] = useState(blankCustomer)
  const [customerFeedback, setCustomerFeedback] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)
  const routeCustomerId = searchParams.get('customerId')
  const modalOpen = manualModalOpen || Boolean(routeCustomerId && customers.some((customer) => customer.id === routeCustomerId))
  const selectedCustomerId = form.customerId || routeCustomerId || ''
  const customerName = (id) => customers.find((customer) => customer.id === id)?.name || 'Unknown customer'
  const filtered = useMemo(() => measurements.filter((profile) => (
    `${customers.find((customer) => customer.id === profile.customerId)?.name || 'Unknown customer'} ${profile.garment}`.toLowerCase().includes(query.toLowerCase())
  )), [measurements, customers, query])
  const templateFields = measurementFields[form.garment] || []
  const customFields = Object.keys(form.values).filter((field) => !templateFields.includes(field))

  const openNew = (profile) => {
    setForm({
      customerId: profile?.customerId || '',
      garment: profile?.garment || 'Shirt',
      unit: profile?.unit || 'in',
      values: profile ? copyMeasurementValues(profile) : {},
    })
    setCustomFieldName('')
    setNewCustomer(blankCustomer)
    setCustomerFeedback('')
    setManualModalOpen(true)
  }

  const closeMeasurementModal = () => {
    setManualModalOpen(false)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('customerId')
    nextParams.delete('open')
    setSearchParams(nextParams, { replace: true })
  }

  const addCustomerAndContinue = async () => {
    if (savingCustomer) return
    setSavingCustomer(true)
    setCustomerFeedback('')
    const values = Object.fromEntries(Object.entries(newCustomer).map(([field, value]) => [field, value.trim()]))
    const joined = new Date().toISOString().slice(0, 10)
    const validation = validateEntity('customers', { ...values, id: 'pending-customer', joined }, {
      customers,
      measurements,
      orders,
      payments,
      staff,
      inventory,
    })
    if (!validation.valid) {
      setCustomerFeedback(validation.error)
      setSavingCustomer(false)
      return
    }

    try {
      const result = await createCustomer({ ...values, joined })
      if (!result.record) {
        setCustomerFeedback(result.error || 'Customer could not be saved.')
        return
      }
      setForm((current) => ({ ...current, customerId: result.record.id }))
      setNewCustomer(blankCustomer)
      setCustomerFeedback('')
    } finally {
      setSavingCustomer(false)
    }
  }

  const setGarment = (garment) => setForm((current) => ({ ...current, garment, values: {} }))
  const setUnit = (unit) => setForm((current) => ({
    ...current,
    unit,
    values: convertMeasurementValues(current.values, current.unit, unit),
  }))

  const addCustomField = () => {
    const label = customFieldName.trim()
    if (!label) {
      window.alert('Enter a name for the custom measurement.')
      return
    }
    if (Object.keys(form.values).some((field) => field.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      window.alert('A measurement with that name already exists.')
      return
    }
    if (Object.keys(form.values).length >= 32) {
      window.alert('A measurement profile cannot contain more than 32 fields.')
      return
    }
    setForm((current) => ({ ...current, values: { ...current.values, [label]: '' } }))
    setCustomFieldName('')
  }

  const removeCustomField = (field) => setForm((current) => ({
    ...current,
    values: Object.fromEntries(Object.entries(current.values).filter(([name]) => name !== field)),
  }))

  const save = async (event) => {
    event.preventDefault()
    const customer = customers.find((item) => item.id === selectedCustomerId)
    if (!customer) {
      window.alert('Select a customer before saving measurements.')
      return
    }
    const version = measurements
      .filter((item) => item.customerId === customer.id && item.garment === form.garment)
      .reduce((max, item) => Math.max(max, item.version || 0), 0) + 1
    const values = Object.fromEntries(Object.entries(form.values).map(([field, value]) => [field, String(value).trim()]))
    const record = {
      customerId: customer.id,
      customer: customer.name,
      garment: form.garment,
      date: new Date().toISOString().slice(0, 10),
      version,
      unit: form.unit,
      values,
    }
    const validation = validateEntity('measurements', { ...record, id: 'pending-measurement' }, { customers, measurements, orders, payments, staff, inventory })
    if (!validation.valid) {
      window.alert(validation.error)
      return
    }
    if (await addRecord('measurements', record)) closeMeasurementModal()
  }

  const columns = [
    { key: 'customer', label: 'CUSTOMER', render: (profile) => {
      const name = customerName(profile.customerId)
      return <span className="customer-cell"><span className="mini-avatar">{initials(name)}</span><strong>{name}</strong></span>
    } },
    { key: 'garment', label: 'GARMENT', render: (profile) => <span className="garment-name"><Ruler size={15} />{profile.garment}</span> },
    { key: 'version', label: 'VERSION', render: (profile) => <Badge tone="version">Version {profile.version}</Badge> },
    { key: 'date', label: 'RECORDED', render: (profile) => new Date(`${profile.date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
    { key: 'summary', label: 'MEASUREMENTS', render: (profile) => <span className="muted-cell">{Object.keys(profile.values || {}).slice(0, 3).map((key) => `${key} ${profile.values[key]} ${profile.unit || 'in'}`).join(' · ')}</span> },
    { key: 'action', label: '', render: (profile) => <span className="row-actions"><button title="View history" aria-label="View measurement history" onClick={() => setHistoryProfile(profile)}><Clock3 size={15} /></button><button title="Add new version" aria-label="Add new measurement version" onClick={() => openNew(profile)}><Pencil size={15} /></button></span> },
  ]
  const customerMeasurementRows = customers
    .filter((customer) => !customer.archived)
    .filter((customer) => `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase()))
    .map((customer) => {
      const profiles = measurements.filter((profile) => profile.customerId === customer.id)
      return { ...customer, measurementProfiles: profiles }
    })
  const customerStatusColumns = [
    { key: 'name', label: 'CUSTOMER', render: (customer) => <span className="customer-cell"><span className="mini-avatar">{initials(customer.name)}</span><strong>{customer.name}</strong></span> },
    { key: 'measurementStatus', label: 'MEASUREMENT STATUS', render: (customer) => <Badge tone={customer.measurementProfiles.length ? 'current' : 'cancelled'}>{customer.measurementProfiles.length ? 'Measurement done' : 'Not done'}</Badge> },
    { key: 'profiles', label: 'SAVED PROFILES', render: (customer) => customer.measurementProfiles.length },
    { key: 'action', label: '', render: (customer) => <Button type="button" className="measurement-record-button" icon={Ruler} onClick={() => openNew({ customerId: customer.id })}>{customer.measurementProfiles.length ? 'Add measurements' : 'Record measurement'}</Button> },
  ]

  return <>
    <PageHeading eyebrow="THE PERFECT FIT" title="Measurements" description="Keep every fit just right, version after version." action={<AddButton onClick={() => openNew()}>New measurements</AddButton>} />
    <div className="info-banner"><div className="info-icon"><Ruler size={18} /></div><div><strong>Every version is kept safe.</strong><p>Choose a garment-specific template, record in inches or centimetres, and save a new version without replacing fitting history.</p></div></div>
    <TableFrame title="Customer measurement status" note="A customer is marked done once a fitting profile has been saved">
      <div className="toolbar-inline"><SearchBox value={query} onChange={setQuery} placeholder="Search customer or garment..." /><span className="result-count">{customerMeasurementRows.filter((customer) => customer.measurementProfiles.length).length} done · {customerMeasurementRows.filter((customer) => !customer.measurementProfiles.length).length} not done</span></div>
      <DataTable columns={customerStatusColumns} rows={customerMeasurementRows} emptyMessage="No customers match your search." />
    </TableFrame>
    <TableFrame title="Measurement profiles" note={`${measurements.length} saved fitting profiles`}>
      <div className="toolbar-inline"><SearchBox value={query} onChange={setQuery} placeholder="Search customer or garment..." /><span className="result-count">{filtered.length} profiles</span></div>
      <DataTable columns={columns} rows={filtered} emptyMessage="No measurement profiles match your search." />
    </TableFrame>
    {modalOpen && <Modal title="Save measurements" description="A new version will be created. Previous measurements are never replaced." onClose={closeMeasurementModal} wide><form onSubmit={save} className="form-stack">
      <div className="form-grid">
        <FormField label="Customer"><Select required value={form.customerId || routeCustomerId || ''} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}><option value="">Choose existing or new customer</option>{customers.filter((customer) => !customer.archived || customer.id === selectedCustomerId).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}<option value={newCustomerOption}>+ Add a new customer</option></Select></FormField>
      </div>
      {form.customerId === newCustomerOption && <div className="inline-customer-create">
        <div className="inline-customer-heading"><strong>New customer</strong><small>Save their details to continue straight to measurements.</small></div>
        <div className="form-grid">
          <FormField label="Customer name"><input required value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} /></FormField>
          <FormField label="Phone number"><input required type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} /></FormField>
          <FormField label="Email address"><input type="email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} /></FormField>
          <FormField label="City"><input value={newCustomer.city} onChange={(event) => setNewCustomer({ ...newCustomer, city: event.target.value })} /></FormField>
          <FormField label="Address"><input value={newCustomer.address} onChange={(event) => setNewCustomer({ ...newCustomer, address: event.target.value })} /></FormField>
        </div>
        {customerFeedback && <p className="customer-feedback customer-feedback-error" role="alert">{customerFeedback}</p>}
        <Button type="button" disabled={savingCustomer} onClick={addCustomerAndContinue}>{savingCustomer ? 'Saving customer…' : 'Save customer & continue to measurements'}</Button>
      </div>}
      {selectedCustomerId && selectedCustomerId !== newCustomerOption && <>
      <div className="form-grid">
        <FormField label="Garment profile"><Select value={form.garment} onChange={(event) => setGarment(event.target.value)}>{measurementTemplates.map(({ group, garments }) => <optgroup key={group} label={group}>{garments.map(({ name }) => <option key={name}>{name}</option>)}</optgroup>)}</Select></FormField>
        <FormField label="Measurement unit"><Select value={form.unit} onChange={(event) => setUnit(event.target.value)}><option value="in">Inches (in)</option><option value="cm">Centimetres (cm)</option></Select></FormField>
      </div>
      <div className="form-divider"><span>{form.garment} measurements</span><small>Required fields · values in {form.unit === 'in' ? 'inches' : 'centimetres'}</small></div>
      <div className="measurement-fields">{templateFields.map((label) => <FormField key={label} label={label}><div className="unit-input"><input type="number" step="0.1" min="0" required value={form.values[label] || ''} onChange={(event) => setForm((current) => ({ ...current, values: { ...current.values, [label]: event.target.value } }))} placeholder="0.0" /><span>{form.unit}</span></div></FormField>)}</div>
      <div className="custom-measurements">
        <div className="custom-measurements-heading"><div><strong>Custom measurements</strong><small>Add a shop-specific fitting detail.</small></div></div>
        <div className="custom-field-add"><input aria-label="Custom measurement name" value={customFieldName} onChange={(event) => setCustomFieldName(event.target.value)} placeholder="e.g. Shoulder to waist" /><Button type="button" variant="secondary" onClick={addCustomField}><Plus size={14} />Add field</Button></div>
        {customFields.map((field) => <div className="custom-field-row" key={field}><FormField label={field}><div className="unit-input"><input type="number" step="0.1" min="0" required value={form.values[field] || ''} onChange={(event) => setForm((current) => ({ ...current, values: { ...current.values, [field]: event.target.value } }))} placeholder="0.0" /><span>{form.unit}</span></div></FormField><button type="button" className="icon-button" aria-label={`Remove ${field}`} onClick={() => removeCustomField(field)}><Trash2 size={15} /></button></div>)}
      </div>
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={closeMeasurementModal}>Cancel</Button><Button type="submit">Save new version</Button></div>
      </>}
    </form></Modal>}
    {historyProfile && <Modal title="Fitting history" description={`${customerName(historyProfile.customerId)} · ${historyProfile.garment}`} onClose={() => setHistoryProfile(null)}><div className="version-history">{measurements.filter((item) => item.customerId === historyProfile.customerId && item.garment === historyProfile.garment).sort((a, b) => b.version - a.version).map((profile, index) => <div className={`version-item ${index === 0 ? 'current' : ''}`} key={profile.id}><div className="version-heading"><div><strong>Version {profile.version}</strong>{index === 0 && <Badge tone="current">Latest</Badge>}</div><span>{new Date(`${profile.date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {profile.unit || 'in'}</span></div><div className="version-measures">{Object.entries(profile.values || {}).map(([key, value]) => <span key={key}>{key}<strong>{value} {profile.unit || 'in'}</strong></span>)}</div></div>)}</div><div className="modal-actions"><Button variant="secondary" onClick={() => setHistoryProfile(null)}>Close</Button><Button onClick={() => { setHistoryProfile(null); openNew(historyProfile) }}>Copy into new version</Button></div></Modal>}
  </>
}
