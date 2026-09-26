import type { ComponentProps, ReactNode } from 'react'

/** A registration number, set like the plate it is printed on. */
export function Plate({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <span
      className={[
        'inline-block whitespace-nowrap rounded-[3px] border px-1.5 py-0.5 font-plate text-[13px] font-semibold tracking-wide',
        tone === 'dark'
          ? 'border-plate-dark/60 bg-plate text-ink'
          : 'border-line bg-wash text-ink',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

// The same status has to stay legible on paper and on the ink panel, so each one
// carries a light-surface and a dark-surface treatment rather than being tinted once.
const STATUS_STYLES = {
  light: {
    AVAILABLE: 'text-available bg-available/10 border-available/25',
    RENTED: 'text-rented bg-rented/10 border-rented/25',
    MAINTENANCE: 'text-maintenance bg-maintenance/10 border-maintenance/25',
    RETIRED: 'text-muted bg-muted/10 border-muted/25',
  },
  dark: {
    AVAILABLE: 'text-[#6fd6ab] bg-[#6fd6ab]/12 border-[#6fd6ab]/30',
    RENTED: 'text-[#f5a56d] bg-[#f5a56d]/12 border-[#f5a56d]/30',
    MAINTENANCE: 'text-[#e8cb70] bg-[#e8cb70]/12 border-[#e8cb70]/30',
    RETIRED: 'text-paper/60 bg-paper/10 border-paper/20',
  },
} as const

const STATUS_LABELS = {
  AVAILABLE: 'Available',
  RENTED: 'On rent',
  MAINTENANCE: 'In service',
  RETIRED: 'Retired',
} as const

export type VehicleStatusKey = keyof typeof STATUS_LABELS

export function StatusPill({
  status,
  tone = 'light',
}: {
  status: VehicleStatusKey
  tone?: 'light' | 'dark'
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[tone][status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

export function Field({
  label,
  name,
  error,
  hint,
  ...props
}: ComponentProps<'input'> & { label: string; name: string; error?: string; hint?: string }) {
  const id = `field-${name}`
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        {...props}
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded-md border bg-paper px-3 py-2 text-[15px] text-ink placeholder:text-muted/70 ${
          error ? 'border-danger' : 'border-line'
        }`}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'quiet' }) {
  const base =
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'
  const styles =
    variant === 'primary'
      ? 'bg-plate text-ink hover:bg-plate-dark'
      : 'border border-line bg-paper text-ink hover:bg-wash'

  return (
    <button {...props} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  )
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  )
}

/** Money as a rental desk in India would write it: ₹1,500.00. */
export function formatMoney(value: string | number) {
  return `₹${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
