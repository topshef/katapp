

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
		

	const buildFieldTable = (json, fields) => {
		const table = document.createElement('table')
		table.style.borderCollapse = 'collapse'

		fields.forEach(f => {
			const tr = document.createElement('tr')

			const tdPath = document.createElement('td')
			tdPath.textContent = f.path
			tdPath.style.verticalAlign = 'top'
			tdPath.style.fontFamily = 'monospace'
			tdPath.style.padding = '4px 8px'

			const tdValue = document.createElement('td')
			const value = get(json, f.path)
			tdValue.style.padding = '4px 8px'
			tdValue.textContent =
				typeof value === 'object'
					? JSON.stringify(value, null, 2)
					: value ?? ''

			const tdNote = document.createElement('td')
			tdNote.style.padding = '4px 8px'
			tdNote.textContent = f.note || ''

			tr.appendChild(tdPath)
			tr.appendChild(tdValue)
			tr.appendChild(tdNote)

			table.appendChild(tr)
		})

		return table
	}

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


		// fields we want to inventory
		const fields = [
			// Core
			{ path: 'result.network', note: 'network' },
			{ path: 'result.txid', note: 'transaction id' },

			// Deal display
			{ path: 'result.deal.display.title', note: 'card title' },
			{ path: 'result.deal.display.thumbnail', note: 'thumbnail image (fallback later)' },

			// Transfers
			{ path: 'result.deal.addHbarTransfer', note: 'hbar transfers (array)' },
			{ path: 'result.deal.addTokenTransfer', note: 'token transfers (array)' },
			{ path: 'result.deal.addNftTransfer', note: 'nft transfers (array)' },

			// Signatures
			{ path: 'result.sigs', note: 'raw signatures; derive accounts later' },

			// Raw tx
			{ path: 'result.bodyBytesHex', note: 'decode via mirror node later' }
		]

		const table = buildFieldTable(json, fields)
		
		injectTxReadCSS()

		details.classList.add('txread')
		const columns = buildTxReadColumns({
			json,
			transfers,
			network,
			txid
		})

    details.appendChild(columns)

		details.appendChild(table)
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
