import { useState } from 'react'
import { Camera, ImagePlus, Plus, Ruler, Trash2, UserCheck, X } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { getLocalDateKey } from '../services/formatters.js'
import { createOrderId, normalizeMoney, paymentMethods } from '../services/orderAccounting.js'
import { createOrderRecord } from '../services/orderWorkflow.js'
import { Button, FormField, Modal, Select } from './UI.jsx'
import { getMeasurementGarmentsForOrder, measurementFields } from '../data/measurementTemplates.js'
import { validateEntity } from '../services/validation.js'

const garments = [
  'Shirt',
  'Formal shirt',
  'Trouser',
  'Suit/Blazer',
  'Two-piece suit',
  'Kurta',
  'Blouse',
  'Suit',
  'Dress',
  'Anarkali suit',
  'Evening dress',
]

const emptyCustomer = { name: '', phone: '', email: '', address: '', city: '' }

function createMeasurementId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return `m-${suffix}`
}

function getInitialForm(editing, presetCustomer) {
  if (editing) {
    return {
      customerId: editing.customerId,
      garment: editing.garment,
      measurementId: editing.measurementId || '',
      tailor: editing.tailor || '',
      dueDate: editing.dueDate,
      amount: editing.amount,
      advance: editing.advance,
    }
  }
  return {
    customerId: presetCustomer?.id || '',
    garment: 'Formal shirt',
    measurementId: '',
    tailor: '',
    dueDate: '',
    amount: '',
    advance: '',
  }
}

export default function OrderFormModal({ editing = null, presetCustomer = null, onClose, onSuccess }) {
  const {
    orders,
    customers,
    measurements,
    staff,
    payments,
    inventory = [],
    settings,
    createCustomer,
    createOrder,
    updateOrder,
  } = useAppData()

  const [form, setForm] = useState(() => getInitialForm(editing, presetCustomer))
  const [measurementUnit, setMeasurementUnit] = useState('in')
  const [measurementValues, setMeasurementValues] = useState({})
  const [customFieldName, setCustomFieldName] = useState('')
  const [advanceMethod, setAdvanceMethod] = useState('Cash')
  const [newCustomer, setNewCustomer] = useState(emptyCustomer)
  const [createdCustomer, setCreatedCustomer] = useState(null)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [customerFeedback, setCustomerFeedback] = useState(null)
  const [orderFeedback, setOrderFeedback] = useState('')
  const [savingOrder, setSavingOrder] = useState(false)
  const [measurementPhoto, setMeasurementPhoto] = useState(null)
  const [measurementPhotoError, setMeasurementPhotoError] = useState('')

  const activePresetCustomer = presetCustomer || createdCustomer
  const selectedCustomerId = editing ? form.customerId : activePresetCustomer?.id || ''
  const isNewCustomerMode = !editing && !activePresetCustomer
  const today = getLocalDateKey()
  const normalizePhoneDigits = (phone) => String(phone || '').replace(/\D/g, '')
  const enteredDigits = normalizePhoneDigits(newCustomer.phone)
  const duplicatePhoneCustomer = enteredDigits.length >= 6
    ? customers.find((customer) => normalizePhoneDigits(customer.phone) === enteredDigits)
    : null

  const availableMeasurements = selectedCustomerId
    ? measurements
      .filter((profile) => profile.customerId === selectedCustomerId && getMeasurementGarmentsForOrder(form.garment).includes(profile.garment))
      .sort((left, right) => Number(right.version) - Number(left.version))
    : []

  const measurementGarment = getMeasurementGarmentsForOrder(form.garment)
    .find((garment) => measurementFields[garment])
  const currentMeasurementFields = measurementFields[measurementGarment] || []
  const customMeasurementFields = Object.keys(measurementValues).filter((field) => !currentMeasurementFields.includes(field))

  const addCustomMeasurementField = () => {
    const label = customFieldName.trim()
    if (!label) {
      setOrderFeedback('Enter a name for the custom measurement field.')
      return
    }
    const existingKeys = new Set([...currentMeasurementFields, ...customMeasurementFields].map((field) => field.toLocaleLowerCase()))
    if (existingKeys.has(label.toLocaleLowerCase())) {
      setOrderFeedback('A measurement field with that name already exists.')
      return
    }
    if (currentMeasurementFields.length + customMeasurementFields.length >= 32) {
      setOrderFeedback('A measurement profile cannot contain more than 32 fields.')
      return
    }
    setOrderFeedback('')
    setMeasurementValues((current) => ({ ...current, [label]: '' }))
    setCustomFieldName('')
  }

  const removeCustomMeasurementField = (field) => {
    setMeasurementValues((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== field)))
  }

  const buildTrimmedCustomer = () => {
    const values = Object.fromEntries(Object.entries(newCustomer).map(([field, value]) => [field, value.trim()]))
    return { values, joined: today }
  }

  const addCustomerFromOrder = async () => {
    if (savingCustomer || savingOrder) return
    const { values, joined } = buildTrimmedCustomer()
    const candidate = { ...values, id: 'pending-customer', joined }
    const validation = validateEntity('customers', candidate, { customers, orders, measurements, payments, staff, inventory })
    if (!validation.valid) {
      setCustomerFeedback({ type: 'error', text: validation.error })
      return
    }

    setSavingCustomer(true)
    setCustomerFeedback(null)
    setOrderFeedback('')
    try {
      const { record, error } = await createCustomer({ ...values, joined })
      if (!record) {
        setCustomerFeedback({ type: 'error', text: error || 'Customer could not be saved. Check the repository status and try again.' })
        return
      }
      setCreatedCustomer(record)
      setForm((current) => ({ ...current, customerId: record.id, measurementId: '' }))
      setNewCustomer(emptyCustomer)
      setCustomerFeedback({ type: 'success', text: `${record.name} was saved for this order.` })
    } finally {
      setSavingCustomer(false)
    }
  }

  const save = async (event) => {
    event.preventDefault()
    if (savingOrder || savingCustomer) return
    setSavingOrder(true)
    setOrderFeedback('')
    setMeasurementPhotoError('')
    setCustomerFeedback((current) => (current?.type === 'success' ? current : null))

    const baseData = { customers, measurements, orders, payments, staff, inventory }
    let targetCustomer = editing
      ? customers.find((item) => item.id === form.customerId)
      : activePresetCustomer
    let pendingCustomerValues = null

    if (!editing && !targetCustomer) {
      const { values, joined } = buildTrimmedCustomer()
      const candidate = { ...values, id: 'pending-customer', joined }
      const customerValidation = validateEntity('customers', candidate, baseData)
      if (!customerValidation.valid) {
        setCustomerFeedback({ type: 'error', text: customerValidation.error })
        setSavingOrder(false)
        return
      }
      targetCustomer = candidate
      pendingCustomerValues = { ...values, joined }
    }

    if (!targetCustomer) {
      setOrderFeedback('Select a customer before saving this order.')
      setSavingOrder(false)
      return
    }

    if (!editing && targetCustomer.archived) {
      setOrderFeedback('Cannot create a new order for an archived customer. Restore the customer first.')
      setSavingOrder(false)
      return
    }

    const templateFields = measurementFields[measurementGarment] || []
    const allFields = [...templateFields, ...customMeasurementFields]
    const hasMeasurementInput = !editing && allFields.some((field) => String(measurementValues[field] || '').trim() !== '')
    let newMeasurement
    if (hasMeasurementInput) {
      const version = measurements
        .filter((profile) => profile.customerId === targetCustomer.id && profile.garment === measurementGarment)
        .reduce((max, profile) => Math.max(max, profile.version || 0), 0) + 1
      newMeasurement = {
        id: createMeasurementId(),
        customerId: targetCustomer.id,
        customer: targetCustomer.name,
        garment: measurementGarment,
        date: today,
        version,
        unit: measurementUnit,
        values: Object.fromEntries(
          allFields
            .map((field) => [field, String(measurementValues[field] || '').trim()])
            .filter(([, value]) => value !== ''),
        ),
      }
      const validationData = pendingCustomerValues
        ? { ...baseData, customers: [targetCustomer, ...customers] }
        : baseData
      const measurementValidation = validateEntity('measurements', newMeasurement, validationData)
      if (!measurementValidation.valid) {
        setOrderFeedback(measurementValidation.error)
        setSavingOrder(false)
        return
      }
    }

    const orderValues = {
      customerId: targetCustomer.id,
      customer: targetCustomer.name,
      garment: form.garment,
      ...((newMeasurement?.id || form.measurementId) ? { measurementId: newMeasurement?.id || form.measurementId } : {}),
      tailor: form.tailor,
      dueDate: form.dueDate,
      amount: normalizeMoney(form.amount),
      advance: normalizeMoney(form.advance || 0),
    }

    if (editing) {
      const validation = validateEntity('orders', { ...editing, ...orderValues }, baseData, { existing: editing })
      if (!validation.valid) {
        setOrderFeedback(validation.error)
        setSavingOrder(false)
        return
      }
      const updated = await updateOrder(editing.id, orderValues)
      if (!updated) {
        setOrderFeedback('Order could not be updated. Review any repository error banner and retry.')
        setSavingOrder(false)
        return
      }
      onSuccess?.(updated, targetCustomer)
      onClose()
      setSavingOrder(false)
      return
    }

    const id = createOrderId()
    const order = createOrderRecord(orderValues, id)
    const validationData = {
      ...baseData,
      customers: pendingCustomerValues ? [targetCustomer, ...customers] : customers,
      measurements: newMeasurement ? [newMeasurement, ...measurements] : measurements,
    }
    const orderValidation = validateEntity('orders', order, validationData)
    if (!orderValidation.valid) {
      setOrderFeedback(orderValidation.error)
      setSavingOrder(false)
      return
    }

    if (orderValues.advance > 0) {
      const paymentValidation = validateEntity('payments', {
        id: 'pending-advance',
        orderId: id,
        customer: targetCustomer.name,
        date: today,
        amount: orderValues.advance,
        method: advanceMethod,
        type: 'Advance',
      }, { ...validationData, orders: [order, ...orders] })
      if (!paymentValidation.valid) {
        setOrderFeedback(paymentValidation.error)
        setSavingOrder(false)
        return
      }
    }

    if (pendingCustomerValues) {
      const { record, error } = await createCustomer(pendingCustomerValues)
      if (!record) {
        setCustomerFeedback({ type: 'error', text: error || 'Customer could not be saved. Check the repository status and try again.' })
        setSavingOrder(false)
        return
      }
      setCreatedCustomer(record)
      setForm((current) => ({ ...current, customerId: record.id }))
      targetCustomer = record
      order.customerId = record.id
      order.customer = record.name
      if (newMeasurement) {
        newMeasurement = {
          ...newMeasurement,
          customerId: record.id,
          customer: record.name,
        }
      }
    }

    const initialPayment = orderValues.advance > 0
      ? { orderId: id, customer: targetCustomer.name, date: today, amount: orderValues.advance, method: advanceMethod, type: 'Advance' }
      : undefined


    let uploadedPhoto = null
    if (measurementPhoto) {
      try {
        const { uploadOrderMeasurementPhoto } = await import('../services/firebase/orderMeasurementPhotos.js')
        uploadedPhoto = await uploadOrderMeasurementPhoto({ orderId: id, file: measurementPhoto })
        order.measurementPhoto = uploadedPhoto
      } catch (error) {
        setOrderFeedback(error.message || 'Measurement photo could not be uploaded. Please try again.')
        setSavingOrder(false)
        return
      }
    }

    const created = await createOrder(order, initialPayment, newMeasurement)
    if (!created) {
      if (uploadedPhoto) {
        try {
          const { deleteOrderMeasurementPhoto } = await import('../services/firebase/orderMeasurementPhotos.js')
          await deleteOrderMeasurementPhoto(uploadedPhoto.path)
        } catch (cleanupError) {
          console.error('Unable to clean up orphaned measurement photo:', cleanupError)
        }
      }
      setOrderFeedback('Order could not be saved. Review any error notice above and try again.')
      setSavingOrder(false)
      return
    }
    onSuccess?.(created, targetCustomer)
    onClose()
    setSavingOrder(false)
  }

  return (
    <Modal
      title={editing ? 'Edit order' : 'Create an order'}
      description={
        editing
          ? 'Make a note of the details and we’ll take it from here.'
          : presetCustomer
            ? `Creating a new order for ${presetCustomer.name}.`
            : 'Add the new customer details and order information together.'
      }
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={save}>
        <div className="form-grid">
          {editing ? (
            <FormField label="Customer">
              <Select
                required
                disabled={Boolean(payments.some((payment) => payment.orderId === editing.id))}
                value={form.customerId}
                onChange={(event) => {
                  const customerId = event.target.value
                  setForm({ ...form, customerId, measurementId: '' })
                  setMeasurementValues({})
                }}
              >
                <option value="">Select a customer</option>
                {customers
                  .filter((customer) => !customer.archived || editing.customerId === customer.id)
                  .map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
              </Select>
              {payments.some((payment) => payment.orderId === editing.id) && (
                <small className="field-note">Customer is locked after payments are recorded.</small>
              )}
            </FormField>
          ) : isNewCustomerMode ? (
            <div className="inline-customer-create">
              <div className="inline-customer-heading">
                <strong>New customer</strong>
                <small>Required: name and phone number. Saving creates the customer and their order.</small>
              </div>
              <div className="form-grid">
                <FormField label="Customer name">
                  <input
                    required
                    autoFocus
                    value={newCustomer.name}
                    onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })}
                    placeholder="Full name"
                  />
                </FormField>
                <FormField label="Phone number">
                  <input
                    required
                    type="tel"
                    value={newCustomer.phone}
                    onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })}
                    placeholder="Phone number"
                  />
                </FormField>
                <FormField label="Email address">
                  <input
                    type="email"
                    value={newCustomer.email}
                    onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })}
                    placeholder="Optional"
                  />
                </FormField>
                <FormField label="City">
                  <input
                    value={newCustomer.city}
                    onChange={(event) => setNewCustomer({ ...newCustomer, city: event.target.value })}
                    placeholder="Optional"
                  />
                </FormField>
                <FormField label="Address">
                  <input
                    value={newCustomer.address}
                    onChange={(event) => setNewCustomer({ ...newCustomer, address: event.target.value })}
                    placeholder="Optional"
                  />
                </FormField>
              </div>
              {duplicatePhoneCustomer && (
                <p className="field-note" role="status">
                  Note: phone number matches existing customer {duplicatePhoneCustomer.name} ({duplicatePhoneCustomer.phone}).
                </p>
              )}
              {customerFeedback && (
                <p
                  className={`customer-feedback customer-feedback-${customerFeedback.type}`}
                  role={customerFeedback.type === 'error' ? 'alert' : 'status'}
                >
                  {customerFeedback.text}
                </p>
              )}
              <div>
                <Button type="button" variant="secondary" disabled={savingCustomer || savingOrder} onClick={addCustomerFromOrder}>
                  {savingCustomer ? 'Saving customer…' : 'Save customer first'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="selected-customer-banner">
              <span className="selected-customer-icon"><UserCheck size={17} /></span>
              <div>
                <strong>{activePresetCustomer.name}</strong>
                <small>
                  {[activePresetCustomer.phone, activePresetCustomer.city].filter(Boolean).join(' · ')}
                </small>
              </div>
            </div>
          )}

          {customerFeedback?.type === 'success' && !isNewCustomerMode && (
            <p className="customer-feedback customer-feedback-success selected-customer-feedback" role="status">
              {customerFeedback.text}
            </p>
          )}

          <FormField label="Garment type">
            <Select
              value={form.garment}
              onChange={(event) => {
                setForm({ ...form, garment: event.target.value, measurementId: '' })
                setMeasurementValues({})
              }}
            >
              {garments.map((garment) => <option key={garment}>{garment}</option>)}
            </Select>
          </FormField>

          {(editing || activePresetCustomer) && (
            <FormField label="Previous measurement profile">
              <Select value={form.measurementId || ''} onChange={(event) => setForm({ ...form, measurementId: event.target.value })}>
                <option value="">No profile linked</option>
                {availableMeasurements.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    Version {profile.version} · {profile.garment} · {profile.unit || 'in'}
                  </option>
                ))}
              </Select>
              {availableMeasurements.length === 0 && selectedCustomerId && (
                <small className="field-note">No saved profile for this customer and garment yet.</small>
              )}
            </FormField>
          )}


          {!editing && (
            <section className="order-inline-measurements order-measurement-photo-section">
              <div className="order-inline-measurements-heading">
                <span className="measurement-record-icon"><Camera size={17} /></span>
                <div>
                  <strong>Handwritten measurement sheet</strong>
                  <small>Take a photo of the handwritten measurements or choose an existing image. Optional, one photo per order.</small>
                </div>
              </div>
              <input
                id="order-measurement-photo"
                className="measurement-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null
                  setMeasurementPhotoError('')
                  if (!file) return
                  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                    setMeasurementPhotoError('Choose a JPG, PNG or WEBP image.')
                    event.target.value = ''
                    return
                  }
                  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
                    setMeasurementPhotoError('Photo must be greater than 0 bytes and 10 MB or smaller.')
                    event.target.value = ''
                    return
                  }
                  setMeasurementPhoto(file)
                }}
              />
              <div className="measurement-photo-actions">
                <label className="button button-secondary" htmlFor="order-measurement-photo"><Camera size={15} /> Take photo / choose file</label>
              </div>
              {measurementPhoto && (
                <div className="measurement-photo-selected">
                  <ImagePlus size={16} />
                  <span>{measurementPhoto.name} · {(measurementPhoto.size / 1024 / 1024).toFixed(2)} MB</span>
                  <button type="button" className="icon-button" aria-label="Remove selected measurement photo" onClick={() => setMeasurementPhoto(null)}><X size={15} /></button>
                </div>
              )}
              {measurementPhotoError && <p className="customer-feedback customer-feedback-error" role="alert">{measurementPhotoError}</p>}
            </section>
          )}

          {!editing && (
            <section className="order-inline-measurements">
              <div className="order-inline-measurements-heading">
                <span className="measurement-record-icon"><Ruler size={17} /></span>
                <div>
                  <strong>Measurements · {measurementGarment}</strong>
                  <small>Optional. Enter any garment measurements to save a new linked profile with this order.</small>
                </div>
              </div>
              <FormField label="Measurement unit">
                <Select value={measurementUnit} onChange={(event) => setMeasurementUnit(event.target.value)}>
                  <option value="in">Inches (in)</option>
                  <option value="cm">Centimetres (cm)</option>
                </Select>
              </FormField>
              <div className="measurement-fields">
                {currentMeasurementFields.map((field) => (
                  <FormField key={field} label={field}>
                    <div className="unit-input">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={measurementValues[field] || ''}
                        onChange={(event) => setMeasurementValues((current) => ({ ...current, [field]: event.target.value }))}
                        placeholder="0.0"
                      />
                      <span>{measurementUnit}</span>
                    </div>
                  </FormField>
                ))}
              </div>
              <div className="custom-measurements">
                <div className="custom-measurements-heading"><div><strong>Custom measurements</strong><small>Optional shop-specific fitting detail.</small></div></div>
                <div className="custom-field-add">
                  <input
                    aria-label="Custom measurement name"
                    value={customFieldName}
                    onChange={(event) => setCustomFieldName(event.target.value)}
                    placeholder="e.g. Shoulder to waist"
                  />
                  <Button type="button" variant="secondary" onClick={addCustomMeasurementField}><Plus size={14} />Add field</Button>
                </div>
                {customMeasurementFields.map((field) => (
                  <div className="custom-field-row" key={field}>
                    <FormField label={field}>
                      <div className="unit-input">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={measurementValues[field] || ''}
                          onChange={(event) => setMeasurementValues((current) => ({ ...current, [field]: event.target.value }))}
                          placeholder="0.0"
                        />
                        <span>{measurementUnit}</span>
                      </div>
                    </FormField>
                    <button type="button" className="icon-button" aria-label={`Remove ${field}`} onClick={() => removeCustomMeasurementField(field)}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <FormField label="Assign tailor">
            <Select value={form.tailor} onChange={(event) => setForm({ ...form, tailor: event.target.value })}>
              <option value="">Unassigned</option>
              {staff
                .filter((member) => member.active || member.name === editing?.tailor)
                .map((member) => (
                  <option key={member.id} value={member.name}>
                    {member.active ? member.name : `${member.name} (Away)`}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="Delivery date">
            <input
              type="date"
              required
              min={!editing ? today : undefined}
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </FormField>
          <FormField label={`Order total (${settings.currency})`}>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="0"
            />
          </FormField>
          <FormField label={editing ? `Advance recorded (${settings.currency})` : `Advance payment (${settings.currency})`}>
            <input
              type="number"
              min="0"
              step="0.01"
              max={form.amount || undefined}
              disabled={Boolean(editing)}
              value={form.advance}
              onChange={(event) => setForm({ ...form, advance: event.target.value })}
              placeholder="0"
            />
            {editing && <small className="field-note">Record additional payments in Payments to preserve the ledger.</small>}
          </FormField>
          {!editing && (
            <FormField label="Advance payment method">
              <Select
                value={advanceMethod}
                disabled={!(Number(form.advance || 0) > 0)}
                onChange={(event) => setAdvanceMethod(event.target.value)}
              >
                {paymentMethods.map((method) => <option key={method}>{method}</option>)}
              </Select>
            </FormField>
          )}
        </div>

        {orderFeedback && (
          <p className="customer-feedback customer-feedback-error" role="alert">
            {orderFeedback}
          </p>
        )}

        <div className="modal-actions">
          <Button type="button" variant="secondary" disabled={savingOrder || savingCustomer} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={savingOrder || savingCustomer}>
            {savingOrder ? 'Saving order…' : editing ? 'Save changes' : 'Create order'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
