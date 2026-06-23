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
	await mount(modal.body, { network, txid, pch, signer, ...opts, onStatus: s => modal.setStatus(s.label, s.tone) })
	return modal
}

window.KPOOL = { mount, open }

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

async function renderSingleTx(hostEl, network, txid, pch = 'no_pch', opts = {}) {
	const txState = createTxState(network, txid, pch)
	txState.onStatus = opts.onStatus

	hostEl.append(txState.container)

	try {
		const tx = await renderTxView(txState)

		await loadSigningState(txState, tx)

		if (opts.signer === 'walletconnect') await renderSigner(txState, opts)

		startTxSocket(txState)
		startTxPolling(txState, tx)
	} catch (e) {
		console.warn('txRead fetch failed', e)
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
		onSigned: () => showBanner('✍️ Signature submitted', 'success')
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
		.kpsign-tab.active{ color:#084298; }
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
		.kpsign-frame{ width:100%; height:420px; border:0; border-radius:8px; background:#fafafa; }
		.kpsign-pane .kpsign{ margin:6px 0 0; }
		@media (max-width:600px){ .kpsign-frame{ height:360px; } }
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
	// REFINEMENT (later): the target page (kpay.uk/message) could accept options
	// to render in a more iframe-friendly / embedded mode. For now we iframe it
	// as-is and offer the "open in new tab" link as the fallback.
	pane.appendChild(lazyFrame(url))
	return pane
}

function buildKsigPane(network, txid) {
	const pane = document.createElement('div')
	const url = ksigWidgetUrl(network, txid)
	pane.appendChild(makeDesc(
		`Sign offline on another device. Scan this QR with the KSIG app. ` +
		`Don't have it? <a href="https://ksig.uk/pwa" target="KPAYPWA">Get KSIG</a>. ` +
		`To return the signature, use the full tool (open in new tab).`,
		url
	))

	const mount = document.createElement('div')
	mount.className = 'kpsign-ksig'
	pane.appendChild(mount)

	// rendered in-house (local QR) on first activation, not via an iframe
	pane._lazyInit = async () => {
		const { renderKsig } = await import(`./ksig.js?v=${V}`)
		renderKsig(mount, { network, txid })
	}

	return pane
}

// brand icons live alongside the widget (./assets), so resolve them relative to
// this module's URL — a page-relative './assets' would resolve against the host
// page (e.g. /future/) instead of /vendor/kpay/kpool_widget/.
const assetUrl = name => new URL(`./assets/${name}`, import.meta.url).href

function buildSigningPanel(txState) {
	const { network, txid, pch } = txState

	const panel = document.createElement('div')
	panel.id = 'txread-methods'
	panel.className = 'kpsign-panel'

	const tabs = document.createElement('div')
	tabs.className = 'kpsign-tabs'

	const hint = document.createElement('div')
	hint.className = 'kpsign-hint'
	hint.textContent = 'Choose a signing method'

	const panes = document.createElement('div')
	panes.className = 'kpsign-panes'

	const METHODS = [
		{ id: 'walletconnect', label: 'WalletConnect',   icon: 'WalletConnect-Logo.png',           build: () => buildWcPane(txState) },
		{ id: 'whatsapp',      label: 'WhatsApp',        icon: 'WhatsApp.svg.png',                 build: () => buildWhatsAppPane(network, txid, pch) },
		{ id: 'ksig',          label: 'Offline (KSIG)',  icon: 'kpay_logo_square_transparent.png', build: () => buildKsigPane(network, txid) }
	]

	const paneEls = {}

	METHODS.forEach(m => {
		const tab = document.createElement('button')
		tab.type = 'button'
		tab.className = 'kpsign-tab'
		tab.dataset.method = m.id

		const icon = document.createElement('img')
		icon.className = 'kpsign-tabicon'
		icon.src = assetUrl(m.icon)
		icon.alt = ''

		const lbl = document.createElement('span')
		lbl.textContent = m.label

		tab.append(icon, lbl)
		tab.addEventListener('click', () => select(m.id))
		tabs.appendChild(tab)

		const pane = m.build()
		pane.classList.add('kpsign-pane')
		pane.dataset.method = m.id
		paneEls[m.id] = pane
		panes.appendChild(pane)
	})

	// sliding underline that smoothly tracks the active tab
	const underline = document.createElement('div')
	underline.className = 'kpsign-underline'
	tabs.appendChild(underline)

	function select(id) {
		hint.style.display = 'none'
		tabs.querySelectorAll('.kpsign-tab').forEach(t =>
			t.classList.toggle('active', t.dataset.method === id))
		Object.entries(paneEls).forEach(([k, el]) => {
			const on = k === id
			el.classList.toggle('active', on)
			if (on) activatePane(el)
		})
		const activeTab = tabs.querySelector('.kpsign-tab.active')
		if (activeTab) {
			underline.style.width = activeTab.offsetWidth + 'px'
			underline.style.transform = `translateX(${activeTab.offsetLeft}px)`
		}
	}

	panel.append(tabs, hint, panes)
	txState.selectSignMethod = select
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

	injectTxReadCSS()

	container.classList.add('txread')

	txState.view = buildTxReadColumns({
		rawTx,
		data,
		transfers,
		network,
		txid
	})

  // container.appendChild(txState.view.el)
  // container.appendChild(kpayLink)
  // container.appendChild(details)

  container.appendChild(txState.view.el)

  // signing panel: a clean method picker (WhatsApp · Wallet · KSIG). Choosing a
  // method reveals its short description + controls/QR/iframe in the pane below.
  // Sits in the dedicated #txread-sign-slot, between Intent and Status.
  injectMethodsCSS()
  const panel = buildSigningPanel(txState)
  const signSlot = txState.view.el.querySelector('#txread-sign-slot')
  if (signSlot) signSlot.append(panel)
  else container.append(panel)
  
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

	// label the approvals disclosure with the count of signing authorities
	const signerCount = Object.values(tx.accounts || {}).filter(a => a.mustSign).length
	const lbl = txState.view?.approvalsToggle?.querySelector('.lbl')
	if (lbl) lbl.textContent = `Required approvals${signerCount ? ` (${signerCount})` : ''}`

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
	console.log('[CONFETTI typeof]', typeof window.confetti)

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

	showBanner(`✍️ ${sigCount} new signature${sigCount == 1 ? '' : 's'}`, 'success')

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


function triggerSuccessAnimation() {
	console.log('window.confetti', typeof window.confetti)

	if (!window.confetti) return

	confetti({
		particleCount: 120,
		spread: 70,
		origin: { y: 0.6 }
	})

	setTimeout(function fireSecondConfettiBurst() {
		confetti({
			particleCount: 80,
			spread: 100,
			origin: { y: 0.4 }
		})
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