'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Receipt } from 'lucide-react'
import { issueInvoiceAction } from '@/app/actions/billing'

export function InvoiceActions({
  bookingId,
  hasInvoice,
  invoiceNumber,
  canIssue,
}: {
  bookingId: string
  hasInvoice: boolean
  invoiceNumber: string | null
  canIssue: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (hasInvoice) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/bookings/${bookingId}/invoice`} className="btn-primary">
          <FileText className="size-4" strokeWidth={2} aria-hidden="true" />
          Open invoice {invoiceNumber}
        </Link>
      </div>
    )
  }

  if (!canIssue) return null

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await issueInvoiceAction(bookingId)
            if (r.error) setError(r.error)
            else router.push(`/bookings/${bookingId}/invoice`)
          })
        }
        className="btn-primary"
      >
        <Receipt className="size-4" strokeWidth={2} aria-hidden="true" />
        {pending ? 'Issuing…' : 'Issue invoice'}
      </button>
    </div>
  )
}
