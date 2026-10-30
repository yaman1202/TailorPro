import assert from 'node:assert/strict'
import test from 'node:test'
import { initialData } from '../data/initialData.js'
import { measurementFields } from '../data/measurementTemplates.js'
import { createBackup, previewBackup, validateBackup } from './backupService.js'
import {
  validateCustomer,
  validateData,
  validateDeletion,
  validateEntity,
  validateInventoryItem,
  validateMeasurement,
  validateOrder,
  validatePaymentEntity,
  validateRelationships,
  validateSettings,
  validateStaff,
} from './validation.js'

const data = () => structuredClone(initialData)
const isValid = (validation, message) => {
  assert.equal(validation.valid, true, message || validation.error)
}
const isInvalid = (validation, message) => {
  assert.equal(validation.valid, false)
  if (message) assert.match(validation.error, message)
}

test('customer validator enforces identity, required contact fields, and email format', () => {
  isValid(validateCustomer({ id: 'customer-1', name: 'Asha', phone: '555-0101', email: 'asha@example.com' }))
  isValid(validateCustomer({ id: 'customer-2', name: 'Mina', phone: '555-0102', address: '12 Park Road', city: 'Pune', archived: true }))
  isInvalid(validateCustomer({ id: 'customer-1', name: ' ', phone: '' }), /name is required.*phone is required/i)
  isInvalid(validateCustomer({ id: 'customer-1', name: 'Asha', phone: '555', email: 'not-an-email' }), /valid email/i)
  isInvalid(validateCustomer({ id: 'customer-1', name: 'Asha', phone: '555', address: 12 }), /address must be text/i)
  isInvalid(validateCustomer({ id: 'customer-1', name: 'Asha', phone: '555', archived: 'yes' }), /archived must be a boolean/i)
  isInvalid(validateCustomer({ name: 'Asha', phone: '555' }), /id is required/i)
})

test('measurement validator enforces template fields and non-negative numeric values', () => {
  const fields = measurementFields['Formal shirt']
  const measurement = {
    id: 'measurement-1',
    customerId: 'c1',
    customer: 'Aarav Mehta',
    garment: 'Formal shirt',
    date: '2026-10-30',
    version: 1,
    values: Object.fromEntries(fields.map((field) => [field, '10.5'])),
  }
  isValid(validateMeasurement(measurement))
  isInvalid(validateMeasurement({ ...measurement, version: 0 }), /positive integer/i)
  isInvalid(validateMeasurement({ ...measurement, values: { ...measurement.values, Neck: '-1' } }), /non-negative number/i)
  isInvalid(validateMeasurement({ ...measurement, values: {} }), /at least one/i)
  isValid(validateMeasurement({ ...measurement, unit: 'cm', values: { ...measurement.values, 'Custom seam': '4.5' } }))
  isInvalid(validateMeasurement({ ...measurement, unit: 'feet' }), /unit must be inches or centimetres/i)
  const duplicateVersionData = data()
  isInvalid(validateEntity('measurements', { ...measurement, customerId: 'c1', version: 2 }, duplicateVersionData), /version 2 already exists/i)
})

test('order validator enforces amount, status, date, and creation workflow rules', () => {
  const order = {
    id: 'order-1',
    customerId: 'c1',
    customer: 'Aarav Mehta',
    garment: 'Formal shirt',
    tailor: 'Dev Patel',
    dueDate: '2026-11-02',
    createdAt: '2026-10-30',
    amount: 100,
    advance: 25,
    status: 'New',
  }
  isValid(validateOrder(order))
  isInvalid(validateOrder({ ...order, amount: 0 }), /greater than zero/i)
  isInvalid(validateOrder({ ...order, status: 'Unknown' }), /status is not supported/i)
  isInvalid(validateOrder({ ...order, dueDate: 'not-a-date' }), /delivery date/i)
  isInvalid(validateOrder({ ...order, advance: 101 }), /advance/i)
  isInvalid(validateOrder({ ...order, status: 'Assigned' }), /begin in the New status/i)
})

test('payment validator enforces positive amount, method, type, and outstanding balance', () => {
  const fixture = data()
  const order = fixture.orders[0]
  const existing = fixture.payments.filter((payment) => payment.orderId === order.id)
  const candidate = { id: 'payment-new', orderId: order.id, customer: order.customer, date: '2026-10-30', amount: 100, method: 'Cash', type: 'Partial' }
  isValid(validatePaymentEntity(candidate, { order, payments: existing }))
  isInvalid(validatePaymentEntity({ ...candidate, amount: -1 }, { order, payments: existing }), /greater than zero/i)
  isInvalid(validatePaymentEntity({ ...candidate, method: 'Crypto' }, { order, payments: existing }), /method is not supported/i)
  isInvalid(validatePaymentEntity({ ...candidate, type: 'Refund' }, { order, payments: existing }), /type is not supported/i)
  isInvalid(validatePaymentEntity({ ...candidate, amount: 10000 }, { order, payments: existing }), /outstanding balance/i)
  isInvalid(validatePaymentEntity(candidate, { order: undefined, payments: existing }), /existing order/i)
})

test('staff and inventory validators enforce enums, numeric ranges, and uniqueness', () => {
  const fixture = data()
  isValid(validateStaff({ id: 'staff-new', name: 'Mina', role: 'Tailor', phone: '555-0144', email: '', active: true }, { staff: fixture.staff }))
  isInvalid(validateStaff({ id: 'staff-new', name: 'Mina', role: 'Unknown', phone: '', active: 'yes' }), /phone is required.*role is not supported.*boolean/i)
  isInvalid(validateStaff({ id: 'staff-new', name: 'Dev Patel', role: 'Tailor', phone: '555', active: true }, { staff: fixture.staff }), /already exists/i)

  const item = { id: 'inventory-new', name: 'Linen', category: 'Fabric', sku: 'FAB-NEW', quantity: 5, unit: 'metres', reorderAt: 1, price: 2.5 }
  isValid(validateInventoryItem(item, { inventory: fixture.inventory }))
  isInvalid(validateInventoryItem({ ...item, category: 'Clothing', quantity: -1, unit: 'unknown' }), /category is not supported.*quantity.*unit is not supported/i)
  isInvalid(validateInventoryItem({ ...item, sku: fixture.inventory[0].sku }, { inventory: fixture.inventory }), /already exists/i)
})

test('settings validator checks required business values, currency, preferences, and email', () => {
  isValid(validateSettings(data().settings))
  isInvalid(validateSettings({ ...data().settings, email: 'bad', currency: 'JPY', reminders: 'yes' }), /valid email.*currency.*boolean/i)
})

test('relationship validation rejects missing customer, staff, and order references', () => {
  const fixture = data()
  fixture.measurements[0].customerId = 'missing-customer'
  fixture.orders[0].customerId = 'missing-customer'
  fixture.orders[0].tailor = 'Missing Tailor'
  fixture.payments[0].orderId = 'missing-order'

  const validation = validateRelationships(fixture)
  isInvalid(validation, /missing customer.*missing staff member.*missing order/i)
  isInvalid(validateEntity('measurements', {
    id: 'measurement-new',
    customerId: 'missing-customer',
    customer: 'Unknown',
    garment: 'Formal shirt',
    date: '2026-10-30',
    version: 1,
    values: Object.fromEntries(measurementFields['Formal shirt'].map((field) => [field, 10])),
  }, data()), /missing customer/i)
})

test('orders can link only to a measurement profile owned by the same customer', () => {
  const fixture = data()
  const order = fixture.orders[0]
  const ownProfile = fixture.measurements.find((profile) => profile.customerId === order.customerId)
  assert.ok(ownProfile)
  isValid(validateEntity('orders', { ...order, measurementId: ownProfile.id }, fixture, { existing: order }))

  const otherProfile = fixture.measurements.find((profile) => profile.customerId !== order.customerId)
  isInvalid(validateEntity('orders', { ...order, measurementId: otherProfile.id }, fixture, { existing: order }), /different customer/i)
  isInvalid(validateEntity('orders', { ...order, measurementId: 'missing-profile' }, fixture, { existing: order }), /missing measurement profile/i)
})

test('deletion policies protect referenced customers, assigned staff, measurements, and ledger entries', () => {
  const fixture = data()
  isInvalid(validateDeletion('customers', fixture.customers[0], fixture), /cannot be deleted/i)
  isInvalid(validateDeletion('staff', fixture.staff[0], fixture), /reassign those orders/i)
  isInvalid(validateDeletion('measurements', fixture.measurements[0], fixture), /history is retained/i)
  isInvalid(validateDeletion('orders', fixture.orders[0], fixture), /payment history/i)
  isInvalid(validateDeletion('payments', fixture.payments[0], fixture), /cannot be deleted/i)
  isValid(validateDeletion('inventory', fixture.inventory[0], fixture))
})

test('backup validation rejects orphaned relationships and aggregate overpayments', () => {
  const fixture = data()
  const orphaned = structuredClone(fixture)
  orphaned.orders[0].customerId = 'missing-customer'
  isInvalid(validateBackup(createBackup(orphaned)), /missing customer/i)

  const overpaid = structuredClone(fixture)
  overpaid.payments.push({ ...overpaid.payments[0], id: 'payment-extra', amount: overpaid.orders[0].amount })
  isInvalid(validateBackup(createBackup(overpaid)), /exceed its total amount/i)

  const withCustomerAddress = structuredClone(fixture)
  withCustomerAddress.customers[0].address = '8 Needle Lane'
  isValid(validateBackup(createBackup(withCustomerAddress)))
  isValid(validateBackup(createBackup(fixture)))
  isValid(validateData(fixture, { allowLegacyMeasurements: true }))
})

test('backup preview reports record counts and all validation errors without restoring', () => {
  const fixture = data()
  const preview = previewBackup(createBackup(fixture))
  assert.equal(preview.valid, true)
  assert.deepEqual(preview.counts, {
    customers: fixture.customers.length,
    measurements: fixture.measurements.length,
    orders: fixture.orders.length,
    payments: fixture.payments.length,
    staff: fixture.staff.length,
    inventory: fixture.inventory.length,
  })

  const invalid = structuredClone(fixture)
  invalid.orders[0].customerId = 'missing-customer'
  const invalidPreview = previewBackup(createBackup(invalid))
  assert.equal(invalidPreview.valid, false)
  assert.match(invalidPreview.errors.join(' '), /missing customer/i)
})
