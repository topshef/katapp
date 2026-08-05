
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


// WC-NETSCOPE1 (page-level scoping): the WC bundle initialises for config
// chains[0] (mainnet), so after a reload on a testnet game the restored testnet
// session was invisible — getAccounts() empty ("no wallet connected") while a
// live session existed — until some modal ensured the network. Scope the
// connector to the game's network once it's known, so session restore + the
// account picker are right from first paint. Only when a prior WC pairing
// exists in storage: a visitor who never paired shouldn't pay the relay
// handshake. The 3MB bundle usually lands AFTER the first game_state, so wait
// for window.WC briefly (verified in the WC-NETSCOPE1 retest — at state+3.5s
// the bundle wasn't up yet). Fire-and-forget; explicit actions (Sign, connect,
// Authenticate) still ensureNetwork on demand.
// Prior-pairing detector. This bundle's WC Core persists to IndexedDB
// (WALLET_CONNECT_V2_INDEXED_DB — verified in the 64c41ba iife; a localStorage
// "wc@2…" check never matches). indexedDB.databases() enumerates WITHOUT
// creating. Where the API is missing (older Safari) we err towards scoping —
// a spare relay handshake beats an invisible restored session.
async function kwcHasWcStorage(){
  try { if(Object.keys(localStorage).some(k => k.startsWith("wc@2"))) return true } catch {}
  try {
    if(window.indexedDB?.databases){
      const dbs = await indexedDB.databases()
      return dbs.some(d => d.name === "WALLET_CONNECT_V2_INDEXED_DB")
    }
  } catch {}
  return true
}

let _kwcScopeWaiter = null
async function kwcEarlyScope(net){
  if(window.__kwcEarlyScoped || !net) return
  if(!await kwcHasWcStorage()) return
  if(!window.WC?.ensureNetwork){
    if(_kwcScopeWaiter) return
    let tries = 0
    _kwcScopeWaiter = setInterval(() => {
      if(window.WC?.ensureNetwork || ++tries > 40){
        clearInterval(_kwcScopeWaiter)
        _kwcScopeWaiter = null
        if(window.WC?.ensureNetwork) kwcEarlyScope(net)
      }
    }, 500)
    return
  }
  window.__kwcEarlyScoped = true
  window.WC.ensureNetwork(net)
    .then(() => window.kauthPruneWcModals?.())
    .catch(e => window.kdiag?.("wc:early-scope-fail", { network: net, error: String(e?.message || e) }))
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
      location.href = (window.KBASE||"") + "/board/" + encodeURIComponent(gameId || "")
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

		// DEMO-SPECTATE1 R2: expose a re-join so a spectator can be upgraded in place the
		// moment they raise a commitment (see onKatomiaBindingPublished below).
		window.katomiaRejoin = () => { try { socket.send(JSON.stringify(payload)) } catch(e){ console.warn("[rejoin] failed", e) } }

		// join is on the wire — release anything queued behind it (see connect()).
		socket.__joined = true
		;(socket.__onJoined || []).splice(0).forEach(fn => { try { fn() } catch(e){ console.error(e) } })

    onOpenAction && onOpenAction()
  }

  socket.onclose = () => {
    glog("ws onclose")
    // WS-SIGNDIAG1 (user 2026-08-03, t-prop): sporadic "signature not picked up"
    // traced to sockets dying silently mid-signing (backend OOM storm that
    // afternoon). Every close is now a kdiag event, and a close DURING an active
    // signing window gets a visible toast — the state the user was staring at
    // is stale until the reconnect lands.
    let signingNow = false
    try { signingNow = typeof boardSigning !== "undefined" && !!boardSigning } catch(e){}
    try { window.kdiag?.("ws:close", { signing: signingNow, gameId: typeof gameId !== "undefined" ? gameId : null }) } catch(e){}
    try {
      if(signingNow && typeof notify === "function")
        notify("Connection dropped — reconnecting… sign status may lag a moment", "warning", { timeout: 4000 })
    } catch(e){}
    scheduleWsReconnect()
  }
  socket.onerror = (e) => {
    glog("ws onerror", { msg: String(e?.message || "") })
    try { window.kdiag?.("ws:error", { msg: String(e?.message || "") }) } catch(_){}
    try { socket.close() } catch {}
  }

	
	const alertTimeouts = {warning: 3000, error: 0, info: 3000, success: 4000, event: 3000}
	socket.onmessage = async msg => {

		const data = JSON.parse(msg.data)
		console.log("websocket data received", data)
		
			
		// BOARD-ACTIONMSG1 (user 2026-08-04): a message carrying a STRUCTURED
		// `action` the chat can render becomes a proper action row in the stream —
		// the actor's colour, avatar, account ids with the verified marker, and the
		// asset as a chip — instead of a prose toast. The prose still rides along
		// as the fallback comment the user asked the backend to keep sending: if
		// this client doesn't know the action's version or kind (canRender says no),
		// or the panel isn't loaded at all, it falls straight through to notify().
		if (data.messages)
			for (const m of data.messages){
				// panel mode only (R2): in bubbles mode the panel lists are hidden, so a
				// routed action would be invisible AND its toast suppressed — the same
				// mode gate notify()'s own chat mirror uses.
				if(m.action && document.body.dataset.kchatMode === "panel"
					&& window.katomiaChat?.canRender?.(m.action) && window.katomiaChat.action(m)) continue
				notify(m.message, m.type, { timeout: alertTimeouts[m.type] ?? 0 }) // persistent
			}
		if(data.type === "game_error") return  // errors included in notify
				
		
		if(data.type !== "game_state") glog(`websocket data IGNORED for type=${data.type}`, data)
		if(data.type !== "game_state") return

    // FEEDBACK-DEMOLOAD1 (user 2026-08-01): while the feedback widget is capturing a
    // screenshot, DON'T re-render — html-to-image clones the live DOM and a mutation
    // mid-clone throws/hangs, which is how sending feedback on a running demo circle
    // crashed the page. Skipping is lossless here: every broadcast carries the FULL
    // state, so the next one (seconds away on a demo board) repaints everything.
    if(window.__kfwCapturing){ glog("state skipped — feedback screenshot in progress"); return }

    // KFLOW1: first-state marker — the moment the game is actually usable. Once
    // per pageload (kflow collapses consecutive dups anyway; this keeps it clean).
    if(!window.__kflowStateSeen){ window.__kflowStateSeen = true; window.kflow?.("game:state", "first", { gameId }) }

    gameMeta = data.meta || null
    state = data.state
    // PROP-ADDACCT1: survives exitGame() (which nulls gameMeta) so the add-account
    // modal still knows the game's network when re-adding after a 🗑️ exit.
    if(gameMeta?.network) window.__katomiaNetwork = gameMeta.network

    if(gameMeta?.network) kwcEarlyScope(gameMeta.network)
    
    document.body.dataset.tradingMode = gameMeta?.config?.tradingMode || ""
  
    currentPlayerId = data.myPlayerId || null

    // DEMO-SPECTATE1 (user 2026-07-30): the backend now distinguishes MAY VIEW from
    // MAY PARTICIPATE and tells us which we are. A spectator is subscribed to a public
    // game they cannot take part in — every mutating action is refused server-side, so
    // the UI must not offer controls that will only produce an error toast.
    // DEMO-SPECTATE1 R2 (user 2026-07-30): a spectator who raises a commitment mid-watch
    // should be upgraded without a page reload. The server decides the role at JOIN, so
    // the upgrade is simply a re-join on the same socket — cheap, and it reuses the one
    // code path that already knows how to compute the role. Only fires when we are
    // actually a spectator, so a normal player publishing a binding costs nothing.
    const wasSpectator = window.katomiaSpectator
    window.katomiaSpectator = !!data.spectator
    window.katomiaSpectatorReason = data.spectatorReason || null
    document.body.classList.toggle("spectating", !!data.spectator)
    if(wasSpectator && !data.spectator) notify?.("✅ You're in — your commitment was accepted.", "success", { timeout: 4000 })

    // DEMO-WATCHERS1: live audience, counted from open sockets server-side.
    window.katomiaWatching = Number.isFinite(data.watching) ? data.watching : null
    window.katomiaPlaying = Number.isFinite(data.playing) ? data.playing : null

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



// FEEDBACK-DEMOLOAD1: the feedback widget announces its screenshot capture window
// (kfw:capture-start/-end, added to feedback-widget.js the same day) so this page can
// hold state re-renders while the DOM is being cloned — see the guard in the game_state
// handler above. The flag self-clears on a safety timer too, in case an old widget
// build fires start without end.
window.addEventListener('kfw:capture-start', () => {
	window.__kfwCapturing = true
	clearTimeout(window.__kfwCaptureSafety)
	window.__kfwCaptureSafety = setTimeout(() => { window.__kfwCapturing = false }, 12000)
})
window.addEventListener('kfw:capture-end', () => {
	window.__kfwCapturing = false
	clearTimeout(window.__kfwCaptureSafety)
})
