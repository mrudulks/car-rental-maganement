import { chromium } from '@playwright/test'
const BASE='http://localhost:3002'
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844}})
await p.goto(`${BASE}/login`,{waitUntil:'networkidle'})
await p.fill('#field-email','owner@sunrise.test'); await p.fill('#field-password','password123')
await p.click('button[type=submit]'); await p.waitForURL('**/dashboard')
for (const path of ['/fleet','/bookings']) {
  await p.goto(`${BASE}${path}`,{waitUntil:'networkidle'})
  const wide = await p.evaluate(() => {
    const vw = window.innerWidth, out = []
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.right > vw + 1 || r.width > vw + 1) {
        out.push({ tag: el.tagName, cls: (el.className?.toString()||'').slice(0,50),
                   w: Math.round(r.width), right: Math.round(r.right),
                   parentCls: (el.parentElement?.className?.toString()||'').slice(0,40) })
      }
    }
    return { vw, out: out.slice(0, 8) }
  })
  console.log(path, 'viewport', wide.vw)
  wide.out.forEach(o=>console.log('   ', JSON.stringify(o)))
}
await b.close()
