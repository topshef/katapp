// statsync-baseline.cjs — STATSYNC1 P1: T:STATSYNC-01 (multi-client convergence)
// + T:STATSYNC-BENCH-01 (wire cost of today's full-state broadcast).
//
// Protocol-level harness: plain WebSocket clients, no browser. Creates a fresh
// playnet game on the target backend, drives a scripted action sequence through
// three clients, and measures every game_state broadcast each client receives
// (count, bytes, action→broadcast latency), then asserts the clients converged.
//
//   node statsync-baseline.cjs                 # run assertions + print summary
//   node statsync-baseline.cjs --record        # also write qa/data/benchmarks/<date>-statsync-*.json
//   API=https://alpha.katlab.kpay.live SAMPLE_GAME=t-kat-demo SAMPLE_SECS=60 node statsync-baseline.cjs
//
// SAMPLE_GAME adds a passive spectator sample of a live demo game (real-world
// broadcast traffic) alongside the scripted run. Skipped if the game is absent.
//
// Future phases reuse this file: it records data.seq when present (P2+) and the
// summary shape is what each phase's re-run is compared against.

let WebSocket
for(const p of ["/home/hbarlive_hts-alpha/node_modules/ws", "/opt/kwallet/node_modules/ws", "ws"]){
  try { WebSocket = require(p); break } catch {}
}
if(!WebSocket){ console.error("no ws module found"); process.exit(2) }

const API  = (process.env.API || "https://alpha.katlab.kpay.live").replace(/\/+$/, "")
const WS   = process.env.WS || API.replace(/^http/, "ws") + "/ws"
const SAMPLE_GAME = process.env.SAMPLE_GAME ?? "t-kat-demo"
const SAMPLE_SECS = Number(process.env.SAMPLE_SECS || 60)
const RECORD = process.argv.includes("--record")
const log = (...a) => console.log(new Date().toISOString(), "[statsync]", ...a)

const failures = []
function assert(id, cond, detail){
  const ok = !!cond
  console.log(`  ${ok ? "✅" : "❌"} T:STATSYNC-${id} ${detail}${ok ? "" : "  <-- FAIL"}`)
  if(!ok) failures.push(`T:STATSYNC-${id} ${detail}`)
  return ok
}

class Client {
  constructor(name){
    this.name = name
    this.token = `qa-statsync-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    this.msgs = []          // every ws message: {t, bytes, type, seq}
    this.states = 0
    this.bytes = 0
    this.last = null        // last game_state payload (parsed)
    this.stateViews = {}    // seq → shared-view JSON (for cross-client per-seq comparison)
    this._waiters = []
  }
  connect(){
    return new Promise((res, rej) => {
      this.ws = new WebSocket(WS)
      this.ws.on("open", res)
      this.ws.on("error", rej)
      this.ws.on("message", raw => {
        const t = Date.now(), bytes = raw.length
        let data = {}
        try { data = JSON.parse(raw.toString()) } catch {}
        this.msgs.push({ t, bytes, type: data.type, seq: data.seq ?? null })
        if(data.type === "game_state"){
          this.states++; this.bytes += bytes; this.last = data
          if(data.seq != null) this.stateViews[data.seq] = JSON.stringify({ accounts: data.state.accounts, players: data.state.players, tx: data.state.tx, narrate: data.state.narrate })
        }
        this._waiters = this._waiters.filter(w => !(w.pred(data) && (w.res(data), true)))
      })
    })
  }
  send(obj){ this.ws.send(JSON.stringify(obj)) }
  join(gameId, playerName, opts){ this.send({ type: "game_join", gameId, playerToken: this.token, playerName, ...opts }) }
  // resolves on the next message matching pred (default: any game_state)
  next(pred = d => d.type === "game_state", timeout = 8000){
    return new Promise((res, rej) => {
      const to = setTimeout(() => { this._waiters = this._waiters.filter(w => w.res !== res); rej(new Error(`${this.name}: timeout waiting for message`)) }, timeout)
      this._waiters.push({ pred, res: d => { clearTimeout(to); res(d) } })
    })
  }
  close(){ try { this.ws.close() } catch {} }
}

// shared-state view: what every client should agree on (chat + per-socket fields excluded)
const sharedView = s => JSON.stringify({ accounts: s.state.accounts, players: s.state.players, tx: s.state.tx, narrate: s.state.narrate })

// T:STATSYNC-02 — delta probe: opts into game_delta and reconstructs state by patch
// application (mirror of backend kdiff.js kpatch). Tracks per-seq shared views so
// every broadcast can be compared against a full-state control client at the same seq.
function kpatch(obj, ops){
  for(const { op, path, value } of ops){
    let t = obj
    for(const k of path.slice(0, -1)) t = t[k] ?? (t[k] = {})
    const last = path[path.length - 1]
    if(op === "remove") delete t[last]
    else t[last] = value
  }
  return obj
}
class DeltaProbe extends Client {
  constructor(name){
    super(name)
    this.model = null           // {meta, accounts, players, tx, narrate, chat}
    this.views = {}             // seq → shared-view JSON
    this.deltas = 0; this.fulls = 0; this.deltaBytes = 0; this.fullBytes = 0
  }
  connect(){
    return super.connect().then(() => {
      this.ws.on("message", raw => {
        let d = {}
        try { d = JSON.parse(raw.toString()) } catch {}
        if(d.type === "game_state"){
          this.fulls++; this.fullBytes += raw.length
          this.model = { meta: d.meta, accounts: d.state.accounts, players: d.state.players, tx: d.state.tx, narrate: d.state.narrate, chat: d.state.chat || [] }
        }
        if(d.type === "game_delta"){
          this.deltas++; this.deltaBytes += raw.length
          kpatch(this.model, d.patch)
          this.model.chat = [...this.model.chat, ...(d.chatAppend || [])]
          if(this.model.chat.length > 150) this.model.chat.splice(0, this.model.chat.length - 150)
        }
        if(d.seq != null) this.views[d.seq] = JSON.stringify({ accounts: this.model.accounts, players: this.model.players, tx: this.model.tx, narrate: this.model.narrate })
      })
    })
  }
  next(pred = d => d.type === "game_state" || d.type === "game_delta", timeout){ return super.next(pred, timeout) }
}

// one action, measured: send on `actor`, then wait for the resulting broadcast on ALL clients
async function step(label, actor, msg, clients, timings){
  const t0 = Date.now()
  const waits = clients.map(c => c.next())
  actor.send(msg)
  await Promise.all(waits)
  const ms = Date.now() - t0
  timings.push({ label, ms })
  log(`  ${label} → broadcast on ${clients.length} clients in ${ms}ms`)
}

async function scripted(){
  log(`target ${API} (${WS})`)
  const r = await fetch(`${API}/katomia/create`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ network: "playnet", visibility: "public", joinRule: "*", profile: { name: "statsync-qa" } }) }).then(r => r.json())
  if(!r.ok) throw new Error("create failed: " + JSON.stringify(r))
  const gameId = r.gameId
  log(`playnet game ${gameId} created`)

  const [A, B, C, D] = [new Client("A"), new Client("B"), new Client("C"), new DeltaProbe("D")]
  const all = [A, B, C]
  const everyone = [A, B, C, D]   // D = delta-opted probe (T:STATSYNC-02); ignored pre-P3 (backend sends it full states)
  await Promise.all(everyone.map(c => c.connect()))

  const timings = []
  // joins: each join broadcasts to everyone subscribed so far
  A.join(gameId, "Alice");   await A.next()
  B.join(gameId, "Bob");     await Promise.all([A, B].map(c => c.next()))
  C.join(gameId, "Carol");   await Promise.all(all.map(c => c.next()))
  D.join(gameId, "Dora", { wantDelta: true });  await Promise.all(everyone.map(c => c.next()))

  await step("addAccount alice", A, { type: "game_addAccount", gameId, label: "alice" }, everyone, timings)
  await step("addAccount bob",   B, { type: "game_addAccount", gameId, label: "bob" },   everyone, timings)

  const accs = A.last.state.accounts
  const aliceId = Object.keys(accs).find(k => k.endsWith(":alice"))
  const bobId   = Object.keys(accs).find(k => k.endsWith(":bob"))
  const aPid = A.last.myPlayerId, bPid = B.last.myPlayerId, cPid = C.last.myPlayerId

  await step("offer apple alice→bob", A, { type: "game_offer", gameId, fromId: aliceId, toId: bobId, assetId: "apple", amount: 1 }, everyone, timings)
  await step("offer banana bob→alice", B, { type: "game_offer", gameId, fromId: bobId, toId: aliceId, assetId: "banana", amount: 1 }, everyone, timings)
  await step("public chat", A, { type: "game_chat", gameId, text: "hello table" }, everyone, timings)
  await step("targeted chat B→A", B, { type: "game_chat", gameId, text: "psst alice", to: [aPid] }, everyone, timings)
  await step("toggleLock alice", A, { type: "game_toggleLock", gameId, accountId: aliceId }, everyone, timings)
  await step("toggleLock alice off", A, { type: "game_toggleLock", gameId, accountId: aliceId }, everyone, timings)
  await step("withdraw banana", A, { type: "game_reject", gameId, accountId: aliceId, assetId: "banana" }, everyone, timings)
    .catch(() => log("  (reject step skipped — payload shape not accepted, non-fatal)"))

  // growth probe: chat history rides EVERY broadcast today, so bytes/broadcast
  // grows linearly with table talk — the cost curve STATSYNC1 exists to flatten.
  for(let i = 0; i < 30; i++){
    const w = C.next()
    A.send({ type: "game_chat", gameId, text: `bench filler message number ${i} — some plausible table talk padding` })
    await w
  }
  const cSizes = C.msgs.filter(m => m.type === "game_state").map(m => m.bytes)
  const growth = { first: cSizes[cSizes.length - 30], last: cSizes[cSizes.length - 1], perChatBytes: Math.round((cSizes[cSizes.length - 1] - cSizes[cSizes.length - 30]) / 29) }
  log(`  growth probe: broadcast ${growth.first}B → ${growth.last}B over 30 chats (~${growth.perChatBytes}B per chat row, compounding on every broadcast)`)

  await new Promise(r => setTimeout(r, 800))   // quiesce

  log("assertions (T:STATSYNC-01):")
  assert("01.1", all.every(c => c.states >= 8), `every client received every broadcast (A=${A.states} B=${B.states} C=${C.states} ≥8)`)
  assert("01.2", sharedView(A.last) === sharedView(B.last) && sharedView(B.last) === sharedView(C.last), "shared state (accounts/players/tx) identical across all clients")
  assert("01.3", aPid && bPid && cPid && new Set([aPid, bPid, cPid]).size === 3, `myPlayerId is per-socket and distinct (${aPid}/${bPid}/${cPid})`)
  assert("01.4", (B.last.state.accounts[bobId]?.basket || []).some(i => i.assetId === "apple" && i.fromId === aliceId), "offer landed: apple from alice in bob's basket")
  const chatOf = c => (c.last.state.chat || []).map(m => m.text)
  assert("01.5", all.every(c => chatOf(c).includes("hello table")), "public chat visible to all")
  assert("01.6", chatOf(A).includes("psst alice") && chatOf(B).includes("psst alice") && !chatOf(C).includes("psst alice"), "targeted chat: A+sender see it, C does not")
  assert("01.7", all.every(c => c.msgs.filter(m => m.type === "game_state").every(m => m.bytes > 0)), "all broadcasts non-empty")
  // P2+: once the backend stamps seq, it must be strictly increasing per client
  // (gaps allowed — a client can miss broadcasts it wasn't subscribed for yet).
  const seqs = c => c.msgs.filter(m => m.type === "game_state" && m.seq != null).map(m => m.seq)
  if(all.some(c => seqs(c).length))
    assert("01.8", all.every(c => seqs(c).every((s, i, a) => i === 0 || s > a[i - 1])), "seq strictly increasing on every client")

  // T:STATSYNC-02 (P3+): delta equivalence — only meaningful once the backend
  // answers the probe's opt-in with game_delta; before that D just mirrors C.
  let deltaStats = null
  if(D.deltas){
    log("assertions (T:STATSYNC-02 — delta equivalence):")
    assert("02.1", D.fulls === 1 && D.deltas >= 8, `probe got exactly one full state then deltas (fulls=${D.fulls} deltas=${D.deltas})`)
    const overlap = Object.keys(D.views).filter(s => C.stateViews[s])
    const mismatch = overlap.filter(s => D.views[s] !== C.stateViews[s])
    assert("02.2", overlap.length >= 8 && mismatch.length === 0, `patch-reconstructed state ≡ full-state control at ${overlap.length} seqs${mismatch.length ? " — MISMATCH at seq " + mismatch.join(",") : ""}`)
    const texts = rows => JSON.stringify((rows || []).filter(m => !m.system).map(m => m.text))
    assert("02.3", texts(D.model.chat) === texts(C.last.state.chat), "chatAppend-reconstructed chat matches control's visible chat (welcome rows excluded — legitimately per-viewer)")
    const dAvg = Math.round(D.deltaBytes / D.deltas), cAvg = Math.round(C.bytes / C.states)
    assert("02.4", dAvg < cAvg, `delta avg ${dAvg}B/broadcast < full-state avg ${cAvg}B/broadcast`)
    deltaStats = { deltas: D.deltas, fulls: D.fulls, deltaAvgBytes: dAvg, fullAvgBytes: cAvg, savingPct: Math.round(100 - dAvg * 100 / cAvg) }
  }

  const perClient = all.map(c => ({ name: c.name, states: c.states, bytes: c.bytes, avgBytes: Math.round(c.bytes / c.states), maxBytes: Math.max(...c.msgs.filter(m => m.type === "game_state").map(m => m.bytes)) }))
  const lat = timings.map(t => t.ms).sort((a, b) => a - b)
  const summary = {
    kind: "scripted", gameId, actions: timings.length,
    perClient, latencyMsMedian: lat[Math.floor(lat.length / 2)], latencyMs: timings,
    seqPresent: all.some(c => c.msgs.some(m => m.seq != null)),
    finalStateBytes: sharedView(A.last).length, growth, deltaStats
  }
  everyone.forEach(c => { c.send({ type: "game_exit", gameId, playerToken: c.token }); c.close() })
  return summary
}

async function passive(){
  if(!SAMPLE_GAME) return null
  const games = await fetch(`${API}/katomia/games`).then(r => r.json()).catch(() => null)
  if(!games?.games?.[SAMPLE_GAME]){ log(`passive sample skipped — game ${SAMPLE_GAME} not on this backend`); return null }
  log(`passive sample: spectating ${SAMPLE_GAME} for ${SAMPLE_SECS}s`)
  const S = new Client("sample")
  await S.connect()
  S.join(SAMPLE_GAME, "statsync-probe")
  await new Promise(r => setTimeout(r, SAMPLE_SECS * 1000))
  const sizes = S.msgs.filter(m => m.type === "game_state").map(m => m.bytes)
  S.close()
  if(!sizes.length){ log("passive sample: no broadcasts observed (quiet game)"); return { kind: "passive", game: SAMPLE_GAME, secs: SAMPLE_SECS, states: 0 } }
  return { kind: "passive", game: SAMPLE_GAME, secs: SAMPLE_SECS, states: sizes.length,
    bytes: sizes.reduce((a, b) => a + b, 0), avgBytes: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
    maxBytes: Math.max(...sizes), perMinute: Math.round(sizes.length * 60 / SAMPLE_SECS) }
}

async function main(){
  const scriptedRes = await scripted()
  const passiveRes = await passive()
  const out = { _about: "STATSYNC1 wire benchmark (T:STATSYNC-BENCH-01). Full-state broadcast measurements — correctness (T:STATSYNC-01) must never regress across phases; bytes must fall by P6.",
    ts: new Date().toISOString(), api: API, scripted: scriptedRes, passive: passiveRes,
    failures }
  console.log("\n=== SUMMARY ===")
  console.log(JSON.stringify(out, null, 2))
  if(RECORD){
    const path = require("path"), fs = require("fs")
    const file = path.join(__dirname, "../data/benchmarks", `${new Date().toISOString().slice(0, 10)}-statsync-${scriptedRes.seqPresent ? "phase" : "baseline"}.json`)
    fs.writeFileSync(file, JSON.stringify(out, null, 2))
    log(`recorded → ${file}`)
  }
  process.exit(failures.length ? 1 : 0)
}

main().catch(e => { console.error("HARNESS ERROR", e); process.exit(2) })
