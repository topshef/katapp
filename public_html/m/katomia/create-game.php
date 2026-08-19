<?php require_once __DIR__ . '/kasset.php';
require_once __DIR__ . '/site-config.php';
// ENTRY-CREATEBASIC1 (user 2026-07-29): ?skin=basic renders the noddy version of this
// form — name + network (Hedera testnet/mainnet only) + visibility (default unlisted),
// everything else fixed to happy-path defaults (proposal, cluster lock, joinRule *,
// delay 0, valid 60s, admin = intent pubkey). Same page, same submit path — the skin
// only changes what's SHOWN, mirroring how other controls take render options. The
// welcome page's "Create your own game" button links here with skin=basic; /create
// bare stays the full form.
// CIRCLE-TERM1 (user 2026-08-19): "game"/"market" copy rationalised to the configured
// term ({one} = circle) — title, name label, button, statuses. Same vocabulary
// parameter every other page uses (ENTRY-CIRCLES1, site-config.php).
$skinBasic = ($_GET['skin'] ?? '') === 'basic';
$T = katomiaTerms();
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<!-- ENTRY-FADES1 (user 2026-07-30): quiet cross-fade page transition. Must be in
     <head> — it arms the fade-in before first paint. -->
<script src="<?= kasset('kfade.js') ?>"></script>
<link rel="stylesheet" href="<?= kasset('katomia.css') ?>">
<?= kicon() ?>
<title>Create your own <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> — Katomia</title>

<style>
/* see above imported css todo organiase*/

* {
  -webkit-tap-highlight-color: transparent;
}


body{
  zzfont-family:sans-serif;
  background:#f5f5f5;
}

h2{
  margin-top:0;
}

.form{
  max-width:640px;
  margin:auto;
  background:white;
  padding:26px;
  border-radius:8px;
}

.field{
  margin-bottom:22px;
}

/* ENTRY-CREATEPOLISH1 (user 2026-07-29): labels massively muted — the VALUES carry
   the meaning ("Hedera Testnet" says network); the label is just a whisper of
   structure. Option/radio labels below stay full-size. */
.field > label, .form > label{
  display:block;
  font-size:11px;
  font-weight:600;
  text-transform:uppercase;
  letter-spacing:.07em;
  color:#a8a294;
  margin-bottom:8px;
}
.field > label .explain{ text-transform:none; letter-spacing:0; }

/* ENTRY-CREATEPOLISH1: friendlier inputs — rounded, translucent glass border,
   no more square #ccc boxes. (The old input[type=text] rule never matched: these
   inputs carry no type attribute.) */
.form input:not([type=radio]):not([type=checkbox]){
  width:100%;
  padding:10px 12px;
  font-size:14px;
  border:1px solid rgba(0,0,0,.12);
  border-radius:10px;
  background:rgba(255,255,255,.65);
  box-sizing:border-box;
  outline:none;
  transition:border-color .15s ease;
}
.form input:not([type=radio]):not([type=checkbox]):focus{ border-color:rgba(47,111,237,.45); }

/* UI-SELECTROUND1 (feedback 3172c7ca): the selects ride the new katomia.css baseline
   (rounded, chevron); here they just fill the row like the text inputs do. */
.form select{ width:100%; box-sizing:border-box; }

/* BOARD-PLAYERCOLOR1 addendum: theme pie wheel to the right of the dropdown. */
.theme-row{ display:flex; align-items:center; gap:14px; }
.theme-row select{ flex:1; min-width:0; }
#themeWheel{ width:52px; height:52px; flex:none; margin:-8px -4px; filter:drop-shadow(0 1px 2px rgba(0,0,0,.15)); transition:transform .25s ease; }
#themeWheel.spin{ transform:rotate(40deg); }

.options{
  display:flex;
  flex-wrap:wrap;
  gap:18px;
}

.option{
  display:flex;
  align-items:center;
  gap:6px;
  cursor:pointer;
  font-size:14px;
}

.option input{
  margin:0;
  cursor:pointer;
}

.explain{
  margin-top:6px;
  font-size:12px;
  color:#666;
}

.advanced{
  margin-top:28px;
}

h3{
  margin-bottom:14px;
  font-size:16px;
}

/* ENTRY-KBTN1: solid green fill retired — the button rides the shared .kbtn glassy
   library (katomia.css); only layout stays here. */
.create-btn{ margin-top:10px; }

.status{
  margin-top:14px;
  font-size:13px;
  color:#555;
}

@media(max-width:600px){

  .options{
    flex-direction:column;
    gap:8px;
  }

}


.page-title{
  margin:0 0 24px 0;

  font-size:22px;
  font-weight:600;
  color:#666;
}


/* ENTRY-CREATEBASIC1: the basic skin hides every .adv-only field and reorders the
   rest network-first (be explicit about the network before anything else — user
   2026-07-29). Flex order beats moving markup: the full form keeps its layout. */
.form.skin-basic{ display:flex; flex-direction:column; }
.form.skin-basic .adv-only{ display:none; }
.form.skin-basic .page-title{ order:0; }
.form.skin-basic .field-network{ order:1; }
.form.skin-basic .field-name{ order:2; }
.form.skin-basic .field-visibility{ order:3; }
.form.skin-basic .create-btn{ order:4; align-self:flex-start; }
.form.skin-basic .status{ order:5; }
.form.skin-basic .net-playnet{ display:none; }

</style>
</head>

<body>

<?php
  // HEADER-UNIFY: shared banner/hamburger + profile modal, same as every page.
  require __DIR__ . '/header.php';
  require __DIR__ . '/profile-modal.php';
?>

<div class="form<?= $skinBasic ? ' skin-basic' : '' ?>">

  <h3 class="page-title">Create your own <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?></h3>

  <!-- FORM-ORDER1 (user 2026-08-19): the full form opens in the SAME order the basic
       skin renders (theme, network, name, visibility) so the two forms feel like one
       form at two depths; the advanced fields follow. Swap/Lock rule moved down to sit
       just above Breakout — both are "how deals settle" knobs. The basic skin's CSS
       flex order still governs its own layout, unchanged. -->

  <!-- BOARD-PLAYERCOLOR1 (user 2026-08-03): the first personalisation knob — a THEME
       for the circle. Today it only drives the player-colour pack (backend PALETTES,
       config.palette), but the label says "theme" on purpose: the plan is for it to
       grow into a broader mood (felt, chrome) for the game. Default = the status-safe
       Option A palette. -->
  <div class="field">
    <label>🎨 Theme</label>
    <p class="explain">Sets the colours players are dealt. More theming to come.</p>
    <!-- BOARD-PLAYERCOLOR1 addendum (feedback 3172c7ca, 2026-08-17): "illustrate that
         theme dynamically on the page … a small wheel sitting to the right of the drop
         down … a pie chart with seven colors according to the theme selected". The
         wheel deliberately rides a bit proud of the row (overlap is fine per the
         feedback — "it can overlap the other things on the page … it's like just an
         effect"). -->
    <div class="theme-row">
      <select id="gameTheme">
        <option value="" selected>🌌 Nebula (default)</option>
        <option value="classic">🎩 Classic — soft, subdued</option>
        <option value="botanical">🌿 Botanical — natural, muted</option>
        <option value="gemstone">💎 Gemstone — rich, jewel tones</option>
        <option value="harvest">🌾 Harvest — countryside warmth</option>
      </select>
      <svg id="themeWheel" viewBox="-1 -1 2 2" aria-hidden="true"></svg>
    </div>
  </div>

  <div class="field field-network">
    <label>Network</label>

    <div class="options">
      <label class="option net-playnet"><input type="radio" name="network" value="playnet" checked> Playnet</label>
      <label class="option"><input type="radio" name="network" value="testnet">         Hedera Testnet</label>
      <label class="option"><input type="radio" name="network" value="mainnet">         Hedera Mainnet</label>
    </div>

    <div class="explain" id="networkExplain"></div>
  </div>

  <div class="field field-name">
    <label><?= htmlspecialchars($T['One'], ENT_QUOTES, 'UTF-8') ?> name <span class="explain">(optional)</span></label>
    <input id="gameName" placeholder="ABC demo">

  </div>

  <div class="field field-visibility">
    <label>Visibility</label>

    <div class="options">
      <label class="option"><input type="radio" name="visibility" value="public" checked> Public   </label>
      <label class="option"><input type="radio" name="visibility" value="unlisted"      > Unlisted </label>
      <label class="option"><input type="radio" name="visibility" value="private"       > Private  </label>
    </div>

    <div class="explain" id="visibilityExplain"></div>
  </div>

  <div class="field adv-only">
    <label>Trading mode</label>

    <div class="options">
      <label class="option"><input type="radio" name="tradingMode" value="proposal" checked> Proposal</label>
      <label class="option"><input type="radio" name="tradingMode" value="orderBook"> Order Book</label>
      <label class="option"><input type="radio" name="tradingMode" value="debug"> Debug</label>
    </div>

    <div class="explain" id="tradingModeExplain"></div>
  </div>

  <div class="field adv-only">
    <label>🔁/🔒 Swap/Lock Rule</label>
    <p class="explain">Initiate swaps once agreed between...</p>

    <div class="options">
      <label class="option"><input type="radio" name="lockRule" value="all">             All players</label>
      <label class="option"><input type="radio" name="lockRule" value="active">          Active players</label>
      <label class="option"><input type="radio" name="lockRule" value="cluster" checked> Any connected cluster</label>
    </div>

    <div class="explain" id="lockExplain"></div>
  </div>

  <!-- KAT-BREAKOUT1 P0 (spec §2): full form only — the basic skin applies the Auto
       rule silently (public/unlisted → on lock, private → off). Encoded as a VALUE,
       not a boolean, for future modes. -->
  <div class="field adv-only">
    <label>🚪 Breakout</label>
    <p class="explain">When a group locks a deal, it moves to its own side circle to settle — this
       circle stays open for everyone else.</p>
    <select id="gameBreakout">
      <option value="" selected>Auto — on lock for public &amp; unlisted circles</option>
      <option value="on-lock">On lock — deals settle in a side circle</option>
      <option value="off">Off — deals settle here (circle is busy while signing)</option>
    </select>
  </div>
	

	<div class="field adv-only">
		<label>🔐 Access control</label>
		<!-- Copy pass (user 2026-08-19): token gating is live (backend b4ddbe6) so say so;
		     internal task ids and the group:/accountIdRange() forms are OUT of the user-facing
		     copy ("too obscure") — both still parse below, they're just not advertised.
		     The human-proof paragraph is the user's own framing for the anti-bot story. -->
		<div class="explain">
			Leave blank to allow anyone. Or restrict who can take part with a comma-separated
			list of Hedera account IDs and/or token IDs (<code>0.0.123, 0.0.456</code>).
			A <b>token ID</b> admits anyone holding at least one of that token — so an NFT
			collection or community token works as a membership pass. Matching any one entry
			is enough; players prove ownership by connecting and authenticating their account.
		</div>
		<input id="joinRule" value="" placeholder="e.g. 0.0.123, 0.0.456 — account and/or token IDs">
		<div class="explain">
			💡 Humans only? Gate on a token that is only ever issued to verified people —
			any third-party proof-of-personhood token works as the pass.
		</div>

	</div>

	<div class="field adv-only">
		<div class="explain">
			Admin ID (optional)
		</div>
		<input id="admin" placeholder="Hedera account / public key">
		<div class="explain">
			Hedera account or public key. Leave blank to prevent any later edit or deletion.
		</div>

	</div>

	<!-- CHAT-WELCOME1 (user feedback 9a79276d, 2026-08-08): "when a player joins a circle
	     they might not know what to do ... the Welcome message might be a part of the game
	     configuration". adv-only, like every other organizer knob — the basic skin stays
	     fixed to happy-path defaults by design (ENTRY-CREATEBASIC1). Blank = the platform
	     default; the greeting is addressed to the joining player only, not broadcast. -->
	<div class="field adv-only">
		<div class="explain">
			Welcome message (optional)
		</div>
		<input id="welcomeMessage" placeholder="Welcome to my circle — say hello!">
		<div class="explain">
			Shown once to each player as they join, from Katomia, visible only to them.
			Leave blank for the default greeting.
		</div>
	</div>

	<!-- GAME-ORPHAN1 / KAT-IDLE1 (user 2026-08-07): the eviction timeout was a backend
	     constant with a per-game override nobody could reach — "if that's something the
	     game organizer can adjust then we probably want to include that in the create
	     game form... the longer version, not the noddy short one... maybe just a dropdown
	     with some common values rather than any amount." Hence: adv-only, a fixed value
	     list, 1 hour preselected to match the backend default. Fractional hours are fine —
	     katomia.js does hours * 3600 * 1000, and 0 disables the sweep entirely. -->
	<div class="field adv-only">
		<label>🍂 Remove inactive players after</label>
		<p class="explain">
			A player who has done nothing for this long has their accounts, assets and
			offers swept off the board. Players with an open connection never count as
			inactive, and a circle is skipped entirely while a transaction is mid-signing.
		</p>
		<select id="idleAccountHours">
			<option value="0.25">15 minutes</option>
			<option value="0.5">30 minutes</option>
			<option value="1" selected>1 hour (default)</option>
			<option value="3">3 hours</option>
			<option value="12">12 hours</option>
			<option value="24">24 hours</option>
			<option value="168">1 week</option>
			<option value="0">Never — leave them on the board</option>
		</select>
	</div>

  <label class="adv-only">Transaction settings</label>
  <div class="field adv-only">
    <div class="explain">
      Delay transaction start (seconds)
    </div>

    <input id="txDelaySeconds" value="60">
  </div>

  <div class="field adv-only">
    <div class="explain">
      Valid duration (seconds) — the window, starting at the transaction's
      timestamp, within which a consensus node will still accept it once
      submitted. Nothing is "on-chain" before submission; this just sets how
      late a signed transaction can still be sent in. Hedera's own default
      is 120s; shorter is handy for fast tests and for signers who don't
      want to hang around. <b>Hedera accepts 15&ndash;180s</b> — values
      outside that are rejected by the network itself
      (INVALID_TRANSACTION_DURATION), so out-of-range input is clamped.
    </div>

    <input id="validDurationSeconds" type="number" min="15" max="180" value="40">
  </div>


<button class="create-btn kbtn kbtn-green" id="createBtn">Create <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?></button>

<div class="status" id="status"></div>

</div>

<script>

const API_URL = "./hapi/create"
window.KTERMS = <?= json_encode($T, JSON_UNESCAPED_UNICODE) ?>;   // CIRCLE-TERM1: statuses speak the configured word too

// ENTRY-CREATEBASIC1: the basic skin's happy-path defaults. The hidden controls stay
// the single source of truth — we just SET them, so the existing payload build below
// works unchanged for both skins.
const SKIN_BASIC = <?= $skinBasic ? 'true' : 'false' ?>;   // explicit ; — PHP's ?> swallows the newline
if(SKIN_BASIC){
  document.querySelector('input[name=network][value=testnet]').checked = true      // playnet hidden; testnet is the safe explicit start
  document.querySelector('input[name=visibility][value=unlisted]').checked = true  // YouTube-familiar default: shareable link, not listed
  txDelaySeconds.value = "0"
  validDurationSeconds.value = "60"
}

const explain = {

	network:{
		playnet:"For fun.. no network connections.. swaps execute immediately as players agree",
		testnet:"For learning.. pretend 'monopoly' assets but using real wallet tools - players must sign to complete swaps.",
		mainnet:"For real.. Hedera mainnet where real transactions and fees apply."
	},

	visibility:{
		public:`Public ${KTERMS.many} appear in listings.`,
		unlisted:`Unlisted ${KTERMS.many} are hidden from listings but accessible via shared link.`,
		private:`Private ${KTERMS.many} require specific join rules or permissions.`
	},

  tradingMode:{
    proposal:"Negotiated intent. Use baskets and explicit lock.",
    orderBook:"Pre-authorized intent. Orders match and auto-lock.",
    debug:"OrderBook + expose intermediate stages for development."
  },

	lock:{
		all:`Every player in the entire ${KTERMS.one} must agree for a swap to proceed. eg for private ${KTERMS.many} when all parties are expected to participate`,
		active:"All active players must agree for a swap to proceed. Disconnected clusters can be executed atomically. eg Alice to pay Bob if Carol pays Dave",
		cluster:"Any connected group of accounts can swap independently.",
	}

}

function getRadio(name){
return document.querySelector(`input[name="${name}"]:checked`).value
}

// GAME-JOINRULE1: turn the free-text join-rule input into the backend shapes that
// checkJoinRule understands: "*" | [accountId,...] | {rule,params}. Bare digits are
// normalised to 0.0.x like the in-game account input.
function parseJoinRule(raw){
  raw = raw.trim()
  if(!raw || raw === "*") return "*"

  if(raw.startsWith("{")){ try { return JSON.parse(raw) } catch { return raw } }

  const grp = raw.match(/^group:(.+)$/)
  if(grp) return { rule:"accountGroup", params: grp[1].split(",").map(s=>s.trim()).filter(Boolean) }

  const fn = raw.match(/^([a-zA-Z]+)\(([^)]*)\)$/)
  if(fn) return { rule:fn[1], params: fn[2].split(",").map(s=>s.trim()).filter(Boolean).map(p => /^\d+$/.test(p) ? Number(p) : p) }

  // comma-separated allowlist of account ids
  return raw.split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(a => /^\d+$/.test(a) ? "0.0." + a : a)
}

function updateExplain(){
  networkExplain.textContent     = explain.network[getRadio("network")]
  visibilityExplain.textContent  = explain.visibility[getRadio("visibility")]
  lockExplain.textContent        = explain.lock[getRadio("lockRule")]
  tradingModeExplain.textContent = explain.tradingMode[getRadio("tradingMode")]

  // GCP feedback 2026-08-13: "Private visibility option makes no sense without
  // joining rule" — the basic skin hides the joinRule field, so Private there is a
  // door with no lock. When Private is picked on the basic form, offer the full
  // form (name/network/visibility carried over via query, prefilled below).
  if(document.querySelector(".form").classList.contains("skin-basic")){
    let a = document.getElementById("visibilityFullFormLink")
    if(getRadio("visibility") === "private"){
      if(!a){
        a = document.createElement("a")
        a.id = "visibilityFullFormLink"
        a.style.display = "block"
        a.style.marginTop = "6px"
        visibilityExplain.after(a)
      }
      const qs = new URLSearchParams({ visibility: "private", name: gameName.value || "", network: getRadio("network") })
      a.href = "create?" + qs
      a.textContent = "Private needs a joining rule — set one on the full form →"
    } else if(a) a.remove()
  }
}

// Prefill from query params (the basic→full handoff above; harmless direct-links too)
{
  const qs = new URLSearchParams(location.search)
  if(qs.get("name")) gameName.value = qs.get("name")
  for(const f of ["network", "visibility"]){
    const v = qs.get(f)
    const el = v && document.querySelector(`input[name=${f}][value="${v}"]`)
    if(el) el.checked = true
  }
}

document.querySelectorAll("input[name=network]").forEach(el => el.onchange = updateExplain)
document.querySelectorAll("input[name=visibility]").forEach(el => el.onchange = updateExplain)
document.querySelectorAll("input[name=lockRule]").forEach(el => el.onchange = updateExplain)
document.querySelectorAll("input[name=tradingMode]").forEach(el => el.onchange = updateExplain)

updateExplain()

createBtn.onclick = async () => {

status.textContent = `Creating your ${KTERMS.one}...`

// KAT-BREAKOUT1 P0: breakout resolves at submit — explicit choice wins, else the Auto
// rule (public/unlisted → on-lock, private → off/omitted). The server stays neutral
// (absent = off) so scripted/API creators and demo fixtures are untouched. ?breakout=
// query override is a test hook for harnesses that drive this form.
const breakoutValue = (() => {
  const q = new URLSearchParams(location.search).get("breakout")
  if(q === "on-lock" || q === "off") return q
  const sel = document.getElementById("gameBreakout")?.value
  if(sel) return sel
  const vis = getRadio("visibility")
  return (vis === "public" || vis === "unlisted") ? "on-lock" : ""
})()

const payload = {

  //id: gameName.value.trim() || undefined,
  profile: {
    name: gameName.value.trim() || ""
  },
  ...(breakoutValue ? { breakout: breakoutValue } : {}),
  network: getRadio("network"),
  visibility: getRadio("visibility"),
  joinRule: parseJoinRule(joinRule.value),
  lockRule: getRadio("lockRule"),
    
  config: {
    tradingMode:getRadio("tradingMode"),
    txDelaySeconds: txDelaySeconds.value === "" ? 60 : Number(txDelaySeconds.value),
    // KATOMIA-VALIDDUR1 (user 2026-07-15): threads through katomia.js →
    // deal.js's setTransactionValidDuration(); backend default 40s if
    // omitted, matching this field's own default. Clamped to Hedera's legal
    // 15..180s — a 5s test game reached a node and was precheck-rejected
    // (INVALID_TRANSACTION_DURATION); backend clamps too, this just keeps
    // the game config honest about what will actually be built.
    validDurationSeconds: validDurationSeconds.value === "" ? 40
      : Math.max(15, Math.min(180, Number(validDurationSeconds.value) || 40)),
    // GAME-ORPHAN1: idle-eviction timeout in hours; 0 = never. Always sent (including
    // the basic skin, which leaves the select at its 1h default) so the game config
    // states the rule outright rather than relying on the backend's `?? 1` fallback.
    idleAccountHours: Number(document.getElementById("idleAccountHours")?.value ?? 1),
    // BOARD-PLAYERCOLOR1: named player-colour pack; omitted = backend default palette
    ...(document.getElementById("gameTheme")?.value ? { palette: document.getElementById("gameTheme").value } : {}),
    // CHAT-WELCOME1: only sent when the organizer actually typed one. Omitted (not "")
    // when blank, because the backend treats an explicit empty string as "greet nobody"
    // — sending "" from an untouched field would silently disable the default greeting.
    ...(document.getElementById("welcomeMessage")?.value.trim()
        ? { welcomeMessage: document.getElementById("welcomeMessage").value.trim() } : {})
  },

}

// Belt to the load-handler's braces: if the field is still blank (load handler raced, or
// the key mint was slow) fill it NOW, before the circle exists. A circle created with no
// adminAccount can never be edited or deleted by anyone — worth one await to avoid.
await defaultAdminAccount()
const adminValue = admin.value.trim()
if(adminValue) payload.adminAccount = adminValue


try{

const res = await fetch(API_URL,{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify(payload)
})

const data = await res.json()

if(!data.ok){
status.textContent = `Failed to create the ${KTERMS.one}`
return
}

const id = data.gameId || data.game?.id

// CIRCLE-HOSTPAGE1 (2026-08-08): remember what we created so the Host page can list it.
// Needed because /games only returns PUBLIC circles — an unlisted one would otherwise be
// invisible to its own owner. The alternative (a backend "circles by admin key" lookup)
// would let anyone holding a public circle's admin key enumerate that admin's UNLISTED
// circles, which defeats the point of unlisted. This costs nothing in privacy: the intent
// key IS the admin credential and lives in the same localStorage, so losing one already
// means losing the other. The Host page re-checks every remembered id against the backend
// before trusting it — this list is a hint, never an authority.
try {
  const seen = JSON.parse(localStorage.getItem("katomiaMyCircles") || "[]")
  if(id && !seen.includes(id)){
    seen.push(id)
    // keep it bounded; oldest out first
    localStorage.setItem("katomiaMyCircles", JSON.stringify(seen.slice(-200)))
  }
} catch(e){ /* private mode / quota — the page still works, the circle just isn't remembered */ }

status.textContent = `${KTERMS.One} created. Redirecting...`

// ENTRY-CREATEBASIC1: land on the BOARD (the default view) with ?created=1 so
// board.php can toast the share-this-link hint. Snag fix (user 2026-08-19): the
// FULL form used to land on the legacy game.php view — both skins go to the board now.
window.location.href = "./board/" + id + "?created=1"

}
catch(err){

console.error(err)
status.textContent = `Error creating the ${KTERMS.one}`

}

}



// CIRCLE-HOSTPAGE1 fix (2026-08-08): this used to READ localStorage and give up when no
// keypair existed yet — so on a genuinely fresh browser (no keypair minted, which is the
// case for anyone creating their FIRST circle) the admin field stayed blank and the
// circle was created with adminAccount:null. A circle with no admin can never be edited
// or deleted BY ANYONE, ever: verifyAdminAction refuses it with "game has no admin
// identifier". Found while testing the host page — a first-time host's first circle was
// silently unownable, which is the worst case rather than an edge case.
//
// getOrCreatePlayerKeypair() MINTS one if absent (same helper the profile, ordering and
// delete paths already use, so this creates nothing new — it just stops being the only
// caller that refused to). Async, hence the awaited call at the bottom of this script.
async function defaultAdminAccount(){
  const el = document.getElementById("admin")
  if(!el || el.value.trim()) return

  try {
    const { publicKeyJwk } = await getOrCreatePlayerKeypair()
    const pubkey = jwkXToHex(publicKeyJwk?.x)
    if(pubkey) el.value = pubkey
  } catch(err){
    // Fall back to the old read-only path rather than blocking the form. If this also
    // yields nothing the user can still type an admin key in by hand.
    console.warn("[create] could not mint an intent key for the admin field", err)
    const pubkey = getLocalOrderPubkeyHex()
    if(pubkey) el.value = pubkey
  }
}

function getLocalOrderPubkeyHex(){
  try{
    const kp = JSON.parse(localStorage.getItem("katomiaPlayerKeypair") || "{}")
    return jwkXToHex(kp.publicKeyJwk?.x)
  }catch{
    return ""
  }
}

function jwkXToHex(x){
  if(!x) return ""
  const bin = atob(x.replace(/-/g, "+").replace(/_/g, "/"))
  return [...bin].map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
}

// Deferred to load: katomia-core.js (which defines getOrCreatePlayerKeypair) is included
// BELOW this inline script, so calling it here at parse time would hit a ReferenceError —
// which is precisely why the original read localStorage directly and silently gave up.
window.addEventListener("load", () => { defaultAdminAccount() })

// BOARD-PLAYERCOLOR1 addendum (feedback 3172c7ca): live theme wheel beside the 🎨
// dropdown — a 7-slice pie of the selected pack ("six or seven … so it's not too
// regular looking"). DISPLAY-ONLY duplicate of the backend PALETTES map
// (katomiaHelpers.js, BOARD-PLAYERCOLOR1) — the backend stays the source of truth
// for the colours actually dealt; the feedback's own suggestion of a palette-fetch
// API is logged on the task and would replace this map when it exists.
const THEME_PALETTES = {
  "":        ["#5865c2", "#8b5bb0", "#3d7a99", "#b05b8a", "#4a5a8f", "#7a6ab5", "#2f6b7a"],
  classic:   ["#4477aa", "#7b5fb0", "#c2588f", "#5aa9c9", "#3d8f83", "#8a6d4a", "#a0669f"],
  botanical: ["#5c7a4e", "#7a5c3e", "#9c7bb5", "#4e7a8a", "#b58a5c", "#8a4e6b", "#6b8f71"],
  gemstone:  ["#3f5fbf", "#7d4ea8", "#2e8a99", "#a8547d", "#6e6a9e", "#946b3d", "#4a7ab5"],
  harvest:   ["#a8763d", "#7a8a4e", "#8a5c3e", "#b5985c", "#6b7a8f", "#9e5c4e", "#77894e"],
}
function drawThemeWheel(){
  const svg = document.getElementById("themeWheel")
  const colours = THEME_PALETTES[document.getElementById("gameTheme")?.value || ""] || THEME_PALETTES[""]
  if(!svg) return
  const n = colours.length, seg = (2 * Math.PI) / n
  svg.innerHTML = colours.map((c, i) => {
    const a0 = i * seg - Math.PI / 2, a1 = a0 + seg
    return `<path d="M0 0 L${Math.cos(a0).toFixed(4)} ${Math.sin(a0).toFixed(4)} A1 1 0 0 1 ${Math.cos(a1).toFixed(4)} ${Math.sin(a1).toFixed(4)} Z" fill="${c}"/>`
  }).join("")
  svg.classList.remove("spin"); void svg.getBoundingClientRect(); svg.classList.add("spin")
  setTimeout(() => svg.classList.remove("spin"), 300)
}
document.getElementById("gameTheme")?.addEventListener("change", drawThemeWheel)
drawThemeWheel()

</script>

<script><?php require_once('config.php');?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
</script>

<!-- Profile modal stack (PROFILE-INDEX1) — same modal as in-game; core is load-safe
     off the game page (game controls guarded). -->
<?php require_once($_SERVER['DOCUMENT_ROOT'] . "/vendor/walletconnect/kwcScriptTag.php"); ?>
<script src="/vendor/kpay/kpool_widget/qrcode.min.js"></script>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-helpers.js') ?>"></script>
<script src="<?= kasset('kemoji.js') ?>"></script>
<script>
  // katomia-modals.js (the diag sender) isn't loaded here — shim so profile/auth
  // scripts' katomiaDiagSend?.() calls resolve instead of ReferenceError.
  window.katomiaDiagSend = window.katomiaDiagSend || function(){}
</script>
<script src="<?= kasset('katomia-profile.js') ?>"></script>
<script src="<?= kasset('katomia-auth.js') ?>"></script>

<script>
	fetch("./footer.html")
		.then(r => r.text())
		.then(html => {
			document.body.insertAdjacentHTML("beforeend", html)
		})
</script>

<!-- GCP feedback 2026-08-13: widget in place so Send feedback never navigates away
     (see circles.php note). data-screenshot off per KAT-FEEDSHOT-BROKEN1. -->
<script src="https://<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>/feedback-widget.js"
        data-product="katomia-create"
        data-screenshot="0"></script>
</body>
</html>