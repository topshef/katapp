// tickets-check.cjs — PROP-TICKETS1 phases 1-3: the ticket loop end to end on playnet.
//
// Two flagged players (?tickets=1) on a fresh playnet circle:
//  P1 builder  — alice taps her apple → "🎟 Price it…" → builder → ticket exists
//                in state and her APPLE CHIP wears the stub on BOTH boards
//                (phase A1: the standalone ticket object is gone — the cue is a
//                 perforated right edge on the give-leg's own chip, and manage/
//                 take live in that chip's asset card)
//  P2 manage   — tear up (game_orderCancel) removes it everywhere; re-create
//  P3 take     — bob takes it (game_orderFill 1/1): both legs land as fill-cued
//                basket rows; alice recalls (group recall — both sides vanish,
//                ticket reopens); bob re-takes; both lock → instant playnet
//                settlement moves the fruit and the ticket leaves the stall
//
//   node tickets-check.cjs
//   API=https://bravo.katlab.kpay.live BASE=https://lab2.katlab.kpay.live node tickets-check.cjs
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const API  = (process.env.API  || "https://bravo.katlab.kpay.live").replace(/\/+$/, "")
const BASE = (process.env.BASE || "https://lab2.katlab.kpay.live").replace(/\/+$/, "")
const INSTANCE = "TICKETS-01"
// KAT-SAMEORIGIN-FE1: default = same-origin (no param). CROSS=1 forces the
// ?hapi_base= admin override so the legacy cross-origin path stays covered too.
const HAPIQ = process.env.CROSS === "1" ? "hapi_base=" + API.replace(/^https?:\/\//, "") : "x=1"
const RUN_ID = "tkt-" + Date.now().toString(36)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[tickets]", ...a)

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
const openTickets = (page) => page.evaluate(() =>
  Object.values(state?.players || {}).flatMap(p => Object.keys(p.orders || {})).length)

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

    const mkPage = async () => {
      const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
      const page = await ctx.newPage()
      page.on("dialog", d => d.accept())
      await page.goto(`${BASE}/m/katomia/board/${gid}?${HAPIQ}&tickets=1`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(2500)
      return page
    }
    const alice = await mkPage(), bob = await mkPage()
    await addManual(alice, "0.0.111")
    await addManual(bob, "0.0.222")
    await alice.waitForTimeout(1200)

    // ── P1: build a ticket through the UI (apple ⇢ banana) ──────────────────
    await alice.locator('[data-chip-role="store"][data-asset-id="apple"]').first().click({ force: true, timeout: 10000 })
    await alice.locator('[data-testid="tkt-price-it"]').click({ timeout: 8000 })
    const wantAsset = alice.locator("#tktModal .tkt-line").nth(1).locator("input").first()
    await wantAsset.fill("banana")
    await alice.locator('[data-testid="tkt-create"]').click()
    await alice.waitForTimeout(1800)
    t("ticket exists in state", (await openTickets(alice)) === 1)
    t("priced chip wears the stub (maker)", await alice.locator('[data-tkt-chip]').count() === 1)
    t("priced chip wears the stub (other player)", await bob.locator('[data-tkt-chip]').count() === 1)

    // ── P2: tear up, then re-create ─────────────────────────────────────────
    await alice.locator('[data-tkt-chip]').click({ force: true })
    await alice.locator('[data-testid="tkt-cancel"]').click()
    await alice.waitForTimeout(1500)
    t("tear-up removes it everywhere", (await openTickets(bob)) === 0 && await bob.locator('[data-tkt-chip]').count() === 0)

    await alice.locator('[data-chip-role="store"][data-asset-id="apple"]').first().click({ force: true })
    await alice.locator('[data-testid="tkt-price-it"]').click()
    await alice.locator("#tktModal .tkt-line").nth(1).locator("input").first().fill("banana")
    await alice.locator('[data-testid="tkt-create"]').click()
    await alice.waitForTimeout(1800)

    // ── P3: bob takes it ────────────────────────────────────────────────────
    await bob.locator('[data-tkt-chip]').click({ force: true, timeout: 8000 })
    await bob.locator('[data-testid="tkt-take"]').click({ timeout: 8000 })
    await bob.waitForTimeout(1800)
    const fillRows = async page => page.evaluate(() => document.querySelectorAll(".board-fillrow").length)
    t("take posts both legs as fill-cued rows (maker view)", (await fillRows(alice)) === 2, "rows=" + await fillRows(alice))
    t("take posts both legs as fill-cued rows (taker view)", (await fillRows(bob)) === 2)
    // PHASE D changed this: the default dial is now Firm, so a take commits the
    // MAKER's side and leaves the taker to review and lock. Negotiable (nobody
    // locks) is still available, and is asserted in T:TICKETS-DIAL-01.
    const afterTake = await alice.evaluate(() => getAccounts().map(a => ({ mine: isMyAccount(a), mode: a.mode })))
    t("Firm default: the maker's side locked, the taker's did not",
      afterTake.some(a => a.mine && a.mode === "lock") && afterTake.some(a => !a.mine && a.mode !== "lock"),
      JSON.stringify(afterTake))

    // maker recalls her leg (the apple she owes, sitting in bob's basket) → group recall
    await alice.locator(".board-fillrow").first().click({ force: true })
    const recall = alice.locator('[data-testid="tkt-recall"], [data-testid="tkt-return"]')
    await recall.first().click({ timeout: 8000 })
    await alice.waitForTimeout(1800)
    t("recall tears out BOTH sides", (await fillRows(alice)) === 0 && (await fillRows(bob)) === 0)
    t("ticket reopens on the stall", await bob.locator('[data-tkt-chip]').count() === 1)

    // re-take, lock both → instant playnet settlement
    await bob.locator('[data-tkt-chip]').click({ force: true })
    await bob.locator('[data-testid="tkt-take"]').click()
    await bob.waitForTimeout(1500)
    const accA = await alice.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.id)
    const accB = await bob.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.id)
    await send(alice, { type: "game_toggleLock", accountId: accA, to: "lock" })
    await send(bob, { type: "game_toggleLock", accountId: accB, to: "lock" })
    await alice.waitForTimeout(3000)
    const aBan = await alice.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.assets?.banana)
    const bApp = await bob.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.assets?.apple)
    t("settled: maker got the banana", aBan === 2, "banana=" + aBan)
    t("settled: taker got the apple", bApp === 2, "apple=" + bApp)
    t("settled ticket leaves the stall", await alice.locator('[data-tkt-chip]').count() === 0)
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
