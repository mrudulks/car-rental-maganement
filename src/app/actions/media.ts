'use server'

import { refresh } from 'next/cache'
import { requireAuth } from '@/server/auth/dal'
import { ForbiddenError } from '@/server/auth/permissions'
import {
  createUploadTarget,
  confirmUpload,
  getViewUrl,
  MediaError,
} from '@/server/modules/media/service'

export type UploadTargetResult =
  | { ok: true; uploadUrl: string; storageKey: string }
  | { ok: false; error: string }

export async function requestUploadAction(
  bookingId: string,
  file: { contentType: string; sizeBytes: number },
): Promise<UploadTargetResult> {
  const auth = await requireAuth()
  try {
    const target = await createUploadTarget(auth, bookingId, file)
    return { ok: true, ...target }
  } catch (error) {
    if (error instanceof MediaError) return { ok: false, error: error.message }
    if (error instanceof ForbiddenError) {
      return { ok: false, error: 'Your role does not allow attaching media.' }
    }
    throw error
  }
}

export async function confirmUploadAction(
  bookingId: string,
  input: {
    storageKey: string
    contentType: string
    sizeBytes: number
    originalName?: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuth()
  try {
    await confirmUpload(auth, bookingId, input)
  } catch (error) {
    if (error instanceof MediaError) return { ok: false, error: error.message }
    if (error instanceof ForbiddenError) {
      return { ok: false, error: 'Your role does not allow attaching media.' }
    }
    throw error
  }
  refresh()
  return { ok: true }
}

export async function viewMediaAction(mediaId: string): Promise<{ url?: string; error?: string }> {
  const auth = await requireAuth()
  try {
    return { url: await getViewUrl(auth, mediaId) }
  } catch (error) {
    if (error instanceof MediaError) return { error: error.message }
    if (error instanceof ForbiddenError) return { error: 'Your role does not allow that.' }
    throw error
  }
}
