
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
		// grid.appendChild(col3)
		grid.appendChild(col4)

		// Full-width signing section
		const signingSection = document.createElement('div')
		signingSection.id = 'txread-signing'
		signingSection.style.marginTop = '16px'
		signingSection.style.width = '100%'
        signingSection.classList.add('tx-loading')

        // put key list and pie charts to different elements to avoid race stuff
        const keys = document.createElement('div')
        keys.id = 'key-list'

        const pies = document.createElement('div')
        pies.id = 'key-piecharts'
        pies.style.marginTop = '16px'

        signingSection.appendChild(keys)
        signingSection.appendChild(pies)        
        

		// return grid
		const wrapper = document.createElement('div')
		wrapper.appendChild(grid)
		wrapper.appendChild(signingSection)
		return wrapper

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

	// 3rd section - signing status - rolled into buildTxReadColumns


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

	renderAccountKeyInfo(accounts, signedPubkeys)
	renderKeyPieCharts({ network, accounts, signedPubkeys })
}

export function renderAccountKeyInfo(accounts, signedPubkeys = [])	{
  const container = document.getElementById('key-list')
  if (!container) return

  container.innerHTML = ''

  // ---- Accounts to sign ----
  // const signTitle = document.createElement('div')
  // signTitle.className = 'ksubtitle'
  // signTitle.textContent = 'Accounts to sign'
  // container.appendChild(signTitle)

  // Object.entries(accounts)
    // .filter(([_, acc]) => acc.mustSign)
    // .forEach(([accountId]) => {
      // const el = document.createElement('div')
      // el.className = 'simple-mono-centre'
      // el.textContent = accountId
      // container.appendChild(el)
    // })

  // ---- Key control ----
  const keyTitle = document.createElement('div')
  keyTitle.className = 'ksubtitle'
  keyTitle.textContent = 'Keys to sign'
  container.appendChild(keyTitle)

  const table = document.createElement('div')
  table.className = 'simple-mono-centre'
  table.style.display = 'grid'
  // table.style.gridTemplateColumns = '1.3fr 0.8fr 0.6fr 0.6fr 1fr'
	table.style.gridTemplateColumns = '1.1fr 0.4fr 0.8fr 0.6fr 0.6fr 1fr'
  table.style.columnGap = '8px'
  table.style.rowGap = '2px'
  container.appendChild(table)

  const addRow = (cells, isFirstOfAccount) => {
    cells.forEach(text => {
      const cell = document.createElement('div')
      cell.textContent = text
      if (isFirstOfAccount) cell.style.marginTop = '6px'
      table.appendChild(cell)
    })
  }

  // header
  addRow(['Account', '✍️', '🔑', 'Banzhaf ⚖️', 'Redundancy', 'Control'], true )

  Object.entries(accounts).forEach(([accountId, acc]) => {
    const scores = acc.keyInfo?.banzhafScores?.scores
    const redundancy = acc.keyInfo?.banzhafScores?.redundancy
    const buckets = acc.keyInfo?.keyControlScoresAll
    if (!scores || !buckets) {
        console.warn('GH84743 Missing score data for', accountId, acc.keyInfo)
        addRow(['debug GH84743', '✍️', '🔑', 'Banzhaf ⚖️', 'Redundancy', 'Control'], true )
        return
    }

    Object.entries(scores).forEach(([pubkey, score], index) => {
			const signed = signedPubkeys.includes(pubkey)
			const tick = signed ? '☑️' : '🔲'

      const keySuffix = pubkey.slice(-4)
      const pct = Math.round(score * 100)
      const red = redundancy?.[pubkey] != null
        ? Math.round(redundancy[pubkey] * 100)
        : '-'
      const bucket = buckets?.[pubkey]?.bucket ?? '-'

      addRow(
        [
          accountId,
					tick,
          keySuffix,
          `${pct}%`,
          red === '-' ? '-' : `${red}%`,
          bucket
        ],
        index === 0
      )
    })
  })
}
		

const renderSingleKeyCheckbox = ({ accountId, signed }) => {
	const row = document.createElement('div')
	row.className = 'simple-mono-centre'
	row.textContent = `${signed ? '☑️' : '🔲'}\u00A0${accountId}` // XX1 todo merge acinfo
	return row
}

export function renderKeyPieCharts({ network, accounts, signedPubkeys }) { //
	// later todo bring this widget in locally.. or package it as a dependency
	const container = document.getElementById('key-piecharts')
	if (!container) return

	const title = document.createElement('div')
	title.className = 'ksubtitle'
	title.textContent = 'Per account, threshold needed 🟠 / achieved 🟢'
	container.appendChild(title)

	const charts = document.createElement('div')
	charts.style.display = 'flex'
	charts.style.flexWrap = 'wrap'
	charts.style.gap = '12px'
	charts.style.justifyContent = 'center'
	container.appendChild(charts)

	const signed = (signedPubkeys || []).join(',')

	Object.keys(accounts).forEach(accountId => {
		
		// handle single keys differently
		const acc = accounts[accountId]
		console.log(acc)
		
		const wrapper = document.createElement('div')
	  
		wrapper.style.width = '200px'
		wrapper.style.height = '110px'
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
		iframe.style.transform = 'scale(0.2)'
		iframe.style.transformOrigin = 'top left'
		iframe.style.border = 'none'
		iframe.style.position = 'absolute'
		iframe.style.top = '0'
		// iframe.style.left = '0'
		iframe.style.left = '50%'
		iframe.style.transformOrigin = 'top center'
		iframe.style.transform = 'translateX(-50%) scale(0.2)'
		iframe.scrolling = 'no'

		const label = document.createElement('div')
		label.textContent = accountId // XX1 todo merge acinfo
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
            
        .tx-loading {
          border-top: 3px solid #4aa3ff;
          animation: pulseBorder 1s ease-in-out infinite;
        }

        @keyframes pulseBorder {
          0%   { border-top-color: rgba(74,163,255,0.3); }
          50%  { border-top-color: rgba(74,163,255,1); }
          100% { border-top-color: rgba(74,163,255,0.3); }
        }

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

		.txread-thumb {
			display: flex;
			justify-content: center;
			align-items: flex-start;
		}


		.txread-thumb img {
			max-width: 140px;


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

		.ksubtitle {
			font-weight: 600;
			margin-top: 12px;
			padding-bottom: 0px;
			margin-bottom: 2px;
			color:#999;
 			border-bottom:0.5px solid #ddd;width:100%;
		}

		.simple-mono-centre {
			font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
			font-size: 13px;
			padding: 2px 0;
			color:#777;
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

