

import { txRead, enrichAccountsInfo, enrichAccountsKeyInfo, calcAccountsThatSign  } from './model.js'

import {
	injectTxReadCSS,
	buildTxReadColumns,
	renderSigningInfo
} from './view.js'

import {
	get,
	parseTxId,
	formatUtcTime,
	formatCountdown
} from './utils.js'

import { getHederaMirrorData } from './hedera-mirror.js'


	console.log('injecting kpool widget')

	const params = new URLSearchParams(window.location.search)
	const network = params.get('network')
	const txid = params.get('txid')

	const main = async () => {
		if (!network) {
			renderError('FR67657 Missing network')
			return
		}

		if (txid) {
			await renderSingleTx(network, txid)
		} else {
			renderError('UH7688 Transaction list not yet implemented')
		}
	}


	main()


async function renderSingleTx(network, txid) {

	const container = document.createElement('div')

	const details = document.createElement('details')

	const summary = document.createElement('summary')
	summary.innerHTML = "✍️ Sign offline with <a href='https://ksig.uk/pwa' target='KPAYPWA'>KSIG</a>"
	summary.style.marginTop = '16px'
	summary.style.display = 'block'

	const p = document.createElement('p')
	p.textContent = 'QR scan the transaction, sign, then return the signed transaction'

	const iframe = document.createElement('iframe')
	iframe.id = 'iframeKSIG'
	iframe.style.width = '100%'
	iframe.style.height = '300px'
	iframe.setAttribute('scrolling', 'no')
	iframe.style.overflow = 'hidden'
	iframe.setAttribute('allow', 'camera')
	iframe.src = `https://kpos.uk/sign/offline/widget?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`

	details.appendChild(summary)
	details.appendChild(p)
	details.appendChild(iframe)

	const kpool_widget = document.querySelector('#kpool_widget')
	if (kpool_widget) kpool_widget.append(container)

	let view = null

	const renderTxView  = async ({ network, txid, details }) => {
		const { url, rawTx, data, transfers, accounts } = await txRead({ network, txid })

		injectTxReadCSS()

		container.classList.add('txread')

		view = buildTxReadColumns({
			rawTx,
			data,
			transfers,
			network,
			txid
		})

		container.appendChild(view.el)
		container.appendChild(details)

		return { url, rawTx, data, transfers, accounts }
	}

	try {

		const tx = await renderTxView({ network, txid, details })

		await enrichAccountsInfo({ network, accounts: tx.accounts })
		await enrichAccountsKeyInfo({ network, accounts: tx.accounts })

		calcAccountsThatSign(tx.accounts)

		renderSigningInfo({
			rawTx: tx.rawTx,
			network,
			accounts: tx.accounts
		})

		document.getElementById('txread-signing')?.classList.remove('tx-loading')

		// --------------------
		// POLLING
		// --------------------

		const parsed = parseTxId(txid)
		const scheduledSec = parsed?.seconds || 0
		const stopPollingAfterSec = scheduledSec + (5 * 60)

		let pollTimer = null

		if (!tx.data?.mirrorStatus) {

			pollTimer = setInterval(async () => {

				const nowSec = Math.floor(Date.now() / 1000)

				// don't poll before scheduled time
				if (nowSec < scheduledSec) return

				// stop after 5 min window
				if (nowSec > stopPollingAfterSec) {
					clearInterval(pollTimer)
					return
				}

				try {

					const fresh = await txRead({ network, txid })

					view.statusBlock.update(fresh.data)

					if (fresh.data?.mirrorStatus) {
						clearInterval(pollTimer)
					}

				} catch (err) {
					console.warn('Polling failed', err)
				}

			}, 5000)
		}

	} catch (e) {
		console.warn('txRead fetch failed', e)
	}
}