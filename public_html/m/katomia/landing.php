<?php
require_once __DIR__ . '/kasset.php';
require_once __DIR__ . '/site-config.php';
$siteConfig = katomiaSiteConfig();
$landing = $siteConfig['landing'] ?? [];
$title = $landing['title'] ?? 'Katomia';
$tagline = $landing['tagline'] ?? '';
$curatedGames = $landing['curatedGames'] ?? [];
// ENTRY-CIRCLES1 (user 2026-07-30): every user-facing "circle" on this page comes
// from here — the word is a config parameter, never a literal. See site-config.php.
$T = katomiaTerms();
// ENTRY-SKINS1 (user 2026-07-29): URL-switchable CSS skins for this page — design
// exploration surface. ?skin=liquid|clay|bubble; default 'paper' is the plain look.
// A picker appears in NERD MODE only (deliberate: nerd mode as the UI-branching
// playground for design-curious testers — user call, same day as ENTRY-KEANERD1).
$landingSkins = ['paper', 'liquid', 'clay', 'bubble'];
$landingSkin = in_array($_GET['skin'] ?? '', $landingSkins, true) ? $_GET['skin'] : 'paper';
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- ENTRY-FADES1: must be in <head> — it arms the fade-IN before first paint. -->
<script src="<?= kasset('kfade.js') ?>"></script>
<link rel="stylesheet" href="<?= kasset('katomia.css') ?>">
<title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
<style>
  /* KATOMIA-LANDING1: intentionally tiny — a hand-picked jumping-off point,
     not a second games list (that's contents.php's job, reachable from here
     via the "More {many}" / nerd-mode "See all markets" links). No grid/table
     chrome to inherit. */
  .landing-wrap{ max-width: 480px; margin: 32px auto; padding: 0 16px; }
  .landing-tagline{ color: #666; margin: 0 0 24px; }
  /* ENTRY-LEARN1: "Learn more" rides the strapline; "What is a {one}?" sits under the
     doors, where the question actually occurs to a newcomer. Both muted — they must
     not compete with the two entry cards for attention. */
  .landing-learn{ font-size: 13px; color: #7a8595; text-decoration: none; margin-left: 8px; white-space: nowrap; }
  .landing-learn:hover{ color: #2f6fed; text-decoration: underline; }
  /* DEMO-TRIO1: the watch-only demo card. Deliberately quieter than the two real
     entries — it's an aside, not a third door into trading. The pulsing dot says
     "happening right now", which is the actual draw. */
  .landing-card--watch{ border-style: dashed; }
  .landing-watch-badge{
    display: inline-flex; align-items: center; gap: 5px; margin-left: 7px;
    padding: 1px 8px 1px 6px; border-radius: 999px; vertical-align: 2px;
    background: #eef3fb; color: #4a6a94; font-size: 10.5px; font-weight: 600;
    letter-spacing: .02em; text-transform: uppercase;
  }
  .landing-watch-badge::before{
    content: ""; width: 6px; height: 6px; border-radius: 50%; background: #e8563f;
    animation: landingLive 1.9s ease-in-out infinite;
  }
  @keyframes landingLive{ 0%,100%{ opacity:1; transform:scale(1); } 50%{ opacity:.35; transform:scale(.8); } }
  @media (prefers-reduced-motion: reduce){ .landing-watch-badge::before{ animation: none; } }
  .landing-what{ margin: 14px 0 0; font-size: 13px; }
  .landing-what a{ color: #7a8595; text-decoration: none; }
  .landing-what a:hover{ color: #2f6fed; text-decoration: underline; }
  .landing-list{ display: flex; flex-direction: column; gap: 10px; }
  .landing-card{
    display: block; padding: 16px; border-radius: 10px;
    background: #fff; border: 1px solid #e5e0d4; text-decoration: none;
    color: inherit; box-shadow: 0 1px 3px rgba(0,0,0,.05);
  }
  .landing-card:hover{ border-color: #c9c2b3; }
  .landing-card-label{ font-weight: 600; }
  .landing-card-net{ font-size: 12px; color: #888; margin-top: 2px; }
  /* ENTRY-WELCOME1: See-all demoted to small + muted (user 2026-07-29) — the curated
     cards + create button are the happy path; the full list is a power-user door.
     ENTRY-CIRCLES1 (2026-07-30): and now nerd-ONLY — normal mode gets "More {many}",
     which goes to the proposal-only /{many} page instead of the raw markets grid. */
  .landing-more{ margin-top: 28px; font-size: 12px; display: none; }
  body.nerd .landing-more{ display: block; }
  .landing-more a{ color: #999; }
  .landing-empty{ color: #888; font-style: italic; }
  /* ENTRY-KBTN1: buttons now ride the shared .kbtn glassy library (katomia.css) —
     these rules keep only layout. The old solid green/blue fills are gone (user
     2026-07-29: subtler, glassy, thin edge — match the order-modal buttons). */
  /* ENTRY-CIRCLES1: create + "more" sit on one row — the two onward doors, after
     the two curated ones above. */
  .landing-actions{ margin-top: 16px; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  .landing-create{ margin-top: 0; }
  .landing-morelink{ font-size: 13px; color: #7a8595; text-decoration: none; }
  .landing-morelink:hover{ color: #2f6fed; text-decoration: underline; }
  /* ENTRY-WELCOME1's connect-from-welcome card REMOVED (user 2026-08-17, KATUI3
     feedback pass): "on the homepage, let's get rid of the connect your wallet
     option completely… let's not have lots of places to connect your wallet —
     consolidate to the profile modal." This resolves the 2026-07-30 TENSION note
     (connect-below-the-doors read backwards) in favour of removal. */

  /* ═══ ENTRY-CIRCLES1 — the two entry cards carry the bubble in EVERY skin ═══
     User ruling 2026-07-30: keep the default page 'paper', but give the bubble
     treatment to the two entry options specifically. The gesture now MEANS
     "this is a door into a {one}" rather than being page-wide decoration — so
     these rules are skin-independent, unlike the lskin-bubble block below. */
  .landing-card.kbubble-on{ border-color: transparent !important; box-shadow: none !important; }
  .landing-card.kbubble-filled{ background: transparent !important; }
  .landing-card{ -webkit-tap-highlight-color: transparent; }

  /* ═══ ENTRY-SKINS1 — landing skins (design exploration; page-scoped, the shared
     banner is deliberately untouched for now). 'paper' = the defaults above. ═══ */

  /* — liquid: dark glass, drifting iridescent blobs; the torus/pitch-deck world — */
  body.lskin-liquid{ background:#0b0e1a; color:#e8ecf5; }
  body.lskin-liquid::before, body.lskin-liquid::after{
    content:""; position:fixed; width:62vmax; height:62vmax; border-radius:50%;
    filter:blur(90px); opacity:.38; z-index:-1; pointer-events:none;
  }
  body.lskin-liquid::before{ background:radial-gradient(circle,#2f6fed,transparent 62%);
    top:-22vmax; right:-16vmax; animation:lqFloatA 19s ease-in-out infinite alternate; }
  body.lskin-liquid::after{ background:radial-gradient(circle,#8b3bd8,transparent 62%);
    bottom:-26vmax; left:-16vmax; animation:lqFloatB 23s ease-in-out infinite alternate; }
  @keyframes lqFloatA{ to{ transform:translate(-9vmax,7vmax) scale(1.12); } }
  @keyframes lqFloatB{ to{ transform:translate(8vmax,-6vmax) scale(.92); } }
  body.lskin-liquid .landing-tagline{ color:#9aa6c0; }
  body.lskin-liquid .landing-card,
  body.lskin-liquid .landing-connect{
    background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.14); color:#e8ecf5;
    backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
    border-radius:18px; box-shadow:0 8px 30px rgba(0,0,0,.35);
  }
  body.lskin-liquid .landing-card:hover{ border-color:rgba(140,190,255,.5); }
  body.lskin-liquid .landing-card-net{ color:#8f9bb5; }
  body.lskin-liquid .landing-connect .subtle{ color:#93a0ba; }
  body.lskin-liquid .landing-create{ background:linear-gradient(120deg,#31c48d,#2f6fed); border-radius:999px; }
  body.lskin-liquid .landing-create:hover{ filter:brightness(1.1); }
  body.lskin-liquid .landing-connect-btn{ background:linear-gradient(120deg,#2f6fed,#8b3bd8); border-radius:999px; }
  body.lskin-liquid .landing-connected{ color:#5fd39a; }
  body.lskin-liquid .landing-more a{ color:#6e7a95; }
  body.lskin-liquid .landing-morelink{ color:#8f9bb5; }

  /* — clay: warm, soft, no hard edges anywhere; squishy neumorphic mass — */
  body.lskin-clay{ background:#efe9e1; }
  body.lskin-clay .landing-tagline{ color:#8a7f72; }
  body.lskin-clay .landing-card,
  body.lskin-clay .landing-connect{
    background:#f3ede5; border:none; border-radius:26px;
    box-shadow:8px 8px 18px rgba(178,160,138,.4), -8px -8px 18px rgba(255,255,255,.95);
    transition:transform .18s ease, box-shadow .18s ease;
  }
  body.lskin-clay .landing-card:hover{ transform:translateY(-3px);
    box-shadow:10px 12px 22px rgba(178,160,138,.45), -8px -8px 18px rgba(255,255,255,.95); }
  body.lskin-clay .landing-create{ background:#e8735a; border-radius:999px;
    box-shadow:6px 6px 14px rgba(178,160,138,.5), -4px -4px 10px rgba(255,255,255,.8); }
  body.lskin-clay .landing-create:hover{ transform:translateY(-2px) scale(1.02); background:#e8735a; }
  body.lskin-clay .landing-connect-btn{ background:#5a8fe8; border-radius:999px;
    box-shadow:4px 4px 10px rgba(178,160,138,.5), -3px -3px 8px rgba(255,255,255,.8); }
  body.lskin-clay .landing-more a{ color:#a89b8c; }
  body.lskin-clay .landing-morelink{ color:#a89b8c; }

  /* — bubble: minimal light base; kbubble.js draws living borders (ENTRY-BUBBLE1).
       .kbubble-on = the effect attached OK, so the CSS border steps aside; without
       it (reduced-motion / no canvas) the paper borders simply remain.
       ENTRY-CIRCLES1: this skin is now the "bubble EVERYTHING" variant — the two
       entry cards get theirs on every skin (above), so what's left here is the
       page-wide treatment of the create + connect buttons. — */
  body.lskin-bubble{ background:#f7f9fc; }
  body.lskin-bubble .landing-card,
  body.lskin-bubble .landing-connect{ border-radius:14px; }
  body.lskin-bubble .kbubble-on{ border-color:transparent !important; box-shadow:none !important; }
  /* v3 filled: the loop's interior IS the surface — no static fill underneath it, so
     the shape flexes as one instead of a rectangle showing through (user 2026-07-29). */
  body.lskin-bubble .kbubble-filled{ background:transparent !important; }
  body.lskin-bubble .landing-create{ color:#2f6b3a; }
  body.lskin-bubble .landing-connect-btn{ color:#2f5578; }
  body.lskin-bubble .landing-create.kbubble-on:hover{ background:transparent; transform:none; }
  /* no mobile tap flash — it fights the bubble's own feedback (user 2026-07-29) */
  body.lskin-bubble *{ -webkit-tap-highlight-color:transparent; }

  /* — nerd-mode skin picker (ENTRY-SKINS1): visible only with body.nerd — */
  .landing-skin-picker{ display:none; margin-top:22px; font-size:13px; color:#888;
    gap:8px; align-items:center; flex-wrap:wrap; }
  body.nerd .landing-skin-picker{ display:flex; }
  .landing-skin-picker select{ padding:5px 8px; border-radius:6px; border:1px solid #ccc; }

  /* — nerd-mode bubble tuning (ENTRY-CIRCLES1, user 2026-07-30): "nerd option to
       apply alternative settings would be amazing (local to the user)". Stored in
       this browser's localStorage only — it overrides the entry transition on the
       real pages, for this tester, without touching the deployed defaults. — */
  .landing-tuner{ display:none; margin-top:14px; font-size:12.5px; color:#888; }
  body.nerd .landing-tuner{ display:block; }
  .landing-tuner summary{ cursor:pointer; color:#7a8595; }
  .landing-tuner textarea{
    width:100%; box-sizing:border-box; margin-top:8px; min-height:104px; padding:9px 11px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; line-height:1.5;
    border:1px solid #ccd2da; border-radius:8px; background:#fbfcfe; color:#333; resize:vertical;
  }
  .landing-tuner-row{ display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap; }
  .landing-tuner-row button{ padding:5px 11px; font-size:12.5px; border-radius:6px;
    border:1px solid #ccd2da; background:#fff; cursor:pointer; }
  .landing-tuner-row button:hover{ border-color:#2f6fed; color:#2f6fed; }
  .landing-tuner-msg{ color:#2f6fed; }
  .landing-tuner-msg.warn{ color:#b4690e; }
</style>
</head>
<body class="lskin-<?= htmlspecialchars($landingSkin, ENT_QUOTES, 'UTF-8') ?>">
<?php
  require __DIR__ . '/header.php';
  require __DIR__ . '/profile-modal.php';
?>

<div class="landing-wrap">
  <!-- ENTRY-LEARN1 (user 2026-07-30): "Learn more" sits next to the strapline and goes
       to the explainer/FAQ. "What is a circle?" under the entry cards points at the same
       page's top section — same destination, but it answers the question a newcomer
       actually has at the moment they're staring at two unfamiliar doors. -->
  <!-- Feedback a8977343 (2026-08-18): tagline emptied ("trader-style wording") — the
       Learn more link must survive an empty tagline, so it renders unconditionally. -->
  <p class="landing-tagline">
    <?php if ($tagline): ?><?= katomiaTermEsc($tagline) ?><?php endif; ?>
    <a class="landing-learn" href="<?= $katomiaBase ?>/learn">Learn more →</a>
  </p>

  <!-- ENTRY-CIRCLES1: the two curated doors. These are the ONLY elements on the page
       that get the bubble — the gesture is reserved for "entering a {one}" (user
       2026-07-30), so administrative buttons below stay plain and use the quiet fade. -->
  <div class="landing-list">
    <?php if (!$curatedGames): ?>
      <p class="landing-empty">No curated <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> configured yet — see site-config.json.</p>
    <?php endif; ?>
    <?php foreach ($curatedGames as $g):
      $id = $g['id'] ?? '';
      if (!$id) continue;
      $label = $g['label'] ?? $id;
      // ENTRY-CIRCLES1: the muted second line is now the flavour NOTE ("play money"),
      // not the network — the network moved up into the title where the user wants it.
      // Falls back to the old network line for any config not yet carrying a note.
      $note = $g['note'] ?? ($g['network'] ?? '');
      // DEMO-TRIO1 (user 2026-07-30): a card flagged "watch" is the running bot demo —
      // you go in to observe, not to play. Badged so that's clear BEFORE the click,
      // which is also the first hint that watching and joining are different rights.
      $watch = !empty($g['watch']);
    ?>
      <a class="landing-card<?= $watch ? ' landing-card--watch' : '' ?>" data-kbubble-open href="<?= $katomiaBase ?>/board/<?= rawurlencode($id) ?>">
        <div class="landing-card-label">
          <?= katomiaTermEsc($label) ?>
          <?php if ($watch): ?><span class="landing-watch-badge" title="A demo running right now, played by bots. You can watch it live — there is nothing to join.">live · watch only</span><?php endif; ?>
        </div>
        <?php if ($note): ?><div class="landing-card-net"><?= katomiaTermEsc($note) ?></div><?php endif; ?>
      </a>
    <?php endforeach; ?>
  </div>

  <!-- ENTRY-WELCOME1/ENTRY-CREATEBASIC1: one button, straight to the trimmed-down
       create form (name + network + visibility only) — the full form stays at /create.
       ENTRY-CIRCLES1: "More {many}" sits alongside it — same row, both onward doors.
       It points at /{many} (proposal-mode only, card view), NOT the full markets grid;
       the grid stays behind the nerd-only link below. -->
  <div class="landing-actions">
    <a class="landing-create kbtn kbtn-green" href="<?= $katomiaBase ?>/create?skin=basic">➕ Create your own <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?></a>
    <!-- The PATH is fixed infrastructure (/circles); only the LABEL is the parameter.
         Renaming the term must not 404 a URL people have bookmarked or shared. If a
         rename ever needs a matching URL too, that's one extra alias line in .htaccess. -->
    <a class="landing-morelink" href="<?= $katomiaBase ?>/circles">More <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> →</a>
  </div>

  <p class="landing-what">
    <a href="<?= $katomiaBase ?>/learn#what-is-it">What is a <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?>?</a>
  </p>

  <!-- Connect-your-wallet card REMOVED here (user 2026-08-17, KATUI3 feedback pass) —
       wallet connection is consolidated into the profile modal; in a game the board's
       Add account bar covers it. -->

  <!-- ENTRY-CIRCLES1: nerd mode keeps the raw markets grid (every game, every mode,
       every column). Normal mode never sees the word "markets". -->
  <p class="landing-more"><a href="<?= $katomiaBase ?>/markets">See all markets →</a></p>

  <!-- ENTRY-SKINS1: nerd-mode-only skin picker — reloads with ?skin= so each variant
       initialises cleanly (the bubble skin attaches canvases at load). -->
  <div class="landing-skin-picker" title="Design exploration (nerd mode): try this page in different skins. The URL carries the choice — share it.">
    🎨 Page skin
    <select id="landingSkinSel">
      <option value="paper">📄 Paper (default)</option>
      <option value="liquid">🫧 Liquid glass</option>
      <option value="clay">🏺 Soft clay</option>
      <option value="bubble">💠 Bubble everything</option>
    </select>
    <!-- ENTRY-DARKMODE1 R2 (user 2026-07-29): this nerd-mode theme-test row is the ONLY
         home for the dark/light toggle — it was removed from the hamburger menu. -->
    <button type="button" id="landingDarkBtn" data-kdark-btn title="Toggle DarkReader dark mode on this skin" onclick="window.kdarkToggle?.()">🌗</button>
  </div>

  <!-- ENTRY-CIRCLES1: per-user entry-transition tuning (nerd mode, localStorage). -->
  <details class="landing-tuner">
    <summary>⚙ Entry transition — my settings</summary>
    <p style="margin:8px 0 0">Overrides the <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?>-entry bubble <b>for this browser only</b>. Same knob names as the
      <a href="<?= $katomiaBase ?>/kdemo/bubble-open.html">bubble-open lab</a> — tune there, paste here. Empty = site defaults.</p>
    <textarea id="landingTuneBox" spellcheck="false" placeholder='{ "ms": 800, "style": "iridescent" }'></textarea>
    <div class="landing-tuner-row">
      <button type="button" id="landingTuneApply">▶ Apply</button>
      <button type="button" id="landingTuneClear">↺ Site defaults</button>
      <span class="landing-tuner-msg" id="landingTuneMsg"></span>
    </div>
  </details>
</div>

<script>
// ENTRY-WELCOME1: welcome-page connect widget. Thin glue over the shared WC connector
// + katomia-auth.js helpers (kauthWCAccounts). Passive on load (never rebuilds the
// connector just to peek); explicit on click (ensureNetwork + connect).
// ENTRY-CIRCLES1: KTERMS carries the configured vocabulary into JS so runtime strings
// don't hardcode "circle" either.
window.KTERMS = <?= json_encode($T, JSON_UNESCAPED_UNICODE) ?>;

// (welcome-page connect widget removed 2026-08-17 — see the card's removal note above)

// ENTRY-SKINS1: picker → reload with the chosen skin in the URL.
{
  const sel = document.getElementById("landingSkinSel")
  sel.value = "<?= $landingSkin ?>"
  sel.onchange = () => {
    const p = new URLSearchParams(location.search)
    if(sel.value === "paper") p.delete("skin"); else p.set("skin", sel.value)
    location.search = p.toString()
  }
}
</script>

<!-- ═══ ENTRY-CIRCLES1 (user 2026-07-30): the entry gesture ═══
     kbubble draws a living border on the two {one} cards; kbubbleOpen turns a click on
     one into the inflate-into-a-window transition. Loaded on EVERY skin now, because
     the bubble marks "this is a door into a {one}" rather than decorating the page.
     Degrades silently: no canvas / reduced motion → plain cards, plain navigation. -->
<script src="<?= kasset('kbubble.js') ?>"></script>
<script src="<?= kasset('kbubbleopen.js') ?>"></script>
<script>
// ENTRY-BUBBLE1 — user tuning, revision 2 (2026-07-29, exported verbatim from
// kdemo/bubble.html): near-whole-element response (spread .75), fast wave with light
// smoothing (iters 8 / smooth .3), gentle puff (6), heavily damped (6) — a fine
// 0.9px line with a soft 4px blur, filled at .2. This is the RESTRAINED tuning, used
// by the bubble-everything skin where many elements carry it at once.
// The connect CARD gets NO bubble — it's a panel of options, not a button (user).
const KB_TUNED = { spread: 0.75, iters: 8, smooth: 0.3, tension: 25, spring: 28,
                   damp: 6, puff: 6, ambient: 0.3, width: 0.9, blur: 4,
                   fill: "auto", fillAlpha: 0.2 }

// ENTRY-CIRCLES1 (user 2026-07-30): "the 2 welcome circles can have more bubbly
// settings than the 'bubble' skin, since it's now focussed on the circles options
// only not all buttons." Restraint was a crowding tax — with only two elements
// carrying it, the effect can breathe: bigger puff (14 vs 6), much lighter damping
// (3.8 vs 6) so the wobble actually persists, livelier idle drift (ambient .9 vs .3),
// and a thicker, softer line with more presence (1.5px/blur 8 vs 0.9px/blur 4).
// CIRCLES-BUBBLECOST1 (user 2026-08-06): "I notice on the homepage, if I look
// closely, it's got the same issue that the corners are slightly Jaggedy."
// Cause: kbubble spaces its points evenly by PERIMETER LENGTH, so on a wide card
// the short corner arcs get barely a sample each and read as cut corners.
// points: 320 (default 140) puts real samples on them. Only TWO cards carry this
// on the welcome page, so the extra points are affordable here — the circles
// index, with a dozen, instead only animates the card under the pointer.
const KB_CIRCLE = { spread: 0.85, iters: 9, smooth: 0.34, tension: 22, spring: 34,
                    damp: 3.8, puff: 14, ambient: 0.9, width: 1.5, blur: 8,
                    points: 320, fill: "auto", fillAlpha: 0.22 }

// The click-through transition. ms:800 is the user's call (2026-07-30) — the lib
// default of 1400 is lab-slow; 800 keeps the gesture readable without making people
// wait for it. A tester's own localStorage tuning overrides this per-browser
// (kbubbleOpen.setUserTuning — the nerd box above).
const KBO_CIRCLE = { ms: 800, style: "iridescent", width: 1.6, coverage: 1.22,
                     fill: "auto", fillAlpha: 0.22, backdrop: "auto" }

window.addEventListener("load", () => {
  const cards = [...document.querySelectorAll(".landing-card")]

  // living border on the two entry cards — HOVER-CAPABLE DEVICES ONLY since
  // KATUI3 R8 (user 2026-08-17). These two ambient loops (320 points, blur 8,
  // every frame, forever) were measured crushing a phone to ~217ms/frame
  // (~4.6fps) under CPU-throttled emulation — tap-to-visually-closed on the
  // profile modal was 1.7s WITH them and 173ms WITHOUT. That page-wide display
  // lag was the user's week-long "modal takes seconds to close": the close ran
  // in ms, the SCREEN was seconds behind. Same cost problem CIRCLES-BUBBLECOST1
  // solved on the circles page with hover-only — a hover-less device can't even
  // trigger that, so phones get calm static cards; the kbubbleOpen entry
  // transition below is transient and stays for everyone.
  if(window.kbubble && !matchMedia("(hover: none)").matches){
    const handles = cards.map(el => kbubble.attach(el, Object.assign({ style: "iridescent" }, KB_CIRCLE))).filter(Boolean)
    // KPERF (R9): a hover-capable but WEAK device (old laptop, cheap tablet with a
    // mouse) gets the animations torn down the moment the header's frame-cadence
    // sampler flags it — same reasoning as the phone exclusion above.
    document.addEventListener("kperf:low", () => handles.forEach(h => { try { h.destroy() } catch(e){} }), { once: true })
  }

  // click → inflate into the board. bind() intercepts the click itself and navigates
  // at the end, so the <a href> stays the real, crawlable, middle-clickable target and
  // is what runs if this script never loads.
  if(window.kbubbleOpen){
    cards.forEach(el => kbubbleOpen.bind(el, Object.assign({}, KBO_CIRCLE, { target: el.getAttribute("href") })))
  }

  // ENTRY-CIRCLES1: the bubble-everything skin additionally dresses the administrative
  // buttons — restrained tuning, and NO kbubbleOpen (they're not {one} entries).
  // (the connect button's attach went with the connect card, 2026-08-17)
  if(window.kbubble && document.body.classList.contains("lskin-bubble")){
    const create = document.querySelector(".landing-create")
    if(create) kbubble.attach(create, Object.assign({ style: "glow", color: "rgba(47,124,74,.9)" }, KB_TUNED))
  }
})

// ── nerd-mode per-user transition tuning (localStorage, this browser only) ──
{
  const box = document.getElementById("landingTuneBox")
  const msg = document.getElementById("landingTuneMsg")
  const say = (t, warn) => { msg.textContent = t; msg.classList.toggle("warn", !!warn) }

  const load = () => {
    let raw = null
    try { raw = localStorage.getItem(window.kbubbleOpen?.TUNE_KEY || "katomia.kbubbleopen.tuning.v1") } catch {}
    box.value = raw ? raw : ""
  }
  load()

  document.getElementById("landingTuneApply").onclick = () => {
    const txt = box.value.trim()
    if(!txt){ window.kbubbleOpen?.setUserTuning(null); say("Cleared — using site defaults."); return }
    let obj
    // Tolerate the lab's copy-paste forms: a bare object, or trailing commas.
    try { obj = JSON.parse(txt) }
    catch {
      try { obj = JSON.parse(txt.replace(/,\s*([}\]])/g, "$1")) }
      catch { say("Not valid JSON — expected something like { \"ms\": 800 }", true); return }
    }
    if(!obj || typeof obj !== "object" || Array.isArray(obj)){ say("Expected a JSON object.", true); return }
    const known = Object.keys(window.kbubbleOpen?.DEF || {})
    const ignored = Object.keys(obj).filter(k => !known.includes(k))
    if(!window.kbubbleOpen?.setUserTuning(obj)){ say("Couldn't save — localStorage is blocked in this browser.", true); return }
    say(ignored.length
      ? `Saved. Ignored unknown key${ignored.length > 1 ? "s" : ""}: ${ignored.join(", ")}`
      : "Saved — click a " + (window.KTERMS?.one || "circle") + " to see it.", ignored.length)
  }

  document.getElementById("landingTuneClear").onclick = () => {
    window.kbubbleOpen?.setUserTuning(null); box.value = ""; say("Cleared — using site defaults.")
  }
}
</script>

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
<script src="<?= kasset('katomia-auth.js') ?>"></script>
<?php require_once($_SERVER['DOCUMENT_ROOT'] . "/vendor/walletconnect/kwcScriptTag.php"); ?>
<!-- GCP feedback 2026-08-13: widget in place so Send feedback never navigates away
     (see circles.php note). data-screenshot off per KAT-FEEDSHOT-BROKEN1. -->
<script src="https://<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>/feedback-widget.js"
        data-product="katomia-welcome"
        data-screenshot="0"></script>
</body>
</html>
