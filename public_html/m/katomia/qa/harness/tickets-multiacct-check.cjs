// tickets-multiacct-check.cjs — PROP-TICKETS1 phase C: taking your own ticket
// with another of your accounts, and the provenance that goes with it.
//
// WHY THIS IS ALLOWED (user review 2026-08-21). Two accounts under one player does
// NOT mean one entity owns both — a player may be REPRESENTING an account, acting
// on an instruction, and Katomia is infrastructure: one player token may front
// bots or several real parties. So "same player on both sides" cannot be read as
// self-dealing, and nothing in the product may label it that. It is also the
// cheapest possible demo of the whole loop, which is why it belongs in normal
// mode rather than behind a flag.
//
// WHAT IS RECORDED INSTEAD. Facts, not verdicts: which player token instigated
// both sides, and each side's verification state AT FILL TIME. Anything that ever
// needs to weigh a fill can decide for itself. It goes in with the feature because
// HISTORY CANNOT BE BACKFILLED.
//
//   node tickets-multiacct-check.cjs
//   API=https://hapi2.hbar.live/live BASE=https://lab22.kpay.uk node tickets-multiacct-check.cjs
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const API  = (process.env.API  || "https://hapi2.hbar.live/live").replace(/\/+$/, "")
const BASE = (process.env.BASE || "https://lab22.kpay.uk").replace(/\/+$/, "")
const INSTANCE = "TICKETS-MULTIACCT-01"
const HAPIQ = process.env.CROSS === "1" ? "hapi_base=" + API.replace(/^https?:\/\//, "") : "x=1"
const RUN_ID = "tktm-" + Date.now().toString(36)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[tktmulti]", ...a)

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

// With no accounts the footer control is a BUTTON; once you hold one it becomes a
// SELECT whose "➕ Add account" option opens the same dialog (katomia-board.js
// ~5175). This gate adds two accounts to one player, so it has to handle both.
async function addManual(page, acct){
  const btn = page.locator("button.ring-footer-accsel")
  if(await btn.count()) await btn.first().click({ timeout: 15000 })
  else await page.selectOption("select.ring-footer-accsel", "__add")
  await page.waitForTimeout(600)
  await page.fill("#addAcctManual", acct)
  await page.click("#addAcctManualUse")
  await page.waitForTimeout(1500)
  if(await page.locator("#addAcctJoinAll").isVisible().catch(() => false)) await page.locator("#addAcctJoinAll").click()
  await page.waitForTimeout(1800)
}

const fillRows = page => page.evaluate(() => document.querySelectorAll(".board-fillrow").length)

;(async () => {
  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })
  const br = await chromium.launch()
  try {
    const created = await fetch(API + "/katomia/create", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ network: "playnet", visibility: "unlisted", profile: { name: "QA " + RUN_ID } }) }).then(r => r.json())
    if(!created.ok && !created.gameId) throw new Error("create failed: " + JSON.stringify(created).slice(0, 150))
    const gid = created.gameId
    log("playnet circle", gid)

    const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
    const solo = await ctx.newPage()
    solo.__dialogs = []
    solo.on("dialog", d => { solo.__dialogs.push(d.message()); d.accept() })
    await solo.goto(`${BASE}/m/katomia/board/${gid}?${HAPIQ}&tickets=1`, { waitUntil: "domcontentloaded" })
    await solo.waitForTimeout(2500)

    // ONE player, TWO accounts — the shape the review was about
    await addManual(solo, "0.0.111")
    await addManual(solo, "0.0.222")
    await solo.waitForTimeout(1500)
    const mineCount = await solo.evaluate(() => getAccounts().filter(a => isMyAccount(a)).length)
    t("one player holding two accounts in the circle", mineCount === 2, "accounts=" + mineCount)

    // price the apple on the FIRST account
    const acct0 = await solo.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0].id)
    await solo.evaluate(id => {
      const acc = getAccountMap()[id]
      boardAssetDetail("apple", acc, acc.assets.apple || 1)
    }, acct0)
    await solo.locator('[data-testid="tkt-price-it"]').click({ timeout: 8000 })
    await solo.locator("#tktModal .tkt-line").nth(1).locator("input").first().fill("banana")
    await solo.locator('[data-testid="tkt-create"]').click()
    await solo.waitForTimeout(1800)
    t("the ticket exists", await solo.evaluate(() =>
      Object.values(state?.players || {}).flatMap(p => Object.keys(p.orders || {})).length) === 1)

    // C1 — the card must now offer BOTH halves on your own ticket: manage it, and
    // take it with the other account. Before C1 the take branch never rendered,
    // because isMyAccount is per PLAYER.
    await solo.locator(".board-chip.board-ticketed").first().click({ force: true })
    await solo.waitForTimeout(700)
    t("your own ticket still offers tear-up", await solo.locator('[data-testid="tkt-cancel"]').count() === 1)
    t("and now also offers the take", await solo.locator('[data-testid="tkt-take"]').count() === 1)
    t("the take says which account it uses", /another account/i.test(
      (await solo.locator('[data-testid="tkt-take"]').textContent()) || ""))
    t("nothing calls it a self-fill or a wash trade", !/self.?fill|wash/i.test(
      (await solo.locator("#boardAssetDetail").textContent()) || ""))
    const fillerOpts = await solo.evaluate(() => {
      const sel = document.querySelector("#boardAssetDetail .tkt-fillersel")
      return sel ? [...sel.options].map(o => o.value) : []
    })
    t("the maker's own account is not offered as the filler",
      fillerOpts.length === 0 || !fillerOpts.includes(acct0), JSON.stringify(fillerOpts))

    await solo.locator('[data-testid="tkt-take"]').click()
    await solo.waitForTimeout(2000)
    t("the take lands as a real fill group", (await fillRows(solo)) === 2, "rows=" + await fillRows(solo))

    // C2 — provenance is recorded on the fill rows, as facts
    const prov = await solo.evaluate(() => {
      for(const a of getAccounts()) for(const it of a.basket || []) if(it.fillId && it.prov) return it.prov
      return null
    })
    t("the fill carries provenance", !!prov, JSON.stringify(prov))
    t("it records that one player instigated both sides", prov?.sameInstigator === true, JSON.stringify(prov))
    t("it records each side's verification state separately",
      prov && "makerBound" in prov && "fillerBound" in prov, JSON.stringify(prov))
    t("it records no verdict about the trade",
      prov && !Object.keys(prov).some(k => /self|wash|suspic/i.test(k)), JSON.stringify(Object.keys(prov || {})))

    // and it settles like any other fill
    const ids = await solo.evaluate(() => getAccounts().filter(a => isMyAccount(a)).map(a => a.id))
    for(const id of ids) await solo.evaluate(i => socket.send(JSON.stringify({ type: "game_toggleLock", gameId, accountId: i, to: "lock" })), id)
    await solo.waitForTimeout(3200)
    const after = await solo.evaluate(() => getAccounts().filter(a => isMyAccount(a)).map(a => ({ id: a.id, apple: a.assets?.apple || 0, banana: a.assets?.banana || 0 })))
    t("it settles like any other fill — the apple moved between the accounts",
      after.some(a => a.apple === 2) && after.some(a => a.apple === 0), JSON.stringify(after))

    await reportKflow("test:verdict", INSTANCE, { pass: !fails.length, asserts: n, fails })
  } catch(e){ fails.push("harness: " + String(e.message).slice(0, 200)) }
  await br.close()
  log(fails.length ? `FAILED ${fails.length}/${n}: ` + fails.join(" | ") : `all ${n} assertions green`)
  log("verdict:", fails.length ? "fail" : "pass")
  process.exit(fails.length ? 1 : 0)
})()
