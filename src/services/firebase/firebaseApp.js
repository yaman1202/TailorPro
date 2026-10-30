import { getApp, getApps, initializeApp } from 'firebase/app'

const environment = import.meta.env
const firebaseConfig = {
  apiKey: environment.VITE_FIREBASE_API_KEY,
  authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: environment.VITE_FIREBASE_PROJECT_ID,
  storageBucket: environment.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: environment.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: environment.VITE_FIREBASE_APP_ID,
}

const missingConfiguration = Object.entries(firebaseConfig)
  .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
  .map(([key]) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`)

if (missingConfiguration.length > 0) {
  throw new Error(
    `Firebase configuration is missing or empty: ${missingConfiguration.join(', ')}. `
    + 'Add these values to .env.local and restart the Vite development server.',
  )
}

const defaultAppExists = getApps().some((app) => app.name === '[DEFAULT]')

const firebaseApp = defaultAppExists
  ? getApp()
  : initializeApp(firebaseConfig)

export default firebaseApp
export { firebaseApp }
