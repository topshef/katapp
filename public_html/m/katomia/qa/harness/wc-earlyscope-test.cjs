// wc-earlyscope-test.cjs — WC-NETSCOPE1 fix #2 verification: after pairing on a
// testnet game and RELOADING, the page-level early scope (kwcEarlyScope, fires on
// game_state once the bundle is up) should flip the connector to the game's
// network and surface the restored session WITHOUT any user action — i.e. the
// account picker no longer says "no wallet connected" after a reload. Polls the
// WC state post-reload instead of clicking Sign.
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const KWALLET_BASE = "http://127.0.0.1:8790"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const log = (...a) => console.log(new Date().toISOString(), "[earlyscope]", ...a)

const URI_FINDER = `() => {
  const found = new Set()
  const visit = (root) => {
    for (const el of (root.querySelectorAll ? root.querySelectorAll('*') : [])) {
      for (const a of el.attributes || []) if (a.value && a.value.startsWith('wc:')) found.add(a.value)
      for (const k of ['uri','walletConnectUri','value']) { try { if (typeof el[k]==='string' && el[k].startsWith('wc:')) found.add(el[k]) } catch(e){} }
      if (el.shadowRoot) visit(el.shadowRoot)
    }
  }
  visit(document)
  return [...found][0] || null
}`
async function kwallet(path, body){
  const r = await fetch(KWALLET_BASE + path, { method: "POST",
    headers: { "content-type": "application/json", "x-kwallet-token": KWALLET_TOKEN },
    body: JSON.stringify(body || {}) })
  return r.json()
}

async function main(){
  const gr = await fetch("https://lab22.kpay.uk/m/katomia/hapi.php?action=create", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: { name: "WC earlyscope test" }, network: "testnet",
      visibility: "public", joinRule: "*", lockRule: "all",
      config: { tradingMode: "proposal", txDelaySeconds: 0, validDurationSeconds: 180 } })
  }).then(r => r.json())
  const GAME = gr.gameId
  if(!GAME) throw new Error("game create failed: " + JSON.stringify(gr))
  log("game:", GAME)
  const BOARD = `https://lab22.kpay.uk/m/katomia/board/${GAME}?skin=ring16`

  await kwallet("/api/mode", { mode: "auto" })
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()
  await page.goto(BOARD, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2000)
  await page.locator("button.ring-footer-accsel").first().click()
  await page.waitForTimeout(500)
  await page.locator("#addAcctConnect").click()
  const uri = await (async () => { for(let i=0;i<40;i++){ const u = await page.evaluate(`(${URI_FINDER})()`).catch(()=>null); if(u) return u; await page.waitForTimeout(500) } })()
  if(!uri) throw new Error("no WC URI")
  const pr = await kwallet("/api/pair", { uri })
  if(!pr.ok) throw new Error("pair failed " + JSON.stringify(pr))
  await page.waitForTimeout(2500)
  if(await page.locator("#addAcctJoinAll").count()) await page.locator("#addAcctJoinAll").click()
  await page.waitForTimeout(1500)
  log("paired + joined; reloading")

  await page.reload({ waitUntil: "domcontentloaded" })
  // poll — NO user action; the early scope alone must surface the session
  let final = null
  for(let t = 0; t < 20; t++){
    await page.waitForTimeout(2000)
    const s = await page.evaluate(async () => {
      const wc = window.WC || {}
      return { scoped: !!window.__kwcEarlyScoped, network: wc.getNetwork?.(),
        acct: await wc.getAccount?.().catch(() => null),
        accts: await wc.getAccounts?.().catch(() => null) }
    }).catch(() => null)
    log(`+${(t+1)*2}s:`, JSON.stringify(s))
    final = s
    if(s && s.network === "testnet" && s.acct && s.accts?.length) break
  }
  const pass = final && final.network === "testnet" && !!final.acct && final.accts?.length > 0
  log(pass ? "PASS — restored session visible on game network with no user action"
           : "FAIL — session still invisible after reload")
  await browser.close()
  if(!pass) process.exit(2)
}
main().finally(async () => {
  await kwallet("/api/mode", { mode: "manual" }).catch(() => {})
  log("kWallet restored to manual")
}).catch(e => { console.error("FATAL", e); process.exit(1) })
