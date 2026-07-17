// wc-netswitch-repro.cjs -- reproduce the 2026-07-17 00:38 phone failure:
// testnet game, kWallet paired, RELOAD the page mid-signing (the user's phones
// reload pages constantly), then click Sign. Hypothesis chain under test:
//   H1: a fresh board page load initialises the WC connector as MAINNET
//       (config chains[0]) because nothing on the board calls ensureNetwork.
//   H2: session restore creates signers from Core storage regardless of the
//       connector's network, so getAccount() may return an account whose
//       signer/session doesn't match the game's network.
//   H3: the resulting signTx failure surfaces as "[object Object]" because
//       boardDirectSign logs String(e) on a non-Error rejection.
// INVESTIGATION ONLY -- no code changes. kWallet flipped to auto + restored.
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const KWALLET_BASE = "http://127.0.0.1:8790"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const RECIPIENT = "0.0.5200540"
const log = (...a) => console.log(new Date().toISOString(), "[repro]", ...a)

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
const kstate = () => fetch(`${KWALLET_BASE}/api/state?token=${KWALLET_TOKEN}`).then(r => r.json())

async function main(){
  // fresh public testnet game
  const gr = await fetch("https://lab1.katlab.kpay.live/m/katomia/hapi.php?action=create", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: { name: "WC netswitch repro" }, network: "testnet",
      visibility: "public", joinRule: "*", lockRule: "all",
      config: { tradingMode: "proposal", txDelaySeconds: 0, validDurationSeconds: 180 } })
  }).then(r => r.json())
  const GAME = gr.gameId
  if(!GAME) throw new Error("game create failed: " + JSON.stringify(gr))
  log("game:", GAME)
  const BOARD = `https://lab1.katlab.kpay.live/m/katomia/board/${GAME}?skin=ring16`

  await kwallet("/api/mode", { mode: "auto" })
  const browser = await chromium.launch()
  const wcLog = []
  const hook = (page, tag) => {
    page.on("console", m => { const t = m.text(); if(/\[WC\]|wc:|mainnet|testnet|sign/i.test(t)) wcLog.push(`[${tag}] ${t.slice(0,200)}`) })
    page.on("pageerror", e => wcLog.push(`[${tag}] PAGEERROR ${String(e).slice(0,200)}`))
  }

  // ── A: sender, kWallet paired via the addaccount flow (ensureNetwork path) ──
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  hook(pageA, "A")
  pageA.on("dialog", d => d.accept("0.01"))
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
  log("[A] joined as", acctA)
  const netBefore = await pageA.evaluate(async () => ({ net: window.WC?.getNetwork?.(), acct: await window.WC?.getAccount?.() }))
  log("[A] PRE-RELOAD wallet state:", JSON.stringify(netBefore))

  // ── B: recipient, manual entry ──
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

  // ── offer + both lock ── (selectors proven in hbarxfer-auto-spike)
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
  log("[A] offered to", acctB, "— ghost present:", offered)
  if(!offered) throw new Error("offer never registered")
  await pageA.locator("button.ring-footer-lock").first().click()
  await pageA.waitForTimeout(1200)
  await pageB.locator("button.ring-footer-lock").first().click()
  log("both locked; waiting for signing phase")
  await pageA.waitForFunction(() => { try { return !!boardSigning } catch { return false } }, { timeout: 20000 })

  // ═══ THE REPRO: reload page A now (user's phones reload constantly) ═══
  log("[A] *** RELOADING mid-signing ***")
  await pageA.reload({ waitUntil: "domcontentloaded" })
  await pageA.waitForTimeout(3500)
  const postReload = await pageA.evaluate(async () => {
    const wc = window.WC || {}
    let acct = null, accts = null, err = null
    try { acct = await wc.getAccount?.() } catch(e){ err = String(e?.message || e) }
    try { accts = await wc.getAccounts?.() } catch {}
    return { network: wc.getNetwork?.(), acct, accts, err, signing: (() => { try { return !!boardSigning } catch { return false } })() }
  })
  log("[A] POST-RELOAD state:", JSON.stringify(postReload))

  // click Sign exactly as the user did
  await pageA.waitForFunction(() => { try { return !!boardSigning } catch { return false } }, { timeout: 15000 }).catch(() => {})
  await pageA.waitForTimeout(500)
  const toasts = []
  for(let click = 0; click < 2; click++){
    await pageA.locator("button.ring-footer-lock").first().click().catch(() => {})
    await pageA.waitForTimeout(6000)
    const t = await pageA.evaluate(() => [...document.querySelectorAll(".toast,[class*=toast],[class*=notify]")].map(e => e.textContent.trim()).filter(Boolean).slice(0,4))
    toasts.push(t)
    log(`[A] after Sign click ${click+1}: toasts=`, JSON.stringify(t))
  }
  const postSign = await pageA.evaluate(async () => {
    const wc = window.WC || {}
    return { network: wc.getNetwork?.(), acct: await wc.getAccount?.().catch?.(() => null) }
  }).catch(() => null)
  log("[A] post-sign wallet state:", JSON.stringify(postSign))
  const kw = await kstate()
  log("kWallet pending after clicks:", kw.pending.length, "sessions:", kw.sessions.length)

  log("--- captured WC console lines ---")
  wcLog.slice(-30).forEach(l => log(l))
  await browser.close()
}
main().finally(async () => {
  await kwallet("/api/mode", { mode: "manual" }).catch(() => {})
  log("kWallet restored to manual")
}).catch(e => { console.error("FATAL", e); process.exit(1) })
