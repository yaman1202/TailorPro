import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getAuthErrorMessage } from '../services/firebase/authHelpers.js'
import useAuth from '../services/useAuth.jsx'

export default function RequireAuth() {
  const { status, authEnabled, error, retryAuth } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <main className="auth-loading" role="status">Checking your owner sign-in…</main>
  }

  if (!authEnabled) {
    return (
      <main className="auth-loading">
        <section className="storage-recovery-card" role="alert">
          <span className="eyebrow">SECURE OWNER ACCESS</span>
          <h1>Firebase Authentication is not configured</h1>
          <p>TailorPro requires Firebase Authentication and Firestore to access business data.</p>
          <p>Set the required VITE_FIREBASE values and VITE_DATA_REPOSITORY=firestore in .env.local, then restart the app.</p>
        </section>
      </main>
    )
  }

  if (status === 'authenticated') return <Outlet />

  if (status === 'error') {
    return (
      <main className="auth-loading">
        <section className="storage-recovery-card" role="alert">
          <span className="eyebrow">SECURE OWNER ACCESS</span>
          <h1>Sign-in status unavailable</h1>
          <p>{getAuthErrorMessage(error)}</p>
          <button type="button" className="button button-primary" onClick={retryAuth}>Try again</button>
        </section>
      </main>
    )
  }

  return <Navigate to="/login" replace state={{ from: location }} />
}
