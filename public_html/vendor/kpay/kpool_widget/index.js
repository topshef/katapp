const V = window.__BUILD_HASH__

const { CONFIG } = await import(`./config.js?v=${V}`)

const {
	txRead,
	enrichAccountsInfo,
	enrichAccountsKeyInfo,
	enrichTransfersInfo,
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
	summariseStatus
} = await import(`./view.js?v=${V}`)

const {
	get,
	parseTxId,
	formatUtcTime,
	formatCountdown
} = await import(`./utils.js?v=${V}`)

const { getHederaMirrorData } = await import(`./hedera-mirror.js?v=${V}`)
const { createTxSocket } = await import(`./websocket.js?v=${V}`)

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
		onFlash:       (msg, tone) => modal.flash(msg, tone),
		onLockModal:   () => modal.lock(),
		onUnlockModal: () => modal.unlock()
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
	if (!txState.onStatus) return
	txState.onStatus(summariseStatus({ data: txState.data, readiness: txState.readiness }))
}

// Live cue helper. In the modal we flash a transient pill in the header; for a
// bare (non-modal) mount there's no header, so fall back to the inline banner.
function notify(txState, msg, tone = 'success') {
	if (txState.onFlash) txState.onFlash(msg, tone)
	else showBanner(msg, tone)
}

async function renderSingleTx(hostEl, network, txid, pch = 'no_pch', opts = {}) {
	const txState = createTxState(network, txid, pch)
	txState.onStatus = opts.onStatus
	txState.onFlash  = opts.onFlash
	txState.readUrl  = opts.readUrl   // absolute endpoint when embedded off-origin
	txState.saveUrl  = opts.saveUrl

	hostEl.append(txState.container)
	txState.container.innerHTML = '<div class="kpsign-msg" style="padding:28px;text-align:center">Loading transaction…</div>'

	try {
		const tx = await renderTxView(txState)

		await loadSigningState(txState, tx)

		if (opts.signer === 'walletconnect') await renderSigner(txState, opts)

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
		onSigned:  () => notify(txState, '✍️ Signature submitted', 'success'),
		onAccount: acct => updateNarrative(txState, acct),
		onLock:    opts.onLockModal,
		onUnlock:  opts.onUnlockModal
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
		#txread-methods .kpsign-tab:hover,
		#txread-methods .kpsign-tab:focus,
		#txread-methods .kpsign-tab:active,
		#txread-methods .kpsign-tab.active{ background:transparent; box-shadow:none; }
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
		@media (max-width:600px){ .kpsign-frame{ height:80vh; } }
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
	return `https://kpos.uk/sign/offline/widget?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`
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
	const pane = document.createElement('div')
	const url = whatsAppUrl(network, txid, pch)
	pane.appendChild(makeDesc('Sign from your phone via KPAY on WhatsApp.', url))
	// iframe carries embed=1 so the target page can later detect it's framed and
	// render an embedded layout, without changing this widget. The "open in new
	// tab" link above stays plain (full page).
	pane.appendChild(lazyFrame(url + '&embed=1'))
	return pane
}

function buildKsigPane(txState) {
	const { network, txid, pch, readUrl } = txState
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
			onSigned: () => notify(txState, '✍️ Signature submitted', 'success')
		})
	}

	return pane
}

// brand icons live alongside the widget (./assets), so resolve them relative to
// this module's URL — a page-relative './assets' would resolve against the host
// page (e.g. /future/) instead of /vendor/kpay/kpool_widget/.
const assetUrl = name => new URL(`./assets/${name}`, import.meta.url).href

// info (i-in-circle) icon for the Status tab
const INFO_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none"/></svg>`

// Status tab pane: status detail + a one-line explainer + the approvals table.
// The status/approval elements were created in view.js (buildTxReadColumns) and
// are placed here so the render-by-id functions keep targeting them.
function buildStatusPane(txState) {
	const pane = document.createElement('div')

	const inner = document.createElement('div')
	inner.id = 'txread-status'
	inner.className = 'txread-status tx-loading'

	inner.appendChild(txState.view.statusBlock.el)
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

// Experimental "You send / You receive" narrative, derived from the connected
// wallet account and the transfer line items. Hidden when no account is known.
function updateNarrative(txState, account) {
	const box = txState.container.querySelector('#txread-narrative')
	if (!box) return

	const items = txState.transfers?.lineItems || []
	if (!account || !items.length) { box.hidden = true; box.innerHTML = ''; box.removeAttribute('data-acct'); return }

	const fmt = li => {
		const meta = li.assetMeta || {}
		const sym = meta.symbol || meta.name || meta.raw || ''
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

	// Status is first and shown by default; the rest are signing actions.
	const METHODS = [
		{ id: 'status',        label: 'Status',          svg:  INFO_SVG,                            build: () => buildStatusPane(txState) },
		{ id: 'walletconnect', label: 'WalletConnect',   icon: 'WalletConnect-Logo.png',           build: () => buildWcPane(txState) },
		{ id: 'whatsapp',      label: 'WhatsApp',        icon: 'WhatsApp.svg.png',                 build: () => buildWhatsAppPane(network, txid, pch) },
		{ id: 'ksig',          label: 'Offline',         icon: 'kpay_logo_square_transparent.png', build: () => buildKsigPane(txState) }
	]

	const DEFAULT = 'status'
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
			}, { once: true })
		}
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
	const p = document.createElement('p')
	const a = document.createElement('a')
	const url = new URL('https://kpay.uk/message/')

	url.searchParams.set('network', network)
	url.searchParams.set('channel', 'WhatsApp')
	url.searchParams.set('message', `sign ${txid} #${pch}`)

	a.href = url.toString()
	a.target = 'KPAYWHATSAPP'
	a.textContent = 'Sign with WhatsApp'

	p.appendChild(a)
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
	iframe.src = `https://kpos.uk/sign/offline/widget?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`

	return iframe
}


async function renderTxView(txState) {
	const { network, txid, container } = txState
	const { url, rawTx, data, transfers, accounts } = await txRead({ network, txid })

	await enrichTransfersInfo({ network, transfers })
	txState.transfers = transfers

	injectTxReadCSS()

	container.classList.add('txread')

	txState.view = buildTxReadColumns({
		rawTx,
		data,
		transfers,
		network,
		txid,
		pch: txState.pch
	})

  // container.appendChild(txState.view.el)
  // container.appendChild(kpayLink)
  // container.appendChild(details)

  container.textContent = ''
  container.appendChild(txState.view.el)

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

	await enrichAccountsInfo({ network, accounts: tx.accounts })
	await enrichAccountsKeyInfo({ network, accounts: tx.accounts })

	calcAccountsThatSign(tx.accounts)

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
}


function startTxSocket(txState) {
	createTxSocket({
		baseUrl: CONFIG.HAPI_BASE || 'hapi2.hbar.live/live',
		txid: txState.txid,
		onTxUpdate: async function onTxUpdate(update) {
			await handleTxUpdate(txState, update)
		}
	})
}


async function handleTxUpdate(txState, update) {
	const { network, txid, pch, view } = txState

	console.log('[WS] update received', update)

	const prevStatus = localStorage.getItem(`tx_status:${network};${txid};${pch}`)

	txState.data = {
		...txState.data,
		...update
	}

	if (update.type === 'tx_receipt' && update.receipt) {
		txState.data.receipt = update.receipt
		txState.data.receiptStatus = update.receipt.status?._code || update.receipt.status
		if (txState.data.receiptStatus === 'SUCCESS') txState.data.comboStatus = 'SUCCESS'
	}

	const currentStatus = txState.data.comboStatus

	if (!txState.successAnimationFired && currentStatus === 'SUCCESS' && prevStatus !== 'SUCCESS') {
		triggerSuccessAnimation()
		txState.successAnimationFired = true
	}

	view.statusBlock.update(txState.data)
	pushStatus(txState)

	if (update.precheck || update.type === 'tx_precheck')
		renderPrecheckInfo({ precheck: txState.data.precheck })

	if (update.sigs) await handleSignatureUpdate(txState, update)
}


async function handleSignatureUpdate(txState, update) {
	const { network, txid } = txState
	const sigCount = update.sigsNew?.length ?? 1

	notify(txState, `✍️ ${sigCount} new signature${sigCount == 1 ? '' : 's'} received`, 'success')

	const fresh = await txRead({ network, txid })

	txState.data = {
		...txState.data,
		...fresh.data
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
}


async function pollTxStatus(txState, pollTimer, scheduledSec, stopPollingAfterSec) {
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
		comboStatus: txState.data.comboStatus === 'SUCCESS' ? 'SUCCESS' : fresh.data.comboStatus
	}

	const successKey = `tx_status:${network};${txid};no_pch`
	if (localStorage.getItem(successKey) === 'SUCCESS') txState.data.comboStatus = 'SUCCESS'

	view.statusBlock.update(txState.data)

	await refreshSigningSection(txState, {
		data: fresh.data,
		accounts: fresh.accounts
	})

	if (fresh.data?.mirrorStatus) clearInterval(pollTimer)
}


let _confettiLoad = null
function loadConfetti() {
	if (window.confetti) return Promise.resolve(window.confetti)
	if (_confettiLoad)   return _confettiLoad
	_confettiLoad = new Promise(resolve => {
		const s = document.createElement('script')
		s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'
		s.onload  = () => resolve(window.confetti || null)
		s.onerror = () => resolve(null)
		document.head.appendChild(s)
	})
	return _confettiLoad
}

async function triggerSuccessAnimation() {
	const confetti = await loadConfetti()
	if (!confetti?.create) return

	const canvas = document.createElement('canvas')
	canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2147483647;pointer-events:none'
	document.body.appendChild(canvas)

	const fire = confetti.create(canvas, { resize: true, useWorker: true })
	fire({ particleCount: 120, spread: 70,  origin: { y: 0.6 } })
	setTimeout(() => {
		fire({ particleCount: 80, spread: 100, origin: { y: 0.4 } })
		setTimeout(() => canvas.remove(), 4000)
	}, 250)
}


async function refreshSigningSection(txState, { data, accounts }) {
	const { network } = txState

	await enrichAccountsInfo({ network, accounts })
	await enrichAccountsKeyInfo({ network, accounts })

	calcAccountsThatSign(accounts)

	const readiness = evaluateTxReadiness({ accounts, data })
	txState.readiness = readiness

	renderReadinessInfo({ readiness })
	renderSigningInfo({ data, network, accounts })
	renderPrecheckInfo({ precheck: data?.precheck })

	pushStatus(txState)
}