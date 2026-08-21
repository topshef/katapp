// tickets-quiet-check.cjs — PROP-TICKETS1 phase A ("the quiet ticket").
//
// A1 replaced the standalone ticket object on the felt with a perforated right
// edge on the GIVE-LEG'S OWN CHIP, and moved manage/take into that chip's asset
// card. This gate guards the three things that can silently go wrong with that:
//
//  1. the cue is THERE   — the priced chip carries .board-ticketed, and no
//                          standalone .board-ticket object exists anywhere
//  2. the cue costs NO HEIGHT — a ticketed chip is exactly as tall as the same
//                          chip unticketed. bandFull = tallest chip + 12, so a
//                          taller chip inflates the whole counter band and pushes
//                          store chips off a 390px screen (the P5a regression).
//                          Measured on a 390x844 viewport, where it actually bit.
//  3. the pick pennant SURVIVES — the stub is a CSS mask, and a mask clips
//                          everything the element paints, including the ::before
//                          pick flag that juts out to the LEFT. If masking ever
//                          eats the pennant, a pickable priced chip silently
//                          loses its pickable cue. Asserted by geometry, because
//                          it is invisible to any DOM-only check.
//
//   node tickets-quiet-check.cjs
//   API=https://alpha.katlab.kpay.live BASE=https://lab1.katlab.kpay.live node tickets-quiet-check.cjs
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const API  = (process.env.API  || "https://alpha.katlab.kpay.live").replace(/\/+$/, "")
const BASE = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const INSTANCE = "TICKETS-QUIET-01"
const HAPIQ = process.env.CROSS === "1" ? "hapi_base=" + API.replace(/^https?:\/\//, "") : "x=1"
const RUN_ID = "tktq-" + Date.now().toString(36)
const SHOT = __dirname + "/tickets-quiet-last.png"
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[tktquiet]", ...a)

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

// height of a named store chip, rounded — the number bandFull is computed from
const chipHeight = (page, assetId) => page.evaluate(a => {
  const el = document.querySelector(`.board-chip[data-asset-id="${a}"]`)
  return el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : -1
}, assetId)

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

    // 390x844 — the viewport the band-inflation regression actually appeared on
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true })
    const alice = await ctx.newPage()
    alice.on("dialog", d => d.accept())
    await alice.goto(`${BASE}/m/katomia/board/${gid}?${HAPIQ}&tickets=1`, { waitUntil: "domcontentloaded" })
    await alice.waitForTimeout(2500)
    await addManual(alice, "0.0.111")
    await alice.waitForTimeout(1200)

    // make the store pickable FIRST, so the pennant is already on the chip that
    // is about to be masked — this is the combination that can clip
    await alice.evaluate(() => {
      const cb = document.getElementById("boardPrefPickable")
      if(cb && !cb.checked){ cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })) }
    })
    await alice.waitForTimeout(1200)

    const bare = await chipHeight(alice, "apple")
    const bareCarrot = await chipHeight(alice, "carrot")
    t("baseline: store chips rendered", bare > 0 && bareCarrot > 0, `apple=${bare} carrot=${bareCarrot}`)

    // ── price the apple ─────────────────────────────────────────────────────
    await alice.locator('[data-chip-role="store"][data-asset-id="apple"]').first().click({ force: true, timeout: 10000 })
    await alice.locator('[data-testid="tkt-price-it"]').click({ timeout: 8000 })
    await alice.locator("#tktModal .tkt-line").nth(1).locator("input").first().fill("banana")
    await alice.locator('[data-testid="tkt-create"]').click()
    await alice.waitForTimeout(1800)

    // 1 — the cue is there, and the old object is not
    t("priced chip wears the stub", await alice.locator('.board-chip.board-ticketed[data-asset-id="apple"]').count() === 1)
    t("no standalone ticket object on the felt", await alice.locator(".board-ticket").count() === 0)
    t("the stub rides the GIVE leg only", await alice.locator('.board-chip.board-ticketed[data-asset-id="carrot"]').count() === 0)

    // 2 — zero height cost, both against its own former height and its neighbour
    const ticketed = await chipHeight(alice, "apple")
    const carrotNow = await chipHeight(alice, "carrot")
    t("ticket cue costs no chip height", Math.abs(ticketed - bare) < 0.6, `before=${bare} after=${ticketed}`)
    t("neighbouring chips unchanged", Math.abs(carrotNow - bareCarrot) < 0.6, `before=${bareCarrot} after=${carrotNow}`)

    // 3 — the mask must not eat the pick pennant (::before, juts LEFT, outside
    //     the border box — exactly what a mask clips). Geometry, not DOM.
    const pennant = await alice.evaluate(() => {
      const el = document.querySelector('.board-chip.board-ticketed[data-asset-id="apple"]')
      if(!el) return { err: "no ticketed chip" }
      const cs = getComputedStyle(el, "::before")
      const own = getComputedStyle(el)
      return { pick: el.classList.contains("board-pickchip"),
               content: cs.content, w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || 0,
               left: parseFloat(cs.left) || 0,
               masked: (own.maskImage || own.webkitMaskImage || "none") !== "none",
               clip: own.maskClip || own.webkitMaskClip || "" }
    })
    t("the priced chip is also pickable (the risky combination)", pennant.pick === true, JSON.stringify(pennant))
    t("the stub is actually a mask", pennant.masked === true)
    t("pick pennant box exists", pennant.w > 0 && pennant.h > 0 && pennant.content !== "none",
      `w=${pennant.w} h=${pennant.h}`)
    // THE assert that matters. The pennant hangs OUTSIDE the border box (negative
    // left), so with the default mask-clip the mask eats it — which is exactly what
    // the first cut of this feature did, invisibly: every DOM and computed-style
    // check above still passed while the pennant was simply not painted. mask-clip
    // must stay no-clip, and the mask tile must reach left far enough to cover the
    // pennant in an OPAQUE region. Verified by eye once (qa/harness screenshot);
    // this is the guard that keeps it verified.
    t("the mask does not clip at the border box (pennant survives)", pennant.clip === "no-clip", `mask-clip=${pennant.clip}`)
    t("the mask tile reaches past the pennant", pennant.left > -24, `pennant left=${pennant.left}px vs tile -24px`)

    // 4 — the card is the way in: tap the priced chip, get the ticket section
    await alice.locator('.board-chip.board-ticketed[data-asset-id="apple"]').first().click({ force: true })
    await alice.waitForTimeout(700)
    t("tapping a priced chip opens its asset card", await alice.locator("#boardAssetDetail").count() === 1)
    t("the card carries the ticket section", await alice.locator('[data-testid="tkt-section"]').count() === 1)
    t("the maker gets tear-up in the card", await alice.locator('[data-testid="tkt-cancel"]').count() === 1)
    await alice.screenshot({ path: SHOT, fullPage: false })
    log("screenshot", SHOT)
    await alice.locator("#boardAssetDetail .asset-modal-close").click().catch(() => {})
    await alice.waitForTimeout(400)

    // ── A2: the priced stack SPLITS ─────────────────────────────────────────
    // Needs a stack of more than one, and playnet seeds exactly one of each — so
    // earn it: run the ticket to settlement and the taker ends up holding two
    // apples. Then price ONE of them and the stack must show as 1 + 1, with the
    // stub on exactly one chip.
    const bobCtx = await br.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true })
    const bob = await bobCtx.newPage()
    bob.on("dialog", d => d.accept())
    await bob.goto(`${BASE}/m/katomia/board/${gid}?${HAPIQ}&tickets=1`, { waitUntil: "domcontentloaded" })
    await bob.waitForTimeout(2500)
    await addManual(bob, "0.0.222")
    await bob.waitForTimeout(1500)

    await bob.locator('[data-tkt-chip]').first().click({ force: true, timeout: 10000 })
    await bob.locator('[data-testid="tkt-take"]').click({ timeout: 8000 })
    await bob.waitForTimeout(1500)
    const accA = await alice.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.id)
    const accB = await bob.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.id)
    await send(alice, { type: "game_toggleLock", accountId: accA, to: "lock" })
    await send(bob, { type: "game_toggleLock", accountId: accB, to: "lock" })
    await bob.waitForTimeout(3200)
    const bApples = await bob.evaluate(() => getAccounts().filter(a => isMyAccount(a))[0]?.assets?.apple)
    t("settled — the taker now holds a stack of two", bApples === 2, "apple=" + bApples)

    const appleChips = () => bob.evaluate(() => [...document.querySelectorAll('.board-chip[data-asset-id="apple"]')]
      .map(e => ({ text: (e.textContent || "").trim(), stub: e.classList.contains("board-ticketed"),
                   ghost: e.classList.contains("board-ghost"),
                   h: Math.round(e.getBoundingClientRect().height * 10) / 10 })))
    const beforeSplit = await appleChips()
    t("one chip before pricing", beforeSplit.length === 1, JSON.stringify(beforeSplit))

    await bob.locator('[data-chip-role="store"][data-asset-id="apple"]').first().click({ force: true })
    await bob.locator('[data-testid="tkt-price-it"]').click({ timeout: 8000 })
    await bob.locator("#tktModal .tkt-line").first().locator(".tkt-amt").fill("1")
    await bob.locator("#tktModal .tkt-line").nth(1).locator("input").first().fill("carrot")
    await bob.locator('[data-testid="tkt-create"]').click()
    await bob.waitForTimeout(2000)

    const after = await appleChips()
    t("the priced stack splits in two", after.length === 2, JSON.stringify(after))
    t("exactly one slice wears the stub", after.filter(c => c.stub).length === 1, JSON.stringify(after.map(c => c.stub)))
    // D12: nothing has left the store, so neither slice may be drawn as a ghost
    t("neither slice is a dashed ghost", after.every(c => !c.ghost))
    t("the split costs no height either", after.every(c => Math.abs(c.h - bare) < 0.6), JSON.stringify(after.map(c => c.h)))
    await bob.screenshot({ path: __dirname + "/tickets-quiet-split.png", fullPage: false })

    // ── A3: hover peek + "who could fill this?" ─────────────────────────────
    // Desktop only by design (BOARD-TIPTOUCH1), so this runs in a hover-capable
    // wide context rather than the 390px phone above.
    const deskCtx = await br.newContext({ viewport: { width: 1200, height: 900 }, ignoreHTTPSErrors: true })
    const desk = await deskCtx.newPage()
    desk.on("dialog", d => d.accept())
    await desk.goto(`${BASE}/m/katomia/board/${gid}?${HAPIQ}&tickets=1`, { waitUntil: "domcontentloaded" })
    await desk.waitForTimeout(2600)
    const stub = desk.locator(".board-chip.board-ticketed").first()
    t("a priced chip is visible to a third viewer", await stub.count() === 1)
    await stub.hover({ force: true })
    await desk.waitForTimeout(500)
    const peek = desk.locator('[data-testid="tkt-peek"]')
    t("hovering a priced chip opens the peek", await peek.count() === 1)
    const peekText = (await peek.textContent().catch(() => "")) || ""
    t("the peek states both legs", /apple/.test(peekText) && /carrot/.test(peekText), JSON.stringify(peekText.slice(0, 60)))
    t("the peek never covers the chip it explains", await desk.evaluate(() => {
      const b = document.getElementById("tktPeek")?.getBoundingClientRect()
      const c = document.querySelector(".board-chip.board-ticketed")?.getBoundingClientRect()
      return !!b && !!c && (b.bottom <= c.top + 1 || b.top >= c.bottom - 1)
    }))
    t("the peek cannot swallow a drag (pointer-events none)",
      await desk.evaluate(() => getComputedStyle(document.getElementById("tktPeek")).pointerEvents === "none"))
    // the want leg is carrot — every carrot on the felt should light up
    const lit = await desk.evaluate(() => [...document.querySelectorAll(".board-tkt-wanted")].map(e => e.dataset.assetId))
    t("hovering lights every chip that could fill it", lit.length > 0 && lit.every(a => a === "carrot"), JSON.stringify(lit))
    await desk.screenshot({ path: __dirname + "/tickets-quiet-peek.png", fullPage: false })

    // ── the NFT case ────────────────────────────────────────────────────────
    // A thumb-only chip gets background:none and padding:0 from the v8 skin, so
    // the mask notches a TRANSPARENT gutter and the ticket cue is invisible —
    // which is exactly what shipped in A1 and what the user hit. The fix paints
    // the gutter, giving the perforation something to bite into. Emulated by
    // adding the class cascade a real NFT gets, because playnet has no NFTs;
    // still worth eyeballing on testnet once.
    const nft = await desk.evaluate(() => {
      const c = document.querySelector(".board-chip.board-ticketed")
      c.classList.add("thumb-only")
      const s = getComputedStyle(c)
      const out = { pad: parseFloat(s.paddingRight) || 0, bg: s.backgroundColor,
                    masked: (s.maskImage || s.webkitMaskImage || "none") !== "none" }
      c.classList.remove("thumb-only")
      return out
    })
    t("NFT: the ticket gutter is painted, not transparent",
      nft.bg !== "rgba(0, 0, 0, 0)" && nft.bg !== "transparent", JSON.stringify(nft))
    t("NFT: there is a gutter for the notch to bite into", nft.pad >= 10, "padding-right=" + nft.pad)
    t("NFT: and it is still masked", nft.masked === true)
    await desk.mouse.move(5, 5)
    await desk.waitForTimeout(400)
    t("the peek and the highlight clear on leave",
      await desk.locator('[data-testid="tkt-peek"]').count() === 0
      && await desk.locator(".board-tkt-wanted").count() === 0)

    // ── two tickets on one asset: ONE at a time, and no duplicated buttons ──
    // Tickets reserve nothing, so pricing the same asset twice is legal. The
    // first cut drew every ticket's actions into the one card and every button
    // appeared once per ticket (user, 2026-08-21) — the cost of collapsing the
    // ticket back onto the asset, fixed by collapsing the VIEW too.
    await desk.close()
    await bob.locator("#boardAssetDetail .asset-modal-close").click().catch(() => {})
    await bob.waitForTimeout(400)
    await bob.locator('[data-chip-role="store"][data-asset-id="apple"]').first().click({ force: true })
    await bob.locator('[data-testid="tkt-price-it"]').click({ timeout: 8000 })
    await bob.locator("#tktModal .tkt-line").first().locator(".tkt-amt").fill("1")
    await bob.locator("#tktModal .tkt-line").nth(1).locator("input").first().fill("banana")
    await bob.locator('[data-testid="tkt-create"]').click()
    await bob.waitForTimeout(2000)

    await bob.locator(".board-chip.board-ticketed").first().click({ force: true })
    await bob.waitForTimeout(700)
    t("two tickets on one asset show a tab each", await bob.locator(".tkt-tab").count() === 2)
    t("only ONE ticket's actions are drawn", await bob.locator('[data-testid="tkt-clone"]').count() === 1
      && await bob.locator('[data-testid="tkt-cancel"]').count() === 1,
      `clone=${await bob.locator('[data-testid="tkt-clone"]').count()} cancel=${await bob.locator('[data-testid="tkt-cancel"]').count()}`)
    const firstOrder = await bob.evaluate(() => document.querySelector(".tkt-cardsec > div:last-child")?.dataset.orderId)
    await bob.locator(".tkt-tab").nth(1).click()
    await bob.waitForTimeout(400)
    const secondOrder = await bob.evaluate(() => document.querySelector(".tkt-cardsec > div:last-child")?.dataset.orderId)
    t("switching tab switches which ticket is shown", firstOrder && secondOrder && firstOrder !== secondOrder,
      `${firstOrder} -> ${secondOrder}`)
    t("still exactly one set of actions after switching", await bob.locator('[data-testid="tkt-clone"]').count() === 1)
    t("Remove from table is withheld while a ticket exists",
      !/Remove from table/i.test((await bob.locator("#boardAssetDetail").textContent()) || ""))
    t("and it says why", /tear the ticket up/i.test((await bob.locator("#boardAssetDetail").textContent()) || ""))
    await bob.screenshot({ path: __dirname + "/tickets-quiet-twotickets.png", fullPage: false })

    await reportKflow("test:verdict", INSTANCE, { pass: !fails.length, asserts: n, fails })
    log(fails.length ? `FAILED ${fails.length}/${n}: ` + fails.join(" | ") : `all ${n} assertions green`)
    log("verdict:", fails.length ? "fail" : "pass")
    process.exit(fails.length ? 1 : 0)
  } catch(e){
    log("ERROR", e.message)
    await reportKflow("test:verdict", INSTANCE, { pass: false, error: e.message })
    process.exit(1)
  } finally { await br.close() }
})()
