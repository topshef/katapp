// katomia-addaccount.js — PROP-ADDACCT1: add-account modal for proposal mode.
// A COMPOSER for the existing addAccounts() label format: plain "0.0.x" joins with
// everything; "0.0.x(a,b,0.0.n-7)" restricts to the ticked assets (backend converts
// '-' back to '#' for NFT serials). The join path itself is untouched.
// Asset preview: POST hapi.php?action=assets → backend seedAssets — the SAME seeding
// the join uses, so the picklist matches exactly what joining would bring in.
// Sequencing note (GAME-JOINRULE2): built as steps (account → assets) so a required
// "bind" step can slot in between for bound-only games later.
// ENTRY-AUTOADD1 (user brainstorm 2026-07-29, NOT coded yet): when a player who
// connected a wallet on the welcome page ENTERS a game, auto-add their connected
// account(s) with all assets — skipping this composer entirely on the happy path.
// Planned as a preference, ON by default ("Automatically add my accounts to a game
// when joining", profile → Preferences); this modal stays as the manual/curated path
// and for turning the preference's result down to specific assets.

// ── ASSETVIS1: the shared show/hide control ──────────────────────────────────
// User 2026-09-05, on their own account's assets: "for your own assets, basically
// you can only show/hide them. It's not about favourites… just come up with
// something that intuitively looks like, yeah, that's show/hide. With a tooltip
// as well."
//
// So NOT the ⭐/🚫/○ curate cycle other players' rows carry — that one is a private
// opinion about someone else's goods, three states, and means nothing to anyone but
// you. This is a two-state fact about YOUR store that everyone else sees, and the
// user's own reasoning for keeping them apart is worth preserving: "I think what you
// see should be what others see for your own store, otherwise it's going to get too
// confusing."
//
// An eye, because a slashed eye is the one show/hide idiom nobody has to be taught,
// and it sits at the LEFT EDGE like a bullet — the same slot the curate toggle uses
// on other players' rows, so the lists still scan alike. Drawn rather than emoji:
// ✕ was ruled out for colliding with the modal's own close, and emoji eyes render
// differently on every platform.
//
// Both callers pass an onChange; neither owns the markup, so the control can only
// ever look and read the same in both places.
function katomiaVisToggle(on, onChange){
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = "kvis"
  const paint = v => {
    btn.classList.toggle("kvis--off", !v)
    btn.setAttribute("aria-pressed", String(!!v))
    btn.setAttribute("aria-label", v ? "Shown in your store" : "Hidden from your store")
    btn.title = v
      ? "Shown — everyone in this circle can see and pick this. Click to hide it."
      : "Hidden — nobody else can see or pick this. Click to show it."
    btn.innerHTML = v ? KVIS_EYE : KVIS_EYE_OFF
  }
  paint(on)
  // Bulk actions (show all / show none, and the add-account list's all/none) set many
  // rows at once and must not have to know how this control is drawn — otherwise the
  // row mutes while the eye still says "shown", which is exactly the disagreement this
  // toggle exists to remove.
  btn._kvisPaint = paint
  btn.onclick = e => {
    e.stopPropagation()          // the row itself opens the asset card
    const next = btn.classList.contains("kvis--off")
    paint(next)
    onChange(next, paint)        // paint is handed back so a caller can revert on failure
  }
  return btn
}
const KVIS_EYE = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">'
  + '<path d="M10 4.5c-3.6 0-6.6 2.3-8 5.5 1.4 3.2 4.4 5.5 8 5.5s6.6-2.3 8-5.5c-1.4-3.2-4.4-5.5-8-5.5z" fill="none" stroke="currentColor" stroke-width="1.4"/>'
  + '<circle cx="10" cy="10" r="2.4" fill="currentColor"/></svg>'
const KVIS_EYE_OFF = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">'
  + '<path d="M10 4.5c-3.6 0-6.6 2.3-8 5.5 1.4 3.2 4.4 5.5 8 5.5s6.6-2.3 8-5.5c-1.4-3.2-4.4-5.5-8-5.5z" fill="none" stroke="currentColor" stroke-width="1.4"/>'
  + '<circle cx="10" cy="10" r="2.4" fill="currentColor"/>'
  + '<line x1="3.5" y1="16.5" x2="16.5" y2="3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'

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

// opts.skipAssets (ORDER-ADDACCT1, user 2026-08-05): stripped-down variant for
// order mode — pick/connect/type the account and it joins with ALL assets, no
// asset-picking step (orders reference assets directly; the account just needs
// to be in the game).
let addAcctSkipAssets = false
function openAddAccountModal(opts){
  addAcctSkipAssets = !!(opts && opts.skipAssets)
  window.kflow?.("acct:add:open", addAcctNet() === "playnet" ? "playnet" : "chain")
  addAcctLabel = null
  addAcctList = []
  addAcctSel = new Set()
  addAcctStatus("")
  document.getElementById("addAcctManual").value = ""
  document.getElementById("addAcctStepAssets").classList.add("hidden")
  document.getElementById("addAcctActions").classList.add("hidden")
  document.getElementById("addAcctStepAccount").classList.remove("hidden")
  const modal = document.getElementById("addAccountModal")
  modal.style.zIndex = 2100   // above whichever modal opened it (order modal shares z2000)
  modal.classList.remove("hidden")
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
  // KFLOW1 start-state snapshot: how many WC accounts are connected / how many of
  // my accounts are already in the game — the PRECONDITION fingerprint for any
  // add-account window (state:* tokens are ordinary checkpoints in the sequence)
  window.kflow?.("state:addacct", window.kflow.fpCounts({ wc: wc.length, g: mine.size }))
  list.innerHTML = ""
  if(!wc.length){ list.textContent = "No wallet connected for this network yet"; return }

  wc.forEach(id => {
    const row = document.createElement("button")
    row.type = "button"
    row.className = "addacct-wc-row"
    row.textContent = mine.has(id) ? `${id} — already in game` : id
    if(mine.has(id)) row.disabled = true
    else row.onclick = () => chooseAddAcct(id, "wc")
    list.appendChild(row)
  })
}

async function chooseAddAcct(raw, src){
  const net = addAcctNet()
  let label = String(raw).trim()
  if(!label) return
  if(!net){ addAcctStatus("Game not loaded yet — wait a moment and try again", true); return }
  window.kflow?.("acct:add:pick", src || "typed", { label })
  if((net === "testnet" || net === "mainnet") && /^\d+$/.test(label)) label = "0.0." + label

  addAcctLabel = label
  if(addAcctSkipAssets){
    // stripped-down (order mode): account chosen = join with everything, now
    document.getElementById("addAcctStepAccount").classList.add("hidden")
    addAcctJoinGame(true)
    return
  }
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
    const res = await fetch((window.KBASE||"") + "/hapi.php?action=assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: net, account: label })
    })
    const data = await res.json()
    if(!data.ok) throw new Error(data.error || "lookup failed")
    addAcctList = Object.keys(data.assets || {})
    addAcctSel = new Set(addAcctList)   // everything ticked by default
    renderAddAcctAssets(data.assets || {})
    window.kflow?.("acct:add:assets", addAcctList.length ? "ok" : "empty", { count: addAcctList.length })
  } catch(e) {
    window.kflow?.("acct:add:assets", "fail", { error: String(e?.message || e) })
    // Loud, retriable — and "Join with all assets" still works without the preview.
    box.innerHTML = ""
    const msg = document.createElement("span")
    msg.className = "addacct-error"
    msg.textContent = `Couldn't load assets (${String(e?.message || e)}) — `
    const retry = document.createElement("button")
    retry.type = "button"
    retry.className = "addacct-link"
    retry.textContent = "retry"
    retry.onclick = () => chooseAddAcct(addAcctLabel, "retry")
    box.appendChild(msg)
    box.appendChild(retry)
  }
  updateAddAcctJoinCount()
}

// ── ADDACCT-LIST1 (user 2026-09-05) ──────────────────────────────────────────
// Was a grid of chips you tapped to ghost out. Now the same LIST the player modal
// uses, for the reason the user gave: "the normal modal we've got has got icons and
// everything, so it's better, and it's a simple list as well — so it's easier to
// read, and it's familiar, because it's the same format that clicking on an account
// does." Same eye toggle at the left edge, same thumbnails, same alphabetical order.
//
// The other half of that ask was about WHEN you get to decide: "that all/none should
// go onto the modal instead… so you can change that setting at any time." Which is
// exactly what the toggle on your own account rows now gives you — this screen is no
// longer the only chance to choose, just the first one.
//
// Labels upgrade in place as the shared enrichment cache fills (symbol for FTs,
// collection #serial for NFTs); the token id is the instant fallback so the list
// never waits on the mirror.
function renderAddAcctAssets(assets){
  const box = document.getElementById("addAcctAssets")
  box.innerHTML = ""
  if(!addAcctList.length){ box.textContent = "No assets found on this account"; return }
  const net = addAcctNet()

  // Alphabetical by what the reader actually sees. Ids sort by issue order, which
  // is meaningless to anyone scanning for a token by name.
  const display = id => (typeof getAssetDisplay === "function") ? getAssetDisplay(id, assets[id]) : String(id)
  const sorted = [...addAcctList].sort((a, b) => display(a).localeCompare(display(b), undefined, { sensitivity: "base" }))

  sorted.forEach(id => {
    const row = document.createElement("div")
    row.className = "addacct-row"
    row.dataset.assetId = id
    row.classList.toggle("addacct-row--off", !addAcctSel.has(id))

    row.appendChild(katomiaVisToggle(addAcctSel.has(id), on => {
      on ? addAcctSel.add(id) : addAcctSel.delete(id)
      row.classList.toggle("addacct-row--off", !on)
      updateAddAcctJoinCount()
    }))

    const thumb = (typeof getAssetMeta === "function" && typeof getAssetThumb === "function")
      ? getAssetThumb(getAssetMeta(id)) : null
    if(thumb){
      const img = document.createElement("img")
      img.className = "addacct-thumb"
      img.src = (typeof getFastThumb === "function") ? getFastThumb(thumb, img) : thumb
      img.decoding = "async"
      img.alt = ""
      img.onerror = () => img.remove()
      row.appendChild(img)
    }

    const labelEl = document.createElement("span")
    labelEl.className = "addacct-rowname"
    labelEl.textContent = display(id)
    row.appendChild(labelEl)

    // NFT serials: two of the same collection are otherwise indistinguishable in a
    // list (same reasoning as PLAYER-MODAL3 on the player modal's rows). Skipped when
    // the name IS the id — an un-enriched NFT would otherwise print it twice.
    if(String(id).includes("#") && !labelEl.textContent.startsWith(String(id).split("#")[0])){
      const [tok, ser] = String(id).split("#")
      const idl = document.createElement("span")
      idl.className = "addacct-rowid"
      idl.textContent = tok + " #" + ser
      row.appendChild(idl)
    }

    // The whole row is the hit target, not just the 16px eye.
    row.onclick = () => row.querySelector(".kvis")?.click()
    box.appendChild(row)

    // async symbol/name — same cache the game fills, so repeat visits are instant
    if(net && typeof enrichAsset === "function" && typeof getAssetMeta === "function" && !getAssetMeta(id)){
      enrichAsset(net, id, assets[id]).then(e => {
        window.assetDisplayCache ||= {}
        window.assetDisplayCache[id] = e.meta
        labelEl.textContent = display(id)
        row.dataset.assetName = e.meta?.token_class?.name || ""
      }).catch(() => {})
    } else if(typeof getAssetMeta === "function" && getAssetMeta(id)){
      row.dataset.assetName = getAssetMeta(id)?.token_class?.name || ""
    }
  })
}

// ADDACCT-LIST1: the button says what it is about to do, and the number moves as you
// choose (user: "you can see that button changes the number as you've changed the
// selection, so you're sure what you're adding into the store").
//
// ADDACCT-NONE1 (user 2026-09-05): zero is a real answer — "you can enter the game
// showing no assets. Part of a deal might be that you're RECEIVING some assets into
// that account." It just could not be SAID on the wire: "0.0.x()" parses as the
// wildcard, so an empty selection would have joined with the whole wallet. The
// backend now takes an explicit "!none" sentinel (katomiaActions.addAccount), so the
// button offers it plainly instead of refusing.
function updateAddAcctJoinCount(){
  const n = addAcctSel.size
  const countEl = document.getElementById("addAcctJoinCount")
  if(countEl) countEl.textContent = n
  const btn = document.getElementById("addAcctJoin")
  const lab = document.getElementById("addAcctJoinLabel")
  if(lab) lab.textContent = !addAcctList.length ? "Add account"
    : n === 0 ? "Add account with no assets"
    : n === 1 ? "Add account with 1 asset"
    : `Add account with ${n} assets`
  if(btn) btn.disabled = false
  // The preview failed to load → there is nothing to choose from, so the all-assets
  // fallback is the only honest route in (ADDACCT-ROBUST1 keeps that path alive).
  document.getElementById("addAcctJoinAll")?.classList.toggle("hidden", !!addAcctList.length)
}

function addAcctSelectAll(on){
  addAcctSel = on ? new Set(addAcctList) : new Set()
  document.querySelectorAll("#addAcctAssets .addacct-row").forEach(r => {
    r.classList.toggle("addacct-row--off", !on)
    r.querySelector(".kvis")?._kvisPaint?.(on)
  })
  updateAddAcctJoinCount()
}

// ADDACCT-ROBUST1 (user 2026-08-05, "Adding… stuck / failure toast buried"): while a
// join is in flight, backend error messages (which only surfaced as toasts — and a
// toast can sit unseen behind/away from the modal) now land IN the modal's status
// line and re-arm the buttons for a retry. katomia-network.js mirrors every backend
// message as a katomia:gamemsg DOM event.
let addAcctInFlight = false
document.addEventListener("katomia:gamemsg", e => {
  const m = e.detail
  if(!addAcctInFlight || !m || (m.type !== "error" && m.type !== "warning")) return
  if(document.getElementById("addAccountModal")?.classList.contains("hidden")) return
  addAcctInFlight = false
  addAcctStatus(String(m.message || "Add failed — try again"), true)
  document.getElementById("addAcctJoinAll").disabled = false
  updateAddAcctJoinCount()
})

function addAcctJoinGame(all){
  if(!addAcctLabel) return
  let label = addAcctLabel
  if(!all){
    // ADDACCT-NONE1: an empty selection is joined EXPLICITLY as "!none" — see the
    // note on updateAddAcctJoinCount for why it cannot just be "()".
    if(!addAcctSel.size && addAcctList.length) label += "(!none)"
    // '#' is display; '-' is the wire form the backend maps back to '#'
    else if(addAcctSel.size && addAcctSel.size < addAcctList.length)
      label += "(" + [...addAcctSel].map(id => id.replace("#", "-")).join(",") + ")"
  }
  addAcctStatus(`Adding ${addAcctLabel}…`)
  document.getElementById("addAcctJoinAll").disabled = true
  document.getElementById("addAcctJoin").disabled = true

  // KFLOW1 heuristic data-fingerprint: the SET of assets joined becomes the variant
  // (order-free; hashes when long) — 'just USDC' vs 'USDC+HBAR' are distinct paths
  window.kflow?.("acct:add:sel", window.kflow.fpSet(all ? addAcctList : [...addAcctSel]))
  window.kflow?.("acct:add:join", all ? "all" : "sel", { label })
  addAccounts(label)

  // FALSE-NEGATIVE fix (user 2026-07-14, KTAG 5/757-772): the account landed
  // but the 12s poll had already declared failure — the join can legitimately
  // take longer (fresh WC pairing, socket re-join queueing the send). Longer
  // first window, and the timeout no longer asserts failure: it softens the
  // message and keeps polling in the background, converting a late land into
  // a late success instead of a lie.
  addAcctInFlight = true
  const landed = () => getAccounts().some(a => isMyAccount(a) && a.label === addAcctLabel)
  const onLanded = late => {
    addAcctInFlight = false
    window.kflow?.("acct:add:done", late ? "ok-late" : "ok", { label: addAcctLabel })
    if(late) window.katomiaDiagSend?.("acct:add:late-land", { label: addAcctLabel })
    closeAddAccountModal()
    document.getElementById("addAcctJoinAll").disabled = false
    try { notify?.(`Account ${addAcctLabel} joined the game`, "success", { timeout: 2500 }) } catch {}
  }
  pollUntil(landed, () => onLanded(false), 200, 30000, () => {
    window.kflow?.("acct:add:done", "timeout", { label: addAcctLabel })
    document.getElementById("addAcctJoinAll").disabled = false
    updateAddAcctJoinCount()
    addAcctStatus("Taking longer than expected — it may still land (watch the account list). Check your connection; a join rule on this game can also reject it.", true)
    pollUntil(landed, () => onLanded(true), 500, 60000)
  })
}

// ADDACCT-CLICKTARGET1 (user 2026-09-05: "on my MacBook I'm not able to add the
// assets — when I click the add button it doesn't work… I was able to do it from
// my mobile"). Self-inflicted, one commit earlier: the primary button gained a
// <span id="addAcctJoinLabel"> to carry the live count, and this dispatcher read a
// BARE e.target.id — so a click landing on the label text reported the span's id,
// matched no case, and did nothing. A tap on a phone often lands on the button's
// padding instead of the glyphs, which is exactly why it worked there and not with
// a mouse. Resolve to the enclosing button first; #addAcctClose is a div and still
// falls through to e.target.
document.addEventListener("click", e => {
  const targetId = (e.target.closest?.("button")?.id) || e.target.id
  switch(targetId){
    case "addAcctClose": closeAddAccountModal(); break
    case "addAcctCancel": closeAddAccountModal(); break
    case "addAcctBack":
      document.getElementById("addAcctStepAssets").classList.add("hidden")
      document.getElementById("addAcctActions").classList.add("hidden")
      document.getElementById("addAcctStepAccount").classList.remove("hidden")
      addAcctStatus("")
      break
    case "addAcctSelAll": addAcctSelectAll(true); break
    case "addAcctSelNone": addAcctSelectAll(false); break
    case "addAcctManualUse": chooseAddAcct(document.getElementById("addAcctManual").value, "typed"); break
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
    chooseAddAcct(e.target.value, "typed")
  }
})

// Same connect dance as the profile modal (katomia-auth.js kauthOnAccountChange):
// z-index bump so the WC modal isn't buried, ensureNetwork, connect, re-list.
async function addAcctConnect(){
  const net = addAcctNet()
  if(!window.WC){ try { notify?.("WalletConnect not loaded yet", "error", { timeout: 3000 }) } catch {}; return }
  addAcctStatus("Connecting wallet…")
  // snapshot BEFORE the pairing so freshly-arrived accounts are identifiable after
  let before = []
  try { before = (typeof kauthWCAccounts === "function") ? await kauthWCAccounts(net, false) : [] } catch {}
  try {
    document.documentElement.style.setProperty("--wcm-z-index", "2147483000")
    if(window.WC.ensureNetwork) await window.WC.ensureNetwork(net)
    window.kauthPruneWcModals?.()   // WC-NETSWITCH1: drop the stale modal a rebuild left
    await window.WC.connect?.()
    window.kflow?.("acct:add:connect", "ok")
  } catch(e) {
    window.kflow?.("acct:add:connect", "fail", { error: String(e?.message || e) })
    try { notify?.("Wallet connect failed", "error", { timeout: 4000 }) } catch {}
  }
  addAcctStatus("")
  // user 2026-07-14: connecting a wallet here MEANS "add this account" — when
  // the pairing brought exactly one new (not-already-in-game) account, jump
  // straight to its assets instead of asking the user to re-pick it from the
  // list they just grew. Multiple new accounts (a wallet can approve several)
  // still fall back to the list — that's a real choice.
  let after = []
  try { after = (typeof kauthWCAccounts === "function") ? await kauthWCAccounts(net, false) : [] } catch {}
  const inGame = new Set(getAccounts().filter(a => isMyAccount(a)).map(a => a.label))
  const fresh = after.filter(id => !before.includes(id) && !inGame.has(id))
  if(fresh.length === 1){ chooseAddAcct(fresh[0], "wc-fresh"); return }
  renderAddAcctWcList()
}
