// model.js

	import {
		parseTxId,
	} from './utils.js'

import { getAccountInfo, getKeyInfo, getTokenInfo} from './hedera-mirror.js'


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

	const sources = {
		hbar:  mirrorTx.transfers       ? 'mirror'
					 : deal.addHbarTransfer   ? 'deal'
					 : 'none',

		token: mirrorTx.token_transfers ? 'mirror'
					 : deal.addTokenTransfer  ? 'deal'
					 : 'none',

		nft:   mirrorTx.nft_transfers   ? 'mirror'
					 : deal.addNftTransfer    ? 'deal'
					 : 'none'
	}

	const uniqueSources = new Set(Object.values(sources))
	if (uniqueSources.size > 1) {
		throw new Error('YU83743 Mixed transfer sources detected')
		window.alert('Error YU83743 Mixed transfer sources detected.')
	}
	
	const raw = {
		hbar:  mirrorTx.transfers       || deal.addHbarTransfer  || [],
		token: mirrorTx.token_transfers || deal.addTokenTransfer || [],
		nft:   mirrorTx.nft_transfers   || deal.addNftTransfer   || []
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
      amount:Number(x.value ?? x.amount)/100000000
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
		const tokenId = x.tokenId ?? x.token_id
		const serial  = x.serial ?? x.serial_number
		const sender  = x.sender ?? x.sender_account_id
		const receiver = x.receiver ?? x.receiver_account_id

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
        .filter(x => x.type == 'FT')
        .map(x => x.asset)
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

    if(item.type == 'HBAR') {
      item.amountRaw = item.amount * 100000000
      item.amountFormatted = item.amount
      item.assetMeta = {raw:'tinybar',name:'HBAR',symbol:'HBAR',decimals:8}
      return
    }
    
    if(item.type != 'FT')
      return

    const info = tokenInfo[item.asset]

    item.amountRaw = item.amount

    const decimals = info?.decimals ?? 0

    item.amountFormatted =
      Number(item.amount) /
      (10 ** decimals)

    item.assetMeta = {
      raw:item.asset,
      name:info?.name,
      symbol:info?.symbol,
      decimals:info?.decimals
    }


  })
}