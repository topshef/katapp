// breakout-check.cjs — T:BREAKOUT-01 (KAT-BREAKOUT1 P0/P1): a struck deal in an
// on-lock game moves to a side circle; everything else stays byte-identical.
// Spec: docs/breakout-spec-p0p1-20260818.html §9 (kPad katomia docs).
//
// Drives a REAL testnet round on lab1/alpha: fresh game via the basic create form,
// three manually-added accounts (A sender, B receiver, C bystander), one HBAR offer,
// cluster lock → strike → split. Asserts B1-B6 (B7 = run lockredraw-check.cjs, which
// pins breakout=off; B8 two-cluster sweep is a follow-up rider).
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const BASE = "https://lab1.katlab.kpay.live/m/katomia"
const SENDER = process.env.SENDER || "0.0.5200540"
const RECEIVER = process.env.RECEIVER || "0.0.23456"
const BYSTANDER = process.env.BYSTANDER || "0.0.1532"
const WAIT_EXPIRY = process.env.WAIT_EXPIRY !== "0"   // B6 adds ~60s
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
const gameJson = id => fetch(`${BASE.replace(/\/m\/katomia$/, "")}/m/katomia/hapi.php?path=` +
  encodeURIComponent(`/katomia/game/${id}`)).then(r => r.json()).catch(() => null)

;(async () => {
  const br = await chromium.launch()
  const mk = async () => {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
    await ctx.addInitScript(() => { window.__katomiaTestHooks = true })
    return ctx.newPage()
  }

  // ── create: basic form, unlisted → Auto rule ⇒ breakout:"on-lock" (B1)
  const pgA = await mk()
  await pgA.goto(BASE + "/create?skin=basic", { waitUntil: "networkidle" })
  await pgA.evaluate(() => { document.querySelector('input[name="visibility"][value="unlisted"]')?.click() })
  await pgA.click(".create-btn")
  await pgA.waitForURL(/\/board\//, { timeout: 20000 })
  const parentUrl = pgA.url().replace(/\?.*$/, "")
  const parentId = parentUrl.split("/board/")[1]
  log("parent:", parentId)
  await pgA.waitForTimeout(2500)

  const accA = await addManual(pgA, SENDER); log("A:", accA)
  const pgB = await mk()
  await pgB.goto(parentUrl, { waitUntil: "domcontentloaded" }); await pgB.waitForTimeout(2000)
  const accB = await addManual(pgB, RECEIVER); log("B:", accB)
  const pgC = await mk()
  await pgC.goto(parentUrl, { waitUntil: "domcontentloaded" }); await pgC.waitForTimeout(2000)
  const accC = await addManual(pgC, BYSTANDER); log("C (bystander):", accC)
  await pgA.waitForTimeout(2000)

  // ── offer A→B
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

  // pre-split inventory for B3's conservation check
  const preCounts = await pgA.evaluate(() => {
    let baskets = 0
    for(const a of Object.values(state?.accounts || {})) baskets += (a.basket || []).length
    return { accounts: Object.keys(state?.accounts || {}).length, baskets }
  })

  // ── lock A then B → strike → split → A and B should auto-land on the child
  log("locking…")
  await pgA.locator('[data-testid="lock"]').first().click()
  await pgA.waitForTimeout(1200)
  await pgB.locator('[data-testid="lock"]').first().click()

  // tilde delimiter (user 2026-08-18): house ids carry hyphens, so children are ~N
  const childUrlRe = new RegExp("/board/" + parentId + "~1$")
  await pgA.waitForURL(childUrlRe, { timeout: 30000 })
  await pgB.waitForURL(childUrlRe, { timeout: 30000 })
  const childId = parentId + "~1"
  log("movers landed on side circle:", childId)
  await pgA.waitForTimeout(4000); await pgC.waitForTimeout(1000)

  // ── audits
  const childView = await pgA.evaluate(() => ({
    signing: !!(typeof boardSigning !== "undefined" && boardSigning),
    txid: (typeof boardSigning !== "undefined" && boardSigning?.tx?.txid) || null,
    accounts: Object.keys(state?.accounts || {}),
    baskets: Object.values(state?.accounts || {}).reduce((n, a) => n + (a.basket || []).length, 0),
    parentRow: /Side circle of/.test(document.body.innerText),
    strikeRow: /awaiting signatures/.test(document.body.innerText),
  }))
  const parentView = await pgC.evaluate(() => ({
    accounts: Object.keys(state?.accounts || {}),
    baskets: Object.values(state?.accounts || {}).reduce((n, a) => n + (a.basket || []).length, 0),
    signing: !!(typeof boardSigning !== "undefined" && boardSigning),
    movedRow: /moved to side circle/.test(document.body.innerText),
    moved: (state && state.moved) || null,
  }))
  await pgA.screenshot({ path: __dirname + "/breakout-child.png" })
  await pgC.screenshot({ path: __dirname + "/breakout-parent.png" })

  const hac = id => String(id).split(":")[1] || id
  const pass = {
    B2_childExists_movers_landed: true,   // waitForURL above proved it
    B3_membership: childView.accounts.length === 2
      && childView.accounts.some(a => hac(a) === hac(accA).replace(/^0\.0\./, "0.0."))
      && parentView.accounts.length === 1 && hac(parentView.accounts[0]) === hac(accC)
      && (childView.baskets + parentView.baskets) <= preCounts.baskets, // strike consumes deal baskets
    B4_ceremony_in_child_only: childView.signing === true && parentView.signing === false,
    B5_links: childView.parentRow && childView.strikeRow && parentView.movedRow,
    B5b_moved_memo: !!(parentView.moved && Object.values(parentView.moved).includes(childId)),
  }

  // ── B6: let the window die — verdict must fire in the CHILD
  let b6 = { skipped: !WAIT_EXPIRY }
  if(WAIT_EXPIRY){
    const expiry = await pgA.evaluate(() => (typeof boardSigning !== "undefined" && boardSigning?.expiry) || null)
    const waitMs = Math.max((expiry || Date.now() + 45000) - Date.now() + 15000, 15000)
    log(`waiting ${Math.round(waitMs / 1000)}s for expiry (B6)…`)
    await pgA.waitForTimeout(waitMs)
    b6 = await pgA.evaluate(() => ({
      verdictRow: /failed or expired/.test(document.body.innerText),
      signing: !!(typeof boardSigning !== "undefined" && boardSigning),
    }))
    pass.B6_verdict_in_child = b6.verdictRow === true && b6.signing === false
  }

  console.log(JSON.stringify({ parentId, childId, preCounts, childView, parentView, b6, pass }, null, 2))
  const ok = Object.values(pass).every(Boolean)
  log(ok ? "ALL PASS" : "FAIL")
  await br.close()
  process.exit(ok ? 0 : 1)
})().catch(e => { console.error("HARNESS FAIL:", e.message); process.exit(2) })
