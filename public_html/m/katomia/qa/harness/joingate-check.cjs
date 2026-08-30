// joingate-check.cjs — JOINGATE-01: token-gated join rule (GAME-JOINRULE2a).
//
// An allowlist entry in a game's joinRule may be an ACCOUNT id (direct match) or a
// TOKEN id ("any account holding ≥1 of this token" — NFT collection membership or a
// nonzero fungible balance). Classification is by mirror lookup (/tokens/{id} 404 =
// account), holder check via /tokens/{id}/balances. Shipped 2026-08-19 on alpha.
//
// TWO LAYERS, one verdict:
//  A) module assertions — requires the backend's katomiaHelpers directly (same box)
//     and drives checkJoinRule against the live testnet mirror. T:JOINGATE-01.1-8
//  B) integration — creates a token-gated game via /create, raises REAL verified
//     commitments (cast keys, recipe from kbot/treats-raise-commitments.cjs) for a
//     holder and a non-holder, asserts /game/:id eligibility. T:JOINGATE-01.9-11
//
// Fixtures (testnet): NFT collection 0.0.3626892 "Chickens feb 2024" — alice
// (0.0.9556348) holds serial 35, carol (0.0.9846467) holds none. If the cast rotates
// (KAT-KBOTENV1) or alice's chicken moves, .4/.9 flip — re-pick a held token first.
//
//   node joingate-check.cjs
//   API=https://hapi2.hbar.live/live BACKEND_DIR=/home/hbarlive/live node joingate-check.cjs
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const API  = (process.env.API || "https://hapi2.hbar.live/live").replace(/\/+$/, "")
const BASE = (process.env.BASE || "https://lab22.kpay.uk").replace(/\/+$/, "")
const BACKEND_DIR = process.env.BACKEND_DIR || "/home/hbarlive/live"
const NFT = process.env.NFT || "0.0.3626892"
const HOLDER = process.env.HOLDER || "0.0.9556348"       // alice
const NONHOLDER = process.env.NONHOLDER || "0.0.9846467" // carol
const INSTANCE = "JOINGATE-01"
const log = (...a) => console.log(new Date().toISOString(), "[joingate]", ...a)

const RUN_ID = "joingate-" + Date.now().toString(36)
async function reportKflow(checkpoint, v, detail){
  const commit = await fetch(BASE + "/m/katomia/qa/results.php?days=1")
    .then(r => r.json()).then(j => j.commit || "").catch(() => "")
  await fetch(BASE + "/kflow", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [{ t: new Date().toISOString(), run: RUN_ID,
      seq: checkpoint === "test:start" ? 1 : 2, tier: "fe", checkpoint, v, commit, detail: { trigger: process.env.TRIGGER || "manual", ...detail } }] }) })
}

// cast key loader — same watches file + keyRef indirection prop-sign uses
function keyFor(acc){
  const raw = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, 'kbot/prop-sign.watches.json'), 'utf8'))
  const spec = (raw.accounts || {})[acc]
  if(!spec) return null
  let secret = spec.key
  if(!secret && spec.keyRef?.file && spec.keyRef?.name)
    for(const line of fs.readFileSync(spec.keyRef.file, 'utf8').split(/\r?\n/)){
      const i = line.indexOf('=')
      if(i > 0 && line.slice(0, i).trim() === spec.keyRef.name){ secret = line.slice(i + 1).trim(); break }
    }
  if(!secret) return null
  const hex = secret.replace(/^0x/, ''), seed = hex.length > 64 ? hex.slice(-64) : hex
  const priv = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seed, 'hex')]),
    format: 'der', type: 'pkcs8' })
  return { priv, pub: Buffer.from(crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).slice(-32)) }
}

async function raiseCommitment(playerToken, acc){
  const { proto } = require(path.join(BACKEND_DIR, 'node_modules/@hashgraph/proto'))
  const k = keyFor(acc)
  if(!k) throw new Error(`no key for ${acc} in cast watches`)
  const signedObj = { network: 'testnet', issuer: { accountId: acc },
    subject: { intentPublicKey: k.pub.toString('hex') },
    validity: { expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() } }
  const message = JSON.stringify(signedObj)
  const prefixed = Buffer.from('\x19Hedera Signed Message:\n' + message.length + message)
  const sig = crypto.sign(null, prefixed, k.priv)
  const sigMap = proto.SignatureMap.encode({ sigPair: [{ pubKeyPrefix: k.pub, ed25519: sig }] }).finish()
  for(let attempt = 0; attempt < 5; attempt++){
    if(attempt) await new Promise(r => setTimeout(r, 2000 * attempt))
    const res = await fetch(API + '/katomia/authenticate', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify({ envelope: { type: 'kpay.authEnvelope', network: 'testnet', accountId: acc,
        message, signatureMap: Buffer.from(sigMap).toString('base64'), challenge: signedObj } }) })
    if(res.status !== 403 && res.status !== 429) return res.status
  }
  return 429
}

;(async () => {
  await reportKflow("test:start", INSTANCE, { source: "auto", instance: INSTANCE })
  const t0 = Date.now()
  const fails = []
  let n = 0
  const t = (name, got, want) => { n++
    const ok = got === want
    log((ok ? "PASS" : "FAIL"), `T:JOINGATE-01.${n}`, name, "→", got)
    if(!ok) fails.push(`.${n} ${name} (got ${got}, want ${want})`) }

  // ── A) module layer: checkJoinRule straight against the live mirror
  try {
    const { checkJoinRule } = require(path.join(BACKEND_DIR, 'katomiaHelpers'))
    const g = (joinRule, network = 'testnet') => ({ id: 'qa-joingate', network, joinRule })
    t("open star admits anyone",            await checkJoinRule(g('*'), NONHOLDER), true)          // .1
    t("account entry: direct hit",          await checkJoinRule(g([HOLDER]), HOLDER), true)        // .2
    t("account entry: miss stays out",      await checkJoinRule(g([HOLDER]), NONHOLDER), false)    // .3
    t("token entry: holder passes",         await checkJoinRule(g([NFT]), HOLDER), true)           // .4
    t("token entry: non-holder fails",      await checkJoinRule(g([NFT]), NONHOLDER), false)       // .5
    t("mixed list: account OR token",       await checkJoinRule(g([NONHOLDER, NFT]), NONHOLDER), true) // .6
    t("raw CSV string == array form",       await checkJoinRule(g(`${NONHOLDER},${NFT}`), HOLDER), true) // .7
    t("playnet: token entry never matches", await checkJoinRule(g([NFT], 'playnet'), HOLDER), false) // .8
  } catch(e){ n = 8; fails.push(`.1-8 module layer unavailable: ${String(e.message).slice(0,120)}`) }

  // ── B) integration layer: real game, real commitments, /game eligibility
  try {
    const created = await fetch(API + '/katomia/create', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ network: 'testnet', visibility: 'unlisted', joinRule: [NFT],
        profile: { name: 'QA joingate ' + RUN_ID }, config: { idleAccountHours: 1 } }) }).then(r => r.json())
    if(!created.ok) throw new Error('create failed: ' + JSON.stringify(created).slice(0, 120))
    const gameId = created.gameId
    const holderTok = 'qa-joingate-' + RUN_ID + '-h', nonTok = 'qa-joingate-' + RUN_ID + '-n'
    const s1 = await raiseCommitment(holderTok, HOLDER)
    await new Promise(r => setTimeout(r, 800))
    const s2 = await raiseCommitment(nonTok, NONHOLDER)
    if(s1 !== 200 || s2 !== 200) throw new Error(`authenticate failed: holder ${s1}, nonholder ${s2}`)
    const elig = tok => fetch(API + '/katomia/game/' + gameId,
      { headers: tok ? { 'x-player-token': tok } : {} }).then(r => r.json()).then(j => !!j.eligible)
    t("live game: committed holder eligible",      await elig(holderTok), true)  // .9
    t("live game: committed non-holder ineligible", await elig(nonTok), false)   // .10
    t("live game: anonymous ineligible",            await elig(null), false)     // .11
  } catch(e){ fails.push(`.9-11 integration layer: ${String(e.message).slice(0,160)}`) }

  const ok = fails.length === 0
  const note = ok ? `all ${n} assertions green (NFT ${NFT}, holder ${HOLDER})` : `FAIL: ${fails.join('; ')}`
  log(note)
  await reportKflow("test:verdict", ok ? "pass" : "fail",
    { source: "auto", instance: INSTANCE, note: note.slice(0, 400), secs: Math.round((Date.now() - t0) / 1000) })
  log("verdict:", ok ? "pass" : "fail")
  process.exit(ok ? 0 : 1)
})()
