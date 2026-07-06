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
  const net = gameMeta?.network || ""

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
  const net = gameMeta?.network || ""
  let label = String(raw).trim()
  if(!label) return
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

function renderAddAcctAssets(assets){
  const box = document.getElementById("addAcctAssets")
  box.innerHTML = ""
  if(!addAcctList.length){ box.textContent = "No assets found on this account"; return }

  addAcctList.forEach(id => {
    const row = document.createElement("label")
    row.className = "addacct-asset-row"
    const cb = document.createElement("input")
    cb.type = "checkbox"
    cb.checked = true
    cb.onchange = () => {
      cb.checked ? addAcctSel.add(id) : addAcctSel.delete(id)
      updateAddAcctJoinCount()
    }
    const name = document.createElement("span")
    name.className = "addacct-asset-id"
    name.textContent = id.includes("#") ? id.replace("#", " #") : id     // "0.0.x #7" reads as NFT serial
    const amt = document.createElement("span")
    amt.className = "addacct-asset-amt subtle"
    amt.textContent = id.includes("#") ? "NFT" : String(assets[id])
    row.appendChild(cb)
    row.appendChild(name)
    row.appendChild(amt)
    box.appendChild(row)
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
  document.querySelectorAll("#addAcctAssets input[type=checkbox]").forEach(cb => cb.checked = on)
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
  const net = gameMeta?.network || ""
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
