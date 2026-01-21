

import { txRead } from './model.js'

import {
	injectTxReadCSS,
	buildTxReadColumns
} from './view.js'

import {
	get,
	parseTxIdTime,
	formatUtcTime,
	formatCountdown
} from './utils.js'



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
  if (kpool_widget) kpool_widget.append(details)
		


	const renderTxReadDebug = async ({ network, txid, details }) => {

		const { url, json, transfers } = await txRead({ network, txid })

		// link to raw API
		const link = document.createElement('a')
		link.href = url
		link.target = '_blank'
		link.rel = 'noopener'
		link.textContent = 'View txRead API response'
		link.style.display = 'block'

		// raw JSON dump
		const pre = document.createElement('pre')
		const code = document.createElement('code')
		code.textContent = JSON.stringify(json, null, 2)
		pre.appendChild(code)


		injectTxReadCSS()

		details.classList.add('txread')
		const columns = buildTxReadColumns({
			json,
			transfers,
			network,
			txid
		})

    details.appendChild(columns)

	  details.appendChild(link)
		details.appendChild(pre)

	}



	// usage (inside DOMContentLoaded is perfect)
	;(async () => {
		try {
			await renderTxReadDebug({ network, txid, details })
		} catch (e) {
			console.warn('txRead fetch failed', e)
		}
	})()

}	
