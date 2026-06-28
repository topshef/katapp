// diag.js — tiny diagnostics ring buffer for the kpool widget.
//
// Captures flow events, mirrors them to console and to glog (if the host page
// loaded it), and lets you copy them out to paste into a bug report.
//
//   import { kdiag } from './diag.js'
//   kdiag('signer:sign:click', { network, txid })
//
// From the browser console:
//   kdiag.dump()    -> returns the whole log as text (and console.logs it)
//   kdiag.copy()    -> copies that text to the clipboard
//   kdiag.clear()   -> empties the buffer

const BUFFER = []
const MAX = 500

// ── remote flushing ───────────────────────────────────────────────────────────
// Persisted opt-in via localStorage key 'kdiag_remote' = '1'.
// Override precedence (highest first):
//   ?kdiag=1 / ?kdiag=0  URL param (sets localStorage, survives navigation)
//   localStorage 'kdiag_remote'
//   window.__KDIAG_REMOTE  (page-level flag, legacy)
//
// Toggle at runtime: kdiag.setRemote(true/false)
// From the Katomia profile modal: checkbox wired to kdiag.setRemote()
// From any browser console on any page: kdiag.setRemote(true)

const LS_KEY = 'kdiag_remote'

const UNSENT = []
let _remoteUrl     = null
let _flushTimer    = false
let _flushInterval = null

function enableRemote(urlOrFlag) {
	_remoteUrl = (typeof urlOrFlag === 'string') ? urlOrFlag : '/diag'
	if (!_flushInterval) {
		_flushInterval = setInterval(flushRemote, 60_000)
		window.addEventListener('pagehide', flushRemote)
	}
}

function disableRemote() {
	_remoteUrl = null
	if (_flushInterval) { clearInterval(_flushInterval); _flushInterval = null }
	if (_flushTimer)    { clearTimeout(_flushTimer);     _flushTimer = false }
}

function setRemote(on, url) {
	if (on) {
		try { localStorage.setItem(LS_KEY, '1') } catch {}
		enableRemote(url || '/diag')
	} else {
		try { localStorage.removeItem(LS_KEY) } catch {}
		disableRemote()
	}
}

function scheduleFlush(delayMs = 1000) {
	if (_flushTimer || !_remoteUrl) return
	_flushTimer = setTimeout(() => { _flushTimer = false; flushRemote() }, delayMs)
}

function flushRemote() {
	if (!_remoteUrl || !UNSENT.length) return
	const batch   = UNSENT.splice(0, 200)
	const payload = JSON.stringify({
		events: batch,
		page:   location.pathname,
		ua:     navigator.userAgent.slice(0, 200)
	})
	const blob = new Blob([payload], { type: 'application/json' })
	if (navigator.sendBeacon?.(_remoteUrl, blob)) return
	// sendBeacon unavailable or returned false — fall back to fetch
	fetch(_remoteUrl, { method: 'POST', body: blob, keepalive: true }).catch(() => {})
}

export function kdiag(msg, data) {
	const entry = {
		t: new Date().toISOString(),
		msg,
		data: data === undefined ? undefined : safe(data)
	}

	BUFFER.push(entry)
	if (BUFFER.length > MAX) BUFFER.shift()

	if (_remoteUrl) {
		UNSENT.push(entry)
		// flush promptly so events show up within a short (mobile) session: errors
		// almost immediately, everything else on a short debounce.
		scheduleFlush(/error|Error|rejection/.test(msg) ? 1000 : 3000)
	}

	// mirror out — console for live debugging, glog for the host's own log store
	try { console.debug('[kdiag]', msg, data ?? '') } catch {}
	try { globalThis.glog?.(msg, data) } catch {}

	return entry
}

function safe(v) {
	try { return JSON.parse(JSON.stringify(v)) } catch { return String(v) }
}

function dump() {
	const text = BUFFER.map(e => {
		if (e.dom) return `${e.t}  ${e.msg}\n<dom>\n${e.dom}\n</dom>`
		return `${e.t}  ${e.msg}${e.data !== undefined ? '  ' + JSON.stringify(e.data) : ''}`
	}).join('\n')
	console.log(text)
	return text
}

async function copy() {
	const text = dump()
	try {
		await navigator.clipboard.writeText(text)
		console.log('[kdiag] copied to clipboard')
	} catch (e) {
		console.warn('[kdiag] clipboard write failed — text returned instead', e)
	}
	return text
}

// capture a DOM snapshot (outerHTML) for UI debugging
function dom(el, label = 'dom') {
	if (!el) return
	BUFFER.push({ t: new Date().toISOString(), msg: `DOM:${label}`, dom: el.outerHTML })
	if (BUFFER.length > MAX) BUFFER.shift()
}

function clear() { BUFFER.length = 0 }

// capture uncaught errors and console.error/warn into the buffer so the
// diagnostics copy includes them (install once).
function installCapture() {
	if (typeof window === 'undefined' || window.__kdiagCapture) return
	window.__kdiagCapture = true

	window.addEventListener('error', e => {
		kdiag('window:error', {
			message: e.message,
			src: String(e.filename || '').split('/').pop(),
			line: e.lineno, col: e.colno
		})
	})
	window.addEventListener('unhandledrejection', e => {
		kdiag('window:unhandledrejection', { reason: String(e.reason) })
	})

	;['error', 'warn'].forEach(level => {
		const orig = console[level] ? console[level].bind(console) : () => {}
		console[level] = (...args) => {
			try {
				kdiag(`console:${level}`, {
					args: args.map(a =>
						a instanceof Error ? (a.stack || a.message)
						: typeof a === 'object' ? safe(a)
						: String(a))
				})
			} catch {}
			orig(...args)
		}
	})
}

// expose for console use: callable AND with helpers attached
if (typeof window !== 'undefined') {
	window.kdiag = Object.assign(
		(msg, data) => kdiag(msg, data),
		{ dump, copy, clear, dom, buffer: BUFFER,
		  enableRemote, disableRemote, setRemote, flush: flushRemote }
	)
}

installCapture()

// Rapid-iteration: default remote flushing ON so widget-side events (signer:*,
// window:error, etc.) reach /diag without an explicit opt-in — mirrors the katomia
// frontend's DIAG_DEFAULT_ON. Opt out with ?kdiag=0 or localStorage kdiag_remote=0.
// TODO: flip back to false alongside the katomia DIAG_DEFAULT_ON when leaving
// rapid-iteration (see katomia TODO).
const DIAG_DEFAULT_ON = true

// Auto-init precedence: URL param > localStorage > page flag > default.
if (typeof window !== 'undefined') {
	const urlParam = new URLSearchParams(location.search).get('kdiag')
	let ls = null
	try { ls = localStorage.getItem(LS_KEY) } catch {}
	if      (urlParam === '1')             setRemote(true)
	else if (urlParam === '0')             setRemote(false)
	else if (ls === '1')                   enableRemote('/diag')
	else if (ls === '0')                   disableRemote()
	else if (globalThis.__KDIAG_REMOTE)    enableRemote(globalThis.__KDIAG_REMOTE)
	else if (DIAG_DEFAULT_ON)              enableRemote('/diag')
}
