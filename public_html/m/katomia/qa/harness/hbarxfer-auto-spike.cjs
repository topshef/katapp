// hbarxfer-full2.cjs -- QA-UXGRID1 HBARXFER, complete automated run, v2.
// Finding from v1: makeWedge() only calls setupDropTarget when !isMine --
// an account's OWN wedges never get a click handler, so own-to-own offers
// are not completable via the board's tap-to-offer path. Fix: TWO real
// players (two browser contexts), sender (kWallet WC) + recipient (manual
// entry, its own anon player) -- the natural case anyway.
const { chromium } = require("/opt/kwallet/node_modules/playwright")

const GAME = process.env.GAME
// QA-BENCHFREEZE1 (2026-08-07): the target is a parameter now. This was hardcoded
// to lab1, which is why the only end-to-end signing test could never be pointed at
// pat or production — even though the same suite pointed at app.katomia.com returns
// identical results (proved with the WC harnesses on 2026-08-07). BASE is the site
// root; the board path differs between the seat (/m/katomia/board/x) and the
// standalone bundle (/board/x), so it is derived, not assumed.
//   BASE=https://app.katomia.com node hbarxfer-auto-spike.cjs
const BASE   = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const PREFIX = process.env.BOARD_PREFIX || (/katlab|swap\.kpay\.live/.test(BASE) ? "/m/katomia" : "")
const BOARD  = `${BASE}${PREFIX}/board/${GAME}?skin=ring16`
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
  if(SITE_COMMIT === null) SITE_COMMIT = await fetch(`${BASE}${PREFIX}/qa/results.php?days=1`)
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch(`${BASE}/kflow`, { method: "POST",
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
  // ── OFFER: the non-gestural route (QA-TESTHOOKS1, user-approved 2026-08-07) ──
  // Tap-to-offer was retired on 2026-08-05 (BOARD-DRAGUX1: a tap now INSPECTS,
  // dragging offers), which broke this harness silently for two days. Synthesising
  // a drag is both fiddly and beside the point — what is under test here is the
  // signing mechanics, not the pointer choreography. So the board now carries a
  // hidden, real "Offer to a player…" action on the asset card, and the harness
  // drives that: tap chip → asset card → Offer → amount → target. Same code path
  // as a drop (offerSelectedToAccount), no hit-testing, no prompt().
  log("[A] open the asset card for the HBAR store chip")
  const opened = await pageA.evaluate(senderId => {
    const chip = document.querySelector(
      `[data-testid="chip"][data-chip-role="store"][data-owner-account="${senderId}"][data-asset-id="HBAR"]`)
    if(!chip) return "no HBAR store chip for sender"
    chip.click()
    return true
  }, acctA)
  if(opened !== true) throw new Error(String(opened))
  await pageA.waitForSelector('[data-testid="asset-offer"]', { state: "attached", timeout: 10000 })

  log("[A] Offer to a player… → amount → B")
  const clicked = await pageA.evaluate(([targetId, amt]) => {
    document.querySelector('[data-testid="asset-offer"]')?.click()   // hidden by design — click it directly
    const input = document.getElementById("assetModalAmount")
    if(!input) return "amount input missing"
    input.value = amt
    input.dispatchEvent(new Event("input", { bubbles: true }))
    const target = document.querySelector(
      `[data-testid="offer-target"][data-target-account="${targetId}"]`)
    if(!target) return "no offer target for recipient"
    target.click()
    return true
  }, [acctB, AMOUNT_H])
  if(clicked !== true) throw new Error(String(clicked))
  await pageA.waitForTimeout(2000)

  // BOARD-COUNTERMODE1: which of .reserved / .board-rimpile appears depends on the
  // viewer's counter-mode preference, and that coupling silently broke this harness
  // for a day on 2026-08-04. data-chip-role is the stable question: is any of the
  // sender's HBAR now committed rather than sitting free in the store?
  const offered = await pageA.evaluate(senderId =>
    !!document.querySelector(
      `[data-testid="chip"][data-owner-account="${senderId}"][data-asset-id="HBAR"][data-chip-role="reserved"]`)
    || !!document.querySelector(
      `.board-rimpile[data-owner-account="${senderId}"][data-asset-id="HBAR"]`), acctA)
  log("offer ghost present:", offered)
  if(!offered) throw new Error("offer never registered")

  // ── lock both accounts (local intent key, no wallet on either side) ──
  log("[A] lock")
  await pageA.locator('[data-testid="lock"]').first().click()
  await pageA.waitForTimeout(1000)
  log("[B] lock")
  await pageB.waitForTimeout(1000)   // let B's board pick up the offer first
  await pageB.locator('[data-testid="lock"]').first().click()
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
  await pageA.locator('[data-testid="sign"]').first().click()
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
  await pageA.screenshot({ path: "/var/www/swap.kpay.live-katlab/lab1/logs/qa/hbarxfer-final.png" })

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
