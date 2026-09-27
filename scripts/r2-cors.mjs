/**
 * Apply the CORS policy the browser needs to upload straight to R2.
 *
 * Files go from the phone to the bucket without passing through the server, which means
 * the browser makes a cross-origin PUT. Without this policy it refuses to send, and the
 * upload fails with an opaque network error that looks like a bad signature.
 *
 *   node scripts/r2-cors.mjs                        # localhost only
 *   node scripts/r2-cors.mjs https://your.app.url   # plus a deployed origin
 */
import 'dotenv/config'
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET first.')
  process.exit(1)
}

// Local development ports, plus anything passed on the command line.
const origins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3006',
  ...process.argv.slice(2),
]

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

await s3.send(
  new PutBucketCorsCommand({
    Bucket: R2_BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          // PUT to upload; GET so a signed view link can be fetched by the page.
          AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedHeaders: ['content-type'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
)

const applied = await s3.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }))
console.log('CORS applied to', R2_BUCKET)
for (const rule of applied.CORSRules ?? []) {
  console.log('  origins:', rule.AllowedOrigins?.join(', '))
  console.log('  methods:', rule.AllowedMethods?.join(', '))
}
