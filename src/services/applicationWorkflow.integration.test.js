import assert from 'node:assert/strict'
import test from 'node:test'
import { initialData } from '../data/initialData.js'
import { measurementFields } from '../data/measurementTemplates.js'
import {
  createBackup,
  validateBackup,
} from './backupService.js'
import {
  getOrderBalance,
  getPaidForOrder,
  validatePayment,
} from './orderAccounting.js'
import { createLocalStorageRepository } from './localStorageRepository.js'
import {
  createOrderRecord,
  transitionOrder,
} from './orderWorkflow.js'

const storageKey = 'tailorpro-data-v1'
const testDate = '2026-10-30'

function installStorage(value = JSON.stringify(structuredClone(initialData))) {
  const state = { value, setError: null }
  globalThis.window = {
    localStorage: {
      getItem: (key) => key === storageKey ? state.value : null,
      setItem(key, nextValue) {
        if (state.setError) throw state.setError
        if (key === storageKey) state.value = nextValue
      },
    },
  }
  return state
}

async function loadRepository() {
  const repository = createLocalStorageRepository()
  await repository.load()
  return repository
}

function makeMeasurement(customer, version, values = {}) {
  const fields = measurementFields['Formal shirt']
  return {
    id: `integration-measurement-${version}`,
    customerId: customer.id,
    customer: customer.name,
    garment: 'Formal shirt',
    date: testDate,
    version,
    values: Object.fromEntries(fields.map((field, index) => [field, values[field] ?? String(15 + index)])),
  }
}

function makeOrder({ id, customerId = 'c1', customer = 'Aarav Mehta', tailor = '', amount = 1000 }) {
  return createOrderRecord({
    customerId,
    customer,
    garment: 'Formal shirt',
    tailor,
    dueDate: '2026-11-15',
    amount,
    advance: 0,
  }, id, testDate)
}

async function transitionAndSave(repository, order, nextStatus) {
  const transition = transitionOrder(order, nextStatus)
  if (!transition.valid) return transition
  await repository.updateRecord('orders', order.id, transition.order)
  return transition
}

test('TailorPro business workflow integration', async (t) => {
  await t.test('customer create, edit, refresh persistence, and referenced-delete protection', async () => {
    installStorage()
    const repository = await loadRepository()
    const customer = await repository.addRecord('customers', {
      id: 'integration-customer',
      name: 'Test Customer',
      phone: '555-0199',
      email: 'test@example.com',
    })
    await repository.updateRecord('customers', customer.record.id, { name: 'Updated Test Customer', city: 'Pune' })

    const refreshed = await createLocalStorageRepository().load()
    const persistedCustomer = refreshed.data.customers.find((item) => item.id === customer.record.id)
    assert.equal(persistedCustomer.name, 'Updated Test Customer')
    assert.equal(persistedCustomer.city, 'Pune')

    await repository.addRecord('measurements', makeMeasurement(persistedCustomer, 1))
    await assert.rejects(repository.deleteRecord('customers', persistedCustomer.id), /cannot be deleted/i)
    await repository.addRecord('orders', makeOrder({
      id: 'integration-customer-order',
      customerId: persistedCustomer.id,
      customer: persistedCustomer.name,
    }))
    await assert.rejects(repository.deleteRecord('customers', persistedCustomer.id), /cannot be deleted/i)
    const disposable = await repository.addRecord('customers', {
      id: 'integration-disposable-customer',
      name: 'Disposable Customer',
      phone: '555-0198',
    })
    await repository.deleteRecord('customers', disposable.record.id)
    assert.equal((await repository.load()).data.customers.some((item) => item.id === disposable.record.id), false)
  })

  await t.test('measurement versions preserve history and reject duplicate versions', async () => {
    installStorage()
    const repository = await loadRepository()
    const customer = {
      id: 'integration-measurement-customer',
      name: 'Measurement Customer',
      phone: '555-0188',
    }
    await repository.addRecord('customers', customer)
    const first = makeMeasurement(customer, 1)
    await repository.addRecord('measurements', first)
    const second = makeMeasurement(customer, 2, { Chest: '44' })
    await repository.addRecord('measurements', second)

    const data = (await repository.load()).data
    assert.deepEqual(data.measurements.find((item) => item.id === first.id), first)
    assert.equal(data.measurements.find((item) => item.id === second.id).values.Chest, '44')
    await assert.rejects(
      repository.addRecord('measurements', { ...second, id: 'integration-duplicate-version' }),
      /version 2 already exists/i,
    )
  })

  await t.test('orders start at New, follow valid transitions, and retain valid relationships', async () => {
    installStorage()
    const repository = await loadRepository()
    const assignedOrder = makeOrder({ id: 'integration-order-tailor', tailor: 'Dev Patel' })
    const unassignedOrder = makeOrder({ id: 'integration-order-no-tailor' })
    await repository.addRecord('orders', assignedOrder)
    await repository.addRecord('orders', unassignedOrder)

    const invalid = await transitionAndSave(repository, assignedOrder, 'Stitching')
    assert.equal(invalid.valid, false)
    assert.equal((await repository.load()).data.orders.find((item) => item.id === assignedOrder.id).status, 'New')

    const confirmed = await transitionAndSave(repository, assignedOrder, 'Confirmed')
    assert.equal(confirmed.valid, true)
    const assigned = await transitionAndSave(repository, confirmed.order, 'Assigned')
    assert.equal(assigned.valid, true)
    assert.equal(assigned.order.status, 'Assigned')
    const savedAssignedOrder = (await repository.load()).data.orders.find((item) => item.id === assignedOrder.id)
    assert.equal(savedAssignedOrder.tailor, 'Dev Patel')
    assert.equal(savedAssignedOrder.customerId, assignedOrder.customerId)

    const unassignedConfirmed = await transitionAndSave(repository, unassignedOrder, 'Confirmed')
    assert.equal(unassignedConfirmed.valid, true)
    const invalidAssignment = await transitionAndSave(repository, unassignedConfirmed.order, 'Assigned')
    assert.equal(invalidAssignment.valid, false)

    const invalidRelationship = makeOrder({ id: 'integration-orphan-order', customerId: 'missing-customer' })
    await assert.rejects(repository.addRecord('orders', invalidRelationship), /missing customer/i)
    const validData = (await repository.load()).data
    assert.ok(validData.customers.some((item) => item.id === assignedOrder.customerId))
    assert.ok(validData.measurements.some((item) => item.customerId === assignedOrder.customerId))
  })

  await t.test('payments update balances, reject invalid amounts, and remain after cancellation', async () => {
    installStorage()
    const repository = await loadRepository()
    const order = makeOrder({ id: 'integration-payment-order', amount: 1000 })
    await repository.addRecord('orders', order)
    const payments = []
    const recordPayment = async (id, amount, type) => {
      const payment = {
        id,
        orderId: order.id,
        customer: order.customer,
        date: testDate,
        amount,
        method: 'Cash',
        type,
      }
      const validation = validatePayment({ order, payments, amount, method: payment.method, type, id })
      assert.equal(validation.valid, true, validation.error)
      const added = await repository.addRecord('payments', payment)
      payments.push(added.record)
      return added.record
    }

    await recordPayment('integration-payment-advance', 250, 'Advance')
    await recordPayment('integration-payment-balance', 300, 'Partial')
    assert.equal(getPaidForOrder(payments, order.id), 550)
    assert.equal(getOrderBalance(order, payments), 450)
    assert.equal(validatePayment({ order, payments, amount: -1, method: 'Cash', type: 'Partial' }).valid, false)
    assert.equal(validatePayment({ order, payments, amount: 450.01, method: 'Cash', type: 'Partial' }).valid, false)
    await assert.rejects(repository.addRecord('payments', {
      id: 'integration-payment-excess',
      orderId: order.id,
      customer: order.customer,
      date: testDate,
      amount: 450.01,
      method: 'Cash',
      type: 'Partial',
    }), /outstanding balance/i)

    const cancelled = await transitionAndSave(repository, order, 'Cancelled')
    assert.equal(cancelled.valid, true)
    const persisted = (await createLocalStorageRepository().load()).data
    assert.equal(persisted.payments.filter((payment) => payment.orderId === order.id).length, 2)
    assert.equal(persisted.orders.find((item) => item.id === order.id).status, 'Cancelled')
    await assert.rejects(repository.deleteRecord('payments', 'integration-payment-advance'), /cannot be deleted/i)
    await assert.rejects(repository.deleteRecord('orders', order.id), /payment history/i)
  })

  await t.test('staff assignment blocks unsafe deletion and inventory CRUD validates data', async () => {
    installStorage()
    const repository = await loadRepository()
    const staff = await repository.addRecord('staff', {
      id: 'integration-staff',
      name: 'Workflow Tailor',
      role: 'Tailor',
      phone: '555-0177',
      email: '',
      active: true,
    })
    await repository.updateRecord('staff', staff.record.id, { phone: '555-0178' })
    assert.equal((await repository.load()).data.staff.find((member) => member.id === staff.record.id).phone, '555-0178')
    const order = makeOrder({ id: 'integration-staff-order', tailor: 'Workflow Tailor' })
    await repository.addRecord('orders', order)
    await assert.rejects(repository.deleteRecord('staff', staff.record.id), /reassign those orders/i)
    const unassignedStaff = await repository.addRecord('staff', {
      id: 'integration-unassigned-staff',
      name: 'Unassigned Tailor',
      role: 'Tailor',
      phone: '555-0176',
      email: '',
      active: true,
    })
    await repository.deleteRecord('staff', unassignedStaff.record.id)
    assert.equal((await repository.load()).data.staff.some((member) => member.id === unassignedStaff.record.id), false)

    const item = await repository.addRecord('inventory', {
      id: 'integration-inventory',
      name: 'Test linen',
      category: 'Fabric',
      sku: 'TEST-FAB-1',
      quantity: 5,
      unit: 'metres',
      reorderAt: 1,
      price: 20,
    })
    await repository.updateRecord('inventory', item.record.id, { quantity: 8 })
    assert.equal((await repository.load()).data.inventory.find((entry) => entry.id === item.record.id).quantity, 8)
    await assert.rejects(repository.updateRecord('inventory', item.record.id, { quantity: -1 }), /non-negative number/i)
    await repository.deleteRecord('inventory', item.record.id)
    assert.equal((await repository.load()).data.inventory.some((entry) => entry.id === item.record.id), false)
  })

  await t.test('backup export/import validates relationships and failed recovery preserves stored data', async () => {
    installStorage()
    const repository = await loadRepository()
    await repository.addRecord('customers', {
      id: 'integration-backup-customer',
      name: 'Backup Customer',
      phone: '555-0166',
    })
    const sourceData = (await repository.load()).data
    const backup = createBackup(sourceData, '2026-10-30T00:00:00.000Z')
    assert.equal(validateBackup(JSON.parse(JSON.stringify(backup))).valid, true)

    const importedStorage = installStorage()
    const importer = await loadRepository()
    await importer.replaceData(backup.data)
    assert.deepEqual((await createLocalStorageRepository().load()).data, sourceData)

    assert.equal(validateBackup({ format: 'TailorPro backup', version: 1, data: null }).valid, false)
    const orphanedBackup = structuredClone(backup)
    orphanedBackup.data.orders[0].customerId = 'missing-customer'
    assert.equal(validateBackup(orphanedBackup).valid, false)
    const beforeInvalidImport = importedStorage.value
    await assert.rejects(importer.replaceData(orphanedBackup.data), /missing customer/i)
    assert.equal(importedStorage.value, beforeInvalidImport)

    const corruptRaw = '{"orders":'
    const recoveryStorage = installStorage(corruptRaw)
    const recovery = createLocalStorageRepository()
    const corruptState = await recovery.load()
    assert.equal(corruptState.status, 'corrupt')
    assert.equal(corruptState.raw, corruptRaw)
    recoveryStorage.setError = new Error('Storage write denied.')
    await assert.rejects(recovery.replaceData(backup.data), (error) => error.operation === 'replace')
    assert.equal(recoveryStorage.value, corruptRaw)
    recoveryStorage.setError = null
    await recovery.replaceData(backup.data)
    assert.equal((await createLocalStorageRepository().load()).status, 'ready')
    assert.deepEqual(JSON.parse(recoveryStorage.value), sourceData)
  })

  await t.test('failed writes retain recoverable changes and retry persists them after refresh', async () => {
    const storage = installStorage()
    const repository = await loadRepository()
    const originalValue = storage.value
    storage.setError = Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' })
    await assert.rejects(
      repository.addRecord('customers', {
        id: 'integration-retry-customer',
        name: 'Retry Customer',
        phone: '555-0155',
      }),
      (error) => error.operation === 'create' && error.data.customers.some((item) => item.id === 'integration-retry-customer'),
    )
    assert.equal(storage.value, originalValue)
    storage.setError = null
    await repository.retrySave()
    const refreshed = await createLocalStorageRepository().load()
    assert.ok(refreshed.data.customers.some((item) => item.id === 'integration-retry-customer'))
  })
})
