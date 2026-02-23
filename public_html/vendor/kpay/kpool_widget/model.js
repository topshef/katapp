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

	const transfers = getAllTransfers(rawTx)
	const accounts = getAccountsWithRoles({ transfers, txid })
			
	console.log({transfers, accounts, rawTx, url})
	return {
		url,
		rawTx,
		transfers,
		accounts
	}
}


function getAllTransfers(rawTx) {
	const raw = {
		hbar: rawTx?.result?.deal?.addHbarTransfer || [],
		token: rawTx?.result?.deal?.addTokenTransfer || [],
		nft: rawTx?.result?.deal?.addNftTransfer || []
	}

	const lineItems = []

	// HBAR
	raw.hbar.forEach(x => {
		lineItems.push({
			type: 'HBAR',
			account: x.accountId,
			asset: 'HBAR',
			amount: x.value
		})
	})

	// Fungible tokens
	raw.token.forEach(x => {
		lineItems.push({
			type: 'FT',
			account: x.accountId,
			asset: x.tokenId,
			amount: x.value
		})
	})

	// NFTs (explicit debit/credit)
	raw.nft.forEach(x => {
		const asset = `${x.tokenId} #${x.serial}`

		lineItems.push({
			type: 'NFT',
			account: x.sender,
			asset,
			amount: -1,
			serial: x.serial,
			tokenId: x.tokenId
		})

		lineItems.push({
			type: 'NFT',
			account: x.receiver,
			asset,
			amount: +1,
			serial: x.serial,
			tokenId: x.tokenId
		})
	})

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

