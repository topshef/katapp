// modal.js — minimal, brandable modal shell for the kpool signing widget.
//
// Header carries a one-line status that the widget drives via setStatus(label,
// tone); the header tints to match (info / success / warn / error). A "copy
// logs" button dumps the kdiag buffer to the clipboard for bug reports. Closing
// removes the overlay (and the widget DOM inside it), keeping a single live
// instance so the view layer's id lookups stay unambiguous.
//
//   const modal = buildModal({ onClose })
//   mountSomethingInto(modal.body)
//   modal.setStatus('✅ Success', 'success')
//   modal.close()

let cssInjected = false

function injectModalCSS() {
	if (cssInjected) return
	cssInjected = true

	const style = document.createElement('style')
	style.id = 'kpool-modal-css'
	style.textContent = `
		/* overlay does NOT scroll — the card is capped at max-height and the body
		   scrolls internally when needed. An overlay scrollbar here was spurious:
		   5vh+5vh padding + 90vh card = 100vh exactly, so sub-pixel rounding
		   produced a phantom scrollbar even when everything fit. */
		.kpm-overlay { position: fixed; inset: 0; z-index: 100000; display: flex;
			align-items: flex-start; justify-content: center; padding: 5vh 8px; overflow: hidden; }
		.kpm-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); }
		.kpm-card {
			position: relative; margin: 0 auto;
			width: min(900px, 96vw); max-height: 90vh;
			background: #fff; border-radius: 10px;
			box-shadow: 0 12px 48px rgba(0,0,0,.35);
			display: flex; flex-direction: column; overflow: hidden;
		}

		/* status-coloured header */
		.kpm-head {
			position: relative;
			display: flex; align-items: center; justify-content: space-between;
			gap: 12px; padding: 10px 14px;
			border-bottom: 1px solid rgba(0,0,0,.08);
			font: 600 14px system-ui, -apple-system, "Segoe UI", sans-serif;
			transition: background .3s ease;
		}

		/* Transient centred cue (e.g. "✍️ Signature received"). Same typography
		   as the rest of the header — it inherits the head's font and tone colour,
		   no pill, just clean text that fades in over the top for a moment. */
		.kpm-flash {
			position: absolute; left: 50%; top: 50%;
			transform: translate(-50%, -50%);
			max-width: 55%;
			font: inherit; color: inherit;
			white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
			opacity: 0; pointer-events: none; transition: opacity .2s ease;
		}
		.kpm-flash.show { opacity: 1; animation: kpm-flash-pop .45s ease; }
		@keyframes kpm-flash-pop {
			0%   { transform: translate(-50%, -50%) translateY(-3px); }
			100% { transform: translate(-50%, -50%) translateY(0); }
		}
		@media (max-width: 480px) { .kpm-flash { display: none; } }
		.kpm-status { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; min-width: 0; }
		/* countdown beside the label; min-width reserves its space so it never jolts the modal
		   when it clears on final status. Wraps below the label on narrow screens. */
		.kpm-countdown { display: inline-flex; align-items: center; line-height: 1; position: relative; top: 1.5px; font-size: 12px; opacity: .8; white-space: nowrap; font-variant-numeric: tabular-nums; min-width: 5.5em; }
		.kpm-dot { width: 11px; height: 11px; border-radius: 50%; flex: 0 0 auto; background: #9aa0a6; }
		.kpm-dot.square { border-radius: 2px; }
		.kpm-status-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.kpm-head-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }

		.kpm-diag, .kpm-close {
			border: none; background: transparent; cursor: pointer; color: inherit;
			line-height: 1; padding: 4px 6px; border-radius: 6px; font: inherit;
		}
		.kpm-diag { font-size: 12px; opacity: .75; }
		.kpm-diag:hover, .kpm-close:hover { background: rgba(0,0,0,.08); opacity: 1; }
		.kpm-close { font-size: 22px; }

		/* Nerd toggle relocated into the header (ORDERS-UI1) — the widget styles it
		   position:absolute for its inline top-right corner; neutralise that here so
		   it flows in the header action row, sitting just left of the close ✕. */
		.kpm-head-actions .txread-nerd-toggle {
			position: static; background: transparent; padding: 4px 6px; color: inherit;
		}

		/* Open-in-new-tab (MODAL-URL1) — nerd mode only. Matches the close button's
		   ghost-icon treatment; hidden unless the host page is in nerd mode. */
		.kpm-open-tab {
			display: none; text-decoration: none; color: inherit; font: inherit;
			line-height: 1; padding: 4px 6px; border-radius: 6px; opacity: .75; font-size: 16px;
		}
		.kpm-open-tab:hover { background: rgba(0,0,0,.08); opacity: 1; }
		body.nerd .kpm-open-tab { display: inline-flex; align-items: center; }

		.kpm-tone-info    { background: #f3f4f6; color: #374151; }
		.kpm-tone-info    .kpm-dot { background: #9aa0a6; }
		.kpm-tone-success { background: #d1e7dd; color: #0f5132; }
		.kpm-tone-success .kpm-dot { background: #198754; }
		.kpm-tone-warn    { background: #fff3cd; color: #664d03; }
		.kpm-tone-warn    .kpm-dot { background: #ffc107; }
		.kpm-tone-error   { background: #f8d7da; color: #842029; }
		.kpm-tone-error   .kpm-dot { background: #dc3545; }

		/* only the body scrolls, and only when content actually exceeds the card
		   height (e.g. a transaction with many transfers / signing rows). */
		.kpm-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 16px; }

		@media (max-width: 768px) {
			.kpm-overlay { padding: 0; }
			.kpm-card { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
		}

		/* WalletConnect's own modal must sit ABOVE this one. The live wcm bundle
		   applies --wcm-z-index as an inline style on <html> (ThemeUtil.setTheme),
		   which beats stylesheet rules. signer-walletconnect.js therefore overrides
		   it programmatically just before wc.connect(). These rules act as fallbacks
		   for other builds (w3m / AppKit) that don't override the inline style. */
		:root { --wcm-z-index: 2147483000; --w3m-z-index: 2147483000; }
		wcm-modal, wcm-container, w3m-modal, w3m-container,
		.walletconnect-modal__base, #walletconnect-qrcode-modal, #wcm-modal {
			z-index: 2147483000 !important;
		}
	`
	document.head.appendChild(style)
	installWcmZIndexGuard()
}

// WCM-ZINDEX1 (2026-07-08): WalletConnect's ThemeUtil.setTheme() writes
// --wcm-z-index:"89" INLINE on <html>, which beats both the :root rule above and the
// per-connect programmatic bump — and it re-applies ASYNC during the modal lifecycle
// (theme re-render / session restore), so a bump set just before wc.connect() can be
// clobbered a beat later, dropping the WC modal UNDER our signing/profile modals
// (z 2000–9999). Reported intermittently 2026-07-08. This self-healing guard re-asserts
// our high value whenever WC lowers it — a MutationObserver on <html>'s style attribute,
// installed once. Only ever RAISES the z-index, so it can't harm anything.
const WCM_Z = '2147483000'
// window-level flag (not module-level): katomia-auth.js installs the SAME guard on page
// load so the profile/add-account connect flows are covered even when the signing modal
// (this module) never opens. Whichever runs first wins; the other no-ops.
function installWcmZIndexGuard() {
	if (typeof window === 'undefined' || window.__wcmZGuardInstalled || typeof MutationObserver === 'undefined') return
	window.__wcmZGuardInstalled = true
	const html = document.documentElement
	const assert = () => {
		if (html.style.getPropertyValue('--wcm-z-index') === WCM_Z) return
		const was = html.style.getPropertyValue('--wcm-z-index') || '(unset)'
		html.style.setProperty('--wcm-z-index', WCM_Z)
		html.style.setProperty('--w3m-z-index', WCM_Z)
		try { globalThis.kdiag?.('wc:zindex-corrected', { was, to: WCM_Z }) } catch {}
	}
	assert()
	new MutationObserver(assert).observe(html, { attributes: true, attributeFilter: ['style'] })
}

export function buildModal({ onClose } = {}) {
	injectModalCSS()

	const overlay = document.createElement('div')
	overlay.className = 'kpm-overlay'

	const backdrop = document.createElement('div')
	backdrop.className = 'kpm-backdrop'

	const card = document.createElement('div')
	card.className = 'kpm-card'

	// header
	const head = document.createElement('div')
	head.className = 'kpm-head kpm-tone-info'

	const status = document.createElement('div')
	status.className = 'kpm-status'
	const dot = document.createElement('span')
	dot.className = 'kpm-dot'
	const statusLabel = document.createElement('span')
	statusLabel.className = 'kpm-status-label'
	statusLabel.textContent = 'Loading…'
	const countdown = document.createElement('span')
	countdown.className = 'kpm-countdown'
	status.append(dot, statusLabel, countdown)

	const actions = document.createElement('div')
	actions.className = 'kpm-head-actions'

	// Diagnostics-copy button removed from the widget (DIAG-MOVE1) — the host app's
	// profile modal now owns "Copy local diagnostics" (katomia-profile.js), keeping all
	// diagnostics controls in one place. window.kdiag itself is unchanged and still
	// installed by diag.js; only this in-widget button is gone.

	const closeBtn = document.createElement('button')
	closeBtn.className = 'kpm-close'
	closeBtn.type = 'button'
	closeBtn.setAttribute('aria-label', 'Close')
	closeBtn.innerHTML = '&times;'
	closeBtn.addEventListener('click', () => close())

	const flashEl = document.createElement('div')
	flashEl.className = 'kpm-flash'

	actions.append(closeBtn)
	head.append(status, flashEl, actions)
	card.appendChild(head)

	const body = document.createElement('div')
	body.className = 'kpm-body'
	card.appendChild(body)

	overlay.appendChild(backdrop)
	overlay.appendChild(card)

	const onKey = e => { if (e.key === 'Escape' && !_locks) close() }
	backdrop.addEventListener('click', () => { if (!_locks) close() })
	document.addEventListener('keydown', onKey)

	// Lock the backdrop so external flows (e.g. WalletConnect modal) can't
	// accidentally close this modal while they're open.
	let _locks = 0
	function lock()   { _locks++ }
	function unlock() { _locks = Math.max(0, _locks - 1) }

	let closed = false
	function close() {
		if (closed) return
		closed = true
		document.removeEventListener('keydown', onKey)
		overlay.remove()
		document.body.style.overflow = ''
		onClose?.()
	}

	const TONES = ['info', 'success', 'warn', 'error']
	function setStatus(label, tone = 'info', shape = 'circle') {
		statusLabel.textContent = label ?? ''
		const t = TONES.includes(tone) ? tone : 'info'
		head.className = 'kpm-head kpm-tone-' + t
		dot.classList.toggle('square', shape === 'square')
	}

	// Countdown sits beside the status label (desktop) / wraps below it (mobile). Its space is
	// reserved in CSS (min-width) so clearing it on final status doesn't jolt the modal.
	function setCountdown(text) { countdown.textContent = text ?? '' }

	// Transient cue in the centre of the header (e.g. "✍️ Signature received").
	// Does NOT touch the persistent status on the left — it just fades in over
	// the top for ~2.5s. Replaces the old bottom banner inside the modal.
	let flashTimer
	function flash(label, tone = 'success') {
		flashEl.textContent = label ?? ''
		// colour/typography now inherit from the header — no tone class needed.
		// restart the pop animation even on repeat calls
		void flashEl.offsetWidth
		flashEl.classList.add('show')
		clearTimeout(flashTimer)
		flashTimer = setTimeout(() => flashEl.classList.remove('show'), 2500)
	}

	document.body.appendChild(overlay)
	document.body.style.overflow = 'hidden'

	return { overlay, card, body, head, close, setStatus, setCountdown, flash, lock, unlock }
}
