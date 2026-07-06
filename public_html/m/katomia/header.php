<?php
// header.php — the ONE app header (HEADER-UNIFY / PROFILE-INDEX1).
// Include right after <body> on every page (index/games list, create, game).
// Links are absolute (/m/katomia/) because the game page lives at a rewritten
// depth (/m/katomia/game/XYZ) — same convention as the hapi/keakonnect paths.
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

  <nav id="appMenu" class="app-menu hidden">
    <button type="button" class="app-menu-item" data-menu-profile>🔗 Profile &amp; connect</button>
    <a class="app-menu-item" href="/m/katomia/">🏛️ Markets</a>
    <a class="app-menu-item" href="/m/katomia/create">➕ Create market</a>
    <label class="app-menu-item nerd-control">
      <input type="checkbox" class="nerd-toggle-input"> 🤓 Nerd mode
    </label>
  </nav>
</div>

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

  btn.onclick = e => { e.stopPropagation(); setOpen(menu.classList.contains("hidden")) }

  // any item click closes the menu (the nerd toggle label stays open to allow flicking)
  menu.addEventListener("click", e => {
    if(e.target.closest(".nerd-control")) return
    if(e.target.closest(".app-menu-item")) setOpen(false)
  })

  document.addEventListener("click", e => {
    if(!menu.classList.contains("hidden") && !menu.contains(e.target)) setOpen(false)
  })
})()
</script>
