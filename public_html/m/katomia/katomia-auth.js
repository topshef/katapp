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

function buildAuthChallenge({ network, intentPublicKey, accountId, expiresAt, scope }){
  const now = new Date(), iso = now.toISOString()
  // expiresAt: an ISO string sets it; null means "no expiry"; undefined falls back to +24h.
  const exp = expiresAt === undefined ? new Date(now.getTime() + 24 * 3600 * 1000).toISOString() : expiresAt
  // Field order IS the canonical order — message = JSON.stringify(challenge), matching
  // kea-utils canonicalJson. WIREFRAME: shape is still moving (scope added; expiry now
  // UI-driven) and nothing verifies the signature yet, so version stays 1 — LOCK + bump
  // the version before any verifier ships, since reordering would break byte-for-byte checks.
  return {
    type: "kpay.authChallenge",
    version: 1,
    network,
    subject: { role: "trader", intentPublicKey },
    issuer:  { role: "walletAccount", accountId },
    scope:   scope ?? { kind: "global" },
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
const KAUTH_ADD_NEW = "__wc_add_account__"

// The real selected account (ignores the "connect another" sentinel / placeholder).
function kauthActiveAccount(){
  const sel = document.getElementById("authAccount")
  const v = sel?.value || ""
  if(v && v !== KAUTH_ADD_NEW) return v
  return (typeof window.__kauthActive === "string") ? window.__kauthActive : ""
}

// ── Commitment option readers ────────────────────────────────────────────────

function kauthReadScope(){
  const kind = document.getElementById("authScope")?.value || "global"
  if(kind === "game"){
    const gid = (typeof gameId !== "undefined" && gameId) || gameMeta?.id || null
    return { kind: "game", gameId: gid }
  }
  return { kind: "global" }
}

// ── Plain-English statement of what the user is committing to ────────────────

function kauthShortKey(hex){
  const s = String(hex || "").replace(/^0x/, "")
  return s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-6)}` : (s || "(intent key)")
}

function kauthExpiryLabel(){
  const sel = document.getElementById("authExpiry")
  if(!sel) return "expires in 24 hours"
  if(sel.value === "") return "never expires"
  const opt = sel.options[sel.selectedIndex]?.textContent?.toLowerCase() || "24 hours"
  const when = new Date(Date.now() + Number(sel.value)).toISOString().slice(0, 10)
  return `expires in ${opt} (${when})`
}

function kauthScopeLabel(){
  const scope = kauthReadScope()
  return scope.kind === "game" ? `this game only (${scope.gameId || "?"})` : "all games (global)"
}

function updateAuthStatement(){
  const el   = document.getElementById("authStatement")
  const opts = document.getElementById("authOptions")
  if(!el) return
  const account = kauthActiveAccount()
  if(!account){ el.classList.add("hidden"); opts?.classList.add("hidden"); return }
  opts?.classList.remove("hidden")
  el.classList.remove("hidden")
  // Statement wording will vary once we branch binding vs. plain authenticate (nerd
  // mode). For now it reflects the key-binding intent.
  el.textContent =
    `I control account ${account} and I authorise my order key ${kauthShortKey(window.__kauthIntentKey)} ` +
    `to place and sign orders on my behalf. Scope: ${kauthScopeLabel()}; ${kauthExpiryLabel()}.`
}

// ── Account picker (WalletConnect-connected accounts) ────────────────────────
// Mirrors the tx-signer picklist: all connected accounts + a "connect another"
// sentinel + a ✕ to disconnect the selected one (window.WC.disconnectAccount, WC-PICKDEL1).
// These are WC-connected wallet accounts because only a connected wallet can sign the
// challenge — distinct from the orders modal's list of game accounts, but the same UX.
function kauthRenderAccounts(accounts){
  const select = document.getElementById("authAccount")
  const remove = document.getElementById("authAccountRemove")
  if(!select) return

  const net = gameMeta?.network || ""
  const label = id => (net && !/mainnet/.test(net)) ? `${net}:${id}` : id
  const active = kauthActiveAccount()

  let html = accounts.length
    ? accounts.map(a => `<option value="${a}"${a === active ? " selected" : ""}>${label(a)}</option>`).join("")
    : `<option value="" selected>— no wallet connected —</option>`
  html += `<option value="${KAUTH_ADD_NEW}">➕ Connect another account…</option>`
  select.innerHTML = html

  const cur = kauthActiveAccount()
  if(cur) window.__kauthActive = cur
  if(remove) remove.classList.toggle("hidden", !cur)
  updateAuthStatement()
}

// Dropdown change: "connect another" opens WC and re-lists; otherwise set active signer.
async function kauthOnAccountChange(){
  const select = document.getElementById("authAccount")
  const network = gameMeta?.network || ""
  const val = select?.value || ""

  if(val === KAUTH_ADD_NEW){
    if(!window.WC){ notify?.("WalletConnect not loaded yet", "error", { timeout: 3000 }); kauthRenderAccounts(await kauthWCAccounts(network, false)); return }
    kauthSetStatus("Connecting wallet…")
    try {
      if(window.WC.ensureNetwork) await window.WC.ensureNetwork(network)
      await window.WC.connect?.()
      kauthDiag("connect:add:done", { network })
    } catch(e){
      kauthDiag("connect:add:error", { error: String(e) })
      notify?.("Wallet connect failed", "error", { timeout: 4000 })
    }
    kauthSetStatus("")
    const accounts = await kauthWCAccounts(network, true)
    if(accounts.length) window.__kauthActive = accounts[accounts.length - 1]   // newest wins
    kauthRenderAccounts(accounts)
    return
  }

  if(val){
    window.__kauthActive = val
    try { window.WC?.setActiveAccount?.(val) } catch(e){ kauthDiag("setActive-fail", { accountId: val, error: String(e) }) }
  }
  const remove = document.getElementById("authAccountRemove")
  if(remove) remove.classList.toggle("hidden", !val || val === KAUTH_ADD_NEW)
  updateAuthStatement()
}

// ✕ disconnects the selected account, keeping the others (falls back to disconnect-all).
async function kauthRemoveAccount(){
  const account = kauthActiveAccount()
  const network = gameMeta?.network || ""
  if(!account) return
  kauthDiag("disconnect:click", { account })
  try {
    if(window.WC?.disconnectAccount) await window.WC.disconnectAccount(account)
    else if(window.WC?.disconnect) await window.WC.disconnect()
  } catch(e){ kauthDiag("disconnect:error", { account, error: String(e) }); notify?.("Disconnect failed", "error", { timeout: 3000 }) }
  window.__kauthActive = null
  const accounts = await kauthWCAccounts(network, true)
  if(accounts.length) window.__kauthActive = accounts[0]
  kauthRenderAccounts(accounts)
}

// Reads the expiry dropdown: "" (No expiry) -> null; a ms offset -> ISO string;
// no control -> undefined so buildAuthChallenge falls back to its +24h default.
function kauthReadExpiry(){
  const sel = document.getElementById("authExpiry")
  if(!sel) return undefined
  if(sel.value === "") return null
  return new Date(Date.now() + Number(sel.value)).toISOString()
}

function kauthRenderEnvelope(envelope){
  const out = document.getElementById("authOutput")
  const copy = document.getElementById("authCopyBtn")
  window.__lastAuthEnvelope = envelope
  if(out){ out.textContent = JSON.stringify(envelope, null, 2); out.classList.remove("hidden") }
  if(copy) copy.classList.remove("hidden")
}

// Populate the account picker when the profile modal opens, without forcing a connect.
// Also caches the intent (order) key so the live statement can name it.
async function katomiaAuthOnProfileOpen(){
  if(!document.getElementById("authBtn")) return
  const network = gameMeta?.network || ""
  try { window.__kauthIntentKey = await getKatomiaOrderPubkeyHex() }
  catch(e){ kauthDiag("intentkey-fail", { error: String(e) }) }
  const accounts = await kauthWCAccounts(network, false)
  if(accounts.length && !window.__kauthActive) window.__kauthActive = accounts[0]
  kauthRenderAccounts(accounts)
}

// Raise a key-binding commitment: sign the challenge (naming the intent key, with the
// chosen expiry + scope) and, if the Publish checkbox is ticked, POST it in one action.
// The account is chosen up front in the picker — no connect-then-guess here.
async function runKatomiaRaiseCommitment(){
  const btn = document.getElementById("authBtn")
  const network = gameMeta?.network || ""
  if(!network){ notify?.("No network on this game", "error", { timeout: 3000 }); return }
  if(!window.WC){ notify?.("WalletConnect not loaded yet — try again in a moment", "error", { timeout: 3000 }); return }

  let accountId = kauthActiveAccount()
  if(!accountId){
    notify?.("Choose or connect an account first", "info", { timeout: 3500 })
    kauthRenderAccounts(await kauthWCAccounts(network, true))
    return
  }

  if(btn) btn.disabled = true
  try {
    // ensureNetwork can REBUILD the shared connector, so it's done here (on the deliberate
    // action) rather than on passive profile open.
    try { if(window.WC.ensureNetwork) await window.WC.ensureNetwork(network) }
    catch(e){ kauthDiag("ensureNetwork-fail", { network, error: String(e) }) }
    try { window.WC.setActiveAccount?.(accountId) } catch(e){ kauthDiag("setActive-fail", { accountId, error: String(e) }) }

    const intentPublicKey = window.__kauthIntentKey || await getKatomiaOrderPubkeyHex()
    if(!intentPublicKey){ kauthSetStatus(""); notify?.("Intent key not ready", "error", { timeout: 3000 }); return }

    const challenge = buildAuthChallenge({ network, intentPublicKey, accountId, expiresAt: kauthReadExpiry(), scope: kauthReadScope() })
    const message = JSON.stringify(challenge)
    kauthDiag("challenge", { accountId, network, intentPublicKey, scope: challenge.scope, expiresAt: challenge.validity.expiresAt, id: challenge.id })

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
    kauthDiag("envelope", { accountId: signedAccount, network, signedKeys, scope: challenge.scope, keyStructure: snapshot?.keyStructure, threshold: snapshot?.threshold })

    // Publish is folded into this one action via the checkbox (no separate button).
    if(document.getElementById("authPublish")?.checked){
      kauthSetStatus("Publishing binding…")
      const ok = await publishKatomiaAuthEnvelope(envelope)
      kauthSetStatus(ok ? "Commitment raised & published ✓" : "Raised ✓ — publish failed (see console)")
    } else {
      kauthSetStatus("Commitment raised ✓ — not published (copy below)")
    }
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

// PROFILE-AUTH3: POST the envelope to the Katomia backend to be stored.
// Goes through the hapi.php proxy (../hapi.php?action=authenticate -> /katomia/authenticate),
// which forwards headers — so the x-player-token header reaches the backend. That token
// is the same ephemeral WS player token; the backend uses it to authenticate the request.
// v1 UX: publishing == making the binding public (privacy is hard-coded server-side).
// Called by the single "Raise commitment" action when Publish is ticked (no separate
// button). Returns true on success. Takes an explicit envelope; falls back to the last.
async function publishKatomiaAuthEnvelope(envelope){
  const env = envelope || window.__lastAuthEnvelope
  if(!env){ notify?.("Nothing to publish yet", "info", { timeout: 2000 }); return false }
  try {
    const res = await fetch("../hapi.php?action=authenticate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-player-token": getOrCreatePlayerToken() },
      body: JSON.stringify({ envelope: env })
    })
    const text = await res.text()
    let json; try { json = JSON.parse(text) } catch {}
    if(!res.ok || !json?.ok){
      kauthDiag("publish", { ok: false, httpStatus: res.status, response: json || text })
      console.error("[auth] publish failed", { status: res.status, json, text })
      notify?.("Publish failed", "error", { timeout: 4000 })
      return false
    }
    kauthDiag("publish", { ok: true, network: json.network, accountId: json.accountId, authed: json.authed, weight: json.weight })
    notify?.("Binding published", "success", { timeout: 2500 })
    return true
  } catch(e){
    console.error("[auth] publish request failed", e)
    kauthDiag("publish", { ok: false, error: String(e) })
    notify?.("Publish request failed", "error", { timeout: 4000 })
    return false
  }
}

function initKatomiaAuth(){
  const btn = document.getElementById("authBtn")
  if(!btn) return
  btn.onclick = () => runKatomiaRaiseCommitment()

  const copy = document.getElementById("authCopyBtn")
  if(copy) copy.onclick = () => copyKatomiaAuthEnvelope()

  const select = document.getElementById("authAccount")
  if(select) select.onchange = () => kauthOnAccountChange()

  const remove = document.getElementById("authAccountRemove")
  if(remove) remove.onclick = () => kauthRemoveAccount()

  // Re-render the live commitment statement when an option changes.
  for(const id of ["authExpiry", "authScope"]){
    const el = document.getElementById(id)
    if(el) el.onchange = () => updateAuthStatement()
  }
}

window.addEventListener("load", initKatomiaAuth)
