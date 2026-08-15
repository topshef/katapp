#!/usr/bin/env node
// kadmin-disclose.cjs — T:KADMIN-01 (BUNDLE-STRIP1): admin disclosure check.
// Admin vantage (this box's IP is in header.php's $katomiaIpAdmin): the disclosed
// affordances must render WITH the admin-only treatment (body.kadmin + 🛠 chip).
// Non-admin vantage (loopback 127.0.0.1, which is NOT in the list): the served
// HTML must not contain them at all — the gate is server-side, per request.
// Usage: node kadmin-disclose.cjs [base]   (default https://lab1.katlab.kpay.live)
const { execSync } = require('child_process')
const BASE = process.argv[2] || 'https://lab1.katlab.kpay.live'
const PAGE = '/m/katomia/board/t-prop'
const pw = (() => {
  for (const p of [process.env.KPLAYWRIGHT, 'playwright',
    '/tmp/claude-0/-var-www/6f4a3fc8-bdc9-4790-8b5d-aa8d1cc1a412/scratchpad/node_modules/playwright'])
    if (p) { try { return require(p) } catch {} }
  throw new Error('playwright not found — set KPLAYWRIGHT=/path/to/node_modules/playwright')
})()

;(async () => {
  const out = { base: BASE, page: PAGE, fails: [] }

  // ── admin vantage: real browser from this (admin-listed) box ──
  const browser = await pw.chromium.launch({ args: ['--ignore-certificate-errors'] })
  const page = await browser.newPage({ ignoreHTTPSErrors: true })
  await page.goto(BASE + PAGE, { waitUntil: 'networkidle' })
  const admin = await page.evaluate(() => ({
    kadmin: document.body.classList.contains('kadmin'),
    menuItem: !!document.querySelector('[data-menu-kea]'),
    chips: document.querySelectorAll('.kadmin-chip').length,
    disclosed: document.querySelectorAll('.kadmin-disclosed').length,
    flag: window.KATOMIA_FEATURES && window.KATOMIA_FEATURES.kea === true,
  }))
  await browser.close()
  out.admin = admin
  if (!admin.kadmin) out.fails.push('admin: body.kadmin missing')
  if (!admin.menuItem) out.fails.push('admin: disclosed menu item missing')
  if (!admin.chips) out.fails.push('admin: no 🛠 admin chips rendered')
  if (!admin.flag) out.fails.push('admin: feature flag not pre-set true')

  // ── non-admin vantage: same vhost via loopback (REMOTE_ADDR=127.0.0.1) ──
  const host = new URL(BASE).host
  const html = execSync(
    `curl -sk --resolve ${host}:443:127.0.0.1 ${BASE}${PAGE}`, { maxBuffer: 1 << 24 }).toString()
  const nonAdmin = {
    menuItem: html.includes('data-menu-kea'),
    profileSection: html.includes('profileKeaSection'),
    discloseBlock: html.includes('KATOMIA_ADMIN_DISCLOSED'),
  }
  out.nonAdmin = nonAdmin
  for (const [k, v] of Object.entries(nonAdmin))
    if (v) out.fails.push(`non-admin: ${k} present in served HTML`)

  out.verdict = out.fails.length ? 'FAIL' : 'PASS'
  console.log(JSON.stringify(out, null, 1))
  process.exit(out.fails.length ? 1 : 0)
})().catch(e => { console.error('KADMIN-01 ERROR:', e.message); process.exit(2) })
