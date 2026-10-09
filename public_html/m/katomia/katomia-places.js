// katomia-places.js — where you have been, and who is at a circle (owner 2026-10-09).
// Loaded on Home, Circles, the board and the order view. Two small things, kept together
// because both describe circles from the outside, and both will grow:
//
// ── RECENT-VISITS1: your watch / play history ────────────────────────────────────────
// Every circle page you open is remembered in THIS browser (localStorage katomiaRecent),
// newest first, side circles included — the list on Home is the way back to somewhere you
// were. It is history, not membership: the × on Home forgets a visit, it does not take
// your accounts off that board (leaving is still Remove account, inside the circle).
// OPEN (owner, same day): people operate in several circles at once, asynchronously, and
// will want to hop between them without going Home — a strip of recent circles (small
// chips) on the board itself is the likely next step; this store is what it would read.
// Visits and seats are different dimensions: a visit is "I looked", a seat is "I have
// accounts on that board" (the games list's `you` field, LIST-MINE1). The Circles list
// filters on seats; Home's history is visits.
//
// ── AUDIENCE-WWP1: watch / wait / play ───────────────────────────────────────────────
// The stadium (owner, same day): PLAYING are on the pitch — party to a deal in progress;
// WAITING are on the bench — seated with accounts, in no deal right now; WATCHING are in
// the stands — connected with nothing seated. The backend counts them (hbarlive_hts
// katomiaAudience, in the games list's `activity`). Shown as ▶ ⏸ 👁 with the words in the
// tooltip; whether "playing" is the right word in the UI is still open.
(function(){
  "use strict"
  const KEY = "katomiaRecent", MAX = 30
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(x => x && x.id) : [] } catch { return [] } }
  const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) } catch {} }

  window.katomiaRecent = {
    list: read,
    // Record a visit. Cheap to call on every state broadcast: it only writes when this
    // circle is not already on top, its name/network changed, or a minute has passed.
    touch(id, info = {}){
      if(!id) return
      id = String(id)
      const list = read()
      const top = list[0]
      const now = Date.now()
      if(top && top.id === id && (!info.name || top.name === info.name) && (!info.net || top.net === info.net)
         && (!info.view || top.view === info.view) && now - (top.at || 0) < 60000) return
      const old = list.find(x => x.id === id) || {}
      const entry = { id, view: info.view || old.view || "board", net: info.net || old.net || "",
                      name: info.name || old.name || "", at: now }
      write([entry].concat(list.filter(x => x.id !== id)))
    },
    remove(id){ write(read().filter(x => x.id !== String(id))) },
    clear(){ try { localStorage.removeItem(KEY) } catch {} }
  }

  // ▶ ⏸ 👁 — only the levels that are non-zero; "" when nobody is there.
  window.katomiaAudienceHtml = (a) => {
    a = a || {}
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
    const bits = [
      [a.playing, "▶", "playing — party to a deal right now"],
      [a.waiting, "⏸", "waiting — seated with accounts, in no deal"],
      [a.watching, "👁", "watching — connected, nothing seated"]
    ].filter(([n]) => n > 0)
    if(!bits.length) return ""
    const title = bits.map(([n, , w]) => `${n} ${w}`).join(" · ")
    return `<span class="katomia-aud" title="${esc(title)}">` +
      bits.map(([n, ico]) => `<span class="katomia-aud-bit">${ico}&#8239;${n}</span>`).join("") + `</span>`
  }

  // Ranking for "Live now": who is on the pitch first, then the bench, then the stands.
  window.katomiaAudienceScore = (a) => {
    a = a || {}
    return (a.playing || 0) * 10000 + (a.waiting || 0) * 100 + (a.watching || 0)
  }
})()
