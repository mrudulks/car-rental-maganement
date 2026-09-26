/**
 * Booking flow, end to end.
 *   node e2e/bookings.mjs [screenshotDir] [baseUrl]
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

/** A booking's own page: /bookings/<id>, never /bookings/new. */
const BOOKING_DETAIL = /\/bookings\/(?!new(?:$|\?))[a-z0-9]+$/

// A window far enough ahead that the seeded rentals do not clash.
const pad = (n) => String(n).padStart(2, '0')
const local = (daysAhead, hour) => {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(hour, 0, 0, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const START = local(40, 10)
const END = local(43, 18)

const owner = await signIn('owner@sunrise.test')

// The seed leaves two rentals out and two reservations.
await owner.goto(`${BASE}/bookings`, { waitUntil: 'networkidle' })
check('bookings list shows the seeded bookings', await owner.locator('tbody tr').count(), 4)
await shot(owner, '20-bookings-list')

// Availability for a free window.
await owner.goto(`${BASE}/bookings/new?startAt=${START}&endAt=${END}`, { waitUntil: 'networkidle' })
// Six vehicles are seeded; one is in service, so five are bookable.
const available = await owner.locator('input[name=vehicleId]').count()
check('the five roadworthy vehicles are free for a distant window', available, 5)
await shot(owner, '21-booking-new')

// Reserve one.
await owner.locator('input[name=vehicleId]').first().check()
await owner.fill('#field-customerName', 'Meera Joshi')
await owner.fill('#field-customerPhone', '+91 98111 22334')
await owner.fill('#field-customerLicence', 'MH12 20200004321')
const estimate = await owner.locator('dl').last().textContent()
check('an estimate is shown before reserving', /Estimated total/.test(estimate ?? ''), true)
await owner.click('button:has-text("Reserve")')
await owner.waitForURL(BOOKING_DETAIL, { timeout: 30000 })
check('reserving lands on the booking', BOOKING_DETAIL.test(new URL(owner.url()).pathname), true)
const detail = await owner.evaluate(() => document.body.innerText)
check('the booking is numbered', /BK-\d{4}/.test(detail), true)
check('the customer is on the booking', detail.includes('Meera Joshi'), true)
check('it starts out reserved', detail.includes('Reserved'), true)
await shot(owner, '22-booking-detail')

// The same vehicle is no longer offered for an overlapping window.
const plate = (detail.match(/MH \d\d [A-Z]{2} \d{4}/) ?? [])[0]
await owner.goto(`${BASE}/bookings/new?startAt=${local(41, 10)}&endAt=${local(42, 18)}`, { waitUntil: 'networkidle' })
const bodyAfter = await owner.evaluate(() => document.body.innerText)
check('the booked vehicle is withdrawn from overlapping dates', bodyAfter.includes(plate), false)
check('the rest of the fleet is still offered', await owner.locator('input[name=vehicleId]').count(), 4)

// It is offered again for dates outside the booking.
await owner.goto(`${BASE}/bookings/new?startAt=${local(60, 10)}&endAt=${local(61, 18)}`, { waitUntil: 'networkidle' })
check('it is offered again outside those dates', await owner.locator('input[name=vehicleId]').count(), 5)

// A return before the pick-up is refused.
await owner.goto(`${BASE}/bookings/new?startAt=${local(50, 18)}&endAt=${local(50, 10)}`, { waitUntil: 'networkidle' })
check('a return before the pick-up is refused',
  await owner.locator('text=The return has to be after the pick-up').isVisible(), true)

// Search finds the booking by customer.
await owner.goto(`${BASE}/bookings?q=Meera`, { waitUntil: 'networkidle' })
check('search finds it by customer name', await owner.locator('tbody tr').count(), 1)

// Cancelling frees the vehicle again.
await owner.click('tbody a')
await owner.waitForURL(BOOKING_DETAIL, { timeout: 30000 })
await owner.click('button:has-text("Cancel booking")')
await owner.click('button:has-text("Yes, cancel it")')
await owner.locator('text=Cancelled').first().waitFor({ state: 'visible', timeout: 30000 })
check('a reserved booking can be cancelled',
  (await owner.evaluate(() => document.body.innerText)).includes('Cancelled'), true)
await owner.goto(`${BASE}/bookings/new?startAt=${local(41, 10)}&endAt=${local(42, 18)}`, { waitUntil: 'networkidle' })
check('cancelling frees the vehicle again', await owner.locator('input[name=vehicleId]').count(), 5)

// --- Staff may book, but not cancel ---------------------------------------
const staff = await signIn('staff@sunrise-car-rentals.test')
await staff.goto(`${BASE}/bookings/new?startAt=${START}&endAt=${END}`, { waitUntil: 'networkidle' })
await staff.locator('input[name=vehicleId]').first().check()
await staff.fill('#field-customerName', 'Sanjay Patil')
await staff.fill('#field-customerPhone', '+91 98111 55667')
await staff.click('button:has-text("Reserve")')
await staff.waitForURL(BOOKING_DETAIL, { timeout: 30000 })
check('staff can take a booking',
  (await staff.evaluate(() => document.body.innerText)).includes('Sanjay Patil'), true)
check('staff are not offered the cancel button',
  await staff.locator('button:has-text("Cancel booking")').count(), 0)
check('staff are told who can cancel',
  await staff.locator('text=Ask a manager or owner to cancel').isVisible(), true)

// --- A returning customer is reused, not duplicated -----------------------
await staff.goto(`${BASE}/bookings/new?startAt=${local(70, 10)}&endAt=${local(71, 18)}`, { waitUntil: 'networkidle' })
await staff.locator('input[name=vehicleId]').first().check()
await staff.fill('#field-customerName', 'Sanjay Patil')
await staff.fill('#field-customerPhone', '+91 98111 55667')
await staff.click('button:has-text("Reserve")')
await staff.waitForURL(BOOKING_DETAIL, { timeout: 30000 })
// Capture it here, while we are actually on the booking's own page.
const bookingPath = new URL(staff.url()).pathname
await staff.goto(`${BASE}/bookings?q=98111 55667`, { waitUntil: 'networkidle' })
check('the returning customer has both bookings', await staff.locator('tbody tr').count(), 2)

// --- Tenant isolation -----------------------------------------------------
const rival = await signIn('owner@deccan.test')
await rival.goto(`${BASE}/bookings`, { waitUntil: 'networkidle' })
const rivalBody = await rival.evaluate(() => document.body.innerText)
check('a rival sees none of these customers', rivalBody.includes('Sanjay Patil'), false)

// Opening another tenant's booking by its own URL must be a dead end, not a peek.
await rival.goto(`${BASE}${bookingPath}`, { waitUntil: 'networkidle' })
const rivalDetail = await rival.evaluate(() => document.body.innerText)
check('another tenant booking is not found', /not found|404/i.test(rivalDetail), true)
check('no customer name leaks through the URL', rivalDetail.includes('Sanjay Patil'), false)

const BENIGN = [
  /Failed to load resource: the server responded with a status of 404/,
  /Failed to execute 'measure' on 'Performance'/,
]
const bad = errors.filter((e) => !BENIGN.some((b) => b.test(e)))
console.log(bad.length ? `\nCONSOLE ERRORS:\n${bad.join('\n')}` : '\nno console errors')
if (bad.length) process.exitCode = 1
await browser.close()
