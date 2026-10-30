import { useRef, useState } from 'react'
import { Check, Upload } from 'lucide-react'
import { Button } from './UI.jsx'
import useAppData from '../services/useAppData.jsx'
import { previewBackup } from '../services/backupService.js'

export default function CloudWorkspaceInitializer() {
  const { replaceData, storageState } = useAppData()
  const fileInput = useRef(null)
  const [backup, setBackup] = useState(null)
  const [preview, setPreview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')

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
        <h1>Business data is not initialized</h1>
        <p>
          This Firestore workspace is empty. Nothing is imported automatically. Choose a validated
          TailorPro JSON backup to review its contents before explicitly importing it.
        </p>
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

        {storageState.error && <p role="alert">{storageState.error} No local data was changed.</p>}
        {message && <p role="status">{message}</p>}
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
      </section>
    </main>
  )
}
