// model.js

	import {
		parseTxId,
	} from './utils.js'

import { getAccountInfo, getKeyInfo } from './hedera-mirror.js'


export async function txRead({ network, txid }) {
	const url = `https://kpos.uk/pool/txRead?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}&detail=1`

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

	//todo handle PCH pre-consensus hash

	// ensure these fields always exist
	data.network = network
	data.txid = txid

	const transfers = getAllTransfers(data)
	const accounts = getAccountsWithRoles({ transfers, txid })
			
	console.log("txRead data=",data)
	console.log("txRead other=",{transfers, accounts, rawTx, url})
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


	// console.log({raw})
	const lineItems = []

	// HBAR
	raw.hbar.forEach(x => {
		const ac = x.accountId ?? x.account
		if (skipCouncilAccount(ac)) return

		lineItems.push({
			type: 'HBAR',
			account: ac,
			asset: 'HBAR',
			// amount: x.value ?? x.amount
			amount:
				x.value != null
					? Number(x.value)
					: Number(x.amount) / 100000000
					
			// amount: Number(BigInt(x.value ?? x.amount)) / 100000000
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
	
	// console.log({mirrorTx, deal, raw, lineItems})
	
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
			console.log('KEYINFO RAW', accountId, keyInfo)

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

