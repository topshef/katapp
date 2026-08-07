import {
  DAppConnector,
  HederaJsonRpcMethod,
  HederaSessionEvent,
  HederaChainId,
} from "@hashgraph/hedera-wallet-connect";
import { Transaction, LedgerId } from "@hashgraph/sdk";
// import { createTransactionAlert } from "./dealPage.js";

let dappConnector;
let walletConfig

// Step 2: the currently-selected account when multiple are connected. null = use
// the first available signer (preserves single-account behaviour). Set on connect
// (newest wins, mirroring the old trim-to-last intent) and via setActiveAccount().
let activeAccountId = null



/*============================================================
	EL_LOADER – Script Resolution (Dev + Production Safe)
	------------------------------------------------------------
	Purpose:
	Determine which <script> tag loaded this bundle so that we
	can read:
		- data-config
		- data-mode
		- other dataset attributes
	
	Why this exists:
	- In production (IIFE build), document.currentScript works.
	- In dev (ES module via Vite), document.currentScript is null.
	- We must explicitly locate the dev entry script.
	
	Resolution order:
	1. Classic script (production bundle)
	2. Dev entry script (/vendor/walletconnect/dev.js)
	3. Legacy fallback match (walletconnect-hedera filename)
	4. Throw hard error if nothing found
	
	This allows:
	- Same data-config path in dev + prod
	- Same data-mode usage
	- No environment branching elsewhere
=============================================================*/

// Script tag that loaded this bundle (used to resolve config + metadata)
// ---- capture THIS script once (safe for async / base href / bundling)
const EL_LOADER = (() => {

  // 1️⃣ If classic script (IIFE build)
  if (document.currentScript?.src)
    return document.currentScript

  // 2️⃣ If running as ES module (dev mode)
	if (typeof import.meta !== "undefined" && import.meta.url) {
		// In dev, the entry script is dev.js
		const script = document.querySelector(
			'script[src*="/vendor/walletconnect/dev.js"]'
		)

		if (script)
			return script

		return {
			src: import.meta.url,
			dataset: {}
		}
	}

  // 3️⃣ Fallback filename match (legacy safety)
  const script =
    document.querySelector('script[src*="walletconnect-hedera"]')
	console.warn('UH73663 legacy fallback used - pls check and fix')
	
  if (script)
    return script

  throw new Error("[WC-001] WalletConnect script tag not found")
})()


// walletConnectMode
// Determines how the bundle exposes control (default = button-based)
const WALLETCONNECT_MODE =
  (EL_LOADER.dataset?.mode || "").toLowerCase() || "default"

console.info(
  "[WC] Initialising WalletConnect bundle in mode:",
  WALLETCONNECT_MODE
)

//  WALLETCONNECT_MODE
// | Script tag             | Result                 |
// | ---------------------- | ---------------------- |
// | no `data-mode`         | `"default"`            |
// | `data-mode=""`         | `"default"`            |
// | `data-mode="headless"` | `"headless"`           |
// | typo / unknown         | treated as `"default"` |



/**
 * Expects a config.json file to exist alongside the bundled JS file
 * (i.e. in the same directory as walletconnect-hedera.iife.js).
 *
 * This loader supports the following config.json shape:
 *
 * {
 *   "projectId": "...",
 *   "relayUrl": "wss://relay.walletconnect.com",
 *   "metadata": { "name": "...", "description": "...", "url": "...", "icons": [] },
 *   "requiredNamespaces": { "hedera": { ... } }
 * }
 */


// High-level mental grouping (not file structure)
//
// --- WalletConnect lifecycle & session management
// loadConfig
// initializeWalletConnect
// restoreWalletSession
// openWalletConnectModal
// handleDisconnect
//
// --- Hedera network & SDK helpers
// getHederaNetworkFromNamespaces
// hederaChainIdFromNetwork
// prepareTransaction
// parseTxId
//
// --- Transaction execution & signing
// processTransactionBytes
// signTransactionBytesOnly
//
// --- Deal orchestration (cross-cutting)
// executeDealFlow  // spans: UI input, API IO, tx inspection, signing, submission
//
// --- UI / view helpers
// updateWalletConnectionUI
//
// Notes:
// - Functions appearing in multiple sections are good candidates for future splits
// - executeDealFlow is intentionally orchestration-heavy
// - Utilities are already fairly clean; most coupling lives in the orchestration layer





// ┬ ┬┌─┐┬  ┬  ┌─┐┌┬┐┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐  ┌─┐┌─┐┬─┐┌─┐
// │││├─┤│  │  ├┤  │ │  │ │││││││├┤ │   │───│  │ │├┬┘├┤ 
// └┴┘┴ ┴┴─┘┴─┘└─┘ ┴ └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴   └─┘└─┘┴└─└─┘
// walletconnect-core


 let walletUI = {
   showAlert: (msg, type) => {
     console.warn("[WC]", type, msg)
   },
   showTxAlert: () => {}
 }

export function registerWalletUI(ui) {
  walletUI = { ...walletUI, ...ui }
}


// loadConfig
// Loads, validates, and normalises the WalletConnect config.json used to initialise the dapp connector.
//
// Suggestions:
// - Could split URL resolution vs fetch vs validation later
// - Mostly a config bootstrap concern, not WalletConnect lifecycle
async function loadConfig() {
  try {
    let configUrl

		// const dataConfig = EL_LOADER.dataset?.config // 1️⃣ explicit data-config on script tag
		// if (dataConfig) {
			// if (dataConfig.startsWith("http://") || dataConfig.startsWith("https://")) {
				// configUrl = dataConfig
			// } else if (dataConfig.startsWith("/")) {
				// configUrl = window.location.origin + dataConfig
			// } else {
				// configUrl = new URL(dataConfig, EL_LOADER.src).href
			// }
		// }

		const dataConfig = EL_LOADER.dataset?.config

		// Deterministic fallback: config.json next to bundle
		const fallbackUrl = new URL(
			"config.json",
			// YH76543 note default is not consistent across dev snapshot releases due to path length
			// "../config.json",  // this woudl go up one level  (relative to the htaccess public path, NOT the files themselves)
			// "../../config.json",  // this woudl go up 2 levels
			EL_LOADER.src
		).href

		console.info("[WC] TG22870 Loader src:", EL_LOADER.src)
		console.info("[WC] TG22871 data-config attribute:", dataConfig)
		console.info("[WC] TG22872 Fallback would resolve to:", fallbackUrl)

		if (dataConfig) {
			if (dataConfig.startsWith("http://") || dataConfig.startsWith("https://")) {
				configUrl = dataConfig
			} else if (dataConfig.startsWith("/")) {
				configUrl = window.location.origin + dataConfig
			} else {
				configUrl = new URL(dataConfig, EL_LOADER.src).href
			}
		} else {
			configUrl = fallbackUrl
		}

		if (!configUrl)
			throw new Error("[WC-102] configUrl unresolved")

    console.info("[WC] TG22874 Loading config from", configUrl)
		
    const response = await fetch(configUrl)
    if (!response.ok) {
      alert(
        `[WC-101] Failed to load config.json\n\n${configUrl}\n\nStatus: ${response.status}`
      )
      throw new Error("Failed to load config.json")
    }

    const rawConfig = await response.json()


    const urlNetwork =
      new URLSearchParams(window.location.search)
        .get("network")?.toLowerCase()
        
        
    // ---- hard validation ----
    if (!rawConfig.projectId)
      throw new Error("[WC-201] config.json missing projectId")

    if (!rawConfig.metadata?.name)
      throw new Error("[WC-202] config.json missing metadata.name")

    if (!rawConfig.requiredNamespaces?.hedera)
      throw new Error("[WC-203] config.json missing requiredNamespaces.hedera")

    let hederaNetwork =
      getHederaNetworkFromNamespaces(rawConfig.requiredNamespaces)

    if (urlNetwork && ["mainnet","testnet","previewnet"].includes(urlNetwork)) {
      console.log("[WC] URL override network =", urlNetwork)
      hederaNetwork = urlNetwork
    }

    const finalConfig = {
      metadata: rawConfig.metadata,
      hedera: { network: hederaNetwork },
      walletConnect: {
        projectId: rawConfig.projectId,
        relayUrl: rawConfig.relayUrl || "wss://relay.walletconnect.com",
        requiredNamespaces: rawConfig.requiredNamespaces
      }
    }

    walletConfig = finalConfig
    return finalConfig
  } catch (error) {
    console.error("[WC] YH84775 Error loading config.json:", error)
    alert(
      `[WC-999] WalletConnect config load failed\n\n${error.message}`
    )
    throw error
  }
}


// initializeWalletConnect
// Creates and initialises a WalletConnect DAppConnector using loaded config, handling reconnects.
//
// Suggestions:
// - Doing config load + disconnect + init is a lot for one function
// - Reads like a lifecycle step rather than a one-off init

let wcInitPromise = null
let currentNetwork = null   // the Hedera network the live dappConnector is built for

// WC-DOUBLEINIT1 (2026-08-07, traced from kdiag on lab2): every page load emitted TWO
// `wc:build` events ~3ms apart — i.e. TWO DAppConnectors, each with its own SignClient
// and relay socket, sharing ONE localStorage store. They then delete each other's
// records, which is the source of the whole "endless WC shit" symptom cluster seen in
// the same logs: "No matching key. proposal: …", "Pending session not found for topic
// …", "emitting session_ping:… without any listeners", and finally "User disconnected."
// mid-sign. Recovering from that costs a full re-pair (~20-40s measured), which is
// LONGER than a Hedera tx's 40s validity window — so every affected transaction expired
// before its signature landed (three mainnet txs on 2026-08-07 never reached consensus).
//
// Cause: initializeWalletConnect() was memoised via wcInitPromise, but ensureNetwork()
// was NOT — its `dappConnector && currentNetwork === network` check runs BEFORE the
// await, so two concurrent callers (katomia-auth.js on page init and the kpool widget's
// signer-walletconnect.js both call ensureNetwork(net)) each saw no connector and each
// built one. This chain serialises ALL connector construction and re-checks inside the
// critical section, so the second caller reuses what the first built.
let wcBuildChain = Promise.resolve()

console.log("WIP HG38472")

// Build (and init) a DAppConnector for a specific Hedera network.
async function buildConnectorForNetwork(net) {
  // WC-SLOW1 timing: c.init() does SignClient.init() = the relay (wss) handshake +
  // session restore, the usual suspect for the slow first open. Emit phase timings
  // via window.kdiag (kpool widget buffer + /diag) so the ~30s is attributable.
  const _t0 = (typeof performance !== 'undefined' ? performance : Date).now()
  const config = await loadConfig()
  const _t1 = (typeof performance !== 'undefined' ? performance : Date).now()
  const c = new DAppConnector(
    { ...config.metadata },
    LedgerId.fromString(net),
    config.walletConnect.projectId,
    Object.values(HederaJsonRpcMethod),
    [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
    [hederaChainIdFromNetwork(net)]
  )
  await c.init()
  const _t2 = (typeof performance !== 'undefined' ? performance : Date).now()
  try { window.kdiag?.('wc:build', { net, loadConfigMs: Math.round(_t1 - _t0), initMs: Math.round(_t2 - _t1) }) } catch {}
  watchRelayer(c)   // WC-RELAYHEALTH1: health flag + auto transport restart + in-flight guard
  // keep walletConfig.hedera.network in sync with the connector we actually built,
  // so getNetwork() reports the live network (not just the load-time config).
  walletConfig = { ...config, hedera: { ...config.hedera, network: net } }
  return c
}

async function initializeWalletConnect() {

  if (wcInitPromise) return wcInitPromise
  // WC-DOUBLEINIT1: queue behind any build already in flight (an ensureNetwork() may be
  // mid-construction), then re-check — it may have produced the connector we need.
  wcInitPromise = wcBuildChain.then(async () => {
    if (dappConnector) return dappConnector
    const config = await loadConfig()
    const net = config.hedera.network
    dappConnector = await buildConnectorForNetwork(net)
    currentNetwork = net
    return dappConnector
  })
  wcBuildChain = wcInitPromise.catch(() => {})

  return wcInitPromise
}

// ── WC-RELAYHEALTH1 (2026-08-04) ─────────────────────────────────────────────
// The relay websocket can die silently (2026-08-03 OOM storm; 2026-08-04 wedged
// testnet session that ate every t-prop sign for 3 hours): wc.signTx then never
// resolves — no error, no event; the board's 25s/60s watchdogs were the only
// visibility. Three defences, all in-bundle:
//   1. watchRelayer — subscribe to the core relayer's lifecycle events, keep a
//      health flag (WC.relayHealthy()), kdiag every transition, and auto
//      restartTransport() on disconnect/stall (backoff, capped at 10s).
//   2. pingSession — wc_sessionPing round-trips dApp→relay→wallet→back; a wedged
//      link fails in seconds instead of hanging a sign forever. signTx runs it
//      as a preflight (restart + retry once), so a stale session surfaces BEFORE
//      the wallet prompt as a real error naming the actual fix (disconnect the
//      site in the wallet, re-pair — reloads don't help, the session persists in
//      localStorage).
//   3. in-flight guard — a sign in flight when the transport drops gets 15s for
//      the auto-restart to recover (the relay mailboxes responses, so a late
//      answer still lands after reconnect), then rejects with a real error; a
//      2-minute absolute cap kills the eternal await for good.
let relayHealth = { healthy: null, lastEvent: null, lastChangeAt: 0, restarts: 0 }
const _wcInFlight = new Set()

function _khealth(ev, healthy, extra) {
  relayHealth = { ...relayHealth, healthy, lastEvent: ev, lastChangeAt: Date.now() }
  try { window.kdiag?.("wc:relay:" + ev, { net: currentNetwork, inFlight: _wcInFlight.size, restarts: relayHealth.restarts, ...extra }) } catch {}
}

function watchRelayer(c) {
  const relayer = c?.walletConnectClient?.core?.relayer
  if (!relayer || relayer.__kwcWatched) return
  relayer.__kwcWatched = true
  relayHealth.healthy = !!relayer.connected
  relayer.on("relayer_connect", () => {
    _khealth("connect", true)
    for (const g of _wcInFlight) { clearTimeout(g.lossTimer); g.lossTimer = null }
  })
  const onLoss = ev => () => {
    _khealth(ev, false)
    _scheduleRelayRestart(relayer)
    for (const g of _wcInFlight)
      if (!g.lossTimer) g.lossTimer = setTimeout(() =>
        g.reject(new Error("KWC-RELAY-LOST: the wallet relay connection dropped mid-request and did not recover — open your wallet app, disconnect this site, then reconnect and try again.")), 15_000)
  }
  relayer.on("relayer_disconnect", onLoss("disconnect"))
  relayer.on("relayer_connection_stalled", onLoss("stalled"))
  relayer.on("relayer_error", e => { try { window.kdiag?.("wc:relay:error", { net: currentNetwork, error: String(e?.message || e) }) } catch {} })
}

let _relayRestartTimer = null
function _scheduleRelayRestart(relayer, delayMs = 800) {
  if (_relayRestartTimer) return
  _relayRestartTimer = setTimeout(async () => {
    _relayRestartTimer = null
    if (relayer.connected) return
    relayHealth.restarts++
    try {
      await relayer.restartTransport()
      _khealth("restarted", !!relayer.connected)
    } catch (e) {
      try { window.kdiag?.("wc:relay:restart-fail", { error: String(e?.message || e) }) } catch {}
      _scheduleRelayRestart(relayer, Math.min(delayMs * 2, 10_000))
    }
  }, delayMs)
}

function _guardInFlight(label) {
  const g = { label, lossTimer: null, settled: false }
  g.promise = new Promise((_, rej) => { g.reject = rej })
  // `settled` lets late async work (e.g. signTx's advisory ping, which resolves ~4s
  // in and may land after the wallet already answered) see that the request is over
  // and skip arming any further timers.
  g.done = () => { g.settled = true; clearTimeout(g.lossTimer); _wcInFlight.delete(g) }
  _wcInFlight.add(g)
  return g
}

// wc_sessionPing the ACTIVE session — proves the whole dApp→relay→wallet loop,
// which is exactly the loop that goes silently dead. ok:false + reason in ~4s.
async function pingSession({ timeoutMs = 4000 } = {}) {
  await initializeWalletConnect()
  const topic = getSigner()?.topic
  if (!topic) return { ok: false, reason: "no-session" }
  const t0 = Date.now()
  try {
    await Promise.race([
      dappConnector.walletConnectClient.ping({ topic }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("ping timeout")), timeoutMs))
    ])
    return { ok: true, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, reason: String(e?.message || e) }
  }
}

// ensureNetwork (step 5) — scope the connector to the transaction's network.
// The bundle is single-connector; on the katomia page it loads as mainnet. When a
// signer opens for a testnet tx it must NOT show/connect mainnet accounts. If the
// requested network differs from the live connector's, rebuild the connector for it
// (each network is a separate account set on Hedera). Switching networks therefore
// re-pairs — correct, since mainnet and testnet are different wallets/accounts.
async function ensureNetwork(network) {
  // No target → just ensure SOMETHING is initialised (legacy/default path).
  if (!network) { await initializeWalletConnect(); return currentNetwork }

  // Already on the right network → nothing to do.
  if (dappConnector && currentNetwork === network) return currentNetwork

  // WC-DOUBLEINIT1: everything below CONSTRUCTS a connector, so it must not run
  // concurrently with another construction. Serialise on wcBuildChain and re-check the
  // fast path INSIDE the critical section — the check above is not enough on its own,
  // because it is evaluated before any await and so cannot see a build that a
  // concurrent caller has already started (that is exactly the two-client bug).
  const _run = wcBuildChain.then(() => ensureNetworkLocked(network))
  wcBuildChain = _run.catch(() => {})
  return _run
}

async function ensureNetworkLocked(network) {
  // re-check now that we hold the lock: a concurrent caller may have just built this
  if (dappConnector && currentNetwork === network) return currentNetwork

  // WC1/double-init fix: build DIRECTLY for the requested network. The old code did
  // `await initializeWalletConnect()` first, which builds the config-default network
  // (mainnet) and THEN we rebuilt for testnet — two SignClient.init()s (the "Init()
  // called 2 times" warning) = two slow relay handshakes on the first connect. Since
  // the signer calls ensureNetwork() before any other WC call, building straight for
  // the tx network means a single init.
  const _outgoing = dappConnector
  if (dappConnector) {
    console.log("[WC] ensureNetwork: switching connector", currentNetwork, "->", network)
    // WC-NETSWITCH1 (2026-07-07): dispose the OUTGOING connector's modal before building
    // the replacement. Each buildConnectorForNetwork() constructs a fresh DAppConnector
    // whose WalletConnectModal appends its own <wcm-modal> web component; the old one was
    // never removed, so a network switch (e.g. mainnet→testnet on the katomia profile /
    // the standalone signer) left TWO stacked modals — the dead one on top meant the
    // pairing popup appeared to never open. Close + remove the stale modal element(s).
    try { dappConnector.walletConnectModal?.closeModal?.() } catch (e) {}
    try { document.querySelectorAll("wcm-modal").forEach((el) => el.remove()) } catch (e) {}
  }
  dappConnector = await buildConnectorForNetwork(network)
  currentNetwork = network

  // WC-SESSIONDISPOSE1 (2026-07-08): the outgoing connector's SignClient/relay was never
  // torn down, so its websocket kept receiving inbound messages for the old network that
  // it could no longer route — the "No matching key" / "onRelayMessage failed to process"
  // / "Pending session not found" spam, and a stale pairing that could make a later Sign
  // do nothing until the user disconnected+reconnected. Close ONLY the old relay transport
  // (sessions persist in Core storage and are restored when that network is rebuilt).
  // Done AFTER the new connector is up. If the two share one Core, closing here would also
  // break the new relay — verified in the isolated lab1 build that they do NOT (signing
  // still works across a switch). Guard against closing the same relayer object the new
  // connector uses, just in case.
  if (_outgoing && _outgoing !== dappConnector) {
    const oldRelayer = _outgoing.walletConnectClient?.core?.relayer
    const newRelayer = dappConnector.walletConnectClient?.core?.relayer
    if (oldRelayer && oldRelayer !== newRelayer) {
      Promise.resolve().then(() => oldRelayer.transportClose?.())
        .then(() => { try { window.kdiag?.("wc:old-relay-closed", { from: currentNetwork }) } catch (e) {} })
        .catch((e) => { try { window.kdiag?.("wc:old-relay-close-fail", { error: String(e?.message || e) }) } catch (_) {} })
    }
  }
  activeAccountId = null   // active selection is network-specific
  // Make initializeWalletConnect() resolve to THIS connector so later callers don't
  // rebuild or get a stale one.
  wcInitPromise = Promise.resolve(dappConnector)
  return currentNetwork
}



// WC-ACCTFILTER1: session restore (DAppConnector.init) recreates a signer for EVERY
// stored session regardless of the connector's network, and only getWalletAccounts()
// filtered them — so the picker could say "no wallet connected" while getSigner()/
// signTx happily used a wrong-network signer (signers[0] fallback = arbitrary network
// with mixed sessions; strict wallets then reject the cross-network request). One
// filter, applied at the single read point, keeps every API answer consistent.
function signerOnCurrentNetwork(s) {
  if (!currentNetwork) return true
  try { return s.getLedgerId?.()?.toString?.() === currentNetwork } catch { return true }
}

// ── WC-RELAYHEALTH1 R2b (2026-08-06): liveness from the SESSION STORE ────────
//
// The recurring failure is a ghost signer. DAppConnector.init() recreates a signer
// for EVERY session in WalletConnect Core storage with no liveness check, so a
// session the user killed wallet-side comes back on the next page load looking
// connected. Re-pairing does not help: the ghost and the fresh signer carry the
// SAME accountId, and findSigner()/getSigner() used to take the FIRST match — the
// ghost, forever, no matter how many times the user reconnected.
//
// R1 tried to detect this with a wallet ping and got it badly wrong (mobile wallets
// stop answering pings the moment they are backgrounded). But we do not need to ask
// the wallet anything: the SDK's own session store already knows. A topic that is
// absent from walletConnectClient.session.keys has been deleted, and one whose
// record has expired is over. Both are local, instant and reliable — no network, no
// guessing, nothing to time out. Use those, and prefer the longest-lived session
// when a real duplicate exists, so the freshest pairing always wins.
// The wallet/SDK's vocabulary for "that session no longer exists". Matched loosely
// on purpose — these strings come from three different layers (sign-client, core
// pairing, the wallet itself) and have changed wording between versions.
function _isSessionGoneError(e) {
  const m = String(e?.message || e || "")
  // Deliberately NOT matching bare "expired" or "no session": a Hedera TRANSACTION_
  // EXPIRED is a completely different failure and must not trigger a re-sign.
  return /no matching key|record was recently deleted|session topic doesn'?t exist|missing or invalid.*session: [0-9a-f]{32,}/i.test(m)
}

function _sessionRecord(topic) {
  try { return topic ? dappConnector?.walletConnectClient?.session?.get(topic) : null } catch (e) { return null }
}

function signerIsLive(s) {
  const topic = s?.topic
  if (!topic) return true                    // older signers may not expose one — never penalise them
  const keys = dappConnector?.walletConnectClient?.session?.keys
  if (Array.isArray(keys) && !keys.includes(topic)) return false   // deleted out from under us
  const rec = _sessionRecord(topic)
  if (rec?.expiry && rec.expiry * 1000 <= Date.now()) return false // expired
  return true
}

// Sort key: the session that expires furthest out is the most recently established
// (WC sets expiry = now + TTL at approval), so it is the pairing the user just made.
function _signerFreshness(s) {
  return _sessionRecord(s?.topic)?.expiry || 0
}

function getSignersList({ includeDead = false } = {}) {
  const list = (dappConnector?.signers || []).filter(signerOnCurrentNetwork)
  return includeDead ? list : list.filter(signerIsLive)
}

function findSigner(accountId) {
  // Several signers can share an accountId (ghost + fresh re-pair). Take the live
  // one with the newest session rather than whichever happens to sit first.
  const matches = getSignersList().filter(s => s.getAccountId().toString() === accountId)
  if (!matches.length) return null
  return matches.reduce((a, b) => (_signerFreshness(b) > _signerFreshness(a) ? b : a))
}

// Drop signers whose session is gone, so a ghost cannot linger in the picker or be
// handed to a sign. Returns how many were removed. Cheap and safe to call often —
// it only ever removes signers the SDK's own store says no longer exist.
function reapDeadSigners() {
  if (!Array.isArray(dappConnector?.signers)) return 0
  const before = dappConnector.signers.length
  const dead = dappConnector.signers.filter(s => !signerIsLive(s))
  if (!dead.length) return 0
  dappConnector.signers = dappConnector.signers.filter(signerIsLive)
  try { window.kdiag?.("wc:signers:reaped", { removed: before - dappConnector.signers.length, topics: dead.map(s => s.topic) }) } catch (e) {}
  if (activeAccountId && !findSigner(activeAccountId)) activeAccountId = null
  return before - dappConnector.signers.length
}

// getSigner — the signer for the active account, else the first available.
//
// Step 2: previously this TRIMMED dappConnector.signers down to a single entry
// ("enforce single account"), which made multi-account impossible. The trim is
// gone; account selection is now explicit via activeAccountId. With one account
// (or no selection) behaviour is identical to before — returns signers[0].
function getSigner() {
  reapDeadSigners()                 // R2b: never hand back a signer whose session is gone
  const signers = getSignersList()
  if (!signers.length) return null

  if (activeAccountId) {
    const match = findSigner(activeAccountId)
    if (match) return match
    // selected account is no longer connected — clear and fall back
    console.warn("[WC] active account", activeAccountId, "no longer connected; falling back")
    activeAccountId = null
  }

  // R2b: freshest live session, not signers[0] — with a ghost present, index 0 is
  // the dead one and every sign went to it.
  return signers.reduce((a, b) => (_signerFreshness(b) > _signerFreshness(a) ? b : a))
}

// setActiveWalletAccount — choose which connected account signs. Throws if the
// account isn't currently connected. (UI picklist wiring lands in step 3.)
function setActiveWalletAccount(accountId) {
  if (!findSigner(accountId))
    throw new Error(`No connected signer for account ${accountId}`)
  activeAccountId = accountId
  console.log("[WC] active account set to", accountId)
  updateWalletConnectionUI(accountId)
  return accountId
}




// connectWalletCore
// Headless intent: initialise WalletConnect, open modal, return accountId
async function zzconnectWalletCore() {
  await initializeWalletConnect()
  await dappConnector.openModal()

  const started = Date.now()

  while (!dappConnector.signers?.length) {
    if (Date.now() - started > 5000)
      throw new Error("Wallet connection timeout")

    await new Promise(r => setTimeout(r, 100))
  }
  // console.log(dappConnector.signers)
  // console.log(dappConnector.LedgerId)
  
  // return dappConnector.signers[0].getAccountId().toString()
  const signer = getSigner()
  return signer.getAccountId().toString()

}

async function connectWalletCore() {
  // WC-SLOW1 timing: split init (connector ready) vs openModal (pairing URI + WC
  // modal render — what the user waits ~30s for) vs the signer-approval wait.
  const _c0 = Date.now()
  await initializeWalletConnect()
  const _c1 = Date.now()

  // WC-RELAYHEALTH1 R2: snapshot the topics that already exist so we can tell a signer
  // created by THIS pairing from one DAppConnector.init() rehydrated out of storage.
  // Diagnostic only — openModal() awaits the wallet's approval internally and calls
  // onSessionConnected() before it resolves, so `reused:true` here would mean connect()
  // returned an account nobody just approved. (Note for whoever reads the old kdiag:
  // approvalWaitMs:0 is NORMAL and is not evidence of that — the approval wait is
  // counted inside openModalMs, not in the loop below.)
  const preTopics = new Set(getSignersList().map(s => s.topic))

  await dappConnector.openModal()
  const _c2 = Date.now()
  const started = Date.now()
  let signer = null

  while (!signer) {
    signer = getSigner()

    if (signer) break

    if (Date.now() - started > 8000)
      throw new Error("Wallet connection timeout")

    await new Promise(r => setTimeout(r, 100))
  }
  const _fresh = getSignersList().filter(s => !preTopics.has(s.topic)).length
  try { window.kdiag?.('wc:connect-phases', { ensureInitMs: _c1 - _c0, openModalMs: _c2 - _c1, approvalWaitMs: Date.now() - _c2, preSigners: preTopics.size, freshSigners: _fresh, reused: _fresh === 0 }) } catch {}

  // Step 2: select the newest signer as active (mirrors the old trim-to-last
  // intent) without discarding the others — getAccounts() still sees them all.
  const signers = getSignersList()
  const newest = signers[signers.length - 1] || signer
  activeAccountId = newest.getAccountId().toString()

  console.log("[WC] Connected account:", activeAccountId)

  // 🔑 force UI consistency immediately
  updateWalletConnectionUI(activeAccountId)

  return activeAccountId
}



// (removed duplicate dead `zzconnectWalletCore` — see the earlier zz variant above;
//  it broke the Vite/Rollup build with "Identifier already declared")

// disconnectWalletCore
// Headless intent: clear wallet session and disconnect active connector
// const disconnectWalletCore = async () => {
// WC-RELAYHEALTH1 R2 (2026-08-06) — purge a session/pairing from our OWN storage.
//
// SignClient.disconnect() only prunes local Core storage on a SUCCESSFUL round-trip to
// the peer. When the wallet has already dropped the session (the user cleared it in
// HashPack, or the relay lost it), that round-trip throws, DAppConnector swallows it,
// and the dead session stays in localStorage under "wc@2:*" — where DAppConnector.init()
// unconditionally rehydrates a signer for it on the next page load, no liveness check.
// That is the ghost behind the "Record was recently deleted - session: <topic>" errors
// (kdiag 2026-08-05 23:41:20). Our own storage is ours to clean: do it unconditionally,
// never gated on the peer acknowledging.
// R2a (2026-08-06): kept deliberately NARROW. It removes exactly the one session
// topic it is given, and nothing else — no pairing deletes (a session topic is not a
// pairing topic anyway, so that call was a no-op reaching into a store it had no
// business touching), no sweeping of anything the caller did not name. Only ever
// called from an explicit user-initiated disconnect.
async function _purgeLocalSession(topic) {
  if (!topic) return false
  const client = dappConnector?.walletConnectClient
  if (!client?.session?.keys?.includes(topic)) return false
  try {
    await client.session.delete(topic, { code: 6000, message: "USER_DISCONNECTED" })
    try { window.kdiag?.("wc:session:purged", { topic }) } catch (e) {}
    return true
  } catch (e) {
    console.warn("[WC] local session purge failed for", topic, e)
    return false
  }
}

async function disconnectWalletCore() {
  if (dappConnector) {
    // Snapshot the topics BEFORE the round-trip — disconnectAll() empties `signers`
    // on success, and on failure we still need to know what to purge locally.
    const topics = [...new Set((dappConnector.signers || []).map(s => s.topic).filter(Boolean))]
    try {
      await dappConnector.disconnectAll()
    } catch (error) {
      console.warn("[WC] Error during wallet disconnect:", error)
    }
    // R2a: prune only the signers whose session we actually got rid of — either the
    // library dropped it on a clean disconnectAll(), or we purged it locally because
    // the peer was already gone. R2 blanket-cleared `signers` here, which threw away
    // live sessions whenever disconnectAll() half-failed.
    for (const t of topics) await _purgeLocalSession(t)
    const gone = new Set(topics.filter(t => !dappConnector.walletConnectClient?.session?.keys?.includes(t)))
    if (Array.isArray(dappConnector.signers))
      dappConnector.signers = dappConnector.signers.filter(s => !gone.has(s.topic))
  }

  activeAccountId = null   // step 2: drop the selection so it can't go stale

  return true
}


// resetWalletLinkCore (WC-RELAYHEALTH1 R2, 2026-08-06)
// Last-resort escape hatch: wipe every WalletConnect Core key this origin holds, so the
// next connect() is guaranteed a genuinely fresh pairing rather than a rehydrated ghost.
// Blunt on purpose — it drops ALL sessions for this site, and the connector has to be
// rebuilt afterwards (init() reads storage once). Reachable from the UI so a wedged user
// has something that always works without clearing site data by hand.
// WC-RELAYHEALTH1 R2c (2026-08-06): this used to wipe localStorage "wc@2:*" keys and
// report how many it removed. It removed nothing, ever. WalletConnect v2 keeps all of
// its state — sessions, pairings, keychain — in INDEXEDDB, in the object store
// WALLET_CONNECT_V2_INDEXED_DB/keyvaluestorage; localStorage holds only the modal's
// WCM_VERSION. Verified by enumerating both stores on a live page. So the escape
// hatch shipped in R2 was a no-op that reported success, and the task notes that said
// the ghost "lives in localStorage wc@2:*" were wrong from the start. Clear the real
// store. The localStorage sweep is kept only because older SDK versions did use it.
const WC_IDB = "WALLET_CONNECT_V2_INDEXED_DB"
const WC_IDB_STORE = "keyvaluestorage"

function _clearWcIndexedDb() {
  return new Promise(resolve => {
    let done = false
    const finish = (cleared, error) => { if (!done) { done = true; resolve({ cleared, error }) } }
    setTimeout(() => finish(false, "timeout"), 4000)
    try {
      const req = indexedDB.open(WC_IDB)
      req.onerror = () => finish(false, String(req.error?.message || "open failed"))
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(WC_IDB_STORE)) { db.close(); return finish(false, "no store") }
        try {
          const tx = db.transaction(WC_IDB_STORE, "readwrite")
          tx.objectStore(WC_IDB_STORE).clear()
          tx.oncomplete = () => { db.close(); finish(true) }
          tx.onerror = () => { db.close(); finish(false, String(tx.error?.message || "tx failed")) }
        } catch (e) { db.close(); finish(false, String(e?.message || e)) }
      }
    } catch (e) { finish(false, String(e?.message || e)) }
  })
}

async function resetWalletLinkCore() {
  try { await disconnectWalletCore() } catch (e) {}

  const idb = await _clearWcIndexedDb()

  let removed = 0
  try {
    for (const k of Object.keys(window.localStorage))
      if (k.startsWith("wc@2:")) { window.localStorage.removeItem(k); removed++ }
  } catch (e) {
    console.warn("[WC] resetWalletLink: localStorage wipe failed", e)
  }

  // Drop the connector too — a live DAppConnector keeps the wiped sessions in memory
  // and would just write them back. Next call to initializeWalletConnect() rebuilds.
  try { dappConnector?.walletConnectClient?.core?.relayer?.transportClose?.() } catch (e) {}
  dappConnector = null
  wcInitPromise = null
  currentNetwork = null
  activeAccountId = null

  try { window.kdiag?.("wc:link:reset", { idbCleared: idb.cleared, idbError: idb.error, lsRemoved: removed }) } catch (e) {}
  console.log("[WC] wallet link reset — IndexedDB cleared:", idb.cleared, idb.error || "", "| localStorage keys:", removed)
  return { idbCleared: idb.cleared, idbError: idb.error || null, lsRemoved: removed }
}


// disconnectAccountCore (step 3)
// Disconnect a SINGLE account, leaving any others connected. Each DAppSigner
// carries its session `topic`; dappConnector.disconnect(topic) drops just that
// session. (If a wallet exposed several accounts on one topic they'd go together,
// but the common case is one account per pairing.) Clears the active selection
// only if the removed account was the active one.
async function disconnectAccountCore(accountId) {
  if (!accountId) return false
  await initializeWalletConnect()

  const signer = findSigner(accountId)
  if (!signer) return false

  const topic = signer.topic
  try {
    if (topic) await dappConnector.disconnect(topic)
    else await dappConnector.disconnectAll()
  } catch (error) {
    console.warn("[WC] Error disconnecting account", accountId, error)
  }

  // WC-RELAYHEALTH1 R2: prune OUR copy whether or not the peer acknowledged — see
  // _purgeLocalSession. Without this a wallet-side clear leaves the session in
  // localStorage and DAppConnector.init() resurrects a dead signer on the next load.
  await _purgeLocalSession(topic)

  // WC-PICKDEL1: dappConnector.disconnect(topic) deletes the session on the relay but
  // does NOT prune dappConnector.signers — that array is only filtered by the library's
  // session_delete handler, which fires for PEER-initiated deletes, not our own. Without
  // pruning here getWalletAccounts() still returns the removed account and the picklist
  // re-renders unchanged (button looks dead). Prune locally by topic (the unit a single
  // disconnect drops); fall back to accountId so a missing topic can't strand the signer.
  const before = getSignersList().length
  if (Array.isArray(dappConnector?.signers))
    dappConnector.signers = dappConnector.signers.filter(s =>
      topic ? s.topic !== topic : s.getAccountId().toString() !== accountId)
  console.log("[WC] disconnected account", accountId, "signers", before, "→", getSignersList().length)

  if (activeAccountId === accountId) activeAccountId = null
  return true
}


// restoreWalletSession
// Wrapper preserving boolean contract for existing call sites
const restoreWalletSession = async () => {
  const accountId = await getActiveWalletAccount()
  return !!accountId
}


async function ensureWalletSignerReady() {
  await initializeWalletConnect()

  if (!dappConnector?.signers?.length)
    await getActiveWalletAccount()

  // return dappConnector?.signers?.[0] || null
  return getSigner() || null
  
  
}


async function getActiveWalletAccount() {
  await initializeWalletConnect()
  return getSigner()?.getAccountId()?.toString() || null
}


// authenticateCore (step 4)
// Off-ledger authentication: the wallet signs a plain-text challenge with the
// selected account's key (HIP-820 hedera_signMessage). No transaction, nothing
// submitted. The backend verifies the returned signature against the account's
// (or an explicitly-supplied) public key.
//
// accountId : Hedera account to sign with (defaults to the active account).
// message   : the challenge string the backend issued (nonce, etc.).
//
// Returns { accountId, network, message, signatureMap, raw } — signatureMap is
// the HIP-820 base64 proto SignatureMap; raw is the untouched wallet response so
// the verifier can adapt if a wallet returns a different shape. A Hedera account
// can be multisig, so the verifier may match against a specific public key rather
// than assume one — the signatureMap carries the signing pubkey(s).
async function authenticateCore({ accountId, message } = {}) {
  if (!message) throw new Error("Missing challenge message")

  await initializeWalletConnect()

  const signer = accountId ? findSigner(accountId) : getSigner()
  if (!signer) throw new Error(accountId
    ? `Account ${accountId} is not connected`
    : "No signer available. Please connect a wallet.")

  const resolvedId = signer.getAccountId().toString()
  const network = walletConfig?.hedera?.network || "mainnet"

  // HIP-30 signer id form: hedera:<network>:<account>
  const signerAccountId = `hedera:${network}:${resolvedId}`

  const result = await dappConnector.signMessage({ signerAccountId, message })

  return {
    accountId: resolvedId,
    network,
    message,
    signatureMap: result?.signatureMap ?? result?.signedMessages ?? null,
    raw: result
  }
}


// getWalletNetwork
// The Hedera network this bundle was initialised for (mainnet/testnet/previewnet).
// Currently fixed at load from config + ?network= URL override. Exposed so callers
// (e.g. the kpool signer's mismatch guard) can compare the wallet network against
// the transaction network — previously that guard was a no-op because window.WC
// had no getNetwork. Sync return; safe to await.
function getWalletNetwork() {
  return walletConfig?.hedera?.network || null
}


// getWalletAccounts
// All connected account IDs (a wallet session can pair multiple). Reads the full
// signers list (NOT getSigner(), which picks one) so the whole set survives.
// Additive — getAccount() still returns a single active one. The network filter
// lives in getSignersList() now (WC-ACCTFILTER1) so this answer can never disagree
// with getSigner()/signTx again.
async function getWalletAccounts() {
  await initializeWalletConnect()
  return getSignersList().map(s => s.getAccountId().toString())
}


// ┬ ┬┌─┐┌┬┐┌─┐┬─┐┌─┐   ┌─┐┌─┐┬─┐┌─┐
// ├─┤├┤  ││├┤ ├┬┘├─┤───│  │ │├┬┘├┤ 
// ┴ ┴└─┘─┴┘└─┘┴└─┴ ┴   └─┘└─┘┴└─└─┘
// hedera-core

// processPreparedTransaction
// Executes an already-prepared (frozen) Hedera transaction using the active signer.
// const prepareTransaction = async (transactionBytes, signer) => {
async function prepareTransaction(transactionBytes, signer) {
  const transaction = Transaction.fromBytes(transactionBytes)

  // Freeze once, correctly
  if (!transaction.isFrozen()) {
    signer
      ? await transaction.freezeWithSigner(signer)
      : await transaction.freeze()
  }

  const txId = transaction.transactionId?.toString()

  if (!txId)
    throw new Error("Transaction ID missing after freeze")

  const txInfo = parseTxId(txId)

  return { transaction, txId, txInfo }
}


// processPreparedTransaction
// Executes a pre-prepared (already frozen) Hedera transaction using the active signer.
//
// Responsibilities:
// - Assumes the Transaction has already been constructed and frozen
// - Executes the transaction with the connected wallet signer
// - Returns the execution result containing the transactionId
//
// Notes:
// - Does NOT parse bytes
// - Does NOT freeze or modify the transaction
// - Separation of concerns: preparation happens upstream (prepareTransaction)
// - Safe to reuse in different execution paths (immediate submit, retries, etc.)
//
// Errors:
// - Throws if no signer is available
// - Throws if execution fails or no transactionId is returned

// const processPreparedTransaction = async transaction => {
async function processPreparedTransaction(transaction) {
  try {
    const signer = await ensureWalletSignerReady()
    if (!signer)
      throw new Error("No signer available. Please reconnect your wallet.")

    const txResult = await transaction.executeWithSigner(signer)

    if (!txResult?.transactionId)
      throw new Error("Transaction not successful")

    return txResult
  } catch (error) {
		
			if (error?.txError?.message === "USER_REJECT") {
				return {
					status: "rejected by user",
					reason: "user"
				}
			}
			
			throw error		
  }
}

// signPreparedTransaction
// Signs an already-prepared (frozen) Hedera transaction without submitting it.
// const signPreparedTransaction = async transaction => {
async function signPreparedTransaction(transaction) {
  try {
    const signer = await ensureWalletSignerReady()
    if (!signer)
      throw new Error("No signer available. Please reconnect your wallet.")

    // GM-SSEFLAG1: use signer.signTransaction() and keep its RETURN value —
    // the same call katomia's board makes via signTxCoreV2. transaction
    // .signWithSigner() was handing back the original transaction, so the
    // wallet's signature never made it into toBytes(): saved records came out
    // carrying only the treasury signature kfund had already embedded in the
    // bytes, and /future correctly reported the buyer as not signed.
    const signedTransaction = await signer.signTransaction(transaction)

    console.log("[WC] Signed transaction (not submitted):", signedTransaction)
    return signedTransaction
  } catch (error) {
    console.error("[WC] Error signing transaction only:", error)
    throw error
  }
}

// parseTxId
// Parses a Hedera transaction ID string into structured components and basic validity status.
//
// Suggestions:
// - Pure utility, no WalletConnect dependency
// - Status logic could evolve independently of parsing
// export const parseTxId = txid => {
export function parseTxId(txid) {
	// 0.0.123@1769033572.006227887
	if (!txid || typeof txid !== "string")
			throw new Error("Invalid transaction ID")
	
	const [operatorId, startTime] = txid.split('@')
	const [shard, realm, entityNum] =
	operatorId.split('.').map(v => parseInt(v, 10))

	if (!startTime)
		throw new Error("Invalid transaction ID - missing start time")
	
	const [startSeconds, startNanos] =
		startTime.split('.').map(v => parseInt(v, 10))

	const nowSeconds = Math.floor(Date.now() / 1000)
	
  let status = "valid"
  if (startSeconds > nowSeconds) // todo consider clock drift
    status = "not_yet_valid"
		
  const expiresAt = startSeconds + 120 // todo replace with actual valid window (120 is default)	
  if (nowSeconds > expiresAt ) // todo consider clock drift
    status = "expired"
	
	return {operatorId, shard, realm, entityNum, startSeconds, startNanos, status }
}




// ┬┌─┌─┐┌─┐┌─┐  ╔═╗╔═╗╦
// ├┴┐├─┘│ │└─┐  ╠═╣╠═╝║
// ┴ ┴┴  └─┘└─┘  ╩ ╩╩  ╩
// kpos API


// saveSignedTransaction
// Dummy API wrapper to persist a signed (but unsubmitted) transaction
//
// Notes:
// - Endpoint URL is placeholder
// - Payload shape is intentionally minimal
// - Replace URL and body as needed

// todo extract from execDealFLow the kpos read step


// const saveSignedTransaction = async signedTransaction => {
async function saveSignedTransaction(signedTransaction) {  // to migrate this and deprecate here
  try {
    // GM-SSEFLAG1 follow-up, same root cause + fix shape as KSIG-KPOOLSAVE1 (2f0c4cd):
    // kpos.uk/pool/txSave resolves against a backend disconnected from this seat's own
    // hapi_base (hapi5) — /future only ever reads from hapi5, so a save that lands on
    // kpos's backend is invisible there ("record not found"). Same fix katomia-board.js's
    // boardDirectSign already uses successfully: same-origin relative call through this
    // repo's own future/kpool.php -> hapi_base.php, not the cross-domain kpos URL.
    const apiUrl = "/future/?action=txSave"
    // const apiUrl = "https://kpos.uk/pool/txSave"  // old: wrong backend, see above
    // const apiUrl = "/txSave" //nah.. have the app do this, and keep WC pure

		const payload = {
				network: walletConfig.hedera.network, // "testnet" | "mainnet"
				response: {
					signedTransaction: Array.from(
						signedTransaction.toBytes()
					)
				},
				comment: 'AR84754 tracer, WC in-bundle to be deprecated',  // dev use only
			}

    console.log("[WC] Saving signed transaction to API:", payload)

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok)
      throw new Error(`Failed to save signed transaction (${response.status})`)

    const result = await response.json()
    console.log("[WC] Signed transaction saved:", result)

    return result
  } catch (error) {
    console.error("[WC] Failed to save signed transaction:", error)
    throw error
  }
}





// ┬┌┐┌┌┬┐┌─┐┬─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌  ┌─┐┌┬┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐
// ││││ │ ├┤ ├┬┘├─┤│   │ ││ ││││  ├─┤ ││ ││├─┤├─┘ │ │ │├┬┘└─┐
// ┴┘└┘ ┴ └─┘┴└─┴ ┴└─┘ ┴ ┴└─┘┘└┘  ┴ ┴─┴┘─┴┘┴ ┴┴   ┴ └─┘┴└─└─┘
// interaction addaptors

// resolveWalletUIState
// Headless intent: derive wallet UI state from account connection
const resolveWalletUIState = (accountId) => {
  if (accountId) {
    return {
      connected: true,
      label: `Connected: ${accountId}`,
      connectDisabled: true,
      showDisconnect: true
    }
  }

  return {
    connected: false,
    label: "Open WalletConnect Modal",
    connectDisabled: false,
    showDisconnect: false
  }
}


// updateWalletConnectionUI
// Button-based UI adapter for wallet connection state
const updateWalletConnectionUI = (accountId) => {
  const walletConnectButton =
    document.getElementById("pair-walletconnect-btn")

  if (!walletConnectButton) {
    console.info(
      "[WC] pair-walletconnect-btn not found, skipping wallet UI update"
    )
    return
  }

  const disconnectButton =
    document.getElementById("wallet-disconnect")

  const uiState = resolveWalletUIState(accountId)

  // Update connect button
  // walletConnectButton.textContent = uiState.label
  // walletConnectButton.disabled = uiState.connectDisabled


	// Update connect button visibility instead of disabling
	if (uiState.connected) {
		walletConnectButton.style.display = "none"
	} else {
		walletConnectButton.style.display = "block"
		walletConnectButton.textContent = uiState.label
		walletConnectButton.disabled = false
	}

  // Update disconnect button
  if (disconnectButton) {
    disconnectButton.style.display =
      uiState.showDisconnect ? "block" : "none"

    if (uiState.showDisconnect)
      disconnectButton.style.marginTop = "10px"
  }
}



// openWalletConnectModal
// Initialises WalletConnect (if needed) and opens the WalletConnect pairing modal.
const openWalletConnectModal = async () => {
  try {
    const accountId = await connectWalletCore()

    updateWalletConnectionUI(accountId)
  } catch (error) {
    console.error("Error opening WalletConnect modal:", error)
    walletUI.showAlert(
      "Failed to open WalletConnect modal. Please try again.",
      "danger"
    )
  }
}








const showTxSaveResult = saveResult => {
  const ok = saveResult?.success === true
  const result = saveResult?.result || {}
  const { comments = [], errors = [], network, txId } = result

  // GM-SSEFLAG1 follow-up: point at the same /future/ queue page every other
  // "view this queued tx" link in the codebase uses (kpool_widget/index.js,
  // ksig_test.js) instead of the raw kpos.uk API JSON endpoint. No pch here —
  // this flow doesn't generate one, and the established convention (kpool_widget)
  // is to omit pch entirely rather than pass a placeholder.
  const txLink =
    network && txId
      ? `<a href="/future/?network=${network}&txid=${txId}" target="_blank" rel="noopener">${txId}</a>`
      : ""

  if (ok) {
    // GM-SSEFLAG1 (user 2026-07-23): one line, same shape as the direct-submit
    // flow's "Transaction submitted / View receipt <txid>" popup — but this is a
    // signing link, not a receipt, so: "Transaction ready <txid-link>". Backend
    // comments ("tx is type: Transaction", "Detected signedTx input", …) are
    // internals — console only, never shown to the user.
    if (comments.length) console.log("[WC] txSave comments:", comments)
    const msg = txLink
      ? `Transaction ready ${txLink}`
      : "Transaction saved"

    walletUI.showTxAlert(msg, "info", "last_tx")

    // auto-open the signing surface. Preferred: the in-page modal (kpay-embed.js
    // → window.KPaySign), which keeps the customer on the product page AND is
    // immune to the popup blocker (no new tab involved). Fallback when the host
    // page doesn't load the embed: best-effort window.open of /future — may be
    // popup-blocked since we're past the click gesture; the banner link covers
    // that. Deliberately NO pre-opening at click time: Buy now's click behaviour
    // must stay exactly what it always was — wallet prompt, nothing else.
    // Either path is kdiag'd (gm:tx:auto-open) so blocked-vs-broken is
    // observable instead of guessed at.
    if (network && txId) {
      // GM-SSETOAST1: persist the save so a page refresh (or a wallet session
      // dying mid-flow on a LATER attempt) can replay recent txs as live-status
      // toasts — the host page (labs2026.js renderRecentSseToasts) reads this.
      try {
        const K = "gm_sse_recent"
        const list = JSON.parse(localStorage.getItem(K) || "[]")
        list.unshift({
          network, txid: txId,
          dealId: new URLSearchParams(window.location.search).get("dealId") || null,
          ts: Date.now()
        })
        localStorage.setItem(K, JSON.stringify(list.slice(0, 10)))
      } catch {}

      const signUrl = `/future/?network=${network}&txid=${txId}`
      if (typeof window.KPaySign === "function") {
        window.KPaySign({ network, txid: txId })
        try { globalThis.kdiag?.("gm:tx:auto-open", { url: signUrl, mode: "modal" }) } catch {}
      } else {
        const w = window.open(signUrl, txId || "_blank")
        try { globalThis.kdiag?.("gm:tx:auto-open", { url: signUrl, mode: "tab", opened: !!w }) } catch {}
      }
    }
  } else {
    const msg = [
      errors.length
        ? `<pre>${JSON.stringify(errors, null, 2)}</pre>`
        : "Transaction save failed",
      txLink
    ]
      .filter(Boolean)
      .join("<br><br>")

    walletUI.showTxAlert(msg, "warning", "last_tx")
  }
}




// signTxCore
// Headless intent: sign (and optionally submit) raw transaction bytes
//
// Inputs:
// - accountId: string (wallet account expected to sign)
// - transactionBytes: Uint8Array (already constructed tx bytes)
// - submitNow: boolean
//
// Behaviour:
// - submitNow === true  -> sign + submit, return transactionId
// - submitNow === false -> sign only, return signed tx bytes

async function signTxCore ({
  accountId,
  transactionBytes,
  submitNow
}) {
  if (!accountId)
    throw new Error("Missing accountId")

  if (!(transactionBytes instanceof Uint8Array))
    throw new Error("transactionBytes must be Uint8Array")

  const signer = await ensureWalletSignerReady()
  if (!signer)
    throw new Error("No signer available. Please reconnect wallet.")

  const activeAccountId =
    signer.getAccountId()?.toString()

  if (activeAccountId !== accountId)
    throw new Error("Active wallet account does not match accountId")

  const { transaction, txId, txInfo } =
    await prepareTransaction(transactionBytes, signer)

  console.log("[WC] signTX tx inspection:", txInfo)

  let finalSubmitNow = submitNow
  if (txInfo.status === "not_yet_valid")
    finalSubmitNow = false

  if (finalSubmitNow) {
    const txResult =
      await processPreparedTransaction(transaction)

    return {
      status: "submitted",
      transactionId: txResult.transactionId
    }
  }

  const signedTransaction =
    await signPreparedTransaction(transaction)

  const saveResult =
    await saveSignedTransaction(signedTransaction)


  return {
    status: "signed_only",
    signedTransaction: Array.from(
      signedTransaction.toBytes()
    ),
		saveResult
  }
}

// signTxCoreV2
// Headless intent: sign a Hedera transaction via WalletConnect ONLY
//
// Inputs:
// - accountId: string
// - transactionBytes: Uint8Array (unsigned or partially signed)
//
// Output:
// - signedTransactionBase64: string
//
// Notes:
// - Does NOT submit
// - Does NOT inspect tx semantics
// - Does NOT depend on legacy helpers

async function signTxCoreV2 ({
  accountId,
  transactionBytes
}) {
  if (!accountId)
    throw new Error("Missing accountId")

  if (!(transactionBytes instanceof Uint8Array))
    throw new Error("transactionBytes must be Uint8Array")

  const signer = await ensureWalletSignerReady()
  if (!signer) {
    // WC-ACCTFILTER1: with network filtering on, a restored session from the OTHER
    // network no longer silently signs — name the mismatch instead of the generic
    // "no signer" so the user (and kdiag) can see exactly what to fix.
    const stray = (dappConnector?.signers || []).find(s => !signerOnCurrentNetwork(s))
    if (stray) {
      let strayNet = "another network"
      try { strayNet = stray.getLedgerId?.()?.toString?.() || strayNet } catch {}
      throw new Error(`Connected wallet is on ${strayNet}, but this transaction is ${currentNetwork}. Reconnect your wallet on ${currentNetwork}.`)
    }
    throw new Error("No signer available. Please reconnect wallet.")
  }

  const activeAccountId =
    signer.getAccountId()?.toString()

  if (activeAccountId !== accountId)
    throw new Error("Active wallet account does not match accountId")

  // WC-RELAYHEALTH1 R2 (2026-08-06): the session ping is ADVISORY — never a gate.
  //
  // R1 (a99a66e) awaited pingSession() here and threw KWC-STALE when it failed. On a
  // real phone that broke signing outright. wc_sessionPing only round-trips while the
  // wallet app is in the FOREGROUND; the moment the user switches back to the browser —
  // i.e. every moment they are actually looking at the board — HashPack stops answering
  // it. Measured (kdiag 2026-08-05): the phone failed the preflight on 31 of 32 signs,
  // every failure at exactly our 4000ms timeout, while the desktop (wallet always
  // foregrounded) passed 43 of 49. The single mobile pass was at 07:26:19, one second
  // after returning from the wallet app — same session, same topic, and 14s later the
  // very same session timed out again. A ping timeout therefore says almost nothing
  // about session health on mobile, and gating on it turned a perfectly live link into
  // "disconnect this site and re-pair" — advice that could not possibly work, which is
  // exactly the loop the user was stuck in all evening (23:41-23:44: re-pair, approve
  // in the wallet, ping still times out 4s later, KWC-STALE again).
  //
  // The sign request is itself what wakes a backgrounded wallet (it deep-links/pushes),
  // so it must go out FIRST. The ping now runs alongside it purely as a health signal:
  // if it comes back bad we shorten the stall cap from 120s to ~30s — past the tx
  // validity window anyway (board:signing:window is 40s) — so a genuinely dead link
  // still surfaces a real error quickly instead of blocking the sign up front.
  const relayer = dappConnector?.walletConnectClient?.core?.relayer
  if (relayer && !relayer.connected) { try { await relayer.restartTransport() } catch {} }

  // Rebuild transaction from bytes
  const transaction =
    Transaction.fromBytes(transactionBytes)

  // Freeze if required (recommended WC flow)
  if (!transaction.isFrozen()) {
    await transaction.freezeWithSigner(signer)
  }

  // WalletConnect signature request (NO execution) — guarded (WC-RELAYHEALTH1):
  // transport loss mid-request rejects after a 15s recovery grace; a 120s absolute
  // cap ends the eternal await.
  //
  // R2a (2026-08-06): the ping is now PURELY a kdiag signal — it does not shorten
  // this cap and it cannot fail a sign. R2's first cut let a failed ping pull the cap
  // in to 30s, which repeated R1's mistake in a quieter way: the ping ALWAYS fails on
  // mobile (that is the whole finding above), so on a phone the cap was always 30s,
  // and any user who took longer than that to switch apps and approve had their sign
  // killed while the wallet was still showing them the request — the board then sat
  // out the 40s validity window and the wiper cleared everything. The working phone
  // that day approved in 13.7s and squeaked under it; a slower one did not. Nothing
  // may kill an in-flight request except an ACTUAL transport failure (the in-flight
  // guard) or the 120s backstop.
  const g = _guardInFlight(`signTx:${accountId}`)
  const _cap = setTimeout(() => g.reject(new Error(
    "KWC-TIMEOUT: no response from the wallet after 120s — if you approved, the link is stuck: open your wallet app, disconnect this site, then reconnect and try again.")), 120_000)

  pingSession().then(ping => {
    try { window.kdiag?.("wc:session:ping", { ok: ping.ok, ms: ping.ms, reason: ping.reason, accountId, advisory: true }) } catch {}
  }).catch(() => {})

  let signedTransaction
  try {
    signedTransaction = await Promise.race([signer.signTransaction(transaction), g.promise])
  } catch (e) {
    // R2b: self-heal instead of dead-ending. If the wallet says this session is gone
    // ("No matching key", "Record was recently deleted", "session topic doesn't
    // exist"), that is the ghost — the user disconnected us wallet-side. Bin that
    // signer and, if a live session for the same account is still standing (the usual
    // case after they have already re-paired), sign again on it once. Otherwise say
    // plainly that the link is gone and needs reconnecting, rather than leaving the
    // user re-tapping Sign against a corpse.
    if (!_isSessionGoneError(e)) throw e
    const deadTopic = signer.topic
    try { window.kdiag?.("wc:sign:session-gone", { accountId, topic: deadTopic, error: String(e?.message || e) }) } catch {}
    await _purgeLocalSession(deadTopic)
    if (Array.isArray(dappConnector?.signers))
      dappConnector.signers = dappConnector.signers.filter(s => s.topic !== deadTopic)
    if (activeAccountId && !findSigner(activeAccountId)) activeAccountId = null

    const retrySigner = findSigner(accountId)
    if (!retrySigner)
      throw new Error("KWC-GONE: your wallet has disconnected this site — tap Connect to pair again, then Sign.")

    try { window.kdiag?.("wc:sign:retry-live-session", { accountId, topic: retrySigner.topic }) } catch {}
    const tx2 = Transaction.fromBytes(transactionBytes)
    if (!tx2.isFrozen()) await tx2.freezeWithSigner(retrySigner)
    signedTransaction = await retrySigner.signTransaction(tx2)
  } finally {
    g.done()          // sets settled FIRST, so a late ping callback can't re-arm the cap
    clearTimeout(_cap)
  }

	// dont save.. let the client do it (affects reporting on "new" signatures)
  // const saveResult = await saveSignedTransaction(signedTransaction)


  // Encode for transport
  const signedBytes =
    signedTransaction.toBytes()




    return {
      // saveResult,
      signedTransactionHex: bytesToHex(signedBytes),
      // signedTransaction: // hex
        // Array
          // .from(signedBytes)
          // .map(b => b.toString(16).padStart(2, "0"))
          // .join("")
    }


  // return {
    // signedTransactionBase64:
      // Buffer.from(signedBytes).toString("base64"),
    // signedTransactionHex:
      // Buffer.from(signedBytes).toString("hex")  
  // }

  
}


function bytesToHex(bytes) {
  return Array
    .from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}


// GM-SSEAUTO1 / ref GM-SIG1 — pre-HashPack signature-completeness guard.
//
// AUTO-mode question: if this buyer signs in HashPack and HashPack submits, does
// the tx reach consensus fully signed? HashPack does no precheck, so a missing
// third-party signature (e.g. treasury pre-sign absent — the exact
// GM-PRESIGN-HAPI2HAPI5-1 failure) burns the payer's fee at consensus.
//
// Lean version of the kpool widget's computeSignerPreview (kpool_widget/view.js),
// scoped to what GoMint deals actually use — simple ED25519/ECDSA account keys:
//   required non-buyer signers = fee payer + every account SENDING value
//   each must already have a signature in the sigMap (pubKeyPrefix — wallets and
//   the SDK put the FULL raw pubkey there — matched against the account's mirror key)
// Failure policy: protective but never a new point of failure —
//   - non-buyer senders exist + sigMap EMPTY          -> block (no mirror call needed)
//   - mirror confirms a required account has no sig   -> block
//   - mirror unreachable / complex (threshold) key    -> fail OPEN, kdiag notes it
//   - introspection itself throws                     -> fail OPEN, kdiag notes it
async function assessSignatureCompleteness(transaction, buyerAccountId) {
  const verdict = { block: false, requiredOthers: [], missing: [], unverified: [], sigCount: 0 }
  try {
    const required = new Set()
    const payer = transaction.transactionId?.accountId?.toString()
    if (payer) required.add(payer)
    // SDK ObjectMaps are iterable ([key, value]); tx may not be a TransferTransaction,
    // so each surface is feature-detected
    try { for (const [acct, amount] of (transaction.hbarTransfers || [])) if (amount.toTinybars().isNegative()) required.add(acct.toString()) } catch {}
    try { for (const [, perAccount] of (transaction.tokenTransfers || [])) for (const [acct, amount] of perAccount) if (amount.isNegative()) required.add(acct.toString()) } catch {}
    try { for (const [, transfers] of (transaction.nftTransfers || [])) for (const nft of transfers) if (nft.sender) required.add(nft.sender.toString()) } catch {}
    required.delete(buyerAccountId)
    verdict.requiredOthers = [...required]
    if (!required.size) return verdict // buyer-only tx — nothing to guard

    const prefixes = []
    for (const st of (transaction._signedTransactions?.list || [])) {
      for (const sp of (st.sigMap?.sigPair || []))
        if (sp.pubKeyPrefix?.length) prefixes.push(bytesToHex(sp.pubKeyPrefix).toLowerCase())
      break // sigMap is identical across the per-node copies
    }
    verdict.sigCount = prefixes.length
    if (!prefixes.length) {
      verdict.block = true
      verdict.missing = [...required]
      return verdict
    }

    const mirrorBase = currentNetwork === "mainnet"
      ? "https://mainnet-public.mirrornode.hedera.com"
      : `https://${currentNetwork || "testnet"}.mirrornode.hedera.com`
    for (const acct of required) {
      try {
        const r = await fetch(`${mirrorBase}/api/v1/accounts/${acct}`)
        if (!r.ok) throw new Error(`mirror ${r.status}`)
        const key = (await r.json())?.key
        if (!key?.key) { verdict.unverified.push(acct); continue }
        const keyHex = key.key.toLowerCase()
        // Simple key: a sig's pubKeyPrefix must BE this key (>=8 bytes of prefix
        // before we trust a match — full keys are 32/33 bytes).
        // Complex key (ProtobufEncoded keylist/threshold — GoMint treasuries are
        // these): every leaf pubkey is embedded verbatim in the blob hex, so a sig
        // whose pubkey appears nowhere in it is definitively NOT from this account's
        // key tree. Presence of one related sig passes; whether it fully satisfies
        // an m-of-n threshold stays the kpool widget's job (fail-open by design).
        const signed = key._type === "ProtobufEncoded"
          ? prefixes.some(p => p.length >= 16 && keyHex.includes(p))
          : prefixes.some(p => p.length >= 16 && keyHex.startsWith(p))
        if (!signed) verdict.missing.push(acct)
      } catch { verdict.unverified.push(acct) }
    }
    verdict.block = verdict.missing.length > 0
  } catch (e) {
    verdict.error = String(e) // guard broke, not the tx — never block a good buy on that
  }
  return verdict
}


// ┌─┐─┐ ┬┌─┐┌─┐┬ ┬┌┬┐┌─┐  ╔╦╗┌─┐┌─┐┬    ╔═╗┬  ┌─┐┬ ┬
// ├┤ ┌┴┬┘├┤ │  │ │ │ ├┤    ║║├┤ ├─┤│    ╠╣ │  │ ││││
// └─┘┴ └─└─┘└─┘└─┘ ┴ └─┘  ═╩╝└─┘┴ ┴┴─┘  ╚  ┴─┘└─┘└┴┘
// execute Deal Flow

// this is still too long.. needs breaking up.. lets extract the kpos bit first

// executeDealFlowCore
// Headless intent: fetch, prepare, sign, and optionally submit a deal transaction
// const executeDealFlowCore = async ({
async function executeDealFlowCore ({
  accountId,
  dealId,
  userParamsString,
  submitNow,
  guardIncomplete = false // GM-SSEAUTO1: true in auto mode — block instead of submitting incomplete
}) {
  const apiUrl =
    `https://kpos.uk/deal/bytes/?dealId=${dealId}` +
    `&${userParamsString}` +
    `&userAccountId=${accountId}`

  console.log(apiUrl)

  const response = await fetch(apiUrl)
  if (!response.ok)
    throw new Error(
      `Failed to fetch transaction bytes: ${response.statusText}`
    )

  const data = await response.json()
  if (!data.bytes?.data) {
    console.warn("Deal bytes not ready yet", data)
    // kpos explains WHY in data.error (e.g. an unmet deal condition like
    // ct_lock_modified after a successful claim) — pass it up for the UI
    return { status: "not_ready", message: data.error || null }
  }

  const transactionBytes = new Uint8Array(data.bytes.data)
  // const signer = await ensureWalletSignerReady()
      
    const signer = await ensureWalletSignerReady()
    if (!signer)
      throw new Error("Wallet not initialised. Please reconnect.")  

  const { transaction, txId, txInfo } =
    await prepareTransaction(transactionBytes, signer)

  console.log("[WC] tx inspection:", txInfo)

  let finalSubmitNow = submitNow
  if (txInfo.status === "not_yet_valid")
    finalSubmitNow = false

  // GM-SSEAUTO1: in auto mode, never hand HashPack a tx it would submit incomplete —
  // that reaches consensus, fails INVALID_SIGNATURE, and burns the payer's fee
  if (finalSubmitNow && guardIncomplete) {
    const verdict = await assessSignatureCompleteness(transaction, accountId)
    try { globalThis.kdiag?.("gm:tx:sig-guard", { dealId, accountId, ...verdict }) } catch {}
    if (verdict.block)
      return { status: "blocked_incomplete", verdict }
  }

  if (finalSubmitNow) {
    const txResult =
      await processPreparedTransaction(transaction)

    return {
      status: "submitted",
      transactionId: txResult.transactionId
    }
  }

  const signedTransaction =
    await signPreparedTransaction(transaction)

  const saveResult =
    await saveSignedTransaction(signedTransaction)

  return {
    status: "signed_only",
    saveResult
  }
}


// executeDealFlow
// UI-triggered wrapper preserving existing behaviour and alerts
export const executeDealFlow = async () => {
  const accountId = await getActiveWalletAccount()

  if (!accountId) {
    walletUI.showAlert(
      "Please connect your wallet first.",
      "warning"
    )
    return
  }

    await initializeWalletConnect()


  const dealIdInput =
    document.getElementById("dealId")?.value

  const urlParams =
    new URLSearchParams(window.location.search)

  // GM-SSEAUTO1: three-state submitServerSide (absent = auto, the default every
  // legacy deal inherits). NOTE the previous check — `if (urlParams.get(...))
  // submitNow = false` — read ANY non-empty value as server-side, INCLUDING "0".
  // Same falsy-string convention as the shop's parseSseMode / hoot2026 isFlagSet.
  //   on ("1"/anything else) -> sign & return, server side submits (GM-SSEFLAG1 path)
  //   off ("0"/"false"/"off") -> legacy HashPack sign+submit, guard skipped
  //   auto (absent/""/"auto"/"null") -> sign+submit ONLY if the buyer's signature
  //     completes the set; otherwise block before HashPack (GM-SIG1)
  const sseRaw = urlParams.get("submitServerSide")
  const sseVal = sseRaw === null ? "auto" : String(sseRaw).trim().toLowerCase()
  const sseMode =
    (sseVal === "" || sseVal === "auto" || sseVal === "null") ? "auto"
    : (sseVal === "0" || sseVal === "false" || sseVal === "off") ? "off"
    : "on"
  const submitNow = sseMode !== "on"
  const guardIncomplete = sseMode === "auto"

  const dealId =
    dealIdInput || urlParams.get("dealId")

  if (!dealId) {
    walletUI.showAlert(
      "Please provide a valid dealId.",
      "warning"
    )
    return
  }


	const userParameters = []

	document
		.querySelectorAll(".user_input")
		.forEach(el => {
			const id = el.id
			const value = el.value

			if (!id || value == null || value === "")
				return

			userParameters.push(`${id}=${value}`)
		})

	
  const userParamsString =
    userParameters
      .map(
        p =>
          `user_parameters[${p.split("=")[0]}]=${p.split("=")[1]}`
      )
      .join("&")

	console.log(userParameters)
	console.log(userParamsString)
  try {
    const result =
      await executeDealFlowCore({
        accountId,
        dealId,
        userParamsString,
        submitNow,
        guardIncomplete
      })

    if (!result)
      return

    if (result.status === "blocked_incomplete") {
      // GM-SIG1: deliberately friendly AND screenshotable — the ref code tells
      // support/ops the deal simply hasn't been pre-approved yet (treasury/agent
      // signature not attached). Details are in the gm:tx:sig-guard kdiag event.
      walletUI.showAlert(
        "Sorry — this deal hasn't been pre-approved yet. Please contact support (ref GM-SIG1).",
        "warning"
      )
      return
    }

    if (result.status === "submitted") {
      setTimeout(() => {
        walletUI.showTxAlert(
          "Transaction submitted<br>",
          "info",
          "last_tx",
          result.transactionId
        )
      }, walletConfig?.receiptDelayMs ?? 3000)
      return
    }

    if (result.status === "signed_only") {
      showTxSaveResult(result.saveResult)
      return
    }

    if (result.status === "not_ready") {
      // was a silent console.warn — surface the server's reason (GMWALLET2)
      walletUI.showTxAlert(
        result.message ||
          "This deal cannot be executed right now (no transaction bytes from server).",
        "warning",
        "last_tx"
      )
      return
    }

  } catch (error) {
    console.error("Error occurred while signing", error)
    walletUI.showTxAlert(
      error.message,
      "danger"
    )
  }
}


// handleDisconnect
// UI-triggered disconnect wrapper (buttons, menus, etc.)
const handleDisconnect = async () => {
  try {
    await disconnectWalletCore()
    updateWalletConnectionUI(null)
    location.reload() // preserve existing behavior
  } catch (error) {
    console.error("[WC] Disconnect failed:", error)
  }
}


//what do we call this? where does it go?


// ┬ ┬┌─┐┌─┐┌┬┐┬  ┌─┐┌─┐┌─┐  ┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐
// ├─┤├┤ ├─┤ │││  ├┤ └─┐└─┐  ├─┤ ││├─┤├─┘ │ │ │├┬┘
// ┴ ┴└─┘┴ ┴─┴┘┴─┘└─┘└─┘└─┘  ┴ ┴─┴┘┴ ┴┴   ┴ └─┘┴└─
// headless adaptor

// exposeHeadlessAPI
// Explicitly expose wallet actions for non-DOM / gesture-driven integrations
const exposeHeadlessAPI = () => {
  if (WALLETCONNECT_MODE !== "headless")
    console.log('TG98374 for debug, always exposing headless regardless of mode')
    // return

  if (window.WC) {
    console.warn("[WC] window.WC already exists, skipping overwrite")
    return
  }

  window.WC = {
    // lifecycle
    connect: connectWalletCore,
    disconnect: disconnectWalletCore,
    restoreSession: getActiveWalletAccount,

    // deal execution
    executeDeal: executeDealFlowCore,

    // raw tx signing
    // signTx: signTxCore,
    signTx: signTxCoreV2,

    // helpers / state
    getAccount: getActiveWalletAccount,
    getAccounts: getWalletAccounts,   // step 1: full connected-account list (additive)
    getActiveAccount: getActiveWalletAccount,   // step 2: alias of getAccount
    setActiveAccount: setActiveWalletAccount,   // step 2: pick which account signs
    disconnectAccount: disconnectAccountCore,   // step 3: disconnect one account, keep others
    authenticate: authenticateCore,   // step 4: sign a challenge (HIP-820 signMessage)
    getNetwork: getWalletNetwork,     // step 0: enables the kpool signer mismatch guard
    ensureNetwork: ensureNetwork,     // step 5: scope the connector to a tx's network

    // WC-RELAYHEALTH1: relay/session health surface
    relayHealthy: () => relayHealth.healthy,                        // true | false | null (unknown)
    relayInfo: () => ({ ...relayHealth, inFlight: _wcInFlight.size }),
    pingSession,                                                     // active-session round-trip check
    // R2: advisory only — a ping timeout does NOT mean the session is dead. Mobile
    // wallets stop answering pings the moment they are backgrounded (see signTxCoreV2).
    resetWalletLink: resetWalletLinkCore,                            // wipe wc@2:* → forced fresh pairing

    // build provenance — so host pages (kdiag) can record which bundle is live.
    // __BUILD_META__ is injected by vite at build time ({commit,status,built}).
    buildMeta: (typeof __BUILD_META__ !== 'undefined') ? __BUILD_META__ : null,
    version: (typeof __BUILD_META__ !== 'undefined') ? __BUILD_META__.commit : null,

    mode: WALLETCONNECT_MODE
  }

  console.info("[WC] Headless API exposed on window.WC")
}

// Initialise optional headless exposure
exposeHeadlessAPI()




// ┬ ┬┌┬┐┬┬  ┌─┐
// │ │ │ ││  └─┐
// └─┘ ┴ ┴┴─┘└─┘
// utils
//no dependencies...

// getHederaNetworkFromNamespaces
// Extracts the Hedera network name (mainnet/testnet/previewnet) from WalletConnect requiredNamespaces.
//
// Suggestions:
// - Pure utility, could live near other Hedera helpers
// - Assumes first chain only (might be worth making explicit)
function getHederaNetworkFromNamespaces(requiredNamespaces) {
  const chains = requiredNamespaces?.hedera?.chains

  if (!chains || chains.length === 0)
    throw new Error("No Hedera chains defined in requiredNamespaces")

  // Expect format: "hedera:mainnet" | "hedera:testnet" | "hedera:previewnet"
  const [, network] = chains[0].split(":")

  if (!network)
    throw new Error(`Invalid Hedera chain format: ${chains[0]}`)

  return network
}


// hederaChainIdFromNetwork
// Maps a Hedera network string to the corresponding HederaChainId enum.
//
// Suggestions:
// - Could be a lookup map instead of switch
// - Naming is fine but could be read as "resolve" instead of "from"
function hederaChainIdFromNetwork(network) {
  switch (network) {
    case "mainnet": return HederaChainId.Mainnet
    case "testnet": return HederaChainId.Testnet
    case "previewnet": return HederaChainId.Previewnet
    default:
      throw new Error(`Unsupported Hedera network: ${network}`)
  }
}



