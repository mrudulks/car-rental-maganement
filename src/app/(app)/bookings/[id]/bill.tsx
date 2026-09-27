'use client'

import { useActionState, useState, useTransition } from 'react'
import { Plus, Receipt, Trash2, Wallet } from 'lucide-react'
import type { BillSummary } from '@/server/modules/billing/service'
import {
  addChargeAction,
  recordPaymentAction,
  removeChargeAction,
  type BillingFormState,
} from '@/app/actions/billing'
import {
  CHARGE_KIND_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from '@/server/modules/billing/schema'
import { Button, Field, FormError, formatMoney } from '@/components/ui'
import { Card } from '@/components/layout'

const EMPTY: BillingFormState = {}

export function Bill({
  bookingId,
  bill,
  canRecord,
  canRefund,
  cancelled,
}: {
  bookingId: string
  bill: BillSummary
  canRecord: boolean
  canRefund: boolean
  cancelled: boolean
}) {
  const owes = Number(bill.balance)

  return (
    <div className="mt-8 space-y-6">
      <Card
        title="Bill"
        description={`GST at ${bill.gstRate}%, split evenly into CGST and SGST.`}
        icon={<Receipt className="size-[18px]" strokeWidth={1.75} />}
        aside={
          <div className="text-right">
            <div className="text-sm text-muted">{owes > 0 ? 'Outstanding' : 'Settled'}</div>
            <div
              className={`text-xl font-semibold tabular-nums ${owes > 0 ? 'text-rented' : 'text-available'}`}
            >
              {formatMoney(bill.balance)}
            </div>
          </div>
        }
      >
        {bill.charges.length === 0 ? (
          <p className="px-5 py-5 text-[15px] text-muted">
            Nothing billed yet. The rental is added when the keys are handed over.
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-[15px]">
              <thead>
                <tr>
                  <th scope="col" className="bg-fill px-5 py-2 text-[13px] font-medium text-muted">Item</th>
                  <th scope="col" className="bg-fill px-3 py-2 text-right text-[13px] font-medium text-muted">Qty</th>
                  <th scope="col" className="bg-fill px-3 py-2 text-right text-[13px] font-medium text-muted">Rate</th>
                  <th scope="col" className="bg-fill px-3 py-2 text-right text-[13px] font-medium text-muted">Amount</th>
                  <th scope="col" className="bg-fill px-5 py-2"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {bill.charges.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-5 py-2.5">
                      {c.description}
                      <span className="ml-2 text-sm text-muted">{CHARGE_KIND_LABELS[c.kind]}</span>
                      {!c.taxable ? <span className="ml-2 text-sm text-muted">no GST</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{Number(c.quantity)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{formatMoney(c.unitAmount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(c.amount)}</td>
                    <td className="px-5 py-2.5 text-right">
                      {canRecord && c.kind !== 'RENTAL' ? <RemoveCharge chargeId={c.id} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line">
                <Total label="Taxable value" value={bill.taxable} />
                {Number(bill.nonTaxable) > 0 ? (
                  <Total label="Not taxable" value={bill.nonTaxable} />
                ) : null}
                <Total label={`CGST (${Number(bill.gstRate) / 2}%)`} value={bill.cgst} />
                <Total label={`SGST (${Number(bill.gstRate) / 2}%)`} value={bill.sgst} />
                <Total label="Total" value={bill.total} strong />
                <Total label="Paid" value={bill.paid} />
                <Total label="Balance" value={bill.balance} strong />
              </tfoot>
            </table>
          </div>
        )}

        {canRecord && !cancelled ? <AddCharge bookingId={bookingId} /> : null}
      </Card>

      <Card
        title="Payments"
        description="Money taken at the counter. Deposits are held separately from the bill."
        icon={<Wallet className="size-[18px]" strokeWidth={1.75} />}
        aside={
          Number(bill.depositHeld) > 0 ? (
            <div className="text-right">
              <div className="text-sm text-muted">Deposit held</div>
              <div className="text-xl font-semibold tabular-nums">{formatMoney(bill.depositHeld)}</div>
            </div>
          ) : null
        }
      >
        {bill.payments.length === 0 ? (
          <p className="px-5 py-5 text-[15px] text-muted">Nothing received yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {bill.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
                <span className="font-medium tabular-nums">{formatMoney(p.amount)}</span>
                <span className="text-muted">{PAYMENT_KIND_LABELS[p.kind]}</span>
                <span className="text-muted">· {PAYMENT_METHOD_LABELS[p.method]}</span>
                {p.reference ? <span className="text-sm text-muted">· {p.reference}</span> : null}
                <span className="ml-auto text-sm text-muted">
                  {p.receivedAt.toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                  {p.receivedBy ? ` · ${p.receivedBy}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canRecord ? <RecordPayment bookingId={bookingId} canRefund={canRefund} /> : null}
      </Card>
    </div>
  )
}

/**
 * Collapse the form once the server confirms the write. Adjusting state during render
 * is React's own pattern for reacting to a changed value -- an effect here would cause
 * a second render pass and a visible flash of the filled-in form.
 */
function useClosesOnSuccess(ok: boolean | undefined) {
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(ok)

  if (ok !== seen) {
    setSeen(ok)
    if (ok) setOpen(false)
  }

  return [open, setOpen] as const
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr>
      <td colSpan={3} className={`px-5 py-1.5 text-right ${strong ? 'font-semibold' : 'text-muted'}`}>
        {label}
      </td>
      <td className={`px-3 py-1.5 text-right tabular-nums ${strong ? 'font-semibold' : ''}`}>
        {formatMoney(value)}
      </td>
      <td />
    </tr>
  )
}

function RemoveCharge({ chargeId }: { chargeId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await removeChargeAction(chargeId)
            if (r.error) setError(r.error)
          })
        }
        className="rounded-md p-1 text-muted hover:bg-fill hover:text-danger disabled:opacity-60"
      >
        <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">Remove this charge</span>
      </button>
      {error ? (
        <span role="alert" className="ml-2 text-sm text-danger">
          {error}
        </span>
      ) : null}
    </>
  )
}

function AddCharge({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(addChargeAction.bind(null, bookingId), EMPTY)
  const [open, setOpen] = useClosesOnSuccess(state.ok)

  if (!open) {
    return (
      <div className="border-t border-line px-5 py-4">
        <button type="button" onClick={() => setOpen(true)} className="btn-quiet">
          <Plus className="size-4" strokeWidth={2} aria-hidden="true" />
          Add a charge
        </button>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-5 border-t border-line px-5 py-5" noValidate>
      {state.error ? <FormError>{state.error}</FormError> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="field-kind" className="field-label">What is it</label>
          <select id="field-kind" name="kind" defaultValue="EXTRA" className="field-control">
            <option value="EXTRA">Extra</option>
            <option value="LATE_FEE">Late fee</option>
            <option value="DAMAGE">Damage</option>
          </select>
        </div>
        <Field
          label="Description"
          name="description"
          placeholder="Child seat"
          defaultValue={state.values?.description}
          error={state.fieldErrors?.description}
        />
        <Field
          label="Quantity"
          name="quantity"
          inputMode="decimal"
          defaultValue={state.values?.quantity ?? '1'}
          error={state.fieldErrors?.quantity}
        />
        <Field
          label="Rate (₹)"
          name="unitAmount"
          inputMode="decimal"
          defaultValue={state.values?.unitAmount}
          error={state.fieldErrors?.unitAmount}
        />
      </div>
      <label className="flex items-center gap-2.5 text-[15px]">
        <input type="checkbox" name="taxable" defaultChecked className="size-4 rounded border-line accent-ink" />
        GST applies to this charge
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add charge'}</Button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-[15px] text-muted underline underline-offset-4">
          Cancel
        </button>
      </div>
    </form>
  )
}

function RecordPayment({ bookingId, canRefund }: { bookingId: string; canRefund: boolean }) {
  const [state, action, pending] = useActionState(recordPaymentAction.bind(null, bookingId), EMPTY)
  const [open, setOpen] = useClosesOnSuccess(state.ok)

  if (!open) {
    return (
      <div className="border-t border-line px-5 py-4">
        <button type="button" onClick={() => setOpen(true)} className="btn-quiet">
          <Plus className="size-4" strokeWidth={2} aria-hidden="true" />
          Record a payment
        </button>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-5 border-t border-line px-5 py-5" noValidate>
      {state.error ? <FormError>{state.error}</FormError> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="field-paymentKind" className="field-label">Kind</label>
          <select id="field-paymentKind" name="kind" defaultValue="RENTAL" className="field-control">
            <option value="RENTAL">Rental payment</option>
            <option value="DEPOSIT">Security deposit</option>
            {canRefund ? <option value="DEPOSIT_REFUND">Deposit returned</option> : null}
            {canRefund ? <option value="REFUND">Refund</option> : null}
          </select>
        </div>
        <Field
          label="Amount (₹)"
          name="amount"
          inputMode="decimal"
          defaultValue={state.values?.amount}
          error={state.fieldErrors?.amount}
        />
        <div>
          <label htmlFor="field-method" className="field-label">How</label>
          <select id="field-method" name="method" defaultValue="CASH" className="field-control">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
            ))}
          </select>
        </div>
        <Field
          label="Reference (optional)"
          name="reference"
          placeholder="UPI or card machine reference"
          defaultValue={state.values?.reference}
          error={state.fieldErrors?.reference}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? 'Recording…' : 'Record payment'}</Button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-[15px] text-muted underline underline-offset-4">
          Cancel
        </button>
      </div>
    </form>
  )
}
