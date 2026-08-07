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

$katomiaIpAdmin = '130.185.251.53 176.126.78.48 ';
$katomiaIsAdmin = strpos($katomiaIpAdmin, $_SERVER['REMOTE_ADDR'] ?? '') !== false;
$katomiaGameId = $_GET['game'] ?? '';
$katomiaLegacyGameHref = $katomiaGameId ? $katomiaBase . '/game/' . rawurlencode($katomiaGameId) : $katomiaBase . '/';
?>
<style>
  /* Page harmonizer: every page that carries this header gets the same body inset
     and full-bleed banner (the KATLAB clip-safe pattern from game.php: pad the body,
     let the banner bleed into the padding with negative margins). Lives here rather
     than katomia.css so it only applies to pages that actually include the header. */
  body { margin: 0; padding: 16px; box-sizing: border-box; }
  .app-banner { width: auto; margin: -16px -16px 12px -16px; position: relative; }

  /* ENTRY-KEANERD1 (user 2026-07-29): KEA affordances are nerd-mode-only for the
     closed alpha — non-nerd users never see the Execution agent (menu item + profile
     section, both tagged data-feature="kea"). Deliberately overrides the earlier
     "nerd mode shouldn't gate features" stance: it's a noise-gate for now, cheap to
     revert. KATOMIA_FEATURES.kea stays the hard off-switch underneath. */
  body:not(.nerd) [data-feature="kea"] { display: none !important; }

  /* Generic hook for future nerd-only menu items (the dark-mode toggle used to be one;
     it now lives solely on the welcome theme-test row — ENTRY-DARKMODE1 R2). */
  .app-menu-item.nerd-only { display: none; }
  /* BOARD-CHAT1 R2: menu entries that only make sense on a phone */
  .app-menu-item.mobile-only { display: none; }
  @media (max-width: 600px){ .app-menu-item.mobile-only { display: block; width: 100%; } }
  body.nerd .app-menu-item.nerd-only { display: block; width: 100%; }
</style>

<div id="notifications"></div>

<div class="app-banner">
  <div class="app-banner-inner">
    <h2>
      <a class="app-home-link" href="<?= $katomiaBase ?>/" title="Katomia — home">
        <span class="app-title">Katomia</span>
        <span class="app-icons">💱 🐫</span>
      </a>
    </h2>
    <button id="appMenuBtn" class="app-menu-btn" aria-label="Menu" aria-expanded="false" title="Menu">☰</button>
  </div>

  <!-- MENU-TIDY1 (user 2026-07-07): the menu holds DESTINATIONS only. Removed:
       "Create market" (a button on the Markets page — contextual, not navigation)
       and "Nerd mode" (a preference — lives in Profile → Preferences & diagnostics).
       The KEA entry (AUTH-LANG1 second door to the modal's collapsed section) stays
       while the kea feature flag is on; it disappears wholesale at release. -->
  <nav id="appMenu" class="app-menu hidden">
    <!-- ENTRY-DEFAULTROOT1 (user 2026-07-29): Home first — always a way back to the
         welcome page (which is now the default root); Markets moved to /markets. -->
    <a class="app-menu-item" href="<?= $katomiaBase ?>/">🏠 Home</a>
    <!-- ENTRY-CIRCLES1 (user 2026-07-30): the everyday destination is now the
         proposal-only index, labelled with the configured term. 🏛️ Markets kept the
         bank emoji and the word "markets" — both wrong once the product calls these
         circles — so it moves behind nerd mode as the raw, unfiltered grid. -->
    <a class="app-menu-item" href="<?= $katomiaBase ?>/circles">⭕ <?= htmlspecialchars($katomiaTerms['Many'], ENT_QUOTES, 'UTF-8') ?></a>
    <button type="button" class="app-menu-item" data-menu-profile>👤 Profile</button>
    <a class="app-menu-item nerd-only" href="<?= $katomiaBase ?>/markets">🏛️ All markets (raw)</a>
    <!-- QA entry (user 2026-08-03): nerd mode surfaces the QA layer — docs, config,
         results — in the main menu rather than behind the admin gate; the pages are
         effectively public anyway. If parts of QA later need gating, do a split pass
         (internal vs public layers) — noted in katomia task QA-PUBLICSPLIT1. -->
    <a class="app-menu-item nerd-only" href="<?= $katomiaBase ?>/qa/" target="_blank" rel="noopener">🧪 QA</a>
    <!-- ENTRY-MENUKEA1 (user 2026-07-29): the 🤖 Execution agent menu item is GONE from
         the hamburger — not used for a while, and the profile section (still nerd-gated,
         data-feature=kea) remains the one door. Declutter; reposition another time. -->
    <!-- ENTRY-DARKMODE1 R2 (user 2026-07-29): the dark-mode toggle is NOT in this menu —
         it belongs only to the welcome page's nerd-mode theme-test row (landing.php),
         since that's the one place it's actually useful. The engine (window.kdarkToggle,
         a DarkReader wrapper matching kpay.uk's log.php widget) still loads from here so
         any page can drive it, and a stored preference is re-applied on load. -->

    <?php if (defined('KATOMIA_BOARD_CONTEXT')): ?>
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
      <span class="app-menu-viewlabel">View</span>
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
    <button type="button" class="app-menu-item" data-menu-settings>⚙ Settings</button>
    <?php endif; ?>
    <!-- KAT-FEEDBACK1-ENTRYPOINT1: explicit route to the feedback modal for users who
         don't know the long-press (falls back to the standalone page if the widget
         script isn't on this page for any reason) -->
    <button type="button" class="app-menu-item"
            onclick="if(window.KFeedbackWidget){KFeedbackWidget.open()}else{location.href='/m/feedback/?product=katomia'}"
            title="Tell us anything — you can also long-press anywhere on the page.">💬 Send feedback</button>
    <?php if ($katomiaIsAdmin): ?>
    <a class="app-menu-item" href="<?= htmlspecialchars($katomiaLegacyGameHref) ?>"
       title="Site admin — visible because you are on the admin IP (KATOMIA-ADMIN1). Opens the legacy game.php view for cross-comparison.">🛠 Admin</a>
    <?php endif; ?>
  </nav>

  <?php if (defined('KATOMIA_BOARD_CONTEXT')): ?>
  <!-- BOARD-HEADERINT1 round 2 (user 2026-07-14): board Preferences moved OUT
       of the profile modal (too tucked away, too much noise there) into this
       compact popover that REPLACES the hamburger menu in place — small on
       purpose so setting changes are visible on the board behind it. Opens
       via the ⚙ Settings menu item; closes via the hamburger button (no ✕ —
       user's call). Deliberately does NOT close on outside click: you want to
       poke the board while it's open to see the effect. Controls are wired by
       katomia-board.js boardSyncPrefsUI() (same ids as before the move). -->
  <!-- autocomplete=off (2026-07-15 forensics): Chrome form-state restore can
       repopulate these controls with STALE values after a soft reload,
       desyncing them from the JS variables — prime suspect for the layout
       select silently flipping organic→shelves and rearranging every chip. -->
  <form id="boardSettingsPanel" class="board-settings-panel hidden" autocomplete="off" onsubmit="return false">
    <label class="board-settings-label">
      Board skin
      <!-- KATOMIA-CONFIG1: option text is the public-facing theme name only
           ("Round Table") — no ring16/mode internals in the label; value="ring16"
           stays the dev-facing id. BOARD-SKINLABEL1: to add a new skin, add
           another <option value="...">Label</option> here, and register the
           same value in BOARD_SKINS in katomia-board.js. -->
      <select id="boardSkinSelect" title="Board skin">
        <option value="ring16">⭕ Round Table</option>
      </select>
    </label>
    <label class="board-settings-label">
      <input type="checkbox" id="boardPrefSelfBottom" title="On: the board rotates so your accounts face you (default). Off: everyone sees the identical layout (screen-share / spectator)">
      You at bottom
    </label>
    <label class="board-settings-label">
      Max on ring
      <input type="number" id="boardPrefMaxSeg" min="2" max="24" class="board-settings-num" title="Maximum players shown on the ring at once (yours + others). Above this, the rest scroll behind a tap-to-advance divider.">
    </label>
    <hr>
    <label class="board-settings-label">
      <input type="checkbox" id="boardPrefPartyOnly" title="Show only accounts party to your proposal (follows the game's lock rule)">
      Party only
    </label>
    <label class="board-settings-label">
      <input type="checkbox" id="boardPrefPickable" title="Allow other players to pick assets straight from your store (they shop, you agreed in advance)">
      Pickable
    </label>
    <!-- BOARD-AUTOARRANGE1 (user 2026-08-07): normal-mode, default ON. Off lets
         chips sit on top of each other so a player with a lot of assets can lay
         the board out entirely by hand. Walls still apply either way. -->
    <label class="board-settings-label">
      <input type="checkbox" id="boardPrefAutoArrange" title="On: chips shuffle apart so they never overlap. Off: chips stay exactly where you put them and may stack — arrange the board yourself. Either way a chip can't leave its own segment.">
      Auto-arrange chips
    </label>
    <!-- BOARD-CHATMODE1 (user 2026-08-03): bubbles ⇄ docked message panel. Defaults:
         phones = panel (bubbles drown a small board), desktop = bubbles (for now). -->
    <label class="board-settings-label">
      <input type="checkbox" id="boardPrefChatPanel" title="Show player messages in a docked panel instead of speech bubbles on the board">
      💬 Message panel
    </label>
    <!-- BOARD-UISIZE1's Size select MOVED to Profile → Preferences (user
         2026-08-06, IA pass): this panel is scoped to THIS GAME's board, and
         Size is neither — it's a device-wide display preference ("within a
         device, I don't think it makes sense to have different size
         preferences across different games"). Same control, same id
         (#boardPrefUiSize), same storage; boardSyncPrefsUI still wires it
         wherever it renders, and katomia-profile.js wires it on the pages that
         don't load the board. -->

    <!-- MVP-SETTINGSDECLUTTER1: dev/lab knobs (self-labeled 🧪/Debug/Lab below) — nerd-mode
         only, same mechanism as everywhere else (body.nerd, katomia-profile.js). Reverses the
         2026-07-12 "NOT nerd-gated" call now the panel's grown past its original 4 controls. -->
    <hr class="board-settings-nerd-only">
    <label class="board-settings-label board-settings-nerd-only">
      <input type="checkbox" id="boardPrefNet" title="Net is the standard view (the transaction nets exactly like this). 🧪 escape hatch: untick to see every individual offer un-netted — dev/testing only, likely to be removed.">
      🧪 Net
    </label>
    <!-- BOARD-CHIPSIZE1 (user 2026-07-31): base chip size multiplier — the
         crowd auto-shrink still applies on top of whatever is picked here -->
    <label class="board-settings-label board-settings-nerd-only">
      🧪 Chip size
      <select id="boardPrefChipScale" title="Base chip size multiplier. Chips auto-shrink below this only when a segment actually gets crowded.">
        <option value="0.8">80%</option>
        <option value="0.9">90%</option>
        <option value="1">100%</option>
        <option value="1.15">115%</option>
        <option value="1.3">130%</option>
        <option value="1.5">150%</option>
      </select>
    </label>
    <label class="board-settings-label board-settings-nerd-only">
      Anim speed
      <select id="boardPrefAnimSpeed" title="Animation speed — slow everything down to inspect the choreography">
        <option value="2">2×</option>
        <option value="1">1×</option>
        <option value="0.5">½×</option>
        <option value="0.25">¼×</option>
        <option value="0.1">⅒×</option>
      </select>
    </label>
    <label class="board-settings-label board-settings-nerd-only">
      🧪 Chip layout
      <select id="boardPrefLayout" title="Dev design knob: how chips arrange inside each segment. Shelves = tidy concentric rows clustered at the rim; Organic = the physics relax. Comparing live — the loser gets removed.">
        <option value="shelves">🗄 Shelves</option>
        <option value="organic">🫧 Organic</option>
      </select>
    </label>
    <label class="board-settings-label board-settings-nerd-only">
      <input type="checkbox" id="boardPrefHugRing" title="Lab: organic store blobs home slightly closer to the ring — a mild inward bias; the reserved rim band still keeps chips off the ring itself">
      🧪 Chips hug the ring
    </label>
    <!-- BOARD-CHIPART1 (user 2026-08-04): chip face styling, three variants up
         for live comparison. NFTs never get their artwork recoloured — in the
         non-plain variants they keep the picture and gain a fat owner tag. -->
    <label class="board-settings-label board-settings-nerd-only">
      🧪 Chip style
      <select id="boardPrefChipStyle" title="Lab: how chips are painted. Plain = white face + thin owner sleeve (current). Colour = fungible chips take the owner's colour with contrast-picked text, NFTs keep their art and gain a wide owner tag. Dark = charcoal face, white text, owner colour as a rim — highest contrast against the felt, best on phones.">
        <option value="plain">⬜ Plain</option>
        <option value="colour">🎨 Owner colour</option>
        <option value="dark">🌑 Dark</option>
      </select>
    </label>
    <!-- BOARD-CHIPDEPTH1 R3 (user 2026-08-06): the ENGRAVED LETTERING is now
         opt-in, default OFF. It reads well at phone size ("when I zoom in, yes,
         it's got like a shadow") but on a desktop monitor the same 1px
         double-shadow at a larger glyph size reads as blur, not depth — the
         user's own call: "maybe just take it off on desktop… how about we put
         it on the settings, default off, and I can try it either way, on nerd
         mode anyway". The chip FACE gradient and the lit/shaded rims are NOT
         affected — those were liked as-is and stay on for everyone. -->
    <label class="board-settings-label board-settings-nerd-only">
      <input type="checkbox" id="boardPrefEmboss" title="Lab: engrave the chip lettering (a 1px light/dark shadow pair, like stamped text). Convincing at phone pixel densities; at desktop sizes the same shadows can read as blur rather than depth.">
      🧪 Chip emboss
    </label>
    <!-- BOARD-COUNTERMODE1 (user 2026-08-04): simple is the new default — no
         counter band, partial fungible offers move the decremented remainder
         stack to the rim instead of leaving a ghost. This 🧪 switch restores
         the status quo (counter ring + ghost pile) for live comparison;
         the loser gets removed. -->
    <label class="board-settings-label board-settings-nerd-only">
      <input type="checkbox" id="boardPrefClassicCounter" title="Lab: bring back the classic counter — visible counter band plus a ghost pile for partial offers. Off (default) = simplified: the remaining stack moves to the ring edge, decremented; only whole-item offers leave a ghost.">
      🧪 Classic counter
    </label>
    <label class="board-settings-label board-settings-nerd-only">
      <input type="checkbox" id="boardPrefAvatarSpoke" title="Lab: avatar placement experiment — ticked returns faces to the boundary spoke (R2); default centres them on the arc inside the account id (R3). One will win and this switch will go.">
      🧪 Avatar on spoke
    </label>
    <label class="board-settings-label board-settings-nerd-only">
      <input type="checkbox" id="boardPrefZoneWalls" title="Debug: draw each zone's physics walls — where chip edges may exist (solid), the ghost-only rim band (dashed), and the safe screen rect. On an obtuse segment the walls are visibly narrower than the wedge: that's the real ±80° clamp, not a drawing bug">
      🧪 Show zone walls
    </label>
    <label class="board-settings-label board-settings-nerd-only">
      <input type="checkbox" id="boardPrefSticky" title="Lab: chips stay where they settle, board-game style — new arrivals find space without moving them. The footer 🧹 re-runs the layout on demand">
      🧪 Sticky chips
    </label>
    <label class="board-settings-label board-settings-nerd-only">
      🧪 Trail after-glow
      <select id="boardPrefTrailResidual" title="Dev design knob: after the ▶ replay trail fades, this fraction of its opacity persists as a burn-in showing where each asset came from. Wiped on the next replay.">
        <option value="0">off</option>
        <option value="0.25">25%</option>
        <option value="0.5">50%</option>
        <option value="0.75">75%</option>
        <option value="1">100%</option>
      </select>
    </label>
  </form>
  <?php endif; ?>
</div>

<script>
// BOARD-UISIZE1: apply the Size preference (Small/Normal/Large) as an html
// class as early as the header runs, so --ui-scale surfaces don't flash at
// the wrong size. Default = normal.
try {
  var _ks = localStorage.getItem("katomiaUiSize")
  document.documentElement.classList.add("ksize-" + (["small","normal","large"].indexOf(_ks) >= 0 ? _ks : "normal"))
} catch(e){ document.documentElement.classList.add("ksize-normal") }
// Feature flags (AUTH-LANG1 note, 2026-07-06): KEA will NOT be user-visible in the
// first release — every KEA affordance is tagged data-feature="kea" and hidden
// wholesale when the flag is off. Flip here (or pre-set window.KATOMIA_FEATURES
// before this script) — no other code changes needed. Longer term the KEA code
// should also be excludable from the bundle (BUNDLE1).
window.KATOMIA_FEATURES = Object.assign({ kea: true }, window.KATOMIA_FEATURES || {})
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

  // Board settings popover (BOARD-HEADERINT1 round 2): the ⚙ Settings menu
  // item swaps the menu for the settings panel in the same spot; the
  // hamburger button closes it again (acts as the panel's dismiss while
  // it's open — no ✕). Panel markup only exists on board.php.
  const settings = document.getElementById("boardSettingsPanel")
  const settingsOpen = open => {
    if(!settings) return
    settings.classList.toggle("hidden", !open)
    if(open && typeof boardSyncPrefsUI === "function") boardSyncPrefsUI()
  }
  document.querySelectorAll("[data-menu-settings]").forEach(el =>
    el.addEventListener("click", () => settingsOpen(true))
  )

  btn.onclick = e => {
    e.stopPropagation()
    if(settings && !settings.classList.contains("hidden")){ settingsOpen(false); return }
    setOpen(menu.classList.contains("hidden"))
  }

  // any item click closes the menu (MENU-TIDY1: the nerd toggle moved out, so the old
  // stay-open special case for it is gone)
  menu.addEventListener("click", e => {
    if(e.target.closest(".app-menu-item")) setOpen(false)
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
})()
</script>
