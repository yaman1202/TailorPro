import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import {
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { initialData } from '../../data/initialData.js'
import { measurementFields } from '../../data/measurementTemplates.js'
import { createBackup, previewBackup } from '../backupService.js'
import { FirestoreRepository } from '../firestoreRepository.js'

const projectId = 'demo-tailorpro-rules'
const businessId = 'tailorpro-dev-802c2'
const ownerUid = 'configured-owner-uid'
const collectionNames = ['customers', 'measurements', 'orders', 'payments', 'staff', 'inventory']

let testEnvironment
let ownerFirestore

function createRepository({
  firestore = ownerFirestore,
  user = { uid: ownerUid },
  firestoreProvider,
  currentUserProvider,
} = {}) {
  return new FirestoreRepository({
    firestoreProvider: firestoreProvider || (() => firestore),
    currentUserProvider: currentUserProvider || (() => user),
  })
}

async function seedData(data = initialData) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    await setDoc(doc(firestore, 'businesses', businessId), { ownerUid })
    await setDoc(doc(firestore, 'businesses', businessId, 'workspaceMetadata', 'current'), { revision: 1 })
    for (const collectionName of collectionNames) {
      for (const record of data[collectionName]) {
        if (collectionName === 'orders') continue
        if (collectionName === 'measurements') {
          const keyId = `v1-${encodeURIComponent(JSON.stringify([
            record.customerId,
            record.garment,
            record.version,
          ]))}`
          await setDoc(
            doc(firestore, 'businesses', businessId, collectionName, record.id),
            { ...record, versionKeyId: keyId },
          )
          await setDoc(
            doc(firestore, 'businesses', businessId, 'measurementVersionKeys', keyId),
            {
              id: keyId,
              customerId: record.customerId,
              garment: record.garment,
              version: record.version,
              measurementId: record.id,
            },
          )
          continue
        }
        await setDoc(
          doc(firestore, 'businesses', businessId, collectionName, record.id),
          record,
        )
      }
    }
    for (const order of data.orders) {
      const orderPayments = data.payments.filter((payment) => payment.orderId === order.id)
      const paidMinorUnits = orderPayments.reduce((total, payment) => total + Math.round(payment.amount * 100), 0)
      const paymentCount = orderPayments.length
      await setDoc(doc(firestore, 'businesses', businessId, 'orders', order.id), {
        ...order,
        paidMinorUnits,
        paymentCount,
      })
      const lastPayment = orderPayments[orderPayments.length - 1]
      await setDoc(doc(firestore, 'businesses', businessId, 'orderAccounting', order.id), {
        orderId: order.id,
        paidMinorUnits,
        paymentCount,
        ...(lastPayment ? { lastPaymentId: lastPayment.id } : {}),
      })
    }
    await setDoc(
      doc(firestore, 'businesses', businessId, 'settings', 'business-profile'),
      data.settings,
    )
  })
}

function makeOrder(id, overrides = {}) {
  return {
    id,
    customerId: 'c1',
    customer: 'Aarav Mehta',
    garment: 'Formal shirt',
    tailor: '',
    dueDate: '2026-11-15',
    amount: 1000,
    advance: 0,
    status: 'New',
    createdAt: '2026-10-30',
    ...overrides,
  }
}

function makePayment(id, order, amount, overrides = {}) {
  return {
    id,
    orderId: order.id,
    customer: order.customer,
    date: '2026-10-30',
    amount,
    method: 'Cash',
    type: 'Partial',
    ...overrides,
  }
}

before(async () => {
  const rules = await readFile(new URL('../../../firestore.rules', import.meta.url), 'utf8')
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  })
  ownerFirestore = testEnvironment.authenticatedContext(ownerUid).firestore()
})

beforeEach(async () => {
  await testEnvironment.clearFirestore()
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'businesses', businessId), { ownerUid })
  })
})

after(async () => {
  await testEnvironment?.cleanup()
})

test('authenticated owner reads collections and settings into canonical data', async () => {
  await seedData()

  const result = await createRepository().load()

  assert.equal(result.status, 'ready')
  for (const collectionName of collectionNames) {
    assert.deepEqual(
      result.data[collectionName].map(({ id }) => id).sort(),
      initialData[collectionName].map(({ id }) => id).sort(),
    )
  }
  assert.deepEqual(result.data.settings, initialData.settings)
  assert.equal(result.data.orders.find(({ id }) => id === initialData.orders[0].id).customerId, initialData.orders[0].customerId)
  assert.equal(result.data.payments.find(({ id }) => id === initialData.payments[0].id).orderId, initialData.payments[0].orderId)
})

test('unauthenticated repository access is rejected before Firestore reads', async () => {
  let firestoreRequested = false
  const repository = createRepository({
    user: null,
    firestoreProvider: () => {
      firestoreRequested = true
      return ownerFirestore
    },
  })

  await assert.rejects(repository.load(), (error) => error.category === 'unauthenticated')
  assert.equal(firestoreRequested, false)
})

test('different authenticated UID is denied by Firestore Rules', async () => {
  const otherFirestore = testEnvironment.authenticatedContext('different-authenticated-user').firestore()
  const repository = createRepository({ firestore: otherFirestore, user: { uid: 'different-authenticated-user' } })

  await assert.rejects(repository.load(), (error) => error.category === 'permission-denied')
})

test('document ID mismatches are rejected as malformed cloud data', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'businesses', businessId, 'customers', 'customer-path-id'),
      { id: 'different-stored-id', name: 'Asha', phone: '555-0199' },
    )
    await setDoc(
      doc(context.firestore(), 'businesses', businessId, 'settings', 'business-profile'),
      initialData.settings,
    )
  })

  await assert.rejects(createRepository().load(), (error) => (
    error.category === 'malformed-data' && /mismatched or missing stored ID/i.test(error.message)
  ))
})

test('empty cloud workspace returns an explicit uninitialized state without sample data', async () => {
  const result = await createRepository().load()

  assert.equal(result.status, 'uninitialized')
  assert.equal(result.data, null)
})

test('invalid cloud records and broken relationships are rejected', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    await setDoc(
      doc(firestore, 'businesses', businessId, 'orders', 'orphan-order'),
      {
        id: 'orphan-order',
        customerId: 'missing-customer',
        customer: 'Missing Customer',
        garment: 'Formal shirt',
        tailor: '',
        dueDate: '2026-11-02',
        amount: 100,
        advance: 0,
        status: 'New',
        createdAt: '2026-10-30',
      },
    )
    await setDoc(
      doc(firestore, 'businesses', businessId, 'settings', 'business-profile'),
      initialData.settings,
    )
  })

  await assert.rejects(createRepository().load(), (error) => (
    error.category === 'malformed-data' && /missing customer/i.test(error.message)
  ))
})

test('Firestore unavailable errors are reported as network failures', async () => {
  const repository = createRepository({
    firestoreProvider: async () => {
      throw Object.assign(new Error('Firestore is unavailable.'), { code: 'unavailable' })
    },
  })

  await assert.rejects(repository.load(), (error) => error.category === 'network')
})

test('Firestore backup export uses version 1 format without internal metadata', async () => {
  await seedData()
  const repository = createRepository()

  const backup = await repository.exportBackup()
  const preview = previewBackup(backup)

  assert.equal(backup.format, 'TailorPro backup')
  assert.equal(backup.version, 1)
  assert.equal(preview.valid, true)
  for (const collectionName of collectionNames) {
    assert.deepEqual(
      backup.data[collectionName].map((record) => record.id).sort(),
      initialData[collectionName].map((record) => record.id).sort(),
    )
  }
  assert.deepEqual(backup.data.settings, initialData.settings)
  assert.equal('versionKeyId' in backup.data.measurements[0], false)
  assert.equal('paidMinorUnits' in backup.data.orders[0], false)
})

test('Firestore restore requires confirmation, validates backups, and commits atomically', async () => {
  await seedData()
  const repository = createRepository()
  const backup = await repository.exportBackup()

  await assert.rejects(repository.replaceData(backup.data), (error) => error.category === 'confirmation-required')
  const invalid = structuredClone(backup.data)
  invalid.orders[0].customerId = 'missing-customer'
  await assert.rejects(repository.replaceData(invalid, { confirmed: true }), /missing customer/i)
  assert.deepEqual((await repository.load()).data, backup.data)

  const restored = await repository.replaceData(backup.data, { confirmed: true })
  assert.deepEqual(restored.data, backup.data)
  const measurement = await getDoc(doc(ownerFirestore, 'businesses', businessId, 'measurements', backup.data.measurements[0].id))
  assert.equal(typeof measurement.data().versionKeyId, 'string')

  const replacement = structuredClone(backup.data)
  replacement.inventory[0].quantity += 3
  await repository.replaceData(replacement, { confirmed: true })
  assert.equal((await repository.load()).data.inventory[0].quantity, replacement.inventory[0].quantity)
})

test('a LocalStorage-format backup initializes an empty cloud workspace with IDs and payment history intact', async () => {
  const customer = initialData.customers[0]
  const order = makeOrder('migration-order', {
    customerId: customer.id,
    customer: customer.name,
    amount: 800,
    advance: 100,
  })
  const payment = makePayment('migration-payment', order, 100, { type: 'Advance' })
  const localBackup = createBackup({
    customers: [customer],
    measurements: [],
    orders: [order],
    payments: [payment],
    staff: [],
    inventory: [],
    settings: initialData.settings,
  })
  assert.equal(previewBackup(localBackup).valid, true)

  const restored = await createRepository().replaceData(localBackup.data, { confirmed: true })
  assert.equal(restored.data.customers[0].id, customer.id)
  assert.equal(restored.data.orders[0].id, order.id)
  assert.equal(restored.data.payments[0].id, payment.id)
  assert.equal(restored.data.payments[0].orderId, order.id)
  assert.equal(restored.data.settings.businessName, initialData.settings.businessName)
  const accounting = await getDoc(doc(ownerFirestore, 'businesses', businessId, 'orderAccounting', order.id))
  assert.equal(accounting.data().paidMinorUnits, 10000)
})

test('migration preflight rejects a large atomic import without changing the empty cloud workspace', async () => {
  const repository = createRepository()
  const before = await repository.load()
  assert.equal(before.status, 'uninitialized')
  const largeBackupData = structuredClone(initialData)
  largeBackupData.orders.forEach((order) => { order.advance = 0 })

  await assert.rejects(
    repository.replaceData(largeBackupData, { confirmed: true }),
    /more than Firestore's 20 Rules document-access calls/i,
  )

  const after = await repository.load()
  assert.equal(after.status, 'uninitialized')
  assert.equal(
    (await getDoc(doc(ownerFirestore, 'businesses', businessId, 'customers', initialData.customers[0].id))).exists(),
    false,
  )
})

test('migration rejects multiple new ledger entries for one order before writing', async () => {
  const customer = initialData.customers[0]
  const order = makeOrder('multi-payment-migration-order', {
    customerId: customer.id,
    customer: customer.name,
    amount: 800,
  })
  const backupData = {
    customers: [customer],
    measurements: [],
    orders: [order],
    payments: [
      makePayment('multi-payment-migration-a', order, 50),
      makePayment('multi-payment-migration-b', order, 75),
    ],
    staff: [],
    inventory: [],
    settings: initialData.settings,
  }
  const repository = createRepository()

  await assert.rejects(
    repository.replaceData(backupData, { confirmed: true }),
    /cannot add multiple payments to the same order/i,
  )
  assert.equal((await repository.load()).status, 'uninitialized')
  assert.equal(
    (await getDoc(doc(ownerFirestore, 'businesses', businessId, 'orders', order.id))).exists(),
    false,
  )
})

test('Firestore restore rejects oversized replacements before writing', async () => {
  await seedData()
  const repository = createRepository()
  const before = await repository.load()
  const oversized = structuredClone(before.data)
  oversized.inventory = [
    ...oversized.inventory,
    ...Array.from({ length: 500 }, (_, index) => ({
      id: `restore-limit-${index}`,
      name: `Restore item ${index}`,
      category: 'Fabric',
      sku: `RESTORE-${index}`,
      quantity: 1,
      unit: 'metres',
      reorderAt: 0,
      price: 1,
    })),
  ]

  await assert.rejects(repository.replaceData(oversized, { confirmed: true }), /exceeding the 500-write transaction limit/i)
  const after = await repository.load()
  assert.deepEqual(after.data, before.data)
  assert.equal((await getDoc(doc(ownerFirestore, 'businesses', businessId, 'inventory', 'restore-limit-0'))).exists(), false)
})

test('Firestore restore preflights Rules access limits before writing', async () => {
  await seedData()
  const repository = createRepository()
  const before = (await repository.load()).data
  const expanded = structuredClone(before)
  expanded.orders.push(...Array.from({ length: 9 }, (_, index) => (
    makeOrder(`rules-access-limit-${index}`)
  )))

  await assert.rejects(
    repository.replaceData(expanded, { confirmed: true }),
    /more than Firestore's 20 Rules document-access calls/i,
  )
  assert.equal(
    (await getDoc(doc(ownerFirestore, 'businesses', businessId, 'orders', 'rules-access-limit-0'))).exists(),
    false,
  )
})

test('Firestore repository supports validated CRUD and settings operations', async () => {
  await seedData()
  const repository = createRepository()

  const customer = await repository.addRecord('customers', {
    name: 'CRUD Customer',
    phone: '555-0199',
    address: '8 Needle Lane',
    city: 'Pune',
    joined: '2026-10-30',
  })
  assert.ok(customer.record.id)
  assert.equal(customer.record.name, 'CRUD Customer')
  const editedCustomer = await repository.updateRecord('customers', customer.record.id, { city: 'Mumbai' })
  assert.equal(editedCustomer.record.city, 'Mumbai')
  await repository.deleteRecord('customers', customer.record.id)

  const namedCustomer = await repository.addRecord('customers', {
    id: 'crud-customer-explicit',
    name: 'CRUD Customer',
    phone: '555-0198',
    joined: '2026-10-30',
  })
  assert.equal(namedCustomer.record.id, 'crud-customer-explicit')
  await repository.deleteRecord('customers', namedCustomer.record.id)

  const staff = await repository.addRecord('staff', {
    id: 'crud-staff',
    name: 'CRUD Tailor',
    role: 'Tailor',
    phone: '555-0177',
    email: '',
    active: true,
  })
  await repository.updateRecord('staff', staff.record.id, { phone: '555-0178' })
  await repository.deleteRecord('staff', staff.record.id)

  const inventory = await repository.addRecord('inventory', {
    id: 'crud-inventory',
    name: 'CRUD linen',
    category: 'Fabric',
    sku: 'CRUD-FAB-1',
    quantity: 5,
    unit: 'metres',
    reorderAt: 1,
    price: 20,
  })
  await repository.updateRecord('inventory', inventory.record.id, { quantity: 8 })
  await repository.deleteRecord('inventory', inventory.record.id)

  const measurement = {
    ...initialData.measurements[0],
    id: 'crud-measurement',
    values: {
      ...Object.fromEntries(measurementFields[initialData.measurements[0].garment].map((field) => [field, '40'])),
      'Pocket depth': '12',
    },
    unit: 'cm',
    version: 88,
    date: '2026-10-30',
  }
  const measured = await repository.addRecord('measurements', measurement)
  assert.equal(measured.record.id, measurement.id)
  const keyId = `v1-${encodeURIComponent(JSON.stringify([measurement.customerId, measurement.garment, measurement.version]))}`
  assert.equal((await getDoc(doc(ownerFirestore, 'businesses', businessId, 'measurementVersionKeys', keyId))).exists(), true)
  const loadedMeasurement = (await repository.load()).data.measurements.find((entry) => entry.id === measurement.id)
  assert.equal(loadedMeasurement.unit, 'cm')
  assert.equal(loadedMeasurement.values['Pocket depth'], '12')
  await assert.rejects(
    repository.updateRecord('measurements', measurement.id, { values: { ...measurement.values, Chest: '41' } }),
    /history is immutable/i,
  )
  await assert.rejects(repository.deleteRecord('measurements', measurement.id), /history is retained/i)
  await assert.rejects(repository.updateRecord('measurements', measurement.id, { version: 89 }), /immutable/i)

  const order = makeOrder('crud-order', { measurementId: initialData.measurements[0].id })
  await repository.createOrder(order)
  assert.equal((await repository.load()).data.orders.find((entry) => entry.id === order.id).measurementId, order.measurementId)
  await repository.updateOrder(order.id, { amount: 1200 })
  await assert.rejects(repository.updateRecord('orders', order.id, { status: 'Cancelled' }), /transitionOrder operation/i)
  await repository.deleteRecord('orders', order.id)

  const settings = await repository.updateSettings({ businessName: 'TailorPro Emulator' })
  assert.equal(settings.data.settings.businessName, 'TailorPro Emulator')

  await assert.rejects(repository.updateRecord('payments', 'p1', { amount: 1 }), /cannot be modified/i)
})

test('a newly created customer is immediately usable by an order without replacing existing records', async () => {
  await seedData()
  const repository = createRepository()
  const before = await repository.load()
  const customer = await repository.addRecord('customers', {
    name: 'Order Flow Customer',
    phone: '555-0197',
    joined: '2026-10-30',
  })
  const order = makeOrder('new-customer-order', { customerId: customer.record.id, customer: customer.record.name })
  await repository.createOrder(order)
  const after = await repository.load()

  assert.equal(after.data.customers.some((record) => record.id === customer.record.id), true)
  assert.equal(after.data.orders.find((record) => record.id === order.id).customerId, customer.record.id)
  assert.deepEqual(after.data.customers.filter((record) => record.id !== customer.record.id), before.data.customers)
  assert.deepEqual(after.data.orders.filter((record) => record.id !== order.id), before.data.orders)
})

test('Firestore business writes persist after reload and owner reauthentication', async () => {
  await seedData()
  const repository = createRepository()
  const customer = await repository.addRecord('customers', {
    name: 'Persistence Customer',
    phone: '555-0186',
    joined: '2026-10-31',
  })
  const measurement = {
    ...initialData.measurements[0],
    id: 'persistence-measurement',
    customerId: customer.record.id,
    customer: customer.record.name,
    values: Object.fromEntries(
      measurementFields[initialData.measurements[0].garment].map((field) => [field, '40']),
    ),
    version: 1,
    date: '2026-10-31',
  }
  await repository.addRecord('measurements', measurement)

  const order = makeOrder('persistence-order', {
    customerId: customer.record.id,
    customer: customer.record.name,
    measurementId: measurement.id,
    amount: 1000,
    advance: 100,
  })
  await repository.createOrder(
    order,
    makePayment('persistence-advance', order, 100, { type: 'Advance' }),
  )
  await repository.recordPayment(makePayment('persistence-payment', order, 200))
  await repository.addRecord('staff', {
    id: 'persistence-staff',
    name: 'Persistence Tailor',
    role: 'Tailor',
    phone: '555-0176',
    email: '',
    active: true,
  })
  await repository.addRecord('inventory', {
    id: 'persistence-inventory',
    name: 'Persistence linen',
    category: 'Fabric',
    sku: 'PERSIST-FAB-1',
    quantity: 5,
    unit: 'metres',
    reorderAt: 1,
    price: 20,
  })
  await repository.updateSettings({ businessName: 'Persistent TailorPro' })

  const reauthenticatedFirestore = testEnvironment.authenticatedContext(ownerUid).firestore()
  const reauthenticatedRepository = createRepository({
    firestore: reauthenticatedFirestore,
    user: { uid: ownerUid },
  })
  const refreshed = await reauthenticatedRepository.load()

  assert.equal(refreshed.status, 'ready')
  assert.equal(refreshed.data.customers.some((record) => record.id === customer.record.id), true)
  assert.equal(refreshed.data.measurements.some((record) => record.id === measurement.id), true)
  assert.equal(refreshed.data.orders.some((record) => record.id === order.id), true)
  assert.deepEqual(
    refreshed.data.payments.filter((record) => record.orderId === order.id).map((record) => record.id).sort(),
    ['persistence-advance', 'persistence-payment'],
  )
  assert.equal(refreshed.data.staff.some((record) => record.id === 'persistence-staff'), true)
  assert.equal(refreshed.data.inventory.some((record) => record.id === 'persistence-inventory'), true)
  assert.equal(refreshed.data.settings.businessName, 'Persistent TailorPro')
})

test('order creation and advance ledger writes commit atomically', async () => {
  await seedData()
  const repository = createRepository()
  const order = makeOrder('atomic-order', { amount: 800, advance: 200 })
  const payment = makePayment('atomic-advance', order, 200, { type: 'Advance' })

  const result = await repository.createOrder(order, payment)
  assert.equal(result.record.status, 'New')
  assert.equal(result.data.orders.some((item) => item.id === order.id), true)
  assert.equal(result.data.payments.some((item) => item.id === payment.id), true)
  const accounting = await getDoc(doc(ownerFirestore, 'businesses', businessId, 'orderAccounting', order.id))
  assert.equal(accounting.data().paidMinorUnits, 20000)

  const failedOrder = makeOrder('atomic-failed-order', { amount: 500, advance: 100 })
  await assert.rejects(
    repository.createOrder(failedOrder, makePayment('atomic-failed-payment', failedOrder, 99, { type: 'Advance' })),
    /must match the order advance/i,
  )
  assert.equal((await getDoc(doc(ownerFirestore, 'businesses', businessId, 'orders', failedOrder.id))).exists(), false)
  assert.equal((await getDoc(doc(ownerFirestore, 'businesses', businessId, 'payments', 'atomic-failed-payment'))).exists(), false)
  await assert.rejects(repository.createOrder(makeOrder('invalid-start', { status: 'Assigned' })), /begin in the New status/i)
})

test('order creation saves its new garment measurement profile atomically', async () => {
  await seedData()
  const repository = createRepository()
  const order = makeOrder('order-with-inline-measurements')
  const fields = measurementFields['Formal shirt']
  const measurement = {
    id: 'inline-order-measurement',
    customerId: order.customerId,
    customer: order.customer,
    garment: 'Formal shirt',
    date: order.createdAt,
    version: 1,
    unit: 'in',
    values: Object.fromEntries(fields.map((field, index) => [field, String(10 + index)])),
  }
  const created = await repository.createOrder({ ...order, measurementId: measurement.id }, undefined, measurement)
  const keyId = `v1-${encodeURIComponent(JSON.stringify([measurement.customerId, measurement.garment, measurement.version]))}`

  assert.equal(created.record.measurementId, measurement.id)
  assert.equal(created.data.measurements.some((profile) => profile.id === measurement.id), true)
  assert.equal((await getDoc(doc(ownerFirestore, 'businesses', businessId, 'measurements', measurement.id))).exists(), true)
  assert.equal((await getDoc(doc(ownerFirestore, 'businesses', businessId, 'measurementVersionKeys', keyId))).exists(), true)
})

test('Firestore transitions and guarded order edits enforce workflow and payment rules', async () => {
  await seedData()
  const repository = createRepository()
  const order = makeOrder('workflow-order', { tailor: 'Dev Patel' })
  await repository.createOrder(order)

  const stitching = await repository.transitionOrder(order.id, 'Stitching')
  assert.equal(stitching.record.status, 'Stitching')
  const confirmed = await repository.transitionOrder(order.id, 'Confirmed')
  assert.equal(confirmed.record.status, 'Confirmed')
  const assigned = await repository.transitionOrder(order.id, 'Assigned')
  assert.equal(assigned.record.status, 'Assigned')
  await repository.transitionOrder(order.id, 'Stitching')
  await repository.transitionOrder(order.id, 'Quality Check')
  await repository.transitionOrder(order.id, 'Ready')
  await assert.rejects(repository.transitionOrder(order.id, 'Completed'), /full outstanding balance/i)
  const completed = await repository.completeOrderWithPayment(order.id, 'Cash')
  assert.equal(completed.record.status, 'Completed')
  assert.equal(completed.payment.amount, order.amount)
  assert.equal(completed.payment.type, 'Balance')
  assert.equal(completed.data.payments.filter((payment) => payment.orderId === order.id).length, 1)
  await assert.rejects(repository.transitionOrder(order.id, 'Cancelled'), /not allowed/i)

  const paymentOrder = makeOrder('guarded-edit-order', { amount: 100 })
  await repository.createOrder(paymentOrder)
  await repository.recordPayment(makePayment('guarded-edit-payment', paymentOrder, 60))
  await assert.rejects(repository.updateOrder(paymentOrder.id, { amount: 59 }), /cannot be lower/i)
  await assert.rejects(repository.deleteRecord('orders', paymentOrder.id), /payment history/i)
  await assert.rejects(repository.deleteRecord('payments', 'guarded-edit-payment'), /cannot be deleted/i)
})

test('Firestore completion does not duplicate payment for an already-paid order', async () => {
  await seedData()
  const repository = createRepository()
  const order = makeOrder('already-paid-completion', {
    amount: 500,
    advance: 500,
    tailor: 'Dev Patel',
  })
  await repository.createOrder(order, makePayment('already-paid-advance', order, 500, { type: 'Advance' }))
  const ready = await repository.transitionOrder(order.id, 'Ready')
  assert.equal(ready.record.status, 'Ready')

  const completed = await repository.completeOrderWithPayment(order.id, '')
  assert.equal(completed.record.status, 'Completed')
  assert.equal(completed.payment, undefined)
  assert.equal(completed.data.payments.filter((payment) => payment.orderId === order.id).length, 1)
})

test('concurrent payments cannot exceed an order balance and duplicate IDs are rejected', async () => {
  await seedData()
  const repository = createRepository()
  const order = makeOrder('concurrent-payment-order', { amount: 1000 })
  await repository.createOrder(order)

  const outcomes = await Promise.allSettled([
    repository.recordPayment(makePayment('concurrent-payment-a', order, 700)),
    repository.recordPayment(makePayment('concurrent-payment-b', order, 700)),
  ])
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 1)
  const loaded = await repository.load()
  assert.equal(loaded.data.payments.filter((payment) => payment.orderId === order.id).length, 1)
  assert.equal(loaded.data.payments.filter((payment) => payment.orderId === order.id).reduce((sum, payment) => sum + payment.amount, 0), 700)
  const account = await getDoc(doc(ownerFirestore, 'businesses', businessId, 'orderAccounting', order.id))
  assert.equal(account.data().paidMinorUnits, 70000)
  const acceptedPaymentIndex = outcomes.findIndex((result) => result.status === 'fulfilled')
  const acceptedPaymentId = `concurrent-payment-${acceptedPaymentIndex === 0 ? 'a' : 'b'}`
  await assert.rejects(repository.recordPayment(makePayment(acceptedPaymentId, order, 1)), /already recorded/i)
})

test('payment and cancellation races preserve the ledger and reject post-cancel payments', async () => {
  await seedData()
  const repository = createRepository()
  const order = makeOrder('cancel-race-order', { amount: 500 })
  await repository.createOrder(order)

  const [paymentResult, cancellationResult] = await Promise.allSettled([
    repository.recordPayment(makePayment('cancel-race-payment', order, 100)),
    repository.transitionOrder(order.id, 'Cancelled'),
  ])
  assert.equal(
    cancellationResult.status,
    'fulfilled',
    `${cancellationResult.reason?.message} ${cancellationResult.reason?.cause?.message || ''}`,
  )
  const loaded = await repository.load()
  assert.equal(loaded.data.orders.find((item) => item.id === order.id).status, 'Cancelled')
  const ledger = loaded.data.payments.filter((payment) => payment.orderId === order.id)
  assert.equal(paymentResult.status === 'fulfilled', ledger.length === 1)
  await assert.rejects(repository.recordPayment(makePayment('post-cancel-payment', order, 1)), /cancelled order/i)
})

test('measurement version keys prevent duplicate and concurrent versions', async () => {
  await seedData()
  const repository = createRepository()
  const measurement = {
    ...initialData.measurements[0],
    id: 'version-key-first',
    values: Object.fromEntries(measurementFields[initialData.measurements[0].garment].map((field) => [field, '40'])),
    version: 91,
    date: '2026-10-30',
  }
  await repository.addRecord('measurements', measurement)
  await assert.rejects(
    repository.addRecord('measurements', { ...measurement, id: 'version-key-duplicate' }),
    /version 91 already exists/i,
  )

  const concurrentVersion = { ...measurement, version: 92 }
  const creates = await Promise.allSettled([
    repository.addRecord('measurements', { ...concurrentVersion, id: 'version-key-concurrent-a' }),
    repository.addRecord('measurements', { ...concurrentVersion, id: 'version-key-concurrent-b' }),
  ])
  assert.equal(creates.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(creates.filter((result) => result.status === 'rejected').length, 1)
})

test('customer archival lifecycle protects historical relationships and restricts new orders', async () => {
  await seedData()
  const repository = createRepository()
  const customer = initialData.customers[0]

  // Cannot delete customer with order or measurement history
  await assert.rejects(
    repository.deleteRecord('customers', customer.id),
    /cannot be deleted while.*reference them/i,
  )

  // Archiving customer succeeds
  const archived = await repository.archiveCustomer(customer.id, true)
  assert.equal(archived.archived, true)

  const loadedArchived = await repository.load()
  const storedCustomer = loadedArchived.data.customers.find((c) => c.id === customer.id)
  assert.equal(storedCustomer.archived, true)
  // Historical orders and measurements are still present
  assert.ok(loadedArchived.data.orders.some((o) => o.customerId === customer.id))
  assert.ok(loadedArchived.data.measurements.some((m) => m.customerId === customer.id))

  // New order for archived customer is rejected
  const orderOnArchived = makeOrder('order-archived-cust', {
    customerId: customer.id,
    customer: customer.name,
    amount: 1500,
  })
  await assert.rejects(
    repository.createOrder(orderOnArchived),
    /archived customer/i,
  )

  // Restoring/unarchiving customer allows new orders again
  const restored = await repository.archiveCustomer(customer.id, false)
  assert.equal(restored.archived, false)
  const orderAfterRestore = await repository.createOrder(orderOnArchived)
  assert.equal(orderAfterRestore.record.id, orderOnArchived.id)
})
