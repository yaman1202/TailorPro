import assert from 'node:assert/strict'
import test from 'node:test'
import { getApps } from 'firebase/app'
import { FirestoreRepository } from './firestoreRepository.js'
import { createDataRepository } from './repositoryFactory.js'

test('missing repository selection blocks repository creation', () => {
  assert.throws(
    () => createDataRepository(undefined),
    /VITE_DATA_REPOSITORY must be explicitly set to "firestore".*LocalStorage is disabled/i,
  )
})

test('explicit Firestore selection creates the Firestore repository', () => {
  const repository = createDataRepository('firestore')

  assert.ok(repository instanceof FirestoreRepository)
})

test('LocalStorage selection is rejected instead of activating local persistence', () => {
  assert.throws(
    () => createDataRepository('localStorage'),
    /Firestore is the only supported business data repository; LocalStorage is disabled/i,
  )
})

test('invalid repository selection throws a clear configuration error', () => {
  assert.throws(
    () => createDataRepository('remote'),
    /Unsupported VITE_DATA_REPOSITORY value "remote".*Firestore is the only supported/i,
  )
})

test('Firestore selection does not initialize Firebase before repository operations', () => {
  const defaultAppsBefore = getApps().filter((app) => app.name === '[DEFAULT]')

  const repository = createDataRepository('firestore')

  const defaultAppsAfter = getApps().filter((app) => app.name === '[DEFAULT]')
  assert.ok(repository instanceof FirestoreRepository)
  assert.equal(defaultAppsAfter.length, defaultAppsBefore.length)
})
