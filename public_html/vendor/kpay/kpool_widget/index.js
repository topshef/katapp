
import { CONFIG } from './config.js'
import { txRead, enrichAccountsInfo, enrichAccountsKeyInfo, enrichTransfersInfo, calcAccountsThatSign, evaluateTxReadiness  } from './model.js'

import {
	injectTxReadCSS,
	buildTxReadColumns,
	renderSigningInfo,
  renderReadinessInfo
} from './view.js'

import {
	get,
	parseTxId,
	formatUtcTime,
	formatCountdown
} from './utils.js'

import { getHederaMirrorData } from './hedera-mirror.js'

import { createTxSocket } from './websocket.js'

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


async function renderSingleTx(network, txid, pch = 'no_pch') {

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
    await enrichTransfersInfo({ network, transfers })
    
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

		const tx = await renderTxView({ network, txid, pch, details })  //todo pch

		await enrichAccountsInfo({ network, accounts: tx.accounts })
		await enrichAccountsKeyInfo({ network, accounts: tx.accounts })

		calcAccountsThatSign(tx.accounts)
    
    tx.readiness = evaluateTxReadiness({accounts:tx.accounts, data:tx.data})
    renderReadinessInfo({readiness: tx.readiness})

    renderSigningInfo({
      data:tx.data,
      network,
      accounts:tx.accounts
    })


		let currentData = tx.data
		let currentAccounts = tx.accounts
		let successAnimationFired = false
		
		const socket = createTxSocket({
      baseUrl: CONFIG.HAPI_BASE || 'hapi2.hbar.live/live',
      // baseUrl: CONFIG.BASE_URL || 'https://hapi2.hbar.live/live',
			txid,
			onTxUpdate: async update => {

				console.log('[WS] update received', update)
				console.log('[CONFETTI typeof]', typeof window.confetti)
				
				const prevStatus = localStorage.getItem(`tx_status:${network};${txid};${pch}`)

				// merge update into current data
				currentData = {
					...currentData,
					...update
				}

				// ----- RECEIPT PATCH -----
				if (update.type === 'tx_receipt' && update.receipt) {
					currentData.receipt = update.receipt
					currentData.receiptStatus = update.receipt.status?._code || update.receipt.status
					if (currentData.receiptStatus === 'SUCCESS') currentData.comboStatus = 'SUCCESS'
				}

				const currentStatus = currentData.comboStatus
				// console.log
				if (!successAnimationFired && currentStatus === 'SUCCESS' && prevStatus !== 'SUCCESS') {
					triggerSuccessAnimation()
					successAnimationFired = true
				}


				// update status block
				view.statusBlock.update(currentData)

				// if signature update, refresh signing
				if (update.sigs) {
					await refreshSigningSection({
						network,
						data: currentData,
						accounts: currentAccounts
					})
				}
			}
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


					// currentData = {
						// ...currentData,
						// ...fresh.data
					// }
					currentData = {
						...fresh.data,
						// preserve terminal SUCCESS
						comboStatus:
							currentData.comboStatus === 'SUCCESS'
								? 'SUCCESS'
								: fresh.data.comboStatus
					}

					//fudge sink status until we sort the shot out of comboStatus webhook vs poll
					const successKey = `tx_status:${network};${txid};no_pch`
					if (localStorage.getItem(successKey) === 'SUCCESS') currentData.comboStatus = 'SUCCESS'
			
					view.statusBlock.update(currentData)
					
					// view.statusBlock.update(fresh.data)

					// ----- refresh signing block -----
					await refreshSigningSection({
						network,
						data: fresh.data,
						accounts: fresh.accounts
					})
					// ----------------------------------

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


function triggerSuccessAnimation() {
	console.log("window.confetti",typeof window.confetti)
  if (!window.confetti) return

  confetti({
    particleCount: 120,
    spread: 70,
    origin: { y: 0.6 }
  })

  // optional second burst
  setTimeout(() => {
    confetti({
      particleCount: 80,
      spread: 100,
      origin: { y: 0.4 }
    })
  }, 250)
}



const refreshSigningSection = async ({ network, data, accounts }) => {

	await enrichAccountsInfo({ network, accounts })
	await enrichAccountsKeyInfo({ network, accounts })
	calcAccountsThatSign(accounts)

	renderSigningInfo({
		data,
		network,
		accounts
	})
}

