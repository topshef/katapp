// mainnet-smoke-auto.cjs — MAINNETSMOKE class, kflow-reported (retest-grid
// convention). Real-mainnet confirmation that the board+WC+kWallet path is
// still live, using kwallet-mainnet's KSIG-SALT-v1 scalar signer (see
// ksig-scalar-sign.cjs, QA-MAINNETSEND1). Deliberately small + infrequent —
// unlike testnet, every run spends real HBAR (transfer + node fee).
//
// SAFETY: refuses to run if the sender's mirror-node balance is below
// MIN_BALANCE_TINYBAR (skip, not fail — a low balance is an ops issue to top
// up, not a product regression). Uses the SAME exact-txid mirror match as
// hbar-mainnet-send.cjs (an amount-based match once false-PASSed on an
// unrelated transfer — see QA-MAINNETSEND1 run 1).
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const KWALLET_BASE = "http://127.0.0.1:8791"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const SENDER = "0.0.10650022"
const RECIPIENT = "0.0.10177400"
const AMOUNT = "0.01"
const MIN_BALANCE_TINYBAR = 100_000_000 // 1 HBAR floor -- room for ~90 runs at ~0.0115 each before this trips
const log = (...a) => console.log(new Date().toISOString(), "[mainnet-smoke]", ...a)

const URI_FINDER = `() => {
  const found = new Set()
  const visit = (root) => {
    for (const el of (root.querySelectorAll ? root.querySelectorAll('*') : [])) {
      for (const a of el.attributes || []) if (a.value && a.value.startsWith('wc:')) found.add(a.value)
      for (const k of ['uri','walletConnectUri','value']) { try { if (typeof el[k]==='string' && el[k].startsWith('wc:')) found.add(el[k]) } catch(e){} }
      if (el.shadowRoot) visit(el.shadowRoot)
    }
  }
  visit(document)
  return [...found][0] || null
}`
async function kwallet(path, body){
  const r = await fetch(KWALLET_BASE + path, { method: "POST",
    headers: { "content-type": "application/json", "x-kwallet-token": KWALLET_TOKEN },
    body: JSON.stringify(body || {}) })
  return r.json()
}
async function extractUri(page){
  for(let i = 0; i < 40; i++){ const u = await page.evaluate(`(${URI_FINDER})()`).catch(()=>null); if(u) return u; await page.waitForTimeout(500) }
  return null
}
async function clickJoinAllIfPresent(page, tries = 12, delayMs = 500){
  const loc = page.locator("#addAcctJoinAll")
  for(let i = 0; i < tries; i++){
    if(await loc.isVisible().catch(() => false)){ await loc.click().catch(() => {}); return true }
    await page.waitForTimeout(delayMs)
  }
  return false
}

let RUN_ID = null, SITE_COMMIT = null
async function reportKflow(checkpoint, v, detail){
  if(!RUN_ID) RUN_ID = "mainnetsmoke-" + Date.now().toString(36)
  if(SITE_COMMIT === null) SITE_COMMIT = await fetch("https://lab22.kpay.uk/m/katomia/qa/results.php?days=1")
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch("https://lab22.kpay.uk/kflow", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit: SITE_COMMIT, detail }] }) })
}

async function checkBalance(){
  const acc = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/${SENDER}`).then(r => r.json())
  return acc?.balance?.balance ?? 0
}

async function run(){
  const gr = await fetch("https://lab22.kpay.uk/m/katomia/hapi.php?action=create", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: { name: "QA cron: MAINNETSMOKE" }, network: "mainnet",
      visibility: "public", joinRule: "*", lockRule: "all",
      config: { tradingMode: "proposal", txDelaySeconds: 0, validDurationSeconds: 180 } })
  }).then(r => r.json())
  if(!gr.gameId) throw new Error("game create failed: " + JSON.stringify(gr))
  const GAME = gr.gameId
  const BOARD = `https://lab22.kpay.uk/m/katomia/board/${GAME}?skin=ring16`
  log("mainnet game:", GAME)

  const browser = await chromium.launch()
  const pageA = await (await browser.newContext()).newPage()
  pageA.on("dialog", d => d.accept(AMOUNT))
  await pageA.addInitScript(() => { window.__katomiaTestHooks = true })   // QA-TESTHOOKS1
  await pageA.goto(BOARD, { waitUntil: "domcontentloaded" })
  await pageA.waitForTimeout(2000)
  await pageA.locator("button.ring-footer-accsel").first().click()
  await pageA.waitForTimeout(500)
  await pageA.locator("#addAcctConnect").click()
  const uri = await extractUri(pageA)
  if(!uri) throw new Error("no WC URI")
  const pr = await kwallet("/api/pair", { uri })
  if(!pr.ok) throw new Error("pair failed " + JSON.stringify(pr))
  await pageA.waitForTimeout(2500)
  await clickJoinAllIfPresent(pageA)
  await pageA.waitForTimeout(2000)
  const acctA = await pageA.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.id)
  if(!acctA || !acctA.includes(SENDER)) throw new Error(`sender join failed (got ${acctA})`)

  const pageB = await (await browser.newContext()).newPage()
  await pageB.addInitScript(() => { window.__katomiaTestHooks = true })   // QA-TESTHOOKS1
  await pageB.goto(BOARD, { waitUntil: "domcontentloaded" })
  await pageB.waitForTimeout(2000)
  await pageB.locator("button.ring-footer-accsel").first().click()
  await pageB.waitForTimeout(500)
  await pageB.fill("#addAcctManual", RECIPIENT)
  await pageB.click("#addAcctManualUse")
  await pageB.waitForTimeout(1000)
  await clickJoinAllIfPresent(pageB)
  await pageB.waitForTimeout(2000)

  await pageA.waitForTimeout(1500)
  const ASSET_ID = "HBAR", OFFER_AMOUNT = "0.01"
  const acctB = await pageA.evaluate(() => getAccounts().filter(a => !isMyAccount(a))[0]?.id)
  if(!acctB) throw new Error("recipient never landed on the sender's board")
  // QA-TESTHOOKS1 (2026-08-07): non-gestural offer. Tap-to-offer was retired on
  // 2026-08-05 (a tap now INSPECTS; dragging offers) and a felt tap opens the
  // player modal, which then intercepts every later click — that is what broke
  // this harness. Drive the hidden "Offer to a player…" action on the asset card
  // instead: same code path as a drop, no hit-testing, no prompt().
  const _offered = await pageA.evaluate(([senderId, targetId, assetId, amt]) => {
    const chip = document.querySelector(
      `[data-testid="chip"][data-chip-role="store"][data-owner-account="${senderId}"][data-asset-id="${assetId}"]`)
    if(!chip){
      // Self-explaining failure: distinguish "this environment predates the test
      // hooks" from "the board genuinely has no chip". Without this the run just
      // says "no chip" and the next person goes looking for a product bug.
      const legacy = document.querySelector(`.asset[data-owner-account="${senderId}"][data-asset-id="${assetId}"]`)
      return legacy
        ? "BUNDLE TOO OLD: chips render, but without data-testid — this environment predates QA-TESTHOOKS1 (2b07c1c). Ship the hooks here before running board tests."
        : "no store chip for sender"
    }
    chip.click()
    const act = document.querySelector('[data-testid="asset-offer"]')
    if(!act) return "offer action missing — is the bundle new enough?"
    act.click()
    const input = document.getElementById("assetModalAmount")
    if(!input) return "amount input missing"
    input.value = amt
    input.dispatchEvent(new Event("input", { bubbles: true }))
    const target = document.querySelector(
      `[data-testid="offer-target"][data-target-account="${targetId}"]`)
    if(!target) return "no offer target for recipient"
    target.click()
    return true
  }, [acctA, acctB, ASSET_ID, OFFER_AMOUNT])
  if(_offered !== true) throw new Error("offer failed: " + _offered)
  await pageA.waitForTimeout(2000)
  await pageA.locator('[data-testid="lock"], [data-testid="sign"]').first().click()
  await pageA.waitForTimeout(1200)
  await pageB.locator('[data-testid="lock"], [data-testid="sign"]').first().click()
  await pageA.waitForFunction(() => { try { return !!boardSigning } catch { return false } }, { timeout: 20000 })
  const txid = await pageA.evaluate(() => boardSigning?.tx?.txid)
  log("signing phase — txid:", txid)

  await pageA.waitForTimeout(500)
  await pageA.locator('[data-testid="lock"], [data-testid="sign"]').first().click()
  await pageA.waitForTimeout(15000)
  await browser.close()

  const mirrorTxid = txid.replace("@", "-").replace(/\.(\d+)$/, "-$1")
  for(let i = 0; i < 10; i++){
    await new Promise(r => setTimeout(r, 6000))
    const mn = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/transactions/${mirrorTxid}`).then(r => r.json()).catch(() => null)
    const tx = mn?.transactions?.[0]
    if(tx) return { pass: tx.result === "SUCCESS", txid: tx.transaction_id, result: tx.result, consensus: tx.consensus_timestamp }
  }
  return { pass: false, txid, result: "NEVER_REACHED_MIRROR" }
}

async function main(){
  const balance = await checkBalance()
  if(balance < MIN_BALANCE_TINYBAR){
    log(`SKIP — sender balance ${balance / 1e8} HBAR below floor ${MIN_BALANCE_TINYBAR / 1e8} HBAR; top up ${SENDER}`)
    await reportKflow("test:start", "MAINNETSMOKE-01", { source: "auto", instance: "MAINNETSMOKE-01" })
    await reportKflow("test:verdict", "skip", { source: "auto", instance: "MAINNETSMOKE-01", note: `balance ${balance / 1e8} HBAR below floor` })
    return
  }
  await kwallet("/api/mode", { mode: "auto" })
  await reportKflow("test:start", "MAINNETSMOKE-01", { source: "auto", instance: "MAINNETSMOKE-01" })
  try {
    const result = await run()
    await reportKflow("test:verdict", result.pass ? "pass" : "fail", { source: "auto", instance: "MAINNETSMOKE-01", detail: result })
    log(result.pass ? "PASS" : "FAIL", JSON.stringify(result))
    process.exitCode = result.pass ? 0 : 2
  } catch(e){
    await reportKflow("test:verdict", "error", { source: "auto", instance: "MAINNETSMOKE-01", note: String(e.message).slice(0, 300) }).catch(() => {})
    log("ERROR", e.message)
    process.exitCode = 1
  }
}
main().finally(async () => {
  await kwallet("/api/mode", { mode: "manual" }).catch(() => {})
  log("kwallet-mainnet restored to manual")
})
