'use client'

import { useRef, useState, useTransition } from 'react'
import { Camera, Loader2, Lock, Upload } from 'lucide-react'
import { requestUploadAction, confirmUploadAction } from '@/app/actions/media'
import { ACCEPT_ATTRIBUTE, describeLimits, kindForType } from '@/server/modules/media/limits'
import { Card } from '@/components/layout'

type Pending = { name: string; progress: number }

/**
 * Photographs go straight from the phone to the bucket using a signed URL, so a long
 * video never travels through the application server.
 */
export function MediaCapture({
  bookingId,
  phaseLabel,
  storageReady,
}: {
  bookingId: string
  phaseLabel: string
  storageReady: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (!storageReady) {
    return (
      <p className="rounded-lg border border-line bg-fill px-4 py-3 text-[15px] text-muted">
        Photo and video capture is not set up yet. Add the storage settings and it will
        appear here.
      </p>
    )
  }

  const upload = async (file: File) => {
    setError(null)

    if (!kindForType(file.type)) {
      setError('Only photographs and video can be attached.')
      return
    }

    setPending({ name: file.name, progress: 0 })

    const target = await requestUploadAction(bookingId, {
      contentType: file.type,
      sizeBytes: file.size,
    })
    if (!target.ok) {
      setError(target.error)
      setPending(null)
      return
    }

    try {
      // XHR rather than fetch, because it reports progress and a 100 MB video over a
      // phone connection needs to show something happening.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', target.uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setPending({ name: file.name, progress: Math.round((e.loaded / e.total) * 100) })
          }
        }
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (${xhr.status})`))
        xhr.onerror = () => reject(new Error('Upload failed'))
        xhr.send(file)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setPending(null)
      return
    }

    const confirmed = await confirmUploadAction(bookingId, {
      storageKey: target.storageKey,
      contentType: file.type,
      sizeBytes: file.size,
      originalName: file.name,
    })

    setPending(null)
    if (!confirmed.ok) setError(confirmed.error ?? 'Could not record that file')
    else startTransition(() => {})
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="sr-only"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          for (const file of files) await upload(file)
        }}
      />

      {error ? (
        <p role="alert" className="mb-3 rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {pending ? (
        <div className="mb-3 rounded-lg border border-line bg-fill px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-ink">
            <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden="true" />
            Uploading {pending.name}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill-strong">
            <div className="h-full rounded-full bg-plate transition-all" style={{ width: `${pending.progress}%` }} />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={Boolean(pending)}
        className="btn-quiet py-2 disabled:opacity-60"
      >
        <Camera className="size-4" strokeWidth={1.75} aria-hidden="true" />
        Add photos or video
      </button>

      <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>
          Attached to the {phaseLabel} and locked once saved — it cannot be changed or
          removed afterwards. {describeLimits()}
        </span>
      </p>
    </div>
  )
}

export function MediaCaptureCard(props: Parameters<typeof MediaCapture>[0]) {
  return (
    <Card
      title="Condition record"
      description="Photograph the vehicle so damage can be settled later."
      icon={<Upload className="size-[18px]" strokeWidth={1.75} />}
    >
      <div className="px-5 py-5">
        <MediaCapture {...props} />
      </div>
    </Card>
  )
}
