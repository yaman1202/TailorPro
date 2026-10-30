import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAuthErrorMessage,
  isFirebaseAuthConfigured,
  isUnknownResetEmail,
} from './authHelpers.js'

const completeEnvironment = {
  VITE_FIREBASE_API_KEY: 'placeholder',
  VITE_FIREBASE_AUTH_DOMAIN: 'placeholder',
  VITE_FIREBASE_PROJECT_ID: 'placeholder',
  VITE_FIREBASE_STORAGE_BUCKET: 'placeholder',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'placeholder',
  VITE_FIREBASE_APP_ID: 'placeholder',
}

test('Firebase Auth is enabled only when all required config values are present', () => {
  assert.equal(isFirebaseAuthConfigured(completeEnvironment), true)
  assert.equal(isFirebaseAuthConfigured({ ...completeEnvironment, VITE_FIREBASE_APP_ID: '  ' }), false)
  assert.equal(isFirebaseAuthConfigured({}), false)
  assert.equal(isFirebaseAuthConfigured(undefined), false)
})

test('authentication errors have clear user-facing messages without exposing SDK details', () => {
  assert.equal(getAuthErrorMessage({ code: 'auth/invalid-credential' }), 'The email or password is incorrect.')
  assert.equal(getAuthErrorMessage({ code: 'auth/invalid-login-credentials' }), 'The email or password is incorrect.')
  assert.equal(getAuthErrorMessage({ code: 'auth/network-request-failed' }).includes('connection'), true)
  assert.equal(getAuthErrorMessage({ code: 'auth/too-many-requests' }).includes('Too many attempts'), true)
  assert.equal(getAuthErrorMessage({ code: 'auth/unrecognized' }), 'Authentication could not be completed. Please try again.')
})

test('unknown reset-email accounts can receive enumeration-safe feedback', () => {
  assert.equal(isUnknownResetEmail({ code: 'auth/user-not-found' }), true)
  assert.equal(isUnknownResetEmail({ code: 'auth/network-request-failed' }), false)
})
