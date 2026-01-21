// model.js

export async function txRead({ network, txid }) {
	const url = `https://kpos.uk/pool/txRead?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}&detail=1`

	const res = await fetch(url)
	if (!res.ok) {
		throw new Error(`txRead failed (${res.status})`)
	}

	const json = await res.json()

	return {
		url,
		json,
		transfers: getAllTransfers(json)
	}
}


function getAllTransfers(json) {
	const raw = {
		hbar: json?.result?.deal?.addHbarTransfer || [],
		token: json?.result?.deal?.addTokenTransfer || [],
		nft: json?.result?.deal?.addNftTransfer || []
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
