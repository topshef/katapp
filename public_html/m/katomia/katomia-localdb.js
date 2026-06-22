

/*
========================================
KATOMIA LOCAL DB
========================================
Temporary localStorage backend.
Later replace internals with Localbase.
*/

async function txKey(network, txid, pch){

  const shortPch =
    String(pch || "")
    .substring(0,8)

  return [
    "katomiaTx",
    network || "unknown",
    txid || "unknown",
    shortPch
  ].join("|")
}

async function saveTx(tx){

  if(!tx) return

  const key = await txKey(
    tx.network || gameMeta?.network,
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

  Object.keys(localStorage).forEach(key => {

    if(!key.startsWith("katomiaTx|"))
      return

    try{
      out.push(
        JSON.parse(
          localStorage.getItem(key)
        )
      )
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
