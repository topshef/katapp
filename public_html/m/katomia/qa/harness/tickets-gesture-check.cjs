// tickets-gesture-check.cjs — PROP-TICKETS1 phase B: the take, as a gesture.
//
// One verb (game_orderFill), two directions, plus the guard on the collision
// between the two ways an asset can leave your stall:
//
//  B1 — drag THEIR priced chip into YOUR space          = take at the price
//  B2 — drag YOUR asset onto a ticket that wants it     = the same take
//  B3 — drag YOUR OWN priced chip out as a plain offer  = ask first, because a
//       plain offer debits the store while a ticket debits nothing, so the
//       ticket is left backed by nothing and turns unsourced
//
// The load-bearing claims, all of which fail quietly if they break:
//  · the ticket IS the permission — B1 works even though the maker's store is
//    NOT pickable, which is the whole difference between a ticket and allowPick
//  · both gestures produce the SAME fill group the asset-card button produces
//  · wanted slots exist only DURING a drag (at rest they would double a
//    ticket's footprint, undoing phase A)
//  · an unsourced ticket stays VISIBLE — it must never silently vanish
//
//   node tickets-gesture-check.cjs
//   API=https://alpha.katlab.kpay.live BASE=https://lab1.katlab.kpay.live node tickets-gesture-check.cjs
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const API  = (process.env.API  || "https://alpha.katlab.kpay.live").replace(/\/+$/, "")
const BASE = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const INSTANCE = "TICKETS-GESTURE-01"
const HAPIQ = process.env.CROSS === "1" ? "hapi_base=" + API.replace(/^https?:\/\//, "") : "x=1"
const RUN_ID = "tktg-" + Date.now().toString(36)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[tktgest]", ...a)

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
}

// HTML5 drag-and-drop cannot be driven by mouse events in a headless browser, so
// the gesture is exercised through the same dataTransfer contract the real drag
// uses: build the payload the chip's ondragstart would set, then hand it to the
// target's ondrop. This tests OUR wiring (payload shape, drop routing, verb),
// which is what phase B actually adds; the browser's own dnd plumbing is not
// under test and cannot regress from this repo.
async function dragChipToOwnZone(page, chipSel){
  return page.evaluate(sel => {
    const chip = document.querySelector(sel)
    if(!chip) return "no chip"
    const mine = getAccounts().filter(a => isMyAccount(a))[0]
    if(!mine) return "no account of mine"
    const wedge = [...document.querySelectorAll("[data-drop-account]")]
      .find(w => w.__dropAccount && w.__dropAccount.id === mine.id)
    if(!wedge) return "no wedge"
    const data = {}
    const dt = { setData: (k, v) => data[k] = String(v), getData: k => data[k] || "" }
    chip.ondragstart({ dataTransfer: dt })
    const r = wedge.getBoundingClientRect()
    wedge.ondrop({ dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
                   preventDefault(){}, stopPropagation(){} })
    return "ok"
  }, chipSel)
}

const fillRows = page => page.evaluate(() => document.querySelectorAll(".board-fillrow").length)
const openTickets = page => page.evaluate(() =>
  Object.values(state?.players || {}).flatMap(p => Object.keys(p.orders || {})).length)

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

    const mkPage = async () => {
      const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
      const page = await ctx.newPage()
      // ONE dialog handler per page: a second listener that also accepts throws
      // ("Cannot accept dialog which is already handled"). It records as well as
      // accepts, so assertions can read what was actually asked.
      page.__dialogs = []
      page.on("dialog", d => { page.__dialogs.push(d.message()); d.accept() })
      await page.goto(`${BASE}/m/katomia/board/${gid}?${HAPIQ}&tickets=1`, { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(2500)
      return page
    }
    const alice = await mkPage(), bob = await mkPage()
    await addManual(alice, "0.0.111")
    await addManual(bob, "0.0.222")
    await alice.waitForTimeout(1200)

    // alice prices her apple for a banana. Her store is NOT pickable — the whole
    // point of B1 is that a ticket grants the take on its own.
    t("maker's store is NOT pickable", await alice.evaluate(() =>
      !playerAllowsPick(getAccounts().filter(a => isMyAccount(a))[0].playerId)))
    await alice.locator('[data-chip-role="store"][data-asset-id="apple"]').first().click({ force: true, timeout: 10000 })
    await alice.locator('[data-testid="tkt-price-it"]').click({ timeout: 8000 })
    await alice.locator("#tktModal .tkt-line").nth(1).locator("input").first().fill("banana")
    await alice.locator('[data-testid="tkt-create"]').click()
    await alice.waitForTimeout(1800)

    // ── B1 ──────────────────────────────────────────────────────────────────
    t("their priced chip is draggable without allowPick", await bob.evaluate(() => {
      const c = document.querySelector(".board-chip.board-ticketed")
      return !!c && c.draggable === true && c.classList.contains("board-tkt-drag")
    }))
    t("an unpriced chip of theirs is NOT draggable", await bob.evaluate(() => {
      const c = [...document.querySelectorAll('.board-chip[data-asset-id="carrot"]')]
        .find(e => e.dataset.ownerAccount && !isMyAccount(getAccountMap()[e.dataset.ownerAccount]))
      return !c || c.draggable !== true
    }))
    const r1 = await dragChipToOwnZone(bob, ".board-chip.board-ticketed")
    await bob.waitForTimeout(1800)
    t("B1 drag lands the take", r1 === "ok" && (await fillRows(bob)) === 2, `drag=${r1} rows=${await fillRows(bob)}`)
    t("B1 take is the same fill group the button makes", (await fillRows(alice)) === 2)
    // phase D: the default dial is Firm, so the drag-take commits the maker's
    // side exactly as the button does — the point here is that the GESTURE and
    // the button produce identical outcomes, not that nothing locks.
    const afterDrag = await alice.evaluate(() => getAccounts().map(a => ({ mine: isMyAccount(a), mode: a.mode })))
    t("B1 drag auto-locks exactly like the button (Firm default)",
      afterDrag.some(a => a.mine && a.mode === "lock") && afterDrag.some(a => !a.mine && a.mode !== "lock"),
      JSON.stringify(afterDrag))

    // unwind: recall so the ticket reopens, ready for B2
    await alice.locator(".board-fillrow").first().click({ force: true })
    await alice.locator('[data-testid="tkt-recall"], [data-testid="tkt-return"]').first().click({ timeout: 8000 })
    await alice.waitForTimeout(1800)
    t("recall reopened the ticket", (await fillRows(alice)) === 0 && (await openTickets(alice)) === 1)

    // ── B2 ──────────────────────────────────────────────────────────────────
    t("no wanted slot at rest", await bob.locator(".board-tkt-slot").count() === 0)
    // bob picks up his banana — alice's apple ticket wants a banana, so it lights
    const lit = await bob.evaluate(() => {
      const chip = [...document.querySelectorAll('.board-chip[data-asset-id="banana"]')]
        .find(e => isMyAccount(getAccountMap()[e.dataset.ownerAccount]))
      if(!chip) return { err: "no banana of mine" }
      chip.ondragstart({ dataTransfer: { setData(){}, getData: () => "" } })
      return { slots: document.querySelectorAll(".board-tkt-slot").length,
               onTicket: !!document.querySelector(".board-ticketed.board-tkt-slot") }
    })
    t("dragging a wanted asset reveals the slot", lit.slots === 1 && lit.onTicket === true, JSON.stringify(lit))
    t("the slot is the maker's priced chip, not a new node",
      await bob.evaluate(() => document.querySelectorAll(".board-tkt-slot").length ===
                               document.querySelectorAll(".board-ticketed.board-tkt-slot").length))
    const r2 = await bob.evaluate(() => {
      const slot = document.querySelector(".board-tkt-slot")
      const rr = slot.getBoundingClientRect()
      const wedge = [...document.querySelectorAll("[data-drop-account]")].find(w => w.__dropAccount)
      wedge.ondrop({ dataTransfer: { getData: () => "" }, clientX: rr.left + rr.width / 2,
                     clientY: rr.top + rr.height / 2, preventDefault(){}, stopPropagation(){} })
      return "ok"
    })
    await bob.waitForTimeout(1800)
    t("B2 drop-on-the-slot takes the ticket", r2 === "ok" && (await fillRows(bob)) === 2, `rows=${await fillRows(bob)}`)
    t("the slot clears once the drag is over", await bob.locator(".board-tkt-slot").count() === 0)

    await alice.locator(".board-fillrow").first().click({ force: true })
    await alice.locator('[data-testid="tkt-recall"], [data-testid="tkt-return"]').first().click({ timeout: 8000 })
    await alice.waitForTimeout(1800)

    // ── B3 ──────────────────────────────────────────────────────────────────
    // alice offers her PRICED apple to bob. The confirm is auto-accepted by the
    // dialog handler, so what is asserted is that it was ASKED and that the
    // outcome is honest: the apple is gone and the ticket is visibly unsourced.
    alice.__dialogs.length = 0
    // Driven at boardExecuteDrop rather than through a synthetic wedge drop: the
    // guard lives in the executor, and a pie-slice hit test aimed at a bounding-box
    // centre resolves to whichever wedge actually contains that point — which is
    // the drag plumbing, not what phase B3 adds.
    const dropRes = await alice.evaluate(async () => {
      const chip = document.querySelector(".board-chip.board-ticketed")
      const dt = {}
      chip.ondragstart({ dataTransfer: { setData: (k, v) => dt[k] = String(v), getData: k => dt[k] || "" } })
      const mineIds = getAccounts().filter(a => isMyAccount(a)).map(a => a.id)
      const target = getAccounts().find(a => !mineIds.includes(a.id))
      if(!target) return "no counterparty"
      await boardExecuteDrop({ assetId: dt.assetId, available: Number(dt.available) || 1,
        fromAccountId: dt.fromAccountId, fromBasketToAccountId: "" }, target, null)
      return "ok"
    })
    t("B3 drop reached the executor", dropRes === "ok", String(dropRes))
    await alice.waitForTimeout(2200)
    const asked = alice.__dialogs.find(m => /priced/i.test(m)) || null
    t("B3 asked before double-promising", !!asked, JSON.stringify(String(asked).slice(0, 80)))
    t("B3 warned that the ticket goes unsourced", !!asked && /unsourced/i.test(asked))
    const apples = await alice.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.assets?.apple || 0)
    t("the offer really did leave the store", apples === 0, "apple=" + apples)
    t("the ticket is still open", (await openTickets(alice)) === 1)
    t("and it is VISIBLY unsourced, not vanished",
      await alice.locator("[data-tkt-unsourced]").count() === 1)
    t("the other player sees the unsourced ticket too",
      await bob.locator("[data-tkt-unsourced]").count() === 1)
    await alice.screenshot({ path: __dirname + "/tickets-gesture-unsourced.png", fullPage: false })

    await reportKflow("test:verdict", INSTANCE, { pass: !fails.length, asserts: n, fails })
  } catch(e){ fails.push("harness: " + String(e.message).slice(0, 200)) }
  await br.close()
  log(fails.length ? `FAILED ${fails.length}/${n}: ` + fails.join(" | ") : `all ${n} assertions green`)
  log("verdict:", fails.length ? "fail" : "pass")
  process.exit(fails.length ? 1 : 0)
})()
