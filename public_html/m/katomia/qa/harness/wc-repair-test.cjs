// Post-reload re-pair test: board page on a TESTNET game, fresh load (connector
// defaults to mainnet), user taps Sign with no restored account -> boardDirectSign
// calls WC.connect() -> what does the pairing proposal ask for, and can a
// testnet wallet (kWallet) even approve it?
const { chromium } = require("/opt/kwallet/node_modules/playwright")
const KWALLET_BASE = "http://127.0.0.1:8790"
const KWALLET_TOKEN = process.env.KWALLET_TOKEN
const log = (...a) => console.log(new Date().toISOString(), "[repair]", ...a)
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
;(async () => {
  await kwallet("/api/mode", { mode: "auto" })
  const b = await chromium.launch()
  const p = await (await b.newContext()).newPage()
  const lines = []
  p.on("console", m => { const t = m.text(); if(/\[WC\]|error|Error|mainnet|testnet/.test(t)) lines.push(t.slice(0,220)) })
  // fresh context = no storage; a TESTNET game page
  await p.goto("https://lab1.katlab.kpay.live/m/katomia/board/QFLPTQ?skin=ring16", { waitUntil: "domcontentloaded" })
  await p.waitForTimeout(2500)
  const pre = await p.evaluate(async () => ({ net0: window.WC?.getNetwork?.(), acct: await window.WC?.getAccount?.(), net1: window.WC?.getNetwork?.() }))
  log("fresh load on testnet game:", JSON.stringify(pre))
  // now do what boardDirectSign does when getAccount() is null: wc.connect()
  const connP = p.evaluate(() => window.WC.connect().then(a => ({ ok: a })).catch(e => ({ err: String(e?.message || e), raw: (() => { try { return JSON.stringify(e) } catch { return null } })() })))
  let uri = null
  for(let i = 0; i < 30; i++){ uri = await p.evaluate(`(${URI_FINDER})()`).catch(() => null); if(uri) break; await p.waitForTimeout(500) }
  log("pairing URI requested:", uri ? uri.slice(0, 40) + "…" : "NONE")
  if(uri){
    const pr = await kwallet("/api/pair", { uri })
    log("kWallet pair result:", JSON.stringify(pr))
    await p.waitForTimeout(4000)
  }
  const conn = await Promise.race([connP, new Promise(r => setTimeout(() => r({ timeout: true }), 15000))])
  log("WC.connect() outcome:", JSON.stringify(conn))
  const post = await p.evaluate(async () => ({
    net: window.WC?.getNetwork?.(),
    acct: await window.WC?.getAccount?.().catch(() => null),
    accts: await window.WC?.getAccounts?.().catch(() => null)
  }))
  log("post state:", JSON.stringify(post))
  log("--- console ---"); lines.slice(-12).forEach(l => log(l))
  await b.close()
  await kwallet("/api/mode", { mode: "manual" })
  log("kWallet restored to manual")
})().catch(async e => { console.error("FATAL", e); await kwallet("/api/mode", { mode: "manual" }).catch(()=>{}); process.exit(1) })
