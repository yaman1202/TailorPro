import { useEffect, useState } from 'react'
import { getOrderMeasurementPhotoUrl } from '../services/firebase/orderMeasurementPhotos.js'

export default function MeasurementPhotoPreview({ photo }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getOrderMeasurementPhotoUrl(photo.path)
      .then((value) => { if (active) setUrl(value) })
      .catch(() => { if (active) setError('The measurement photo could not be loaded. Check Firebase Storage access.') })
    return () => { active = false }
  }, [photo.path])

  if (error) return <p className="form-hint" role="alert">{error}</p>
  if (!url) return <p className="form-hint" role="status">Loading measurement photo…</p>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="measurement-photo-preview-link">
      <img src={url} alt="Customer handwritten measurement sheet" className="measurement-photo-preview" />
      <span className="field-note">{photo.name} · Open full image</span>
    </a>
  )
}
