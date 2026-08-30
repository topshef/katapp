// chip-canary.cjs — CHIPCANARY-01: banks the board-geometry canary catalogue
// (data/canaries.json) into a scheduled harness instead of a session scratchpad
// that no longer exists. User 2026-08-17 ("start to flesh out the test cases
// we've acknowledged in config.html").
//
// Runs the demo board (?demo=1 — local fixture, no backend, no wallet) at TWO
// viewports (portrait exposed the circular-walls bug that square screens hid)
// and asserts four canary categories:
//   PAINT      CANARY-PAINT-COMPLETENESS  every sim body has a positioned element,
//                                         none stuck at the top-left default
//   SETTLE     CANARY-SETTLE-DISCIPLINE   after settle, zero movement over a watch
//                                         window (nothing may fight per-frame)
//   CONTAIN    CANARY-VISIBLE-CONTAINMENT every chip inside the viewport
//   GEOMETRY   CANARY-GEOMETRY-TRUTH      basket chips inside the rim ellipse,
//                                         store chips outside (centre test v1 —
//                                         the full corner test is a follow-up)
//
//   node chip-canary.cjs                # assert + report to /kflow
//   BASE=<site> node chip-canary.cjs
const { chromium } = require("/opt/kwallet/node_modules/playwright")

const BASE = (process.env.BASE || "https://lab22.kpay.uk").replace(/\/+$/, "")
const BOARD = BASE + "/m/katomia/board/demo?demo=1&skin=ring16"
const INSTANCE = "CHIPCANARY-01"
const log = (...a) => console.log(new Date().toISOString(), "[canary]", ...a)

let RUN_ID = "chipcanary-" + Date.now().toString(36), SITE_COMMIT = null
async function reportKflow(checkpoint, v, detail){
  if(SITE_COMMIT === null) SITE_COMMIT = await fetch(BASE + "/m/katomia/qa/results.php?days=1")
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch(BASE + "/kflow", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit: SITE_COMMIT, detail: { trigger: process.env.TRIGGER || "manual", ...detail } }] }) })
}

const failures = []
function check(id, ok, detail){
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`)
  if(!ok) failures.push(`${id}: ${detail}`)
}

// snapshot of every chip: position, zone kind, rect — evaluated in-page
const SNAP = `(() => {
  const env = _boardSimEnv
  const out = { chips: [], unplaced: 0, topleft: 0, cx: env?.cx, cy: env?.cy }
  _boardSimBodies.forEach(b => {
    if(b.inner || !b.el) return
    const st = b.el.style
    if(!st.left && !st.transform) out.unplaced++
    const r = b.el.getBoundingClientRect()
    if(r.left < 2 && r.top < 2) out.topleft++
    const z = _boardSimZones.get(b.zoneKey)
    const ang = Math.atan2(r.top + r.height / 2 - env.cy, r.left + r.width / 2 - env.cx)
    out.chips.push({ id: b.ident, isBasket: !!(z && z.isBasket),
      x: r.left, y: r.top, w: r.width, h: r.height,
      radial: Math.hypot(r.left + r.width / 2 - env.cx, r.top + r.height / 2 - env.cy),
      rim: (typeof boardRimAt === "function" && env) ? boardRimAt(env, ang) : null })
  })
  return out
})()`

async function runViewport(browser, name, vw, vh){
  const page = await browser.newPage({ viewport: { width: vw, height: vh } })
  try {
    await page.goto(BOARD, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    await page.waitForFunction("typeof _boardSimBodies !== 'undefined'", { timeout: 10000 })
    await page.waitForFunction("!_boardSimRaf", { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(400)

    const a = await page.evaluate(SNAP)
    check(`${name}.PAINT`, a.chips.length > 0 && a.unplaced === 0 && a.topleft === 0,
      `${a.chips.length} chips, ${a.unplaced} unplaced, ${a.topleft} at top-left default`)

    // settle discipline: two snapshots ~600ms apart must be byte-identical
    await page.waitForTimeout(600)
    const b = await page.evaluate(SNAP)
    const moved = a.chips.filter(c => {
      const c2 = b.chips.find(x => x.id === c.id)
      return !c2 || Math.abs(c2.x - c.x) > 0.01 || Math.abs(c2.y - c.y) > 0.01
    })
    check(`${name}.SETTLE`, moved.length === 0,
      moved.length ? `${moved.length} chips still moving after settle (${moved.slice(0, 3).map(c => c.id).join(", ")})` : "0.0px movement over the watch window")

    const out = b.chips.filter(c => c.x < -1 || c.y < -1 || c.x + c.w > vw + 1 || c.y + c.h > vh + 1)
    check(`${name}.CONTAIN`, out.length === 0,
      out.length ? `${out.length} chips outside the ${vw}x${vh} viewport` : "all chips inside the viewport")

    // geometry truth (centre test): basket chips inside the rim, store chips outside
    const geoBad = b.chips.filter(c => c.rim !== null && (c.isBasket ? c.radial > c.rim : c.radial < c.rim))
    check(`${name}.GEOMETRY`, geoBad.length === 0,
      geoBad.length ? `${geoBad.length} chips on the wrong side of the rim (${geoBad.slice(0, 3).map(c => c.id).join(", ")})` : "baskets inside rim, stores outside")
  } finally {
    await page.close()
  }
}

;(async () => {
  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })
  const browser = await chromium.launch()
  try {
    log("landscape 1200x700")
    await runViewport(browser, "landscape", 1200, 700)
    log("portrait 480x900")
    await runViewport(browser, "portrait", 480, 900)
  } catch(e){
    log("ERROR", e.message)
    failures.push("harness error: " + String(e.message).slice(0, 200))
  } finally {
    await browser.close()
  }
  const v = failures.length ? "fail" : "pass"
  await reportKflow("test:verdict", v, { source: "auto", instance: INSTANCE,
    note: failures.length ? failures.join(" ⁋ ").slice(0, 900) : "paint/settle/contain/geometry green at landscape+portrait" })
  log(`verdict: ${v}${failures.length ? " — " + failures.length + " failure(s)" : ""}`)
  process.exit(failures.length ? 1 : 0)
})()
