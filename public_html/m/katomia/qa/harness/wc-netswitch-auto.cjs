// wc-netswitch-auto.cjs — WCNETSWITCH class, automated + kflow-reported (same
// retest-grid convention as hbarxfer-auto-spike.cjs). Regression coverage for
// WC-NETSCOPE1/WC-ACCTFILTER1: the board must scope the WC connector to the
// GAME's network (not the bundle's mainnet default) even after a reload, and
// a restored session must be visible without any user action. Two instances,
// reported separately so either can regress without masking the other:
//   WCNETSWITCH-01 — reload mid-signing, then Sign: must land on the game's
//     network (not mainnet) and complete the sign.
//   WCNETSWITCH-02 — reload right after pairing, NO user action: the early
//     page-level scope (kwcEarlyScope) must surface the restored session on
//     its own within a few seconds.
// Runner: KWALLET_TOKEN=... node wc-netswitch-auto.cjs (testnet kWallet must
// be idle; script flips to auto and restores mode unconditionally after).
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const KWALLET_BASE = "http://127.0.0.1:8790"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const RECIPIENT = "0.0.5200540"
const log = (...a) => console.log(new Date().toISOString(), "[wcnetswitch]", ...a)

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
// #addAcctJoinAll only appears once the WC pairing UI has fully rendered
// fresh accounts — a bare .count()-then-.click() can race that render under
// cron-adjacent load (observed flake: element present in DOM but not yet
// visible/stable, click() retries until its own timeout). Poll for visibility
// instead of a single snapshot; still a no-op if the button never appears.
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
  if(!RUN_ID) RUN_ID = "wcnetswitch-" + Date.now().toString(36)
  if(SITE_COMMIT === null) SITE_COMMIT = await fetch("https://lab1.katlab.kpay.live/m/katomia/qa/results.php?days=1")
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch("https://lab1.katlab.kpay.live/kflow", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit: SITE_COMMIT, detail }] }) })
}

async function createGame(){
  const gr = await fetch("https://lab1.katlab.kpay.live/m/katomia/hapi.php?action=create", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: { name: "QA cron: WCNETSWITCH" }, network: "testnet",
      visibility: "public", joinRule: "*", lockRule: "all",
      config: { tradingMode: "proposal", txDelaySeconds: 0, validDurationSeconds: 180 } })
  }).then(r => r.json())
  if(!gr.gameId) throw new Error("game create failed: " + JSON.stringify(gr))
  return gr.gameId
}

// ── WCNETSWITCH-01: reload mid-signing, then Sign ───────────────────────────
async function runReloadThenSign(browser){
  const GAME = await createGame()
  const BOARD = `https://lab1.katlab.kpay.live/m/katomia/board/${GAME}?skin=ring16`
  log("01: game", GAME)
  const pageA = await (await browser.newContext()).newPage()
  pageA.on("dialog", d => d.accept("0.01"))
  const consoleLines = []
  pageA.on("console", m => consoleLines.push(m.text()))
  await pageA.goto(BOARD, { waitUntil: "domcontentloaded" })
  await pageA.waitForTimeout(2000)
  await pageA.locator("button.ring-footer-accsel").first().click()
  await pageA.waitForTimeout(500)
  await pageA.locator("#addAcctConnect").click()
  const uri = await extractUri(pageA)
  if(!uri) throw new Error("01: no WC URI")
  const pr = await kwallet("/api/pair", { uri })
  if(!pr.ok) throw new Error("01: pair failed " + JSON.stringify(pr))
  await pageA.waitForTimeout(2500)
  await clickJoinAllIfPresent(pageA)
  await pageA.waitForTimeout(2000)
  const acctA = await pageA.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.id)
  if(!acctA) throw new Error("01: sender never joined")

  const pageB = await (await browser.newContext()).newPage()
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
  const clicked = await pageA.evaluate((senderId) => {
    const chip = [...document.querySelectorAll(".asset")].find(el =>
      el.dataset.assetId === "HBAR" && el.dataset.ownerAccount === senderId &&
      !el.classList.contains("basket") && !el.classList.contains("reserved") && !el.classList.contains("board-ghost"))
    if(!chip) return false
    chip.click(); return true
  }, acctA)
  if(!clicked) throw new Error("01: no HBAR store chip for sender")
  await pageA.waitForTimeout(500)
  const acctB = await pageA.evaluate(() => getAccounts().filter(a => !isMyAccount(a))[0]?.id)
  await pageA.evaluate((accountId) => document.querySelector(`.board-wedge[data-drop-account="${accountId}"]`).click(), acctB)
  await pageA.waitForTimeout(2000)
  await pageA.locator("button.ring-footer-lock").first().click()
  await pageA.waitForTimeout(1200)
  await pageB.locator("button.ring-footer-lock").first().click()
  await pageA.waitForFunction(() => { try { return !!boardSigning } catch { return false } }, { timeout: 20000 })

  await pageA.reload({ waitUntil: "domcontentloaded" })
  await pageA.waitForTimeout(3500)
  const postReload = await pageA.evaluate(async () => {
    const wc = window.WC || {}
    return { network: wc.getNetwork?.(), acct: await wc.getAccount?.().catch(() => null) }
  })
  log("01: post-reload", JSON.stringify(postReload))

  await pageA.waitForFunction(() => { try { return !!boardSigning } catch { return false } }, { timeout: 15000 }).catch(() => {})
  await pageA.waitForTimeout(500)
  await pageA.locator("button.ring-footer-lock").first().click().catch(() => {})
  await pageA.waitForTimeout(6000)

  const netCorrect = postReload.network === "testnet"
  const signed = consoleLines.some(l => l.includes("board:sign:saved"))
  const signError = consoleLines.find(l => l.includes("board:sign:error"))
  return { netCorrect, signed, postReload, signError, pass: netCorrect && signed }
}

// ── WCNETSWITCH-02: reload right after pairing, no user action ─────────────
async function runEarlyScope(browser){
  const GAME = await createGame()
  const BOARD = `https://lab1.katlab.kpay.live/m/katomia/board/${GAME}?skin=ring16`
  log("02: game", GAME)
  const page = await (await browser.newContext()).newPage()
  await page.goto(BOARD, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2000)
  await page.locator("button.ring-footer-accsel").first().click()
  await page.waitForTimeout(500)
  await page.locator("#addAcctConnect").click()
  const uri = await extractUri(page)
  if(!uri) throw new Error("02: no WC URI")
  const pr = await kwallet("/api/pair", { uri })
  if(!pr.ok) throw new Error("02: pair failed " + JSON.stringify(pr))
  await page.waitForTimeout(2500)
  await clickJoinAllIfPresent(page)
  await page.waitForTimeout(1500)

  await page.reload({ waitUntil: "domcontentloaded" })
  let final = null
  for(let t = 0; t < 15; t++){
    await page.waitForTimeout(2000)
    final = await page.evaluate(async () => {
      const wc = window.WC || {}
      return { network: wc.getNetwork?.(), acct: await wc.getAccount?.().catch(() => null), accts: await wc.getAccounts?.().catch(() => null) }
    }).catch(() => null)
    if(final && final.network === "testnet" && final.acct && final.accts?.length) break
  }
  log("02: final", JSON.stringify(final))
  const pass = !!(final && final.network === "testnet" && final.acct && final.accts?.length)
  return { pass, final }
}

async function runInstance(id, fn){
  await reportKflow("test:start", id, { source: "auto", instance: id })
  const browser = await chromium.launch()
  try {
    const result = await fn(browser)
    const verdict = result.pass ? "pass" : "fail"
    await reportKflow("test:verdict", verdict, { source: "auto", instance: id, detail: result })
    log(id, verdict.toUpperCase(), JSON.stringify(result))
    return result.pass
  } catch(e){
    await reportKflow("test:verdict", "error", { source: "auto", instance: id, note: String(e.message).slice(0, 300) }).catch(() => {})
    log(id, "ERROR", e.message)
    return false
  } finally {
    await browser.close().catch(() => {})
  }
}

async function main(){
  await kwallet("/api/mode", { mode: "auto" })
  const r1 = await runInstance("WCNETSWITCH-01", runReloadThenSign)
  const r2 = await runInstance("WCNETSWITCH-02", runEarlyScope)
  return r1 && r2
}
main().then(ok => {
  process.exitCode = ok ? 0 : 2
}).finally(async () => {
  await kwallet("/api/mode", { mode: "manual" }).catch(() => {})
  log("kWallet restored to manual")
}).catch(e => { console.error("FATAL", e); process.exitCode = 1 })
