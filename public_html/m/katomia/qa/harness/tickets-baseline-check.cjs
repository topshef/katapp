// tickets-baseline-check.cjs — PROP-TICKETS1 phase 0: the regression + parity gate.
//
// TWO JOBS, one verdict:
//  A) BASELINE — the plain proposal flow on a fresh playnet circle still works with
//     the tickets code deployed and the flag OFF: two players join, offer, withdraw,
//     re-offer, lock both, instant playnet settlement moves the fruit.
//  B) PARITY — flag OFF leaves zero trace (no feat-tickets class, no ticket DOM,
//     KTICKETS false); flag ON adds exactly the body class and nothing visible
//     while no tickets exist.
//
// Playnet: every added account auto-seeds {apple,banana,carrot} (seedAssets,
// katomiaHelpers.js:328) and settlement resolves instantly with no signer.
//
//   node tickets-baseline-check.cjs
//   API=https://hapi2.hbar.live/live BASE=https://lab22.kpay.uk node tickets-baseline-check.cjs
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const API  = (process.env.API  || "https://hapi2.hbar.live/live").replace(/\/+$/, "")
const BASE = (process.env.BASE || "https://lab22.kpay.uk").replace(/\/+$/, "")
const INSTANCE = "TICKETS-BASE-01"
// KAT-SAMEORIGIN-FE1: default = same-origin (no param). CROSS=1 forces the
// ?hapi_base= admin override so the legacy cross-origin path stays covered too.
const HAPIQ = process.env.CROSS === "1" ? "hapi_base=" + API.replace(/^https?:\/\//, "") : "x=1"
const RUN_ID = "tktbase-" + Date.now().toString(36)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[tktbase]", ...a)

const fails = []
let n = 0
const t = (name, ok, detail = "") => { n++
  log(ok ? "PASS" : "FAIL", `T:${INSTANCE}.${n}`, name, detail)
  if(!ok) fails.push(`.${n} ${name} ${detail}`) }

async function reportKflow(checkpoint, v, detail){
  try {
    const commit = await fetch(BASE + "/m/katomia/qa/results.php?days=1").then(r => r.json()).then(j => j.commit || "").catch(() => "")
    await fetch(BASE + "/kflow", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID, seq: checkpoint === "test:start" ? 1 : 2,
        tier: "fe", checkpoint, v, commit, detail: { trigger: process.env.TRIGGER || "manual", ...detail } }] }) })
  } catch(e){ log("kflow report failed (non-fatal):", e.message) }
}

async function addManual(page, acct){
  await page.locator("button.ring-footer-accsel").first().click({ timeout: 15000 })
  await page.waitForTimeout(600)
  await page.fill("#addAcctManual", acct)
  await page.click("#addAcctManualUse")
  await page.waitForTimeout(1500)
  if(await page.locator("#addAcctJoinAll").isVisible().catch(() => false)) await page.locator("#addAcctJoinAll").click()
  await page.waitForTimeout(1500)
  const id = await page.evaluate(() => (typeof getAccounts === "function" ? getAccounts() : [])
    .filter(a => typeof isMyAccount === "function" && isMyAccount(a))[0]?.id)
  if(!id) throw new Error("account never landed: " + acct)
  return id
}

const send = (page, msg) => page.evaluate(m => socket.send(JSON.stringify({ ...m, gameId })), msg)
const myAssets = (page) => page.evaluate(() => Object.fromEntries(
  getAccounts().filter(a => isMyAccount(a)).map(a => [a.id, { assets: { ...a.assets }, basket: (a.basket || []).length }])))

;(async () => {
  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })
  const t0 = Date.now()
  const br = await chromium.launch()
  try {
    const created = await fetch(API + "/katomia/create", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ network: "playnet", visibility: "unlisted", profile: { name: "QA " + RUN_ID } }) }).then(r => r.json())
    if(!created.ok && !created.gameId) throw new Error("create failed: " + JSON.stringify(created).slice(0, 150))
    const gid = created.gameId
    log("playnet circle", gid)

    const mkPage = async (flag) => {
      const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/m/katomia/board/${gid}?${HAPIQ}${flag ? "&tickets=1" : ""}`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(2500)
      return page
    }

    // ── B) parity, flag OFF ─────────────────────────────────────────────────
    const pa = await mkPage(false)
    t("flag off: no feat-tickets class", await pa.evaluate(() => !document.body.classList.contains("feat-tickets")))
    t("flag off: KTICKETS false", await pa.evaluate(() => !window.KTICKETS))
    t("flag off: no ticket DOM", await pa.evaluate(() => !document.querySelector(".board-ticket, #tktModal, [data-testid=tkt-chip]")))

    // ── A) baseline proposal flow, flag OFF everywhere ──────────────────────
    const pb = await mkPage(false)
    const accA = await addManual(pa, "0.0.111")
    const accB = await addManual(pb, "0.0.222")
    await pa.waitForTimeout(1200)
    const seeded = await pa.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.assets?.apple)
    t("playnet auto-seeded fruit", seeded === 1, "apple=" + seeded)

    await send(pa, { type: "game_offer", fromId: accA, toId: accB, assetId: "apple", amount: 1 })
    await pa.waitForTimeout(1500)
    t("offer lands as basket chip (giver view)", await pa.evaluate(() => !!document.querySelector('[data-chip-role="basket"]')))
    t("offer lands as basket chip (receiver view)", await pb.evaluate(() => !!document.querySelector('[data-chip-role="basket"]')))

    await send(pa, { type: "game_withdraw", fromId: accA, toId: accB, assetId: "apple" })
    await pa.waitForTimeout(1500)
    t("withdraw clears the basket", await pb.evaluate(() => !document.querySelector('[data-chip-role="basket"]')))

    await send(pa, { type: "game_offer", fromId: accA, toId: accB, assetId: "apple", amount: 1 })
    await pa.waitForTimeout(1200)
    await send(pa, { type: "game_toggleLock", accountId: accA })
    await send(pb, { type: "game_toggleLock", accountId: accB })
    await pa.waitForTimeout(3000)
    const bAfter = await pb.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.assets?.apple)
    t("both locked → instant playnet settlement (receiver apple=2)", bAfter === 2, "apple=" + bAfter)

    // ── B) parity, flag ON, no tickets exist ────────────────────────────────
    const pc = await mkPage(true)
    t("flag on: feat-tickets class present", await pc.evaluate(() => document.body.classList.contains("feat-tickets")))
    t("flag on: KTICKETS true", await pc.evaluate(() => window.KTICKETS === true))
    t("flag on, no tickets: no ticket DOM rendered", await pc.evaluate(() => !document.querySelector(".board-ticket, #tktModal")))
  } catch(e){ fails.push("harness: " + String(e.message).slice(0, 200)) }
  await br.close()

  const ok = fails.length === 0
  const note = ok ? `all ${n} assertions green` : `FAIL: ${fails.join("; ")}`
  log(note)
  await reportKflow("test:verdict", ok ? "pass" : "fail",
    { source: "auto", instance: INSTANCE, note: note.slice(0, 400), secs: Math.round((Date.now() - t0) / 1000) })
  log("verdict:", ok ? "pass" : "fail")
  process.exit(ok ? 0 : 1)
})()
