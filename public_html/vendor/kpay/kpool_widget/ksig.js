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

import { kdiag } from './diag.js?v=20260628c'  // shared version tag — keep in sync with signer-walletconnect.js so both share one diag instance
import { decodeTransaction, appendSignature, bytesToHex } from './protobuf.js'


const V = window.__BUILD_HASH__ || ''

// Post the scanned signature to OUR OWN pool — same origin as the widget, the
// same place the WalletConnect signer's txSave goes. The old cross-origin
// kpos.uk endpoint was blocked by CORS ("Failed to fetch"), so nothing was ever
// recorded. txAddSignature takes the raw {publicKey, sigHex, bodyBytesHex} and
// merges the signature into the pooled transaction server-side.
// const DEFAULT_SUBMIT_URL = 'https://kpos.uk/sign/offline/widget'
const DEFAULT_SUBMIT_URL = location.pathname + '?action=addSig'

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

async function sha256Hex(str) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
	return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── KQR2 — the transaction payload KSIG v2 (KSIGN) reads ─────────────────────
// Spec: ksig@lab23 ksign/SPEC-KQR2.md; reference codec ksign/lib/kqr2.js.
//
//   KQR2 <network> <txid> <pch6> <base64(bodyBytes)> [req=<suffix6>,…]
//
// KSIGN accepts ONLY this tagged form. The bare base64 this widget used to emit
// is KSIG v1's payload and KSIGN refuses it outright ("v1 payloads dropped") —
// the camera decoded fine, the app just threw the text away.
//
// PCH (pre-consensus hash) is kpool's SHA-256 of the LOWERCASE HEX STRING of
// bodyBytes — not of the bytes, not of the base64. pch6 is its first 6 chars;
// checksum4 is its first 4, uppercase. Both KSIGN and this caption show
// checksum4, so the human check reads the same on both screens.
//
// req= is the last 6 hex of each public key kpool says must sign. It is a
// shortlist hint for the signer's key picker: outside the signed bytes,
// unauthenticated, never gating, and safe to omit. The signer re-decodes the
// body and refuses the payload on any pch or txid mismatch — the bytes are the
// truth, the envelope is convenience.
const KQR2_NETWORKS = new Set(['mainnet', 'testnet', 'previewnet'])
const KQR2_TXID_RE = /^\d+\.\d+\.\d+@\d+\.\d+$/
const KQR2_B64_RE = /^[A-Za-z0-9+/]+={0,2}$/

async function buildKqr2({ network, txid, bodyBytesHex, requiredKeys }) {
	const hex = String(bodyBytesHex || '').toLowerCase().replace(/^0x/, '')
	if (!KQR2_NETWORKS.has(network)) throw new Error(`KQR2: bad network "${network}"`)
	if (!KQR2_TXID_RE.test(txid)) throw new Error(`KQR2: bad txid "${txid}"`)
	if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2) throw new Error('KQR2: bodyBytesHex is not hex')
	const b64 = bytesToB64(hexToBytes(hex))
	const pch = await sha256Hex(hex)
	const keys = typeof requiredKeys === 'function' ? requiredKeys() : (requiredKeys || [])
	const req = [...new Set(
		[...(keys || [])].map(k => String(k).toLowerCase().slice(-6)).filter(x => /^[0-9a-f]{6}$/.test(x))
	)]
	const text = `KQR2 ${network} ${txid} ${pch.slice(0, 6)} ${b64}${req.length ? ` req=${req.join(',')}` : ''}`
	return { text, checksum: pch.slice(0, 4).toUpperCase(), pch6: pch.slice(0, 6), b64, req }
}

// Re-parse our own payload exactly as KSIGN's parseTxQr does, so a bug here
// fails loudly on this screen instead of as a silent non-scan on the phone.
async function verifyKqr2(text, bodyBytesHex, decodedTxid) {
	const parts = String(text).split(' ')
	if (parts.length < 5) throw new Error('KQR2 self-check: field count')
	const [tag, network, txid, claimedPch, b64] = parts
	if (tag !== 'KQR2') throw new Error('KQR2 self-check: tag')
	if (!KQR2_NETWORKS.has(network)) throw new Error(`KQR2 self-check: network "${network}"`)
	if (!KQR2_TXID_RE.test(txid)) throw new Error(`KQR2 self-check: txid "${txid}"`)
	if (!KQR2_B64_RE.test(b64) || b64.length % 4) throw new Error('KQR2 self-check: base64')
	const bin = atob(b64)
	let hex = ''
	for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0')
	if (hex !== String(bodyBytesHex).toLowerCase().replace(/^0x/, '')) throw new Error('KQR2 self-check: base64 does not round-trip to bodyBytes')
	const real = (await sha256Hex(hex)).slice(0, 6)
	if (real !== claimedPch) throw new Error(`KQR2 self-check: pch ${claimedPch} ≠ ${real}`)
	if (decodedTxid && decodedTxid !== txid) throw new Error(`KQR2 self-check: envelope txid ${txid} ≠ body ${decodedTxid}`)
	return true
}

// ── lazy library loaders ───────────────────────────────────────────────────
// Both libs are resolved against import.meta.url (this module's folder) so they
// load regardless of the host page's path or any <base href> — the same fix that
// made the QR *display* reliable when it was brought in-house.

// ── QR sizing ───────────────────────────────────────────────────────────────
// davidshimjs draws each module by rounding to device pixels, so a size that is
// not an exact multiple of the module count gives modules of uneven width. That
// softens the edges and is what a phone camera struggles with most. We therefore
// render once to learn the module count, then re-render at moduleCount * an
// integer scale so every module is a whole number of pixels.
//
// The library also emits no quiet zone; the spec wants 4 modules of white all
// round, which we add as padding in .kpsign-qr.
//
// Error correction is L rather than M deliberately: a ~450-char transaction at M
// needs an 85x85 symbol, at L only 73x73. On a screen there is no print damage
// or glare for the extra redundancy to protect against — the binding constraint
// is camera resolution, and fewer, larger modules win.
const QR_QUIET_MODULES = 4

function buildQR(el, text, sizePx) {
	el.innerHTML = ''
	return new _QRCode(el, {
		text,
		width: sizePx,
		height: sizePx,
		colorDark: '#000000',
		colorLight: '#ffffff',
		correctLevel: _QRCode.CorrectLevel.L
	})
}

function moduleCountOf(qrObj) {
	// davidshimjs keeps the model on _oQRCode once makeCode() has run
	const n = qrObj?._oQRCode?.getModuleCount?.()
	return (typeof n === 'number' && n > 0) ? n : 0
}

// Render `text` into `el` as large as the viewport sensibly allows, with whole-pixel
// modules. Returns { modules, scale, px } for diagnostics.
function drawQR(el, text, opts = {}) {
	const { maxPx = 320, reservePx = 260, minScale = 2 } = opts

	// pass 1 — any size will do, we only want the module count
	let n = moduleCountOf(buildQR(el, text, 200))
	if (!n) return { modules: 0, scale: 0, px: 200 }   // fall back to what pass 1 drew

	const budget = Math.min(
		maxPx,
		Math.max(240, window.innerWidth - 48),
		Math.max(240, window.innerHeight - reservePx)
	)
	const scale = Math.max(minScale, Math.floor(budget / n))
	const px = n * scale

	// pass 2 — exact multiple, so no module straddles a pixel boundary
	buildQR(el, text, px)
	el.style.setProperty('--kpsign-quiet', (QR_QUIET_MODULES * scale) + 'px')
	return { modules: n, scale, px }
}

// Enlarged QR in a centred overlay — roughly 70% of the shorter viewport edge,
// so it can be scanned from a comfortable distance without taking over the
// whole screen. Backdrop click, ×, or Esc closes it.
function openQRLarge(text, checksum) {
	const ov = document.createElement('div')
	ov.className = 'kpsign-qr-large'
	const card = document.createElement('div')
	card.className = 'kpsign-qr-large-card'
	card.innerHTML = '<button type="button" class="kpsign-qr-large-x" aria-label="Close">&times;</button>'
	const box = document.createElement('div')
	box.className = 'kpsign-qr'
	card.appendChild(box)
	const cap = document.createElement('div')
	cap.className = 'kpsign-qr-large-cap'
	cap.textContent = checksum ? `checksum ${checksum}` : ''
	card.appendChild(cap)
	ov.appendChild(card)
	document.body.appendChild(ov)

	const close = () => {
		ov.remove()
		window.removeEventListener('resize', redraw)
		document.removeEventListener('keydown', onKey)
	}
	const onKey = (e) => { if (e.key === 'Escape') close() }
	const redraw = () => {
		const edge = Math.min(window.innerWidth, window.innerHeight)
		drawQR(box, text, { maxPx: Math.min(640, Math.round(edge * 0.7)), reservePx: 0, minScale: 2 })
	}
	redraw()
	ov.addEventListener('click', (e) => { if (e.target === ov || e.target.classList.contains('kpsign-qr-large-x')) close() })
	document.addEventListener('keydown', onKey)
	window.addEventListener('resize', redraw)
}

// Module-local ref to the davidshimjs QRCode (the one with CorrectLevel).
// We capture it privately so that if the page already has a different QRCode
// library loaded (e.g. the soldair/npm build used by katomia-profile.js which
// has QRCode.toCanvas but no CorrectLevel), we neither mistake it for ours nor
// clobber it permanently.
let _QRCode = null
let qrLibPromise = null
function loadQRCode() {
	// Already have the davidshimjs build captured — nothing to do.
	if (_QRCode) return Promise.resolve()
	// window.QRCode exists but check it's the right build (davidshimjs has CorrectLevel).
	if (window.QRCode?.CorrectLevel?.M !== undefined) {
		_QRCode = window.QRCode
		return Promise.resolve()
	}
	if (qrLibPromise) return qrLibPromise
	qrLibPromise = new Promise((resolve, reject) => {
		// Save whatever QRCode was here before (e.g. soldair) so we can restore it.
		const prev = window.QRCode
		const s = document.createElement('script')
		s.src = new URL('./qrcode.min.js', import.meta.url).href + (V ? `?v=${V}` : '')
		s.onload = () => {
			if (window.QRCode?.CorrectLevel?.M !== undefined) {
				_QRCode = window.QRCode
				// Restore the previous QRCode so other page code (e.g. QRCode.toCanvas)
				// keeps working after we've captured our ref.
				window.QRCode = prev
				resolve()
			} else {
				reject(new Error('qrcode.min.js loaded but QRCode.CorrectLevel.M missing'))
			}
		}
		s.onerror = () => reject(new Error('failed to load qrcode.min.js'))
		document.head.appendChild(s)
	})
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

const defaultReadUrl = ({ network, txid }) => {
	const hapiBase = new URLSearchParams(location.search).get('hapi_base')
	const hapiBaseQS = hapiBase ? `&hapi_base=${encodeURIComponent(hapiBase)}` : ''
	return location.pathname + `?action=txRead&network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}${hapiBaseQS}`
}

async function fetchTx(readUrl, network, txid) {
	const url = readUrl({ network, txid })
	const res = await fetch(url)
	window.showHapiDebug?.(res, 'ksig:txRead')
	if (!res.ok) throw new Error(`txRead failed (${res.status})`)
	return res.json()
}

export async function renderKsig(container, {
	network,
	txid,
	pch = 'no_pch',
	readUrl = defaultReadUrl,
	saveUrl = null,   // SIGN-KSIG-SAVEURL1: host's kpool txSave endpoint; null = same-origin page-relative
	submitSigUrl = DEFAULT_SUBMIT_URL,
	requiredKeys = null,   // KQR2 req= hint: array or () => array of pubkey hex (see buildKqr2)
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

		// Envelope txid comes from the bytes themselves — KSIGN compares the two
		// and refuses on mismatch. The URL txid is only a fallback.
		let bodyTxid = null
		try { bodyTxid = decodeTransaction(bodyBytesHex)?.transactionId || null } catch {}
		const payload = await buildKqr2({ network, txid: bodyTxid || txid, bodyBytesHex, requiredKeys })
		await verifyKqr2(payload.text, bodyBytesHex, bodyTxid)
		const { text: qrText, checksum } = payload

		container.innerHTML = ''

		const qr = document.createElement('div')
		qr.className = 'kpsign-qr'
		container.appendChild(qr)

		const shown = drawQR(qr, qrText)
		kdiag('ksig:qr-size', { ...shown, format: 'KQR2', chars: qrText.length, req: payload.req })

		// Tap/click the QR to blow it up full-screen. On a laptop the modal sits
		// low on the screen and you cannot get a phone close enough without
		// fouling the keyboard — and moving closer just goes below the camera's
		// minimum focus distance and blurs. A big QR is scannable from further
		// back, which fixes both.
		qr.title = 'Tap to enlarge for scanning'
		qr.addEventListener('click', () => openQRLarge(qrText, checksum))

		const cap = document.createElement('div')
		cap.className = 'kpsign-qr-cap'
		cap.textContent = `Scan with the KSIG app · checksum ${checksum} · tap the QR to enlarge`
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

		// blank space so the QR can be scrolled up away from the screen edge
		const tail = document.createElement('div')
		tail.className = 'kpsign-tail'
		container.appendChild(tail)

    scanBtn.addEventListener('click', () =>
			startScanBack({ network, txid, pch, bodyBytesHex, readUrl, saveUrl, submitSigUrl, onSigned, statusEl: status, btnEl: scanBtn })
		)

    kdiag('ksig:qr-rendered', { bytes: bodyBytesHex.length / 2, checksum, pch6: payload.pch6, format: 'KQR2' })

		// Decode the transaction client-side so we can verify what's being signed.
		// Prefer hex2 (full envelope — includes any sigs already attached); fall back
		// to the body bytes we put in the QR (transfers/memo decode either way).
		try {
			const decodeHex = data?.result?.hex2 || bodyBytesHex
			const decoded = decodeTransaction(decodeHex)
			kdiag('ksig:decoded', {
				txid: decoded.transactionId,
				node: decoded.nodeAccountId,
				memo: decoded.memo,
				tokenTransfers: decoded.transfers.tokens,
				hbarTransfers: decoded.transfers.hbar,
				signers: decoded.signers.length
			})
		} catch (e) {
			kdiag('ksig:decode:error', { error: String(e) })
		} 
    
    
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




async function submitSignature({ publicKey, sigHex }, { network, txid, pch, readUrl, saveUrl, onSigned, statusEl }) {
	statusEl.classList.remove('err')
	statusEl.textContent = `Submitting signature …${publicKey.slice(-4)}`

	try {
		// Pull the current pooled transaction (full envelope — includes any signatures
		// already collected) so we MERGE this one in rather than replacing what's there.
		const data = await fetchTx(readUrl, network, txid)
		const hex2 = data?.result?.hex2
		if (!hex2) throw new Error('txRead returned no hex2 to merge into')

		// Splice the scanned signature into the sigMap — producing a full signed tx in
		// the exact shape the WalletConnect signer hands to txSave (which is known to work).
		const signedHex = appendSignature(hex2, publicKey, sigHex)

		// SIGN-KSIG-SAVEURL1: use the host-provided saveUrl (kpool txSave endpoint), the
		// same override readUrl already uses. Off-origin (Katomia embed) the page-relative
		// fallback resolves to the game HTML page, so the POST returned 200 text/html and
		// the signature was silently dropped. saveUrl may be a function (kpay-embed passes
		// futureSaveUrl) or a string; fall back to page-relative for same-origin hosts.
		const resolvedSaveUrl = (typeof saveUrl === 'function') ? saveUrl() : saveUrl
		const hapiBase = new URLSearchParams(location.search).get('hapi_base')
		const hapiBaseQS = hapiBase ? `&hapi_base=${encodeURIComponent(hapiBase)}` : ''
		const postUrl = resolvedSaveUrl || (location.pathname + `?action=txSave${hapiBaseQS}`)
		const payload = {
			network,
			comment: 'KSIG offline',
			response: { signedTransaction: Array.from(hexToBytes(signedHex)) }
		}

		kdiag('ksig:submit:start', {
			url: postUrl, network, txid, pch,
			pubTail: publicKey.slice(-4),
			sigLen: sigHex.length / 2,
			mergedBytes: signedHex.length / 2
		})

		const res = await fetch(postUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		})

		// txSave can return 200 with an empty / non-JSON body — a 200 means saved, so
		// don't treat an unparseable body as failure (same tolerance as the WC signer).
		const text = await res.text().catch(() => '')
		let result = null
		try { result = text ? JSON.parse(text) : null } catch (_) {}

		kdiag('ksig:submit:response', {
			ok: res.ok, status: res.status,
			sigs: result?.result?.sigs?.length ?? null,
			sigsNew: result?.result?.sigsNew?.length ?? null,
			len: text.length, snippet: text.slice(0, 200)
		})

		if (!res.ok) throw new Error(`txSave failed (${res.status})`)

		// SIGN-KSIG-SAVEURL1 guard: a mis-routed POST (e.g. the old page-relative default
		// hitting the Katomia game page) returns 200 text/html. The tolerant "any 200 =
		// saved" rule above then reported a false success and the signature vanished with
		// no error — the exact symptom that made this so hard to diagnose. An HTML body is
		// never a valid txSave response, so treat it as a failure.
		const ct = res.headers.get('content-type') || ''
		if (ct.includes('text/html') || text.trimStart().startsWith('<'))
			throw new Error('txSave returned HTML — wrong endpoint (saveUrl not routed to kpool)')

		statusEl.textContent = `✍️ Signature …${publicKey.slice(-4)} submitted — the approvals list will update shortly.`
		if (typeof onSigned === 'function') onSigned({ publicKey, sigHex })
	} catch (e) {
		statusEl.classList.add('err')
		statusEl.textContent = 'Submit failed — scan again, or use “open in new tab”.'
		kdiag('ksig:submit:error', { error: String(e) })
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
		/* The white padding IS the quiet zone — the spec wants 4 modules all round
		   and davidshimjs draws none. --kpsign-quiet is set by drawQR() to exactly
		   4 modules at the current scale. */
		.kpsign-qr { display:flex; justify-content:center; margin:0 auto; width:max-content;
			background:#fff; padding:var(--kpsign-quiet, 16px); cursor:zoom-in; }
		/* override any theme border-radius so the QR finder squares aren't clipped,
		   and never let a browser smooth the modules when scaling */
		.kpsign-qr img, .kpsign-qr canvas, .kpsign-qr table, .kpsign-qr td {
			display:block; border-radius:0 !important;
			image-rendering:pixelated; image-rendering:crisp-edges; }
		.kpsign-qr-cap { text-align:center; font:12px ui-monospace,Menlo,Consolas,monospace; color:#888; margin-top:6px; }

		/* Scroll room. On a laptop the modal sits low and the QR ends up near the
		   bottom bezel, where a phone can't reach without fouling the keyboard.
		   This lets the QR be scrolled up to a comfortable height. */
		.kpsign-tail { height:55vh; }

		/* Enlarged QR: dimmed backdrop, centred card — not a full-screen takeover. */
		.kpsign-qr-large { position:fixed; inset:0; z-index:2147483000; background:rgba(0,0,0,.55);
			display:flex; align-items:center; justify-content:center; cursor:zoom-out; }
		.kpsign-qr-large-card { position:relative; background:#fff; border-radius:12px; padding:18px 18px 12px;
			box-shadow:0 12px 40px rgba(0,0,0,.35); cursor:default; }
		.kpsign-qr-large-card .kpsign-qr { cursor:default; }
		.kpsign-qr-large-cap { text-align:center; font:13px ui-monospace,Menlo,Consolas,monospace; color:#666; margin-top:8px; }
		.kpsign-qr-large-x { position:absolute; top:2px; right:8px; border:0; background:transparent;
			font-size:28px; line-height:1; color:#666; cursor:pointer; padding:4px 8px; }

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
