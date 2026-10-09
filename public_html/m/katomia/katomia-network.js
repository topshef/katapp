
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

// SIDECIRCLE-SOFTSWAP1: recomputed by switchGame — the key names the circle this tab is IN
function accountCacheKey(){ return `katomiaAccounts:${gameId}:${getOrCreatePlayerToken()}` }
let ACCOUNT_CACHE_KEY = accountCacheKey()

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

// ── ASSETMEM1 (owner 2026-10-03): "when autoloading an account … all assets are added
// automatically even if they weren't before. So a timeout kicking out then refresh
// results in adding all assets … the last set of assets loaded should reload."
//
// Every automatic re-add (the per-game account cache after a backend restart or the
// idle sweep, ENTRY-AUTOADD1's connected-wallet add, a ?autoload= deep link) used to
// send the bare label, which the backend reads as the wildcard — every asset the mirror
// knows, including the ones the player had taken off the table (ASSETVIS1 hide, 🗑
// Remove from table). The table's composition is a choice the player made; it should
// survive the account being bounced.
//
// So: on every broadcast, remember per (circle, player) which assets each of my
// accounts has ON THE TABLE — its store, plus anything of its sitting in someone's
// basket as a standing offer (that left the store but is still the account's to give).
// Entries for accounts that are NOT in the broadcast are kept: an account the idle sweep
// just removed is exactly the one whose memory matters. An explicit 🗑 Remove account
// forgets it (a deliberate removal followed by a fresh add is a fresh add, everything
// in). The automatic paths then send "label(a,b)" — the filter the backend already
// honours, '#' as '-' on the wire — or "label(!none)" for an account that was on the
// table with nothing showing (ADDACCT-NONE1). A label with no memory (never seen in
// this circle) stays bare: first-time adds still bring everything, unchanged.
function assetsOnTableKey(){ return `katomiaAssetsOnTable:${gameId}:${getOrCreatePlayerToken()}` }
function readAssetsOnTable(){
  try { const v = JSON.parse(localStorage.getItem(assetsOnTableKey()) || "{}"); return v && typeof v === "object" ? v : {} }
  catch(_){ return {} }
}
function rememberAssetsOnTable(){
  if(!gameId || !state?.accounts) return
  try {
    const mem = readAssetsOnTable()
    const accounts = Object.values(state.accounts)
    for(const a of accounts){
      if(!isMyAccount(a) || !a.label) continue
      const ids = new Set(Object.keys(a.assets || {}))
      for(const other of accounts)
        for(const item of other.basket || [])
          if(item.fromId === a.id && item.assetId) ids.add(String(item.assetId))
      mem[a.label] = [...ids]
    }
    localStorage.setItem(assetsOnTableKey(), JSON.stringify(mem))
  } catch(_){}
}
function forgetAssetsOnTable(label){
  try { const mem = readAssetsOnTable(); delete mem[label]; localStorage.setItem(assetsOnTableKey(), JSON.stringify(mem)) } catch(_){}
}
// the add-label an automatic re-add should send for this account
function rememberedAddLabel(label){
  if(/\(/.test(label)) return label          // the caller already chose a filter
  const ids = readAssetsOnTable()[label]
  if(!Array.isArray(ids)) return label        // never seen here — everything, as before
  if(!ids.length) return `${label}(!none)`
  return `${label}(${ids.map(id => String(id).replace("#", "-")).join(",")})`
}

function restoreCachedAccounts(){
  // KAT-BREAKOUT1 R3 (user 2026-08-19, second four-accounts report): NEVER restore
  // into a side circle — it starts as exactly the deal's accounts, full stop. The
  // cache is doubly wrong here: after a backend restart breakoutSeq resets, so a
  // fresh side circle REUSES an id (t-prop~1 again) and this per-game cache then
  // replays accounts written by a PREVIOUS circle that merely shared the name.
  // Normal games keep the restore (continuity after a backend restart).
  if(state?.parent) return
  if(window.katomiaAccountsRestored) return
  window.katomiaAccountsRestored = true

  const mine = new Set(getAccounts().filter(a => isMyAccount(a)).map(a => a.label))
  const missing = getCachedAccountLabels().filter(label => !mine.has(label))

  if(missing.length) addAccounts(missing.map(rememberedAddLabel).join(","))   // ASSETMEM1
}

// ENTRY-AUTOADD1 (user-approved 2026-08-05): connected wallet accounts join the
// game automatically with ALL assets — no add-account ceremony on the happy path.
// Preference: profile → Preferences "Automatically add my connected accounts…",
// ON by default (absent key = on; katomiaAutoAdd="0" disables), normal-mode
// visible. Passive WC read only (ensure=false) — never rebuilds the connector at
// page load; until kwcEarlyScope has the connector on this game's network the
// read returns [] and the next broadcast retries (bounded). The composer stays
// the curated path; spectators are refused server-side, skipped here for quiet.
let _autoAddTries = 0
async function maybeAutoAddAccounts(){
  if(window.__kautoAddDone || _autoAddTries > 6) return
  // KAT-BREAKOUT1 (user report 2026-08-18, t-prop~2): a SIDE CIRCLE starts as exactly
  // the settling cluster — auto-add then quietly poured the player's OTHER connected
  // accounts in ("I did a test with two accounts… it revealed four in the side
  // circle"), and the 2→4 membership repaint moments after arrival read as a
  // transition glitch. A settlement room keeps only the accounts that walked in;
  // the composer/manual add stays available if more are genuinely wanted.
  if(state?.parent) return
  const net = gameMeta?.network
  if(net !== "testnet" && net !== "mainnet") return
  if(window.katomiaSpectator) return
  if(localStorage.getItem("katomiaAutoAdd") === "0") return
  if(typeof kauthWCAccounts !== "function") return
  _autoAddTries++
  let wc = []
  try { wc = await kauthWCAccounts(net, false) } catch { return }
  if(!wc.length) return
  window.__kautoAddDone = true
  const mine = new Set(getAccounts().filter(a => isMyAccount(a)).map(a => a.label))
  const missing = wc.filter(id => !mine.has(id))
  if(!missing.length) return
  window.kflow?.("acct:autoadd", "go", { count: missing.length })
  try { notify?.(`Adding your connected account${missing.length > 1 ? "s" : ""} to the game — turn this off in You → Preferences`, "info", { timeout: 4000 }) } catch {}
  addAccounts(missing.map(rememberedAddLabel).join(","))   // ASSETMEM1
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

  // ASSETMEM1: the cache holds the BARE label. It is compared against account labels
  // on restore and cleared by label on remove — a cached "0.0.x(a,b)" matched neither,
  // so it was re-added on every load and came back after a 🗑 Remove account.
  rememberAccountLabels(labels.map(l => l.replace(/\(.*\)$/, "")))

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

function removeAccount(accountId, opts = {}){

  const account =
    getAccounts().find(x => x.id == accountId)

  if(!account) return

  // opts.confirmed: the caller already asked (profile Remove confirms with the
  // full disconnect+remove consequence, KAT-ACCTNORM1) — don't double-confirm
  const ok = opts.confirmed || confirm(
    `Remove account ${account.label}?\n\nAll assets and offers will be removed.`
  )

  if(!ok) return

  forgetAccountLabel(account.label)
  forgetAssetsOnTable(account.label)   // ASSETMEM1: a deliberate removal — the next add is a fresh add

  socket.send(JSON.stringify({
    type:"game_removeAccount",
    gameId,
    accountId
  }))
}

// GAME-ASSETREMOVE1 (user 2026-08-05, board tap→detail card): take one asset
// off the table — STORE only; the backend withdraws standing offers of it back
// first, so nobody's basket is falsified. Nothing on-chain changes.
function removeAssetFromTable(accountId, assetId){
  socket.send(JSON.stringify({ type: "game_removeAsset", gameId, accountId, assetId }))
}

// ── ASSETVIS1 (user 2026-09-05) — the other half of removeAssetFromTable ──────
// "show/hide means show them to the world in the store… hide would mean don't show
// them, the other people won't be able to pick them or review them."
//
// Hiding was already possible (removeAsset, or 🗑 Remove from table on the asset
// card) but there was no way BACK, so it read as a one-way delete rather than a
// visibility control. There is no new server action here and none is needed:
// addAccount already re-adds a named asset to an account that is in the game —
// "0.0.x(a,b)" filters the seed, and on an existing account that appends. So show
// is the existing add path with a one-asset filter, which re-seeds the current
// on-chain balance from the mirror.
//
// Deliberately NOT a client-side "hidden" flag: an asset that is off the table is
// off it in the game state, so nobody can offer, pick or price it. A flag would
// leave it live server-side and rely on every other surface to honour the hint.
//
// '#' is the display form of an NFT serial; '-' is the wire form the backend maps
// back (katomiaActions.addAccount). Same convention as katomia-addaccount.js.
// Several at once — "show all" on your own account. One message, one server-side
// mirror seed, instead of N of each.
function addAssetsToTable(accountId, assetIds){
  const ids = (assetIds || []).filter(Boolean)
  if(!ids.length) return
  const label = (state?.accounts?.[accountId]?.label) || String(accountId).split(":")[1] || accountId
  const filter = ids.map(id => String(id).replace("#", "-")).join(",")
  connect(() => socket.send(JSON.stringify({
    type: "game_addAccount",
    gameId,
    playerToken: getOrCreatePlayerToken(),
    label: `${label}(${filter})`
  })))
}

function addAssetToTable(accountId, assetId){
  const label = (state?.accounts?.[accountId]?.label) || String(accountId).split(":")[1] || accountId
  const filter = String(assetId).replace("#", "-")
  connect(() => socket.send(JSON.stringify({
    type: "game_addAccount",
    gameId,
    playerToken: getOrCreatePlayerToken(),
    label: `${label}(${filter})`
  })))
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
// STATSYNC1 P6: incremental updates are the DEFAULT — the board joins with
// wantDelta and consumes game_delta patches (proven by T:STATSYNC-01…04; ~90%
// wire saving on the probe). Full-state broadcast is demoted to a dev/debug
// opt-out: ?fullstate=1 (or localStorage katomiaFullState="1") restores the old
// behaviour — the task's end state. Protocol clients (bots, external agents) never
// send wantDelta and are untouched.
const wantDelta = !(new URLSearchParams(location.search).get("fullstate") === "1" || localStorage.getItem("katomiaFullState") === "1")

// QA-TESTHOOKS1: read-only state peek for the statsync harnesses — same gate as the
// board's offer hook, inert unless a harness sets __katomiaTestHooks before load.
window.__qaGetState = () => window.__katomiaTestHooks === true ? { state, gameMeta } : null

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

// ── WS-KEEPALIVE1 (user 2026-09-05: "it's taken quite a long time for some of the
// buttons like the add account and the sign button to work… quite a lag") ──────
//
// The /diag trail answered it. Their Mac session dropped the game socket every ~126
// SECONDS, to the tick, all afternoon — ws:error + ws:close with an empty message,
// then a clean reconnect, then another 126s:
//
//   11:10:27  11:12:34  11:14:41  11:16:47  11:18:53  11:21:00
//
// Metronomic timing with no user action is an IDLE TIMEOUT somewhere between the
// browser and the backend, not a fault in either. In a quiet circle nothing crosses
// the socket for minutes at a time, so the connection looks abandoned and gets culled.
// The resilience layer above then does its job silently — which is why this never
// showed up as an error, only as buttons that sometimes "take ages": a click landing
// in the dead window waits on a fresh connect + game_join before its message moves.
//
// The fix is simply to stop being idle. A tiny frame every 45s (comfortably inside
// the ~126s window) keeps the connection alive. No backend change is needed: the
// server's message handler ignores any type it doesn't recognise, so this costs one
// unread frame a minute and nothing else. Paused while the tab is hidden — a
// backgrounded tab gets throttled anyway and the visibilitychange wake below already
// covers the return.
const WS_KEEPALIVE_MS = 45000
let wsKeepaliveTimer = null
function stopWsKeepalive(){
  if(wsKeepaliveTimer){ clearInterval(wsKeepaliveTimer); wsKeepaliveTimer = null }
}
function startWsKeepalive(){
  stopWsKeepalive()
  wsKeepaliveTimer = setInterval(() => {
    if(!socket || socket.readyState !== WebSocket.OPEN) return stopWsKeepalive()
    if(document.visibilityState === "hidden") return
    try { socket.send(JSON.stringify({ type: "keepalive" })) } catch(e){}
  }, WS_KEEPALIVE_MS)
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

  // KAT-SAMEORIGIN-FE1: empty HAPI_BASE = same-origin mode — the vhost's /hapi/
  // reverse proxy carries the socket, so the backend host never reaches the browser
  const WS_URL = window.CONFIG.HAPI_BASE
    ? "wss://" + window.CONFIG.HAPI_BASE + "/ws"
    : "wss://" + location.host + "/hapi/ws"
  console.log({WS_URL})
  socket = new WebSocket(WS_URL)


  socket.onopen = async () => {

    wsReconnectDelay = 1000   // healthy connection — reset backoff
    startWsKeepalive()

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

		const payload = buildJoinPayload(intentPublicKey)

    window.kflow?.("game:join", intentPublicKey ? "keyed" : "plain", { gameId })
    socket.send(JSON.stringify(payload))
    socket.__joinedGame = gameId   // SIDECIRCLE-SOFTSWAP1: which circle this socket last joined
		glog("payload for game_join", payload)

		// DEMO-SPECTATE1 R2: expose a re-join so a spectator can be upgraded in place the
		// moment they raise a commitment (see onKatomiaBindingPublished below).
		// SIDECIRCLE-SOFTSWAP1: built fresh each time, so a re-join after a switch names
		// the circle the tab is in now, not the one this socket first opened on.
		window.katomiaRejoin = () => { try { socket.send(JSON.stringify(buildJoinPayload(cachedIntentKey))) } catch(e){ console.warn("[rejoin] failed", e) } }

		// join is on the wire — release anything queued behind it (see connect()).
		socket.__joined = true
		;(socket.__onJoined || []).splice(0).forEach(fn => { try { fn() } catch(e){ console.error(e) } })

    onOpenAction && onOpenAction()
  }

  socket.onclose = () => {
    glog("ws onclose")
    stopWsKeepalive()
    // WS-SIGNDIAG1 (user 2026-08-03, t-prop): sporadic "signature not picked up"
    // traced to sockets dying silently mid-signing (backend OOM storm that
    // afternoon). Every close is now a kdiag event, and a close DURING an active
    // signing window gets a visible toast — the state the user was staring at
    // is stale until the reconnect lands.
    let signingNow = false
    try { signingNow = typeof boardSigning !== "undefined" && !!boardSigning } catch(e){}
    try { window.kdiag?.("ws:close", { signing: signingNow, gameId: typeof gameId !== "undefined" ? gameId : null }) } catch(e){}
    try {
      // TXSTATUS-MSGORDER1: only warn if a signature is GENUINELY still outstanding.
      // boardSigning can lag terminal (the WS often drops at the very moment a tx settles),
      // so gating on it alone surfaced "sign status may lag" AFTER "Transaction successful".
      // The controller knows terminality; if it says nothing is live, stay quiet.
      const stillWaiting = window.katomiaTxStatus?.signingLive
        ? !!window.katomiaTxStatus.signingLive()
        : signingNow
      if(signingNow && stillWaiting && typeof notify === "function")
        notify("Connection dropped — reconnecting… sign status may lag a moment", "warning", { timeout: 4000 })
    } catch(e){}
    scheduleWsReconnect()
  }
  socket.onerror = (e) => {
    glog("ws onerror", { msg: String(e?.message || "") })
    try { window.kdiag?.("ws:error", { msg: String(e?.message || "") }) } catch(_){}
    try { socket.close() } catch {}
  }

	
	socket.onmessage = katomiaHandleFrame   // SIDECIRCLE-SOFTSWAP1: lifted out of connect() — see below
	
}
	
	const alertTimeouts = {warning: 3000, error: 0, info: 3000, success: 4000, event: 3000}

	// STATSYNC1 P5: mirror of backend kdiff.js kpatch + the gap protocol proven by
	// T:STATSYNC-03. A game_delta whose baseSeq matches the last applied seq is
	// COMMITTED here (state/gameMeta mutated directly — so a delta stays lossless
	// even when the render below is skipped, e.g. during a feedback screenshot),
	// then returned as a normalised game_state-shaped payload for the untouched
	// render path. On any gap: ONE game_refresh, deltas ignored until it lands.
	let __refreshPending = false
	const kpatch = (obj, ops) => {
		for(const { op, path, value } of ops){
			let t = obj
			for(const k of path.slice(0, -1)) t = t[k] ?? (t[k] = {})
			const last = path[path.length - 1]
			if(op === "remove") delete t[last]
			else t[last] = value
		}
		return obj
	}
	const kdeltaApply = d => {
		if(!state || d.baseSeq !== window.__stateSeq || __refreshPending){
			if(!__refreshPending){
				__refreshPending = true
				glog("delta gap — requesting refresh", { baseSeq: d.baseSeq, have: window.__stateSeq })
				try { window.kdiag?.("statsync:gap", { baseSeq: d.baseSeq, have: window.__stateSeq }) } catch(_){}
				try { socket.send(JSON.stringify({ type: "game_refresh", gameId })) } catch(_){}
			}
			return null
		}
		// field list mirrors the server's broadcast snap — KAT-BREAKOUT1 added moved/
		// parent to both ends (the twin whitelists silently dropped them; found by
		// T:BREAKOUT-01 B5b: full-state sockets saw the breadcrumbs, delta sockets never did)
		const root = { meta: gameMeta, accounts: state.accounts, players: state.players, tx: state.tx, narrate: state.narrate,
			moved: state.moved || null, parent: state.parent || null }
		kpatch(root, d.patch || [])
		const chat = [...(state.chat || []), ...(d.chatAppend || [])]
		if(chat.length > 150) chat.splice(0, chat.length - 150)
		gameMeta = root.meta
		Object.assign(state, { accounts: root.accounts, players: root.players, tx: root.tx, narrate: root.narrate, chat,
			moved: root.moved, parent: root.parent })
		window.__stateSeq = d.seq
		window.__deltaApplied = (window.__deltaApplied || 0) + 1   // QA counter (T:STATSYNC-04)
		return { ...d, type: "game_state", meta: gameMeta, state }
	}

	// KAT-DUPEQUIET1 (user 2026-08-07): backend notices with NOTHING for the user
	// to do about them. No toast, ever — but not deleted either ("I'm mindful
	// there might be some weird edge case where we want to know that"), so nerd
	// mode still gets the row in the message stream. Add a code here to quieten a
	// new class of no-action notice; the backend tags it via ctx.info(msg, code).
	const QUIET_CODES = new Set(["asset-dupe"])

// SIDECIRCLE-SOFTSWAP1: the socket's message handler, lifted out of connect() so it has
// a name — the demo sandbox (katomia-board.js boardDemoApply) feeds it synthetic frames
// (game_moved, the side circle's game_state) to exercise the in-page switch offline,
// and the real socket simply points at it. Nothing inside changed by the move except
// what the SIDECIRCLE-SOFTSWAP1 comments mark.
async function katomiaHandleFrame(msg){

		let data = JSON.parse(msg.data)   // let: a game_delta is normalised into a game_state below (STATSYNC1 P5)
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
				// User 2026-08-05 ("I've gone full circle — the noise was the lock/unlock
				// events, take them off, comment them out for now"): lock state is fully
				// visible on the board (arcs, 🔒 in the footer list), so these rows and
				// toasts carry no read value — dropped entirely. If missed, resurrect as
				// a nerd-mode "show user actions" toggle (the inverted-option idea from
				// the same session) rather than un-suppressing globally.
				if(m.action && (m.action.kind === "lock" || m.action.kind === "unlock")) continue
				// CHAT-COMMITGATE1 R2 (user 2026-08-05): the authenticate pop-up IS the
				// alert — no toast and no stream row on top of it (three tellings of one
				// thing). The DOM event still fires so the modal opens + text restores.
				// KAT-DUPEQUIET1: quiet codes never toast. Nerd mode keeps them as a
				// stream row (panel mode only — that's where the stream is); normal
				// mode drops them entirely.
				if(m.code && QUIET_CODES.has(m.code)){
					if(document.body.classList.contains("nerd") && document.body.dataset.kchatMode === "panel")
						try { window.katomiaChat?.system?.("ℹ️ " + m.message) } catch(_){}
					continue
				}
				if(m.code === "chat-identity"){
					try { document.dispatchEvent(new CustomEvent("katomia:gamemsg", { detail: m })) } catch(_){}
					continue
				}
				// panel mode only (R2): in bubbles mode the panel lists are hidden, so a
				// routed action would be invisible AND its toast suppressed — the same
				// mode gate notify()'s own chat mirror uses.
				if(m.action && document.body.dataset.kchatMode === "panel"
					&& window.katomiaChat?.canRender?.(m.action) && window.katomiaChat.action(m)) continue
				notify(m.message, m.type, { timeout: alertTimeouts[m.type] ?? 0 }) // persistent
				// ADDACCT-ROBUST1 (user 2026-08-05): a modal mid-action (add-account stuck
				// on "Adding…") never heard the backend's failure toast — mirror every
				// backend message as a DOM event so open modals can show it in their own
				// status line instead of leaving the user staring at a dead spinner.
				try { document.dispatchEvent(new CustomEvent("katomia:gamemsg", { detail: m })) } catch(_){}
			}
		// KAT-BREAKOUT1 P1 (spec §5): your cluster struck a deal and the game broke it
		// out — follow it. The side circle contains exactly the ceremony members, so
		// the landing board is the collapsed view the strike would have shown here.
		// SIDECIRCLE-SOFTSWAP1 (owner 2026-10-02, after BREAKOUT-LEAVEANIM1: "you still get
		// this flash of jumping from one page to another … smooth and seamless"): the
		// spec's soft in-page swap, now built. The tab stays on this page: the non-party
		// segments shrink out (boardPlayMoveOut), then switchGame re-points the tab at the
		// side circle — same socket, a second game_join (the server moves the subscription,
		// WSMAPS-CLEAN1), the URL/tab name rewritten in place — and the side circle's first
		// game_state paints over the collapsed board with the same accounts already in
		// their seats, so the only visible change is the signing phase arriving. The hard
		// navigation stays as the fallback (localStorage katomiaSoftSwap=0, for comparison
		// or if the in-place path ever misbehaves). Guarded once per target: a re-broadcast
		// must not double-switch.
		if(data.type === "game_moved"){
			if(data.to && window.__kMovedTo !== data.to){
				window.__kMovedTo = data.to
				const url = location.pathname.replace(/\/board\/[^/]+/, "/board/" + data.to) + location.search
				let soft = true
				try { soft = localStorage.getItem("katomiaSoftSwap") !== "0" } catch(_){}
				try { window.katomiaChat?.system?.("Your deal moved to side circle " + data.to + (soft ? " — following it…" : " — taking you there…")) } catch(_){}
				const go = () => { location.href = url }
				const leave = soft ? () => switchGame(data.to) : () => { if(window.kfade?.enabled) kfade.leave(go); else go() }
				// BREAKOUT-LEAVEANIM1 (feedback oscar-xray-50, 2026-10-02): the non-party segments
				// shrink out first — the membership tween a joiner/leaver gets — THEN the switch
				// (or, on the fallback path, the fade and the hop), so what follows lands on a
				// board that already looks like the side circle instead of the parent vanishing
				// mid-frame. Falls through when the board has nothing to animate (other skins,
				// no leavers, not on a board).
				if(!(typeof boardPlayMoveOut === "function" && boardPlayMoveOut(data, leave))) leave()
			}
			return
		}
		// KAT-BREAKOUT1 (transition polish, user 2026-08-18 "some kind of jump"): once
		// we're leaving for the side circle, the PARENT's post-split broadcast (our
		// accounts removed → membership tween) races the exit — freeze the board on its
		// last frame instead of repainting a world we're already leaving.
		// SIDECIRCLE-SOFTSWAP1: while the switch is in flight the freeze holds for every
		// frame that is not the side circle's own full state: a delta would patch whichever
		// base it matched (the parent's post-split patch removes OUR accounts), and a late
		// parent game_state is the world we left. The first game_state whose meta names the
		// new circle lifts the freeze and lets the board drop its move-out filter — from here
		// on the server only sends this circle.
		if(window.__kMovedTo){
			if(data.type === "game_delta") return
			if(data.type === "game_state"){
				if(!window.__kSwitchingTo) return
				const got = (data.meta && data.meta.id) || data.gameId || null
				if(got !== window.__kSwitchingTo){ glog("state for another circle ignored during switch", { got, want: window.__kSwitchingTo }); return }
				window.__kSwitchingTo = null
				window.__kMovedTo = null
				try { if(typeof boardMoveOutDone === "function") boardMoveOutDone() } catch(_){}
				try { window.kdiag?.("board:sidecircle:arrived", { id: got }) } catch(_){}
			}
		}
		if(data.type === "game_error") return  // errors included in notify

		// STATSYNC1 P5: normalise an incremental update into a full game_state (or
		// bail while a gap refresh is in flight) — everything below stays unchanged.
		if(data.type === "game_delta"){
			const normalised = kdeltaApply(data)
			if(!normalised) return
			data = normalised
		}

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
    // STATSYNC1 P5: track the broadcast seq (delta base) and clear any pending
    // gap-refresh — a full game_state (broadcast or refresh reply) is a clean base.
    if(data.seq != null) window.__stateSeq = data.seq
    __refreshPending = false
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

    rememberAssetsOnTable()   // ASSETMEM1: before any re-add below reads the memory
    restoreCachedAccounts()
    maybeAutoAddAccounts()

    if(window.pendingAutoload){
      // PROP-ADDACCT1: autoload adds directly — the old path staged it via the
      // (now removed) inline account input before clicking Add.
      // ASSETMEM1: a bare label in the link re-adds what this account last had on the
      // table here; a label the link itself filters is sent as written.
      addAccounts(splitAccountLabels(String(window.pendingAutoload)).map(rememberedAddLabel).join(","))
      window.pendingAutoload = null
    }

		glog(`state received for ${currentPlayerId}`, {gameMeta, state})

		// PROP-LOCKSIGN1: while any of my accounts is locked, re-sign the (possibly
		// changed) board basis so my lock commitment never goes stale — a board change
		// does not unlock me. Fire-and-forget; hash-guarded inside.
		if(typeof maybeRefreshLockCommitment === "function")
			maybeRefreshLockCommitment().catch(e => console.error("[lock] re-sign failed", e))

		// BOARD-DRAGFLICKER1 (user 2026-08-05): a broadcast repaint MID-DRAG redraws
		// the whole board under the finger — visible flicker, and this handler paints
		// twice per broadcast (render → enrich → render) which doubles it. While a
		// touch drag is live the state above still updates but the repaint is
		// deferred; boardTouchDrag runs it once on release.
		if(window.__boardDragging){ window.__boardRenderPending = true; return }
		await render()
		// ENRICH-COLDPATH1 (2026-08-08): these two were awaited in SERIES, labels
		// first. enrichAccountLabels calls a THIRD PARTY (xproof.live) once per
		// mainnet account, so any slow or hung account query blocked every asset
		// name and thumbnail on the board — and since enrichment only runs on a
		// state broadcast, a quiet board then stayed unenriched indefinitely.
		// Measured live: xproof /domain/query/0.0.9940704 never responded (>30s)
		// while 0.0.25200 answered in 33ms, and assets NEVER enriched.
		// Assets are the visible thing and are independent of labels — run both
		// concurrently, and never let either one's failure sink the other.
		await Promise.all([
			enrichAccountAssets().catch(e => console.error("[enrich] assets failed", e)),
			enrichAccountLabels().catch(e => console.error("[enrich] labels failed", e))
		])
		await loadThumbCache()
		render()

	}

// SIDECIRCLE-SOFTSWAP1: the join frame, built fresh each time it is sent — on open, on
// reconnect, on a spectator re-join and on a switch — so it always names the circle
// this tab is in NOW (gameId is reassigned by switchGame).
function buildJoinPayload(intentPublicKey){
	return {
		type: "game_join",
		gameId,
		playerToken: getOrCreatePlayerToken(),
		playerName: "anon",
		// KFLOW1: thread the frontend run + visit ids so backend checkpoints on this
		// socket join the same flow fingerprint (stored on the socket server-side)
		...(window.kflow ? { kflowRun: window.kflow.run, kflowVisit: window.kflow.visit } : {}),
		...(intentPublicKey ? { intentPublicKey } : {}),
		...(wantDelta ? { wantDelta: true } : {})   // STATSYNC1 P5
	}
}

// SIDECIRCLE-SOFTSWAP1: re-point this tab at another circle without a page load. What a
// fresh load of /board/<to> would have established, re-established here: the circle id
// every outgoing frame carries (gameId), the per-circle account cache key, the address
// bar (replaceState — Back still returns to wherever the tab came from, not to the
// parent mid-ceremony), the tab name and title (TABTARGET1 / TABTITLE1), the chat
// stream's dedupe baseline (the side circle's ids restart at 1), and the server-side
// subscription via a second game_join on the same socket (the player record already
// exists in the child — splitGame cloned it — so joinGame finds it and does not
// re-greet; WSMAPS-CLEAN1 drops the socket from the parent's set). The reply is the
// child's broadcast, and katomiaHandleFrame lets exactly that frame through the freeze.
// If the socket is mid-reconnect, onopen's own join already names the new circle, so
// the queued action skips its duplicate.
// read-only peek for QA and other scripts (the binding itself lives in the page's shared
// script scope, so a probe cannot reach it by name)
window.katomiaGameId = () => gameId
function switchGame(to){
	window.__kSwitchingTo = to
	gameId = to
	ACCOUNT_CACHE_KEY = accountCacheKey()
	try {
		// the clean route (/board/<id>) and the legacy query form (?game=<id>) both name the circle
		const u = new URL(location.href)
		u.pathname = u.pathname.replace(/\/board\/[^/]+/, "/board/" + to)
		if(u.searchParams.has("game")) u.searchParams.set("game", to)
		history.replaceState(history.state, "", u.pathname + u.search + u.hash)
	} catch(_){}
	try { window.name = decodeURIComponent(to) } catch(_){ try { window.name = to } catch(__){} }
	try { document.title = window.name + " · katomia" } catch(_){}
	try { window.katomiaChat?.rebase?.() } catch(_){}
	try { window.kdiag?.("board:sidecircle:switch", { to }) } catch(_){}
	window.kflow?.("game:switch", "", { gameId: to })
	connect(() => {
		if(!socket || socket.readyState !== 1) return
		try {
			if(socket.__joinedGame !== gameId){
				socket.__joinedGame = gameId
				socket.send(JSON.stringify(buildJoinPayload(cachedIntentKey)))
			}
			// The join's broadcast is a FULL state unless the server happens to see this socket
			// as one seq behind the new circle (its delta base is per socket, carried over from
			// the parent) — a coincidence, but a delta is dropped during the switch and nothing
			// else would follow. A refresh is always answered with the full state, to this
			// socket only, and lands after the join (same socket, in order), so arrival is
			// guaranteed either way; a second full state is harmless.
			socket.send(JSON.stringify({ type: "game_refresh", gameId }))
		} catch(e){ console.warn("[switch] join failed", e) }
	})
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
