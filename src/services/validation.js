import { measurementFields } from '../data/measurementTemplates.js'
import {
  paymentMethods,
  paymentTypes,
  validateOrderCreation,
  validateOrderUpdate,
  validatePayment,
} from './orderAccounting.js'
import { orderStatuses } from './orderWorkflow.js'

const collections = ['customers', 'measurements', 'orders', 'payments', 'staff', 'inventory']
const staffRoles = ['Master Tailor', 'Senior Tailor', 'Tailor', 'Finishing Specialist', 'Studio Assistant']
const inventoryCategories = ['Fabric', 'Accessory']
const inventoryUnits = ['metres', 'pieces', 'spools', 'rolls']
const currencies = ['INR', 'USD', 'GBP', 'EUR']

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function numeric(value, minimum = 0) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value))
    && Number(value) >= minimum
}

function result(errors) {
  return { valid: errors.length === 0, errors, error: errors.join(' ') }
}

function validateId(record, label, errors) {
  if (!isRecord(record)) {
    errors.push(`${label} must be an object.`)
    return false
  }
  if (!hasText(record.id)) errors.push(`${label}.id is required.`)
  return true
}

export function validateCustomer(customer) {
  const errors = []
  if (!validateId(customer, 'Customer', errors)) return result(errors)
  if (!hasText(customer.name)) errors.push('Customer name is required.')
  if (!hasText(customer.phone)) errors.push('Customer phone is required.')
  if (customer.email !== undefined && customer.email !== '' && (typeof customer.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) {
    errors.push('Customer email must be a valid email address.')
  }
  if (customer.city !== undefined && typeof customer.city !== 'string') errors.push('Customer city must be text.')
  if (customer.joined !== undefined && !isDate(customer.joined)) errors.push('Customer joined date must use YYYY-MM-DD format.')
  return result(errors)
}

export function validateMeasurement(measurement, { requireTemplateFields = true } = {}) {
  const errors = []
  if (!validateId(measurement, 'Measurement', errors)) return result(errors)
  if (!hasText(measurement.customerId)) errors.push('Measurement customer is required.')
  if (!hasText(measurement.garment)) errors.push('Measurement garment is required.')
  if (!isDate(measurement.date)) errors.push('Measurement date must use YYYY-MM-DD format.')
  if (!Number.isInteger(measurement.version) || measurement.version < 1) errors.push('Measurement version must be a positive integer.')
  if (!isRecord(measurement.values) || Object.keys(measurement.values).length === 0) {
    errors.push('At least one measurement value is required.')
  } else {
    const requiredFields = measurementFields[measurement.garment]
    if (requireTemplateFields && !requiredFields) errors.push('Select a supported garment measurement template.')
    if (requireTemplateFields && requiredFields) {
      requiredFields.forEach((field) => {
        if (!numeric(measurement.values[field])) errors.push(`${field} must be a non-negative number.`)
      })
    }
    Object.entries(measurement.values).forEach(([field, value]) => {
      if (!hasText(field) || !numeric(value)) errors.push('Measurement values must be non-negative numbers.')
    })
  }
  return result(errors)
}

function validateMeasurementVersionUniqueness(measurement, measurements, excludeId) {
  const duplicate = measurements.find((item) => item.id !== excludeId
    && item.customerId === measurement.customerId
    && item.garment === measurement.garment
    && item.version === measurement.version)
  return duplicate
    ? result([`Measurement version ${measurement.version} already exists for this customer and garment.`])
    : result([])
}

export function validateOrder(order, { existing, payments = [], isImport = false } = {}) {
  const errors = []
  if (!validateId(order, 'Order', errors)) return result(errors)
  if (!hasText(order.customerId)) errors.push('Order customer is required.')
  if (!hasText(order.customer)) errors.push('Order customer name is required.')
  if (!hasText(order.garment)) errors.push('Order garment is required.')
  if (!isDate(order.dueDate)) errors.push('Order delivery date must use YYYY-MM-DD format.')
  if (!isDate(order.createdAt)) errors.push('Order creation date must use YYYY-MM-DD format.')
  if (!orderStatuses.includes(order.status)) errors.push('Order status is not supported.')
  if (!existing && !isImport && order.status !== 'New') errors.push('New orders must begin in the New status.')
  if (order.tailor !== undefined && typeof order.tailor !== 'string') errors.push('Order tailor must be text.')
  if (existing) {
    const validation = validateOrderUpdate(existing, order, payments)
    if (!validation.valid) errors.push(validation.error)
  } else {
    const validation = validateOrderCreation(order)
    if (!validation.valid) errors.push(validation.error)
  }
  return result(errors)
}

export function validatePaymentEntity(payment, { order, payments = [], checkBalance = true } = {}) {
  const errors = []
  if (!validateId(payment, 'Payment', errors)) return result(errors)
  if (!hasText(payment.orderId)) errors.push('Payment order is required.')
  if (!hasText(payment.customer)) errors.push('Payment customer is required.')
  if (!isDate(payment.date)) errors.push('Payment date must use YYYY-MM-DD format.')
  if (!numeric(payment.amount, 0.01)) errors.push('Payment amount must be greater than zero.')
  if (!paymentMethods.includes(payment.method)) errors.push('Payment method is not supported.')
  if (!paymentTypes.includes(payment.type)) errors.push('Payment type is not supported.')
  if (!order) errors.push('Payment must reference an existing order.')
  if (order && checkBalance) {
    const validation = validatePayment({
      order,
      payments,
      amount: payment.amount,
      method: payment.method,
      type: payment.type,
      id: payment.id,
    })
    if (!validation.valid) errors.push(validation.error)
  }
  return result(errors)
}

export function validateStaff(member, { staff = [], excludeId } = {}) {
  const errors = []
  if (!validateId(member, 'Staff member', errors)) return result(errors)
  if (!hasText(member.name)) errors.push('Staff name is required.')
  if (!hasText(member.phone)) errors.push('Staff phone is required.')
  if (!staffRoles.includes(member.role)) errors.push('Staff role is not supported.')
  if (member.email !== undefined && member.email !== '' && (typeof member.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email))) {
    errors.push('Staff email must be a valid email address.')
  }
  if (typeof member.active !== 'boolean') errors.push('Staff availability must be a boolean.')
  if (staff.some((item) => item.id !== excludeId && item.name?.trim().toLocaleLowerCase() === member.name?.trim().toLocaleLowerCase())) {
    errors.push('A team member with this name already exists.')
  }
  return result(errors)
}

export function validateInventoryItem(item, { inventory = [], excludeId } = {}) {
  const errors = []
  if (!validateId(item, 'Inventory item', errors)) return result(errors)
  if (!hasText(item.name)) errors.push('Inventory item name is required.')
  if (!inventoryCategories.includes(item.category)) errors.push('Inventory category is not supported.')
  if (!hasText(item.sku)) errors.push('Inventory SKU is required.')
  if (!numeric(item.quantity)) errors.push('Inventory quantity must be a non-negative number.')
  if (!inventoryUnits.includes(item.unit)) errors.push('Inventory unit is not supported.')
  if (!numeric(item.reorderAt)) errors.push('Inventory reorder threshold must be a non-negative number.')
  if (!numeric(item.price)) errors.push('Inventory unit cost must be a non-negative number.')
  if (inventory.some((entry) => entry.id !== excludeId && entry.sku?.trim().toLocaleLowerCase() === item.sku?.trim().toLocaleLowerCase())) {
    errors.push('An inventory item with this SKU already exists.')
  }
  return result(errors)
}

export function validateSettings(settings) {
  const errors = []
  if (!isRecord(settings)) return result(['Business settings must be an object.'])
  for (const field of ['businessName', 'owner', 'email', 'phone']) {
    if (!hasText(settings[field])) errors.push(`Business ${field} is required.`)
  }
  if (settings.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email)) errors.push('Business email must be a valid email address.')
  if (!currencies.includes(settings.currency)) errors.push('Business currency is not supported.')
  for (const field of ['reminders', 'lowStockAlerts']) {
    if (typeof settings[field] !== 'boolean') errors.push(`Business preference ${field} must be a boolean.`)
  }
  return result(errors)
}

export function validateRelationships(data) {
  const errors = []
  const customers = Array.isArray(data.customers) ? data.customers : []
  const measurements = Array.isArray(data.measurements) ? data.measurements : []
  const orders = Array.isArray(data.orders) ? data.orders : []
  const payments = Array.isArray(data.payments) ? data.payments : []
  const staff = Array.isArray(data.staff) ? data.staff : []
  const customerIds = new Set(customers.map((customer) => customer.id))
  const orderIds = new Set(orders.map((order) => order.id))
  const staffNames = new Set(staff.map((member) => member.name?.trim().toLocaleLowerCase()))

  for (const measurement of measurements) {
    if (!customerIds.has(measurement.customerId)) errors.push(`Measurement "${measurement.id}" references a missing customer.`)
  }
  for (const order of orders) {
    if (!customerIds.has(order.customerId)) errors.push(`Order "${order.id}" references a missing customer.`)
    if (order.tailor?.trim() && !staffNames.has(order.tailor.trim().toLocaleLowerCase())) {
      errors.push(`Order "${order.id}" is assigned to a missing staff member.`)
    }
  }
  for (const payment of payments) {
    if (!orderIds.has(payment.orderId)) errors.push(`Payment "${payment.id}" references a missing order.`)
  }
  return result(errors)
}

export function validateData(data, { allowLegacyMeasurements = false } = {}) {
  const errors = []
  if (!isRecord(data)) return result(['Backup data must be an object.'])
  for (const collection of collections) {
    if (!Array.isArray(data[collection])) {
      errors.push(`${collection} must be an array.`)
      continue
    }
    const ids = new Set()
    data[collection].forEach((record, index) => {
      const label = `${collection}[${index}]`
      if (!isRecord(record) || !hasText(record.id)) {
        errors.push(`${label} must be an object with an ID.`)
        return
      }
      if (ids.has(record.id)) errors.push(`${collection} contains duplicate ID "${record.id}".`)
      ids.add(record.id)
    })
  }
  for (const collection of collections) {
    if (!Array.isArray(data[collection])) continue
    data[collection].forEach((record) => {
      if (!isRecord(record) || !hasText(record.id)) return
      let validation
      if (collection === 'customers') validation = validateCustomer(record)
      if (collection === 'measurements') {
        validation = validateMeasurement(record, { requireTemplateFields: !allowLegacyMeasurements })
        const versionValidation = validateMeasurementVersionUniqueness(record, data.measurements, record.id)
        errors.push(...versionValidation.errors)
      }
      if (collection === 'orders') validation = validateOrder(record, { payments: [], isImport: true })
      if (collection === 'payments') {
        const order = data.orders?.find((item) => item.id === record.orderId)
        validation = validatePaymentEntity(record, { order, payments: [], checkBalance: false })
      }
      if (collection === 'staff') validation = validateStaff(record)
      if (collection === 'inventory') validation = validateInventoryItem(record)
      for (const error of validation?.errors || []) errors.push(error)
    })
  }
  if (isRecord(data.settings)) {
    errors.push(...validateSettings(data.settings).errors)
  } else {
    errors.push('settings must be an object.')
  }
  errors.push(...validateRelationships(data).errors)

  const paymentsByOrder = new Map()
  for (const payment of Array.isArray(data.payments) ? data.payments : []) {
    const order = (Array.isArray(data.orders) ? data.orders : []).find((item) => item.id === payment.orderId)
    if (!order || !numeric(payment.amount, 0.01)) continue
    const total = (paymentsByOrder.get(order.id) || 0) + Math.round(Number(payment.amount) * 100)
    paymentsByOrder.set(order.id, total)
    if (total > Math.round(Number(order.amount) * 100)) {
      errors.push(`Payments for order "${order.id}" exceed its total amount.`)
    }
  }
  return result(errors)
}

export function validateEntity(collection, record, data, { existing, excludeId } = {}) {
  let validation
  if (collection === 'customers') validation = validateCustomer(record)
  if (collection === 'measurements') validation = validateMeasurement(record)
  if (collection === 'orders') validation = validateOrder(record, { existing, payments: data.payments })
  if (collection === 'payments') {
    const order = data.orders.find((item) => item.id === record.orderId)
    validation = validatePaymentEntity(record, { order, payments: data.payments })
  }
  if (collection === 'staff') validation = validateStaff(record, { staff: data.staff, excludeId: excludeId || existing?.id })
  if (collection === 'inventory') validation = validateInventoryItem(record, { inventory: data.inventory, excludeId: excludeId || existing?.id })
  if (!validation) return result([`Unsupported data collection "${collection}".`])
  if (!validation.valid) return validation
  if (collection === 'measurements') {
    const versionValidation = validateMeasurementVersionUniqueness(record, data.measurements, existing?.id)
    if (!versionValidation.valid) return versionValidation
  }

  let nextData = { ...data, [collection]: existing
    ? data[collection].map((item) => item.id === existing.id ? record : item)
    : [record, ...data[collection]] }
  if (existing && collection === 'customers' && existing.name !== record.name) {
    const orderIds = new Set(data.orders.filter((order) => order.customerId === existing.id).map((order) => order.id))
    nextData = {
      ...nextData,
      measurements: data.measurements.map((item) => item.customerId === existing.id ? { ...item, customer: record.name } : item),
      orders: nextData.orders.map((item) => item.customerId === existing.id ? { ...item, customer: record.name } : item),
      payments: data.payments.map((item) => orderIds.has(item.orderId) ? { ...item, customer: record.name } : item),
    }
  }
  if (existing && collection === 'staff' && existing.name !== record.name) {
    nextData = {
      ...nextData,
      orders: data.orders.map((item) => item.tailor?.trim().toLocaleLowerCase() === existing.name.trim().toLocaleLowerCase()
        ? { ...item, tailor: record.name }
        : item),
    }
  }
  return { ...validateRelationships(nextData), data: nextData }
}

export function validateDeletion(collection, record, data) {
  if (!record) return result([`No ${collection} record exists.`])
  if (collection === 'customers') {
    const linkedOrders = data.orders.filter((order) => order.customerId === record.id)
    const linkedMeasurements = data.measurements.filter((measurement) => measurement.customerId === record.id)
    if (linkedOrders.length || linkedMeasurements.length) {
      return result([`Customer cannot be deleted while ${linkedOrders.length} order(s) or ${linkedMeasurements.length} measurement profile(s) reference them.`])
    }
  }
  if (collection === 'staff') {
    const assignments = data.orders.filter((order) => order.tailor?.trim().toLocaleLowerCase() === record.name?.trim().toLocaleLowerCase())
    if (assignments.length) return result([`Staff member cannot be deleted while assigned to ${assignments.length} order(s). Reassign those orders first.`])
  }
  if (collection === 'orders' && data.payments.some((payment) => payment.orderId === record.id)) {
    return result(['Order cannot be deleted while payment history references it. Cancel the order to preserve its ledger.'])
  }
  if (collection === 'measurements') {
    return result(['Measurement history is retained; save a new version instead of deleting a profile.'])
  }
  if (collection === 'payments') return result(['Payment ledger entries cannot be deleted.'])
  if (!collections.includes(collection)) return result([`Unsupported data collection "${collection}".`])
  return result([])
}
