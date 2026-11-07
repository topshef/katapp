// katomia-assetauto.js — ASSET-AUTO1 (owner 2026-11-07): "instead of just having show all and
// none, we have three options: show all, none, auto … auto would be assets that have seen
// movement in the last 14 days … if there's more than six, just pick the most active six … built
// entirely using front end logic … you'd want to know that immediately, even before you've
// opened the modal … local state can be periodically updated, perhaps whenever there's a
// transaction or on some kind of cadence."
//
// Three things, all in this browser, nothing sent to the backend:
//  1. ACTIVITY — per account, which assets moved in the last 14 days and how often, read from the
//     Hedera mirror node (the board already reads it directly: katomia-board.js tx lookups,
//     katomia-chat.js association checks). Cached in localStorage; refreshed in the background
//     when older than 6 hours, and marked stale after one of your deals settles. So "auto" is
//     instant: it picks from the cache the moment you press it.
//  2. PICK — the assets you still hold, most transactions first (ties: most recent), at most six.
//     Nothing moved in 14 days → HBAR, if held: an empty store is a surprising "auto".
//  3. MEMORY — what each of your accounts last showed on the table. Adding an account again
//     starts from that ("whatever you had last time"); a first add starts from auto.
//
// Movement means: a token transfer to or from the account; an NFT serial sent or received; HBAR
// that moved for a reason other than the account paying a fee or collecting a staking reward.
;(() => {
  const DAYS = 14, MAX = 6, TTL = 6 * 3600e3, PAGES = 3
  const ACT = "katomia.assetActivity.", MEM = "katomia.assetShown."
  const now = () => Date.now()
  const key = (p, net, acct) => p + net + "." + acct
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || "null") } catch { return null } }
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
  const real = net => net === "testnet" || net === "mainnet"
  const mirror = net => net === "mainnet" ? "https://mainnet-public.mirrornode.hedera.com" : `https://${net}.mirrornode.hedera.com`
  const diag = (m, d) => { try { window.kdiag?.(m, d) } catch {} }

  // one mirror transaction → the asset ids that moved for this account
  function moved(tx, acct){
    const out = new Set()
    for(const t of tx.token_transfers || []) if(t.account === acct && Number(t.amount)) out.add(t.token_id)
    for(const n of tx.nft_transfers || [])
      if(n.sender_account_id === acct || n.receiver_account_id === acct) out.add(`${n.token_id}#${n.serial_number}`)
    let h = 0
    for(const t of tx.transfers || []) if(t.account === acct) h += Number(t.amount) || 0
    const payer = String(tx.transaction_id || "").split("-")[0]
    if(payer === acct) h += Number(tx.charged_tx_fee) || 0               // the fee is not movement
    for(const s of tx.staking_reward_transfers || []) if(s.account === acct) h -= Number(s.amount) || 0
    if(h !== 0) out.add("HBAR")
    return out
  }

  const inflight = new Map()
  async function refresh(net, acct, { force = false } = {}){
    if(!real(net) || !/^0\.0\.\d+$/.test(acct)) return null
    const k = key(ACT, net, acct), have = read(k)
    if(!force && have && !have.stale && now() - have.at < TTL) return have
    if(inflight.has(k)) return inflight.get(k)
    const p = (async () => {
      const since = Math.floor((now() - DAYS * 864e5) / 1000)
      let url = `${mirror(net)}/api/v1/transactions?account.id=${acct}&timestamp=gt:${since}.000000000&limit=100&order=desc`
      const n = {}, last = {}
      let txs = 0
      for(let page = 0; url && page < PAGES; page++){
        const r = await fetch(url, { cache: "no-store" })
        if(!r.ok) throw new Error("mirror " + r.status)
        const j = await r.json()
        for(const tx of j.transactions || []){
          txs++
          const ts = Math.round(Number(tx.consensus_timestamp) * 1000) || 0
          for(const id of moved(tx, acct)){ n[id] = (n[id] || 0) + 1; last[id] = Math.max(last[id] || 0, ts) }
        }
        url = j.links?.next ? mirror(net) + j.links.next : null
      }
      const entry = { at: now(), days: DAYS, txs, n, last, partial: !!url }
      write(k, entry)
      diag("asset:auto:refresh", { net, acct, txs, assets: Object.keys(n).length, partial: !!url })
      return entry
    })().catch(e => { diag("asset:auto:refresh-failed", { net, acct, error: String(e?.message || e) }); return have || null })
      .finally(() => inflight.delete(k))
    inflight.set(k, p)
    return p
  }

  function cached(net, acct){ return real(net) ? read(key(ACT, net, acct)) : null }

  // the auto set from an activity entry, limited to what is held
  function pick(entry, heldIds, max = MAX){
    const held = new Set(heldIds || [])
    const n = entry?.n || {}, last = entry?.last || {}
    const ranked = Object.keys(n).filter(id => held.has(id))
      .sort((a, b) => (n[b] - n[a]) || ((last[b] || 0) - (last[a] || 0)))
      .slice(0, max)
    if(!ranked.length && held.has("HBAR")) ranked.push("HBAR")
    return ranked
  }

  // the auto set now if the cache has it, else after one lookup
  async function auto(net, acct, heldIds){
    let e = cached(net, acct)
    if(!e || e.stale || now() - e.at >= TTL) e = (await refresh(net, acct)) || e
    return e ? pick(e, heldIds) : null
  }

  // ── memory: what each of your accounts last showed ──────────────────────────────────
  const sig = new Map()
  function remember(net, acct, shown){
    if(!net || !acct) return
    const ids = [...shown].sort(), s = ids.join(",")
    const k = key(MEM, net, acct)
    if(sig.get(k) === s) return
    sig.set(k, s)
    write(k, { at: now(), ids })
  }
  function recall(net, acct){ const m = read(key(MEM, net, acct)); return m && Array.isArray(m.ids) ? m.ids : null }

  // ── called from the board's render: remember, and keep the cache warm ──────────────
  const lastTry = new Map()
  function observe(state, net){
    if(!state || !net || typeof isMyAccount !== "function") return
    for(const a of Object.values(state.accounts || {})){
      if(!isMyAccount(a)) continue
      const acct = a.label || String(a.id).split(":")[1] || a.id
      remember(net, acct, Object.keys(a.assets || {}))
      if(!real(net)) continue
      const e = cached(net, acct), k = net + acct
      if((!e || e.stale || now() - e.at >= TTL) && now() - (lastTry.get(k) || 0) > 60e3){
        lastTry.set(k, now())
        setTimeout(() => refresh(net, acct), 3000 + Math.random() * 4000)   // after the board has painted
      }
    }
  }

  // a deal of yours settled: your activity changed
  function staleMine(net, state){
    if(!real(net) || typeof isMyAccount !== "function") return
    for(const a of Object.values(state?.accounts || {})){
      if(!isMyAccount(a)) continue
      const acct = a.label || String(a.id).split(":")[1] || a.id
      const k = key(ACT, net, acct), e = read(k)
      if(e){ e.stale = true; write(k, e) }
    }
  }

  window.katomiaAssetAuto = { DAYS, MAX, refresh, cached, pick, auto, remember, recall, observe, staleMine, moved }
})()
