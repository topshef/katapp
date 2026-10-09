<?php
// header.php — the ONE app header (HEADER-UNIFY / PROFILE-INDEX1).
// Include right after <body> on every page (index/games list, create, game).
// Links are absolute, prefixed with $katomiaBase (site-config.php): the game page
// lives at a rewritten depth, and on bundle domains (KAT-DEPLOY1b) the base is ''.

// KATOMIA-ADMIN1: site-wide operator-admin check, modeled on gomint's
// auth.php IP-admin pattern (shop.gomint.me, same repo family, same IP
// list). Distinct from the existing per-game/NFT admin concept (👑,
// katomia-profile.js renderGameAdminTools) — 🛠 is used here deliberately
// so the two don't both read as "crown = admin" in the same app. Soft/
// discoverability gating only (hides the menu item), not a hard access
// block — the destination itself isn't IP-checked.
// ENTRY-CIRCLES1 (user 2026-07-30): the menu's product vocabulary is a parameter too.
require_once __DIR__ . '/site-config.php';
$katomiaTerms = katomiaTerms();

$katomiaIpAdmin = '130.185.251.53 ';
$katomiaIsAdmin = strpos($katomiaIpAdmin, $_SERVER['REMOTE_ADDR'] ?? '') !== false;
$katomiaGameId = $_GET['game'] ?? '';
$katomiaLegacyGameHref = $katomiaGameId ? $katomiaBase . '/game/' . rawurlencode($katomiaGameId) : $katomiaBase . '/';
// MENU-SPEC1 (owner 2026-10-09): the menu depends on WHERE you are. Each page that includes
// this header says which page it is (define KATOMIA_PAGE before the require); the static
// bundle renders every page once, so this has to be decided per page, not per request.
//   home    — the welcome page: the network row replaces 🏠 Home (Home on Home does nothing)
//   circles — the list: no ⭕ Circles row, for the same reason; the same network row as Home
//             (MENU-NET2, owner 2026-10-09 — one control, one setting, no conflict)
//   board / game — inside a circle: no Circles row; the network row is READ-ONLY (a circle IS
//             one network — it says which, so nobody wonders whether to switch)
$katomiaPage = defined('KATOMIA_PAGE') ? KATOMIA_PAGE : (defined('KATOMIA_BOARD_CONTEXT') ? 'board' : '');
$katomiaInCircle = in_array($katomiaPage, ['board', 'game'], true);
?>
<style>
  /* Page harmonizer: every page that carries this header gets the same body inset
     and full-bleed banner (the KATLAB clip-safe pattern from game.php: pad the body,
     let the banner bleed into the padding with negative margins). Lives here rather
     than katomia.css so it only applies to pages that actually include the header. */
  body { margin: 0; padding: 16px; box-sizing: border-box; }
  .app-banner { width: auto; margin: -16px -16px 12px -16px; position: relative; }

  /* KBUNDLE-STRIP:kea */
  /* ENTRY-KEANERD1 (user 2026-07-29): KEA affordances are nerd-mode-only for the
     closed alpha — non-nerd users never see the Execution agent (menu item + profile
     section, both tagged data-feature="kea"). Deliberately overrides the earlier
     "nerd mode shouldn't gate features" stance: it's a noise-gate for now, cheap to
     revert. KATOMIA_FEATURES.kea stays the hard off-switch underneath. */
  /* :not(.kadmin) — BUNDLE-STRIP1: admin disclosure overrides the nerd gate; the
     admin-disclose block below badges what it reveals. */
  body:not(.nerd):not(.kadmin) [data-feature="kea"] { display: none !important; }
  /* /KBUNDLE-STRIP:kea */

  /* KATUI3 R9 (user 2026-08-17): the ☰ gets the same dead-tap immunity as the
     modal's ✕ — a touch starting on it can never be classified as a page-scroll
     start (which silently eats the tap: no click, no cue), and :active gives
     on-contact feedback. */
  .app-menu-btn { touch-action: none; -webkit-tap-highlight-color: transparent; }
  .app-menu-btn:active { transform: scale(0.9); opacity: 0.7; }

  /* Generic hook for future nerd-only menu items (the dark-mode toggle used to be one;
     it now lives solely on the welcome theme-test row — ENTRY-DARKMODE1 R2). */
  .app-menu-item.nerd-only { display: none; }
  /* BOARD-CHAT1 R2: menu entries that only make sense on a phone */
  .app-menu-item.mobile-only { display: none; }
  @media (max-width: 600px){ .app-menu-item.mobile-only { display: block; width: 100%; } }
  body.nerd .app-menu-item.nerd-only { display: block; width: 100%; }
  /* KCHANGES1: the switch is rendered hidden and revealed by kchanges.js for admins —
     .app-menu-item's own display would beat the UA's [hidden] rule without this */
  .app-menu-kchanges[hidden] { display: none !important; }
  /* HOSTMENU-STATIC1: same trap for the host item — without this, `hidden` did nothing on
     the PHP-served page and every player in a circle saw "Host options" */
  #katomiaHostOptions[hidden] { display: none !important; }
  .app-menu-kchanges--on { background: #fff7c2; }

  /* ═══ MENU-SPEC1 (owner 2026-10-09) — pilot takes the parts of lab2 the owner named ═══ */
  /* The menu is as wide as its widest row from the moment it opens (collapsed groups are laid
     out, just zero-height), so unrolling a group never jolts it wider. Capped for phones; it
     scrolls inside itself rather than running off the bottom of the screen. */
  .app-menu{ max-width: min(330px, calc(100vw - 16px)); max-height: calc(100dvh - 72px);
    overflow-y: auto; overscroll-behavior: contain; }

  /* Network — ONE place to choose it: the ☰ on Home. Orange testnet, purple mainnet. */
  .app-menu-netrow{ display:flex; align-items:center; justify-content:space-between; gap:10px;
    padding:6px 10px 10px; border-bottom:1px solid #eee; margin-bottom:4px; }
  .app-menu-netlabel{ font-size:15px; color:#333; }
  .app-menu-net{ display:inline-flex; border:1px solid #d7d3c8; border-radius:999px; overflow:hidden; background:#fff; }
  .app-menu-net button{ border:0; border-radius:0; background:transparent; box-shadow:none;
    font:700 11px/1 system-ui,sans-serif; letter-spacing:.04em; text-transform:uppercase;
    padding:8px 10px; color:#666; cursor:pointer; -webkit-tap-highlight-color:transparent; }
  .app-menu-net button:hover{ background:#f3f3f3; transform:none; box-shadow:none; }
  .app-menu-net button[aria-pressed="true"][data-net="testnet"]{ background:#e8731a; color:#fff; }
  .app-menu-net button[aria-pressed="true"][data-net="mainnet"]{ background:#6e3fd3; color:#fff; }
  .app-menu-net button[aria-pressed="true"][data-net="playnet"]{ background:#1f8f4e; color:#fff; }
  .app-menu-net button[data-net="playnet"]{ display:none; }
  body.nerd .app-menu-net button[data-net="playnet"]{ display:inline-block; }
  /* MENU-NET2: the read-only row inside a circle — one pill in the network's colour */
  .app-menu-netpill{ font:700 11px/1 system-ui,sans-serif; letter-spacing:.04em; text-transform:uppercase;
    padding:7px 11px; border-radius:999px; background:#eee; color:#666; }
  .app-menu-netpill[data-net="testnet"]{ background:#e8731a; color:#fff; }
  .app-menu-netpill[data-net="mainnet"]{ background:#6e3fd3; color:#fff; }
  .app-menu-netpill[data-net="playnet"]{ background:#1f8f4e; color:#fff; }

  /* Nested groups (like a Windows submenu, but unrolling in place). The body is a one-row grid
     that animates 0fr → 1fr, so it rolls open at its real height with no measuring. */
  .app-menu-group{ display:flex; flex-direction:column; }
  .app-menu-grouphead{ display:flex; align-items:center; gap:8px; width:100%; box-sizing:border-box;
    padding:10px 12px; border:0; border-radius:8px; background:transparent; box-shadow:none;
    font:inherit; font-size:15px; color:#333; text-align:left; cursor:pointer; user-select:none; }
  .app-menu-grouphead:hover{ background:#f3f3f3; transform:none; box-shadow:none; }
  .app-menu-grouplabel{ flex:1; }
  .app-menu-groupcaret{ color:#999; font-size:12px; transition:transform .22s ease; }
  .app-menu-group.is-open > .app-menu-grouphead .app-menu-groupcaret{ transform:rotate(90deg); }
  .app-menu-groupbody{ display:grid; grid-template-rows:0fr; transition:grid-template-rows .22s ease; }
  .app-menu-group.is-open > .app-menu-groupbody{ grid-template-rows:1fr; }
  .app-menu-groupinner{ min-height:0; overflow:hidden; visibility:hidden; transition:visibility 0s linear .22s; }
  .app-menu-group.is-open > .app-menu-groupbody > .app-menu-groupinner{ visibility:visible; transition-delay:0s; }
  .app-menu-grouppad{ display:flex; flex-direction:column; gap:6px; margin:0 0 6px 18px; padding:2px 0 2px 10px; border-left:2px solid #eee; }
  .app-menu-grouppad .app-menu-item{ font-size:14px; padding:8px 10px; }
  .app-menu-grouppad .app-menu-grouphead{ font-size:14px; padding:7px 8px; }
  @media (prefers-reduced-motion: reduce){
    .app-menu-groupbody, .app-menu-groupcaret, .app-menu-groupinner{ transition:none; }
  }
  /* Developer: shown in nerd mode, or whenever it holds a row that is not nerd-gated (the
     IP-admin row, or the kchanges rows kchanges.js reveals to admin accounts) */
  .app-menu-devgroup{ display:none; }
  body.nerd .app-menu-devgroup,
  .app-menu-devgroup:has(.app-menu-item:not([hidden]):not(.nerd-only)){ display:flex; }
  body.nerd .app-menu-item.nerd-only{ display:flex; }
  /* one weight for every row: button rows (You, Send feedback) took the global button weight
     and read bolder than the link rows and group heads around them */
  .app-menu button.app-menu-item{ font-family:inherit; font-weight:inherit; }

  /* View (board): its settings are plain rows inside the group — no popover any more */
  .app-menu-settings{ display:flex; flex-direction:column; gap:8px; margin:0; padding:2px 0; }
  .app-menu-settings .board-settings-label{ font-size:14px; color:#444; }
  .app-menu-settings .board-settings-label select{ font-size:13px; }
  .app-menu-settings .app-menu-group .app-menu-grouppad{ margin-left:2px; }
  .app-menu-grouppad .app-menu-viewrow{ border:0; margin:0; padding:2px 0 4px; justify-content:flex-start; }
  [data-board-ringonly][hidden]{ display:none !important; }
  .app-menu-devonly{ display:none !important; }
  body.nerd .app-menu-devonly{ display:flex !important; }
</style>

<script>
// BRAND-RINGMARK1: ?mark=o|end chooses where the ring sits and remembers the choice.
(function(){
  try{
    var q = new URLSearchParams(location.search).get("mark")
    if(q === "o" || q === "end") localStorage.setItem("katomiaMark", q)
    if((localStorage.getItem("katomiaMark") || "end") === "o") document.documentElement.classList.add("mark-o")
  }catch(e){}
})()
</script>

<div id="notifications"></div>

<div class="app-banner">
  <div class="app-banner-inner">
    <h2>
      <a class="app-home-link" href="<?= $katomiaBase ?>/" title="Katomia — home">
        <!-- BRAND-RINGMARK1 (user 2026-09-04): the 💱🐫 pair gives way to the brand ring
             (assets/katomia-ring.svg — the same mark as the favicon and Kato's avatar),
             set at cap height so it reads as a letter, not an icon. Default: after the
             word. ?mark=o (remembered) swaps it INTO the word — Kat◍mia — which the
             operator wanted to see before choosing; ?mark=end flips back. -->
        <span class="app-title">Kat<span class="app-title-o">o</span>mia</span>
        <span class="app-icons app-ring"><img src="<?= $katomiaBase ?>/assets/katomia-ring.svg" alt="" width="30" height="30"></span>
      </a>
    </h2>
    <button id="appMenuBtn" class="app-menu-btn" aria-label="Menu" aria-expanded="false" title="Menu">☰</button>
  </div>

  <!-- MENU-TIDY1 (user 2026-07-07): the menu holds DESTINATIONS only. Removed:
       "Create market" (a button on the Markets page — contextual, not navigation)
       and "Nerd mode" (a preference — lives in Profile → Preferences & diagnostics). -->
  <nav id="appMenu" class="app-menu hidden">
    <?php if ($katomiaPage === 'home' || $katomiaPage === 'circles'): ?>
    <!-- MENU-SPEC1 (owner 2026-10-09): the network is chosen HERE and nowhere else — the ☰ on
         Home (and, MENU-NET2 the same day, on Circles: the same control and the same setting,
         so the two pages can never disagree). "You have to go to the home page, and then choose your network there." Inside a
         circle the circle's own network applies; the wallet pickers in the You and Authenticate
         modals follow this switch and say where it is changed. Playnet is developer-only.
         Wired by the MENU-NET1 script below; a switch, so the menu stays open on a tap. -->
    <div class="app-menu-netrow" data-menu-network>
      <span class="app-menu-netlabel">Network</span>
      <div class="app-menu-net" role="group" aria-label="Network">
        <button type="button" data-net="testnet" aria-pressed="false" title="Test assets — nothing real moves">Testnet</button>
        <button type="button" data-net="mainnet" aria-pressed="false" title="Real assets">Mainnet</button>
        <button type="button" data-net="playnet" aria-pressed="false" title="Play money — demos and QA (developer mode)">Playnet</button>
      </div>
    </div>
    <?php endif; ?>
    <?php if ($katomiaInCircle): ?>
    <!-- MENU-NET2 (owner 2026-10-09): inside a circle the network is not a choice — the circle
         IS one network — but it is shown, read-only, so nobody opens the ☰ wondering whether to
         switch. Filled from the circle's own network (window.__katomiaNetwork, set from the game
         state by katomia-network.js) by the MENU-NET1 script. -->
    <div class="app-menu-netrow app-menu-netrow--ro" data-menu-network-ro title="This circle's network — go Home to switch">
      <span class="app-menu-netlabel">Network</span>
      <span class="app-menu-netpill" data-net="">…</span>
    </div>
    <?php endif; ?>
    <?php if ($katomiaPage !== 'home'): ?>
    <!-- ENTRY-DEFAULTROOT1 (user 2026-07-29): Home first — always a way back to the
         welcome page (which is now the default root); Markets moved to /markets.
         MENU-SPEC1: not on Home itself — "selecting home when you're on the home page does
         nothing". From a circle it leaves the circle; your accounts stay seated. -->
    <a class="app-menu-item" href="<?= $katomiaBase ?>/"<?= $katomiaInCircle ? ' title="Leaves this ' . htmlspecialchars($katomiaTerms['one'], ENT_QUOTES, 'UTF-8') . ' — your accounts stay seated"' : '' ?>>🏠 Home</a>
    <?php endif; ?>
    <?php if (!$katomiaInCircle && $katomiaPage !== 'circles'): ?>
    <!-- ENTRY-CIRCLES1 (user 2026-07-30): the everyday destination is now the
         proposal-only index, labelled with the configured term. 🏛️ Markets kept the
         bank emoji and the word "markets" — both wrong once the product calls these
         circles — so it moves behind nerd mode as the raw, unfiltered grid.
         MENU-SPEC1: not inside a circle (owner: on a board the menu is Home, View, You),
         and not on the list itself, by the same rule as Home on Home. -->
    <a class="app-menu-item" href="<?= $katomiaBase ?>/circles">⭕ <?= htmlspecialchars($katomiaTerms['Many'], ENT_QUOTES, 'UTF-8') ?></a>
    <?php endif; ?>
    <!-- MENU-ORDER1 (user 2026-08-19): "profile, then view, then settings, then host
         options … feels off". New order groups by what the rows ARE:
           places (Home, Circles) → this-circle controls (View, Settings, Host options)
           → you (Profile, Send feedback) → internal (nerd + admin rows, bottom).
         Profile moved DOWN next to Send feedback — both are about the person, not the
         place — and the nerd/admin diagnostics sink below everything a normal user sees. -->
    <!-- KBUNDLE-STRIP:kea -->
    <!-- NO 🤖 Execution agent menu item (user 2026-08-17, KATUI3 feedback pass):
         admin-only visibility was correct, but the profile modal's KEA section is now
         the ONLY door — "keep it in the profile menu and not bother showing it in the
         hamburger menu". Supersedes BUNDLE-STRIP1's re-add of the menu entry; the
         admin-gated profile section (profile-modal.php) is unchanged. Comment sits
         inside strip markers: the purity gate scans shipped bundles for ANY mention
         of the feature (incl. the words "execution agent"), so it must not ship —
         failed builds 13:55 and 14:2x taught this the hard way. -->
    <!-- /KBUNDLE-STRIP:kea -->
    <!-- ENTRY-DARKMODE1 R2 (user 2026-07-29): the dark-mode toggle is NOT in this menu —
         it belongs only to the welcome page's nerd-mode theme-test row (landing.php),
         since that's the one place it's actually useful. The engine (window.kdarkToggle,
         a DarkReader wrapper matching kpay.uk's log.php widget) still loads from here so
         any page can drive it, and a stored preference is re-applied on load. -->

    <?php if (defined('KATOMIA_BOARD_CONTEXT')): ?>
    <!-- MENU-VIEW1 (owner 2026-10-09): ONE expandable 👁 View group holds everything about how
         YOU see this board — the three screen views first, then the board layout (with You at
         bottom and Max on ring only for the Round Table), Party only, a Chips group and, in
         developer mode, a Lab group. The ⚙ Settings popover is gone: every control in it was a
         view preference except three that change what HAPPENS — Pickable, Advanced signing,
         Allow tickets — which moved to You → Preferences. Ids are unchanged, so katomia-board.js
         boardSyncPrefsUI() still wires every control wherever it sits; the form keeps
         autocomplete=off (BOARD-HEADERINT1 forensics: Chrome form-state restore once flipped the
         layout select behind the variable's back). Anim speed is a board-wide debug throttle
         (every animation divides by it), so it sits in Lab rather than Chips. -->
    <div class="app-menu-group" data-menu-group="view">
      <button type="button" class="app-menu-grouphead" aria-expanded="false"><span class="app-menu-groupicon">👁</span><span class="app-menu-grouplabel">View</span><span class="app-menu-groupcaret" aria-hidden="true">▸</span></button>
      <div class="app-menu-groupbody"><div class="app-menu-groupinner"><div class="app-menu-grouppad">
        <!-- BOARD-VIEWSWITCH1 (user 2026-08-06): the three board views are picked
             DIRECTLY here, one tap, instead of the old single "💬 Messages" item that
             opened the stream and made you hit Close to get back. "It's kind of your
             view — it's either board full screen, it's split screen, or it's messages
             only." Frequently toggled (different device, different view), which is
             exactly what earns a slot in the hamburger rather than in Settings.
             Wired by katomia-board.js (boardSetView); the ✓ marks the live one. -->
        <!-- R2 (user 2026-08-06): three full-width rows was "quite a lot of space on
             the menu… and it's not really navigation, it's changing the view mode —
             a little bit like the idea of a layout view". So: ONE row, labelled, with
             three icon buttons — the label says what the control is (the thing a
             submenu would have given us) without costing a second tap or three rows.
             Icons are hand-rolled inline SVG per the user's own sketch: board = a
             frame with the ring in it; split = a frame divided; messages = a frame
             of text lines. currentColor throughout so the active state is one CSS
             rule. -->
        <div class="app-menu-viewrow" data-menu-viewgroup>
          <button type="button" class="app-menu-viewbtn" data-menu-view="board" title="Board only" aria-label="Board only">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="12" r="4"/></svg>
          </button>
          <button type="button" class="app-menu-viewbtn" data-menu-view="split" title="Split — board and messages" aria-label="Split view">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="7" y1="17.5" x2="14" y2="17.5"/></svg>
          </button>
          <button type="button" class="app-menu-viewbtn" data-menu-view="messages" data-menu-chat title="Messages only" aria-label="Messages only">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="12.5" x2="17" y2="12.5"/><line x1="7" y1="16" x2="13" y2="16"/></svg>
          </button>
        </div>
        <form id="boardSettingsPanel" class="app-menu-settings" autocomplete="off" onsubmit="return false">
          <!-- What is deliberately NOT here (so nobody re-adds it): no 💬 Message panel checkbox
               (KATUI3 2026-08-17 — it aliased the screen views above); no 🧪 Chip emboss (retired
               2026-08-17, "it was causing problems"). The per-control history (BOARD-HEADERINT1,
               MVP-SETTINGSDECLUTTER1, BOARD-AUTOARRANGE1, BOARD-CHIPSIZE1, CHIP-SHAPE1,
               BOARD-CHIPART1, BOARD-COUNTERMODE1) is in the old ⚙ Settings form at df236e1.
               One behaviour changed with the move: the popover stayed open on outside taps so
               you could poke the board; the menu closes on them like any menu — a change still
               shows on the board the moment you make it. -->
          <label class="board-settings-label">
              Board layout
              <!-- KATOMIA-CONFIG1: option text is the public-facing theme name only
                   ("Round Table") — no ring16/mode internals in the label; value="ring16"
                   stays the dev-facing id. BOARD-SKINLABEL1: to add a new skin, add
                   another <option value="...">Label</option> here, and register the
                   same value in BOARD_SKINS in katomia-board.js. -->
              <select id="boardSkinSelect" title="Board layout — how the board is drawn">
                <option value="ring16">⭕ Round Table</option>
                <option value="carousel">🎠 Carousel</option>
              </select>
          </label>
          <div class="app-menu-settings" data-board-ringonly>
            <label class="board-settings-label">
                <input type="checkbox" id="boardPrefSelfBottom" title="On: the board rotates so your accounts face you (default). Off: everyone sees the identical layout (screen-share / spectator)">
                You at bottom
            </label>
            <label class="board-settings-label">
                Max on ring
                <input type="number" id="boardPrefMaxSeg" min="2" max="24" class="board-settings-num" title="Maximum players shown on the ring at once (yours + others). Above this, the rest scroll behind a tap-to-advance divider.">
            </label>
          </div>
          <label class="board-settings-label">
              <input type="checkbox" id="boardPrefPartyOnly" title="Show only accounts party to your proposal (follows the game's lock rule)">
              Party only
          </label>
          <div class="app-menu-group" data-menu-group="view.chips">
            <button type="button" class="app-menu-grouphead" aria-expanded="false"><span class="app-menu-groupicon"></span><span class="app-menu-grouplabel">Chips</span><span class="app-menu-groupcaret" aria-hidden="true">▸</span></button>
            <div class="app-menu-groupbody"><div class="app-menu-groupinner"><div class="app-menu-grouppad">
              <label class="board-settings-label">
                  <input type="checkbox" id="boardPrefAutoArrange" title="On: chips shuffle apart so they never overlap. Off: chips stay exactly where you put them and may stack — arrange the board yourself. Either way a chip can't leave its own segment.">
                  Auto-arrange chips
              </label>
              <label class="board-settings-label">
                  Size
                  <select id="boardPrefUiSize" title="Display size — chips first, and the messages and board labels with them. Normal is tuned to be readable on a phone; Large helps if you'd rather not squint.">
                    <option value="small">Small</option>
                    <option value="normal">Normal</option>
                    <option value="large">Large</option>
                  </select>
              </label>
              <label class="board-settings-label">
                  Layout
                  <select id="boardPrefLayout" title="Dev design knob: how chips arrange inside each segment. Shelves = tidy concentric rows clustered at the rim; Organic = the physics relax. Comparing live — the loser gets removed.">
                    <option value="shelves">🗄 Shelves</option>
                    <option value="organic">🫧 Organic</option>
                  </select>
              </label>
              <label class="board-settings-label">
                  Shape
                  <select id="boardPrefChipShape" title="Lab: fungible chips as one line (amount then symbol) or a taller, squarer chip with the symbol on top and a smaller, muted amount beneath. ?chipshape=tall|pill on the URL overrides for one load.">
                    <option value="pill">▭ One line</option>
                    <option value="tall">▯ Symbol over amount</option>
                  </select>
              </label>
              <label class="board-settings-label">
                  Style
                  <select id="boardPrefChipStyle" title="Lab: how chips are painted. Plain = white face + thin owner sleeve (current). Colour = fungible chips take the owner's colour with contrast-picked text, NFTs keep their art and gain a wide owner tag. Dark = charcoal face, white text, owner colour as a rim — highest contrast against the felt, best on phones.">
                    <option value="plain">⬜ Plain</option>
                    <option value="colour">🎨 Owner colour</option>
                    <option value="dark">🌑 Dark</option>
                  </select>
              </label>
              <label class="board-settings-label">
                  <input type="checkbox" id="boardPrefNet" title="Net is the standard view (the transaction nets exactly like this). 🧪 escape hatch: untick to see every individual offer un-netted — dev/testing only, likely to be removed.">
                  Net
              </label>
              <label class="board-settings-label">
                  <input type="checkbox" id="boardPrefSticky" title="Lab: chips stay where they settle, board-game style — new arrivals find space without moving them. The footer 🧹 re-runs the layout on demand">
                  Sticky chips
              </label>
              <label class="board-settings-label">
                  Trail after-glow
                  <select id="boardPrefTrailResidual" title="Dev design knob: after the ▶ replay trail fades, this fraction of its opacity persists as a burn-in showing where each asset came from. Wiped on the next replay.">
                    <option value="0">off</option>
                    <option value="0.25">25%</option>
                    <option value="0.5">50%</option>
                    <option value="0.75">75%</option>
                    <option value="1">100%</option>
                  </select>
              </label>
            </div></div></div>
          </div>
          <div class="app-menu-group app-menu-devonly" data-menu-group="view.lab">
            <button type="button" class="app-menu-grouphead" aria-expanded="false"><span class="app-menu-groupicon">🧪</span><span class="app-menu-grouplabel">Lab</span><span class="app-menu-groupcaret" aria-hidden="true">▸</span></button>
            <div class="app-menu-groupbody"><div class="app-menu-groupinner"><div class="app-menu-grouppad">
              <label class="board-settings-label">
                  Chip scale
                  <select id="boardPrefChipScale" title="Base chip size multiplier. Chips auto-shrink below this only when a segment actually gets crowded.">
                    <option value="0.8">80%</option>
                    <option value="0.9">90%</option>
                    <option value="1">100%</option>
                    <option value="1.15">115%</option>
                    <option value="1.3">130%</option>
                    <option value="1.5">150%</option>
                  </select>
              </label>
              <label class="board-settings-label">
                  Anim speed
                  <select id="boardPrefAnimSpeed" title="Animation speed — slow everything down to inspect the choreography">
                    <option value="2">2×</option>
                    <option value="1">1×</option>
                    <option value="0.5">½×</option>
                    <option value="0.25">¼×</option>
                    <option value="0.1">⅒×</option>
                  </select>
              </label>
              <label class="board-settings-label">
                  <input type="checkbox" id="boardPrefHugRing" title="Lab: organic store blobs home slightly closer to the ring — a mild inward bias; the reserved rim band still keeps chips off the ring itself">
                  Chips hug the ring
              </label>
              <label class="board-settings-label">
                  <input type="checkbox" id="boardPrefClassicCounter" title="Lab: bring back the classic counter — visible counter band plus a ghost pile for partial offers. Off (default) = simplified: the remaining stack moves to the ring edge, decremented; only whole-item offers leave a ghost.">
                  Classic counter
              </label>
              <label class="board-settings-label">
                  <input type="checkbox" id="boardPrefAvatarSpoke" title="Lab: avatar placement experiment — ticked returns faces to the boundary spoke (R2); default centres them on the arc inside the account id (R3). One will win and this switch will go.">
                  Avatar on spoke
              </label>
              <label class="board-settings-label">
                  <input type="checkbox" id="boardPrefZoneWalls" title="Debug: draw each zone's physics walls — where chip edges may exist (solid), the ghost-only rim band (dashed), and the safe screen rect. On an obtuse segment the walls are visibly narrower than the wedge: that's the real ±80° clamp, not a drawing bug">
                  Show zone walls
              </label>
            </div></div></div>
          </div>
        </form>
      </div></div></div>
    </div>
    <?php endif; ?>
    <!-- HOSTMENU-STATIC1 (user 2026-09-07: "I'm on a circle I just created and I'm not seeing
         the Host options in the hamburger"). This item and its reveal script used to sit
         inside `if ($katomiaGameId)`, a build-time $_GET — and the static bundle renders
         board.php ONCE with no ?game=, so on every deploy served from build/dist the item was
         compiled out and could never appear. The game id only ever exists client-side there
         (getGameId(), katomia-core.js). So: always rendered, hidden; the script below sets the
         link and reveals it from the client-derived id. -->
    <!-- CIRCLE-HOSTPAGE1 R2 (user 2026-08-08, revising the previous global entry): "when
         you are in a game, let's have the host menu only available ... if you are the
         host, then the hamburger can show host options. But if you're not the host of
         that game, don't show that option." So this is the ONLY route into the host
         console from the UI, it is game-scoped, and it deep-links to this circle.
         Rendered hidden and revealed by the script below — host-ness is a client-side
         key comparison, so PHP cannot know it. Failing closed (hidden) is the right
         default: a non-host who never sees it loses nothing, and the page + backend
         both re-check ownership anyway. -->
    <a class="app-menu-item" id="katomiaHostOptions" hidden
       href="<?= $katomiaBase ?>/host<?= $katomiaGameId ? '?game=' . rawurlencode($katomiaGameId) : '' ?>">🎪 Host options</a>
    <!-- MENU-SPEC1 (owner 2026-10-09): "Profile" reads as "You" — the modal is about the
         person (wallet, reputation, preferences), the word now says so. -->
    <button type="button" class="app-menu-item" data-menu-profile>👤 You</button>
    <!-- KAT-FEEDBACK1-ENTRYPOINT1: explicit route to the feedback modal for users who
         don't know the long-press (falls back to the standalone page if the widget
         script isn't on this page for any reason) -->
    <button type="button" class="app-menu-item"
            onclick="if(window.KFeedbackWidget){KFeedbackWidget.open()}else{location.href='/m/feedback/?product=katomia'}"
            title="Tell us anything — you can also long-press anywhere on the page.">💬 Send feedback</button>
    <!-- MENU-SPEC1 (owner 2026-10-09): nerd mode no longer lengthens the menu row by row —
         its rows nest under ONE 🧪 Developer group (the lab2 shape). Shown in nerd mode, or
         when it holds a row that is not nerd-gated (the IP-admin row; the kchanges rows
         kchanges.js reveals to admin accounts) — CSS :has() in the style block above. -->
    <div class="app-menu-group app-menu-devgroup" data-menu-group="dev">
      <button type="button" class="app-menu-grouphead" aria-expanded="false"><span class="app-menu-groupicon">🧪</span><span class="app-menu-grouplabel">Developer</span><span class="app-menu-groupcaret" aria-hidden="true">▸</span></button>
      <div class="app-menu-groupbody"><div class="app-menu-groupinner"><div class="app-menu-grouppad">
          <a class="app-menu-item nerd-only" href="<?= $katomiaBase ?>/markets">🏛️ All markets (raw)</a>
          <!-- QA entry (user 2026-08-03): nerd mode surfaces the QA layer — docs, config,
               results — in the main menu rather than behind the admin gate; the pages are
               effectively public anyway. If parts of QA later need gating, do a split pass
               (internal vs public layers) — noted in katomia task QA-PUBLICSPLIT1. -->
          <a class="app-menu-item nerd-only" href="<?= $katomiaBase ?>/qa/" target="_blank" rel="noopener">🧪 QA</a>
          <?php if ($katomiaIsAdmin): ?>
          <a class="app-menu-item" href="<?= htmlspecialchars($katomiaLegacyGameHref) ?>"
             title="Site admin — visible because you are on the admin IP (KATOMIA-ADMIN1). Opens the legacy game.php view for cross-comparison.">🛠 Admin</a>
          <?php endif; ?>
          <!-- KBUNDLE-STRIP:kchanges -->
          <!-- KCHANGES1 (feedback tango-delta-81, 2026-09-06): "a development visibility toggle
               in the hamburger menu, at the root of the menu, the last item — on/off for
               post-it notes of every change on the screen". Rendered hidden; kchanges.js
               reveals it for a browser authenticated as an admin account (or the IP admin, or
               ?kchanges=1). Stays open on click — it's a switch, not a destination — hence
               not .app-menu-item, which the menu closes on. -->
          <button type="button" class="app-menu-item app-menu-kchanges" data-menu-kchanges hidden
                  title="Dev: show a 🗒️ tag beside everything on THIS page that changed recently. Tap a tag for what changed and why; ✕ ticks it off. Fades over a week.">🗒️ Show changes</button>
          <!-- KCHANGES1 round 2 (2026-09-06): "another item on the hamburger menu to a list of
               all the changes … tap it and it either takes you to the context if there is one,
               or it opens up there so you can review it". A destination, so it IS an
               .app-menu-item and the menu closes behind it. -->
          <button type="button" class="app-menu-item app-menu-kchanges" data-menu-kchanges-list hidden
                  title="Dev: every recent change in one list — go to the one you want, or read and comment on it here.">📋 Changes</button>
      <!-- /KBUNDLE-STRIP:kchanges -->
      </div></div></div>
    </div>
  </nav>

</div>

<?php /* KBUNDLE-STRIP:admin-disclose */ if ($katomiaIsAdmin): ?>
<!-- BUNDLE-STRIP1: admin disclosure — on the dev estate, launch-excluded features
     (KATOMIA_FEATURES flags that ship off) stay visible from the admin IPs only,
     unmistakably badged so they can't be mistaken for launch surface. Server-side,
     per request: off the VPN, the next page load hides them again. Production
     bundles strip this whole block AND the feature code itself (STRIP_FEATURES in
     ops/build-standalone.sh), so neither survives into the served artifact. -->
<style>
  body.kadmin .kadmin-disclosed{ outline:2px dashed #f90; outline-offset:2px; }
  .kadmin-chip{ font:600 10px/1 system-ui,sans-serif; background:#f90; color:#fff;
    border-radius:6px; padding:2px 5px; margin-left:6px; vertical-align:middle; }
</style>
<script>
// Runs BEFORE the feature-flags default below — Object.assign there keeps this pre-set.
window.KATOMIA_FEATURES = Object.assign({}, window.KATOMIA_FEATURES, { kea: true })
window.KATOMIA_ADMIN_DISCLOSED = ["kea"]
document.body.classList.add("kadmin")
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-feature]").forEach(el => {
    if(!window.KATOMIA_ADMIN_DISCLOSED.includes(el.dataset.feature)) return
    el.classList.add("kadmin-disclosed")
    const chip = Object.assign(document.createElement("span"), { className: "kadmin-chip",
      textContent: "🛠 admin", title: "Visible only from the admin VPN — stripped from production bundles entirely (BUNDLE-STRIP1)." })
    ;(el.querySelector("summary") || el).appendChild(chip)
  })
})
</script>
<?php endif; /* /KBUNDLE-STRIP:admin-disclose */ ?>

<script>
// BOARD-UISIZE1: apply the Size preference (Small/Normal/Large) as an html
// class as early as the header runs, so --ui-scale surfaces don't flash at
// the wrong size. Default = normal.
try {
  var _ks = localStorage.getItem("katomiaUiSize")
  document.documentElement.classList.add("ksize-" + (["small","normal","large"].indexOf(_ks) >= 0 ? _ks : "normal"))
} catch(e){ document.documentElement.classList.add("ksize-normal") }
// Feature flags (AUTH-LANG1 note, 2026-07-06): a launch-excluded feature's every
// affordance is tagged data-feature="<name>" and hidden wholesale when its flag is
// off. Flip here (or pre-set window.KATOMIA_FEATURES before this script) — no other
// code changes needed. Per-feature defaults are individually wrapped so a
// production build can ship without the code or the flag (BUNDLE-STRIP1).
window.KATOMIA_FEATURES = Object.assign({
  /* KBUNDLE-STRIP:kea */
  // kea OFF (user 2026-08-13): Execution agent is out for the alpha launch; on the
  // dev estate the admin-disclose block above pre-sets it true for admin IPs.
  kea: false,
  /* /KBUNDLE-STRIP:kea */
}, window.KATOMIA_FEATURES || {})
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-feature]").forEach(el => {
    if(window.KATOMIA_FEATURES[el.dataset.feature] === false) el.style.display = "none"
  })
})
</script>

<script>
// ENTRY-DARKMODE1: DarkReader loader + toggle. Lazy — the CDN script only loads on
// first use (or at startup when a stored preference says dark). No system-pref
// auto-follow while this is a test instrument: explicit toggles only.
(() => {
  const KEY = "dark-mode"   // shared with the kpay.uk darkmode.js widget
  let loading = null
  const load = () => loading ||= new Promise((res, rej) => {
    if(window.DarkReader) return res()
    const s = document.createElement("script")
    s.src = "https://cdn.jsdelivr.net/npm/darkreader@4.9.95/darkreader.min.js"
    s.onload = res; s.onerror = rej
    document.head.appendChild(s)
  })
  const apply = on => load().then(() => {
    on ? DarkReader.enable() : DarkReader.disable()
    document.querySelectorAll("[data-kdark-btn]").forEach(b => { b.textContent = on ? "☀️" : "🌗" })
    try { localStorage.setItem(KEY, on ? "1" : "0") } catch {}
  }).catch(() => notify?.("Dark-mode engine failed to load", "error", { timeout: 3000 }))
  window.kdarkToggle = () => apply(localStorage.getItem(KEY) !== "1")
  document.addEventListener("DOMContentLoaded", () => {
    if(localStorage.getItem(KEY) === "1") apply(true)
  })
})()
</script>

<script>
// ── KPERF (KATUI3 R9, user 2026-08-17): "we need some kind of switch that if the
// CPU is low we don't do the animation." Samples real frame cadence ~2.5s after
// load (past load-time jank); a median rAF gap ≥24ms (≤~42fps) flags the device:
// body.kperf-low + window.KPERF_LOW + a one-shot "kperf:low" event any animation
// surface can subscribe to (first consumer: landing.php tears down its ambient
// card bubbles). Background: the always-on landing bubbles held a phone at
// ~4.6fps and made a 25ms modal close FEEL like seconds (KATUI3-FEEDBACK1 R8) —
// hover-incapable devices are excluded statically; this catches weak devices
// that DO hover (old laptops, cheap tablets with mice). Bails when the tab is
// hidden (rAF stalls would false-positive).
window.KPERF_LOW = false
addEventListener("load", () => setTimeout(() => {
  if(document.hidden) return
  const gaps = []; let last = performance.now(); let n = 0
  const tick = t => {
    gaps.push(t - last); last = t
    if(++n < 24){ requestAnimationFrame(tick); return }
    if(document.hidden) return
    gaps.sort((a, b) => a - b)
    const median = Math.round(gaps[12])
    if(median < 24) return
    window.KPERF_LOW = true
    document.body.classList.add("kperf-low")
    document.dispatchEvent(new CustomEvent("kperf:low", { detail: { medianFrameMs: median } }))
    window.katomiaDiagSend?.("perf:low-mode", { medianFrameMs: median })
  }
  requestAnimationFrame(tick)
}, 2500))
</script>

<script>
// ── MENU-NET1 (owner 2026-10-09): the network is a MODE, chosen in one place — the ☰ on
// Home — and read everywhere else. Stored per device (katomiaNetwork); testnet until you
// choose. Playnet only while developer (nerd) mode is on; off again, it reads as testnet.
// Inside a circle nothing here applies: the circle's own network (gameMeta.network) wins, as
// it always did (the ☰ there shows it read-only, MENU-NET2). MENU-NET2 also puts the same
// switch on the Circles page — one setting, so Home and Circles can never disagree. Followers:
//   · the wallet pickers in the You and Authenticate modals (#authNetwork, #kamNetwork) —
//     their rows are hidden and a one-line note says which network and where to change it
//     (static markup, one per modal: lab2 inserted the note on every repaint and it piled up)
//   · the circles list filters to it (circles.php)
window.katomiaNet = (() => {
  const KEY = "katomiaNetwork", NETS = ["testnet", "mainnet"], DEV = ["playnet"], DEF = "testnet"
  const LABEL = { testnet: "Testnet", mainnet: "Mainnet", playnet: "Playnet" }
  const read = k => { try { return localStorage.getItem(k) } catch { return null } }
  const nerd = () => read("katomia.nerd.v1") === "1"
  const get = () => {
    const v = read(KEY)
    if(NETS.includes(v)) return v
    if(DEV.includes(v) && nerd()) return v
    return DEF
  }
  const paint = () => {
    const v = get()
    document.querySelectorAll("[data-menu-network] [data-net]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.net === v)))
    ;["authNetwork", "kamNetwork"].forEach(id => {
      const s = document.getElementById(id)
      if(s && [...s.options].some(o => o.value === v)) s.value = v
    })
    // the note names what the wallet will actually use — the picker's value
    // MENU-NET2: inside a circle the read-only row names the circle's own network
    const here = window.__katomiaNetwork || (typeof gameMeta !== "undefined" && gameMeta?.network) || ""
    document.querySelectorAll("[data-menu-network-ro] .app-menu-netpill").forEach(p => {
      p.dataset.net = here; p.textContent = here ? (LABEL[here] || here) : "…"
    })
    document.querySelectorAll("[data-network-note]").forEach(n => {
      const s = document.getElementById(n.dataset.networkNote)
      const shown = s ? s.value : v
      n.textContent = LABEL[shown] || shown
    })
  }
  const set = v => {
    if(!NETS.includes(v) && !DEV.includes(v)) return
    const was = get()
    try { localStorage.setItem(KEY, v) } catch {}
    paint()
    if(was !== v) document.dispatchEvent(new CustomEvent("katomia:network", { detail: { network: v, was } }))
  }
  document.addEventListener("click", e => {
    const b = e.target.closest?.("[data-menu-network] [data-net]")
    if(b){ e.stopPropagation(); set(b.dataset.net) }
  })
  document.addEventListener("DOMContentLoaded", paint)
  return { get, set, paint, label: v => LABEL[v] || v }
})()
</script>

<script>
// Menu behaviour — self-contained, no dependencies on the page's other scripts.
// Profile opening itself is wired by katomia-profile.js ([data-menu-profile]).
(() => {
  const btn = document.getElementById("appMenuBtn")
  const menu = document.getElementById("appMenu")
  if(!btn || !menu) return

  const setOpen = open => {
    menu.classList.toggle("hidden", !open)
    btn.setAttribute("aria-expanded", String(open))
  }

  // MENU-VIEW1 (owner 2026-10-09): the ⚙ Settings popover is gone — its controls live in the
  // menu's 👁 View group (board pages only). Whenever the menu or a View group opens, the
  // controls are re-read from the board's live state (boardSyncPrefsUI, katomia-board.js) and
  // the Round-Table-only rows follow the layout select.
  const syncView = () => {
    if(typeof boardSyncPrefsUI === "function") boardSyncPrefsUI()
    if(typeof boardMarkView === "function") boardMarkView()
    const skin = document.getElementById("boardSkinSelect")
    document.querySelectorAll("[data-board-ringonly]").forEach(el => { el.hidden = !!skin && skin.value === "carousel" })
  }
  document.getElementById("boardSkinSelect")?.addEventListener("change", syncView)
  document.addEventListener("katomia:menugroup", e => { if(/^view/.test(e.detail?.group || "")) syncView() })

  btn.onclick = e => {
    e.stopPropagation()
    // R7's 1.5s post-modal-close suppression REMOVED (R9, user 2026-08-17): it
    // guarded against frustration re-taps punching through a SLOW close, but R8
    // fixed the slowness (closes paint in 10-17ms on the user's phone) and the
    // kdiag showed the guard then eating DELIBERATE menu taps at 630-1425ms —
    // "there's a delay before the hamburger menu opens" was this very guard.
    // No timing guards remain anywhere on this path (user's instruction): dead
    // taps are prevented at the source by touch-action:none on ✕ and ☰.
    if(menu.classList.contains("hidden")){
      window.katomiaNet?.paint()   // MENU-NET1: nerd mode may have changed since
      if(document.getElementById("boardSettingsPanel")) syncView()
    }
    setOpen(menu.classList.contains("hidden"))
  }

  // any item click closes the menu (MENU-TIDY1: the nerd toggle moved out, so the old
  // stay-open special case for it is gone)
  menu.addEventListener("click", e => {
    if(e.target.closest("[data-menu-kchanges]")) return   // KCHANGES1: a switch, the menu stays
    if(e.target.closest(".app-menu-item")) setOpen(false)
  })

  // MENU-SPEC1: nested groups unroll in place (CSS animates the body's grid row). A group
  // head is not an .app-menu-item, so tapping it keeps the menu open. Each group remembers
  // whether you left it open, per device.
  const GROUP_KEY = "katomiaMenuGroup:"
  const setGroup = (g, open, remember) => {
    g.classList.toggle("is-open", open)
    g.querySelector(":scope > .app-menu-grouphead")?.setAttribute("aria-expanded", String(open))
    if(remember) try { localStorage.setItem(GROUP_KEY + g.dataset.menuGroup, open ? "1" : "0") } catch {}
    if(open) document.dispatchEvent(new CustomEvent("katomia:menugroup", { detail: { group: g.dataset.menuGroup } }))
  }
  menu.querySelectorAll(".app-menu-group[data-menu-group]").forEach(g => {
    let was = null
    try { was = localStorage.getItem(GROUP_KEY + g.dataset.menuGroup) } catch {}
    if(was === "1") setGroup(g, true, false)
    g.querySelector(":scope > .app-menu-grouphead")?.addEventListener("click", () =>
      setGroup(g, !g.classList.contains("is-open"), true))
  })

  // Diagnostic tripwire (2026-07-14, after board.php shipped without
  // katomia-profile.js and Profile silently no-op'd — same failure shape as
  // KDIAG-BOARDBLIND1: a page missing a script it depends on, no trace of
  // why). This ALWAYS attaches (header.php loads everywhere); it only ever
  // fires kdiag when the real listener (installed by initKatomiaProfile in
  // katomia-profile.js) never showed up, so a future "Profile does nothing"
  // report has something to check instead of starting from zero.
  document.querySelectorAll("[data-menu-profile]").forEach(el =>
    el.addEventListener("click", () => {
      if(typeof openKatomiaProfile !== "function")
        window.katomiaDiagSend?.("profile:open-failed",
          { reason: "openKatomiaProfile undefined — katomia-profile.js not loaded on this page", path: location.pathname })
    })
  )

  document.addEventListener("click", e => {
    if(!menu.classList.contains("hidden") && !menu.contains(e.target)) setOpen(false)
  })

  // HEADER-UNIFY2 (user 2026-08-13): pin the ☰ top-right once the banner scrolls out —
  // threshold is the banner's real bottom edge, not a magic number, so any banner
  // height (wrapped title, future rows) works. Pages that never scroll never stick.
  const banner = document.querySelector(".app-banner")
  const stuck = () => document.body.classList.toggle("hdr-stuck",
    banner ? banner.getBoundingClientRect().bottom <= 0 : window.scrollY > 72)
  addEventListener("scroll", stuck, { passive: true })
  stuck()
})()
</script>

<script>
// ── kdebug overlay (lab1 seat note, 2026-08-13): the KATOMIA header crop + chat-dock
// first-row clip reproduce on the user's device but not in headless probes, so the
// diagnosis has to happen ON the device. Add ?kdebug to any page URL (or set
// localStorage.katomiaDebug=1) to outline the header and chat-dock boxes and float a
// live metrics readout the user can screenshot. Outline (not border) so nothing moves.
// Tap the readout to dismiss. Zero cost when not enabled — remove once the crop is fixed.
(() => {
  let on = /[?&]kdebug\b/.test(location.search)
  try { on = on || localStorage.getItem("katomiaDebug") === "1" } catch(e){}
  if(!on) return

  const style = document.createElement("style")
  style.textContent = `
    .app-banner{ outline:2px solid #e02020 !important; outline-offset:-2px; }
    .app-banner-inner{ outline:2px dashed #f08c00 !important; }
    .app-banner h2{ outline:2px solid #c2a500 !important; }
    .app-title{ outline:2px dashed #0a8a2a !important; background:rgba(40,200,90,.12) !important; }
    .app-icons{ outline:2px dotted #0a8a8a !important; }
    .kchat-dock{ outline:2px solid #e02020 !important; outline-offset:-2px; }
    .kchat-drag{ outline:2px solid #f08c00 !important; background:rgba(240,140,0,.15) !important; }
    .kchat-dock-list{ outline:2px solid #2050e0 !important; }
    .kchat-dock-list .kchat-row:first-child{ outline:2px dashed #8020c0 !important; }
    .kchat-send{ outline:2px solid #0a8a2a !important; }
    #kdebugReadout{ position:fixed; top:130px; left:4px; z-index:9999; max-width:75vw;
      font:10px/1.5 monospace; background:rgba(0,0,0,.78); color:#9f9;
      padding:6px 8px; border-radius:6px; white-space:pre-wrap; pointer-events:auto; }
  `
  document.head.appendChild(style)

  const box = document.createElement("div")
  box.id = "kdebugReadout"
  const txt = document.createElement("div")
  txt.onclick = () => box.remove()
  box.appendChild(txt)

  // 🧟 Ghost-maker (user 2026-08-13, WC-RELAYHEALTH1): manufacture the lab1 ghost-session
  // state ON DEMAND — the deterministic repro for "wallet opens, no signing request".
  // Mechanism: snapshot the page's wc@2:* session storage, do a POLITE disconnect (the
  // wallet is notified and genuinely forgets), then restore the snapshot and reload —
  // page remembers a session the wallet no longer has. One tap replaces the fragile
  // clear-in-wallet-while-offline choreography.
  const ghost = document.createElement("button")
  ghost.textContent = "🧟 Ghost wallet link"
  ghost.style.cssText = "display:block;margin-top:6px;font:11px monospace;padding:5px 9px;border-radius:5px;border:1px solid #6c6;background:#233;color:#9f9"
  ghost.onclick = async ev => {
    ev.stopPropagation()
    try {
      if(!window.WC?.disconnect){ ghost.textContent = "WC not loaded yet — try again"; return }
      const keys = Object.keys(localStorage).filter(k => k.startsWith("wc@2:"))
      if(!keys.length){ ghost.textContent = "no stored session — Connect first, then ghost"; return }
      const snap = {}
      keys.forEach(k => { snap[k] = localStorage.getItem(k) })
      ghost.textContent = "disconnecting (wallet forgets)…"
      await window.WC.disconnect()
      Object.entries(snap).forEach(([k, v]) => localStorage.setItem(k, v))
      ghost.textContent = "👻 ghost armed — reloading"
      setTimeout(() => location.reload(), 800)
    } catch(e){ ghost.textContent = ("ghost failed: " + e).slice(0, 70) }
  }
  box.appendChild(ghost)

  // 🔄 Page-side reset (user 2026-08-13): the bundle's own resetWalletLink — wipe this
  // ORIGIN's wc@2:* storage, forced fresh pairing on next Connect. The one-tap unwedge
  // for any stuck link: never touches the wallet app. Falls back to deleting the keys
  // directly if the API isn't up yet.
  const reset = document.createElement("button")
  reset.textContent = "🔄 Reset wallet link (page side)"
  reset.style.cssText = ghost.style.cssText
  reset.onclick = async ev => {
    ev.stopPropagation()
    try {
      reset.textContent = "resetting…"
      if(window.WC?.resetWalletLink) await window.WC.resetWalletLink()
      else Object.keys(localStorage).filter(k => k.startsWith("wc@2:")).forEach(k => localStorage.removeItem(k))
      reset.textContent = "reset — reloading (then Connect fresh)"
      setTimeout(() => location.reload(), 800)
    } catch(e){ reset.textContent = ("reset failed: " + e).slice(0, 70) }
  }
  box.appendChild(reset)
  const r = el => { if(!el) return null; const b = el.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)}@${Math.round(b.left)},${Math.round(b.top)}` }
  const upd = () => {
    const t = document.querySelector(".app-title"), h2 = document.querySelector(".app-banner h2"),
          ban = document.querySelector(".app-banner"), dock = document.getElementById("boardChatDock"),
          list = dock && dock.querySelector(".kchat-dock-list"),
          row1 = list && list.querySelector(".kchat-row")
    const cs = t && getComputedStyle(t)
    let poppins = "?"
    try { poppins = document.fonts.check('800 42px Poppins') ? "yes" : "NO" } catch(e){}
    const lines = [
      "kdebug " + innerWidth + "x" + innerHeight + " dpr" + devicePixelRatio,
      t ? `title ${r(t)} font=${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily.split(",")[0]} poppins-loaded=${poppins}` : "title: none",
      h2 ? `h2 ${r(h2)} banner ${r(ban)}` : "",
      t && ban ? `title-vs-banner top∆=${Math.round(t.getBoundingClientRect().top - ban.getBoundingClientRect().top)} bot∆=${Math.round(ban.getBoundingClientRect().bottom - t.getBoundingClientRect().bottom)}` : "",
      dock ? `dock ${r(dock)} clear-b=${getComputedStyle(document.documentElement).getPropertyValue("--kchat-clear-b") || "unset"}` : "dock: none",
      list ? `list ${r(list)} scrollH=${list.scrollHeight} clientH=${list.clientHeight} scrollTop=${Math.round(list.scrollTop)} rows=${list.querySelectorAll(".kchat-row").length}` : "",
      row1 ? `row1 ${r(row1)} clipped-top=${row1.getBoundingClientRect().top < list.getBoundingClientRect().top - 0.5}` : "",
      `wc@2 keys=${(() => { try { return Object.keys(localStorage).filter(k => k.startsWith("wc@2:")).length } catch(e){ return "?" } })()} WC=${window.WC ? "up" : "absent"}`,
    ].filter(Boolean)
    txt.textContent = lines.join("\n")
  }
  const start = () => { document.body.appendChild(box); upd(); setInterval(upd, 1000) }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start()
})()
</script>

<script>
// ── CIRCLE-HOSTPAGE1 R2: reveal "🎪 Host options" only to this circle's host ─────────
// Host-ness is a comparison between the circle's admin identifier and a key held in
// THIS browser's localStorage, so the server cannot render this decision — the item ships
// hidden and is revealed here, or never.
//
// TWO SOURCES, because neither covers every case on its own:
//   gameMeta  — set from the WS payload (katomia-network.js) and carries meta.admin.
//               The ONLY source that works for a PRIVATE circle, but it arrives async,
//               hence the short poll rather than a single read.
//   /hapi/game — works on any page with no websocket (game.php), for public + unlisted.
//               Returns 403 for private, which is exactly the gap gameMeta closes.
// Either saying "you're the host" is enough. Neither answering leaves it hidden, which is
// the safe direction: the host page and the backend both re-check ownership regardless,
// so a false negative costs discoverability, never access.
(() => {
  const item = document.getElementById("katomiaHostOptions")
  if(!item) return
  // HOSTMENU-STATIC1: the id comes from the CLIENT — on the static bundle the page was
  // rendered with none. HOSTMENU-STATIC2 (user 2026-09-07, "still not seeing it"): this
  // block sits in the header and runs BEFORE katomia-core.js is even loaded, so
  // getGameId() was "not a function" here, the clean /board/<id> URL has no ?game=, and
  // the static page has no PHP id — every path gave "", and the early return below fired
  // before the load handler was ever registered. Only ?game= URLs (the QA harness) worked,
  // which is how it passed. The id is now resolved AT LOAD, when core is present, with the
  // same /board/<id> parse as a fallback so the menu never depends on script order again.
  const idFromPath = () => {
    const parts = location.pathname.split("/").filter(Boolean)
    const i = parts.findIndex(p => p === "board" || p === "game")
    return (i >= 0 && parts[i + 1] && !/\./.test(parts[i + 1])) ? decodeURIComponent(parts[i + 1]) : ""
  }
  const resolveGameId = () => (typeof getGameId === "function" ? getGameId() : null)
    || new URLSearchParams(location.search).get("game")
    || <?= json_encode($katomiaGameId, JSON_UNESCAPED_SLASHES) ?>
    || idFromPath() || ""
  let gameId = ""

  const reveal = () => {
    item.href = "<?= $katomiaBase ?>/host?game=" + encodeURIComponent(gameId)
    item.hidden = false
  }
  const mine = () => (typeof katomiaMyIntentKeyHex === "function" ? katomiaMyIntentKeyHex() : "")
  const isHost = g => (typeof katomiaIsHostOf === "function" ? katomiaIsHostOf(g, mine()) : false)

  window.addEventListener("load", () => {
    gameId = resolveGameId()
    if(!gameId) return                       // not on a circle: nothing to host
    if(!mine()) return                       // no key in this browser: owns nothing

    // A: poll for the WS meta (covers private circles). ~6s at 400ms, then give up —
    // if the socket hasn't delivered by then the page has bigger problems than a menu.
    let tries = 0
    const t = setInterval(() => {
      const meta = (typeof gameMeta !== "undefined") ? gameMeta : null
      if(meta && isHost(meta)){ clearInterval(t); reveal(); return }
      if(++tries > 15) clearInterval(t)
    }, 400)

    // B: API check in parallel (covers pages with no socket)
    fetch("<?= $katomiaBase ?>/hapi/game/" + encodeURIComponent(gameId))
      .then(r => r.json())
      .then(d => { if(d?.ok && isHost(d.game)){ clearInterval(t); reveal() } })
      .catch(() => {})
  })
})()
</script>

<!-- KBUNDLE-STRIP:kchanges -->
<!-- KCHANGES1: the change notes (kchanges.js) + the log they read (kchanges-log.js).
     kfeedbits.js gives each note its 👍 👎 💬 — the same control learn.php uses; the
     script is idempotent (scans [data-kfb] once, exposes window.kfeedbits.render for
     the notes' popovers), so a page that already loads it is unaffected. -->
<script src="<?= function_exists('kasset') ? kasset('kfeedbits.js') : 'kfeedbits.js' ?>" defer></script>
<script src="<?= function_exists('kasset') ? kasset('kchanges-log.js') : 'kchanges-log.js' ?>" defer></script>
<script src="<?= function_exists('kasset') ? kasset('kchanges.js') : 'kchanges.js' ?>" defer></script>
<!-- /KBUNDLE-STRIP:kchanges -->
