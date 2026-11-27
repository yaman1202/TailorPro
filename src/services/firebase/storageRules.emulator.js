import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { getMetadata, ref, uploadBytes } from 'firebase/storage'

const PROJECT_ID = 'demo-tailorpro-rules'
const BUSINESS_ID = 'tailorpro-dev-802c'
const OWNER_UID = 'tailorpro-storage-owner'
const ORDER_ID = 'ORDER-TEST-1'
const OBJECT_PATH = `businesses/${BUSINESS_ID}/orders/${ORDER_ID}/measurement/measurement-test-1.jpg`
const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

let testEnvironment

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync(new URL('../../../storage.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
})

beforeEach(async () => {
  await testEnvironment.clearFirestore()
  await testEnvironment.clearStorage()
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'businesses', BUSINESS_ID), { ownerUid: OWNER_UID })
  })
})

after(async () => {
  await testEnvironment?.cleanup()
})

test('the business owner can upload and read an order measurement photo', async () => {
  const storage = testEnvironment.authenticatedContext(OWNER_UID).storage()
  const fileRef = ref(storage, OBJECT_PATH)

  await assertSucceeds(uploadBytes(fileRef, imageBytes, {
    contentType: 'image/jpeg',
    customMetadata: { orderId: ORDER_ID, uploadedBy: OWNER_UID },
  }))
  const metadata = await assertSucceeds(getMetadata(fileRef))
  assert.equal(metadata.size, imageBytes.length)
  assert.equal(metadata.contentType, 'image/jpeg')
})

test('an unauthenticated user cannot upload a measurement photo', async () => {
  const storage = testEnvironment.unauthenticatedContext().storage()
  const fileRef = ref(storage, OBJECT_PATH)

  await assertFails(uploadBytes(fileRef, imageBytes, {
    contentType: 'image/jpeg',
    customMetadata: { orderId: ORDER_ID, uploadedBy: OWNER_UID },
  }))
})

test('a signed-in non-owner cannot upload or read a measurement photo', async () => {
  const ownerStorage = testEnvironment.authenticatedContext(OWNER_UID).storage()
  const fileRef = ref(ownerStorage, OBJECT_PATH)
  await assertSucceeds(uploadBytes(fileRef, imageBytes, {
    contentType: 'image/jpeg',
    customMetadata: { orderId: ORDER_ID, uploadedBy: OWNER_UID },
  }))

  const otherStorage = testEnvironment.authenticatedContext('different-user').storage()
  const otherRef = ref(otherStorage, OBJECT_PATH)
  await assertFails(getMetadata(otherRef))
  await assertFails(uploadBytes(ref(otherStorage, OBJECT_PATH.replace('measurement-test-1', 'measurement-test-2')), imageBytes, {
    contentType: 'image/jpeg',
    customMetadata: { orderId: ORDER_ID, uploadedBy: 'different-user' },
  }))
})

test('the owner cannot upload an unsupported content type or mismatched order metadata', async () => {
  const storage = testEnvironment.authenticatedContext(OWNER_UID).storage()
  const unsupportedType = ref(storage, OBJECT_PATH.replace('.jpg', '.svg'))
  await assertFails(uploadBytes(unsupportedType, imageBytes, {
    contentType: 'image/svg+xml',
    customMetadata: { orderId: ORDER_ID, uploadedBy: OWNER_UID },
  }))

  const mismatchedMetadata = ref(storage, OBJECT_PATH.replace('measurement-test-1', 'measurement-test-2'))
  await assertFails(uploadBytes(mismatchedMetadata, imageBytes, {
    contentType: 'image/jpeg',
    customMetadata: { orderId: 'ANOTHER-ORDER', uploadedBy: OWNER_UID },
  }))
})
