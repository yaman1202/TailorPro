import { createFirestoreRepository } from './firestoreRepository.js'

export function createDataRepository(selection = import.meta.env?.VITE_DATA_REPOSITORY) {
  if (selection !== 'firestore') {
    if (selection === undefined || selection === '') {
      throw new Error(
        'VITE_DATA_REPOSITORY must be explicitly set to "firestore". '
        + 'LocalStorage is disabled for TailorPro business data.',
      )
    }
    throw new Error(
      `Unsupported VITE_DATA_REPOSITORY value "${selection}". `
      + 'Firestore is the only supported business data repository; LocalStorage is disabled.',
    )
  }
  return createFirestoreRepository()
}
