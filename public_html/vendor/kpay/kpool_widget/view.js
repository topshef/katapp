import {
		get,
		parseTxId,
		formatUtcTime,
		formatCountdown,
		isHederaSystemAccount
	} from './utils.js'
import { normalizePublicKey, normalizeKeyTree } from './keynorm.js'
import { getThresholdSummary } from './threshold.js'
import { flowTravel, setFlowState, revertFlow, flowAssetOnce, fadeHoverTrail } from './txflow.js'

// Why an account must sign — one glyph map shared by the Signing Authority rows AND
// the account-card header so they never drift (TX-CARDS7 / TX-CARDS9).
const SIGN_REASON = {
	operator:              { emoji:'⚙️', tip:'​    Operator account' },
	sender:                { emoji:'📤', tip:'​    Sending assets' },
	receiver_sig_required: { emoji:'📥', tip:'​    Receiver signature required' }
}

	// VALIDWINDOW1: the signing window in words. Never round a sub-minute window up to
	// a minute — "1m" for a 40-second window is the whole bug in miniature, and someone
	// deciding whether they have time to fetch a second signer needs the real number.
	const formatValidFor = secs => {
		const s = Math.max(0, Math.round(Number(secs) || 0))
		if (s < 60) return `${s}s`
		const m = Math.floor(s / 60), rem = s % 60
		return rem ? `${m}m ${rem}s` : `${m}m`
	}

	// validSecs: the tx's REAL valid duration, decoded from the signed bytes
	// (VALIDD1, data.validDurationSeconds). 180 stays as the fallback when the
	// bytes aren't available — the old hardcoded assumption, now only a default.
	const deriveStatusFromTime = (txid, updatedAtMs, validSecs = 180) => {
		const info = parseTxId(txid)
		if (!info) return 'Unknown'

		const nowSec = Math.floor(Date.now() / 1000)
		const scheduledSec = info.seconds
		const diff = scheduledSec - nowSec

		// still in future
		if (diff > 0) return 'Waiting'

		// within the valid window after scheduled time
		if (diff > -validSecs) return 'Ready to submit..'

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
		statusEl.hidden = true   // the status LABEL is shown in the modal header (kpm-head); the content
		container.appendChild(statusEl)   // line shows ONLY the countdown (simplified, per user). FUTURE: fold
		// the countdown into the modal header too (awaiting-approvals + timer) and drop this line entirely.

		let timingEl = null

		const render = currentData => {

			if (currentData.receiptSuccess === true)
				currentData.comboStatus = 'SUCCESS'

			let derivedStatus =
				currentData.comboStatus ||
				currentData.mirrorStatus ||
				currentData.receiptStatus

			if (!derivedStatus)
				derivedStatus = deriveStatusFromTime(currentData.txid, currentData.updatedAt, currentData.validDurationSeconds || 180)
			
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
				timingEl = buildTimingBlock(data.network, data.txid, data.validDurationSeconds || 180)
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

	// PROTO1/SECURITY: verdict line for the bytes-vs-display check (model.js
	// verifyTransfersAgainstBytes). Mismatch = loud red banner, ALWAYS shown — the
	// user must not trust what's rendered. Everything else (match tick, unavailable,
	// error) is NERD-ONLY (user 2026-07-06: "it's a given that we're verifying — we
	// don't need a dev note like that on a normal view"). Visibility is CSS-driven
	// off body.nerd (injectTxReadCSS) so the nerd toggle applies live, no re-render.
	function buildBytesVerifyNote(bytesVerify) {
		if (!bytesVerify) return null
		const el = document.createElement('div')
		el.className = 'txread-bytes-verify'
		el.dataset.status = bytesVerify.status

		if (bytesVerify.status === 'mismatch') {
			el.innerHTML =
				`<strong>⚠️ WARNING — the transfers shown do NOT match the transaction bytes being signed.</strong>` +
				`<br>Do not sign. ` +
				`<span class="subtle">bytes-only: ${bytesVerify.missingFromDisplay.length}, display-only: ${bytesVerify.extraInDisplay.length} — details in diagnostics (tx:bytes-verify).</span>`
			return el
		}
		// SIGN-BYTESNOTE1: plainer wording, no nested brackets, and this note now sits at
		// the BOTTOM near the line items (see make() below) rather than crowding the top.
		if (bytesVerify.status === 'match') {
			el.textContent = `✔ Checked — the ${bytesVerify.counts.bytes} transfers shown here match the actual transaction you are signing, so what you see is what you approve.`
			return el
		}
		// unavailable / error — informational (nerd-only)
		el.textContent = `Transfer check ${bytesVerify.status}${bytesVerify.reason ? ' — ' + bytesVerify.reason : ''} (couldn't compare the shown transfers to the signed bytes).`
		return el
	}

	// Returns the transfer block element. For a single known view this is the bare view
	// element. 'nerd' (explicit ?txview=nerd) wraps every registered view side by side.
	// STATUS-TAB-RETIRE1: the main block is ALWAYS cards now — nerd mode no longer swaps
	// it for the line-item table (that moved to the bottom nerd panel); ?txview= remains
	// as an explicit dev override.
	export function buildTransferViews({ network, flow, transfers }) {
		let urlView = null
		try { urlView = new URLSearchParams(location.search).get('txview') } catch {}
		const mode = urlView || 'cards'
		const make = name => {
			const el = (TX_VIEWS[name] || TX_VIEWS.table)({ network, flow, transfers })
			const note = buildBytesVerifyNote(transfers?.bytesVerify)
			if (!note) return el
			const wrap = document.createElement('div')
			// The wrapper takes the view's place as the flex item of .txread-intent-row,
			// so it must carry the cards' flex sizing — without this .txcards shrinks to
			// content width (the "narrow account cards" regression, 2026-07-06).
			if (el.classList?.contains('txcards')) wrap.style.flex = '1 1 380px'
			// SIGN-BYTESNOTE1: a MISMATCH is a danger — keep it ABOVE the transfers, loud.
			// The reassuring "✔ Checked" (and unavailable) note is nerd-only reference, so
			// it goes at the BOTTOM, under the line items, as a quiet footnote.
			if (transfers?.bytesVerify?.status === 'mismatch') { note.classList.add('txread-bytes-verify--top'); wrap.append(note, el) }
			else { note.classList.add('txread-bytes-verify--foot'); wrap.append(el, note) }
			return wrap
		}

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
		// send/receive sides convey direction.) data-acct lives on the HEADER only and keys
		// the card updates (updateCardXproof / signing summary). The account cross-ref hover
		// highlight that used to fire from it was removed (TX-CARDS-HOVER1).
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

		// Fee-payer cue in NORMAL mode (feedback 3c28f05d, 2026-07-06): knowing who pays
		// the Hedera fee is more than nerd detail — badge the operator's header with its
		// own tooltip. The dotted "HBAR fee" chip on its send side still shows the fee
		// itself; the expanded detail spells it out in a sentence.
		if ((acc.roles || []).includes('operator')) {
			const payer = document.createElement('span')
			payer.className = 'txcard-payer'
			payer.textContent = '⬡'   // neutral shape (per user — nothing payment-branded)
			payer.title = 'Fee payer — this account pays the Hedera network fee for this transaction'
			head.appendChild(payer)
		}

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

	// Preview dispatcher: reduced-motion → the cheap v0 pulse then snap to the settled state;
	// otherwise the v1 ghost-travel engine, which plays AND sticks at 'after'.
	function previewFlow(container) {
		const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
		return reduce ? previewFlowPulse(container).then(() => setFlowState(container, true)) : flowTravel(container)
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

		// PREVIEW as a full-width before/after card — same shape as an account card, split into a
		// pink BEFORE (send side) and green AFTER (receive side). It doubles as (a) a legend for
		// what left/right mean on the account cards and (b) the animation toggle: tap AFTER →
		// play + stick at the settled state; tap BEFORE → revert. EXPLORATORY (kicking tyres) — a
		// bold way to make left/right obvious; may well revert to a small compact preview button.
		// data-state drives the highlight and is kept in sync by setFlowState(). (TX-FLOW-ANIM1)
		const preview = document.createElement('div')
		preview.className = 'txcards-preview'
		preview.dataset.state = 'before'
		const beforeHalf = document.createElement('button')
		beforeHalf.type = 'button'
		beforeHalf.className = 'txpreview-half txpreview-before'
		beforeHalf.textContent = 'BEFORE'
		const afterHalf = document.createElement('button')
		afterHalf.type = 'button'
		afterHalf.className = 'txpreview-half txpreview-after'
		afterHalf.textContent = 'AFTER'
		beforeHalf.addEventListener('click', () => {
			if (!container._flowRunning && preview.dataset.state === 'after') revertFlow(container)
		})
		afterHalf.addEventListener('click', async () => {
			// always (re)play — redraws the trajectory lines even when already in 'after' (e.g.
			// after expanding a card wiped them).
			if (!container._flowRunning) { preview.dataset.state = 'after'; await previewFlow(container) }
		})
		preview.append(beforeHalf, afterHalf)
		container.appendChild(preview)

		accounts.forEach(acc => container.appendChild(buildAccountCard(network, acc)))

		// asset-pool hover: hovering a chip highlights every chip of the same asset across
		// all cards (the in/out pool) — distinct from the account hover on the header.
		// TX-FLOW-HOVER1: dwelling on a chip also replays the movement glide for THAT asset
		// only (ephemeral — no state flip, no persistent trail). Armed on a short timer so a
		// casual mouse-pass across the cards doesn't fire animations.
		let hlKey = null, hoverFlowTimer = 0
		const clearAssetHl = () => {
			clearTimeout(hoverFlowTimer)
			if (!hlKey) return
			fadeHoverTrail(container, hlKey)   // hover over → its replay trail fades away
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
				hoverFlowTimer = setTimeout(() => flowAssetOnce(container, key), 150)
			}
		})
		container.addEventListener('mouseleave', clearAssetHl)

		// SIGNSCROLL1 (feedback 7aed40c0, 2026-09-05): "when the user expands a card, allow
		// the full card to scroll into view cleanly." A card near the bottom of the modal
		// grows downwards into space the viewport doesn't have, so the detail you just asked
		// for opens off-screen. Waits out the 220ms grid-template-rows transition rather than
		// measuring mid-animation, and never scrolls the card's HEAD above the top edge —
		// losing the account id you just tapped is worse than not seeing the last row.
		function revealCard(card) {
			const scroller = card.closest('.kpm-body') || card.closest('[data-kpsign-scroll]')
			if (!scroller) return
			setTimeout(() => {
				const sRect = scroller.getBoundingClientRect()
				const cRect = card.getBoundingClientRect()
				const overflow = Math.max(0, cRect.bottom - sRect.bottom + 12)
				const toTop = Math.max(0, cRect.top - sRect.top - 8)
				const delta = Math.min(overflow, toTop)
				if (delta < 8) return
				scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' })
			}, 260)
		}

		// tap a card header (not the account link) to expand its detail. Multiple cards
		// may be open at once (comparing accounts is a real task here). Lazy render on open.
		container.addEventListener('click', e => {
			if (e.target.closest('a')) return
			const head = e.target.closest('.txcard-head')
			const card = head?.closest('.txcard')
			if (!card) return
			const open = card.classList.toggle('txcard--open')
			card.querySelector('.txcard-chevron').textContent = open ? '▾' : '▸'
			if (open) { renderCardDetail(card); revealCard(card) }
			// expanding/collapsing reflows the cards, so the drawn trajectory lines no longer line
			// up — wipe them. Re-click AFTER to redraw. (per user)
			container.querySelector('.txflow-layer-trail')?.replaceChildren()
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

		// (STATUS-TAB-RETIRE1: the you-send/receive narrative moved into the bottom nerd
		// panel — see the .txread-nerd-panel block near the end of this builder.)

		// ── DOM ORDER (per user, top→bottom): status (countdown, inserted at intent top later)
		// → scope (network·txid·pch + due) → memo → cards (+preview) → witnesses → signing.

		// scope line: Hedera <network> · <txid> · #<pch6> on one row; the due date on the same
		// line on desktop, wrapping to its own line on mobile (flex-wrap).
		const scope = document.createElement('div')
		scope.className = 'txread-scope'
		const ids = document.createElement('div')
		ids.className = 'txread-scope-ids'
		const net = document.createElement('span')
		net.className = 'txread-scope-net'
		net.textContent = `Hedera ${network}`
		const txLink = document.createElement('a')
		txLink.className = 'txread-scope-txid'
		txLink.href = `https://hashscan.io/${network}/transaction/${txid}`
		txLink.target = '_blank'
		txLink.rel = 'noopener'
		txLink.textContent = txid
		ids.append(net, sep(), txLink)
		if (pch && pch !== 'no_pch') {
			const pchEl = document.createElement('span')
			pchEl.className = 'txread-scope-pch'
			pchEl.textContent = `#${String(pch).slice(0, 6)}`
			ids.append(sep(), pchEl)
		}
		scope.appendChild(ids)
		// strike time (valid-start — fixed, from the txid) + valid duration. Wordy, locale-neutral
		// date (en-GB "2 Jul 2026") so British/American reading is unambiguous.
		//
		// VALIDWINDOW1 (mainnet 2026-09-05): this line used to read `const validSecs = 120`
		// — a stub, with a TODO on it, printed to the operator as fact. Mainnet
		// 0.0.3833789@1788645137 was valid for FORTY seconds; the modal told its operator
		// "valid 2m" and stayed green well past the point where the transaction could still
		// be submitted, so the second signature of a 2-of-3 arrived a second after the
		// window shut and read afterwards as a backend stall. txRead now sends the number
		// decoded from the signed bytes (data.validDurationSeconds) — use it, and say
		// nothing about the window when it isn't known rather than inventing a generous one.
		// SETTLEDLINE1 (feedback f5ce7942, 2026-09-05): "when a transaction has succeeded it
		// shouldn't say due-by date and then valid duration — swap that for the consensus
		// time that was achieved." A deadline is only information while it can still be
		// missed; once the network has agreed a time, the deadline is noise and the agreed
		// time is the fact. Keyed on the mirror's consensus_timestamp rather than on the
		// status, so it says "settled" exactly when there IS a settled moment to name —
		// a transaction that expired unsubmitted has none, and for that one the window it
		// missed is still the story worth telling.
		const consensusSec = Number(String(data.mirror?.transactions?.[0]?.consensus_timestamp || '').split('.')[0]) || null
		const strikeInfo = parseTxId(txid)
		const stamp = secs => {
			const d = new Date(secs * 1000)
			return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, `
				+ d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
		}
		if (consensusSec) {
			const due = document.createElement('div')
			due.className = 'txread-scope-due'
			due.textContent = `settled ${stamp(consensusSec)}`
			due.title = 'Consensus timestamp — when the Hedera network agreed this transaction'
			scope.appendChild(due)
		} else if (strikeInfo?.seconds) {
			const validSecs = Number(data.validDurationSeconds) || null
			const due = document.createElement('div')
			due.className = 'txread-scope-due'
			due.textContent = `due ${stamp(strikeInfo.seconds)}${validSecs ? ` · valid ${formatValidFor(validSecs)}` : ''}`
			due.title = 'Transaction valid-start (strike time) and valid duration'
			scope.appendChild(due)
		}
		intent.appendChild(scope)

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

		// cards (+ preview bar at their top), then witnesses below them
		intent.appendChild(intentRow)

		const witnesses = document.createElement('div')
		witnesses.id = 'txread-witnesses'
		witnesses.className = 'txread-witnesses'
		witnesses.hidden = true
		intent.appendChild(witnesses)

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

		// ── 4. NERD PANEL (STATUS-TAB-RETIRE1, user 2026-07-07): nerd mode ADDS this
		// collapsible section at the bottom instead of replacing the cards — the legacy
		// line-item table + the you-send/receive narrative, plus room for future debug
		// output. Visibility is CSS-gated on body.nerd; expand animation matches the
		// account cards (grid-template-rows 0fr→1fr).
		const nerdPanel = document.createElement('div')
		nerdPanel.className = 'txread-nerd-panel'
		const nerdHead = document.createElement('div')
		nerdHead.className = 'txread-nerd-head'
		nerdHead.innerHTML = `<span>🤓 Line items</span><span class="txread-nerd-caret">▸</span>`
		nerdHead.onclick = () => nerdPanel.classList.toggle('txread-nerd-panel--open')
		const nerdDetail = document.createElement('div')
		nerdDetail.className = 'txread-nerd-detail'
		const nerdInner = document.createElement('div')
		nerdInner.className = 'txread-nerd-inner'
		nerdInner.appendChild(buildTransferList(network, (flow?.lineItems) || transfers?.lineItems || []))
		// You send / You receive narrative — populated by index.js updateNarrative once a
		// wallet account is known (nerd-only); keeps its #txread-narrative id.
		const narrative = document.createElement('div')
		narrative.id = 'txread-narrative'
		narrative.className = 'txread-narrative'
		narrative.hidden = true
		nerdInner.appendChild(narrative)
		nerdDetail.appendChild(nerdInner)
		nerdPanel.append(nerdHead, nerdDetail)
		wrapper.appendChild(nerdPanel)

		// STATUS-TAB-RETIRE1: readinessEl/precheckEl/accountKeysEl are still CREATED (the
		// render-by-id functions null-guard, and renderPrecheckInfo must keep running for
		// the chip rings) but no longer PLACED anywhere — the Status tab that displayed
		// them is retired. Delete these + renderAccountKeyInfo in the next cleanup pass.
		const statusBlock = buildStatusBlock({ data })
		statusBlock.el.classList.add('txread-status-main')
		// The content status line is GONE (per user): the status LABEL lives in the modal header
		// (kpm-head) and the COUNTDOWN now lives there too (⏱, index.js startHeaderCountdown →
		// modal.setCountdown). statusBlock is still built for its .update() side effects
		// (handleTxUpdate/refreshPolledTx call it — it writes the SUCCESS localStorage flag), but
		// it's no longer inserted into the modal body, so there's no duplicate time/countdown and
		// no layout jolt when the status flips to Success.

		const readinessEl = document.createElement('div')
		readinessEl.id = 'txread-readiness'
		readinessEl.className = 'txread-timing'

		const precheckEl = document.createElement('div')
		precheckEl.id = 'txread-precheck'
		precheckEl.className = 'txread-timing'

		const accountKeysEl = document.createElement('div')
		accountKeysEl.id = 'account-keys'

		// (TX-CARDS-HOVER1: the account cross-ref hover cross-highlight that lived here
		// is gone — data-acct tags remain for keyed card updates, not hover.)

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
	// validSecs: real valid duration from the signed bytes (VALIDD1); 180 = legacy fallback
	export const buildTimingBlock = (network, txid, validSecs = 180) => {
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

			if (diff <= -validSecs) {
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

// TX-CARDS-WCPREVIEW1: for the WC account-picker — given the account the user has
// SELECTED to sign with, say what signing it would do for THIS transaction. Uses the
// same threshold solver as the cards/pie so the verdict agrees. Returns { state, text }:
//   not-needed  — the account isn't a required signer here (witness / receiver only)
//   already     — it has already met its signing requirement
//   completes   — signing it now would complete the WHOLE tx's threshold (last one)
//   needed      — required, but other accounts still need to sign too
//   loading     — key info not in yet (no banner)
export function computeSignerPreview({ data, accounts, accountId }) {
	if (!data || !accounts || !accountId) return { state: 'loading', text: '' }
	const signedPubkeys = (data.sigs || []).map(s => s.pubKey).filter(Boolean).map(normalizePublicKey).filter(Boolean)
	const list = Object.values(accounts)
	// accounts is keyed BY account id — the acc objects don't carry an accountId field
	const acc = accounts[accountId] || list.find(a => a.label === accountId)
	if (!acc || !acc.mustSign) return { state: 'not-needed', text: document.body.classList.contains('nerd')
		? "Signing with this account isn't required to execute this transaction. But optionally you may sign as witness to prove you agree with it. Proof registration may depend on game settings (eg whether witness signatures are included in submission to Hedera)."
		: "This account isn't required to sign this transaction." }
	const st = accountSigningStatus(acc, signedPubkeys)
	if (st.state === 'loading') return { state: 'loading', text: '' }
	if (st.state === 'ready') return { state: 'already', text: 'This account has already met its signing requirement here.' }
	// required and not yet met — is it the LAST one? (all OTHER required accounts ready)
	const othersOutstanding = list.some(a =>
		a !== acc && a.mustSign && accountSigningStatus(a, signedPubkeys).state === 'pending')
	return othersOutstanding
		? { state: 'needed', text: "This account's signature is required for this transaction." }
		: { state: 'completes', text: 'Signing with this account will complete the transaction' }
}

// In-place repaint of the account cards' signing state (border colour + header
// summary: reason glyphs + m-of-n signed). Keyed by data-acct so an update never
// rebuilds the card DOM (TX-CARDS9 step a). No-ops in table/nerd mode (no .txcards).
export function updateCardSigning(accounts, signedPubkeys = [], network) {
	const cards = document.querySelector('.txcards')
	if (!cards) return
	// HIP-1259: once a tx has consensus, the ACTUAL fee appears as a real transfer to
	// the fee collection account (0.0.802) with its own card — the synthetic estimated
	// "HBAR fee" chip would then duplicate it, so it's suppressed (user 2026-07-07).
	// The check is against the RENDERED CARDS, not the accounts data: on a LIVE success
	// the poll adds 802 to the data but no card is built mid-session — suppressing then
	// yanked the chip out from under the success animation (jolt + trajectory lines out
	// of step, user 2026-07-07). The chip only gives way when the 802 card is actually
	// on screen to replace it, i.e. after a reload of the settled tx.
	const realFeePresent = ['0.0.802', '0.0.98', '0.0.800', '0.0.801']
		.some(id => cards.querySelector(`.txcard-head[data-acct="${id}"]`))
	Object.entries(accounts || {}).forEach(([id, acc]) => {
		const head = cards.querySelector(`.txcard-head[data-acct="${CSS.escape(id)}"]`)
		const card = head?.closest('.txcard')
		if (!card) return
		updateCardXproof(head, acc.label)
		// SIGN-ASSETASSOC1: expose auto-association capacity (mirror account info) for the
		// balance pass + detail wording; '' when info hasn't enriched yet (treated as unknown).
		if (acc.info) card.dataset.maxAutoAssoc = String(acc.info.max_automatic_token_associations ?? '')
		const st = accountSigningStatus(acc, signedPubkeys)
		card.dataset.signState = st.state   // one axis of the aggregate ring (balance is the other)
		paintCardRing(card)

		ensureOperatorFeeChip(card, (acc.mustSignReason || []).includes('operator') && !realFeePresent)

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

	const short = {}     // accountId -> Set(asset) : insufficient BALANCE (send side, solid red)
	const unassoc = {}   // accountId -> Set(asset) : token NOT ASSOCIATED (receive side, dashed red)
	const add = (map, acct, key) => { (map[acct] ||= new Set()).add(key) }
	for (const [acct, assets] of Object.entries(precheck?.balances || {}))
		for (const [asset, f] of Object.entries(assets || {}))
			if (f && Number(f.forecast) < 0) add(short, acct, asset)
	// authoritative fail strings: balance ("… enough …" / "… sufficient hbar …") vs association
	// ("… associated …"). Association is a DIFFERENT class of fault from a shortfall — it's the
	// receiving account's responsibility. SIGN-ASSETASSOC1: solid vs dashed now branches on the
	// account's max_automatic_token_associations (stashed on the card by updateCardSigning):
	// 0 = no auto-assoc slots, definite fail → SOLID red; >0 or -1 (unlimited, HIP-904) → the
	// transfer may still land via a free slot → DASHED red. Used-slot counting (mirror /tokens
	// automatic_association flags) is a future refinement — optimistic meanwhile.
	for (const line of precheck?.tests?.fail || []) {
		let m
		if ((m = /has sender (\S+) enough (\S+)/.exec(line))) add(short, m[1], m[2])
		else if ((m = /has (\S+) sufficient hbar balance/.exec(line))) add(short, m[1], 'hbar')
		else if ((m = /has (?:sender|receiver) (\S+) associated (\S+)/.exec(line))) add(unassoc, m[1], m[2])
	}

	const key = chip => chip.dataset.assetKey === 'tinybar' ? 'hbar' : chip.dataset.assetKey
	const diag = { hasPrecheck: !!precheck, balanceKeys: Object.keys(precheck?.balances || {}), fails: (precheck?.tests?.fail || []).length, cards: [] }
	cards.querySelectorAll('.txcard').forEach(card => {
		const id = card.querySelector('.txcard-head[data-acct]')?.dataset.acct
		const shortAssets = short[id] || new Set()
		const unassocAssets = unassoc[id] || new Set()
		card.dataset.balanceShort = (shortAssets.size || unassocAssets.size) ? '1' : '0'   // either blocks → red ring
		card.querySelectorAll('.txcard-send .txcard-chip').forEach(chip =>
			chip.classList.toggle('txcard-chip--short', shortAssets.has(key(chip))))
		const assocHard = card.dataset.maxAutoAssoc === '0'   // no auto-assoc slots → definite fail
		card.querySelectorAll('.txcard-receive .txcard-chip').forEach(chip => {
			const is = unassocAssets.has(key(chip))
			chip.classList.toggle('txcard-chip--unassoc', is && !assocHard)
			chip.classList.toggle('txcard-chip--unassoc-hard', is && assocHard)
		})
		paintCardRing(card)
		// SIGN-EXPLAIN1: stash the issue sets for the expanded detail's plain-words list,
		// and refresh an already-open detail so the lines track live precheck updates.
		card._balanceIssues = { short: [...shortAssets], unassoc: [...unassocAssets] }
		if (card.classList.contains('txcard--open')) renderCardDetail(card)
		diag.cards.push({ id, short: [...shortAssets], unassoc: [...unassocAssets] })
	})
	try { globalThis.kdiag?.('cards:balances', diag) } catch {}
}

// Lazily-rendered account detail for the expanded card (TX-CARDS9 step c): the threshold
// pie + the per-key table (signed / suffix / Banzhaf / redundancy / control) + the xproof
// label. Mirrors the Signing Authority row content, co-located on the account's own card.
function buildAccountDetail(acc, signedPubkeys = [], network, accountId, card) {
	const wrap = document.createElement('div')

	// TX-CARDS-XPROOFLINK1: the xproof domain/name (moved out of the tappable card header)
	// with its clickable verification link + a one-line explainer, shown here in the detail.
	if (acc.label && (acc.label.domain || acc.label.name)) {
		const xp = document.createElement('div')
		xp.className = 'txcard-detail-xproof'
		const parts = []
		if (acc.label.name) parts.push(`<span class="txcard-acct-label">${acc.label.name}</span>`)
		if (acc.label.domain) parts.push(`<a href="https://${acc.label.domain}" target="_blank" rel="noopener">${acc.label.domain} ↗</a>`)
		// the xproof explainer only applies to actual xproof domain claims — well-known
		// system accounts (0.0.802 fee collection etc., xproof.js WELL_KNOWN_ACCOUNTS)
		// carry a hard-coded name with domain:null and are NOT xproof identities
		xp.innerHTML = parts.join(' · ') + (acc.label.domain
			? `<div class="txcard-detail-note txcard-detail-note--muted">Domain identity claimed for this account (xproof). Open the link to verify who published it.</div>`
			: '')
		wrap.appendChild(xp)
	}

	// SIGN-EXPLAIN1 (+ standard bullets, user 2026-07-07): ONE unified message list —
	// ⚠️ = a problem blocking this account, ℹ️ = plain information (operator fee-payer,
	// receiver-sig-required, no-sig-needed reference). Warnings float to the top; every
	// line keeps the same muted style — no per-type CSS, the bullet carries the class.
	// Asset names come off the chips so wording matches what the user sees (precheck
	// keys 'hbar' ↔ chip 'tinybar'). Fee estimate (amount) is TX-CARDS-FEEEST1.
	{
		const labelFor = k => {
			const sel = `.txcard-chip[data-asset-key="${CSS.escape(k === 'hbar' ? 'tinybar' : k)}"] .txcard-chip-text`
			return card?.querySelector(sel)?.textContent?.trim() || (k === 'hbar' ? 'HBAR' : `token ${k}`)
		}
		const items = []
		const st = accountSigningStatus(acc, signedPubkeys)
		// signatures pending are the NORMAL flow of this modal, not a fault — bullet is the
		// header's signing glyph (visually ties summary ✍️ 0/1 to this line), but it keeps
		// warn strength/position because it's still the thing to act on (user 2026-07-07).
		if (st.state === 'pending' && st.need)
			items.push({ warn: true, bullet: '✍️', text: `${st.need - st.signed} more signature${st.need - st.signed === 1 ? '' : 's'} needed (${st.signed} of ${st.need} signed).` })
		for (const a of card?._balanceIssues?.short || [])
			items.push({ warn: true, text: `Not enough ${labelFor(a)} — the balance won't cover what this account sends.` })
		// SIGN-ASSETASSOC1: association wording branches on the account's auto-association
		// capacity (mirror max_automatic_token_associations, stashed on the card by
		// updateCardSigning): 0 slots = the transfer WILL fail (solid red chip); otherwise
		// it may land via a free slot (dashed chip). Counting USED auto slots (mirror
		// /tokens automatic_association flags) is a future refinement — optimistic for now.
		const maxAuto = card?.dataset.maxAutoAssoc
		// association is about the ASSET, not an amount — name only, token id in brackets
		// ("KUSD (token 0.0.2341021)"); falls back to the bare token id pre-enrichment.
		const assocLabel = k => {
			const sym = labelFor(k).replace(/^[\d.,\s]+/, '').trim()
			return sym && sym !== `token ${k}` ? `${sym} (token ${k})` : `token ${k}`
		}
		for (const a of card?._balanceIssues?.unassoc || [])
			items.push({ warn: true, text: maxAuto === '0'
				? `${assocLabel(a)} is not associated with this account and it has no auto-association slots — this transfer will fail until the account associates the token.`
				: `${assocLabel(a)} is not associated with this account — it may still land if a free auto-association slot picks it up.` })

		// info lines (previously standalone notes above the list — folded in so ordering
		// is uniform: warnings first, information below)
		if ((acc.mustSignReason || []).includes('operator'))
			items.push({ warn: false, text: 'This account is the operator: it pays the Hedera network fee for this transaction.' })
		// receiver_sig_required is the one non-obvious reason for signing; when the account
		// doesn't sign at all, say so (implied by the thin grey border, but make it explicit).
		if ((acc.mustSignReason || []).includes('receiver_sig_required'))
			items.push({ warn: false, text: 'Receiver signature required: this account must sign even though it is receiving.' })
		else if (!acc.mustSign) {
			// SIGN-NOSIGREASON1: say WHY no signature is needed. An account that only
			// RECEIVES doesn't sign unless its key has receiver_sig_required set — which
			// this one doesn't. Normal mode phrases it plainly; nerd names the flag.
			const nerd = document.body.classList.contains('nerd')
			items.push({ warn: false, text: nerd
				? 'No signature required — this account only receives here and its key does not set receiver_sig_required.'
				: "No signature required — this account is only receiving, and it hasn't asked to approve incoming transfers." })
		}

		if (items.length) {
			const list = document.createElement('div')
			list.className = 'txcard-detail-issues'
			items.sort((a, b) => (b.warn ? 1 : 0) - (a.warn ? 1 : 0))   // stable sort: warnings first
			// class-based so warning presentation can evolve without touching this code:
			// warnings render full-strength (same color as the account id in the header),
			// information stays muted (user 2026-07-07).
			items.forEach(i => {
				const li = document.createElement('div')
				li.className = 'txcard-issue ' + (i.warn ? 'txcard-issue--warn' : 'txcard-issue--info')
				li.textContent = `${i.bullet || (i.warn ? '⚠️' : 'ℹ️')} ${i.text}`
				list.appendChild(li)
			})
			wrap.appendChild(list)
		}
	}

	// pie + key list as two centred flex cells that reflow (side-by-side on desktop, stacked on
	// mobile) — chart first, keys second (see .txcard-detail-grid).
	const layout = document.createElement('div')
	layout.className = 'txcard-detail-grid'
	layout.appendChild(buildThresholdWidget({ signedPubkeys, mustSign: acc.mustSign, keyInfo: acc.keyInfo }))

	const scores = acc.keyInfo?.banzhafScores?.scores
	const redundancy = acc.keyInfo?.banzhafScores?.redundancy
	const buckets = acc.keyInfo?.keyControlScoresAll
	// key list gated with the pie (SHOW_AUTHORITY_WHEN_NOT_SIGNING): both or neither
	if (scores && (acc.mustSign || SHOW_AUTHORITY_WHEN_NOT_SIGNING)) {
		const grid = document.createElement('div')
		grid.className = 'txcard-keys'
		const head = document.createElement('div')
		head.className = 'txcard-keys-row txcard-keys-head'
		// tooltips carry the old Status-tab explainer (STATUS-TAB-RETIRE1): Banzhaf =
		// voting power, redundancy = how replaceable a key is.
		;[
			['✍️',     'Signed yet? ☑ = this key has signed'],
			['🔑',     'Key — the last 4 characters of the public key'],
			['⚖️',     "Banzhaf — this key's voting power: its share of all the ways the signing threshold can be met"],
			['Redund', 'Redundancy — how replaceable the key is: how often the threshold could still be met without it'],
			['Ctrl',   'Control — full-exclusive: this key alone can decide; shared: control is split across keys']
		].forEach(([t, tip]) => { const c = document.createElement('div'); c.textContent = t; c.title = tip; head.appendChild(c) })
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
		// reference-only account (no signature needed): soften the key table like the
		// neutral pie — one opacity layer, content untouched (user 2026-07-07).
		if (!acc.mustSign) grid.classList.add('txcard-detail--refonly')
		layout.appendChild(grid)
	}
	wrap.appendChild(layout)

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
	// TX-CARDS-XPROOFLINK1: header xproof is PLAIN TEXT — a hyperlink here intercepted the
	// tap meant to expand the card. The clickable domain link now lives in the expanded
	// detail (buildAccountDetail → xproof row). Header just shows the domain/name.
	if (label.domain) {
		const d = document.createElement('span')
		d.className = 'txcard-acct txcard-acct-domain'
		d.textContent = label.domain
		x.appendChild(d)
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
	inner.appendChild(buildAccountDetail(d.acc, d.signedPubkeys, d.network, d.id, card))
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

// Play the movement animation on the cards when a tx reaches consensus (called before the
// confetti); sticks at the settled state (sources left as ghosts). No-op in table/nerd mode.
export function playSuccessFlow() {
	const c = document.querySelector('.txcards')
	return c ? flowTravel(c) : Promise.resolve()
}

// Opening a tx that already reached consensus: PLAY the flow once so the trajectory lines get
// drawn (running the animation IS how the before→after connections are rendered) — it sticks at
// 'after' with the lines left in place. Deferred a couple of frames so the cards have laid out.
// CONSIDER (future, not now): also drawing these lines BEFORE consensus would show where assets
// are heading — but it may clutter, so we're holding off.
export function markSettledIfSuccess(data) {
	const c = document.querySelector('.txcards')
	if (!c || !(data?.comboStatus === 'SUCCESS' || data?.receiptSuccess === true)) return
	requestAnimationFrame(() => requestAnimationFrame(() => { flowTravel(c) }))
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


// KPIE-SCALE1: shape stats for the key tree — nested threshold GROUPS (each renders a
// pie), nesting depth, and the widest single generation (the width driver of the
// family-tree layout). Plain keys in a group don't add pies, so only threshold-objects
// count.
function keyTreeStats(node, depth = 0) {
  if (!node || typeof node !== 'object' || !node.threshold) return { groups: 0, depth, rows: [] }
  let groups = 1, maxDepth = depth
  const rows = []
  rows[depth] = (rows[depth] || 0) + 1
  for (const k of node.keys || []) {
    if (k && typeof k === 'object' && k.threshold) {
      const s = keyTreeStats(k, depth + 1)
      groups += s.groups
      maxDepth = Math.max(maxDepth, s.depth)
      s.rows.forEach((n, i) => { rows[i] = (rows[i] || 0) + n })
    }
  }
  return { groups, depth: maxDepth, rows, maxRow: Math.max(...rows.filter(Boolean), 1) }
}

// SIGN-EXPLAIN1 follow-up (per user 2026-07-03): render the signing-authority detail
// (pie chart + key list — always BOTH or NEITHER, half the picture is worse than none)
// even for accounts that don't need to sign. Hard-coded ON for now — it's useful
// information and makes multisig layouts testable with any account. May later be turned
// off or gated behind nerd mode; flip it here.
const SHOW_AUTHORITY_WHEN_NOT_SIGNING = true

function buildThresholdWidget({ signedPubkeys, mustSign, keyInfo }) {
  const widget = document.createElement('div')
  if (!mustSign && !SHOW_AUTHORITY_WHEN_NOT_SIGNING) return widget
  widget.className = 'acctkeys-piechart'

  if (window.kpie && keyInfo) {
    // Feed kpie a normalized tree (leaf objects → pubkey strings) so its leaves match
    // the already-normalized signedPubkeys — otherwise every slice renders orange.
    const normTree = normalizeKeyTree(keyInfo)
    // KPIE-SCALE1: budget the WIDTH by the widest generation of the family-tree layout
    // (kpie owns the height — it hugs the generations). Wide councils (30 children) get
    // up to the full detail width; the 560 cap plus max-width:100% keeps it sane.
    // Numbers are a first heuristic, tune on sight.
    const stats = keyTreeStats(normTree)
    if (stats.groups > 1) {
      const px = Math.min(640, Math.max(160, 40 * stats.maxRow + 40))
      widget.style.width = px + 'px'
      widget.style.maxWidth = '100%'
      widget.style.height = 'auto'
    }
    // neutral: account is shown for reference only (no signature needed) — the pie keeps
    // the key structure but drops green/orange signing colors for two-tone gray, so an
    // unsigned-but-irrelevant account doesn't read as "pending" (user 2026-07-07).
    window.kpie.render(widget, { keyInfo: normTree, signedPubkeys: signedPubkeys || [], neutral: !mustSign })
      .catch(err => console.warn('[kpie] render failed', err))
  }

  return widget
}


// STATUS-TAB-RETIRE1: ORPHANED — this big approvals table only ever rendered into the
// retired Status tab's #account-keys element (now never attached, so the guard below
// returns immediately). The per-card detail (buildAccountDetail) carries the same info
// with tooltips. Delete in the next cleanup pass together with the call site at
// renderSigningSection and index.js buildStatusPane/INFO_SVG.
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
			display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline;
			gap: 2px 10px; margin: 4px 0 12px; font-size: 12px; color: #888;   /* bottom gap so it isn't butted against the preview card */
		}
		/* SCOPEWRAP1 (feedback 13830975, 2026-09-05): "the info at the top of this modal
		   sometimes wraps; if it wraps it should wrap and CENTRE rather than wrap onto the
		   left." The outer .txread-scope centres its children, but this inner flex row had
		   no justify-content of its own, so it defaulted to flex-start — the first line
		   looked centred (it filled the row) and every wrapped line jumped to the left
		   edge. Centre the inner row too, and centre the text inside it so a long txid
		   breaking mid-string stays centred rather than ragging left. */
		.txread-scope-ids { display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: 4px 8px; text-align: center; }
		.txread-scope-txid { word-break: break-all; }
		.txread-sep { color: #ccc; }
		.txread-memo { text-align: center; font-size: 12px; color: #888; margin: 10px 0 12px; word-break: break-word; }   /* bottom gap like the scope line, so it isn't butted against the card */
		.txread-memo-label { font-weight: 600; color: #777; }
		.txread-xfer-cell { transition: background .12s ease; }
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

		/* PROTO1 bytes-vs-display verdict (buildBytesVerifyNote). Only the mismatch
		   warning is for everyone; match/unavailable/error are nerd-mode detail —
		   in normal mode the bytes ARE the display's provenance, nothing to announce. */
		.txread-bytes-verify[data-status="mismatch"] { color:#b00020; background:#fde7ea; border:1px solid #f3b5c0; border-radius:8px; padding:8px 10px; margin:6px 0; font-size:13px; }
		.txread-bytes-verify[data-status="match"] { color:#2e7d32; font-size:11px; margin:4px 0; line-height:1.35; }
		.txread-bytes-verify[data-status="unavailable"], .txread-bytes-verify[data-status="error"] { color:#999; font-size:11px; margin:4px 0; }
		/* SIGN-BYTESNOTE1: footnote placement — a little top separation from the line items */
		.txread-bytes-verify--foot { margin-top:8px; padding-top:6px; border-top:1px solid #f0f0f0; }
		.txread-bytes-verify:not([data-status="mismatch"]) { display:none; }
		body.nerd .txread-bytes-verify:not([data-status="mismatch"]) { display:block; }

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
		/* gap 10→18 + breathing top/bottom (user 2026-08-05): the status GLOW
		   protrudes ~12px past the border — cards need room so halos don't clip
		   or collide */
		.txcards { display:flex; flex-direction:column; gap:18px; max-width:640px; margin:0 auto; padding:8px 0; position:relative; }
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
		/* fee-payer badge on the operator's header (feedback 3c28f05d) — neutral shape,
		   same gray family as the id text */
		.txcard-payer { font-size:12px; margin-left:4px; cursor:default; line-height:1; color:#a1a1aa; }
		.txcard-acct-label { font-size:12px; color:#a1a1aa; }
		/* xproof next to the account id — domain reuses .txcard-acct so it matches (plain
		   text, underline on hover) and can be group-restyled with the account id later. */
		.txcard-xproof-head { display:inline-flex; align-items:baseline; gap:6px; }
		.txcard-you { font-size:12px; font-weight:600; color:#0891b2; }   /* "(you)" — a connected account of yours */

		/* per-account signing state (TX-CARDS7): border matches the pie — orange = signature
		   pending, green = threshold met; header summary shows reason glyphs + m-of-n signed.
		   R2 (user 2026-08-05, borrowed from proposal mode's signing glow): the line keeps
		   its weight but gains a soft coloured GLOW — a border that glows reads as live
		   status that can change, not a fixed style. */
		.txcard--sign-pending   { border-color:#f5a623; box-shadow:0 0 0 1px #f5a623, 0 0 12px 2px rgba(245,166,35,.45); }
		.txcard--sign-ready     { border-color:#56c857; box-shadow:0 0 0 1px #56c857, 0 0 12px 2px rgba(86,200,87,.45); }
		.txcard--balance-short  { border-color:#e5484d; box-shadow:0 0 0 1px #e5484d, 0 0 12px 2px rgba(229,72,77,.5); }   /* overdraft — hard blocker, wins the ring */
		.txcard-head-right { margin-left:auto; display:flex; align-items:center; gap:8px; }
		.txcard-sign { font-size:12px; color:#71717a; white-space:nowrap; font-weight:500; }
		/* per-asset overdraft: solid red ring on the specific SEND chip that's short */
		.txcard-chip--short { border-color:#e5484d; box-shadow:0 0 0 1px #e5484d; }
		/* token NOT associated on the RECEIVING side: dashed red (uncertain — a receiver with an
		   auto-association slot would still succeed). Different fault class from a balance shortfall. */
		.txcard-chip--unassoc { border-color:#e5484d; border-style:dashed; box-shadow:0 0 0 1px #e5484d; }
		/* SIGN-ASSETASSOC1: receiver has NO auto-association slots — failure is definite, ring solid.
		   Compound selector so it outranks the later .txcard-chip-ghost dashed border (receive
		   chips are ghosts by design). */
		.txcard-chip--unassoc-hard, .txcard-chip-ghost.txcard-chip--unassoc-hard { border-color:#e5484d; border-style:solid; box-shadow:0 0 0 1px #e5484d; }
		/* operator fee chip: no amount, distinct dotted/italic so it reads as an estimate */
		.txcard-chip--fee { border-style:dotted; font-style:italic; color:#71717a; }

		/* expandable account detail (TX-CARDS9 step c) — grid-rows trick, no native arrow */
		.txcard-head--toggle { cursor:pointer; user-select:none; transition:background .15s ease; }
		/* HEADHOVER1 (feedback 705f3951, 2026-09-05): "on hover, card headers slightly
		   highlight to indicate that it's clickable." The chevron was the only affordance and
		   it is small; the cursor change only arrives once you are already on it. A wash on
		   the whole row says the row is the target, which it is. Hover only — :active would
		   flash on touch, where there is no hover and no ambiguity to resolve. Same grey the
		   wallet tabs use, so the two clickable rows in this modal behave alike. */
		@media (hover: hover) {
			.txcard-head--toggle:hover { background:#f1f1f3; }
		}
		/* A11Y NOTE (whole app): these expand/collapse chevrons — and lots of mobile text — are
		   too small for low-vision users. We need a "low-vision" theme/skin (larger fonts, bigger
		   hit targets, stronger contrast) as a future themeing pass. See task A11Y-LOWVISION1. */
		.txcard-chevron { color:#71717a; font-size:16px; line-height:1; transition:transform .2s ease; }
		/* nerd bottom panel (STATUS-TAB-RETIRE1): collapsible line-items/debug section,
		   nerd-only, same expand mechanics as the account cards */
		body:not(.nerd) .txread-nerd-panel { display:none; }
		.txread-nerd-panel { border:1px solid #e4e4e7; border-radius:10px; margin-top:14px; background:#fafafa; }
		.txread-nerd-head { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; cursor:pointer; user-select:none; font-size:12px; font-weight:600; color:#52525b; }
		.txread-nerd-caret { transition:transform .22s ease; }
		.txread-nerd-panel--open .txread-nerd-caret { transform:rotate(90deg); }
		.txread-nerd-detail { display:grid; grid-template-rows:0fr; transition:grid-template-rows .22s ease; }
		.txread-nerd-panel--open .txread-nerd-detail { grid-template-rows:1fr; }
		.txread-nerd-inner { overflow:hidden; }
		.txread-nerd-panel--open .txread-nerd-inner { padding:0 12px 10px; }

		.txcard-detail { display:grid; grid-template-rows:0fr; transition:grid-template-rows .22s ease; }
		.txcard--open .txcard-detail { grid-template-rows:1fr; }
		.txcard-detail-inner { overflow:hidden; min-height:0; }
		.txcard--open .txcard-detail-inner { padding:10px 12px; border-top:1px solid #ececec; }
		/* pie + key list are two flex cells that reflow (side-by-side on desktop, stacked on
		   mobile), clustered in the centre with the slack on the outside; vertically centred.
		   Chart first, keys second. The list keeps fixed columns (no 1fr) so it stays compact. */
		.txcard-detail-grid { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:12px 28px; }
		.txcard-detail .acctkeys-piechart { margin:0; flex:0 0 auto; }
		.txcard-keys { display:flex; flex-direction:column; gap:3px; font-size:12px; }
		.txcard-keys-row { display:grid; grid-template-columns:22px 74px 48px 60px 56px; gap:10px; align-items:center; }
		.txcard-keys-head { color:#a1a1aa; font-size:11px; }
		.txcard-keys-row a { color:#3b82f6; text-decoration:none; }
		.txcard-keys-row a:hover { text-decoration:underline; }
		.txcard-xproof { margin-top:8px; font-size:12px; color:#71717a; }
		.txcard-xproof a { color:#3b82f6; }
		.txcard-detail-note { font-size:12px; color:#3f3f46; background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; padding:6px 8px; margin-bottom:8px; }
		/* muted informational note ("no signature required") reads as plain gray text like
		   the outstanding-items lines below — the boxed/button look was noise (per user
		   2026-07-03); only the amber receiver-sig warning keeps its box. */
		.txcard-detail-note--muted { background:none; border:none; padding:0; color:#9ca3af; }
		/* SIGN-EXPLAIN1: plain-words outstanding-items list — light gray, one line per
		   issue, sits above the pie/keys so it reads first on expand. */
		.txcard-detail-issues { font-size:12px; color:#9ca3af; margin:0 0 10px; display:flex; flex-direction:column; gap:3px; }
		/* warnings full-strength (matches .txcard-acct), info stays muted — same size/style otherwise */
		.txcard-issue--warn { color:#52525b; }
		/* reference-only detail (no signature needed): one opacity layer mutes the key table
		   to match the neutral gray pie — it's there for reference, not focus */
		.txcard-detail--refonly { opacity:.55; }

		/* witnesses — signed keys not tied to any account; listed under the cards as chips
		   (may later read as votes). Sits just above the Hedera <network> scope line. */
		.txread-witnesses { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:8px; font-size:12px; }
		.txread-witnesses-label { color:#a1a1aa; text-transform:uppercase; letter-spacing:.04em; font-size:11px; }
		.txread-witnesses-list { display:inline-flex; flex-wrap:wrap; gap:6px; }
		.txwitness-chip { display:inline-flex; padding:3px 9px; border-radius:14px; font-size:12px; background:#f4f4f5; border:1px solid #e4e4e7; color:#52525b; cursor:default; }

		/* overall status + countdown at the top of the modal (normal-visible header) */
		.txread-status-header { font-weight:600; font-size:14px; margin:0 0 8px; }
		.txread-scope-due { color:#71717a; text-align:center; }   /* SCOPEWRAP1: centre when it wraps */

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
			/* hover triggers highlight + replay but there's no CLICK action (yet), so the
			   text I-beam read wrong — default arrow is the hover-only convention. Switch
			   to pointer if chips ever gain a click. */
			cursor:default; user-select:none;
		}
		.txcard-chip-icon { flex:0 0 auto; }
		.txcard-chip-text { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
		.txcard-chip-ghost {
			/* dashed + muted, but OPAQUE (solid bg + full opacity) so the dotted trail behind it
			   is cleanly obscured — the chip sits on top of the trail (per user). */
			background:#fff; border-style:dashed; opacity:1; color:#9ca3af;
		}
		.txcard-empty { opacity:.35; font-size:13px; }

		/* asset-pool hover (fires from a chip): highlight every chip of the same asset.
		   a highlighted ghost de-fades so you can see where it lands. */
		.txcard-chip.asset-hl { outline:2px solid #ffb74d; outline-offset:1px; }
		.txcard-chip-ghost.asset-hl { opacity:1; }

		/* ▶ preview control + v0 pulse (TX-FLOW-ANIM1): send chips pulse out (amber), then
		   receive chips pulse in (green, de-fading the ghost = "landing"). */
		/* preview = full-width before/after card (same rounded shape as an account card). Left
		   pink BEFORE / right green AFTER = a legend for the account cards AND the toggle; the
		   non-active side dims. EXPLORATORY styling — may revert to a compact button. */
		.txcards-preview { display:flex; border:1px solid #e4e4e7; border-radius:10px; overflow:hidden; }
		.txpreview-half { all:revert; flex:1 1 0; cursor:pointer; border:none; padding:13px 10px;
			font:800 18px/1 system-ui,-apple-system,"Segoe UI",sans-serif; letter-spacing:.08em; transition:filter .15s ease; }
		.txpreview-before { background:#fdf2f2; color:rgba(185,28,28,.38); }   /* pink send side, FAINT red caps */
		.txpreview-after  { background:#eff7f1; color:rgba(21,128,61,.4); }    /* green receive side, FAINT green caps */
		/* hover: keep the tint (re-assert to beat host button:hover) + a subtle grey inset border
		   so it still reads as a button; no colour change. */
		.txpreview-before:hover { background:#fdf2f2; }
		.txpreview-after:hover  { background:#eff7f1; }
		.txpreview-half:hover   { box-shadow: inset 0 0 0 2px rgba(0,0,0,.14); }
		/* PREVIEWCORNERS1 (feedback 9b704fde, 2026-09-05): "the highlight border's corners
		   are getting slightly cropped — it should follow whatever the border shape already
		   is rather than cropping on the corners." The halves are square boxes inside a
		   10px-rounded, overflow:hidden parent, so the inset ring drew a right-angled
		   corner into the parent's rounded clip and lost its tip. Give each half the
		   matching corner on its OUTER side only (9px = the parent's 10px less its 1px
		   border) so the ring curves with the card; the shared middle edge stays square. */
		.txpreview-before { border-radius:9px 0 0 9px; }
		.txpreview-after  { border-radius:0 9px 9px 0; }
		.txcards-preview[data-state="before"] .txpreview-after,
		.txcards-preview[data-state="after"]  .txpreview-before { opacity:.45; }
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
		/* TRAILHUE1: the pool puff was amber (#ffd27f → orange), which is a WARNING colour
		   everywhere else in this modal and was one of the colours making the animation
		   busy. Same muted blue as the trail — it's part of the same drawn trajectory. */
		.txflow-frizz { position:absolute; width:16px; height:16px; border-radius:50%; pointer-events:none;
			background:radial-gradient(circle, #fff 0%, rgba(129,171,214,.85) 45%, rgba(129,171,214,0) 70%); }
		.txflow-trail { position:absolute; width:7px; height:7px; border-radius:50%; pointer-events:none; filter:blur(0.15px);
			transform:translate(-50%,-50%);   /* centre the dot on its (x,y) — was provided by the (now-removed) fade animation */
			background:radial-gradient(circle, rgba(96,165,250,.55) 0%, rgba(96,165,250,0) 70%); }
		.txcard-chip.txflow-landed { opacity:1; outline:2px solid #56c857; outline-offset:2px; }

		/* nerd-view toggle — top-right of the widget, out of the way of the modal close/toast.
		   dev affordance to flip cards (normal) ↔ line-item table (nerd) without the profile panel. */
		.txread-wrapper { position:relative; }
		/* emoji toggle 🙂↔🤓 (user 2026-08-05) — a button now, no checkbox */
		.txread-nerd-toggle {
			position:absolute; top:0; right:0; z-index:5;
			display:inline-flex; align-items:center;
			font-size:16px; cursor:pointer; user-select:none; border:none;
			background:rgba(255,255,255,.85); padding:1px 5px; border-radius:6px;
		}
		.txread-nerd-toggle:hover { filter:brightness(1.08); }


	`
	document.head.appendChild(style)
}