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
	const text = BUFFER.map(e =>
		`${e.t}  ${e.msg}${e.data !== undefined ? '  ' + JSON.stringify(e.data) : ''}`
	).join('\n')
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

function clear() { BUFFER.length = 0 }

// expose for console use: callable AND with helpers attached
if (typeof window !== 'undefined') {
	window.kdiag = Object.assign(
		(msg, data) => kdiag(msg, data),
		{ dump, copy, clear, buffer: BUFFER }
	)
}
