import { useEffect, useState } from 'react'
import { getOrderMeasurementPhotoBlob } from '../services/firebase/orderMeasurementPhotos.js'

export default function MeasurementPhotoPreview({ photo }) {
  const [result, setResult] = useState({ path: '', url: '', error: '' })

  useEffect(() => {
    let active = true
    let objectUrl = ''
    getOrderMeasurementPhotoBlob(photo.path)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (active) setResult({ path: photo.path, url: objectUrl, error: '' })
        else URL.revokeObjectURL(objectUrl)
      })
      .catch(() => {
        if (active) {
          setResult({
            path: photo.path,
            url: '',
            error: 'The measurement photo could not be loaded. Check Firebase Storage access.',
          })
        }
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photo.path])

  if (result.path !== photo.path) return <p className="form-hint" role="status">Loading measurement photo…</p>
  if (result.error) return <p className="form-hint" role="alert">{result.error}</p>
  if (!result.url) return <p className="form-hint" role="status">Loading measurement photo…</p>
  return (
    <a href={result.url} target="_blank" rel="noreferrer" className="measurement-photo-preview-link">
      <img src={result.url} alt="Customer handwritten measurement sheet" className="measurement-photo-preview" />
      <span className="field-note">{photo.name} · Open full image</span>
    </a>
  )
}
