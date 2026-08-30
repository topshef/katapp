#!/usr/bin/env node
// T:SAMEORIGIN-01 — same-origin backend access (KAT-SAMEORIGIN-FE1).
//
// Drives a real board page headless and captures EVERY request (http + websocket).
// Passes when the browser never talks to the backend origin: no fetch, no script,
// no websocket may carry a backend-shaped host. The page must instead reach the
// backend through its own origin (/hapi/* proxy, /kfeedback, hapi.php) — proving
// the KAT-SAMEORIGIN-PROXY1 vhost + FE1 frontend changes actually hide the backend.
//
//   BASE=https://lab22.kpay.uk BACKEND=hapi2.hbar.live \
//     node sameorigin-check.cjs [pagePath]
//
// pagePath default: /m/katomia/board/m-prop (the page the original feedback 73fd3870
// was pressed on). Curl can't see any of this (feedback-verify-with-browser) — the
// websocket + late script loads only exist in a real engine.
//
// Exit 0 = pass. Exit 1 = backend origin leaked (each leak printed). Exit 2 = harness
// error (page didn't load, websocket never opened — infra, not a verdict).

const { chromium } = require("/opt/kwallet/node_modules/playwright")

const BASE = process.env.BASE || "https://lab22.kpay.uk"
const BACKEND = (process.env.BACKEND || "hapi2.hbar.live").toLowerCase()
const PAGE = process.argv[2] || "/m/katomia/board/m-prop"
const SETTLE_MS = Number(process.env.SETTLE_MS || 10000)

// any host matching these is "a backend" even if BACKEND env is stale — belt & braces
const BACKEND_SHAPES = [
  /^(alpha|bravo|charlie|delta|echo|foxtrot)\.katlab\./i,
  /^hapi\d*\./i,
  /^api\.gomint\.me$/i,
]

const isBackendHost = h => h === BACKEND || BACKEND_SHAPES.some(re => re.test(h))

;(async () => {
  const pageHost = new URL(BASE).host.toLowerCase()
  const leaks = [], external = new Map(), sockets = []
  let sameOriginWs = null

  const browser = await chromium.launch()
  const page = await browser.newPage({ ignoreHTTPSErrors: true })

  page.on("request", req => {
    let h; try { h = new URL(req.url()).host.toLowerCase() } catch { return }
    if (h === pageHost) return
    if (isBackendHost(h)) leaks.push(`${req.method()} ${req.url()}`)
    else external.set(h, (external.get(h) || 0) + 1)
  })
  page.on("websocket", ws => {
    let h; try { h = new URL(ws.url()).host.toLowerCase() } catch { h = "?" }
    sockets.push(ws.url())
    if (isBackendHost(h)) leaks.push(`WS ${ws.url()}`)
    if (h === pageHost) sameOriginWs = ws.url()
  })

  try {
    // domcontentloaded, NOT networkidle: these pages hold a live websocket and poll
    // WalletConnect's explorer API, so networkidle never fires and the harness timed
    // out against a page that was in fact perfectly healthy (pat, 2026-08-21).
    await page.goto(BASE + PAGE, { waitUntil: "domcontentloaded", timeout: 45000 })
  } catch (e) {
    console.error(`FAIL(harness): page load — ${e.message}`); process.exit(2)
  }
  await page.waitForTimeout(SETTLE_MS)

  // the game socket must actually be up, and up on the PAGE origin — otherwise
  // "no backend traffic" could just mean "nothing worked at all"
  const wsState = await page.evaluate(() => ({
    base: window.CONFIG ? window.CONFIG.HAPI_BASE : "<no CONFIG>",
    widget: typeof window.KFeedbackWidget,
  }))

  console.log(`page:      ${BASE}${PAGE}`)
  console.log(`CONFIG.HAPI_BASE: ${JSON.stringify(wsState.base)}`)
  console.log(`websockets seen:  ${sockets.length ? sockets.join(" · ") : "none"}`)
  console.log(`feedback widget:  window.KFeedbackWidget = ${wsState.widget}`)
  console.log(`external (non-backend) hosts: ${[...external].map(([h, n]) => `${h}(${n})`).join(" ") || "none"}`)

  await browser.close()

  if (leaks.length) {
    console.error(`\nFAIL — backend origin reached ${leaks.length}x:`)
    leaks.forEach(l => console.error("  " + l))
    process.exit(1)
  }
  if (wsState.widget !== "object") {
    console.error("\nFAIL: the feedback widget did not execute (window.KFeedbackWidget = " + wsState.widget +
      ") — classic symptom of a double-gzipped /feedback-widget.js reaching the browser as garbage")
    process.exit(1)
  }
  if (!sameOriginWs) {
    console.error("\nFAIL(harness): no same-origin websocket opened — either the /hapi/ws proxy is missing (KAT-SAMEORIGIN-PROXY1) or KAT_SAMEORIGIN=1 is not set in .env_hapi")
    process.exit(2)
  }
  console.log(`\nPASS — zero backend-origin requests; game socket on ${sameOriginWs}`)
  process.exit(0)
})()
