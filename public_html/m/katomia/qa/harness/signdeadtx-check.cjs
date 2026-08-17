// signdeadtx-check.cjs — SIGNDEADTX-01: refuse to sign an expired transaction.
//
// SIGN-DEADTX1 (2026-08-07, mainnet): the widget's 'Sign now' handler had no
// validity check — Sign clicked 39s AFTER the window closed still signed,
// saved, and logged success; the network could never accept it. The fix is the
// txValidity() gate in vendor/kpay/kpool_widget/signer-walletconnect.js. This
// recreates the incident on testnet: drive a real game to the signing phase,
// let the 40s window EXPIRE unsigned, then open the external sign page
// (/m/sign/?txid=…), pair kWallet, click 'Sign now' — and assert the gate
// refuses (expiry alert), no sig is saved, and NO signTx request ever reaches
// the wallet (kWallet stays in manual mode: a request slipping through would
// land as a new pending item, which is itself a fail).
//
// Env (set by signdeadtx-cron.sh): GAME, KWALLET_TOKEN, BASE?, TRIGGER?
const { chromium } = require("/opt/kwallet/node_modules/playwright")

const GAME = process.env.GAME
const BASE   = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const PREFIX = process.env.BOARD_PREFIX || (/katlab|swap\.kpay\.live/.test(BASE) ? "/m/katomia" : "")
const BOARD  = `${BASE}${PREFIX}/board/${GAME}?skin=ring16`
const KWALLET_BASE = "http://127.0.0.1:8790"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const RECIPIENT = process.env.RECIPIENT || "0.0.5200540"
const AMOUNT_H = "0.01"
const TRIGGER = process.env.TRIGGER || "manual"
const INSTANCE = "SIGNDEADTX-01"
const log = (...a) => console.log(new Date().toISOString(), "[signdeadtx]", ...a)

const URI_FINDER = `() => {
  const found = new Set()
  const visit = (root) => {
    const walker = root.querySelectorAll ? root.querySelectorAll('*') : []
    for (const el of walker) {
      for (const a of el.attributes || []) if (a.value && a.value.startsWith('wc:')) found.add(a.value)
      for (const k of ['uri','walletConnectUri','value']) { try { if (typeof el[k]==='string' && el[k].startsWith('wc:')) found.add(el[k]) } catch(e){} }
      if (el.shadowRoot) visit(el.shadowRoot)
    }
  }
  visit(document)
  return [...found][0] || null
}`
async function extractUri(page){
  // search EVERY frame — the v2 sign page renders tx_approval inside an iframe
  for(let i = 0; i < 40; i++){
    for(const f of page.frames()){
      const uri = await f.evaluate(`(${URI_FINDER})()`).catch(() => null)
      if(uri) return uri
    }
    await page.waitForTimeout(500)
  }
  return null
}
async function kwallet(path, body){
  const r = await fetch(KWALLET_BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-kwallet-token": KWALLET_TOKEN },
    body: body === undefined ? undefined : JSON.stringify(body) })
  return r.json()
}
const kwState = () => fetch(`${KWALLET_BASE}/api/state?token=${KWALLET_TOKEN}`).then(r => r.json())
// kWallet stays in MANUAL mode throughout, so SESSION PROPOSALS (pairing) must
// be approved explicitly — while an actual signTx REQUEST arriving as a pending
// item is exactly the regression this test exists to catch, so those are never
// approved and their appearance is a fail.
async function approveProposals(ms){
  const until = Date.now() + ms
  let approved = 0
  while(Date.now() < until){
    const st = await kwState()
    const props = (st.pending || []).filter(p => p.kind === "proposal")
    for(const p of props){
      await kwallet("/api/approve", { id: p.id }).catch(() => {})
      approved++
    }
    if(approved) return approved
    await new Promise(r => setTimeout(r, 700))
  }
  return approved
}
const pendingRequests = st => (st.pending || []).filter(p => p.kind === "request").length

let RUN_ID = null, SITE_COMMIT = null
async function reportKflow(checkpoint, v, detail){
  if(!RUN_ID) RUN_ID = "signdeadtx-" + Date.now().toString(36)
  if(SITE_COMMIT === null) SITE_COMMIT = await fetch(`${BASE}${PREFIX}/qa/results.php?days=1`)
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch(`${BASE}/kflow`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit: SITE_COMMIT,
      detail: { trigger: TRIGGER, ...detail } }] }) })
}

async function main(){
  const t0 = Date.now()
  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })
  const browser = await chromium.launch()

  // ── drive a real game into the signing phase, then let the window die ──
  const pageA = await (await browser.newContext()).newPage()
  pageA.on("dialog", d => d.accept(AMOUNT_H))
  await pageA.addInitScript(() => { window.__katomiaTestHooks = true })
  log("[A] open board")
  await pageA.goto(BOARD, { waitUntil: "domcontentloaded" })
  await pageA.waitForTimeout(2000)
  await pageA.locator("button.ring-footer-accsel").first().click({ timeout: 10000 })
  await pageA.waitForTimeout(500)
  await pageA.locator("#addAcctConnect").click({ timeout: 10000 })
  const uri = await extractUri(pageA)
  if(!uri) throw new Error("no WC URI")
  const pr = await kwallet("/api/pair", { uri })
  if(!pr.ok) throw new Error("pair failed: " + JSON.stringify(pr))
  await approveProposals(8000)
  await pageA.waitForTimeout(2000)
  if(await pageA.locator("#addAcctJoinAll").isVisible().catch(() => false)) await pageA.locator("#addAcctJoinAll").click()
  await pageA.waitForTimeout(2000)
  const acctA = await pageA.evaluate(() => (typeof getAccounts === "function" ? getAccounts() : [])
    .filter(a => typeof isMyAccount === "function" && isMyAccount(a))[0]?.id)
  if(!acctA) throw new Error("sender never landed")
  log("[A] sender:", acctA)

  const pageB = await (await browser.newContext()).newPage()
  await pageB.addInitScript(() => { window.__katomiaTestHooks = true })
  await pageB.goto(BOARD, { waitUntil: "domcontentloaded" })
  await pageB.waitForTimeout(2000)
  await pageB.locator("button.ring-footer-accsel").first().click({ timeout: 10000 })
  await pageB.waitForTimeout(500)
  await pageB.fill("#addAcctManual", RECIPIENT)
  await pageB.click("#addAcctManualUse")
  await pageB.waitForTimeout(1000)
  if(await pageB.locator("#addAcctJoinAll").isVisible().catch(() => false)) await pageB.locator("#addAcctJoinAll").click()
  await pageB.waitForTimeout(2000)
  const acctB = await pageB.evaluate(() => (typeof getAccounts === "function" ? getAccounts() : [])
    .filter(a => typeof isMyAccount === "function" && isMyAccount(a))[0]?.id)
  if(!acctB) throw new Error("recipient never landed")

  await pageA.waitForTimeout(1500)
  const opened = await pageA.evaluate(senderId => {
    const chip = document.querySelector(
      `[data-testid="chip"][data-chip-role="store"][data-owner-account="${senderId}"][data-asset-id="HBAR"]`)
    if(!chip) return "no store chip"
    chip.click(); return true
  }, acctA)
  if(opened !== true) throw new Error(String(opened))
  await pageA.waitForSelector('[data-testid="asset-offer"]', { state: "attached", timeout: 10000 })
  const clicked = await pageA.evaluate(([targetId, amt]) => {
    document.querySelector('[data-testid="asset-offer"]')?.click()
    const input = document.getElementById("assetModalAmount")
    if(!input) return "amount input missing"
    input.value = amt
    input.dispatchEvent(new Event("input", { bubbles: true }))
    const target = document.querySelector(`[data-testid="offer-target"][data-target-account="${targetId}"]`)
    if(!target) return "no offer target"
    target.click(); return true
  }, [acctB, AMOUNT_H])
  if(clicked !== true) throw new Error(String(clicked))
  await pageA.waitForTimeout(2000)
  log("[A]+[B] lock — then DON'T sign")
  await pageA.locator('[data-testid="lock"]').first().click()
  await pageA.waitForTimeout(1000)
  await pageB.locator('[data-testid="lock"]').first().click()
  await pageA.waitForFunction(() => { try { return typeof boardSigning !== "undefined" && !!boardSigning } catch { return false } }, { timeout: 30000 })
  const tx = await pageA.evaluate(() => ({ txid: boardSigning?.tx?.txid, pch: boardSigning?.tx?.pch || "", expiry: boardSigning?.expiry || null }))
  if(!tx.txid) throw new Error("no txid in signing phase")
  log("tx entering signing:", tx.txid, "expiry:", tx.expiry ? new Date(tx.expiry).toISOString() : "?")

  // let the window die (validDurationSeconds is 40 for this game) + margin
  const waitMs = Math.max((tx.expiry || (Date.now() + 45000)) - Date.now() + 10000, 10000)
  log(`waiting ${Math.round(waitMs / 1000)}s for the window to close…`)
  await new Promise(r => setTimeout(r, waitMs))

  // ── the incident: open the external sign page and click 'Sign now' ──
  const before = await kwState()
  const pendingBefore = pendingRequests(before)
  // open the sign page in PLAYER A's context: same origin, so the widget finds
  // the board's existing WC session (exactly the incident's shape — the user's
  // wallet was already connected) and renders 'Sign now' without a fresh pair.
  const signPage = await pageA.context().newPage()
  const dialogs = [], wdiag = []
  signPage.on("dialog", async d => { dialogs.push(d.message()); await d.dismiss().catch(() => {}) })
  signPage.on("console", m => { const t = m.text(); if(/kdiag|signer:|katomiaDiag/i.test(t)) wdiag.push(t.slice(0, 200)) })
  const signUrl = `${BASE}/m/sign/?network=testnet&txid=${encodeURIComponent(tx.txid)}&pch=${encodeURIComponent(tx.pch)}`
  log("open sign page:", signUrl)
  await signPage.goto(signUrl, { waitUntil: "domcontentloaded" })
  await signPage.waitForTimeout(4000)
  // the v2 sign page auto-opens ?txid= in a MODAL that IFRAMES tx_approval —
  // everything (pair button, widget, 'Sign now') lives inside that frame.
  const inAnyFrame = sel => {
    for(const f of signPage.frames()){
      const l = f.locator(sel).first()
      if(l) return l
    }
    return null
  }
  const frameWith = async (sel, ms) => {
    const until = Date.now() + ms
    while(Date.now() < until){
      for(const f of signPage.frames()){
        if(await f.locator(sel).first().isVisible().catch(() => false)) return f.locator(sel).first()
      }
      await signPage.waitForTimeout(500)
    }
    return null
  }
  // the widget's own flow: a 'Connect' button (kpsign-btn) → wc.connect() puts
  // up the pairing URI → pair kWallet + approve the proposal → the signer UI
  // re-renders with the per-account 'Sign now'.
  const connectBtn = await frameWith('.kpsign-btn:has-text("Connect"), button:has-text("Connect")', 15000)
  if(connectBtn){
    log("clicking widget Connect")
    await connectBtn.click().catch(() => {})
    const uri2 = await extractUri(signPage)
    if(uri2){
      const pr2 = await kwallet("/api/pair", { uri: uri2 })
      log("sign-page pair:", pr2.ok ? "ok" : JSON.stringify(pr2))
      await approveProposals(12000)
      await signPage.waitForTimeout(3000)
    } else log("no pairing URI after Connect (may already be paired)")
  } else log("no Connect button — widget may already hold a session")
  const signBtn = await frameWith('.kpsign-btn:has-text("Sign now"), button:has-text("Sign now")', 30000)
  if(!signBtn) throw new Error("'Sign now' never appeared in any frame")
  log("clicking 'Sign now' on the expired tx")
  await signBtn.click()
  await signPage.waitForTimeout(8000)
  if(!dialogs.length){
    log("no dialogs — widget console trail:", JSON.stringify(wdiag.slice(-10)))
    const bodyTxt = await signPage.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => "?")
    log("sign page text:", bodyTxt.replace(/\n+/g, " | "))
  }

  const after = await kwState()
  const pendingAfter = pendingRequests(after)
  const expiredAlert = dialogs.find(d => /expired .*window has closed/i.test(d) || /expired \d+s ago/i.test(d))
  const savedAlert = dialogs.find(d => /failed to save|successful/i.test(d))
  const secs = Math.round((Date.now() - t0) / 1000)
  log("dialogs:", JSON.stringify(dialogs))
  log(`kWallet signTx requests before/after: ${pendingBefore}/${pendingAfter}`)

  let v, note
  if(expiredAlert && pendingAfter <= pendingBefore){
    v = "pass"
    note = `gate refused the dead tx: "${expiredAlert.slice(0, 120)}…" — no wallet round-trip (signTx requests pending ${pendingBefore}→${pendingAfter})`
  } else if(!dialogs.length && pendingAfter > pendingBefore){
    v = "fail"
    note = `SIGN-DEADTX1 REGRESSION: no expiry refusal and a signTx request REACHED the wallet (requests pending ${pendingBefore}→${pendingAfter}) for a tx ${Math.round((Date.now() - (tx.expiry || 0)) / 1000)}s past expiry`
  } else if(!expiredAlert){
    v = "fail"
    note = `no expiry refusal shown (dialogs: ${JSON.stringify(dialogs).slice(0, 200)}); requests pending ${pendingBefore}→${pendingAfter}`
  } else {
    v = "error"
    note = `ambiguous: expiry alert shown but signTx requests grew ${pendingBefore}→${pendingAfter}`
  }
  await reportKflow("test:verdict", v, { source: "auto", instance: INSTANCE, note, secs })
  log("verdict:", v, "—", note)
  await browser.close()
  process.exit(v === "pass" ? 0 : 1)
}
main().catch(async e => {
  console.error("FATAL", e.message)
  await reportKflow("test:verdict", "error", { source: "auto", instance: INSTANCE, note: String(e.message).slice(0, 300) }).catch(() => {})
  process.exit(1)
})
