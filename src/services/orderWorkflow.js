export const orderStatuses = ['New', 'Confirmed', 'Assigned', 'Stitching', 'Quality Check', 'Ready', 'Completed', 'Cancelled']
export const terminalOrderStatuses = ['Completed', 'Cancelled']
export const activeOrderStatuses = orderStatuses.filter((status) => !terminalOrderStatuses.includes(status))

export function requiresTailorForOrder(order) {
  return ['Assigned', 'Stitching', 'Quality Check', 'Ready', 'Completed'].includes(order?.status)
}

export function canTransitionOrder(order, nextStatus) {
  if (!order || !orderStatuses.includes(order.status) || !orderStatuses.includes(nextStatus) || order.status === nextStatus) return false
  if (terminalOrderStatuses.includes(order.status)) return false
  if (nextStatus === 'Cancelled') return true
  return !requiresTailorForOrder({ status: nextStatus }) || Boolean(order.tailor?.trim())
}

export function createOrderRecord(values, id, createdAt = new Date().toISOString().slice(0, 10)) {
  return { ...values, id, status: 'New', createdAt }
}

export function transitionOrder(order, nextStatus) {
  if (!canTransitionOrder(order, nextStatus)) {
    if (order && orderStatuses.includes(nextStatus)
      && requiresTailorForOrder({ status: nextStatus })
      && !order.tailor?.trim()) {
      return { valid: false, error: `This status requires a tailor assignment before the order can move to "${nextStatus}".` }
    }
    return { valid: false, error: `That status change is not allowed from "${order?.status || 'unknown'}".` }
  }
  return { valid: true, order: { ...order, status: nextStatus } }
}

export function isTerminalOrder(order) {
  return terminalOrderStatuses.includes(order.status)
}

export function isCancelledOrder(order) {
  return order?.status === 'Cancelled'
}

export function isActiveOrder(order) {
  return Boolean(order && activeOrderStatuses.includes(order.status))
}

export function getAllowedOrderStatuses(order) {
  return orderStatuses.filter((status) => status === order.status || canTransitionOrder(order, status))
}
