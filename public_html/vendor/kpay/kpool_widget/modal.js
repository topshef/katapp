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
		.kpm-overlay { position: fixed; inset: 0; z-index: 100000; display: flex;
			align-items: flex-start; justify-content: center; padding: 5vh 8px; overflow: auto; }
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
			display: flex; align-items: center; justify-content: space-between;
			gap: 12px; padding: 10px 14px;
			border-bottom: 1px solid rgba(0,0,0,.08);
			font: 600 14px system-ui, -apple-system, "Segoe UI", sans-serif;
			transition: background .3s ease;
		}
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

		.kpm-body { flex: 1 1 auto; overflow: auto; padding: 16px; }

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

	actions.append(diagBtn, closeBtn)
	head.append(status, actions)
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

	document.body.appendChild(overlay)
	document.body.style.overflow = 'hidden'

	return { overlay, card, body, head, close, setStatus }
}
