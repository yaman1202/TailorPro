import assert from 'node:assert/strict'
import test from 'node:test'
import { initialData } from '../data/initialData.js'
import { measurementFields } from '../data/measurementTemplates.js'
import { createBackup, validateBackup } from './backupService.js'
import { assertDataRepository, DataRepositoryError } from './dataRepository.js'
import { createLocalStorageRepository } from './localStorageRepository.js'

const STORAGE_KEY = 'tailorpro-data-v1'

function installStorage({ value = null, getError, setError } = {}) {
  const state = { value, writes: 0, getError, setError }
  globalThis.window = {
    localStorage: {
      getItem() {
        if (state.getError) throw state.getError
        return state.value
      },
      setItem(key, nextValue) {
        state.writes += 1
        if (state.setError) throw state.setError
        if (key === STORAGE_KEY) state.value = nextValue
      },
    },
  }
  return state
}

test('repository contract exposes asynchronous data operations', async () => {
  installStorage()
  const repository = assertDataRepository(createLocalStorageRepository())

  for (const method of [
    'load',
    'addRecord',
    'updateRecord',
    'deleteRecord',
    'createOrder',
    'updateOrder',
    'transitionOrder',
    'completeOrderWithPayment',
    'recordPayment',
    'exportBackup',
    'updateSettings',
    'replaceData',
    'retrySave',
  ]) {
    assert.equal(typeof repository[method], 'function')
  }
  assert.equal(typeof repository.load().then, 'function')
})

test('completion records the outstanding balance before completing and never duplicates payment', async () => {
  installStorage()
  const repository = createLocalStorageRepository()
  await repository.load()
  const order = {
    id: 'completion-payment-order',
    customerId: 'c1',
    customer: 'Aarav Mehta',
    garment: 'Formal shirt',
    tailor: 'Dev Patel',
    dueDate: '2026-11-15',
    amount: 1000,
    advance: 0,
    status: 'New',
    createdAt: '2026-10-30',
  }
  await repository.createOrder(order)
  await repository.transitionOrder(order.id, 'Ready')
  await assert.rejects(repository.transitionOrder(order.id, 'Completed'), /full outstanding balance/i)

  const completed = await repository.completeOrderWithPayment(order.id, 'UPI')
  assert.equal(completed.record.status, 'Completed')
  assert.equal(completed.payment.amount, 1000)
  assert.equal(completed.payment.type, 'Balance')
  assert.equal(completed.payment.method, 'UPI')
  assert.equal(completed.data.payments.filter((payment) => payment.orderId === order.id).length, 1)
  assert.equal(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).payments.some((payment) => payment.id === completed.payment.id), true)
  await assert.rejects(repository.completeOrderWithPayment(order.id, 'UPI'), /not allowed/i)
})

test('already-paid orders complete without recording a duplicate payment', async () => {
  installStorage()
  const repository = createLocalStorageRepository()
  await repository.load()
  const order = {
    id: 'completion-paid-order',
    customerId: 'c1',
    customer: 'Aarav Mehta',
    garment: 'Formal shirt',
    tailor: 'Dev Patel',
    dueDate: '2026-11-15',
    amount: 500,
    advance: 500,
    status: 'New',
    createdAt: '2026-10-30',
  }
  await repository.createOrder(order, {
    id: 'completion-paid-advance',
    orderId: order.id,
    customer: order.customer,
    date: order.createdAt,
    amount: 500,
    method: 'Cash',
    type: 'Advance',
  })
  await repository.transitionOrder(order.id, 'Ready')

  const completed = await repository.completeOrderWithPayment(order.id, '')
  assert.equal(completed.record.status, 'Completed')
  assert.equal(completed.payment, undefined)
  assert.equal(completed.data.payments.filter((payment) => payment.orderId === order.id).length, 1)
})

test('creating an order with measurements saves and links the measurement in one operation', async () => {
  const storage = installStorage()
  const repository = createLocalStorageRepository()
  await repository.load()
  const order = {
    id: 'order-with-measurements',
    customerId: 'c1',
    customer: 'Aarav Mehta',
    garment: 'Formal shirt',
    tailor: '',
    dueDate: '2026-11-15',
    amount: 1000,
    advance: 0,
    status: 'New',
    createdAt: '2026-10-30',
  }
  const template = measurementFields['Formal shirt']
  const measurement = {
    id: 'measurement-for-new-order',
    customerId: order.customerId,
    customer: order.customer,
    garment: 'Formal shirt',
    date: order.createdAt,
    version: 1,
    unit: 'in',
    values: Object.fromEntries(template.map((field, index) => [field, String(10 + index)])),
  }
  const created = await repository.createOrder({ ...order, measurementId: measurement.id }, undefined, measurement)

  assert.equal(created.record.measurementId, measurement.id)
  assert.equal(created.data.measurements.find((profile) => profile.id === measurement.id).customerId, order.customerId)
  assert.equal(JSON.parse(storage.value).orders.find((saved) => saved.id === order.id).measurementId, measurement.id)
})

test('repository supports successful create, update, delete, and settings operations', async () => {
  const storage = installStorage()
  const repository = createLocalStorageRepository()
  await repository.load()

  const added = await repository.addRecord('customers', { id: 'customer-test', name: 'Asha', phone: '555-0199' })
  assert.equal(added.record.id, 'customer-test')
  assert.equal(added.data.customers[0].name, 'Asha')

  const updated = await repository.updateRecord('customers', 'customer-test', { city: 'Pune' })
  assert.equal(updated.record.city, 'Pune')
  assert.equal(updated.data.customers[0].city, 'Pune')

  const settings = await repository.updateSettings({ businessName: 'Needle & Thread' })
  assert.equal(settings.data.settings.businessName, 'Needle & Thread')

  const deleted = await repository.deleteRecord('customers', 'customer-test')
  assert.equal(deleted.data.customers.some((customer) => customer.id === 'customer-test'), false)
  assert.deepEqual(JSON.parse(storage.value), deleted.data)
  assert.ok(storage.writes >= 4)
})

test('new customer creation generates a unique ID and preserves existing customers and orders', async () => {
  installStorage()
  const repository = createLocalStorageRepository()
  const before = (await repository.load()).data
  const created = await repository.addRecord('customers', {
    name: 'New TailorPro Customer',
    phone: '555-0118',
    address: '8 Needle Lane',
    city: 'Pune',
    joined: '2026-10-31',
  })

  assert.ok(created.record.id)
  assert.equal(before.customers.some((customer) => customer.id === created.record.id), false)
  assert.equal(created.data.customers.some((customer) => customer.id === created.record.id), true)
  assert.deepEqual(created.data.orders, before.orders)
  assert.deepEqual(created.data.customers.filter((customer) => customer.id !== created.record.id), before.customers)

  const order = {
    id: 'new-customer-linked-order',
    customerId: created.record.id,
    customer: created.record.name,
    garment: 'Formal shirt',
    tailor: '',
    dueDate: '2026-11-15',
    amount: 1000,
    advance: 0,
    status: 'New',
    createdAt: '2026-10-31',
  }
  const orderResult = await repository.createOrder(order)
  assert.equal(orderResult.record.customerId, created.record.id)
  assert.deepEqual(orderResult.data.customers.filter((customer) => customer.id !== created.record.id), before.customers)
  assert.deepEqual(orderResult.data.orders.filter((record) => record.id !== order.id), before.orders)
})

test('domain operations create orders and advances atomically and guard statuses and payments', async () => {
  const storage = installStorage()
  const repository = createLocalStorageRepository()
  await repository.load()
  const order = {
    id: 'domain-order',
    customerId: 'c1',
    customer: 'Aarav Mehta',
    garment: 'Formal shirt',
    tailor: '',
    dueDate: '2026-11-15',
    amount: 1000,
    advance: 200,
    status: 'New',
    createdAt: '2026-10-30',
  }
  const initialPayment = {
    id: 'domain-advance',
    orderId: order.id,
    customer: order.customer,
    date: '2026-10-30',
    amount: 200,
    method: 'Cash',
    type: 'Advance',
  }
  const created = await repository.createOrder(order, initialPayment)

  assert.equal(created.record.status, 'New')
  assert.equal(created.data.orders.some((item) => item.id === order.id), true)
  assert.equal(created.data.payments.some((item) => item.id === initialPayment.id), true)
  assert.deepEqual(JSON.parse(storage.value), created.data)

  await assert.rejects(repository.createOrder({ ...order, id: 'invalid-new-order', status: 'Assigned' }), /begin in the New status/i)
  await assert.rejects(repository.updateRecord('orders', order.id, { status: 'Cancelled' }), /transitionOrder operation/i)
  await assert.rejects(repository.recordPayment({ ...initialPayment, amount: 801, id: 'excess-payment' }), /outstanding balance/i)
  await assert.rejects(repository.recordPayment({ ...initialPayment, id: 'domain-advance' }), /already recorded/i)

  const paid = await repository.recordPayment({
    ...initialPayment,
    id: 'domain-partial',
    amount: 300,
    type: 'Partial',
  })

  test('measurement profiles are immutable and revisions must be created as new versions', async () => {
    installStorage()
    const repository = createLocalStorageRepository()
    const loaded = await repository.load()
    const profile = loaded.data.measurements[0]

    await assert.rejects(
      repository.updateRecord('measurements', profile.id, { values: { ...profile.values, Chest: '41' } }),
      /history is immutable/i,
    )

    const nextVersion = {
      ...profile,
      id: 'measurement-next-version',
      version: profile.version + 1,
      values: Object.fromEntries(measurementFields[profile.garment].map((field) => [
        field,
        field === 'Chest' ? '41' : profile.values[field] || '10',
      ])),
    }
    const created = await repository.addRecord('measurements', nextVersion)
    assert.equal(created.data.measurements.find((item) => item.id === profile.id).values.Chest, profile.values.Chest)
    assert.equal(created.data.measurements.find((item) => item.id === nextVersion.id).version, nextVersion.version)
  })

  test('orders preserve and can detach an explicit customer measurement link', async () => {
    installStorage()
    const repository = createLocalStorageRepository()
    await repository.load()
    const measurement = initialData.measurements[0]
    const order = {
      id: 'measurement-linked-order',
      customerId: measurement.customerId,
      customer: measurement.customer,
      garment: 'Formal shirt',
      measurementId: measurement.id,
      tailor: '',
      dueDate: '2026-11-15',
      amount: 1000,
      advance: 0,
      status: 'New',
      createdAt: '2026-10-30',
    }

    const created = await repository.createOrder(order)
    assert.equal(created.record.measurementId, measurement.id)
    const detached = await repository.updateOrder(order.id, { measurementId: null })
    assert.equal('measurementId' in detached.record, false)
  })
  assert.equal(paid.data.payments.length, created.data.payments.length + 1)

  const confirmed = await repository.transitionOrder(order.id, 'Confirmed')
  assert.equal(confirmed.record.status, 'Confirmed')
  await assert.rejects(repository.transitionOrder(order.id, 'Ready'), /requires a tailor/i)
  await repository.updateOrder(order.id, { tailor: 'Dev Patel' })
  const ready = await repository.transitionOrder(order.id, 'Ready')
  assert.equal(ready.record.status, 'Ready')
  const cancelled = await repository.transitionOrder(order.id, 'Cancelled')
  assert.equal(cancelled.record.status, 'Cancelled')
  await assert.rejects(repository.recordPayment({
    ...initialPayment,
    id: 'after-cancel-payment',
    amount: 1,
  }), /cancelled order/i)
  assert.equal(cancelled.data.payments.filter((item) => item.orderId === order.id).length, 2)
  await assert.rejects(repository.deleteRecord('payments', 'domain-advance'), /cannot be deleted/i)
  await assert.rejects(repository.deleteRecord('orders', order.id), /payment history/i)
})

test('failed order-and-advance persistence never stores only one side of the operation', async () => {
  const storage = installStorage()
  const repository = createLocalStorageRepository()
  await repository.load()
  const originalStoredData = storage.value
  const order = {
    id: 'atomic-failure-order',
    customerId: 'c1',
    customer: 'Aarav Mehta',
    garment: 'Formal shirt',
    tailor: '',
    dueDate: '2026-11-15',
    amount: 500,
    advance: 100,
    status: 'New',
    createdAt: '2026-10-30',
  }
  const payment = {
    id: 'atomic-failure-payment',
    orderId: order.id,
    customer: order.customer,
    date: '2026-10-30',
    amount: 100,
    method: 'Cash',
    type: 'Advance',
  }
  storage.setError = new Error('Storage write denied.')

  await assert.rejects(repository.createOrder(order, payment), /Storage is unavailable/i)
  assert.equal(storage.value, originalStoredData)
  assert.equal(JSON.parse(storage.value).orders.some((item) => item.id === order.id), false)
  assert.equal(JSON.parse(storage.value).payments.some((item) => item.id === payment.id), false)

  storage.setError = null
  const retried = await repository.retrySave()
  assert.equal(retried.data.orders.some((item) => item.id === order.id), true)
  assert.equal(retried.data.payments.some((item) => item.id === payment.id), true)
})

test('LocalStorage serializes concurrent payments and cancellation against the latest state', async () => {
  installStorage()
  const repository = createLocalStorageRepository()
  await repository.load()
  const order = {
    id: 'concurrent-local-order',
    customerId: 'c1',
    customer: 'Aarav Mehta',
    garment: 'Formal shirt',
    tailor: '',
    dueDate: '2026-11-15',
    amount: 1000,
    advance: 0,
    status: 'New',
    createdAt: '2026-10-30',
  }
  await repository.createOrder(order)
  const payment = (id, amount) => ({
    id,
    orderId: order.id,
    customer: order.customer,
    date: '2026-10-30',
    amount,
    method: 'Cash',
    type: 'Partial',
  })

  const competingPayments = await Promise.allSettled([
    repository.recordPayment(payment('concurrent-local-a', 700)),
    repository.recordPayment(payment('concurrent-local-b', 700)),
  ])
  assert.equal(competingPayments.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(competingPayments.filter((result) => result.status === 'rejected').length, 1)
  assert.equal((await repository.load()).data.payments.filter((entry) => entry.orderId === order.id).length, 1)

  const secondOrder = { ...order, id: 'cancel-race-local-order', amount: 500 }
  await repository.createOrder(secondOrder)
  const cancellationAndPayment = await Promise.allSettled([
    repository.transitionOrder(secondOrder.id, 'Cancelled'),
    repository.recordPayment({
      ...payment('cancel-race-local-payment', 100),
      orderId: secondOrder.id,
    }),
  ])
  assert.equal(cancellationAndPayment[0].status, 'fulfilled')
  assert.equal(cancellationAndPayment[1].status, 'rejected')
  const finalData = (await repository.load()).data
  assert.equal(finalData.orders.find((entry) => entry.id === secondOrder.id).status, 'Cancelled')
  assert.equal(finalData.payments.some((entry) => entry.orderId === secondOrder.id), false)
})

test('repository preserves compatibility with existing localStorage data without migration writes', async () => {
  const existing = structuredClone(initialData)
  existing.customers = [{ id: 'existing-customer', name: 'Existing', phone: '555-0100' }]
  const storage = installStorage({ value: JSON.stringify(existing) })
  const repository = createLocalStorageRepository()

  const loaded = await repository.load()

  assert.equal(loaded.status, 'ready')
  assert.equal(loaded.isNew, false)
  assert.deepEqual(loaded.data.customers, existing.customers)
  assert.deepEqual(JSON.parse(storage.value).customers, existing.customers)
  assert.equal(storage.writes, 0)
})

test('repository reports read and write failures and can retry a failed write', async () => {
  const readFailure = installStorage({ getError: new Error('Storage access denied.') })
  const readRepository = createLocalStorageRepository()
  const loaded = await readRepository.load()
  assert.equal(loaded.status, 'unavailable')
  assert.match(loaded.error, /could not access/i)
  assert.equal(readFailure.writes, 0)

  const storage = installStorage()
  const repository = createLocalStorageRepository()
  await repository.load()
  storage.setError = Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' })

  await assert.rejects(
    repository.addRecord('customers', { id: 'unsaved', name: 'Asha', phone: '555-0199' }),
    (error) => error instanceof DataRepositoryError
      && error.operation === 'create'
      && error.recoverableLocalWrite
      && error.data.customers[0].id === 'unsaved',
  )
  assert.equal((await repository.load()).data.customers[0].id, 'unsaved')
  assert.equal(JSON.parse(storage.value).customers.some((customer) => customer.id === 'unsaved'), false)

  storage.setError = null
  const retried = await repository.retrySave()
  assert.equal(retried.data.customers[0].id, 'unsaved')
  assert.equal(JSON.parse(storage.value).customers[0].id, 'unsaved')
})

test('update and delete write failures retain pending in-memory changes for retry', async () => {
  const storage = installStorage()
  const repository = createLocalStorageRepository()
  await repository.load()
  const existingCustomer = await repository.addRecord('customers', { id: 'unlinked-customer', name: 'Unlinked Customer', phone: '555-0198' })
  storage.setError = new Error('Storage write denied.')

  await assert.rejects(
    repository.updateRecord('customers', existingCustomer.id, { city: 'Pune' }),
    (error) => error instanceof DataRepositoryError && error.operation === 'update',
  )
  await assert.rejects(
    repository.deleteRecord('customers', existingCustomer.id),
    (error) => error instanceof DataRepositoryError && error.operation === 'delete',
  )
  assert.equal(JSON.parse(storage.value).customers[0].city, existingCustomer.city)

  storage.setError = null
  const retried = await repository.retrySave()
  assert.equal(retried.data.customers.some((customer) => customer.id === existingCustomer.id), false)
  assert.equal(JSON.parse(storage.value).customers.some((customer) => customer.id === existingCustomer.id), false)
})

test('validated backup replaces corrupt storage and can be loaded through the repository', async () => {
  const original = '{"orders":'
  const storage = installStorage({ value: original })
  const repository = createLocalStorageRepository()
  assert.equal((await repository.load()).status, 'corrupt')
  assert.equal(storage.value, original)

  const backup = createBackup(structuredClone(initialData), '2026-10-30T00:00:00.000Z')
  const validation = validateBackup(backup)
  assert.equal(validation.valid, true)
  if (!validation.valid) return

  const restored = await repository.replaceData(backup.data)
  assert.deepEqual(restored.data, backup.data)
  assert.deepEqual(JSON.parse(storage.value), backup.data)
  assert.equal((await repository.load()).status, 'ready')
})

test('repository backup export returns version-1 JSON shape without repository metadata', async () => {
  installStorage()
  const repository = createLocalStorageRepository()
  await repository.load()

  const backup = await repository.exportBackup()

  assert.equal(backup.format, 'TailorPro backup')
  assert.equal(backup.version, 1)
  assert.equal(validateBackup(backup).valid, true)
  assert.equal('versionKeyId' in backup.data.measurements[0], false)
})

test('failed backup restore leaves the original corrupted value intact', async () => {
  const original = '{"orders":'
  const storage = installStorage({ value: original, setError: new Error('Storage write denied.') })
  const repository = createLocalStorageRepository()
  await repository.load()
  const backup = createBackup(structuredClone(initialData))
  const validation = validateBackup(backup)
  assert.equal(validation.valid, true)
  if (!validation.valid) return

  await assert.rejects(repository.replaceData(backup.data), (error) => error.operation === 'replace')
  assert.equal(storage.value, original)
})

test('repository rejects unsupported collections and missing record updates', async () => {
  const repository = createLocalStorageRepository()
  await repository.load()

  await assert.rejects(repository.addRecord('unknown', {}), /Unsupported data collection/)
  await assert.rejects(repository.updateRecord('customers', 'missing', {}), /No customers record exists/)
  await assert.rejects(repository.deleteRecord('customers', 'missing'), /No customers record exists/)
})
