// ksig.js — in-house KSIG offline-signing QR (display + scan-back).
//
// TWO directions, both now in-house (no external kpos.uk iframe):
//
//   OUT (display): fetch the transaction body bytes, base64-encode, render a QR
//   locally with the bundled qrcode.min.js (davidshimjs). The KSIG app scans it.
//
//   IN  (scan-back): open the camera (instascan), scan the QR the KSIG app shows
//   back — it carries `publicKey sigHex` — and submit it so the signature is added
//   to the pooled transaction. This is the part that previously lived only in the
//   external full tool ("open in new tab"); it's now in the widget.
//
// REQUIRES (copy into this widget folder, e.g. /vendor/kpay/kpool_widget/):
//   qrcode.min.js     — 19KB davidshimjs lib (display)
//   instascan.min.js  — camera QR scanner (scan-back)
//   iconScanQR.png     — optional; falls back to an inline glyph if absent
//
// SUBMIT ENDPOINT DECISION:
//   Adding a signature to existing pooled bytes needs the server-side protobuf
//   step (txAddSignature) — not something we want to reimplement in the browser.
//   The proven implementation already lives in the standalone KSIG widget
//   (interim.php at kpos.uk/sign/offline/widget): given network+txid+publicKey+
//   sigHex it fetches the latest bytes, adds the signature and saves. So scan-back
//   POSTs the scanned values there (default `submitSigUrl`). It's a form-encoded
//   "simple" POST (no CORS preflight); we can't read the cross-origin response, so
//   after submitting we just fire `onSigned()` and let the widget's existing poll
//   loop surface the new signer — same contract the WalletConnect signer uses.
//   Override `submitSigUrl` if/when a same-origin `?action=txAddSignature` exists.

import { kdiag } from './diag.js'

const V = window.__BUILD_HASH__ || ''

// Post the scanned signature to OUR OWN pool — same origin as the widget, the
// same place the WalletConnect signer's txSave goes. The old cross-origin
// kpos.uk endpoint was blocked by CORS ("Failed to fetch"), so nothing was ever
// recorded. txAddSignature takes the raw {publicKey, sigHex, bodyBytesHex} and
// merges the signature into the pooled transaction server-side.
// const DEFAULT_SUBMIT_URL = 'https://kpos.uk/sign/offline/widget'
const DEFAULT_SUBMIT_URL = location.pathname + '?action=txAddSignature'

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

// ── lazy library loaders ───────────────────────────────────────────────────
// Both libs are resolved against import.meta.url (this module's folder) so they
// load regardless of the host page's path or any <base href> — the same fix that
// made the QR *display* reliable when it was brought in-house.

let qrLibPromise = null
function loadQRCode() {
	if (window.QRCode) return Promise.resolve()
	if (qrLibPromise) return qrLibPromise
	qrLibPromise = loadScript('./qrcode.min.js', () => !!window.QRCode, 'qrcode.min.js')
	return qrLibPromise
}

let scanLibPromise = null
function loadInstascan() {
	if (window.Instascan) return Promise.resolve()
	if (scanLibPromise) return scanLibPromise
	scanLibPromise = loadScript('./instascan.min.js', () => !!window.Instascan, 'instascan.min.js')
	return scanLibPromise
}

function loadScript(relPath, isReady, label) {
	return new Promise((resolve, reject) => {
		const s = document.createElement('script')
		s.src = new URL(relPath, import.meta.url).href + (V ? `?v=${V}` : '')
		s.onload = () => isReady() ? resolve() : reject(new Error(`${label} loaded but global missing`))
		s.onerror = () => reject(new Error(`failed to load ${label}`))
		document.head.appendChild(s)
	})
}

const defaultReadUrl = ({ network, txid }) =>
	location.pathname + `?action=txRead&network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`

async function fetchTx(readUrl, network, txid) {
	const url = readUrl({ network, txid })
	const res = await fetch(url)
	if (!res.ok) throw new Error(`txRead failed (${res.status})`)
	return res.json()
}

export async function renderKsig(container, {
	network,
	txid,
	readUrl = defaultReadUrl,
	submitSigUrl = DEFAULT_SUBMIT_URL,
	onSigned = null
} = {}) {
	injectKsigCSS()
	container.innerHTML = `<div class="kpsign-msg">Preparing QR…</div>`

	try {
		const [, data] = await Promise.all([
			loadQRCode(),
			fetchTx(readUrl, network, txid)
		])

		const bodyBytesHex = data?.result?.bodyBytesHex
		if (!bodyBytesHex) {
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

		// ── scan-back UI ────────────────────────────────────────────────────
		const scanBtn = document.createElement('button')
		scanBtn.type = 'button'
		scanBtn.className = 'kpsign-scan-btn'
		scanBtn.textContent = '📷 Scan signed QR back'
		container.appendChild(scanBtn)

		const status = document.createElement('div')
		status.className = 'kpsign-scan-status'
		container.appendChild(status)

		scanBtn.addEventListener('click', () =>
			startScanBack({ network, txid, bodyBytesHex, submitSigUrl, onSigned, statusEl: status, btnEl: scanBtn })
		)

		kdiag('ksig:qr-rendered', { bytes: bodyBytesHex.length / 2, checksum })
	} catch (err) {
		kdiag('ksig:error', { error: String(err) })
		container.innerHTML = `<div class="kpsign-msg">QR failed: ${err.message}</div>`
	}
}

// ── scan-back flow ───────────────────────────────────────────────────────────

// The KSIG app returns a QR whose text contains two hex blobs: the signer's
// public key and the signature. Accept a couple of shapes:
//   "<pubHex> <sigHex>"                  (current KSIG output)
//   "<network> <txid> <pubHex> <sigHex>" (async / forwarded style)
function parseSignedQR(content) {
	const text = String(content || '').trim()
	const hexes = text.match(/[0-9a-fA-F]{16,}/g) || []
	if (hexes.length >= 2) {
		const sigHex = hexes[hexes.length - 1]
		const publicKey = hexes[hexes.length - 2]
		return { publicKey, sigHex }
	}
	return null
}

let scanner = null
let scanning = false

async function startScanBack(ctx) {
	const { statusEl, btnEl } = ctx
	if (scanning) return

	statusEl.textContent = 'Starting camera…'
	statusEl.className = 'kpsign-scan-status'

	try {
		await loadInstascan()
	} catch (e) {
		statusEl.textContent = 'Camera library failed to load.'
		statusEl.classList.add('err')
		kdiag('ksig:scan-lib-error', { error: String(e) })
		return
	}

	const overlay = buildScannerOverlay()
	const video = overlay.querySelector('video')
	scanner = new window.Instascan.Scanner({ video, scanPeriod: 2, mirror: false })

	const stop = () => {
		try { scanner && scanner.stop() } catch (_) {}
		scanning = false
		overlay.remove()
	}
	overlay.querySelector('.kpsign-scan-close').onclick = stop
	overlay.onclick = e => { if (e.target === overlay) stop() }

	scanner.addListener('scan', async content => {
		const parsed = parseSignedQR(content)
		if (!parsed) return            // ignore non-matching codes, keep scanning
		stop()
		await submitSignature(parsed, ctx)
	})

	try {
		const cameras = await window.Instascan.Camera.getCameras()
		if (!cameras.length) { statusEl.textContent = 'No camera found.'; statusEl.classList.add('err'); overlay.remove(); return }
		const rear = cameras.find(c => /back|rear|environment/i.test(c.name || ''))
		await scanner.start(rear || cameras[0])
		scanning = true
		statusEl.textContent = 'Point the camera at the signed QR…'
	} catch (e) {
		overlay.remove()
		scanning = false
		statusEl.textContent = 'Couldn\'t open the camera. Check permissions.'
		statusEl.classList.add('err')
		kdiag('ksig:camera-error', { error: String(e) })
	}
}



async function submitSignature({ publicKey, sigHex }, { network, txid, bodyBytesHex, submitSigUrl, onSigned, statusEl }) {
	statusEl.classList.remove('err')
	statusEl.textContent = `Submitting signature …${publicKey.slice(-4)}`


const body = new URLSearchParams({ network, txid, publicKey, sigHex, bodyBytesHex })

	// kpool.php reads `network` from $_GET OR a JSON body — NOT from a form-encoded
	// body. We send form-encoded, so put network+txid in the query string too, or
	// the server throws "ZR73642 / HE93843 missing network" and drops the sig.
	const sep = submitSigUrl.includes('?') ? '&' : '?'
	const postUrl = submitSigUrl + sep +
		`network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`

	kdiag('ksig:submit:start', {
		url: postUrl,
		network, txid,
		pubTail: publicKey.slice(-4),
		sigLen: sigHex.length / 2,
		bodyBytesLen: (bodyBytesHex || '').length / 2
	})

	try {
		// no-cors removed: it made the response opaque, so a 404/error/empty write
		// from the endpoint still looked like success here. Read the response so we
		// can actually see whether the signature was recorded.
		const res = await fetch(postUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString()
		})


		const text = await res.text().catch(() => '')
		kdiag('ksig:submit:response', {
			ok: res.ok,
			status: res.status,
			type: res.type,
			len: text.length,
			snippet: text.slice(0, 300)
		})

		statusEl.textContent = `✍️ Signature …${publicKey.slice(-4)} submitted — the approvals list will update shortly.`
		if (typeof onSigned === 'function') onSigned({ publicKey, sigHex })
	} catch (e) {
		statusEl.classList.add('err')
		statusEl.textContent = 'Submit failed — try “open in new tab”, or scan again.'
		kdiag('ksig:submit:error', { error: String(e), url: submitSigUrl })
	}
}



function buildScannerOverlay() {
	const overlay = document.createElement('div')
	overlay.className = 'kpsign-scan-overlay'
	overlay.innerHTML = `
		<span class="kpsign-scan-close">&times;</span>
		<video class="kpsign-scan-video" playsinline></video>`
	document.body.appendChild(overlay)
	return overlay
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

		.kpsign-scan-btn { display:block; margin:12px auto 0; padding:8px 14px; cursor:pointer;
			font:13px/1.2 ui-monospace,Menlo,Consolas,monospace; color:#084298;
			background:#f3f6fb; border:1px solid #cdd9ec; border-radius:8px; }
		.kpsign-scan-btn:hover { background:#e9eff7; }
		.kpsign-scan-status { text-align:center; min-height:18px; margin-top:8px;
			font:12px ui-monospace,Menlo,Consolas,monospace; color:#555; }
		.kpsign-scan-status.err { color:#b00020; }

		.kpsign-scan-overlay { position:fixed; inset:0; z-index:2147483000; background:#000;
			display:flex; align-items:center; justify-content:center; }
		.kpsign-scan-video { width:100%; max-width:520px; height:auto; max-height:100%; }
		.kpsign-scan-close { position:absolute; top:16px; right:22px; color:#fff; font-size:40px;
			font-weight:bold; cursor:pointer; line-height:1; }
	`
	document.head.appendChild(s)
}
