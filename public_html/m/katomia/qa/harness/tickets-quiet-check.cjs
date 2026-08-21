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
