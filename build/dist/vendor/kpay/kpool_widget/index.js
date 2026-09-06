const V = window.__BUILD_HASH__

const { CONFIG } = await import(`./config.js?v=${V}`)

const {
	txRead,
	enrichAccountsInfo,
	enrichAccountsKeyInfo,
	enrichTransfersInfo,
	buildFlowModel,
	calcAccountsThatSign,
	evaluateTxReadiness
} = await import(`./model.js?v=${V}`)

const {
	injectTxReadCSS,
	buildTxReadColumns,
	renderSigningInfo,
	renderReadinessInfo,
	renderPrecheckInfo,
	showBanner,
	summariseStatus,
	updateFinalState,
	markConnectedAccounts,
	playSuccessFlow,
	markSettledIfSuccess,
	pickAssetLabel,
	resolveTxView,
	buildTransferViews,
	computeSignerPreview
} = await import(`./view.js?v=${V}`)

const {
	get,
	parseTxId,
	formatUtcTime,
	formatCountdown,
	loadScript
} = await import(`./utils.js?v=${V}`)

const { getHederaMirrorData } = await import(`./hedera-mirror.js?v=${V}`)
const { createTxSocket } = await import(`./websocket.js?v=${V}`)
const { normalizePublicKey } = await import(`./keynorm.js?v=${V}`)

console.log('injecting kpool widget')

// ── public API ──────────────────────────────────────────────────
// Single-transaction signing widget. mount() renders into any element; open()
// wraps that in a brandable modal. Listing stays in the host page, not here.

export async function mount(hostEl, { network, txid, pch = 'no_pch', ...opts } = {}) {
	if (!hostEl)  throw new Error('KPOOL.mount: missing host element')
	if (!network) return renderError(hostEl, 'FR67657 Missing network')
	if (!txid)    return renderError(hostEl, 'FR67658 Missing txid (single-tx widget)')
	return renderSingleTx(hostEl, network, txid, pch, opts)
}

export async function open({ network, txid, pch = 'no_pch', brand = {}, signer = 'walletconnect', ...opts } = {}) {
	const { buildModal } = await import(`./modal.js?v=${V}`)
	const modal = buildModal({
		title:      brand.title ?? 'Sign transaction',
		logo:       brand.logo ?? null,
		showHeader: brand.showHeader !== false,
		onClose:    brand.onClose
	})
	await mount(modal.body, {
		network, txid, pch, signer, ...opts,
		onStatus:      s => modal.setStatus(s.label, s.tone, s.shape),
		onCountdown:   t => modal.setCountdown(t),
		onFlash:       (msg, tone) => modal.flash(msg, tone),
		onLockModal:   modal.lock,
		onUnlockModal: modal.unlock
	})
	return modal
}

// Lightweight, read-only status probe for a single tx — no DOM, no signing.
// Lets a host (e.g. the index list) show the same status pill as the modal
// header without mounting the whole widget per row. Returns the summariseStatus
// shape { label, tone, shape } plus the raw readiness for callers that want it.
export async function readStatus({ network, txid, pch = 'no_pch' } = {}) {
	if (!network || !txid) throw new Error('KPOOL.readStatus: network and txid required')
	const { data, accounts } = await txRead({ network, txid, pch })
	const readiness = evaluateTxReadiness({ accounts, data })
	return { ...summariseStatus({ data, readiness }), readiness }
}

window.KPOOL = { mount, open, readStatus }

function renderError(hostEl, msg) {
	console.warn('[kpool]', msg)
	if (hostEl) {
		const el = document.createElement('div')
		el.textContent = msg
		el.style.cssText = 'padding:16px;color:#b00020;font:13px system-ui'
		hostEl.append(el)
	}
}

// ── backward-compatible auto-boot ───────────────────────────────────
// tx_approval.php drops #kpool_widget and relies on URL params. signer:null
// because tx_approval renders its OWN WalletConnect buttons — don't double up.
const legacyHost = document.querySelector('#kpool_widget')
if (legacyHost) {
	const params = new URLSearchParams(window.location.search)
	mount(legacyHost, {
		network: params.get('network'),
		txid:    params.get('txid'),
		pch:     params.get('pch') || 'no_pch',
		signer:  null
	})
}


// Compute a one-line status summary and hand it to the host (modal header).
function pushStatus(txState) {
	updateFinalState(txState.data)   // hide signing section once the tx is final (normal mode)
	if (!txState.onStatus) return
	txState.onStatus(summariseStatus({ data: txState.data, readiness: txState.readiness }))
}

// Live cue helper. In the modal we flash a transient pill in the header; for a
// bare (non-modal) mount there's no header, so fall back to the inline banner.
function notify(txState, msg, tone = 'success') {
	if (txState.onFlash) txState.onFlash(msg, tone)
	else showBanner(msg, tone)
}

// Only one tx widget should be live at a time. Opening a new modal must tear down
// the previous tx's poll timer + socket — otherwise the old tx keeps polling for
// up to 5 min and writes into the shared by-id status/readiness DOM, which looks
// like status "flapping" between two transactions. See teardownTxState.
let _activeTxState = null

function teardownTxState(txState) {
	if (!txState || txState.destroyed) return
	txState.destroyed = true
	try { if (txState.pollTimer) clearInterval(txState.pollTimer) } catch {}
	try { if (txState.countdownTimer) clearInterval(txState.countdownTimer) } catch {}
	try { txState.socket?.close?.() } catch {}
	txState.pollTimer = null
	txState.countdownTimer = null
	txState.socket = null
	try { globalThis.kdiag?.('tx:teardown', { txid: txState.txid }) } catch {}
}

// True once the widget's DOM has been removed (modal closed) — used by the poll /
// socket handlers to stop updating a tx whose UI is gone.
function txStateLive(txState) {
	return !!txState && !txState.destroyed && txState.container?.isConnected !== false
}

// Drive the modal-header countdown (⏱ hh:mm:ss) from the txid's scheduled time. Shows while the
// tx is pending and within the meaningful window; goes blank (space reserved in the header) once
// final. No-op without an onCountdown host hook (e.g. bare mount).
function startHeaderCountdown(txState) {
	if (!txState.onCountdown) return
	const target = parseTxId(txState.txid)?.seconds
	if (!target) return
	const tick = () => {
		if (!txStateLive(txState)) { clearInterval(txState.countdownTimer); txState.countdownTimer = null; return }
		const d = txState.data || {}
		if (d.comboStatus === 'SUCCESS' || d.mirrorStatus || d.receiptSuccess === true) {
			txState.onCountdown(''); clearInterval(txState.countdownTimer); txState.countdownTimer = null; return
		}
		const diff = target - Math.floor(Date.now() / 1000)
		// window = real validDuration decoded from the signed bytes (VALIDD1);
		// 180 remains only as the fallback when bytes aren't available.
		const validSecs = d.validDurationSeconds || 180
		txState.onCountdown(diff > -validSecs ? `⏱ ${formatCountdown(diff)}` : '')
	}
	tick()
	txState.countdownTimer = setInterval(tick, 1000)
}

async function renderSingleTx(hostEl, network, txid, pch = 'no_pch', opts = {}) {
	// supersede any previous tx widget so two don't poll/render concurrently
	if (_activeTxState && _activeTxState.txid !== txid) teardownTxState(_activeTxState)

	const txState = createTxState(network, txid, pch)
	_activeTxState = txState
	txState.onStatus = opts.onStatus
	txState.onCountdown = opts.onCountdown
	txState.onFlash  = opts.onFlash
	txState.onLock   = opts.onLockModal
	txState.onUnlock = opts.onUnlockModal
	txState.readUrl  = opts.readUrl   // absolute endpoint when embedded off-origin
	txState.saveUrl  = opts.saveUrl

	startHeaderCountdown(txState)   // ⏱ countdown in the modal header

	hostEl.append(txState.container)
	txState.container.innerHTML = '<div class="kpsign-msg" style="padding:28px;text-align:center">Loading transaction…</div>'

	try {
		const tx = await renderTxView(txState)
		if (tx?.notFound) return // renderTxView already rendered a visible reason - nothing left to load, signer, or poll for

		// Render the WalletConnect signer BEFORE the account enrich. renderSigner is
		// independent of loadSigningState's output, and loadSigningState's fetches have
		// no timeout — on mobile it was hanging and blocking the WC pane entirely
		// (logs: ksig:qr-rendered fired but tx:load-timing/signer:render never did).
		// Drawing the signer first means the Connect button always shows.
		if (opts.signer === 'walletconnect') await renderSigner(txState, opts)

		await loadSigningState(txState, tx)

		startTxSocket(txState)
		startTxPolling(txState, tx)
	} catch (e) {
		console.warn('txRead fetch failed', e)
		window.kdiag?.('tx:load-error', { error: String(e) })
		txState.container.innerHTML = '<div class="kpsign-msg" style="padding:28px;text-align:center;color:#b00020">Couldn\'t load this transaction. Check your connection and try again.</div>'
	}
}

// Fills the #txread-signer slot (the WalletConnect item on the methods bar).
// When signer is disabled the slot stays empty and is hidden via :empty.
async function renderSigner(txState, opts) {
	const slot = txState.container.querySelector('#txread-signer')
	if (!slot) return

	const { renderWalletConnectSigner } = await import(`./signer-walletconnect.js?v=${V}`)

	renderWalletConnectSigner(slot, {
		network:  txState.network,
		txid:     txState.txid,
		readUrl:  opts.readUrl,
		saveUrl:  opts.saveUrl,
		// TX-CARDS-WCPREVIEW1: let the picker say what signing the selected account does.
		signerPreview: (accountId) => {
			try { return computeSignerPreview({ data: txState.data, accounts: txState.accounts, accountId }) }
			catch (e) { return { state: 'loading', text: '' } }
		},
		onSigned:  async (saveResult) => {
			notify(txState, '✍️ Signature submitted', 'success')
			// KFLOW-MARKERS1 G2: fe-tier signing checkpoint, correlated to the katomia run
			// (window.kflow carries run/visit/user on the game page). Proves THIS participant
			// signed — a triangle needs all ring members to sign, so per-user sign events let
			// the challenge confirm each did (SUCCESS alone only proves the threshold was met).
			// saveResult.result.sigs is the authoritative sig set; count is the fingerprint.
			try { globalThis.kflow?.('sign:done', 'ok', { txid: txState?.txid, sigs: saveResult?.result?.sigs?.length ?? null }) } catch (e) {}
			if (!txStateLive(txState)) return

			// INSTANT update (FRONT-POSTSIGN1): the previous version did a ~5s txRead
			// before re-rendering, so the modal lagged behind the toast. txSave already
			// returns the full authoritative sig set ({pubKey,signature}) — fold it into
			// txState.data and re-render with NO network call (accounts are already
			// enriched from load). Polling/WS still reconcile afterwards.
			const sigs = saveResult?.result?.sigs
			if (Array.isArray(sigs) && sigs.length) {
				txState.data = { ...txState.data, sigs, _trigger: 'sign' }
				try { renderSigningSection(txState, { data: txState.data, accounts: txState.accounts }) }
				catch (e) { console.warn('instant post-sign render failed', e) }
			} else {
				// fallback: no sigs in the save response — re-read authoritatively.
				try {
					const fresh = await txRead({ network: txState.network, txid: txState.txid })
					txState.data = { ...txState.data, ...fresh.data,
						comboStatus: txState.data.comboStatus === 'SUCCESS' ? 'SUCCESS' : fresh.data.comboStatus,
						_trigger: 'sign' }
					await refreshSigningSection(txState, { data: txState.data, accounts: txState.accounts })
				} catch (e) { console.warn('post-sign refresh failed', e) }
			}
		},
		onAccount: (acct, accts) => {
			if (accts) txState.connectedAccounts = accts   // full list on (dis)connect; undefined on a plain switch → keep set
			updateNarrative(txState, acct)
			markConnectedAccounts(txState.connectedAccounts || [])
		},
		onLock:    txState.onLock,
		onUnlock:  txState.onUnlock
	})
}

let methodsCss = false
function injectMethodsCSS() {
	if (methodsCss) return
	methodsCss = true

	const s = document.createElement('style')
	s.id = 'kp-methods-css'
	s.textContent = `
		.kpsign-panel{ max-width:min(900px,100%); margin:16px auto; }
		.kpsign-tabs{ position:relative; display:flex; }
		.kpsign-tabs::after{ content:''; position:absolute; left:0; right:0; bottom:0; height:1px; background:#eee; }
		/* (Status tab retired 2026-07-07 — STATUS-TAB-RETIRE1: per-account status lives on
		   the cards; line items moved to the bottom nerd panel.) */
		/* final tx (SUCCESS / expired / error): no action possible — hide the signing
		   section in normal mode; keep it in nerd (wallets can still sign; possible future
		   "sign to endorse after consensus" use case). */
		body:not(.nerd) #txread-methods.tx-final{ display:none; }
		.kpsign-tab{ all:revert; flex:1 1 0; cursor:pointer; border:none; background:transparent;
			display:flex; align-items:center; justify-content:center; gap:8px;
			padding:10px 8px; font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif;
			color:#777; transition:color .2s ease; }
		.kpsign-tab:hover{ color:#374151; }
		.kpsign-tab:focus, .kpsign-tab:focus-visible{ outline:none; }
		.kpsign-tab.active{ color:#084298; }
		/* Host pages (e.g. Katomia) can have a global button:hover background that
		   bleeds onto these tabs (the dark-green flash). Pin the background across
		   all states, scoped under the panel id so we win on specificity. The OG
		   page has no hover background, which is the look we want everywhere. */
		#txread-methods .kpsign-tab,
		#txread-methods .kpsign-tab:focus,
		#txread-methods .kpsign-tab:active,
		#txread-methods .kpsign-tab.active{ background:transparent; box-shadow:none; }
		/* WALLET-TABS1: hover gets a light-gray wash like the account-card header hover
		   (.txcard-head.acct-hl) — the font-colour-only cue was too subtle. Scoped here
		   so it also beats any host-page button hover background. */
		#txread-methods .kpsign-tab:hover{ background:#e4e4e7; box-shadow:none; border-radius:6px 6px 0 0; }
		.kpsign-tabicon{ width:16px; height:16px; object-fit:contain; flex:0 0 auto; }
		.kpsign-underline{ position:absolute; bottom:0; left:0; height:2px; width:0;
			background:#4aa3ff; transition:transform .25s ease, width .25s ease; }
		.kpsign-hint{ text-align:center; color:#999; font:13px system-ui; padding:14px; }
		.kpsign-pane{ display:none; padding:14px; }
		.kpsign-pane.active{ display:block; }
		.kpsign-desc{ font:13px system-ui,-apple-system,"Segoe UI",sans-serif; color:#555;
			text-align:center; margin-bottom:10px; line-height:1.5; }
		.kpsign-desc a{ color:#084298; }
		.kpsign-newtab{ font-size:12px; }
		/* Tall enough that the embedded WhatsApp QR page (loaded with &embed=1, so
		   it returns a lean layout) isn't cropped on desktop. Mobile gets 80vh. */
		.kpsign-frame{ width:100%; height:min(72vh,560px); border:0; border-radius:8px; background:#fafafa; }
		.kpsign-pane .kpsign{ margin:6px 0 0; }
		/* MODALDVH1: same unit trap as the card — vh overhangs the phone's bottom bar */
		@media (max-width:600px){ .kpsign-frame{ height:80vh; height:80dvh; } }
	`
	document.head.appendChild(s)
}


// ── signing panel ────────────────────────────────────────────────────────────
// Clean method picker. Tabs: WhatsApp · Wallet · KSIG. Selecting one reveals its
// pane (description + controls). iframes are lazy — loaded only when first shown.

function whatsAppUrl(network, txid, pch) {
	const url = new URL('https://kpay.uk/message/')
	url.searchParams.set('network', network)
	url.searchParams.set('channel', 'WhatsApp')
	url.searchParams.set('message', `sign ${txid} #${pch}`)
	return url.toString()
}

function ksigWidgetUrl(network, txid) {
	return `https://kpos-uk.DISABLED-SECURITY-20260827.invalid/sign/offline/widget?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`
}

function makeDesc(html, newTabUrl) {
	const d = document.createElement('div')
	d.className = 'kpsign-desc'
	d.innerHTML = html
	if (newTabUrl) {
		const a = document.createElement('a')
		a.className = 'kpsign-newtab'
		a.href = newTabUrl
		a.target = '_blank'
		a.rel = 'noopener'
		a.textContent = '↗ open in new tab'
		d.append(document.createElement('br'), a)
	}
	return d
}

function lazyFrame(src) {
	const f = document.createElement('iframe')
	f.className = 'kpsign-frame'
	f.dataset.src = src
	f.setAttribute('allow', 'camera')
	f.setAttribute('scrolling', 'no')
	return f
}

function activatePane(el) {
	el.querySelectorAll('iframe[data-src]').forEach(f => {
		if (!f.getAttribute('src')) f.src = f.dataset.src
	})
	if (el._lazyInit) { const fn = el._lazyInit; el._lazyInit = null; fn() }
}

function buildWcPane(txState) {
	const pane = document.createElement('div')
	pane.appendChild(makeDesc(
		`Connect a Hedera wallet to sign in your browser. We recommend ` +
		`<a href="https://www.hashpack.app/" target="_blank" rel="noopener">HashPack</a> or ` +
		`<a href="https://www.kabila.app/" target="_blank" rel="noopener">Kabila</a>.`
	))
	const slot = document.createElement('div')
	slot.id = 'txread-signer'   // filled by renderSigner()
	pane.appendChild(slot)
	return pane
}

function buildWhatsAppPane(network, txid, pch) {
	// SECURITY 2026-08-27: kpay.uk is compromised — do not iframe it or hand it
	// txid/pch. Pane disabled until the WhatsApp signer moves to a trusted host.
	// SIGNTABS-WA1 (user 2026-09-04): keep the tab VISIBLE — hiding it means it gets forgotten —
	// but mark it parked. The route only ever produced a deep link / QR to the message service,
	// so it comes back by re-enabling that service, not by changing this widget.
	const pane = document.createElement('div')
	const soon = document.createElement('div')
	soon.className = 'kpsign-msg'
	soon.style.cssText = 'display:inline-block;padding:4px 10px;border-radius:999px;background:#fff3cd;color:#7a5a00;font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase'
	soon.textContent = 'Coming soon'
	pane.appendChild(soon)
	pane.appendChild(makeDesc('Signing over WhatsApp is parked while its message service moves to a trusted host. Use WalletConnect, or the Offline (KSIG) tab for multi-signature.'))
	return pane
}

function buildKsigPane(txState) {
	const { network, txid, pch, readUrl, saveUrl } = txState
	const pane = document.createElement('div')
	pane.appendChild(makeDesc(
		`Sign offline on another device. Scan this QR with the KSIG app. ` +
		`Don't have it? <a href="https://ksig.uk/pwa" target="KPAYPWA">Get KSIG</a>.`
	))

	const mount = document.createElement('div')
	mount.className = 'kpsign-ksig'
	pane.appendChild(mount)

	// rendered in-house (local QR) on first activation, not via an iframe.
	// readUrl matters off-origin (e.g. Katomia): without it the QR fetch hits the
	// host page and gets HTML back, which is the "Unexpected token '<'" failure.
	pane._lazyInit = async () => {
		const { renderKsig } = await import(`./ksig.js?v=${V}`)
		renderKsig(mount, {
			network,
			txid,
			pch,
			readUrl,   // absolute endpoint matters off-origin (Katomia) — see comment above
			saveUrl,   // SIGN-KSIG-SAVEURL1: same reason — the scan-back POST must hit the
			           // host's kpool txSave endpoint, NOT the page-relative default (which
			           // is the Katomia game HTML page → the sig silently vanished).
			// KQR2 req= hint for KSIG v2: the keys kpool's readiness says must sign.
			// Read live — keyInfo loads async, so readiness may land after this pane
			// was built. Empty is fine: the hint is a shortlist, never a gate.
			requiredKeys: () => [...(txState.readiness?.allRequiredKeys || [])],
			onSigned: () => notify(txState, '✍️ Signature submitted', 'success')
		})
	}

	return pane
}

// brand icons live alongside the widget (./assets), so resolve them relative to
// this module's URL — a page-relative './assets' would resolve against the host
// page (e.g. /future/) instead of /vendor/kpay/kpool_widget/.
const assetUrl = name => new URL(`./assets/${name}`, import.meta.url).href

// STATUS-TAB-RETIRE1: INFO_SVG + buildStatusPane below are ORPHANED (tab removed
// 2026-07-07) — kept commented-in-place for one release in case anything external
// deep-linked the pane; delete in the next cleanup pass along with
// view.js renderAccountKeyInfo (the approvals table that only this pane displayed).
const INFO_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none"/></svg>`

// Status tab pane: status detail + a one-line explainer + the approvals table.
// The status/approval elements were created in view.js (buildTxReadColumns) and
// are placed here so the render-by-id functions keep targeting them.
function buildStatusPane(txState) {
	const pane = document.createElement('div')

	const inner = document.createElement('div')
	inner.id = 'txread-status'
	inner.className = 'txread-status tx-loading'

	// statusBlock now lives in the header (normal-visible) — see buildTxReadColumns.
	inner.appendChild(txState.view.readinessEl)
	inner.appendChild(txState.view.precheckEl)

	const desc = document.createElement('div')
	desc.className = 'kpsign-desc txread-approvals-desc'
	desc.innerHTML = `These keys must approve before the transaction can execute. ` +
		`<b>Banzhaf</b> is each key's voting power; <b>redundancy</b> is how replaceable it is.`
	inner.appendChild(desc)

	inner.appendChild(txState.view.accountKeysEl)

	pane.appendChild(inner)
	return pane
}

// Nerd-view toggle (TX-CARDS3). Mirrors katomia's nerd flag (localStorage
// katomia.nerd.v1 + body.nerd) so it stays in sync with the profile panel toggle.
// nerd ON → line-item table; OFF → cards. Flipping re-renders the transfer block
// (+ narrative) from cached data — no refetch.
function setNerd(on) {
	try { localStorage.setItem('katomia.nerd.v1', on ? '1' : '0') } catch {}
	document.body.classList.toggle('nerd', on)
	const profileToggle = document.getElementById('katomia-nerd-toggle')
	if (profileToggle) profileToggle.checked = on

	// (STATUS-TAB-RETIRE1: the old "fall off the hidden Status tab" fixup is gone with
	// the tab itself.)
}

// Nerd-only "open in new tab" affordance (MODAL-URL1 item 3): opens the same tx in
// the standalone /future signing page, so the modal can be viewed outside katomia.
// Gated to nerd mode via .kpm-open-tab (see modal.js CSS: shown only when body.nerd).
function buildOpenInNewTab(txState) {
	const a = document.createElement('a')
	a.className = 'kpm-open-tab'
	a.title = 'Open this signing view in a new tab (standalone)'
	a.target = '_blank'
	a.rel = 'noopener'
	const pchPart = (txState.pch && txState.pch !== 'no_pch') ? '&pch=' + encodeURIComponent(txState.pch) : ''
	a.href = '/future/?network=' + encodeURIComponent(txState.network) + '&txid=' + encodeURIComponent(txState.txid) + pchPart
	a.textContent = '↗'
	return a
}

function buildNerdToggle(txState) {
	// Emoji toggle (user 2026-08-05): 🙂 tap ↔ 🤓, replacing the checkbox — more
	// fun, and one fixed-width glyph beside the ✕ so toggling never shifts the row.
	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'txread-nerd-toggle'
	btn.title = 'Nerd view — show the line-item table instead of the account cards (dev)'
	let on = resolveTxView() === 'table'
	const paint = () => { btn.textContent = on ? '🤓' : '🙂' }
	paint()
	btn.onclick = () => { on = !on; setNerd(on); paint(); rerenderTransferView(txState) }
	return btn
}

// Swap just the transfer block (cards ↔ table) in place from cached flow/transfers,
// then re-apply the narrative for the new mode. No network.
function rerenderTransferView(txState) {
	const root = txState.view?.el
	if (!root) return
	const old = root.querySelector('.txread-intent-xfers')
	if (!old) return
	const fresh = buildTransferViews({ network: txState.network, flow: txState.flow, transfers: txState.transfers })
	fresh.classList.add('txread-intent-xfers')
	old.replaceWith(fresh)
	updateNarrative(txState, txState.viewerAccount)

	// The fresh cards render blank of signing/balance state — re-apply it from cached data
	// so toggling nerd↔normal fully repaints (previously this needed a page refresh). No
	// network: renderSigningSection recomputes from txState.data + txState.accounts.
	if (txState.accounts && txState.data) renderSigningSection(txState, { data: txState.data, accounts: txState.accounts })
	markConnectedAccounts(txState.connectedAccounts || [])   // fresh cards lose the (u) marker — re-apply
}

// Experimental "You send / You receive" narrative, derived from the connected
// wallet account and the transfer line items. Hidden when no account is known.
function updateNarrative(txState, account) {
	txState.viewerAccount = account   // remembered so a view re-render can re-apply it
	const box = txState.container.querySelector('#txread-narrative')
	if (!box) return

	// The You-send/receive narrative only complements the nerd/table view. In cards
	// (normal) mode it's redundant — the account card already shows send (left/rose) vs
	// receive (right/green) — so we hide it there.
	const items = txState.transfers?.lineItems || []
	if (resolveTxView() !== 'table' || !account || !items.length) { box.hidden = true; box.innerHTML = ''; box.removeAttribute('data-acct'); return }

	const fmt = li => {
		const meta = li.assetMeta || {}
		// same short-label rule as the cards/table (fixes long HEDERA:// symbols here too)
		const sym = (meta.raw === 'tinybar') ? 'HBAR' : pickAssetLabel(meta)
		const amt = Math.abs(Number(li.amountFormatted ?? li.amount))
		return `${amt} ${sym}`.trim()
	}

	const mine = items.filter(li => li.account === account)
	const sends = mine.filter(li => Number(li.amountRaw ?? li.amount) < 0)
	const recvs = mine.filter(li => Number(li.amountRaw ?? li.amount) > 0)

	if (!sends.length && !recvs.length) { box.hidden = true; box.innerHTML = ''; box.removeAttribute('data-acct'); return }

	const row = (label, li, cls) =>
		`<div class="nrow"><span class="nlabel">${label}</span><span class="${cls}">${fmt(li)}</span></div>`

	let html = `<h4>You (${account})</h4>`
	html += sends.map(li => row('send', li, 'nout')).join('')
	html += recvs.map(li => row('receive', li, 'nin')).join('')

	box.innerHTML = html
	box.dataset.acct = account
	box.hidden = false
}

function buildSigningPanel(txState) {
	const { network, txid, pch } = txState

	const panel = document.createElement('div')
	panel.id = 'txread-methods'
	panel.className = 'kpsign-panel'

	const tabs = document.createElement('div')
	tabs.className = 'kpsign-tabs'

	const panes = document.createElement('div')
	panes.className = 'kpsign-panes'

	// WALLET-TABS1: which signing methods are offered. Hard-coded to all three for now,
	// but the app is heading for a functionality prune (fewer, better-supported signing
	// paths) — this list is the seam where that pruning will land, whether or not it ends
	// up being the mechanism. Until then, a ?signtabs= URL param on the host page filters
	// the set at runtime (e.g. ?signtabs=walletconnect or ?signtabs=whatsapp,offline) so
	// the pruned UI can be previewed without a code change. Unknown/empty selections fall
	// back to the full set. (The legacy Status tab was retired 2026-07-07 —
	// STATUS-TAB-RETIRE1.)
	const ENABLED_SIGN_METHODS = ['walletconnect', 'whatsapp', 'ksig']
	const TAB_ALIASES = { offline: 'ksig', wallet: 'walletconnect', wc: 'walletconnect' }
	const requested = (new URLSearchParams(location.search).get('signtabs') || '')
		.split(',').map(s => s.trim().toLowerCase()).map(s => TAB_ALIASES[s] || s).filter(Boolean)
	const enabledTabs = requested.some(id => ENABLED_SIGN_METHODS.includes(id))
		? ENABLED_SIGN_METHODS.filter(id => requested.includes(id))
		: ENABLED_SIGN_METHODS

	// STATUS-TAB-RETIRE1 (user 2026-07-07): the legacy Status tab is gone — its content
	// is covered by the normal view (per-card signing state, precheck chips/rings,
	// expanded-card key tables with Banzhaf/redundancy tooltips) and the nerd bottom
	// panel (line items + narrative, built in view.js buildTxReadColumns).
	const METHODS = [
		{ id: 'walletconnect', label: 'WalletConnect',   icon: 'WalletConnect-Logo.png',           build: () => buildWcPane(txState) },
		{ id: 'whatsapp',      label: 'WhatsApp',        icon: 'WhatsApp.svg.png',                 build: () => buildWhatsAppPane(network, txid, pch) },
		{ id: 'ksig',          label: 'Offline',         icon: 'kpay_logo_square_transparent.png', build: () => buildKsigPane(txState) }
	].filter(m => enabledTabs.includes(m.id))

	const DEFAULT = METHODS[0]?.id || 'walletconnect'
	const paneEls = {}

	METHODS.forEach(m => {
		const tab = document.createElement('button')
		tab.type = 'button'
		tab.className = 'kpsign-tab'
		tab.dataset.method = m.id

		if (m.svg) {
			const span = document.createElement('span')
			span.className = 'kpsign-tabicon'
			span.innerHTML = m.svg
			tab.appendChild(span)
		} else {
			const icon = document.createElement('img')
			icon.className = 'kpsign-tabicon'
			icon.src = assetUrl(m.icon)
			icon.alt = ''
			// the assets/ folder ships with some hosts and not others (the static bundle has none):
			// a missing icon must not leave a broken-image glyph on the tab
			icon.onerror = () => icon.remove()
			tab.appendChild(icon)
		}

		const lbl = document.createElement('span')
		lbl.textContent = m.label
		tab.appendChild(lbl)

		tab.addEventListener('click', () => select(m.id))
		if (m.id === DEFAULT) tab.classList.add('active')
		tabs.appendChild(tab)

		const pane = m.build()
		pane.classList.add('kpsign-pane')
		pane.dataset.method = m.id
		if (m.id === DEFAULT) { pane.classList.add('active'); activatePane(pane) }
		paneEls[m.id] = pane
		panes.appendChild(pane)
	})

	// sliding underline that smoothly tracks the active tab
	const underline = document.createElement('div')
	underline.className = 'kpsign-underline'
	tabs.appendChild(underline)

	// preload the offline QR (fetch + lib + render) so the Offline tab is instant
	if (paneEls.ksig?._lazyInit) { const fn = paneEls.ksig._lazyInit; paneEls.ksig._lazyInit = null; fn() }

	function positionUnderline() {
		const a = tabs.querySelector('.kpsign-tab.active')
		if (!a) return
		underline.style.width = a.offsetWidth + 'px'
		underline.style.transform = `translateX(${a.offsetLeft}px)`
	}

	function select(id) {
		const startH = panes.offsetHeight

		tabs.querySelectorAll('.kpsign-tab').forEach(t =>
			t.classList.toggle('active', t.dataset.method === id))
		Object.entries(paneEls).forEach(([k, el]) => {
			const on = k === id
			el.classList.toggle('active', on)
			if (on) activatePane(el)
		})

		positionUnderline()

		// animate the pane area height between tabs (no jolt)
		panes.style.height = 'auto'
		const endH = panes.offsetHeight
		if (startH && endH && startH !== endH) {
			panes.style.height = startH + 'px'
			void panes.offsetHeight
			panes.style.transition = 'height .25s ease'
			panes.style.height = endH + 'px'
			panes.addEventListener('transitionend', function te() {
				panes.style.transition = ''
				panes.style.height = 'auto'
				panes.removeEventListener('transitionend', te)
				revealActivePane()
			}, { once: true })
		} else {
			revealActivePane()
		}
	}

	// SIGNSCROLL1 (feedback 4bc3e7fe, 2026-09-05): "when choosing a wallet option the modal
	// should auto scroll to bring the whole option into view — offline should reveal the
	// full QR, WalletConnect the buttons — so the user doesn't have to choose and then
	// manually scroll." The tabs sit well down a long modal, so on a phone the pane opens
	// entirely below the fold and every choice needed a scroll to be worth making.
	//
	// Scrolls the modal body, not the page: scrollIntoView() would walk up to the document
	// and drag the whole page around on hosts that embed the widget. Aims for the TABS
	// (not the pane) so the choice stays visible above what it revealed — landing on the
	// pane alone leaves the row of options off-screen and you can't tell what you picked.
	// If the pane is short enough to fit under the tabs, it settles there; a tall pane
	// (the QR) tops out at the tabs and shows as much of the rest as the viewport allows.
	function revealActivePane() {
		const pane = panes.querySelector('.kpsign-pane.active')
		if (!pane) return
		// inside the modal it's the modal body that scrolls; mounted bare into a host page
		// (tx_approval.php) it's the window. Both are measured against the viewport, so the
		// same arithmetic covers them — only the scroll target differs.
		const scroller = panel.closest('.kpm-body') || panel.closest('[data-kpsign-scroll]')
			|| document.scrollingElement || document.documentElement
		if (!scroller) return
		requestAnimationFrame(() => {
			const sRect = scroller === document.scrollingElement || scroller === document.documentElement
				? { top: 0, bottom: window.innerHeight }
				: scroller.getBoundingClientRect()
			const tRect = tabs.getBoundingClientRect()
			const pRect = pane.getBoundingClientRect()
			// how far past the bottom edge the pane runs, and how far the tabs would have
			// to travel to reach the top — take the smaller move so the tabs stay on screen
			const overflow = Math.max(0, pRect.bottom - sRect.bottom + 12)
			const toTop = Math.max(0, tRect.top - sRect.top - 8)
			const delta = Math.min(overflow, toTop)
			if (delta < 8) return
			scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' })
		})
	}

	panel.append(tabs, panes)
	txState.selectSignMethod = select
	txState.positionUnderline = positionUnderline
	return panel
}


function createTxState(network, txid, pch) {
	const container = document.createElement('div')

	return {
		network,
		txid,
		pch,
		container,
		view: null,
		data: null,
		accounts: null,
		successAnimationFired: false
	}
}

function createSigningDetails(network, txid) {
	const details = document.createElement('details')

	const summary = document.createElement('summary')
	summary.innerHTML = "✍️ Sign offline with <a href='https://ksig.uk/pwa' target='KPAYPWA'>KSIG</a>"
	summary.style.marginTop = '16px'
	summary.style.display = 'block'

	const p = document.createElement('p')
	p.textContent = 'QR scan the transaction, sign, then return the signed transaction'

	const iframe = createKsigIframe(network, txid)

	details.appendChild(summary)
	details.appendChild(p)
	details.appendChild(iframe)

	return details
}


function createKpayWhatsAppLink(network, txid, pch) {
	// SECURITY 2026-08-27: kpay.uk is compromised — link disabled (was leaking txid+pch).
	const p = document.createElement('p')
	p.textContent = 'WhatsApp signing is temporarily disabled.'
	return p
}


function createKsigIframe(network, txid) {
	const iframe = document.createElement('iframe')

	iframe.id = 'iframeKSIG'
	iframe.style.width = '100%'
	iframe.style.height = '300px'
	iframe.setAttribute('scrolling', 'no')
	iframe.style.overflow = 'hidden'
	iframe.setAttribute('allow', 'camera')
	iframe.src = `https://kpos-uk.DISABLED-SECURITY-20260827.invalid/sign/offline/widget?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`

	return iframe
}


async function renderTxView(txState) {
	const { network, txid, container } = txState

	// phase timing — splits backend txRead from the frontend mirror-node enrich so
	// the load latency can be attributed (emitted as tx:load-timing in loadSigningState).
	const _t0 = performance.now()
	const { url, rawTx, data, transfers, accounts } = await txRead({ network, txid })
	const _t1 = performance.now()

	// VISIBILITY1: kpool genuinely having no record of this txid (eg a ksig-built
	// transaction that was never registered anywhere - the offline-sign flow hands
	// bytes straight back to the browser and, unlike the scheduled-tx path, nothing
	// currently saves them server-side) used to fail completely silently here: data
	// came back as a real (truthy) object shaped like {errors, mirror}, not empty/
	// null, so it sailed straight past every guard into buildFlowModel() with no
	// real transfers/accounts to work from - producing a populated-looking page with
	// 0 line items and no visible indication why. Surface it instead of guessing on.
	// A mirror 404 alone is NOT "no record": a pre-consensus tx (e.g. a fresh
	// server-side-execution save waiting for its remaining signatures) is exactly
	// the case where kpool HAS the record and the mirror legitimately hasn't heard
	// of it yet. Only declare not-found when kpool itself came back empty too —
	// i.e. no signed bytes, no basis, no signatures (GM-SSEFLAG1 live false alarm
	// 2026-07-24: modal opened on a just-saved tx, bytes-verify matched on basis,
	// and this guard still painted "No record ... mirror fetch failed 404" over it).
	const hasKpoolRecord = !!(data?.hex2 || data?.PCH_basis || data?.sigs?.length)
	if (!hasKpoolRecord && (data?.errors?.length || data?.mirror?.ok === false)) {
		const reason = data.errors?.[0]?.message || data.mirror?.message || 'no detail returned'
		container.innerHTML = '' // clear the "Loading transaction…" placeholder before appending
		renderError(container, `⚠️ No record of this transaction was found (kpool + mirror node both came back empty) — reason: ${reason}. It may never have been registered, or hasn't reached consensus yet.`)
		// notFound, not thrown: the caller must not treat this as an exception (it
		// used to return undefined here, which the caller then fed straight into
		// loadSigningState(), which threw on it, which the caller's own catch-all
		// treated as a generic connection failure and used to overwrite the message
		// above with "Couldn't load this transaction..." a moment after it rendered)
		return { notFound: true }
	}

	await enrichTransfersInfo({ network, transfers })
	const _t2 = performance.now()
	txState._timing = { txRead: Math.round(_t1 - _t0), enrichTransfers: Math.round(_t2 - _t1) }
	txState.transfers = transfers

	// normalized, view-agnostic flow model (TX-CARDS1) — built once from the enriched
	// transfers + accounts. The table reads flow.lineItems (identical to transfers.lineItems);
	// later card/flow/ring views consume flow.accounts/pools/edges.
	const flow = buildFlowModel(transfers, accounts)
	txState.flow = flow

	injectTxReadCSS()

	container.classList.add('txread')

	txState.view = buildTxReadColumns({
		rawTx,
		data,
		transfers,
		flow,
		network,
		txid,
		pch: txState.pch
	})

  // container.appendChild(txState.view.el)
  // container.appendChild(kpayLink)
  // container.appendChild(details)

  container.textContent = ''
  container.appendChild(txState.view.el)

  // nerd-view toggle — prefer the modal header (left of the close ✕) when mounted
  // in the signing modal; fall back to the widget's own top-right corner when the
  // widget is embedded inline (no .kpm-card ancestor). (ORDERS-UI1)
  // NERDHEAD-RETIRE1 (feedback kilo-yankee-58, 2026-09-06): "this signing modal
  // currently has a nerd toggle in the header — I think we can take that off now. We've
  // got the nerd toggle available in profile … if we do have nerd mode switched on,
  // then yes, leave the nerd options visible. So we still apply nerd options if they
  // exist, we just don't allow the user to toggle [here]."
  // So the 🙂/🤓 button goes from the modal header; everything it used to switch is
  // untouched and still follows body.nerd / katomia.nerd.v1 from ⚙ Profile — including
  // the ↗ open-in-new-tab, which stays because it is a nerd option, not a toggle.
  // The standalone /m/sign page has no profile panel to set nerd from, so the inline
  // fallback keeps its toggle.
  const headActions = container.closest?.('.kpm-card')?.querySelector('.kpm-head-actions')
  if(headActions){
    headActions.insertBefore(buildOpenInNewTab(txState), headActions.firstChild)
  } else txState.view.el.appendChild(buildNerdToggle(txState))

  // signing panel: a clean method picker (WhatsApp · Wallet · KSIG). Choosing a
  // method reveals its short description + controls/QR/iframe in the pane below.
  // Sits in the dedicated #txread-sign-slot, between Intent and Status.
  injectMethodsCSS()
  const panel = buildSigningPanel(txState)
  const signSlot = txState.view.el.querySelector('#txread-sign-slot')
  if (signSlot) signSlot.append(panel)
  else container.append(panel)

  // position the tab underline once the panel is laid out
  requestAnimationFrame(() => txState.positionUnderline?.())
  
	return { url, rawTx, data, transfers, accounts }
}


async function loadSigningState(txState, tx) {
	const { network } = txState

	// Run the two enriches CONCURRENTLY. They're independent (acc.info via the Hedera
	// mirror vs acc.keyInfo via the slow kpos getAccountInfo.php — 5-7.5s/account on
	// testnet) but were awaited in series, blocking render for the SUM. Now the render
	// waits for the slower of the two, not both. (WC-SLOW1 / FRONT-ENRICH1)
	const _t0 = performance.now()
	let _t1 = _t0, _t2 = _t0
	await Promise.all([
		enrichAccountsInfo({ network, accounts: tx.accounts }).then(() => { _t1 = performance.now() }),
		enrichAccountsKeyInfo({ network, accounts: tx.accounts }).then(() => { _t2 = performance.now() }),
	])

	// one structured timing line per load so the slow tx-detail load is attributable:
	// txRead (backend) vs the mirror-node enrich phases (frontend, now concurrent).
	try {
		const tm = txState._timing || {}
		tm.enrichAccountsInfo = Math.round(_t1 - _t0)
		tm.enrichAccountsKeyInfo = Math.round(_t2 - _t0)
		tm.enrichWall = Math.round(performance.now() - _t0)   // wall time (max of the two)
		tm.total = (tm.txRead || 0) + (tm.enrichTransfers || 0) + tm.enrichWall
		globalThis.kdiag?.('tx:load-timing', { txid: txState.txid, accounts: Object.keys(tx.accounts || {}).length, ...tm })
	} catch {}

	calcAccountsThatSign(tx.accounts)

	tx.data.sigs = reconcileSigs(txState, tx.data.sigs)   // seed the monotonic set (SIGN-OSCILLATE1)

	tx.readiness = evaluateTxReadiness({ accounts: tx.accounts, data: tx.data })
	renderReadinessInfo({ readiness: tx.readiness })

	renderSigningInfo({
		data: tx.data,
		network,
		accounts: tx.accounts
	})

	renderPrecheckInfo({ precheck: tx.data?.precheck })

	txState.data = tx.data
	txState.accounts = tx.accounts
	txState.readiness = tx.readiness

	txState.container.querySelector('#txread-status')?.classList.remove('tx-loading')

	pushStatus(txState)
	markSettledIfSuccess(tx.data)   // already-succeeded tx opens in the settled 'after' state
}


function startTxSocket(txState) {
	txState.socket = createTxSocket({
		// KAT-SAMEORIGIN-FE1: empty HAPI_BASE = same-origin mode — ride the page
		// origin's /hapi/ws (htaccess wstunnel on Lincoln labs, vhost ProxyPass on
		// GCP). The old 'hapi2.hbar.live/live' hardcode only ever fired in this
		// empty case and pointed at legacy prod — wrong for every current deploy.
		baseUrl: CONFIG.HAPI_BASE || (location.host + '/hapi'),
		txid: txState.txid,
		onTxUpdate: async function onTxUpdate(update) {
			await handleTxUpdate(txState, update)
		}
	})
}


async function handleTxUpdate(txState, update) {
	const { network, txid, pch, view } = txState

	// ignore (and tear down) updates for a tx whose modal has closed — otherwise it
	// writes into the shared by-id DOM now owned by a different tx (status flapping).
	if (!txStateLive(txState)) { teardownTxState(txState); return }

	console.log('[WS] update received', update)

	const prevStatus = localStorage.getItem(`tx_status:${network};${txid};${pch}`)

	txState.data = {
		...txState.data,
		...update,
		_trigger: update.sigs ? 'ws-sig' : 'ws'   // diagnostic: what drove this eval
	}

	if (update.type === 'tx_receipt' && update.receipt) {
		txState.data.receipt = update.receipt
		txState.data.receiptStatus = update.receipt.status?._code || update.receipt.status
		if (txState.data.receiptStatus === 'SUCCESS') txState.data.comboStatus = 'SUCCESS'
	}

	const currentStatus = txState.data.comboStatus

	view.statusBlock.update(txState.data)
	pushStatus(txState)

	if (update.precheck || update.type === 'tx_precheck')
		renderPrecheckInfo({ precheck: txState.data.precheck })

	// fire success only AFTER the status write + hidden signing section have repainted (above) —
	// they shift the modal up, and the flow animation must measure chip positions in their final
	// place. triggerSuccessAnimation defers the flow a couple of frames; confetti runs freely.
	if (!txState.successAnimationFired && currentStatus === 'SUCCESS' && prevStatus !== 'SUCCESS') {
		txState.successAnimationFired = true
		triggerSuccessAnimation()
	}

	if (update.sigs) await handleSignatureUpdate(txState, update)
}


async function handleSignatureUpdate(txState, update) {
	const { network, txid } = txState
	const sigCount = update.sigsNew?.length ?? 1

	notify(txState, `✍️ ${sigCount} new signature${sigCount == 1 ? '' : 's'} received`, 'success')

	const fresh = await txRead({ network, txid })

	txState.data = {
		...txState.data,
		...fresh.data,
		_trigger: 'ws-sig'
	}

	await refreshSigningSection(txState, {
		data: txState.data,
		accounts: txState.accounts
	})
}


function startTxPolling(txState, tx) {
	if (tx.data?.mirrorStatus) return

	const parsed = parseTxId(txState.txid)
	const scheduledSec = parsed?.seconds || 0
	const stopPollingAfterSec = scheduledSec + (5 * 60)

	const pollTimer = setInterval(async function pollTimerTick() {
		await pollTxStatus(txState, pollTimer, scheduledSec, stopPollingAfterSec)
	}, 5000)
	txState.pollTimer = pollTimer
}


async function pollTxStatus(txState, pollTimer, scheduledSec, stopPollingAfterSec) {
	// stop polling once the modal is gone (or this tx was superseded) — leaving it
	// running writes into a different tx's DOM and looks like status flapping.
	if (!txStateLive(txState)) { teardownTxState(txState); clearInterval(pollTimer); return }

	const nowSec = Math.floor(Date.now() / 1000)

	if (nowSec < scheduledSec) return

	if (nowSec > stopPollingAfterSec) {
		clearInterval(pollTimer)
		return
	}

	try {
		await refreshPolledTx(txState, pollTimer)
	} catch (err) {
		console.warn('Polling failed', err)
	}
}


async function refreshPolledTx(txState, pollTimer) {
	const { network, txid, view } = txState
	const fresh = await txRead({ network, txid })

	txState.data = {
		...fresh.data,
		comboStatus: txState.data.comboStatus === 'SUCCESS' ? 'SUCCESS' : fresh.data.comboStatus,
		_trigger: 'poll'
	}

	const successKey = `tx_status:${network};${txid};no_pch`
	if (localStorage.getItem(successKey) === 'SUCCESS') txState.data.comboStatus = 'SUCCESS'

	view.statusBlock.update(txState.data)

	// Reuse the already-enriched accounts (keeps keyInfo) instead of fresh.accounts,
	// whose keyInfo would be re-fetched from scratch each tick — a transient miss
	// dropped a required signer and flapped it to "witness". Merge in any genuinely
	// new account from the fresh read without clobbering existing enrichment.
	if (txState.accounts) {
		for (const [id, acc] of Object.entries(fresh.accounts || {}))
			if (!txState.accounts[id]) txState.accounts[id] = acc
	} else {
		txState.accounts = fresh.accounts
	}

	await refreshSigningSection(txState, {
		data: txState.data,   // use merged data so precheck/sigs match what pushStatus sees
		accounts: txState.accounts
	})

	if (fresh.data?.mirrorStatus) clearInterval(pollTimer)
}


const CONFETTI_CDN = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'

async function triggerSuccessAnimation() {
	// Defer the movement animation two frames so the SUCCESS status + hidden signing section have
	// laid out (they move the cards up) before we measure chip positions — otherwise the
	// trajectories land in the wrong place. It sticks at the settled state (sources ghosted).
	// Confetti runs independently and doesn't wait on it. (TX-CARDS5)
	requestAnimationFrame(() => requestAnimationFrame(() => {
		playSuccessFlow().catch(e => console.warn('success flow failed', e))
	}))
	const confetti = await loadScript(CONFETTI_CDN, 'confetti')
	if (!confetti?.create) return

	const canvas = document.createElement('canvas')
	canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2147483647;pointer-events:none'
	document.body.appendChild(canvas)

	const fire = confetti.create(canvas, { resize: true, useWorker: true })
	fire({ particleCount: 120, spread: 70,  origin: { y: 0.6 } })
	setTimeout(() => fire({ particleCount: 80, spread: 100, origin: { y: 0.4 } }), 250)
	setTimeout(() => { fire.reset(); canvas.remove() }, 4250)
}


async function refreshSigningSection(txState, { data, accounts }) {
	const { network } = txState

	// concurrent — independent calls, the slow one (kpos keyInfo) no longer stacks
	// on top of the mirror call before render (WC-SLOW1 / FRONT-ENRICH1)
	await Promise.all([
		enrichAccountsInfo({ network, accounts }),
		enrichAccountsKeyInfo({ network, accounts }),
	])

	renderSigningSection(txState, { data, accounts })
}

// Monotonic per-session signature set (SIGN-OSCILLATE1): once a signature is seen
// (keyed by normalized pubkey) it is never dropped, so a transient txRead that returns
// a smaller set can't shrink signedPubkeys and flap the threshold/pie between the poll /
// ws-sig / optimistic-sign paths. Last-wins on the object (freshest), monotonic on keys
// (dedupes multiple signs). Lives on txState so it resets naturally per tx session.
function reconcileSigs(txState, sigs) {
	const seen = txState.seenSigs || (txState.seenSigs = new Map())
	for (const s of sigs || []) { const k = normalizePublicKey(s?.pubKey); if (k) seen.set(k, s) }
	return [...seen.values()]
}

// The render half of refreshSigningSection — recomputes readiness and repaints
// from data already in hand, NO network (no enrich, no txRead). Used for the
// instant post-sign update (accounts are already enriched from load).
function renderSigningSection(txState, { data, accounts }) {
	const { network } = txState

	data.sigs = reconcileSigs(txState, data.sigs)   // never let a transient read shrink the set (SIGN-OSCILLATE1)

	calcAccountsThatSign(accounts)

	const readiness = evaluateTxReadiness({ accounts, data })
	txState.readiness = readiness

	renderReadinessInfo({ readiness })
	renderSigningInfo({ data, network, accounts })
	renderPrecheckInfo({ precheck: data?.precheck })

	pushStatus(txState)
}