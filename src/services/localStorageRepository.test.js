import assert from 'node:assert/strict'
import test from 'node:test'
import { initialData } from '../data/initialData.js'
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

  for (const method of ['load', 'addRecord', 'updateRecord', 'deleteRecord', 'updateSettings', 'replaceData', 'retrySave']) {
    assert.equal(typeof repository[method], 'function')
  }
  assert.equal(typeof repository.load().then, 'function')
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
    (error) => error instanceof DataRepositoryError && error.operation === 'create' && error.data.customers[0].id === 'unsaved',
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
