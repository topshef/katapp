
	import {
		get,
		parseTxId,
		formatUtcTime,
		formatCountdown
	} from './utils.js'


	export const buildTxReadColumns = ({ rawTx, transfers, network, txid }) => {


		const grid = document.createElement('div')
		grid.className = 'txread-grid'

		const col1 = document.createElement('div')
		col1.className = 'txread-col txread-thumb'

		const col2 = document.createElement('div')
		col2.className = 'txread-col'

		const transfersView = buildTransferList(transfers.lineItems)
		col2.appendChild(transfersView)



		const col3 = document.createElement('div')
		col3.className = 'txread-col'
		const sigs = buildSignatureList(rawTx)
		col3.appendChild(sigs)
		

		const col4 = document.createElement('div')
		col4.className = 'txread-col'
		const timing = buildTimingBlock(network, txid)
		col4.appendChild(timing)

		// thumbnail (column 1)
		const thumbUrl = get(rawTx, 'result.deal.display.thumbnail')
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


	export const buildTransferList = lineItems => {

		const container = document.createElement('div')
		container.className = 'txread-xfers'

		;['Account', 'Asset', 'Amount'].forEach(h => {
			const el = document.createElement('div')
			el.className = 'txread-xfer-head'
			el.textContent = h
			container.appendChild(el)
		})

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

		lineItems.forEach(item => {
			addRow(
				item.account,
				item.asset,
				item.amount
			)
		})

		return container
	}

	// 3rd section - signing status
	export const buildSignatureList = rawTx => {
		const container = document.createElement('div')
		container.className = 'txread-sigs'

		const title = document.createElement('div')
		title.className = 'txread-sigs-title'
		title.textContent = 'Signatures received'
		container.appendChild(title)

		const sigs = get(rawTx, 'result.sigs') || []

		if (!sigs.length) {
			const empty = document.createElement('div')
			empty.textContent = '—'
			container.appendChild(empty)
			// return container
		}
		
		sigs.forEach(s => {
			const pubKey = s.pubKey || ''
			const short = pubKey.slice(-4)

			const el = document.createElement('div')
			el.className = 'txread-sig'
			el.textContent = short

			container.appendChild(el)
		})

		// accounts placeholder (for enrichment)
		const accounts = document.createElement('div')
		accounts.id = 'txread-accounts'
		accounts.style.marginTop = '8px'
		container.appendChild(accounts)


		return container
	}

	//4th section - tx status
	export const buildTimingBlock = (network, txid) => {
		const container = document.createElement('div')
		container.className = 'txread-timing'

		const txidInfo = parseTxId(txid)
		if (!txidInfo) return container

		const nowSec = Math.floor(Date.now() / 1000)
		const diff = txidInfo.seconds - nowSec

		// time until execution
		const countdown = document.createElement('div')
		countdown.className = 'txread-countdown'
		countdown.textContent = `⏱ ${formatCountdown(diff)}`
		container.appendChild(countdown)

		// formatted start time
		const startTime = document.createElement('div')
		startTime.textContent = formatUtcTime(txidInfo.seconds)
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
		

export function renderSigningInfo({ rawTx, network, accounts }) {
	// derive signed keys ONCE
	const signedPubkeys = (get(rawTx, 'result.sigs') || [])
		.map(s => s.pubKey)
		.filter(Boolean)

	renderAccountsInfo(accounts)
	renderKeyPieCharts({ network, accounts, signedPubkeys })
}

		
export function renderAccountsInfo(accounts) {  //todo rename this it's about signing not jjst accoutns.. or extract to above
// ..and then recycle this for pure ac info not signing
	const container = document.getElementById('txread-accounts')
	if (!container) return

	container.innerHTML = ''

	const title = document.createElement('div')
	title.className = 'txread-sigs-title'
	title.textContent = 'Accounts to sign'
	container.appendChild(title)

	Object.entries(accounts)
		.filter(([_, acc]) => acc.mustSign)
		.forEach(([accountId]) => {
			const el = document.createElement('div')
			el.className = 'txread-sig'
			el.textContent = accountId
			container.appendChild(el)
		})

	//note this is all keys score not beased on signed context so far
	// todo enrich and format the table to show the current status considering keys that have signed
	// work out latest MWC minimum voting coalitions
	const scoresTitle = document.createElement('div')
	scoresTitle.className = 'txread-sigs-title'
	scoresTitle.textContent = 'Key control'
	container.appendChild(scoresTitle)

	const subtitle = document.createElement('div')
	subtitle.className = 'txread-sig'
	subtitle.textContent = 'pubkey|banzhaf|redundancy|bucket'
	container.appendChild(subtitle)

	Object.entries(accounts).forEach(([accountId, acc]) => {
		const scores = acc.keyInfo?.banzhafScores?.scores
		if (!scores) {
			const el = document.createElement('div')
			el.className = 'txread-sig'
			el.textContent = `YH64664 no scores for ${accountId}`
			container.appendChild(el)
			return
		}

		const redundancy = acc.keyInfo?.banzhafScores?.redundancy
		const buckets = acc.keyInfo?.keyControlScoresAll
		if (!scores || !buckets) return

		const accEl = document.createElement('div')
		accEl.className = 'txread-sig'
		accEl.textContent = accountId
		container.appendChild(accEl)

		Object.entries(scores).forEach(([pubkey, score]) => {
			const row = document.createElement('div')
			row.className = 'txread-sig'
			row.style.paddingLeft = '16px'

			const keySuffix = pubkey.slice(-4)
			const pct = Math.round(score * 100)
			const red = redundancy?.[pubkey] != null
				? Math.round(redundancy[pubkey] * 100)
				: '-'
			const bucket = buckets?.[pubkey]?.bucket ?? '-'

			row.textContent = `${keySuffix} | ${pct}% | ${red}% | ${bucket}`
			container.appendChild(row)
		})
	})
}

const isSingleKeyAccount = acc =>
	typeof acc?.keyInfo === 'string'


const renderSingleKeyCheckbox = ({ accountId, signed }) => {
	const row = document.createElement('div')
	row.textContent = `${signed ? '☑️' : '🔲'}\u00A0${accountId}`
	return row
}


export function renderKeyPieCharts({ network, accounts, signedPubkeys }) { //
	// later todo bring this widget in locally.. or package it as a dependency
	const container = document.getElementById('txread-accounts')
	if (!container) return

	const title = document.createElement('div')
	title.className = 'txread-sigs-title'
	title.textContent = 'Signing progress'
	container.appendChild(title)

	const charts = document.createElement('div')
	charts.style.display = 'flex'
	charts.style.flexWrap = 'wrap'
	charts.style.gap = '12px'
	container.appendChild(charts)

	const signed = (signedPubkeys || []).join(',')

	Object.keys(accounts).forEach(accountId => {
		
		// handle single keys differently
		const acc = accounts[accountId]
		console.log(acc)
		if (isSingleKeyAccount(acc)) {
			const signed = signedPubkeys.includes(acc.keyInfo)
			console.log("signed=", signed)
			const checkbox = renderSingleKeyCheckbox({
				accountId,
				signed
			})
			charts.appendChild(checkbox)
			return
		}		
		
		const wrapper = document.createElement('div')
		wrapper.style.width = '200px'
		wrapper.style.height = '230px'
		wrapper.style.position = 'relative'
		wrapper.style.overflow = 'hidden'
		wrapper.style.fontFamily = 'monospace'
		wrapper.style.fontSize = '12px'
		wrapper.style.textAlign = 'center'

		const iframe = document.createElement('iframe')
		iframe.src =
			`https://kpay.uk/devtools/scratchpad/amcharts/ksig_pie_widget.php` +
			`?showTooltips=0` +
			`&network=${network}` +
			`&accountId=${accountId}` +
			`&signedPublicKeys=${signed}`

		iframe.style.width = '450px'
		iframe.style.height = '450px'
		iframe.style.transform = 'scale(0.45)'
		iframe.style.transformOrigin = 'top left'
		iframe.style.border = 'none'
		iframe.style.position = 'absolute'
		iframe.style.top = '0'
		iframe.style.left = '0'
		iframe.scrolling = 'no'

		const label = document.createElement('div')
		label.textContent = accountId
		label.style.position = 'absolute'
		label.style.bottom = '4px'
		label.style.left = '0'
		label.style.right = '0'
		label.style.whiteSpace = 'nowrap'
		label.style.overflow = 'hidden'
		label.style.textOverflow = 'ellipsis'

		wrapper.appendChild(iframe)
		wrapper.appendChild(label)
		charts.appendChild(wrapper)
	})
}


export function injectTxReadCSS() {
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

