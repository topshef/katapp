<?php require_once __DIR__ . '/kasset.php';
// ENTRY-CREATEBASIC1 (user 2026-07-29): ?skin=basic renders the noddy version of this
// form — name + network (Hedera testnet/mainnet only) + visibility (default unlisted),
// everything else fixed to happy-path defaults (proposal, cluster lock, joinRule *,
// delay 0, valid 60s, admin = intent pubkey). Same page, same submit path — the skin
// only changes what's SHOWN, mirroring how other controls take render options. The
// welcome page's "Create your own game" button links here with skin=basic; /create
// bare stays the full form.
$skinBasic = ($_GET['skin'] ?? '') === 'basic';
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="<?= kasset('katomia.css') ?>">
<title>Create Katomia Game</title>

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

label{
  display:block;
  font-weight:600;
  margin-bottom:8px;
}

input[type=text]{
  width:100%;
  padding:9px;
  font-size:14px;
  border:1px solid #ccc;
  border-radius:4px;
}

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

.create-btn{
  margin-top:10px;
  padding:11px 18px;
  font-size:15px;
  font-weight:bold;
  color:white;
  background:#28a745;
  border:none;
  border-radius:6px;
  cursor:pointer;
  box-shadow:0 2px 4px rgba(0,0,0,0.15);
  transition:all .15s ease;
}

.create-btn:hover{
  background:#218838;
  transform:translateY(-1px);
  box-shadow:0 4px 6px rgba(0,0,0,0.2);
}

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

  <h3 class="page-title"><?= $skinBasic ? 'Create your own game' : 'Create your own market' ?></h3>

  <div class="field field-name">
    <label>Game name <span class="explain">(optional)</span></label>
    <input id="gameName" placeholder="ABC demo">

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

  <div class="field adv-only">
    <label>Trading mode</label>

    <div class="options">
      <label class="option"><input type="radio" name="tradingMode" value="proposal" checked> Proposal</label>
      <label class="option"><input type="radio" name="tradingMode" value="orderBook"> Order Book</label>
      <label class="option"><input type="radio" name="tradingMode" value="debug"> Debug</label>
    </div>

    <div class="explain" id="tradingModeExplain"></div>
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
		<div class="explain">
			Access control (GAME-JOINRULE1). Leave blank to allow anyone. Or restrict entry to
			committed accounts: a comma-separated allowlist (<code>0.0.123, 0.0.456</code>),
			a group (<code>group:admin</code>), or a rule (<code>accountIdRange(0,500000)</code>).
			Players need a verified profile commitment from a matching account to see and enter the game.
		</div>
		<input id="joinRule" value="" placeholder="e.g. 0.0.123, 0.0.456 · group:admin · accountIdRange(0,500000)">

	</div>

	<div class="field adv-only">
		<div class="explain">
			Admin ID (optional)
		</div>
		<input id="admin" placeholder="Hedera account / public key">
		<div class="explain">
			Hedera account or public key. Leave blank to prevent game edit or deletion.
		</div>    

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


<button class="create-btn" id="createBtn">Create Game</button>

<div class="status" id="status"></div>

</div>

<script>

const API_URL = "./hapi/create"

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
		public:"Public games appear in listings.",
		unlisted:"Unlisted games are hidden from listings but accessible via shared link.",
		private:"Private games require specific join rules or permissions."
	},

  tradingMode:{
    proposal:"Negotiated intent. Use baskets and explicit lock.",
    orderBook:"Pre-authorized intent. Orders match and auto-lock.",
    debug:"OrderBook + expose intermediate stages for development."
  },

	lock:{
		all:"Every player in the entire game must agree for a swap to proceed. eg for private games when all parties are expected to participate",
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
}

document.querySelectorAll("input[name=network]").forEach(el => el.onchange = updateExplain)
document.querySelectorAll("input[name=visibility]").forEach(el => el.onchange = updateExplain)
document.querySelectorAll("input[name=lockRule]").forEach(el => el.onchange = updateExplain)
document.querySelectorAll("input[name=tradingMode]").forEach(el => el.onchange = updateExplain)

updateExplain()

createBtn.onclick = async () => {

status.textContent = "Creating game..."

const payload = {

  //id: gameName.value.trim() || undefined,
  profile: {
    name: gameName.value.trim() || ""
  },
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
      : Math.max(15, Math.min(180, Number(validDurationSeconds.value) || 40))
  },

}

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
status.textContent = "Failed to create game"
return
}

const id = data.gameId || data.game?.id

status.textContent = "Game created. Redirecting..."

// ENTRY-CREATEBASIC1: the basic flow lands on the BOARD (the default view) with
// ?created=1 so board.php can toast the share-this-link hint. Full form keeps the
// legacy game view it always had.
window.location.href = SKIN_BASIC ? ("./board/" + id + "?created=1") : ("./game/" + id)

}
catch(err){

console.error(err)
status.textContent = "Error creating game"

}

}



function defaultAdminAccount(){
  const el = document.getElementById("admin")
  if(!el || el.value.trim()) return

  const pubkey = getLocalOrderPubkeyHex()
  if(pubkey) el.value = pubkey
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

defaultAdminAccount()


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

</body>
</html>