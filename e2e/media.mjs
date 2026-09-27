/**
 * Hand-over media: the capture UI, and that the record cannot be tampered with.
 *   node e2e/media.mjs [screenshotDir] [baseUrl]
 */
import { chromium } from '@playwright/test'

const OUT = process.argv[2] ?? null
const BASE = process.argv[3] ?? 'http://localhost:3000'
const browser = await chromium.launch()
const errors = []

const check = (label, actual, expected) => {
  const ok = actual === expected
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
  if (!ok) process.exitCode = 1
}

async function signIn(email, password = 'password123') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#field-email', email)
  await page.fill('#field-password', password)
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 30000 })
  return page
}

const shot = (p, n) => (OUT ? p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }) : null)
const text = (p) => p.evaluate(() => document.body.innerText)
const DETAIL = /\/bookings\/(?!new(?:$|\?))[a-z0-9]+$/

const owner = await signIn('owner@sunrise.test')

// BK-2000 is reserved in the seed, so the hand-over side is open.
await owner.goto(`${BASE}/bookings?q=BK-2000`, { waitUntil: 'networkidle' })
await owner.click('tbody a')
await owner.waitForURL(DETAIL, { timeout: 30000 })
await owner.click('a:has-text("Hand over keys")')
await owner.waitForURL('**/check-out', { timeout: 30000 })

const body = await text(owner)
check('the condition record appears at hand-over', body.includes('Condition record'), true)
await shot(owner, '99-media-capture')

// The page must work either way: with storage set up it offers uploads, and without it
// says so plainly instead of breaking.
const configured = !body.includes('not set up yet')
console.log(`      (storage ${configured ? 'configured' : 'not configured'} in this run)`)

if (configured) {
  check('the upload control is offered',
    await owner.locator('button:has-text("Add photos or video")').isVisible(), true)
  check('it says the record is locked once saved', /locked once saved/i.test(body), true)
  check('it states the size limits', /MB/.test(body), true)
} else {
  check('unconfigured storage explains itself instead of erroring',
    body.includes('Photo and video capture is not set up yet'), true)
  check('and no upload button is offered',
    await owner.locator('button:has-text("Add photos or video")').count(), 0)
}

// The return side must not be open before the keys go out.
await owner.goto(`${BASE}${new URL(owner.url()).pathname.replace('/check-out', '')}/check-in`, {
  waitUntil: 'networkidle',
})
check('the return side is closed before hand-over',
  new URL(owner.url()).pathname.endsWith('/check-in'), false)

// --- Tenant isolation on the capture pages --------------------------------
const bookingPath = new URL(owner.url()).pathname
const rival = await signIn('owner@deccan.test')
await rival.goto(`${BASE}${bookingPath}/check-out`, { waitUntil: 'networkidle' })
check('another tenant cannot reach the capture page',
  /not found/i.test(await text(rival)), true)

// --- A real upload, when storage is configured ---------------------------
// Only meaningful with real credentials; skipped otherwise so the suite still runs.
if (configured && process.env.MEDIA_UPLOAD_FILE) {
  await owner.goto(`${BASE}${bookingPath}/check-out`, { waitUntil: 'networkidle' })
  await owner.setInputFiles('input[type=file]', process.env.MEDIA_UPLOAD_FILE)

  // Wait for the gallery specifically. The progress panel shows the same file name
  // while the upload is in flight, so "the name is on the page" stays true even when
  // the upload then fails -- which is how a broken upload once looked like a pass.
  const gallery = owner.locator('[data-testid=media-gallery]')
  let landed = true
  try {
    await gallery.waitFor({ state: 'visible', timeout: 60000 })
  } catch {
    landed = false
  }
  check('a real file reaches the gallery', landed, true)
  if (!landed) {
    console.log('      alerts:', JSON.stringify(await owner.locator('[role=alert]').allTextContents()))
  }
}

const BENIGN = [
  /Failed to load resource: the server responded with a status of 404/,
  /Failed to execute 'measure' on 'Performance'/,
]
const bad = errors.filter((e) => !BENIGN.some((b) => b.test(e)))
console.log(bad.length ? `\nCONSOLE ERRORS:\n${bad.join('\n')}` : '\nno console errors')
if (bad.length) process.exitCode = 1
await browser.close()
