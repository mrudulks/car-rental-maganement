/**
 * Fleet flow, end to end.
 *   node e2e/fleet.mjs [screenshotDir] [baseUrl]
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

// --- Owner: full fleet management -----------------------------------------
const owner = await signIn('owner@sunrise.test')
await owner.goto(`${BASE}/fleet`, { waitUntil: 'networkidle' })
const seededRows = await owner.locator('tbody tr').count()
check('fleet lists the seeded vehicles', seededRows, 6)
await shot(owner, '10-fleet-list')

// Filters narrow the list.
await owner.goto(`${BASE}/fleet?category=SCOOTER`, { waitUntil: 'networkidle' })
check('filtering by type narrows the list', await owner.locator('tbody tr').count(), 1)
await owner.goto(`${BASE}/fleet?q=innova`, { waitUntil: 'networkidle' })
check('searching by model finds the vehicle', await owner.locator('tbody tr').count(), 1)

// Add a vehicle, with category-driven fields.
await owner.goto(`${BASE}/fleet/new`, { waitUntil: 'networkidle' })
check('car form shows seats', await owner.locator('#field-seats').isVisible(), true)
check('car form hides engine size', await owner.locator('#field-engineCc').count(), 0)
await owner.selectOption('#field-category', 'BIKE')
check('switching to motorcycle shows engine size', await owner.locator('#field-engineCc').isVisible(), true)
check('switching to motorcycle hides seats', await owner.locator('#field-seats').count(), 0)
await owner.selectOption('#field-category', 'CAR')
await shot(owner, '11-fleet-new')

await owner.fill('#field-registrationNumber', 'mh 12  qq 5150')
await owner.fill('#field-make', 'Kia')
await owner.fill('#field-model', 'Seltos')
await owner.fill('#field-year', '2023')
await owner.fill('#field-color', 'Black')
await owner.fill('#field-odometer', '8200')
await owner.fill('#field-dailyRate', '2400')
await owner.fill('#field-depositAmount', '6000')
await owner.selectOption('#field-transmission', 'AUTOMATIC')
await owner.fill('#field-seats', '5')
await owner.click('button:has-text("Add vehicle")')
await owner.waitForURL('**/fleet', { timeout: 30000 })
await owner.waitForLoadState('networkidle')
check('the new vehicle is on the board', await owner.locator('tbody tr').count(), 7)
check('the registration number was tidied up', await owner.locator('text=MH 12 QQ 5150').first().isVisible(), true)

// A duplicate registration is refused.
await owner.goto(`${BASE}/fleet/new`, { waitUntil: 'networkidle' })
await owner.fill('#field-registrationNumber', 'MH 12 QQ 5150')
await owner.fill('#field-make', 'Kia')
await owner.fill('#field-model', 'Seltos')
await owner.fill('#field-odometer', '0')
await owner.fill('#field-dailyRate', '2400')
await owner.fill('#field-depositAmount', '6000')
await owner.click('button:has-text("Add vehicle")')
const dupError = owner.locator('form [role=alert], form p.text-danger').first()
await dupError.waitFor({ state: 'visible', timeout: 30000 })
check('a duplicate registration is refused', (await dupError.textContent())?.includes('already in your fleet'), true)

// Send to service, straight from the row.
await owner.goto(`${BASE}/fleet?q=seltos`, { waitUntil: 'networkidle' })
await owner.click('button:has-text("Send to service")')
// Scope to the table: the status filter has an <option> with the same words.
const servicePill = owner.locator('tbody').getByText('In service', { exact: true })
await servicePill.waitFor({ state: 'visible', timeout: 30000 })
check('a vehicle can be sent to service', await servicePill.isVisible(), true)

// --- Staff: may fix details, may not price --------------------------------
const staff = await signIn('staff@sunrise-car-rentals.test')
await staff.goto(`${BASE}/fleet`, { waitUntil: 'networkidle' })
check('staff do not see Add a vehicle', await staff.locator('a:has-text("Add a vehicle")').count(), 0)

await staff.goto(`${BASE}/fleet/new`, { waitUntil: 'networkidle' })
check('the add page tells staff they cannot, without crashing',
  await staff.locator('h1:has-text("You cannot add vehicles")').isVisible(), true)
check('no form is offered there', await staff.locator('#field-registrationNumber').count(), 0)

await staff.goto(`${BASE}/fleet?q=innova`, { waitUntil: 'networkidle' })
await staff.click('a:has-text("Edit")')
await staff.waitForURL('**/fleet/*', { timeout: 30000 })
await staff.locator('#field-registrationNumber').waitFor({ state: 'visible', timeout: 30000 })
check('staff see the rates notice', await staff.locator('text=Rates are set by a manager').isVisible(), true)
check('staff cannot edit the daily rate', await staff.locator('#field-dailyRate').isDisabled(), true)
check('staff see no delete section', await staff.locator('text=Take this vehicle off the board').count(), 0)
await shot(staff, '12-fleet-edit-staff')

// Staff can still correct a detail.
await staff.fill('#field-color', 'Pearl White')
await staff.click('button:has-text("Save changes")')
await staff.waitForURL('**/fleet**', { timeout: 30000 })
await staff.goto(`${BASE}/fleet?q=innova`, { waitUntil: 'networkidle' })
await staff.click('a:has-text("Edit")')
await staff.waitForURL('**/fleet/*', { timeout: 30000 })
await staff.locator('#field-color').waitFor({ state: 'visible', timeout: 30000 })
check('staff edit saved', await staff.inputValue('#field-color'), 'Pearl White')

// --- Tenant isolation, through the UI -------------------------------------
const rival = await signIn('owner@deccan.test')
const sunriseVehicleId = new URL(staff.url()).pathname.split('/').pop()
await rival.goto(`${BASE}/fleet/${sunriseVehicleId}`, { waitUntil: 'networkidle' })
const body = await rival.evaluate(() => document.body.innerText)
check('another tenant vehicle is not found', /not found|404/i.test(body), true)
check('no rival plate leaks', body.includes('MH 12'), false)


/**
 * Noise from the dev server that is not a defect:
 *  - a 404 document: this run deliberately opens another tenant's vehicle, which is
 *    meant to be not found;
 *  - a Performance.measure warning: Next's dev-mode instrumentation, not app code.
 */
const BENIGN = [
  /Failed to load resource: the server responded with a status of 404/,
  /Failed to execute 'measure' on 'Performance'/,
]
const realErrors = () => errors.filter((e) => !BENIGN.some((b) => b.test(e)))

const bad = realErrors()
console.log(bad.length ? `\nCONSOLE ERRORS:\n${bad.join('\n')}` : '\nno console errors')
if (bad.length) process.exitCode = 1
await browser.close()
