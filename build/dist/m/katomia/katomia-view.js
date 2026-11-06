// katomia-view.js — VIEW-API1 (owner 2026-11-06): one place to read and change YOUR view of
// the board — window.katomiaView. Design: https://claude.ai/artifact/VmhfRyYvSGeLQATg383cBU
// ("Talking to the app through an agent" → the view layer, rung 2).
//
// WHY A SEAM. An agent (or a test, or a future "mirror my view" channel) should change what you
// see through the same doors you use, never by poking globals. So every setter here drives the
// ☰ menu's OWN control — sets its value and fires its change event — and the app reacts exactly
// as it does to a tap: same save, same re-render, same diag line. If a control is not on the page
// (the carousel hides ring-only rows, a page without the board has none), that key is reported
// unavailable rather than faked.
//
// WHAT IT IS NOT. Nothing here touches the game: no seat, no offer, no lock, no message, no key.
// It changes this browser's view and nothing anyone else sees (DIRECTION.md §1 — the advisor /
// agent line; a view is on the safe side of it). It answers on window only — there is no network
// door into it yet; a pairing channel for a remote assistant is the design's rung 4, not built.
//
//   katomiaView.get()                 → { feltNumber: "clear", skin: "ring16", view: "board", … }
//   katomiaView.keys()                → [{ key, values, label }]  what can be set, with the options
//   katomiaView.set({ feltNumber: "off", view: "split" })   → { applied: {…}, refused: {…}, now: get() }
//   katomiaView.openMenu() / closeMenu()
//   katomiaView.openPlayer("0.0.2002")      the account's player card, as a tap on its segment
//   katomiaView.link({ felt: "clear", skin: "carousel" })   this circle's address with view switches
// Every successful set() fires `katomia:view` on document with { detail: { changed, now } }.
(() => {
  if(window.katomiaView) return

  // key → the menu control that owns it. "bool" rows are checkboxes; the rest are <select>s whose
  // own <option>s are the allowed values (so adding an option in header.php needs nothing here).
  const CONTROLS = {
    feltNumber: { id: "boardPrefFeltNumber", label: "Account numbers (felt / faint / spoke)" },
    skin:       { id: "boardSkinSelect",     label: "Board shape" },
    uiSize:     { id: "boardPrefUiSize",     label: "Display size" },
    chipStyle:  { id: "boardPrefChipStyle",  label: "Chip style" },
    chipShape:  { id: "boardPrefChipShape",  label: "Chip shape" },
    selfBottom: { id: "boardPrefSelfBottom", label: "You at bottom", bool: true },
    partyOnly:  { id: "boardPrefPartyOnly",  label: "Party only", bool: true },
    autoArrange:{ id: "boardPrefAutoArrange",label: "Auto-arrange chips", bool: true },
  }
  const VIEWS = ["board", "split", "messages"]

  const control = key => document.getElementById(CONTROLS[key]?.id || "")
  const valuesOf = key => {
    const el = control(key)
    if(!el) return null
    return CONTROLS[key].bool ? [true, false] : [...el.options].map(o => o.value)
  }

  function get(){
    const now = {}
    for(const key of Object.keys(CONTROLS)){
      const el = control(key)
      if(el) now[key] = CONTROLS[key].bool ? el.checked : el.value
    }
    if(typeof boardCurrentView === "function") now.view = boardCurrentView()
    return now
  }

  function keys(){
    const out = Object.keys(CONTROLS).filter(control).map(key => ({ key, label: CONTROLS[key].label, values: valuesOf(key) }))
    if(typeof boardSetView === "function") out.push({ key: "view", label: "Board / split / messages", values: VIEWS })
    return out
  }

  function set(changes){
    const applied = {}, refused = {}
    for(const [key, raw] of Object.entries(changes || {})){
      if(key === "view"){
        if(typeof boardSetView !== "function") refused[key] = "not on this page"
        else if(!VIEWS.includes(raw)) refused[key] = "one of " + VIEWS.join(", ")
        else { boardSetView(raw); applied[key] = raw }
        continue
      }
      const el = control(key)
      if(!CONTROLS[key]){ refused[key] = "not a view setting"; continue }
      if(!el){ refused[key] = "not on this page"; continue }
      if(CONTROLS[key].bool){
        if(typeof raw !== "boolean"){ refused[key] = "true or false"; continue }
        if(el.checked === raw){ applied[key] = raw; continue }
        el.checked = raw
      } else {
        const v = String(raw)
        if(!valuesOf(key).includes(v)){ refused[key] = "one of " + valuesOf(key).join(", "); continue }
        if(el.value === v){ applied[key] = v; continue }
        el.value = v
      }
      // the control's own handler does the rest: save, re-render, diag
      el.dispatchEvent(new Event("change", { bubbles: true }))
      applied[key] = CONTROLS[key].bool ? el.checked : el.value
    }
    const now = get()
    if(Object.keys(applied).length)
      document.dispatchEvent(new CustomEvent("katomia:view", { detail: { changed: applied, now } }))
    return { applied, refused, now }
  }

  function openMenu(){
    const menu = document.getElementById("appMenu")
    if(menu && menu.classList.contains("hidden")) document.getElementById("appMenuBtn")?.click()
    return !!menu && !menu.classList.contains("hidden")
  }
  function closeMenu(){ window.katomiaMenu?.close?.(); return true }

  function openPlayer(accountId){
    if(typeof boardPlayerModal !== "function" || typeof state === "undefined" || !state?.accounts) return false
    const want = String(accountId || "")
    const acct = Object.values(state.accounts).find(a => a.id === want || a.id.split(":")[1] === want)
    if(!acct) return false
    boardPlayerModal(acct.playerId, acct.id)
    return true
  }

  // this circle's address carrying view switches the board reads on load (?felt=, ?skin=, …) —
  // the same switches the advisor's view links use. Unknown names pass through untouched.
  function link(params){
    const u = new URL(location.href)
    for(const [k, v] of Object.entries(params || {})) v == null ? u.searchParams.delete(k) : u.searchParams.set(k, String(v))
    return u.toString()
  }

  window.katomiaView = Object.freeze({ version: 1, get, keys, set, openMenu, closeMenu, openPlayer, link })
})()
