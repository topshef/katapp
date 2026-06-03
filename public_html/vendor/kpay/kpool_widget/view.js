
	import {
		get,
		parseTxId,
		formatUtcTime,
		formatCountdown
	} from './utils.js'

	const deriveStatusFromTime = (txid, updatedAtMs) => {
		const info = parseTxId(txid)
		if (!info) return 'Unknown'

		const nowSec = Math.floor(Date.now() / 1000)
		const scheduledSec = info.seconds
		const diff = scheduledSec - nowSec

		// still in future
		if (diff > 0) return 'Waiting'

		// within 3 min window after scheduled time
		if (diff > -180) return 'Ready to submit..'

		// past 3 min — only expired if data is fresh enough
		if (updatedAtMs) {
			const freshnessSec = (Date.now() - updatedAtMs) / 1000
			if (freshnessSec < 30) return 'Expired'
		}

		return 'Unknown'
	}


	/*
		Status block component (self-contained, refreshable).

		Usage:
			const statusBlock = buildStatusBlock({ data })
			col4.appendChild(statusBlock.el)

		When polling:
			statusBlock.update(newData)

		The block derives its own display state from:
		- mirror status (final state from API)
		- scheduled execution time (txid)
		- data.updatedAt (freshness)

		Future enhancements:
		- incorporate aggregated signing state (e.g. "Awaiting signatures")
		- include balance checks (e.g. "Insufficient balance")
		- unify timing + signing + execution into a single derived status
		- visually differentiate Waiting / Submitting / Expired / Success / Failed
		- optionally show progress indicators during submission

		This block should remain purely data-driven:
		it re-renders from provided data and holds no external state.
	*/
	export const buildStatusBlock = ({ data }) => {
		const container = document.createElement('div')

		const statusEl = document.createElement('div')
		container.appendChild(statusEl)

		let timingEl = null

		const render = currentData => {

			if (currentData.receiptSuccess === true)
				currentData.comboStatus = 'SUCCESS'

			let derivedStatus =
				currentData.comboStatus ||
				currentData.mirrorStatus ||
				currentData.receiptStatus

			if (!derivedStatus)
				derivedStatus = deriveStatusFromTime(currentData.txid, currentData.updatedAt)
			
			const pch = data.PCH  //later
			// const successKey = `tx_status:${network};${txid};${pch}`
			const successKey = `tx_status:${currentData.network};${currentData.txid};no_pch`
			if (derivedStatus === 'SUCCESS') localStorage.setItem(successKey, 'SUCCESS') // fudge sink this fucker

			statusEl.textContent = derivedStatus

			if (timingEl) {
				timingEl.remove()
				timingEl = null
			}

			if (
				derivedStatus?.startsWith('Waiting') ||
				derivedStatus?.startsWith('Ready')
			) {
				timingEl = buildTimingBlock(data.network, data.txid)
				container.appendChild(timingEl)
			}
		}

		render(data)

		return {
			el: container,
			update: newData => render(newData)
		}
	}
	
	
	export const buildTxReadColumns = ({ rawTx, data, transfers, network, txid  }) => {


		const grid = document.createElement('div')
		grid.className = 'txread-grid'

		const col1 = document.createElement('div')
		col1.className = 'txread-col txread-thumb'

		const col2 = document.createElement('div')
		col2.className = 'txread-col'

		const transfersView = buildTransferList(network, transfers.lineItems)
		col2.appendChild(transfersView)

    // reserved for future column
		// const col3 = document.createElement('div')
		// col3.className = 'txread-col'

		const col4 = document.createElement('div')
		col4.className = 'txread-col'
		
		const statusBlock = buildStatusBlock({ data })
		col4.appendChild(statusBlock.el)


    const ready = document.createElement('div')
    ready.id='txread-readiness'
    ready.className='txread-timing'
    col4.appendChild(ready)


		// txid link (HashScan)
		const txLink = document.createElement('a')
		txLink.className = 'txread-timing'
		txLink.href = `https://hashscan.io/${network}/transaction/${txid}`
		txLink.target = '_blank'
		txLink.rel = 'noopener'
		txLink.textContent = txid
		txLink.style.wordBreak = 'break-all'
		col4.appendChild(txLink)

		// network label
		const net = document.createElement('div')
		net.className = 'txread-timing'
		net.textContent = `Hedera ${network}`
    
    col4.appendChild(net)

    const bannerSlot=document.createElement('div')
    bannerSlot.id='tx-banner-slot'
    bannerSlot.style.position='relative'
    bannerSlot.style.height='36px'
    col4.appendChild(bannerSlot)


		// thumbnail (column 1)
		const thumbUrl = data.deal?.display?.thumbnail // get(rawTx, 'result.deal.display.thumbnail')
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

		signingSection.appendChild(keys)

		// return grid
		const wrapper = document.createElement('div')
		wrapper.className = 'txread-wrapper'
		wrapper.appendChild(grid)
		wrapper.appendChild(signingSection)
		// return wrapper
		return {
			el: wrapper,
			statusBlock
		}
	}


  export function buildTransferList(network, lineItems) {

		const container = document.createElement('div')
		container.className = 'txread-xfers'

		;['Account', 'Amount', 'Asset'].forEach(h => {
			const el = document.createElement('div')
			el.className = 'txread-xfer-head'
			el.textContent = h
			container.appendChild(el)
		})

    const addRow = (account, asset, amount) => {
      if(!asset) throw new Error('GX84752 Missing asset')
      
      const a = document.createElement('div')
      a.style.textAlign='right'

      const accountId=account.account ?? account
      const accountUrl=`https://hashscan.io/${network}/account/${accountId}`
      a.innerHTML=`<a href='${accountUrl}' target='${accountId}'>${accountId}</a>`

      const b = document.createElement('div')
      b.style.textAlign = 'left'
      let assetLabel = asset.symbol ?? asset.name ?? ''
      
      const tokenId = asset.raw
      const serial = asset.serial ?? ''
      // let assetUrl = `https://tools.gomint.me/explore/NFT/?productId=${network};${tokenId}-${serial}`
      let assetUrl = `https://hashscan.io/${network}/token/${tokenId}`
      if (serial) assetUrl += `/${serial}`
      //https://hashscan.io/mainnet/token/0.0.2111380/2
      
      let assetLinkLabel = (serial) ? `${tokenId}#${serial}` : `${tokenId}`
      let assetLink = `<a href='${assetUrl}' target='${assetLinkLabel}'>${assetLinkLabel}</a>`
      
      if(asset.symbol?.startsWith('HEDERA://')) assetLabel = asset.name ?? assetLabel
            
      let assetIcon=''
      let assetTooltip=''

      const pad='\u200B\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'
      if(asset.assetClass=='FT') assetIcon='🪙',assetTooltip=pad+'Fungible Token'
      if(asset.assetClass=='LE') assetIcon='🖼️',assetTooltip=pad+'Limited Edition'
      if(asset.assetClass=='NFT') assetIcon='💎',assetTooltip=pad+'NFT'

      assetLabel=`<span class='cursor-default' title='${assetTooltip}'>${assetIcon}</span> ${asset.assetClass=='NFT'?asset.symbol:assetLabel} ${assetLink}`
   

      if(asset.raw == 'tinybar') assetLabel = 'HBAR'
      
 
      b.innerHTML = assetLabel

      const c = document.createElement('div')
      c.style.textAlign = 'right'
      let amountFormatted = amount?.formatted ?? `[int:${amount?.raw}]`
      if (amount?.raw > 0) amountFormatted = '+' + amountFormatted
      c.textContent = amountFormatted
      

			container.appendChild(a)
			container.appendChild(c)
			container.appendChild(b)
		}

		lineItems.forEach(item => {
      addRow(
        item,
        item.assetMeta,
        {raw:item.amountRaw,formatted:item.amountFormatted}
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

		const targetSec = txidInfo.seconds

		const countdown = document.createElement('div')
		countdown.className = 'txread-countdown'
		container.appendChild(countdown)

		const update = () => {
			const nowSec = Math.floor(Date.now() / 1000)
			const diff = targetSec - nowSec

			if (diff <= -180) {
				countdown.textContent = '⏱ Unknown'
				clearInterval(timer)
				return
			}

			countdown.textContent = `⏱ ${formatCountdown(diff)}`
		}

		const timer = setInterval(update, 1000)
		update()

		// formatted start time
		const startTime = document.createElement('div')
		startTime.textContent = formatUtcTime(txidInfo.seconds)
		container.appendChild(startTime)

		return container
	}
		

const VIEW_KEY_PREFIXES = [
	'302a300506032b6570032100',
]

function normalizeViewKey(key) {
	if (!key) return null
	let k = key.toLowerCase()
	for (const prefix of VIEW_KEY_PREFIXES) {
		if (k.startsWith(prefix)) { k = k.slice(prefix.length); break }
	}
	return k
}

export function renderSigningInfo({ data, accounts }) {
	// derive signed keys ONCE
	const signedPubkeys = (data.sigs || [])
		.map(s => s.pubKey)
		.filter(Boolean)
		.map(normalizeViewKey)
		.filter(Boolean)

	renderAccountKeyInfo(accounts, signedPubkeys, data.network)
	// renderKeyPieCharts({ network, accounts, signedPubkeys })
}



export function renderReadinessInfo({readiness}) {
	const el = document.getElementById('txread-readiness')
	if(!el) return

	el.innerHTML = ''

	if(!readiness) return

	const txt = readiness.thresholdSatisfied
		? `🟢 Threshold satisfied`
		: `✍️ ${readiness.signedRequiredKeyCount} keys signed • needs ${readiness.minMoreKeyCount} more`

	el.appendChild(document.createTextNode(txt))

	if(readiness.witnessKeys?.length) {
		const tooltip = readiness.witnessKeys.map(k => '.    ...' + k.slice(-4)).join('\n')
		const span = document.createElement('span')
		span.style.cursor = 'default'
		span.title = tooltip
		span.textContent = ` • 👀 ${readiness.witnessKeys.length} witness`
		el.appendChild(span)
	}
}



export function showBanner(message,type='info') {
	let el=document.getElementById('tx-banner')
	if(!el){
		el=document.createElement('div')
		el.id='tx-banner'
    ;(document.getElementById('tx-banner-slot') || document.body).appendChild(el)
	}
	el.className=`notice ${type}`
	el.textContent=message
	el.style.opacity='1'
	clearTimeout(el._timer)
	// el._timer=setTimeout(()=>el.style.opacity='0',3000)
  el._timer=setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.textContent='',250)},3000)
}


function buildThresholdWidget({ signedPubkeys, mustSign, keyInfo }) {
  const widget = document.createElement('div')
  if (!mustSign) return widget
  widget.className = 'acctkeys-piechart'

  if (window.kpie && keyInfo) {
    window.kpie.render(widget, { keyInfo, signedPubkeys: signedPubkeys || [] })
      .catch(err => console.warn('[kpie] render failed', err))
  }

  return widget
}


export function renderAccountKeyInfo(accounts, signedPubkeys = [], network)	{
  const container = document.getElementById('account-keys')
  if (!container) return

  container.innerHTML = ''


  // ---- Key control ----
  const keyTitle = document.createElement('div')
  keyTitle.className = 'ksubtitle'
  keyTitle.textContent = 'Keys 🔑'
  container.appendChild(keyTitle)


  // header row (one-time)
  const header = document.createElement('div')
  header.className = 'acctkeys-header simple-mono-centre'

  const hAcct = document.createElement('div')
  hAcct.className = 'acctkeys-accountId'
  hAcct.textContent = 'Authority'
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

	const sortedAccounts = Object.entries(accounts)
		.sort(([idA, a], [idB, b]) => {
			if (a.mustSign !== b.mustSign)
				return a.mustSign ? -1 : 1
			return idA.localeCompare(idB)
		})
		
  // Object.entries(accounts).forEach(([accountId, acc]) => {
	sortedAccounts.forEach(([accountId, acc]) => {	
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

    const reasonMap={
      operator:{emoji:'⚙️',tip:'\u200B\u00A0\u00A0\u00A0\u00A0Operator account'},
      sender:{emoji:'📤',tip:'\u200B\u00A0\u00A0\u00A0\u00A0Sending assets'},
      receiver_sig_required:{emoji:'📥',tip:'\u200B\u00A0\u00A0\u00A0\u00A0Receiver signature required'}
    }

    const reasons=(acc.mustSignReason||[])
      .map(r=>reasonMap[r]?`<span class='cursor-default signing-reason' title='${reasonMap[r].tip}'>${reasonMap[r].emoji}</span>`:'')
      .join(' ')

    const domain=acc.label?.domain
    const name=acc.label?.name

    const domainUrl=domain ? `https://${domain}` : ''

    const labelHtml=
      (domain || name)
        ? `<div class='acctkeys-xproof'>
          ${domain?`<div><a href='${domainUrl}' target='_blank'>${domain}</a></div>`:''}
          ${name?`<div>${name}</div>`:''}
        </div>`
        : ''

    acct.innerHTML=
      labelHtml +
      `<a href='https://hashscan.io/${network}/account/${accountId}' target='${accountId}'>${accountId}</a>` +
      (reasons ? `<div class='acctkeys-reasons'>${reasons}</div>` : '')
      
    block.appendChild(acct)



		const widget = buildThresholdWidget({
			signedPubkeys,
			mustSign: acc.mustSign,
			keyInfo: acc.keyInfo
		})
		block.appendChild(widget)



    // right: keys grid
    const keysGrid = document.createElement('div')
    keysGrid.className = 'acctkeys-keysGrid'


		const mobileHead = document.createElement('div')
		mobileHead.className = 'acctkeys-mobile-head'
		;['✍️', '🔑', '⚖️', 'Redundant', 'Ctrl'].forEach(text => {
			const cell = document.createElement('div')
			cell.textContent = text
			mobileHead.appendChild(cell)
		})
		block.appendChild(mobileHead)
		

    entries.forEach(([pubkey, score]) => {
      const signed = signedPubkeys.includes(normalizeViewKey(pubkey))
      const tick = acc.mustSign ? (signed ? '☑️' : '🔲') : 'N/A'
      const keySuffix = pubkey.slice(-4)
      const pct = Math.round(score * 100)
      const red = redundancy?.[pubkey] != null
        ? Math.round(redundancy[pubkey] * 100)
        : '-'
      const bucket = buckets?.[pubkey]?.bucket ?? '-'

      ;[
        tick,
        // keySuffix,
				// rather than link maybe add a tooltip later
				// `<a href='/m/tools/api/keys/query/${pubkey.slice(-64)}' target = '${pubkey}'>${keySuffix}</a>`,
				
				//or link to hashscan key view for now
				`<a href='https://hashscan.io/${network}/adminKey/${accountId}' target = '${pubkey}'>${keySuffix}</a>`,
				
        `${pct}%`,
        red === '-' ? '-' : `${red}%`,
        bucket
      ].forEach(text => {
        const cell = document.createElement('div')
        // cell.textContent = text
        cell.innerHTML = text
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
	row.textContent = `${signed ? '☑️' : '🔲'}\u00A0${accountId}`
	return row
}


export function zz_later_injectTxReadCSS() {
  if (document.getElementById('txread-css')) return

  const link = document.createElement('link')
  link.id = 'txread-css'
  link.rel = 'stylesheet'
  link.href = new URL('./style.css', import.meta.url).href
  document.head.appendChild(link)
}
 
 
export function injectTxReadCSS() {
	if (document.getElementById('txread-css')) return

  //or add script tag <script src="/path/to/kpie.js"></script>
  const s = document.createElement('script')
  s.src = new URL('./kpie.js', import.meta.url).href
  document.head.appendChild(s)


	const style = document.createElement('style')
	style.id = 'txread-css'
	style.textContent = `

			.acctkeys-mobile-head {display: none;}


			.acctkeys-piechart {
				width: 110px;
				height: 110px;
				--acctkeys-pie-scale: 0.2;
			}

			@media (max-width: 768px) {
				
				/* Make each account id a divider block */
				.acctkeys-accountId {
					width: 100%;
					text-align: center;
					font-weight: 700;
					font-size: 18px;
					border-top: 1px solid #ddd;
					padding-top: 8px;
					margin-top: 8px;
				}
				
				.ksubtitle {
					display: none;
				}

				.acctkeys-piechart {
					width: 150px;
					height: 150px;
					--acctkeys-pie-scale: 0.3;
				}	

				.acctkeys-mobile-head {
					display: grid;
					grid-template-columns: 0.4fr 0.8fr 0.6fr 0.6fr 1fr;
					column-gap: 8px;
					width: 100%;
					font-weight: 600;
					color: #666;
				}


				/* Hide the single global header row */
				.acctkeys-header {
					display: none !important;
				}

				/* Stack each account vertically */
				.acctkeys-account {
					display: flex !important;
					flex-direction: column !important;
					align-items: center !important;
					gap: 10px !important;
				}

				/* Account number */
				.acctkeys-accountId {
					width: 100%;
					text-align: center;
				}

				/* Keys block */
				.acctkeys-keysGrid {
					width: 100% !important;
				}

			}

			.txread-wrapper {
				max-width: 1200px;
				margin: 0 auto;
			}

			.acctkeys-piechart {
				justify-self: center;
			}

			#account-keys {
				padding: 0 12px;
				box-sizing: border-box;
				max-width: min(900px, 100%);
				margin: 0 auto;

			}

				/* shared grid layout */
			.acctkeys-header,
			.acctkeys-account {
				display: grid;
				grid-template-columns: 0.5fr 0.5fr 1fr;
				column-gap: 8px;
				margin-top: 6px;
				align-items: center;
				width: 100%;

			}

			.acctkeys-header { font-weight: 600; color: #666; }
	
			.acctkeys-keysGrid {
				display: grid;
				grid-template-columns: 0.4fr 0.8fr 0.6fr 0.6fr 1fr;
				column-gap: 4px;
				row-gap: 2px;
				align-content: center;
				zzmax-width: 60%;


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
			grid-template-columns: 1.2fr 0.6fr 1.8fr;
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

    .txread-xfer-head:nth-child(1) {text-align:right;}
    .txread-xfer-head:nth-child(2) {text-align:right;}
    .txread-xfer-head:nth-child(3) {text-align:left;}

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
          
    #tx-banner-slot{
      position:relative;
    }

    .notice{
      position:absolute;
      top:0;
      left:0;
      right:0;

      padding:8px 12px;
      border-radius:6px;

      font-size:12px;

      border:1px solid rgba(0,0,0,.08);
      box-shadow:0 2px 8px rgba(0,0,0,.08);

      transition:opacity .3s ease;
      opacity:0;
    }

    .notice.success{
      background:#D1E7DD;
      color:#0F5132;
    }

    .notice.info{
      background:#CFE2FF;
      color:#084298;
    }

    .notice.warning{
      background:#FFF3CD;
      color:#664D03;
    }

    .notice.error{
      background:#F8D7DA;
      color:#842029;
    }


    .cursor-default{cursor:default;}


    .acctkeys-reasons{
      margin-top:4px;
      font-size:16px;
      display:flex;
      justify-content:center;
      gap:6px;
    }

    .signing-reason{
      cursor:default;
    }


    .acctkeys-xproof{
      font-size:11px;
      line-height:1.2;
      margin-bottom:4px;
      color:#666;
      font-weight:600;
    }

    .acctkeys-xproof div{
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }


	`
	document.head.appendChild(style)
}

