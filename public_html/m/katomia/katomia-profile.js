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
}

async function openKatomiaProfile(){
  const modal = document.getElementById("profileModal")
  if(!modal) return

  modal.classList.remove("hidden")
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

  const link = buildKatomiaProfileLink(pubkey)
  setText("profileQrLink", link)

  await renderKatomiaQr(link)
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

  const canvas = document.createElement("canvas")
  box.appendChild(canvas)

  if(!window.QRCode){
    box.textContent = "QR library missing"
    return
  }

  QRCode.toCanvas(canvas, link, { width: 220, margin: 2 }, err => {
    if(err) box.textContent = "QR error"
  })
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

window.addEventListener("load", initKatomiaProfile)