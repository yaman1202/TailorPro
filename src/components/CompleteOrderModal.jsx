import { useState } from 'react'
import { Button, FormField, Modal, Select } from './UI.jsx'
import { paymentMethods } from '../services/orderAccounting.js'

export default function CompleteOrderModal({ order, balance, money, busy, onClose, onConfirm }) {
  const [method, setMethod] = useState('')
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setError(await onConfirm(method))
  }

  return (
    <Modal
      title="Confirm order completion"
      description={`Complete ${order.id} for ${order.customer} after confirming its final payment.`}
      onClose={busy ? () => {} : onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="balance-callout">
          <span>{balance > 0 ? 'Remaining balance due' : 'Payment status'}</span>
          <strong>{balance > 0 ? money(balance) : 'Paid in full'}</strong>
        </div>
        {balance > 0 ? (
          <>
            <FormField label="Payment method">
              <Select required value={method} onChange={(event) => { setMethod(event.target.value); setError('') }} aria-label="Final payment method">
                <option value="">Select a payment method</option>
                {paymentMethods.map((paymentMethod) => <option key={paymentMethod}>{paymentMethod}</option>)}
              </Select>
            </FormField>
            {!method && <p className="form-hint">Select a payment method to enable confirmation.</p>}
          </>
        ) : (
          <p className="form-hint">This order is already fully paid. No additional payment will be recorded.</p>
        )}
        {error && <p className="form-hint" role="alert">{error}</p>}
        <div className="modal-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || (balance > 0 && !method)}>{busy ? 'Processing...' : 'Confirm payment & complete'}</Button>
        </div>
      </form>
    </Modal>
  )
}
