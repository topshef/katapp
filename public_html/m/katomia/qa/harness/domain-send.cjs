// domain-send.cjs — KAT-DOMAIN1: hbarxfer-auto-spike.cjs adapted to verify the
// standalone-domain deploys (pat.katomia.com bundle / katlab.katomia.com mirror),
// where the app serves at DOMAIN ROOT (/board/<id>, /hapi.php, /kflow).
// Env: BASE (e.g. https://pat.katomia.com), GAME, KWALLET_TOKEN,
//      RECIPIENT (default 0.0.1532), AMOUNT (default 0.01), SHOT (screenshot path).
// Everything else — two-player flow, in-page wedge click, sign-phase second
// click — is verbatim from the spike; see its comments for the WHYs.
const { chromium } = require("/opt/kwallet/node_modules/playwright")

const BASE = process.env.BASE
if(!BASE) { console.error("BASE required"); process.exit(2) }
const GAME = process.env.GAME
const BOARD = `${BASE}/board/${GAME}?skin=ring16`
const KWALLET_BASE = "http://127.0.0.1:8790"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const RECIPIENT = process.env.RECIPIENT || "0.0.1532"
const AMOUNT_H = process.env.AMOUNT || "0.01"
const SHOT = process.env.SHOT || "/tmp/domain-send-final.png"
const TAG = BASE.replace(/^https?:\/\//, "")
const log = (...a) => console.log(new Date().toISOString(), `[domain-send ${TAG}]`, ...a)

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
let RUN_ID = null
async function reportKflow(checkpoint, v, detail){
  if(!RUN_ID) RUN_ID = "domain-send-" + Date.now().toString(36)
  await fetch(`${BASE}/kflow`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit: "", detail }] }) }).catch(() => {})
}

async function main(){
  const t0 = Date.now()
  const browser = await chromium.launch()

  // ── PLAYER A (sender): kWallet via WalletConnect ──
  const pageA = await (await browser.newContext()).newPage()
  pageA.on("dialog", d => d.accept(AMOUNT_H))
  pageA.on("pageerror", e => log("A PAGEERROR", String(e).slice(0, 200)))
  pageA.on("console", m => { const t = m.text(); if(/error|fail|DQ63632|AJ89374/i.test(t)) log("A CONSOLE", t.slice(0, 200)) })
  log("[A] open board", BOARD)
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

  // ── PLAYER B (recipient): manual entry, no wallet ──
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

  // ── A offers AMOUNT_H HBAR to B ──
  await pageA.waitForTimeout(1500)
  log("[A] tap HBAR chip")
  await pageA.evaluate((senderId) => {
    const chip = [...document.querySelectorAll(".asset")].find(el =>
      el.dataset.assetId === "HBAR" && el.dataset.ownerAccount === senderId &&
      !el.classList.contains("basket") && !el.classList.contains("reserved"))
    if(!chip) throw new Error("no HBAR store chip for sender")
    chip.click()
  }, acctA)
  await pageA.waitForTimeout(500)
  log("[A] tap B's wedge")
  const clicked = await pageA.evaluate((accountId) => {
    const el = document.querySelector(`.board-wedge[data-drop-account="${accountId}"]`)
    if(!el) return false
    el.click()
    return true
  }, acctB)
  log("in-page wedge click dispatched:", clicked)
  await pageA.waitForTimeout(2000)

  const offered = await pageA.evaluate((senderId) =>
    !!document.querySelector(`.asset.reserved[data-owner-account="${senderId}"][data-asset-id="HBAR"]`), acctA)
  log("offer ghost present:", offered)
  if(!offered) throw new Error("offer never registered")

  // ── lock both, then click Sign when the signing phase starts ──
  log("[A] lock")
  await pageA.locator("button.ring-footer-lock").first().click()
  await pageA.waitForTimeout(1000)
  log("[B] lock")
  await pageB.waitForTimeout(1000)
  await pageB.locator("button.ring-footer-lock").first().click()
  await pageB.waitForTimeout(1500)

  log("[A] waiting for the signing phase, then clicking Sign")
  await pageA.waitForFunction(() => window.boardSigning, { timeout: 15000 }).catch(() => {})
  await pageA.waitForTimeout(500)
  await pageA.locator("button.ring-footer-lock").first().click()
  log("[A] Sign clicked")

  log("waiting for kWallet auto-sign -> result toast")
  let success = null, tries = 0
  while(tries++ < 50){
    const txt = await pageA.evaluate(() => document.body.innerText)
    if(txt.includes("Transaction successful")){ success = true; break }
    if(txt.includes("Transaction failed or expired")){ success = false; break }
    await pageA.waitForTimeout(1000)
  }
  log("success:", success, "elapsed s:", Math.round((Date.now() - t0) / 1000))
  await pageA.screenshot({ path: SHOT })

  const verdict = success === true ? "pass" : success === false ? "fail" : "error"
  await reportKflow("test:start", "DOMAIN-SEND-01", { source: "auto", instance: "DOMAIN-SEND-01", base: BASE })
  await reportKflow("test:verdict", verdict, {
    source: "auto", instance: "DOMAIN-SEND-01", base: BASE,
    note: `automated run, game ${GAME}, sender ${acctA} -> ${acctB}, ${AMOUNT_H} HBAR` +
      (success === null ? " (no result toast within timeout)" : ""),
    secs: Math.round((Date.now() - t0) / 1000)
  })
  await browser.close()
  process.exit(success === true ? 0 : 1)
}
main().catch(async e => {
  console.error("FATAL", e.message)
  await reportKflow("test:verdict", "error", { source: "auto", instance: "DOMAIN-SEND-01", base: BASE, note: String(e.message).slice(0, 300) }).catch(() => {})
  process.exit(1)
})
