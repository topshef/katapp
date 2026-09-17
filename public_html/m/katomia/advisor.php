<?php
require_once __DIR__ . '/kasset.php';
require_once __DIR__ . '/site-config.php';
require_once __DIR__ . '/config.php';
// advisor.php — KATOMIA-MCP5 (user 2026-09-15): the help page for the Katomia advisor.
//
// DELIBERATELY BURIED. The user's ruling when the advisor was designed: "maybe do a
// public page about this but bury it in the documents ... it's not something we shout
// about from the site." So this page exists, is linked from the learn/FAQ page, and is
// NOT in the header menu or on the landing page. Leave it that way unless that ruling
// changes.
//
// THE LINE THIS PAGE EXISTS TO DRAW (user, 2026-09-15): it is an ADVISOR, not an agent.
// It holds no keys, joins no circle, and there is no tool in it that can act — so
// connecting it is not a decision about trust. That is the feature, not a caveat, and
// it is the first thing on the page. A Katomia AGENT is named as a separate future
// thing so nothing here reads as a step toward it by accident.
//
// The same copy is served by the backend at the connect URL itself
// (hbarlive_hts/kbot/advisor/lib/landing.js) — that page is what a person sees if they
// open the address in a browser. Keep the two saying the same thing; if they ever
// disagree, landing.js is the one users hit first.
//
// THE CONNECT URL IS FILLED IN BY THE BROWSER, not at render time. This page ships as a
// STATIC SHELL (build/build-static.sh renders it once, with a build-time .env_hapi that
// points at the alias Worker), so anything derived from $hapi_base here bakes in whatever
// the build machine was configured with — the first render came out as
// "https://api.katomia.com/hapi/mcp", which works but is not an
// address to hand a person, and would still say that on app.katomia.com.
//
// location.origin is the only thing that knows where the reader actually is, so the URL is
// written client-side from it. The markup carries the canonical address as its initial
// text, so the page is still correct with JavaScript off.
$T = katomiaTerms();
$siteConfig = katomiaSiteConfig();
$brand = $siteConfig['landing']['title'] ?? 'Katomia';
$mcpUrlFallback = 'https://labs.katomia.com/hapi/mcp';
?>
<!DOCTYPE html>
<html data-kfb-product="katomia">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="<?= kasset('kfade.js') ?>"></script>
<link rel="stylesheet" href="<?= kasset('katomia.css') ?>">
<?= kicon() ?>
<title><?= htmlspecialchars($brand, ENT_QUOTES, 'UTF-8') ?> — the advisor</title>
<style>
  body{ background:#f7f9fc; color:#2b3038; }
  .learn{ max-width: 720px; margin: 26px auto 60px; padding: 0 18px; line-height: 1.62; }
  .learn h1{ font-size: 27px; margin: 0 0 6px; letter-spacing:-.3px; }
  .learn .lede{ font-size: 16.5px; color:#525b68; margin: 0 0 8px; }
  .learn h2{ font-size: 20px; margin: 38px 0 10px; letter-spacing:-.2px; scroll-margin-top: 18px; }
  .learn p{ margin: 0 0 13px; }
  .learn a{ color:#2f6fed; }
  .learn ul, .learn ol{ margin: 0 0 13px; padding-left: 20px; }
  .learn li{ margin: 4px 0; }
  .small{ font-size: 13.5px; }
  .muted{ color:#6b7483; }
  .safe{ background:#e8f5ec; border:1px solid #2f7d4f; border-left-width:4px; border-radius:10px;
         padding:16px 18px; margin:18px 0; }
  .safe strong{ color:#1e5e3a; }
  .url{ display:block; background:#1a2029; color:#d7dee8; border-radius:8px; padding:13px 15px;
        margin:14px 0; font:600 14px/1.5 ui-monospace,Menlo,Consolas,monospace; word-break:break-all; }
  .later{ border-left:3px solid #d8dde6; padding:2px 0 2px 15px; margin:18px 0; color:#525b68; }
  .asks{ background:#fff; border:1px solid #e3e7ee; border-radius:12px; padding:14px 18px; margin:16px 0; }
  .asks p{ margin: 0 0 9px; }
  .asks p:last-child{ margin-bottom: 0; }
  .asks b{ font-weight: 600; }
</style>
</head>
<body>
<?php
  require __DIR__ . '/header.php';
  require __DIR__ . '/profile-modal.php';
?>

<div class="learn">

  <h1>The <?= htmlspecialchars($brand, ENT_QUOTES, 'UTF-8') ?> advisor</h1>
  <p class="lede">An expert at your shoulder while you play. It can see every public
     <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> at once, and the Hedera ledger underneath
     them — and it cannot touch any of it.</p>

  <div class="safe">
    <p><strong>An advisor, not an agent.</strong></p>
    <p>It holds no keys, joins no <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?>, and has no way
       to place an offer, accept one, or move anything. There is no button it can press on your behalf,
       because no such thing exists in it.</p>
    <p>So there is nothing to secure. Connecting it isn't a decision about trust — it reads the same
       public pages your browser can, and all it produces is words and a link.
       <strong>You are the one who acts</strong>, deliberately, here in the app.</p>
  </div>

  <h2>Connecting it</h2>
  <p>It works with Claude — on the web, in the desktop app, or in Claude Code. There is nothing to
     install and nothing to sign in to. You only do this once; after that it's available in any chat.</p>

  <span class="url" id="mcp-url"><?= htmlspecialchars($mcpUrlFallback, ENT_QUOTES, 'UTF-8') ?></span>

  <ol>
    <li>In Claude, open <b>Settings → Connectors</b>.</li>
    <li>Choose <b>Add custom connector</b>.</li>
    <li>Paste the address above. It asks for a name — call it <b>Katomia Advisor</b>. The name is just
        a label for you, so anything you'll recognise works.</li>
    <li>Click <b>Add</b>, then start a chat and ask it something.</li>
  </ol>

  <p class="small muted">Opening that address in a browser shows the same instructions, so it's a safe
     link to send someone. In Claude Code the one-liner is
     <code>claude mcp add --scope user --transport http katomia <span id="mcp-url-cli"><?= htmlspecialchars($mcpUrlFallback, ENT_QUOTES, 'UTF-8') ?></span></code>.</p>

  <script>
    // See the note at the top of advisor.php: this page is a static shell, so the reader's
    // own origin is the only reliable source for the connect address.
    (function () {
      try {
        var url = window.location.origin + '/hapi/mcp';
        var a = document.getElementById('mcp-url');
        var b = document.getElementById('mcp-url-cli');
        if (a) a.textContent = url;
        if (b) b.textContent = url;
      } catch (e) { /* leave the canonical address in place */ }
    })();
  </script>

  <h2>Things to ask it</h2>
  <div class="asks">
    <p><b>What's going on in the Katomia <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> right now?</b><br>
       <span class="small muted">Every public <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> at once — who's at the table, what's on offer, and where a swap is one person short.</span></p>
    <p><b>Which <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> have chickens in them?</b><br>
       <span class="small muted">Search by what a thing is called, not by its token id. Every answer comes back with a link you can open.</span></p>
    <p><b>Has that collection been moving lately?</b><br>
       <span class="small muted">Recent transfers across a whole NFT collection, and who holds it now.</span></p>
    <p><b>Who holds token 0.0.2341021 on testnet?</b><br>
       <span class="small muted">Straight off the ledger — including people who have never opened Katomia.</span></p>
    <p><b>Is 0.0.1532 worth inviting?</b><br>
       <span class="small muted">What they hold and what they've been up to, before you bring them into a deal.</span></p>
  </div>

  <p class="small muted">Token names on Hedera are not unique and cost nothing to copy, so the advisor
     always shows the token id beside the name, and flags it when two different tokens in one answer
     share a name. When they disagree, go by the id.</p>

  <h2>What it won't do</h2>
  <p>It won't join a <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?>, chat, make an offer, reserve
     anything or move an asset. It reads only <em>public</em>
     <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> — unlisted and private ones stay
     invisible to it, and it refuses any id that didn't come from the public list.</p>

  <div class="later">
    <p>A <b>Katomia agent</b> — one that could hold a seat and act for you — is a separate thing, and
       deliberately kept separate. It would need your permission, your credentials and a security story
       of its own. Nothing on this page is a step toward that by accident.</p>
  </div>

  <p class="small muted">Early days, and we'd like to hear how you get on — the 💬 button is the fastest
     way to tell us.</p>

  <div data-kfb="advisor-page" data-kfb-scope="page" data-kfb-label="Advisor help page" class="kfb-item"></div>

</div>

<script><?php require_once('config.php'); ?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
</script>

<script src="/vendor/kpay/kpool_widget/qrcode.min.js"></script>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-helpers.js') ?>"></script>
<script src="<?= kasset('kemoji.js') ?>"></script>
<script src="<?= kasset('katomia-profile.js') ?>"></script>
<script src="<?= htmlspecialchars($hapi_widget_src, ENT_QUOTES, 'UTF-8') ?>"
        data-product="katomia"
        data-screenshot="0"></script>
<script src="<?= kasset('kfeedbits.js') ?>"></script>
</body>
</html>
