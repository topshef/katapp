// modal.js — minimal, brandable modal shell for the kpool signing widget.
//
// No site chrome. Self-contained CSS. Closing removes the overlay (and the
// widget DOM inside it), which keeps a single live widget instance — so the
// view layer's id-based lookups stay unambiguous without needing root-scoping.
//
// Usage:
//   const modal = buildModal({ title, logo, showHeader, onClose })
//   mountSomethingInto(modal.body)
//   ... modal.close()

let cssInjected = false

function injectModalCSS() {
	if (cssInjected) return
	cssInjected = true

	const style = document.createElement('style')
	style.id = 'kpool-modal-css'
	style.textContent = `
		.kpm-overlay { position: fixed; inset: 0; z-index: 100000; display: flex; }
		.kpm-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.55); }
		.kpm-card {
			position: relative; margin: auto;
			width: min(1100px, 96vw); max-height: 92vh;
			background: #fff; border-radius: 10px;
			box-shadow: 0 12px 48px rgba(0,0,0,.35);
			display: flex; flex-direction: column; overflow: hidden;
		}
		.kpm-head {
			display: flex; align-items: center; justify-content: space-between;
			padding: 10px 14px; border-bottom: 1px solid #eee;
			font: 600 14px system-ui, -apple-system, "Segoe UI", sans-serif; color: #333;
		}
		.kpm-title { display: flex; align-items: center; gap: 8px; }
		.kpm-title img { height: 20px; width: auto; }
		.kpm-close {
			border: none; background: transparent; font-size: 24px; line-height: 1;
			color: #888; cursor: pointer; padding: 0 4px;
		}
		.kpm-close:hover { color: #000; }
		.kpm-body { flex: 1 1 auto; overflow: auto; padding: 16px; }

		@media (max-width: 768px) {
			.kpm-card { width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
		}
	`
	document.head.appendChild(style)
}

export function buildModal({ title = 'Sign transaction', logo = null, showHeader = true, onClose } = {}) {
	injectModalCSS()

	const overlay = document.createElement('div')
	overlay.className = 'kpm-overlay'

	const backdrop = document.createElement('div')
	backdrop.className = 'kpm-backdrop'

	const card = document.createElement('div')
	card.className = 'kpm-card'

	if (showHeader) {
		const head = document.createElement('div')
		head.className = 'kpm-head'

		const titleEl = document.createElement('div')
		titleEl.className = 'kpm-title'

		if (logo) {
			const img = document.createElement('img')
			img.src = logo
			img.alt = ''
			titleEl.appendChild(img)
		}
		if (title) {
			const span = document.createElement('span')
			span.textContent = title
			titleEl.appendChild(span)
		}

		const closeBtn = document.createElement('button')
		closeBtn.className = 'kpm-close'
		closeBtn.type = 'button'
		closeBtn.setAttribute('aria-label', 'Close')
		closeBtn.innerHTML = '&times;'
		closeBtn.addEventListener('click', () => close())

		head.appendChild(titleEl)
		head.appendChild(closeBtn)
		card.appendChild(head)
	}

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

	document.body.appendChild(overlay)
	document.body.style.overflow = 'hidden'

	return { overlay, card, body, close }
}
