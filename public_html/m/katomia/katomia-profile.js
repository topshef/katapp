const NERD_KEY = "katomia.nerd.v1"

function loadNerdMode(){
  applyNerdMode(localStorage.getItem(NERD_KEY) === "1")
}

function applyNerdMode(on){
  document.body.classList.toggle("nerd", on)
  const toggle = document.getElementById("katomia-nerd-toggle")
  if(toggle) toggle.checked = on
  try{ localStorage.setItem(NERD_KEY, on ? "1" : "0") }catch{}
}

function initKatomiaProfile(){
  const btn = document.getElementById("profileBtn")
  const modal = document.getElementById("profileModal")
  const close = document.getElementById("profileModalClose")
  const copyBtn = document.getElementById("profileCopyLinkBtn")

  if(!btn || !modal) return

  btn.onclick = () => openKatomiaProfile()
  close.onclick = () => modal.classList.add("hidden")
  modal.onclick = e => {
    if(e.target === modal) modal.classList.add("hidden")
  }

  if(copyBtn)
    copyBtn.onclick = () => copyKatomiaProfileLink()

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

  const nerdToggle = document.getElementById("katomia-nerd-toggle")
  if(nerdToggle)
    nerdToggle.onchange = () => applyNerdMode(nerdToggle.checked)

  loadNerdMode()
}

async function openKatomiaProfile(){
  const modal = document.getElementById("profileModal")
  if(!modal) return

  modal.classList.remove("hidden")

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

  const link = buildKatomiaProfileLink(pubkey)
  setProfileLink(link)

  await renderKatomiaQr(link)
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

function getKatomiaKpoolDomain(){
  if(window.CONFIG?.HAPI_BASE) return window.CONFIG.HAPI_BASE
  return location.host
}

function buildKatomiaProfileLink(pubkey){
  const url = new URL("/m/katomia/keakonnect", location.origin)

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