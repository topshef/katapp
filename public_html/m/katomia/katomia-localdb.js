/*
========================================
KATOMIA LOCAL DB
========================================
Tx store backed by IndexedDB via Localbase (loaded globally in game.php).

Replaces the previous localStorage backend. localStorage has a ~5MB per-origin
cap; once the tx log grew past it, saveTx() threw QuotaExceededError, the new
pending tx was never written, and because the transactions list is sourced from
this store it silently vanished from the list — even though the chart still drew
it (the chart reads live state.tx.pending). IndexedDB lifts the cap.

Two further hardenings vs the old version:
  1. getAllTx() now UNIONS the live pending set, so a pending tx shows in the
     list the instant it exists and never depends on a write succeeding — the
     same source of truth the chart already uses.
  2. The game scope is resolved with the gameMeta/gameId fallback on BOTH write
     and read (via txGameScope), and stamped onto the stored record. The old
     code applied the fallback only when building the key, then filtered reads
     on the raw embedded gameId — which pending txs don't carry — so they were
     dropped on read. That asymmetry is gone.
*/

const TX_DB         = "katomiaTx"
const TX_COLLECTION = "tx"

let _txDb = null

// Localbase is a soft dependency: if the script is missing OR construction
// fails, we still want the list to work off live pending txs — just without
// cross-reload history. Never throw out of here.
function txStore(){
  if(_txDb) return _txDb

  if(typeof Localbase === "undefined"){
    console.warn("[katomia-localdb] Localbase not loaded — tx history disabled, live pending still shown")
    return null
  }

  try{
    _txDb = new Localbase(TX_DB)
    try{ _txDb.config.debug = false }catch{}
  }
  catch(err){
    console.warn("[katomia-localdb] Localbase init failed — tx history disabled", err)
    _txDb = null
  }

  return _txDb
}


function txGameId(tx){
  return String(
    tx?.source?.context?.gameId ||
    tx?.gameId ||
    ""
  )
}

// The game a tx belongs to, falling back to the active game. Pending txs often
// carry no embedded gameId, so callers MUST use this (not raw txGameId) when
// deciding scope, or those txs get dropped.
function txGameScope(tx){
  return txGameId(tx) || gameMeta?.id || gameId || ""
}


function txKey(tx){

  const shortPch =
    String(tx?.pch || "")
    .substring(0, 8)

  return [
    "katomiaTx",
    tx?.network || gameMeta?.network || "unknown",
    txGameScope(tx) || "unknown",
    tx?.txid || "unknown",
    shortPch
  ].join("|")
}


// Persist one tx, once. Stamps the resolved gameId onto the stored copy so
// reads can filter by game without re-deriving the fallback. Skips the write if
// the tx is already stored — display reads live state.tx.pending and derives
// status from live order state, so re-writing on every render only adds churn
// (and risks store bloat). Never throws — a storage failure must not break
// rendering.
async function saveTx(tx){

  if(!tx) return

  const db = txStore()
  if(!db) return

  const key = txKey(tx)

  try{
    const existing = await db.collection(TX_COLLECTION).doc(key).get()

    if(existing) return   // already stored — don't churn

    await db.collection(TX_COLLECTION).add(
      { ...tx, gameId: txGameScope(tx) },
      key
    )
  }
  catch(err){
    console.warn("[katomia-localdb] saveTx failed", key, err)
  }
}


async function getStoredTxs(){

  const db = txStore()
  if(!db) return []

  try{
    return (await db.collection(TX_COLLECTION).get()) || []
  }
  catch(err){
    console.warn("[katomia-localdb] getStoredTxs failed", err)
    return []
  }
}


// One-time move of any legacy localStorage tx cache into Localbase, then clear
// it to reclaim the localStorage quota (which is what overflowed). Idempotent.
let _legacyMigrated = false

async function migrateLegacyTxs(){

  if(_legacyMigrated) return
  _legacyMigrated = true

  let keys
  try{
    keys = Object.keys(localStorage).filter(k => k.startsWith("katomiaTx|"))
  }
  catch{ return }

  if(!keys.length) return

  for(const k of keys){

    try{
      const tx = JSON.parse(localStorage.getItem(k))

      // Recover the game from the key when the value doesn't carry it.
      //   new-format key: katomiaTx|network|gameId|txid|pch  (5 parts)
      //   old-format key: katomiaTx|network|txid|pch         (4 parts)
      if(tx && !txGameId(tx)){
        const parts = k.split("|")
        if(parts.length >= 5) tx.gameId = parts[2]
      }

      await saveTx(tx)
    }
    catch{ /* skip unreadable entry */ }

    try{ localStorage.removeItem(k) }   // free the quota regardless
    catch{}
  }

  console.log(`[katomia-localdb] migrated ${keys.length} txs localStorage \u2192 Localbase`)
}


// Persisted history \u222A live pending, deduped by key, scoped to the current
// game. Reading live state.tx.pending directly is the core fix: a pending tx
// shows in the list the instant it exists, regardless of whether (or when) it
// is persisted.
function txArray(v){
  if(Array.isArray(v)) return v
  if(v && typeof v == "object") return Object.values(v)
  return []
}

// Minimal tx records reconstructed from order.settled across all players,
// collapsed to one stub per (txid,pch). No source/deal payload, so these rows
// render without the fill description M-bM-^@M-^T graceful degradation for a confirmed tx
// this client never observed pending. getTxStatus() resolves them to SUCCESS
// from the same settled data. Derived live, never persisted (self-heals like
// the order ghost rows).
function settledTxStubs(){

  const currentGameId = gameMeta?.id || gameId
  const byTx = new Map()

  for(const player of Object.values(state?.players || {}))
    for(const order of Object.values(player?.orders || {}))
      for(const s of (order?.settled || [])){

        if(!s?.txid) continue

        const key = `${s.txid}|${s.pch || ""}`
        if(byTx.has(key)) continue

        byTx.set(key, {
          txid: s.txid,
          pch: s.pch || "",
          network: gameMeta?.network,
          gameId: currentGameId,
          lifecycle: { status: "SUCCESS", isFinalStatus: true }
        })
      }

  return [...byTx.values()]
}


async function getAllTx(){

  await migrateLegacyTxs()

  const currentGameId = gameMeta?.id || gameId
  const byKey = new Map()

  for(const tx of txArray(await getStoredTxs())){
    if(currentGameId && txGameScope(tx) !== currentGameId) continue
    byKey.set(txKey(tx), tx)
  }

  // Confirmed txs rebuilt from durable order state. A tx can settle and leave
  // state.tx.pending before this client ever cached it (playnet resolves
  // synchronously, so the tx is never broadcast as pending; a slow first render
  // can also miss a fast mainnet tx). order.settled is logic state the server
  // always sends, so any settled (txid,pch) we do not already hold is surfaced
  // here as a minimal record. The server no longer keeps a recently-confirmed
  // list M-bM-^@M-^T that job now lives entirely on the front end.
  for(const tx of settledTxStubs()){
    const k = txKey(tx)
    if(byKey.has(k)) continue   // a stored/pending copy already carries full detail
    byKey.set(k, tx)
  }

  // Live pending overrides any stale stored copy of the same tx.
  for(const tx of txArray(state?.tx?.pending)){
    if(currentGameId && txGameScope(tx) !== currentGameId) continue
    byKey.set(txKey(tx), tx)
  }

  return [...byKey.values()]
}


async function cachePendingTxs(){

  const txs = txArray(state?.tx?.pending)

  await Promise.all(
    txs.map(tx => saveTx(tx))
  )
}