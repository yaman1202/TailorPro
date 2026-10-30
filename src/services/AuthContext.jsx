import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  onAuthStateChangedSubscription,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from './firebase/firebaseAuth.js'
import { isFirebaseAuthConfigured } from './firebase/authHelpers.js'
import { AuthContext } from './authContext.js'

export function AuthProvider({ children }) {
  const authEnabled = isFirebaseAuthConfigured()
  const [authState, setAuthState] = useState({
    status: authEnabled ? 'loading' : 'disabled',
    user: null,
    error: null,
  })
  const [listenerAttempt, setListenerAttempt] = useState(0)

  useEffect(() => {
    if (!authEnabled) return undefined

    return onAuthStateChangedSubscription(
      (user) => setAuthState({ status: user ? 'authenticated' : 'unauthenticated', user, error: null }),
      (error) => setAuthState({ status: 'error', user: null, error }),
    )
  }, [authEnabled, listenerAttempt])

  const signIn = useCallback((email, password) => signInWithEmailAndPassword(email, password), [])
  const signOutOwner = useCallback(() => signOut(), [])
  const resetPassword = useCallback((email) => sendPasswordResetEmail(email), [])
  const retryAuth = useCallback(() => {
    setAuthState({ status: 'loading', user: null, error: null })
    setListenerAttempt((attempt) => attempt + 1)
  }, [])

  const value = useMemo(() => ({
    ...authState,
    authEnabled,
    signIn,
    signOut: signOutOwner,
    resetPassword,
    retryAuth,
  }), [authState, authEnabled, signIn, signOutOwner, resetPassword, retryAuth])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
