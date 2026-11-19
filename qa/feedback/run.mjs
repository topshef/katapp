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

await browser.close(); server.close()
console.log(`\n${total - failed}/${total} passed`)
process.exit(failed ? 1 : 0)
