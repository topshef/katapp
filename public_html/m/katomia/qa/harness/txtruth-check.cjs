// txtruth-check.cjs — TXTRUTH-01: never guess a FAILED verdict.
//
// BOARD-TXTRUTH1 (2026-08-07): the per-tx receipt socket (createTxSocket) had no
// reconnect; a drop between sig-save and receipt lost the receipt forever, and
// the vanish-from-pending fallback GUESSED "failed" — three false FAILURE
// verdicts on settled transactions led to a real mainnet double spend. The fix
// (79858f4) confirms on chain instead of guessing. This harness recreates the
// incident's exact condition on testnet: run the full HBARXFER flow, then
// SEVER the /live receipt socket right after Sign (and starve reconnects), and
// assert the board still reaches a TRUTHFUL success — from the backend-state
// broadcast (🛰) or the mirror (⛓), never a guessed FAILED.
//
// Env (set by txtruth-cron.sh): GAME, KWALLET_TOKEN, BASE?, TRIGGER?
const { chromium } = require("/opt/kwallet/node_modules/playwright")

const GAME = process.env.GAME
const BASE   = (process.env.BASE || "https://lab22.kpay.uk").replace(/\/+$/, "")
const PREFIX = process.env.BOARD_PREFIX || (/katlab|swap\.kpay\.live|lab22\.kpay\.uk/.test(BASE) ? "/m/katomia" : "")
const BOARD  = `${BASE}${PREFIX}/board/${GAME}?skin=ring16`
const KWALLET_BASE = "http://127.0.0.1:8790"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const RECIPIENT = process.env.RECIPIENT || "0.0.5200540"
const AMOUNT_H = "0.01"
const TRIGGER = process.env.TRIGGER || "manual"
const INSTANCE = "TXTRUTH-01"
const log = (...a) => console.log(new Date().toISOString(), "[txtruth]", ...a)

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
  for(let i = 0; i < 40; i++){
    const uri = await page.evaluate(`(${URI_FINDER})()`).catch(() => null)
    if(uri) return uri
    await page.waitForTimeout(500)
  }
  return null
}
async function kwallet(path, body){
  const r = await fetch(KWALLET_BASE + path, { method: "POST",
    headers: { "content-type": "application/json", "x-kwallet-token": KWALLET_TOKEN },
    body: JSON.stringify(body || {}) })
  return r.json()
}
let RUN_ID = null, SITE_COMMIT = null
async function reportKflow(checkpoint, v, detail){
  if(!RUN_ID) RUN_ID = "txtruth-" + Date.now().toString(36)
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

  const pageA = await (await browser.newContext()).newPage()
  pageA.on("dialog", d => d.accept(AMOUNT_H))
  pageA.on("pageerror", e => log("A PAGEERROR", String(e).slice(0, 200)))
  await pageA.addInitScript(() => { window.__katomiaTestHooks = true })
  // katomiaDiagSend mirrors every diag event to console.debug — capture the
  // stream node-side (boardDiag is a const, so wrapping window bindings can't
  // intercept it; the console mirror is the honest tap).
  const DIAG = []
  pageA.on("console", async m => {
    try {
      if(m.type() !== "debug") return
      const args = m.args()
      if(!args.length || !(await args[0].jsonValue()).startsWith?.("[katomiaDiag]")) return
      const msg = args[1] ? await args[1].jsonValue() : ""
      const data = args[2] ? await args[2].jsonValue().catch(() => null) : null
      DIAG.push({ t: Date.now(), m: msg, d: data })
    } catch {}
  })
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
  await pageA.waitForTimeout(2000)
  if(await pageA.locator("#addAcctJoinAll").count()) await pageA.locator("#addAcctJoinAll").click()
  await pageA.waitForTimeout(2000)
  const acctA = await pageA.evaluate(() => (typeof getAccounts === "function" ? getAccounts() : [])
    .filter(a => typeof isMyAccount === "function" && isMyAccount(a))[0]?.id)
  log("[A] sender account:", acctA)
  if(!acctA) throw new Error("sender never landed")

  const pageB = await (await browser.newContext()).newPage()
  pageB.on("pageerror", e => log("B PAGEERROR", String(e).slice(0, 200)))
  log("[B] open board (second player)")
  await pageB.addInitScript(() => { window.__katomiaTestHooks = true })
  await pageB.goto(BOARD, { waitUntil: "domcontentloaded" })
  await pageB.waitForTimeout(2000)
  await pageB.locator("button.ring-footer-accsel").first().click({ timeout: 10000 })
  await pageB.waitForTimeout(500)
  await pageB.fill("#addAcctManual", RECIPIENT)
  await pageB.click("#addAcctManualUse")
  await pageB.waitForTimeout(1000)
  if(await pageB.locator("#addAcctJoinAll").count()) await pageB.locator("#addAcctJoinAll").click()
  await pageB.waitForTimeout(2000)
  const acctB = await pageB.evaluate(() => (typeof getAccounts === "function" ? getAccounts() : [])
    .filter(a => typeof isMyAccount === "function" && isMyAccount(a))[0]?.id)
  log("[B] recipient account:", acctB)
  if(!acctB) throw new Error("recipient never landed")

  await pageA.waitForTimeout(1500)
  log("[A] offer via asset card")
  const opened = await pageA.evaluate(senderId => {
    const chip = document.querySelector(
      `[data-testid="chip"][data-chip-role="store"][data-owner-account="${senderId}"][data-asset-id="HBAR"]`)
    if(!chip) return "no store chip for sender"
    chip.click()
    return true
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
    if(!target) return "no offer target for recipient"
    target.click()
    return true
  }, [acctB, AMOUNT_H])
  if(clicked !== true) throw new Error(String(clicked))
  await pageA.waitForTimeout(2000)

  log("[A] lock"); await pageA.locator('[data-testid="lock"]').first().click()
  await pageA.waitForTimeout(1000)
  log("[B] lock"); await pageB.locator('[data-testid="lock"]').first().click()
  await pageB.waitForTimeout(1500)

  log("[A] waiting for signing phase")
  await pageA.waitForFunction(() => { try { return typeof boardSigning !== "undefined" && !!boardSigning } catch { return false } }, { timeout: 30000 }).catch(() => {})
  await pageA.waitForTimeout(500)
  await pageA.locator('[data-testid="sign"]').first().click()
  log("[A] Sign clicked — severing the per-tx receipt socket in 300ms")

  // THE INCIDENT CONDITION: kill between sig-save and receipt. _boardTxSocket
  // is the board's per-tx wrapper (katomia-board.js boardCreateTxSocket);
  // wrapper.close() sets its closed flag, so its own reconnect loop stops —
  // exactly the vendor-socket-with-no-reconnect shape of BOARD-TXTRUTH1. The
  // game-state socket is untouched: backend broadcast stays a legitimate
  // truth path. The signature itself travels over HTTPS, unaffected.
  await pageA.waitForTimeout(300)
  const severed = await pageA.evaluate(() => {
    if(typeof _boardTxSocket === "undefined" || !_boardTxSocket) return "no per-tx socket to sever"
    try { _boardTxSocket.close() } catch(e){ return "close threw: " + e.message }
    return "severed"
  })
  log("sever result:", severed)
  if(severed !== "severed"){
    await reportKflow("test:verdict", "error", { source: "auto", instance: INSTANCE,
      note: "could not recreate the incident condition — " + severed })
    await browser.close()
    process.exit(1)
  }

  // Now the board must tell the truth WITHOUT the socket: success via the
  // backend game-state broadcast or the mirror — and never a guessed FAILED.
  let outcome = null, tries = 0
  while(tries++ < 120 && !outcome){
    const txt = await pageA.evaluate(() => document.body.innerText)
    if(txt.includes("Transaction successful")) outcome = "success"
    else if(txt.includes("Transaction failed or expired")) outcome = "false-fail"
    await pageA.waitForTimeout(1000)
  }
  const shown = DIAG.filter(e => e.m === "board:result:shown").map(e => e.d)
  const secs = Math.round((Date.now() - t0) / 1000)
  log("outcome:", outcome, "result:shown events:", JSON.stringify(shown))
  await pageA.screenshot({ path: "/var/www/swap.kpay.live-katlab/lab1/logs/qa/txtruth-final.png" })

  const src = shown[0]?.source || "?"
  let v, note
  if(outcome === "success" && src !== "socket"){
    v = "pass"
    note = `receipt socket severed post-sign; truthful success via "${src}" in ${secs}s — no guessed FAILED`
  } else if(outcome === "success"){
    v = "error"
    note = `success shown but source="${src}" — the socket delivered a receipt after severing; harness condition not achieved`
  } else if(outcome === "false-fail"){
    v = "fail"
    note = `BOARD-TXTRUTH1 REGRESSION: FAILED verdict shown with the receipt socket dead — verdict was guessed, not confirmed (sources seen: ${shown.map(x => x.source).join(",") || "none"})`
  } else {
    v = "error"
    note = `no verdict within ${secs}s with the socket severed — board went silent instead of consulting backend-state/mirror`
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
