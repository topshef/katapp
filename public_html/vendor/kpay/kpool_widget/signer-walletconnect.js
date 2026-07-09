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

import { kdiag } from './diag.js?v=20260628c'  // shared version tag — keep in sync with ksig.js so both share one diag instance

const glog = globalThis.glog ?? (() => {})

// Persisted active-account selection (step 3). Also the baseline for detecting a
// stale session: if it's set but the bundle reports no connected accounts, the
// session has gone away and we prompt to reconnect.
const LS_ACTIVE = 'kpay.wc.activeAccount'

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
	onAccount,
	signerPreview,   // TX-CARDS-WCPREVIEW1: (accountId) → { state, text } threshold preview
	onLock,    // called before wc.connect() opens its modal — prevents backdrop-close
	onUnlock   // called after wc.connect() resolves (success or error)
} = {}) {
	injectSignerCSS()

	container.innerHTML = ''
	const wrap = document.createElement('div')
	wrap.className = 'kpsign'
	container.appendChild(wrap)

	// Connect button factory — shared by the not-connected and stale-session paths.
	const makeConnectBtn = () => {
		const btn = document.createElement('button')
		btn.className = 'kpsign-btn'
		btn.textContent = 'Connect'
		btn.onclick = async () => {
			// read window.WC at click time — makeConnectBtn lives outside render()'s
			// scope, so it must NOT reference render()'s local `wc` (that was the
			// "wc is not defined" ReferenceError on reconnect).
			const wc = window.WC
			if (!wc) { alert('Wallet not ready yet — please try again in a moment.'); return }
			// progress feedback — the WC relay handshake/modal can take a couple of
			// seconds; without this the button looks dead (WC1).
			const orig = btn.textContent
			btn.textContent = 'Connecting…'; btn.disabled = true
			kdiag('signer:connect:click', { network })
			// WC's ThemeUtil.setTheme() applies --wcm-z-index: "89" as an inline
			// style on <html> during init, which overrides any stylesheet rule.
			// Set our value just before openModal() so the WC modal renders above ours.
			document.documentElement.style.setProperty('--wcm-z-index', '2147483000')
			onLock?.()
			const _t = (performance || Date).now()
			try {
				await wc.connect()
				kdiag('signer:connect:done', { network, ms: Math.round((performance || Date).now() - _t) })
				await render()   // replaces the button on success
			} catch (err) {
				kdiag('signer:connect:error', { error: String(err), network, ms: Math.round((performance || Date).now() - _t) })
				console.error(err)
				alert(err.message)
				btn.textContent = orig; btn.disabled = false
			} finally {
				onUnlock?.()
			}
		}
		return btn
	}

	const render = async () => {
		const wc = window.WC

		if (!wc) {
			kdiag('signer:render', { hasWC: false })
			wrap.innerHTML = `<div class="kpsign-msg">Wallet unavailable</div>`
			onAccount?.(null, [])
			return
		}

		// step 2/3: prefer the multi-account API when the live bundle provides it.
		// Falls back to the single-account path on older bundles (A/B via
		// ?kwc_version=…), so nothing breaks during comparison testing.
		const hasMulti =
			typeof wc.getAccounts === 'function' &&
			typeof wc.setActiveAccount === 'function' &&
			typeof wc.getActiveAccount === 'function'

		// step 5: scope the WC connector to THIS tx's network BEFORE listing/connecting,
		// so a mainnet-loaded bundle doesn't show/connect mainnet accounts for a testnet
		// tx (and vice versa). ensureNetwork rebuilds the connector if the network differs.
		try {
			if (typeof wc.ensureNetwork === 'function') {
				const _t = (performance || Date).now()
				await wc.ensureNetwork(network)   // builds/relays the connector for this tx's network
				kdiag('signer:ensure-network', { network, ms: Math.round((performance || Date).now() - _t) })
			}
		} catch (err) { kdiag('signer:ensure-network:error', { network, error: String(err) }) }

		// active-account memory is per-network (mainnet/testnet are different account sets)
		const lsActive = `${LS_ACTIVE}.${network || 'mainnet'}`

		// show a placeholder immediately — the lookups can take a moment, and an
		// empty pane looked like nothing was happening
		wrap.innerHTML = `<div class="kpsign-msg">Checking wallet…</div>`

		let accounts = []
		let account = null
		try {
			if (hasMulti) {
				accounts = (await wc.getAccounts()) || []   // already network-filtered in the bundle
			} else {
				account = await wc.getAccount()
				if (account) accounts = [account]
			}
		} catch (err) {
			kdiag('signer:accounts:error', { error: String(err) })
		}

		// Session-staleness: a session was believed live (we persisted the active
		// account) but no accounts come back now — e.g. after a bundle swap or an
		// expired/dropped WC session. Surface it instead of a silent dead state.
		let savedActive = null
		try { savedActive = localStorage.getItem(lsActive) } catch {}
		let stale = false
		if (hasMulti && accounts.length === 0 && savedActive) {
			stale = true
			try { localStorage.removeItem(lsActive) } catch {}
			kdiag('signer:session-stale', { savedActive })
		}

		// restore a previously-chosen account (multi only), then read the active one
		if (hasMulti && accounts.length) {
			if (savedActive && accounts.includes(savedActive)) {
				try { await wc.setActiveAccount(savedActive) } catch {}
			}
			try { account = await wc.getActiveAccount() } catch {}
			if (!account) account = accounts[0]
		}

		// Network safety belt (mainly for OLD bundles without ensureNetwork): if the
		// connector still reports a different network than the tx, drop the accounts so
		// we never show/sign a wrong-network account.
		try {
			const wcNet = await wc.getNetwork?.()
			if (wcNet && account && wcNet !== network) {
				kdiag('signer:network-mismatch', { wcNet, txNetwork: network, action: 'hide-accounts' })
				account = null; accounts = []
			}
		} catch (err) {
			kdiag('signer:network-check:error', { error: String(err) })
		}

		wrap.innerHTML = ''
		kdiag('signer:render', { hasWC: true, hasMulti, account, accounts: accounts.length, stale, network })
		onAccount?.(account || null, accounts)   // pass the full connected list for the (u) marker

		// not connected → (stale note +) Connect button
		if (!account) {
			if (stale) {
				const note = document.createElement('div')
				note.className = 'kpsign-msg kpsign-stale'
				note.textContent = 'Wallet session expired — please reconnect.'
				wrap.appendChild(note)
			}
			wrap.appendChild(makeConnectBtn())
			return
		}

		// remember the active account so staleness has a baseline next time
		try { localStorage.setItem(lsActive, account) } catch {}

		// connected → [account dropdown (+ "connect another")] [✕ selected] [Sign now]
		const row = document.createElement('div')
		row.className = 'kpsign-row'

		// Network prefix for clarity (we offer both networks). Mainnet = no prefix
		// (the default); testnet/previewnet are prefixed so it's obvious which network
		// the account/tx is on. The accounts shown are for this tx's network.
		const label = id => (network && network !== 'mainnet') ? `${network}:${id}` : id
		const ADD_NEW = '__wc_add_account__'

		let acct
		if (hasMulti) {
			// dropdown of connected accounts + a final "connect another" option. Built-in
			// <select> works well on mobile. Switching sets the active signer.
			acct = document.createElement('select')
			acct.className = 'kpsign-acct kpsign-select'
			acct.title = 'Signing account'
			accounts.forEach(id => {
				const opt = document.createElement('option')
				opt.value = id
				opt.textContent = label(id)
				if (id === account) opt.selected = true
				acct.appendChild(opt)
			})
			const addOpt = document.createElement('option')
			addOpt.value = ADD_NEW
			addOpt.textContent = '➕ Connect another account…'
			acct.appendChild(addOpt)

			acct.onchange = async () => {
				const id = acct.value
				if (id === ADD_NEW) {
					acct.value = account   // revert the visible selection; connect re-renders
					kdiag('signer:connect:add', { network })
					document.documentElement.style.setProperty('--wcm-z-index', '2147483000')
					onLock?.()
					try { await wc.connect(); kdiag('signer:connect:add:done'); await render() }
					catch (err) { kdiag('signer:connect:add:error', { error: String(err) }); console.error(err); if (err?.message) alert(err.message) }
					finally { onUnlock?.() }
					return
				}
				kdiag('signer:account:switch', { to: id })
				try {
					await wc.setActiveAccount(id)
					try { localStorage.setItem(lsActive, id) } catch {}
					onAccount?.(id)
				} catch (err) {
					kdiag('signer:account:switch:error', { error: String(err) })
					alert(err.message)
					await render()
				}
			}
		} else {
			// older bundle (A/B via ?kwc_version) without the multi API → plain label
			acct = document.createElement('span')
			acct.className = 'kpsign-acct'
			acct.textContent = label(account)
		}

		// ✕ disconnects the SELECTED account, leaving the others. On older bundles
		// without disconnectAccount it falls back to disconnect-all.
		const disc = document.createElement('button')
		disc.className = 'kpsign-btn kpsign-ghost'
		disc.textContent = '✕'
		disc.title = 'Disconnect this account'
		disc.onclick = async () => {
			const selected = (hasMulti && acct.value && acct.value !== ADD_NEW) ? acct.value : account
			kdiag('signer:disconnect:click', { account: selected })
			try {
				if (hasMulti && typeof wc.disconnectAccount === 'function') {
					await wc.disconnectAccount(selected)
				} else {
					await wc.disconnect()
				}
				// clear the persisted selection if it was the one we just removed, so a
				// deliberate "disconnect all" lands on the plain Connect button (not the
				// stale-session prompt)
				try { if (localStorage.getItem(lsActive) === selected) localStorage.removeItem(lsActive) } catch {}
				kdiag('signer:disconnect:done', { account: selected })
				await render()
			} catch (err) {
				kdiag('signer:disconnect:error', { error: String(err) }); console.error(err); alert(err.message)
			}
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

		// TX-CARDS-WCPREVIEW1: banner under the picker saying what signing the SELECTED
		// account does for this tx (needed / not needed / completes the threshold).
		const preview = document.createElement('div')
		preview.className = 'kpsign-preview'
		wrap.appendChild(preview)
		const updatePreview = (id) => {
			if (typeof signerPreview !== 'function') { preview.style.display = 'none'; return }
			const p = signerPreview(id) || {}
			if (!p.text || p.state === 'loading') { preview.style.display = 'none'; return }
			preview.dataset.state = p.state
			preview.textContent = (p.state === 'completes' ? '✅ ' : p.state === 'not-needed' ? 'ℹ️ ' : '✍️ ') + p.text
			preview.style.display = ''
		}
		updatePreview(hasMulti ? acct.value : account)
		if (hasMulti) acct.addEventListener('change', () => { if (acct.value !== ADD_NEW) updatePreview(acct.value) })
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
		/* TX-CARDS-WCPREVIEW1: threshold preview under the account picker */
		.kpsign-preview { text-align:center; font-size:12px; margin:8px auto 0; max-width:340px; line-height:1.4; }
		.kpsign-preview[data-state="completes"] { color:#137333; font-weight:600; }
		.kpsign-preview[data-state="needed"] { color:#52525b; }
		.kpsign-preview[data-state="already"] { color:#52525b; }
		.kpsign-preview[data-state="not-needed"] { color:#9aa0a6; }
		.kpsign-btn { all:revert; padding:6px 16px; border:1px solid #4aa3ff; border-radius:6px;
			background:#eaf4ff; color:#084298; cursor:pointer; font:inherit; }
		.kpsign-btn:hover { background:#d6eaff; }
		.kpsign-ghost { border-color:#ccc; background:#f5f5f5; color:#666; padding:6px 10px; }
		.kpsign-msg { color:#999; font-size:13px; }
		.kpsign-select { all:revert; font:13px ui-monospace,Menlo,Consolas,monospace; color:#555;
			padding:5px 8px; border:1px solid #ccc; border-radius:6px; background:#fff; max-width:260px; }
		.kpsign-stale { color:#b54708; margin-bottom:8px; }
	`
	document.head.appendChild(s)
}
