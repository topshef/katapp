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
	showBanner
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

const params = new URLSearchParams(window.location.search)
const network = params.get('network')
const txid = params.get('txid')
const pch = params.get('pch') || 'no_pch'

main()

async function main() {
	if (!network) {
		renderError('FR67657 Missing network')
		return
	}

	if (txid) {
		await renderSingleTx(network, txid, pch)
		return
	}

	renderError('UH7688 Transaction list not yet implemented')
}


async function renderSingleTx(network, txid, pch = 'no_pch') {
	const txState = createTxState(network, txid, pch)

	const kpool_widget = document.querySelector('#kpool_widget')
	if (kpool_widget) kpool_widget.append(txState.container)

	try {
		const tx = await renderTxView(txState)

		await loadSigningState(txState, tx)

		startTxSocket(txState)
		startTxPolling(txState, tx)
	} catch (e) {
		console.warn('txRead fetch failed', e)
	}
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

  const signingSection = txState.view.el.querySelector('#txread-signing')
  if (signingSection) signingSection.before(kpayLink, details)
  if (!signingSection) container.append(kpayLink, details)
  
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

	document.getElementById('txread-signing')?.classList.remove('tx-loading')
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

	await refreshSigningSection({
		network,
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

	await refreshSigningSection({
		network,
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


async function refreshSigningSection({ network, data, accounts }) {
	await enrichAccountsInfo({ network, accounts })
	await enrichAccountsKeyInfo({ network, accounts })

	calcAccountsThatSign(accounts)

	const readiness = evaluateTxReadiness({ accounts, data })

	renderReadinessInfo({ readiness })
	renderSigningInfo({ data, network, accounts })
	renderPrecheckInfo({ precheck: data?.precheck })
}