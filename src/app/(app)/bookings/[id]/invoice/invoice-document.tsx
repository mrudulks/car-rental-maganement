'use client'

import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import type { InvoiceDTO } from '@/server/modules/billing/invoice'
import { formatMoney } from '@/components/ui'

/**
 * The document the customer is handed. `print:` utilities strip the application
 * furniture so the browser's own print dialog produces a clean PDF -- no extra
 * dependency, and the customer gets a real file they can keep.
 */
export function InvoiceDocument({
  invoice,
  bookingNumber,
  bookingId,
  vehicle,
  paid,
  balance,
}: {
  invoice: InvoiceDTO
  bookingNumber: string
  bookingId: string
  vehicle: string
  paid: string
  balance: string
}) {
  const half = Number(invoice.gstRate) / 2

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/bookings/${bookingId}`}
          className="inline-flex items-center gap-2 text-[15px] text-muted underline underline-offset-4"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {bookingNumber}
        </Link>
        <button type="button" onClick={() => window.print()} className="btn-primary">
          <Printer className="size-4" strokeWidth={2} aria-hidden="true" />
          Print or save as PDF
        </button>
      </div>

      <article className="mt-6 rounded-xl border border-line bg-paper p-8 print:mt-0 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{invoice.supplierName}</h1>
            {invoice.supplierAddress ? (
              <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted">
                {invoice.supplierAddress}
              </p>
            ) : null}
            {invoice.supplierGstin ? (
              <p className="mt-2 text-sm text-ink">
                GSTIN <span className="font-plate">{invoice.supplierGstin}</span>
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <h2 className="text-sm font-semibold text-muted">Tax invoice</h2>
            <p className="mt-1 font-plate text-lg font-semibold text-ink">{invoice.invoiceNumber}</p>
            <p className="mt-1 text-sm text-muted">
              {invoice.issuedAt.toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
        </header>

        <section className="grid gap-6 border-b border-line py-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-muted">Billed to</h3>
            <p className="mt-1 font-medium text-ink">{invoice.customerName}</p>
            <p className="text-sm text-muted">{invoice.customerPhone}</p>
            {invoice.customerAddress ? (
              <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted">
                {invoice.customerAddress}
              </p>
            ) : null}
          </div>
          <div className="sm:text-right">
            <h3 className="text-sm font-semibold text-muted">Rental</h3>
            <p className="mt-1 text-ink">{vehicle}</p>
            <p className="text-sm text-muted">Booking {bookingNumber}</p>
            {invoice.placeOfSupply ? (
              <p className="mt-1 text-sm text-muted">
                Place of supply: {invoice.placeOfSupply}
                {invoice.supplierStateCode ? ` (${invoice.supplierStateCode})` : ''}
              </p>
            ) : null}
          </div>
        </section>

        <div className="relative overflow-x-auto py-2 print:overflow-visible">
          <table className="w-full min-w-[34rem] text-left text-[15px] print:min-w-0">
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Description</th>
                <th scope="col" className="px-2 py-2 font-medium">SAC</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Qty</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Rate</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Taxable</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">CGST</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">SGST</th>
                <th scope="col" className="py-2 pl-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id} className="border-b border-line/70">
                  <td className="py-2.5 pr-3">{line.description}</td>
                  <td className="px-2 py-2.5 font-plate text-sm text-muted">{line.sacCode ?? '—'}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{Number(line.quantity)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatMoney(line.unitAmount)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatMoney(line.taxableValue)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted">{formatMoney(line.cgstAmount)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted">{formatMoney(line.sgstAmount)}</td>
                  <td className="py-2.5 pl-2 text-right tabular-nums">{formatMoney(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5 text-[15px]">
            <Row label="Taxable value" value={invoice.taxableTotal} />
            {Number(invoice.nonTaxableTotal) > 0 ? (
              <Row label="Not taxable" value={invoice.nonTaxableTotal} />
            ) : null}
            <Row label={`CGST (${half}%)`} value={invoice.cgstTotal} />
            <Row label={`SGST (${half}%)`} value={invoice.sgstTotal} />
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(invoice.grandTotal)}</dd>
            </div>
            <Row label="Paid" value={paid} />
            <div className="flex justify-between border-t border-line pt-2 font-semibold">
              <dt>{Number(balance) > 0 ? 'Balance due' : 'Settled'}</dt>
              <dd className="tabular-nums">{formatMoney(balance)}</dd>
            </div>
          </dl>
        </section>

        <footer className="mt-8 border-t border-line pt-4 text-sm text-muted">
          <p>
            This is a computer-generated tax invoice and needs no signature.
            {invoice.issuedBy ? ` Issued by ${invoice.issuedBy}.` : ''}
          </p>
        </footer>
      </article>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{formatMoney(value)}</dd>
    </div>
  )
}
