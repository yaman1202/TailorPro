import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { initialData } from '../../data/initialData.js'

const projectId = 'demo-tailorpro-rules'
const businessId = 'tailorpro-dev-802c2'
const ownerUid = 'configured-owner-uid'
const collections = ['customers', 'measurements', 'orders', 'payments', 'staff', 'inventory']

let testEnvironment

function versionKeyId(measurement) {
  return `v1-${encodeURIComponent(JSON.stringify([
    measurement.customerId,
    measurement.garment,
    measurement.version,
  ]))}`
}

async function seedData() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    await setDoc(doc(firestore, 'businesses', businessId), { ownerUid })
    await setDoc(doc(firestore, 'businesses', businessId, 'settings', 'business-profile'), initialData.settings)
    await setDoc(doc(firestore, 'businesses', businessId, 'workspaceMetadata', 'current'), { revision: 1 })

    for (const customer of initialData.customers) {
      await setDoc(doc(firestore, 'businesses', businessId, 'customers', customer.id), customer)
    }
    for (const measurement of initialData.measurements) {
      const keyId = versionKeyId(measurement)
      await setDoc(doc(firestore, 'businesses', businessId, 'measurements', measurement.id), {
        ...measurement,
        versionKeyId: keyId,
      })
      await setDoc(doc(firestore, 'businesses', businessId, 'measurementVersionKeys', keyId), {
        id: keyId,
        customerId: measurement.customerId,
        garment: measurement.garment,
        version: measurement.version,
        measurementId: measurement.id,
      })
    }
    for (const order of initialData.orders) {
      const orderPayments = initialData.payments.filter((payment) => payment.orderId === order.id)
      const paidMinorUnits = orderPayments.reduce((total, payment) => total + Math.round(payment.amount * 100), 0)
      await setDoc(doc(firestore, 'businesses', businessId, 'orders', order.id), {
        ...order,
        paidMinorUnits,
        paymentCount: orderPayments.length,
      })
      await setDoc(doc(firestore, 'businesses', businessId, 'orderAccounting', order.id), {
        orderId: order.id,
        paidMinorUnits,
        paymentCount: orderPayments.length,
      })
    }
    for (const payment of initialData.payments) {
      await setDoc(doc(firestore, 'businesses', businessId, 'payments', payment.id), payment)
    }
    for (const member of initialData.staff) {
      await setDoc(doc(firestore, 'businesses', businessId, 'staff', member.id), member)
    }
    for (const item of initialData.inventory) {
      await setDoc(doc(firestore, 'businesses', businessId, 'inventory', item.id), item)
    }
  })
}

before(async () => {
  const rules = await readFile(new URL('../../../firestore.rules', import.meta.url), 'utf8')
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  })
})

beforeEach(async () => {
  await testEnvironment.clearFirestore()
  await seedData()
})

after(async () => {
  await testEnvironment?.cleanup()
})

test('only the configured owner can read business data', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  const otherDb = testEnvironment.authenticatedContext('different-authenticated-user').firestore()
  const unauthenticatedDb = testEnvironment.unauthenticatedContext().firestore()
  await assertSucceeds(getDoc(doc(ownerDb, 'businesses', businessId, 'customers', 'c1')))
  await assertSucceeds(getDoc(doc(ownerDb, 'businesses', businessId, 'settings', 'business-profile')))
  for (const database of [otherDb, unauthenticatedDb]) {
    await assertFails(getDoc(doc(database, 'businesses', businessId, 'customers', 'c1')))
    await assertFails(getDoc(doc(database, 'businesses', businessId, 'payments', 'p1')))
    await assertFails(getDoc(doc(database, 'businesses', businessId, 'settings', 'business-profile')))
  }
})

test('ownership document cannot be created, updated, or deleted by clients', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  await assertFails(setDoc(doc(ownerDb, 'businesses', businessId), { ownerUid }))
  await assertFails(updateDoc(doc(ownerDb, 'businesses', businessId), { ownerUid: 'different-uid' }))
  await assertFails(deleteDoc(doc(ownerDb, 'businesses', businessId)))
})

test('unknown paths, collections, and business IDs are denied', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  await assertFails(getDoc(doc(ownerDb, 'businesses', 'another-business')))
  await assertFails(setDoc(doc(ownerDb, 'businesses', businessId, 'unknown', 'document'), { value: true }))
  await assertFails(getDoc(doc(ownerDb, 'unrecognized-root', 'document')))
  await assertFails(getDoc(doc(ownerDb, 'businesses', businessId, 'customers', 'c1', 'unknown-subcollection', 'doc')))
})

test('document schemas reject unknown fields and mismatched immutable IDs', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  await assertFails(setDoc(doc(ownerDb, 'businesses', businessId, 'customers', 'extra-field'), {
    id: 'extra-field',
    name: 'Asha',
    phone: '555-0101',
    isOwner: true,
  }))
  await assertFails(setDoc(doc(ownerDb, 'businesses', businessId, 'customers', 'wrong-id'), {
    id: 'another-id',
    name: 'Asha',
    phone: '555-0101',
  }))
  await assertFails(updateDoc(doc(ownerDb, 'businesses', businessId, 'orders', 'TP-2408'), {
    customerId: 'c2',
  }))
})

test('owner can create customers with optional address and location fields', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  const batch = writeBatch(ownerDb)
  batch.set(doc(ownerDb, 'businesses', businessId, 'customers', 'optional-contact-customer'), {
    id: 'optional-contact-customer',
    name: 'Mina Rao',
    phone: '555-0133',
    address: '8 Needle Lane',
    city: 'Pune',
    joined: '2026-10-31',
  })
  batch.update(doc(ownerDb, 'businesses', businessId, 'workspaceMetadata', 'current'), { revision: 2 })
  await assertSucceeds(batch.commit())

  await assertFails(setDoc(doc(ownerDb, 'businesses', businessId, 'customers', 'invalid-address'), {
    id: 'invalid-address',
    name: 'Mina Rao',
    phone: '555-0133',
    address: 123,
  }))
})

test('payment documents cannot be updated or deleted', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  const paymentRef = doc(ownerDb, 'businesses', businessId, 'payments', 'p1')
  await assertFails(updateDoc(paymentRef, { amount: 1 }))
  await assertFails(deleteDoc(paymentRef))
})

test('order deletion is denied when payment accounting shows history', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  await assertFails(deleteDoc(doc(ownerDb, 'businesses', businessId, 'orders', 'TP-2408')))
})

test('an unpaid order can be deleted only with its zero accounting metadata', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  const batch = writeBatch(ownerDb)
  batch.delete(doc(ownerDb, 'businesses', businessId, 'orders', 'TP-2404'))
  batch.delete(doc(ownerDb, 'businesses', businessId, 'orderAccounting', 'TP-2404'))
  batch.update(doc(ownerDb, 'businesses', businessId, 'workspaceMetadata', 'current'), { revision: 2 })
  await assertSucceeds(batch.commit())
})

test('measurement version keys are linked to immutable measurement versions', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  const measurement = initialData.measurements[0]
  const keyId = versionKeyId(measurement)
  const keyRef = doc(ownerDb, 'businesses', businessId, 'measurementVersionKeys', keyId)
  await assertFails(updateDoc(keyRef, { measurementId: 'different-measurement' }))
  await assertFails(deleteDoc(keyRef))
  await assertFails(updateDoc(doc(ownerDb, 'businesses', businessId, 'measurements', measurement.id), {
    values: { ...measurement.values, Chest: '41' },
  }))

  const orphan = {
    ...measurement,
    id: 'measurement-without-key',
    version: 99,
    versionKeyId: 'unlinked-key',
  }
  await assertFails(setDoc(doc(ownerDb, 'businesses', businessId, 'measurements', orphan.id), orphan))
  await assertFails(setDoc(
    doc(ownerDb, 'businesses', businessId, 'measurementVersionKeys', 'wrong-link'),
    { id: 'wrong-link', customerId: 'c1', garment: 'Formal shirt', version: 99, measurementId: orphan.id },
  ))
})

test('garment measurements support declared units and custom fields with atomic version metadata', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  const measurement = {
    id: 'custom-blouse-measurement',
    customerId: 'c1',
    customer: 'Aarav Mehta',
    garment: 'Blouse',
    date: '2026-10-31',
    version: 1,
    unit: 'cm',
    values: {
      'Bust/Chest': '86',
      Waist: '70',
      Shoulder: '36',
      'Sleeve Length': '25',
      Armhole: '38',
      'Blouse Length': '40',
      'Front Neck Depth': '18',
      'Back Neck Depth': '12',
      'Under Bust': '75',
      'Custom seam': '4',
    },
  }
  const keyId = versionKeyId(measurement)
  const batch = writeBatch(ownerDb)
  batch.set(doc(ownerDb, 'businesses', businessId, 'measurements', measurement.id), { ...measurement, versionKeyId: keyId })
  batch.set(doc(ownerDb, 'businesses', businessId, 'measurementVersionKeys', keyId), {
    id: keyId,
    customerId: measurement.customerId,
    garment: measurement.garment,
    version: measurement.version,
    measurementId: measurement.id,
  })
  batch.update(doc(ownerDb, 'businesses', businessId, 'workspaceMetadata', 'current'), { revision: 2 })
  await assertSucceeds(batch.commit())

  const invalidMeasurement = {
    ...measurement,
    id: 'invalid-unit',
    unit: 'feet',
    version: 2,
  }
  const invalidKeyId = versionKeyId(invalidMeasurement)
  const invalidBatch = writeBatch(ownerDb)
  invalidBatch.set(doc(ownerDb, 'businesses', businessId, 'measurements', invalidMeasurement.id), {
    ...invalidMeasurement,
    versionKeyId: invalidKeyId,
  })
  invalidBatch.set(doc(ownerDb, 'businesses', businessId, 'measurementVersionKeys', invalidKeyId), {
    id: invalidKeyId,
    customerId: invalidMeasurement.customerId,
    garment: invalidMeasurement.garment,
    version: invalidMeasurement.version,
    measurementId: invalidMeasurement.id,
  })
  invalidBatch.update(doc(ownerDb, 'businesses', businessId, 'workspaceMetadata', 'current'), { revision: 3 })
  await assertFails(invalidBatch.commit())
})

test('orders can reference only a measurement profile for the same customer', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  const orderRef = doc(ownerDb, 'businesses', businessId, 'orders', 'TP-2408')
  const validBatch = writeBatch(ownerDb)
  validBatch.update(orderRef, { measurementId: 'm1' })
  validBatch.update(doc(ownerDb, 'businesses', businessId, 'workspaceMetadata', 'current'), { revision: 2 })
  await assertSucceeds(validBatch.commit())

  const invalidBatch = writeBatch(ownerDb)
  invalidBatch.update(orderRef, { measurementId: 'm2' })
  invalidBatch.update(doc(ownerDb, 'businesses', businessId, 'workspaceMetadata', 'current'), { revision: 3 })
  await assertFails(invalidBatch.commit())
})

test('metadata documents are owner-only and constrained to the expected revision shape', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  const otherDb = testEnvironment.authenticatedContext('different-authenticated-user').firestore()
  const workspace = doc(ownerDb, 'businesses', businessId, 'workspaceMetadata', 'current')
  await assertSucceeds(getDoc(workspace))
  await assertFails(getDoc(doc(otherDb, 'businesses', businessId, 'workspaceMetadata', 'current')))
  await assertFails(setDoc(doc(ownerDb, 'businesses', businessId, 'workspaceMetadata', 'other'), { revision: 1 }))
})

test('business writes require an atomic workspace revision advance', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  const customer = { id: 'revision-test', name: 'Test Customer', phone: '555-0199' }
  const customerRef = doc(ownerDb, 'businesses', businessId, 'customers', customer.id)
  await assertFails(setDoc(customerRef, customer))

  const batch = writeBatch(ownerDb)
  batch.set(customerRef, customer)
  batch.update(doc(ownerDb, 'businesses', businessId, 'workspaceMetadata', 'current'), { revision: 2 })
  await assertSucceeds(batch.commit())
})

test('owner can read all six approved collections but cannot write arbitrary shapes', async () => {
  const ownerDb = testEnvironment.authenticatedContext(ownerUid).firestore()
  for (const collectionName of collections) {
    const snapshot = await assertSucceeds(getDoc(doc(ownerDb, 'businesses', businessId, collectionName, collectionName === 'payments' ? 'p1' : collectionName === 'customers' ? 'c1' : collectionName === 'measurements' ? 'm1' : collectionName === 'orders' ? 'TP-2408' : collectionName === 'staff' ? 's1' : 'i1')))
    assert.equal(snapshot.exists(), true)
  }
  await assertFails(setDoc(doc(ownerDb, 'businesses', businessId, 'inventory', 'bad-inventory'), { id: 'bad-inventory', name: 'Invalid' }))
  await assertFails(setDoc(doc(ownerDb, 'businesses', businessId, 'settings', 'other-settings'), initialData.settings))
})
