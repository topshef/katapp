// BOARD-LOCKREDRAW1 R2 verification — drives a REAL testnet signing round on lab1
// with Party-only ON and a third (unconnected) account so the lock collapses/rotates
// the ring, then audits every trail line against live chip positions.
// PASS criteria:
//   C1 playTransfers auto-fired exactly ONCE (no double animation)
//   C2 exactly one visible trail line per pending tx leg (1 leg here)
//   C3 every visible line's endpoints sit within TOL px of a real chip centre
//      (ghost/rimpile/store on one end, txchip on the other) — no stranded line
//   C4 re-audit 5s later (post-settle drift): still true
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const BASE = "https://lab1.katlab.kpay.live/m/katomia"
const SENDER = process.env.SENDER || "0.0.5200540"
const RECEIVER = process.env.RECEIVER || "0.0.23456"
const BYSTANDER = process.env.BYSTANDER || "0.0.1532"
const TOL = 48
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function addManual(page, acct){
  await page.locator("button.ring-footer-accsel").first().click({ timeout: 15000 })
  await page.waitForTimeout(600)
  await page.fill("#addAcctManual", acct)
  await page.click("#addAcctManualUse")
  await page.waitForTimeout(1200)
  if(await page.locator("#addAcctJoinAll").isVisible().catch(() => false)) await page.locator("#addAcctJoinAll").click()
  await page.waitForTimeout(1500)
  const id = await page.evaluate(() => (typeof getAccounts === "function" ? getAccounts() : [])
    .filter(a => typeof isMyAccount === "function" && isMyAccount(a))[0]?.id)
  if(!id) throw new Error("account never landed: " + acct)
  return id
}

const auditJs = `(TOL => {
  const centre = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
  const chips = [...document.querySelectorAll(".board-txchip, .board-ghost, .board-rimpile, .asset")]
    .filter(el => el.getBoundingClientRect().width > 0).map(el => ({ c: centre(el), cls: el.className.slice(0, 40) }))
  const lines = [...document.querySelectorAll(".board-trailline")].map(l => {
    const vis = parseFloat(getComputedStyle(l).opacity || "1") > 0.05
    const p1 = { x: +l.getAttribute("x1"), y: +l.getAttribute("y1") }
    const p2 = { x: +l.getAttribute("x2"), y: +l.getAttribute("y2") }
    const near = p => Math.min(...chips.map(ch => Math.hypot(ch.c.x - p.x, ch.c.y - p.y)))
    return { seg: l.dataset.seg || null, key: l.dataset.pairKey || null, vis,
             d1: Math.round(near(p1)), d2: Math.round(near(p2)), p1, p2 }
  })
  return { lines, txchips: document.querySelectorAll(".board-txchip").length,
           playCount: window.__playCount ?? null, signing: !!(typeof boardSigning !== "undefined" && boardSigning),
           stranded: lines.filter(l => l.vis && (l.d1 > TOL || l.d2 > TOL)).length,
           visible: lines.filter(l => l.vis).length }
})`

;(async () => {
  const br = await chromium.launch()
  const mk = async partyOnly => {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
    await ctx.addInitScript(po => {
      window.__katomiaTestHooks = true
      try { localStorage.setItem("katomiaBoardPrefs", JSON.stringify({ partyOnly: po, trailResidual: 0.5 })) } catch {}
    }, partyOnly)
    return ctx.newPage()
  }

  // ── create a fresh unlisted testnet game via the basic form
  const pgA = await mk(true)
  // breakout=off (KAT-BREAKOUT1 test hook): this suite audits the IN-PLACE signing
  // ceremony — an on-lock game would split at strike and navigate away mid-audit.
  // Running it against an off game is also exactly spec B7's regression guarantee.
  await pgA.goto(BASE + "/create?skin=basic&breakout=off", { waitUntil: "networkidle" })
  await pgA.evaluate(() => { document.querySelector('input[name="visibility"][value="unlisted"]')?.click() })
  await pgA.click(".create-btn")
  await pgA.waitForURL(/\/board\//, { timeout: 20000 })
  const gameUrl = pgA.url().replace(/\?.*$/, "")
  const gameId = gameUrl.split("/board/")[1]
  log("game:", gameId)
  await pgA.waitForTimeout(2500)

  // instrument playTransfers call counting on A (the party-only viewer)
  await pgA.evaluate(() => {
    const orig = window.playTransfers
    window.__playCount = 0
    window.__playStacks = []
    window.playTransfers = function(...a){
      window.__playCount++
      window.__playStacks.push((new Error().stack || "").split("\n").slice(1, 4).join(" | "))
      return orig.apply(this, a)
    }
  })

  const accA = await addManual(pgA, SENDER); log("A:", accA)
  const pgB = await mk(false)
  await pgB.goto(gameUrl, { waitUntil: "domcontentloaded" }); await pgB.waitForTimeout(2000)
  const accB = await addManual(pgB, RECEIVER); log("B:", accB)
  const pgC = await mk(false)
  await pgC.goto(gameUrl, { waitUntil: "domcontentloaded" }); await pgC.waitForTimeout(2000)
  const accC = await addManual(pgC, BYSTANDER); log("C (bystander):", accC)
  await pgA.waitForTimeout(2000)

  // ── A offers 0.01 HBAR to B
  pgA.on("dialog", d => d.accept("0.01"))
  const opened = await pgA.evaluate(senderId => {
    const chip = document.querySelector(`[data-testid="chip"][data-chip-role="store"][data-owner-account="${senderId}"][data-asset-id="HBAR"]`)
    if(!chip) return "no store HBAR chip"
    chip.click(); return true
  }, accA)
  if(opened !== true) throw new Error(String(opened))
  await pgA.waitForSelector('[data-testid="asset-offer"]', { state: "attached", timeout: 10000 })
  const clicked = await pgA.evaluate(([targetId]) => {
    document.querySelector('[data-testid="asset-offer"]')?.click()
    const input = document.getElementById("assetModalAmount")
    if(!input) return "amount input missing"
    input.value = "0.01"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    const target = document.querySelector(`[data-testid="offer-target"][data-target-account="${targetId}"]`)
    if(!target) return "no offer target"
    target.click(); return true
  }, [accB])
  if(clicked !== true) throw new Error(String(clicked))
  await pgA.waitForTimeout(2500)

  // ── lock A then B (cluster = {A,B}; C stays out) → strike
  log("locking…")
  await pgA.locator('[data-testid="lock"]').first().click()
  await pgA.waitForTimeout(1200)
  await pgB.locator('[data-testid="lock"]').first().click()
  await pgA.waitForFunction(() => { try { return !!boardSigning } catch { return false } }, { timeout: 30000 })
  log("signing phase entered on A")

  await pgA.waitForTimeout(6000)     // tween (≤550ms) + auto-replay fire + flights + settle
  const audit1 = await pgA.evaluate(`(${auditJs})(${TOL})`)
  await pgA.screenshot({ path: __dirname + "/lockredraw-1.png" })
  await pgA.waitForTimeout(5000)     // C4: post-settle drift
  const audit2 = await pgA.evaluate(`(${auditJs})(${TOL})`)
  audit2.playStacks = await pgA.evaluate(() => window.__playStacks || [])
  await pgA.screenshot({ path: __dirname + "/lockredraw-2.png" })

  // C5 (SIGN-STRIKEMSG1): the strike leaves a persistent 🔒 Deal-struck system row in
  // the stream. Lock-row presence is REPORTED (not gated) — backend emits lock acts
  // (BOARD-ACTIONMSG1) but whether the panel renders them is under observation.
  const stream = await pgA.evaluate(() =>
    (document.querySelector("#kchatPanel, .kchat-panel, [class*=kchat]")?.closest("body") ? document.body.innerText : "").slice(0, 8000))
  const streamChecks = {
    strikeRow: /Deal struck — transaction .* awaiting signatures/.test(stream),
    lockRowsSeen: /locked their side|locked 0\.0\./.test(stream),
  }

  const pass = {
    C1_singleFire: audit2.playCount === 1,
    C2_oneLinePerLeg: audit1.visible === audit1.txchips && audit2.visible === audit2.txchips,
    C3_noStranded_t6: audit1.stranded === 0,
    C4_noStranded_t11: audit2.stranded === 0,
    C5_strikeRow: streamChecks.strikeRow,
  }
  console.log("stream checks:", JSON.stringify(streamChecks))
  console.log(JSON.stringify({ gameId, audit1, audit2, pass }, null, 2))
  const ok = Object.values(pass).every(Boolean)
  log(ok ? "ALL PASS" : "FAIL")
  await br.close()
  process.exit(ok ? 0 : 1)
})().catch(e => { console.error("HARNESS FAIL:", e.message); process.exit(2) })
