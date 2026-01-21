
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
		const url = `https://kpos.uk/pool/txRead?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}&detail=1`

		const res = await fetch(url)
		if (!res.ok) return

		const json = await res.json()

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
		const columns = buildTxReadColumns(json)
    details.appendChild(columns)

		details.appendChild(table)
	  details.appendChild(link)
		details.appendChild(pre)

	}


	const buildTxReadColumns = json => {
		const grid = document.createElement('div')
		grid.className = 'txread-grid'

		const col1 = document.createElement('div')
		col1.className = 'txread-col txread-thumb'

		const col2 = document.createElement('div')
		col2.className = 'txread-col'

		const transfers = buildTransferList(json)
		col2.appendChild(transfers)



		const col3 = document.createElement('div')
		col3.className = 'txread-col'
		const sigs = buildSignatureList(json)
		col3.appendChild(sigs)
		

		const col4 = document.createElement('div')
		col4.className = 'txread-col'
		const timing = buildTimingBlock(json, get(json, 'result.network') || network, get(json, 'result.txid') || txid)
		col4.appendChild(timing)

		// thumbnail (column 1)
		const thumbUrl = get(json, 'result.deal.display.thumbnail')
		if (thumbUrl) {
			const img = document.createElement('img')
			img.src = thumbUrl
			img.alt = 'deal thumbnail'
			col1.appendChild(img)
		}

		grid.appendChild(col1)
		grid.appendChild(col2)
		grid.appendChild(col3)
		grid.appendChild(col4)

		return grid
	}

	const buildTransferList = json => {
		const container = document.createElement('div')
		container.className = 'txread-xfers'

		// header row
		;['Account', 'Asset', 'Amount'].forEach(h => {
			const el = document.createElement('div')
			el.className = 'txread-xfer-head'
			el.textContent = h
			container.appendChild(el)
		})

		// helper to add one row
		const addRow = (account, asset, amount) => {
			const a = document.createElement('div')
			a.textContent = account

			const b = document.createElement('div')
			b.textContent = asset

			const c = document.createElement('div')
			c.textContent = amount

			container.appendChild(a)
			container.appendChild(b)
			container.appendChild(c)
		}

		// HBAR transfers
		;(get(json, 'result.deal.addHbarTransfer') || []).forEach(x => {
			addRow(
				x.accountId,
				'HBAR',
				x.value
			)
		})

		// Token (FT) transfers
		;(get(json, 'result.deal.addTokenTransfer') || []).forEach(x => {
			addRow(
				x.accountId,
				x.tokenId,
				x.value
			)
		})

		// NFT transfers (sender = -1, receiver = +1)
		;(get(json, 'result.deal.addNftTransfer') || []).forEach(x => {
			const asset = `${x.tokenId} #${x.serial}`

			addRow(
				x.sender,
				asset,
				-1
			)

			addRow(
				x.receiver,
				asset,
				+1
			)
		})

		return container
	}


	const buildSignatureList = json => {
		const container = document.createElement('div')
		container.className = 'txread-sigs'

		const title = document.createElement('div')
		title.className = 'txread-sigs-title'
		title.textContent = 'Signatures received'
		container.appendChild(title)

		const sigs = get(json, 'result.sigs') || []

		if (!sigs.length) {
			const empty = document.createElement('div')
			empty.textContent = '—'
			container.appendChild(empty)
			return container
		}

		sigs.forEach(s => {
			const pubKey = s.pubKey || ''
			const short = pubKey.slice(-4)

			const el = document.createElement('div')
			el.className = 'txread-sig'
			el.textContent = short

			container.appendChild(el)
		})

		return container
	}


	const buildTimingBlock = (json, network, txid) => {
		const container = document.createElement('div')
		container.className = 'txread-timing'

		const timeInfo = parseTxIdTime(txid)
		if (!timeInfo) return container

		const nowSec = Math.floor(Date.now() / 1000)
		const diff = timeInfo.seconds - nowSec

		// time until execution
		const countdown = document.createElement('div')
		countdown.className = 'txread-countdown'
		countdown.textContent = `⏱ ${formatCountdown(diff)}`
		container.appendChild(countdown)

		// formatted start time
		const startTime = document.createElement('div')
		startTime.textContent = formatUtcTime(timeInfo.seconds)
		container.appendChild(startTime)

		// txid link (HashScan)
		const txLink = document.createElement('a')
		txLink.href = `https://hashscan.io/${network}/transaction/${txid}`
		txLink.target = '_blank'
		txLink.rel = 'noopener'
		txLink.textContent = txid
		txLink.style.wordBreak = 'break-all'
		container.appendChild(txLink)

		// network label
		const net = document.createElement('div')
		net.textContent = `Hedera ${network}`
		container.appendChild(net)

		return container
	}

	const injectTxReadCSS = () => {
		if (document.getElementById('txread-css')) return

		const style = document.createElement('style')
		style.id = 'txread-css'
		style.textContent = `
			.txread table {
				border-collapse: collapse;
				font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
				font-size: 14px;
				margin-top: 12px;
				width: 100%;
			}

			.txread td {
				border: 1px solid #ddd;
				padding: 6px 8px;
				vertical-align: top;
			}

			.txread td:first-child {
				white-space: nowrap;
				color: #555;
				font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
				background: #fafafa;
			}

			.txread td:nth-child(2) {
				white-space: pre-wrap;
				word-break: break-word;
				max-width: 700px;
			}

			.txread td:last-child {
				color: #777;
				font-size: 13px;
			}


			.txread-grid {
				display: flex;
				gap: 16px;
				margin: 12px 0 16px;
				flex-wrap: wrap;
			}

			.txread-col {
				flex: 1 1 220px;
				min-width: 200px;
			}

			.txread-thumb img {
				max-width: 100%;
				height: auto;
				display: block;
				border-radius: 4px;
				background: #f5f5f5;
			}


			.txread-xfers {
				display: grid;
				grid-template-columns: 1.2fr 1.5fr 0.6fr;
				gap: 4px 12px;
				font-size: 13px;
			}

			.txread-xfer-head {
				font-weight: 600;
				color: #444;
				border-bottom: 1px solid #ddd;
				padding-bottom: 4px;
				margin-bottom: 4px;
			}
						
			.txread-sigs-title {
				font-weight: 600;
				margin-bottom: 6px;
				color: #444;
			}

			.txread-sig {
				font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
				font-size: 13px;
				padding: 2px 0;
			}

		.txread-timing {
			font-size: 13px;
			line-height: 1.4;
		}

		.txread-countdown {
			font-weight: 600;
			margin-bottom: 4px;
		}
			
		`
		document.head.appendChild(style)
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
