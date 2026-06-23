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

export function kdiag(msg, data) {
	const entry = {
		t: new Date().toISOString(),
		msg,
		data: data === undefined ? undefined : safe(data)
	}

	BUFFER.push(entry)
	if (BUFFER.length > MAX) BUFFER.shift()

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
		{ dump, copy, clear, dom, buffer: BUFFER }
	)
}

installCapture()
