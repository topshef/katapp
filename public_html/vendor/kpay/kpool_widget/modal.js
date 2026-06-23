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

		/* transient pill centred in the header — used for live cues like
		   "Signature received" that used to render as a banner falling off the
		   bottom of the modal. Auto-fades after a couple of seconds. */
		.kpm-flash {
			position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(1);
			max-width: 48%; display: inline-flex; align-items: center; gap: 6px;
			padding: 3px 12px; border-radius: 999px;
			font: 600 12px system-ui, -apple-system, "Segoe UI", sans-serif;
			white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
			opacity: 0; pointer-events: none; transition: opacity .25s ease;
		}
		.kpm-flash.show { opacity: 1; animation: kpm-flash-pop .9s ease; }
		.kpm-flash-success { background: rgba(25,135,84,.16);  color: #0f5132; }
		.kpm-flash-info    { background: rgba(13,110,253,.14);  color: #084298; }
		.kpm-flash-warn    { background: rgba(255,193,7,.20);   color: #664d03; }
		.kpm-flash-error   { background: rgba(220,53,69,.16);   color: #842029; }
		@keyframes kpm-flash-pop {
			0%   { transform: translate(-50%, -50%) scale(.9); }
			55%  { transform: translate(-50%, -50%) scale(1.05); }
			100% { transform: translate(-50%, -50%) scale(1); }
		}
		@media (max-width: 480px) { .kpm-flash { display: none; } }
		.kpm-status { display: flex; align-items: center; gap: 8px; min-width: 0; }
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

		/* WalletConnect's own modal must sit ABOVE this one, otherwise its QR /
		   reconnect dialog opens underneath and can't be seen. --wcm-z-index is
		   @walletconnect/modal's documented knob; the selectors cover other WC
		   modal builds belt-and-braces. Our overlay is 100000, well below. */
		:root { --wcm-z-index: 2147483000; --w3m-z-index: 2147483000; }
		wcm-modal, w3m-modal, w3m-container,
		.walletconnect-modal__base, #walletconnect-qrcode-modal, #wcm-modal {
			z-index: 2147483000 !important;
		}
	`
	document.head.appendChild(style)
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
	status.append(dot, statusLabel)

	const actions = document.createElement('div')
	actions.className = 'kpm-head-actions'

	const diagBtn = document.createElement('button')
	diagBtn.className = 'kpm-diag'
	diagBtn.type = 'button'
	diagBtn.title = 'Copy diagnostics to clipboard'
	diagBtn.textContent = '⧉ diagnostics'
	diagBtn.addEventListener('click', async () => {
		const original = diagBtn.textContent
		try {
			// include a DOM snapshot of the modal so UI issues can be debugged from the copy
			window.kdiag?.dom?.(card, 'modal')
			await (window.kdiag?.copy?.() ?? Promise.resolve())
			diagBtn.textContent = '✓ copied'
		} catch {
			diagBtn.textContent = 'see console'
		}
		setTimeout(() => { diagBtn.textContent = original }, 1500)
	})

	const closeBtn = document.createElement('button')
	closeBtn.className = 'kpm-close'
	closeBtn.type = 'button'
	closeBtn.setAttribute('aria-label', 'Close')
	closeBtn.innerHTML = '&times;'
	closeBtn.addEventListener('click', () => close())

	const flashEl = document.createElement('div')
	flashEl.className = 'kpm-flash'

	actions.append(diagBtn, closeBtn)
	head.append(status, flashEl, actions)
	card.appendChild(head)

	const body = document.createElement('div')
	body.className = 'kpm-body'
	card.appendChild(body)

	overlay.appendChild(backdrop)
	overlay.appendChild(card)

	const onKey = e => { if (e.key === 'Escape') close() }
	backdrop.addEventListener('click', () => close())
	document.addEventListener('keydown', onKey)

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

	// Transient cue in the centre of the header (e.g. "✍️ Signature received").
	// Does NOT touch the persistent status on the left — it just fades in over
	// the top for ~2.5s. Replaces the old bottom banner inside the modal.
	let flashTimer
	function flash(label, tone = 'success') {
		flashEl.textContent = label ?? ''
		const t = TONES.includes(tone) ? tone : 'info'
		flashEl.className = 'kpm-flash kpm-flash-' + t
		// restart the pop animation even on repeat calls
		void flashEl.offsetWidth
		flashEl.classList.add('show')
		clearTimeout(flashTimer)
		flashTimer = setTimeout(() => flashEl.classList.remove('show'), 2500)
	}

	document.body.appendChild(overlay)
	document.body.style.overflow = 'hidden'

	return { overlay, card, body, head, close, setStatus, flash }
}
