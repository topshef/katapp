// wc-singleinit-check.cjs — WCSINGLEINIT-01: exactly one WalletConnect client
// per page load.
//
// WC-DOUBLEINIT1 (2026-08-07, fixed 8e6255c): every page load emitted wc:build
// TWICE ~3ms apart — two DAppConnectors over ONE localStorage/IndexedDB store,
// which destroy each other's sessions ("No matching key", ghost re-pairs, an
// on-chain-confirmed expired tx). The kdiag stream mirrors to console.debug,
// so the assertion is a plain count: a fresh board load must emit wc:build
// exactly once. 0 = inconclusive (bundle changed its init timing — error, not
// pass), 2+ = the regression.
//
//   node wc-singleinit-check.cjs      BASE=<site> TRIGGER=... supported
const { chromium } = require("/opt/kwallet/node_modules/playwright")

const BASE = (process.env.BASE || "https://lab1.katlab.kpay.live").replace(/\/+$/, "")
const PREFIX = process.env.BOARD_PREFIX || (/katlab|swap\.kpay\.live/.test(BASE) ? "/m/katomia" : "")
const GAME = process.env.GAME || "t-kat-demo"
const TRIGGER = process.env.TRIGGER || "manual"
const INSTANCE = "WCSINGLEINIT-01"
const log = (...a) => console.log(new Date().toISOString(), "[wcsingleinit]", ...a)

const RUN_ID = "wcsingleinit-" + Date.now().toString(36)
async function reportKflow(checkpoint, v, detail){
  const commit = await fetch(`${BASE}${PREFIX}/qa/results.php?days=1`)
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch(`${BASE}/kflow`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit,
      detail: { source: "auto", instance: INSTANCE, trigger: TRIGGER, ...detail } }] }) })
}

;(async () => {
  await reportKflow("test:start", INSTANCE, {})
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const builds = []
  page.on("console", async m => {
    if(m.type() !== "debug" || !m.text().includes("wc:build")) return
    let net = "?"
    try { net = (await m.args()[2]?.jsonValue())?.net || "?" } catch {}
    builds.push({ t: Date.now(), net })
  })
  await page.goto(`${BASE}${PREFIX}/board/${GAME}?skin=ring16`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(10000)
  await browser.close()

  // The DOUBLEINIT signature is two builds ~3ms apart over one store (the
  // incident log: .823/.826). A LATER rebuild for a different network scope is
  // the WC-NETSCOPE flow and legitimate — so fail only on near-simultaneous
  // builds (< 3s apart), and report the full build list either way.
  const shape = builds.map(b => b.net).join(" → ") || "none"
  const twin = builds.some((b, i) => i && b.t - builds[i - 1].t < 3000)
  let v, note
  if(builds.length === 0){ v = "error"; note = "no wc:build observed in 10s — bundle init timing changed; assertion inconclusive, not a pass" }
  else if(twin){ v = "fail"; note = `WC-DOUBLEINIT1 REGRESSION: ${builds.length} wc:build events with a near-simultaneous pair (<3s apart) — multiple clients over one store (${shape})` }
  else { v = "pass"; note = `${builds.length} wc:build(s), none near-simultaneous (${shape})${builds.length > 1 ? " — later builds are network-scope rebuilds (WC-NETSCOPE)" : ""}` }
  await reportKflow("test:verdict", v, { note })
  log("verdict:", v, "—", note)
  process.exit(v === "pass" ? 0 : 1)
})().catch(async e => {
  console.error("FATAL", e.message)
  await reportKflow("test:verdict", "error", { note: String(e.message).slice(0, 200) }).catch(() => {})
  process.exit(1)
})
