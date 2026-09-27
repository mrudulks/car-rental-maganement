'use client'

import { useState } from 'react'
import { FileVideo, ImageIcon, Lock } from 'lucide-react'
import type { MediaDTO } from '@/server/modules/media/service'
import { viewMediaAction } from '@/app/actions/media'
import { Card } from '@/components/layout'

const PHASE_LABELS = { CHECK_OUT: 'At hand-over', CHECK_IN: 'On return' } as const

/**
 * Files open through a short-lived signed link fetched on demand, so nothing here is
 * reachable by a guessable address and the links in the page cannot be shared onwards.
 */
export function MediaGallery({ media }: { media: MediaDTO[] }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (media.length === 0) return null

  const open = async (id: string) => {
    setError(null)
    setBusy(id)
    const result = await viewMediaAction(id)
    setBusy(null)
    if (result.error) setError(result.error)
    else if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  const groups = (['CHECK_OUT', 'CHECK_IN'] as const)
    .map((phase) => ({ phase, items: media.filter((m) => m.phase === phase) }))
    .filter((g) => g.items.length > 0)

  return (
    <Card
      title="Condition record"
      description="Locked when it was taken and kept as it was."
      icon={<Lock className="size-[18px]" strokeWidth={1.75} />}
      className="mt-6"
    >
      {error ? (
        <p role="alert" className="border-b border-line px-5 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="space-y-5 px-5 py-5">
        {groups.map((group) => (
          <div key={group.phase}>
            <h3 className="text-sm font-semibold text-muted">
              {PHASE_LABELS[group.phase]} · {group.items.length}
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => open(item.id)}
                    disabled={busy === item.id}
                    className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm hover:bg-fill disabled:opacity-60"
                  >
                    {item.kind === 'VIDEO' ? (
                      <FileVideo className="size-4 text-muted" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <ImageIcon className="size-4 text-muted" strokeWidth={1.75} aria-hidden="true" />
                    )}
                    <span className="max-w-40 truncate">{item.originalName ?? item.kind}</span>
                    <span className="text-muted">{Math.max(1, Math.round(item.sizeBytes / 1024))} KB</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}
