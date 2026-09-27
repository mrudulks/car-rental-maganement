import type { ReactNode } from 'react'

/**
 * Page header: title, a line of context, and whatever the main action is.
 * Every screen uses it, so the eye lands in the same place on each one.
 */
export function PageHeader({
  title,
  meta,
  action,
}: {
  title: string
  meta?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-ink">{title}</h1>
        {meta ? <p className="mt-1 text-[15px] text-muted">{meta}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** A bordered panel with a real heading, used to group a form or a list. */
export function Card({
  title,
  description,
  icon,
  aside,
  children,
  className = '',
  ...rest
}: {
  title?: string
  description?: string
  icon?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
} & Record<`data-${string}`, string | undefined>) {
  return (
    <section {...rest} className={`rounded-xl border border-line bg-paper ${className}`}>
      {title ? (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex items-start gap-2.5">
            {icon ? <span className="mt-0.5 text-muted">{icon}</span> : null}
            <div>
              <h2 className="font-semibold tracking-tight text-ink">{title}</h2>
              {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
            </div>
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

/**
 * The shell every data table shares: its own scroll box on narrow screens, a filled
 * header row, and a minimum width so columns stay readable instead of collapsing.
 */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-x-auto rounded-xl border border-line bg-paper">
      <table className="w-full min-w-[46rem] text-left text-[15px]">{children}</table>
    </div>
  )
}

export function Th({
  children,
  align = 'left',
}: {
  children: ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      scope="col"
      className={`bg-fill px-4 py-2.5 text-[13px] font-medium text-muted ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  )
}

/** Rows get a hover fill so the eye can track across a wide table. */
export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-t border-line transition-colors hover:bg-fill/70">{children}</tr>
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-paper px-6 py-14 text-center">
      {icon ? (
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-fill text-muted">
          {icon}
        </div>
      ) : null}
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
