import { initialData } from '../data/initialData.js'

const STORAGE_KEY = 'tailorpro-data-v1'

export function loadData() {
  let stored
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch (error) {
    console.error('Unable to access saved TailorPro data.', error)
    return {
      data: initialData,
      status: 'unavailable',
      error: 'TailorPro could not access this browser’s storage. Your saved data has not been changed.',
      raw: null,
    }
  }

  if (stored === null) return { data: initialData, status: 'ready', error: '', raw: null, isNew: true }

  try {
    const parsed = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Saved TailorPro data has an invalid format.')
    }
    const collections = ['customers', 'measurements', 'orders', 'payments', 'staff', 'inventory']
    const data = { ...initialData, ...parsed }
    for (const collection of collections) {
      if (!Array.isArray(parsed[collection])) {
        throw new Error(`Saved TailorPro data has an invalid ${collection} collection.`)
      }
    }
    if (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) {
      throw new Error('Saved TailorPro data has invalid settings.')
    }
    data.settings = { ...initialData.settings, ...(parsed.settings || {}) }
    return { data, status: 'ready', error: '', raw: null, isNew: false }
  } catch (error) {
    console.error('Unable to parse saved TailorPro data.', error)
    return {
      data: initialData,
      status: 'corrupt',
      error: 'Saved TailorPro data is damaged or has an invalid format. The original data is being preserved until you restore a validated backup.',
      raw: stored,
    }
  }
}

export function saveData(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error('Unable to save TailorPro data.', error)
    const reason = error?.name === 'QuotaExceededError'
      ? 'Browser storage is full.'
      : 'Browser storage is unavailable.'
    throw new Error(`${reason} Your changes have not been saved. Free storage space or enable browser storage, then retry.`, { cause: error })
  }
}
