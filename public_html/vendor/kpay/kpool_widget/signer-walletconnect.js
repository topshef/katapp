// signer-walletconnect.js
//
// The WalletConnect connect / sign / disconnect controls, relocated out of
// tx_approval.php so the widget modal is self-contained. This calls window.WC
// only — the WalletConnect library (kwcCore/kwcUI) is NOT touched.
//
// Endpoints default to page-relative ?action=txRead / ?action=txSave, which is
// exactly what tx_approval.php used, so behaviour on the OG origin is identical.
// A different host (e.g. Katomia) can override readUrl / saveUrl via opts.
//
// ── TODO(wc-review): tidy up the WalletConnect integration ──────────────────
// Known quirks to revisit when the WC flow gets its proper pass:
//   1. window.WC exposes no connected-network getter, so we can't reliably tell
//      whether the wallet is on the SAME Hedera network as the transaction. The
//      mismatch guard below only fires once kwcCore surfaces getNetwork().
//   2. The WC connect modal can open BELOW our widget modal (z-index handled in
//      modal.js, but builds vary — verify against the live AppKit/Reown bundle).
//   3. Our modal can disappear after a successful connect (a stray click/redirect
//      from the WC flow bubbling to the backdrop). Park until the WC cleanup.
// Keep diagnostics rich here (kdiag(...)) so any of the above is debuggable.

import { kdiag } from './diag.js'

const glog = globalThis.glog ?? (() => {})

function hexToBytes(hex) {
	if (typeof hex !== 'string' || hex.length % 2 !== 0)
		throw new Error('Invalid hex string')

	const bytes = new Uint8Array(hex.length / 2)
	for (let i = 0; i < bytes.length; i++)
		bytes[i] = parseInt(hex.substr(i * 2, 2), 16)

	return bytes
}

const defaultReadUrl = ({ network, txid }) =>
	location.pathname +
	`?action=txRead&network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`

const defaultSaveUrl = () => location.pathname + '?action=txSave'

async function fetchTransactionBytes({ network, txid, readUrl }) {
	const url = readUrl({ network, txid })
	kdiag('signer:bytes:fetch', { url })

	const res = await fetch(url)
	if (!res.ok) throw new Error('Failed to fetch transaction')

	const data = await res.json()
	const hex2 = data?.result?.hex2

	if (!hex2) {
		kdiag('signer:bytes:missing', { errors: data?.result?.errors })
		alert(`error DQ63632 / ${data?.result?.errors?.join?.() || ''}`)
		return null
	}

	kdiag('signer:bytes:ok', { bytes: hex2.length / 2 })
	return hexToBytes(hex2)
}

async function saveSignedTransaction({ network, signedTransactionHex, saveUrl }) {
	const url = saveUrl()

	const payload = {
		network,
		comment: 'YG93845 tracer',
		response: { signedTransaction: Array.from(hexToBytes(signedTransactionHex)) }
	}

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	})

	if (!res.ok) throw new Error(`Failed to save signed transaction (${res.status})`)

	glog('saveSignedTransaction', { network, url, payload })

	// txSave sometimes returns 200 with an empty (or non-JSON) body. A 200 means
	// the signature was saved, so don't treat an unparseable body as an error —
	// that was surfacing as a sporadic "Unexpected end of JSON input".
	const text = await res.text()
	if (!text) {
		kdiag('signer:save:empty-body', { status: res.status })
		return { success: true, result: {} }
	}
	try {
		return JSON.parse(text)
	} catch (e) {
		kdiag('signer:save:bad-json', { status: res.status, snippet: text.slice(0, 120) })
		return { success: true, result: {}, raw: text }
	}
}

async function ensureAccountId() {
	const wc = window.WC
	if (!wc) throw new Error('WC not loaded')

	const existing = await wc.getAccount()
	if (existing) return existing

	return await wc.connect()
}

export function renderWalletConnectSigner(container, {
	network,
	txid,
	readUrl = defaultReadUrl,
	saveUrl = defaultSaveUrl,
	onSigned,
	onAccount
} = {}) {
	injectSignerCSS()

	container.innerHTML = ''
	const wrap = document.createElement('div')
	wrap.className = 'kpsign'
	container.appendChild(wrap)

	const render = async () => {
		const wc = window.WC

		if (!wc) {
			kdiag('signer:render', { hasWC: false })
			wrap.innerHTML = `<div class="kpsign-msg">Wallet unavailable</div>`
			onAccount?.(null)
			return
		}

		// show a placeholder immediately — getAccount() can take a moment, and an
		// empty pane looked like nothing was happening
		wrap.innerHTML = `<div class="kpsign-msg">Checking wallet…</div>`

		let account = null
		try { account = await wc.getAccount() } catch {}

		// Network guard: you can't be connected to mainnet and testnet at once, so
		// if the wallet is on a different network than THIS transaction, signing
		// would fail anyway. Auto-disconnect so the user gets a clean Connect button
		// rather than a confusing failed sign. window.WC has no network getter yet,
		// so this is a no-op until kwcCore exposes getNetwork() — see TODO above.
		try {
			const wcNet = await wc.getNetwork?.()
			if (account && wcNet && wcNet !== network) {
				kdiag('signer:network-mismatch', { wcNet, txNetwork: network, action: 'auto-disconnect' })
				await wc.disconnect()
				account = null
			}
		} catch (err) {
			kdiag('signer:network-check:error', { error: String(err) })
		}

		wrap.innerHTML = ''
		kdiag('signer:render', { hasWC: true, account })
		onAccount?.(account || null)

		// not connected → single Connect button
		if (!account) {
			const btn = document.createElement('button')
			btn.className = 'kpsign-btn'
			btn.textContent = 'Connect'
			btn.onclick = async () => {
				kdiag('signer:connect:click')
				try { await wc.connect(); kdiag('signer:connect:done'); await render() }
				catch (err) { kdiag('signer:connect:error', { error: String(err) }); console.error(err); alert(err.message) }
			}
			wrap.appendChild(btn)
			return
		}

		// connected → account + disconnect + sign
		const row = document.createElement('div')
		row.className = 'kpsign-row'

		const acct = document.createElement('span')
		acct.className = 'kpsign-acct'
		acct.textContent = account

		const disc = document.createElement('button')
		disc.className = 'kpsign-btn kpsign-ghost'
		disc.textContent = '✕'
		disc.title = 'Disconnect'
		disc.onclick = async () => {
			kdiag('signer:disconnect:click')
			try { await wc.disconnect(); kdiag('signer:disconnect:done'); await render() }
			catch (err) { kdiag('signer:disconnect:error', { error: String(err) }); console.error(err); alert(err.message) }
		}

		const sign = document.createElement('button')
		sign.className = 'kpsign-btn'
		sign.textContent = 'Sign now'
		sign.onclick = async () => {
			kdiag('signer:sign:click', { network, txid })
			try {
				if (!wc.signTx) throw new Error('signTx missing (wrong bundle cached)')

				const accountId = await ensureAccountId()
				const transactionBytes = await fetchTransactionBytes({ network, txid, readUrl })
				if (!transactionBytes) return

				const result = await wc.signTx({ accountId, transactionBytes, submitNow: false })
				kdiag('signer:sign:signed', { accountId })

				const saveResult = await saveSignedTransaction({
					network,
					signedTransactionHex: result.signedTransactionHex,
					saveUrl
				})

				kdiag('signer:sign:saved', {
					success: saveResult?.success,
					sigs: saveResult?.result?.sigs?.length ?? null,
					sigsNew: saveResult?.result?.sigsNew?.length ?? null
				})

				if (saveResult?.success) onSigned?.(saveResult)
				else alert(`Sorry, failed to save tx ${network} ${txid}`)

			} catch (err) {
				kdiag('signer:sign:error', { error: String(err) })
				console.error('[signTx] error:', err)
				alert(err.message)
			}
		}

		row.append(acct, disc, sign)
		wrap.appendChild(row)
	}

	render()
	return { refresh: render }
}

let signerCss = false
function injectSignerCSS() {
	if (signerCss) return
	signerCss = true

	const s = document.createElement('style')
	s.textContent = `
		.kpsign { display:flex; justify-content:center; margin:16px 0; }
		.kpsign-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:center; }
		.kpsign-acct { font:13px ui-monospace,Menlo,Consolas,monospace; color:#555; }
		.kpsign-btn { all:revert; padding:6px 16px; border:1px solid #4aa3ff; border-radius:6px;
			background:#eaf4ff; color:#084298; cursor:pointer; font:inherit; }
		.kpsign-btn:hover { background:#d6eaff; }
		.kpsign-ghost { border-color:#ccc; background:#f5f5f5; color:#666; padding:6px 10px; }
		.kpsign-msg { color:#999; font-size:13px; }
	`
	document.head.appendChild(s)
}
