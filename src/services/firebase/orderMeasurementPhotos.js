import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { getAuth } from 'firebase/auth'
import firebaseApp from './firebaseApp.js'

const BUSINESS_ID = import.meta.env?.VITE_FIREBASE_BUSINESS_ID || 'tailorpro-dev-802c'
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function assertSafeOrderId(orderId) {
  if (typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(orderId)) {
    throw new Error('Order ID is invalid for a measurement photo upload.')
  }
}

async function getAuthorizedStorage() {
  const auth = getAuth(firebaseApp)
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('Sign in as the TailorPro owner before uploading measurement photos.')
  const { getStorage } = await import('firebase/storage')
  return { storage: getStorage(firebaseApp), uid: auth.currentUser.uid }
}

export async function uploadOrderMeasurementPhoto({ orderId, file }) {
  assertSafeOrderId(orderId)
  if (!file || !ALLOWED_TYPES.has(file.type) || !Number.isSafeInteger(file.size)
    || file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    throw new Error('Choose a JPG, PNG or WEBP image up to 10 MB.')
  }
  const { storage, uid } = await getAuthorizedStorage()
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
  const nonce = globalThis.crypto?.randomUUID?.() || String(Date.now())
  const name = `measurement-${nonce}.${extension}`
  const path = `businesses/${BUSINESS_ID}/orders/${orderId}/measurement/${name}`
  const objectRef = ref(storage, path)
  await uploadBytes(objectRef, file, {
    contentType: file.type,
    customMetadata: { orderId, uploadedBy: uid },
  })
  const downloadURL = await getDownloadURL(objectRef)
  return { path, name, contentType: file.type, size: file.size, uploadedAt: new Date().toISOString(), downloadURL }
}

export async function deleteOrderMeasurementPhoto(path) {
  if (typeof path !== 'string' || !path.startsWith(`businesses/${BUSINESS_ID}/orders/`)) return
  const { storage } = await getAuthorizedStorage()
  await deleteObject(ref(storage, path))
}

export async function getOrderMeasurementPhotoUrl(path) {
  if (typeof path !== 'string' || !path.startsWith(`businesses/${BUSINESS_ID}/orders/`)) {
    throw new Error('Measurement photo path is invalid.')
  }
  const { storage } = await getAuthorizedStorage()
  return getDownloadURL(ref(storage, path))
}
