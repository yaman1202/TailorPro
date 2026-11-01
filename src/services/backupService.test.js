import assert from 'node:assert/strict'
import test from 'node:test'
import { initialData } from '../data/initialData.js'
import { createBackup, validateBackup } from './backupService.js'
import { getOrderBalance, getOutstandingBalance, getPaidForOrder } from './orderAccounting.js'
import { canTransitionOrder, getAllowedOrderStatuses } from './orderWorkflow.js'

test('exports a complete backup that passes import validation', () => {
  const backup = createBackup(structuredClone(initialData), '2026-10-30T00:00:00.000Z')
  assert.equal(validateBackup(JSON.parse(JSON.stringify(backup))).valid, true)
})

test('rejects malformed, duplicate, and financially invalid backup records', () => {
  const data = structuredClone(initialData)
  data.customers.push({ ...data.customers[0] })
  data.orders[0].status = 'Unknown'
  data.payments[0].amount = -1

  const result = validateBackup(createBackup(data))
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('duplicate ID')))
  assert.ok(result.errors.some((error) => error.includes('status')))
  assert.ok(result.errors.some((error) => error.includes('amount')))
  assert.equal(validateBackup({ format: 'other', version: 1, data }).valid, false)
})

test('allows direct order status selection when assignment requirements are met', () => {
  const order = { id: 'TP-1', status: 'New', tailor: '' }
  assert.equal(canTransitionOrder(order, 'Confirmed'), true)
  assert.equal(canTransitionOrder(order, 'Stitching'), false)
  assert.equal(canTransitionOrder(order, 'Assigned'), false)
  assert.ok(getAllowedOrderStatuses(order).includes('Cancelled'))

  order.tailor = 'Dev Patel'
  assert.equal(canTransitionOrder(order, 'Stitching'), true)
  assert.equal(canTransitionOrder(order, 'Assigned'), true)
  assert.equal(canTransitionOrder(order, 'Ready'), true)
  order.status = 'Ready'
  assert.equal(canTransitionOrder(order, 'Completed'), true)
  order.status = 'Completed'
  assert.equal(canTransitionOrder(order, 'Cancelled'), false)
})

test('calculates balances per order and excludes cancelled orders from outstanding totals', () => {
  const payments = [
    { orderId: 'TP-1', amount: 25 },
    { orderId: 'deleted-order', amount: 50 },
  ]
  const orders = [
    { id: 'TP-1', amount: 100, status: 'Stitching' },
    { id: 'TP-2', amount: 80, status: 'Cancelled' },
  ]
  assert.equal(getPaidForOrder(payments, 'TP-1'), 25)
  assert.equal(getOrderBalance(orders[0], payments), 75)
  assert.equal(getOutstandingBalance(orders, payments), 75)
})
