


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

	// KFUND-LOCAL1 (2026-08-24): enrichment now comes from our own backend node service
	// (/katomia/enrich) via the same-origin hapi.php proxy, replacing the down external
	// gmws2 /explore/NFT API. The response contract is unchanged — { token_class,
	// token_instance_name, token_asset_image_URL } — so every downstream consumer here
	// (formatAssetDisplay, getAssetThumb, getDisplayDecimals) is untouched. The browser's
	// 24h Kache still fronts it; the backend caches too (Stok/Redis 24h) and sources
	// token_class from the Hedera mirror + thumbnails from IPFS.
	const params = {
		action: "enrich",
		productId
	}

	return await Kache.getData((window.KBASE || "") + "/hapi.php", params, 86400)
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

  // XPROOF-VERIFY2 (2026-09-20): moved to /XVERIFY/?account=, which is the route that
  // actually answers this question safely.
  //
  // The history, because this line got it wrong twice. XPROOF-ROUTE1 (2026-08-21) switched
  // this from /domain/query/<id> to /api/ because /domain/query had stopped answering — its
  // upstream explore.hbar.live was dead, so the lookup hung every time. That swap was
  // reverted the NEXT DAY in xbar's cdn/xproof.js as a SECURITY REGRESSION (XPROOF-REVERT1):
  // /api/ reports the ON-CHAIN claim alone, so a domain named in an attestation renders as
  // identity whether or not that domain agrees. The revert reached that one file and neither
  // of the two consumers that mattered — this one and the signing widget.
  //
  // /XVERIFY/ re-reads the evidence LIVE through the same oracles the notaries use, and
  // `label` is built from AGREEING identities only, so the board cannot show a domain that
  // has since dropped its TXT record. Both networks now: a proof is looked up by which
  // ledger it is on, and testnet proofs are real proofs.
  //
  // TIMEOUT KEPT, and for the same reason as before: Kache.getData has no timeout and no
  // AbortController, and its 4th argument is staleSeconds, not a cap. A cosmetic label must
  // never be able to stall the enrich pass, so the race is applied here where it binds.
  const params = { account: accountId, network }
  const XPROOF_TIMEOUT_MS = 5000
  return await Promise.race([
    Kache.getData("https://xproof.live/XVERIFY/", params, 86400),
    new Promise((_, rej) => setTimeout(() => rej(new Error("xproof timeout")), XPROOF_TIMEOUT_MS))
  ])

}

async function enrichAccountLabel(network, accountId){

  const data = await getAccountLabelXProof(network, accountId)

  // XPROOF-VERIFY2 shape: { label:{kind,subject,name}, identities:[{kind,subject,name,agrees}] }
  // `label` is already filtered to identities the other side still confirms, so trusting it
  // here is the whole point — the board must not render a claim the evidence has dropped.
  if(data?.label?.subject){
    return {
      label: data.label.name ? `${data.label.subject} | ${data.label.name}` : data.label.subject,
      domain: data.label.subject,
      kind: data.label.kind || "domain",
      // The attested half is the SUBJECT (xproof proves control of it); the NAME is
      // self-chosen and anyone could put it on a lookalike. Kept separate on purpose so
      // surfaces with room can weight them differently — PLAYER-MODAL3.
      name: data.label.name || null,
      verifiedAt: (data.identities || []).find(i => i.subject === data.label.subject)?.consensusAt || null
    }
  }
  if(data?.ok && Array.isArray(data.identities)) return {label:null}
  // XPROOF-ROUTE1: /api/ answers {"<acct>": [events…], "latest": {"<acct>": {<type>: {…}}}}
  // — latest is keyed by IDENTITY TYPE ("domain", and whatever xproof adds later).
  // Prefer an attested domain; otherwise take whatever attested identity exists, so
  // a future twitter/github attestation shows up without another code change.
  // (The old /domain/query shape was data.links[0] with .domain/.name — kept below
  // as a fallback so a revived route still parses.)
  const byType = data?.latest?.[accountId]
  const attested = byType ? (byType.domain || Object.values(byType)[0]) : null
  if(attested?.linked_identity){
    return {
      label: attested.linked_identity,
      domain: attested.linked_identity,
      kind: attested.identity_type || "domain",
      // xproof's attestation carries no self-chosen label today; the field is read
      // anyway so that if one is ever added it lands in the secondary slot rather
      // than being mistaken for the attested part.
      name: attested.name || null,
      verifiedAt: attested.verified_at || null
    }
  }

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


