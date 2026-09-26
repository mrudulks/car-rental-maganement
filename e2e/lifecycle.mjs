/**
 * A whole rental, end to end: reserve, hand over the keys, take the vehicle back.
 *   node e2e/lifecycle.mjs [screenshotDir] [baseUrl]
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
const BOOKING_DETAIL = /\/bookings\/(?!new(?:$|\?))[a-z0-9]+$/
const text = (page) => page.evaluate(() => document.body.innerText)

const pad = (n) => String(n).padStart(2, '0')
const local = (daysAhead, hour) => {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(hour, 0, 0, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const staff = await signIn('staff@sunrise-car-rentals.test')

// Reserve the Maruti Swift, whose seeded odometer is 12,000 km.
await staff.goto(`${BASE}/bookings/new?startAt=${local(90, 9)}&endAt=${local(92, 18)}`, { waitUntil: 'networkidle' })
await staff.locator('label:has-text("Maruti Swift") input[name=vehicleId]').check()
await staff.fill('#field-customerName', 'Kabir Shah')
await staff.fill('#field-customerPhone', '+91 97000 11223')
await staff.click('button:has-text("Reserve")')
await staff.waitForURL(BOOKING_DETAIL, { timeout: 30000 })
const bookingPath = new URL(staff.url()).pathname
check('a reserved booking offers the hand-over step',
  await staff.locator('a:has-text("Hand over keys")').isVisible(), true)
await shot(staff, '30-booking-reserved')

// The fleet still shows it as available until the keys actually leave.
await staff.goto(`${BASE}/fleet?q=swift`, { waitUntil: 'networkidle' })
check('the vehicle is still available before hand-over',
  (await text(staff)).includes('Available'), true)

// Hand over the keys.
await staff.goto(`${BASE}${bookingPath}`, { waitUntil: 'networkidle' })
await staff.click('a:has-text("Hand over keys")')
await staff.waitForURL('**/check-out', { timeout: 30000 })
check('the odometer is prefilled from the vehicle', await staff.inputValue('#field-odometer'), '12000')
await shot(staff, '31-check-out')

// A reading lower than the vehicle's own is refused.
await staff.fill('#field-odometer', '11000')
await staff.fill('#field-fuelLevel', '80')
await staff.click('button:has-text("Hand over keys")')
const outErr = staff.getByText(/odometer cannot go backwards/i)
await outErr.waitFor({ state: 'visible', timeout: 30000 })
check('an odometer that goes backwards is refused', await outErr.isVisible(), true)

// A fuel level over 100 is refused too.
await staff.fill('#field-odometer', '12040')
await staff.fill('#field-fuelLevel', '140')
await staff.click('button:has-text("Hand over keys")')
// Wait for this message specifically: the previous submit's error is still on screen
// until React re-renders, so "some error is visible" would pass too early.
const fuelErr = staff.getByText('Fuel level cannot be above 100%')
await fuelErr.waitFor({ state: 'visible', timeout: 30000 })
check('a fuel level above 100% is refused', await fuelErr.isVisible(), true)

// Now a real hand-over.
await staff.fill('#field-fuelLevel', '80')
await staff.fill('#field-notes', 'Spare tyre checked')
await staff.click('button:has-text("Hand over keys")')
await staff.waitForURL(BOOKING_DETAIL, { timeout: 30000 })
const afterOut = await text(staff)
check('the rental is now out', afterOut.includes('Out now'), true)
check('the hand-over reading is on record', afterOut.includes('12,040 km'), true)
check('the fuel level is on record', afterOut.includes('fuel 80%'), true)
check('it now offers the return step', await staff.locator('a:has-text("Take it back")').isVisible(), true)
await shot(staff, '32-booking-active')

// The fleet now shows it out on rent, and it cannot be sent to service.
await staff.goto(`${BASE}/fleet?q=swift`, { waitUntil: 'networkidle' })
check('the fleet shows it on rent', (await text(staff)).includes('On rent'), true)
check('a vehicle on rent cannot be sent to service',
  await staff.locator('button:has-text("Send to service")').count(), 0)

// Take it back.
await staff.goto(`${BASE}${bookingPath}/check-in`, { waitUntil: 'networkidle' })
check('the return prefills the hand-over reading', await staff.inputValue('#field-odometer'), '12040')
await staff.fill('#field-odometer', '11500')
await staff.fill('#field-fuelLevel', '40')
await staff.click('button:has-text("Complete return")')
const inErr = staff.getByText(/odometer cannot go backwards/i)
await inErr.waitFor({ state: 'visible', timeout: 30000 })
check('a return reading below the hand-over is refused', await inErr.isVisible(), true)

await staff.fill('#field-odometer', '12525')
await staff.fill('#field-fuelLevel', '40')
await staff.fill('#field-damageNotes', 'Scuff on the rear bumper')
await staff.click('button:has-text("Complete return")')
await staff.waitForURL(BOOKING_DETAIL, { timeout: 30000 })
const afterIn = await text(staff)
check('the rental is returned', afterIn.includes('Returned'), true)
check('the distance covered is worked out', afterIn.includes('485 km'), true)
check('the damage is on record', afterIn.includes('Scuff on the rear bumper'), true)
check('no further step is offered', await staff.locator('a:has-text("Take it back")').count(), 0)
await shot(staff, '33-booking-completed')

// The vehicle is back on the board with the new odometer.
await staff.goto(`${BASE}/fleet?q=swift`, { waitUntil: 'networkidle' })
const fleetAfter = await text(staff)
check('the vehicle is available again', fleetAfter.includes('Available'), true)
check('its odometer moved forward', fleetAfter.includes('12,525 km'), true)

// Re-running either step is refused rather than repeated.
await staff.goto(`${BASE}${bookingPath}/check-out`, { waitUntil: 'networkidle' })
check('a completed rental cannot be handed over again',
  new URL(staff.url()).pathname, bookingPath)
await staff.goto(`${BASE}${bookingPath}/check-in`, { waitUntil: 'networkidle' })
check('a completed rental cannot be returned again',
  new URL(staff.url()).pathname, bookingPath)

// Another tenant cannot reach these pages.
const rival = await signIn('owner@deccan.test')
await rival.goto(`${BASE}${bookingPath}/check-in`, { waitUntil: 'networkidle' })
check('another tenant cannot take back our vehicle',
  /not found|404/i.test(await text(rival)), true)

const BENIGN = [
  /Failed to load resource: the server responded with a status of 404/,
  /Failed to execute 'measure' on 'Performance'/,
]
const bad = errors.filter((e) => !BENIGN.some((b) => b.test(e)))
console.log(bad.length ? `\nCONSOLE ERRORS:\n${bad.join('\n')}` : '\nno console errors')
if (bad.length) process.exitCode = 1
await browser.close()
