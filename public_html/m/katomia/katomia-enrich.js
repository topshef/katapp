



async function getTokenMeta(network, tokenId, serial){

	let productId = `${network};${tokenId}`
	if(serial) productId += `-${serial}`

	const params = {
		format: "json",
		productId
	}

	return await Kache.getData("/m", params, 86400)
}


function parseAssetId(assetId){

	assetId = String(assetId)

	if(assetId.includes("#")){
		const [tokenId, serial] = assetId.split("#")
		return { tokenId, serial }
	}

	return { tokenId: assetId, serial: null }
}


async function enrichAsset(network, assetId, amount){

	const { tokenId, serial } = parseAssetId(assetId)
	const meta = await getTokenMeta(network, tokenId, serial)

	return {
		assetId,
		tokenId,
		serial,
		meta,
		amount
	}
}

function getDisplayDecimals(tokenClass){

	const tokenDecimals = Number(tokenClass.decimals || 0)

	return Math.max(tokenDecimals - 4, 0)
}

function formatAssetDisplay(asset, meta){

	if(!meta) return asset.assetId

	const tokenClass = meta.token_class || {}
	const type = tokenClass.type

	// NFT
	if(type === "NON_FUNGIBLE_UNIQUE"){
		return meta.token_instance_name || `${asset.tokenId}#${meta.serial}`
	}

	// fungible
	const symbol = tokenClass.symbol || asset.tokenId
	const name   = tokenClass.name || asset.tokenId
	let tokenLabel
	tokenLabel = symbol ?? name
	
	if(symbol && symbol.toLowerCase().startsWith("hedera://")) tokenLabel = name	
	
	const decimals = Number(tokenClass.decimals || 0)

	if(decimals){
		const value = asset.amount / (10 ** decimals)
		const displayDecimals = getDisplayDecimals(tokenClass)
		const rounded = value.toFixed(displayDecimals)
		return `${tokenLabel} ${rounded}`
	}

	return asset.amount > 1
		? `${tokenLabel} ×${asset.amount}`
		: tokenLabel
}


function getAssetDisplay(assetId, amount){

	glog(`getAssetDisplay|${assetId}`, {amount})

	window.assetDisplayCache ||= {}

	const meta = window.assetDisplayCache[assetId]

	if(meta){
		const asset = {
			assetId,
			tokenId: assetId,
			serial: null,
			amount
		}

		return formatAssetDisplay(asset, meta)
	}

	return amount > 1
		? `${assetId} ×${amount}`
		: String(assetId)
}


async function enrichVisibleAssets(){

	if(!game?.network) return
	if(!state?.accounts) return

	window.assetDisplayCache ||= {}
	window.assetMetaPending ||= new Set()

	const jobs = []

	Object.values(state.accounts).forEach(account => {

		Object.entries(account.assets || {}).forEach(([assetId, amount]) => {
			glog(`checking asset|${assetId}`, {amount})
			if(window.assetDisplayCache[assetId]) return
			if(window.assetMetaPending.has(assetId)) return

			window.assetMetaPending.add(assetId)

			jobs.push(
				(async () => {
					try{
						const enriched = await enrichAsset(game.network, assetId, amount)
						glog(`enrichAsset ${game.network}|${assetId}|x${amount}`,enriched)
						// glog(`formatDisplay|${assetId}`, enriched.meta)
						
						window.assetDisplayCache[assetId] = enriched.meta
					}
					catch(err){
						console.error("asset enrichment failed", assetId, err)
					}
					finally{
						window.assetMetaPending.delete(assetId)
					}
				})()
			)
		})

		account.basket.forEach(item => {
			const assetId = item.assetId
			const amount = item.amount || 1

			if(window.assetDisplayCache[assetId]) return
			if(window.assetMetaPending.has(assetId)) return

			window.assetMetaPending.add(assetId)

			jobs.push(
				(async () => {
					try{
						const enriched = await enrichAsset(game.network, assetId, amount)
						window.assetDisplayCache[assetId] = enriched.meta
					}
					catch(err){
						console.error("asset enrichment failed", assetId, err)
					}
					finally{
						window.assetMetaPending.delete(assetId)
					}
				})()
			)
		})
	})

	if(jobs.length){
		await Promise.all(jobs)
		render()
	}
}