import assert from 'node:assert/strict'
import test from 'node:test'
import { getApps } from 'firebase/app'
import { FirestoreRepository } from './firestoreRepository.js'
import { LocalStorageRepository } from './localStorageRepository.js'
import { createDataRepository } from './repositoryFactory.js'

test('missing repository selection defaults to LocalStorageRepository', () => {
  const repository = createDataRepository(undefined)

  assert.ok(repository instanceof LocalStorageRepository)
})

test('explicit localStorage selection returns a LocalStorageRepository', () => {
  const repository = createDataRepository('localStorage')

  assert.ok(repository instanceof LocalStorageRepository)
})

test('firestore selection returns the Firestore repository without falling back to local storage', () => {
  const repository = createDataRepository('firestore')

  assert.ok(repository instanceof FirestoreRepository)
  assert.equal(repository instanceof LocalStorageRepository, false)
})

test('invalid repository selection throws a configuration error', () => {
  assert.throws(
    () => createDataRepository('remote'),
    /Invalid VITE_DATA_REPOSITORY value "remote".*localStorage.*firestore/i,
  )
})

test('selecting localStorage does not initialize Firebase', () => {
  const defaultAppsBefore = getApps().filter((app) => app.name === '[DEFAULT]')

  const repository = createDataRepository('localStorage')

  const defaultAppsAfter = getApps().filter((app) => app.name === '[DEFAULT]')
  assert.ok(repository instanceof LocalStorageRepository)
  assert.equal(defaultAppsAfter.length, defaultAppsBefore.length)
})
