
/* =========================
   CONTROLS
========================= */


function splitAccountLabels(input){
  const parts = []
  let start = 0
  let depth = 0

  for(let i = 0; i < input.length; i++){
    const ch = input[i]

    if(ch === "(") depth++
    else if(ch === ")") depth = Math.max(0, depth - 1)
    else if(ch === "," && depth === 0){
      const part = input.slice(start, i).trim()
      if(part) parts.push(part)
      start = i + 1
    }
  }

  const last = input.slice(start).trim()
  if(last) parts.push(last)

  return parts
}


const ACCOUNT_CACHE_KEY = `katomiaAccounts:${gameId}:${getOrCreatePlayerToken()}`

function getCachedAccountLabels(){
  try { return JSON.parse(localStorage.getItem(ACCOUNT_CACHE_KEY) || "[]") }
  catch(e) { return [] }
}

function setCachedAccountLabels(labels){
  localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify([...new Set(labels)].filter(Boolean)))
}

function rememberAccountLabels(labels){
  setCachedAccountLabels([...getCachedAccountLabels(), ...labels])
}

function forgetAccountLabel(label){
  setCachedAccountLabels(getCachedAccountLabels().filter(x => x !== label))
}

function restoreCachedAccounts(){
  if(window.katomiaAccountsRestored) return
  window.katomiaAccountsRestored = true

  const mine = new Set(getAccounts().filter(a => isMyAccount(a)).map(a => a.label))
  const missing = getCachedAccountLabels().filter(label => !mine.has(label))

  if(missing.length) addAccounts(missing.join(","))
}

function addAccounts(raw){

  raw = raw.trim()
  if(!raw) return

  const labels = splitAccountLabels(raw).map(label => {
    let out = label

    if(gameMeta?.network === "testnet" || gameMeta?.network === "mainnet"){
      if(/^\d+$/.test(out)) out = "0.0." + out
    }

    return out
  })

  rememberAccountLabels(labels)

  const playerToken = getOrCreatePlayerToken()
  
  const sendAll = () => {

    labels.forEach(label => {

      socket.send(JSON.stringify({
        type:"game_addAccount",
        gameId,
        playerToken,
        label
      }))
    })

  }

  // Always via connect(): it runs sendAll immediately on a joined socket and
  // queues it behind game_join otherwise (OPEN-but-unjoined / CONNECTING / dead).
  connect(sendAll)
}

function removeAccount(accountId){

  const account =
    getAccounts().find(x => x.id == accountId)

  if(!account) return

  const ok = confirm(
    `Remove account ${account.label}?\n\nAll assets and offers will be removed.`
  )

  if(!ok) return
  
  forgetAccountLabel(account.label)

  socket.send(JSON.stringify({
    type:"game_removeAccount",
    gameId,
    accountId
  }))
}

// PROP-ADDACCT1: the button opens the add-account modal (katomia-addaccount.js);
// prompt() fallback keeps the game usable if the modal script ever fails to load.
// Guarded: absent on board.php (BOARD-UI1).
if(addAccountBtn) addAccountBtn.onclick = () => {
  if(typeof openAddAccountModal === "function") openAddAccountModal()
  else { const v = prompt("Enter account ID"); if(v) addAccounts(v) }
}



const showTradingAccounts = document.getElementById("showTradingAccounts")
const showTradedAssets = document.getElementById("showTradedAssets")

// Guarded like core's viewToggle init: this file is also loaded on pages without
// the proposal filter controls (board.php — BOARD-UI1).
if(viewToggle) viewToggle.onchange = e => {
  viewMode = e.target.checked ? "columns" : "merged"
  render()
}

// BOARD-UI1: view SELECT (game.php replaced the desktop checkbox with a dropdown —
// grid/list stay on-page, board skins navigate to the standalone board page).
const viewSelect = document.getElementById("viewSelect")
if(viewSelect){
  viewSelect.value = viewMode
  viewSelect.onchange = e => {
    const v = e.target.value
    if(v.startsWith("board-")){
      // KATBOARD-ROUTE1: clean /board/<id> route (.htaccess), skin stays a query param
      location.href = "/m/katomia/board/" + encodeURIComponent(gameId || "")
        + "?skin=" + encodeURIComponent(v.slice(6))
      return
    }
    viewMode = v
    render()
  }
}

if(showTradingAccounts) showTradingAccounts.onchange = e => {

  showActiveOnly = e.target.checked

  // if user unticks trading accounts, traded-only cannot stay active
  if(!showActiveOnly){
    showTradedOnly = false
    showTradedAssets.checked = false
  }

  render()
}

if(showTradedAssets) showTradedAssets.onchange = e => {

  showTradedOnly = e.target.checked
  showTradingAccounts.checked = e.target.checked

  // if the trading-accounts checkbox is hidden just sync the state
  if(showTradingAccounts.offsetParent === null)
    showActiveOnly = e.target.checked

  render()
}

/* =========================
   NETWORK
========================= */

// ── WebSocket resilience ──────────────────────────────────────────────────────
// The socket historically had no auto-reconnect: once it dropped (mobile tab
// backgrounding, wifi↔cellular switch, idle timeout) it stayed dead until the
// next action that happened to call connect() — and the only such action was
// addAccounts(). That made "add account" pay a full cold connect+game_join
// handshake and feel slow/flaky ("took ages, finally went through"). We now
// reconnect on close and when the tab/network comes back, so the socket stays
// warm and actions fire instantly.
let wsShouldRun = true
let wsReconnectDelay = 1000
const WS_RECONNECT_MAX = 15000
let wsReconnectTimer = null

function scheduleWsReconnect(){
  if(!wsShouldRun || wsReconnectTimer) return
  if(socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  glog(`ws closed — reconnecting in ${wsReconnectDelay}ms`)
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null
    connect()
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_RECONNECT_MAX)
  }, wsReconnectDelay)
}

// reconnect promptly when the user returns to the tab or the network is restored
if(!window.__katomiaWsLifecycle){
  window.__katomiaWsLifecycle = true
  const wake = () => {
    if(!wsShouldRun) return
    // readyState > OPEN means CLOSING(2)/CLOSED(3); also covers no socket
    if(!socket || socket.readyState > WebSocket.OPEN){
      wsReconnectDelay = 1000
      if(wsReconnectTimer){ clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
      connect()
    }
  }
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") wake() })
  window.addEventListener("online", wake)
}

// Intent key cache: onopen must send game_join BEFORE any queued action, but the
// key derivation is async — cache it after first use so reconnect joins are sent
// synchronously inside onopen (no window for a user action to race past the join).
let cachedIntentKey = null

function connect(onOpenAction){

  // An explicit connect (e.g. adding an account again after a 🗑️ exit) re-arms the
  // resilience layer that exitGame() switched off.
  wsShouldRun = true

  if(socket && socket.readyState === WebSocket.OPEN){
    // OPEN but join not yet sent = onopen still mid-await (fresh reconnect).
    // Sending now would reach the server before game_join and be refused
    // ("socket.playerToken missing") — queue behind the join instead.
    if(!socket.__joined){ (socket.__onJoined ||= []).push(onOpenAction || (() => {})); return }
    onOpenAction && onOpenAction()
    return
  }

  if(socket && socket.readyState === WebSocket.CONNECTING){
    // Queue behind the join, not the raw 'open' event — a bare open-listener runs
    // while onopen may still be awaiting the intent key, i.e. before game_join.
    onOpenAction && (socket.__onJoined ||= []).push(onOpenAction)
    return
  }

  const WS_URL = "wss://" + window.CONFIG.HAPI_BASE + "/ws"
  console.log({WS_URL})
  socket = new WebSocket(WS_URL)


  socket.onopen = async () => {

    wsReconnectDelay = 1000   // healthy connection — reset backoff

		// PROP-LOCKSIGN1: register the intent public key at join — the playerToken WS
		// channel is the secure association. In order mode the backend learns the key from
		// order signatures; proposal mode needs it up front so account rows can show the
		// player-aware 💠/△ control marker before anything is signed.
		// Cached after first derivation so reconnects skip the await — that await opened
		// a window where the socket was OPEN but unjoined, and a user action sent then
		// was silently refused server-side ("socket.playerToken missing", 2026-07-07).
		let intentPublicKey = cachedIntentKey
		if(!intentPublicKey){
			try { if(typeof getKatomiaOrderPubkeyHex === "function") intentPublicKey = cachedIntentKey = await getKatomiaOrderPubkeyHex() }
			catch(e){ console.error("[join] intent key unavailable", e) }
		}

		const payload = {
      type: "game_join",
      gameId,
      playerToken: getOrCreatePlayerToken(),
      playerName: "anon",
      // KFLOW1: thread the frontend run + visit ids so backend checkpoints on this
      // socket join the same flow fingerprint (stored on the socket server-side)
      ...(window.kflow ? { kflowRun: window.kflow.run, kflowVisit: window.kflow.visit } : {}),
      ...(intentPublicKey ? { intentPublicKey } : {})
    }

    window.kflow?.("game:join", intentPublicKey ? "keyed" : "plain", { gameId })
    socket.send(JSON.stringify(payload))
		glog("payload for game_join", payload)

		// join is on the wire — release anything queued behind it (see connect()).
		socket.__joined = true
		;(socket.__onJoined || []).splice(0).forEach(fn => { try { fn() } catch(e){ console.error(e) } })

    onOpenAction && onOpenAction()
  }

  socket.onclose = () => { glog("ws onclose"); scheduleWsReconnect() }
  socket.onerror = (e) => { glog("ws onerror", { msg: String(e?.message || "") }); try { socket.close() } catch {} }

	
	const alertTimeouts = {warning: 3000, error: 0, info: 3000, success: 4000, event: 3000}
	socket.onmessage = async msg => {

		const data = JSON.parse(msg.data)
		console.log("websocket data received", data)
		
			
		if (data.messages)
			for (const m of data.messages) 
				notify(m.message,m.type, { timeout: alertTimeouts[m.type] ?? 0 }) // persistent
		if(data.type === "game_error") return  // errors included in notify
				
		
		if(data.type !== "game_state") glog(`websocket data IGNORED for type=${data.type}`, data)
		if(data.type !== "game_state") return

    // KFLOW1: first-state marker — the moment the game is actually usable. Once
    // per pageload (kflow collapses consecutive dups anyway; this keeps it clean).
    if(!window.__kflowStateSeen){ window.__kflowStateSeen = true; window.kflow?.("game:state", "first", { gameId }) }

    gameMeta = data.meta || null
    state = data.state
    // PROP-ADDACCT1: survives exitGame() (which nulls gameMeta) so the add-account
    // modal still knows the game's network when re-adding after a 🗑️ exit.
    if(gameMeta?.network) window.__katomiaNetwork = gameMeta.network
    
    document.body.dataset.tradingMode = gameMeta?.config?.tradingMode || ""
  
    currentPlayerId = data.myPlayerId || null
    restoreCachedAccounts()

    if(window.pendingAutoload){
      // PROP-ADDACCT1: autoload adds directly — the old path staged it via the
      // (now removed) inline account input before clicking Add.
      addAccounts(window.pendingAutoload)
      window.pendingAutoload = null
    }

		glog(`state received for ${currentPlayerId}`, {gameMeta, state})

		// PROP-LOCKSIGN1: while any of my accounts is locked, re-sign the (possibly
		// changed) board basis so my lock commitment never goes stale — a board change
		// does not unlock me. Fire-and-forget; hash-guarded inside.
		if(typeof maybeRefreshLockCommitment === "function")
			maybeRefreshLockCommitment().catch(e => console.error("[lock] re-sign failed", e))

		await render()
    await enrichAccountLabels()
		await enrichAccountAssets()
		await loadThumbCache()
		render()

	}
	
}



function exitGame(){

	// intentional exit — stop the resilience layer from reconnecting
	wsShouldRun = false
	if(wsReconnectTimer){ clearTimeout(wsReconnectTimer); wsReconnectTimer = null }

	// Exit is the explicit "I'm done" signal: wipe this game's account cache so a
	// refresh does NOT auto-restore the accounts (user 2026-07-07). The cache and
	// restoreCachedAccounts() stay for their real job — re-seating you when the
	// memory-only backend restarts MID-game. Deep links (?autoload=) are a separate
	// path (window.pendingAutoload) and still work after an exit.
	setCachedAccountLabels([])

	if(socket){
		const playerToken = getOrCreatePlayerToken()

		window.kflow?.("game:exit", "", { gameId })
		socket.send(JSON.stringify({
			type: "game_exit",
			gameId,
			playerToken
		}))

		// Deferred close: close() right after send can lose the exit frame when the
		// page is torn down (fast refresh/navigation) — then the server keeps the
		// accounts and they're back on reload despite the cache wipe above.
		const s = socket
		setTimeout(() => { try { s.close() } catch(e){} }, 300)
	}

	socket = null
	// currentPlayer = null  //stale
	gameMeta= null
	state = null
	clearSelection()
	gameEl.innerHTML = ""
}


