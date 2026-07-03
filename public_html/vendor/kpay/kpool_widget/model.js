// model.js

	import {
		parseTxId,
		isHederaSystemAccount,
	} from './utils.js'

import { getAccountInfo, getKeyInfo, getTokenInfo} from './hedera-mirror.js'

import { getThresholdSummary } from './threshold.js'
import { normalizePublicKey, normalizeKeyTree } from './keynorm.js'
import { getAccountLabel } from './xproof.js'

const glog = globalThis.glog ?? (() => {})


export async function txRead({ network, txid, pch = 'no_pch' }) { //todo pch

  // const hapiBase = window.__HAPI_BASE__ || 0  //works but only needed for kpos
	// const url = `https://kpos.uk/pool/txRead?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}&detail=1&endpoint=${hapiBase}`
	// const url = `/m/bid/explore/kpool.php?action=txRead&network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}&detail=1`
	const url = `/m/bid/explore/kpool?action=txRead&network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}&detail=1`

	const res = await fetch(url)
	if (!res.ok) {
		throw new Error(`txRead failed (${res.status})`)
	}

	const rawTx = await res.json()
	const data = rawTx.result
	if (!data) return {url, rawTx, data}
			
	// enforce canonical identity
	if (data.network && data.network !== network) {
		throw new Error(`Network mismatch: expected ${network}, got ${data.network}`)
	}

	if (data.txid && data.txid !== txid) {
		throw new Error(`TxID mismatch: expected ${txid}, got ${data.txid}`)
	}

	if (data.comboStatus)
		localStorage.setItem(`tx_status:${network};${txid};${pch}`, data.comboStatus)

	//todo handle PCH pre-consensus hash

	// ensure these fields always exist
	data.network = network
	data.txid = txid

	const transfers = getAllTransfers(data)
	const accounts = getAccountsWithRoles({ transfers, txid })
			
	glog("txRead data=",data)
	glog("txRead other=",{transfers, accounts, rawTx, url})
	return {
		url,
		rawTx,  // for debug.. avoid using this downstream
		data,
		transfers,
		accounts
	}
}

// function getTxStatus.. nah put it in hapi upstream

// Fee-noise suppression, intent-aware (per user 2026-07-03). Low-numbered accounts
// (<98: node accounts etc.) show up in SETTLED mirror transfers because Hedera pays
// them fees on every tx — pure clutter, so they're suppressed BY DEFAULT. But if the
// INTENT (the deal / PCH-basis transfer lists, which never contain fee entries — fees
// only materialise at execution) explicitly moves value in or out of such an account,
// that's a real transfer the user asked for → show it. Pre-consensus sources are
// intent by definition, so nothing is ever suppressed there. Known blind spot: a
// settled tx viewed WITHOUT its basis/deal in the payload can't tell an intended
// low-account transfer from fee noise and falls back to suppressing — fine for now.
function skipFeeNoiseAccount(ac, intentAccounts) {
  if (!ac) return true
  const num = Number(String(ac).split('.').pop())
  return num < 98 && !intentAccounts.has(String(ac))
}

// every account named by the intent's own transfer lists (hbar/token/nft, deal + basis
// shapes), so skipFeeNoiseAccount can whitelist them
function getIntentAccounts(basis, deal) {
  const set = new Set()
  const lists = [
    basis.hbarTransfers, deal.addHbarTransfer,
    basis.tokenTransfers, deal.addTokenTransfer,
    basis.nftTransfers, deal.addNftTransfer
  ]
  for (const list of lists) (list || []).forEach(x => {
    for (const a of [
      x.accountId ?? x.account,
      x.sender ?? x.senderAccountId ?? x.sender_account_id,
      x.receiver ?? x.receiverAccountId ?? x.receiver_account_id
    ]) if (a != null) set.add(String(a))
  })
  return set
}


// ┌─┐┌─┐┌┬┐  ╔═╗┬  ┬    ╔╦╗┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┬─┐┌─┐
// │ ┬├┤  │   ╠═╣│  │     ║ ├┬┘├─┤│││└─┐├┤ ├┤ ├┬┘└─┐
// └─┘└─┘ ┴   ╩ ╩┴─┘┴─┘   ╩ ┴└─┴ ┴┘└┘└─┘└  └─┘┴└─└─┘
// get All Transfers	
function getAllTransfers(data) {
	const mirrorTx = data.mirror?.transactions?.[0] || {}
	const deal     = data.deal || {}
  const basis    = data.PCH_basis?.transfers || deal.pchbasis?.transfers || {}

	const sources = {
    hbar:  mirrorTx.transfers        ? 'mirror'
         : basis.hbarTransfers     ? 'basis'
         : deal.addHbarTransfer    ? 'deal'
         : 'none',

    token: mirrorTx.token_transfers  ? 'mirror'
         : basis.tokenTransfers    ? 'basis'
         : deal.addTokenTransfer   ? 'deal'
         : 'none',

    nft:   mirrorTx.nft_transfers    ? 'mirror'
         : basis.nftTransfers      ? 'basis'
         : deal.addNftTransfer     ? 'deal'
         : 'none'
  }

	const uniqueSources = new Set(Object.values(sources))
	if (uniqueSources.size > 1) {
		throw new Error('YU83743 Mixed transfer sources detected')
		window.alert('Error YU83743 Mixed transfer sources detected.')
	}
	
	const raw = {
    hbar:  mirrorTx.transfers       || basis.hbarTransfers  || deal.addHbarTransfer  || [],
    token: mirrorTx.token_transfers || basis.tokenTransfers || deal.addTokenTransfer || [],
    nft:   mirrorTx.nft_transfers   || basis.nftTransfers   || deal.addNftTransfer   || []
  }


	// glog({raw})
	const lineItems = []
	const intentAccounts = getIntentAccounts(basis, deal)

	// HBAR
	raw.hbar.forEach(x => {
		const ac = x.accountId ?? x.account
		if (skipFeeNoiseAccount(ac, intentAccounts)) return

    lineItems.push({
      type:'HBAR',
      account:ac,
      asset:'tinybar',
      amountRaw:x.value ?? x.amount,
      amount:x.value ?? x.amount
      // amount:Number(x.value ?? x.amount)/100000000
    })
	})

 
	// Fungible tokens
	raw.token.forEach(x => {
		lineItems.push({
			type: 'FT',
			account: x.accountId ?? x.account,
			asset: x.tokenId ?? x.token_id,
			amount: x.value ?? x.amount
		})
	})
	
	// NFTs (explicit debit/credit)
	raw.nft.forEach(x => {
		const tokenId  = x.tokenId  ?? x.token_id
		const serial   = x.serial   ?? x.serialNumber   ?? x.serial_number
		const sender   = x.sender   ?? x.senderAccountId   ?? x.sender_account_id
		const receiver = x.receiver ?? x.receiverAccountId ?? x.receiver_account_id

		const asset = `${tokenId} #${serial}`

		lineItems.push({
			type: 'NFT',
			account: sender,
			asset,
			amount: -1,
			serial,
			tokenId
		})

		lineItems.push({
			type: 'NFT',
			account: receiver,
			asset,
			amount: +1,
			serial,
			tokenId
		})
	})
	
	// glog({mirrorTx, deal, raw, lineItems})
	
	return {
		raw,        // original shapes, grouped
		lineItems  // accounting-friendly flat list
	}
}


function getAccountsWithRoles({ transfers, txid }) {
	const accounts = {}

	const addRole = (accountId, role) => {
		if (!accountId) return
		if (!accounts[accountId]) {
			accounts[accountId] = { roles: [] }
		}
		if (!accounts[accountId].roles.includes(role)) {
			accounts[accountId].roles.push(role)
		}
	}

	// operator from txid
	const parsed = parseTxId(txid)
	if (parsed?.operatorId) {
		addRole(parsed.operatorId, 'operator')
	}

	// roles from transfers
	transfers.lineItems.forEach(x => {
		if (x.amount < 0) addRole(x.account, 'sender')
		if (x.amount > 0) addRole(x.account, 'receiver')
	})

	return accounts
}


// ┌┐ ┬ ┬┬┬  ┌┬┐  ╔═╗┬  ┌─┐┬ ┬  ╔╦╗┌─┐┌┬┐┌─┐┬
// ├┴┐│ │││   ││  ╠╣ │  │ ││││  ║║║│ │ ││├┤ │
// └─┘└─┘┴┴─┘─┴┘  ╚  ┴─┘└─┘└┴┘  ╩ ╩└─┘─┴┘└─┘┴─┘
// buildFlowModel — normalized, view-agnostic shape derived from the (enriched)
// transfer lineItems + accounts map. The ONE seam every tx view consumes: the
// flat table today, cards/flow/rings later (TX-CARDS) — and the seam PROTO1
// feeds once lineItems come from the decoded protobuf instead of the backend.
//
//   lineItems : passthrough — the SAME array/order the table renders from
//   accounts  : [{ id, label, mustSign, roles, send:[item], receive:[item] }]
//   pools     : [{ asset, assetMeta, senders:[id], receivers:[id] }]  fungible netting (HBAR/FT)
//   edges     : [{ asset, assetMeta, tokenId, serial, from, to }]     NFT exact sender→receiver
//
// Fungible flow is NET per-account deltas — there are no real per-pair edges,
// so it's modelled as a pool (all senders → pool → all receivers), never an
// invented A→B pairing (per PROJECT_RULES: that would be debug-only). NFTs carry
// explicit sender/receiver, so those become exact edges. (TX-CARDS1)
export function buildFlowModel(transfers, accounts = {}) {
	const lineItems = transfers?.lineItems || []

	// per-account send/receive split by sign of amount
	const byAccount = {}
	const acct = id => (byAccount[id] ||= {
		id,
		label: accounts[id]?.label,
		mustSign: accounts[id]?.mustSign,
		roles: accounts[id]?.roles || [],
		send: [], receive: []
	})
	lineItems.forEach(item => {
		if (!item.account) return
		const a = acct(item.account)
		;(item.amount < 0 ? a.send : a.receive).push(item)
	})

	// fungible pools (HBAR + FT; LE is an FT subtype) — group by asset, dedupe accounts by side
	const poolMap = {}
	lineItems.filter(x => x.type === 'HBAR' || x.type === 'FT').forEach(item => {
		const p = (poolMap[item.asset] ||= { asset: item.asset, assetMeta: item.assetMeta, senders: [], receivers: [] })
		const side = item.amount < 0 ? p.senders : p.receivers
		if (item.account && !side.includes(item.account)) side.push(item.account)
	})

	// NFT edges — pair the −1 (sender) and +1 (receiver) rows by tokenId+serial
	const edgeMap = {}
	lineItems.filter(x => x.type === 'NFT').forEach(item => {
		const key = `${item.tokenId}#${item.serial}`
		const e = (edgeMap[key] ||= { asset: item.asset, assetMeta: item.assetMeta, tokenId: item.tokenId, serial: item.serial, from: null, to: null })
		if (item.amount < 0) e.from = item.account
		else e.to = item.account
	})

	const result = { lineItems, accounts: Object.values(byAccount), pools: Object.values(poolMap), edges: Object.values(edgeMap) }

	// fail-loud visibility: a tx with transfers that produced no accounts means the
	// shape changed under us (e.g. post-PROTO1) — surface it rather than render blank.
	// kdiag (not just glog) so the remote sink proves which build is actually running
	// and that this seam executed at all (TX-CARDS1 version fingerprint).
	const summary = { items: lineItems.length, accounts: result.accounts.length, pools: result.pools.length, edges: result.edges.length }
	glog('buildFlowModel', summary)
	try { globalThis.kdiag?.(result.accounts.length ? 'flowmodel:built' : 'flowmodel:empty', summary) } catch {}

	return result
}


export async function enrichAccountsInfo({ network, accounts }) {
	const entries = Object.entries(accounts)

	await Promise.all(entries.map(async ([accountId, acc]) => {
		try {
			const info = await getAccountInfo(network, accountId)
			acc.info = info
      acc.label=await getAccountLabel(network,accountId)
		} catch (err) {
			acc.infoError = err.message || String(err)
		}
	}))
}


export async function enrichAccountsKeyInfo({ network, accounts }) {
	const entries = Object.entries(accounts)

	await Promise.all(entries.map(async ([accountId, acc]) => {
		// Hedera system accounts (e.g. 0.0.802 fee/reward collector) have no retrievable
		// account key and never sign — skip enrichment so we don't fire a doomed mirror
		// lookup or flag a false keyInfoError. The view skips their row too. (KEYINFO-LOCAL1)
		if (isHederaSystemAccount(accountId)) {
			acc.isSystemAccount = true
			return
		}
		try {
			const keyInfo = await getKeyInfo(network, accountId)
			acc.keyInfo = keyInfo
			glog('KEYINFO RAW', accountId, keyInfo)

			// Normalize single-key shape
			if (typeof acc.keyInfo === 'string') {
				const pubkey = acc.keyInfo

				acc.keyInfo = {
					threshold: 1,
					keys: [pubkey],
					banzhafScores: {
						scores: { [pubkey]: 1 },
						redundancy: { [pubkey]: 0 }
					},
					keyControlScoresAll: {
						[pubkey]: { bucket: 'full-exclusive' }
					}
				}
			}			
			
			
		} catch (err) {
			acc.keyInfo = null
			acc.keyInfoError = err.message || String(err)
			// KEYINFO-LOCAL1: surface the REAL reason in /diag (no longer a kpos timeout —
			// key structure now comes from the mirror node + local protobuf decode).
			try { globalThis.kdiag?.('keyinfo:error', { accountId, error: acc.keyInfoError }) } catch {}
		}
	}))
}


export function calcAccountsThatSign(accounts) {
	Object.values(accounts).forEach(acc => {
		const roles = acc.roles || []

		const isOperator = roles.includes('operator')
		const isSender = roles.includes('sender')
		const isReceiverNeedingSig =
			roles.includes('receiver') &&
			acc.info &&
			acc.info.receiver_sig_required === true

		acc.mustSign = isOperator || isSender || isReceiverNeedingSig
    
		acc.mustSignReason=[
			isOperator && 'operator',
			isSender && 'sender',
			isReceiverNeedingSig && 'receiver_sig_required'
		].filter(Boolean)
    
	})
}

// ┌─┐┌┐┌┬─┐┬┌─┐┬ ┬  ╔╦╗┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┬─┐┌─┐  ╦┌┐┌┌─┐┌─┐
// ├┤ │││├┬┘││  ├─┤   ║ ├┬┘├─┤│││└─┐├┤ ├┤ ├┬┘└─┐  ║│││├┤ │ │
// └─┘┘└┘┴└─┴└─┘┴ ┴   ╩ ┴└─┴ ┴┘└┘└─┘└  └─┘┴└─└─┘  ╩┘└┘└  └─┘
// enrich Transfers Info

export async function enrichTransfersInfo({ network, transfers }) {

  const tokenIds = [
    ...new Set(
      transfers.lineItems
        .filter(x => x.type == 'FT' || x.type == 'NFT')
        .map(x => x.tokenId ?? x.asset)
    )
  ]

  const tokenInfo = {}

  await Promise.all(
    tokenIds.map(async tokenId => {
      tokenInfo[tokenId] =
        await getTokenInfo(network, tokenId)
    })
  )

  transfers.lineItems.forEach(item => {

    // if(item.type == 'HBAR') {
      // item.amountRaw = item.amount * 100000000
      // item.amountFormatted = item.amount
      // item.assetMeta = {raw:'tinybar',name:'HBAR',symbol:'HBAR',decimals:8}
      // return
    // }
    
    if(item.type == 'HBAR') {
      item.amountRaw = Number(item.amountRaw ?? item.amount)
      item.amountFormatted = Number(item.amountRaw) / 100000000
      item.assetMeta = {raw:'tinybar',name:'HBAR',symbol:'HBAR',decimals:8}
      return
    }
    
    if(item.type != 'FT' && item.type != 'NFT') return

    const info = tokenInfo[item.tokenId ?? item.asset]

    if(item.type == 'NFT') {
      item.amountRaw = item.amount
      item.amountFormatted = item.amount
      item.assetMeta = {raw:item.tokenId,name:info?.name,symbol:info?.symbol,serial:item.serial,assetClass:'NFT'}
      return
    }

    item.amountRaw = item.amount

    const decimals = info?.decimals ?? 0

    item.amountFormatted =
      Number(item.amount) /
      (10 ** decimals)

    item.assetMeta = {
      raw:item.asset,
      name:info?.name,
      symbol:info?.symbol,
      decimals:info?.decimals,
      assetClass:getAssetClass(info)

    }


  })
}


function getAssetClass(token){

	if(token?.type == 'NON_FUNGIBLE_UNIQUE')
		return 'NFT'

	if(token?.type == 'FUNGIBLE_COMMON' && token?.decimals == 0 && Number(token?.total_supply) <= 10000)
		return 'LE'

	return 'FT'
}



export function evaluateTxReadiness({accounts,data}){

	// Key normalisation (prefix stripping + tree flattening) lives in keynorm.js —
	// the ONE copy shared with view.js so readiness and the per-account pie can never
	// diverge again (was WC-ECDSA1 pt2 / SIGN-NORM1).
	const signedPubkeys = (data.sigs || [])
		.map(x => x.pubKey)
		.filter(Boolean)
		.map(normalizePublicKey)
		.filter(Boolean)

	const summaries = []

	// Is the required-key picture actually complete? Every account that must sign
	// needs its keyInfo loaded; otherwise allRequiredKeys is partial and any signed
	// key for a not-yet-loaded account looks like a "witness". keyInfo is fetched
	// async and the poll path rebuilds accounts from scratch, so this flaps between
	// refreshes — which is the "1 witness / threshold reached" toggling we saw.
	const mustSignAccounts = Object.values(accounts).filter(a => a.mustSign)
	const keyInfoComplete  = mustSignAccounts.length > 0 && mustSignAccounts.every(a => a.keyInfo)

	Object.entries(accounts).forEach(([accountId, acc]) => {
		if (!acc.mustSign) return
		if (!acc.keyInfo) return

		const keyTree = normalizeKeyTree(acc.keyInfo)
		if (!keyTree) return
		summaries.push(getThresholdSummary({ keyTree, signedPubkeys }))
	})

	const allRequiredKeys = new Set()
	summaries.forEach(x => x.allRequiredKeys?.forEach(k => allRequiredKeys.add(k)))

	const signedRequiredKeys = signedPubkeys.filter(k => allRequiredKeys.has(k))

	// Only call something a witness once the required set is fully known — otherwise
	// a legitimately-required signature for an account still loading gets mislabelled.
	const signedWitnessKeys = keyInfoComplete
		? signedPubkeys.filter(k => !allRequiredKeys.has(k))
		: []

	if (signedWitnessKeys.length) {
		console.warn('[readiness] witness keys after normalisation — possible mismatch')
		console.warn('[readiness] signed:', signedPubkeys)
		console.warn('[readiness] required:', [...allRequiredKeys])
		console.warn('[readiness] unmatched:', signedWitnessKeys)
	} else if (!keyInfoComplete) {
		console.warn('[readiness] keyInfo incomplete — deferring witness/threshold verdict',
			{ mustSign: mustSignAccounts.length, withKeyInfo: mustSignAccounts.filter(a => a.keyInfo).length })
	}

	const result = {
		// can't claim the threshold is met while the required set is still partial —
		// note [].every() is true, which is how the empty case showed "threshold reached".
		thresholdSatisfied: keyInfoComplete && summaries.every(x => x.thresholdSatisfied),
		signedRequiredKeyCount: signedRequiredKeys.length,
		allRequiredKeys,
		witnessKeys: signedWitnessKeys,
		keyInfoComplete,
		minMoreKeyCount: summaries.reduce((a, x) => a + x.minMoreKeyCount, 0)
	}

	// Structured snapshot of the WHOLE readiness picture, emitted on EVERY eval (not
	// only when a witness appears). One line per eval in /diag so a future flap or
	// stray-signature episode is fully reviewable after the fact. Keys shown by last
	// 6 chars to stay legible. accounts: who must sign, whether keyInfo loaded, signed.
	try {
		const k6 = k => '…' + String(k).slice(-6)
		const pc = data.precheck
		globalThis.kdiag?.('readiness:eval', {
			txid: data.txid,
			network: data.network,
			// what drove this evaluation: initial load / WS push / WS sig / poll / sign.
			// lets us confirm WS is primary and polling is only the fallback (not the
			// other way round, which is the suspected post-sign-update regression).
			trigger: data._trigger || 'initial',
			comboStatus: data.comboStatus ?? null,
			// precheck snapshot — to diagnose the OK↔insufficient-balance flap. null
			// when no precheck present (which itself is a flap signal vs a populated one).
			precheck: pc ? { status: pc.status ?? null, complete: pc.complete ?? null,
				fails: (pc.tests?.fail || []).length, untested: (pc.tests?.untested || []).length } : null,
			thresholdSatisfied: result.thresholdSatisfied,
			keyInfoComplete,
			signedRequiredKeyCount: result.signedRequiredKeyCount,
			minMoreKeyCount: result.minMoreKeyCount,
			signed: signedPubkeys.map(k6),
			required: [...allRequiredKeys].map(k6),
			witness: signedWitnessKeys.map(k6),
			accounts: Object.entries(accounts).map(([id, a]) => ({
				id,
				mustSign: !!a.mustSign,
				roles: a.roles || [],
				hasKeyInfo: !!a.keyInfo,
				keyInfoError: a.keyInfoError || null
			}))
		})
	} catch {}

	return result
}


