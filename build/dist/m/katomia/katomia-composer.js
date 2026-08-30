// katomia-composer.js — JOINRULE-COMPOSER1 phase 1: the access-rule quick pick.
//
// A ⋯ button beside the access-control input opens this modal; the organizer builds
// the allowlist from a dropdown of tokens THEY already hold (the token you want to
// gate on is almost certainly one you've got — user 2026-08-19) plus paste-an-id rows,
// and "Use this rule" writes a plain CSV back into the input. The STRING stays the
// contract (backend checkJoinRule, GAME-JOINRULE2a); this is sugar that writes it.
// Round-trips: opening with a CSV already in the box parses it back into chips via
// the backend classifier. Phase 2 (and/or/not/deny grammar + full builder) is a
// separate step — see the mockup doc on the JOINRULE-COMPOSER1 task.
//
// Self-contained on purpose (own CSS + DOM, no page markup needed): the host page
// gains this the day the join rule becomes admin-editable.
//
// Backend lookups (both ride existing 24h caches, katomiaApi.js):
//   POST hapi/entities     {network, ids[]}     -> { id: {kind, name, symbol, tokenType} }
//   POST hapi/held-tokens  {network, accounts[]} -> [ {token_id, name, symbol, tokenType, balance} ]
(() => {
  if (window.katomiaComposer) return

  const CSS = `
  .kcomp-back{ position:fixed; inset:0; background:rgba(20,25,32,.45); z-index:1200;
    display:flex; align-items:flex-start; justify-content:center; padding:6vh 14px; }
  .kcomp{ background:#fdfdfe; border-radius:14px; box-shadow:0 8px 30px rgba(0,0,0,.25);
    width:100%; max-width:540px; max-height:84vh; overflow:auto; font-size:14px; color:#2a2f36; }
  .kcomp-head{ display:flex; justify-content:space-between; align-items:center;
    padding:13px 18px; border-bottom:1px solid #e3e7ee; position:sticky; top:0; background:#fff; }
  .kcomp-head b{ font-size:15px; }
  .kcomp-x{ border:0; background:none; font-size:16px; color:#7a8595; cursor:pointer; padding:4px 8px; }
  .kcomp-body{ padding:16px 18px; }
  .kcomp-foot{ padding:12px 18px; border-top:1px solid #e3e7ee; display:flex; gap:10px; justify-content:flex-end; background:#fff; position:sticky; bottom:0; }
  .kcomp-label{ font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:#a8a294; margin:14px 0 7px; }
  .kcomp-label:first-child{ margin-top:0; }
  .kcomp-row{ display:flex; gap:8px; }
  .kcomp-row select, .kcomp-row input{ flex:1; min-width:0; border:1px solid #e3e7ee; border-radius:8px; padding:7px 10px; font-size:13px; background:#fff; }
  .kcomp-add{ border:1px solid #e3e7ee; background:#f1f4f8; border-radius:8px; padding:7px 14px; font-size:13px; cursor:pointer; white-space:nowrap; }
  .kcomp-chips{ min-height:34px; margin-top:4px; }
  .kcomp-chip{ display:inline-flex; align-items:center; gap:7px; background:#f1f4f8; border:1px solid #e3e7ee;
    border-radius:999px; padding:5px 12px; font-size:13px; margin:3px 5px 3px 0; }
  .kcomp-chip button{ border:0; background:none; color:#7a8595; font-size:11px; cursor:pointer; padding:0 0 0 2px; }
  .kcomp-out{ border-top:1px solid #e3e7ee; margin-top:16px; padding-top:12px; }
  .kcomp-code{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px;
    background:#eef1f6; border-radius:6px; padding:9px 12px; word-break:break-all; }
  .kcomp-plain{ font-size:13px; color:#4a5462; background:#eef6ef; border:1px solid #cfe5d4; border-radius:8px; padding:8px 12px; margin-top:8px; }
  .kcomp-note{ font-size:12.5px; color:#7a8595; margin:6px 0 0; }
  .kcomp-kbtn{ border-radius:999px; padding:8px 18px; font-size:13.5px; border:1px solid #e3e7ee; background:#fff; cursor:pointer; }
  .kcomp-kbtn.green{ background:#1d9e57; border-color:#1d9e57; color:#fff; font-weight:600; }
  `

  const ID_RE = /^\d+\.\d+\.\d+$/
  const norm = s => { s = String(s || "").trim(); return /^\d+$/.test(s) ? "0.0." + s : s }
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]))

  const post = (path, body) => fetch(path, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then(r => r.json()).catch(() => null)

  // accounts this browser has authenticated/committed on the given network — the
  // quick-pick's "your accounts". kauthRecords lives in katomia-auth.js; the active
  // profile selection rides along when set. Empty is fine: paste-an-id still works.
  function myAccounts(network){
    const out = new Set()
    try {
      if(typeof kauthRecords === "function")
        for(const [k, rec] of Object.entries(kauthRecords()))
          if(k.startsWith(network + ":") && rec?.accountId) out.add(rec.accountId)
    } catch(e){}
    try {
      const a = (typeof kauthActiveAccount === "function") ? kauthActiveAccount() : ""
      if(ID_RE.test(a)) out.add(a)
    } catch(e){}
    return [...out]
  }

  function open({ input, network }){
    document.getElementById("kcompBack")?.remove()
    if(!document.getElementById("kcompCss")){
      const st = document.createElement("style"); st.id = "kcompCss"; st.textContent = CSS
      document.head.appendChild(st)
    }
    const onChain = network === "testnet" || network === "mainnet"
    const entries = []   // { id, kind: token|account|unknown, name, symbol }

    const back = document.createElement("div")
    back.className = "kcomp-back"; back.id = "kcompBack"
    back.innerHTML = `
      <div class="kcomp" role="dialog" aria-label="Compose access rule">
        <div class="kcomp-head"><b>🔐 Who can join?</b><button class="kcomp-x" data-close>✕</button></div>
        <div class="kcomp-body">
          ${onChain ? `
          <p class="kcomp-label">Add a membership token</p>
          <div class="kcomp-row">
            <select id="kcompTokens"><option value="">Loading your tokens…</option></select>
            <button class="kcomp-add" id="kcompAddTok">Add</button>
          </div>
          <p class="kcomp-note" id="kcompTokNote">Anyone holding at least one of the token gets in — an NFT collection or community token works as a membership pass.</p>
          ` : `
          <p class="kcomp-note">🧸 Playnet has no on-chain tokens — token gating applies on testnet and mainnet. You can still allow specific entries below.</p>
          `}
          <p class="kcomp-label">Or allow a specific account${onChain ? " (or paste any token ID)" : ""}</p>
          <div class="kcomp-row">
            <input id="kcompId" placeholder="0.0.…" inputmode="numeric">
            <button class="kcomp-add" id="kcompAddId">Add</button>
          </div>
          <p class="kcomp-label">Anyone matching ONE of these gets in</p>
          <div class="kcomp-chips" id="kcompChips"><span class="kcomp-note">Nothing yet — the ${esc(window.KTERMS?.one || "circle")} is open to anyone.</span></div>
          <div class="kcomp-out">
            <p class="kcomp-label">Rule</p>
            <div class="kcomp-code" id="kcompCode">*</div>
            <div class="kcomp-plain" id="kcompPlain">✅ Anyone can join.</div>
          </div>
        </div>
        <div class="kcomp-foot">
          <button class="kcomp-kbtn" data-close>Cancel</button>
          <button class="kcomp-kbtn green" id="kcompUse">Use this rule</button>
        </div>
      </div>`
    document.body.appendChild(back)
    const $ = id => back.querySelector("#" + id)

    const kindWord = e => e.kind === "token" ? (e.tokenType === "NON_FUNGIBLE_UNIQUE" ? "NFT" : "token") : e.kind
    const label = e => e.kind === "token" ? `🎟 holds ${e.name || e.symbol || e.id}`
                     : e.kind === "account" ? `👤 ${e.id}` : `❔ ${e.id}`

    function render(){
      const chips = $("kcompChips")
      chips.innerHTML = entries.length
        ? entries.map((e, i) => `<span class="kcomp-chip" title="${esc(e.id)}${e.kind === "token" ? " — " + esc(kindWord(e)) : ""}">${esc(label(e))}<button data-del="${i}">✕</button></span>`).join("")
        : `<span class="kcomp-note">Nothing yet — the ${esc(window.KTERMS?.one || "circle")} is open to anyone.</span>`
      $("kcompCode").textContent = entries.length ? entries.map(e => e.id).join(", ") : "*"
      const parts = entries.map(e =>
        e.kind === "token" ? `hold <b>${esc(e.name || e.symbol || e.id)}</b>` :
        e.kind === "account" ? `are account <b>${esc(e.id)}</b>` : `match <b>${esc(e.id)}</b>`)
      $("kcompPlain").innerHTML = parts.length
        ? "✅ You can join if you " + parts.join(", <b>or</b> you ") + "."
        : "✅ Anyone can join."
    }

    function addEntry(e){
      if(!e || entries.some(x => x.id === e.id)) return
      entries.push(e); render()
    }

    async function addById(raw){
      const id = norm(raw)
      if(!ID_RE.test(id)) return
      if(!onChain){ addEntry({ id, kind: "account" }); return }
      addEntry({ id, kind: "unknown" })                       // instant feedback…
      const r = await post("./hapi/entities", { network, ids: [id] })
      const info = r?.entities?.[id]
      if(info){ Object.assign(entries.find(x => x.id === id) || {}, info); render() }   // …then the classified truth
    }

    // seed from whatever is in the input already (round-trip) — CSV only; a
    // rule-object/group string is phase 2 territory and is left untouched.
    const current = String(input.value || "").trim()
    if(current && current !== "*" && !current.startsWith("{") && !/[()]/.test(current)){
      const ids = current.split(",").map(norm).filter(s => ID_RE.test(s))
      ids.forEach(id => addEntry({ id, kind: "unknown" }))
      if(ids.length && onChain) post("./hapi/entities", { network, ids }).then(r => {
        if(!r?.entities) return
        entries.forEach(e => Object.assign(e, r.entities[e.id] || {}))
        render()
      })
    }
    render()

    // your held tokens → the dropdown
    if(onChain){
      const accounts = myAccounts(network)
      const sel = $("kcompTokens")
      if(!accounts.length){
        sel.innerHTML = `<option value="">No connected accounts on ${network} — paste a token ID below</option>`
        $("kcompTokNote").textContent = "Connect & authenticate an account (☰ → Profile) and your tokens appear here to pick from."
      } else post("./hapi/held-tokens", { network, accounts }).then(r => {
        const toks = r?.tokens || []
        sel.innerHTML = toks.length
          ? `<option value="">Pick a token you hold…</option>` + toks.map(t =>
              `<option value="${esc(t.token_id)}">${esc(t.name || t.symbol || t.token_id)} — ${t.tokenType === "NON_FUNGIBLE_UNIQUE" ? "NFT" : "token"} · ${esc(t.token_id)}</option>`).join("")
          : `<option value="">Your accounts hold no tokens on ${network} — paste a token ID below</option>`
        sel.dataset.toks = JSON.stringify(toks)
      })
      $("kcompAddTok").onclick = () => {
        const tid = sel.value
        if(!tid) return
        const t = (JSON.parse(sel.dataset.toks || "[]")).find(x => x.token_id === tid)
        addEntry({ id: tid, kind: "token", name: t?.name, symbol: t?.symbol, tokenType: t?.tokenType })
        sel.value = ""
      }
    }

    $("kcompAddId").onclick = () => { addById($("kcompId").value); $("kcompId").value = "" }
    $("kcompId").addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); $("kcompAddId").click() } })
    $("kcompChips").addEventListener("click", e => {
      const i = e.target?.dataset?.del
      if(i != null){ entries.splice(Number(i), 1); render() }
    })
    $("kcompUse").onclick = () => {
      input.value = entries.length ? entries.map(e => e.id).join(", ") : ""
      input.dispatchEvent(new Event("change", { bubbles: true }))
      back.remove()
    }
    back.addEventListener("click", e => {
      if(e.target === back || e.target.closest("[data-close]")) back.remove()
    })
    document.addEventListener("keydown", function esc_(e){
      if(e.key === "Escape"){ back.remove(); document.removeEventListener("keydown", esc_) }
    })
  }

  // Wire a ⋯ button after the input. getNetwork is read at OPEN time, so flipping the
  // network radio then opening again refreshes against the right chain.
  function attach({ input, getNetwork }){
    if(!input || input.dataset.kcomp) return
    input.dataset.kcomp = "1"
    const row = document.createElement("div")
    row.style.cssText = "display:flex;gap:8px;align-items:stretch"
    input.parentNode.insertBefore(row, input)
    row.appendChild(input)
    const btn = document.createElement("button")
    btn.type = "button"; btn.id = "kcompOpen"; btn.textContent = "⋯"
    btn.title = "Compose a rule — pick from tokens you hold"
    btn.style.cssText = "border:1px solid rgba(0,0,0,.12);background:#f1f4f8;border-radius:10px;padding:0 14px;font-size:16px;cursor:pointer;flex:none"
    btn.onclick = () => open({ input, network: getNetwork?.() || "testnet" })
    row.appendChild(btn)
  }

  window.katomiaComposer = { attach, open }
})()
