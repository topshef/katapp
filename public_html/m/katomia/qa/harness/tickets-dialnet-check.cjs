// tickets-dialnet-check.cjs — PROP-TICKETS1 phase I, ON A REAL NETWORK.
//
// The one claim the playnet gates cannot make. Before phase I the settlement dial was
// refused off playnet, in the UI and again in the backend, because it rode OUTSIDE the
// signed payload — unsigned execution semantics on a real network. It is inside the
// signature now (spec 1dcbd8c4) and the backend verifies that signature when the ticket
// is posted, so the refusal should be gone and a Firm take should auto-lock the maker
// on testnet exactly as it does on playnet.
//
// WHAT THIS DOES NOT PROVE, and says so rather than pretending otherwise: that the
// resulting transaction gets SIGNED. Ticket legs arrive in source.orders/source.fills,
// not source.offers, and the proposal-mode signer authorises against source.proposal —
// which postCluster only emits when there ARE offers. So a pure ticket cluster on
// testnet builds an unsigned transaction that expires. That is SOURCE-UNIFY1, it
// predates this phase, and §6 below asserts it fails HONESTLY rather than silently.
//
// REAL ACCOUNTS, REAL BALANCES. Uses the Lincoln demo cast (kbot/cast.js) — alice
// 0.0.9556348 and bob 0.0.1532, both of which hold the two test tokens. It moves NO
// value: the ticket is torn up or left unsettled by design.
//
//   node tickets-dialnet-check.cjs
//   GAME=<existing testnet circle> node tickets-dialnet-check.cjs
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const API  = (process.env.API  || "https://hapi2.hbar.live/live").replace(/\/+$/, "")
const BASE = (process.env.BASE || "https://lab22.kpay.uk").replace(/\/+$/, "")
const INSTANCE = "TICKETS-DIALNET-01"
const HAPIQ = process.env.CROSS === "1" ? "hapi_base=" + API.replace(/^https?:\/\//, "") : "x=1"
const RUN_ID = "tktn-" + Date.now().toString(36)
const MAKER = process.env.MAKER || "0.0.9556348"     // alice
const TAKER = process.env.TAKER || "0.0.1532"        // bob
const GIVE  = process.env.GIVE  || "0.0.2341021"     // KUSD — both hold it
const WANT  = process.env.WANT  || "0.0.2340890"     // KBRL — both hold it
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[dialnet]", ...a)

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
  // A testnet board paints its footer later than a playnet one — every account row
  // waits on a real mirror lookup — so wait for the control to EXIST before deciding
  // which of its two shapes it is (button with no accounts, select once you hold one).
  await page.waitForSelector(".ring-footer-accsel", { timeout: 45000 })
  const btn = page.locator("button.ring-footer-accsel")
  if(await btn.count()) await btn.first().click({ timeout: 15000 })
  else await page.selectOption("select.ring-footer-accsel", "__add")
  await page.waitForTimeout(600)
  await page.fill("#addAcctManual", acct)
  await page.click("#addAcctManualUse")
  await page.waitForTimeout(2500)                       // real mirror lookup, not playnet seed
  if(await page.locator("#addAcctJoinAll").isVisible().catch(() => false)) await page.locator("#addAcctJoinAll").click()
  await page.waitForTimeout(3000)
}

const modes = page => page.evaluate(() => getAccounts().map(a => ({ label: a.label, mode: a.mode })))

;(async () => {
  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })
  const br = await chromium.launch()
  try {
    const gid = process.env.GAME || (await fetch(API + "/katomia/create", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ network: "testnet", visibility: "unlisted", lockRule: "cluster",
        profile: { name: "QA dialnet " + RUN_ID } }) }).then(r => r.json())).gameId
    log("testnet circle", gid, `${BASE}/m/katomia/board/${gid}?${HAPIQ}&tickets=1`)

    const mkPage = async nerd => {
      const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
      const page = await ctx.newPage()
      page.__dialogs = []
      page.on("dialog", d => { page.__dialogs.push(d.message()); d.accept() })
      await page.goto(`${BASE}/m/katomia/board/${gid}?${HAPIQ}&tickets=1`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(3000)
      if(nerd) await page.evaluate(() => document.body.classList.add("nerd"))
      return page
    }

    const a = await mkPage(true), b = await mkPage(true)
    await addManual(a, MAKER)
    await addManual(b, TAKER)
    await a.waitForTimeout(2000)

    // ══ 1. this really is a real network ══════════════════════════════════════
    t("the circle is on testnet", await a.evaluate(() => gameMeta?.network) === "testnet",
      String(await a.evaluate(() => gameMeta?.network)))
    t("both real accounts joined", (await modes(a)).length === 2, JSON.stringify(await modes(a)))
    const held = await a.evaluate(g => {
      const acc = getAccounts().find(x => isMyAccount(x))
      return { label: acc?.label, has: (acc?.assets?.[g] ?? 0) > 0 }
    }, GIVE)
    t("the maker holds the give asset on-chain", held.has === true, JSON.stringify(held))

    // ══ 2. THE REFUSAL IS GONE ════════════════════════════════════════════════
    // This is the phase-I claim, read straight off a testnet circle rather than a
    // stubbed gameMeta: the availability rule no longer consults the network.
    const avail = await a.evaluate(() => ({
      none: tktDialAvailable("none"), maker: tktDialAvailable("maker"), both: tktDialAvailable("both"),
      network: gameMeta?.network, rule: tktLockRule() }))
    t("on testnet, Firm is available", avail.maker.ok === true, JSON.stringify(avail.maker))
    t("on testnet, Instant is available under a cluster lock rule",
      avail.both.ok === (avail.rule === "cluster"), JSON.stringify(avail))
    t("no reason anywhere still says playnet-only",
      !/playnet only|SOURCE-UNIFY1/i.test(JSON.stringify(avail)), JSON.stringify(avail))

    // ══ 3. a Firm ticket, built by the real UI, on testnet ════════════════════
    await a.locator(`[data-chip-role="store"][data-asset-id="${GIVE}"]`).first().click({ force: true, timeout: 20000 })
    await a.locator('[data-testid="tkt-price-it"]').click({ timeout: 10000 })
    await a.locator("#tktModal .tkt-line").nth(1).locator("input").first().fill(WANT)
    await a.waitForTimeout(600)
    const dialOff = await a.locator('#tktModal .tkt-dial-opt[data-dial="maker"].off').count()
    t("the Firm position is not greyed out on testnet", dialOff === 0, "off-count=" + dialOff)
    await a.locator('#tktModal .tkt-dial-opt[data-dial="maker"]').click()
    await a.locator('[data-testid="tkt-create"]').click()
    await a.waitForTimeout(2500)

    const posted = await a.evaluate(() => {
      const o = Object.values(Object.values(state?.players || {}).find(p => Object.keys(p.orders || {}).length)?.orders || {})[0]
      return o ? { spec: o.intentSignature?.spec ?? null, sigOk: o.sigOk ?? null, sigSpec: o.sigSpec ?? null,
                   autoLock: o.autoLock ?? null } : null
    })
    t("the testnet ticket is signed under the new spec", posted?.spec === "1dcbd8c4", JSON.stringify(posted))
    t("the backend verified it on a real network", posted?.sigOk === true, JSON.stringify(posted))
    t("the dial that arrived is the one that was signed", posted?.autoLock === "maker", JSON.stringify(posted))

    // ══ 3b. the maker can see their dial actually bound ══════════════════════
    // Checked on the MAKER's own open ticket, which is where it matters and where it
    // lives. The first version of this diagnostic sat beside the take button, so the
    // maker never saw it and it disappeared the moment a ticket was filled.
    const makerDiag = await a.evaluate(async () => {
      document.getElementById("tktModal")?.remove()
      const c = document.querySelector(".board-chip.board-ticketed")
      if(!c) return null
      c.click()
      await new Promise(r => setTimeout(r, 900))
      return document.querySelector('[data-testid="tkt-sigstate"]')?.textContent || ""
    })
    t("the maker's own card says the dial is signed and verified",
      /signed and verified \(spec 1dcbd8c4\)/.test(makerDiag || ""), JSON.stringify(makerDiag))
    await a.evaluate(() => document.querySelector("#boardAssetDetail .asset-modal-close")?.click())

    // ══ 4. THE BEHAVIOUR ITSELF — a Firm take auto-locks the maker on testnet ═
    // Before phase I the backend logged "autoLock ignored off playnet" here and the
    // maker stayed in shop. This is the assertion the whole phase exists for.
    await b.waitForTimeout(1500)
    const label = await b.evaluate(async () => {
      const c = document.querySelector(".board-chip.board-ticketed")
      if(!c) return null
      c.click()
      await new Promise(r => setTimeout(r, 800))
      return document.querySelector('[data-testid="tkt-take"]')?.textContent || ""
    })
    t("the taker sees the ticket and its Firm label", /at this price/i.test(label || ""), JSON.stringify(label))
    await b.locator('[data-testid="tkt-take"]').click()
    await b.waitForTimeout(3500)

    const after = await b.evaluate(() => getAccounts().map(a => ({ label: a.label, mode: a.mode, mine: isMyAccount(a) })))
    t("ON TESTNET the maker's side auto-locked", after.some(x => !x.mine && x.mode === "lock"), JSON.stringify(after))
    t("…and the taker's did not", after.some(x => x.mine && x.mode !== "lock"), JSON.stringify(after))
    t("the take landed as a real fill group", await b.evaluate(() =>
      document.querySelectorAll(".board-fillrow").length) === 2)

    // ══ 5. a fully-taken ticket stops being an open ticket ════════════════════
    // v1 takes are all-or-nothing, so after a take there is nothing left to take and
    // the stub comes off the chip. Worth asserting rather than assuming: a stub that
    // outlived its ticket would invite a second take that cannot happen.
    // (This is also what showed the signed-dial note had been put in the wrong place —
    // it was hanging off the take button, which by definition is gone by now.)
    const stubs = await b.evaluate(() => document.querySelectorAll(".board-chip.board-ticketed").length)
    t("a fully-taken ticket no longer wears the stub", stubs === 0, "stubs=" + stubs)

    // ══ 6. what still cannot happen, asserted honestly ════════════════════════
    // The taker locks too, so the cluster is fully locked and settlement is attempted.
    // A ticket cluster carries no source.offers, so the proposal signer has nothing to
    // authorise against and the transaction expires unsigned (SOURCE-UNIFY1). What
    // must NOT happen is value moving without a signature.
    const beforeBal = await b.evaluate(g => {
      const acc = getAccounts().find(x => isMyAccount(x)); return acc?.assets?.[g] ?? 0 }, WANT)
    await b.evaluate(() => socket.send(JSON.stringify({ type: "game_toggleLock", gameId,
      accountId: getAccounts().filter(a => isMyAccount(a))[0].id, to: "lock" })))
    await b.waitForTimeout(9000)
    const afterBal = await b.evaluate(g => {
      const acc = getAccounts().find(x => isMyAccount(x)); return acc?.assets?.[g] ?? 0 }, WANT)
    t("no value moved without a signature (SOURCE-UNIFY1 still bites, and bites safely)",
      afterBal === beforeBal, JSON.stringify({ beforeBal, afterBal }))
    const pending = await b.evaluate(() => Object.keys(state?.tx?.pending || {}).length)
    log(`note: ${pending} pending tx after the lock — a ticket cluster produces no source.offers,`)
    log("      so the proposal signer has nothing to authorise and it expires. SOURCE-UNIFY1.")

    log("circle left in place for inspection:", `${BASE}/m/katomia/board/${gid}?${HAPIQ}&tickets=1`)
    await reportKflow("test:verdict", INSTANCE, { pass: !fails.length, asserts: n, fails, game: gid })
  } catch(e){ fails.push("harness: " + String(e.message).slice(0, 250)) }
  await br.close()
  log(fails.length ? `FAILED ${fails.length}/${n}: ` + fails.join(" | ") : `all ${n} assertions green`)
  log("verdict:", fails.length ? "fail" : "pass")
  process.exit(fails.length ? 1 : 0)
})()
