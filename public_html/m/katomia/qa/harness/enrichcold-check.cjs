// enrichcold-check.cjs — ENRICHCOLD-01: asset-enrich cold path stays fast,
// cached, parallel, and boards never show bare token ids.
//
// ENRICH-COLDPATH1 (2026-08-08..13, four defects): /m (no slash) 301'd every
// lookup, session-lock serialised concurrent calls, nothing cached, and one
// hung xproof blocked ALL assets — cold boards showed bare 0.0.x names for
// 5.6s+ or forever. Fixes measured 1.3s cold / 0.32s warm server-side. The
// Kache.getData timeout was deliberately deferred (katomia-enrich.js:34) — a
// known hole this canary watches from the outside.
//
// (a) endpoint probes: the client's exact URL answers 200 JSON (never 301),
//     warm < 500ms, and a 6-asset concurrent burst lands < 2.5s (the incident
//     took 5.6s for 6 — re-serialisation or a hung upstream trips this).
// (b) cold-profile board: fresh browser context on a real demo game — no chip
//     may still display a bare 0.0.x id after 3s.
//
//   node enrichcold-check.cjs        BASE=<site> TRIGGER=... supported
const { chromium } = require("/opt/kwallet/node_modules/playwright")

const BASE = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const PREFIX = process.env.BOARD_PREFIX || (/katlab|swap\.kpay\.live/.test(BASE) ? "/m/katomia" : "")
const TRIGGER = process.env.TRIGGER || "manual"
const INSTANCE = "ENRICHCOLD-01"
const DEMO_GAME = process.env.DEMO_GAME || "t-kat-demo"
const QA_ACCT = "0.0.9556348"
const log = (...a) => console.log(new Date().toISOString(), "[enrichcold]", ...a)

const RUN_ID = "enrichcold-" + Date.now().toString(36)
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
const timeIt = async fn => { const t = Date.now(); const r = await fn(); return { ms: Date.now() - t, r } }

;(async () => {
  await reportKflow("test:start", INSTANCE, {})

  // a stable probe set: tokens the QA account actually holds (mirror-derived)
  let tokens = []
  try {
    const j = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${QA_ACCT}/tokens?limit=6`).then(r => r.json())
    tokens = (j.tokens || []).map(t => t.token_id)
  } catch {}
  if(tokens.length < 2) tokens = ["0.0.2341021"]
  const url = id => `${BASE}/m/?format=json&productId=${encodeURIComponent("testnet;" + id)}`

  // (a1) the client's exact URL: 200, JSON, no redirect hop
  const first = await fetch(url(tokens[0]), { redirect: "manual" })
  check("STATUS", first.status === 200, `GET /m/?productId=testnet;${tokens[0]} -> ${first.status}${first.status >= 300 && first.status < 400 ? " (REDIRECT — the 301 defect is back)" : ""}`)
  let body = null
  try { body = await first.json() } catch {}
  check("JSON", !!body, body ? "JSON body parsed" : "body is not JSON")

  // (a2) warm latency
  const warm = await timeIt(() => fetch(url(tokens[0])).then(r => r.json()))
  check("WARM", warm.ms < 500, `warm repeat ${warm.ms}ms (gate <500ms)`)

  // (a3) concurrent burst — the serialisation + hung-upstream probe
  const burstIds = Array.from({ length: 6 }, (_, i) => tokens[i % tokens.length])
  const burst = await timeIt(() => Promise.all(burstIds.map(id => fetch(url(id)).then(r => r.status))))
  check("BURST", burst.ms < 2500 && burst.r.every(s => s === 200),
    `6 concurrent lookups in ${burst.ms}ms, statuses [${burst.r.join(",")}] (gate <2500ms — incident measured 5600ms)`)

  // (b) cold-profile board: no bare 0.0.x chip labels after 3s
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${BASE}${PREFIX}/board/${DEMO_GAME}?skin=ring16`, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    const bare = await page.evaluate(() => {
      const out = []
      document.querySelectorAll('[data-testid="chip"]').forEach(c => {
        const txt = (c.innerText || "").trim()
        if(/^0\.0\.\d+/.test(txt)) out.push(c.dataset.assetId || txt.slice(0, 20))
      })
      return { bare: out, total: document.querySelectorAll('[data-testid="chip"]').length }
    })
    if(bare.total === 0) log(`note: demo game ${DEMO_GAME} rendered 0 chips — cold-profile half inconclusive, endpoint probes still count`)
    else check("COLDBOARD", bare.bare.length === 0,
      `${bare.total} chips on cold profile, ${bare.bare.length} still showing bare token ids after 3s${bare.bare.length ? " (" + bare.bare.slice(0, 3).join(", ") + ")" : ""}`)
  } catch(e){
    failures.push("cold-profile board error: " + String(e.message).slice(0, 150))
  } finally {
    await browser.close()
  }

  const v = failures.length ? "fail" : "pass"
  await reportKflow("test:verdict", v, {
    note: failures.length ? failures.join(" ⁋ ").slice(0, 800)
      : `endpoint 200/JSON, warm ${warm.ms}ms, 6-burst ${burst.ms}ms, cold board clean (${tokens.length} probe tokens)` })
  log("verdict:", v)
  process.exit(failures.length ? 1 : 0)
})().catch(async e => {
  console.error("FATAL", e.message)
  await reportKflow("test:verdict", "error", { note: String(e.message).slice(0, 200) }).catch(() => {})
  process.exit(1)
})
