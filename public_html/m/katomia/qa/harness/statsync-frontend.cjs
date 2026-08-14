// statsync-frontend.cjs — STATSYNC1 P5: T:STATSYNC-04 — the real board, delta vs full.
//
// Two headless pages on the SAME fresh playnet game: one plain (full-state),
// one with ?delta=1 (joins with wantDelta, consumes game_delta). A protocol
// driver client performs actions; after each round the two pages' window.state
// must agree, the delta page must actually be running on patches, and a forced
// seq corruption must self-heal via game_refresh.
//
//   node statsync-frontend.cjs            # BASE defaults to lab1

const { chromium } = require("/opt/kwallet/node_modules/playwright")
let WebSocket
for(const p of ["/home/hbarlive_hts-alpha/node_modules/ws", "/opt/kwallet/node_modules/ws", "ws"]){
  try { WebSocket = require(p); break } catch {}
}
const BASE = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const API  = (process.env.API || "https://alpha.katlab.kpay.live").replace(/\/+$/, "")
const WS   = API.replace(/^http/, "ws") + "/ws"
const log = (...a) => console.log(new Date().toISOString(), "[statsync-fe]", ...a)

const failures = []
function assert(id, cond, detail){
  const ok = !!cond
  console.log(`  ${ok ? "✅" : "❌"} T:STATSYNC-04.${id} ${detail}${ok ? "" : "  <-- FAIL"}`)
  if(!ok) failures.push(`T:STATSYNC-04.${id} ${detail}`)
}

const view = page => page.evaluate(() => { const q = window.__qaGetState?.(); return JSON.stringify({
  accounts: q?.state?.accounts, players: q?.state?.players, tx: q?.state?.tx }) })
const chatTexts = page => page.evaluate(() => JSON.stringify((window.__qaGetState?.()?.state?.chat || []).filter(m => !m.system).map(m => m.text)))

async function main(){
  const r = await fetch(`${API}/katomia/create`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ network: "playnet", visibility: "public", joinRule: "*", profile: { name: "statsync-fe-qa" } }) }).then(r => r.json())
  const gameId = r.gameId
  log(`playnet game ${gameId} created`)

  // driver: a protocol client that owns an account and performs the actions
  const drv = new WebSocket(WS)
  const drvToken = "qa-statsync-fe-drv-" + Date.now().toString(36)
  await new Promise((res, rej) => { drv.on("open", res); drv.on("error", rej) })
  const dsend = o => drv.send(JSON.stringify(o))
  dsend({ type: "game_join", gameId, playerToken: drvToken, playerName: "Driver" })
  await new Promise(r => setTimeout(r, 300))
  dsend({ type: "game_addAccount", gameId, label: "driver" })
  await new Promise(r => setTimeout(r, 500))

  const browser = await chromium.launch()
  const mk = async q => {
    const page = await (await browser.newContext()).newPage()
    page.__errors = []
    page.on("pageerror", e => page.__errors.push(String(e).slice(0, 200)))
    await page.addInitScript(() => { window.__katomiaTestHooks = true })   // QA-TESTHOOKS1 gate for __qaGetState
    await page.goto(`${BASE}/m/katomia/board/${gameId}?skin=ring16${q}`, { waitUntil: "domcontentloaded" })
    return page
  }
  // P6: delta is the default — the control page forces the legacy full-state path
  log("opening ?fullstate=1 control page and default (delta) page")
  const [full, delta] = await Promise.all([mk("&fullstate=1"), mk("")])
  await Promise.all([full, delta].map(p => p.waitForFunction(() => !!window.__qaGetState?.()?.state, null, { timeout: 20000 })))

  const act = async (label, msg, settle = 900) => {
    dsend(msg)
    await new Promise(r => setTimeout(r, settle))
    log(`  ${label}`)
  }
  await act("chat 1", { type: "game_chat", gameId, text: "hello from the driver" })
  await act("offer apple → self-basket via second account", { type: "game_addAccount", gameId, label: "stash" })
  const ids = await full.evaluate(() => Object.keys(window.__qaGetState?.()?.state?.accounts || {}))
  const fromId = ids.find(k => k.endsWith(":driver")), toId = ids.find(k => k.endsWith(":stash"))
  await act("offer apple driver→stash", { type: "game_offer", gameId, fromId, toId, assetId: "apple", amount: 1 })
  await act("lock driver", { type: "game_toggleLock", gameId, accountId: fromId })
  await act("chat 2", { type: "game_chat", gameId, text: "second message" })

  const applied = await delta.evaluate(() => window.__deltaApplied || 0)
  assert(1, applied >= 4, `delta page is running on patches (__deltaApplied=${applied} ≥4)`)
  assert(2, (await view(full)) === (await view(delta)), "window.state (accounts/players/tx) identical on both pages")
  assert(3, (await chatTexts(full)) === (await chatTexts(delta)), "visible chat identical on both pages (welcome rows excluded)")

  // forced gap: corrupt the delta page's seq, act, and expect self-heal via game_refresh
  await delta.evaluate(() => { window.__stateSeq = -999 })
  await act("action after corrupted seq", { type: "game_chat", gameId, text: "post-corruption message" }, 1500)
  assert(4, (await view(full)) === (await view(delta)) && (await chatTexts(full)) === (await chatTexts(delta)),
    "after forced seq corruption the delta page self-healed via game_refresh and re-converged")
  const seqNow = await delta.evaluate(() => window.__stateSeq)
  assert(5, Number.isFinite(seqNow) && seqNow > 0, `delta page seq restored to a real broadcast seq (${seqNow})`)
  if(delta.__errors.length || full.__errors.length) log("page errors:", JSON.stringify({ full: full.__errors, delta: delta.__errors }, null, 1))
  assert(6, full.__errors.length === 0 && delta.__errors.length === 0, `no page errors (full=${full.__errors.length} delta=${delta.__errors.length})`)

  console.log(failures.length ? `\nFAILURES:\n${failures.join("\n")}` : "\nALL GREEN")
  try { dsend({ type: "game_exit", gameId, playerToken: drvToken }); drv.close() } catch {}
  await browser.close()
  process.exit(failures.length ? 1 : 0)
}

main().catch(e => { console.error("HARNESS ERROR", e); process.exit(2) })
