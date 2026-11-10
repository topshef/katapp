// katomia-switcher.js — KNAV-SWITCH1 (owner 2026-11-10, navigation pass part 2:
// https://claude.ai/artifact/MKS6DwtXLaSPuNKWmgv9yd — "turn the headline pill … into a drop down menu
// listing recent and other circles … since it doesn't do anything at the moment when you tap on it").
//
// Tap the header pill (#boardAudience): your tables on THIS network drop down.
//   Signing now · a table where a deal you're in is being signed (the games list's you.signing,
//                 KNAV-KNOCK1) — the same signal the knocks use.
//   Yours       · tables where you have a seat (the games list's `you.accounts`, LIST-MINE1), and the
//                 one you're at; side circles sit under their parent.
//   Recent      · tables this browser visited (katomiaRecent) that you have no seat at.
// Round icon = a proposal circle, square = an order book (owner: the shape says what kind of table).
// The word, where one is needed, is "Tables" (owner, same day).
//
// THE WALL (owner, same day): one network at a time and no cross-network links anywhere — a row is
// listed only when the games list confirms it is on the network of the table you're at.
//
// A tap flips in place with switchGame (SIDECIRCLE-SOFTSWAP1), which now adds a Back step (NAV-BACK1).
// A table of the other kind (book ↔ circle) opens by a normal page load: the board sets up some
// things per kind at load, and a soft swap across kinds has not been tried.
(function(){
  "use strict"
  const pill = () => document.getElementById("boardAudience")
  const API = () => (window.KAPI || "/hapi/katomia")
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
  const here = () => (window.katomiaCircleSlug && window.katomiaCircleSlug()) || ""
  const net = () => (window.katomiaCircleNet && window.katomiaCircleNet()) || ""
  const isBook = g => ((g && g.config && g.config.tradingMode) || (g && g.tradingMode)) === "orderBook"
  const parentOf = id => { const m = /^(.*)~\d+$/.exec(String(id)); return m ? m[1] : null }

  // ── the games list (one fetch per open, at most every 15 s; ~4 KB gzipped) ──
  let games = null, gamesAt = 0, inflight = null
  function load(force){
    if(!force && games && Date.now() - gamesAt < 15000) return Promise.resolve(games)
    if(inflight) return inflight
    const tok = (typeof getOrCreatePlayerToken === "function") ? getOrCreatePlayerToken() : ""
    inflight = fetch(API() + "/games", { headers: { "x-player-token": tok } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("games " + r.status)))
      .then(j => {
        const g = j && j.games
        games = Array.isArray(g) ? g : (g && typeof g === "object" ? Object.values(g) : [])
        gamesAt = Date.now()
        return games
      })
      .finally(() => { inflight = null })
    return inflight
  }

  // ── icons: a ring for a circle, a rounded square for a book; colour = state ──
  const COL = { sign: "#f5a623", play: "#2b9be0", here: "#4b55c9", quiet: "#a9a59d", seen: "#a9a59d" }
  function icon(book, st){
    const c = COL[st] || COL.quiet, pulse = st === "sign" ? ' class="knav-pulse"' : ""
    const dash = st === "seen" ? ' stroke-dasharray="3 3"' : ""
    return book
      ? `<svg class="knav-ic" viewBox="0 0 28 28" aria-hidden="true"><rect${pulse} x="4" y="4" width="20" height="20" rx="5" fill="none" stroke="${c}" stroke-width="3"${dash}/><path d="M9 11h10M9 14.5h7M9 18h5" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`
      : `<svg class="knav-ic" viewBox="0 0 28 28" aria-hidden="true"><circle${pulse} cx="14" cy="14" r="9.5" fill="none" stroke="${c}" stroke-width="4"${dash}/></svg>`
  }
  function ago(t){
    const s = Math.max(0, (Date.now() - (t || 0)) / 1000)
    if(s < 90) return "just now"
    if(s < 3600) return Math.round(s / 60) + " min ago"
    if(s < 86400) return Math.round(s / 3600) + " h ago"
    if(s < 172800) return "yesterday"
    return Math.round(s / 86400) + " days ago"
  }
  function nameOf(g){
    const n = (g && g.profile && g.profile.name) || ""
    return n.length > 38 ? n.slice(0, 37) + "…" : n
  }
  function audience(g){
    const a = (g && g.activity) || {}, bits = []
    if(a.playing) bits.push(a.playing + " playing")
    if(a.waiting) bits.push(a.waiting + " waiting")
    if(a.watching) bits.push(a.watching + " watching")
    return bits.join(" · ")
  }

  // ── the sheet ──
  let sheet = null, refresher = null
  function rows(list){
    const N = net(), H = here()
    const mine = list.filter(g => g && g.id && g.network === N)
    const byId = new Map(mine.map(g => [g.id, g]))
    const seatedIds = new Set(mine.filter(g => (g.you && g.you.accounts) > 0).map(g => g.id))
    // the table you're at: under Yours when you have a seat, else on its own under "Here" (watching)
    const watchingHere = H && byId.has(H) && !seatedIds.has(H) ? byId.get(H) : null
    const lastAt = g => (g.activity && g.activity.lastActivity) || 0
    // KNAV-KNOCK1: "Signing now" = a deal YOU are in is being signed there (you.signing, backend);
    // the games list puts a table you're in a deal at in `you` even if your accounts have moved on
    for(const g of mine) if(((g.you && g.you.signing) || []).length) seatedIds.add(g.id)
    const signing = [...seatedIds].map(id => byId.get(id)).filter(g => g && g.id !== H && ((g.you && g.you.signing) || []).length > 0)
    const signingIds = new Set(signing.map(g => g.id))
    const yours = [...seatedIds].map(id => byId.get(id)).filter(g => g && !signingIds.has(g.id))
      .sort((a, b) => (b.id === H) - (a.id === H) || lastAt(b) - lastAt(a))
    // side circles under their parent when the parent is listed too
    const ordered = []
    const placed = new Set()
    for(const g of yours){
      if(placed.has(g.id)) continue
      const p = parentOf(g.id)
      if(p && yours.some(x => x.id === p)) continue   // placed with its parent below
      ordered.push([g, false]); placed.add(g.id)
      for(const s of yours) if(parentOf(s.id) === g.id && !placed.has(s.id)){ ordered.push([s, true]); placed.add(s.id) }
    }
    for(const g of yours) if(!placed.has(g.id)){ ordered.push([g, false]); placed.add(g.id) }
    const recent = ((window.katomiaRecent && window.katomiaRecent.list()) || [])
      .filter(r => r && r.id !== H && !seatedIds.has(r.id) && byId.has(r.id))   // the wall: same network, still there
      .slice(0, 6)
    return { signing, ordered, recent, byId, watchingHere }
  }
  function rowHtml(g, opts){
    const H = here(), isHere = g.id === H, book = isBook(g)
    const st = opts.st || (isHere ? "here" : (g.activity && g.activity.playing) ? "play" : "quiet")
    const line = opts.line || (isHere ? "you're here" + (audience(g) ? " · " + audience(g) : "")
      : (audience(g) || "seated · quiet"))
    const nm = nameOf(g)
    return `<button type="button" class="knav-row${isHere ? " knav-row--here" : ""}${opts.sub ? " knav-row--sub" : ""}" data-id="${esc(g.id)}"`
      + `${isHere ? ' aria-current="page"' : ""} title="${esc((nm ? nm + " · " : "") + g.id + (book ? " · order book" : ""))}">`
      + icon(book, st)
      + `<span class="knav-txt"><span class="knav-id">${esc(g.id)}${nm ? `<span class="knav-nm"> ${esc(nm)}</span>` : ""}</span>`
      + `<span class="knav-st${st === "sign" ? " knav-st--hot" : ""}">${esc(line)}</span></span>`
      + (isHere ? `<span class="knav-here">here</span>` : st === "sign" ? `<span class="knav-go">Go</span>` : `<span class="knav-chev">›</span>`)
      + `</button>`
  }
  function draw(){
    if(!sheet) return
    const N = net(), label = (window.katomiaNetLabel && window.katomiaNetLabel(N)) || N
    const foot = `<div class="knav-foot"><span><span class="kaud-net" data-net="${esc(N)}">${esc(label)}</span> tables only · switch network on Home</span>`
      + `<a href="${esc(location.pathname.replace(/\/board\/.*$/, "") + "/circles")}">All tables ›</a></div>`
    if(!games){
      sheet.innerHTML = `<div class="knav-empty">Loading your tables…</div>` + foot
      return
    }
    const { signing, ordered, recent, byId, watchingHere } = rows(games)
    let h = ""
    if(watchingHere){
      const a = watchingHere.activity || {}
      h += `<div class="knav-h">Here</div>` + rowHtml(watchingHere, { line: "you're watching" + (a.playing ? " · " + a.playing + " playing" : "") })
    }
    if(signing.length) h += `<div class="knav-h">Signing now</div>` + signing.map(g => rowHtml(g, { st: "sign", line: "a deal you're in is being signed" })).join("")
    if(ordered.length) h += `<div class="knav-h">Yours</div>` + ordered.map(([g, sub]) => rowHtml(g, { sub })).join("")
    if(recent.length) h += `<div class="knav-h">Recent</div>` + recent.map(r => rowHtml(byId.get(r.id), { st: "seen", line: "visited " + ago(r.at) })).join("")
    if(!h) h = `<div class="knav-empty">No other tables yet. Tables you sit at or visit on ${esc(label.toLowerCase())} show up here.</div>`
    sheet.innerHTML = h + foot
  }
  function open(){
    const p = pill(); if(!p || p.hidden) return
    if(!sheet){
      sheet = document.createElement("div")
      sheet.id = "knavSheet"
      sheet.className = "knav-sheet"
      sheet.setAttribute("role", "menu")
      sheet.setAttribute("aria-label", "Your tables")
      document.body.appendChild(sheet)
      sheet.addEventListener("click", onPick)
    }
    sheet.hidden = false
    p.setAttribute("aria-expanded", "true")
    document.body.classList.add("knav-open")
    draw()
    load(false).then(draw, () => { if(!games && sheet) sheet.querySelector(".knav-empty").textContent = "Couldn't load your tables. Try again in a moment." })
    clearInterval(refresher)
    refresher = setInterval(() => load(true).then(draw, () => {}), 15000)
    window.kdiag?.("board:nav:open", { at: here() })
  }
  function close(){
    if(!sheet || sheet.hidden) return
    sheet.hidden = true
    clearInterval(refresher); refresher = null
    const p = pill(); if(p) p.setAttribute("aria-expanded", "false")
    document.body.classList.remove("knav-open")
  }
  const isOpen = () => !!(sheet && !sheet.hidden)
  function onPick(e){
    const b = e.target.closest(".knav-row"); if(!b) return
    close()
    flip(b.dataset.id)
  }
  function flip(id){
    const H = here()
    if(!id || id === H) return
    const g = games && games.find(x => x && x.id === id)
    const sameKind = isBook(g) === (document.body.dataset.tradingMode === "orderBook")
    window.kdiag?.("board:nav:flip", { from: H, to: id, soft: sameKind })
    if(sameKind && typeof switchGame === "function" && document.getElementById("boardRoot")){
      try { window.__kMovedTo = null } catch(_){}
      switchGame(id)   // NAV-BACK1: adds a Back step
    } else {
      location.assign(location.pathname.replace(/\/board\/[^/]+/, "/board/" + encodeURIComponent(id)) + location.search)
    }
  }

  // ── wire the pill ──
  function wire(){
    const p = pill(); if(!p || p.dataset.knav) return
    p.dataset.knav = "1"
    p.setAttribute("role", "button")
    p.setAttribute("tabindex", "0")
    p.setAttribute("aria-haspopup", "menu")
    p.setAttribute("aria-expanded", "false")
    p.setAttribute("aria-controls", "knavSheet")
    p.addEventListener("click", e => { e.stopPropagation(); isOpen() ? close() : open() })
    p.addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); isOpen() ? close() : open() } })
  }
  document.addEventListener("click", e => { if(isOpen() && !e.target.closest("#knavSheet") && !e.target.closest("#boardAudience")) close() })
  document.addEventListener("keydown", e => { if(e.key === "Escape" && isOpen()){ close(); pill()?.focus() } })
  window.addEventListener("popstate", close)
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire()
  // warm the list shortly after load, so the first tap opens with rows in it
  setTimeout(() => { if(pill()) load(false).catch(() => {}) }, 2500)
  // ── NAV-WALL1: a table address from the other network (a shared link, a bookmark, a typed address) ──
  // In the app there are no cross-network links (owner, 2026-11-10); an address from outside can still
  // name a table on the other network. Opening it IS a switch, so it gets the same switch warning
  // (katomiaNet.switchTo, header.php) before the board is usable. Playnet is a developer network and
  // demo / preview boards have none: no gate there.
  let gated = ""
  function checkWall(){
    const N = net(), H = here()
    if(!N || !H || gated === H || N === "playnet" || !window.katomiaNet) return
    try { if(new URLSearchParams(location.search).has("demo") || window.KATOMIA_PREVIEW) return } catch(_){}
    const mode = window.katomiaNet.get()
    gated = H
    if(mode === N) return
    window.kdiag?.("net:gate", { table: H, net: N, mode })
    const W = window.katomiaNetLabel ? window.katomiaNetLabel(mode) : mode, T = window.katomiaNetLabel ? window.katomiaNetLabel(N) : N
    const box = document.createElement("div")
    box.className = "knw-scrim"
    box.innerHTML = `<div class="knw-dialog" role="dialog" aria-modal="true" aria-labelledby="knwGateT">
      <h3 id="knwGateT"><span class="knw-net" data-net="${esc(N)}">${esc(T)}</span> This table is on ${esc(T.charAt(0) + T.slice(1).toLowerCase())}</h3>
      <p><b style="font-family:ui-monospace,monospace">${esc(H)}</b> is on ${esc(T.toLowerCase())}. You're on ${esc(W.toLowerCase())}.</p>
      <p>To open it, switch network. You can't be on both at once.</p>
      <div class="knw-btns"><button type="button" data-a="stay">Stay on ${esc(W.charAt(0) + W.slice(1).toLowerCase())}</button><button type="button" data-a="go" class="knw-go" style="background:#4b55c9">Switch to ${esc(T.charAt(0) + T.slice(1).toLowerCase())}…</button></div>
    </div>`
    document.body.appendChild(box)
    box.addEventListener("click", async e => {
      const a = e.target.closest("[data-a]")?.dataset.a; if(!a) return
      if(a === "stay"){ location.assign(location.pathname.replace(/\/board\/.*$/, "") + "/"); return }
      box.hidden = true
      const on = await window.katomiaNet.switchTo(N)
      if(on){ box.remove(); try { window.boardRenderChat?.() } catch(_){} } else box.hidden = false
    })
  }
  setInterval(checkWall, 1000)

  // ── KNAV-KNOCK1 (owner 2026-11-10, navigation pass part 2: "a circle that needs your attention can
  // message you in the current chat, but you make it clear from the style of the message that that's a
  // message coming in from another circle"). Every 15 s while this tab is visible, the games list says
  // which deals you're in are being signed at your OTHER tables on this network (you.signing, backend
  // KNAV-KNOCK1). A new one knocks once: a dashed card in this table's stream with Go — never Sign
  // (owner: always flip first) — and, when the stream isn't on screen, a toast that stays. When that
  // deal leaves the list, a quiet card says how it ended (settled if it is in the table's recent trades,
  // otherwise ended without settling); in Concise view the knock folds into that outcome line.
  const KNOCKED_KEY = "katomiaKnocked"
  const knocked = (() => { try { return new Set(JSON.parse(sessionStorage.getItem(KNOCKED_KEY) || "[]")) } catch { return new Set() } })()
  const saveKnocked = () => { try { sessionStorage.setItem(KNOCKED_KEY, JSON.stringify([...knocked].slice(-200))) } catch {} }
  const active = new Map()   // txid → table id, deals you're in at other tables, as last seen
  function streamVisible(){
    const l = document.querySelector("#boardChatDock .kchat-dock-list")
    return !!(l && l.offsetParent && l.getBoundingClientRect().height > 24)
  }
  function knock(text, opts){
    try { window.katomiaChat?.system?.(text, opts) } catch(_){}
  }
  async function outcome(txid, id){
    let settled = false
    try {
      const r = await fetch(API() + "/game/" + encodeURIComponent(id) + "/trades?limit=30")
      const j = r.ok ? await r.json() : null
      settled = !!(j && Array.isArray(j.trades) && j.trades.some(t => t && t.txid === txid))
    } catch(_){}
    knock(settled ? `✅ The deal you were in at ${id} settled.` : `⌛ The deal you were in at ${id} ended without settling.`,
      { about: txid, knock: { from: id, kind: "outcome" } })
  }
  async function pollKnocks(){
    if(document.visibilityState !== "visible" || !pill()) return
    let list
    try { list = await load(true) } catch(_){ return }
    if(isOpen()) draw()
    const N = net(), H = here(), seen = new Set()
    for(const g of list){
      if(!g || g.network !== N || g.id === H) continue
      for(const d of (g.you && g.you.signing) || []){
        if(!d || !d.txid) continue
        seen.add(d.txid)
        if(!active.has(d.txid)) active.set(d.txid, g.id)
        if(knocked.has(d.txid)) continue
        knocked.add(d.txid); saveKnocked()
        const secs = d.until ? Math.round((d.until - Date.now()) / 1000) : null
        const left = secs == null ? "" : secs > 5400 ? " · window ends " + new Date(d.until).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })
          : secs > 0 ? " · " + secs + "s left" : ""
        const msg = `✍ A deal you're in is being signed at ${g.id}${left}.`
        knock(msg, { about: d.txid, knock: { from: g.id, kind: "sign" } })
        window.kdiag?.("board:nav:knock", { from: g.id, txid: d.txid, secs })
        if(!streamVisible() && typeof notify === "function")
          notify(`${g.id}: a deal you're in is being signed${left}`, "warning", { timeout: 0, key: "knock-" + d.txid, noStream: true,
            link: { href: location.pathname.replace(/\/board\/[^/]+/, "/board/" + encodeURIComponent(g.id)) + location.search, text: "Go" } })
      }
    }
    for(const [txid, id] of [...active]) if(!seen.has(txid)){ active.delete(txid); if(id !== H) outcome(txid, id) }
  }
  setTimeout(pollKnocks, 4000)
  setInterval(pollKnocks, 15000)

  window.katomiaSwitcher = { open, close, flip, get isOpen(){ return isOpen() }, reload: () => load(true).then(draw), pollKnocks }
})()
