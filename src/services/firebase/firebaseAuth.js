import {
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { isFirebaseAuthConfigured } from './authHelpers.js'

async function getConfiguredAuth() {
  if (!isFirebaseAuthConfigured()) {
    throw new Error('Firebase Authentication is not configured. Add the required VITE_FIREBASE values and restart Vite.')
  }
  const { default: firebaseApp } = await import('./firebaseApp.js')
  return getAuth(firebaseApp)
}

export async function signInWithEmailAndPassword(email, password) {
  const auth = await getConfiguredAuth()
  return firebaseSignInWithEmailAndPassword(auth, email.trim(), password)
}

export async function signOut() {
  const auth = await getConfiguredAuth()
  return firebaseSignOut(auth)
}

export async function sendPasswordResetEmail(email) {
  const auth = await getConfiguredAuth()
  return firebaseSendPasswordResetEmail(auth, email.trim())
}

export function onAuthStateChangedSubscription(onUser, onError) {
  let cancelled = false
  let unsubscribe

  getConfiguredAuth()
    .then((auth) => {
      if (cancelled) return
      unsubscribe = onAuthStateChanged(auth, onUser, onError)
    })
    .catch((error) => {
      if (!cancelled) onError(error)
    })

  return () => {
    cancelled = true
    unsubscribe?.()
  }
}
