import { createLocalStorageRepository } from './localStorageRepository.js'
import { createFirestoreRepository } from './firestoreRepository.js'

export function createDataRepository(selection = import.meta.env?.VITE_DATA_REPOSITORY) {
  const repositoryType = selection === undefined ? 'localStorage' : selection

  if (repositoryType === 'localStorage') return createLocalStorageRepository()
  if (repositoryType === 'firestore') return createFirestoreRepository()
  throw new Error(`Invalid VITE_DATA_REPOSITORY value "${repositoryType}". Use "localStorage" or "firestore".`)
}
