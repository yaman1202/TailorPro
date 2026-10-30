import assert from 'node:assert/strict'
import test from 'node:test'
import { initialData } from '../data/initialData.js'
import { createBackup, validateBackup } from './backupService.js'
import { loadData, saveData } from './storageService.js'

const STORAGE_KEY = 'tailorpro-data-v1'

function installStorage({ value = null, getError, setError } = {}) {
  const state = { value, writes: 0 }
  globalThis.window = {
    localStorage: {
      getItem() {
        if (getError) throw getError
        return state.value
      },
      setItem(key, nextValue) {
        state.writes += 1
        if (setError) throw setError
        if (key === STORAGE_KEY) state.value = nextValue
      },
    },
  }
  return state
}

test('preserves corrupted storage without writing sample data over it', () => {
  const original = '{"orders":'
  const storage = installStorage({ value: original })

  const loaded = loadData()

  assert.equal(loaded.status, 'corrupt')
  assert.equal(loaded.raw, original)
  assert.equal(storage.value, original)
  assert.equal(storage.writes, 0)
})

test('treats incomplete stored collections as recoverable corruption', () => {
  const incomplete = JSON.stringify({ ...initialData, payments: 'invalid' })
  const storage = installStorage({ value: incomplete })

  const loaded = loadData()

  assert.equal(loaded.status, 'corrupt')
  assert.equal(loaded.raw, incomplete)
  assert.equal(storage.value, incomplete)
  assert.equal(storage.writes, 0)
})

test('loads valid saved data and retains defaults for omitted legacy fields', () => {
  const saved = structuredClone(initialData)
  saved.customers = [{ id: 'customer-1', name: 'Asha', phone: '555-0100' }]
  delete saved.settings.address
  installStorage({ value: JSON.stringify(saved) })

  const loaded = loadData()

  assert.equal(loaded.status, 'ready')
  assert.deepEqual(loaded.data.customers, saved.customers)
  assert.equal(loaded.data.settings.address, initialData.settings.address)
})

test('reports quota failures and leaves the existing stored value unchanged', () => {
  const original = '{"existing":"value"}'
  installStorage({ value: original, setError: Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' }) })

  assert.throws(() => saveData(initialData), /storage is full/i)
  assert.equal(window.localStorage.getItem(STORAGE_KEY), original)
})

test('restores only a validated backup and then loads the restored data', () => {
  const original = '{"orders":'
  const storage = installStorage({ value: original })
  const backup = createBackup(structuredClone(initialData), '2026-10-30T00:00:00.000Z')

  assert.equal(loadData().status, 'corrupt')
  assert.equal(storage.value, original)
  const validation = validateBackup(backup)
  assert.equal(validation.valid, true)
  if (!validation.valid) return

  saveData(backup.data)
  const restored = loadData()
  assert.equal(restored.status, 'ready')
  assert.deepEqual(restored.data, backup.data)
})
