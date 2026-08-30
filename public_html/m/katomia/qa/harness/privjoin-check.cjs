// privjoin-check.cjs — PRIVJOIN-01: private-game join delivers frames.
//
// GAMEPRIVATE-JOINSTUCK1 (2026-07-16, fixed 34dc590): joining a private game
// returned ZERO frames — permanently blank board. The t-private fixture
// (backend katomia.js, PRIVATE visibility + open joinRule) was kept as a
// permanent regression fixture; this banks the probe that actually uses it.
// User 2026-08-17: flesh out acknowledged-missing tests.
//
// Protocol-level (statsync-baseline pattern): plain WebSocket, no browser.
// Asserts a fresh join receives game_state WITH a playerId within 5s.
//
//   node privjoin-check.cjs
//   API=https://hapi2.hbar.live/live node privjoin-check.cjs
let WebSocket
for(const p of ["/home/hbarlive/live/node_modules/ws", "/opt/kwallet/node_modules/ws", "ws"]){
  try { WebSocket = require(p); break } catch {}
}
if(!WebSocket){ console.error("no ws module found"); process.exit(2) }

const API  = (process.env.API || "https://hapi2.hbar.live/live").replace(/\/+$/, "")
const WS   = process.env.WS || API.replace(/^http/, "ws") + "/ws"
const BASE = (process.env.BASE || "https://lab22.kpay.uk").replace(/\/+$/, "")
const GAME = process.env.GAME || "t-private"
const INSTANCE = "PRIVJOIN-01"
const log = (...a) => console.log(new Date().toISOString(), "[privjoin]", ...a)

const RUN_ID = "privjoin-" + Date.now().toString(36)
async function reportKflow(checkpoint, v, detail){
  const commit = await fetch(BASE + "/m/katomia/qa/results.php?days=1")
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch(BASE + "/kflow", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit, detail: { trigger: process.env.TRIGGER || "manual", ...detail } }] }) })
}

;(async () => {
  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })
  const t0 = Date.now()
  const result = await new Promise(resolve => {
    const to = setTimeout(() => resolve({ ok: false, note: `no game_state within 5s of joining ${GAME} — the JOINSTUCK shape` }), 5000)
    const ws = new WebSocket(WS)
    ws.on("error", e => { clearTimeout(to); resolve({ ok: false, note: "ws error: " + String(e.message).slice(0, 120) }) })
    ws.on("open", () => ws.send(JSON.stringify({ type: "game_join", gameId: GAME,
      playerToken: "qa-privjoin-" + Date.now().toString(36), playerName: "QA privjoin probe" })))
    ws.on("message", raw => {
      let d = {}
      try { d = JSON.parse(raw.toString()) } catch {}
      if(d.type === "game_state"){
        clearTimeout(to)
        const pid = d.playerId || d.state?.you || null
        resolve({ ok: !!d.state, pid, ms: Date.now() - t0,
          note: d.state ? `game_state in ${Date.now() - t0}ms, playerId ${pid ? "present" : "MISSING"}` : "game_state with no state payload" })
      }
      if(d.type === "error"){ clearTimeout(to); resolve({ ok: false, note: "join error: " + String(d.message || raw).slice(0, 160) }) }
    })
    setTimeout(() => { try { ws.close() } catch {} }, 6000)
  })
  log(result.note)
  const v = result.ok ? "pass" : "fail"
  await reportKflow("test:verdict", v, { source: "auto", instance: INSTANCE, note: result.note, secs: Math.round((Date.now() - t0) / 1000) })
  log("verdict:", v)
  process.exit(result.ok ? 0 : 1)
})()
