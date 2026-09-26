/**
 * End-to-end smoke run against a dev server.
 *   node e2e/smoke.mjs [screenshotDir] [baseUrl]
 */
import { chromium } from '@playwright/test'

const OUT = process.argv[2] ?? null
const BASE = process.argv[3] ?? 'http://localhost:3000'
const email = `asha+${Date.now()}@sunrise.test`
const PASSWORD = 'correct horse battery'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const shot = (name) => (OUT ? page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }) : null)
const check = (label, actual, expected) => {
  const ok = actual === expected
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` (got ${actual}, want ${expected})`}`)
  if (!ok) process.exitCode = 1
}

// Signed out, the app is closed.
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
check('dashboard redirects to login when signed out', new URL(page.url()).pathname, '/login')

// Sign up.
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' })
await shot('01-signup')
await page.fill('#field-organizationName', 'Sunrise Car Rentals')
await page.fill('#field-name', 'Asha Menon')
await page.fill('#field-email', email)
await page.fill('#field-password', PASSWORD)
await page.click('button[type=submit]')
await page.waitForURL('**/dashboard', { timeout: 30000 })
await page.waitForLoadState('networkidle')
check('signup lands on the dashboard', new URL(page.url()).pathname, '/dashboard')
check('new account sees the empty fleet prompt', await page.locator('text=Add your first vehicle').isVisible(), true)
await shot('02-dashboard-empty')

// Signed in, the login page steps aside.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
check('login redirects to dashboard when signed in', new URL(page.url()).pathname, '/dashboard')

// Sign out closes it again.
await page.click('button:has-text("Sign out")')
await page.waitForURL('**/login', { timeout: 30000 })
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
check('dashboard is closed again after signing out', new URL(page.url()).pathname, '/login')

// A wrong password is refused, and keeps the email.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('#field-email', email)
await page.fill('#field-password', 'wrong password')
await page.click('button[type=submit]')
// Scope to the form's own alert: Next renders an always-empty
// #__next-route-announcer__ with role=alert after a client navigation.
const alert = page.locator('form [role=alert]')
await alert.waitFor({ state: 'visible', timeout: 30000 })
check('wrong password is refused', (await alert.textContent())?.trim(), 'Email or password is incorrect')
check('the email typed is kept', await page.inputValue('#field-email'), email)
await shot('03-login-error')

// The right password gets in.
await page.fill('#field-password', PASSWORD)
await page.click('button[type=submit]')
await page.waitForURL('**/dashboard', { timeout: 30000 })
check('correct password signs in', new URL(page.url()).pathname, '/dashboard')

// Phone width.
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
check('login has no sideways scroll on a phone', overflow, false)
await shot('04-login-mobile')


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
