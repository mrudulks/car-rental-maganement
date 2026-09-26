/**
 * Customers screen, end to end.
 *   node e2e/customers.mjs [screenshotDir] [baseUrl]
 * Expects `npm run seed` to have been run.
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#field-email', email)
  await page.fill('#field-password', password)
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 30000 })
  return page
}

const shot = (page, name) => (OUT ? page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }) : null)
const text = (page) => page.evaluate(() => document.body.innerText)

const owner = await signIn('owner@sunrise.test')

await owner.goto(`${BASE}/customers`, { waitUntil: 'networkidle' })
check('the seeded customers are listed', await owner.locator('tbody tr').count(), 3)
check('Customers is marked as the current page',
  await owner.locator('nav[aria-label=Main] a[aria-current=page]').innerText(), 'Customers')
await shot(owner, '50-customers')

// Search by name and by phone.
await owner.goto(`${BASE}/customers?q=priya`, { waitUntil: 'networkidle' })
check('search finds a customer by name', await owner.locator('tbody tr').count(), 1)
await owner.goto(`${BASE}/customers?q=44556`, { waitUntil: 'networkidle' })
check('search finds a customer by phone', await owner.locator('tbody tr').count(), 1)
await owner.goto(`${BASE}/customers?q=zzzz`, { waitUntil: 'networkidle' })
check('an unmatched search says so', (await text(owner)).includes('No customers match'), true)

// Rental history.
await owner.goto(`${BASE}/customers?q=priya`, { waitUntil: 'networkidle' })
await owner.click('tbody a')
await owner.waitForURL(/\/customers\/[a-z0-9]+$/, { timeout: 30000 })
const detail = await text(owner)
check('the customer page shows their rental history', /Rental history/.test(detail), true)
check('a live rental is flagged', detail.includes('Has a vehicle out'), true)
check('the history lists a booking', await owner.locator('tbody tr').count() >= 1, true)
await shot(owner, '51-customer-detail')

// Editing, and the phone-number clash.
const customerUrl = owner.url()
await owner.fill('#field-licenceNumber', 'MH14 20180009999')
// Wait for the server action's round-trip, not for the page to look idle: the click
// returns before the action has run, and networkidle can resolve in that gap.
await Promise.all([
  owner.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/customers/'),
    { timeout: 30000 },
  ),
  owner.click('button:has-text("Save changes")'),
])
await owner.goto(customerUrl, { waitUntil: 'networkidle' })
check('the edit saved', await owner.inputValue('#field-licenceNumber'), 'MH14 20180009999')

await owner.fill('#field-phone', '+91 98200 11223') // Nikhil Rao's number from the seed
await owner.click('button:has-text("Save changes")')
const clash = owner.getByText(/already uses that phone number/i)
await clash.waitFor({ state: 'visible', timeout: 30000 })
check('a phone number in use by someone else is refused', await clash.isVisible(), true)

// Tenant isolation.
const rival = await signIn('owner@deccan.test')
await rival.goto(customerUrl, { waitUntil: 'networkidle' })
const rivalBody = await text(rival)
check('another tenant customer is not found', /not found/i.test(rivalBody), true)
check('the name does not leak', rivalBody.includes('Priya Desai'), false)
check('the in-app 404 keeps the navigation',
  await rival.locator('nav[aria-label=Main]').isVisible(), true)

// A URL matching no route at all still looks like the product.
await rival.goto(`${BASE}/nowhere-at-all`, { waitUntil: 'networkidle' })
check('an unknown address gets a real page', (await text(rival)).includes('There is nothing at that address'), true)

const BENIGN = [
  /Failed to load resource: the server responded with a status of 404/,
  /Failed to execute 'measure' on 'Performance'/,
]
const bad = errors.filter((e) => !BENIGN.some((b) => b.test(e)))
console.log(bad.length ? `\nCONSOLE ERRORS:\n${bad.join('\n')}` : '\nno console errors')
if (bad.length) process.exitCode = 1
await browser.close()
