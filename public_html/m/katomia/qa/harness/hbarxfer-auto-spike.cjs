// hbarxfer-full2.cjs -- QA-UXGRID1 HBARXFER, complete automated run, v2.
// Finding from v1: makeWedge() only calls setupDropTarget when !isMine --
// an account's OWN wedges never get a click handler, so own-to-own offers
// are not completable via the board's tap-to-offer path. Fix: TWO real
// players (two browser contexts), sender (kWallet WC) + recipient (manual
// entry, its own anon player) -- the natural case anyway.
const { chromium } = require("/opt/kwallet/node_modules/playwright")

const GAME = process.env.GAME
const BOARD = `https://lab1.katlab.kpay.live/m/katomia/board/${GAME}?skin=ring16`
const KWALLET_BASE = "http://127.0.0.1:8790"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const RECIPIENT = process.env.RECIPIENT || "0.0.5200540"
const AMOUNT_H = "0.01"
const log = (...a) => console.log(new Date().toISOString(), "[hbarxfer]", ...a)

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
// BUG FOUND (first live run): a fresh run id + empty commit PER CALL split
// every automated run into two disconnected rows (start-only "open" +
// verdict-only) and the grid's commits list does `.filter(Boolean)`, which
// silently drops an empty-string commit -- the verdict row existed in the
// data but had no column to render in. Fixed: one shared run id for the
// whole script + the REAL current site commit (fetched once).
let RUN_ID = null, SITE_COMMIT = null
async function reportKflow(checkpoint, v, detail){
  if(!RUN_ID) RUN_ID = "hbarxfer-" + Date.now().toString(36)
  if(SITE_COMMIT === null) SITE_COMMIT = await fetch("https://lab1.katlab.kpay.live/m/katomia/qa/results.php?days=1")
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch("https://lab1.katlab.kpay.live/kflow", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit: SITE_COMMIT, detail }] }) })
}

async function main(){
  const t0 = Date.now()
  const browser = await chromium.launch()

  // ── PLAYER A (sender): kWallet via WalletConnect ──
  const pageA = await (await browser.newContext()).newPage()
  pageA.on("dialog", d => d.accept(AMOUNT_H))
  pageA.on("pageerror", e => log("A PAGEERROR", String(e).slice(0, 200)))
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

  // ── PLAYER B (recipient): a SEPARATE player, manual entry, no wallet ──
  const pageB = await (await browser.newContext()).newPage()
  pageB.on("pageerror", e => log("B PAGEERROR", String(e).slice(0, 200)))
  log("[B] open board (second player)")
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

  // ── A sees B (a real other player now) -- offer AMOUNT_H HBAR ──
  await pageA.waitForTimeout(1500)   // let A's board pick up B's broadcasted join
  log("[A] tap HBAR chip")
  await pageA.evaluate((senderId) => {
    const chip = [...document.querySelectorAll(".asset")].find(el =>
      el.dataset.assetId === "HBAR" && el.dataset.ownerAccount === senderId &&
      !el.classList.contains("basket") && !el.classList.contains("reserved"))
    if(!chip) throw new Error("no HBAR store chip for sender")
    chip.click()
  }, acctA)
  await pageA.waitForTimeout(500)
  log("[A] tap B's wedge (now a real drop target -- setupDropTarget only binds for !isMine)")
  // coordinate-based clicking kept missing the wedge's clip-path polygon
  // (a wide pie slice's bounding-BOX corners often sit OUTSIDE the actual
  // clipped sector, and the box centre sits on the intercepting hub) --
  // .click() called IN-PAGE on the element itself dispatches a MouseEvent
  // with target===el directly, satisfying the handler's `e.target !== el`
  // guard with no hit-testing/clip-path/z-order involved at all.
  const clicked = await pageA.evaluate((accountId) => {
    const el = document.querySelector(`.board-wedge[data-drop-account="${accountId}"]`)
    if(!el) return false
    el.click()
    return true
  }, acctB)
  log("in-page wedge click dispatched:", clicked)
  await pageA.waitForTimeout(2000)

  // BOARD-COUNTERMODE1 (2026-08-04, "simple counter" now the default): when
  // part of a stack is offered but some remains in the store, the .reserved
  // ghost chip is suppressed and the remainder pile gets .board-rimpile
  // instead (see boardStoreChips/boardReservedChips in katomia-board.js) —
  // check both, since a fresh automated player has no saved counterMode
  // pref and lands in "simple" mode. Found 2026-08-05: this harness only
  // checked .reserved and had been silently erroring every 2h since the
  // mode-default flip landed (~08:01 UTC 2026-08-04), unnoticed for a day.
  const offered = await pageA.evaluate((senderId) =>
    !!document.querySelector(
      `.asset.reserved[data-owner-account="${senderId}"][data-asset-id="HBAR"], ` +
      `.asset.board-rimpile[data-owner-account="${senderId}"][data-asset-id="HBAR"]`), acctA)
  log("offer ghost present:", offered)
  if(!offered) throw new Error("offer never registered")

  // ── lock both accounts (local intent key, no wallet on either side) ──
  log("[A] lock")
  await pageA.locator("button.ring-footer-lock").first().click()
  await pageA.waitForTimeout(1000)
  log("[B] lock")
  await pageB.waitForTimeout(1000)   // let B's board pick up the offer first
  await pageB.locator("button.ring-footer-lock").first().click()
  await pageB.waitForTimeout(1500)

  // ── strike auto-fires (txDelaySeconds:0) once BOTH are locked. Finding
  // (v2 run 1): locking does NOT itself sign anything -- once the strike
  // starts the signing phase, the SAME footer button becomes "✍ Sign"
  // (boardSigning ? Sign : Lock, per the code: the lock slot IS the sign
  // slot in the next phase) and needs its OWN click to actually invoke
  // boardDirectSign -> the WC request kWallet auto-signs. A locks-then-
  // walks-away run never sends anything to sign, expires silently at 40s.
  log("[A] waiting for the signing phase, then clicking Sign")
  await pageA.waitForFunction(() => window.boardSigning, { timeout: 15000 }).catch(() => {})
  await pageA.waitForTimeout(500)
  await pageA.locator("button.ring-footer-lock").first().click()
  log("[A] Sign clicked")

  // ── poll A's toast for the verdict ──
  log("waiting for kWallet auto-sign -> result toast")
  let success = null, tries = 0
  while(tries++ < 50){
    const txt = await pageA.evaluate(() => document.body.innerText)
    if(txt.includes("Transaction successful")){ success = true; break }
    if(txt.includes("Transaction failed or expired")){ success = false; break }
    await pageA.waitForTimeout(1000)
  }
  log("success:", success, "elapsed s:", Math.round((Date.now() - t0) / 1000))
  await pageA.screenshot({ path: "/tmp/claude-0/-var-www-swap-kpay-live-katlab-lab1/b5bfcda0-bcef-438f-9776-811088e67443/scratchpad/hbarxfer-final.png" })

  const verdict = success === true ? "pass" : success === false ? "fail" : "error"
  await reportKflow("test:start", "HBARXFER-01", { source: "auto", instance: "HBARXFER-01" })
  await reportKflow("test:verdict", verdict, {
    source: "auto", instance: "HBARXFER-01",
    note: `automated run, game ${GAME}, sender ${acctA} -> ${acctB}, ${AMOUNT_H} HBAR` +
      (success === null ? " (no result toast within timeout)" : ""),
    secs: Math.round((Date.now() - t0) / 1000)
  })
  log("reported test:verdict", verdict)
  await browser.close()
  process.exit(success === true ? 0 : 1)
}
main().catch(async e => {
  console.error("FATAL", e.message)
  await reportKflow("test:start", "HBARXFER-01", { source: "auto", instance: "HBARXFER-01" }).catch(() => {})
  await reportKflow("test:verdict", "error", { source: "auto", instance: "HBARXFER-01", note: String(e.message).slice(0, 300) }).catch(() => {})
  process.exit(1)
})
