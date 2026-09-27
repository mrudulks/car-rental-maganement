/**
 * What may be uploaded. Shared by the browser and the server: the browser checks to
 * give an immediate answer, the server checks because the browser cannot be trusted.
 */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024
export const MAX_FILES_PER_PHASE = 12

export type MediaKindKey = 'IMAGE' | 'VIDEO'

export function kindForType(contentType: string): MediaKindKey | null {
  if ((IMAGE_TYPES as readonly string[]).includes(contentType)) return 'IMAGE'
  if ((VIDEO_TYPES as readonly string[]).includes(contentType)) return 'VIDEO'
  return null
}

export function maxBytesFor(kind: MediaKindKey): number {
  return kind === 'VIDEO' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
}

export function describeLimits(): string {
  return `Photos up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB, video up to ${
    MAX_VIDEO_BYTES / 1024 / 1024
  } MB, ${MAX_FILES_PER_PHASE} files each side.`
}

export const ACCEPT_ATTRIBUTE = [...IMAGE_TYPES, ...VIDEO_TYPES].join(',')
