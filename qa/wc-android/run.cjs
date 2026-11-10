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
//   5. deaf link    WC-DEAFSOCKET1 F1, desktop: the page's relay socket is made deaf (incoming wallet
//                   messages dropped, socket still 'connected', as on 9 Nov 21:15–21:20Z); a ping must
//                   fail, then a sign must come back anyway — F1 restarts the transport, the wallet
//                   answers a second ping, the request is re-sent — well inside a 30 s window
//   6. hidden page  the same deafness on a HIDDEN page (a phone, wallet in front): F1 must not act
//                   (no restart; R1/R2 broke phone signing by acting on failed pings)
//   7. swallowed    deaf, and every message is acknowledged before it is dropped, so the relay never
//                   redelivers: only F1's second ping + resend can bring the signature back
//   8. phone        F1-MOBILE1: the same swallowed case on an Android page that stays VISIBLE (as during
//                   order auto-sign): F1 reconnects but must NOT resend — no duplicate in the wallet
//
// What it cannot tell: whether Android hands hashpack:// to HashPack and HashPack answers. That
// only a phone can say; the diag log does (wc:redirect, then board:sign:saved).
//
// Needs the relay (relay.walletconnect.com) — CI, not the cloud sandbox (its proxy refuses it).
// Env: ORIGIN (https://lab1.katomia.com), LIVE=1 to use the origin's deployed shim instead of this
// commit's, KWC_PIN (925d5d2), QA_KWALLET_ACCOUNT (0.0.10325114).
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
const KWC_PIN = process.env.KWC_PIN || '925d5d2'
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

function frozenTx(validS) {
  const t = new TransferTransaction()
  if (validS) t.setTransactionValidDuration(validS)   // deaf scenarios: a short window bounds the cap
  return Array.from(t
    .addHbarTransfer(AccountId.fromString(ACCOUNT), Hbar.fromTinybars(-1))
    .addHbarTransfer(AccountId.fromString('0.0.98'), Hbar.fromTinybars(1))
    .setTransactionId(TransactionId.generate(AccountId.fromString(ACCOUNT)))
    .setNodeAccountIds([new AccountId(3)])
    .setTransactionMemo('WC-ANDROID-QA1 never submitted')
    .freeze().toBytes())
}

async function scenario(browser, cfg, name, { metadata, before, expect, desktop, run }) {
  console.log(name)
  const sim = await createWalletSim({ projectId: cfg.projectId, relayUrl: cfg.relayUrl, accountId: ACCOUNT, metadata,
    storagePath: path.join(os.tmpdir(), `wc-android-${process.pid}-${total}.db`) })
  const ctx = desktop ? await browser.newContext({ viewport: { width: 1280, height: 800 } })
    : await browser.newContext({ userAgent: UA, viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })
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
    // deaf scenarios: let the test report the page hidden (a phone with the wallet in front)
    window.__vis = 'visible'
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return window.__vis } })
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
    if (run) { await run(page, sim); ok(!errs.length, 'no page errors', JSON.stringify(errs)); return }
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


// WC-DEAFSOCKET1: make the page's relay socket deaf the way it was on 9 Nov — still "connected",
// but every incoming wallet message (sign answers, ping answers) goes nowhere — until the next
// reconnect, which is exactly what cured it live. Payloads are dropped at the relayer's
// onProviderPayload (an own property shadows the class method its payload handler calls).
// mode 'drop': nothing is acknowledged, so the relay REDELIVERS after a reconnect (CI run 162
// showed the restart alone then recovers the answer). mode 'ack': each message is acknowledged
// and dropped — the relay thinks it was delivered and never sends it again, the worst case, which
// only F1's resend can recover.
const DEAFEN = mode => {
  const r = window.WC.qaRelayer && window.WC.qaRelayer()
  if (!r) return 'no qaRelayer (bundle without WC-DEAFSOCKET1)'
  window.__dropped = 0
  r.onProviderPayload = async function (e) {
    window.__dropped++
    if (mode === 'ack' && e && typeof e.method === 'string' && e.method.endsWith('_subscription')) { try { await this.acknowledgePayload(e) } catch (x) {} }
  }
  if (!r.__qaCure) { r.__qaCure = true; r.on('relayer_connect', () => { delete r.onProviderPayload; window.__cured = (window.__cured || 0) + 1 }) }
  return 'deaf'
}
const deafDiag = page => page.evaluate(() => window.__diag.filter(x => /^wc:(deaf|session:ping|relay)/.test(x[0])).map(x => [x[0], x[1]]))
async function signDeaf(page, sim, validS) {
  const bytes = frozenTx(validS)
  const t0 = Date.now()
  const r = await page.evaluate(async ({ a, b }) => {
    try { const s = await window.WC.signTx({ accountId: a, transactionBytes: new Uint8Array(b) }); return { hex: s.signedTransactionHex } }
    catch (e) { return { error: String(e && e.message || e) } }
  }, { a: ACCOUNT, b: bytes })
  let verifies = false
  if (r.hex) {
    const back = Transaction.fromBytes(Buffer.from(r.hex, 'hex'))
    const pub = PublicKey.fromString(sim.publicKeyHex)
    const mine = (back._signedTransactions.list[0]?.sigMap?.sigPair || []).find(p => Buffer.from(p.pubKeyPrefix).toString('hex') === Buffer.from(pub.toBytesRaw()).toString('hex'))
    verifies = !!mine && pub.verify(back._signedTransactions.list[0].bodyBytes, mine.ed25519)
  }
  return { ...r, verifies, ms: Date.now() - t0 }
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
    await scenario(browser, cfg, '5. desktop: a deaf relay link is recovered (WC-DEAFSOCKET1 F1)', {
      metadata: HASHPACK, desktop: true,
      run: async (page, sim) => {
        // healthy first: a sign comes straight back
        const warm = await signDeaf(page, sim, 30)
        ok(warm.verifies, 'healthy link: the wallet signed', JSON.stringify(warm))
        ok((await page.evaluate(DEAFEN, 'drop')) === 'deaf', 'the link is made deaf (unacknowledged)')
        const ping = await page.evaluate(() => window.WC.pingSession())
        ok(ping.ok === false, 'deaf link: a ping to the wallet fails (the 9 Nov symptom reproduced)', JSON.stringify(ping))
        // (a direct ping does not trigger F1 — only a ping inside a sign does — so no cooldown to wait out)
        const r = await signDeaf(page, sim, 30)
        await page.waitForTimeout(5000)   // let F1 finish its own steps after the sign settled, for the log
        const dg = await deafDiag(page)
        log('deaf diag:', JSON.stringify(dg).slice(0, 900))
        ok(r.verifies, `deaf link: the sign still came back and verifies (${r.ms} ms)`, JSON.stringify({ r, dg }))
        ok(r.ms < 25000, 'well inside the 30 s validity window', r.ms)
        ok(dg.some(x => x[0] === 'wc:deaf:restart'), 'F1 restarted the transport', JSON.stringify(dg))
        const cured = await page.evaluate(() => ({ dropped: window.__dropped, cured: window.__cured || 0 }))
        ok(cured.dropped > 0 && cured.cured > 0, 'messages really were dropped, and the reconnect cured it', JSON.stringify(cured))
        log('answered by:', dg.some(x => x[0] === 'wc:deaf:resend-answered' && !x[1].settledAlready) ? 'the resend' : 'the original request (relay redelivered after the reconnect)')
        const after = await signDeaf(page, sim, 30)
        ok(after.verifies && after.ms < 5000, `after recovery the next sign is quick (${after.ms} ms)`, JSON.stringify(after))
      },
    })
    await scenario(browser, cfg, '6. hidden page (a phone, wallet in front): F1 leaves a deaf link alone', {
      metadata: HASHPACK, desktop: true,
      run: async (page, sim) => {
        ok((await page.evaluate(DEAFEN, 'drop')) === 'deaf', 'the link is made deaf')
        await page.evaluate(() => { window.__vis = 'hidden' })
        const r = await signDeaf(page, sim, 20)
        const dg = await deafDiag(page)
        log('hidden diag:', JSON.stringify(dg).slice(0, 600))
        ok(!r.verifies && /KWC-TIMEOUT/.test(r.error || ''), 'no answer, ends at the window as before (KWC-TIMEOUT)', JSON.stringify(r))
        ok(dg.some(x => x[0] === 'wc:deaf:skip' && x[1].reason === 'skip-hidden'), 'F1 saw the hidden page and stood aside', JSON.stringify(dg))
        ok(!dg.some(x => x[0] === 'wc:deaf:restart'), 'no transport restart on a hidden page', JSON.stringify(dg))
      },
    })

    await scenario(browser, cfg, '7. desktop: a deaf link that SWALLOWED the answer is recovered by the resend', {
      metadata: HASHPACK, desktop: true,
      run: async (page, sim) => {
        ok((await page.evaluate(DEAFEN, 'ack')) === 'deaf', 'the link is made deaf (messages acknowledged, then dropped)')
        const r = await signDeaf(page, sim, 30)
        await page.waitForTimeout(2000)
        const dg = await deafDiag(page)
        log('swallowed diag:', JSON.stringify(dg).slice(0, 900))
        ok(r.verifies, `the sign came back and verifies (${r.ms} ms)`, JSON.stringify({ r, dg }))
        ok(r.ms < 25000, 'well inside the 30 s validity window', r.ms)
        ok(dg.some(x => x[0] === 'wc:deaf:restart'), 'F1 restarted the transport', JSON.stringify(dg))
        ok(dg.some(x => x[0] === 'wc:deaf:ping2' && x[1].ok === true), 'the wallet answered the second ping', JSON.stringify(dg))
        ok(dg.some(x => x[0] === 'wc:deaf:resend-answered' && x[1].settledAlready === false), 'the answer came from the resend', JSON.stringify(dg))
      },
    })

    await scenario(browser, cfg, '8. phone, visible page (order auto-sign): F1 reconnects but never resends (F1-MOBILE1)', {
      metadata: HASHPACK,
      run: async (page, sim) => {
        ok((await page.evaluate(DEAFEN, 'ack')) === 'deaf', 'the link is made deaf (messages acknowledged, then dropped)')
        const signsBefore = sim.state.requests.filter(x => x.method === 'hedera_signTransaction').length
        const r = await signDeaf(page, sim, 20)
        const signsAsked = sim.state.requests.filter(x => x.method === 'hedera_signTransaction').length - signsBefore
        const dg = await deafDiag(page)
        log('phone diag:', JSON.stringify(dg).slice(0, 900))
        ok(dg.some(x => x[0] === 'wc:deaf:restart'), 'F1 reconnected on the visible phone page', JSON.stringify(dg))
        ok(!dg.some(x => x[0] === 'wc:deaf:resend'), 'no resend on a phone', JSON.stringify(dg))
        ok(dg.some(x => x[0] === 'wc:deaf:resend-skipped' && x[1].reason === 'mobile') || dg.some(x => x[0] === 'wc:deaf:ping2' && x[1].ok !== true),
          'the skip is recorded (or the wallet did not answer the second ping)', JSON.stringify(dg))
        ok(!r.verifies && /KWC-TIMEOUT/.test(r.error || ''), 'a swallowed answer is not rescued on a phone: KWC-TIMEOUT at the window, as before F1', JSON.stringify(r))
        ok(signsAsked === 1, `the wallet was asked to sign exactly once — no duplicate waiting in it (${signsAsked})`, signsAsked)
      },
    })
  } finally { await browser.close() }
  console.log(`\n${total - failed}/${total} passed` + (failed ? ` — ${failed} FAILED` : ''))
  process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
