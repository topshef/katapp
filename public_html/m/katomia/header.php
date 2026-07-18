<?php
// header.php — the ONE app header (HEADER-UNIFY / PROFILE-INDEX1).
// Include right after <body> on every page (index/games list, create, game).
// Links are absolute (/m/katomia/) because the game page lives at a rewritten
// depth (/m/katomia/game/XYZ) — same convention as the hapi/keakonnect paths.

// KATOMIA-ADMIN1: site-wide operator-admin check, modeled on gomint's
// auth.php IP-admin pattern (shop.gomint.me, same repo family, same IP
// list). Distinct from the existing per-game/NFT admin concept (👑,
// katomia-profile.js renderGameAdminTools) — 🛠 is used here deliberately
// so the two don't both read as "crown = admin" in the same app. Soft/
// discoverability gating only (hides the menu item), not a hard access
// block — the destination itself isn't IP-checked.
$katomiaIpAdmin = '130.185.251.53 176.126.78.48 ';
$katomiaIsAdmin = strpos($katomiaIpAdmin, $_SERVER['REMOTE_ADDR'] ?? '') !== false;
$katomiaGameId = $_GET['game'] ?? '';
$katomiaLegacyGameHref = $katomiaGameId ? '/m/katomia/game/' . rawurlencode($katomiaGameId) : '/m/katomia/';
?>
<style>
  /* Page harmonizer: every page that carries this header gets the same body inset
     and full-bleed banner (the KATLAB clip-safe pattern from game.php: pad the body,
     let the banner bleed into the padding with negative margins). Lives here rather
     than katomia.css so it only applies to pages that actually include the header. */
  body { margin: 0; padding: 16px; box-sizing: border-box; }
  .app-banner { width: auto; margin: -16px -16px 12px -16px; position: relative; }
</style>

<div id="notifications"></div>

<div class="app-banner">
  <div class="app-banner-inner">
    <h2>
      <a class="app-home-link" href="/m/katomia/" title="Katomia — all markets">
        <span class="app-title">KATOMIA</span>
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
    <button type="button" class="app-menu-item" data-menu-profile>👤 Profile</button>
    <a class="app-menu-item" href="/m/katomia/">🏛️ Markets</a>
    <button type="button" class="app-menu-item hide-in-proposal" data-menu-kea data-feature="kea"
            title="Pre-approve a policy and let KEA auto-settle orders your intent key has signed — no per-transaction prompts.">🤖 Execution agent</button>
    <?php if (defined('KATOMIA_BOARD_CONTEXT')): ?>
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
      <!-- KATOMIA-CONFIG1: option text is the public-facing theme name
           ("Round Table"); value="ring16" stays the dev-facing label. -->
      <select id="boardSkinSelect" title="Board skin">
        <option value="ring16">⭕ Round Table (ring16 — in-app sign, focus play)</option>
      </select>
    </label>
    <label class="board-settings-label">
      <input type="checkbox" id="boardPrefNet" title="Net is the standard view (the transaction nets exactly like this). 🧪 escape hatch: untick to see every individual offer un-netted — dev/testing only, likely to be removed.">
      🧪 Net
    </label>
    <label class="board-settings-label">
      <input type="checkbox" id="boardPrefSelfBottom" title="On: the board rotates so your accounts face you (default). Off: everyone sees the identical layout (screen-share / spectator)">
      You at bottom
    </label>
    <label class="board-settings-label">
      Max on ring
      <input type="number" id="boardPrefMaxSeg" min="2" max="24" class="board-settings-num" title="Maximum players shown on the ring at once (yours + others). Above this, the rest scroll behind a tap-to-advance divider.">
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
      🧪 Chip layout
      <select id="boardPrefLayout" title="Dev design knob: how chips arrange inside each segment. Shelves = tidy concentric rows clustered at the rim; Organic = the physics relax. Comparing live — the loser gets removed.">
        <option value="shelves">🗄 Shelves</option>
        <option value="organic">🫧 Organic</option>
      </select>
    </label>
    <label class="board-settings-label">
      <input type="checkbox" id="boardPrefHugRing" title="Lab: organic store blobs home slightly closer to the ring — a mild inward bias; the reserved rim band still keeps chips off the ring itself">
      🧪 Chips hug the ring
    </label>
    <label class="board-settings-label">
      <input type="checkbox" id="boardPrefZoneWalls" title="Debug: draw each zone's physics walls — where chip edges may exist (solid), the ghost-only rim band (dashed), and the safe screen rect. On an obtuse segment the walls are visibly narrower than the wedge: that's the real ±80° clamp, not a drawing bug">
      🧪 Show zone walls
    </label>
    <label class="board-settings-label">
      <input type="checkbox" id="boardPrefSticky" title="Lab: chips stay where they settle, board-game style — new arrivals find space without moving them. The footer 🧹 re-runs the layout on demand">
      🧪 Sticky chips
    </label>
    <label class="board-settings-label">
      🧪 Trail after-glow
      <select id="boardPrefTrailResidual" title="Dev design knob: after the ▶ replay trail fades, this fraction of its opacity persists as a burn-in showing where each asset came from. Wiped on the next replay.">
        <option value="0">off</option>
        <option value="0.25">25%</option>
        <option value="0.5">50%</option>
        <option value="0.75">75%</option>
        <option value="1">100%</option>
      </select>
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
  </form>
  <?php endif; ?>
</div>

<script>
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
