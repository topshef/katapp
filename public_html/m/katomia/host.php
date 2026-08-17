<?php
require_once __DIR__ . '/kasset.php';
require_once __DIR__ . '/site-config.php';
// ── CIRCLE-HOSTPAGE1 (user 2026-08-08) ──────────────────────────────────────────────
// "let's just start with a basic host page that allows us to go in and edit the games
// that we have created ... no one can go in and edit the house games, but if you own a
// game, you can go in and edit your game."
//
// Also a call to action, per the same steer: "we might even have this as something on the
// hamburger menu actually because it's kind of a call to action for people to host. And
// if you haven't got any circles, then the button to create a circle can be there."
// Hence the empty state is the create CTA, not an apology.
//
// OWNERSHIP IS THE INTENT KEY. A circle is yours when its adminAccount equals your intent
// public key — which is exactly what the basic create flow already puts there by default
// (defaultAdminAccount() in create-game.php). House/demo circles carry NO adminAccount at
// all, so they can never match, and the backend refuses them independently
// ("game has no admin identifier"). Nothing here needs to special-case them.
//
// WHY THE LIST IS PART LOCAL. /hapi/games only returns PUBLIC circles, so an unlisted one
// you made would be invisible here. Rather than add a backend "list circles by admin key"
// endpoint — which would let anyone holding a public circle's admin key enumerate that
// admin's UNLISTED circles, defeating the point of unlisted — the page remembers ids
// locally at create time and re-checks each one. This loses nothing: the intent key IS
// the admin credential and lives in the same localStorage, so if you lose one you have
// already lost the other.
$T = katomiaTerms();
$siteConfig = katomiaSiteConfig();
$pageTitle = ($siteConfig['landing']['title'] ?? 'Katomia') . ' — host';
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="<?= kasset('kfade.js') ?>"></script>
<link rel="stylesheet" href="<?= kasset('katomia.css') ?>">
<title><?= htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8') ?></title>
<style>
  *{ -webkit-tap-highlight-color: transparent; }
  body{ background:#f7f9fc; color:#333; }
  .host-wrap{ max-width:760px; margin:28px auto; padding:0 16px; }
  .host-head{ margin:0 0 4px; font-size:22px; }
  .host-sub{ color:#777; font-size:13.5px; margin:0 0 22px; }

  .host-chips{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
  .host-chip{
    padding:7px 13px; border-radius:999px; border:1px solid #d8dee8; background:#fff;
    font-size:13.5px; cursor:pointer; color:#333;
  }
  .host-chip.on{ background:#2f6fed; border-color:#2f6fed; color:#fff; }

  .host-card{
    background:#fff; border:1px solid #e3e7ee; border-radius:12px;
    padding:18px 18px 6px; box-shadow:0 1px 3px rgba(0,0,0,.05);
  }
  .host-field{ margin-bottom:18px; }
  .host-field label{ display:block; font-size:13px; font-weight:600; margin-bottom:5px; }
  .host-field input{
    width:100%; box-sizing:border-box; padding:9px 11px; font-size:15px;
    border:1px solid #d8dee8; border-radius:8px; background:#fff; color:#333;
  }
  .host-hint{ color:#888; font-size:12.5px; margin-top:5px; }
  .host-fixed{
    margin:4px 0 18px; padding:11px 13px; background:#f4f6fa; border-radius:8px;
    font-size:12.5px; color:#667;
  }
  .host-fixed b{ color:#445; }
  .host-actions{ display:flex; gap:10px; align-items:center; padding-bottom:14px; }
  .host-save{
    padding:10px 20px; border-radius:8px; border:0; background:#2f6fed; color:#fff;
    font-size:15px; cursor:pointer;
  }
  .host-save[disabled]{ opacity:.5; cursor:default; }
  .host-status{ font-size:13.5px; }
  .host-status.ok{ color:#1d8a44; }
  .host-status.bad{ color:#b3261e; }

  /* Open-the-circle link (user: "trivially at the bottom of the page offer a link to the
     game itself ... once you've edited the game you can just link directly to it"). */
  .host-open{ display:inline-block; margin:2px 0 18px; font-size:14px; color:#2f6fed; text-decoration:none; }
  .host-open:hover{ text-decoration:underline; }

  /* ── Future actions, MOCKED (user asked to "mock up a bit of the UI ... we can always
     wire that up later"). Rendered visibly INERT — greyed, cursor default, labelled
     "not wired up yet" — rather than as working-looking controls with fake defaults.
     A control that looks live and does nothing is worse than no control. */
  .host-soon{ margin-top:26px; border-top:1px solid #eceff4; padding-top:18px; }
  .host-soon h3{ font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:#98a0ad; margin:0 0 4px; }
  .host-soon .host-hint{ margin:0 0 14px; }
  .host-soonrow{
    display:flex; align-items:center; gap:12px; padding:11px 13px; margin-bottom:9px;
    border:1px dashed #d8dee8; border-radius:9px; background:#fbfcfe; opacity:.72;
  }
  .host-soonrow .ic{ font-size:17px; }
  .host-soonrow b{ font-size:13.5px; color:#556; display:block; }
  .host-soonrow span{ font-size:12.5px; color:#98a0ad; }
  .host-soontag{
    margin-left:auto; font-size:11px; font-weight:600; color:#98a0ad;
    border:1px solid #dfe4ec; border-radius:999px; padding:2px 9px; background:#fff; white-space:nowrap;
  }

  /* ── Danger zone. Deliberately last, separated, and NOT the same shape as Save. */
  .host-danger{ margin-top:26px; border-top:1px solid #f3d9d6; padding-top:18px; }
  .host-danger h3{ font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:#b3261e; margin:0 0 4px; }
  .host-delete{
    padding:9px 18px; border-radius:8px; border:1px solid #e5b5b0; background:#fff;
    color:#b3261e; font-size:14px; cursor:pointer;
  }
  .host-delete:hover{ background:#fdf3f2; }
  .host-delete[disabled]{ opacity:.5; cursor:default; }

  .host-empty{ background:#fff; border:1px solid #e3e7ee; border-radius:12px; padding:26px 20px; text-align:center; }
  .host-empty p{ color:#667; font-size:14.5px; margin:0 0 18px; }
  .host-cta{
    display:inline-block; padding:11px 22px; border-radius:9px; background:#2f6fed;
    color:#fff; text-decoration:none; font-size:15px;
  }
</style>
</head>
<body>
<?php require __DIR__ . '/header.php'; ?>

<div class="host-wrap">
  <h1 class="host-head">🎪 Host</h1>
  <p class="host-sub">Edit the <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> you own. Changes are signed with your key.</p>

  <div id="hostChips" class="host-chips" hidden></div>
  <div id="hostBody"><p class="host-sub">Loading…</p></div>
</div>

<?php require __DIR__ . '/profile-modal.php'; ?>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-profile.js') ?>"></script>

<script>
const HOST_API = "<?= $katomiaBase ?>/hapi"
const KTERMS = <?= json_encode($T, JSON_UNESCAPED_UNICODE) ?>;
const CREATE_HREF = "<?= $katomiaBase ?>/create"
const BOARD_HREF  = "<?= $katomiaBase ?>/board/"
const CIRCLES_HREF = "<?= $katomiaBase ?>/circles"

const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]))

let MY_KEY = null      // my intent public key (hex) — the admin credential
let CIRCLES = []       // circles this key owns
let SELECTED = null

// Ids remembered at create time (create-game.php writes these). Re-checked against the
// backend below — a remembered id proves nothing on its own.
function rememberedIds(){
  try { return JSON.parse(localStorage.getItem("katomiaMyCircles") || "[]") }
  catch { return [] }
}

async function myIntentKey(){
  const { publicKeyJwk } = await getOrCreatePlayerKeypair()
  return jwkXToHex(publicKeyJwk.x)
}

const ownedByMe = g => MY_KEY && String(g?.adminAccount || "").trim().toLowerCase() === MY_KEY.toLowerCase()

async function loadCircles(){
  MY_KEY = await myIntentKey()
  const found = new Map()

  // 1. public circles carrying my key as admin — no privacy question, this is already
  //    public data on the games listing.
  try {
    const res = await fetch(HOST_API + "/games", { headers: { "x-player-token": getOrCreatePlayerToken() } })
    const data = await res.json()
    for(const g of Object.values(data?.games || {})) if(ownedByMe(g)) found.set(g.id, g)
  } catch(e){ console.warn("[host] games listing failed", e) }

  // 2. circles I remember creating — covers unlisted/private, which never appear above.
  //    Each is re-fetched and re-checked: localStorage is a hint, not an authority, and a
  //    deleted or restarted-away circle simply drops out of the list.
  for(const id of rememberedIds()){
    if(found.has(id)) continue
    try {
      const res = await fetch(HOST_API + "/game/" + encodeURIComponent(id))
      const data = await res.json()
      if(data?.ok && data.game && ownedByMe(data.game)) found.set(id, data.game)
    } catch(e){ /* gone, private, or backend restarted — just not listed */ }
  }

  CIRCLES = [...found.values()]
  render()
}

function render(){
  const chips = document.getElementById("hostChips")
  const body  = document.getElementById("hostBody")

  if(!CIRCLES.length){
    chips.hidden = true
    body.innerHTML = `<div class="host-empty">
      <p>You don't host any ${esc(KTERMS.many)} yet.</p>
      <a class="host-cta" href="${esc(CREATE_HREF)}">Create a ${esc(KTERMS.one)}</a>
    </div>`
    return
  }

  // deep link (?game=<id>) so this page can be linked to from a board or a share
  const wanted = new URLSearchParams(location.search).get("game")
  if(!SELECTED) SELECTED = (wanted && CIRCLES.some(c => c.id === wanted)) ? wanted : CIRCLES[0].id

  chips.hidden = false
  chips.innerHTML = CIRCLES.map(c =>
    `<button type="button" class="host-chip${c.id === SELECTED ? " on" : ""}" data-id="${esc(c.id)}">
       ${esc(c.profile?.name || c.id)}
     </button>`).join("")
  chips.querySelectorAll(".host-chip").forEach(b => b.onclick = () => {
    SELECTED = b.dataset.id
    history.replaceState(null, "", "?game=" + encodeURIComponent(SELECTED))
    render()
  })

  const c = CIRCLES.find(x => x.id === SELECTED)
  if(!c) return
  const cfg = c.config || {}

  body.innerHTML = `<div class="host-card">
    <div class="host-field">
      <label for="fName">Name</label>
      <input id="fName" maxlength="80" value="${esc(c.profile?.name || "")}">
    </div>
    <div class="host-field">
      <label for="fWelcome">Welcome message</label>
      <input id="fWelcome" maxlength="500" value="${esc(cfg.welcomeMessage ?? "")}"
             placeholder="Leave blank for the default greeting">
      <div class="host-hint">Shown once to each player as they join, from you as Host, visible only to them.
        Blank uses Katomia's default; a single space suppresses it entirely.</div>
    </div>
    <div class="host-field">
      <label for="fIdle">Idle eviction (hours)</label>
      <input id="fIdle" type="number" min="0" max="8760" step="0.25" value="${esc(cfg.idleAccountHours ?? 1)}">
      <div class="host-hint">How long an inactive account stays on the board. 0 = never evict.</div>
    </div>
    <div class="host-field">
      <label for="fValid">Transaction validity (seconds)</label>
      <input id="fValid" type="number" min="15" max="180" step="1" value="${esc(cfg.validDurationSeconds ?? 40)}">
      <div class="host-hint">How long a built transaction stays signable. Hedera allows 15–180.</div>
    </div>

    <div class="host-fixed">
      Fixed for the life of this ${esc(KTERMS.one)}:
      <b>${esc(c.network || "—")}</b> network,
      <b>${esc(cfg.tradingMode || "—")}</b> mode,
      <b>${esc(c.lockRule || "—")}</b> lock,
      <b>${esc(c.visibility || "—")}</b>.
      These decide what a deal means, so changing them under a live board would
      reinterpret offers already on it.
    </div>

    <div class="host-actions">
      <button id="fSave" class="host-save">Save changes</button>
      <span id="fStatus" class="host-status"></span>
    </div>

    <a class="host-open" href="${esc(BOARD_HREF)}${encodeURIComponent(c.id)}">Open this ${esc(KTERMS.one)} →</a>

    <div class="host-soon">
      <h3>Coming to this panel</h3>
      <p class="host-hint">Sketched so the shape is visible — none of these do anything yet.</p>
      <div class="host-soonrow">
        <span class="ic">🤝</span>
        <span><b>Sponsorship</b><span>Approve who pays for this ${esc(KTERMS.one)}; their name shows in the welcome.</span></span>
        <span class="host-soontag">not wired up</span>
      </div>
      <div class="host-soonrow">
        <span class="ic">🚪</span>
        <span><b>Players</b><span>Remove an account or a player from the board.</span></span>
        <span class="host-soontag">not wired up</span>
      </div>
      <div class="host-soonrow">
        <span class="ic">🔑</span>
        <span><b>Transfer ownership</b><span>Hand this ${esc(KTERMS.one)} to another key or account.</span></span>
        <span class="host-soontag">not wired up</span>
      </div>
      <div class="host-soonrow">
        <span class="ic">🔒</span>
        <span><b>Access</b><span>Change who may join or see it.</span></span>
        <span class="host-soontag">not wired up</span>
      </div>
    </div>

    <div class="host-danger">
      <h3>Danger zone</h3>
      <p class="host-hint">Deleting removes the ${esc(KTERMS.one)} and everything on its board, for everyone. It cannot be undone.</p>
      <div class="host-actions">
        <button id="fDelete" class="host-delete">Delete this ${esc(KTERMS.one)}</button>
        <span id="fDelStatus" class="host-status"></span>
      </div>
    </div>
  </div>`

  document.getElementById("fSave").onclick = () => save(c)
  document.getElementById("fDelete").onclick = () => remove(c)
}

async function save(c){
  const btn = document.getElementById("fSave")
  const status = document.getElementById("fStatus")
  const cfg = c.config || {}

  // send only what actually CHANGED — a no-op save should not rewrite fields, and the
  // diff is what makes "not editable" errors point at something the user did
  const fields = {}
  const name = document.getElementById("fName").value
  const welcome = document.getElementById("fWelcome").value
  const idle = Number(document.getElementById("fIdle").value)
  const valid = Number(document.getElementById("fValid").value)

  if(name !== (c.profile?.name || "")) fields.name = name
  if(welcome !== (cfg.welcomeMessage ?? "")) fields.welcomeMessage = welcome
  if(idle !== Number(cfg.idleAccountHours ?? 1)) fields.idleAccountHours = idle
  if(valid !== Number(cfg.validDurationSeconds ?? 40)) fields.validDurationSeconds = valid

  if(!Object.keys(fields).length){
    status.className = "host-status"
    status.textContent = "Nothing changed."
    return
  }

  btn.disabled = true
  status.className = "host-status"
  status.textContent = "Signing…"

  try {
    const { privateKey, publicKeyJwk } = await getOrCreatePlayerKeypair()
    const payload = { type:"katomia_circleUpdate", gameId: c.id, fields, issuedAt: Date.now() }
    const sigRaw = await crypto.subtle.sign("Ed25519", privateKey,
      new TextEncoder().encode(JSON.stringify(payload)))

    const res = await fetch(HOST_API + "/circle/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload,
        signature: { alg:"Ed25519", pubkeyHex: jwkXToHex(publicKeyJwk.x), sig: bytesToBase64(new Uint8Array(sigRaw)) }
      })
    })
    const data = await res.json()
    if(!res.ok || !data?.ok) throw new Error(data?.error || ("HTTP " + res.status))

    // reflect what the backend ACTUALLY applied (it clamps), not what we sent
    for(const [k, v] of Object.entries(data.applied || {})){
      if(k === "name") (c.profile ||= {}).name = v
      else (c.config ||= {})[k] = v
    }
    // render() replaces the card (and with it #fStatus and #fSave), so the confirmation
    // has to be written to the NEW node — setting it on the old one first would be lost.
    render()
    const fresh = document.getElementById("fStatus")
    if(fresh){ fresh.className = "host-status ok"; fresh.textContent = "Saved." }
  } catch(err){
    console.error("[host] save failed", err)
    status.className = "host-status bad"
    status.textContent = "Couldn't save — " + (err?.message || err)
  } finally {
    const b = document.getElementById("fSave")
    if(b) b.disabled = false
  }
}

// ── Delete (CIRCLE-HOSTPAGE1 R2) ────────────────────────────────────────────────────
// Reuses the EXISTING signed katomia_deleteGame endpoint — the original admin verb, built
// long before this page. Nothing new server-side.
//
// TYPE-TO-CONFIRM rather than a plain OK/Cancel: this is the one irreversible action on
// the page, it destroys other people's boards as well as the host's, and the user asked
// for "a more severe sort of red button with a warning, the confirmation that you know
// that's irreversible". A confirm() dismissed by reflex is not that.
async function remove(c){
  const btn = document.getElementById("fDelete")
  const status = document.getElementById("fDelStatus")
  const label = c.profile?.name || c.id

  const typed = prompt(
    `Delete "${label}" permanently?\n\n` +
    `Everything on its board goes with it, for every player, and it cannot be undone.\n\n` +
    `Type the ${KTERMS.one} id to confirm:\n${c.id}`)
  if(typed === null) return                                  // cancelled
  if(String(typed).trim() !== c.id){
    status.className = "host-status bad"
    status.textContent = "That didn't match — nothing deleted."
    return
  }

  btn.disabled = true
  status.className = "host-status"
  status.textContent = "Signing…"

  try {
    const { privateKey, publicKeyJwk } = await getOrCreatePlayerKeypair()
    const payload = { type:"katomia_deleteGame", gameId: c.id, issuedAt: Date.now() }
    const sigRaw = await crypto.subtle.sign("Ed25519", privateKey,
      new TextEncoder().encode(JSON.stringify(payload)))

    const res = await fetch(HOST_API + "/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payload,
        signature: { alg:"Ed25519", pubkeyHex: jwkXToHex(publicKeyJwk.x), sig: bytesToBase64(new Uint8Array(sigRaw)) }
      })
    })
    const data = await res.json()
    if(!res.ok || !data?.ok) throw new Error(data?.error || ("HTTP " + res.status))

    // drop it locally too, or the host page keeps re-fetching a dead id every load
    try {
      const seen = JSON.parse(localStorage.getItem("katomiaMyCircles") || "[]")
      localStorage.setItem("katomiaMyCircles", JSON.stringify(seen.filter(x => x !== c.id)))
    } catch(e){}

    CIRCLES = CIRCLES.filter(x => x.id !== c.id)
    SELECTED = CIRCLES.length ? CIRCLES[0].id : null
    history.replaceState(null, "", SELECTED ? "?game=" + encodeURIComponent(SELECTED) : location.pathname)
    render()
  } catch(err){
    console.error("[host] delete failed", err)
    status.className = "host-status bad"
    status.textContent = "Couldn't delete — " + (err?.message || err)
    const b = document.getElementById("fDelete")
    if(b) b.disabled = false
  }
}

window.addEventListener("load", () => {
  loadCircles().catch(err => {
    console.error("[host] load failed", err)
    document.getElementById("hostBody").innerHTML =
      `<p class="host-sub">Couldn't load your ${esc(KTERMS.many)} — reload to try again.</p>`
  })
})
</script>
<!-- GCP feedback 2026-08-13: widget in place so Send feedback never navigates away
     (see circles.php note). data-screenshot off per KAT-FEEDSHOT-BROKEN1. -->
<?php require_once "{$_SERVER['DOCUMENT_ROOT']}/hapi_base.php"; $katomiaFwBase = get_hapi_base(); ?>
<script src="https://<?= htmlspecialchars($katomiaFwBase, ENT_QUOTES, 'UTF-8') ?>/feedback-widget.js"
        data-product="katomia-host"
        data-screenshot="0"></script>
</body>
</html>
