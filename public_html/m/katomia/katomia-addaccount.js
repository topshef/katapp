// katomia-addaccount.js — PROP-ADDACCT1: add-account modal for proposal mode.
// A COMPOSER for the existing addAccounts() label format: plain "0.0.x" joins with
// everything; "0.0.x(a,b,0.0.n-7)" restricts to the ticked assets (backend converts
// '-' back to '#' for NFT serials). The join path itself is untouched.
// Asset preview: POST hapi.php?action=assets → backend seedAssets — the SAME seeding
// the join uses, so the picklist matches exactly what joining would bring in.
// Sequencing note (GAME-JOINRULE2): built as steps (account → assets) so a required
// "bind" step can slot in between for bound-only games later.

let addAcctLabel = null      // chosen account label (normalised)
let addAcctList = []         // [assetId,...] from preview (assetId may be "token#serial")
let addAcctSel = new Set()   // ticked assetIds

// gameMeta is nulled by exitGame(), but re-adding after a 🗑️ exit is a legit flow —
// fall back to the last network seen on a broadcast (set in katomia-network.js).
function addAcctNet(){
  return gameMeta?.network || window.__katomiaNetwork || ""
}

function addAcctStatus(msg, isError){
  const el = document.getElementById("addAcctStatus")
  el.textContent = msg || ""
  el.classList.toggle("addacct-error", !!isError)
}

function openAddAccountModal(){
  addAcctLabel = null
  addAcctList = []
  addAcctSel = new Set()
  addAcctStatus("")
  document.getElementById("addAcctManual").value = ""
  document.getElementById("addAcctStepAssets").classList.add("hidden")
  document.getElementById("addAcctActions").classList.add("hidden")
  document.getElementById("addAcctStepAccount").classList.remove("hidden")
  document.getElementById("addAccountModal").classList.remove("hidden")
  renderAddAcctWcList()
}

function closeAddAccountModal(){
  document.getElementById("addAccountModal").classList.add("hidden")
}

async function renderAddAcctWcList(){
  const list = document.getElementById("addAcctWcList")
  const connectBtn = document.getElementById("addAcctConnect")
  const net = addAcctNet()

  const wcLabel = document.getElementById("addAcctWcLabel")
  if(net === "playnet"){
    list.textContent = "Playnet game — enter any label below"
    connectBtn.classList.add("hidden")
    wcLabel.classList.add("hidden")
    return
  }
  connectBtn.classList.remove("hidden")
  wcLabel.classList.remove("hidden")
  list.textContent = "Checking connected wallets…"

  let wc = []
  try { wc = (typeof kauthWCAccounts === "function") ? await kauthWCAccounts(net, false) : [] } catch {}

  const mine = new Set(getAccounts().filter(a => isMyAccount(a)).map(a => a.label))
  list.innerHTML = ""
  if(!wc.length){ list.textContent = "No wallet connected for this network yet"; return }

  wc.forEach(id => {
    const row = document.createElement("button")
    row.type = "button"
    row.className = "addacct-wc-row"
    row.textContent = mine.has(id) ? `${id} — already in game` : id
    if(mine.has(id)) row.disabled = true
    else row.onclick = () => chooseAddAcct(id)
    list.appendChild(row)
  })
}

async function chooseAddAcct(raw){
  const net = addAcctNet()
  let label = String(raw).trim()
  if(!label) return
  if(!net){ addAcctStatus("Game not loaded yet — wait a moment and try again", true); return }
  if((net === "testnet" || net === "mainnet") && /^\d+$/.test(label)) label = "0.0." + label

  addAcctLabel = label
  document.getElementById("addAcctChosen").textContent = label
  document.getElementById("addAcctStepAccount").classList.add("hidden")
  document.getElementById("addAcctStepAssets").classList.remove("hidden")
  document.getElementById("addAcctActions").classList.remove("hidden")
  document.getElementById("addAcctHint").classList.toggle("hidden", net === "playnet")
  addAcctStatus("")

  const box = document.getElementById("addAcctAssets")
  box.textContent = "Looking up assets…"
  addAcctList = []
  addAcctSel = new Set()
  updateAddAcctJoinCount()

  try {
    const res = await fetch("/m/katomia/hapi.php?action=assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: net, account: label })
    })
    const data = await res.json()
    if(!data.ok) throw new Error(data.error || "lookup failed")
    addAcctList = Object.keys(data.assets || {})
    addAcctSel = new Set(addAcctList)   // everything ticked by default
    renderAddAcctAssets(data.assets || {})
  } catch(e) {
    // Loud, retriable — and "Join with all assets" still works without the preview.
    box.innerHTML = ""
    const msg = document.createElement("span")
    msg.className = "addacct-error"
    msg.textContent = `Couldn't load assets (${String(e?.message || e)}) — `
    const retry = document.createElement("button")
    retry.type = "button"
    retry.className = "addacct-link"
    retry.textContent = "retry"
    retry.onclick = () => chooseAddAcct(addAcctLabel)
    box.appendChild(msg)
    box.appendChild(retry)
  }
  updateAddAcctJoinCount()
}

// Chips rendered like the game's asset chips (same .asset base class + hover
// tooltip attrs); tap toggles ghosted-out = excluded. Labels upgrade in place as
// the shared enrichment cache fills (symbol for FTs, collection #serial for NFTs)
// — token id is the instant fallback so the list never waits on the mirror.
// Thumbnails deliberately NOT yet (user 2026-07-07: keep it simple/fast first).
function renderAddAcctAssets(assets){
  const box = document.getElementById("addAcctAssets")
  box.innerHTML = ""
  if(!addAcctList.length){ box.textContent = "No assets found on this account"; return }
  const net = addAcctNet()

  addAcctList.forEach(id => {
    const chip = document.createElement("div")
    chip.className = "asset addacct-chip"
    chip.dataset.assetId = id
    chip.title = "Tap to exclude / include"
    const labelEl = document.createElement("span")
    labelEl.textContent = (typeof getAssetDisplay === "function") ? getAssetDisplay(id, assets[id]) : id
    chip.appendChild(labelEl)
    chip.onclick = () => {
      const on = !addAcctSel.has(id)
      on ? addAcctSel.add(id) : addAcctSel.delete(id)
      chip.classList.toggle("addacct-ghost", !on)
      updateAddAcctJoinCount()
    }
    box.appendChild(chip)

    // async symbol/name — same cache the game fills, so repeat visits are instant
    if(net && typeof enrichAsset === "function" && typeof getAssetMeta === "function" && !getAssetMeta(id)){
      enrichAsset(net, id, assets[id]).then(e => {
        window.assetDisplayCache ||= {}
        window.assetDisplayCache[id] = e.meta
        labelEl.textContent = getAssetDisplay(id, assets[id])
        chip.dataset.assetName = e.meta?.token_class?.name || ""
      }).catch(() => {})
    } else if(typeof getAssetMeta === "function" && getAssetMeta(id)){
      chip.dataset.assetName = getAssetMeta(id)?.token_class?.name || ""
    }
  })
}

function updateAddAcctJoinCount(){
  document.getElementById("addAcctJoinCount").textContent = addAcctSel.size
  const btn = document.getElementById("addAcctJoin")
  btn.disabled = !addAcctList.length || !addAcctSel.size
  // no preview loaded → selected-join is meaningless, all-join still fine
  btn.classList.toggle("hidden", !addAcctList.length)
}

function addAcctSelectAll(on){
  addAcctSel = on ? new Set(addAcctList) : new Set()
  document.querySelectorAll("#addAcctAssets .addacct-chip").forEach(c => c.classList.toggle("addacct-ghost", !on))
  updateAddAcctJoinCount()
}

function addAcctJoinGame(all){
  if(!addAcctLabel) return
  let label = addAcctLabel
  if(!all){
    if(!addAcctSel.size) return
    // '#' is display; '-' is the wire form the backend maps back to '#'
    if(addAcctSel.size < addAcctList.length)
      label += "(" + [...addAcctSel].map(id => id.replace("#", "-")).join(",") + ")"
  }
  addAcctStatus(`Adding ${addAcctLabel}…`)
  document.getElementById("addAcctJoinAll").disabled = true
  document.getElementById("addAcctJoin").disabled = true

  addAccounts(label)

  pollUntil(
    () => getAccounts().some(a => isMyAccount(a) && a.label === addAcctLabel),
    () => {
      closeAddAccountModal()
      document.getElementById("addAcctJoinAll").disabled = false
      try { notify?.(`Account ${addAcctLabel} joined the game`, "success", { timeout: 2500 }) } catch {}
    },
    200, 12000,
    () => {
      document.getElementById("addAcctJoinAll").disabled = false
      updateAddAcctJoinCount()
      addAcctStatus("Account didn't land — check the id and your connection, then try again. (A join rule on this game can also reject it.)", true)
    }
  )
}

document.addEventListener("click", e => {
  switch(e.target.id){
    case "addAcctClose": closeAddAccountModal(); break
    case "addAcctBack":
      document.getElementById("addAcctStepAssets").classList.add("hidden")
      document.getElementById("addAcctActions").classList.add("hidden")
      document.getElementById("addAcctStepAccount").classList.remove("hidden")
      addAcctStatus("")
      break
    case "addAcctSelAll": addAcctSelectAll(true); break
    case "addAcctSelNone": addAcctSelectAll(false); break
    case "addAcctManualUse": chooseAddAcct(document.getElementById("addAcctManual").value); break
    case "addAcctJoinAll": addAcctJoinGame(true); break
    case "addAcctJoin": addAcctJoinGame(false); break
    case "addAcctProfileLink":
      closeAddAccountModal()
      document.querySelector("#profileBtn, [data-menu-profile]")?.click()
      break
    case "addAcctConnect": addAcctConnect(); break
  }
})

document.addEventListener("keydown", e => {
  if(e.key === "Enter" && e.target.id === "addAcctManual"){
    e.preventDefault()
    chooseAddAcct(e.target.value)
  }
})

// Same connect dance as the profile modal (katomia-auth.js kauthOnAccountChange):
// z-index bump so the WC modal isn't buried, ensureNetwork, connect, re-list.
async function addAcctConnect(){
  const net = addAcctNet()
  if(!window.WC){ try { notify?.("WalletConnect not loaded yet", "error", { timeout: 3000 }) } catch {}; return }
  addAcctStatus("Connecting wallet…")
  try {
    document.documentElement.style.setProperty("--wcm-z-index", "2147483000")
    if(window.WC.ensureNetwork) await window.WC.ensureNetwork(net)
    await window.WC.connect?.()
  } catch(e) {
    try { notify?.("Wallet connect failed", "error", { timeout: 4000 }) } catch {}
  }
  addAcctStatus("")
  renderAddAcctWcList()
}
