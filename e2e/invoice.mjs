/**
 * Issuing an invoice and handing it to the customer.
 *   node e2e/invoice.mjs [screenshotDir] [baseUrl]
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
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

// Give the invoice real supplier details first.
await owner.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await owner.fill('#field-legalName', 'Sunrise Car Rentals Pvt Ltd')
await owner.fill('#field-gstin', '27AAPFU0939F1ZV')
await owner.fill('#field-addressLine', '12 MG Road')
await owner.fill('#field-city', 'Pune')
await owner.fill('#field-state', 'Maharashtra')
await owner.fill('#field-stateCode', '27')
await owner.fill('#field-postalCode', '411001')
await owner.click('button:has-text("Save settings")')
await owner.getByText('Settings saved.').waitFor({ state: 'visible', timeout: 30000 })

// BK-1002 is out on rent in the seed, so it already has a bill.
await owner.goto(`${BASE}/bookings?q=BK-1002`, { waitUntil: 'networkidle' })
await owner.click('tbody a')
await owner.waitForURL(DETAIL, { timeout: 30000 })
const bookingUrl = owner.url()
// Wait for the bill to render, not just for the URL to change.
await owner.getByText('Taxable value').waitFor({ state: 'visible', timeout: 30000 })

check('an invoice is offered once there is a bill',
  await owner.locator('button:has-text("Issue invoice")').isVisible(), true)

await owner.click('button:has-text("Issue invoice")')
await owner.waitForURL('**/invoice', { timeout: 30000 })
const doc = await text(owner)

check('the document is a tax invoice', doc.includes('Tax invoice'), true)
check('it carries a numbered series', /INV\/\d{4}-\d{2}\/\d{4}/.test(doc), true)
check('it shows the supplier GSTIN', doc.includes('27AAPFU0939F1ZV'), true)
check('it shows the registered name', doc.includes('Sunrise Car Rentals Pvt Ltd'), true)
check('it names the customer', doc.includes('Priya Desai'), true)
check('it states the place of supply', doc.includes('Place of supply: Maharashtra'), true)
check('it breaks out CGST and SGST', doc.includes('CGST (9%)') && doc.includes('SGST (9%)'), true)
check('it carries the SAC code', doc.includes('9966'), true)
check('it offers printing', await owner.locator('button:has-text("Print or save as PDF")').isVisible(), true)
await shot(owner, '95-invoice')

// The chrome must not reach paper.
await owner.emulateMedia({ media: 'print' })
const printed = await owner.evaluate(() => ({
  sidebar: document.querySelector('#app-sidebar')
    ? getComputedStyle(document.querySelector('#app-sidebar')).display : 'absent',
  printButton: getComputedStyle(
    [...document.querySelectorAll('div')].find((d) => d.className.includes('print:hidden')),
  ).display,
}))
check('the sidebar does not print', printed.sidebar, 'none')
check('the print button does not print itself', printed.printButton, 'none')
await shot(owner, '96-invoice-print')
await owner.emulateMedia({ media: 'screen' })

// Once issued, the bill is frozen.
await owner.goto(bookingUrl, { waitUntil: 'networkidle' })
check('the booking now links to the invoice',
  await owner.locator('a:has-text("Open invoice")').isVisible(), true)
await owner.click('button:has-text("Add a charge")')
await owner.fill('#field-description', 'Sneaky extra')
await owner.fill('#field-unitAmount', '999')
await owner.click('button:has-text("Add charge")')
const frozen = owner.getByText(/already been invoiced/i)
await frozen.waitFor({ state: 'visible', timeout: 30000 })
check('an issued bill cannot be changed', await frozen.isVisible(), true)

// Issuing again must not mint a second number.
const first = (doc.match(/INV\/\d{4}-\d{2}\/\d{4}/) ?? [])[0]
await owner.goto(`${BASE}${new URL(bookingUrl).pathname}/invoice`, { waitUntil: 'networkidle' })
check('the same invoice number is shown', (await text(owner)).includes(first), true)

// --- Staff and other tenants ---------------------------------------------
const staff = await signIn('staff@sunrise-car-rentals.test')
await staff.goto(`${BASE}${new URL(bookingUrl).pathname}/invoice`, { waitUntil: 'networkidle' })
check('staff can open the invoice to hand over', (await text(staff)).includes('Tax invoice'), true)

const rival = await signIn('owner@deccan.test')
await rival.goto(`${BASE}${new URL(bookingUrl).pathname}/invoice`, { waitUntil: 'networkidle' })
const rivalText = await text(rival)
check('another tenant cannot open it', /not found/i.test(rivalText), true)
check('no customer name leaks', rivalText.includes('Priya Desai'), false)

const BENIGN = [
  /Failed to load resource: the server responded with a status of 404/,
  /Failed to execute 'measure' on 'Performance'/,
]
const bad = errors.filter((e) => !BENIGN.some((b) => b.test(e)))
console.log(bad.length ? `\nCONSOLE ERRORS:\n${bad.join('\n')}` : '\nno console errors')
if (bad.length) process.exitCode = 1
await browser.close()
