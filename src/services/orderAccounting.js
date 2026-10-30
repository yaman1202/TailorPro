import { isCancelledOrder, orderStatuses, requiresTailorForOrder } from './orderWorkflow.js'

export const paymentMethods = ['UPI', 'Cash', 'Card', 'Bank transfer', 'Cheque']
export const paymentTypes = ['Advance', 'Balance', 'Partial']

function toMinorUnits(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

export function normalizeMoney(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? toMinorUnits(amount) / 100 : Number.NaN
}

function validAmount(amount) {
  const value = Number(amount)
  return Number.isFinite(value) && toMinorUnits(value) > 0
}

export function getPaidForOrder(payments, orderId) {
  const paidInMinorUnits = payments
    .filter((payment) => payment.orderId === orderId && Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0)
    .reduce((total, payment) => total + toMinorUnits(payment.amount), 0)
  return paidInMinorUnits / 100
}

export function getTotalPaid(payments) {
  const paidInMinorUnits = payments.reduce((total, payment) => {
    const amount = Number(payment.amount)
    return total + (Number.isFinite(amount) && amount > 0 ? toMinorUnits(amount) : 0)
  }, 0)
  return paidInMinorUnits / 100
}

export function getPaidInPeriod(payments, periodKey) {
  return getTotalPaid(payments.filter((payment) => payment.date?.startsWith(periodKey)))
}

export function getOrderBalance(order, payments) {
  const balanceInMinorUnits = toMinorUnits(order.amount) - toMinorUnits(getPaidForOrder(payments, order.id))
  return Math.max(0, balanceInMinorUnits) / 100
}

export function getOutstandingBalance(orders, payments) {
  return orders
    .filter((order) => !isCancelledOrder(order))
    .reduce((total, order) => total + getOrderBalance(order, payments), 0)
}

export function getTotalOrderValue(orders) {
  const totalInMinorUnits = orders.reduce((total, order) => {
    const amount = Number(order.amount)
    return total + (Number.isFinite(amount) && amount > 0 ? toMinorUnits(amount) : 0)
  }, 0)
  return totalInMinorUnits / 100
}

export function validateOrderCreation(values) {
  const amount = Number(values.amount)
  const advance = Number(values.advance || 0)
  if (!Number.isFinite(amount) || toMinorUnits(amount) <= 0) {
    return { valid: false, error: 'Order total must be greater than zero.' }
  }
  if (!Number.isFinite(advance) || advance < 0 || toMinorUnits(advance) > toMinorUnits(amount)) {
    return { valid: false, error: 'Advance payment must be zero or a valid amount no greater than the order total.' }
  }
  return { valid: true, error: '' }
}

export function canAcceptPayment(order, payments) {
  return Boolean(order && orderStatuses.includes(order.status) && !isCancelledOrder(order) && getOrderBalance(order, payments) > 0)
}

export function validatePayment({ order, payments, amount, method, type, id }) {
  const value = Number(amount)
  if (!order) return { valid: false, error: 'Select an existing order.' }
  if (!canAcceptPayment(order, payments)) {
    return { valid: false, error: isCancelledOrder(order) ? 'Payments cannot be recorded for a cancelled order.' : 'This order has no outstanding balance or a supported status.' }
  }
  if (!validAmount(value)) return { valid: false, error: 'Payment amount must be greater than zero.' }
  if (!paymentMethods.includes(method)) return { valid: false, error: 'Select a supported payment method.' }
  if (!paymentTypes.includes(type)) return { valid: false, error: 'Select a supported payment type.' }
  if (id && payments.some((payment) => payment.id === id)) return { valid: false, error: 'This payment is already recorded.' }
  if (toMinorUnits(value) > toMinorUnits(getOrderBalance(order, payments))) {
    return { valid: false, error: 'Payment amount cannot exceed the order’s outstanding balance.' }
  }
  return { valid: true, error: '' }
}

export function validateOrderUpdate(order, updates, payments) {
  const orderPayments = payments.filter((payment) => payment.orderId === order.id)
  if (orderPayments.length && updates.customerId !== order.customerId) {
    return { valid: false, error: 'This order has payment history, so its customer cannot be changed.' }
  }

  const amount = Number(updates.amount)
  const paid = getPaidForOrder(payments, order.id)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Order total must be greater than zero.' }
  }
  if (toMinorUnits(amount) < toMinorUnits(paid)) {
    return { valid: false, error: 'Order total cannot be lower than the amount already collected.' }
  }
  if (requiresTailorForOrder(order) && !updates.tailor?.trim()) {
    return { valid: false, error: `A tailor must remain assigned while this order is ${order.status}.` }
  }
  return { valid: true, error: '' }
}

export function canDeleteOrder(order, payments) {
  return !payments.some((payment) => payment.orderId === order.id)
}

export function createOrderId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return `TP-${suffix.replaceAll('-', '').slice(0, 12).toUpperCase()}`
}
