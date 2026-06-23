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
		.kp-methods{
			display:flex; flex-wrap:wrap; align-items:center; justify-content:center;
			gap:10px 22px; margin:16px auto; padding:10px 14px;
			max-width:min(900px,100%);
			border:1px solid #eee; border-radius:8px; background:#fafafa;
		}
		.kp-methods > *{ margin:0 !important; }
		.kp-methods > *:empty{ display:none; }
		.kp-methods .kpsign{ margin:0; }
		.kp-methods summary{ margin-top:0 !important; }
		.kp-methods > details{ flex:0 1 auto; }
		.kp-methods > details[open]{ flex:1 1 100%; }
		@media (max-width:600px){
			.kp-methods{ flex-direction:column; align-items:stretch; gap:10px; }
		}
	`
	document.head.appendChild(s)
}


function createTxState(network, txid, pch) {
	const container = document.createElement('div')
	const kpayLink = createKpayWhatsAppLink(network, txid, pch)
	const details = createSigningDetails(network, txid)

	return {
		network,
		txid,
		pch,
		container,
		kpayLink,
		details,
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
	const { network, txid, container, kpayLink, details } = txState
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

  // signing-method bar: WhatsApp · WalletConnect · KSIG (offline), side by side.
  // Goes in the dedicated #txread-sign-slot (between Intent and Status).
  // data-method tags leave a seam for a later "labs" show/hide toggle. KSIG is
  // left exactly as-is (its QR bug is out of scope) — just placed on the bar.
  injectMethodsCSS()

  const methods = document.createElement('div')
  methods.id = 'txread-methods'
  methods.className = 'kp-methods'

  kpayLink.classList.add('kp-method')
  kpayLink.dataset.method = 'whatsapp'

  const wcSlot = document.createElement('div')
  wcSlot.id = 'txread-signer'
  wcSlot.className = 'kp-method'
  wcSlot.dataset.method = 'walletconnect'

  details.classList.add('kp-method', 'kp-method-ksig')
  details.dataset.method = 'ksig'

  methods.append(kpayLink, wcSlot, details)

  const signSlot = txState.view.el.querySelector('#txread-sign-slot')
  if (signSlot) signSlot.append(methods)
  else container.append(methods)
  
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
	const toggle = txState.view?.approvalsToggle
	if (toggle) {
		const cap = toggle.querySelector('.cap')?.textContent || '▸'
		toggle.innerHTML = `<span class="cap">${cap}</span> Required approvals${signerCount ? ` (${signerCount})` : ''}`
	}

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