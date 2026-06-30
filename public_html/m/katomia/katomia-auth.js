// katomia-auth.js — Profile "Authenticate" panel (PROFILE-AUTH1)
//
// The wallet signs a kpay.authChallenge naming this session's intent (order) key,
// producing a self-contained kpay.authEnvelope (HIP-820 signatureMap + a mirror-node
// account-key snapshot). v1 is a STUB: the envelope is displayed and copied to the
// clipboard — nothing is sent anywhere. Spec: PROFILE-AUTH1-spec.md.
//
// ADAPTER SEAM (PROFILE-AUTH4): everything WalletConnect-specific lives in the
// kauthWC* helpers below. buildAuthChallenge / buildAccountKeySnapshot /
// assembleAuthEnvelope are channel-agnostic — a future channel (WhatsApp / KSIG /
// KEA) plugs in by producing { accountId, network, message, signatureMap, raw }
// without touching the challenge/envelope assembly.

function kauthDiag(event, data){ try { window.kdiag?.("auth:" + event, data) } catch {} }

function kauthSetStatus(msg){ const el = document.getElementById("authStatus"); if(el) el.textContent = msg || "" }

// ── WalletConnect adapter ────────────────────────────────────────────────────

// Connected accounts for the game's network. `ensure` scopes the connector to the
// network first (mirrors signer-walletconnect.js) — but that REBUILDS the shared WC
// connector when networks differ, so only the explicit Authenticate action ensures.
// A passive profile-open populate must not disturb the connector the tx signer shares:
// it just lists accounts, and only if the connector is already on the game's network.
async function kauthWCAccounts(network, ensure){
  if(!window.WC) return []
  if(ensure){
    try { if(window.WC.ensureNetwork) await window.WC.ensureNetwork(network) }
    catch(e){ kauthDiag("ensureNetwork-fail", { network, error: String(e) }) }
  } else {
    try { const cur = await window.WC.getNetwork?.(); if(network && cur && cur !== network) return [] }
    catch(e){ kauthDiag("getNetwork-fail", { error: String(e) }) }
  }
  try { return (await window.WC.getAccounts?.()) || [] }
  catch(e){ kauthDiag("getAccounts-fail", { error: String(e) }); return [] }
}

async function kauthWCSign(accountId, message){
  if(!window.WC?.authenticate) throw new Error("window.WC.authenticate unavailable")
  return window.WC.authenticate({ accountId, message })   // { accountId, network, message, signatureMap, raw }
}

// ── Challenge / envelope assembly (channel-agnostic) ─────────────────────────

function buildAuthChallenge({ network, intentPublicKey, accountId, expiresAt }){
  const now = new Date(), iso = now.toISOString()
  const exp = expiresAt || new Date(now.getTime() + 24 * 3600 * 1000).toISOString()   // +24h default
  // Field order IS the canonical order — message = JSON.stringify(challenge), matching
  // kea-utils canonicalJson. Do not reorder without versioning the challenge.
  return {
    type: "kpay.authChallenge",
    version: 1,
    network,
    subject: { role: "trader", intentPublicKey },
    issuer:  { role: "walletAccount", accountId },
    validity: { issuedAt: iso, notBefore: iso, expiresAt: exp },
    nonce: crypto.randomUUID(),
    id:    crypto.randomUUID()
  }
}

// ED25519 raw pubkey = 32 bytes (64 hex); ECDSA secp256k1 compressed = 33 bytes (66 hex).
function kauthInferKeyType(hex){ return String(hex).replace(/^0x/, "").length >= 66 ? "ECDSA_SECP256K1" : "ED25519" }

// getKeyInfo returns a hex string (single key) or { threshold, keys:[ string | nested ] }.
function kauthFlattenKeys(node, out = []){
  if(node == null) return out
  if(typeof node === "string"){ out.push(node); return out }
  for(const k of (node.keys || [])) kauthFlattenKeys(k, out)
  return out
}

// Account key structure resolved from the mirror node AT SIGN TIME (§4.2). Records how
// much the signature proves about control of the account. Reuses the kpay widget's
// existing mirror helper rather than adding a new fetch path.
async function buildAccountKeySnapshot(network, accountId){
  const { getKeyInfo } = await import("/vendor/kpay/kpool_widget/hedera-mirror.js")
  const info = await getKeyInfo(network, accountId)
  const snap = { resolvedAt: new Date().toISOString(), network, accountId, keyStructure: "single", threshold: null, keys: [], mirrorSource: `mirror:${network}` }
  if(typeof info === "string"){
    snap.keys = [{ pubkeyHex: info, type: kauthInferKeyType(info) }]
  } else {
    // hedera-mirror encodes keyList as { threshold: keys.length }; a true thresholdKey has
    // threshold < keys.length. That distinction is exactly the keyList vs thresholdKey split.
    snap.threshold = info?.threshold ?? null
    snap.keyStructure = (info?.threshold === info?.keys?.length) ? "keyList" : "thresholdKey"
    snap.keys = kauthFlattenKeys(info).map(h => ({ pubkeyHex: h, type: kauthInferKeyType(h) }))
  }
  return snap
}

// HIP-820 SignatureMap (base64 proto) → the pubKeyPrefix(es) that actually signed.
// SignatureMap { sigPair=1 (repeated) }, SignaturePair { pubKeyPrefix=1 }. Reuses the
// widget's exported wire-format primitives (scanFields/bytesToHex).
function kauthB64ToBytes(s){
  const norm = String(s).replace(/-/g, "+").replace(/_/g, "/")   // tolerate base64url
  const bin = atob(norm)
  const u = new Uint8Array(bin.length)
  for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

async function kauthSigMapPrefixes(signatureMap){
  if(!signatureMap || typeof signatureMap !== "string") return []
  const { scanFields, bytesToHex } = await import("/vendor/kpay/kpool_widget/protobuf.js")
  const pairs = scanFields(kauthB64ToBytes(signatureMap)).get(1) || []
  return pairs.map(p => { const pf = scanFields(p).get(1)?.[0]; return pf ? bytesToHex(pf) : null }).filter(Boolean)
}

// signedKeys = the WalletKey(s) reputation anchors on. Resolve each prefix to the full
// snapshot key it matches; fall back to the prefix itself (it may already be a full key).
async function kauthResolveSignedKeys(signatureMap, snapshotKeys){
  const prefixes = await kauthSigMapPrefixes(signatureMap)
  const fulls = (snapshotKeys || []).map(k => String(k.pubkeyHex).toLowerCase())
  return prefixes.map(p => fulls.find(f => f.startsWith(p.toLowerCase())) || p)
}

function assembleAuthEnvelope({ challenge, message, signResult, snapshot, signedKeys }){
  return {
    type: "kpay.authEnvelope",
    version: 1,
    challenge,
    message,
    signatureMap: signResult?.signatureMap ?? null,
    accountId: signResult?.accountId ?? null,
    network: signResult?.network ?? challenge.network,
    signedKeys: signedKeys || [],
    accountKeySnapshot: snapshot || null,
    raw: signResult?.raw ?? null
  }
}

// ── UI ───────────────────────────────────────────────────────────────────────

// Account choice is never hidden (§5): one account → shown named; >1 → explicit pick
// required before signing. Selection drives window.WC.setActiveAccount so the profile
// and the kpay tx signer share the same active account.
function kauthRenderAccounts(accounts){
  const row = document.getElementById("authAccountRow")
  const single = document.getElementById("authAccountSingle")
  const select = document.getElementById("authAccount")
  if(!row || !single || !select) return

  if(!accounts.length){ row.classList.add("hidden"); return }
  row.classList.remove("hidden")

  if(accounts.length === 1){
    single.textContent = accounts[0]
    single.classList.remove("hidden")
    select.classList.add("hidden")
    return
  }

  single.classList.add("hidden")
  select.classList.remove("hidden")
  const active = (typeof window.__kauthActive === "string") ? window.__kauthActive : ""
  select.innerHTML = `<option value="">— choose account —</option>` +
    accounts.map(a => `<option value="${a}"${a === active ? " selected" : ""}>${a}</option>`).join("")
}

function kauthReadExpiry(){
  // Nerd-mode expiry override lives in PROFILE-AUTH2. Until then: always +24h default.
  return null
}

function kauthRenderEnvelope(envelope){
  const out = document.getElementById("authOutput")
  const copy = document.getElementById("authCopyBtn")
  window.__lastAuthEnvelope = envelope
  if(out){ out.textContent = JSON.stringify(envelope, null, 2); out.classList.remove("hidden") }
  if(copy) copy.classList.remove("hidden")
}

// Populate the account row when the profile modal opens, without forcing a connect.
async function katomiaAuthOnProfileOpen(){
  if(!document.getElementById("authBtn")) return
  const network = gameMeta?.network || ""
  const accounts = await kauthWCAccounts(network, false)
  if(accounts.length === 1) window.__kauthActive = accounts[0]
  kauthRenderAccounts(accounts)
}

async function runKatomiaAuthenticate(){
  const btn = document.getElementById("authBtn")
  const network = gameMeta?.network || ""
  if(!network){ notify?.("No network on this game", "error", { timeout: 3000 }); return }
  if(!window.WC){ notify?.("WalletConnect not loaded yet — try again in a moment", "error", { timeout: 3000 }); return }

  if(btn) btn.disabled = true
  try {
    kauthSetStatus("Connecting wallet…")
    let accounts = await kauthWCAccounts(network, true)
    if(!accounts.length){
      try { await window.WC.connect?.() }
      catch(e){ kauthDiag("connect-fail", { error: String(e) }); kauthSetStatus(""); notify?.("Wallet connect failed", "error", { timeout: 4000 }); return }
      accounts = await kauthWCAccounts(network, true)
    }
    if(!accounts.length){ kauthSetStatus(""); notify?.("No wallet account connected", "error", { timeout: 4000 }); return }

    // Resolve which account signs — explicit when more than one (§5).
    let accountId
    if(accounts.length === 1){ accountId = accounts[0] }
    else {
      accountId = document.getElementById("authAccount")?.value || ""
      if(!accountId || !accounts.includes(accountId)){
        kauthRenderAccounts(accounts)
        kauthSetStatus("")
        notify?.("Choose which account to authenticate with", "info", { timeout: 3500 })
        return
      }
    }
    window.__kauthActive = accountId
    try { window.WC.setActiveAccount?.(accountId) } catch(e){ kauthDiag("setActive-fail", { accountId, error: String(e) }) }
    kauthRenderAccounts(accounts)

    const intentPublicKey = await getKatomiaOrderPubkeyHex()
    if(!intentPublicKey){ kauthSetStatus(""); notify?.("Intent key not ready", "error", { timeout: 3000 }); return }

    const challenge = buildAuthChallenge({ network, intentPublicKey, accountId, expiresAt: kauthReadExpiry() })
    const message = JSON.stringify(challenge)
    kauthDiag("challenge", { accountId, network, intentPublicKey, id: challenge.id })

    kauthSetStatus("Approve the signature in your wallet…")
    let signResult
    try { signResult = await kauthWCSign(accountId, message) }
    catch(e){ kauthDiag("sign-fail", { accountId, error: String(e) }); kauthSetStatus(""); notify?.("Signing failed or was rejected", "error", { timeout: 4000 }); return }

    const signedAccount = signResult?.accountId || accountId

    // Snapshot + signedKeys are observational (§4.2/§4.3) — log loudly on failure but
    // still emit the envelope so the signature is never lost.
    let snapshot = null, signedKeys = []
    try { snapshot = await buildAccountKeySnapshot(network, signedAccount) }
    catch(e){ kauthDiag("snapshot-fail", { accountId: signedAccount, network, error: String(e) }) }
    try { signedKeys = await kauthResolveSignedKeys(signResult?.signatureMap, snapshot?.keys || []) }
    catch(e){ kauthDiag("signedkeys-fail", { error: String(e) }) }

    const envelope = assembleAuthEnvelope({ challenge, message, signResult, snapshot, signedKeys })
    kauthRenderEnvelope(envelope)
    kauthSetStatus("Authenticated ✓ — envelope ready (nothing sent)")
    kauthDiag("envelope", { accountId: signedAccount, network, signedKeys, keyStructure: snapshot?.keyStructure, threshold: snapshot?.threshold })
  } finally {
    if(btn) btn.disabled = false
  }
}

async function copyKatomiaAuthEnvelope(){
  const env = window.__lastAuthEnvelope
  if(!env){ notify?.("Nothing to copy yet", "info", { timeout: 2000 }); return }
  const btn = document.getElementById("authCopyBtn")
  const original = btn?.textContent
  try {
    await navigator.clipboard.writeText(JSON.stringify(env, null, 2))
    if(btn) btn.textContent = "✓ copied"
    kauthDiag("copy", { ok: true })
  } catch(e){
    if(btn) btn.textContent = "see console"
    console.error("[auth] copy envelope failed", e)
    kauthDiag("copy", { ok: false, error: String(e) })
  }
  if(btn) setTimeout(() => { btn.textContent = original }, 1500)
}

function initKatomiaAuth(){
  const btn = document.getElementById("authBtn")
  if(!btn) return
  btn.onclick = () => runKatomiaAuthenticate()

  const copy = document.getElementById("authCopyBtn")
  if(copy) copy.onclick = () => copyKatomiaAuthEnvelope()

  const select = document.getElementById("authAccount")
  if(select) select.onchange = () => {
    window.__kauthActive = select.value || null
    if(select.value){ try { window.WC?.setActiveAccount?.(select.value) } catch(e){ kauthDiag("setActive-fail", { accountId: select.value, error: String(e) }) } }
  }
}

window.addEventListener("load", initKatomiaAuth)
