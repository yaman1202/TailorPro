import { useState } from 'react'
import { ArrowRight, LockKeyhole, Scissors } from 'lucide-react'
import { getAuthErrorMessage, isUnknownResetEmail } from '../services/firebase/authHelpers.js'
import useAuth from '../services/useAuth.jsx'

export default function Login() {
  const { signIn, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetMode, setResetMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (resetMode) {
        try {
          await resetPassword(email)
        } catch (resetError) {
          if (!isUnknownResetEmail(resetError)) throw resetError
        }
        setMessage('If an owner account exists for this email, password reset instructions will be sent.')
      } else {
        await signIn(email, password)
      }
    } catch (submissionError) {
      setError(getAuthErrorMessage(submissionError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="login-brand-mark"><Scissors size={21} strokeWidth={1.8} /></span>
          <span className="login-brand-name">tailor<span>pro</span></span>
          <span className="login-brand-caption">ATELIER MANAGEMENT</span>
        </div>
        <div className="login-heading">
          <span className="eyebrow">PRIVATE STUDIO WORKSPACE</span>
          <h1>{resetMode ? 'Reset your password' : 'Welcome back'}</h1>
          <p>{resetMode ? 'We’ll send password reset instructions to your owner email.' : 'Sign in to continue to your TailorPro studio.'}</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label className="login-field">
            <span>Owner email</span>
            <input
              autoComplete="email"
              autoFocus
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@yourstudio.com"
            />
          </label>
          {!resetMode && (
            <label className="login-field">
              <span>Password</span>
              <input
                autoComplete="current-password"
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
            </label>
          )}
          {error && <p className="login-feedback login-error" role="alert">{error}</p>}
          {message && <p className="login-feedback login-success" role="status">{message}</p>}
          <button className="login-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : resetMode ? 'Send reset instructions' : 'Sign in securely'}
            {!busy && !resetMode && <ArrowRight size={16} />}
          </button>
        </form>
        <div className="login-footer">
          {resetMode
            ? <button type="button" onClick={() => { setResetMode(false); setError(''); setMessage('') }}>Return to sign in</button>
            : <button type="button" onClick={() => { setResetMode(true); setError(''); setMessage('') }}>Forgot your password?</button>}
          <span><LockKeyhole size={13} /> Owner access only</span>
        </div>
        <div className="login-note">Your owner account is provisioned separately. Public registration is not available.</div>
      </section>
      <footer className="login-copyright">© {new Date().getFullYear()} TailorPro Studio <span>·</span> Crafted with care</footer>
    </main>
  )
}
