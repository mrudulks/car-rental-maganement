import 'server-only'
import { randomUUID } from 'node:crypto'
import type { HandoverPhase, MediaKind } from '@/generated/prisma/enums'
import type { AuthContext } from '@/server/auth/dal'
import { assertCan } from '@/server/auth/permissions'
import { signUpload, signDownload, storageConfigured } from '@/server/storage/r2'
import { kindForType, maxBytesFor, MAX_FILES_PER_PHASE } from './limits'

export class MediaError extends Error {}

export type MediaDTO = {
  id: string
  phase: HandoverPhase
  kind: MediaKind
  contentType: string
  sizeBytes: number
  originalName: string | null
  caption: string | null
  createdAt: Date
  uploadedBy: string | null
}

const SELECT = {
  id: true,
  phase: true,
  kind: true,
  contentType: true,
  sizeBytes: true,
  originalName: true,
  caption: true,
  createdAt: true,
  uploadedByUser: { select: { name: true } },
} as const

export { storageConfigured }

/**
 * Which phase, if any, is still open for this booking.
 *
 * The record is only worth anything if it was taken at the moment it claims to be, so
 * a phase closes as soon as it is done: once the keys are handed over, nothing more can
 * be added to the hand-over set, and once the vehicle is back, nothing more at all.
 */
export function openPhase(status: string): HandoverPhase | null {
  if (status === 'RESERVED') return 'CHECK_OUT'
  if (status === 'ACTIVE') return 'CHECK_IN'
  return null
}

export async function listMedia(auth: AuthContext, bookingId: string): Promise<MediaDTO[]> {
  assertCan(auth.user.role, 'booking:read')
  const rows = await auth.db.handoverMedia.findMany({
    where: { bookingId },
    select: SELECT,
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(({ uploadedByUser, ...m }) => ({ ...m, uploadedBy: uploadedByUser?.name ?? null }))
}

/** A short-lived link for viewing one file. The bucket itself stays private. */
export async function getViewUrl(auth: AuthContext, mediaId: string): Promise<string> {
  assertCan(auth.user.role, 'booking:read')
  const media = await auth.db.handoverMedia.findUnique({
    where: { id: mediaId },
    select: { storageKey: true },
  })
  if (!media) throw new MediaError('That file is not on this booking')
  return signDownload(media.storageKey)
}

export type UploadTarget = { uploadUrl: string; storageKey: string }

/**
 * Agree an upload before it happens: check the caller may write to this booking, that
 * the phase is still open, and that the file is a kind and size we accept. The browser
 * then sends the bytes straight to the bucket.
 */
export async function createUploadTarget(
  auth: AuthContext,
  bookingId: string,
  file: { contentType: string; sizeBytes: number },
): Promise<UploadTarget> {
  assertCan(auth.user.role, 'booking:write')

  const booking = await auth.db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true },
  })
  if (!booking) throw new MediaError('That booking is no longer on your list')

  const phase = openPhase(booking.status)
  if (!phase) {
    throw new MediaError(
      'This rental is closed, so nothing further can be attached to it.',
    )
  }

  const kind = kindForType(file.contentType)
  if (!kind) {
    throw new MediaError('Only photographs and video can be attached.')
  }

  const limit = maxBytesFor(kind)
  if (file.sizeBytes <= 0 || file.sizeBytes > limit) {
    throw new MediaError(
      `That file is too large. The limit is ${Math.floor(limit / 1024 / 1024)} MB.`,
    )
  }

  const already = await auth.db.handoverMedia.count({ where: { bookingId, phase } })
  if (already >= MAX_FILES_PER_PHASE) {
    throw new MediaError(`Up to ${MAX_FILES_PER_PHASE} files can be attached to each side.`)
  }

  // Checked last, so a file that would be refused anyway is reported as such rather
  // than hidden behind a configuration message.
  if (!storageConfigured()) {
    throw new MediaError('File storage is not set up, so media cannot be attached yet.')
  }

  const storageKey = `${auth.organization.id}/${bookingId}/${phase.toLowerCase()}/${randomUUID()}`
  const uploadUrl = await signUpload(storageKey, file.contentType)

  return { uploadUrl, storageKey }
}

/** Record the file once the browser says the bytes are in the bucket. */
export async function confirmUpload(
  auth: AuthContext,
  bookingId: string,
  input: {
    storageKey: string
    contentType: string
    sizeBytes: number
    originalName?: string | null
    caption?: string | null
  },
): Promise<MediaDTO> {
  assertCan(auth.user.role, 'booking:write')

  const booking = await auth.db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true },
  })
  if (!booking) throw new MediaError('That booking is no longer on your list')

  const phase = openPhase(booking.status)
  if (!phase) throw new MediaError('This rental is closed, so nothing further can be attached.')

  const kind = kindForType(input.contentType)
  if (!kind) throw new MediaError('Only photographs and video can be attached.')

  // The key was minted for this organization and booking; anything else means the
  // client sent back something it was not given.
  const expectedPrefix = `${auth.organization.id}/${bookingId}/${phase.toLowerCase()}/`
  if (!input.storageKey.startsWith(expectedPrefix)) {
    throw new MediaError('That upload does not belong to this booking.')
  }

  const row = await auth.db.handoverMedia.create({
    data: {
      organizationId: auth.organization.id,
      bookingId,
      phase,
      kind,
      storageKey: input.storageKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      originalName: input.originalName ?? null,
      caption: input.caption ?? null,
      uploadedByUserId: auth.user.id,
    },
    select: SELECT,
  })

  const { uploadedByUser, ...media } = row
  return { ...media, uploadedBy: uploadedByUser?.name ?? null }
}
