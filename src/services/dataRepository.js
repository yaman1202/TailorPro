const repositoryMethods = [
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
]

export class DataRepositoryError extends Error {
  constructor(operation, cause, data = undefined, { recoverableLocalWrite = false } = {}) {
    super(cause?.message || `Unable to ${operation} TailorPro data.`, { cause })
    this.name = 'DataRepositoryError'
    this.operation = operation
    this.recoverableLocalWrite = recoverableLocalWrite
    if (data !== undefined) this.data = data
  }
}

/**
 * @typedef {Object} DataRepository
 * @property {() => Promise<object>} load
 * @property {(collection: string, record: object) => Promise<object>} addRecord
 * @property {(collection: string, id: string, updates: object) => Promise<object>} updateRecord
 * @property {(collection: string, id: string) => Promise<object>} deleteRecord
 * @property {(order: object, initialPayment?: object, measurement?: object) => Promise<object>} createOrder
 * @property {(id: string, updates: object) => Promise<object>} updateOrder
 * @property {(id: string, nextStatus: string) => Promise<object>} transitionOrder
 * @property {(id: string, method: string) => Promise<object>} completeOrderWithPayment
 * @property {(payment: object) => Promise<object>} recordPayment
 * @property {() => Promise<object>} exportBackup
 * @property {(updates: object) => Promise<object>} updateSettings
 * @property {(data: object) => Promise<object>} replaceData
 * @property {() => Promise<object>} retrySave
 */

export function assertDataRepository(repository) {
  for (const method of repositoryMethods) {
    if (typeof repository?.[method] !== 'function') {
      throw new TypeError(`Data repository must implement ${method}().`)
    }
  }
  return repository
}
