/**
 * Money: GST settings, charges, payments and the balance.
 *   node e2e/billing.mjs [screenshotDir] [baseUrl]
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
const money = (p, label) =>
  p.evaluate((l) => {
    const rows = [...document.querySelectorAll('tfoot tr')]
    const row = rows.find((r) => r.textContent.trim().startsWith(l))
    return row ? row.querySelectorAll('td')[1].textContent.trim() : null
  }, label)

const owner = await signIn('owner@sunrise.test')

// --- GST settings ---------------------------------------------------------
await owner.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
check('an owner can reach settings', await owner.locator('#field-gstin').isVisible(), true)
await owner.fill('#field-gstin', 'not-a-gstin')
await owner.click('button:has-text("Save settings")')
const gstErr = owner.getByText(/not a valid 15-character GSTIN/i)
await gstErr.waitFor({ state: 'visible', timeout: 30000 })
check('an invalid GSTIN is refused', await gstErr.isVisible(), true)

await owner.fill('#field-gstin', '27AAPFU0939F1ZV')
await owner.fill('#field-legalName', 'Sunrise Car Rentals Pvt Ltd')
await owner.fill('#field-state', 'Maharashtra')
await owner.fill('#field-stateCode', '27')
await owner.fill('#field-gstRate', '18')
await owner.click('button:has-text("Save settings")')
await owner.getByText('Settings saved.').waitFor({ state: 'visible', timeout: 30000 })
check('settings save', true, true)
await shot(owner, '90-settings')

// --- The bill appears at hand-over ---------------------------------------
// BK-2000 is the seeded reservation waiting to be collected today.
await owner.goto(`${BASE}/bookings?q=BK-2000`, { waitUntil: 'networkidle' })
await owner.click('tbody a')
await owner.waitForURL(/\/bookings\/(?!new)[a-z0-9]+$/, { timeout: 30000 })
const bookingUrl = owner.url()
check('a reserved booking has nothing billed yet',
  (await text(owner)).includes('Nothing billed yet'), true)

await owner.click('a:has-text("Hand over keys")')
await owner.waitForURL('**/check-out', { timeout: 30000 })
await owner.fill('#field-fuelLevel', '90')
await owner.click('button:has-text("Hand over keys")')
await owner.waitForURL(/\/bookings\/(?!new)[a-z0-9]+$/, { timeout: 30000 })

// Seeded Maruti Swift at 1500/day for 2 days = 3000 taxable, 18% = 540 tax.
check('the rental is billed at hand-over', await money(owner, 'Taxable value'), '₹3,000.00')
check('CGST is half the rate', await money(owner, 'CGST'), '₹270.00')
check('SGST matches CGST', await money(owner, 'SGST'), '₹270.00')
check('the total includes GST', await money(owner, 'Total'), '₹3,540.00')
check('nothing is paid yet', await money(owner, 'Balance'), '₹3,540.00')
await shot(owner, '91-bill')

// --- Extras ---------------------------------------------------------------
await owner.click('button:has-text("Add a charge")')
await owner.fill('#field-description', 'Child seat')
await owner.fill('#field-quantity', '2')
await owner.fill('#field-unitAmount', '250')
await owner.click('button:has-text("Add charge")')
await owner.waitForFunction(() => document.body.innerText.includes('Child seat'), null, { timeout: 30000 })
check('an extra is added at quantity x rate', await money(owner, 'Taxable value'), '₹3,500.00')
check('the total follows the extra', await money(owner, 'Total'), '₹4,130.00')

// --- Payments -------------------------------------------------------------
await owner.click('button:has-text("Record a payment")')
await owner.fill('#field-amount', '5000')
await owner.selectOption('#field-paymentKind', 'DEPOSIT')
await owner.click('button:has-text("Record payment")')
await owner.waitForFunction(() => document.body.innerText.includes('Deposit held'), null, { timeout: 30000 })
check('a deposit does not settle the bill', await money(owner, 'Balance'), '₹4,130.00')
check('the deposit is shown as held', (await text(owner)).includes('₹5,000.00'), true)

await owner.click('button:has-text("Record a payment")')
await owner.fill('#field-amount', '4130')
await owner.selectOption('#field-method', 'UPI')
await owner.fill('#field-reference', 'UPI/8891')
await owner.click('button:has-text("Record payment")')
// Wait for the reference, which only exists once the payment is on record. Matching
// "0.00" would pass immediately, since the outstanding balance ends in those digits.
await owner.getByText('UPI/8891').waitFor({ state: 'visible', timeout: 30000 })
check('paying in full settles the bill', await money(owner, 'Balance'), '₹0.00')
check('the payment reference is kept', (await text(owner)).includes('UPI/8891'), true)
await shot(owner, '92-bill-settled')

// --- Staff limits ---------------------------------------------------------
const staff = await signIn('staff@sunrise-car-rentals.test')
await staff.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
check('staff cannot reach settings',
  await staff.locator('h1:has-text("You cannot change these settings")').isVisible(), true)
check('staff see no Settings link', await staff.locator('nav[aria-label=Main] a:has-text("Settings")').count(), 0)

await staff.goto(bookingUrl, { waitUntil: 'networkidle' })
check('staff can see the bill', (await text(staff)).includes('Taxable value'), true)
await staff.click('button:has-text("Record a payment")')
const kinds = await staff.locator('#field-paymentKind option').allTextContents()
check('staff can take payments and deposits', kinds.includes('Security deposit'), true)
check('staff are not offered refunds', kinds.includes('Refund'), false)

// --- Tenant isolation -----------------------------------------------------
const rival = await signIn('owner@deccan.test')
await rival.goto(bookingUrl, { waitUntil: 'networkidle' })
check('another tenant cannot see this bill', /not found/i.test(await text(rival)), true)
await rival.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
check('each organisation has its own settings',
  await rival.inputValue('#field-gstin'), '')

const BENIGN = [
  /Failed to load resource: the server responded with a status of 404/,
  /Failed to execute 'measure' on 'Performance'/,
]
const bad = errors.filter((e) => !BENIGN.some((b) => b.test(e)))
console.log(bad.length ? `\nCONSOLE ERRORS:\n${bad.join('\n')}` : '\nno console errors')
if (bad.length) process.exitCode = 1
await browser.close()
