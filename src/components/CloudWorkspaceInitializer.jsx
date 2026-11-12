import { useRef, useState } from 'react'
import { Check, Store, Upload } from 'lucide-react'
import { Button, FormField, Select } from './UI.jsx'
import useAppData from '../services/useAppData.jsx'
import { previewBackup } from '../services/backupService.js'
import { validateSettings } from '../services/validation.js'

const defaultProfile = {
  businessName: '',
  owner: '',
  email: '',
  phone: '',
  address: '',
  currency: 'INR',
  reminders: true,
  lowStockAlerts: true,
}

export default function CloudWorkspaceInitializer() {
  const { replaceData, updateSettings, storageState } = useAppData()
  const fileInput = useRef(null)
  const [mode, setMode] = useState('setup')
  const [profile, setProfile] = useState(defaultProfile)
  const [setupError, setSetupError] = useState('')
  const [settingUp, setSettingUp] = useState(false)
  const [backup, setBackup] = useState(null)
  const [preview, setPreview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')

  const initializeStudio = async (event) => {
    event.preventDefault()
    if (settingUp) return
    setSetupError('')
    const candidate = {
      businessName: profile.businessName.trim(),
      owner: profile.owner.trim(),
      email: profile.email.trim(),
      phone: profile.phone.trim(),
      address: profile.address.trim(),
      currency: profile.currency,
      reminders: Boolean(profile.reminders),
      lowStockAlerts: Boolean(profile.lowStockAlerts),
    }
    const validation = validateSettings(candidate)
    if (!validation.valid) {
      setSetupError(validation.error)
      return
    }
    setSettingUp(true)
    const ok = await updateSettings(candidate)
    setSettingUp(false)
    if (!ok) {
      setSetupError('Studio profile could not be initialized. Review any error shown below and try again.')
    }
  }

  const selectBackup = async (event) => {
    const input = event.currentTarget
    const [file] = input.files || []
    setBackup(null)
    setPreview(null)
    setConfirmed(false)
    setMessage('')
    if (!file) return

    try {
      const parsed = JSON.parse(await file.text())
      setBackup(parsed)
      setPreview(previewBackup(parsed))
    } catch (error) {
      setPreview({
        valid: false,
        counts: {},
        errors: [error instanceof SyntaxError ? 'The file is not valid JSON.' : error.message],
      })
    } finally {
      input.value = ''
    }
  }

  const importBackup = async () => {
    if (!preview?.valid || !backup?.data || !confirmed || importing) return
    setImporting(true)
    setMessage('')
    const restored = await replaceData(backup.data, { confirmed: true })
    setImporting(false)
    if (!restored) {
      setMessage('Import was not completed. No local data was changed. Review the error above and retry only after resolving it.')
    }
  }

  return (
    <main className="storage-recovery">
      <section className="storage-recovery-card">
        <span className="eyebrow">TAILORPRO CLOUD WORKSPACE</span>
        <h1>Initialize your studio</h1>
        <p>
          This Firestore workspace is empty. Set up a fresh studio profile to get started immediately,
          or import a validated TailorPro JSON backup.
        </p>

        <div className="filter-pills" role="tablist" aria-label="Workspace initialization method" style={{ marginBottom: '18px' }}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'setup'}
            className={`filter-pill ${mode === 'setup' ? 'active' : ''}`}
            onClick={() => { setMode('setup'); setMessage('') }}
          >
            Start fresh studio
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'backup'}
            className={`filter-pill ${mode === 'backup' ? 'active' : ''}`}
            onClick={() => { setMode('backup'); setSetupError('') }}
          >
            Import JSON backup
          </button>
        </div>

        {mode === 'setup' ? (
          <form className="form-stack" onSubmit={initializeStudio}>
            <div className="form-grid">
              <FormField label="Studio / business name">
                <input
                  required
                  value={profile.businessName}
                  onChange={(event) => setProfile({ ...profile, businessName: event.target.value })}
                  placeholder="e.g. Atelier TailorPro"
                />
              </FormField>
              <FormField label="Owner name">
                <input
                  required
                  value={profile.owner}
                  onChange={(event) => setProfile({ ...profile, owner: event.target.value })}
                  placeholder="e.g. Yaman Renuka"
                />
              </FormField>
              <FormField label="Business email">
                <input
                  required
                  type="email"
                  value={profile.email}
                  onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                  placeholder="hello@yourstudio.com"
                />
              </FormField>
              <FormField label="Phone number">
                <input
                  required
                  type="tel"
                  value={profile.phone}
                  onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  placeholder="+91 98765 43210"
                />
              </FormField>
              <FormField label="Display currency">
                <Select
                  value={profile.currency}
                  onChange={(event) => setProfile({ ...profile, currency: event.target.value })}
                >
                  <option value="INR">Indian Rupee (INR)</option>
                  <option value="USD">US Dollar (USD)</option>
                  <option value="GBP">British Pound (GBP)</option>
                  <option value="EUR">Euro (EUR)</option>
                </Select>
              </FormField>
              <FormField label="Studio address" className="field-full">
                <input
                  value={profile.address}
                  onChange={(event) => setProfile({ ...profile, address: event.target.value })}
                  placeholder="Optional street address"
                />
              </FormField>
            </div>
            {setupError && <p className="customer-feedback customer-feedback-error" role="alert">{setupError}</p>}
            <div className="modal-actions">
              <Button type="submit" icon={Store} disabled={settingUp}>
                {settingUp ? 'Creating workspace…' : 'Create studio workspace'}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={selectBackup}
            />
            <Button type="button" icon={Upload} variant="secondary" onClick={() => fileInput.current?.click()}>
              Choose JSON backup
            </Button>

            {preview && (
              <section aria-label="Backup preview">
                {preview.valid ? (
                  <>
                    <h2>Backup contents</h2>
                    <ul className="backup-counts">
                      {Object.entries(preview.counts).map(([name, count]) => (
                        <li key={name}><span>{name}</span><strong>{count}</strong></li>
                      ))}
                      <li><span>settings</span><strong>1</strong></li>
                    </ul>
                    <p>
                      The backup will be imported into the empty Firestore workspace. Your LocalStorage
                      data is not deleted or changed.
                    </p>
                    <label className="toggle-row">
                      <span><strong>I reviewed this backup and want to import it.</strong></span>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                      <i aria-hidden="true" />
                    </label>
                  </>
                ) : (
                  <div role="alert">
                    <h2>Backup could not be validated</h2>
                    {preview.errors.map((error) => <p key={error}>{error}</p>)}
                  </div>
                )}
              </section>
            )}

            <div className="modal-actions">
              {preview?.valid && (
                <Button
                  type="button"
                  icon={Check}
                  disabled={!confirmed || importing}
                  onClick={importBackup}
                >
                  {importing ? 'Importing…' : 'Import backup'}
                </Button>
              )}
            </div>
          </>
        )}

        {storageState.error && <p role="alert">{storageState.error}</p>}
        {message && <p role="status">{message}</p>}
      </section>
    </main>
  )
}
