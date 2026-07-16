// hbarxfer-auto-spike.cjs -- QA-UXGRID1 HBARXFER, PROVEN 2026-07-16 up to
// account-pairing (both accounts land: kWallet WC-paired sender + manual-
// entry recipient), against a dedicated PUBLIC testnet game -- see
// data/classes/hbarxfer.json's fixtures.auto for the full trace and
// GAMEPRIVATE-JOINSTUCK1 for why the game must be public until that
// backend bug is fixed. NEXT SLICE (not yet scripted): offer 0.01 hbar,
// lock both accounts (local intent-key signature, no wallet needed),
// let the strike auto-fire (txDelaySeconds:0), assert kWallet
// auto-signs + board:result:shown ok:true. Run:
//   set -a; . /opt/kwallet/.env; set +a
//   GAME=<a fresh PUBLIC game id> node hbarxfer-auto-spike.cjs
// Needs kWallet in auto mode first (POST /api/mode {mode:"auto"}) --
// restore to manual after (this box's default/shared state).
const { chromium } = require("/opt/kwallet/node_modules/playwright")

const GAME = process.env.GAME || "4MDZDW"
const BOARD = `https://lab1.katlab.kpay.live/m/katomia/board/${GAME}?skin=ring16`
const KWALLET_BASE = "http://127.0.0.1:8790"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const RECIPIENT = process.env.RECIPIENT || "0.0.5200540" // xproof network-verifier testnet acct, receive-only, no wallet needed
const AMOUNT_H = 0.01

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

async function main(){
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on("pageerror", e => log("PAGEERROR", String(e).slice(0, 200)))
  page.on("console", m => { const t = m.text(); if(/error|fail/i.test(t)) log("[console]", t.slice(0, 200)) })

  log("open board", BOARD)
  await page.goto(BOARD, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2000)

  // ── add account 1: kWallet via WalletConnect ──
  log("click Add account (empty state)")
  await page.locator("button.ring-footer-accsel").first().click({ timeout: 10000 })
  await page.waitForTimeout(500)
  log("click Connect wallet")
  await page.locator("#addAcctConnect").click({ timeout: 10000 })
  log("extracting WC URI from the modal…")
  const uri = await extractUri(page)
  if(!uri) throw new Error("no WC URI found in the add-account modal")
  log("got URI, pairing kWallet service")
  const pr = await kwallet("/api/pair", { uri })
  if(!pr.ok) throw new Error("kWallet pair failed: " + JSON.stringify(pr))
  log("kWallet pair ok, waiting for the account to land in the modal/game…")
  await page.waitForFunction(() => document.getElementById("addAcctStepAssets") &&
    !document.getElementById("addAcctStepAssets").classList.contains("hidden"), { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1000)
  const joinBtn = page.locator("#addAcctJoinAll")
  if(await joinBtn.count()){ log("joining all assets for account 1"); await joinBtn.click() }
  await page.waitForTimeout(2000)

  const acct1 = await page.evaluate(() => {
    const mine = (typeof getAccounts === "function" ? getAccounts() : []).filter(a => typeof isMyAccount === "function" && isMyAccount(a))
    return mine[0]?.id?.split(":")[1] || null
  })
  log("account 1 (sender, kWallet-signed) =", acct1)
  if(!acct1) throw new Error("account 1 never landed")

  // ── add account 2: recipient, MANUAL ENTRY (receive-only, no wallet) ──
  log("open Add account again for the recipient")
  await page.locator(".ring-footer-accsel").first().selectOption({ label: "➕ Add account…" }).catch(async () => {
    await page.getByText("➕ Add account", { exact: false }).click()
  })
  await page.waitForTimeout(500)
  await page.fill("#addAcctManual", RECIPIENT)
  await page.click("#addAcctManualUse")
  await page.waitForTimeout(1000)
  const joinBtn2 = page.locator("#addAcctJoinAll")
  if(await joinBtn2.count()){ log("joining recipient account"); await joinBtn2.click() }
  await page.waitForTimeout(2000)

  const mineNow = await page.evaluate(() => (typeof getAccounts === "function" ? getAccounts() : [])
    .filter(a => typeof isMyAccount === "function" && isMyAccount(a)).map(a => a.id))
  log("accounts now mine:", JSON.stringify(mineNow))
  if(mineNow.length < 2) throw new Error("recipient account never landed -- have: " + JSON.stringify(mineNow))

  await page.screenshot({ path: "/tmp/claude-0/-var-www-swap-kpay-live-katlab-lab1/b5bfcda0-bcef-438f-9776-811088e67443/scratchpad/hbarxfer-board.png" })
  log("BOTH accounts landed -- stopping here for the spike (offer/lock/strike is the next slice)")
  await browser.close()
}
main().catch(e => { console.error("FATAL", e.message); process.exit(1) })
