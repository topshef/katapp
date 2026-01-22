

import { txRead, enrichAccountsInfo, calcAccountsThatSign  } from './model.js'

import {
	injectTxReadCSS,
	buildTxReadColumns,
	renderAccountsInfo
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

// const renderSingleTx = async (network, txid) => {   // does not hoist. enables this.shitshow
async function renderSingleTx(network, txid) {         // does hoist. old-skool explicit


	// main container
	const container = document.createElement('div')

	// inject KSIG QR widget
	const details = document.createElement('details')


  const summary = document.createElement('summary')
  summary.innerHTML = "Sign with <a href='https://ksig.uk/pwa' target='KPAYPWA'>KSIG</a>"

  const p = document.createElement('p')
  p.textContent = 'QR scan the transaction, sign, then return the signed transaction'

  const iframe = document.createElement('iframe')
  iframe.id = 'iframeKSIG'
  iframe.setAttribute('allow', 'camera')
	
	//kpos and kpay are the same atm, but the widget is hosted on kpos
  // iframe.src = `https://kpay.uk/sign/offline/widget?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`
  iframe.src = `https://kpos.uk/sign/offline/widget?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`

  details.appendChild(summary)
  details.appendChild(p)
  details.appendChild(iframe)

  const kpool_widget = document.querySelector('#kpool_widget')
  if (kpool_widget) kpool_widget.append(container)
		


	const renderTxReadDebug = async ({ network, txid, details }) => {

		const { url, rawTx, transfers, accounts } = await txRead({ network, txid })


		// raw JSON dump (collapsible, with API link inside)
		const jsonDetails = document.createElement('details')
		jsonDetails.innerHTML = `
			<summary>View raw JSON</summary>
			<a href="${url}" target="_blank" rel="noopener" style="display:block;margin:4px 0">
				⚙️ View txRead API response
			</a>
			<pre><code>${JSON.stringify(rawTx, null, 2)}</code></pre>
		`

		injectTxReadCSS()

		container.classList.add('txread')
		const columns = buildTxReadColumns({
			rawTx,
			transfers,
			network,
			txid
		})

		container.appendChild(columns)
		container.appendChild(details)
		container.appendChild(jsonDetails)
		
		return { url, rawTx, transfers, accounts }
	}



	// usage (inside DOMContentLoaded is perfect)
	;(async () => {
		try {
			const tx = await renderTxReadDebug({ network, txid, details })
						
			await enrichAccountsInfo({
				network,
				accounts: tx.accounts
			})			
			calcAccountsThatSign(tx.accounts)
			console.log('accounts after enrichment (controller)', tx.accounts)

		  renderAccountsInfo(tx.accounts)

		} catch (e) {
			console.warn('txRead fetch failed', e)
		}
	})()

}	
