// board-arrange.cjs -- BOARD-ARRANGE1 automated e2e + scripted-move demo player.
//
// Runs against the board's ?demo=1 sandbox (local fixture, fake socket -- no
// backend, no wallet), so it exercises the FULL gesture surface headlessly:
// synthetic touch drags through the real boardTouchDrag handler, real physics,
// real localStorage persistence.
//
// Two modes:
//   node board-arrange.cjs                      -- CHIPARRANGE-01 assertion run,
//                                                  reports pass/fail to /kflow
//   node board-arrange.cjs --moves <file.json>  -- replay a scripted move file
//                                                  (demo mode: no assertions)
// Flags:
//   --video         record a .webm of the run into qa/harness/runs/
//   --slow          2.5x pauses between moves (watchable demos)
//   --base <url>    default https://lab1.katlab.kpay.live
//
// The moves file is the demo/replay facility (QA-UXGRID1 "simulate and replay
// particular user moves"): an array of steps the player executes in order --
// see moves/chiparrange-demo.json for the vocabulary:
//   { "op": "arrange", "owner": "p1:0.0.1001", "asset": "0.0.456",
//     "kind": "store", "dr": 60, "dt": 40, "note": "..." }   dr/dt = radial/
//                                                            tangential offset px
//   { "op": "offer", "owner": "p1:0.0.1111", "asset": "HBAR",
//     "to": "p2:0.0.2002", "at": { "lr": 0.5, "lt": 0 } }    lr = fraction of the
//                                                            target basket's radial
//                                                            band, lt = tangential px
//   { "op": "tidy" } · { "op": "reload" } · { "op": "pause", "ms": 1500 }
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const fs = require("fs")
const path = require("path")

const args = process.argv.slice(2)
const flag = n => args.includes(n)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const BASE = opt("--base", "https://lab1.katlab.kpay.live")
const BOARD = BASE + "/m/katomia/board/demo?demo=1&skin=ring16"
const MOVES_FILE = opt("--moves", null)
const SLOW = flag("--slow") ? 2.5 : 1
const INSTANCE = "CHIPARRANGE-01"
const log = (...a) => console.log(new Date().toISOString(), "[arrange]", ...a)

let RUN_ID = null, SITE_COMMIT = null
async function reportKflow(checkpoint, v, detail){
  if(!RUN_ID) RUN_ID = "chiparrange-" + Date.now().toString(36)
  if(SITE_COMMIT === null) SITE_COMMIT = await fetch(BASE + "/m/katomia/qa/results.php?days=1")
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch(BASE + "/kflow", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit: SITE_COMMIT, detail }] }) })
}

// ── in-page toolkit ─────────────────────────────────────────────────────────
// Injected after load. Talks straight to the sim's script-scope bindings
// (_boardSimBodies etc. -- top-level let/const are visible to evaluate).
const TOOLKIT = `window.__qaArrange = {
  // resolve a chip body by owner account + assetId + store|basket
  body(owner, asset, kind){
    let hit = null
    _boardSimBodies.forEach(b => {
      if(hit || b.inner) return
      if(b.zoneKey !== owner + "|" + (kind || "store")) return
      if((b.el?.dataset?.assetId || "") !== asset) return
      hit = b
    })
    return hit
  },
  snap(owner, asset, kind){
    const b = this.body(owner, asset, kind)
    return b && { ident: b.ident, x: b.x, y: b.y, pin: !!b.pin, left: b.pl, top: b.pt, w: b.w, h: b.h }
  },
  // zone-local -> screen, for aiming drops (lr: 0..1 across the radial band,
  // lt: tangential px); wall-clamped for a 40x24 probe so the point is legal
  zonePoint(zoneKey, lr, lt){
    const z = _boardSimZones.get(zoneKey), env = _boardSimEnv
    if(!z || !env) return null
    const rim = boardRimAt(env, z.midRad)
    const inW = z.isBasket ? z.rMin : rim + 8 + z.band
    const outW = z.isBasket ? rim - 40 : boardEdgeAt(env, z.midRad) - 14
    const p = boardWallClamp(env, z, { w: 40, h: 24 }, inW + (outW - inW) * lr, lt, false)
    return { x: env.cx + p.x * z.cos - p.y * z.sin, y: env.cy + p.x * z.sin + p.y * z.cos }
  },
  chipCenter(owner, asset, kind){
    const b = this.body(owner, asset, kind)
    if(!b?.el) return null
    const r = b.el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  },
  // synthetic touch drag through the REAL boardTouchDrag path: pointerdown on
  // the chip, pointermoves + pointerup on window (where the handler listens)
  touchDrag(owner, asset, kind, tx, ty){
    const b = this.body(owner, asset, kind)
    if(!b?.el) return "no chip"
    const r = b.el.getBoundingClientRect()
    const fx = r.left + r.width / 2, fy = r.top + r.height / 2
    const ev = (type, x, y) => new PointerEvent(type, { pointerType: "touch",
      clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true, pointerId: 7 })
    b.el.dispatchEvent(ev("pointerdown", fx, fy))
    const steps = 8
    for(let i = 1; i <= steps; i++)
      window.dispatchEvent(ev("pointermove", fx + (tx - fx) * i / steps, fy + (ty - fy) * i / steps))
    window.dispatchEvent(ev("pointerup", tx, ty))
    return "ok"
  },
  settled(){ return !_boardSimRaf },
  excite(){ boardSimExcite() },
  tidy(){ document.querySelectorAll(".ring-footer-play").forEach(b => { if(b.textContent === "\\u{1F9F9}") b.click() }) },
  pins(){ try { return JSON.parse(localStorage.getItem(boardPinsKey()) || "{}") } catch { return {} } }
}`

async function settle(page, ms = 6000){
  await page.waitForFunction("window.__qaArrange && __qaArrange.settled()", { timeout: ms }).catch(() => {})
  await page.waitForTimeout(300 * SLOW)
}
async function openBoard(page){
  await page.goto(BOARD, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1500 * SLOW)
  await page.evaluate(TOOLKIT)
  await settle(page)
}

// ── move player (shared by assertions + demo scripts) ───────────────────────
async function play(page, mv){
  if(mv.note) log("·", mv.note)
  switch(mv.op){
    case "arrange": {
      // target = the chip's current spot nudged dr (radial) / dt (tangential)
      const t = await page.evaluate(({ owner, asset, kind, dr, dt }) => {
        const q = window.__qaArrange
        const b = q.body(owner, asset, kind)
        if(!b) return null
        const z = _boardSimZones.get(b.zoneKey), env = _boardSimEnv
        const p = boardWallClamp(env, z, b, b.x + (dr || 0), b.y + (dt || 0), false)
        return { x: env.cx + p.x * z.cos - p.y * z.sin, y: env.cy + p.x * z.sin + p.y * z.cos }
      }, mv)
      if(!t) throw new Error("arrange: chip not found " + mv.owner + " " + mv.asset)
      const r = await page.evaluate(({ owner, asset, kind, x, y }) =>
        __qaArrange.touchDrag(owner, asset, kind, x, y), { ...mv, ...t })
      if(r !== "ok") throw new Error("arrange drag: " + r)
      await settle(page)
      return t
    }
    case "offer": {
      const t = await page.evaluate(({ to, at }) =>
        __qaArrange.zonePoint(to + "|basket", at?.lr ?? 0.5, at?.lt ?? 0), mv)
      if(!t) throw new Error("offer: no target zone " + mv.to)
      const r = await page.evaluate(({ owner, asset, kind, x, y }) =>
        __qaArrange.touchDrag(owner, asset, kind || "store", x, y), { ...mv, ...t })
      if(r !== "ok") throw new Error("offer drag: " + r)
      await page.waitForTimeout(500 * SLOW)
      await settle(page)
      return t
    }
    case "tidy":   await page.evaluate("__qaArrange.tidy()"); await settle(page); return
    case "reload": await openBoard(page); return
    case "pause":  await page.waitForTimeout((mv.ms || 1000) * SLOW); return
    default: throw new Error("unknown op " + mv.op)
  }
}

// ── CHIPARRANGE-01 assertions ───────────────────────────────────────────────
async function assertions(page){
  const checks = []
  const check = (name, ok, detail) => { checks.push({ name, ok, detail }); log(ok ? "PASS" : "FAIL", name, detail || "") }
  const OWNER = "p1:0.0.1001", ASSET = "0.0.456"

  // A1 -- drag-to-arrange pins the chip at the drop point
  const drop = await play(page, { op: "arrange", owner: OWNER, asset: ASSET, kind: "store", dr: 55, dt: 45,
    note: "A1: drag " + ASSET + " to a hand-picked spot in its own store" })
  let s = await page.evaluate(({ o, a }) => __qaArrange.snap(o, a, "store"), { o: OWNER, a: ASSET })
  const center = s && { x: s.left + s.w / 2, y: s.top + s.h / 2 }
  const d1 = center ? Math.hypot(center.x - drop.x, center.y - drop.y) : 999
  check("A1 arrange pins at drop point", !!s?.pin && d1 < 12, `pin=${s?.pin} dist=${d1.toFixed(1)}px`)

  // A2 -- survives a layout re-excite (the old behaviour re-blobbed everything)
  await page.evaluate("__qaArrange.excite()")
  await settle(page)
  let s2 = await page.evaluate(({ o, a }) => __qaArrange.snap(o, a, "store"), { o: OWNER, a: ASSET })
  const d2 = Math.hypot((s2?.x ?? 999) - s.x, (s2?.y ?? 999) - s.y)
  check("A2 stays put through re-excite", d2 < 1, `moved ${d2.toFixed(2)}px`)

  // A3 -- another player's action doesn't disturb it; A4 -- the dropped chip
  // spawns pinned at the drop point
  const at = { lr: 0.35, lt: 30 }
  const dropB = await play(page, { op: "offer", owner: "p1:0.0.1111", asset: "HBAR", to: "p2:0.0.2002", at,
    note: "A3/A4: offer HBAR from the second account into p2's basket at a chosen point" })
  let s3 = await page.evaluate(({ o, a }) => __qaArrange.snap(o, a, "store"), { o: OWNER, a: ASSET })
  const d3 = Math.hypot((s3?.x ?? 999) - s2.x, (s3?.y ?? 999) - s2.y)
  check("A3 unmoved by another action", d3 < 2, `moved ${d3.toFixed(2)}px`)
  const sb = await page.evaluate(() => {
    let hit = null
    _boardSimBodies.forEach(b => {
      if(b.inner || b.zoneKey !== "p2:0.0.2002|basket") return
      if((b.el?.dataset?.assetId || "") !== "HBAR") return
      hit = { pin: !!b.pin, cx: b.pl + b.w / 2, cy: b.pt + b.h / 2 }
    })
    return hit
  })
  const d4 = sb ? Math.hypot(sb.cx - dropB.x, sb.cy - dropB.y) : 999
  check("A4 dropped chip spawns pinned at drop point", !!sb?.pin && d4 < 25, `pin=${sb?.pin} dist=${d4.toFixed(1)}px`)

  // A5 -- pinned arrangement survives a reload (localStorage per game)
  const before = { x: s3.x, y: s3.y }
  await play(page, { op: "reload", note: "A5: reload -- pins restore from localStorage" })
  const s5 = await page.evaluate(({ o, a }) => __qaArrange.snap(o, a, "store"), { o: OWNER, a: ASSET })
  const d5 = Math.hypot((s5?.x ?? 999) - before.x, (s5?.y ?? 999) - before.y)
  check("A5 arrangement survives reload", !!s5?.pin && d5 < 3, `pin=${s5?.pin} drift=${d5.toFixed(2)}px`)

  // A6 -- tidy clears pins (storage + bodies) and the layout re-runs
  await play(page, { op: "tidy", note: "A6: tidy -- pins clear, layout re-blobs" })
  const after = await page.evaluate(({ o, a }) => ({
    pins: Object.keys(__qaArrange.pins()).length,
    snap: __qaArrange.snap(o, a, "store")
  }), { o: OWNER, a: ASSET })
  check("A6 tidy clears pins", after.pins === 0 && !after.snap?.pin, `pins=${after.pins} pin=${after.snap?.pin}`)

  return checks
}

async function main(){
  const t0 = Date.now()
  const runsDir = path.join(__dirname, "runs")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    ...(flag("--video") ? { recordVideo: { dir: runsDir, size: { width: 1280, height: 860 } } } : {})
  })
  const page = await ctx.newPage()
  page.on("dialog", d => d.accept("1"))
  page.on("pageerror", e => log("PAGEERROR", String(e).slice(0, 200)))
  await openBoard(page)

  if(MOVES_FILE){
    // demo/replay mode -- just perform the script, no verdict
    const moves = JSON.parse(fs.readFileSync(MOVES_FILE, "utf8"))
    const list = moves.moves || moves
    log("replaying", list.length, "moves from", MOVES_FILE)
    for(const mv of list) await play(page, mv)
    await page.waitForTimeout(1200 * SLOW)
    await ctx.close(); await browser.close()
    if(flag("--video")) log("video saved under", runsDir)
    return
  }

  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })
  let checks
  try { checks = await assertions(page) }
  catch(e){
    log("FATAL mid-assertions:", e.message)
    await reportKflow("test:verdict", "error", { source: "auto", instance: INSTANCE, note: String(e.message).slice(0, 300) })
    await ctx.close(); await browser.close()
    process.exit(1)
  }
  const failed = checks.filter(c => !c.ok)
  const verdict = failed.length ? "fail" : "pass"
  await page.screenshot({ path: path.join(__dirname, "chiparrange-last.png") })
  await ctx.close(); await browser.close()
  await reportKflow("test:verdict", verdict, {
    source: "auto", instance: INSTANCE,
    note: checks.map(c => (c.ok ? "✓" : "✗") + " " + c.name).join("; ").slice(0, 400),
    secs: Math.round((Date.now() - t0) / 1000)
  })
  log("verdict:", verdict, failed.length ? JSON.stringify(failed) : "(all checks green)")
  process.exit(failed.length ? 1 : 0)
}
main().catch(async e => {
  console.error("FATAL", e.message)
  if(!MOVES_FILE){
    await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE }).catch(() => {})
    await reportKflow("test:verdict", "error", { source: "auto", instance: INSTANCE, note: String(e.message).slice(0, 300) }).catch(() => {})
  }
  process.exit(1)
})
