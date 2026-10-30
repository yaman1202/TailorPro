import { loadData, saveData } from './storageService.js'
import { DataRepositoryError } from './dataRepository.js'
import { validateData, validateEntity, validateSettings, validateDeletion } from './validation.js'
import { transitionOrder as transitionOrderRecord } from './orderWorkflow.js'
import { createBackup } from './backupService.js'

const collections = ['customers', 'measurements', 'orders', 'payments', 'staff', 'inventory']

function createRecordId(collection) {
  const generatedId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return `${collection.slice(0, 1)}-${generatedId}`
}

function cloneData(data) {
  return structuredClone(data)
}

export class LocalStorageRepository {
  constructor() {
    this.data = null
    this.loadResult = null
    this.queue = Promise.resolve()
  }

  async load() {
    if (this.loadResult) return this.loadResult

    try {
      const result = loadData()
      this.data = cloneData(result.data)
      this.loadResult = { ...result, data: this.data }
      if (result.status === 'ready' && result.isNew) {
        try {
          saveData(this.data)
          this.loadResult = { ...this.loadResult, isNew: false }
        } catch (error) {
          const repositoryError = new DataRepositoryError('save initial', error, this.data, { recoverableLocalWrite: true })
          this.loadResult = {
            ...this.loadResult,
            status: 'write-error',
            error: repositoryError.message,
          }
        }
      }
      return this.loadResult
    } catch (error) {
      throw new DataRepositoryError('read', error)
    }
  }

  async addRecord(collection, record) {
    this.assertCollection(collection)
    if (collection === 'orders') return this.createOrder(record)
    if (collection === 'payments') return this.recordPayment(record)
    const nextRecord = { ...record, id: record.id || createRecordId(collection) }
    if (collection === 'measurements') nextRecord.id = nextRecord.id || createRecordId(collection)
    return this.mutate('create', (current) => {
      if (current[collection].some((item) => item.id === nextRecord.id)) {
        throw new Error(`${collection} already contains a record with ID "${nextRecord.id}".`)
      }
      const validation = validateEntity(collection, nextRecord, current)
      if (!validation.valid) throw new Error(validation.error)
      return {
        data: { ...current, [collection]: [nextRecord, ...current[collection]] },
        record: nextRecord,
      }
    })
  }

  async updateRecord(collection, id, updates) {
    this.assertCollection(collection)
    if (collection === 'orders') return this.updateOrder(id, updates)
    if (collection === 'payments') throw new Error('Payment ledger entries cannot be modified.')
    if (collection === 'measurements') throw new Error('Measurement history is immutable. Save a new measurement version instead.')
    return this.mutate('update', (current) => {
      let updatedRecord
      const records = current[collection].map((record) => {
        if (record.id !== id) return record
        updatedRecord = { ...record, ...updates }
        return updatedRecord
      })
      if (!updatedRecord) throw new Error(`No ${collection} record exists with ID "${id}".`)
      const validation = validateEntity(collection, updatedRecord, current, { existing: current[collection].find((record) => record.id === id) })
      if (!validation.valid) throw new Error(validation.error)
      const nextData = validation.data || { ...current, [collection]: records }
      return { data: nextData, record: nextData[collection].find((record) => record.id === id) }
    })
  }

  async deleteRecord(collection, id) {
    this.assertCollection(collection)
    return this.mutate('delete', (current) => {
      const records = current[collection]
      if (!records.some((record) => record.id === id)) {
        throw new Error(`No ${collection} record exists with ID "${id}".`)
      }
      const record = records.find((item) => item.id === id)
      const validation = validateDeletion(collection, record, current)
      if (!validation.valid) throw new Error(validation.error)
      return { data: { ...current, [collection]: records.filter((record) => record.id !== id) } }
    })
  }

  createOrder(order, optionalInitialPayment) {
    const newOrder = { ...order, id: order.id || createRecordId('orders') }
    const initialPayment = optionalInitialPayment
      ? { ...optionalInitialPayment, id: optionalInitialPayment.id || createRecordId('payments') }
      : null
    return this.mutate('create order', (current) => {
      if (current.orders.some((item) => item.id === newOrder.id)) {
        throw new Error(`orders already contains a record with ID "${newOrder.id}".`)
      }
      const orderValidation = validateEntity('orders', newOrder, current)
      if (!orderValidation.valid) throw new Error(orderValidation.error)
      if (Math.round(Number(newOrder.advance || 0) * 100) > 0 && !initialPayment) {
        throw new Error('An order advance must be recorded with its initial payment.')
      }
      let nextData = orderValidation.data
      if (initialPayment) {
        if (Math.round(Number(initialPayment.amount) * 100) !== Math.round(Number(newOrder.advance || 0) * 100)) {
          throw new Error('Initial payment amount must match the order advance.')
        }
        const paymentValidation = validateEntity('payments', initialPayment, nextData)
        if (!paymentValidation.valid) throw new Error(paymentValidation.error)
        nextData = paymentValidation.data
      }
      return { data: nextData, record: newOrder, payment: initialPayment }
    })
  }

  updateOrder(id, updates) {
    return this.mutate('update order', (current) => {
      const existing = current.orders.find((item) => item.id === id)
      if (!existing) throw new Error(`No orders record exists with ID "${id}".`)
      if (updates.status !== undefined && updates.status !== existing.status) {
        throw new Error('Order status changes must use the transitionOrder operation.')
      }
      const updatedFields = { ...updates }
      if (updatedFields.measurementId === null) delete updatedFields.measurementId
      const updatedOrder = { ...existing, ...updatedFields, id: existing.id, status: existing.status }
      if (updates.measurementId === null) delete updatedOrder.measurementId
      const validation = validateEntity('orders', updatedOrder, current, { existing })
      if (!validation.valid) throw new Error(validation.error)
      return {
        data: validation.data,
        record: validation.data.orders.find((item) => item.id === id),
      }
    })
  }

  transitionOrder(id, nextStatus) {
    return this.mutate('transition order', (current) => {
      const existing = current.orders.find((item) => item.id === id)
      if (!existing) throw new Error(`No orders record exists with ID "${id}".`)
      const transition = transitionOrderRecord(existing, nextStatus)
      if (!transition.valid) throw new Error(transition.error)
      const validation = validateEntity('orders', transition.order, current, { existing })
      if (!validation.valid) throw new Error(validation.error)
      return {
        data: validation.data,
        record: validation.data.orders.find((item) => item.id === id),
      }
    })
  }

  recordPayment(payment) {
    const newPayment = { ...payment, id: payment.id || createRecordId('payments') }
    return this.mutate('record payment', (current) => {
      const validation = validateEntity('payments', newPayment, current)
      if (!validation.valid) throw new Error(validation.error)
      return {
        data: validation.data,
        record: newPayment,
      }
    })
  }

  updateSettings(updates) {
    return this.mutate('update settings', (current) => {
      const settings = { ...current.settings, ...updates }
      const validation = validateSettings(settings)
      if (!validation.valid) throw new Error(validation.error)
      return { data: { ...current, settings } }
    })
  }

  replaceData(data) {
    const operation = this.queue.then(async () => {
      try {
        if (!this.loadResult) await this.load()
        const validation = validateData(data, { allowLegacyMeasurements: true })
        if (!validation.valid) throw new Error(validation.error)
        saveData(data)
        this.data = cloneData(data)
        this.loadResult = { data: this.data, status: 'ready', error: '', raw: null, isNew: false }
        return { data: this.data }
      } catch (error) {
        throw error instanceof DataRepositoryError ? error : new DataRepositoryError('replace', error)
      }
    })
    this.queue = operation.catch(() => {})
    return operation
  }

  retrySave() {
    return this.mutate('save', (current) => ({ data: current }))
  }

  async exportBackup() {
    await this.ensureLoaded()
    return createBackup(cloneData(this.data))
  }

  assertCollection(collection) {
    if (!collections.includes(collection)) throw new TypeError(`Unsupported data collection "${collection}".`)
  }

  async ensureLoaded() {
    if (!this.loadResult) {
      const result = await this.load()
      if (result.status !== 'ready' && result.status !== 'write-error') {
        throw new DataRepositoryError('access', new Error(result.error))
      }
    }
    if (!this.data) throw new DataRepositoryError('access', new Error('TailorPro data is not available.'))
  }

  mutate(operationName, makeChange) {
    const operation = this.queue.then(async () => {
      try {
        await this.ensureLoaded()
        const change = makeChange(this.data)
        const nextData = change.data
        this.data = nextData
        try {
          saveData(nextData)
        } catch (error) {
          const repositoryError = new DataRepositoryError(operationName, error, nextData, { recoverableLocalWrite: true })
          this.loadResult = {
            data: nextData,
            status: 'write-error',
            error: repositoryError.message,
            raw: null,
            isNew: false,
          }
          throw repositoryError
        }
        this.loadResult = { data: nextData, status: 'ready', error: '', raw: null, isNew: false }
        return { ...change, data: nextData }
      } catch (error) {
        throw error instanceof DataRepositoryError ? error : new DataRepositoryError(operationName, error)
      }
    })
    this.queue = operation.catch(() => {})
    return operation
  }
}

export function createLocalStorageRepository() {
  return new LocalStorageRepository()
}
