/**
 * Accessibility and mobile audit across the signed-in app.
 *   node e2e/audit.mjs [screenshotDir] [baseUrl]
 */
import { chromium } from '@playwright/test'

const OUT = process.argv[2] ?? null
const BASE = process.argv[3] ?? 'http://localhost:3000'

const browser = await chromium.launch()
const problems = []
const note = (page, msg) => problems.push(`${page}: ${msg}`)

async function signIn(width, height) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#field-email', 'owner@sunrise.test')
  await page.fill('#field-password', 'password123')
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 30000 })
  return page
}

/** Everything a signed-in owner can reach. */
async function routes(page) {
  await page.goto(`${BASE}/fleet`, { waitUntil: 'networkidle' })
  const vehicleHref = await page.locator('tbody a').first().getAttribute('href')
  await page.goto(`${BASE}/bookings`, { waitUntil: 'networkidle' })
  const bookingHref = await page.locator('tbody a').first().getAttribute('href')
  await page.goto(`${BASE}/customers`, { waitUntil: 'networkidle' })
  const customerHref = await page.locator('tbody a').first().getAttribute('href')
  return [
    '/dashboard', '/fleet', '/fleet/new', vehicleHref,
    '/bookings', '/bookings/new', bookingHref,
    '/customers', customerHref, '/calendar', '/settings', '/nope-does-not-exist',
  ]
}

const audit = async (page, path, label) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })

  const result = await page.evaluate(() => {
    const out = { overflow: null, unlabelled: [], headings: [], landmarks: {}, emptyLinks: [] }

    // Horizontal scroll is the classic mobile failure.
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      out.overflow = { scroll: document.documentElement.scrollWidth, view: window.innerWidth }
    }

    // Every control a person can type into needs an accessible name.
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (el.type === 'hidden') continue
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue
      const byLabel = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      const named = byLabel || el.getAttribute('aria-label') || el.closest('label')
      if (!named) out.unlabelled.push(`${el.tagName.toLowerCase()}[name=${el.name || '?'}]`)
    }

    out.headings = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) =>
      Number(h.tagName[1]),
    )
    out.landmarks = {
      main: document.querySelectorAll('main').length,
      nav: document.querySelectorAll('nav').length,
      h1: document.querySelectorAll('h1').length,
    }

    for (const a of document.querySelectorAll('a,button')) {
      // Skip anything not currently rendered -- a closed mobile drawer is hidden on
      // purpose, and its contents are not on screen to be named.
      if (typeof a.checkVisibility === 'function' && !a.checkVisibility()) continue
      const name = (a.innerText || a.textContent || a.getAttribute('aria-label') || '').trim()
      if (!name) out.emptyLinks.push(a.outerHTML.slice(0, 60))
    }
    return out
  })

  if (result.overflow) {
    note(label, `sideways scroll (${result.overflow.scroll}px in a ${result.overflow.view}px view)`)
  }
  if (result.unlabelled.length) note(label, `unlabelled controls: ${result.unlabelled.join(', ')}`)
  if (result.landmarks.main !== 1) note(label, `expected one <main>, found ${result.landmarks.main}`)
  if (result.landmarks.h1 !== 1) note(label, `expected one <h1>, found ${result.landmarks.h1}`)
  if (result.emptyLinks.length) note(label, `controls with no accessible name: ${result.emptyLinks.length}`)

  // Heading levels should not jump (h1 -> h3).
  for (let i = 1; i < result.headings.length; i++) {
    if (result.headings[i] - result.headings[i - 1] > 1) {
      note(label, `heading jumps from h${result.headings[i - 1]} to h${result.headings[i]}`)
      break
    }
  }
}

for (const [w, h, size] of [[390, 844, 'phone'], [1440, 950, 'desktop']]) {
  const page = await signIn(w, h)
  for (const path of await routes(page)) {
    if (path) await audit(page, path, `${size} ${path}`)
  }
  if (OUT && size === 'phone') {
    await page.goto(`${BASE}/fleet`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: `${OUT}/40-fleet-phone.png`, fullPage: true })
    await page.goto(`${BASE}/bookings/new`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: `${OUT}/41-booking-phone.png`, fullPage: true })
  }
  await page.close()
}

// The phone menu must be operable, not just present.
const drawer = await signIn(390, 844)
await drawer.goto(`${BASE}/fleet`, { waitUntil: 'networkidle' })
const menuBtn = drawer.locator('button:has-text("Open menu")')
if (!(await menuBtn.isVisible())) {
  note('phone drawer', 'no menu button at 390px, so the navigation is unreachable')
} else {
  if (await drawer.locator('nav[aria-label=Main] a:has-text("Fleet")').isVisible()) {
    note('phone drawer', 'the nav is on screen before the menu is opened')
  }
  await menuBtn.click()
  await drawer.locator('nav[aria-label=Main] a:has-text("Fleet")').waitFor({ state: 'visible', timeout: 5000 })
  if ((await menuBtn.getAttribute('aria-expanded')) !== 'true') {
    note('phone drawer', 'the menu button does not report aria-expanded=true when open')
  }
  await drawer.keyboard.press('Escape')
  await drawer.waitForTimeout(400)
  if (await drawer.locator('nav[aria-label=Main] a:has-text("Fleet")').isVisible()) {
    note('phone drawer', 'Escape does not close the menu')
  }
}
await drawer.close()

// The skip link must be reachable and actually work.
const kb = await signIn(1440, 950)
await kb.goto(`${BASE}/fleet`, { waitUntil: 'networkidle' })
await kb.keyboard.press('Tab')
const firstStop = await kb.evaluate(() => (document.activeElement?.innerText ?? '').trim())
if (firstStop !== 'Skip to content') note('keyboard', `first tab stop is "${firstStop}", not the skip link`)
await kb.close()

console.log(problems.length ? `PROBLEMS (${problems.length}):\n- ${problems.join('\n- ')}` : 'No accessibility or mobile problems found.')
if (problems.length) process.exitCode = 1
await browser.close()
