// hbar-mainnet-send.cjs — QA-MAINNETSEND1: REAL-MAINNET end-to-end board send.
// 0.01 HBAR 0.0.10650022 (kwallet-mainnet, WC-paired sender) → 0.0.10177400
// (manual account — recipients only need to lock). First real-network run of
// the WC-NETSCOPE1/WC-ACCTFILTER1 fix stack; every prior harness pass was
// testnet. Uses the SECOND kWallet instance on :8791 so the testnet one
// (HBARXFER cron) is untouched. Spends real (dust) HBAR + fees.
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const KWALLET_BASE = "http://127.0.0.1:8791"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const SENDER = "0.0.10650022"
const RECIPIENT = "0.0.10177400"
const AMOUNT = "0.01"
const log = (...a) => console.log(new Date().toISOString(), "[mainnet-send]", ...a)

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

async function main(){
  const gr = await fetch("https://lab1.katlab.kpay.live/m/katomia/hapi.php?action=create", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: { name: "QA mainnet send" }, network: "mainnet",
      visibility: "public", joinRule: "*", lockRule: "all",
      config: { tradingMode: "proposal", txDelaySeconds: 0, validDurationSeconds: 180 } })
  }).then(r => r.json())
  const GAME = gr.gameId
  if(!GAME) throw new Error("game create failed: " + JSON.stringify(gr))
  log("mainnet game:", GAME)
  const BOARD = `https://lab1.katlab.kpay.live/m/katomia/board/${GAME}?skin=ring16`

  await kwallet("/api/mode", { mode: "auto" })
  const browser = await chromium.launch()
  const wcLog = []
  const hook = (page, tag) => {
    page.on("console", m => { const t = m.text(); if(/\[WC\]|wc:|mainnet|sign|error/i.test(t)) wcLog.push(`[${tag}] ${t.slice(0,200)}`) })
    page.on("pageerror", e => wcLog.push(`[${tag}] PAGEERROR ${String(e).slice(0,200)}`))
  }

  // ── A: sender, kwallet-mainnet paired via the addaccount flow ──
  const pageA = await (await browser.newContext()).newPage()
  hook(pageA, "A")
  pageA.on("dialog", d => d.accept(AMOUNT))
  await pageA.goto(BOARD, { waitUntil: "domcontentloaded" })
  await pageA.waitForTimeout(2000)
  await pageA.locator("button.ring-footer-accsel").first().click()
  await pageA.waitForTimeout(500)
  await pageA.locator("#addAcctConnect").click()
  const uri = await (async () => { for(let i=0;i<40;i++){ const u = await pageA.evaluate(`(${URI_FINDER})()`).catch(()=>null); if(u) return u; await pageA.waitForTimeout(500) } })()
  if(!uri) throw new Error("no WC URI")
  const pr = await kwallet("/api/pair", { uri })
  if(!pr.ok) throw new Error("pair failed " + JSON.stringify(pr))
  await pageA.waitForTimeout(2500)
  if(await pageA.locator("#addAcctJoinAll").count()) await pageA.locator("#addAcctJoinAll").click()
  await pageA.waitForTimeout(2000)
  const acctA = await pageA.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.id)
  if(!acctA || !acctA.includes(SENDER)) throw new Error(`sender join failed (got ${acctA})`)
  const wcState = await pageA.evaluate(async () => ({ net: window.WC?.getNetwork?.(), acct: await window.WC?.getAccount?.() }))
  log("[A] joined as", acctA, "WC state:", JSON.stringify(wcState))

  // ── B: recipient, manual entry (only needs to lock) ──
  const pageB = await (await browser.newContext()).newPage()
  hook(pageB, "B")
  await pageB.goto(BOARD, { waitUntil: "domcontentloaded" })
  await pageB.waitForTimeout(2000)
  await pageB.locator("button.ring-footer-accsel").first().click()
  await pageB.waitForTimeout(500)
  await pageB.fill("#addAcctManual", RECIPIENT)
  await pageB.click("#addAcctManualUse")
  await pageB.waitForTimeout(1000)
  if(await pageB.locator("#addAcctJoinAll").count()) await pageB.locator("#addAcctJoinAll").click()
  await pageB.waitForTimeout(2000)

  // ── offer AMOUNT hbar A→B, both lock ──
  await pageA.waitForTimeout(1500)
  const clicked = await pageA.evaluate((senderId) => {
    const chip = [...document.querySelectorAll(".asset")].find(el =>
      el.dataset.assetId === "HBAR" && el.dataset.ownerAccount === senderId &&
      !el.classList.contains("basket") && !el.classList.contains("reserved") &&
      !el.classList.contains("board-ghost"))
    if(!chip) return false
    chip.click()
    return true
  }, acctA)
  if(!clicked) throw new Error("no HBAR store chip for sender")
  await pageA.waitForTimeout(500)
  const acctB = await pageA.evaluate(() => getAccounts().filter(a => !isMyAccount(a))[0]?.id)
  await pageA.evaluate((accountId) => {
    document.querySelector(`.board-wedge[data-drop-account="${accountId}"]`).click()
  }, acctB)
  await pageA.waitForTimeout(2000)
  const offered = await pageA.evaluate((senderId) =>
    !!document.querySelector(`.asset.reserved[data-owner-account="${senderId}"][data-asset-id="HBAR"]`) ||
    [...document.querySelectorAll(".asset.board-ghost")].length > 0, acctA)
  log("[A] offered", AMOUNT, "HBAR to", acctB, "— ghost present:", offered)
  if(!offered) throw new Error("offer never registered")
  await pageA.locator("button.ring-footer-lock").first().click()
  await pageA.waitForTimeout(1200)
  await pageB.locator("button.ring-footer-lock").first().click()
  log("both locked; waiting for signing phase")
  await pageA.waitForFunction(() => { try { return !!boardSigning } catch { return false } }, { timeout: 20000 })
  const txid = await pageA.evaluate(() => boardSigning?.tx?.txid)
  log("signing phase — txid:", txid)

  // ── Sign (kwallet-mainnet auto-approves) ──
  await pageA.waitForTimeout(500)
  await pageA.locator("button.ring-footer-lock").first().click()
  await pageA.waitForTimeout(15000)   // sign + save + backend submit; mirror node is the authority below
  const kw = await fetch(`${KWALLET_BASE}/api/state?token=${KWALLET_TOKEN}`).then(r => r.json())
  log("kWallet-mainnet pending:", kw.pending.length, "sessions:", kw.sessions.length)
  log("--- WC console tail ---")
  wcLog.slice(-14).forEach(l => log(l))
  await browser.close()

  // ── mirror-node confirmation — match THE txid, nothing else. (Run 1 lesson:
  // an amount+recipient match caught the user's own earlier 0.01 test transfer
  // and reported a false PASS while the board tx had actually expired unsigned.)
  const mirrorTxid = txid.replace("@", "-").replace(/\.(\d+)$/, "-$1")
  log("polling mirror node for", mirrorTxid)
  let outcome = 2
  for(let i = 0; i < 10; i++){
    await new Promise(r => setTimeout(r, 6000))
    const mn = await fetch(`https://mainnet-public.mirrornode.hedera.com/api/v1/transactions/${mirrorTxid}`).then(r => r.json()).catch(() => null)
    const tx = mn?.transactions?.[0]
    if(tx){
      log("MIRROR CONFIRMED:", tx.transaction_id, "result:", tx.result,
        "| consensus:", tx.consensus_timestamp)
      log(tx.result === "SUCCESS" ? "PASS — 0.01 HBAR landed on mainnet" : "FAIL — tx found but result " + tx.result)
      outcome = tx.result === "SUCCESS" ? 0 : 2
      break
    }
    log(`mirror poll ${i+1}: not yet`)
  }
  if(outcome !== 0 && !process.exitCode) log("FAIL — tx never reached the mirror node (check hapi txWorker: sufficiency, expiry)")
  process.exitCode = outcome
}
main().finally(async () => {
  await kwallet("/api/mode", { mode: "manual" }).catch(() => {})
  log("kwallet-mainnet restored to manual")
}).catch(e => { console.error("FATAL", e); process.exit(1) })
