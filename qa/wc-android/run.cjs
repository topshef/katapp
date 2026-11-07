#!/usr/bin/env node
// run.cjs — WC-ANDROID-QA1 (owner 2026-11-07: "if you can think of a reliable way of testing this…
// remember you've got K-Wallet"). What link does each wallet request open on an Android phone?
//
// The REAL KWC bundle (the pinned snapshot) and THIS commit's assets/js/kwc-deeplink.js, on the
// lab1 origin, in Chromium posing as an Android phone, paired through the REAL WalletConnect relay
// with the kWallet simulator (wallet-sim.cjs, from phpjabbers qa/kwallet) presenting itself the way
// HashPack does on Android. window.open is recorded, so every redirect the sign client makes is
// seen exactly as the phone would get it. A signature must come back and verify each time.
//
//   1. hashpack     the stored Android choice as the modal writes it → each request opens hashpack://
//   2. repaired     the href:null WC-ANDROIDLINK1 left on phones → repaired, then hashpack://
//   3. baseline     ?wclink=wc on this "phone" → the wc: link, as before 7 Nov (katapp 7b041f7)
//   4. other wallet a wallet that is not HashPack and publishes no link → keeps the wc: link
// Plus: the session really is stored under "wc@2:client:0.3:session" (WC-ANDROIDLINK1 assumed the
// "//" form and never found it).
//
// What it cannot tell: whether Android hands hashpack:// to HashPack and HashPack answers. That
// only a phone can say; the diag log does (wc:redirect, then board:sign:saved).
//
// Needs the relay (relay.walletconnect.com) — CI, not the cloud sandbox (its proxy refuses it).
// Env: ORIGIN (https://lab1.katomia.com), LIVE=1 to use the origin's deployed shim instead of this
// commit's, KWC_PIN (4a3351b), QA_KWALLET_ACCOUNT (0.0.10325114).
// Each scenario has its own wallet. WalletConnect's Node core is a process-wide singleton unless
// DISABLE_GLOBAL_CORE is set (globalThis._walletConnectCore_<prefix>): without it the second
// wallet shares the first one's core and every proposal arrives twice (CI run 106).
process.env.DISABLE_GLOBAL_CORE = 'true'
process.on('unhandledRejection', e => console.log('[unhandled]', e && e.message || e))
const fs = require('fs')
const path = require('path')
const os = require('os')
const { chromium } = require('playwright')
const { Transaction, TransferTransaction, TransactionId, AccountId, Hbar, PublicKey } = require('@hashgraph/sdk')
const { createWalletSim } = require('./wallet-sim.cjs')

const ORIGIN = (process.env.ORIGIN || 'https://lab1.katomia.com').replace(/\/+$/, '')
const LIVE = process.env.LIVE === '1'
const KWC_PIN = process.env.KWC_PIN || '4a3351b'
const ACCOUNT = process.env.QA_KWALLET_ACCOUNT || '0.0.10325114'
const DIST = path.resolve(__dirname, '../../build/dist')
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36'
const HASHPACK = { name: 'HashPack', description: 'HashPack', url: 'https://localhost', icons: [] }   // as HashPack's sessions carry it (diag, 7 Nov)
const KWALLET = { name: 'kWallet sim (Katomia QA)', description: 'CI wallet simulator', url: 'https://katui.tayloa17.workers.dev', icons: [] }
const CHOICE = 'WALLETCONNECT_DEEPLINK_CHOICE'

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), '[wc-android]', ...a)
let total = 0, failed = 0
const ok = (cond, what, detail) => { total++; if (!cond) failed++; console.log(`  ${cond ? 'PASS' : 'FAIL'} ${what}${cond ? '' : ' — ' + String(detail).slice(0, 700)}`) }

const FIX = ORIGIN + '/__qa/wc-android.html'
const HTML = `<!doctype html><meta charset="utf-8"><title>WC-ANDROID-QA1</title><body>
<script type="text/javascript" data-mode="headless" src="/vendor/walletconnect/snapshots/${KWC_PIN}/kwc.iife.js" data-config="/vendor/walletconnect/config.json"></script>
<script src="/assets/js/kwc-deeplink.js"></script></body>`

// the pairing URI from the sign client's own state (same finder as phpjabbers qa/kwallet/run.cjs)
const HOOK_URI = () => {
  try {
    const all = window.__wc || {}
    const parse = v => { if (v && typeof v === 'object' && 'value' in v && 'key' in v) v = v.value; return typeof v === 'string' ? JSON.parse(v) : v }
    const pk = Object.keys(all).find(k => k.startsWith('wc@2:core:') && /[:/]pairing$/.test(k))
    const kk = Object.keys(all).find(k => k.startsWith('wc@2:core:') && /[:/]keychain$/.test(k))
    const pairs = pk ? parse(all[pk]) : [], keys = kk ? parse(all[kk]) : {}
    const p = (pairs || []).filter(x => x && !x.active && keys[x.topic]).sort((a, b) => (b.expiry || 0) - (a.expiry || 0))[0]
    return p ? 'wc:' + p.topic + '@2?relay-protocol=' + ((p.relay && p.relay.protocol) || 'irn') + '&symKey=' + keys[p.topic] + (p.expiry ? '&expiryTimestamp=' + p.expiry : '') : null
  } catch (e) { return null }
}

function frozenTx() {
  return Array.from(new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(ACCOUNT), Hbar.fromTinybars(-1))
    .addHbarTransfer(AccountId.fromString('0.0.98'), Hbar.fromTinybars(1))
    .setTransactionId(TransactionId.generate(AccountId.fromString(ACCOUNT)))
    .setNodeAccountIds([new AccountId(3)])
    .setTransactionMemo('WC-ANDROID-QA1 never submitted')
    .freeze().toBytes())
}

async function scenario(browser, cfg, name, { metadata, before, expect }) {
  console.log(name)
  const sim = await createWalletSim({ projectId: cfg.projectId, relayUrl: cfg.relayUrl, accountId: ACCOUNT, metadata,
    storagePath: path.join(os.tmpdir(), `wc-android-${process.pid}-${total}.db`) })
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const errs = [], consoleTail = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)))
  page.on('console', m => { consoleTail.push(m.text().slice(0, 200)); if (consoleTail.length > 30) consoleTail.shift() })
  await page.route(FIX, r => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }))
  if (!LIVE) {
    // THIS commit's files, served on the real origin (the relay checks the Origin)
    await page.route(`${ORIGIN}/assets/js/kwc-deeplink.js`, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(DIST, 'assets/js/kwc-deeplink.js')) }))
    await page.route(`${ORIGIN}/vendor/walletconnect/**`, r => {
      const rel = new URL(r.request().url()).pathname.replace(/^\//, '')
      const f = path.join(DIST, rel)
      return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: f.endsWith('.json') ? 'application/json' : 'text/javascript', body: fs.readFileSync(f) }) : r.continue()
    })
  }
  await page.addInitScript(() => {
    // the phone's view of each redirect: recorded, not followed
    window.__opened = []
    window.open = function (url, target) { window.__opened.push([String(url), target || null]); return null }
    document.hasFocus = () => true                 // the sign client skips the redirect on an unfocused page
    window.__diag = []
    window.kdiag = (m, d) => { window.__diag.push([m, d]) }
    window.__wc = {}
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      try { const k = key !== undefined ? key : value && value.key; if (typeof k === 'string' && k.startsWith('wc@2')) window.__wc[k] = value } catch (e) {}
      return put.apply(this, arguments)
    }
  })
  try {
    await page.goto(FIX, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.WC && !!window.WC.__katomiaDeeplinkFix, null, { timeout: 30000 })
    await page.evaluate(async () => { await window.WC.ensureNetwork('testnet') })
    page.evaluate(async () => { try { await window.WC.connect() } catch (e) { window.__connectError = String(e && e.message || e) } }).catch(() => {})
    let uri = null
    for (let i = 0; i < 120 && !uri; i++) { uri = await page.evaluate(HOOK_URI); if (!uri) await page.waitForTimeout(500) }
    if (!uri) throw new Error('no pairing URI: ' + (await page.evaluate(() => window.__connectError || '')))
    // pair — with ONE retry on a fresh pairing, as phpjabbers qa/kwallet does: the handoff can
    // lose the proposal (kwallet run 21; this suite's CI run 106), and "tap Connect again" is what
    // a person does
    let accounts = []
    for (let attempt = 1; attempt <= 2 && !accounts.includes(ACCOUNT); attempt++) {
      if (attempt > 1) {
        log('no session after the first pairing — connecting again for a fresh one')
        const old = uri; uri = null
        page.evaluate(async () => { try { await window.WC.connect() } catch (e) { window.__connectError = String(e && e.message || e) } }).catch(() => {})
        for (let i = 0; i < 60 && (!uri || uri === old); i++) { uri = await page.evaluate(HOOK_URI); if (!uri || uri === old) await page.waitForTimeout(500) }
        if (!uri || uri === old) break
      }
      await sim.pair(uri).catch(e => log('pair() threw', e.message))
      for (let i = 0; i < 40 && !accounts.includes(ACCOUNT); i++) {
        accounts = await page.evaluate(async () => { try { return (await window.WC.getAccounts()) || [] } catch (e) { return [] } })
        if (!accounts.includes(ACCOUNT)) await page.waitForTimeout(500)
      }
    }
    if (!accounts.includes(ACCOUNT)) throw new Error('no session: ' + JSON.stringify({ accounts, proposals: sim.state.proposals, errors: sim.state.errors }))
    await page.evaluate(a => { try { window.WC.setActiveAccount?.(a) } catch (e) {} }, ACCOUNT)
    const pairingTopic = uri.slice(3, uri.indexOf('@'))
    // what the modal stores on Android after the pairing (CoreUtil.setWalletConnectAndroidDeepLink)
    await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [CHOICE, { href: uri.split('?')[0], name: 'Android' }])
    if (before) await before(page)
    const sessionKeys = await page.evaluate(() => new Promise(res => {
      const q = indexedDB.open('WALLET_CONNECT_V2_INDEXED_DB')
      q.onsuccess = () => { try { const r = q.result.transaction('keyvaluestorage', 'readonly').objectStore('keyvaluestorage').getAllKeys(); r.onsuccess = () => { q.result.close(); res(r.result.filter(k => /session$/.test(String(k)))) } } catch (e) { res(['ERR ' + e.message]) } }
      q.onerror = () => res(['ERR open'])
    }))
    for (let n = 1; n <= 2; n++) {
      const bytes = frozenTx()
      const r = await page.evaluate(async ({ a, b }) => {
        window.__opened.length = 0
        try { const s = await window.WC.signTx({ accountId: a, transactionBytes: new Uint8Array(b) }); await new Promise(x => setTimeout(x, 300)); return { hex: s.signedTransactionHex, opened: window.__opened.slice() } }
        catch (e) { return { error: String(e && e.message || e), opened: window.__opened.slice() } }
      }, { a: ACCOUNT, b: bytes })
      let verifies = false
      if (r.hex) {
        const back = Transaction.fromBytes(Buffer.from(r.hex, 'hex'))
        const pub = PublicKey.fromString(sim.publicKeyHex)
        const mine = (back._signedTransactions.list[0]?.sigMap?.sigPair || []).find(p => Buffer.from(p.pubKeyPrefix).toString('hex') === Buffer.from(pub.toBytesRaw()).toString('hex'))
        verifies = !!mine && pub.verify(back._signedTransactions.list[0].bodyBytes, mine.ed25519)
      }
      const topic = sim.state.sessions[0]
      ok(verifies, `request ${n}: the wallet signed and the signature verifies`, JSON.stringify({ error: r.error, sim: sim.state.errors }))
      const want = expect({ topic, pairingTopic })
      ok(r.opened.length === 1 && want.test(r.opened[0][0]), `request ${n}: exactly one redirect, ${want}`, JSON.stringify(r.opened))
    }
    ok(sessionKeys.includes('wc@2:client:0.3:session'), 'WalletConnect stores the sessions under "wc@2:client:0.3:session" (the shim reads that form)', JSON.stringify(sessionKeys))
    const dg = await page.evaluate(() => window.__diag.filter(x => /^wc:(redirect|deeplink)/.test(x[0])).map(x => x[0] + ' ' + JSON.stringify(x[1])))
    log('diag:', dg.join(' | ').slice(0, 600))
    ok(!errs.length, 'no page errors', JSON.stringify(errs))
  } catch (e) {
    ok(false, name + ' ran to the end', e.message + ' | console: ' + consoleTail.slice(-8).join(' / '))
  } finally {
    try { await page.evaluate(async () => { try { await window.WC.disconnect() } catch (e) {} }) } catch {}
    await ctx.close()
    await sim.disconnectAll().catch(() => {})
  }
}

async function main() {
  const cfg = await (await fetch(`${ORIGIN}/vendor/walletconnect/config.json`)).json().catch(() => null)
    || JSON.parse(fs.readFileSync(path.join(DIST, 'vendor/walletconnect/config.json'), 'utf8'))
  log('origin', ORIGIN, LIVE ? '(deployed shim)' : '(this commit\'s shim)', 'relay', cfg.relayUrl)
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})   // CHROMIUM_PATH: a preinstalled browser (the cloud sandbox)
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    await scenario(browser, cfg, '1. HashPack on Android: each request opens hashpack://', {
      metadata: HASHPACK,
      expect: ({ topic }) => new RegExp(`^hashpack://wc\\?requestId=\\d+&sessionTopic=${esc(topic)}$`),
    })
    await scenario(browser, cfg, '2. a phone left with WC-ANDROIDLINK1\'s href:null is repaired', {
      metadata: HASHPACK,
      before: page => page.evaluate(k => localStorage.setItem(k, JSON.stringify({ href: null, name: 'HashPack', note: 'redirect skipped' })), CHOICE),
      expect: ({ topic }) => new RegExp(`^hashpack://wc\\?requestId=\\d+&sessionTopic=${esc(topic)}$`),
    })
    await scenario(browser, cfg, '3. ?wclink=wc: this phone is back on the baseline wc: redirect', {
      metadata: HASHPACK,
      before: page => page.evaluate(() => localStorage.setItem('katomia.wc.link', 'wc')),
      expect: ({ topic, pairingTopic }) => new RegExp(`^wc:${esc(pairingTopic)}@2/wc\\?requestId=\\d+&sessionTopic=${esc(topic)}$`),
    })
    await scenario(browser, cfg, '4. a wallet that is not HashPack and publishes no link keeps the wc: link', {
      metadata: KWALLET,
      expect: ({ topic, pairingTopic }) => new RegExp(`^wc:${esc(pairingTopic)}@2/wc\\?requestId=\\d+&sessionTopic=${esc(topic)}$`),
    })
  } finally { await browser.close() }
  console.log(`\n${total - failed}/${total} passed` + (failed ? ` — ${failed} FAILED` : ''))
  process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
