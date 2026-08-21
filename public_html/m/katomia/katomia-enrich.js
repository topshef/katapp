


function isHbarAsset(assetId){
  return String(assetId).toUpperCase() == "HBAR"
}

function getHbarMeta(){
  return {
    token_id:"HBAR",
    decimals:8,
    symbol:"HBAR",
    name:"Hedera HBAR",
    type:"FUNGIBLE_COMMON",
    token_class:{token_id:"HBAR",decimals:8,symbol:"HBAR",name:"Hedera HBAR",type:"FUNGIBLE_COMMON"}
  }
}


async function getTokenMeta(network, tokenId, serial){

    if(isHbarAsset(tokenId)) return getHbarMeta()
        
	let productId = `${network};${tokenId}`
	if(serial) productId += `-${serial}`

	const params = {
		format: "json",
		productId
	}

	// ENRICH-COLDPATH1: "/m" (no trailing slash) 301-redirects to "/m/", so every
	// asset lookup paid two round trips — 12 wasted redirects on a 13-asset board.
	return await Kache.getData("/m/", params, 86400)
}



function parseAssetId(assetId){

	assetId = String(assetId)
    
    if(isHbarAsset(assetId)) return { tokenId:"HBAR", serial:null }

	if(assetId.includes("#")){
		const [tokenId, serial] = assetId.split("#")
		return { tokenId, serial }
	}

	if(assetId.includes("-")){
		const [tokenId, serial] = assetId.split("-")
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

function zzgetDisplayDecimals(tokenClass){

	const tokenDecimals = Number(tokenClass.decimals || 0)

	return Math.max(tokenDecimals - 4, 0)
}


function getDisplayDecimals(tokenClass){

	const tokenDecimals = Number(tokenClass.decimals || 0)

	return Math.min(tokenDecimals, 8)
}


function formatAssetDisplay(asset, meta){

	if(!meta) return asset.assetId

	const tokenClass = meta.token_class || {}
	const type = tokenClass.type
	
	let tokenLabel
	let tokenClassLabel = meta.token_class?.name ?? asset.tokenId

	// NFT
	if(type === "NON_FUNGIBLE_UNIQUE") {
		tokenLabel =  meta.token_instance_name || `${tokenClassLabel} #${asset.serial}`
		return tokenLabel
	}

	// fungible
	const symbol = tokenClass.symbol || asset.tokenId
	const name   = tokenClass.name || asset.tokenId
	
	tokenLabel = symbol ?? name
	
	if(symbol && symbol.toLowerCase().startsWith("hedera://")) tokenLabel = name	
	
	const decimals = Number(tokenClass.decimals || 0)

	if(decimals){
		const value = asset.amount / (10 ** decimals)
		const displayDecimals = getDisplayDecimals(tokenClass)
		const rounded = value.toFixed(displayDecimals).replace(/\.?0+$/, "")
		return `${tokenLabel} ${rounded || "0"}`
	}

	return asset.amount > 1
		? `${tokenLabel} ×${asset.amount}`
		: tokenLabel
}


function getAssetDisplay(assetId, amount){

	glog(`getAssetDisplay`, {assetId, amount})

	window.assetDisplayCache ||= {}

	const meta = window.assetDisplayCache[assetId]

	const { tokenId, serial } = parseAssetId(assetId)


	if(meta){
		const asset = {
			assetId,
			tokenId,
			serial,
			amount
		}

		return formatAssetDisplay(asset, meta)
	}

	return amount > 1
		? `${assetId} ×${amount}`
		: String(assetId)
}


function getAssetMeta(assetId){
	return window.assetDisplayCache?.[assetId] || null
}

function getAssetThumb(meta){

	if(!meta) return null

	// NFT
  if (meta.token_asset_image_URL) {
    const tokenImageUrl = meta.token_thumbnail_cache || meta.token_asset_image_URL
    if(tokenImageUrl)
      return tokenImageUrl
  }
  
	// future: fungible icons etc
	return null
}

async function enrichAccountAssets(){

	if(!gameMeta.network) return
	if(!state?.accounts) return

	window.assetDisplayCache ||= {}
	window.assetMetaPending ||= new Set()

	const jobs = []

	Object.values(state.accounts).forEach(account => {

		Object.entries(account.assets || {}).forEach(([assetId, amount]) => {
			if(window.assetDisplayCache[assetId]) return
			if(window.assetMetaPending.has(assetId)) return

			window.assetMetaPending.add(assetId)

			jobs.push(
				(async () => {
					try{
						const enriched = await enrichAsset(gameMeta.network, assetId, amount)
						glog(`enrichAsset ${gameMeta.network}`,{assetId, amount, enriched})
						
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
						const enriched = await enrichAsset(gameMeta.network, assetId, amount)
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



// simple cache (same pattern as assets)
window.accountLabelCache ||= {}
window.accountLabelPending ||= new Set()
// PLAYER-MODAL3: structured sibling of accountLabelCache — {domain, name} per
// account id, for surfaces that render the attested domain and the self-chosen
// label with different weight. Same keys, same lifetime.
window.accountXProofCache ||= {}

async function getAccountLabelXProof(network, accountId){

  if (network != 'mainnet') return
  const params = {
    network,
    // accountId
  }

  // 2 types shoudl be same but shape differs
  // https://xproof.live/domain/query/0.0.27500
  // https://xproof.live/api/?accountId=0.0.27500
  // return await Kache.getData("https://xproof.live/api/", params, 86400)
  // ENRICH-COLDPATH1: 5s cap. This is a third-party lookup for a COSMETIC label;
  // a hung query here used to stall the whole enrich pass (measured: one account
  // never responded in 30s). On abort getData throws and the caller's catch drops
  // the label — the board just shows the account id, which is the pre-label state.
  return await Kache.getData(`https://xproof.live/domain/query/${accountId}`, params, 86400, 5000)

}

async function enrichAccountLabel(network, accountId){

  if(network != "mainnet") return {label:null}

  const data = await getAccountLabelXProof(network, accountId)
  const latest = data?.links?.[0]

  if(!latest) return {label:null}

  const label =
    [latest.domain, latest.name]
      .filter(Boolean)
      .join(" | ") || null

  if(label) glog(`getAccountLabelXProof|${latest.domain || accountId}`, {label, data})

  // PLAYER-MODAL3 (user 2026-08-21): keep the PARTS, not just the joined string.
  // The two are not equal in weight — the DOMAIN is the attested half (xproof
  // proves control of it), the NAME is a self-chosen label anyone could put on
  // top of a lookalike domain. Surfaces that have room must be able to render
  // them with different prominence, which a pre-joined "a | b" forbids. Additive:
  // the existing label consumers (felt etch, chat, render) are untouched.
  return { label, domain: latest.domain || null, name: latest.name || null }
}

async function enrichAccountLabels(){

  if(!gameMeta.network) return
  if(!state?.accounts) return

  window.assetDisplayCache  ||= {}
  window.assetMetaPending   ||= new Set()

  const jobs = []

  Object.values(state.accounts).forEach(account => {

    const id = account.id.split(":")[1] || null
    if(!id) console.warn('PH93844 missing account id', account.id)

    if(Object.prototype.hasOwnProperty.call(window.accountLabelCache, id)) return
    if(window.accountLabelPending.has(id)) return

    window.accountLabelPending.add(id)

    jobs.push(
      (async () => {
        try{
          const enriched = await enrichAccountLabel(gameMeta.network, id)
          window.accountLabelCache[id] = enriched.label
          if(enriched.domain || enriched.name)
            window.accountXProofCache[id] = { domain: enriched.domain, name: enriched.name }
        }catch(err){
          console.error("account label enrichment failed", id, err)
        }finally{
          window.accountLabelPending.delete(id)
        }
      })()
    )
  })

  enrichOrderBundleAssets(jobs)

  if(jobs.length){
    await Promise.all(jobs)
    render()
  }
}


function enrichOrderBundleAssets(jobs){

  window.assetDisplayCache  ||= {}
  window.assetMetaPending   ||= new Set()

  getAllOrders().forEach(orderRec => {
    ;(orderRec.order?.bundle || []).forEach(item => {
      const assetId = item.asset
      if(!assetId) return
      if(window.assetDisplayCache[assetId]) return
      if(window.assetMetaPending.has(assetId)) return

      window.assetMetaPending.add(assetId)

      jobs.push(
        (async () => {
          try{
            const enriched = await enrichAsset(gameMeta.network, assetId, Math.abs(item.amount))
            window.assetDisplayCache[assetId] = enriched.meta
          }catch(err){
            console.error("order bundle asset enrichment failed", assetId, err)
          }finally{
            window.assetMetaPending.delete(assetId)
          }
        })()
      )
    })
  })
}


