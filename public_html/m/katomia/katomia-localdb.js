

/*
========================================
KATOMIA LOCAL DB
========================================
Temporary localStorage backend.
Later replace internals with Localbase.
*/

function txGameId(tx){
  return String(
    tx?.source?.context?.gameId ||
    tx?.gameId ||
    ""
  )
}


async function txKey(network, gameId, txid, pch){

  const shortPch =
    String(pch || "")
    .substring(0,8)

  return [
    "katomiaTx",
    network || "unknown",
    gameId || "unknown",
    txid || "unknown",
    shortPch
  ].join("|")
}

async function saveTx(tx){

  if(!tx) return

  const gid = txGameId(tx) || gameMeta?.id || gameId

  const key = await txKey(
    tx.network || gameMeta?.network,
    gid,
    tx.txid,
    tx.pch
  )

  localStorage.setItem(
    key,
    JSON.stringify(tx)
  )
}




async function getAllTx(){

  const out = []
  const currentGameId = gameMeta?.id || gameId

  Object.keys(localStorage).forEach(key => {

    if(!key.startsWith("katomiaTx|"))
      return

    try{
      const tx = JSON.parse(localStorage.getItem(key))
      if(currentGameId && txGameId(tx) !== currentGameId) return
      out.push(tx)
    }
    catch(err){
      console.warn("Bad tx cache", key)
    }

  })

  return out
}


async function cachePendingTxs(){

  ;(state?.tx?.pending || [])
    .forEach(tx => saveTx(tx))
}
