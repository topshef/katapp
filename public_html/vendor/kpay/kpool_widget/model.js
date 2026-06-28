// model.js

	import {
		parseTxId,
	} from './utils.js'

import { getAccountInfo, getKeyInfo, getTokenInfo} from './hedera-mirror.js'

import { getThresholdSummary } from './threshold.js'
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

function skipCouncilAccount(ac) {
  if (!ac) return true
  const num = Number(ac.split('.').pop())
  return num < 98
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

	// HBAR
	raw.hbar.forEach(x => {
		const ac = x.accountId ?? x.account
		if (skipCouncilAccount(ac)) return

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
			acc.keyInfoError = err.message || String(err)
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

  const KNOWN_PREFIXES = [
      { prefix: '302a300506032b6570032100', label: 'ED25519 DER' },
    ]

	function normalizePublicKey(key) {
		if (!key) return null
		let k = key.toLowerCase()
		for (const { prefix, label } of KNOWN_PREFIXES) {
			if (k.startsWith(prefix)) {
				const raw = k.slice(prefix.length)
				console.debug('[readiness] stripped', label, 'prefix:', k.slice(0, 14), '→', raw.slice(0, 14))
				k = raw
				break
			}
		}
		if (k.length !== 64) {
			console.warn('[readiness] unexpected key length after normalisation:', k.length, 'key:', k.slice(0, 14))
		}
		return k
	}

	function normalizeKeyTree(node) {
		if (typeof node === 'string') return normalizePublicKey(node)
		if (!Array.isArray(node.keys)) {
			// Leaf node without sub-keys — e.g. { _type: 'ED25519', key: '...' }
			const raw = node.key ?? node.ed25519 ?? node.ECDSASecp256k1 ?? null
			return raw != null ? normalizePublicKey(String(raw)) : null
		}
		return { ...node, keys: node.keys.map(normalizeKeyTree) }
	}

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

	return {
		// can't claim the threshold is met while the required set is still partial —
		// note [].every() is true, which is how the empty case showed "threshold reached".
		thresholdSatisfied: keyInfoComplete && summaries.every(x => x.thresholdSatisfied),
		signedRequiredKeyCount: signedRequiredKeys.length,
		allRequiredKeys,
		witnessKeys: signedWitnessKeys,
		keyInfoComplete,
		minMoreKeyCount: summaries.reduce((a, x) => a + x.minMoreKeyCount, 0)
	}
}


