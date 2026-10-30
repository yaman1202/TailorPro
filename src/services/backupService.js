import { validateData } from './validation.js'

export function createBackup(data, exportedAt = new Date().toISOString()) {
  return {
    format: 'TailorPro backup',
    version: 1,
    exportedAt,
    data,
  }
}

export function validateBackup(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup) || backup.format !== 'TailorPro backup' || backup.version !== 1) {
    return { valid: false, errors: ['This is not a supported TailorPro backup file.'] }
  }
  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    return { valid: false, errors: ['Backup data must be a JSON object.'] }
  }
  return validateData(backup.data, { allowLegacyMeasurements: true })
}

export function previewBackup(backup) {
  const validation = validateBackup(backup)
  const collections = ['customers', 'measurements', 'orders', 'payments', 'staff', 'inventory']
  const counts = Object.fromEntries(collections.map((collection) => [
    collection,
    Array.isArray(backup?.data?.[collection]) ? backup.data[collection].length : 0,
  ]))
  return {
    valid: validation.valid,
    errors: validation.errors,
    counts,
  }
}
