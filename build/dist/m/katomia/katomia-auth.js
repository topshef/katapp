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
// auto-settle agents) plugs in by producing { accountId, network, message, signatureMap, raw }
// without touching the challenge/envelope assembly.

function kauthDiag(event, data){ try { window.kdiag?.("auth:" + event, data) } catch {} }

// ── Ladder markers (WALLET-CONNECT-IA1, user 2026-08-17) — PARAMETERIZED: every
// surface that marks an account's ladder state reads these, so the symbols can be
// swapped app-wide in one place (a custom symbol may replace them in due course).
//   auth   ◆ U+25C6 BLACK DIAMOND — authenticated ("solid diamond is authenticate")
//   commit ◈ U+25C8 (dec 9672) WHITE DIAMOND CONTAINING BLACK SMALL DIAMOND — a
//          live commitment ("when it's got a dot in the middle, it's commitment" —
//          the dot reads as reputation/a target, and a commitment COUNTS as
//          authenticated too, so an account never shows both marks).
// Considered and parked (user, same session): ❖ U+2756 (dec 10070) BLACK DIAMOND
// MINUS WHITE X; ⬖ U+2B16 / ⬗ U+2B17 half-black diamonds (could mark in-between
// states in due course); 🔷 dropped — black & white is deliberate, it can't
// interact with any player's colour.
window.KAUTH_MARKS = window.KAUTH_MARKS || { auth: "◆", commit: "◈" }

// WCM-ZINDEX1 (2026-07-08): WalletConnect's ThemeUtil.setTheme() writes --wcm-z-index:"89"
// INLINE on <html> and re-applies it ASYNC through the modal lifecycle, clobbering our
// one-shot bump and dropping the WC modal UNDER our profile/signing modals (reported
// intermittently). Self-healing guard re-asserts our high value whenever WC lowers it.
// The kpool widget (modal.js) installs an identical guard for the signing modal / the
// standalone /future signer; both share window.__wcmZGuardInstalled so only one runs —
// this copy covers the profile + add-account connect flows, which never open that modal.
// Installed once at load (initKatomiaAuth). Only ever RAISES z-index → can't harm.
function kauthInstallWcmZGuard(){
  if(window.__wcmZGuardInstalled || typeof MutationObserver === "undefined") return
  window.__wcmZGuardInstalled = true
  const html = document.documentElement
  const Z = "2147483000"
  const assert = () => {
    if(html.style.getPropertyValue("--wcm-z-index") === Z) return
    const was = html.style.getPropertyValue("--wcm-z-index") || "(unset)"
    html.style.setProperty("--wcm-z-index", Z)
    html.style.setProperty("--w3m-z-index", Z)
    kauthDiag("wc-zindex-corrected", { was, to: Z })
  }
  assert()
  new MutationObserver(assert).observe(html, { attributes: true, attributeFilter: ["style"] })
}

// WC-NETSWITCH1 mitigation (2026-07-07): switching the WC connector to a game's network
// (mainnet default → testnet) rebuilds it and spawns a SECOND <wcm-modal> without
// disposing the first — two stacked modals, the dead one on top, so the pairing popup
// looked like it never opened (reported on the testnet profile connect). The real fix is
// in the KWC connector (kwcCore.js ensureNetwork disposes the old modal) but that needs a
// bundle rebuild+snapshot; until that ships, drop all but the newest modal here. Only acts
// when duplicates exist, so the single-modal (mainnet, no rebuild) path is untouched.
// Exposed on window so the add-account modal can reuse it.
window.kauthPruneWcModals = function kauthPruneWcModals(){
  try {
    const modals = document.querySelectorAll("wcm-modal")
    for(let i = 0; i < modals.length - 1; i++) modals[i].remove()
    if(modals.length > 1) kauthDiag("wc-modal-prune", { removed: modals.length - 1 })
  } catch(e){}
}

function kauthSetStatus(msg){ const el = document.getElementById("authStatus"); if(el) el.textContent = msg || "" }

// ── KATUI3 (user 2026-08-17): make network work VISIBLE ──────────────────────
// WalletConnect operations (ensureNetwork can rebuild the connector; connect,
// getAccounts, publish all hit the network) can stall for seconds on a bad
// connection — which the user experiences as "the modal freezes / takes ages to
// close" and reads as a crash. Every tracked operation lights the sticky
// #profileBusy pill (profile-modal.php); past 5s the label admits the connection
// is slow. window.kauthNetBusy lets the modal's close handler explain any work
// still running in the background. Counter-based: overlapping ops share one pill.
let _kauthBusyN = 0, _kauthBusySlowT = null
function kauthBusy(on, label){
  _kauthBusyN = Math.max(0, _kauthBusyN + (on ? 1 : -1))
  const el = document.getElementById("profileBusy")
  if(!el) return
  if(_kauthBusyN > 0){
    if(on) el.textContent = "⏳ " + (label || "Contacting the wallet network…")
    el.classList.remove("hidden")
    clearTimeout(_kauthBusySlowT)
    _kauthBusySlowT = setTimeout(() => {
      if(_kauthBusyN > 0) el.textContent = "🐢 Slow connection — still trying. Nothing has crashed."
    }, 5000)
  } else {
    clearTimeout(_kauthBusySlowT)
    _kauthBusySlowT = null
    el.classList.add("hidden")
  }
}
async function kauthTracked(label, fn){
  kauthBusy(true, label)
  // R3 (user 2026-08-17: "no visual cue showing up"): if fn starts with SYNCHRONOUS
  // heavy work (a WC connector rebuild does CPU-bound crypto), the pill's textContent
  // change above never gets a frame to paint before the thread blocks — the cue
  // exists but is invisible. Yield exactly one painted frame so the pill is on
  // screen before the work starts — a paint-ordering yield, not a delay. Skipped
  // when the tab is hidden (rAF doesn't fire there, and nothing needs painting).
  if(!document.hidden)
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
  try { return await fn() } finally { kauthBusy(false) }
}
window.kauthNetBusy = () => _kauthBusyN > 0

// Effective network for the binding flow. In a game the game's network wins (row
// hidden); outside one (index page — PROFILE-INDEX1) the modal's #authNetwork picker
// decides, defaulting to its first option (mainnet).
function kauthNetwork(){
  return gameMeta?.network || document.getElementById("authNetwork")?.value || ""
}

// ── WalletConnect adapter ────────────────────────────────────────────────────

// Connected accounts for the game's network. `ensure` scopes the connector to the
// network first (mirrors signer-walletconnect.js) — but that REBUILDS the shared WC
// connector when networks differ, so only the explicit Authenticate action ensures.
// A passive profile-open populate must not disturb the connector the tx signer shares:
// it just lists accounts, and only if the connector is already on the game's network.
async function kauthWCAccounts(network, ensure){
  if(!window.WC) return []
  return kauthTracked("Checking wallet accounts…", () => kauthWCAccountsInner(network, ensure))
}
async function kauthWCAccountsInner(network, ensure){
  if(ensure){
    try { if(window.WC.ensureNetwork) await window.WC.ensureNetwork(network) }
    catch(e){ kauthDiag("ensureNetwork-fail", { network, error: String(e) }) }
  } else {
    // Network scoping (IMPORTANT): getAccounts() returns accounts for the connector's
    // LIVE network, which can be stale after a switch (e.g. still mainnet after a mainnet
    // test) — so on a testnet game it would leak mainnet accounts. window.WC.getNetwork()
    // is NO help here: it returns the static CONFIG network, not the live one. But
    // ensureNetwork() with NO argument returns the live currentNetwork WITHOUT rebuilding
    // the connector. Only list if that matches the game's network; be conservative (bail)
    // when it doesn't or can't be determined, so wrong-network accounts never leak.
    try {
      const cur = await window.WC.ensureNetwork?.()
      if(network && cur !== network){ kauthDiag("network-scope-skip", { game: network, live: cur }); return [] }
    }
    catch(e){ kauthDiag("network-check-fail", { error: String(e) }); return [] }
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
  // the verifier's canonicalJson. WIREFRAME: shape is still moving (scope added; expiry now
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

// ── Local ladder records — per network+account (Q8.4, user-confirmed 2026-08-17) ──
// Replaces the single-slot katomiaLastCommitment (whose one record was exactly the
// bug the user hit: flip the dropdown to another account and the OLD account's
// commitment message stayed up). Keyed "<network>:<accountId>", each record
// { kind: "auth"|"commit", accountId, network, expiresAt, publishedAt }. Written at
// publish time; device-local; the backend binding stays authoritative. The legacy
// slot migrates in on first read and is then removed.
function kauthRecords(){
  try {
    const map = JSON.parse(localStorage.getItem("katomiaAuthRecords") || "null") || {}
    const legacy = JSON.parse(localStorage.getItem("katomiaLastCommitment") || "null")
    if(legacy?.accountId && legacy?.network){
      const k = legacy.network + ":" + legacy.accountId
      if(!map[k]){ map[k] = { kind: "commit", ...legacy }; localStorage.setItem("katomiaAuthRecords", JSON.stringify(map)) }
      localStorage.removeItem("katomiaLastCommitment")
    }
    return map
  } catch { return {} }
}
function kauthRecordSet(network, accountId, rec){
  try {
    const m = kauthRecords()
    m[network + ":" + accountId] = rec
    localStorage.setItem("katomiaAuthRecords", JSON.stringify(m))
  } catch {}
}
function kauthRecordFor(network, accountId){ return kauthRecords()[network + ":" + accountId] || null }
function kauthRecordLive(rec){
  if(!rec) return false
  if(!rec.expiresAt) return true
  try { return new Date(rec.expiresAt).getTime() > Date.now() } catch { return false }
}
// The mark an account wears in pickers ("" when it has no live record). A live
// commitment shows ONLY ◈ — it counts as authenticated, never both marks.
function kauthAccountMark(network, accountId){
  const rec = kauthRecordFor(network, accountId)
  if(!kauthRecordLive(rec)) return ""
  return rec.kind === "commit" ? window.KAUTH_MARKS.commit : window.KAUTH_MARKS.auth
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

// The commitment fold's internals (options grid + plain-English statement + Raise
// button state). Ladder-level concerns — the status line, the Authenticate button,
// the ⌨️/playnet explainer, hiding the fold for unsignable accounts — moved to
// kauthRenderLadder (WALLET-CONNECT-IA1); the disabled Raise here is belt-and-braces
// for the hidden-fold case. (⌨️ background, unchanged: a manually-added account has
// no wallet session to sign with; a future WhatsApp/KSIG/offline channel would
// re-enable per channel via the PROFILE-AUTH4 adapter seam.)
function updateAuthStatement(){
  const el   = document.getElementById("authStatement")
  const opts = document.getElementById("authOptions")
  const btn  = document.getElementById("authBtn")
  if(!el) return
  const account = kauthActiveAccount()
  const isWc = account && (!window.__kauthWcSet || window.__kauthWcSet.has(account))
  if(btn) btn.disabled = !isWc
  if(!isWc){ el.classList.add("hidden"); opts?.classList.add("hidden"); return }
  opts?.classList.remove("hidden")
  el.classList.remove("hidden")
  // Display copy only — the SIGNED challenge JSON is untouched (INTENT-RENAME1
  // keeps wire names for compat).
  el.textContent =
    `I control account ${account} and I authorise my intent key ${kauthShortKey(window.__kauthIntentKey)} ` +
    `to place and sign orders on my behalf. Scope: ${kauthScopeLabel()}; ${kauthExpiryLabel()}.`
}

// ── The ladder (WALLET-CONNECT-IA1 Mock A, user-approved 2026-08-17) ──────────
// One renderer owns the section's state so it can never disagree with itself:
// status line (#authRungStatus), the Authenticate button, the commitment fold's
// visibility, and — via updateAuthStatement — the fold's internals. Re-run on
// profile open, account change, network change and publish, which is the fix for
// "I flip to another account and it still shows the old commitment message":
// state is looked up per network+account (kauthRecordFor), never from a single slot.
function kauthRenderLadder(){
  const rung = document.getElementById("authRungStatus")
  const authBtn = document.getElementById("authAuthenticateBtn")
  const fold = document.getElementById("profileCommitSection")
  updateAuthStatement()
  if(!rung || !authBtn) return
  const account = kauthActiveAccount()
  const network = kauthNetwork()
  const isWc = account && (!window.__kauthWcSet || window.__kauthWcSet.has(account))

  if(!account){
    rung.textContent = ""
    authBtn.classList.add("hidden")
    fold?.classList.add("hidden")
    return
  }
  if(!isWc){
    // ⌨️ explainer replaces the whole ladder — no phantom Authenticate for an
    // account that cannot sign here (Q8.5: playnet gets the plain explainer).
    rung.style.color = "#555"
    rung.textContent = network === "playnet"
      ? `⌨️ ${account} is a playnet account — playnet has no wallets, so authentication doesn't apply here.`
      : `⌨️ ${account} was added without a wallet connection, so it can't sign here yet. Connect it via WalletConnect (➕ Add account) to authenticate.`
    authBtn.classList.add("hidden")
    fold?.classList.add("hidden")
    return
  }
  fold?.classList.remove("hidden")
  const M = window.KAUTH_MARKS
  const rec = kauthRecordFor(network, account)
  const live = kauthRecordLive(rec)
  rung.title = "Recorded on this device when you last signed — the backend stays authoritative."
  if(live && rec.kind === "commit"){
    rung.style.color = "#16a34a"
    const exp = rec.expiresAt ? " — valid until " + new Date(rec.expiresAt).toLocaleString() : ""
    rung.textContent = `${M.commit} Commitment live${exp}`
    rung.title = "A commitment counts as authenticated too. " + rung.title
    authBtn.classList.add("hidden")   // both rungs climbed — nothing to demand
  } else if(live){
    // Q8.3 (user 2026-08-17): a plain authentication's expiry stays SILENT — it is
    // Katomia's retention call and can change backend-side without UI churn.
    rung.style.color = "#16a34a"
    rung.textContent = `${M.auth} Authenticated — members-only access is open to this account.`
    authBtn.classList.add("hidden")
  } else if(rec){
    rung.style.color = "#b45309"
    rung.textContent = `⚠ ${rec.kind === "commit" ? "Commitment" : "Authentication"} expired — authenticate again.`
    authBtn.classList.remove("hidden")
  } else {
    rung.style.color = "#555"
    rung.textContent = "Not authenticated yet."
    authBtn.classList.remove("hidden")
  }
}

// ── Account picker — the ONE account list (KAT-ACCTNORM1, user 2026-08-05) ───
// Union of WC-connected accounts and this game's accounts I hold that AREN'T
// WC-connected (manually-added). Manual entries are tagged ⌨️; WC is the untagged
// default. In a game the list is inherently network-filtered (WC accounts are
// listed per-network, game accounts are the game's network); outside a game only
// WC accounts exist to list — manual accounts are per-game state and there's no
// game to read them from. The same union should eventually drive every account
// list in the app (board footer, order composer) — see KAT-ACCTNORM1.
function kauthGameAccounts(){
  return (typeof getAccounts === "function" && typeof isMyAccount === "function" && typeof currentPlayerId !== "undefined")
    ? getAccounts().filter(a => isMyAccount(a)) : []
}

function kauthRenderAccounts(accounts){
  const select = document.getElementById("authAccount")
  const remove = document.getElementById("authAccountRemove")
  if(!select) return

  const net = kauthNetwork()
  const wc = accounts || []
  window.__kauthWcSet = new Set(wc)
  const manual = [...new Set(kauthGameAccounts().map(a => a.label))].filter(id => !window.__kauthWcSet.has(id))
  const all = [...wc, ...manual]
  // ◆/◈ ladder mark per account (WALLET-CONNECT-IA1) — the dropdown shows at a
  // glance which accounts are authenticated (◆) or hold a live commitment (◈).
  const label = id => ((net && !/mainnet/.test(net)) ? `${net}:${id}` : id)
    + (window.__kauthWcSet.has(id) ? "" : " ⌨️")
    + (kauthAccountMark(net, id) ? " " + kauthAccountMark(net, id) : "")
  const active = kauthActiveAccount()

  let html = all.length
    ? all.map(a => `<option value="${a}"${a === active ? " selected" : ""}>${label(a)}</option>`).join("")
    : `<option value="" selected>— no accounts yet —</option>`
  html += `<option value="${KAUTH_ADD_NEW}">➕ Add account</option>`
  select.innerHTML = html

  const cur = kauthActiveAccount()
  if(cur) window.__kauthActive = cur
  if(remove) remove.classList.toggle("hidden", !cur)
  kauthRenderLadder()
}

// Dropdown change: "connect another" opens WC and re-lists; otherwise set active signer.
async function kauthOnAccountChange(){
  const select = document.getElementById("authAccount")
  const network = kauthNetwork()
  const val = select?.value || ""

  if(val === KAUTH_ADD_NEW){
    if(!window.WC){ notify?.("WalletConnect not loaded yet", "error", { timeout: 3000 }); kauthRenderAccounts(await kauthWCAccounts(network, false)); return }
    kauthSetStatus("Connecting wallet…")
    try {
      // WC's ThemeUtil.setTheme() sets --wcm-z-index:"89" inline on <html>, which would
      // render the WalletConnect modal UNDERNEATH the profile modal (invisible to the
      // user). Bump it just before connect — mirrors signer-walletconnect.js.
      document.documentElement.style.setProperty("--wcm-z-index", "2147483000")
      await kauthTracked("Connecting wallet…", async () => {
        if(window.WC.ensureNetwork) await window.WC.ensureNetwork(network)
        window.kauthPruneWcModals()   // drop the stale modal a network-switch rebuild left
        await window.WC.connect?.()
      })
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
    // manual (⌨️) accounts don't exist in the WC connector — don't poke it
    if(!window.__kauthWcSet || window.__kauthWcSet.has(val)){
      try { window.WC?.setActiveAccount?.(val) } catch(e){ kauthDiag("setActive-fail", { accountId: val, error: String(e) }) }
    }
  }
  const remove = document.getElementById("authAccountRemove")
  if(remove) remove.classList.toggle("hidden", !val || val === KAUTH_ADD_NEW)
  // per-account ladder state — THE fix for the stale "commitment live" message
  // lingering after flipping the dropdown to a different account (user 2026-08-17)
  kauthRenderLadder()
}

// ONE Remove for every account (KAT-ACCTNORM1, user 2026-08-05): "disconnect" is
// retired as a user-facing action — connecting never proved ownership (an account
// id can be spoofed; only the signed commitment proves control), so WC-connected
// and manual accounts get the same button. A WC account is disconnected from the
// wallet session AND removed from the current game in one step; a manual account
// just leaves the game. NERD-MODE OPTION, considered and parked (user 2026-08-05,
// no clear answer yet): keep the two actions SEPARATE in nerd mode — first press
// disconnects only, the row stays listed as a now-manual ⌨️ account, second press
// removes it from the game. Cleaner for debugging WC session issues; extra step
// for everyone else. To resurrect: gate the removeAccount() call below on
// !document.body.classList.contains("nerd") when the account was WC-connected,
// and let kauthRenderAccounts re-tag it ⌨️ on the re-render.
async function kauthRemoveAccount(){
  const account = kauthActiveAccount()
  const network = kauthNetwork()
  if(!account) return
  const isWc = !window.__kauthWcSet || window.__kauthWcSet.has(account)
  const gameAcct = kauthGameAccounts().find(a => a.label === account) || null
  const steps = [isWc && "disconnect its wallet session", gameAcct && "remove it from this game (its assets and offers clear from the board)"].filter(Boolean).join(" and ")
  if(!confirm(`Remove account ${account}?\n\nThis will ${steps}.`)) return
  kauthDiag("remove:click", { account, isWc, inGame: !!gameAcct })
  if(isWc){
    try {
      if(window.WC?.disconnectAccount) await window.WC.disconnectAccount(account)
      else if(window.WC?.disconnect) await window.WC.disconnect()
    } catch(e){ kauthDiag("disconnect:error", { account, error: String(e) }); notify?.("Disconnect failed", "error", { timeout: 3000 }) }
  }
  if(gameAcct && typeof removeAccount === "function"){
    removeAccount(gameAcct.id, { confirmed: true })
    // the game list updates on the next broadcast — re-render when it lands so the
    // row actually vanishes instead of lingering until the modal reopens
    if(typeof pollUntil === "function")
      pollUntil(() => !kauthGameAccounts().some(a => a.id == gameAcct.id),
        async () => kauthRenderAccounts(await kauthWCAccounts(network, false)), 200, 8000)
  }
  window.__kauthActive = null
  const accounts = await kauthWCAccounts(network, true)
  if(accounts.length) window.__kauthActive = accounts[0]
  kauthRenderAccounts(accounts)
}

// NO kauthRepairConnection() — the "Repair connection" button shipped by
// TXSTATUS-CONSOLIDATE1 S8 was REMOVED on 2026-08-08, the day after, at the
// user's instruction. Do not re-add it without re-reading WC-RESETWEDGE1.
// Verbatim: "it's basically saying to users, this is broken by default. By
// design, it's fucking broken." It was permanently visible with no signal that
// anything was actually wrong (a successful mainnet transaction on pat still
// had the menu offering to repair), it asked the user to destroy their session
// to work around our defect when Remove already covers the legitimate case, and
// it was built on WC.resetWalletLink() — which we then proved can wedge WC init
// permanently with no error. The recovery SEQUENCE is still valuable and is
// documented in WC-RESETWEDGE1: snapshot accounts (manual ⌨️ ones included, they
// are lost otherwise), remove, clear the link, re-pair, re-add. Its correct home
// is an automatic self-heal on a reset primitive that is proven safe, gated on
// nothing being in flight — not a button the user is asked to press.

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
  window.__lastAuthEnvelope = envelope
  if(out) out.textContent = JSON.stringify(envelope, null, 2)
  // PROFILE-TIDY1: the envelope + copy button live in a nerd-only collapsed <details>
  // now — unhide the wrapper; normal mode keeps just the status line.
  document.getElementById("authResultDetails")?.classList.remove("hidden")
}

// Populate the account picker when the profile modal opens, without forcing a connect.
// Also caches the intent (order) key so the live statement can name it.
async function katomiaAuthOnProfileOpen(){
  if(!document.getElementById("authBtn")) return

  // PROFILE-INDEX1: outside a game there's no gameMeta to inherit a network from —
  // show the network picker; inside a game it stays hidden and the game wins.
  // Likewise "This game only" scope makes no sense with no game to point at.
  const inGame = !!(gameMeta?.network)
  // MENU-NET1 (owner 2026-10-09): outside a game the network comes from ☰ on Home — the
  // picker row stays hidden and follows it; a one-line note says which network it is.
  window.katomiaNet?.paint()
  document.getElementById("authNetworkNote")?.classList.toggle("hidden", inGame)
  const gameScopeOpt = document.querySelector('#authScope option[value="game"]')
  if(gameScopeOpt) gameScopeOpt.hidden = !inGame && !gameId

  const network = kauthNetwork()
  try { window.__kauthIntentKey = await getKatomiaOrderPubkeyHex() }
  catch(e){ kauthDiag("intentkey-fail", { error: String(e) }) }
  // PROFILE-NETLIST1 (2026-07-08): ensure=true so the picker/game network is made LIVE
  // before listing — the connector holds only one network's accounts at a time, and the
  // old ensure=false path scope-skipped to [] ("no wallet connected") whenever the live
  // connector was on a DIFFERENT network than this profile's, even though the session
  // existed in storage (why signing still worked). ensureNetwork is a no-op when already
  // on `network`, so this only switches (cheap now, WC-SESSIONDISPOSE1) when it must.
  const accounts = await kauthWCAccounts(network, true)
  if(accounts.length && !window.__kauthActive) window.__kauthActive = accounts[0]
  kauthRenderAccounts(accounts)
  kauthRenderLadder()   // per network+account — re-evaluate per open
}

// ── Shared signing core (WALLET-CONNECT-IA1) ─────────────────────────────────
// One challenge→sign→snapshot→envelope[→publish] pipeline for all three consumers:
// profile Authenticate, profile Raise commitment, and the kam popup — they differ
// only in DEFAULTS (expiry/scope/publish) and display copy, and had drifted into
// three near-identical copies. `kind` ("auth" | "commit") tags the local record.
// Returns { envelope, published } or null on any user-visible failure (already
// notified + status cleared).
async function kauthSignPublish({ network, accountId, expiresAt, scope, publish, kind, status, diag }){
  const say = status || kauthSetStatus
  const dg = (ev, data) => kauthDiag((diag || "") + ev, data)
  // ensureNetwork can REBUILD the shared connector, so it's done here (on the
  // deliberate action) rather than on passive profile open.
  try { if(window.WC.ensureNetwork) await window.WC.ensureNetwork(network) }
  catch(e){ dg("ensureNetwork-fail", { network, error: String(e) }) }
  try { window.WC.setActiveAccount?.(accountId) } catch(e){ dg("setActive-fail", { accountId, error: String(e) }) }

  const intentPublicKey = window.__kauthIntentKey || await getKatomiaOrderPubkeyHex()
  if(!intentPublicKey){ say(""); notify?.("Intent key not ready", "error", { timeout: 3000 }); return null }

  const challenge = buildAuthChallenge({ network, intentPublicKey, accountId, expiresAt, scope })
  const message = JSON.stringify(challenge)
  dg("challenge", { accountId, network, kind, intentPublicKey, scope: challenge.scope, expiresAt: challenge.validity.expiresAt, id: challenge.id })

  say("Approve the signature in your wallet…")
  let signResult
  try { signResult = await kauthWCSign(accountId, message) }
  catch(e){ dg("sign-fail", { accountId, error: String(e) }); say(""); notify?.("Signing failed or was rejected", "error", { timeout: 4000 }); return null }

  const signedAccount = signResult?.accountId || accountId
  // Snapshot + signedKeys are observational (§4.2/§4.3) — log loudly on failure but
  // still emit the envelope so the signature is never lost.
  let snapshot = null, signedKeys = []
  try { snapshot = await buildAccountKeySnapshot(network, signedAccount) }
  catch(e){ dg("snapshot-fail", { accountId: signedAccount, network, error: String(e) }) }
  try { signedKeys = await kauthResolveSignedKeys(signResult?.signatureMap, snapshot?.keys || []) }
  catch(e){ dg("signedkeys-fail", { error: String(e) }) }

  const envelope = assembleAuthEnvelope({ challenge, message, signResult, snapshot, signedKeys })
  dg("envelope", { accountId: signedAccount, network, kind, signedKeys, scope: challenge.scope, keyStructure: snapshot?.keyStructure, threshold: snapshot?.threshold })

  let published = false
  if(publish){
    say("Publishing…")
    published = await publishKatomiaAuthEnvelope(envelope, { kind })
  }
  return { envelope, published, signedAccount }
}

// Plain AUTHENTICATE from the profile section (Mock A's headline button): the kam
// defaults — expiry is Katomia's retention call (silent, Q8.3), global scope,
// always published (an unpublished authentication has nothing else to do).
async function runKatomiaAuthenticate(){
  const btn = document.getElementById("authAuthenticateBtn")
  const network = kauthNetwork()
  if(!network){ notify?.("No network selected", "error", { timeout: 3000 }); return }
  if(!window.WC){ notify?.("WalletConnect not loaded yet — try again in a moment", "error", { timeout: 3000 }); return }
  const accountId = kauthActiveAccount()
  if(!accountId){ notify?.("Choose or connect an account first", "info", { timeout: 3500 }); return }
  if(window.__kauthWcSet && !window.__kauthWcSet.has(accountId)){
    notify?.("This account has no wallet connection — connect it (➕ Add account) to authenticate", "info", { timeout: 4000 })
    return
  }
  if(btn) btn.disabled = true
  try {
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    const r = await kauthSignPublish({ network, accountId, expiresAt, scope: { kind: "global" }, publish: true, kind: "auth" })
    if(r) kauthSetStatus(r.published ? "Authenticated ✓" : "Signed ✓ — publish failed (see console)")
  } finally {
    if(btn) btn.disabled = false
    kauthRenderLadder()
  }
}

// Raise a key-binding COMMITMENT (the fold's action): user-chosen expiry + scope,
// publish via the checkbox — same pipeline, "commit" record.
async function runKatomiaRaiseCommitment(){
  const btn = document.getElementById("authBtn")
  const network = kauthNetwork()
  if(!network){ notify?.("No network on this game", "error", { timeout: 3000 }); return }
  if(!window.WC){ notify?.("WalletConnect not loaded yet — try again in a moment", "error", { timeout: 3000 }); return }

  let accountId = kauthActiveAccount()
  if(!accountId){
    notify?.("Choose or connect an account first", "info", { timeout: 3500 })
    kauthRenderAccounts(await kauthWCAccounts(network, true))
    return
  }
  // belt-and-braces behind the greyed button: a ⌨️ manual account can't sign
  if(window.__kauthWcSet && !window.__kauthWcSet.has(accountId)){
    notify?.("This account has no wallet connection — connect it (➕ Add account) to commit", "info", { timeout: 4000 })
    return
  }

  if(btn) btn.disabled = true
  try {
    const wantPublish = document.getElementById("authPublish")?.checked
    const r = await kauthSignPublish({ network, accountId, expiresAt: kauthReadExpiry(), scope: kauthReadScope(),
      publish: wantPublish, kind: "commit" })
    if(!r) return
    kauthRenderEnvelope(r.envelope)
    kauthSetStatus(wantPublish
      ? (r.published ? "Committed & published ✓" : "Committed ✓ — publish failed (see console)")
      : "Committed ✓ — not published (copy below)")
  } finally {
    if(btn) btn.disabled = false
    kauthRenderLadder()
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
// Goes through the hapi.php proxy (hapi.php?action=authenticate -> /katomia/authenticate),
// which forwards headers — so the x-player-token header reaches the backend. That token
// is the same ephemeral WS player token; the backend uses it to authenticate the request.
// ABSOLUTE path (PROFILE-INDEX1 regression fix): the modal now opens on EVERY page, and
// the old game-page-relative "../hapi.php" resolved to /m/hapi.php (404) from the index —
// "Publish failed" with the request never reaching any backend. Same absolute-path
// convention as the games fetch (/m/katomia/hapi/games).
// v1 UX: publishing == making the binding public (privacy is hard-coded server-side).
// Called by kauthSignPublish for all three flows (opts.kind tags the local record
// "auth" | "commit"). Returns true on success. Takes an explicit envelope; falls
// back to the last.
async function publishKatomiaAuthEnvelope(envelope, opts){
  const env = envelope || window.__lastAuthEnvelope
  if(!env){ notify?.("Nothing to publish yet", "info", { timeout: 2000 }); return false }
  try {
    const res = await kauthTracked("Publishing…", () => fetch((window.KBASE||"") + "/hapi.php?action=authenticate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-player-token": getOrCreatePlayerToken() },
      body: JSON.stringify({ envelope: env })
    }))
    const text = await res.text()
    let json; try { json = JSON.parse(text) } catch {}
    if(!res.ok || !json?.ok){
      kauthDiag("publish", { ok: false, httpStatus: res.status, response: json || text })
      console.error("[auth] publish failed", { status: res.status, json, text })
      notify?.("Publish failed", "error", { timeout: 4000 })
      return false
    }
    kauthDiag("publish", { ok: true, network: json.network, accountId: json.accountId, authed: json.authed, weight: json.weight })
    // User 2026-08-03: say WHICH account was bound (a player can hold several), and
    // link the page that lets anyone inspect/re-verify the published binding.
    const boundAcct = json.accountId || envelope?.accountId || null
    const boundNet = json.network || null
    // BOARD-TOASTLINK1 (fixed 2026-08-04, user saw the raw markup in the message
    // stream): this used to glue an <a> into the message STRING. Both surfaces set
    // text with textContent on purpose — server-supplied ids must never be parsed
    // as markup — so the toast and the chat row both printed the tag literally.
    // The structured {link:{href,text}} option is what carries a link; it renders
    // as a real element in the toast and as a real anchor in the panel.
    notify?.(boundAcct
      ? `Binding published — ${boundAcct}${boundNet ? " on " + boundNet : ""}`
      : "Binding published", "success", {
        timeout: 6000,
        link: boundAcct ? {
          href: `${window.KBASE||""}/binding.php?network=${encodeURIComponent(boundNet || "")}&accountId=${encodeURIComponent(boundAcct)}`,
          text: "Inspect it"
        } : null
      })
    // KAT-PROFILE-COMMITSTATUS1 (feedback 64b17b22) → WALLET-CONNECT-IA1: remember
    // the published act locally so the profile shows current status per
    // network+account (Q8.4 map, not the old single slot). Local record only (no
    // backend revoke exists today) — the backend binding stays authoritative.
    try {
      const c = env.challenge || {}
      const acct = json.accountId || c.issuer?.accountId || null
      const net = json.network || c.network || null
      if(acct && net) kauthRecordSet(net, acct, {
        kind: opts?.kind || "commit",
        accountId: acct,
        network: net,
        expiresAt: c.validity?.expiresAt || null,
        publishedAt: new Date().toISOString()
      })
      kauthRenderLadder()
    } catch(_){}
    // GAME-JOINRULE1: pages can react to a fresh commitment (index refreshes the now-
    // larger games list; a gated game page retries its rejected join).
    try { window.onKatomiaBindingPublished?.() } catch(e){ console.error("[auth] publish hook failed", e) }
    return true
  } catch(e){
    console.error("[auth] publish request failed", e)
    kauthDiag("publish", { ok: false, error: String(e) })
    notify?.("Publish request failed", "error", { timeout: 4000 })
    return false
  }
}

// (kauthRenderCurrentCommitment — KAT-PROFILE-COMMITSTATUS1's single-slot status
// line, including its 2026-08-05 wrong-network special case — is REPLACED by
// kauthRenderLadder + the per network+account records above, which make both the
// wrong-network and the wrong-account staleness impossible by construction.)

function initKatomiaAuth(){
  kauthInstallWcmZGuard()   // document-level; install even if this page has no profile modal
  const btn = document.getElementById("authBtn")
  if(!btn) return
  btn.onclick = () => runKatomiaRaiseCommitment()
  const authBtn = document.getElementById("authAuthenticateBtn")
  if(authBtn) authBtn.onclick = () => runKatomiaAuthenticate()
  kauthRenderLadder()

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

  // Network picker (standalone/index use): switching networks SWITCHES the connector to
  // that network (ensure=true, PROFILE-NETLIST1) and lists its connected accounts —
  // otherwise picking testnet while the connector is on mainnet showed an empty list.
  const netSel = document.getElementById("authNetwork")
  if(netSel) netSel.onchange = async () => {
    window.__kauthActive = null
    kauthSetStatus("Switching network…")
    kauthRenderAccounts(await kauthWCAccounts(kauthNetwork(), true))
    kauthRenderLadder()   // per network+account
    kauthSetStatus("")
  }
}

window.addEventListener("load", initKatomiaAuth)

// ═══ ENTRY-AUTHMODAL1 — generic Authenticate modal (user brainstorm 2026-07-29) ═══
//
// A minimal, invoke-from-anywhere authentication surface: the profile section's
// account picker UX with NO binding options. Signs the same kpay.authChallenge wire
// shape (compat with the /authenticate store — an authentication IS stored as a
// binding, global scope) but with a fixed 30-day expiry Katomia chooses, and display
// copy that says "I control this account" rather than the trading-authorisation
// commitment. Rationale (user, 2026-07-29): login vs binding are both "sign a
// message" but the STATEMENT differs; plain auth carries no user-facing obligation,
// so no expiry/scope/publish controls. Discovery of "raise commitment" (reputation,
// gated markets) stays in the profile — the carrot path.
// Markup: authenticate-modal.php (included via profile-modal.php).

function kamDiag(event, data){ kauthDiag("modal:" + event, data) }

function kamNetworkVal(){
  return gameMeta?.network || document.getElementById("kamNetwork")?.value || "mainnet"
}

function kamActiveAccount(){
  const v = document.getElementById("kamAccount")?.value || ""
  if(v && v !== KAUTH_ADD_NEW) return v
  return (typeof window.__kamActive === "string") ? window.__kamActive : ""
}

function kamSetStatus(msg){ const el = document.getElementById("kamStatus"); if(el) el.textContent = msg || "" }

function kamUpdateStatement(){
  const el = document.getElementById("kamStatement")
  if(!el) return
  const account = kamActiveAccount()
  el.classList.toggle("hidden", !account)
  if(account) el.textContent = `I confirm that I control account ${account}. Signing links it to this browser's session so Katomia can recognise you.`
}

// Same picker pattern as kauthRenderAccounts, kam-scoped ids. Kept separate rather
// than parameterised — the two panels will diverge (statement, options) and the
// duplication is ~20 lines (rapid-iteration: no premature abstraction).
function kamRenderAccounts(accounts){
  const select = document.getElementById("kamAccount")
  const remove = document.getElementById("kamRemove")
  if(!select) return
  const net = kamNetworkVal()
  const label = id => ((net && !/mainnet/.test(net)) ? `${net}:${id}` : id)
    + (kauthAccountMark(net, id) ? " " + kauthAccountMark(net, id) : "")   // ◆/◈ ladder marks here too
  const active = kamActiveAccount()
  let html = accounts.length
    ? accounts.map(a => `<option value="${a}"${a === active ? " selected" : ""}>${label(a)}</option>`).join("")
    : `<option value="" selected>— no wallet connected —</option>`
  html += `<option value="${KAUTH_ADD_NEW}">➕ Add account</option>`
  select.innerHTML = html
  const cur = kamActiveAccount()
  if(cur) window.__kamActive = cur
  if(remove) remove.classList.toggle("hidden", !cur)
  kamUpdateStatement()
}

async function kamOnAccountChange(){
  const select = document.getElementById("kamAccount")
  const network = kamNetworkVal()
  const val = select?.value || ""
  if(val === KAUTH_ADD_NEW){
    if(!window.WC){ notify?.("WalletConnect not loaded yet", "error", { timeout: 3000 }); kamRenderAccounts([]); return }
    kamSetStatus("Connecting wallet…")
    try {
      document.documentElement.style.setProperty("--wcm-z-index", "2147483000")   // same clobber story as kauthOnAccountChange
      if(window.WC.ensureNetwork) await window.WC.ensureNetwork(network)
      window.kauthPruneWcModals()
      await window.WC.connect?.()
      kamDiag("connect:done", { network })
    } catch(e){ kamDiag("connect:error", { error: String(e) }); notify?.("Wallet connect failed", "error", { timeout: 4000 }) }
    kamSetStatus("")
    const accounts = await kauthWCAccounts(network, true)
    if(accounts.length) window.__kamActive = accounts[accounts.length - 1]
    kamRenderAccounts(accounts)
    return
  }
  if(val){
    window.__kamActive = val
    try { window.WC?.setActiveAccount?.(val) } catch(e){ kamDiag("setActive-fail", { accountId: val, error: String(e) }) }
  }
  document.getElementById("kamRemove")?.classList.toggle("hidden", !val || val === KAUTH_ADD_NEW)
  kamUpdateStatement()
}

// Same one-Remove semantics as kauthRemoveAccount (KAT-ACCTNORM1): disconnect
// the wallet session AND leave the game in one confirmed step. This list is
// WC-only (only a connected wallet can authenticate) so there's no manual branch.
async function kamRemoveAccount(){
  const account = kamActiveAccount()
  if(!account) return
  const gameAcct = kauthGameAccounts().find(a => a.label === account) || null
  const steps = ["disconnect its wallet session", gameAcct && "remove it from this game (its assets and offers clear from the board)"].filter(Boolean).join(" and ")
  if(!confirm(`Remove account ${account}?\n\nThis will ${steps}.`)) return
  try {
    if(window.WC?.disconnectAccount) await window.WC.disconnectAccount(account)
    else if(window.WC?.disconnect) await window.WC.disconnect()
  } catch(e){ kamDiag("disconnect:error", { account, error: String(e) }) }
  if(gameAcct && typeof removeAccount === "function") removeAccount(gameAcct.id, { confirmed: true })
  window.__kamActive = null
  const accounts = await kauthWCAccounts(kamNetworkVal(), true)
  if(accounts.length) window.__kamActive = accounts[0]
  kamRenderAccounts(accounts)
}

// The signing act — kauthSignPublish with the kam defaults (30-day expiry is
// Katomia's retention call, global scope, always published — an unpublished
// authentication would be pointless, there's nothing else to do with it).
async function kamAuthenticate(){
  const btn = document.getElementById("kamBtn")
  const network = kamNetworkVal()
  if(!window.WC){ notify?.("WalletConnect not loaded yet — try again in a moment", "error", { timeout: 3000 }); return }
  const accountId = kamActiveAccount()
  if(!accountId){ notify?.("Choose or connect an account first", "info", { timeout: 3500 }); kamRenderAccounts(await kauthWCAccounts(network, true)); return }

  if(btn) btn.disabled = true
  try {
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    const r = await kauthSignPublish({ network, accountId, expiresAt, scope: { kind: "global" },
      publish: true, kind: "auth", status: kamSetStatus, diag: "modal:" })
    if(!r) return
    kamSetStatus(r.published ? "Authenticated ✓" : "Signed ✓ — publish failed (see console)")
    kamDiag("done", { ok: r.published, accountId: r.signedAccount, network })
    if(r.published){
      const onDone = window.__kamOnDone
      setTimeout(() => { window.katomiaAuthenticateModal.close(); try { onDone?.() } catch(_){} }, 1200)
    }
  } finally {
    if(btn) btn.disabled = false
  }
}

// Is there a live published commitment/authentication from this browser — ANY
// network+account (WALLET-CONNECT-IA1: reads the records map; either kind counts,
// since a commitment includes authentication). Local records only — the backend
// stays authoritative. Consumer: the kam feedback-attribution offer.
function kauthHasLiveCommitment(){
  try { return Object.values(kauthRecords()).some(kauthRecordLive) } catch { return false }
}

window.katomiaAuthenticateModal = {
  // opts: { message?: string shown under the title, network?: preselect (no-game pages),
  //         onDone?: called after a successful authenticate+publish }
  async open(opts = {}){
    const modal = document.getElementById("kamModal")
    if(!modal) return
    const msg = document.getElementById("kamMessage")
    if(msg){ msg.textContent = opts.message || ""; msg.classList.toggle("hidden", !opts.message) }
    const inGame = !!(gameMeta?.network)
    // MENU-NET1: the picker follows ☰ on Home (row hidden, note shown) — a caller that names
    // a network (opts.network) still wins for this one open, and the note says so
    window.katomiaNet?.paint()
    document.getElementById("kamNetworkNote")?.classList.toggle("hidden", inGame)
    if(!inGame && opts.network){ const sel = document.getElementById("kamNetwork"); if(sel) sel.value = opts.network }
    const kamNote = document.querySelector('[data-network-note="kamNetwork"]')
    if(kamNote) kamNote.textContent = window.katomiaNet?.label(kamNetworkVal()) || kamNetworkVal()
    window.__kamOnDone = opts.onDone || null
    kamSetStatus("")
    modal.classList.remove("hidden")
    kamDiag("open", { inGame, network: kamNetworkVal() })
    try { window.__kauthIntentKey = window.__kauthIntentKey || await getKatomiaOrderPubkeyHex() } catch(_){}
    kamRenderAccounts(await kauthWCAccounts(kamNetworkVal(), true))
  },
  close(){ document.getElementById("kamModal")?.classList.add("hidden") },
  hasLiveCommitment: kauthHasLiveCommitment
}

function initKatomiaAuthModal(){
  const modal = document.getElementById("kamModal")
  if(!modal) return
  document.getElementById("kamClose").onclick = () => window.katomiaAuthenticateModal.close()
  modal.onclick = e => { if(e.target === modal) window.katomiaAuthenticateModal.close() }
  const btn = document.getElementById("kamBtn")
  if(btn) btn.onclick = () => kamAuthenticate()
  const select = document.getElementById("kamAccount")
  if(select) select.onchange = () => kamOnAccountChange()
  const remove = document.getElementById("kamRemove")
  if(remove) remove.onclick = () => kamRemoveAccount()
  const netSel = document.getElementById("kamNetwork")
  if(netSel) netSel.onchange = async () => {
    window.__kamActive = null
    kamSetStatus("Switching network…")
    kamRenderAccounts(await kauthWCAccounts(kamNetworkVal(), true))
    kamSetStatus("")
  }

  // ENTRY-AUTHMODAL1 hook: after a feedback send (kfw:sent, dispatched by
  // feedback-widget.js) with no live commitment, OFFER authentication so the
  // feedback can be attributed/grouped (tester groups — ENTRY-FEEDGROUPS1).
  // Purely optional: closing keeps the feedback anonymous. The 1.6s delay lets
  // the widget's own "✓ Thank you" toast register first. Retro-attribution works
  // because feedback is signed with the intent key at send time — a later binding
  // of that key covers it (FAQ point, user 2026-07-29).
  document.addEventListener("kfw:sent", e => {
    if(kauthHasLiveCommitment()) return
    kamDiag("kfw-sent:offer", { id: e.detail?.id || null })
    setTimeout(() => window.katomiaAuthenticateModal.open({
      message: "Thanks — your feedback is in. We don't know which account it came from yet: authenticate (one wallet signature) and your feedback counts toward your account and any groups it belongs to. Optional — close this and it simply stays anonymous."
    }), 1600)
  })
}

window.addEventListener("load", initKatomiaAuthModal)
