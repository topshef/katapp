const NERD_KEY = "katomia.nerd.v1"

function loadNerdMode(){
  applyNerdMode(localStorage.getItem(NERD_KEY) === "1")
}

function applyNerdMode(on){
  document.body.classList.toggle("nerd", on)
  // Keep every nerd toggle in sync (profile panel + main header + any future ones).
  document.querySelectorAll(".nerd-toggle-input").forEach(t => { t.checked = on })
  try{ localStorage.setItem(NERD_KEY, on ? "1" : "0") }catch{}
}

function initKatomiaProfile(){
  const modal = document.getElementById("profileModal")
  const close = document.getElementById("profileModalClose")
  const copyBtn = document.getElementById("profileCopyLinkBtn")

  if(!modal) return

  // Open triggers: the shared header's menu item ([data-menu-profile]) on every page,
  // plus the legacy floating #profileBtn wherever it still exists.
  document.querySelectorAll("#profileBtn, [data-menu-profile]").forEach(el =>
    el.addEventListener("click", () => openKatomiaProfile())
  )

  // AUTH-LANG1: the menu's 🤖 Execution agent item is a second door to the SAME
  // modal, landed on the KEA section (expanded + scrolled). One home, two doors —
  // when KEA graduates to its own page/app this handler just repoints.
  document.querySelectorAll("[data-menu-kea]").forEach(el =>
    el.addEventListener("click", async () => {
      await openKatomiaProfile()
      const kea = document.getElementById("profileKeaSection")
      if(!kea) return
      kea.open = true
      kea.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  )

  close.onclick = () => modal.classList.add("hidden")
  modal.onclick = e => {
    if(e.target === modal) modal.classList.add("hidden")
  }

  if(copyBtn)
    copyBtn.onclick = () => copyKatomiaProfileLink()

  // KAT-BUILDSTAMP1: show which bundle this browser is actually running. Deploys flip a
  // blue/green symlink, so without this the only way to answer "did my push land, and am I
  // looking at it or a cached slot?" was curling build-info.json from a terminal. Reads the
  // very file the deploy writes, so it cannot drift from what shipped. Cache-busted because
  // the whole point is to catch a stale slot.
  const buildStamp = document.getElementById("profileBuildStamp")
  if(buildStamp)
    fetch(`${window.KBASE ?? ""}/build-info.json?_=${Date.now()}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(b => {
        const built = (b.built || "").replace("T", " ").replace("Z", " UTC")
        buildStamp.textContent = `build ${b.source_sha || "?"} · kwc ${b.kwc_snapshot || "?"} · ${built}`
        buildStamp.title = JSON.stringify(b, null, 1)
      })
      .catch(() => {
        // No build-info.json means this is not a deployed bundle (swap.kpay.live, a lab
        // seat, a dev checkout). Saying so beats a blank line or a misleading dash.
        buildStamp.textContent = "build: unbundled (dev / lab)"
      })

  // Copy local diagnostics (the window.kdiag ring buffer) — moved here from the kpool
  // widget modal (DIAG-MOVE1) so all diagnostics controls live together in the profile.
  const copyDiagBtn = document.getElementById("profileCopyDiagBtn")
  if(copyDiagBtn)
    copyDiagBtn.onclick = async () => {
      const original = copyDiagBtn.textContent
      try{
        window.kdiag?.dom?.(modal, "profile-modal")   // snapshot the modal so UI issues survive in the copy
        await (window.kdiag?.copy?.() ?? Promise.reject(new Error("kdiag.copy unavailable")))
        copyDiagBtn.textContent = "✓ copied"
        katomiaDiagSend?.("diag:copy-local", { ok: true })
      }catch(err){
        copyDiagBtn.textContent = "see console"
        console.error("[diag] copy local failed", err)
        katomiaDiagSend?.("diag:copy-local", { ok: false, error: String(err) })
      }
      setTimeout(() => { copyDiagBtn.textContent = original }, 1500)
    }

  document.querySelectorAll(".nerd-toggle-input").forEach(t =>
    t.onchange = () => applyNerdMode(t.checked)
  )

  // ENTRY-AUTOADD1: absent key = ON (the tested-with-alpha default); only an
  // explicit "0" disables. Consumed by maybeAutoAddAccounts (katomia-network.js).
  const autoAdd = document.getElementById("kprefAutoAdd")
  if(autoAdd){
    autoAdd.checked = localStorage.getItem("katomiaAutoAdd") !== "0"
    autoAdd.onchange = () => { try { localStorage.setItem("katomiaAutoAdd", autoAdd.checked ? "1" : "0") } catch {} }
  }

  // ORDER-AUTOSIGN1: same absent-key-means-ON pattern
  const autoSign = document.getElementById("kprefAutoSignReq")
  if(autoSign){
    autoSign.checked = localStorage.getItem("katomiaAutoSignReq") !== "0"
    autoSign.onchange = () => { try { localStorage.setItem("katomiaAutoSignReq", autoSign.checked ? "1" : "0") } catch {} }
  }

  loadNerdMode()
}

async function openKatomiaProfile(){
  const modal = document.getElementById("profileModal")
  if(!modal) return

  modal.classList.remove("hidden")

  // BOARD-UISIZE1 (moved here 2026-08-06): the display-size preference lives in
  // this modal now. On the board, boardSyncPrefsUI owns the same control (it
  // re-renders chips on change); everywhere else — home, circles, learn — this
  // is the only wiring, so the preference is settable off a board too. Guarded
  // so it never double-binds: the board's handler, when present, wins because
  // it also drives render().
  const uiSize = document.getElementById("boardPrefUiSize")
  if(uiSize && typeof boardSyncPrefsUI !== "function"){
    const cur = (() => { try { return localStorage.getItem("katomiaUiSize") } catch { return null } })()
    uiSize.value = ["small", "normal", "large"].includes(cur) ? cur : "normal"
    uiSize.onchange = () => {
      const v = ["small", "large"].includes(uiSize.value) ? uiSize.value : "normal"
      try { localStorage.setItem("katomiaUiSize", v) } catch {}
      const html = document.documentElement
      html.classList.remove("ksize-small", "ksize-normal", "ksize-large")
      html.classList.add("ksize-" + v)
      katomiaDiagSend?.("pref:uiSize", { value: v })
    }
  }

  const diagToggle = document.getElementById("kdiagRemoteToggle")
  if(diagToggle){
    // Reflect the EFFECTIVE remote-logging state, not the raw key. While DIAG_DEFAULT_ON
    // is true (rapid-iteration) the key is ABSENT on a fresh/incognito load yet logging IS
    // on — a raw `=== "1"` check showed the box unchecked while it was actually logging.
    // Use the same predicate the sender uses (katomiaDiagRemoteOn) so the box can't lie.
    diagToggle.checked = (typeof katomiaDiagRemoteOn === "function")
      ? katomiaDiagRemoteOn()
      : localStorage.getItem("kdiag_remote") === "1"
    diagToggle.onchange = () => {
      const on = diagToggle.checked
      window.kdiag?.setRemote(on)   // drive the widget buffer's remote flush on/off
      // Persist an EXPLICIT 0/1. window.kdiag.setRemote(false) does removeItem, and with
      // DIAG_DEFAULT_ON=true an absent key falls back to ON — so unchecking would NOT
      // actually disable. Re-assert the explicit value here so the toggle is authoritative.
      try { localStorage.setItem("kdiag_remote", on ? "1" : "0") } catch {}
      katomiaDiagSend?.("diag:remote-toggle", { on })
    }
  }

  await renderKatomiaProfile()
}

async function renderKatomiaProfile(){
  const pubkey = await getKatomiaOrderPubkeyHex()
  const domain = getKatomiaKpoolDomain()
  const network = gameMeta?.network || ""
  const gid = gameId || gameMeta?.id || ""

  setText("profileTitle", getKatomiaProfileTitle())
  setText("profilePubkey", pubkey || "not ready")
  setText("profileScope", [domain, network, gid].filter(Boolean).join(" | "))

  renderKatomiaAvatar(pubkey)

  renderKatomiaKvac()   // public prepaid-access handle (nerd only, stubbed)

  const link = buildKatomiaProfileLink(pubkey)
  setProfileLink(link)

  await renderKatomiaQr(link)

  // PROFILE-AUTH1: populate the Authenticate account row (no forced connect).
  if(typeof katomiaAuthOnProfileOpen === "function")
    katomiaAuthOnProfileOpen().catch(e => console.error("[auth] account refresh failed", e))
}

// KVAC / KSAT (prepaid fee model — see kpay.uk/kvac). HKSAT = SHA256(player token) is the
// PUBLIC handle; the player token (KSAT) itself stays private in localStorage. This is the
// same ephemeral token already used on the WebSocket and now as the x-player-token API auth.
// STUB: we display the handle only. Balance lookup + top-up (deposit to a Hedera account
// with HKSAT in the memo, backend credits the HKSAT balance) are FEE1 — not wired yet.
// Consider salting/derivation before this is anything more than a display experiment.
async function renderKatomiaKvac(){
  const el = document.getElementById("profileKvac")
  if(!el) return
  try {
    const token = getOrCreatePlayerToken()
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
    el.textContent = "0x" + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("")
    // STUB: fetch balance by HKSAT here later, e.g. GET /katomia/kvac/:hksat/balance.
  } catch(e){ el.textContent = "unavailable" }
}

function renderKatomiaAvatar(pubkeyHex){
  const box = document.getElementById("profileAvatar")
  if(!box || typeof kemojiEl !== "function") return
  box.innerHTML = ""
  box.appendChild(kemojiEl(pubkeyHex || "unknown", { size: 80, shape: "square", isSelf: true }))
}

async function getKatomiaOrderPubkeyHex(){
  const { publicKeyJwk } = await getOrCreatePlayerKeypair()
  return jwkXToHex(publicKeyJwk.x)
}

function jwkXToHex(x){
  const b64 = x.replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  return [...raw].map(ch => ch.charCodeAt(0).toString(16).padStart(2, "0")).join("")
}

// ── CIRCLE-HOSTPAGE1 R2: "am I the host of this circle?" ────────────────────────────
// Shared because three surfaces now ask it: the circles index (ownership cue), the
// in-game hamburger (whether to offer Host options at all), and the host page itself.
//
// READS the key, never MINTS one — deliberately not getOrCreatePlayerKeypair(). These are
// all read-only "should I show this" checks, and a browser with no key owns nothing, so
// the honest answer is already "no". Minting on a passive page view would create identity
// as a side effect of looking at a list. Signing paths still use the minting helper.
function katomiaMyIntentKeyHex(){
  try{
    const kp = JSON.parse(localStorage.getItem("katomiaPlayerKeypair") || "{}")
    return kp.publicKeyJwk?.x ? jwkXToHex(kp.publicKeyJwk.x).toLowerCase() : ""
  }catch{ return "" }
}

// `game` may be a full game object (adminAccount) or a WS meta (admin.value) — the board
// only ever has the latter, and it is the only form available for a PRIVATE circle.
// A circle with no admin is owned by nobody, so it is never "mine": that is what makes
// house circles fall out for free without a special case.
function katomiaIsHostOf(game, myKeyHex){
  const admin = String(game?.adminAccount ?? game?.admin?.value ?? "").trim().toLowerCase()
  const mine = String(myKeyHex ?? katomiaMyIntentKeyHex()).trim().toLowerCase()
  return !!admin && !!mine && admin === mine
}

function getKatomiaKpoolDomain(){
  if(window.CONFIG?.HAPI_BASE) return window.CONFIG.HAPI_BASE
  return location.host
}

function buildKatomiaProfileLink(pubkey){
  const url = new URL((window.KBASE||"") + "/keakonnect", location.origin)

  url.searchParams.set("v", "1")
  url.searchParams.set("type", "katomia-order-intent")
  url.searchParams.set("domain", getKatomiaKpoolDomain())
  url.searchParams.set("network", gameMeta?.network || "")
  url.searchParams.set("gameId", gameId || gameMeta?.id || "")
  url.searchParams.set("orderPubkey", pubkey || "")

  return url.toString()
}

async function renderKatomiaQr(link){
  const box = document.getElementById("profileQr")
  if(!box) return

  box.innerHTML = ""

  const a = document.createElement("a")
  a.href = link
  a.className = "profile-qr-link"
  a.title = "Open KEA link"
  a.target = "KEA"

  // davidshimjs creates a canvas *inside* the container — needs a div, not canvas.
  const qrDiv = document.createElement("div")
  a.appendChild(qrDiv)
  box.appendChild(a)

  if(!window.QRCode?.CorrectLevel){
    box.textContent = "QR library missing"
    return
  }

  new QRCode(qrDiv, { text: link, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M })
}

async function copyKatomiaProfileLink(){
  const link = document.getElementById("profileQrLink")?.textContent || ""
  if(!link) return

  await navigator.clipboard.writeText(link)
  notify?.("Profile link copied", "success", { timeout: 2000 })
}

function zzzgetKatomiaProfileTitle(){
  const label = localStorage.getItem("katomiaPlayerName") || ""
  const id = currentPlayerId || "Player"

  if(label) return `${id}: ${label}`
  return `👤 ${id}`
}

function getKatomiaProfileTitle(){
  // let label = `🔗 bind`
  let label = currentPlayerId || "Player"
  label = `🔗 ${label}`
  return label
}



function setText(id, value){
  const el = document.getElementById(id)
  if(el) el.textContent = value
}

function setProfileLink(link){
  const el = document.getElementById("profileQrLink")
  if(!el) return

  el.textContent = link
  el.href = link
  el.title = "Open KEA link"
  el.target = "KEA"
}


async function renderGameAdminTools(){
  if(gameMeta?.admin?.type !== "ed25519PublicKeyHex") return ""

  const myPubkey = await getKatomiaOrderPubkeyHex()
  if(myPubkey !== gameMeta.admin.value) return ""

  return `<span title="You are game admin">👑</span><span id="deleteGameBtn" title="Delete game" style="cursor:pointer">🗑️</span>`
}

async function deleteCurrentGame(){
  if(!gameId) return
  if(!confirm("Delete the whole game?\n\nAll players and orders will be removed. But any transactions already posted to Kpool will remain there and may still be signed and sent to Hedera for consensus.")) return

  const body = await buildDeleteGameRequest(gameId)

  let res, text, json
  try{
    res = await fetch("../hapi.php?action=delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })

    text = await res.text()
    try{ json = JSON.parse(text) }catch{}
  }catch(err){
    console.error("delete request failed", { err, body })
    alert("Delete request failed\n\n" + (err?.message || err))
    return
  }

  if(!res.ok || !json?.ok){
    const debug = {
      httpStatus: res.status,
      httpOk: res.ok,
      responseJson: json || null,
      responseText: text,
      requestBody: body,
      gameMeta
    }

    console.error("delete failed", debug)
    alert("Delete failed\n\n" + JSON.stringify(debug, null, 2).slice(0, 4000))
    return
  }

  alert("Game deleted")
  location.href = "../"
}

async function buildDeleteGameRequest(gameId){
  const { privateKey, publicKeyJwk } = await getOrCreatePlayerKeypair()
  const payload = { type:"katomia_deleteGame", gameId, issuedAt:Date.now() }
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const sigRaw = await crypto.subtle.sign("Ed25519", privateKey, bytes)

  return {
    payload,
    signature: {
      alg: "Ed25519",
      pubkeyHex: jwkXToHex(publicKeyJwk.x),
      sig: bytesToBase64(new Uint8Array(sigRaw))
    }
  }
}

function bytesToBase64(bytes){
  let s = ""
  for(const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

window.addEventListener("load", initKatomiaProfile)