import 'server-only'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Object storage for hand-over media, on Cloudflare R2 (S3-compatible).
 *
 * Files move between the browser and the bucket directly using signed URLs, so a
 * hundred-megabyte video never passes through the application server.
 */
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const BUCKET = process.env.R2_BUCKET

/** The feature stays out of the way rather than erroring when storage is not set up. */
export function storageConfigured(): boolean {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET)
}

export class StorageNotConfigured extends Error {
  constructor() {
    super(
      'File storage is not set up. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
        'R2_SECRET_ACCESS_KEY and R2_BUCKET.',
    )
  }
}

let client: S3Client | undefined

function s3(): S3Client {
  if (!storageConfigured()) throw new StorageNotConfigured()
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! },
    // The SDK otherwise adds a CRC32 checksum to PutObject. When the request is
    // presigned rather than sent, it bakes in the checksum of an empty body, and the
    // browser then uploads the real file -- so the checksum never matches and the
    // upload is rejected. Only compute checksums where the protocol demands them.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return client
}

/** A short-lived URL the browser can PUT the file to. */
export async function signUpload(key: string, contentType: string, expiresIn = 600) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: BUCKET!, Key: key, ContentType: contentType }),
    { expiresIn },
  )
}

/**
 * A short-lived URL for viewing. The bucket stays private; nothing is served by a
 * guessable public address, because these are pictures of customers' rentals.
 */
export async function signDownload(key: string, expiresIn = 900) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET!, Key: key }), { expiresIn })
}

/** Only used to tidy up an object whose database row was never written. */
export async function removeObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: key }))
}
