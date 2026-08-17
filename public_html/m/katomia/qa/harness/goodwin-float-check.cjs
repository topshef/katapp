// goodwin-float-check.cjs — GOODWIN-FLOAT-01: demo economy solvency, mirror-truthed.
//
// GOODWIN-DEMO1/2/4: three recurrences of the payer deadlock — Goodwin
// (0.0.9862254) runs dry (KUSD treats and/or the HBAR that pays the transfer
// fees), the demo keeps narrating rewards, every round logs SUCCESS, and
// viewers watch a promise that never lands (18-19h public outages). Memory
// rule: verify on the MIRROR TRANSFER LIST, never the SUCCESS log.
//
// Asserts, all against the public testnet mirror:
//   FLOAT   KUSD balance covers >= 1 full reward round (3 x 0.5 KUSD)
//   FEES    HBAR balance >= 1 ℏ (the recurring deadlock is a 0-ℏ payer)
//   LEGS    if the treats demo daemon is RUNNING, outbound KUSD legs from
//           Goodwin must exist on the mirror within the last 24h — a running
//           narrator with zero settled legs IS the outage, whatever it logs.
// Red = run kbot/cast-topup.cjs --go (see GOODWIN-DEMO4 postmortem).
//
//   node goodwin-float-check.cjs
const { execSync } = require("child_process")

const BASE = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const PREFIX = process.env.BOARD_PREFIX || (/katlab|swap\.kpay\.live/.test(BASE) ? "/m/katomia" : "")
const TRIGGER = process.env.TRIGGER || "manual"
const INSTANCE = "GOODWIN-FLOAT-01"
const MIRROR = "https://testnet.mirrornode.hedera.com"
const GOODWIN = "0.0.9862254"
const KUSD = "0.0.2341021"
const ROUND_NEED = 500000 * 3          // 0.5 KUSD x 3 participants (treats-demo-loop.js)
const HBAR_FLOOR = 1e8                 // 1 ℏ in tinybar
const log = (...a) => console.log(new Date().toISOString(), "[goodwin]", ...a)

const RUN_ID = "goodwinfloat-" + Date.now().toString(36)
async function reportKflow(checkpoint, v, detail){
  const commit = await fetch(`${BASE}${PREFIX}/qa/results.php?days=1`)
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch(`${BASE}/kflow`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit,
      detail: { source: "auto", instance: INSTANCE, trigger: TRIGGER, ...detail } }] }) })
}

const failures = []
const check = (id, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`)
  if(!ok) failures.push(`${id}: ${detail}`)
}

;(async () => {
  await reportKflow("test:start", INSTANCE, {})

  const acct = await fetch(`${MIRROR}/api/v1/accounts/${GOODWIN}`).then(r => r.json())
  const hbar = Number(acct?.balance?.balance ?? NaN)
  check("FEES", hbar >= HBAR_FLOOR, `Goodwin HBAR ${(hbar / 1e8).toFixed(4)} ℏ (floor 1 ℏ — the deadlock class is a 0-ℏ payer)`)

  const tok = await fetch(`${MIRROR}/api/v1/accounts/${GOODWIN}/tokens?token.id=${KUSD}&limit=1`).then(r => r.json())
  const kusd = Number((tok.tokens || [])[0]?.balance ?? 0)
  check("FLOAT", kusd >= ROUND_NEED, `Goodwin holds ${(kusd / 1e6).toFixed(2)} KUSD (needs ${(ROUND_NEED / 1e6).toFixed(2)} per round)`)

  // is the treats demo narrating right now? (this box runs the daemons)
  let demoOnline = false
  try {
    const pm2 = JSON.parse(execSync("pm2 jlist", { encoding: "utf8", timeout: 10000 }))
    demoOnline = pm2.some(p => /katdemo-treats/.test(p.name) && p.pm2_env?.status === "online")
  } catch(e){ log("pm2 check failed (" + e.message.slice(0, 80) + ") — treating demo state as unknown") }

  // outbound KUSD legs from Goodwin in the last 24h, straight off the chain
  const since = (Date.now() / 1000 - 86400).toFixed(0)
  let legs = 0
  try {
    const j = await fetch(`${MIRROR}/api/v1/transactions?account.id=${GOODWIN}&timestamp=gte:${since}&limit=100`).then(r => r.json())
    for(const t of j.transactions || [])
      for(const tt of t.token_transfers || [])
        if(tt.token_id === KUSD && tt.account === GOODWIN && tt.amount < 0) legs++
  } catch(e){ log("mirror transfer list failed: " + e.message.slice(0, 80)) }

  if(demoOnline) check("LEGS", legs > 0,
    `treats demo is ONLINE and the mirror shows ${legs} outbound KUSD leg(s) from Goodwin in 24h — zero legs from a running narrator IS the outage, whatever the SUCCESS log says`)
  else log(`treats demo not running (or unknown) — LEGS informational: ${legs} outbound KUSD leg(s) in 24h`)

  const v = failures.length ? "fail" : "pass"
  await reportKflow("test:verdict", v, {
    note: failures.length ? failures.join(" ⁋ ").slice(0, 700) + " — fix: node kbot/cast-topup.cjs --go"
      : `Goodwin solvent: ${(hbar / 1e8).toFixed(2)} ℏ, ${(kusd / 1e6).toFixed(2)} KUSD, ${legs} reward leg(s) on-chain in 24h (demo ${demoOnline ? "online" : "offline/unknown"})` })
  log("verdict:", v)
  process.exit(failures.length ? 1 : 0)
})().catch(async e => {
  console.error("FATAL", e.message)
  await reportKflow("test:verdict", "error", { note: String(e.message).slice(0, 200) }).catch(() => {})
  process.exit(1)
})
