import { validateData, validateDeletion, validateEntity, validatePaymentEntity, validateSettings } from './validation.js'
import { createBackup } from './backupService.js'
import { canAcceptPayment, getPaidForOrder } from './orderAccounting.js'
import { transitionOrder as transitionOrderRecord } from './orderWorkflow.js'
import { FIRESTORE_BUSINESS_ID, getOwnerFirestore } from './firebase/firebaseFirestore.js'

const dataCollections = ['customers', 'measurements', 'orders', 'payments', 'staff', 'inventory']
const transactionWriteLimit = 500
const transactionRuleAccessLimit = 20
const descendingDateFields = {
  customers: 'joined',
  measurements: 'date',
  orders: 'createdAt',
  payments: 'date',
}

export class FirestoreRepositoryError extends Error {
  constructor(category, message, cause) {
    super(message, { cause })
    this.name = 'FirestoreRepositoryError'
    this.category = category
    this.code = cause?.code
  }
}

function classifyFirestoreError(error) {
  if (error instanceof FirestoreRepositoryError) return error

  const code = typeof error?.code === 'string'
    ? error.code.replace(/^firestore\//, '')
    : ''
  if (code === 'unauthenticated' || code === 'auth/unauthenticated') {
    return new FirestoreRepositoryError('unauthenticated', 'Sign in as the TailorPro owner to access business data.', error)
  }
  if (code === 'permission-denied') {
    return new FirestoreRepositoryError('permission-denied', 'Firebase denied access to this business. Verify the signed-in owner and deployed security rules.', error)
  }
  if (error?.category) return error
  if (['unavailable', 'deadline-exceeded', 'network-request-failed', 'cancelled'].includes(code)) {
    return new FirestoreRepositoryError('network', 'TailorPro could not reach Firestore. Check your connection and try again.', error)
  }
  if (error?.message?.includes('Firebase configuration is missing')) {
    return new FirestoreRepositoryError('configuration', error.message, error)
  }
  return new FirestoreRepositoryError(
    code ? 'operation' : 'validation',
    error?.message || 'Unable to complete the Firestore operation.',
    error,
  )
}

function malformed(message, cause) {
  return new FirestoreRepositoryError('malformed-data', message, cause)
}

function mapCollectionDocuments(collectionName, snapshot) {
  const records = snapshot.docs
    .map((documentSnapshot) => mapRecordDocument(collectionName, documentSnapshot))
    .filter(Boolean)
  const dateField = descendingDateFields[collectionName]
  if (dateField) {
    records.sort((left, right) => String(right[dateField] ?? '').localeCompare(String(left[dateField] ?? '')))
  }
  if (collectionName === 'measurements') {
    records.sort((left, right) => (
      String(right.date ?? '').localeCompare(String(left.date ?? ''))
      || Number(right.version) - Number(left.version)
    ))
  }
  return records
}

function mapRecordDocument(collectionName, documentSnapshot) {
  if (!documentSnapshot.exists()) return null
  const record = documentSnapshot.data()
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw malformed(`Firestore ${collectionName} document "${documentSnapshot.id}" must contain an object.`)
  }
  if (record.id !== documentSnapshot.id) {
    throw malformed(`Firestore ${collectionName} document "${documentSnapshot.id}" has a mismatched or missing stored ID.`)
  }
  if (collectionName === 'measurements') {
    const { versionKeyId, ...measurement } = record
    if (versionKeyId !== undefined && versionKeyId !== measurementVersionKeyId(measurement)) {
      throw malformed(`Firestore measurement "${documentSnapshot.id}" has invalid version-key metadata.`)
    }
    return measurement
  }
  if (collectionName === 'orders') {
    const { paidMinorUnits, paymentCount, ...order } = record
    if ((paidMinorUnits !== undefined && (!Number.isSafeInteger(paidMinorUnits) || paidMinorUnits < 0))
      || (paymentCount !== undefined && (!Number.isSafeInteger(paymentCount) || paymentCount < 0))) {
      throw malformed(`Firestore order "${documentSnapshot.id}" has invalid payment metadata.`)
    }
    return order
  }
  return record
}

function mapSettingsDocument(snapshot) {
  if (!snapshot.exists()) return null
  const settings = snapshot.data()
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw malformed('The Firestore business-profile settings document must contain an object.')
  }
  if (settings.id !== undefined && settings.id !== snapshot.id) {
    throw malformed('The Firestore business-profile settings document has a mismatched stored ID.')
  }
  const canonicalSettings = { ...settings }
  delete canonicalSettings.id
  return canonicalSettings
}

function validateWorkspace(data) {
  const validation = validateData(data, { allowLegacyMeasurements: true })
  if (!validation.valid) {
    throw malformed(`Firestore business data is invalid: ${validation.errors.join(' ')}`)
  }
}

function makeRecordId(collectionName) {
  const generatedId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return `${collectionName.slice(0, 1)}-${generatedId}`
}

function collectionRef(firestore, name) {
  return ['businesses', FIRESTORE_BUSINESS_ID, name]
}

function documentRef(firestore, sdk, name, id) {
  return sdk.doc(firestore, ...collectionRef(firestore, name), id)
}

function measurementVersionKeyId(measurement) {
  const key = `v1-${encodeURIComponent(JSON.stringify([
    measurement.customerId,
    measurement.garment,
    measurement.version,
  ]))}`
  if (new TextEncoder().encode(key).length > 1500) {
    throw new Error('Measurement details are too long to create a safe version key.')
  }
  return key
}

function toMinorUnits(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

function emptyWorkspace() {
  return {
    customers: [],
    measurements: [],
    orders: [],
    payments: [],
    staff: [],
    inventory: [],
    settings: null,
  }
}

function assertWriteCount(count) {
  if (count > transactionWriteLimit) {
    throw new Error(`This operation requires ${count} Firestore writes, exceeding the ${transactionWriteLimit}-write transaction limit. No changes were made.`)
  }
}

function assertRuleAccessBudget(currentData, nextData, plan) {
  const paths = new Set([
    `businesses/${FIRESTORE_BUSINESS_ID}`,
    `businesses/${FIRESTORE_BUSINESS_ID}/workspaceMetadata/current`,
  ])
  const add = (collectionName, id) => paths.add(`businesses/${FIRESTORE_BUSINESS_ID}/${collectionName}/${id}`)
  const currentByCollection = Object.fromEntries(
    dataCollections.map((name) => [name, new Map(currentData[name].map((record) => [record.id, record]))]),
  )

  for (const collectionName of dataCollections) {
    const nextById = new Map(nextData[collectionName].map((record) => [record.id, record]))
    for (const [id, record] of currentByCollection[collectionName]) {
      const next = nextById.get(id)
      if (next && safeMetadataEqual(record, next)) continue
      if (collectionName === 'measurements' && next) {
        add('customers', next?.customerId || record.customerId)
        add('measurementVersionKeys', measurementVersionKeyId(next || record))
      } else if (collectionName === 'orders' && next) {
        add('customers', next.customerId)
        add('orderAccounting', id)
        if (next.measurementId) add('measurements', next.measurementId)
      }
    }
    for (const [id, record] of nextById) {
      if (currentByCollection[collectionName].has(id)) continue
      if (collectionName === 'measurements') {
        add('customers', record.customerId)
        add('measurementVersionKeys', measurementVersionKeyId(record))
      } else if (collectionName === 'orders') {
        add('customers', record.customerId)
        add('orderAccounting', id)
        if (record.measurementId) add('measurements', record.measurementId)
      } else if (collectionName === 'payments') {
        add('orders', record.orderId)
        add('orderAccounting', record.orderId)
      }
    }
  }
  for (const { id, data: key } of plan.keySets) {
    add('measurementVersionKeys', id)
    add('measurements', key.measurementId)
  }
  for (const { keyId, measurement } of plan.measurementBackfills) {
    add('customers', measurement.customerId)
    add('measurementVersionKeys', keyId)
  }
  for (const { id } of plan.accountSets) {
    add('orders', id)
    const order = nextData.orders.find((record) => record.id === id)
    if (order?.measurementId) add('measurements', order.measurementId)
  }
  for (const { id } of plan.orderBackfills) {
    const order = nextData.orders.find((record) => record.id === id)
    if (order?.measurementId) add('measurements', order.measurementId)
  }
  for (const id of plan.accountDeletes) {
    add('orders', id)
  }

  if (paths.size > transactionRuleAccessLimit) {
    throw new Error(
      `This restore may require more than Firestore's ${transactionRuleAccessLimit} Rules document-access calls. No changes were made; restore a smaller backup or use an owner-reviewed recovery plan.`,
    )
  }
}

function countDatasetChanges(currentData, nextData) {
  let count = 0
  for (const name of dataCollections) {
    const previous = new Map(currentData[name].map((record) => [record.id, record]))
    const next = new Map(nextData[name].map((record) => [record.id, record]))
    for (const [id, record] of previous) {
      if (!next.has(id) || !safeMetadataEqual(record, next.get(id))) count += 1
    }
    for (const id of next.keys()) {
      if (!previous.has(id)) count += 1
    }
  }
  return count
}

function paymentTotalsByOrder(data) {
  const totals = new Map()
  for (const payment of data.payments) {
    const total = totals.get(payment.orderId) || { paidMinorUnits: 0, paymentCount: 0 }
    total.paidMinorUnits += toMinorUnits(payment.amount)
    total.paymentCount += 1
    totals.set(payment.orderId, total)
  }
  return totals
}

function assertBackupFields(data) {
  const collectionNames = [...Object.keys({
    customers: [],
    measurements: [],
    orders: [],
    payments: [],
    staff: [],
    inventory: [],
  }), 'settings']
  if (Object.keys(data).some((field) => !collectionNames.includes(field))) {
    throw new Error('Backup data contains unsupported top-level fields.')
  }
  const allowedFields = {
    customers: ['id', 'name', 'phone', 'email', 'address', 'city', 'joined', 'archived'],
    measurements: ['id', 'customerId', 'customer', 'garment', 'date', 'version', 'unit', 'values'],
    orders: ['id', 'customerId', 'customer', 'garment', 'measurementId', 'tailor', 'dueDate', 'amount', 'advance', 'status', 'createdAt'],
    payments: ['id', 'orderId', 'customer', 'date', 'amount', 'method', 'type'],
    staff: ['id', 'name', 'role', 'phone', 'email', 'active'],
    inventory: ['id', 'name', 'category', 'sku', 'quantity', 'unit', 'reorderAt', 'price'],
  }
  for (const [collectionName, fields] of Object.entries(allowedFields)) {
    for (const record of data[collectionName]) {
      if (Object.keys(record).some((field) => !fields.includes(field))) {
        throw new Error(`Backup ${collectionName} records contain unsupported fields.`)
      }
    }
  }
  const settingsFields = ['businessName', 'owner', 'email', 'phone', 'address', 'currency', 'reminders', 'lowStockAlerts']
  if (Object.keys(data.settings).some((field) => !settingsFields.includes(field))) {
    throw new Error('Backup settings contain unsupported fields.')
  }
}

function assertReplacementPreservesHistory(currentData, nextData) {
  const importedPayments = new Map(nextData.payments.map((payment) => [payment.id, payment]))
  const currentPaymentIds = new Set(currentData.payments.map((payment) => payment.id))
  for (const payment of currentData.payments) {
    if (!safeMetadataEqual(importedPayments.get(payment.id), payment)) {
      throw new Error(`Restore cannot remove or change existing payment "${payment.id}". The payment ledger is immutable.`)
    }
  }

  const newPaymentCounts = new Map()
  for (const payment of nextData.payments) {
    if (currentPaymentIds.has(payment.id)) continue
    const count = (newPaymentCounts.get(payment.orderId) || 0) + 1
    newPaymentCounts.set(payment.orderId, count)
  }
  if ([...newPaymentCounts.values()].some((count) => count > 1)) {
    throw new Error('Restore cannot add multiple payments to the same order in one atomic operation. No changes were made.')
  }

  const importedMeasurements = new Map(nextData.measurements.map((measurement) => [measurement.id, measurement]))
  for (const measurement of currentData.measurements) {
    const imported = importedMeasurements.get(measurement.id)
    if (!imported) {
      throw new Error(`Restore cannot remove measurement history "${measurement.id}".`)
    }
    if (imported.customerId !== measurement.customerId
      || imported.garment !== measurement.garment
      || imported.version !== measurement.version) {
      throw new Error(`Restore cannot change the identity of measurement version "${measurement.id}".`)
    }
  }

  const currentPaymentsByOrder = paymentTotalsByOrder(currentData)
  const nextOrders = new Map(nextData.orders.map((order) => [order.id, order]))
  for (const [orderId, totals] of currentPaymentsByOrder) {
    const currentOrder = currentData.orders.find((order) => order.id === orderId)
    const importedOrder = nextOrders.get(orderId)
    if (!importedOrder || importedOrder.customerId !== currentOrder.customerId) {
      throw new Error(`Restore cannot remove or reassign order "${orderId}" with payment history.`)
    }
    if (toMinorUnits(importedOrder.amount) < totals.paidMinorUnits) {
      throw new Error(`Restore cannot reduce order "${orderId}" below its recorded payments.`)
    }
  }
}

function safeMetadataEqual(left, right) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]))
    }
    return value
  }
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

function storedRecord(collectionName, record, data, paymentTotals = paymentTotalsByOrder(data), orderPaymentOverrides = null) {
  if (collectionName === 'measurements') {
    return { ...record, versionKeyId: measurementVersionKeyId(record) }
  }
  if (collectionName === 'orders') {
    if (orderPaymentOverrides && orderPaymentOverrides.has(record.id)) {
      return { ...record, ...orderPaymentOverrides.get(record.id) }
    }
    const totals = paymentTotals.get(record.id) || { paidMinorUnits: 0, paymentCount: 0 }
    return { ...record, ...totals }
  }
  return record
}

function diffDatasetWrites(transaction, firestore, sdk, currentData, nextData, additionalWriteCount = 0, orderPaymentOverrides = null) {
  const changed = []
  const previousPaymentTotals = paymentTotalsByOrder(currentData)
  const nextPaymentTotals = paymentTotalsByOrder(nextData)
  for (const name of dataCollections) {
    const previous = new Map(currentData[name].map((record) => [record.id, record]))
    const next = new Map(nextData[name].map((record) => [record.id, record]))
    for (const [id, record] of previous) {
      if (!next.has(id)) changed.push({ type: 'delete', name, id })
      else if (!safeMetadataEqual(
        storedRecord(name, record, currentData, previousPaymentTotals, orderPaymentOverrides),
        storedRecord(name, next.get(id), nextData, nextPaymentTotals, orderPaymentOverrides),
      )) {
        changed.push({ type: 'set', name, id, record: next.get(id) })
      }
    }
    for (const [id, record] of next) {
      if (!previous.has(id)) changed.push({ type: 'set', name, id, record })
    }
  }
  assertWriteCount(changed.length + additionalWriteCount + 1)
  changed.forEach((change) => {
    const ref = documentRef(firestore, sdk, change.name, change.id)
    if (change.type === 'delete') transaction.delete(ref)
    else transaction.set(ref, storedRecord(change.name, change.record, nextData, nextPaymentTotals, orderPaymentOverrides))
  })
}

export class FirestoreRepository {
  constructor({
    firestoreProvider = getOwnerFirestore,
    firestoreSdkProvider = () => import('firebase/firestore'),
    currentUserProvider,
  } = {}) {
    this.firestoreProvider = firestoreProvider
    this.firestoreSdkProvider = firestoreSdkProvider
    this.currentUserProvider = currentUserProvider
  }

  async load() {
    try {
      if (this.currentUserProvider) {
        const user = await this.currentUserProvider()
        if (!user?.uid) {
          throw new FirestoreRepositoryError('unauthenticated', 'Sign in as the TailorPro owner before loading business data.')
        }
      }

      const firestore = await this.firestoreProvider()
      const { collection, doc, getDoc, getDocs } = await this.firestoreSdkProvider()
      const businessPath = ['businesses', FIRESTORE_BUSINESS_ID]
      const workspaceRef = doc(firestore, ...businessPath, 'workspaceMetadata', 'current')
      const revisionBeforeSnapshot = await getDoc(workspaceRef)
      const revisionBefore = revisionBeforeSnapshot.exists()
        ? revisionBeforeSnapshot.data().revision
        : 0
      if (!Number.isSafeInteger(revisionBefore) || revisionBefore < 0) {
        throw malformed('Firestore workspace revision metadata is invalid.')
      }
      const collectionSnapshots = await Promise.all(
        dataCollections.map((name) => getDocs(collection(firestore, ...businessPath, name))),
      )
      const settingsSnapshot = await getDoc(doc(firestore, ...businessPath, 'settings', 'business-profile'))
      const revisionAfterSnapshot = await getDoc(workspaceRef)
      const revisionAfter = revisionAfterSnapshot.exists()
        ? revisionAfterSnapshot.data().revision
        : 0
      if (revisionAfter !== revisionBefore) {
        throw new FirestoreRepositoryError('conflict', 'Business data changed while it was loading. Reload and retry.')
      }

      const data = Object.fromEntries(
        dataCollections.map((name, index) => [name, mapCollectionDocuments(name, collectionSnapshots[index])]),
      )
      data.settings = mapSettingsDocument(settingsSnapshot)

      const hasRecords = dataCollections.some((name) => data[name].length > 0)
      if (!hasRecords && data.settings === null) {
        return { data: null, status: 'uninitialized', error: '', raw: null, revision: revisionAfter }
      }
      if (data.settings === null) {
        throw malformed('Firestore contains business records but is missing the settings/business-profile document.')
      }

      validateWorkspace(data)
      return { data, status: 'ready', error: '', raw: null, revision: revisionAfter }
    } catch (error) {
      throw classifyFirestoreError(error)
    }
  }

  async runTransaction(operation, callback, loadedResult) {
    try {
      const user = this.currentUserProvider ? await this.currentUserProvider() : { uid: 'verified-by-firebase-provider' }
      if (!user?.uid) {
        throw new FirestoreRepositoryError('unauthenticated', 'Sign in as the TailorPro owner before changing business data.')
      }
      const firestore = await this.firestoreProvider()
      const sdk = await this.firestoreSdkProvider()
      let loaded = loadedResult || await this.load()
      for (let attempt = 0; ; attempt += 1) {
        const baseData = loaded.data || emptyWorkspace()
        try {
          const result = await sdk.runTransaction(
            firestore,
            async (transaction) => {
              const workspaceRef = documentRef(firestore, sdk, 'workspaceMetadata', 'current')
              const workspaceSnapshot = await transaction.get(workspaceRef)
              const currentRevision = workspaceSnapshot.exists()
                ? workspaceSnapshot.data().revision
                : 0
              if (currentRevision !== loaded.revision) {
                throw new FirestoreRepositoryError('conflict', 'Business data changed before the operation could be applied. Reload and retry.')
              }
              const result = await callback(transaction, firestore, sdk, baseData)
              transaction.set(workspaceRef, { revision: currentRevision + 1 })
              return result
            },
          )
          const refreshed = await this.load()
          return { ...result, data: refreshed.data }
        } catch (error) {
          const repositoryError = classifyFirestoreError(error)
          if (!loadedResult && (repositoryError.category === 'conflict' || repositoryError.category === 'permission-denied') && attempt < 3) {
            try {
              loaded = await this.load()
              continue
            } catch {
              repositoryError.operation ||= operation
              throw repositoryError
            }
          }
          repositoryError.operation ||= operation
          throw repositoryError
        }
      }
    } catch (error) {
      const repositoryError = classifyFirestoreError(error)
      repositoryError.operation ||= operation
      throw repositoryError
    }
  }

  readWorkspace(baseData) {
    return structuredClone(baseData)
  }

  requireInitializedWorkspace(data) {
    if (!data.settings) {
      throw new FirestoreRepositoryError('uninitialized', 'Initialize the Firestore business profile before adding or changing business data.')
    }
  }

  async addRecord(collectionName, record) {
    if (!dataCollections.includes(collectionName)) throw new TypeError(`Unsupported data collection "${collectionName}".`)
    if (collectionName === 'orders') return this.createOrder(record)
    if (collectionName === 'payments') return this.recordPayment(record)

    const nextRecord = { ...record, id: record.id || makeRecordId(collectionName) }
    return this.runTransaction('create', async (transaction, firestore, sdk, baseData) => {
      const current = this.readWorkspace(baseData)
      this.requireInitializedWorkspace(current)
      const targetSnapshot = await transaction.get(documentRef(firestore, sdk, collectionName, nextRecord.id))
      if (targetSnapshot.exists()) {
        throw new Error(`${collectionName} already contains a record with ID "${nextRecord.id}".`)
      }
      if (current[collectionName].some((item) => item.id === nextRecord.id)) {
        throw new Error(`${collectionName} already contains a record with ID "${nextRecord.id}".`)
      }
      const validation = validateEntity(collectionName, nextRecord, current)
      if (!validation.valid) throw new Error(validation.error)
      if (collectionName === 'measurements') {
        const keyRef = documentRef(firestore, sdk, 'measurementVersionKeys', measurementVersionKeyId(nextRecord))
        const keySnapshot = await transaction.get(keyRef)
        if (keySnapshot.exists()) {
          throw new Error(`Measurement version ${nextRecord.version} already exists for this customer and garment.`)
        }
        transaction.set(keyRef, {
          id: keyRef.id,
          customerId: nextRecord.customerId,
          garment: nextRecord.garment,
          version: nextRecord.version,
          measurementId: nextRecord.id,
        })
      }
      diffDatasetWrites(
        transaction,
        firestore,
        sdk,
        current,
        validation.data,
        collectionName === 'measurements' ? 1 : 0,
      )
      return { data: validation.data, record: nextRecord }
    })
  }

  async updateRecord(collectionName, id, updates) {
    if (!dataCollections.includes(collectionName)) throw new TypeError(`Unsupported data collection "${collectionName}".`)
    if (collectionName === 'orders') return this.updateOrder(id, updates)
    if (collectionName === 'payments') throw new Error('Payment ledger entries cannot be modified.')
    if (collectionName === 'measurements') throw new Error('Measurement history is immutable. Save a new measurement version instead.')

    return this.runTransaction('update', async (transaction, firestore, sdk, baseData) => {
      const current = this.readWorkspace(baseData)
      this.requireInitializedWorkspace(current)
      const existing = current[collectionName].find((record) => record.id === id)
      if (!existing) throw new Error(`No ${collectionName} record exists with ID "${id}".`)
      const targetSnapshot = await transaction.get(documentRef(firestore, sdk, collectionName, id))
      if (!targetSnapshot.exists()) throw new Error(`No ${collectionName} record exists with ID "${id}".`)
      const updatedRecord = { ...existing, ...updates, id: existing.id }
      const validation = validateEntity(collectionName, updatedRecord, current, { existing })
      if (!validation.valid) throw new Error(validation.error)

      diffDatasetWrites(transaction, firestore, sdk, current, validation.data)
      return {
        data: validation.data,
        record: validation.data[collectionName].find((record) => record.id === id),
      }
    })
  }

  async deleteRecord(collectionName, id) {
    if (!dataCollections.includes(collectionName)) throw new TypeError(`Unsupported data collection "${collectionName}".`)
    return this.runTransaction('delete', async (transaction, firestore, sdk, baseData) => {
      const current = this.readWorkspace(baseData)
      this.requireInitializedWorkspace(current)
      const record = current[collectionName].find((item) => item.id === id)
      if (!record) throw new Error(`No ${collectionName} record exists with ID "${id}".`)
      const targetRef = documentRef(firestore, sdk, collectionName, id)
      const targetSnapshot = await transaction.get(targetRef)
      if (!targetSnapshot.exists()) throw new Error(`No ${collectionName} record exists with ID "${id}".`)
      const deletion = validateDeletion(collectionName, record, current)
      if (!deletion.valid) throw new Error(deletion.error)

      const nextData = { ...current, [collectionName]: current[collectionName].filter((item) => item.id !== id) }
      if (collectionName === 'orders') {
        const accountingRef = documentRef(firestore, sdk, 'orderAccounting', id)
        const accountingSnapshot = await transaction.get(accountingRef)
        if (accountingSnapshot.exists() && (
          Number(accountingSnapshot.data().paidMinorUnits) !== 0
          || Number(accountingSnapshot.data().paymentCount) !== 0
        )) {
          throw new Error('Order accounting history prevents deleting this order.')
        }
        if (!accountingSnapshot.exists()) {
          throw new Error('Order accounting metadata is missing, so its payment history cannot be verified safely.')
        }
        transaction.delete(accountingRef)
      }
      diffDatasetWrites(transaction, firestore, sdk, current, nextData, collectionName === 'orders' ? 1 : 0)
      return { data: nextData, record }
    })
  }

  async archiveCustomer(id, archived = true) {
    const result = await this.updateRecord('customers', id, { archived })
    return result.record
  }

  async createOrder(order, optionalInitialPayment) {
    const newOrder = { ...order, id: order.id || makeRecordId('orders') }
    const initialPayment = optionalInitialPayment
      ? { ...optionalInitialPayment, id: optionalInitialPayment.id || makeRecordId('payments') }
      : null
    return this.runTransaction('create order', async (transaction, firestore, sdk, baseData) => {
      const current = this.readWorkspace(baseData)
      this.requireInitializedWorkspace(current)
      const targetOrderRef = documentRef(firestore, sdk, 'orders', newOrder.id)
      const targetOrderSnapshot = await transaction.get(targetOrderRef)
      if (targetOrderSnapshot.exists()) throw new Error(`orders already contains a record with ID "${newOrder.id}".`)
      if (current.orders.some((item) => item.id === newOrder.id)) {
        throw new Error(`orders already contains a record with ID "${newOrder.id}".`)
      }
      const orderValidation = validateEntity('orders', newOrder, current)
      if (!orderValidation.valid) throw new Error(orderValidation.error)
      if (orderValidation.data.orders.find((item) => item.id === newOrder.id)?.status !== 'New') {
        throw new Error('New orders must begin in the New status.')
      }
      if (toMinorUnits(newOrder.advance || 0) > 0 && !initialPayment) {
        throw new Error('An order advance must be recorded with its initial payment.')
      }

      let nextData = orderValidation.data
      if (initialPayment) {
        if (toMinorUnits(initialPayment.amount) !== toMinorUnits(newOrder.advance || 0)) {
          throw new Error('Initial payment amount must match the order advance.')
        }
        const paymentRef = documentRef(firestore, sdk, 'payments', initialPayment.id)
        const paymentSnapshot = await transaction.get(paymentRef)
        if (paymentSnapshot.exists()) {
          throw new Error(`payments already contains a record with ID "${initialPayment.id}".`)
        }
        const paymentValidation = validateEntity('payments', initialPayment, nextData)
        if (!paymentValidation.valid) throw new Error(paymentValidation.error)
        nextData = paymentValidation.data
      }

      const accountingRef = documentRef(firestore, sdk, 'orderAccounting', newOrder.id)
      const accountingSnapshot = await transaction.get(accountingRef)
      if (accountingSnapshot.exists()) throw new Error(`Accounting metadata already exists for order "${newOrder.id}".`)
      transaction.set(accountingRef, {
        orderId: newOrder.id,
        paidMinorUnits: initialPayment ? toMinorUnits(initialPayment.amount) : 0,
        paymentCount: initialPayment ? 1 : 0,
        ...(initialPayment ? { lastPaymentId: initialPayment.id } : {}),
      })
      diffDatasetWrites(transaction, firestore, sdk, current, nextData, 1)
      return { data: nextData, record: newOrder, payment: initialPayment }
    })
  }

  async updateOrder(id, updates) {
    return this.runTransaction('update order', async (transaction, firestore, sdk, baseData) => {
      const current = this.readWorkspace(baseData)
      this.requireInitializedWorkspace(current)
      const existing = current.orders.find((order) => order.id === id)
      if (!existing) throw new Error(`No orders record exists with ID "${id}".`)
      const orderRef = documentRef(firestore, sdk, 'orders', id)
      const accountingRef = documentRef(firestore, sdk, 'orderAccounting', id)
      const [orderSnapshot, accountingSnapshot] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(accountingRef),
      ])
      if (!orderSnapshot.exists()) throw new Error(`No orders record exists with ID "${id}".`)
      if (!accountingSnapshot.exists()) throw new Error(`Order accounting metadata is missing for order "${id}".`)
      if (updates.status !== undefined && updates.status !== existing.status) {
        throw new Error('Order status changes must use the transitionOrder operation.')
      }
      const updatedFields = { ...updates }
      if (updatedFields.measurementId === null) delete updatedFields.measurementId
      const updatedOrder = { ...existing, ...updatedFields, id: existing.id, status: existing.status }
      if (updates.measurementId === null) delete updatedOrder.measurementId
      const validation = validateEntity('orders', updatedOrder, current, { existing })
      if (!validation.valid) throw new Error(validation.error)
      const liveAccounting = {
        paidMinorUnits: Number(accountingSnapshot.data().paidMinorUnits ?? 0),
        paymentCount: Number(accountingSnapshot.data().paymentCount ?? 0),
      }
      const overrides = new Map([[id, liveAccounting]])
      diffDatasetWrites(transaction, firestore, sdk, current, validation.data, 0, overrides)
      return {
        data: validation.data,
        record: validation.data.orders.find((order) => order.id === id),
      }
    })
  }

  async transitionOrder(id, nextStatus) {
    return this.runTransaction('transition order', async (transaction, firestore, sdk, baseData) => {
      const current = this.readWorkspace(baseData)
      this.requireInitializedWorkspace(current)
      const existing = current.orders.find((order) => order.id === id)
      if (!existing) throw new Error(`No orders record exists with ID "${id}".`)
      const orderRef = documentRef(firestore, sdk, 'orders', id)
      const accountingRef = documentRef(firestore, sdk, 'orderAccounting', id)
      const [orderSnapshot, accountingSnapshot] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(accountingRef),
      ])
      if (!orderSnapshot.exists()) throw new Error(`No orders record exists with ID "${id}".`)
      if (!accountingSnapshot.exists()) throw new Error(`Order accounting metadata is missing for order "${id}".`)
      const firestoreOrderData = orderSnapshot.data()
      const firestoreStatus = firestoreOrderData.status || existing.status
      const transition = transitionOrderRecord({ ...existing, status: firestoreStatus }, nextStatus)
      if (!transition.valid) throw new Error(transition.error)
      const validation = validateEntity('orders', transition.order, current, { existing })
      if (!validation.valid) throw new Error(validation.error)
      const liveAccounting = {
        paidMinorUnits: Number(accountingSnapshot.data().paidMinorUnits ?? 0),
        paymentCount: Number(accountingSnapshot.data().paymentCount ?? 0),
      }
      const overrides = new Map([[id, liveAccounting]])
      diffDatasetWrites(transaction, firestore, sdk, current, validation.data, 0, overrides)
      return {
        data: validation.data,
        record: validation.data.orders.find((order) => order.id === id),
      }
    })
  }

  async recordPayment(payment) {
    const newPayment = { ...payment, id: payment.id || makeRecordId('payments') }
    return this.runTransaction('record payment', async (transaction, firestore, sdk, baseData) => {
      const current = this.readWorkspace(baseData)
      this.requireInitializedWorkspace(current)
      const orderRef = documentRef(firestore, sdk, 'orders', newPayment.orderId)
      const paymentRef = documentRef(firestore, sdk, 'payments', newPayment.id)
      const accountRef = documentRef(firestore, sdk, 'orderAccounting', newPayment.orderId)
      const [orderSnapshot, paymentSnapshot, accountSnapshot] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(paymentRef),
        transaction.get(accountRef),
      ])
      const order = mapRecordDocument('orders', orderSnapshot)
      if (!order) throw new Error('Payment must reference an existing order.')
      if (paymentSnapshot.exists()) throw new Error(`Payment "${newPayment.id}" is already recorded.`)
      const cachedOrder = current.orders.find((item) => item.id === order.id)
      if (cachedOrder) current.orders = current.orders.map((item) => item.id === order.id ? order : item)
      if (current.payments.some((item) => item.id === newPayment.id)) {
        throw new Error(`payments already contains a record with ID "${newPayment.id}".`)
      }
      let paidMinorUnits
      let paymentCount
      if (accountSnapshot.exists()) {
        paidMinorUnits = Number(accountSnapshot.data().paidMinorUnits)
        paymentCount = accountSnapshot.data().paymentCount === undefined
          ? current.payments.filter((entry) => entry.orderId === order.id).length
          : Number(accountSnapshot.data().paymentCount)
        if (!Number.isSafeInteger(paidMinorUnits) || paidMinorUnits < 0
          || !Number.isSafeInteger(paymentCount) || paymentCount < 0) {
          throw malformed(`Payment accounting metadata for order "${order.id}" is invalid.`)
        }
      } else {
        paidMinorUnits = toMinorUnits(getPaidForOrder(current.payments, order.id))
        paymentCount = current.payments.filter((entry) => entry.orderId === order.id).length
      }

      const availableBalance = toMinorUnits(order.amount) - paidMinorUnits
      const accountingPayments = [{ id: `accounting-${order.id}`, orderId: order.id, amount: paidMinorUnits / 100 }]
      if (!canAcceptPayment(order, accountingPayments)) {
        throw new Error(order.status === 'Cancelled'
          ? 'Payments cannot be recorded for a cancelled order.'
          : 'This order has no outstanding balance or a supported status.')
      }
      const validation = validatePaymentEntity(newPayment, {
        order,
        payments: accountingPayments,
      })
      if (!validation.valid) throw new Error(validation.error)
      if (toMinorUnits(newPayment.amount) > availableBalance) {
        throw new Error('Payment amount cannot exceed the order’s outstanding balance.')
      }
      const newPaidMinorUnits = paidMinorUnits + toMinorUnits(newPayment.amount)
      transaction.set(accountRef, {
        orderId: order.id,
        paidMinorUnits: newPaidMinorUnits,
        paymentCount: paymentCount + 1,
        lastPaymentId: newPayment.id,
      })
      const nextData = { ...current, payments: [newPayment, ...current.payments] }
      diffDatasetWrites(transaction, firestore, sdk, current, nextData, 1)
      return { data: nextData, record: newPayment }
    })
  }

  async updateSettings(updates) {
    return this.runTransaction('update settings', async (transaction, firestore, sdk, baseData) => {
      const current = this.readWorkspace(baseData)
      const settings = { ...(current.settings || {}), ...updates }
      const validation = validateSettings(settings)
      if (!validation.valid) throw new Error(validation.error)
      const data = { ...current, settings }
      await transaction.get(documentRef(firestore, sdk, 'settings', 'business-profile'))
      assertWriteCount(2)
      transaction.set(documentRef(firestore, sdk, 'settings', 'business-profile'), settings)
      return { data, record: settings }
    })
  }

  async exportBackup() {
    const result = await this.load()
    if (result.status !== 'ready' || !result.data) {
      throw new FirestoreRepositoryError('uninitialized', 'Initialize the Firestore workspace before exporting a backup.')
    }
    return createBackup(result.data)
  }

  async readReplacementMetadata(readDocument, firestore, sdk, currentData, nextData) {
    const orderIds = [...new Set([
      ...currentData.orders.map((order) => order.id),
      ...nextData.orders.map((order) => order.id),
    ])]
    const keyIds = [...new Set(nextData.measurements.map(measurementVersionKeyId))]
    const [accountSnapshots, keySnapshots, measurementSnapshots, orderSnapshots] = await Promise.all([
      Promise.all(orderIds.map((id) => readDocument(documentRef(firestore, sdk, 'orderAccounting', id)))),
      Promise.all(keyIds.map((id) => readDocument(documentRef(firestore, sdk, 'measurementVersionKeys', id)))),
      Promise.all(nextData.measurements.map((measurement) => (
        readDocument(documentRef(firestore, sdk, 'measurements', measurement.id))
      ))),
      Promise.all(nextData.orders.map((order) => readDocument(documentRef(firestore, sdk, 'orders', order.id)))),
    ])
    return {
      accounts: new Map(orderIds.map((id, index) => [id, accountSnapshots[index]])),
      keys: new Map(keyIds.map((id, index) => [id, keySnapshots[index]])),
      measurements: new Map(nextData.measurements.map((measurement, index) => [measurement.id, measurementSnapshots[index]])),
      orders: new Map(nextData.orders.map((order, index) => [order.id, orderSnapshots[index]])),
    }
  }

  planReplacement(currentData, nextData, { accounts, keys, measurements, orders }) {
    assertReplacementPreservesHistory(currentData, nextData)
    assertBackupFields(nextData)
    const validation = validateData(nextData, { allowLegacyMeasurements: true })
    if (!validation.valid) throw new Error(validation.error)

    const nextTotals = paymentTotalsByOrder(nextData)
    const currentTotals = paymentTotalsByOrder(currentData)
    const nextOrderIds = new Set(nextData.orders.map((order) => order.id))
    const currentOrderIds = new Set(currentData.orders.map((order) => order.id))
    const accountSets = []
    const accountDeletes = []
    const orderBackfills = []
    for (const order of currentData.orders) {
      if (nextOrderIds.has(order.id)) continue
      const snapshot = accounts.get(order.id)
      if (!snapshot?.exists()) {
        throw new Error(`Order "${order.id}" is missing payment-accounting metadata; restore cannot safely remove it.`)
      }
      const existing = snapshot.data()
      if (Number(existing.paidMinorUnits) !== 0 || Number(existing.paymentCount || 0) !== 0) {
        throw new Error(`Restore cannot remove order "${order.id}" with payment-accounting history.`)
      }
      accountDeletes.push(order.id)
    }

    for (const order of nextData.orders) {
      const expected = nextTotals.get(order.id) || { paidMinorUnits: 0, paymentCount: 0 }
      if (!currentOrderIds.has(order.id) && expected.paidMinorUnits < toMinorUnits(order.advance || 0)) {
        throw new Error(`Restore ledger for order "${order.id}" does not cover its recorded advance.`)
      }
      const snapshot = accounts.get(order.id)
      if (snapshot?.exists()) {
        const existing = snapshot.data()
        if (Number(existing.paidMinorUnits) > expected.paidMinorUnits
          || Number(existing.paymentCount || 0) > expected.paymentCount) {
          throw new Error(`Restore cannot reduce payment-accounting metadata for order "${order.id}".`)
        }
      }
      if (!snapshot?.exists()
        || Number(snapshot.data().paidMinorUnits) !== expected.paidMinorUnits
        || Number(snapshot.data().paymentCount || 0) !== expected.paymentCount) {
        const orderPayments = nextData.payments.filter((payment) => payment.orderId === order.id)
        const lastPayment = orderPayments[orderPayments.length - 1]
        accountSets.push({
          id: order.id,
          data: {
            orderId: order.id,
            paidMinorUnits: expected.paidMinorUnits,
            paymentCount: expected.paymentCount,
            ...(lastPayment ? { lastPaymentId: lastPayment.id } : {}),
          },
        })
      }
    }

    const keySets = []
    const measurementBackfills = []
    for (const order of nextData.orders) {
      const orderSnapshot = orders.get(order.id)
      const currentOrder = currentData.orders.find((entry) => entry.id === order.id)
      const currentTotal = currentTotals.get(order.id) || { paidMinorUnits: 0, paymentCount: 0 }
      const nextTotal = nextTotals.get(order.id) || { paidMinorUnits: 0, paymentCount: 0 }
      if (orderSnapshot?.exists()
        && currentOrder
        && safeMetadataEqual(currentOrder, order)
        && currentTotal.paidMinorUnits === nextTotal.paidMinorUnits
        && currentTotal.paymentCount === nextTotal.paymentCount) {
        const stored = orderSnapshot.data()
        if ((stored.paidMinorUnits ?? 0) > nextTotal.paidMinorUnits
          || (stored.paymentCount ?? 0) > nextTotal.paymentCount) {
          throw new Error(`Restore cannot reduce payment metadata for order "${order.id}".`)
        }
        if (stored.paidMinorUnits !== nextTotal.paidMinorUnits
          || stored.paymentCount !== nextTotal.paymentCount) {
          orderBackfills.push({ id: order.id, order, totals: nextTotal })
        }
      }
    }

    for (const measurement of nextData.measurements) {
      const keyId = measurementVersionKeyId(measurement)
      const snapshot = keys.get(keyId)
      const measurementSnapshot = measurements.get(measurement.id)
      const keyData = {
        id: keyId,
        customerId: measurement.customerId,
        garment: measurement.garment,
        version: measurement.version,
        measurementId: measurement.id,
      }
      if (snapshot?.exists()) {
        if (snapshot.data().measurementId !== measurement.id
          || snapshot.data().customerId !== measurement.customerId
          || snapshot.data().garment !== measurement.garment
          || snapshot.data().version !== measurement.version) {
          throw new Error(`Measurement version key "${keyId}" is already associated with another record.`)
        }
      } else {
        keySets.push({ id: keyId, data: keyData })
      }
      if (measurementSnapshot?.exists()
        && !measurementSnapshot.data().versionKeyId
        && safeMetadataEqual(
          currentData.measurements.find((entry) => entry.id === measurement.id),
          measurement,
        )) {
        measurementBackfills.push({ id: measurement.id, measurement, keyId })
      }
    }

    const settingsChanged = !safeMetadataEqual(currentData.settings, nextData.settings)
    const writeCount = countDatasetChanges(currentData, nextData)
      + accountSets.length
      + accountDeletes.length
      + keySets.length
      + orderBackfills.length
      + measurementBackfills.length
      + Number(settingsChanged)
      + 1
    assertWriteCount(writeCount)
    const plan = { accountSets, accountDeletes, keySets, orderBackfills, measurementBackfills, settingsChanged, writeCount }
    assertRuleAccessBudget(currentData, nextData, plan)
    return plan
  }

  async replaceData(data, { confirmed = false } = {}) {
    if (!confirmed) {
      throw new FirestoreRepositoryError('confirmation-required', 'Confirm the restore from the owner interface before replacing Firestore data.')
    }
    const validation = validateData(data, { allowLegacyMeasurements: true })
    if (!validation.valid) {
      throw new FirestoreRepositoryError('malformed-data', `Backup validation failed: ${validation.errors.join(' ')}`)
    }

    try {
      const firestore = await this.firestoreProvider()
      const sdk = await this.firestoreSdkProvider()
      const loaded = await this.load()
      const currentData = loaded.data || emptyWorkspace()
      const preflightMetadata = await this.readReplacementMetadata(
        sdk.getDoc,
        firestore,
        sdk,
        currentData,
        data,
      )
      this.planReplacement(currentData, data, preflightMetadata)
      const workspaceRef = documentRef(firestore, sdk, 'workspaceMetadata', 'current')
      const preflightWorkspace = await sdk.getDoc(workspaceRef)
      const preflightRevision = preflightWorkspace.exists()
        ? preflightWorkspace.data().revision
        : 0
      if (preflightRevision !== loaded.revision) {
        throw new FirestoreRepositoryError('conflict', 'Business data changed during restore preflight. Reload and retry.')
      }

      return await this.runTransaction('restore backup', async (transaction, transactionFirestore, transactionSdk, baseData) => {
        const current = this.readWorkspace(baseData)
        const plan = this.planReplacement(current, data, preflightMetadata)

        diffDatasetWrites(
          transaction,
          transactionFirestore,
          transactionSdk,
          current,
          data,
          plan.accountSets.length
            + plan.accountDeletes.length
            + plan.keySets.length
            + plan.orderBackfills.length
            + plan.measurementBackfills.length
            + Number(plan.settingsChanged),
        )
        if (plan.settingsChanged) {
          transaction.set(documentRef(transactionFirestore, transactionSdk, 'settings', 'business-profile'), data.settings)
        }
        plan.accountSets.forEach(({ id, data: account }) => {
          transaction.set(documentRef(transactionFirestore, transactionSdk, 'orderAccounting', id), account)
        })
        plan.accountDeletes.forEach((id) => {
          transaction.delete(documentRef(transactionFirestore, transactionSdk, 'orderAccounting', id))
        })
        plan.orderBackfills.forEach(({ id, order, totals }) => {
          transaction.set(documentRef(transactionFirestore, transactionSdk, 'orders', id), {
            ...order,
            ...totals,
          })
        })
        plan.keySets.forEach(({ id, data: key }) => {
          transaction.set(documentRef(transactionFirestore, transactionSdk, 'measurementVersionKeys', id), key)
        })
        plan.measurementBackfills.forEach(({ id, measurement, keyId }) => {
          transaction.set(documentRef(transactionFirestore, transactionSdk, 'measurements', id), {
            ...measurement,
            versionKeyId: keyId,
          })
        })
        return { data }
      }, loaded)
    } catch (error) {
      throw classifyFirestoreError(error)
    }
  }

  retrySave() {
    return Promise.reject(new FirestoreRepositoryError('unsupported-operation', 'Firestore does not support LocalStorage retry-save behavior.'))
  }
}

export function createFirestoreRepository(options) {
  return new FirestoreRepository(options)
}
