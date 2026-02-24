
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
        keys.id = 'account-keys'

        // const pies = document.createElement('div')
        // pies.id = 'key-piecharts'
        // pies.style.marginTop = '16px'

        signingSection.appendChild(keys)
        // signingSection.appendChild(pies)        
        

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

	renderAccountKeyInfo(accounts, signedPubkeys, network)
	// renderKeyPieCharts({ network, accounts, signedPubkeys })
}


function buildThresholdWidget({ accountId, network, signedPubkeys, mustSign }) {
  const widget = document.createElement('div')
  widget.className = 'acctkeys-piechart'

  if (!mustSign) return widget

  const signed = (signedPubkeys || []).join(',')

  const iframe = document.createElement('iframe')
  iframe.src =
    `https://kpay.uk/devtools/scratchpad/amcharts/ksig_pie_widget.php` +
    `?showTooltips=0` +
    `&network=${network}` +
    `&accountId=${accountId}` +
    `&signedPublicKeys=${signed}`

	iframe.style.width = '450px'
	iframe.style.height = '450px'
	iframe.style.border = 'none'
	iframe.style.position = 'absolute'
	iframe.style.top = '50%'
	iframe.style.left = '50%'
	iframe.style.transformOrigin = 'center'
	iframe.style.transform = 'translate(-50%, -50%) scale(0.2)'
	iframe.scrolling = 'no'

  widget.style.position = 'relative'
  widget.style.width = '110px'
  widget.style.height = '110px'
  widget.style.overflow = 'hidden'

  widget.appendChild(iframe)
  return widget
}


export function renderAccountKeyInfo(accounts, signedPubkeys = [], network)	{
  const container = document.getElementById('account-keys')
  if (!container) return

  container.innerHTML = ''


  // ---- Key control ----
  const keyTitle = document.createElement('div')
  keyTitle.className = 'ksubtitle'
  keyTitle.textContent = 'Account keys'
  container.appendChild(keyTitle)


  // header row (one-time)
  const header = document.createElement('div')
  header.className = 'acctkeys-header simple-mono-centre'

  const hAcct = document.createElement('div')
  hAcct.className = 'acctkeys-accountId'
  hAcct.textContent = 'Account'
  header.appendChild(hAcct)

	const hWidget = document.createElement('div')
	hWidget.textContent = 'Threshold'
	header.appendChild(hWidget)

  const hGrid = document.createElement('div')
  hGrid.className = 'acctkeys-keysGrid acctkeys-keysGrid-header'
  ;['✍️', '🔑', 'Banzhaf ⚖️', 'Redundancy', 'Control'].forEach(text => {
    const cell = document.createElement('div')
    cell.textContent = text
    hGrid.appendChild(cell)
  })
  header.appendChild(hGrid)

  container.appendChild(header)

  Object.entries(accounts).forEach(([accountId, acc]) => {
    const scores = acc.keyInfo?.banzhafScores?.scores
    const redundancy = acc.keyInfo?.banzhafScores?.redundancy
    const buckets = acc.keyInfo?.keyControlScoresAll

    if (!scores || !buckets) {
      console.warn('GH84743 Missing score data for', accountId, acc.keyInfo)
      return
    }

    const entries = Object.entries(scores)

    const block = document.createElement('div')
		block.className = 'acctkeys-account simple-mono-centre'
    if (!acc.mustSign) block.classList.add('no-sign-required')

    // left column: account id (and later you can add iframe under/over this)
    const acct = document.createElement('div')
    acct.className = 'acctkeys-accountId'
    acct.textContent = accountId
    block.appendChild(acct)


		const widget = buildThresholdWidget({
			accountId,
			network,
			signedPubkeys,
			mustSign: acc.mustSign
		})
		block.appendChild(widget)



    // right: keys grid
    const keysGrid = document.createElement('div')
    keysGrid.className = 'acctkeys-keysGrid'

    entries.forEach(([pubkey, score]) => {
      const signed = signedPubkeys.includes(pubkey)
      const tick = acc.mustSign ? (signed ? '☑️' : '🔲') : 'N/A'
      const keySuffix = pubkey.slice(-4)
      const pct = Math.round(score * 100)
      const red = redundancy?.[pubkey] != null
        ? Math.round(redundancy[pubkey] * 100)
        : '-'
      const bucket = buckets?.[pubkey]?.bucket ?? '-'

      ;[
        tick,
        keySuffix,
        `${pct}%`,
        red === '-' ? '-' : `${red}%`,
        bucket
      ].forEach(text => {
        const cell = document.createElement('div')
        cell.textContent = text
        keysGrid.appendChild(cell)
      })
    })

    block.appendChild(keysGrid)
    container.appendChild(block)
  })


}
		

const renderSingleKeyCheckbox = ({ accountId, signed }) => {
	const row = document.createElement('div')
	row.className = 'simple-mono-centre'
	row.textContent = `${signed ? '☑️' : '🔲'}\u00A0${accountId}` // XX1 todo merge acinfo
	return row
}


export function injectTxReadCSS() {
	if (document.getElementById('txread-css')) return

	const style = document.createElement('style')
	style.id = 'txread-css'
	style.textContent = `

			.acctkeys-piechart {
				display: flex;
				align-items: center;
				justify-content: center;
			}


			#account-keys {
				padding: 0 12px;
				box-sizing: border-box;
			}

				/* shared grid layout */
			.acctkeys-header,
			.acctkeys-account {
				display: grid;
				grid-template-columns: 0.5fr 0.5fr 3fr;
				column-gap: 8px;
				margin-top: 6px;
				align-items: center;
			}

			.acctkeys-header { font-weight: 600; color: #666; }

			.zzacctkeys-accountId {
				align-self: start;
			}
	
			.acctkeys-keysGrid {
				display: grid;
				grid-template-columns: 0.4fr 0.8fr 0.6fr 0.6fr 1fr;
				column-gap: 8px;
				row-gap: 2px;
				align-content: center;

			}


			.no-sign-required {
				opacity: 0.6;
				filter: grayscale(0.3);
			}
            
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

