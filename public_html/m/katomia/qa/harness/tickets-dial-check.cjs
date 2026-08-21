// tickets-dial-check.cjs — PROP-TICKETS1 phase D: the settlement dial.
//
//   Negotiable  a take lays both sides out; nobody locks           (today)
//   Firm        the maker's side locks; the taker still looks      (default)
//   Instant     both lock and the cluster settles immediately      (nerd only)
//
// One maker-set control. The taker consents by TAKING, which is only honest if
// the button says what taking will do — so the button label is asserted here as
// carefully as the mechanics.
//
// ONE INTERLOCK SURVIVES, and it is safety rather than polish:
//  · Instant needs lockRule "cluster". Under "active"/"all" the circle waits for
//    people who are not in this trade, so "instant" would be a promise the circle
//    cannot keep. Disabled with the reason, never silently downgraded.
//
// THE OTHER ONE IS GONE (phase I, 2026-08-21). Off playnet, anything but Negotiable
// used to be refused, because the dial rode OUTSIDE the signed payload — unsigned
// execution semantics on a real network. It is inside the signature now (spec
// 1dcbd8c4) and the backend verifies that signature on the way in, so §7 asserts the
// refusal has genuinely lifted and §8 asserts the wiring that replaced it. The
// tamper cases live in T:ORDERSIG-01, which can edit a signed field; a browser can't.
//
// AND THE STAND-DOWN RULE: a fill tears up the locks it invalidates, so auto-locking
// on top of one would be consenting to a board nobody has seen. Since PROP-LOCKSCOPE1
// that question is asked of THIS CLUSTER rather than the whole circle — a negotiation
// in a far corner no longer stands the dial down. It stands down and notifies instead.
//
//   node tickets-dial-check.cjs
//   API=https://alpha.katlab.kpay.live BASE=https://lab1.katlab.kpay.live node tickets-dial-check.cjs
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const API  = (process.env.API  || "https://alpha.katlab.kpay.live").replace(/\/+$/, "")
const BASE = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const INSTANCE = "TICKETS-DIAL-01"
const HAPIQ = process.env.CROSS === "1" ? "hapi_base=" + API.replace(/^https?:\/\//, "") : "x=1"
const RUN_ID = "tktd-" + Date.now().toString(36)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[tktdial]", ...a)

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

const mkCircle = (extra = {}) => fetch(API + "/katomia/create", { method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ network: "playnet", visibility: "unlisted", profile: { name: "QA " + RUN_ID }, ...extra }) })
  .then(r => r.json())

const modes = page => page.evaluate(() => getAccounts().map(a => a.mode))
const setNerd = page => page.evaluate(() => document.body.classList.add("nerd"))

// price the "give" asset with a chosen dial position
async function priceIt(page, giveAsset, wantAsset, dial){
  await page.locator(`[data-chip-role="store"][data-asset-id="${giveAsset}"]`).first().click({ force: true, timeout: 10000 })
  await page.locator('[data-testid="tkt-price-it"]').click({ timeout: 8000 })
  await page.locator("#tktModal .tkt-line").nth(1).locator("input").first().fill(wantAsset)
  if(dial) await page.locator(`#tktModal .tkt-dial-opt[data-dial="${dial}"]`).click()
  await page.locator('[data-testid="tkt-create"]').click()
  await page.waitForTimeout(1800)
}

;(async () => {
  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })
  const br = await chromium.launch()
  try {
    const mkPage = async (gid, nerd) => {
      const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
      const page = await ctx.newPage()
      page.__dialogs = []
      page.on("dialog", d => { page.__dialogs.push(d.message()); d.accept() })
      await page.goto(`${BASE}/m/katomia/board/${gid}?${HAPIQ}&tickets=1`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(2500)
      if(nerd) await setNerd(page)
      return page
    }

    // ══ 1. the control itself ═════════════════════════════════════════════════
    const g1 = (await mkCircle()).gameId
    log("playnet circle (cluster lock rule)", g1)
    const alice = await mkPage(g1, true), bob = await mkPage(g1, true)
    await addManual(alice, "0.0.111")
    await addManual(bob, "0.0.222")
    await alice.waitForTimeout(1200)

    // normal mode first, on a page that actually holds the asset ("Price it…"
    // only exists on your own chip), then switch the same page to nerd mode
    await alice.evaluate(() => document.body.classList.remove("nerd"))
    await alice.locator('[data-chip-role="store"][data-asset-id="apple"]').first().click({ force: true, timeout: 10000 })
    await alice.locator('[data-testid="tkt-price-it"]').click({ timeout: 8000 })
    t("normal mode never sees the dial", await alice.locator('[data-testid="tkt-dial"]').count() === 0)
    await alice.locator("#tktModal .asset-modal-close").click()
    await alice.waitForTimeout(300)
    await setNerd(alice)

    await alice.locator('[data-chip-role="store"][data-asset-id="apple"]').first().click({ force: true })
    await alice.locator('[data-testid="tkt-price-it"]').click({ timeout: 8000 })
    t("nerd mode shows the dial", await alice.locator('[data-testid="tkt-dial"]').count() === 1)
    t("it has exactly three positions", await alice.locator(".tkt-dial-opt").count() === 3)
    t("Firm is the default", await alice.locator('.tkt-dial-opt[data-dial="maker"].on').count() === 1)
    t("Instant is available under a cluster lock rule",
      await alice.locator('.tkt-dial-opt[data-dial="both"]:not(.off)').count() === 1)
    await alice.locator("#tktModal .asset-modal-close").click()
    await alice.waitForTimeout(400)

    // ══ 2. Negotiable — nobody locks ══════════════════════════════════════════
    await priceIt(alice, "apple", "banana", "none")
    await bob.waitForTimeout(800)
    t("Negotiable: the button says you'll haggle", /haggle/i.test(
      await bob.evaluate(async () => {
        const c = document.querySelector(".board-chip.board-ticketed"); c.click()
        await new Promise(r => setTimeout(r, 500))
        return document.querySelector('[data-testid="tkt-take"]')?.textContent || ""
      })))
    await bob.locator('[data-testid="tkt-take"]').click()
    await bob.waitForTimeout(1800)
    t("Negotiable: nobody auto-locked", (await modes(bob)).every(m => m !== "lock"), JSON.stringify(await modes(bob)))

    // ══ 3. Firm — the maker's side locks, the taker's does not ════════════════
    const g2 = (await mkCircle()).gameId
    const a2 = await mkPage(g2, true), b2 = await mkPage(g2, true)
    await addManual(a2, "0.0.111"); await addManual(b2, "0.0.222")
    await a2.waitForTimeout(1200)
    await priceIt(a2, "apple", "banana", "maker")
    await b2.waitForTimeout(800)
    const firmLabel = await b2.evaluate(async () => {
      const c = document.querySelector(".board-chip.board-ticketed"); c.click()
      await new Promise(r => setTimeout(r, 500))
      return document.querySelector('[data-testid="tkt-take"]')?.textContent || ""
    })
    t("Firm: the button says 'at this price'", /at this price/i.test(firmLabel), JSON.stringify(firmLabel))
    await b2.locator('[data-testid="tkt-take"]').click()
    await b2.waitForTimeout(2200)
    const m2 = await b2.evaluate(() => getAccounts().map(a => ({ id: a.id, mode: a.mode, mine: isMyAccount(a) })))
    t("Firm: the maker's side locked", m2.some(a => !a.mine && a.mode === "lock"), JSON.stringify(m2))
    t("Firm: the taker's side did NOT", m2.some(a => a.mine && a.mode !== "lock"), JSON.stringify(m2))
    // playnet seeds ONE of each, so "not settled" is still-1, not zero
    const b2apple = await b2.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.assets?.apple ?? 0)
    t("Firm: it has not settled yet", b2apple === 1, "apple=" + b2apple)
    // one lock from the taker finishes it — the step the dial removed was the maker's
    await b2.evaluate(() => socket.send(JSON.stringify({ type: "game_toggleLock", gameId,
      accountId: getAccounts().filter(a => isMyAccount(a))[0].id })))
    await b2.waitForTimeout(3000)
    t("Firm: ONE taker action settles it", await b2.evaluate(() =>
      (getAccounts().filter(a => isMyAccount(a))[0]?.assets?.apple || 0) === 2))

    // ══ 4. Instant — settles with no locking step at all ══════════════════════
    const g3 = (await mkCircle()).gameId
    const a3 = await mkPage(g3, true), b3 = await mkPage(g3, true)
    await addManual(a3, "0.0.111"); await addManual(b3, "0.0.222")
    await a3.waitForTimeout(1200)
    await priceIt(a3, "apple", "banana", "both")
    await b3.waitForTimeout(800)
    const instLabel = await b3.evaluate(async () => {
      const c = document.querySelector(".board-chip.board-ticketed"); c.click()
      await new Promise(r => setTimeout(r, 500))
      return document.querySelector('[data-testid="tkt-take"]')?.textContent || ""
    })
    t("Instant: the button says it settles instantly", /instantly|buy now/i.test(instLabel), JSON.stringify(instLabel))
    await b3.locator('[data-testid="tkt-take"]').click()
    await b3.waitForTimeout(3200)
    t("Instant: settled with NO locking step", await b3.evaluate(() =>
      (getAccounts().filter(a => isMyAccount(a))[0]?.assets?.apple || 0) === 2),
      JSON.stringify(await b3.evaluate(() => getAccounts().map(a => a.assets))))

    // ══ 5. stand-down: the table was mid-agreement ════════════════════════════
    const g4 = (await mkCircle()).gameId
    const a4 = await mkPage(g4, true), b4 = await mkPage(g4, true)
    await addManual(a4, "0.0.111"); await addManual(b4, "0.0.222")
    await a4.waitForTimeout(1200)
    await priceIt(a4, "apple", "banana", "both")
    await b4.waitForTimeout(800)
    // somebody locks first — now the table is not quiet
    await a4.evaluate(() => socket.send(JSON.stringify({ type: "game_toggleLock", gameId,
      accountId: getAccounts().filter(a => isMyAccount(a))[0].id })))
    await a4.waitForTimeout(1200)
    t("someone is locked before the take", (await modes(a4)).includes("lock"), JSON.stringify(await modes(a4)))
    await b4.evaluate(async () => {
      document.querySelector(".board-chip.board-ticketed").click()
      await new Promise(r => setTimeout(r, 500))
      document.querySelector('[data-testid="tkt-take"]').click()
    })
    await b4.waitForTimeout(2500)
    t("stand-down: an Instant take on a busy table did NOT settle", await b4.evaluate(() =>
      (getAccounts().filter(a => isMyAccount(a))[0]?.assets?.apple || 0) !== 2),
      JSON.stringify(await b4.evaluate(() => getAccounts().map(a => a.assets))))
    t("stand-down: nobody is left auto-locked either", (await modes(b4)).every(m => m !== "lock"),
      JSON.stringify(await modes(b4)))

    // ══ 6. interlock — lock rule "all" cannot honour Instant ══════════════════
    const g5 = (await mkCircle({ lockRule: "all" })).gameId
    const a5 = await mkPage(g5, true)
    await addManual(a5, "0.0.111")
    await a5.waitForTimeout(1000)
    const rule = await a5.evaluate(() => gameMeta?.lockRule)
    await a5.locator('[data-chip-role="store"]').first().click({ force: true })
    await a5.locator('[data-testid="tkt-price-it"]').click({ timeout: 8000 })
    if(rule === "all"){
      t("lock rule 'all': Instant is disabled", await a5.locator('.tkt-dial-opt[data-dial="both"].off').count() === 1)
      t("lock rule 'all': and it says why", /everyone agrees/i.test(
        await a5.locator('.tkt-dial-opt[data-dial="both"]').getAttribute("title") || ""))
      t("lock rule 'all': Firm is still offered", await a5.locator('.tkt-dial-opt[data-dial="maker"]:not(.off)').count() === 1)
    } else {
      log("note: create ignored lockRule=all (got", rule + ") — interlock asserted by unit shape instead")
      t("lock rule interlock is computed from gameMeta.lockRule", await a5.evaluate(() =>
        typeof tktDialAvailable === "function" && tktDialAvailable("both").ok === (tktLockRule() === "cluster")))
    }

    // ══ 7. the network interlock is GONE — phase I ════════════════════════════
    // It was standing in for "the dial is unsigned execution semantics". The dial is
    // inside the signed payload now (spec 1dcbd8c4) and the backend verifies that
    // signature on the way in, so the maker's instruction travels with its proof and
    // the network no longer decides. What survives is the LOCK-RULE interlock, which
    // was never about signing: under active/all a connected pair cannot settle on its
    // own, so "instant" would be a promise the circle cannot keep.
    // Driven with a stubbed network rather than a testnet circle — the rule is the
    // thing under test, and the backend refuses independently either way.
    const offnet = await a5.evaluate(() => {
      const real = gameMeta.network
      try {
        gameMeta.network = "mainnet"
        return { none: tktDialAvailable("none").ok, maker: tktDialAvailable("maker"), both: tktDialAvailable("both") }
      } finally { gameMeta.network = real }
    })
    t("off playnet: Negotiable stays available", offnet.none === true)
    t("off playnet: Firm is now OFFERED — the dial is signed", offnet.maker.ok === true, JSON.stringify(offnet.maker))
    t("off playnet: no reason mentions the old signing gap",
      !/SOURCE-UNIFY1|playnet only/i.test(JSON.stringify(offnet)), JSON.stringify(offnet.maker.why || ""))
    if(rule === "all"){
      t("off playnet: Instant is still refused, on the LOCK RULE not the network",
        offnet.both.ok === false && /everyone agrees/i.test(offnet.both.why || ""), JSON.stringify(offnet.both))
    } else {
      t("off playnet: Instant tracks the lock rule, not the network",
        offnet.both.ok === (rule === "cluster"), JSON.stringify({ rule, both: offnet.both }))
    }

    // ══ 8. the dial rides the signature — phase I ═════════════════════════════
    // The mechanics of "which bytes are signed" are covered properly by the unit
    // suite T:ORDERSIG-01, which can tamper. What is asserted here is the wiring: a
    // ticket built by the real UI carries the new spec, and the backend says it
    // verified it. If either half of that is wrong the dial silently degrades to
    // playnet-only again, and nothing else in this suite would notice.
    const g6 = (await mkCircle()).gameId
    const a6 = await mkPage(g6, true)
    await addManual(a6, "0.0.111")
    await a6.waitForTimeout(1000)
    await priceIt(a6, "apple", "banana", "maker")
    const posted = await a6.evaluate(() => {
      const o = Object.values(Object.values(state?.players || {}).find(p => Object.keys(p.orders || {}).length)?.orders || {})[0]
      return o ? { spec: o.intentSignature?.spec ?? null, sigOk: o.sigOk ?? null, sigSpec: o.sigSpec ?? null, autoLock: o.autoLock ?? null } : null
    })
    t("the ticket is signed under the new spec", posted?.spec === "1dcbd8c4", JSON.stringify(posted))
    t("the backend verified it on the way in", posted?.sigOk === true, JSON.stringify(posted))
    t("…under that same spec", posted?.sigSpec === "1dcbd8c4", JSON.stringify(posted))
    t("and the dial it signed is the one that arrived", posted?.autoLock === "maker", JSON.stringify(posted))

    // sign one dial, post another — the backend must refuse to call it verified
    await a6.evaluate(async () => {
      const acc = getAccounts().filter(a => isMyAccount(a))[0]
      const hac = acc.label
      const bundle = [{ accountId: hac, asset: "carrot", amount: -1 }, { accountId: hac, asset: "banana", amount: 1 }]
      const order = await tktBuildOrder(bundle, "none")          // signs Negotiable…
      socket.send(JSON.stringify({ type: "game_orderCreate", gameId,
        order: { ...order, orderType: "simple-ft", autoLock: "both" } }))   // …posts Instant
    })
    await a6.waitForTimeout(1800)
    const tampered = await a6.evaluate(() => {
      const orders = Object.values(state?.players || {}).flatMap(p => Object.values(p.orders || {}))
      const o = orders.find(x => (x.bundle || []).some(l => l.asset === "carrot"))
      return o ? { sigOk: o.sigOk ?? null, autoLock: o.autoLock ?? null } : null
    })
    t("a dial edited after signing is NOT marked verified", tampered?.sigOk === false, JSON.stringify(tampered))

    await reportKflow("test:verdict", INSTANCE, { pass: !fails.length, asserts: n, fails })
  } catch(e){ fails.push("harness: " + String(e.message).slice(0, 250)) }
  await br.close()
  log(fails.length ? `FAILED ${fails.length}/${n}: ` + fails.join(" | ") : `all ${n} assertions green`)
  log("verdict:", fails.length ? "fail" : "pass")
  process.exit(fails.length ? 1 : 0)
})()
