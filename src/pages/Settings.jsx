import { useRef, useState } from 'react'
import { Check, Download, Store, Upload, Wallet } from 'lucide-react'
import useAppData from '../services/useAppData.jsx'
import { Button, Card, FormField, Modal, PageHeading } from '../components/UI.jsx'
import { previewBackup } from '../services/backupService.js'

export default function Settings() {
  const { settings, updateSettings, replaceData, exportBackup: buildBackup } = useAppData()
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [restorePreview, setRestorePreview] = useState(null)
  const fileInput = useRef(null)
  const set = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setSaved(false) }
  const save = async (event) => {
    event.preventDefault()
    const updated = await updateSettings(form)
    if (updated) {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2800)
    }
  }
  const exportBackup = async () => {
    setBackupMessage('')
    try {
      const backup = await buildBackup()
      if (!backup) {
        setBackupMessage('Backup export failed. Check the repository status and try again.')
        return
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `tailorpro-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setBackupMessage('Backup downloaded.')
    } catch (error) {
      setBackupMessage(`Backup export failed: ${error.message}`)
    }
  }
  const importBackup = async (event) => {
    const input = event.currentTarget
    const [file] = input.files || []
    if (!file) return
    setBackupMessage('')
    try {
      const backup = JSON.parse(await file.text())
      setRestorePreview({ backup, preview: previewBackup(backup) })
    } catch (error) {
      setRestorePreview({
        backup: null,
        preview: { valid: false, counts: {}, errors: [error instanceof SyntaxError ? 'The file is not valid JSON.' : error.message] },
      })
    } finally {
      input.value = ''
    }
  }
  const confirmRestore = async () => {
    if (!restorePreview?.preview.valid || !restorePreview.backup) return
    const restored = await replaceData(restorePreview.backup.data, { confirmed: true })
    if (!restored) {
      setBackupMessage('Backup could not be restored. Existing data was not replaced.')
      setRestorePreview(null)
      return
    }
    setForm(restorePreview.backup.data.settings)
    setBackupMessage('Backup restored successfully.')
    setRestorePreview(null)
  }
  return <>
    <PageHeading eyebrow="YOUR STUDIO, YOUR WAY" title="Settings" description="A few details that make TailorPro feel like yours." />
    <form className="settings-layout" onSubmit={save}>
      <div className="settings-main">
        <Card className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Store size={18} /></span><div><h2>Business profile</h2><p>The details your customers see and your team works with.</p></div></div><div className="form-grid"><FormField label="Business name"><input required value={form.businessName || ''} onChange={(event) => set('businessName', event.target.value)} /></FormField><FormField label="Owner name"><input required value={form.owner || ''} onChange={(event) => set('owner', event.target.value)} /></FormField><FormField label="Business email"><input required type="email" value={form.email || ''} onChange={(event) => set('email', event.target.value)} /></FormField><FormField label="Phone number"><input required type="tel" value={form.phone || ''} onChange={(event) => set('phone', event.target.value)} /></FormField><FormField label="Studio address" className="field-full"><textarea rows="3" value={form.address || ''} onChange={(event) => set('address', event.target.value)} /></FormField></div></Card>
        <Card className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Wallet size={18} /></span><div><h2>Regional preferences</h2><p>Choose how amounts are shown in your workspace.</p></div></div><FormField label="Display currency"><select value={form.currency || 'INR'} onChange={(event) => set('currency', event.target.value)}><option value="INR">Indian Rupee (₹ INR)</option><option value="USD">US Dollar ($ USD)</option><option value="GBP">British Pound (£ GBP)</option><option value="EUR">Euro (€ EUR)</option></select></FormField></Card>
      </div>
      <aside className="settings-aside"><Card className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Check size={18} /></span><div><h2>Studio preferences</h2><p>Small reminders for a smoother workday.</p></div></div><label className="toggle-row"><span><strong>Delivery reminders</strong><small>Remind me about upcoming handoffs.</small></span><input type="checkbox" checked={Boolean(form.reminders)} onChange={(event) => set('reminders', event.target.checked)} /><i /></label><label className="toggle-row"><span><strong>Low-stock alerts</strong><small>Flag supplies below their reorder point.</small></span><input type="checkbox" checked={Boolean(form.lowStockAlerts)} onChange={(event) => set('lowStockAlerts', event.target.checked)} /><i /></label></Card><Card className="settings-note"><span className="eyebrow">A NOTE FROM THE WORKROOM</span><p>Your studio preferences are saved with the selected data repository.</p><span>Thoughtfully yours, <strong>TailorPro</strong></span><hr /><div><strong>Data backup</strong><p>Export or restore a validated JSON copy for the selected data repository.</p><div className="modal-actions"><Button type="button" variant="secondary" icon={Download} onClick={exportBackup}>Export JSON</Button><Button type="button" variant="secondary" icon={Upload} onClick={() => fileInput.current?.click()}>Import JSON</Button></div><input ref={fileInput} className="visually-hidden" type="file" accept=".json,application/json" onChange={importBackup} />{backupMessage && <p className="form-hint" role="status">{backupMessage}</p>}</div></Card></aside>
      <div className="settings-savebar"><span>{saved ? <><Check size={15} /> Changes saved</> : 'Your changes are saved in the selected data repository.'}</span><Button type="submit">Save changes</Button></div>
    </form>
    {restorePreview && <Modal title="Review backup restore" description="Review the backup before replacing data in the selected repository." onClose={() => setRestorePreview(null)}>
      {restorePreview.preview.valid ? <>
        <p className="form-hint">The backup passed validation. Existing Firestore payment and measurement history cannot be changed or removed; conflicting cloud restores will be rejected.</p>
        <ul className="backup-counts">{Object.entries(restorePreview.preview.counts).map(([name, count]) => <li key={name}><span>{name}</span><strong>{count}</strong></li>)}<li><span>settings</span><strong>1</strong></li></ul>
        <p className="form-hint">This action replaces data and cannot be undone. Confirm only if this is the intended owner backup.</p>
      </> : <div className="form-hint" role="alert">{restorePreview.preview.errors.map((error) => <p key={error}>{error}</p>)}</div>}
      <div className="modal-actions">
        <Button type="button" variant="secondary" onClick={() => setRestorePreview(null)}>Cancel</Button>
        {restorePreview.preview.valid && <Button type="button" onClick={confirmRestore}>Confirm restore</Button>}
      </div>
    </Modal>}
  </>
}
