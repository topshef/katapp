import {
		get,
		parseTxId,
		formatUtcTime,
		formatCountdown,
		isHederaSystemAccount
	} from './utils.js'
import { normalizePublicKey, normalizeKeyTree } from './keynorm.js'

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
	
	
	function decodeB64(b){ try { return b ? decodeURIComponent(escape(atob(b))) : null } catch { return null } }
	function extractMemo(data){
		return data?.memo
			?? data?.deal?.memo
			?? decodeB64(data?.mirror?.transactions?.[0]?.memo_base64)
			?? null
	}

	// ┌┬┐─┐ ┬  ┬  ┬┬┌─┐┬ ┬  ┬─┐┌─┐┌─┐┬┌─┐┌┬┐┬─┐┬ ┬
	//  │ ┌┴┬┘  └┐┌┘│├┤ │││  ├┬┘├┤ │ ┬│└─┐ │ ├┬┘└┬┘
	//  ┴ ┴ └─   └┘ ┴└─┘└┴┘  ┴└─└─┘└─┘┴└─┘ ┴ ┴└─ ┴
	// View registry (TX-CARDS2). Each entry renders the transfer block from the
	// normalized flow model. 'table' is the current flat list (the always-present
	// fallback); 'cards' lands in TX-CARDS3. Mirrors proposal mode's viewMode.
	const TX_VIEWS = {
		table: ({ network, flow, transfers }) => buildTransferList(network, (flow?.lineItems) || transfers?.lineItems || [])
	}

	// resolution order: ?txview= URL param → document.body.dataset.txView (set by
	// index.js from host CONFIG) → default 'table'. 'nerd' stacks every view.
	function resolveTxView() {
		let v
		try { v = new URLSearchParams(location.search).get('txview') } catch {}
		v = v || (typeof document !== 'undefined' && document.body?.dataset?.txView) || 'table'
		return v
	}

	// Returns the transfer block element. For a single known view this is the bare
	// view element (so the default 'table' DOM is byte-identical to pre-TX-CARDS2).
	// 'nerd' wraps every registered view in a labelled section for side-by-side dev.
	function buildTransferViews({ network, flow, transfers }) {
		const mode = resolveTxView()
		const make = name => (TX_VIEWS[name] || TX_VIEWS.table)({ network, flow, transfers })

		if (mode !== 'nerd') {
			const name = TX_VIEWS[mode] ? mode : 'table'
			try { globalThis.kdiag?.('txview:render', { mode, rendered: [name] }) } catch {}
			return make(name)
		}

		const wrap = document.createElement('div')
		wrap.className = 'txread-views-nerd'
		const rendered = Object.keys(TX_VIEWS)
		rendered.forEach(name => {
			const sec = document.createElement('div')
			sec.className = 'txread-view-section'
			sec.dataset.viewName = name
			const lbl = document.createElement('div')
			lbl.className = 'txread-view-label'
			lbl.textContent = name
			sec.append(lbl, make(name))
			wrap.appendChild(sec)
		})
		try { globalThis.kdiag?.('txview:render', { mode, rendered }) } catch {}
		return wrap
	}

	export const buildTxReadColumns = ({ rawTx, data, transfers, flow, network, txid, pch }) => {

		const sep = () => { const x = document.createElement('span'); x.className = 'txread-sep'; x.textContent = '·'; return x }

		const wrapper = document.createElement('div')
		wrapper.className = 'txread-wrapper'

		// ── 1. INTENT — what you're approving (+ optional you send/receive) ──
		const intent = document.createElement('div')
		intent.id = 'txread-intent'
		intent.className = 'txread-block txread-intent'

		const intentRow = document.createElement('div')
		intentRow.className = 'txread-intent-row'

		// TX-CARDS2: the transfer block is now produced by the view registry. Default
		// 'table' returns the same buildTransferList element as before (byte-identical);
		// ?txview=nerd stacks every registered view. (TX-CARDS1 routed it through the
		// normalized flow model; flow.lineItems == transfers.lineItems in order.)
		const xfers = buildTransferViews({ network, flow, transfers })
		xfers.classList.add('txread-intent-xfers')
		intentRow.appendChild(xfers)

		// You send / You receive narrative — populated by index.js once a wallet
		// account is known (experimental); hidden otherwise.
		const narrative = document.createElement('div')
		narrative.id = 'txread-narrative'
		narrative.className = 'txread-narrative'
		narrative.hidden = true
		intentRow.appendChild(narrative)

		intent.appendChild(intentRow)

		// public memo (if present) on its own line
		const memo = extractMemo(data)
		if (memo) {
			const memoEl = document.createElement('div')
			memoEl.className = 'txread-memo'
			const mlbl = document.createElement('span')
			mlbl.className = 'txread-memo-label'
			mlbl.textContent = 'Public memo: '
			memoEl.append(mlbl, document.createTextNode(memo))
			intent.appendChild(memoEl)
		}

		// scope line: Hedera <network> · <txid> · #<pch6>
		const scope = document.createElement('div')
		scope.className = 'txread-scope'
		const net = document.createElement('span')
		net.className = 'txread-scope-net'
		net.textContent = `Hedera ${network}`
		const txLink = document.createElement('a')
		txLink.className = 'txread-scope-txid'
		txLink.href = `https://hashscan.io/${network}/transaction/${txid}`
		txLink.target = '_blank'
		txLink.rel = 'noopener'
		txLink.textContent = txid
		scope.append(net, sep(), txLink)
		if (pch && pch !== 'no_pch') {
			const pchEl = document.createElement('span')
			pchEl.className = 'txread-scope-pch'
			pchEl.textContent = `#${String(pch).slice(0, 6)}`
			scope.append(sep(), pchEl)
		}
		intent.appendChild(scope)

		wrapper.appendChild(intent)

		// ── 2. SIGN — slot filled by index.js with the tabbed panel ───────
		const signSlot = document.createElement('div')
		signSlot.id = 'txread-sign-slot'
		wrapper.appendChild(signSlot)

		// ── 3. banner (always visible; transient signature notices) ──────
		const bannerSlot = document.createElement('div')
		bannerSlot.id = 'tx-banner-slot'
		bannerSlot.style.position = 'relative'
		wrapper.appendChild(bannerSlot)

		// Status detail + approvals table are CREATED here but PLACED by index.js
		// into the Status tab pane, so the render-by-id functions keep working.
		const statusBlock = buildStatusBlock({ data })
		statusBlock.el.classList.add('txread-status-main')

		const readinessEl = document.createElement('div')
		readinessEl.id = 'txread-readiness'
		readinessEl.className = 'txread-timing'

		const precheckEl = document.createElement('div')
		precheckEl.id = 'txread-precheck'
		precheckEl.className = 'txread-timing'

		const accountKeysEl = document.createElement('div')
		accountKeysEl.id = 'account-keys'

		// hover any element tagged with an account → highlight every related element
		// (transfer cells + that account's signing-authority row).
		let hlAcct = null
		const clearHl = () => {
			if (!hlAcct) return
			wrapper.querySelectorAll('.acct-hl').forEach(n => n.classList.remove('acct-hl'))
			hlAcct = null
		}
		wrapper.addEventListener('mouseover', e => {
			const el = e.target.closest('[data-acct]')
			const acct = el?.dataset.acct || null
			if (acct === hlAcct) return
			clearHl()
			if (acct) {
				wrapper.querySelectorAll(`[data-acct="${CSS.escape(acct)}"]`).forEach(n => n.classList.add('acct-hl'))
				hlAcct = acct
			}
		})
		wrapper.addEventListener('mouseleave', clearHl)

		return {
			el: wrapper,
			statusBlock,
			readinessEl,
			precheckEl,
			accountKeysEl
		}
	}


	// One-line status summary for the modal header (label + tone).
	// Combines lifecycle status with signing readiness.
	export const summariseStatus = ({ data = {}, readiness } = {}) => {
		const raw = data.comboStatus || data.mirrorStatus || data.receiptStatus || ''
		const up = String(raw).toUpperCase()

		// shape convention: square = on-chain result, circle = off-chain state
		if (up === 'SUCCESS')
			return { label: 'Success', tone: 'success', shape: 'square' }

		if (up.includes('EXPIR'))
			return { label: prettyStatus(raw), tone: 'error', shape: 'circle' }

		if (/FAIL|INVALID|ERROR|REJECT|DUPLICATE/.test(up))
			return { label: prettyStatus(raw), tone: 'error', shape: 'square' }

		if (readiness && !readiness.thresholdSatisfied) {
			const n = readiness.minMoreKeyCount
			return { label: `Awaiting approvals${n ? ` · ${n} more` : ''}`, tone: 'warn', shape: 'circle' }
		}

		if (readiness && readiness.thresholdSatisfied) {
			// All required keys are in. If the precheck is also clean (or N/A for a
			// non-transfer tx), it's all-systems-go — show green even though it's
			// not on chain yet (circle = off-chain). A failing/incomplete precheck
			// keeps it neutral so we don't flash green over a problem.
			const pc = data.precheck
			const precheckOK = !pc || (pc.status !== 'fail' && pc.complete !== false)
			return { label: 'Ready to submit', tone: precheckOK ? 'success' : 'info', shape: 'circle' }
		}

		return { label: raw ? prettyStatus(raw) : 'Pending…', tone: 'info', shape: 'circle' }
	}

	function prettyStatus(s) {
		return String(s)
			.replace(/_/g, ' ')
			.toLowerCase()
			.replace(/^\w/, c => c.toUpperCase())
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
      if (amount?.raw > 0) { amountFormatted = '+' + amountFormatted; c.classList.add('xfer-in') }
      else if (amount?.raw < 0) { c.classList.add('xfer-out') }
      c.textContent = amountFormatted
      

			;[a, b, c].forEach(el => { el.dataset.acct = accountId; el.classList.add('txread-xfer-cell') })

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
		

// Key normalisation lives in keynorm.js — shared with model.js so the per-account
// ✅/pie here and the header threshold there normalise keys identically (SIGN-NORM1).

export function renderSigningInfo({ data, accounts }) {
	// derive signed keys ONCE
	const signedPubkeys = (data.sigs || [])
		.map(s => s.pubKey)
		.filter(Boolean)
		.map(normalizePublicKey)
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


// ┌─┐┬─┐┌─┐┌─┐┬ ┬┌─┐┌─┐┬┌─  ┬┌┐┌┌─┐┌─┐
// ├─┘├┬┘├┤ │  ├─┤├┤ │  ├┴┐  ││││├┤ │ │
// ┴  ┴└─└─┘└─┘┴ ┴└─┘└─┘┴ ┴  ┴┘└┘└  └─┘
// precheck status — appended under signing readiness. 🟢 pass / 🟠 unknown or
// incomplete / 🔴 hard fail. Headline is short; the full breakdown (balance
// forecasts + every check line) lives in the hover tooltip.
export function renderPrecheckInfo({ precheck }) {
	const el = document.getElementById('txread-precheck')
	if (!el) return

	el.innerHTML = ''
	if (!precheck) return   // non-transfer tx, or not yet computed

	const fails = precheck.tests?.fail || []
	const warns = precheck.tests?.untested || []

	let emoji, headline
	if (precheck.status === 'fail') {
		emoji = '🔴'
		headline = 'Precheck: ' + shortenCheck(fails[0] || 'would not execute')
	} else if (precheck.complete === false) {
		emoji = '🟠'
		headline = 'Precheck incomplete'
	} else {
		emoji = '🟢'
		headline = 'Precheck OK'
	}

	const line = document.createElement('span')
	line.style.cursor = 'default'
	line.title = buildPrecheckTooltip(precheck)
	line.textContent = `${emoji} ${headline}`
	el.appendChild(line)

	if (warns.length) {
		const w = document.createElement('span')
		w.style.cursor = 'default'
		w.title = warns.join('\n')
		w.textContent = ` • ⚠️ ${warns.length}`
		el.appendChild(w)
	}
}

function shortenCheck(s) {
	// trim the trailing "(forecast)" detail and the leading emoji for the headline
	return String(s).replace(/^[⚠️\s]+/, '').replace(/\s*\(.*\)\s*$/, '').trim()
}

function tinybarToHbar(t) {
	const n = Number(t)
	if (!Number.isFinite(n)) return t
	return (n / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 }) + ' ℏ'
}

function buildPrecheckTooltip(precheck) {
	const lines = []

	const bal = precheck.balances || {}
	for (const account of Object.keys(bal)) {
		for (const asset of Object.keys(bal[account])) {
			const f = bal[account][asset]
			const forecast = asset === 'hbar' ? tinybarToHbar(f.forecast) : f.forecast
			lines.push(`${account} ${asset}: → ${forecast}`)
		}
	}

	const tests = precheck.tests || {}
	for (const t of tests.fail || [])     lines.push('✗ ' + t)
	for (const t of tests.untested || []) lines.push('? ' + t)
	for (const t of tests.pass || [])     lines.push('✓ ' + t)

	if (precheck.checkedAt)
		lines.push('checked ' + new Date(precheck.checkedAt).toLocaleTimeString())

	return lines.join('\n') || 'no details'
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
    // Feed kpie a normalized tree (leaf objects → pubkey strings) so its leaves match
    // the already-normalized signedPubkeys — otherwise every slice renders orange.
    const normTree = normalizeKeyTree(keyInfo)
    window.kpie.render(widget, { keyInfo: normTree, signedPubkeys: signedPubkeys || [] })
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
  keyTitle.textContent = '✍️ Required Approvals'
  container.appendChild(keyTitle)


  // header row (one-time)
  const header = document.createElement('div')
  header.className = 'acctkeys-header simple-mono-centre'

  const hAcct = document.createElement('div')
  hAcct.className = 'acctkeys-accountId'
  hAcct.textContent = 'Signing Authority'
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
      // Hedera system accounts (e.g. 0.0.802 fee/reward collector) have no account key
      // and never sign — they're only here as a party to the fee transfer. Skip the row
      // entirely rather than showing a scary "couldn't load keys" error. (KEYINFO-LOCAL1)
      if (acc.isSystemAccount || isHederaSystemAccount(accountId)) return

      console.warn('GH84743 Missing score data for', accountId, acc.keyInfo)
      // LOUD feedback — don't silently drop a must-sign account. Show a red row so the
      // user immediately knows the keys failed to load instead of waiting. Key structure
      // comes from the mirror node + local protobuf decode now (no kpos), so surface the
      // real error message rather than the old hardcoded "(kpos timeout)". (KEYINFO-LOCAL1)
      const errBlock = document.createElement('div')
      errBlock.className = 'acctkeys-account acctkeys-keyerror'
      errBlock.dataset.acct = accountId
      const reason = acc.keyInfoError ? ` (${acc.keyInfoError})` : ''
      errBlock.innerHTML =
        `<div class="acctkeys-accountId">` +
        `<a href='https://hashscan.io/${network}/account/${accountId}' target='${accountId}'>${accountId}</a></div>` +
        `<div class="acctkeys-keyerror-msg">⚠️ Couldn't load signing keys${reason} — tap to retry</div>`
      errBlock.style.cursor = 'pointer'
      errBlock.onclick = () => location.reload()
      container.appendChild(errBlock)
      return
    }

    const entries = Object.entries(scores)

    const block = document.createElement('div')
		block.className = 'acctkeys-account simple-mono-centre'
		block.dataset.acct = accountId
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
      const signed = signedPubkeys.includes(normalizePublicKey(pubkey))
      const tick = acc.mustSign ? (signed ? '✅' : '⬜') : 'N/A'
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
	row.textContent = `${signed ? '✅' : '⬜'}\u00A0${accountId}`
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

			.acctkeys-keyerror {
				display: flex; flex-direction: column; gap: 4px;
				padding: 10px 14px; margin: 6px 0;
				background: #fdecea; border: 1px solid #f5a6a0; border-radius: 6px;
			}
			.acctkeys-keyerror-msg { color: #b3261e; font-weight: 700; font-size: 14px; }

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

		/* ── v2 modal reflow: Intent → Sign → Status ──────────────────── */
		.txread-block { margin: 14px auto; max-width: min(900px, 100%); }
		.txread-intent .txread-xfers { max-width: 580px; margin: 0 auto; }
		.txread-scope {
			display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
			gap: 4px 8px; margin-top: 10px; font-size: 12px; color: #888;
		}
		.txread-scope-txid { word-break: break-all; }
		.txread-sep { color: #ccc; }
		.txread-memo { text-align: center; font-size: 12px; color: #888; margin-top: 10px; word-break: break-word; }
		.txread-memo-label { font-weight: 600; color: #777; }
		.txread-xfer-cell { transition: background .12s ease; }
		[data-acct].acct-hl { background: #eef0f3; }
		.acctkeys-account.acct-hl { background: #eef0f3; border-radius: 6px; }
		.txread-narrative.acct-hl { background: #eef0f3; }
		.txread-status { text-align: center; }
		.txread-status-main { font-weight: 600; font-size: 15px; }
		.txread-approvals-toggle {
			all: revert; cursor: pointer; width: 100%; margin: 12px 0 0;
			display: flex; align-items: center; justify-content: center; gap: 8px;
			border: none; background: transparent;
			padding: 12px; color: #666;
			font: 13px system-ui, -apple-system, "Segoe UI", sans-serif;
		}
		.txread-approvals-toggle:hover { background: #fafafa; }
		.txread-approvals-toggle .cap { display: inline-block; transition: transform .2s ease; }
		.txread-approvals-toggle[aria-expanded="true"] .cap { transform: rotate(90deg); }
		.txread-approvals {
			display: grid; grid-template-rows: 0fr;
			transition: grid-template-rows .28s ease;
		}
		.txread-approvals.open { grid-template-rows: 1fr; }
		.txread-approvals-inner { overflow: hidden; min-height: 0; }
		.txread-approvals .ksubtitle { display: none; }
		.acctkeys-header, .acctkeys-account { text-align: center; }

		/* intent: line items + optional narrative side by side */
		.txread-intent-row { display:flex; flex-wrap:wrap; gap:24px; justify-content:space-evenly; align-items:flex-start; }
		.txread-intent-row .txread-xfers { max-width:none; margin:0; }
		.txread-narrative {
			flex:0 1 220px; padding:2px 6px; text-align:left; border-radius:6px;
			font:13px system-ui,-apple-system,"Segoe UI",sans-serif; color:#444;
			transition:background .12s ease;
		}
		.txread-narrative h4 {
			margin:0 0 6px; font-size:13px; color:#444; font-weight:600;
			border-bottom:1px solid #ddd; padding-bottom:4px;
		}
		.txread-narrative .nrow { display:flex; justify-content:space-between; gap:12px; padding:2px 0; }
		.txread-narrative .nlabel { color:#888; }
		.txread-narrative .nout { color:#b00020; }
		.txread-narrative .nin { color:#198754; }
		@media (max-width:600px){
			/* full-width flex row, but cap the content so "send/receive" don't get
			   flung to the screen edges by space-between — line it up with the
			   transfer table above instead. */
			.txread-narrative{ flex-basis:100%; max-width:340px; margin:8px auto 0; }
		}

		/* green/red on the accounting amount column */
		.txread-xfers .xfer-in { color:#198754; }
		.txread-xfers .xfer-out { color:#b00020; }

		/* status tab pane */
		.txread-approvals-desc { margin:10px auto 8px; max-width:560px; }
		#account-keys .ksubtitle { display:none; }   /* Status tab + description replace this heading */


	`
	document.head.appendChild(style)
}