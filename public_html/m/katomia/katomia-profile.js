const NERD_KEY = "katomia.nerd.v1"

// ── KATUI3 R3 (user 2026-08-17, third mobile report) — measure the PAINT, not the
// handler. R2's queuedMs proved the ✕ handler runs in ~10ms on the user's phone yet
// the freeze persists — so the stall is between our class flip and the frame the
// user actually sees (or on OPEN, which had no telemetry at all). Two probes:
//  · kprofPaintMs(cb): double-rAF — the first rAF runs before the next paint, the
//    second can only run after that frame was COMMITTED, so the delta ≈ how long the
//    user waited to SEE the change.
//  · a PerformanceObserver("longtask") logging every main-thread task ≥300ms with
//    whether the modal was open — catches the blocker regardless of whose code it
//    is (WC crypto, enrichment, chat, our render, an extension…).
// R5: pages that don't load katomia-modals.js (home, circles) had NO diag sender at
// all — the user's profile-freeze repro on the HOME page was completely invisible
// in kdiag while the board pages reported fine. Minimal fallback: same wire shape
// (diag.php accepts {events,page,ua}), sendBeacon fire-and-forget, defined only
// when the real sender is absent (on game/board pages katomia-modals.js loads
// first and this never runs).
if(typeof window.katomiaDiagSend !== "function"){
  window.katomiaDiagSend = (msg, data) => {
    try { console.debug("[katomiaDiag]", msg, data ?? "") } catch {}
    try {
      const payload = JSON.stringify({
        events: [{ t: new Date().toISOString(), msg, data }],
        page: location.pathname,
        ua: navigator.userAgent.slice(0, 200)
      })
      navigator.sendBeacon?.("/diag", new Blob([payload], { type: "application/json" }))
    } catch {}
  }
}

function kprofPaintMs(label, extra){
  const t0 = performance.now()
  requestAnimationFrame(() => requestAnimationFrame(() =>
    window.katomiaDiagSend?.(label, Object.assign({ paintMs: Math.round(performance.now() - t0) }, extra || {}))))
}

// (R4's timed tap shield and R6's pointerdown close were REMOVED in R9 at the
// user's instruction once R8 fixed the real cause — no timing patches. The clean
// dead-tap fix is CSS: touch-action:none on the ✕ and ☰, so a touch starting on
// them can never be classified as a scroll and the plain click always fires.)
try {
  if(typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")){
    new PerformanceObserver(list => {
      for(const e of list.getEntries()){
        if(e.duration < 300) continue
        const modal = document.getElementById("profileModal")
        window.katomiaDiagSend?.("perf:longtask", {
          durMs: Math.round(e.duration),
          at: Math.round(e.startTime),
          modalOpen: !!modal && !modal.classList.contains("hidden"),
          attribution: e.attribution?.[0]?.containerType || null
        })
      }
    }).observe({ entryTypes: ["longtask"] })
  }
} catch {}

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

  /* KBUNDLE-STRIP:kea */
  // (the hamburger's [data-menu-kea] second door was removed 2026-08-17, KATUI3
  // feedback pass — the admin-gated profile section is KEA's only home now. This
  // comment lives inside strip markers: the purity gate rejects a bundle carrying
  // ANY mention of the feature, marker name or plain words alike.)
  /* /KBUNDLE-STRIP:kea */

  // R9 (final shape after the KATUI3 saga, user 2026-08-17): a plain click closes the modal —
  // nothing else. The felt "slow close" was never here: it was the landing page's
  // always-on card animations holding the phone at ~5fps (fixed in R8), plus taps
  // on the ✕ being eaten as scroll-starts (fixed cleanly by touch-action:none in
  // CSS — the click now always fires, so no pointerdown wiring, no tap shield, no
  // suppression timers). Telemetry (queuedMs/paintMs) stays: it is how the real
  // causes were found and how any regression will be seen.
  const doClose = e => {
    modal.classList.add("hidden")
    window.boardModalHold?.(false)
    window.katomiaDiagSend?.("profile:close", { queuedMs: e ? Math.round(performance.now() - e.timeStamp) : null,
      wcBusy: !!window.kauthNetBusy?.() })
    kprofPaintMs("profile:close-painted")
    if(window.kauthNetBusy?.())
      notify?.("Still talking to the wallet network in the background — it'll finish on its own.", "info", { timeout: 3500 })
  }
  close.onclick = doClose
  modal.onclick = e => {
    if(e.target === modal) doClose(e)
  }

  // R7: tap-position telemetry — every pointerdown while the modal is open logs
  // where it landed relative to the ✕ centre and what it hit, so any "dead tap"
  // (a miss, an overlap, an unexpected target) is visible in kdiag instead of
  // being reconstructed from guesswork.
  modal.addEventListener("pointerdown", ev => {
    const c = close.getBoundingClientRect()
    window.katomiaDiagSend?.("profile:tap", {
      dxFromClose: Math.round(ev.clientX - (c.x + c.width / 2)),
      dyFromClose: Math.round(ev.clientY - (c.y + c.height / 2)),
      target: (ev.target.id || ev.target.className || ev.target.tagName || "").toString().slice(0, 40)
    })
  }, { capture: true, passive: true })

  // KATUI3 R2 (user, pre-existing ask): expanding any collapsed section scrolls it
  // into view — on mobile the tap landed mid-card and the freshly-opened content
  // stayed below the fold the FIRST time (native browsers only keep it visible on a
  // RE-open because the scroll position happens to be right by then). rAF first: the
  // toggle event fires before the opened content has laid out, and scrolling in the
  // same frame measures the collapsed height — the very "works the second time" the
  // user described. scroll-margin-top in CSS keeps the sticky ✕ clear.
  modal.querySelectorAll("details").forEach(d =>
    d.addEventListener("toggle", () => {
      if(!d.open) return
      requestAnimationFrame(() => d.scrollIntoView({ behavior: "smooth", block: "start" }))
    })
  )

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
        window.katomiaDiagSend?.("diag:copy-local", { ok: true })
      }catch(err){
        copyDiagBtn.textContent = "see console"
        console.error("[diag] copy local failed", err)
        window.katomiaDiagSend?.("diag:copy-local", { ok: false, error: String(err) })
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

  const t0 = performance.now()
  modal.classList.remove("hidden")
  window.boardModalHold?.(true)   // board pages: stop full rebuilds behind the modal (KATUI3 R2)
  // R3: the OPEN path had no telemetry at all — if the felt freeze is here (modal
  // slow to appear/populate), these two events will say so and how long.
  kprofPaintMs("profile:open-painted")

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
      window.katomiaDiagSend?.("pref:uiSize", { value: v })
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
      window.katomiaDiagSend?.("diag:remote-toggle", { on })
    }
  }

  await renderKatomiaProfile()
  window.katomiaDiagSend?.("profile:open", { totalMs: Math.round(performance.now() - t0) })
}

async function renderKatomiaProfile(){
  const pubkey = await getKatomiaOrderPubkeyHex()
  const domain = getKatomiaKpoolDomain()
  const network = gameMeta?.network || ""
  const gid = gameId || gameMeta?.id || ""

  setText("profileTitle", getKatomiaProfileTitle())
  setText("profilePubkey", pubkey || "not ready")
  setText("profileCommitPubkey", pubkey || "not ready")   // Mock A: the fold's copy of the key
  setText("profileScope", [domain, network, gid].filter(Boolean).join(" | "))

  renderKatomiaAvatar(pubkey)

  renderKatomiaKvac()   // public prepaid-access handle (nerd only, stubbed)

  /* KBUNDLE-STRIP:kea */
  // Runtime-guarded too (kea flag off since 2026-08-13): no point building a QR
  // into a section the viewer can never see.
  if(window.KATOMIA_FEATURES?.kea !== false){
    const link = buildKatomiaProfileLink(pubkey)
    setProfileLink(link)

    await renderKatomiaQr(link)
  }
  /* /KBUNDLE-STRIP:kea */

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

/* KBUNDLE-STRIP:kea — the keakonnect link + QR exist only for the KEA pairing
   section of the profile modal */
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
/* /KBUNDLE-STRIP:kea */

// KATUI3 (user 2026-08-17): header shows the assigned player NAME or nothing at all.
// The old "🔗 Player" was doubly wrong — the 🔗 belongs to the wallet-binding section
// (the modal outgrew its binding origins), and "Player" was a placeholder posing as
// content. "anon" is the join default, not an assigned name, so it renders blank too.
function getKatomiaProfileTitle(){
  let stored = ""
  try { stored = localStorage.getItem("katomiaPlayerName") || "" } catch {}
  const name = state?.players?.[currentPlayerId]?.name || stored
  return (name && name !== "anon") ? name : ""
}



function setText(id, value){
  const el = document.getElementById(id)
  if(el) el.textContent = value
}

/* KBUNDLE-STRIP:kea */
function setProfileLink(link){
  const el = document.getElementById("profileQrLink")
  if(!el) return

  el.textContent = link
  el.href = link
  el.title = "Open KEA link"
  el.target = "KEA"
}
/* /KBUNDLE-STRIP:kea */


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