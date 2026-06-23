// ksig.js — in-house KSIG offline-signing QR.
//
// Replaces the external kpos.uk iframe for the QR *display* step: fetch the
// transaction body bytes, base64-encode them, and render a QR locally with the
// bundled qrcode.min.js (davidshimjs QRCode). The KSIG app scans this to sign.
//
// REQUIRES: copy qrcode.min.js into this widget folder (/vendor/kpay/kpool_widget/).
// It's the same 19KB lib used by the old kpos.uk page.
//
// Returning the signature (scanning the signed QR back) still uses the external
// full tool via the pane's "open in new tab" link for now — bringing the scanner
// + txAddSignature submit in-house is a follow-up (needs instascan + backend).

import { kdiag } from './diag.js'

const V = window.__BUILD_HASH__ || ''

function hexToBytes(hex) {
	const clean = String(hex || '').replace(/^0x/, '')
	const out = new Uint8Array(clean.length / 2)
	for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16)
	return out
}

function bytesToB64(bytes) {
	let bin = ''
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
	return btoa(bin)
}

async function sha4(text) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
	const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
	return hex.slice(0, 4).toUpperCase()
}

let qrLibPromise = null
function loadQRCode() {
	if (window.QRCode) return Promise.resolve()
	if (qrLibPromise) return qrLibPromise

	qrLibPromise = new Promise((resolve, reject) => {
		const s = document.createElement('script')
		s.src = new URL('./qrcode.min.js', import.meta.url).href + (V ? `?v=${V}` : '')
		s.onload = () => window.QRCode ? resolve() : reject(new Error('qrcode.min.js loaded but QRCode missing'))
		s.onerror = () => reject(new Error('failed to load qrcode.min.js'))
		document.head.appendChild(s)
	})
	return qrLibPromise
}

const defaultReadUrl = ({ network, txid }) =>
	location.pathname + `?action=txRead&network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`

async function fetchTx(readUrl, network, txid) {
	const url = readUrl({ network, txid })
	const res = await fetch(url)
	if (!res.ok) throw new Error(`txRead failed (${res.status})`)
	return res.json()
}

export async function renderKsig(container, { network, txid, readUrl = defaultReadUrl } = {}) {
	injectKsigCSS()
	container.innerHTML = `<div class="kpsign-msg">Preparing QR…</div>`

	try {
		const [, data] = await Promise.all([
			loadQRCode(),
			fetchTx(readUrl, network, txid)
		])

		const bodyBytesHex = data?.result?.bodyBytesHex
		if (!bodyBytesHex) {
			// tells us exactly what the endpoint returned so we can adjust the field
			kdiag('ksig:no-bodybytes', { keys: Object.keys(data?.result || {}) })
			container.innerHTML = `<div class="kpsign-msg">Couldn't read transaction bytes for the QR — use “open in new tab”.</div>`
			return
		}

		const b64 = bytesToB64(hexToBytes(bodyBytesHex))
		const checksum = await sha4(b64)

		container.innerHTML = ''

		const qr = document.createElement('div')
		qr.className = 'kpsign-qr'
		container.appendChild(qr)

		// eslint-disable-next-line no-undef
		new QRCode(qr, {
			text: b64,
			width: 200,
			height: 200,
			colorDark: '#000000',
			colorLight: '#ffffff',
			correctLevel: QRCode.CorrectLevel.M
		})

		const cap = document.createElement('div')
		cap.className = 'kpsign-qr-cap'
		cap.textContent = `Scan with the KSIG app · checksum ${checksum}`
		container.appendChild(cap)

		kdiag('ksig:qr-rendered', { bytes: bodyBytesHex.length / 2, checksum })
	} catch (err) {
		kdiag('ksig:error', { error: String(err) })
		container.innerHTML = `<div class="kpsign-msg">QR failed: ${err.message}</div>`
	}
}

let cssDone = false
function injectKsigCSS() {
	if (cssDone) return
	cssDone = true
	const s = document.createElement('style')
	s.textContent = `
		.kpsign-qr { display:flex; justify-content:center; padding:8px; }
		/* override any theme border-radius so the QR finder squares aren't clipped */
		.kpsign-qr img, .kpsign-qr canvas, .kpsign-qr table, .kpsign-qr td { display:block; border-radius:0 !important; }
		.kpsign-qr-cap { text-align:center; font:12px ui-monospace,Menlo,Consolas,monospace; color:#888; margin-top:6px; }
	`
	document.head.appendChild(s)
}
