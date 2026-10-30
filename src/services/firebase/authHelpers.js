const firebaseEnvironmentKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

export function isFirebaseAuthConfigured(environment = import.meta.env) {
  return firebaseEnvironmentKeys.every((key) => (
    typeof environment?.[key] === 'string' && environment[key].trim() !== ''
  ))
}

export function getAuthErrorMessage(error) {
  switch (error?.code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your TailorPro administrator.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a little while, then try again.'
    case 'auth/network-request-failed':
      return 'TailorPro could not reach the sign-in service. Check your connection and try again.'
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is not enabled for this Firebase project.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Firebase Authentication.'
    case 'auth/invalid-api-key':
    case 'auth/configuration-not-found':
      return 'Firebase Authentication is not configured correctly for this app.'
    default:
      return 'Authentication could not be completed. Please try again.'
  }
}

export function isUnknownResetEmail(error) {
  return error?.code === 'auth/user-not-found'
}
