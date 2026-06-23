// signer-walletconnect.js
//
// The WalletConnect connect / sign / disconnect controls, relocated out of
// tx_approval.php so the widget modal is self-contained. This calls window.WC
// only — the WalletConnect library (kwcCore/kwcUI) is NOT touched.
//
// Endpoints default to page-relative ?action=txRead / ?action=txSave, which is
// exactly what tx_approval.php used, so behaviour on the OG origin is identical.
// A different host (e.g. Katomia) can override readUrl / saveUrl via opts.

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
	return res.json()
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
	onSigned
} = {}) {
	injectSignerCSS()

	container.innerHTML = ''
	const wrap = document.createElement('div')
	wrap.className = 'kpsign'
	container.appendChild(wrap)

	const render = async () => {
		const wc = window.WC
		wrap.innerHTML = ''

		if (!wc) {
			kdiag('signer:render', { hasWC: false })
			wrap.innerHTML = `<div class="kpsign-msg">Wallet unavailable</div>`
			return
		}

		let account = null
		try { account = await wc.getAccount() } catch {}

		kdiag('signer:render', { hasWC: true, account })

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
