import {
		get,
		parseTxId,
		formatUtcTime,
		formatCountdown,
		isHederaSystemAccount
	} from './utils.js'
import { normalizePublicKey, normalizeKeyTree } from './keynorm.js'
import { getThresholdSummary } from './threshold.js'
import { flowTravel } from './txflow.js'

// Why an account must sign — one glyph map shared by the Signing Authority rows AND
// the account-card header so they never drift (TX-CARDS7 / TX-CARDS9).
const SIGN_REASON = {
	operator:              { emoji:'⚙️', tip:'​    Operator account' },
	sender:                { emoji:'📤', tip:'​    Sending assets' },
	receiver_sig_required: { emoji:'📥', tip:'​    Receiver signature required' }
}

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
		table: ({ network, flow, transfers }) => buildTransferList(network, (flow?.lineItems) || transfers?.lineItems || []),
		cards: ({ network, flow, transfers }) => buildCardsView({ network, flow, transfers })
	}

	// Resolution: ?txview= URL param (explicit dev override; 'nerd' stacks all views) →
	// otherwise mirror katomia's NERD MODE (localStorage katomia.nerd.v1 / body.nerd):
	// nerd ON = the old line-item 'table' (regular accounting view), nerd OFF = the new
	// 'cards' (T-account view, the normal default). Same flag the profile/header toggle flips.
	export function resolveTxView() {
		try { const u = new URLSearchParams(location.search).get('txview'); if (u) return u } catch {}
		let nerd = false
		try { nerd = document.body.classList.contains('nerd') || localStorage.getItem('katomia.nerd.v1') === '1' } catch {}
		return nerd ? 'table' : 'cards'
	}

	// Returns the transfer block element. For a single known view this is the bare view
	// element. 'nerd' (explicit ?txview=nerd) wraps every registered view side by side.
	export function buildTransferViews({ network, flow, transfers }) {
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

	// ┌─┐┌─┐┬─┐┌┬┐┌─┐  ┬  ┬┬┌─┐┬ ┬
	// │  ├─┤├┬┘ ││└─┐  └┐┌┘│├┤ │││
	// └─┘┴ ┴┴└──┴┘└─┘   └┘ ┴└─┘└┴┘
	// Cards view (TX-CARDS3). One thick row per account: a light account-header row
	// (id + optional xproof label) over two equal columns — LEFT = send (rose),
	// RIGHT = receive (green). Direction is conveyed by side+colour, so no edge
	// labels. Renders from flow.accounts (send/receive already split by sign).
	// Ghost (dashed/faded) chips on the receive side show where assets land.
	// Pre-consensus styling only; invert+move animation is TX-CARDS5, hover→destination
	// lines TX-CARDS4, identity glyph + operator marker TX-CARDS6.
	const _fmtAmt = n => { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 8 }) : String(n) }

	// pickAssetLabel — shared short-label rule. Mirrors the HEDERA:// → name fallback
	// that was duplicated in buildTransferList and katomia formatAssetDisplay, and adds
	// a length cap: a hedera:// URI symbol OR a symbol longer than the cap defers to the
	// (shorter) name. CSS still ellipsis-clips whatever survives. (TX-CARDS3 review)
	const ASSET_LABEL_MAX = 20
	export function pickAssetLabel(meta = {}) {
		const symbol = meta.symbol || ''
		const name = meta.name || ''
		const fallback = meta.raw || ''
		const looksUri = /^hedera:\/\//i.test(symbol)
		if ((looksUri || symbol.length > ASSET_LABEL_MAX) && name && name.length < (symbol.length || Infinity)) return name
		return symbol || name || fallback
	}

	function buildCardChip(network, item, side) {
		const m = item.assetMeta || {}
		const chip = document.createElement('div')
		chip.className = 'txcard-chip' + (side === 'receive' ? ' txcard-chip-ghost' : '')
		chip.dataset.side = side
		// NO data-acct on chips: the account cross-ref hover fires from the card HEADER
		// only. Chips get their own asset-pool hover keyed by data-asset-key — fungible
		// keyed by token (all HBAR/all KGBP link), NFT keyed by token+serial (#32 in↔out).
		const isNft = m.assetClass === 'NFT' || item.type === 'NFT'
		chip.dataset.assetKey = isNft ? `${m.raw ?? item.tokenId}#${m.serial ?? item.serial}` : (m.raw ?? item.asset ?? '')

		const isHbar = (m.raw === 'tinybar') || item.type === 'HBAR'
		let icon = '🪙'
		if (m.assetClass === 'LE') icon = '🖼️'
		else if (isNft) icon = '💎'

		const iconEl = document.createElement('span')
		iconEl.className = 'txcard-chip-icon'
		iconEl.textContent = icon

		const txt = document.createElement('span')
		txt.className = 'txcard-chip-text'
		const sym = isHbar ? 'HBAR' : pickAssetLabel(m)
		if (isNft) {
			const serial = m.serial ?? item.serial
			txt.textContent = serial != null ? `${sym} #${serial}` : sym
		} else {
			const amt = Math.abs(Number(item.amountFormatted ?? item.amount ?? 0))
			txt.textContent = `${_fmtAmt(amt)} ${sym}`
		}
		txt.title = txt.textContent   // full label on hover (chip is ellipsis-clipped)

		chip.append(iconEl, txt)
		return chip
	}

	// NOTE (scope): this whole account-card layout is designed for Hedera TRANSFER
	// transactions (crypto/token) — send/receive columns, per-account signing, operator
	// fee. It does NOT model other tx types (account update, token mint/burn, freeze,
	// contract calls…) which involve different keys/authority. Supporting those will need a
	// refactor into swappable per-tx-type components (the legacy "authority" column hinted
	// at this). Keep that intent — it's a near-future feature, not a never.
	function buildAccountCard(network, acc) {
		const card = document.createElement('div')
		card.className = 'txcard'

		// account-header row — light text: id + optional xproof label. (operator marker
		// + identity glyph deferred to TX-CARDS6; roles intentionally not shown — the
		// send/receive sides convey direction.) data-acct lives on the HEADER only, so the
		// account cross-ref hover triggers from here (not the chips) and CSS :has lifts the
		// whole card; it also links to this account's narrative + signing-authority row.
		const head = document.createElement('div')
		head.className = 'txcard-head'
		head.dataset.acct = acc.id

		const idLink = document.createElement('a')
		idLink.className = 'txcard-acct'
		idLink.href = `https://hashscan.io/${network}/account/${acc.id}`
		idLink.target = '_blank'
		idLink.rel = 'noopener'
		idLink.textContent = acc.id
		head.appendChild(idLink)

		// xproof label (domain/name) is added next to the account id by updateCardXproof
		// once signing accounts are enriched — always visible, no expand needed.

		// right-side header cluster: signing summary (added later by updateCardSigning)
		// then a chevron affordance. Tapping the header expands the account detail
		// (pie + keys + xproof) — custom chevron, not native <details> (TX-CARDS9 step c).
		head.classList.add('txcard-head--toggle')
		const right = document.createElement('div')
		right.className = 'txcard-head-right'
		const chevron = document.createElement('span')
		chevron.className = 'txcard-chevron'
		chevron.textContent = '▸'
		right.appendChild(chevron)
		head.appendChild(right)

		const cols = document.createElement('div')
		cols.className = 'txcard-cols'

		const mkCol = (name, items) => {
			const col = document.createElement('div')
			col.className = `txcard-col txcard-${name}`
			if (items.length) items.forEach(it => col.appendChild(buildCardChip(network, it, name)))
			else { const e = document.createElement('div'); e.className = 'txcard-empty'; e.textContent = '—'; col.appendChild(e) }
			return col
		}

		cols.append(mkCol('send', acc.send || []), mkCol('receive', acc.receive || []))

		// collapsible detail region — populated lazily on first open (TX-CARDS9 step c)
		const detail = document.createElement('div')
		detail.className = 'txcard-detail'
		const inner = document.createElement('div')
		inner.className = 'txcard-detail-inner'
		detail.appendChild(inner)

		card.append(head, cols, detail)
		return card
	}

	// Preview dispatcher: reduced-motion → the cheap v0 pulse; otherwise the v1 ghost-travel
	// engine (txflow.js — gather→merge→scatter).
	function previewFlow(container) {
		const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
		return reduce ? previewFlowPulse(container) : flowTravel(container)
	}

	// v0 asset-movement pulse (fallback): no geometry — for each asset, pulse its SEND chips
	// then its RECEIVE chips in sequence, asset-by-asset. The receive pulse briefly solidifies
	// the ghost chips ("landing").
	async function previewFlowPulse(container) {
		if (container._flowRunning) return
		container._flowRunning = true
		const keys = []
		container.querySelectorAll('.txcard-chip[data-asset-key]').forEach(c => {
			const k = c.dataset.assetKey
			if (k && !keys.includes(k)) keys.push(k)
		})
		const pulse = (els, cls, ms) => new Promise(res => {
			els.forEach(n => n.classList.add(cls))
			setTimeout(() => { els.forEach(n => n.classList.remove(cls)); res() }, ms)
		})
		for (const key of keys) {
			const sel = `.txcard-chip[data-asset-key="${CSS.escape(key)}"]`
			await pulse([...container.querySelectorAll(`.txcard-send ${sel}`)], 'txflow-pulse-out', 420)
			await pulse([...container.querySelectorAll(`.txcard-receive ${sel}`)], 'txflow-pulse-in', 420)
		}
		container._flowRunning = false
	}

	function buildCardsView({ network, flow, transfers }) {
		const accounts = flow?.accounts || []
		// no model accounts (e.g. enrich/shape issue) → fall back to the table, never blank
		if (!accounts.length) return buildTransferList(network, (flow?.lineItems) || transfers?.lineItems || [])

		const container = document.createElement('div')
		container.className = 'txcards'

		// ▶ preview control (TX-FLOW-ANIM1 v0): animate the asset movement. Not inside a
		// .txcard-head, so the card-expand click handler ignores it.
		const bar = document.createElement('div')
		bar.className = 'txcards-bar'
		const previewBtn = document.createElement('button')
		previewBtn.type = 'button'
		previewBtn.className = 'txcards-preview'
		previewBtn.textContent = '▶ preview'
		previewBtn.title = 'Preview the asset movement'
		previewBtn.addEventListener('click', () => previewFlow(container))
		bar.appendChild(previewBtn)
		container.appendChild(bar)

		accounts.forEach(acc => container.appendChild(buildAccountCard(network, acc)))

		// asset-pool hover: hovering a chip highlights every chip of the same asset across
		// all cards (the in/out pool) — distinct from the account hover on the header.
		let hlKey = null
		const clearAssetHl = () => {
			if (!hlKey) return
			container.querySelectorAll('.txcard-chip.asset-hl').forEach(n => n.classList.remove('asset-hl'))
			hlKey = null
		}
		container.addEventListener('mouseover', e => {
			const chip = e.target.closest('.txcard-chip')
			const key = chip?.dataset.assetKey || null
			if (key === hlKey) return
			clearAssetHl()
			if (key) {
				container.querySelectorAll(`.txcard-chip[data-asset-key="${CSS.escape(key)}"]`).forEach(n => n.classList.add('asset-hl'))
				hlKey = key
			}
		})
		container.addEventListener('mouseleave', clearAssetHl)

		// tap a card header (not the account link) to expand its detail. Multiple cards
		// may be open at once (comparing accounts is a real task here). Lazy render on open.
		container.addEventListener('click', e => {
			if (e.target.closest('a')) return
			const head = e.target.closest('.txcard-head')
			const card = head?.closest('.txcard')
			if (!card) return
			const open = card.classList.toggle('txcard--open')
			card.querySelector('.txcard-chevron').textContent = open ? '▾' : '▸'
			if (open) renderCardDetail(card)
		})
		return container
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

		// witnesses — signed keys tied to no account here; grouped just below the cards and
		// ABOVE the public memo. Rendered inline (label + chips) by renderWitnessList.
		const witnesses = document.createElement('div')
		witnesses.id = 'txread-witnesses'
		witnesses.className = 'txread-witnesses'
		witnesses.hidden = true
		intent.appendChild(witnesses)

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
		// strike time (valid-start — fixed, decoded from the txid) + valid duration. The
		// duration isn't in the current API, so it's stubbed at 120s (Hedera default) with a
		// note: PROTO1 (protobuf decode) will yield the real transactionValidDuration —
		// replace validSecs then. Countdown itself lives in the status block above.
		const strikeInfo = parseTxId(txid)
		if (strikeInfo?.seconds) {
			const validSecs = 120   // TODO PROTO1: real transactionValidDuration
			const due = document.createElement('span')
			due.className = 'txread-scope-due'
			due.textContent = `due ${new Date(strikeInfo.seconds * 1000).toLocaleString()} (valid ${Math.round(validSecs / 60)}m)`
			due.title = 'Transaction valid-start (strike time) and valid duration'
			scope.append(sep(), due)
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
		// Show overall status + countdown in the header (normal-visible), not only in the
		// nerd Status tab — "Waiting hh:mm:ss" belongs where users can see it (per user).
		// (buildStatusPane no longer mounts this; it lives here at the top of the intent.)
		statusBlock.el.classList.add('txread-status-header')
		intent.insertBefore(statusBlock.el, intent.firstChild)

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
	// A tx is FINAL (unchangeable) once it's resolved on-chain: SUCCESS, or any terminal
	// mirror/receipt status (EXPIRED, EXPIRED?, INVALID_SIGNATURE, other Hedera errors —
	// mirrorStatus is only present once consensus/expiry is reached). No explicit isFinal
	// flag in the payload yet, so we derive it (PROTO1 / backend could add one). We do NOT
	// treat a merely time-expired-but-not-yet-on-mirror tx as final — a late sig may still
	// land in the buffer window.
	const isFinalStatus = (data = {}) =>
		data.comboStatus === 'SUCCESS' || data.receiptSuccess === true || !!data.mirrorStatus

	// Hide the whole signing section once the tx is final — there's no action to take (the
	// record stays visible). KEPT in nerd mode as a debug affordance: wallets will still
	// sign an expired/consensus'd tx, and there may later be a "sign to endorse after the
	// fact" use case, so we don't remove the option — just hide it from normal users.
	export const updateFinalState = (data) => {
		const panel = document.getElementById('txread-methods')
		if (panel) panel.classList.toggle('tx-final', isFinalStatus(data))
	}

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
      let assetLabel = pickAssetLabel(asset)   // shared HEDERA:// → name + length-cap rule (TX-CARDS3)
      
      const tokenId = asset.raw
      const serial = asset.serial ?? ''
      // let assetUrl = `https://tools.gomint.me/explore/NFT/?productId=${network};${tokenId}-${serial}`
      let assetUrl = `https://hashscan.io/${network}/token/${tokenId}`
      if (serial) assetUrl += `/${serial}`
      //https://hashscan.io/mainnet/token/0.0.2111380/2
      
      let assetLinkLabel = (serial) ? `${tokenId}#${serial}` : `${tokenId}`
      let assetLink = `<a href='${assetUrl}' target='${assetLinkLabel}'>${assetLinkLabel}</a>`
      
      // (HEDERA:// → name now handled inside pickAssetLabel)

      let assetIcon=''
      let assetTooltip=''

      const pad='\u200B\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'
      if(asset.assetClass=='FT') assetIcon='🪙',assetTooltip=pad+'Fungible Token'
      if(asset.assetClass=='LE') assetIcon='🖼️',assetTooltip=pad+'Limited Edition'
      if(asset.assetClass=='NFT') assetIcon='💎',assetTooltip=pad+'NFT'

      assetLabel=`<span class='cursor-default' title='${assetTooltip}'>${assetIcon}</span> ${asset.assetClass=='NFT'?pickAssetLabel(asset):assetLabel} ${assetLink}`
   

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
	updateCardSigning(accounts, signedPubkeys, data.network)   // fold the same signing state onto the account cards (TX-CARDS7)
	// renderKeyPieCharts({ network, accounts, signedPubkeys })
}

// Per-account signing verdict for the card border/summary. Uses the SAME threshold
// solver as evaluateTxReadiness + the pie (SIGN-NORM1) so border/pie/table agree.
// state: none (no signature required) | loading (must sign, keyInfo not in yet) |
// pending (required, threshold not met) | ready (threshold met). need = threshold m.
function accountSigningStatus(acc, signedPubkeys) {
	if (!acc.mustSign) return { state:'none' }
	const keyTree = acc.keyInfo && normalizeKeyTree(acc.keyInfo)
	if (!keyTree) return { state:'loading' }
	const s = getThresholdSummary({ keyTree, signedPubkeys })
	return { state: s.thresholdSatisfied ? 'ready' : 'pending',
		signed: s.signedRequiredKeyCount, need: s.signedRequiredKeyCount + s.minMoreKeyCount }
}

// In-place repaint of the account cards' signing state (border colour + header
// summary: reason glyphs + m-of-n signed). Keyed by data-acct so an update never
// rebuilds the card DOM (TX-CARDS9 step a). No-ops in table/nerd mode (no .txcards).
export function updateCardSigning(accounts, signedPubkeys = [], network) {
	const cards = document.querySelector('.txcards')
	if (!cards) return
	Object.entries(accounts || {}).forEach(([id, acc]) => {
		const head = cards.querySelector(`.txcard-head[data-acct="${CSS.escape(id)}"]`)
		const card = head?.closest('.txcard')
		if (!card) return
		updateCardXproof(head, acc.label)
		const st = accountSigningStatus(acc, signedPubkeys)
		card.dataset.signState = st.state   // one axis of the aggregate ring (balance is the other)
		paintCardRing(card)

		ensureOperatorFeeChip(card, (acc.mustSignReason || []).includes('operator'))

		card._detail = { acc, signedPubkeys, network, id }   // for the lazy expand; refresh if already open
		if (card.classList.contains('txcard--open')) renderCardDetail(card)

		let sign = head.querySelector('.txcard-sign')
		if (st.state === 'none') { if (sign) sign.remove(); return }
		if (!sign) { sign = document.createElement('span'); sign.className = 'txcard-sign'; const right = head.querySelector('.txcard-head-right'); right.insertBefore(sign, right.firstChild) }
		// Only surface the NON-obvious reason: receiver_sig_required. Sending (📤) is
		// evident from the send column, and the operator (⚙️) is now shown by its HBAR
		// fee chip — so those glyphs are dropped from the header (per user).
		const glyphs = (acc.mustSignReason || []).includes('receiver_sig_required') ? SIGN_REASON.receiver_sig_required.emoji : ''
		if (st.state === 'loading') { sign.textContent = `${glyphs} …`.trim(); sign.title = 'Loading signing keys…' }
		// keep the ratio always; add a PLAIN tick (not the ✅ box — it read as a clickable
		// control) once the threshold is met. The green border already signals "go".
		else if (st.state === 'ready') { sign.textContent = `${glyphs} ✍️ ${st.signed}/${st.need} ✓`.trim(); sign.title = 'Threshold satisfied' }
		else { sign.textContent = `${glyphs} ✍️ ${st.signed}/${st.need}`.trim(); sign.title = `${st.signed} of ${st.need} required signatures` }
	})
}

// The operator pays the network fee in HBAR even when HBAR isn't part of the transfer.
// Show it as a distinct "HBAR fee" chip on the operator's SEND side — no amount yet
// (TODO: wire a fee estimate when the backend provides one; for now it's words). This also
// marks WHO the operator is (replacing the ⚙️ glyph). data-asset-key=tinybar so
// updateCardBalances red-rings it if the operator is short on HBAR for fees.
function ensureOperatorFeeChip(card, isOperator) {
	const sendCol = card.querySelector('.txcard-send')
	if (!sendCol) return
	let chip = sendCol.querySelector('.txcard-chip--fee')
	if (!isOperator) { chip?.remove(); return }
	if (chip) return
	sendCol.querySelector('.txcard-empty')?.remove()
	chip = document.createElement('div')
	chip.className = 'txcard-chip txcard-chip--fee'
	chip.dataset.side = 'send'
	chip.dataset.assetKey = 'tinybar'
	chip.title = 'Network fee — paid by the operator (estimated)'
	chip.innerHTML = `<span class="txcard-chip-icon">ℏ</span><span class="txcard-chip-text">HBAR fee</span>`
	sendCol.appendChild(chip)
}

// The card ring is the AGGREGATE account verdict (per user, TX-CARDS9 step d): a green
// ring reads as a full "go", so it's green only when signing is satisfied AND no asset
// is short. Balance shortfall is a hard blocker → red wins. Signing detail stays in the
// header; per-asset detail is the red chip ring. Two axes are stashed on the card
// (data-sign-state, data-balance-short) so either update path repaints consistently.
function paintCardRing(card) {
	const signState = card.dataset.signState || 'none'
	const short = card.dataset.balanceShort === '1'
	card.classList.remove('txcard--sign-ready','txcard--sign-pending','txcard--balance-short')
	if (short) card.classList.add('txcard--balance-short')
	else if (signState === 'ready') card.classList.add('txcard--sign-ready')
	else if (signState === 'pending' || signState === 'loading') card.classList.add('txcard--sign-pending')
}

// Per-asset balance cue on the account cards (TX-CARDS9 step d): ring a SEND chip red when
// that account is short of that asset (overdraft), and flag the account balance-short for
// the aggregate ring. Chip asset-key === precheck key (both the tokenId; HBAR is 'tinybar'
// on the chip → 'hbar' in the precheck). NFTs skipped. No-op without cards.
//
// Short is gathered from TWO sources so it's robust:
//   1. precheck.balances[acct][asset].forecast < 0  (structured, when present)
//   2. the authoritative precheck.tests.fail strings (these always reach the frontend — the
//      user sees them in nerd — and they fold in the HBAR fee-buffer that forecast<0 misses):
//        "has sender <acct> enough <tokenId> <label> ? (<forecast>)"
//        "has <acct> sufficient hbar balance ? (<forecast> tℏ)"
//   (association failures — "…associated…" — are a different problem, not an overdraft; not
//    ringed here. Could add a distinct cue later.)
// Emits a `cards:balances` kdiag line so a "no red ring" report is diagnosable from evidence.
export function updateCardBalances(precheck) {
	const cards = document.querySelector('.txcards')
	if (!cards) return

	const short = {}   // accountId -> Set(short asset keys)
	const add = (acct, key) => { (short[acct] ||= new Set()).add(key) }
	for (const [acct, assets] of Object.entries(precheck?.balances || {}))
		for (const [asset, f] of Object.entries(assets || {}))
			if (f && Number(f.forecast) < 0) add(acct, asset)
	for (const line of precheck?.tests?.fail || []) {
		let m
		if ((m = /has sender (\S+) enough (\S+)/.exec(line))) add(m[1], m[2])
		else if ((m = /has (\S+) sufficient hbar balance/.exec(line))) add(m[1], 'hbar')
	}

	const diag = { hasPrecheck: !!precheck, balanceKeys: Object.keys(precheck?.balances || {}), fails: (precheck?.tests?.fail || []).length, cards: [] }
	cards.querySelectorAll('.txcard').forEach(card => {
		const id = card.querySelector('.txcard-head[data-acct]')?.dataset.acct
		const shortAssets = short[id] || new Set()
		card.dataset.balanceShort = shortAssets.size ? '1' : '0'
		const chipKeys = []
		card.querySelectorAll('.txcard-send .txcard-chip').forEach(chip => {
			const key = chip.dataset.assetKey === 'tinybar' ? 'hbar' : chip.dataset.assetKey
			chipKeys.push(key)
			chip.classList.toggle('txcard-chip--short', shortAssets.has(key))
		})
		paintCardRing(card)
		diag.cards.push({ id, short: [...shortAssets], chipKeys })
	})
	try { globalThis.kdiag?.('cards:balances', diag) } catch {}
}

// Lazily-rendered account detail for the expanded card (TX-CARDS9 step c): the threshold
// pie + the per-key table (signed / suffix / Banzhaf / redundancy / control) + the xproof
// label. Mirrors the Signing Authority row content, co-located on the account's own card.
function buildAccountDetail(acc, signedPubkeys = [], network, accountId) {
	const wrap = document.createElement('div')

	// The one non-obvious reason for signing — spell it out so nobody wonders why a
	// receiving account needs to sign (receiver_sig_required is set on the account key).
	if ((acc.mustSignReason || []).includes('receiver_sig_required')) {
		const note = document.createElement('div')
		note.className = 'txcard-detail-note'
		note.textContent = 'Receiver signature required: this account must sign even though it is receiving.'
		wrap.appendChild(note)
	}
	// Make "no signature needed" explicit (it's implied by the thin grey border). Keep the
	// keys/pie visible anyway — useful reference. NB: not phrased as "receiver-sig not
	// required" since receivers sometimes DO sign (see the receiver note above).
	else if (!acc.mustSign) {
		const note = document.createElement('div')
		note.className = 'txcard-detail-note txcard-detail-note--muted'
		note.textContent = 'No signature required from this account (shown for reference).'
		wrap.appendChild(note)
	}

	wrap.appendChild(buildThresholdWidget({ signedPubkeys, mustSign: acc.mustSign, keyInfo: acc.keyInfo }))

	const scores = acc.keyInfo?.banzhafScores?.scores
	const redundancy = acc.keyInfo?.banzhafScores?.redundancy
	const buckets = acc.keyInfo?.keyControlScoresAll
	if (scores) {
		const grid = document.createElement('div')
		grid.className = 'txcard-keys'
		const head = document.createElement('div')
		head.className = 'txcard-keys-row txcard-keys-head'
		;['✍️', '🔑', '⚖️', 'Redund', 'Ctrl'].forEach(t => { const c = document.createElement('div'); c.textContent = t; head.appendChild(c) })
		grid.appendChild(head)
		Object.entries(scores).forEach(([pubkey, score]) => {
			const signed = signedPubkeys.includes(normalizePublicKey(pubkey))
			const red = redundancy?.[pubkey] != null ? Math.round(redundancy[pubkey] * 100) + '%' : '-'
			const bucket = buckets?.[pubkey]?.bucket ?? '-'
			const row = document.createElement('div')
			row.className = 'txcard-keys-row'
			const tick = document.createElement('div'); tick.textContent = acc.mustSign ? (signed ? '☑' : '☐') : '–'   // plain ballot box (not the control-like ✅/⬜)
			// key suffix links to the account's keys (hashscan account page for now — a
			// per-key lookup could later point at explore.hbar.live?network=&key=). Clicking
			// it won't collapse the card: the header toggle ignores <a> targets.
			const keyCell = document.createElement('div')
			const keyLink = document.createElement('a')
			keyLink.textContent = '…' + pubkey.slice(-4)
			keyLink.title = pubkey
			keyLink.href = (network && accountId) ? `https://hashscan.io/${network}/account/${accountId}` : '#'
			keyLink.target = '_blank'; keyLink.rel = 'noopener'
			keyCell.appendChild(keyLink)
			const banz = document.createElement('div'); banz.textContent = Math.round(score * 100) + '%'
			const redC = document.createElement('div'); redC.textContent = red
			const ctrl = document.createElement('div'); ctrl.textContent = bucket
			row.append(tick, keyCell, banz, redC, ctrl)
			grid.appendChild(row)
		})
		wrap.appendChild(grid)
	}

	// (xproof label now lives in the card header via updateCardXproof, not here)
	return wrap
}

// xproof label (domain / name) shown INLINE next to the account id in the card header —
// always visible, no expand needed (per user). The domain reuses the .txcard-acct class so
// it matches the account-id styling (plain text, underline on hover) and can be
// group-restyled with it. Populated from the enriched signing account's label {domain,name}.
function updateCardXproof(head, label) {
	let x = head.querySelector('.txcard-xproof-head')
	if (!label || (!label.domain && !label.name)) { x?.remove(); return }
	if (!x) { x = document.createElement('span'); x.className = 'txcard-xproof-head'; head.querySelector('.txcard-acct').after(x) }
	x.innerHTML = ''
	if (label.domain) {
		const a = document.createElement('a')
		a.className = 'txcard-acct txcard-acct-domain'
		a.href = `https://${label.domain}`; a.target = '_blank'; a.rel = 'noopener'
		a.textContent = label.domain
		x.appendChild(a)
	}
	if (label.name) {
		const n = document.createElement('span')
		n.className = 'txcard-acct-label'
		n.textContent = label.name
		x.appendChild(n)
	}
}

// Mark cards whose account you've connected via WalletConnect with a "(u)" after the id —
// a light "this is you" cue. The full you-send/you-receive narrative is deferred (too many
// edge cases). Multiple connected accounts → multiple (u), which is correct. It's a pure
// self-assertion (no proof needed — the user connected it). Re-applied after card rebuilds.
export function markConnectedAccounts(ids = []) {
	const set = new Set(ids)
	document.querySelectorAll('.txcard-head[data-acct]').forEach(head => {
		const on = set.has(head.dataset.acct)
		let u = head.querySelector('.txcard-you')
		if (on && !u) {
			u = document.createElement('span')
			u.className = 'txcard-you'
			u.textContent = '(you)'
			u.title = 'One of your connected accounts'
			head.querySelector('.txcard-acct').after(u)
		} else if (!on && u) u.remove()
	})
}

// (Re)render an open card's detail from the data stashed on it by updateCardSigning.
function renderCardDetail(card) {
	const inner = card.querySelector('.txcard-detail-inner')
	const d = card._detail
	if (!inner || !d) return
	inner.innerHTML = ''
	inner.appendChild(buildAccountDetail(d.acc, d.signedPubkeys, d.network, d.id))
}



// Witnesses = signed keys that belong to NO account in this tx (outside every required
// set), so they can't sit on an account card — list them on their own, above the network
// line. Chips = last-4 + full-key tooltip; later they may double as votes. TODO: link a
// chip to a key lookup (e.g. explore.hbar.live?network=&key=) once such a route exists.
export function renderWitnessList(readiness) {
	const el = document.getElementById('txread-witnesses')
	if (!el) return
	const keys = readiness?.witnessKeys || []
	el.innerHTML = ''
	el.hidden = !keys.length
	if (!keys.length) return
	const lbl = document.createElement('div')
	lbl.className = 'txread-witnesses-label'
	lbl.textContent = 'Witnesses'
	const list = document.createElement('div')
	list.className = 'txread-witnesses-list'
	keys.forEach(k => {
		const chip = document.createElement('span')
		chip.className = 'txwitness-chip'
		chip.textContent = '…' + String(k).slice(-4)
		chip.title = k
		list.appendChild(chip)
	})
	el.append(lbl, list)
}

export function renderReadinessInfo({readiness}) {
	renderWitnessList(readiness)   // witnesses live below the cards, not in the status block

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
	updateCardBalances(precheck)   // per-asset chip rings + aggregate card ring (runs even if the status line is gone)

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
      const tick = acc.mustSign ? (signed ? '☑' : '☐') : 'N/A'
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
		/* cards sit BESIDE the You-send/receive narrative on desktop (don't self-centre,
		   grow to fill the spare width); they wrap to full width on narrow screens. Once
		   the narrative's symbol is short (pickAssetLabel) it's narrow enough to fit. */
		.txread-intent-row .txcards { max-width:none; margin:0; flex:1 1 380px; }
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

		/* ── cards view (TX-CARDS3) ──────────────────────────────────────────── */
		.txcards { display:flex; flex-direction:column; gap:10px; max-width:640px; margin:0 auto; position:relative; }
		.txcard {
			display:flex; flex-direction:column;
			border:1px solid #e4e4e7; border-radius:10px; overflow:hidden;
			background:#fff;
			transition:border-color .18s ease, box-shadow .18s ease;
		}
		/* account-header row — light text (id + optional xproof label) */
		.txcard-head {
			display:flex; flex-wrap:wrap; align-items:baseline; gap:8px;
			padding:7px 12px; background:#fafafa; border-bottom:1px solid #ececec;
		}
		.txcard-acct { font-size:13px; font-weight:500; color:#52525b; text-decoration:none; word-break:break-all; }
		.txcard-acct:hover { text-decoration:underline; }
		.txcard-acct-label { font-size:12px; color:#a1a1aa; }
		/* xproof next to the account id — domain reuses .txcard-acct so it matches (plain
		   text, underline on hover) and can be group-restyled with the account id later. */
		.txcard-xproof-head { display:inline-flex; align-items:baseline; gap:6px; }
		.txcard-you { font-size:12px; font-weight:600; color:#0891b2; }   /* "(you)" — a connected account of yours */

		/* per-account signing state (TX-CARDS7): border matches the pie — orange = signature
		   pending, green = threshold met; header summary shows reason glyphs + m-of-n signed */
		.txcard--sign-pending   { border-color:#f5a623; box-shadow:0 0 0 1px #f5a623; }
		.txcard--sign-ready     { border-color:#56c857; box-shadow:0 0 0 1px #56c857; }
		.txcard--balance-short  { border-color:#e5484d; box-shadow:0 0 0 1px #e5484d; }   /* overdraft — hard blocker, wins the ring */
		.txcard-head-right { margin-left:auto; display:flex; align-items:center; gap:8px; }
		.txcard-sign { font-size:12px; color:#71717a; white-space:nowrap; font-weight:500; }
		/* per-asset overdraft: red ring on the specific SEND chip that's short */
		.txcard-chip--short { border-color:#e5484d; box-shadow:0 0 0 1px #e5484d; }
		/* operator fee chip: no amount, distinct dotted/italic so it reads as an estimate */
		.txcard-chip--fee { border-style:dotted; font-style:italic; color:#71717a; }

		/* expandable account detail (TX-CARDS9 step c) — grid-rows trick, no native arrow */
		.txcard-head--toggle { cursor:pointer; user-select:none; }
		.txcard-chevron { color:#a1a1aa; font-size:11px; transition:transform .2s ease; }
		.txcard-detail { display:grid; grid-template-rows:0fr; transition:grid-template-rows .22s ease; }
		.txcard--open .txcard-detail { grid-template-rows:1fr; }
		.txcard-detail-inner { overflow:hidden; min-height:0; }
		.txcard--open .txcard-detail-inner { padding:10px 12px; border-top:1px solid #ececec; }
		/* pie sits on its own line ABOVE the key list (it encapsulates all the keys); the
		   list is compact + left-aligned — fixed columns (no 1fr) so it doesn't spread out
		   with a big gap on wide desktop cards. */
		.txcard-detail .acctkeys-piechart { display:block; margin:0 auto 8px; }
		.txcard-keys { display:flex; flex-direction:column; gap:3px; font-size:12px; margin-top:8px; }
		.txcard-keys-row { display:grid; grid-template-columns:22px 74px 48px 60px 56px; gap:10px; align-items:center; }
		.txcard-keys-head { color:#a1a1aa; font-size:11px; }
		.txcard-keys-row a { color:#3b82f6; text-decoration:none; }
		.txcard-keys-row a:hover { text-decoration:underline; }
		.txcard-xproof { margin-top:8px; font-size:12px; color:#71717a; }
		.txcard-xproof a { color:#3b82f6; }
		.txcard-detail-note { font-size:12px; color:#3f3f46; background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; padding:6px 8px; margin-bottom:8px; }
		.txcard-detail-note--muted { background:#f4f4f5; border-color:#e4e4e7; color:#71717a; }

		/* witnesses — signed keys not tied to any account; listed under the cards as chips
		   (may later read as votes). Sits just above the Hedera <network> scope line. */
		.txread-witnesses { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:8px; font-size:12px; }
		.txread-witnesses-label { color:#a1a1aa; text-transform:uppercase; letter-spacing:.04em; font-size:11px; }
		.txread-witnesses-list { display:inline-flex; flex-wrap:wrap; gap:6px; }
		.txwitness-chip { display:inline-flex; padding:3px 9px; border-radius:14px; font-size:12px; background:#f4f4f5; border:1px solid #e4e4e7; color:#52525b; cursor:default; }

		/* overall status + countdown at the top of the modal (normal-visible header) */
		.txread-status-header { font-weight:600; font-size:14px; margin:0 0 8px; }
		.txread-scope-due { color:#71717a; }

		/* two equal, symmetric columns — left send (rose), right receive (green).
		   stays side-by-side on mobile (screen split in half), no edge labels */
		.txcard-cols { display:grid; grid-template-columns:1fr 1fr; }
		.txcard-col { padding:10px 12px; display:flex; flex-direction:column; gap:6px; align-items:flex-start; min-width:0; }
		.txcard-send    { background:#fdf2f2; }   /* warm rose — giving */
		.txcard-receive { background:#eff7f1; }   /* green — receiving */

		.txcard-chip {
			display:inline-flex; align-items:center; gap:6px;
			padding:4px 9px; border-radius:14px; font-size:13px; line-height:1.3;
			background:#fff; border:1px solid rgba(0,0,0,.14);
			max-width:100%; box-sizing:border-box;
			position:relative; z-index:2;   /* above the trail overlay (z-index:1) so dots pass behind chips */
		}
		.txcard-chip-icon { flex:0 0 auto; }
		.txcard-chip-text { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
		.txcard-chip-ghost {
			/* dashed + muted, but OPAQUE (solid bg + full opacity) so the dotted trail behind it
			   is cleanly obscured — the chip sits on top of the trail (per user). */
			background:#fff; border-style:dashed; opacity:1; color:#9ca3af;
		}
		.txcard-empty { opacity:.35; font-size:13px; }

		/* account hover/select (fires from the HEADER via data-acct): darken the header
		   ONLY. The card BORDER is reserved for signing/balance status — selecting must not
		   overwrite it (per user), so no border/box-shadow change here. */
		.txcard-head.acct-hl { background:#e4e4e7; }

		/* asset-pool hover (fires from a chip): highlight every chip of the same asset.
		   a highlighted ghost de-fades so you can see where it lands. */
		.txcard-chip.asset-hl { outline:2px solid #ffb74d; outline-offset:1px; }
		.txcard-chip-ghost.asset-hl { opacity:1; }

		/* ▶ preview control + v0 pulse (TX-FLOW-ANIM1): send chips pulse out (amber), then
		   receive chips pulse in (green, de-fading the ghost = "landing"). */
		.txcards-bar { display:flex; justify-content:flex-end; }
		.txcards-preview { all:revert; cursor:pointer; border:1px solid #e4e4e7; background:#fff; border-radius:14px; padding:3px 10px; font:500 12px system-ui,-apple-system,"Segoe UI",sans-serif; color:#52525b; }
		.txcards-preview:hover { background:#f4f4f5; }
		.txflow-pulse-out { animation: txflowPulseOut .42s ease; }
		.txflow-pulse-in  { animation: txflowPulseIn  .42s ease; }
		@keyframes txflowPulseOut { 50% { outline:2px solid #f5a623; outline-offset:2px; transform:translateY(-3px) scale(1.06); } }
		@keyframes txflowPulseIn  { 50% { outline:2px solid #56c857; outline-offset:2px; opacity:1; transform:scale(1.08); } }
		@media (prefers-reduced-motion: reduce) {
			.txflow-pulse-out { animation:none; outline:2px solid #f5a623; outline-offset:2px; }
			.txflow-pulse-in  { animation:none; outline:2px solid #56c857; outline-offset:2px; opacity:1; }
		}
		/* v1 ghost-travel engine (txflow.js): a FRONT overlay (ghosts + pool puff, topmost) and
		   a TRAIL overlay (the dotted trajectory) — both above the cards; trail below ghosts. */
		.txflow-layer { position:absolute; inset:0; overflow:visible; pointer-events:none; z-index:3; }
		.txflow-layer-trail { position:absolute; inset:0; overflow:visible; pointer-events:none; z-index:1; }
		.txflow-ghost { position:absolute; left:0; top:0; margin:0; background:#fff; box-shadow:0 5px 14px rgba(0,0,0,.18); will-change:transform,opacity; }
		.txflow-frizz { position:absolute; width:16px; height:16px; border-radius:50%; pointer-events:none;
			background:radial-gradient(circle, #fff 0%, #ffd27f 45%, rgba(255,167,38,0) 70%); }
		.txflow-trail { position:absolute; width:7px; height:7px; border-radius:50%; pointer-events:none; filter:blur(0.3px);
			background:radial-gradient(circle, rgba(96,165,250,.55) 0%, rgba(96,165,250,0) 70%); }
		.txcard-chip.txflow-landed { opacity:1; outline:2px solid #56c857; outline-offset:2px; }

		/* nerd-view toggle — top-right of the widget, out of the way of the modal close/toast.
		   dev affordance to flip cards (normal) ↔ line-item table (nerd) without the profile panel. */
		.txread-wrapper { position:relative; }
		.txread-nerd-toggle {
			position:absolute; top:0; right:0; z-index:5;
			display:inline-flex; align-items:center; gap:4px;
			font-size:12px; color:#9ca3af; cursor:pointer; user-select:none;
			background:rgba(255,255,255,.85); padding:1px 5px; border-radius:6px;
		}
		.txread-nerd-toggle input { cursor:pointer; margin:0; }


	`
	document.head.appendChild(style)
}