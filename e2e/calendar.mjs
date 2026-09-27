/**
 * The fleet timeline and workshop scheduling.
 *   node e2e/calendar.mjs [screenshotDir] [baseUrl]
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
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

const pad = (n) => String(n).padStart(2, '0')
const local = (daysAhead, hour) => {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(hour, 0, 0, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const owner = await signIn('owner@sunrise.test')
await owner.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })

check('the calendar lists the fleet', await owner.locator('text=Maruti Swift').first().isVisible(), true)
check('seeded rentals appear as bars', (await owner.locator('a[href^="/bookings/"]').count()) > 0, true)
check('it defaults to a fortnight', (await text(owner)).includes('14 days'), true)
await shot(owner, '97-calendar')

// Span and navigation.
await owner.click('a:has-text("30 days")')
await owner.waitForURL('**/calendar?**days=30**', { timeout: 30000 })
check('the span can be widened', new URL(owner.url()).searchParams.get('days'), '30')
await owner.click('a:has-text("Later")')
await owner.waitForLoadState('networkidle')
check('it pages forward', Boolean(new URL(owner.url()).searchParams.get('from')), true)

// Book the workshop.
await owner.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
await owner.click('button:has-text("Book the workshop")')
// Read the chosen vehicle before submitting: the form closes on success.
const vehicleLabel = await owner.locator('select#field-vehicleId option').first().textContent()
const plate = (vehicleLabel ?? '').split(' · ')[0]
await owner.fill('#field-reason', 'Clutch replacement')
await owner.fill('#field-startAt', local(3, 9))
await owner.fill('#field-endAt', local(5, 18))
await owner.click('button:has-text("Book it in")')
await owner.getByText('Clutch replacement').first().waitFor({ state: 'visible', timeout: 30000 })
check('a workshop slot appears on the timeline',
  await owner.getByText('Clutch replacement').first().isVisible(), true)
await shot(owner, '98-calendar-service')
await owner.goto(`${BASE}/bookings/new?startAt=${local(3, 10)}&endAt=${local(4, 18)}`, { waitUntil: 'networkidle' })
const offered = await text(owner)
check('a vehicle in the workshop is not offered', offered.includes(plate), false)

// Overlapping workshop slots are refused.
await owner.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
await owner.click('button:has-text("Book the workshop")')
await owner.fill('#field-reason', 'Second job')
await owner.fill('#field-startAt', local(4, 9))
await owner.fill('#field-endAt', local(6, 18))
await owner.click('button:has-text("Book it in")')
const clash = owner.getByText(/already booked into the workshop/i)
await clash.waitFor({ state: 'visible', timeout: 30000 })
check('an overlapping workshop slot is refused', await clash.isVisible(), true)

// A slot over an existing rental is refused too.
await owner.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
await owner.click('button:has-text("Book the workshop")')
const options = await owner.locator('select#field-vehicleId option').allTextContents()
const innova = options.findIndex((o) => o.includes('Innova'))
if (innova >= 0) {
  await owner.selectOption('#field-vehicleId', { index: innova })
  await owner.fill('#field-reason', 'Service while rented')
  await owner.fill('#field-startAt', local(-2, 9))
  await owner.fill('#field-endAt', local(1, 18))
  await owner.click('button:has-text("Book it in")')
  const busy = owner.getByText(/has this vehicle/i)
  await busy.waitFor({ state: 'visible', timeout: 30000 })
  check('the workshop cannot take a vehicle that is rented', await busy.isVisible(), true)
}

// --- Staff and other tenants ---------------------------------------------
const staff = await signIn('staff@sunrise-car-rentals.test')
await staff.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
check('staff can plan too', await staff.locator('button:has-text("Book the workshop")').isVisible(), true)

const rival = await signIn('owner@deccan.test')
await rival.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
const rivalText = await text(rival)
check('a rival sees only their own fleet', rivalText.includes('Maruti Swift'), false)
check('and none of our workshop slots', rivalText.includes('Clutch replacement'), false)

const BENIGN = [
  /Failed to load resource: the server responded with a status of 404/,
  /Failed to execute 'measure' on 'Performance'/,
]
const bad = errors.filter((e) => !BENIGN.some((b) => b.test(e)))
console.log(bad.length ? `\nCONSOLE ERRORS:\n${bad.join('\n')}` : '\nno console errors')
if (bad.length) process.exitCode = 1
await browser.close()
