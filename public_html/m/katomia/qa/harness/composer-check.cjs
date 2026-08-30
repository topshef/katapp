// composer-check.cjs — COMPOSER-01: access-rule composer quick pick + create-form
// template deep links (JOINRULE-COMPOSER1 phase 1 / CREATE-DEEPLINK1, 2026-08-20).
//
// Browser-level (Playwright headless): the composer is UI, so a curl can't see it
// (feedback-verify-with-browser). Eight assertions across three surfaces:
//   .1 deep link prefills every form field    .2 template link round-trips the state
//   .3 composer seeds chips from the input CSV with mirror classification (named token)
//   .4 held-tokens dropdown lists the seeded account's tokens
//   .5 pasting a token ID auto-classifies to a token chip
//   .6 "Use this rule" writes the CSV back to the input
//   .7 submitting a deep-linked gated form creates the circle and lands on /board/<id>
//   .8 the created circle really gates: anonymous GET /game/:id → eligible:false
//
// Fixtures (testnet): alice 0.0.9556348 holds NFT 0.0.3626892 "Chickens feb 2024"
// (same fixtures as T:JOINGATE-01 — if the cast rotates, both suites flip together).
//
//   node composer-check.cjs
//   BASE=https://lab22.kpay.uk API=https://hapi2.hbar.live/live node composer-check.cjs
let chromium
for(const p of ["/opt/kwallet/node_modules/playwright", "playwright"]){
  try { ({ chromium } = require(p)); break } catch {}
}
if(!chromium){ console.error("no playwright module found"); process.exit(2) }

const BASE = (process.env.BASE || "https://lab22.kpay.uk").replace(/\/+$/, "")
const API  = (process.env.API || "https://hapi2.hbar.live/live").replace(/\/+$/, "")
const NFT = process.env.NFT || "0.0.3626892"
const HOLDER = process.env.HOLDER || "0.0.9556348"
const INSTANCE = "COMPOSER-01"
const log = (...a) => console.log(new Date().toISOString(), "[composer]", ...a)

const RUN_ID = "composer-" + Date.now().toString(36)
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
  const fails = []
  let n = 0
  const t = (name, ok, detail) => { n++
    log((ok ? "PASS" : "FAIL"), `T:COMPOSER-01.${n}`, name, detail ? "→ " + String(detail).slice(0, 90) : "")
    if(!ok) fails.push(`.${n} ${name}${detail ? ` (${String(detail).slice(0,120)})` : ""}`) }

  const br = await chromium.launch()
  try {
    const ctx = await br.newContext()
    await ctx.addInitScript(holder => localStorage.setItem("katomiaAuthRecords",
      JSON.stringify({ ["testnet:" + holder]: { kind: "auth", accountId: holder, network: "testnet" } })), HOLDER)

    // .1 deep-link prefill
    const pg = await ctx.newPage()
    await pg.goto(BASE + "/m/katomia/create?name=QA%20tpl&network=testnet&visibility=unlisted&mode=orderBook&lock=all&theme=gemstone&breakout=off&access=" + NFT + "&welcome=hello&idle=24&delay=5&valid=90",
      { waitUntil: "networkidle", timeout: 30000 })
    const got = await pg.evaluate(() => ({
      name: gameName.value, network: getRadio("network"), vis: getRadio("visibility"),
      mode: getRadio("tradingMode"), lock: getRadio("lockRule"), theme: gameTheme.value,
      breakout: gameBreakout.value, idle: idleAccountHours.value, access: joinRule.value,
      welcome: welcomeMessage.value, delay: txDelaySeconds.value, valid: validDurationSeconds.value }))
    const want = { name: "QA tpl", network: "testnet", vis: "unlisted", mode: "orderBook", lock: "all",
      theme: "gemstone", breakout: "off", idle: "24", access: NFT, welcome: "hello", delay: "5", valid: "90" }
    const bad = Object.keys(want).filter(k => got[k] !== want[k])
    t("deep link prefills every field", !bad.length, bad.length ? bad.map(k => `${k}=${got[k]}`).join(",") : "12/12")

    // .2 template link round-trips
    const tpl = await pg.evaluate(() => buildTemplateLink())
    const tq = new URL(tpl).searchParams
    const tplOk = tq.get("mode") === "orderBook" && tq.get("lock") === "all" && tq.get("theme") === "gemstone" &&
      tq.get("access") === NFT && tq.get("idle") === "24" && tq.get("delay") === "5" && tq.get("valid") === "90" &&
      tq.get("network") === "testnet" && tq.get("visibility") === "unlisted" && !tq.get("admin")
    t("template link round-trips state (and never carries admin)", tplOk, tpl.slice(tpl.indexOf("?"), 120))

    // .3-.6 composer
    const pg2 = await ctx.newPage()
    await pg2.goto(BASE + "/m/katomia/create?network=testnet&access=" + NFT + "," + HOLDER, { waitUntil: "networkidle" })
    await pg2.click("#kcompOpen")
    let chips = []
    try {
      await pg2.waitForFunction(() => document.querySelectorAll(".kcomp-chip").length === 2 &&
        [...document.querySelectorAll(".kcomp-chip")].some(c => /🎟/.test(c.textContent)), null, { timeout: 15000 })
      chips = await pg2.$$eval(".kcomp-chip", els => els.map(e => e.textContent.replace("✕", "").trim()))
    } catch {}
    t("composer seeds classified chips from CSV", chips.some(c => c.includes("Chickens")) && chips.some(c => c.includes(HOLDER)), chips.join(" | "))

    let opts = []
    try {
      await pg2.waitForFunction(() => document.querySelector("#kcompTokens")?.options.length > 1, null, { timeout: 15000 })
      opts = await pg2.$$eval("#kcompTokens option", os => os.map(o => o.value).filter(Boolean))
    } catch {}
    t("held-tokens dropdown lists the account's tokens", opts.includes(NFT), opts.join(","))

    await pg2.fill("#kcompId", "0.0.2340890")
    await pg2.click("#kcompAddId")
    let kbrl = false
    try {
      await pg2.waitForFunction(() => [...document.querySelectorAll(".kcomp-chip")].some(c => c.textContent.includes("K-BRL")), null, { timeout: 15000 })
      kbrl = true
    } catch {}
    t("pasted token ID auto-classifies to a token chip", kbrl)

    await pg2.click("#kcompUse")
    const val = await pg2.inputValue("#joinRule")
    t("Use writes the CSV back to the input", val === `${NFT}, ${HOLDER}, 0.0.2340890`, val)

    // .7 submit a deep-linked gated form → created + board redirect
    const pg3 = await ctx.newPage()
    await pg3.goto(BASE + "/m/katomia/create?name=QA%20composer%20" + RUN_ID + "&network=testnet&visibility=unlisted&access=" + NFT + "&idle=0.25", { waitUntil: "networkidle" })
    await pg3.click("#createBtn")
    let gameId = null
    try {
      await pg3.waitForURL(/\/board\/[^/?]+\?created=1/, { timeout: 20000 })
      gameId = decodeURIComponent(pg3.url().match(/\/board\/([^/?]+)/)[1])
    } catch {}
    t("deep-linked form creates + lands on board", !!gameId, gameId || pg3.url())

    // .8 the circle really gates
    if(gameId){
      const g = await fetch(API + "/katomia/game/" + encodeURIComponent(gameId)).then(r => r.json()).catch(() => null)
      t("created circle gates anonymously (eligible:false)",
        g?.ok === true && g.eligible === false && JSON.stringify(g.game?.joinRule) === JSON.stringify([NFT]),
        `eligible=${g?.eligible} joinRule=${JSON.stringify(g?.game?.joinRule)}`)
    } else t("created circle gates anonymously (eligible:false)", false, "no gameId from .7")
  } finally { await br.close() }

  const ok = fails.length === 0
  const note = ok ? `all ${n} assertions green (NFT ${NFT})` : `FAIL: ${fails.join("; ")}`
  log(note)
  await reportKflow("test:verdict", ok ? "pass" : "fail",
    { source: "auto", instance: INSTANCE, note: note.slice(0, 400), secs: Math.round((Date.now() - t0) / 1000) })
  log("verdict:", ok ? "pass" : "fail")
  process.exit(ok ? 0 : 1)
})()
