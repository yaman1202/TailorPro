import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { validateBackup } from '../services/backupService.js'
import useAppData from '../services/useAppData.jsx'

const collectionLabels = {
  customers: 'customers',
  measurements: 'measurement profiles',
  orders: 'orders',
  payments: 'payments',
  staff: 'staff records',
  inventory: 'inventory items',
}

function downloadOriginalData(raw) {
  const blob = new Blob([raw], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tailorpro-corrupted-data-${new Date().toISOString().slice(0, 10)}.txt`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function StorageRecovery({ storageState }) {
  const { replaceData } = useAppData()
  const [backup, setBackup] = useState(null)
  const [message, setMessage] = useState('')
  const [restoring, setRestoring] = useState(false)

  const inspectBackup = async (event) => {
    const input = event.currentTarget
    const [file] = input.files || []
    setBackup(null)
    setMessage('')
    if (!file) return

    try {
      const parsed = JSON.parse(await file.text())
      const validation = validateBackup(parsed)
      if (!validation.valid) {
        setMessage(`Backup not accepted: ${validation.errors.slice(0, 3).join(' ')}`)
        return
      }
      setBackup(parsed)
    } catch (error) {
      setMessage(`Backup not accepted: ${error instanceof SyntaxError ? 'The file is not valid JSON.' : error.message}`)
    } finally {
      input.value = ''
    }
  }

  const restoreBackup = async () => {
    if (!backup || restoring) return
    if (!window.confirm('Restore this validated backup? It will replace the damaged or inaccessible TailorPro data on this device.')) return

    setRestoring(true)
    try {
      const restored = await replaceData(backup.data)
      if (!restored) {
        setMessage('Backup could not be saved. Your original data is still preserved.')
        setRestoring(false)
      }
    } catch (error) {
      setMessage(`Backup could not be restored: ${error.message}`)
      setRestoring(false)
    }
  }

  const records = backup && Object.entries(collectionLabels)
    .map(([key, label]) => `${backup.data[key].length} ${label}`)

  return (
    <main className="storage-recovery">
      <section className="storage-recovery-card" aria-labelledby="storage-recovery-title">
        <span className="eyebrow">TAILORPRO DATA SAFETY</span>
        <h1 id="storage-recovery-title">Your saved data needs attention</h1>
        <p role="alert">{storageState.error}</p>
        {storageState.status === 'corrupt' && storageState.raw !== null && (
          <button className="button button-secondary" type="button" onClick={() => downloadOriginalData(storageState.raw)}>
            <Download size={16} /> Download original damaged data
          </button>
        )}
        <div className="storage-recovery-divider" />
        <h2>Restore from a JSON backup</h2>
        <p>Select a TailorPro backup to validate and preview it. Nothing will be replaced until you explicitly confirm.</p>
        <label className="button button-secondary storage-file-button">
          <Upload size={16} /> Choose backup file
          <input type="file" accept=".json,application/json" onChange={inspectBackup} />
        </label>
        {message && <p className="storage-recovery-message" role="alert">{message}</p>}
        {backup && (
          <div className="storage-backup-preview" aria-live="polite">
            <strong>Validated backup preview</strong>
            <span>Business: {backup.data.settings.businessName}</span>
            <span>{records.join(' · ')}</span>
            {backup.exportedAt && <span>Exported: {backup.exportedAt}</span>}
            <button className="button button-primary" type="button" onClick={restoreBackup} disabled={restoring}>
              {restoring ? 'Restoring…' : 'Confirm and restore backup'}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
