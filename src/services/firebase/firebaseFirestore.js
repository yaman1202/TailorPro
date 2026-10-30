import { getAuth } from 'firebase/auth'

export const FIRESTORE_BUSINESS_ID = 'tailorpro-dev-802c2'

export async function getOwnerFirestore() {
  const { default: firebaseApp } = await import('./firebaseApp.js')
  const { getFirestore } = await import('firebase/firestore')
  const auth = getAuth(firebaseApp)
  await auth.authStateReady()

  if (!auth.currentUser) {
    const error = new Error('Sign in as the TailorPro owner before loading business data.')
    error.code = 'unauthenticated'
    throw error
  }

  return getFirestore(firebaseApp)
}
