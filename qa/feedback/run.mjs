// qa/feedback — the wallet-gated feedback page (/qa/feedback.html) signs with the browser's
// Katomia key wherever that key lives (FEEDBACK-PAGE-KEY1, owner 2026-11-19).
//
// Since INTENTKEY-SAFE1 (2026-11-06) the private half is a non-extractable CryptoKey in IndexedDB
// and localStorage holds the public half only; the page read the old JWK and so told every visitor
// "no Katomia key". This drives the BUILT page (build/dist) in Chromium, makes a key exactly the way
// katomia-core.js does today, and checks the signed request the page sends verifies under the
// backend's own rule (kfeedbackEndorse.js verifySignature: Ed25519 over JSON.stringify(payload)).
// The backend is stood in for: a verified signature gets rows back, so the page's rendering is
// exercised too. Also: an old browser with the JWK still works, no key says how to sign in, and an
// unbound key says how to sign in.
//
//   node qa/feedback/run.mjs     (from the repo root; uses qa/sign's playwright)
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createPublicKey, verify } from 'node:crypto'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const DIST = resolve(ROOT, process.env.DIST || 'build/dist')
const require = createRequire(join(ROOT, 'qa', 'sign', 'package.json'))
let chromium
try { ({ chromium } = require('playwright')) } catch { console.log('SKIP: no playwright (npm i in qa/sign)'); process.exit(0) }

let failed = 0, total = 0
const ok = (c, m, x) => { total++; if (c) console.log('  PASS ' + m); else { failed++; console.log('  FAIL ' + m + (x !== undefined ? ' — ' + x : '')) } }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p.endsWith('/')) p += 'index.html'
  const file = join(DIST, p)
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end() }
  try { const b = readFileSync(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(b) }
  catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

// the backend's check, verbatim in effect (hbarlive_hts kfeedbackEndorse.js verifySignature)
function backendVerifies(body) {
  try {
    const { signaturePayload: payload, signature } = body
    const hex = String(signature.pubkeyHex || '').toLowerCase()
    if (hex.length !== 64) return false
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' })
    return verify(null, Buffer.from(JSON.stringify(payload)), key, Buffer.from(signature.sig, 'base64'))
  } catch { return false }
}

const ROWS = [
  { id: 'r1', ts: '2026-11-19T10:00:00Z', product: 'gomint-expo', message: 'a message nobody signed', bucket: 'anonymous customer', groups: [], tag: 'alpha-bravo-11' },
  { id: 'r2', ts: '2026-11-19T11:00:00Z', product: 'katomia', message: 'from the owner', bucket: 'actioning', groups: ['admin'], account: '0.0.9940704' },
]

const browser = await chromium.launch()
async function scenario(name, setupKey, answer) {
  console.log(name)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } })
  const page = await ctx.newPage()
  let sent = null
  await page.route('**/hapi/kfeedback/admin/list', async (route) => {
    sent = JSON.parse(route.request().postData() || 'null')
    const a = answer(sent)
    await route.fulfill({ status: a.status, contentType: 'application/json', body: JSON.stringify(a.body) })
  })
  await page.goto(BASE + '/m/katomia/qa/index.html', { waitUntil: 'domcontentloaded' })   // same origin, to plant the key
  const pubHex = await page.evaluate(setupKey)
  await page.goto(BASE + '/m/katomia/qa/feedback.html', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !/Reading…/.test(document.getElementById('out').textContent), null, { timeout: 15000 })
  const view = await page.evaluate(() => ({ out: document.getElementById('out').textContent, who: document.getElementById('who').textContent }))
  await ctx.close()
  return { sent, pubHex, view }
}

// today's shape (katomia-core.js INTENTKEY-SAFE1): non-extractable private key in IndexedDB, public JWK in localStorage
const currentKey = async () => {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey)
  await new Promise((res, rej) => {
    const req = indexedDB.open('katomia-keys', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('keys')
    req.onsuccess = () => { const tx = req.result.transaction('keys', 'readwrite'); tx.objectStore('keys').put(kp.privateKey, 'intent'); tx.oncomplete = () => { req.result.close(); res() }; tx.onerror = () => rej(tx.error) }
    req.onerror = () => rej(req.error)
  })
  localStorage.setItem('katomiaPlayerKeypair', JSON.stringify({ publicKeyJwk: pub }))
  return [...atob(pub.x.replace(/-/g, '+').replace(/_/g, '/'))].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}
// a browser from before 2026-11-06 that has not opened Katomia since: the JWK is still in localStorage
const oldKey = async () => {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey), priv = await crypto.subtle.exportKey('jwk', kp.privateKey)
  localStorage.setItem('katomiaPlayerKeypair', JSON.stringify({ publicKeyJwk: pub, privateKeyJwk: priv }))
  return [...atob(pub.x.replace(/-/g, '+').replace(/_/g, '/'))].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}
const admin = (sent) => backendVerifies(sent) ? { status: 200, body: { ok: true, viewer: '0.0.9940704', rows: ROWS } } : { status: 401, body: { ok: false, error: 'signature did not verify' } }

{
  const r = await scenario('1. today\'s key (IndexedDB, non-extractable): the page signs and reads', currentKey, admin)
  ok(!!r.sent, 'the page asked for the list')
  ok(r.sent && r.sent.signature.pubkeyHex === r.pubHex, 'signed with this browser\'s key', r.sent && r.sent.signature.pubkeyHex)
  ok(r.sent && r.sent.signaturePayload.action === 'kfeedback.list', 'the signed action is kfeedback.list')
  ok(r.sent && backendVerifies(r.sent), 'the signature verifies under the backend\'s rule')
  ok(/signed in as 0\.0\.9940704/.test(r.view.who), 'shows who is signed in', r.view.who)
  ok(/1 waiting on you/.test(r.view.out) && /a message nobody signed/.test(r.view.out), 'lists what is waiting', r.view.out.slice(0, 120))
}
{
  const r = await scenario('2. an older browser (JWK still in localStorage): still works', oldKey, admin)
  ok(r.sent && backendVerifies(r.sent), 'the signature verifies')
  ok(/signed in as 0\.0\.9940704/.test(r.view.who), 'reads the list', r.view.who)
}
{
  const r = await scenario('3. no key at all: says how to sign in, sends nothing', async () => { localStorage.removeItem('katomiaPlayerKeypair'); return null }, admin)
  ok(!r.sent, 'no request without a key')
  ok(/no Katomia key yet/.test(r.view.out) && /Authenticate/.test(r.view.out) && /HashPack/.test(r.view.out), 'tells you how to sign in', r.view.out.slice(0, 200))
}
{
  const r = await scenario('4. a key not signed in as admin: says how to sign in', currentKey, () => ({ status: 403, body: { ok: false, error: 'that key is not bound to an account' } }))
  ok(/not signed in as an admin/.test(r.view.out) && /Authenticate/.test(r.view.out), 'tells you how to sign in', r.view.out.slice(0, 200))
  ok(!/a message nobody signed/.test(r.view.out), 'shows no messages')
}

// ── 5. FEEDBACK-PAGE-SORT1 (owner 2026-11-19): narrow by site/page/product/sender; tap a heading to
//    sort, again to reverse; each sort keeps the previous order within ties ──────────────────────
{
  console.log('5. filters by site, page, product and sender; tap-to-sort that keeps the previous order')
  const R = (id, ts, url, extra = {}) => ({ id, ts, url, product: 'gomint-expo', message: 'msg ' + id, bucket: 'anonymous customer', groups: [], tag: 'tag-' + id, ...extra })
  const MANY = [   // newest first, as the backend serves them
    R('n6', '2026-11-19T16:00:00Z', 'https://3d.expo2026.gomint.me/playground/'),
    R('n5', '2026-11-19T15:00:00Z', 'https://expo2026.gomint.me/gallery/hashglass/'),
    R('n4', '2026-11-19T14:00:00Z', 'https://3d.expo2026.gomint.me/gallery/'),
    R('n3', '2026-11-19T13:00:00Z', 'https://3d.expo2026.gomint.me/playground/', { product: 'gomint', account: '0.0.1234567', bucket: 'general customer' }),
    R('n2', '2026-11-19T12:00:00Z', 'https://lab1.katomia.com/board/t-fx', { product: 'katomia', message: 'the board is slow' }),
    R('n1', '2026-11-19T11:00:00Z', 'https://3d.expo2026.gomint.me/gallery/'),
  ]
  for (const width of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await ctx.newPage()
    await page.route('**/hapi/kfeedback/admin/list', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, viewer: '0.0.9940704', rows: MANY }) }))
    await page.goto(BASE + '/m/katomia/qa/index.html', { waitUntil: 'domcontentloaded' })
    await page.evaluate(currentKey)
    await page.goto(BASE + '/m/katomia/qa/feedback.html', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.card.row')
    const ids = () => page.$$eval('.card.row', (a) => a.map((c) => c.getAttribute('data-id')))
    const opts = (sel) => page.$$eval(sel + ' option', (a) => a.map((o) => o.value + '=' + o.textContent))
    const w = '@' + width + ': '
    ok(JSON.stringify(await ids()) === JSON.stringify(['n6', 'n5', 'n4', 'n3', 'n2', 'n1']), w + 'newest first to start', await ids())
    const sites = await opts('#f-site')
    ok(sites.includes('3d.expo2026.gomint.me=3d.expo2026.gomint.me (4)') && sites.includes('expo2026.gomint.me=expo2026.gomint.me (1)') && sites.includes('lab1.katomia.com=lab1.katomia.com (1)'), w + 'the Site list names each site with its count', sites.join(' | '))
    await page.selectOption('#f-site', '3d.expo2026.gomint.me')
    ok(JSON.stringify(await ids()) === JSON.stringify(['n6', 'n4', 'n3', 'n1']), w + 'choosing a site shows only its messages', await ids())
    const pages = await opts('#f-page')
    ok(pages.length === 3 && pages.includes('/gallery/=/gallery/ (2)') && pages.includes('/playground/=/playground/ (2)'), w + 'the Page list narrows to that site', pages.join(' | '))
    await page.selectOption('#f-page', '/gallery/')
    ok(JSON.stringify(await ids()) === JSON.stringify(['n4', 'n1']), w + 'and a page within it', await ids())
    await page.click('#f-clear')
    await page.selectOption('#f-from', 'account')
    ok(JSON.stringify(await ids()) === JSON.stringify(['n3']), w + 'From: signed in, not admin', await ids())
    await page.selectOption('#f-from', '')
    await page.selectOption('#f-product', 'katomia')
    ok(JSON.stringify(await ids()) === JSON.stringify(['n2']), w + 'Product', await ids())
    await page.click('#f-clear')
    await page.fill('#f-text', 'slow')
    ok(JSON.stringify(await ids()) === JSON.stringify(['n2']), w + 'Find searches the words', await ids())
    await page.fill('#f-text', 'tag-n5')
    ok(JSON.stringify(await ids()) === JSON.stringify(['n5']), w + '… and the reference', await ids())
    await page.click('#f-clear')
    // the owner's example: When reversed, then Page — time order within each page
    await page.click('.thead button[data-col="when"]')          // first tap on When: newest first (its natural direction)
    await page.click('.thead button[data-col="when"]')          // second tap reverses: oldest first
    ok(JSON.stringify(await ids()) === JSON.stringify(['n1', 'n2', 'n3', 'n4', 'n5', 'n6']), w + 'When, tapped twice: oldest first', await ids())
    await page.click('.thead button[data-col="when"]')          // back to newest first
    await page.click('.thead button[data-col="page"]')
    ok(JSON.stringify(await ids()) === JSON.stringify(['n2', 'n4', 'n1', 'n5', 'n6', 'n3']), w + 'then Page: pages A→Z (/board, /gallery/, /gallery/hashglass/, /playground/), newest first within each page', await ids())
    ok(await page.$eval('.thead button[data-col="page"]', (b) => b.getAttribute('aria-sort')) === 'ascending', w + 'the heading shows its direction')
    await page.click('.thead button[data-col="page"]')
    ok(JSON.stringify(await ids()) === JSON.stringify(['n6', 'n3', 'n5', 'n4', 'n1', 'n2']), w + 'Page again reverses, still newest first within each page', await ids())
    await page.selectOption('#f-site', '3d.expo2026.gomint.me')
    ok(JSON.stringify(await ids()) === JSON.stringify(['n6', 'n3', 'n4', 'n1']), w + 'a filter keeps the sort', await ids())
    await page.selectOption('#f-site', '')
    if (width === 1280) {
      const lined = await page.evaluate(() => {
        const hs = [...document.querySelectorAll('.thead button')].map((b) => Math.round(b.getBoundingClientRect().left))
        const row = document.querySelector('.card.row')
        const cs = [...row.querySelectorAll('.head > .c'), row.querySelector('.msgcell')].map((c) => Math.round(c.getBoundingClientRect().left))
        return { hs, cs }
      })
      ok(JSON.stringify(lined.hs) === JSON.stringify(lined.cs), w + 'the headings sit over their columns (a table on desktop)', JSON.stringify(lined))
    }
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/feedback-' + width + '.png', fullPage: false })
    await ctx.close()
  }
}

await browser.close(); server.close()
console.log(`\n${total - failed}/${total} passed`)
process.exit(failed ? 1 : 0)
