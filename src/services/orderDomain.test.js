import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canAcceptPayment,
  canDeleteOrder,
  getOrderBalance,
  getOutstandingBalance,
  getPaidForOrder,
  getPaidInPeriod,
  getTotalOrderValue,
  getTotalPaid,
  normalizeMoney,
  validateOrderCreation,
  validateOrderUpdate,
  validatePayment,
} from './orderAccounting.js'
import { createOrderRecord, transitionOrder } from './orderWorkflow.js'

const payment = (overrides = {}) => ({
  id: 'pay-1',
  orderId: 'order-1',
  date: '2026-10-30',
  amount: 25,
  method: 'Cash',
  type: 'Advance',
  ...overrides,
})

test('new orders always start at New, whether or not a tailor is selected', () => {
  const withTailor = createOrderRecord({ tailor: 'Asha', status: 'Assigned' }, 'order-1', '2026-10-30')
  const withoutTailor = createOrderRecord({ tailor: '' }, 'order-2', '2026-10-30')

  assert.equal(withTailor.status, 'New')
  assert.equal(withoutTailor.status, 'New')
  const confirmedWithoutTailor = transitionOrder(withoutTailor, 'Confirmed')
  assert.equal(confirmedWithoutTailor.valid, true)
  assert.equal(transitionOrder(confirmedWithoutTailor.order, 'Assigned').valid, false)
  assert.equal(validateOrderCreation({ amount: 100, advance: 25 }).valid, true)
  assert.equal(validateOrderCreation({ amount: 100, advance: 101 }).valid, false)
  assert.equal(validateOrderCreation({ amount: 0, advance: 0 }).valid, false)
  const order = createOrderRecord({ id: 'ignored', amount: 100, advance: 25, tailor: 'Asha' }, 'order-3', '2026-10-30')
  const advanceValidation = validatePayment({ order, payments: [], amount: order.advance, method: 'Cash', type: 'Advance' })
  assert.equal(advanceValidation.valid, true)
  assert.equal(getOrderBalance(order, [payment({ orderId: order.id, amount: order.advance })]), 75)
})

test('transitions allow only the workflow path and keep terminal statuses closed', () => {
  let order = createOrderRecord({ tailor: 'Asha' }, 'order-1', '2026-10-30')
  assert.equal(transitionOrder(order, 'Stitching').valid, false)
  assert.equal(transitionOrder(order, 'Cancelled').valid, true)
  order = transitionOrder(order, 'Confirmed').order
  assert.equal(transitionOrder(order, 'Assigned').valid, true)
  order = transitionOrder(order, 'Assigned').order
  assert.equal(transitionOrder({ ...order, tailor: '' }, 'Stitching').valid, false)
  order = transitionOrder(order, 'Stitching').order
  order = transitionOrder(order, 'Quality Check').order
  assert.equal(transitionOrder(order, 'Stitching').valid, true)
  order = transitionOrder(order, 'Ready').order
  order = transitionOrder(order, 'Completed').order
  assert.equal(transitionOrder(order, 'Cancelled').valid, false)
  assert.equal(transitionOrder(order, 'Stitching').valid, false)
})

test('payment totals and outstanding balances use cent precision and exclude cancelled orders', () => {
  const payments = [
    payment({ amount: 0.1 }),
    payment({ id: 'pay-2', amount: 0.2 }),
    payment({ id: 'orphan', orderId: 'deleted-order', amount: 50 }),
  ]
  const orders = [
    { id: 'order-1', amount: 1, status: 'Stitching' },
    { id: 'order-2', amount: 80, status: 'Cancelled' },
    { id: 'order-3', amount: 10, status: 'Completed' },
  ]

  assert.equal(getPaidForOrder(payments, 'order-1'), 0.3)
  assert.equal(normalizeMoney(0.1 + 0.2), 0.3)
  assert.equal(getOrderBalance(orders[0], payments), 0.7)
  assert.equal(getTotalPaid(payments), 50.3)
  assert.equal(getPaidInPeriod(payments, '2026-10'), 50.3)
  assert.equal(getTotalOrderValue(orders), 91)
  assert.equal(getOutstandingBalance(orders, payments), 10.7)
  assert.equal(canAcceptPayment(orders[2], payments), true)
  assert.equal(canAcceptPayment(orders[1], payments), false)
})

test('payment validation rejects invalid, over-balance, cancelled, and duplicate payments', () => {
  const order = { id: 'order-1', amount: 100, status: 'New' }
  const payments = [payment({ amount: 75 })]
  const validate = (overrides = {}) => validatePayment({
    order,
    payments,
    amount: 10,
    method: 'Cash',
    type: 'Partial',
    ...overrides,
  })

  assert.equal(validate().valid, true)
  assert.equal(validate({ amount: -1 }).valid, false)
  assert.equal(validate({ amount: 0 }).valid, false)
  assert.equal(validate({ amount: 25.01 }).valid, false)
  assert.equal(validate({ id: 'pay-1' }).valid, false)
  assert.equal(validate({ method: 'Crypto' }).valid, false)
  assert.equal(validate({ type: 'Refund' }).valid, false)
  assert.equal(validate({ order: null }).valid, false)
  assert.equal(validate({ order: { ...order, status: 'Cancelled' } }).valid, false)
  assert.equal(validate({ amount: 10.001 }).valid, true)
  assert.equal(validatePayment({ order, payments: [...payments, payment({ id: 'pay-2', amount: 25 })], amount: 1, method: 'Cash', type: 'Balance' }).valid, false)
  assert.equal(validatePayment({ order: { ...order, amount: 75 }, payments, amount: 0.01, method: 'Cash', type: 'Balance' }).valid, false)
})

test('order edits and deletion cannot detach or understate recorded payment history', () => {
  const order = { id: 'order-1', customerId: 'customer-1', amount: 100, status: 'Stitching', tailor: 'Asha' }
  const payments = [payment({ amount: 60 })]

  assert.equal(validateOrderUpdate(order, { ...order, amount: 59 }, payments).valid, false)
  assert.equal(validateOrderUpdate(order, { ...order, customerId: 'customer-2' }, payments).valid, false)
  assert.equal(validateOrderUpdate(order, { ...order, tailor: '' }, payments).valid, false)
  assert.equal(validateOrderUpdate(order, { ...order, amount: 60 }, payments).valid, true)
  assert.equal(canDeleteOrder(order, payments), false)
  assert.equal(canDeleteOrder(order, []), true)
})
