// katomia-board.js — BOARD-UI1 prototype: board-game skins for proposal mode.
// Loaded ONLY by board.php, AFTER katomia-render.js — the render() declaration
// below therefore replaces the grid renderer (later classic-script function
// declarations win), while everything else (socket, enrichment, makeAssetEl,
// setupDropTarget, openAssetModal, lock-progress) is reused untouched.
//
// Two skins share one layout engine (they differ only in where baskets show):
//   table  — "round table" god view: every player is a wedge; each seat card
//            shows their AVAILABLE (outer band) and their BASKET (inner band);
//            you are the dock at the bottom; center oval = shared table with
//            the lock ring.
//   market — "market square" ego view: seats are STALLS showing only their
//            available; YOUR basket is the center table (trays coloured by
//            giver); your store stays in the dock.
// Reserved is never a column here: a reserved asset stays in its owner's
// available band GHOSTED (the established dashed/faded language).

/* ── skin state ─────────────────────────────────────────────────────────── */

// BOARD-SKINLABEL1: to add a new skin, register its identifier here AND add
// a matching <option value="..."> in header.php's #boardSkinSelect — the two
// lists aren't derived from each other, so keep them in sync by hand.
const BOARD_SKINS = ["ring", "ring2", "ring3", "ring4", "ring5", "ring6", "ring7", "ring8", "ring9", "ring10", "ring11", "ring12", "ring13", "ring14", "ring15", "ring16", "susan", "susan2", "susan3", "susan4", "susan5", "table", "market"]

// ring2/ring3 = the 2026-07-09 review-pass treatment (board-game feel): account
// ids etched into the felt instead of label rows, oval faded+thickened (future
// tap-to-lock arc), footer control bar. ring2 etches along the most-horizontal
// segment boundary, ring3 at the segment centroid, and both tint chip FACES by
// owner. ring4 = the feedback pass on ring2 (2026-07-09 #2, now the default):
// boundary etching won (centroid ids get buried under assets), but face tint
// lost — an NFT's own artwork colour must never read as ownership, so EVERY
// chip instead wears the v1 basket treatment: the owner's thick left sleeve,
// clean face. Chips a smidge bigger everywhere. One frozen variant per
// iteration, on purpose — new feedback = new skin, so oddities stay comparable.
// ring5 (feedback pass 3, default): sleeve drawn as the OG SOLID BAR (square
// left corners, not a rounded border), per-account LOCK ARCS on the oval
// (tap your own arc to lock — stage 2 arrives), hub becomes the cluster
// progress ring, footer gains ▶ (animate transfers ghost→basket).
// ring6 (experiment): ring5 with the oval line REMOVED — the user is half
// inclined to drop it; inner zone reads from a soft shading + sleeves alone,
// and lock arcs materialise only where a lock exists (plus a faint dashed
// affordance on your own segments).
// ring7 (review 4, 2026-07-09 — v6 confirmed as the base, default): the
// shading INVERTS — the basket zone is a permanent light SPOTLIGHT, and when
// an account locks their STORE zone darkens (spotlight stays lit, orange arc
// stays); locked accounts get a 🔒 prefix on the etched id (badge dropped);
// ▶ preview leaves a trailing line in the giver's colour that fades slowly.
//
// Naming (user): the inner spotlight area = BASKET, the outer holding area =
// STORE (matches the grid view's store/reserved language).
//
// Review-4 observations, noted not tasked (still exploratory):
// - shared god view confirmed working: same rotation value on two screens
//   aligns the boards; chip FLOW inside a box still varies with viewport
//   size — acceptable, the segment geometry is what's shared
// - Firefox sometimes renders some players' chips as images and not others —
//   pre-existing enrichment/thumb-cache glitch, not a board issue
// - 8 accounts: fine on desktop, too crowded on portrait mobile (~4 is the
//   practical ceiling) — the lots-of-players story (start wide, whittle to a
//   cluster, flip between clusters; Active-only is the seed of it) is THE
//   open challenge for this view
// ring8 (review 6, 2026-07-09 — default; v7 frozen): the snag+structure pass.
// - lock 🔒 no longer SHIFTS the etched id (own text node, anchored before it)
// - locked store dim now sits ABOVE the chips (felt split into base/top SVG
//   layers) — only the account id + 🔒 + xproof label stay bright
// - chip faces WHITE (one player's grey chips vanished against the shading)
// - boundary marking INVERTED: your own arc has NO line (your space flows
//   into the baskets); other players' arcs are solid light grey, and the two
//   mine/other boundaries extend to the screen edge — one continuous divider
//   splitting the board into "where you can drop" vs everyone else's stores.
//   Your arc stays TAPPABLE (transparent stroke) and lights orange on lock.
// - xproof label (accountLabelCache) etched under the id, smaller
// - hub wears a faint Montserrat K (KPAY brand) behind the count
// - chips + etched ids scale with viewport (~⅔ … ~1.3× of the old fixed size)
// - pair/trail lines route UNDER the chips (host z-index below the boxes;
//   the "flips above at rest" glitch was the host sitting over everything)
// - footer rework: account dropdown (pick → Lock/Unlock + 🗑 Delete, ➕ Add
//   at the bottom; the SIGN button will occupy the Lock slot once all-locked
//   — same checkpoint, later phase), Net view toggle (viewer-local netting),
//   "You at bottom" orientation toggle (off = shared/screen-share layout)
// - offers from OTHER PLAYERS (player level, not account — your own second
//   account shouldn't animate at you) fly in with a trail when they land
// ring9 (review 7, 2026-07-09 — default; v8 frozen): fix + party-semantics pass.
// - line-over-chips-at-rest ROOT CAUSE found: position:fixed elements are
//   their own stacking contexts (Chrome), and #boardRoot had NO z-index — so
//   the line hosts' z4 vs the boxes' z5 never competed; DOM order painted the
//   hosts (later siblings) on top. #boardRoot now carries z-index:5 (global
//   bug fix, all skins).
// - trails DOTTED + fading (dasharray is the dot pattern now; draw-in gone)
// - withdraw/reject animates the chip BACK to its owner's store — shown to
//   everyone INCLUDING the actor (it's a click, not a drag; the motion cues
//   where it returned to)
// - Net = FULL pairwise netting (A→B $1 + B→A $3 ⇒ single B→A $2), not just
//   same-direction merging. Netted-away chips: a fade-out would be nice —
//   BOARD-POLISH1 (needs FLIP diffing; the "1 flies into the 3 and crashes
//   into 2" animation is the deluxe version, also parked there).
// - "Active only" → "Party only", rule-aware: cluster → only MY cluster;
//   active → all active accounts; all → everyone. Shows who is actually
//   party to my proposal.
// - when ≥2 disconnected clusters coexist, segments OUTSIDE my cluster fade
//   their wash — the "cluster settles by surprise" problem becomes visible
// - hub K sized to fill the circle; footer lock button fixed-width; dropdown
//   🔒 moved AFTER the id (no jump); dev rotation spinner dropped (superseded
//   by You-at-bottom; frozen skins keep theirs). Parked idea: TWEEN the
//   rotation when toggling You-at-bottom — one number, easy juice someday.
// susan (Lazy Susan v1, same pass): the ring UNWRAPPED for the wide phase —
// other accounts are rectangular cards in a horizontal carousel (arrows +
// native swipe), my store+basket strips sit full-width above the footer.
// Same chips, same drop semantics, same footer/net/party machinery. This is
// the browsing view for many players; the ring is the endgame view once a
// cluster forms (flow discussion: RENDERPATH doc §8).
// susan2 (review 8, 2026-07-10 — susan default; v1 frozen): the alignment
// pass. TOUCH DRAG lands board-wide (press a chip and drag — HTML5 dnd is
// mouse-only; a pointer-events shim clones the chip under the finger and
// executes the same drop semantics, amount prompt included; tap-to-modal
// still works). Susan cards echo the ring's language: basket = the card's
// whole footer region, lit like the spotlight, behind the ring's DOTTED
// crossable line; my area sits behind the SOLID divider, no line between my
// own store and basket (my space flows). Chips +60%, account heads +30%,
// my strips take the height they need and the wheel gets the rest. Footer
// gains "Pickable" — the generic player pref (backend game_setPref /
// KAT-PLAYERPREF1): allow others to pick assets from my store; the pick
// GESTURE itself is next pass (needs the backend action).
// ring10 (review 9, 2026-07-10 — default; v9 frozen). Naming: the small
// centre circle = the HUB; its rim = the HUB RING.
// - touch drag now REAL-TIME: the fly clone inherited .board-fly's 0.85s
//   transform transition, so it chased the finger at constant speed —
//   .board-touchfly kills the transition (global fix)
// - spotlight RESTORED and inverted per the new spec: v9 had lost the v7
//   lightening (the --lit fill was accidentally gated to ring7 only); v10
//   keeps the basket zone at the base felt and DARKENS the store region
//   instead (evenodd shade) — the spotlight is on the deal
// - HUB RING = per-account arcs in each player's colour (Ludo rim); accounts
//   in MY party additionally carry a thin lit inner arc — the visual cue for
//   what Party-only will keep. Lock count text + progress ring CULLED (once
//   party-only is on, the ratio is visible on the board itself); count stays
//   in the hub tooltip
// - Party only now hides MY unconnected accounts too (cleaner lock counts;
//   the dust-transfer trick deliberately links accounts into the party)
// - own-wash saturation boost dropped — ·you, the open arc and the hub cues
//   carry identity; boards look the same for everyone
// - own lock arc: desktop hover previews a washed-out orange
// - chips shrink to their wrapped text (the wrap left dead right-padding)
// - stuck pair line fixed: cleared on every render (mouseleave can't fire
//   when the hovered chip is re-rendered away)
// - susan: pair/trail lines were buried behind the opaque cards — line
//   hosts ride above card surfaces on susan skins
// ring11 (review 10, 2026-07-10 — default; v10 frozen):
// - PICK lands end-to-end: chips in a Pickable player's store are grabbable
//   (mouse + touch) and drop into any of MY regions → game_pick (KAT-PICK1
//   on alpha; amount prompt as usual). Pickable stores show a 🛍 by the
//   etched id / susan card head; pick chips get a grab cursor.
// - party lit arc MOVED OUTSIDE the hub (it was white-on-white inside):
//   drawn on the felt at rc+5, warm gold, one arc per party account —
//   including yourself once you have any edge
// - "you" now sits at the hub: angled with your segment's bisector, upright,
//   just outside the hub ring; the ·you suffix leaves the etched id. (Later:
//   short player names for others there, tappable → player info/reputation.)
// - K is a geometric SVG path (square proportions per the KPAY mark, dead-
//   centred, font-independent — mobile was rendering a fallback font and the
//   glyph baseline sat low). Proper logo asset = BRAND-K1.
// - sleeve regression fixed: ring10's chip CSS group was missing from the
//   square-corner/white-face lists, so STORE chips fell back to rounded
//   (baskets looked right only because legacy .asset.basket zeroes its left
//   radii). Lists now include ring10/ring11/susan2.
// - locked accounts: BIG 🔒 at the store centroid, on top of the dim (three
//   cues now: orange arc + darkened store + centroid lock; the small etched
//   one stays for now)
// ring12 + susan3 (review 11, 2026-07-10 — defaults; v11/susan2 frozen):
// - party cue = STRIP LIGHT, not gold (gold/orange is reserved for LOCK):
//   a white lit arc — "turning on a light" for that segment
// - hub cleanup: the player-colour arcs LEAVE the hub (it keeps just its
//   thin grey border + the K); on the board side of the hub sit two arcs —
//   the player colour (always) and the party strip-light outside it
// - K is now an ASSET FILE (assets/kpay-k.svg) — swap the file to rebrand
//   (BRAND-K1); the geometric placeholder is baked in it
// - pickable cue: the teal halo is gone (colour stays reserved for meaning;
//   it was invisible on mobile anyway). The SLEEVE (official name for the
//   owner's square left bar) grows a PICK FLAG — a small player-coloured
//   right triangle jutting left from its top, like a golf flag; overlaid
//   absolutely so nothing shifts when Pickable toggles. Badge emoji 🛍 → ◀
//   (🛍 didn't render on the user's font; ◀ = "pull it backwards").
//   Agent-suggested alternatives, NOT owner decisions, for future passes:
//   darkened wash behind pickable chips; a notch cut INTO the sleeve top;
//   sleeve rendered dashed when pickable. Owner's own later idea (logged,
//   green-hat): pickable assets periodically jiggle — store goods calling
//   the customer; ties into profiles/pitches. See BOARD-GAMIFY1.
// - pick now works on the wheel: the gesture was gated to ring11 only —
//   susan3 (and ring12) get it; susan chips scale down (max ≈60% of v2) and
//   cards widen into unused desktop space
// ring13 + susan4 (review 12, 2026-07-10 — defaults; v12/susan3 frozen):
// - toast deck: on the board page toasts overlap like a stack of cards in a
//   thin top banner (newest on top), instead of filling the screen
// - pick flag reshaped: ◀ isoceles — the LONG edge fuses flat against the
//   sleeve, tip points left at half-height (less pointy, sits below the
//   chip top; the user may still redraw it — yak parked)
// - your OWN chips wear the pick flag too when YOU are Pickable — uniform
//   "price-tagged, help yourself" view for everyone including you
// - ghosts are now OPAQUE-pale instead of element-opacity 40% — the hover
//   pair line stopped showing THROUGH them (it was never "on top", the
//   ghost was see-through; thumbs keep a filter, faint show-through noted)
// - locked stores now darken their CHIPS too (.board-lockdim class, on top
//   of the felt shade — assets leave the light, ids stay bright)
// - susan joins the under-chip line order: card/strip surfaces went
//   slightly translucent so the z4 line layer reads through the felt but
//   hides under opaque chips (frozen susan2/3 keep the lines-on-top hack)
// - susan my-strip: two-tone bands like the cards/ring — store on felt,
//   basket lit — prepping users for the party view's spotlight language
// - desktop drag: invalid targets show a no-drop cursor (dropEffect none,
//   driven by a window-scoped payload set at dragstart)
// ring14 + susan5 (review 13, 2026-07-10 — defaults; v13/susan4 frozen):
// - pick flag FINAL shape (quarter-square): isoceles, vertical base FUSED to
//   the sleeve (1px overlap kills the hairline seam), apex pointing left at
//   half height; fixed height regardless of chip height
// - susan my-accounts: side-by-side CARDS like everyone else, bands FLIPPED
//   (basket over store) — the page reads store/basket|basket/store down the
//   fold, matching the ring's store·basket·basket·store symmetry
// - lock effect on chips: DARKENING out, GHOST-WASH in (the dark-glass idea
//   washed out, not dimmed — same family as the reserved ghosting)
// - touch drag: the clone sat exactly UNDER the finger (that's why it felt
//   invisible) — it now lifts ~36px above the touch point and a dotted halo
//   ring follows the finger (the user's tap-oval idea); threshold 10→6px.
//   Interaction helper is shared, so all skins feel it (UX fix, not a look).
// - CSS growth fix: body[data-board-fam~="…"] family tokens replace the
//   ever-growing :is(skin,skin,…) groups — new skins inherit by declaring
//   their families in render(), not by editing every selector list.
// ring15 (review 14 — default; v14 frozen): THE SIGNING LAYER, first slice,
// built against the REAL pending-tx record (state.tx.pending: txid, pch,
// pchbasis legs, lifecycle) — the user tests on t-prop/t-pact testnet:
// - post-strike the board STAYS: receiving legs from pchbasis render as
//   chips in each party's basket zone (sleeve = giver where unique) —
//   nothing visually leaves the table
// - party arcs flip to SIGNING STATUS (pulsing orange = awaiting
//   signatures, green = SIGNED, red = failure statuses) — the lock-arc
//   language carried into the next phase, SIGN-STATUSLANG1 colours
// - the hub becomes the COUNTDOWN to tx expiry (validStart+180s from the
//   txid; the SIGN-COUNTDOWN1 hourglass landing where predicted)
// - the footer Lock slot swaps to ✍ SIGN for party accounts — opens the
//   existing signing page/modal (untouched, as agreed) in a new tab; the
//   embedded roll-up comes later
// This is buildSceneFromTx in embryo — boardTxLegs() is the tx→scene
// adapter; the full Phase 1.5 split grows around it.
// ring16 (review 16, 2026-07-10 evening — default; v15 frozen): the live
// testnet walkthrough pass.
// - ▶ is now a FOCUS TOGGLE: assets animate to their baskets AND everything
//   outside the hub-ring spotlight drops into heavy darkness (footer stays);
//   press again to lift it. It's the before/after of the signing modal made
//   spatial — "you will own these" — and previews the signing phase's look.
// - LOCK darkens the store roughly twice as hard (assets barely visible,
//   big 🔒 stays on top). NOTE (owner, thinking evolved live): the preview
//   dark and the lock dark may eventually merge into one grammar — if they
//   converge, collapse .ring-storedim / .ring-focusshade to one class.
// - footer Sign now signs IN-APP: the kpool widget + WalletConnect load on
//   board.php and Sign sets #sign=network:txid:pch (the widget's hashchange
//   opener). HashPack-first MVP; the EXTERNAL page (all wallet options)
//   moved to tapping the HUB during signing — kept for comparison testing,
//   likely hidden at MVP (the /future page remains the power route).
// - hovering the footer Lock button previews WHICH arc you'd lock (thin
//   dashed orange — deliberately not the locked look; the click thickens
//   it). No asset highlighting on hover: locking commits the WHOLE ring,
//   not just your legs (owner talked himself out of highlighting — keep it
//   that way).
// - board prefs (skin, Party only, Net, You-at-bottom) persist in
//   localStorage — a WS drop + refresh no longer reverts your view (owner
//   picked localStorage over URL-hash).
// Observations logged, not coded (owner, review 16): susan scroll-jump when
// the cursor crosses a scrollable card (scroll view likely temporary);
// lock/pick asymmetry ACCEPTED — you can't pick from a locked store, but
// offering INTO a locked basket auto-unlocks it, so a determined trader can
// unlock-by-gifting then pick; workaround is part of the social game.
// Colour contrast: palette reordered backend-side (navy/purple clashed at
// review 16); with many players colour de-emphasises and layout carries.
const ringEtched = () => /^ring([2-9]|1[0-6])$/.test(boardSkin) || susan()
const ringSleeved = () => /^ring([4-9]|1[0-6])$/.test(boardSkin) || susan()
const ringArcs = () => /^ring([5-9]|1[0-6])$/.test(boardSkin)
const ringNoOval = () => /^ring([6-9]|1[0-6])$/.test(boardSkin)
const ring8 = () => /^ring(8|9|1[0-6])$/.test(boardSkin) || susan()   // v8 feature set
const ring9 = () => /^ring(9|1[0-6])$/.test(boardSkin) || susan()     // v9 fix set
const ring10 = () => /^ring1[0-6]$/.test(boardSkin)
const ring11 = () => /^ring1[1-6]$/.test(boardSkin)
const ring12 = () => /^ring1[2-6]$/.test(boardSkin)
const ring13 = () => /^ring1[3-6]$/.test(boardSkin)
const ring14 = () => /^ring1[4-6]$/.test(boardSkin)
const ring15 = () => /^ring1[56]$/.test(boardSkin)
const ring16 = () => boardSkin === "ring16"
const susan = () => /^susan[2-5]?$/.test(boardSkin)
const susan2 = () => /^susan[2-5]$/.test(boardSkin)
const susan3 = () => /^susan[3-5]$/.test(boardSkin)
const susan4 = () => /^susan[45]$/.test(boardSkin)
const susan5 = () => boardSkin === "susan5"

let boardSkin = (() => {
  const s = new URLSearchParams(location.search).get("skin")
  return BOARD_SKINS.includes(s) ? s : (boardLoadPrefs().skin || "ring16")
})()

// footer state — STICKY via localStorage (review 16: a WS drop forces a
// refresh, and losing your toggles each time was maddening)
//
// SCOPE SEAM (user 2026-07-14): this key is deliberately GLOBAL — one
// localStorage entry, not per-game — so a layout you dial in on one game
// (max-on-ring, pickable, etc.) carries over as your default the next time
// you open a different one. That's the agreed starting point ("a lot of
// those you might want them to stick across games... I don't think any of
// those are absolutely specific to a specific game"), not a fixed decision —
// the user is open to per-game scoping later if it turns out some of these
// (max-on-ring and pickable were the two floated as maybe-game-specific)
// want to vary by game after all. THE SWITCH, if that day comes: change
// BOARD_PREFS_KEY below to include gameId (e.g. `katomiaBoardPrefs:${gameId}`)
// — everything else (load/save shape, defaults) is already written
// game-agnostically and needs no other change.
const BOARD_PREFS_KEY = "katomiaBoardPrefs"
function boardLoadPrefs(){
  try { return JSON.parse(localStorage.getItem(BOARD_PREFS_KEY) || "{}") } catch { return {} }
}
function boardSavePrefs(){
  try {
    localStorage.setItem(BOARD_PREFS_KEY, JSON.stringify({
      skin: boardSkin, selfBottom: boardSelfBottom,
      netView: boardNetView, partyOnly: boardPartyOnly,
      maxSegments: boardMaxSegments, animSpeed: boardAnimSpeed,
      trailResidual: boardTrailResidual, layoutMode: boardLayoutMode,
      zoneWalls: boardZoneWalls, hugRing: boardHugRing,
      stickyChips: boardStickyChips, autoArrange: boardAutoArrange, chipScale: boardChipScale,
      chatMode: boardChatMode, avatarPos: boardAvatarPos,
      counterMode: boardCounterMode, chipStyle: boardChipStyle
    }))
  } catch {}
}
const _bp = boardLoadPrefs()
let boardSelfBottom = _bp.selfBottom ?? true   // me at 6 o'clock; off = shared (Prefs; default ON per user 2026-07-12)
// net is the STANDARD view now (user 2026-07-14: "we're going to go with net
// as the standard view, and we probably won't expose that option to turn it
// off to users") — default flipped to ON; the toggle stays as a 🧪 escape
// hatch, parked not removed (unknown edge cases may still want the split view)
let boardNetView = _bp.netView ?? true         // FULL pairwise netting (🧪 Settings)
let boardSelectedAccount = null                // footer dropdown selection
const _boardSeenMineIds = new Set()            // my account ids ever seen — newest-lands-selected (2026-07-14)
let boardPartyOnly = _bp.partyOnly ?? false    // rule-aware party filter
// animation speed multiplier (Prefs — debug throttle): 1 = normal, 0.25 = ¼
// speed etc. Divides into every boardAnimate duration.
let boardAnimSpeed = Number(_bp.animSpeed) || 1
// 🧪 dev setting (user 2026-07-14): after the ▶ replay's trail line fades, a
// fraction of its opacity PERSISTS — a burn-in showing where each asset came
// from while the deal sits locked. 0 = old fade-to-nothing behaviour; the
// residual lines are wiped at the start of the next replay. A design-tuning
// knob, not a planned user feature.
let boardTrailResidual = _bp.trailResidual ?? 0.5
// BOARD-CHATMODE1 (user 2026-08-03): where speech lives — "bubbles" over the board or
// a docked message "panel". R2 (same day, seeing it live): PANEL IS THE DEFAULT
// EVERYWHERE — "the initial brief was basically: you either have speech bubbles, or
// you have a message panel on the right-hand side" — bubbles are the opt-in via the
// Settings toggle. katomia-chat.js reads this live.
let boardChatMode = _bp.chatMode || "panel"
// DEMO-NARRATE1 avatar placement experiment (R2 spoke → R3 arc, user 2026-08-03):
// "arc" = centred on the segment along the ring inside the coin-lettered id (default);
// "spoke" = the R2 boundary-spoke position, kept as a 🧪 switch for comparison.
let boardAvatarPos = _bp.avatarPos === "spoke" ? "spoke" : "arc"
// boardPrefsOpen (⚙ popover open/closed) retired BOARD-HEADERINT1 — Preferences
// now lives in profile-modal.php, opened via the normal Profile menu item.
// 🧪 chip layout (BOARD-LAYOUT1, user 2026-07-14): "shelves" = deterministic
// concentric rows clustered at the rim; "organic" = the original relax
// solver. Toggle kept so both can be compared live; loser gets removed.
// DEFAULT FLIPPED to organic (user 2026-08-04): shelves re-flowed chips on
// every crowding change, which is much of the mobile jitter/font-churn the
// feedback keeps hitting (f0c418e5); organic moves chips only when something
// actually pushes them. Shelves stays selectable while the comparison runs.
let boardLayoutMode = _bp.layoutMode === "shelves" ? "shelves" : "organic"
// Chip breathing room (user 2026-08-04, feedback f0c418e5 jitter + a3d808c1
// "too huggy" after 🧹 on desktop): the sim's collision radius beyond the
// chip's own half-size. Was 3px — chips could sit nearly edge-to-edge, so any
// re-measure ripple re-collided the whole cluster (visible jitter) and Tidy
// packed them tight. 8px reads looser and gives the solver slack before
// contact. One knob so a future "hugginess" setting has a single place to bind.
const BOARD_CHIP_PAD = 8
// BOARD-CROWDFAIR1 (user-approved 2026-08-05): past the shrink floor chips
// OVERLAP instead of miniaturising — collision radii squash (≤1) so the pile
// stays local to the crowded wedge, like a real table.
let _boardCrowdSquash = 1
const boardChipCr = b => (Math.max(b.w, b.h) / 2 + BOARD_CHIP_PAD) * _boardCrowdSquash
// 🧪 debug (user 2026-07-16): draw each zone's PHYSICS WALLS — the actual
// region the sim lets chip edges occupy (inner wall past the ghost band,
// soft outer wall, the ±80°-clamped angular walls, basket coin-band inset)
// plus the safe drawing rect. The felt shows none of these truthfully; when
// chips land oddly this shows whether the walls or the physics are wrong.
let boardZoneWalls = _bp.zoneWalls ?? false
// Lock-button hover preview re-arm gate (user 2026-08-03): after a click the
// footer rebuilds under a stationary cursor, mouseenter re-fires, and the
// preview used to re-apply OVER the fresh lock — reading as "it hasn't locked".
// Armed again only when the pointer genuinely leaves the button.
let boardLockPreviewArmed = true
// 🧪 lab (user 2026-07-16, "clustering towards the outside — chips could
// come in a bit more, without touching the ring; keep it mild"): biases the
// organic anchor inward in STORE zones (0.38 of the radial band instead of
// the 0.5 midpoint). Baskets and shelves unaffected. Default off.
let boardHugRing = _bp.hugRing ?? false
// 🧪 lab (user 2026-07-16, board-game feel / BOARD-ARRANGE1 first slice):
// once the sim settles, chips become STICKY — springs skip them and
// collisions can't move them (a newcomer takes the whole separation push and
// finds space around them). Walls still apply (geometry changes must clamp).
// The footer 🧹 button clears stickiness and re-runs the layout.
// Default ON (user 2026-08-05, voice + feedback 64d2d521): "wherever you drag a
// chip, it lands and stays" is the norm now that players arrange their own
// board. The Settings toggle survives for a while ("we're probably going to
// take away that option") — remove it once nobody unticks it.
let boardStickyChips = _bp.stickyChips ?? true
// BOARD-AUTOARRANGE1 (user 2026-08-07): let the player turn the TIDYING OFF and
// stack chips wherever they like — "I can see an advantage that if someone's got
// a lot of assets, they might just want to arrange them completely manually and
// not have them auto adjust when you move them around". Off = the organic
// anchor spring and the chip↔chip collision pass both stop, so chips stay
// exactly where they were put and may freely overlap; chips still SPAWN at
// their scattered organic positions on first load ("they just auto place on
// first load, they sit there, then it's up to you"). Everything that isn't
// chip-vs-chip tidying keeps running: walls, the safe-area clamp and the
// spoke-label keep-out are all still inside the tick, so you can never drag or
// stack a chip out of its own segment and into someone's basket.
// Shelves is untouched — an explicitly chosen deterministic layout IS
// auto-arrangement, so the toggle would contradict the mode.
// Default ON (status quo). The user weighed making it off by default —
// "I'm inclined to have it off because it's more intuitive to have control...
// actually, no, let's leave it checked" — so this is a settled default, not an
// oversight. NORMAL mode, not nerd: it's a real player preference.
let boardAutoArrange = _bp.autoArrange ?? true
// BOARD-COUNTERMODE1 (user 2026-08-04): "simple" is the DEFAULT — no counter
// band, no ghost for a PARTIAL fungible offer; instead the remaining stack
// itself moves to the rim (the old ghost spot), decremented ("show what the
// giver ends up with" — 100 offered 10 shows 90 at the rim + 10 in the
// basket; the table still adds up). Ghosts remain ONLY where nothing stays
// behind (NFTs, whole-stack fungible offers) — without one you'd have no idea
// where the basket chip came from. "classic" = the status quo (counter band
// tint + ghost pile + remainder in place), kept as a 🧪 nerd toggle for live
// comparison; evolutionary — if simple wins, classic falls by the wayside.
// The counter GEOMETRY (ghost-only rim band the physics reserves) stays in
// BOTH modes: the spatial separation is what makes the spotlight read.
let boardCounterMode = _bp.counterMode === "classic" ? "classic" : "simple"
// BOARD-CHIPART1 (user 2026-08-04): chip face styling, up for comparison —
// "they look a bit basic at the moment… on mobile a dark on light might look
// better". Three variants, board-game/poker-chip precedent (body colour reads
// at distance, edge marks read in a stack):
//   plain  — status quo: white face, 4px owner sleeve
//   colour — FUNGIBLES take the owner's colour as the whole face with
//            contrast-picked ink; NFTs keep their artwork untouched and get a
//            fat owner TAG instead (the user's call: a full wrap would fight
//            the art, so widen the left bar to ~3× and leave the picture alone)
//   dark   — charcoal face, white text, owner colour as a rim + the same fat
//            NFT tag; maximum contrast against the light felt, most "casino"
// Nerd-only while being compared; the winner becomes the default.
// DEFAULT = colour (user 2026-08-04, after seeing the three live: "let's move
// the default to owner colour for now, I think that's probably going to be the
// default"). plain/dark stay selectable while the comparison finishes.
let boardChipStyle = ["plain", "dark"].includes(_bp.chipStyle) ? _bp.chipStyle : "colour"
// Chip emboss RETIRED (user 2026-08-17, KATUI3 feedback pass) — the BOARD-CHIPDEPTH1
// R3 engraved-lettering lab pref was default-off and causing problems; control,
// wiring, pref and body-class toggle all removed. CSS rules keyed on .chip-emboss
// are now unreachable.
const boardCounterSimple = () => boardCounterMode === "simple"
// helpers.js (highlightTradePair) needs this across the closure seam; absent
// (legacy game.php grid) it reads undefined → classic behaviour there
window.boardCounterSimple = boardCounterSimple

// BOARD-CHIPSIZE1 (user 2026-07-31): chips start bigger on phones (the CSS
// clamp floors were raised) and only shrink when a zone actually gets
// crowded. Rendered size = CSS clamp × --chip-scale, where --chip-scale =
// boardChipScale (user multiplier, 🧪 Settings) × _boardChipFit (auto crowd
// fit, computed per boardOrganicApply from the fullest zone). Quantised with
// hysteresis so the physics isn't re-excited by ±1px churn.
let boardChipScale = Number(_bp.chipScale) || 1
// BOARD-UISIZE1 (user 2026-08-05): ONE display-size preference — Small /
// Normal / Large — for ordinary humans, instead of "fiddle the chip % if you
// can't read it". Deliberately a GLOBAL key (site-wide, applied as html
// .ksize-* by header.php before first paint; CSS surfaces consume
// --ui-scale), not a katomiaBoardPrefs field. Here it feeds the CHIP
// multiplier with its own matrix: "the chips need to be readable, simple as
// that" — on a phone the old 130% is the new Normal; Small keeps the
// pre-change compact look; the nerd 🧪 Chip size stays a dev multiplier on
// top of whatever this resolves to.
const UISIZE_KEY = "katomiaUiSize"
let boardUiSize = (() => {
  try {
    const v = localStorage.getItem(UISIZE_KEY)
    return ["small", "normal", "large"].includes(v) ? v : "normal"
  } catch { return "normal" }
})()
const boardSmallScreen = () =>
  matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) <= 500
// Mobile id shortening (user 2026-08-05): board labels drop leading ZERO
// shard/realm components — "0.0.123" → "123", a future "0.1.5" keeps its "1.5".
// Mobile only (ring + spoke labels); desktop has room for the full id.
const boardShortAcctId = label =>
  boardSmallScreen() ? String(label).replace(/^(?:0\.)+/, "") : String(label)
function boardUiSizeChip(){
  const m = boardSmallScreen()
  return { small: m ? 1 : 0.9, normal: m ? 1.3 : 1, large: m ? 1.5 : 1.3 }[boardUiSize] || 1
}
let _boardChipFit = 1
let _boardChipScaleApplied = null
function boardApplyChipScale(){
  const s = Math.round(boardChipScale * _boardChipFit * boardUiSizeChip() * 100) / 100
  if(s === _boardChipScaleApplied) return false
  _boardChipScaleApplied = s
  document.body.style.setProperty("--chip-scale", s)
  return true
}
boardApplyChipScale()

// Counter flex (feedback 061041a3, user 2026-08-05): "when board space is in
// short supply, reduce the counter space to allow chips to consume more of
// that space". The reserved rim band gives way BEFORE chips shrink: 1 = the
// full classic reservation, 0 = collapsed to what its occupants (ghosts /
// rim piles) actually need — or a sliver when empty. Desktop keeps the full
// counter by construction: no pressure, no squeeze. Quantised to ¼ steps so
// the physics isn't re-excited by trembling pressure readings.
let _boardBandFlex = 1
function boardBandAt(z){
  if(z.isBasket) return 0
  const full = z.bandFull ?? 40, min = z.bandMin ?? 12
  return Math.round(min + (full - min) * _boardBandFlex)
}

// BOARD-WHEEL1 (user 2026-07-11): Lazy Susan is retired (scope, not code —
// still in git history / renderSusanBoard if ever needed). Its job — "too
// many players to fit" — moves onto the ring itself: mine stays fixed, OTHER
// players become a scrollable window capped at boardMaxSegments total slots
// (mine + visible others). A footer number input controls this; default 6.
let boardMaxSegments = Math.max(2, Number(_bp.maxSegments) || 6)   // min 2 = two-party swap view (user 2026-07-12)
let boardOthersScrollOffset = 0   // index into the (player-grouped) others list — which window is showing
let boardFocusMode = false                     // ▶ spotlight toggle (session)

// BOARD-SUCCESS1 (placeholder — user 2026-07-11): once a tx we were watching
// mid-signing flips to a final SUCCESS/SIGNED status, boardDetectSigning()'s
// filter (!lifecycle.isFinalStatus) excludes it on the very next render, so the
// board silently reverts to negotiation mode — no beat where players see/
// celebrate the result. This is a stopgap: a blocking native alert() (exactly
// what was asked for as the placeholder — halts the screen until dismissed).
// Real design (confetti, a proper modal, and whether reverting to negotiation
// is even the right "next" — it may not be) is still open: see BOARD-UI1 /
// BOARD-GAMIFY1 for the follow-up task.
//
// v2 (same day): the first cut only tracked "seen mid-signing" in an
// in-memory Set, scoped to this page's lifetime — it silently never fires if
// the tx was signed via the external /m/sign/ page (a different tab) and the
// board tab is then freshly loaded/reloaded, because that fresh load never
// observed the tx mid-signing. Confirmed via kdiag this is exactly what
// happened on the first real test. Fixed: trigger off recency (parsed from
// the txid's own validStart timestamp) instead of same-session tracking, and
// persist acked txids to localStorage so it survives reloads without
// re-alerting on stale history.
const BOARD_SUCCESS_ACKED_KEY = "katomia_board_success_acked"
function boardLoadAckedTx(){
  try { return new Set(JSON.parse(localStorage.getItem(BOARD_SUCCESS_ACKED_KEY) || "[]")) }
  catch { return new Set() }
}
function boardSaveAckedTx(set){
  try { localStorage.setItem(BOARD_SUCCESS_ACKED_KEY, JSON.stringify([...set].slice(-50))) }
  catch {}
}
const boardSuccessAcked = boardLoadAckedTx()
const boardLoggedFinalTx = new Set()
// v3 (same day, real test): signed both required accounts from the board
// (2× board:sign:click/saved, confirmed in kdiag) and "everything disappeared"
// per the user — but board:tx-pending-final-seen NEVER fired across the whole
// test. So the v2 assumption is refuted by direct evidence: the backend does
// NOT leave a settled tx sitting in state.tx.pending with isFinalStatus true —
// the entry just vanishes from the array once it settles. New signal: track
// txids THIS TAB just successfully board:sign:saved; when one of those stops
// appearing among the still-mid-signing entries in pending, treat that as
// completion. Known limitation (documented, not solved): a failed/expired tx
// would ALSO vanish this way, so this can false-positive "complete" on a
// failure — acceptable for a placeholder that's actively being tested and
// will get noticed/reported; real completion needs the same threshold-solve
// SIGN-STATUSLANG1 already flagged as missing. Keeping the isFinalStatus path
// below too (cheap, harmless) in case it turns out to apply in some other
// flow (e.g. signed externally rather than via boardDirectSign).
const boardMySignedTx = new Map()   // txid -> ts, tracked from board:sign:saved

// v5 (user 2026-07-11, WRONG RESULT CAUGHT LIVE): v4's "settled record" check
// (state.players.*.orders.*.settled) reported a tx that /m/sign/ itself showed
// as comboStatus:"SUCCESS", thresholdSatisfied:true as "failed or expired" —
// confirmed via kdiag + the user cross-checking /m/sign/ directly. Root cause:
// that settled-record path (katomia-localdb's settledTxStubs()) is for the
// ORDER/MARKET-MATCH flow — proposal-mode board strikes never write into it at
// all, so it was ALWAYS going to report "not found" regardless of outcome.
//
// The user's own instinct was the fix: "I assume your WebSocket connected to
// the transaction we're watching for" — and there IS exactly that. The /m/sign/
// widget opens a PER-TRANSACTION socket (createTxSocket, websocket.js) separate
// from katomia's own game socket, subscribed to one txid, pushing tx_receipt
// (the real Hedera receipt status — authoritative, not guessed) and sig
// updates. Reused directly via dynamic import, same pattern as the signstatus
// pipeline above — one source of truth instead of a second, divergent guess.
// result celebration (user 2026-07-14): confetti on success; grey ash
// flecks as the failure PLACEHOLDER (the "burn / tear-down" idea is still
// open). v4 — SUCCESS now uses canvas-confetti, the kpay widget's recipe
// VERBATIM (vendor/kpay/kpool_widget/index.js triggerSuccessAnimation):
// three hand-rolled attempts (rain / two-stage burst / axis-split arc) all
// read wrong to the user; the widget's is the known-good reference. Only
// change: origin moved to the board's central hub (the K). useWorker keeps
// the animation running even while the result alert() blocks the main
// thread — which is also why the widget's version always looked smooth.
const BOARD_CONFETTI_CDN = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"
let _boardConfettiPromise = null
function boardLoadConfetti(){
  if(window.confetti) return Promise.resolve(window.confetti)
  return _boardConfettiPromise ||= new Promise(res => {
    const s = document.createElement("script")
    s.src = BOARD_CONFETTI_CDN
    s.onload = () => res(window.confetti || null)
    s.onerror = () => res(null)
    document.head.appendChild(s)
  })
}

async function boardCelebrate(ok){
  if(ok){
    const confetti = await boardLoadConfetti()
    if(!confetti?.create) return
    const hub = document.querySelector(".ring-hub")?.getBoundingClientRect()
    const origin = {
      x: hub ? (hub.left + hub.width / 2) / innerWidth : 0.5,
      y: hub ? (hub.top + hub.height / 2) / innerHeight : 0.5
    }
    const canvas = document.createElement("canvas")
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:2147483647;pointer-events:none"
    document.body.appendChild(canvas)
    const fire = confetti.create(canvas, { resize: true, useWorker: true })
    fire({ particleCount: 120, spread: 70, origin })
    setTimeout(() => fire({ particleCount: 80, spread: 100, origin }), 250)
    setTimeout(() => { fire.reset(); canvas.remove() }, 4250)
    return
  }
  // FAILURE: windscreen-wiper sweep (user 2026-07-15 — the earlier ash rain
  // "mixed the idea of a party with a failure"; this is the requested
  // placeholder: one of the wheel's spokes does a full 360°, wiping the
  // board clean, then the popup lands). A hub-centred disc with a thin
  // dark sector + fading trail painted by conic-gradient, one rotation.
  // FUTURE: style the wipe differently for expired vs failed; both may be
  // replaced by real tear-down animations down the line.
  const hub2 = document.querySelector(".ring-hub")?.getBoundingClientRect()
  const cx2 = hub2 ? hub2.left + hub2.width / 2 : innerWidth / 2
  const cy2 = hub2 ? hub2.top + hub2.height / 2 : innerHeight * 0.45
  const R = Math.hypot(Math.max(cx2, innerWidth - cx2), Math.max(cy2, innerHeight - cy2)) * 2
  const wiper = document.createElement("div")
  wiper.className = "board-wiper"
  wiper.style.width = wiper.style.height = R + "px"
  wiper.style.left = (cx2 - R / 2) + "px"
  wiper.style.top = (cy2 - R / 2) + "px"
  document.body.appendChild(wiper)
  setTimeout(() => wiper.remove(), 1600)
}

// ── top status banner (user 2026-07-15) ─────────────────────────────────────
// Sits over the darkened top of the board. Today: signing-mode status, the
// square consensus-status verdict (🟩/🟥 — SQUARE = Hedera consensus result,
// the ring's COLOURS stay the signing-status language), and the tap-to-offer
// hint. Placeholder seam for the sessions/proposal-recall flow (KAT-
// PROPRECALL1): this is where "exit signing mode" and the proposal switcher
// will live once that's designed — don't grow it ad-hoc past status text.
function boardSetBanner(html){
  let b = document.getElementById("boardBanner")
  if(!html){ b?.remove(); return }
  if(!b){
    b = document.createElement("div")
    b.id = "boardBanner"
    document.body.appendChild(b)
  }
  b.innerHTML = html
}

function boardUpdateBanner(){
  // SIGN-BOUNDARY1 (user 2026-08-04): the no-man's-land — past our idea of the
  // window's end but before the backend's verdict lands ("Expired?" grace). The
  // arc GREEN always means SIGNED, nothing else; in this uncertainty window every
  // signed green dims to DARK green ("the lights are going out, but it's still
  // green — you still signed"), fading the expectation of success without ever
  // un-saying the signature. Signing is NOT blocked here — if someone can still
  // sign, they may; the tint is the only cue. Toggled from this function because
  // it runs on every render AND every countdown tick, so the flip lands within a
  // second of crossing the boundary with no extra timer; CSS does the recolour
  // live on the already-painted arcs (see .ring-signarc--signed twilight rule).
  // SIGN-BOUNDARY1 R5 (user 2026-08-04): the no-man's-land starts 10s BEFORE
  // nominal expiry, not at it. Measured on both networks (SDK debug log, 16:21
  // UTC): nodes answer TRANSACTION_EXPIRED at INGEST once a tx has ~<=10s of
  // validity left (refused instantly with 8.6s and 4.6s remaining; accepted
  // cleanly at ~37s; borderline at ~10s) — the last ~10 seconds of every window
  // are dead on arrival at the node, so signatures landing there "keep failing
  // at the last minute" by rule, not coincidence. Signing stays enabled
  // throughout — dark green is a forecast, never a lock.
  const SIGN_NOMANSLAND_MS = 10_000
  const twilight = !!(boardSigning && boardSigning.expiry && Date.now() > boardSigning.expiry - SIGN_NOMANSLAND_MS)
  if(twilight) document.body.dataset.signtwilight = "1"
  else delete document.body.dataset.signtwilight
  if(boardSigning){
    const txid = boardSigning.tx?.txid || ""
    const txSpan = txid ? ` · <span class="board-banner-tx">${txid}</span>` : ""
    // KATOMIA-VALIDDUR1 (user 2026-07-15): txDelaySeconds delays a struck
    // tx's own validStart into the future — it sits in pending, but a
    // consensus node won't accept it yet. Distinct stage from "waiting for
    // signatures" (signing can still happen early; SUBMISSION is what's
    // gated). Re-renders naturally flip this to the signing-mode banner
    // once Date.now() crosses validStartMs — no separate timer needed, this
    // runs every render alongside everything else.
    // MESSAGING ALIGNMENT (user 2026-07-15): the whole spotlit phase is
    // "signing mode"; the banner narrates the SUBMISSION lifecycle within
    // it, using the same state language as the signing widget's own
    // getTxValidityStatus labels ('Waiting...', 'Ready to submit..',
    // 'Expired?') rather than a second vocabulary:
    //   waiting to submit → ready to submit (collecting signatures) →
    //   expired? (grace) → verdict toast (🟩/🟥).
    if(boardSigning.validStartMs && Date.now() < boardSigning.validStartMs){
      boardSetBanner("⏳ Waiting to submit — opens in " +
        Math.ceil((boardSigning.validStartMs - Date.now()) / 1000) + "s" + txSpan)
      return
    }
    // grace limbo: countdown done but the backend hasn't ruled yet —
    // mirror its own 'Expired?' label rather than sitting mute.
    if(boardSigning.expiry && Date.now() > boardSigning.expiry){
      boardSetBanner("⌛ Expired? — confirming with the network" + txSpan)
      return
    }
    boardSetBanner("✍ Ready to submit — collecting signatures" + txSpan)
    return
  }
  if(typeof selectedAssetId !== "undefined" && selectedAssetId){
    boardSetBanner("👆 Tap a player's segment to offer it there — tap the chip again to cancel")
    return
  }
  boardSetBanner(null)
}

// S5 / rule 6 (user: "some very subtle visual cue as to how that success was
// reported, whether it came through mirror node or WebSocket"): one glyph,
// appended to the verdict text. ⚡ receipt pushed on the per-tx socket ·
// ⛓ asked the chain (mirror node) · 🛰 backend game-state broadcast.
const BOARD_PROVENANCE_GLYPH = { socket: "⚡", mirror: "⛓", "backend-state": "🛰" }

function boardShowResult(txid, ok, tier, source){
  if(boardSuccessAcked.has(txid)) return
  boardSuccessAcked.add(txid)
  boardSaveAckedTx(boardSuccessAcked)
  boardDiag("board:result:shown", { txid, ok, ...(tier ? { tier } : {}), ...(source ? { source } : {}) })
  const prov = BOARD_PROVENANCE_GLYPH[source] ? ` ${BOARD_PROVENANCE_GLYPH[source]}` : ""
  // read by the wipe branch below (~4442) so the spotlight lift can match
  // whichever celebration is actually playing — confetti (~4.25s) on
  // success vs the wiper sweep (~1.5s) on failure, instead of always using
  // the wiper's shorter timing and dousing the spotlight mid-confetti.
  window.__boardLastResultOk = ok
  // S3 / rule 5 (D4: quiet): a STALE verdict — the user has moved on, or the tx
  // left pending >5s ago — keeps the toast/feed entry below but plays NO
  // full-board animation: no wiper sweeping a board that is showing a
  // different trade, no confetti for a trade nobody is looking at.
  if(tier !== "stale"){
    boardCelebrate(ok)
    // BOARD-SWEEPWIN1 R2: capture SYNCHRONOUSLY — R1 delayed the whole call 700ms, by
    // which time the settle broadcast had already re-painted the board and the txchips
    // were gone, so there was nothing to fly (user: "just seeing the confetti"). Now the
    // clones are taken this instant (they stand in for the wiped chips through the
    // confetti beat) and only the MOVEMENT waits 700ms.
    if(ok) boardSettleFlights()
  }
  // PERSISTENT, CLOSABLE TOAST (user 2026-07-15): the verdict used to be a
  // banner bubble + a blocking alert(); now it's a toast that stays until
  // the user closes it (timeout 0 = persistent, ✕ per GM-TOAST-X1) — the
  // format the user wants to grow into progress-status messaging generally.
  // Squares = Hedera consensus status (ring colours stay signing status).
  // The alert() is gone: the wiper/confetti + toast carry the moment, and
  // the real result MODAL (Try again etc.) is KAT-PROPRECALL1's design.
  try {
    // BOARD-TOASTLINK1 (user 2026-07-16, re-raised 2026-07-30 after a mainnet HashPack
    // test: "the success toast shows the transaction id, which is correct — it should also
    // link"). Success only: an expired or failed transaction was never submitted, so there
    // is nothing on HashScan to link TO and the link would 404 on the unhappy path.
    // HashScan takes the native 0.0.x@secs.nanos id; encode it, the @ and . are not safe.
    // (The green tick AND green square together is deliberate for now — the tick is the
    // toast type icon, the square is Hedera consensus status. User said leave it.)
    // BOARD-TOASTLINK2 (user 2026-08-01): the txid IS the link — the separate
    // "View on HashScan" text was clutter. The txid rides as link.text (a real
    // element, textContent — the no-markup-in-message rule holds); on the
    // unhappy path there is no link so the txid stays in the message. Explicit
    // opts.key: with the txid out of the success message, two different
    // successes would otherwise coalesce into one toast.
    const net = window.__katomiaNetwork
    const link = (ok && txid && (net === "mainnet" || net === "testnet"))
      ? { href: `https://hashscan.io/${net}/transaction/${encodeURIComponent(txid)}`,
          text: `${txid} ↗` }
      : null
    // BOARD-CHATMODE1 R3 (user 2026-08-03): with the message panel on (the default),
    // the verdict lives IN THE STREAM as a Katomia system entry — the toast version
    // wrapped awkwardly and duplicates what the stream carries better. Bubbles mode
    // keeps the TOASTLINK2 toast (txid as the HashScan link, wrap via detail).
    if(typeof boardChatMode !== "undefined" && boardChatMode === "panel" && window.katomiaChat?.system)
      window.katomiaChat.system(
        // EMOJI SEMANTICS (user 2026-08-03): ✅ tick = consensus reached; an expired/
        // failed tx never made the chain, so NO square there — ⌛. The txid itself is
        // the clickable link (linkText), not a tiny arrow after it.
        ok ? `✅ Transaction successful${prov}` : `⌛ Transaction failed or expired${prov} · ${txid}`,
        { link: link?.href || null, linkText: ok ? txid : null })
    else
      notify(ok ? `🟩 Transaction successful${prov}` : `🟥 Transaction failed or expired${prov}`,
        ok ? "success" : "error",
        { timeout: 0, link, key: `txresult:${txid}`, ...(link ? {} : { detail: txid }) })
  } catch {}
}

// TXSTATUS-CONSOLIDATE1 S1: verdicts now flow reporter → katomiaTxStatus →
// this subscriber → boardShowResult. Reporters call boardReportTx instead of
// boardShowResult directly; the fallback keeps the old direct path if the
// controller script ever fails to load. Behaviour-identical at this stage.
const boardReportTx = (txid, ok, source, detail) =>
  window.katomiaTxStatus
    ? window.katomiaTxStatus.report(txid, { source, kind: ok ? "success" : "failure", detail })
    : boardShowResult(txid, ok)
// S2: attempt-level negatives (watchdog nudges, KWC error toasts) also go via
// the controller — they get the settle window and are dropped once their txid
// is terminal (rule 3; this is what killed the 08:11 ghost-toast sequence).
// The toast copy stays board-owned: it rides in detail, the controller never
// composes user-facing text.
const boardReportTxAdvice = (txid, source, d) =>
  window.katomiaTxStatus
    ? window.katomiaTxStatus.report(txid, { source, kind: "advice", detail: d })
    : notify(d.message, d.level || "warning", { timeout: d.timeout ?? 6000 })
window.katomiaTxStatus?.subscribe(ev => {
  if(ev.type === "verdict") boardShowResult(ev.txid, ev.ok, ev.tier, ev.source)
  // advice toasts carry their txid as detail text — every message names its tx
  else if(ev.type === "advice" && ev.detail?.message)
    notify(ev.detail.message, ev.detail.level || "warning", { timeout: ev.detail.timeout ?? 6000, detail: ev.txid })
})

let _boardTxSocket = null
let _boardTxSocketId = null
// S3 / D3 (user 2026-08-07): 45s → 12s. BOARD-TXTRUTH1's guarantee is "never
// declare failure before the chain has had a fair chance", not "wait 45s" —
// mirror ingest lag is a few seconds, so 12s past expiry preserves the
// guarantee while removing most of the measured 57-62s verdict lateness.
const BOARD_NO_RECEIPT_MS = 12000   // honest timeout: "unresolved", never a confident false failure guess

// TXSTATUS-CONSOLIDATE1 S3: the mirror-node confirm loop, extracted from the
// vanish branch so it can ALSO be armed at expiry+2s (boardEnsureTxSocket) —
// the backend takes ~10-13s to drop an expired tx from pending, and waiting
// for that drop before even STARTING the confirm re-added the lag on top of
// the 12s grace (measured 19-25s verdicts with a 12s window). Same giveUpAt,
// same never-guess rule, earlier start; one confirm loop per txid per page.
const _boardConfirming = new Set()
function boardConfirmTxFromChain(txid, expiryMs){
  if(_boardConfirming.has(txid) || boardSuccessAcked.has(txid)) return
  _boardConfirming.add(txid)
  const _net = window.__katomiaNetwork || "mainnet"
  const _mirror = _net === "mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : `https://${_net}.mirrornode.hedera.com`
  // 0.0.x@sec.nanos → 0.0.x-sec-nanos (mirror's path form). Split on "@" first:
  // a blanket .replace(".","-") corrupts the ACCOUNT's dots (0.0.x → 0-0.x) and
  // every lookup 404s, which would silently reinstate the exact false-failure
  // bug this code exists to kill. Only the sec/nanos separator changes.
  const _mirrorId = (() => {
    const [acct, stamp] = String(txid).split("@")
    return stamp ? `${acct}-${stamp.replace(".", "-")}` : String(txid)
  })()
  // Mirror ingest lags consensus by a few seconds, so absence is only
  // meaningful AFTER expiry + grace — never treat an early 404 as failure.
  // Anchored to the tx's OWN expiry; short floor so very-late detection
  // still gets ≥2 mirror polls before declaring.
  const giveUpAt = Math.max(Date.now() + 4000, (expiryMs || Date.now()) + BOARD_NO_RECEIPT_MS)
  const confirmFromChain = async () => {
    if(boardSuccessAcked.has(txid)) return
    let onChain = null
    try {
      const r = await fetch(`${_mirror}/api/v1/transactions/${_mirrorId}`, { cache: "no-store" })
      if(r.ok){
        const j = await r.json()
        const t = (j.transactions || [])[0]
        if(t?.result) onChain = t.result
      }
    } catch(e){ /* network hiccup — indistinguishable from "not yet", so retry */ }
    if(onChain){
      const ok = onChain === "SUCCESS"
      boardDiag("board:result:chain-confirmed", { txid, result: onChain, ok })
      boardReportTx(txid, ok, "mirror", { result: onChain })
      return
    }
    if(Date.now() < giveUpAt){
      setTimeout(confirmFromChain, 2000)
      return
    }
    // Genuinely absent from the chain well past expiry → it really did not land.
    boardDiag("board:result:vanished-from-pending", { txid, chainChecked: true })
    boardReportTx(txid, false, "mirror", { chainChecked: true })
  }
  setTimeout(confirmFromChain, 500)
}

function boardHandleTxUpdate(txid, update){
  const receiptStatus = update?.receipt ? (update.receipt.status?._code || update.receipt.status || null) : null
  boardDiag("board:txsocket:update", { txid, type: update?.type, hasReceipt: !!update?.receipt, hasSigs: !!update?.sigs, status: receiptStatus })
  if(update?.type === "tx_receipt" && update.receipt){
    boardReportTx(txid, receiptStatus === "SUCCESS", "socket", { status: receiptStatus })
  }
  if(update?.sigs) boardRefreshSignStatus()   // event-driven — don't wait for the poll tick
}

// S6 / D2 (user 2026-08-07): reconnect lives HERE, the vendor websocket.js
// stays untouched (shared with the kpool widget). Correctness no longer
// depends on this socket (BOARD-TXTRUTH1 asks the chain) but every drop cost
// a mirror round-trip and up to the full absence window — the 07:48 double
// spend started exactly this way. Backoff 1s·2·4·8 capped at 10s; stops when
// this txid is superseded or terminal. Re-subscribe is free: the vendor's own
// open handler always sends the subscribe frame.
async function boardCreateTxSocket(txid){
  const { createTxSocket } = await import("/vendor/kpay/kpool_widget/websocket.js")
  let closed = false, attempt = 0
  const wrapper = { socket: null, close(){ closed = true; try { wrapper.socket?.close() } catch {} } }
  const open = () => {
    if(closed) return
    const s = createTxSocket({ baseUrl: window.CONFIG?.HAPI_BASE || "", txid,
      onTxUpdate: update => boardHandleTxUpdate(txid, update) })
    wrapper.socket = s
    s.addEventListener("open", () => { attempt = 0 })
    s.addEventListener("close", () => {
      if(closed || _boardTxSocketId !== txid || boardSuccessAcked.has(txid)) return
      const delay = Math.min(1000 * 2 ** attempt++, 10_000)
      boardDiag("board:txsocket:reconnect", { txid, attempt, delayMs: delay })
      setTimeout(open, delay)
    })
  }
  open()
  return wrapper
}

// One socket per txid entering the signing phase; torn down when it leaves.
// Runs alongside boardEnsureSignStatusPoll (poll is now just a safety net —
// the socket is primary, matching how the widget itself is documented: "WS is
// primary, polling is only the fallback").
function boardEnsureTxSocket(){
  const txid = boardSigning?.tx?.txid || null
  if(txid === _boardTxSocketId) return
  if(_boardTxSocket){ try { _boardTxSocket.close() } catch {} ; _boardTxSocket = null }
  _boardTxSocketId = txid
  if(!txid || boardSuccessAcked.has(txid)) return
  // TXSTATUS-CONSOLIDATE1 S1: register the tx with the controller as it enters
  // signing — expiry comes from the backend's boardSigning, never guessed.
  window.katomiaTxStatus?.watch(txid, { network: window.__katomiaNetwork || null, expiry: boardSigning?.expiry || null })
  // preload the confetti lib now, while signing is underway — at result time
  // the burst then fires synchronously, before the alert() blocks the thread
  boardLoadConfetti()
  // EXPIRY VERDICT: no longer a client-side timer guess (removed 2026-07-15 —
  // see BOARD_TX_EXPIRY_MS below for why). renderRingBoard's vanish-from-
  // pending watch is now the only source of an expiry/failure verdict.
  ;(async () => {
    try {
      const sock = await boardCreateTxSocket(txid)
      if(_boardTxSocketId !== txid){ sock.close(); return }   // superseded while the import was in flight
      _boardTxSocket = sock
      boardDiag("board:txsocket:open", { txid })
      // honest fallback: if the grace passes with no receipt push at all (socket
      // down, backend hiccup), say so — do NOT guess success or failure
      setTimeout(() => {
        if(_boardTxSocketId === txid && !boardSuccessAcked.has(txid)){
          boardDiag("board:txsocket:no-receipt", { txid })
        }
      }, BOARD_NO_RECEIPT_MS)
      // S3: start the chain confirm at expiry+2s WITHOUT waiting for the tx to
      // vanish from pending (backend drop lag is ~10-13s; the banner has said
      // "Expired? — confirming with the network" since 07-15 — now it's true).
      // Skipped if the tx settled (acked) or was superseded (_boardTxSocketId
      // moved on — the vanish branch owns the old tx then). Same giveUpAt.
      const _exp = boardSigning?.expiry || 0
      if(_exp) setTimeout(() => {
        if(_boardTxSocketId === txid && !boardSuccessAcked.has(txid)) boardConfirmTxFromChain(txid, _exp)
      }, Math.max(0, _exp - Date.now()) + 2000)
    } catch(e){
      boardDiag("board:txsocket:error", { txid, error: String(e) })
    }
  })()
}

function boardCheckJustSucceeded(){
  const pending = state?.tx?.pending || []
  const stillSigning = new Set(pending.filter(t => !t?.lifecycle?.isFinalStatus).map(t => t?.txid).filter(Boolean))

  pending.forEach(t => {
    if(t?.txid && t.lifecycle?.isFinalStatus && !boardLoggedFinalTx.has(t.txid)){
      boardLoggedFinalTx.add(t.txid)
      boardDiag("board:tx-pending-final-seen", { txid: t.txid, status: t.lifecycle?.status, pendingCount: pending.length })
    }
  })

  // if a final status DOES ever land in pending, trust it directly (kept as a
  // cheap secondary path; boardEnsureTxSocket's tx_receipt push is primary)
  pending.forEach(t => {
    if(!t?.txid || boardSuccessAcked.has(t.txid)) return
    const st = String(t.lifecycle?.status || "").toUpperCase()
    if(!t.lifecycle?.isFinalStatus) return
    const vs = Number(String(t.txid).split("@")[1]?.split(".")[0]) * 1000
    if(!vs || Date.now() - vs > 5 * 60 * 1000) return   // recent only — don't resurrect old history on reload
    if(st === "SUCCESS" || st === "SIGNED") boardReportTx(t.txid, true, "backend-state", { status: st })
    else if(/FAIL|ERROR|EXPIRE|INVALID/.test(st)) boardReportTx(t.txid, false, "backend-state", { status: st })
  })

  // diagnostic only now. The expiry/failure VERDICT used to be a client-side
  // timer guessed off this map (removed 2026-07-15 — three independently-
  // guessed deadlines here, in the countdown display, and the real backend
  // resolution all disagreed, "async expiries" per the user). Verdicts are
  // now purely SIGNAL-driven off boardSigning actually disappearing — see
  // renderRingBoard, right after boardSigning = boardDetectSigning().
  boardMySignedTx.forEach((ts, txid) => {
    if(stillSigning.has(txid)) return
    boardMySignedTx.delete(txid)
    boardDiag("board:mysigned:vanished-from-pending", { txid })
  })
}

// dev control (footer): the layout's start angle — segments begin here and run
// clockwise. 180 = the first account's segment straddles 9 o'clock. Editable
// to explore how different rotations render; not a user-facing feature.
let boardStartAngle = 180

{
  const sel = document.getElementById("boardSkinSelect")
  if(sel){
    sel.value = boardSkin
    sel.onchange = e => {
      boardSkin = e.target.value
      const u = new URL(location)
      u.searchParams.set("skin", boardSkin)
      history.replaceState(null, "", u)
      boardSavePrefs()
      render()
    }
  }
}

// BOARD-HEADERINT1: populates + wires the rest of the board-only Preferences
// section now living in profile-modal.php (KATOMIA_BOARD_CONTEXT), replacing
// the ⚙ popover this file used to build itself on every render(). Since the
// controls are now static server-rendered markup (not rebuilt each render),
// syncing on load + on profile-open covers it — no per-render cost needed.
// katomia-profile.js calls this by name if it exists (same optional-hook
// pattern as katomiaAuthOnProfileOpen) whenever the profile modal opens.
// ── BOARD-VIEWSWITCH1 (user 2026-08-06) ─────────────────────────────────────
// Board / Split / Messages, straight off the hamburger. These were already
// three real states, just reachable in two steps through different doors
// (Settings → Message panel for the split; a menu item + Close for the
// stream). One tap each now; the current one carries a ✓.
//   board    = no dock, board owns the viewport (bubbles still float on it)
//   split    = docked panel, draggable divider (BOARD-SPLITDRAG1)
//   messages = full-screen stream over the board
// Not persisted beyond the existing chatMode pref, deliberately: the user
// wants a different view per DEVICE, and chatMode is already per-device.
function boardCurrentView(){
  if(document.body.classList.contains("kchat-fullopen")) return "messages"
  return boardChatMode === "panel" ? "split" : "board"
}

function boardSetView(mode){
  if(mode === "messages"){ window.katomiaChat?.openFull?.(true); boardMarkView(); return }
  window.katomiaChat?.openFull?.(false)
  boardChatMode = mode === "split" ? "panel" : "bubbles"
  boardSavePrefs()
  window.katomiaChat?.setMode?.(boardChatMode)
  // (no ⚙ Settings checkbox to sync any more — the Message panel alias was removed
  // 2026-08-17, KATUI3 feedback pass; the View row is the one control)
  boardMarkView()
  // close the menu — it sits over the board you just switched to. (The messages
  // view closes it via openFull already; this covers board/split.)
  document.getElementById("appMenu")?.classList.add("hidden")
  document.getElementById("appMenuBtn")?.setAttribute("aria-expanded", "false")
}

function boardMarkView(){
  const cur = boardCurrentView()
  document.querySelectorAll("[data-menu-view]").forEach(b => {
    b.classList.toggle("app-menu-viewbtn--on", b.dataset.menuView === cur)
  })
}

if(!window.__boardViewSwitchInit){
  window.__boardViewSwitchInit = true
  document.addEventListener("click", e => {
    const b = e.target.closest?.("[data-menu-view]")
    if(!b) return
    e.preventDefault()
    boardSetView(b.dataset.menuView)
  })
  // the hamburger opening is the moment the ✓ has to be right
  document.addEventListener("click", e => {
    if(e.target.closest?.("#appMenuBtn")) setTimeout(boardMarkView, 0)
  })
  document.addEventListener("DOMContentLoaded", boardMarkView)
}

function boardSyncPrefsUI(){
  // (BOARD-CHATMODE1's ⚙ Message panel checkbox removed 2026-08-17 — it duplicated
  // the hamburger View row, BOARD-VIEWSWITCH1; boardSetView owns chatMode now)
  // DEMO-NARRATE1 placement experiment: R3 arc (default) vs R2 spoke
  const avSpoke = document.getElementById("boardPrefAvatarSpoke")
  if(avSpoke){
    avSpoke.checked = boardAvatarPos === "spoke"
    avSpoke.onchange = () => { boardAvatarPos = avSpoke.checked ? "spoke" : "arc"; boardSavePrefs(); render() }
  }
  const net = document.getElementById("boardPrefNet")
  if(net){
    net.checked = boardNetView
    net.onchange = () => { boardNetView = net.checked; boardSavePrefs(); render() }
  }
  const selfBottom = document.getElementById("boardPrefSelfBottom")
  if(selfBottom){
    selfBottom.checked = boardSelfBottom
    selfBottom.onchange = () => {
      boardSelfBottom = selfBottom.checked
      _boardAnimateNextRotation = true
      boardSavePrefs()
      render()
    }
  }
  const maxSeg = document.getElementById("boardPrefMaxSeg")
  if(maxSeg){
    maxSeg.value = boardMaxSegments
    maxSeg.onchange = () => {
      const v = Math.max(2, Math.min(24, Number(maxSeg.value) || 6))
      maxSeg.value = v
      boardMaxSegments = v
      boardOthersScrollOffset = 0
      boardClearTrails()   // the whole layout reshuffles — drawn trails go stale
      boardSavePrefs()
      render()
    }
  }
  const animSpeed = document.getElementById("boardPrefAnimSpeed")
  if(animSpeed){
    animSpeed.value = String(boardAnimSpeed)
    if(animSpeed.selectedIndex < 0) animSpeed.value = "1"
    animSpeed.onchange = () => { boardAnimSpeed = Number(animSpeed.value) || 1; boardSavePrefs() }
  }
  const chipScaleSel = document.getElementById("boardPrefChipScale")
  if(chipScaleSel){
    chipScaleSel.value = String(boardChipScale)
    if(chipScaleSel.selectedIndex < 0) chipScaleSel.value = "1"
    chipScaleSel.onchange = () => {
      boardChipScale = Number(chipScaleSel.value) || 1
      boardSavePrefs()
      // deliberately NOT applied here — render → boardOrganicApply applies the
      // var, re-measures every chip at the new size and re-excites the sim
      // (applying early would skip that stale-size sweep)
      render()
    }
  }
  // BOARD-UISIZE1: Small / Normal / Large — global (localStorage, html
  // .ksize-* class), not a board pref; chips re-measure via the same render
  // path as the nerd chip-size knob, text surfaces follow --ui-scale in CSS
  const uiSizeSel = document.getElementById("boardPrefUiSize")
  if(uiSizeSel){
    uiSizeSel.value = boardUiSize
    if(uiSizeSel.selectedIndex < 0) uiSizeSel.value = "normal"
    uiSizeSel.onchange = () => {
      boardUiSize = ["small", "large"].includes(uiSizeSel.value) ? uiSizeSel.value : "normal"
      try { localStorage.setItem(UISIZE_KEY, boardUiSize) } catch {}
      const html = document.documentElement
      html.classList.remove("ksize-small", "ksize-normal", "ksize-large")
      html.classList.add("ksize-" + boardUiSize)
      boardDiag("board:pref:uiSize", { value: boardUiSize })
      render()
    }
  }
  const trailRes = document.getElementById("boardPrefTrailResidual")
  if(trailRes){
    trailRes.value = String(boardTrailResidual)
    if(trailRes.selectedIndex < 0) trailRes.value = "0.5"
    trailRes.onchange = () => { boardTrailResidual = Number(trailRes.value) || 0; boardSavePrefs() }
  }
  const layout = document.getElementById("boardPrefLayout")
  if(layout){
    layout.value = boardLayoutMode
    layout.onchange = e => {
      // pickable-scatter round 2 forensics (2026-07-15): the kdiag trace
      // showed the scatter was THIS handler firing (mode organic→shelves,
      // 456-794px drift as the FLIP glide re-arranged every chip) seconds
      // after page load — NOT the pickable toggle itself, whose class-churn
      // fix is holding (drift 0 everywhere else). Unknown who fired it: the
      // user, or Chrome form-state restore desyncing the select from the
      // variable. isTrusted + old/new in the diag settles it next repro;
      // autocomplete=off on the panel (header.php) kills the restore path.
      boardDiag("board:layout:change", { from: boardLayoutMode, to: layout.value, isTrusted: !!e?.isTrusted })
      boardLayoutMode = layout.value === "organic" ? "organic" : "shelves"
      boardClearTrails()   // full reshuffle — drawn trails go stale
      boardSavePrefs()
      render()             // FLIP glides every chip to its new arrangement
    }
  }
  const zoneWalls = document.getElementById("boardPrefZoneWalls")
  if(zoneWalls){
    zoneWalls.checked = boardZoneWalls
    zoneWalls.onchange = () => { boardZoneWalls = zoneWalls.checked; boardSavePrefs(); render() }
  }
  const hugRing = document.getElementById("boardPrefHugRing")
  if(hugRing){
    hugRing.checked = boardHugRing
    hugRing.onchange = () => {
      boardHugRing = hugRing.checked
      boardSavePrefs()
      boardSimExcite()   // the anchor moved — wake the sim so blobs re-home
      render()
    }
  }
  // BOARD-AUTOARRANGE1: normal-mode player preference — tidy chips vs stack them
  // freely. Turning it back ON re-excites the sim so the board tidies immediately
  // rather than at the next unrelated change (the same "wake it up" move the hug-ring
  // toggle makes); turning it off just stops the tidying, nothing needs to move.
  const autoArrange = document.getElementById("boardPrefAutoArrange")
  if(autoArrange){
    autoArrange.checked = boardAutoArrange
    autoArrange.onchange = () => {
      boardAutoArrange = autoArrange.checked
      boardSavePrefs()
      if(boardAutoArrange) boardSimExcite()
    }
  }
  const sticky = document.getElementById("boardPrefSticky")
  if(sticky){
    sticky.checked = boardStickyChips
    sticky.onchange = () => {
      boardStickyChips = sticky.checked
      if(boardStickyChips)
        _boardSimBodies.forEach(b => { b.stick = true })    // freeze the board as it stands
      else {
        _boardSimBodies.forEach(b => { b.stick = false })
        boardSimExcite()                                    // let the layout relax again
      }
      boardSavePrefs()
    }
  }
  // BOARD-CHIPART1: chip face variant (plain / colour / dark)
  const chipStyle = document.getElementById("boardPrefChipStyle")
  if(chipStyle){
    chipStyle.value = boardChipStyle
    if(chipStyle.selectedIndex < 0) chipStyle.value = "plain"
    chipStyle.onchange = () => {
      boardChipStyle = chipStyle.value
      boardDiag("board:pref:chipStyle", { value: boardChipStyle })
      boardSavePrefs()
      // sizes change with the padding/tag width — let the apply re-measure
      render()
    }
  }
  // BOARD-COUNTERMODE1: classic counter (ring + ghost pile) ⇄ simple (default)
  const classicCounter = document.getElementById("boardPrefClassicCounter")
  if(classicCounter){
    classicCounter.checked = boardCounterMode === "classic"
    classicCounter.onchange = () => {
      boardCounterMode = classicCounter.checked ? "classic" : "simple"
      boardDiag("board:pref:counterMode", { value: boardCounterMode })
      boardClearTrails()   // pile/ghost anchors all move — drawn trails go stale
      boardSavePrefs()
      render()
    }
  }
  const partyOnly = document.getElementById("boardPrefPartyOnly")
  if(partyOnly){
    partyOnly.checked = boardPartyOnly
    partyOnly.onchange = () => boardTogglePartyOnly(partyOnly.checked)   // animated collapse/expand of non-party segments
  }
  const pickable = document.getElementById("boardPrefPickable")
  if(pickable){
    const myPrefs = state?.players?.[currentPlayerId]?.prefs || {}
    pickable.checked = !!myPrefs.allowPick
    pickable.onchange = () => {
      boardDiag("board:pref:pickable", { value: pickable.checked })
      socket.send(JSON.stringify({ type: "game_setPref", gameId, key: "allowPick", value: pickable.checked }))
    }
  }
}
boardSyncPrefsUI()

document.addEventListener("dragend", () => { window.__boardDragPayload = null })

let _boardResizeT = null
window.addEventListener("resize", () => {
  clearTimeout(_boardResizeT)
  _boardResizeT = setTimeout(() => render(), 150)
})

/* ── render() override ──────────────────────────────────────────────────── */

async function render(){
  if(!state) return

  // ── BOARD-DRAGREPAINT1 R2 (user 2026-08-06) ────────────────────────────────
  // "If I drag slowly on DESKTOP, the whole screen is blank until I let go, and
  // it flickers even on mobile as well."
  //
  // The blanking is not a rasterisation problem — it is this function. render()
  // tears the board's DOM down and rebuilds it, and the broadcast handler runs it
  // TWICE per state (once immediately, once after enrichment). On a live board
  // that is several full rebuilds a second; catch one mid-frame and the screen is
  // genuinely empty, which is exactly what "blank until I let go" describes.
  //
  // BOARD-DRAGFLICKER1 already had the right idea but guarded only ONE call site
  // (the broadcast handler in katomia-network.js) and only for TOUCH drags. So:
  //  · desktop native dnd never set the flag at all — hence "blank on desktop",
  //    which the rAF work in R1 could not have helped, because desktop never runs
  //    that handler. The flag is now set from the document-level dragstart /
  //    dragend pair as well.
  //  · renders driven by anything OTHER than a broadcast — the 550ms member
  //    animation, wheel glide, curate toggles — walked straight past the guard.
  //    Hence the residual mobile flicker.
  // Moving the hold INTO render() covers every caller by construction, which is
  // the only version of this that can't be bypassed by the next new caller.
  // Nothing is lost by deferring: a drag changes no board state, the flying chip
  // is a clone, and the release runs exactly one repaint with the latest state.
  // WATCHDOG: a hold that never lifts would freeze the board permanently, which
  // is a far worse failure than the flicker it prevents. A drag that has been
  // "live" for more than 12s is a lost dragend/pointercancel, not a drag.
  if(window.__boardDragging && Date.now() - (window.__boardDragSince || 0) > 12000){
    window.__boardDragging = false
    document.body.classList.remove("board-dragging")
    boardDiag("board:drag:hold-expired", {})
  }
  if(window.__boardDragging){ window.__boardRenderPending = true; return }

  // KATUI3 R2 (user 2026-08-17, mobile): the profile modal covers the board, yet a
  // live board (bots trading) kept full-rebuild rendering behind it — on a phone
  // that saturates the main thread and the modal's ✕ tap queues for SECONDS. Same
  // defer/catch-up as the drag hold above; window.boardModalHold() (below, by
  // boardEnterDrag) flips it and runs the one catch-up repaint on release.
  // Self-healing in place of a watchdog: the hold is only honoured while the modal
  // is actually open, so a lost release can never freeze the board.
  if(window.__boardModalHold){
    if(document.getElementById("profileModal")?.classList.contains("hidden") !== false)
      window.__boardModalHold = false
    else { window.__boardRenderPending = true; return }
  }

  boardCheckJustSucceeded()

  document.body.dataset.viewMode = "board"
  document.body.dataset.boardSkin = boardSkin
  // family tokens: CSS matches [data-board-fam~="v8"] etc. — new skins join
  // families here instead of every selector list growing another entry
  document.body.dataset.boardFam = [
    ring8() && "v8", ring9() && "v9", ring10() && "v10", ring11() && "v11",
    ring12() && "v12", ring13() && "v13", ring14() && "v14", ring15() && "v15", ring16() && "v16",
    susan2() && "susan2p", susan3() && "susan3p", susan4() && "susan4p",
    susan5() && "susan5p",
  ].filter(Boolean).join(" ")
  document.body.dataset.chipStyle = boardChipStyle   // BOARD-CHIPART1 variant under comparison
  // (chip-emboss body class gone — pref retired 2026-08-17, nothing sets it now)
  if(gameMeta?.network)
    document.body.dataset.network = gameMeta.network.toLowerCase()

  // stuck pair line (review 9): mouseleave never fires when the hovered chip
  // is re-rendered away — clear the hover line on every paint
  try { clearTradeLine() } catch {}

  renderBoard()

  // BOARD-CHAT1: after the board paints, so _boardChatAnchors is fresh. Guarded —
  // katomia-chat.js is only loaded on the board page.
  try { window.boardRenderChat?.() } catch(e){ console.warn("[chat] render failed", e) }

  // BOARD-SWEEPWIN1 R2: while a tx is signing, remember where the txchips sit (after
  // the organic sim has settled them) so the success flights survive the settle
  // broadcast wiping the DOM before the receipt arrives.
  if(boardSigning) setTimeout(boardSnapTxChips, 600)

  // renderBoard() (via renderRingBoard) has just recomputed boardSigning —
  // start/stop the per-account signing-status poll (SIGN-STATUSLANG1) and the
  // per-tx result socket (BOARD-SUCCESS1) to match
  boardEnsureSignStatusPoll()
  boardEnsureTxSocket()

  // review 9: a chip whose text wraps kept its pre-wrap width — dead
  // right-padding. Shrink wrapped text chips to their actual line extents.
  if(ring9()) boardTightenChips()
}

// shrink-to-wrapped-text: walk the rendered line boxes via Range rects and
// cap the chip's width at the widest actual line (plus its own padding)
function boardTightenChips(){
  document.querySelectorAll(".board-chip:not(.thumb-only)").forEach(el => {
    if(!el.firstChild || el.firstChild.nodeType !== 3) return
    const range = document.createRange()
    range.selectNodeContents(el)
    const rects = [...range.getClientRects()]
    if(rects.length < 2) return                       // single line — leave it
    const widest = Math.max(...rects.map(r => r.width))
    const cs = getComputedStyle(el)
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      + parseFloat(cs.borderLeftWidth || 0)
    el.style.width = Math.ceil(widest + pad + 1) + "px"
  })
}

// BOARD-BRANDMARK1 (user 2026-07-31): the KATOMIA wordmark, etched into the
// felt under the chips — the banner h2 (wordmark + 💱🐫) is hidden on board
// pages (CSS), so each board renderer appends this instead. Non-interactive
// on purpose: the action plays over it; 🏠 Home lives in the hamburger.
function boardBrandmark(){
  const brand = document.createElement("div")
  brand.className = "board-brandmark"
  // R2 (user 2026-08-03): "Katomia" — capital K only — and small (hamburger-height);
  // the darkening treatment lives in the CSS.
  brand.textContent = "Katomia"
  return brand
}

function renderBoard(){

  const root = document.getElementById("boardRoot")
  if(!root) return

  if(susan()){
    renderSusanBoard(root)
    return
  }

  if(boardSkin.startsWith("ring")){
    renderRingBoard(root)
    return
  }

  const accounts = getVisibleAccounts(getAccounts())
  const accountMap = getAccountMap()
  const reservedByAccount = boardReserved(accounts)   // SIGN-GHOSTPREVIEW1: signing-phase ghosts merged in

  const mine = accounts.filter(a => isMyAccount(a))
  const others = accounts.filter(a => !isMyAccount(a))

  const W = root.clientWidth, H = root.clientHeight
  const geo = { W, H, cx: W / 2, cy: H * 0.42 }

  const frag = document.createDocumentFragment()

  // seats fan across the top arc, spreading with player count; 270° = top
  const n = others.length
  if(n){
    const span = Math.min(240, Math.max(100, n * 64))
    const start = 270 - span / 2

    others.forEach((account, i) => {
      const a0 = start + i * span / n
      const a1 = start + (i + 1) * span / n
      frag.appendChild(makeWedge(account, a0, a1, geo))
      frag.appendChild(makeSeatCard(account, (a0 + a1) / 2, geo, n, { reservedByAccount, accountMap }))
    })
  }

  // my colour washes the bottom slice (table skin — in market skin the center
  // table already reads as "mine")
  if(mine.length && boardSkin === "table")
    frag.appendChild(makeWedge(mine[0], 55, 125, geo, true))

  frag.appendChild(makeCenterOval(mine, accounts, geo, { accountMap }))
  frag.appendChild(makeDock(mine, { reservedByAccount, accountMap }))

  frag.appendChild(boardBrandmark())
  root.replaceChildren(frag)
}

/* ── ring skin (user drawing 2026-07-09) ────────────────────────────────── */
// The legacy MOBILE view transposed to polar. One segment per ACCOUNT (not
// player — a player with 3 accounts holds 3 segments; drops target an account
// explicitly, no nested aiming). The big oval is the basket boundary: inside
// it = that account's basket, outside to the screen edge = their available,
// with reserved GHOSTED IN PLACE. Hovering a ghost or a basket item shows the
// legacy dotted trade line between them (highlightTradePair — same rules).
// Segments run in JOIN ORDER from 9 o'clock, clockwise, and the layout is the
// SAME for every viewer (shared board — livestream-friendly; a rotate-to-me
// toggle can come later). Your own segments get a stronger wash + (you).
// The small center circle is the pivot — it becomes the strike timer /
// hourglass in the signing phase (stage 2, with per-segment lock arcs on the
// oval line itself; for now locks are glyphs on the account label).

// BOARD-CHAT1: account id -> { x, y, am, mine, playerId } in board pixels, refilled
// on every ring paint. Stale entries would strand bubbles on a re-laid-out board, so
// the map is cleared per paint rather than merged.
var _boardChatAnchors = {}

function renderRingBoard(root){

  _boardChatAnchors = {}

  // join order — shared board for all; filters preserve join order
  // (getVisibleAccounts sorts mine-first, which would reseat the shared board)
  boardSigning = boardDetectSigning()
  boardSigningWindowDiag(boardSigning)   // KATOMIA-VALIDDUR1: log window changes
  // BOARD-SIGNREADONLY1 (user 2026-08-04): once a tx is struck the board is
  // READ-ONLY — a lock can't be undone — so the arcs stop offering the
  // hover/tap affordance (a peach preview for something you cannot do is a lie
  // about the state). CSS kills pointer events on the arcs while this is set.
  // Set HERE, not in render()'s preamble: that runs before this line, so the
  // flag would carry the PREVIOUS paint's signing state and the first paint of
  // the signing phase would still offer the hover.
  if(boardSigning) document.body.dataset.signing = "1"
  else delete document.body.dataset.signing
  // BOARD-LOCKREDRAW1 (user 2026-08-18, on lab1): with Party-only on, the last lock
  // rotates/collapses the ring but the offer trail lines kept their old screen
  // geometry — "a weird dotted line at the wrong angle", fixable only by pressing ▶.
  // The user's own fix, automated: at the WITNESSED moment locking completes (prev
  // paint not signing → this paint signing; a mid-signing page load never fires),
  // wipe the stale lines now and replay the preview once the layout tween has
  // settled — "it shows everyone where they are in one go and fixes the UI and
  // leaves the dotted line in the right place."
  {
    const sigTx = boardSigning?.tx?.txid || null
    if(_boardSignPrevTx === null && sigTx){
      boardClearTrails()
      setTimeout(() => { if(boardSigning?.tx?.txid === sigTx) playTransfers() }, 700)
    }
    _boardSignPrevTx = sigTx
  }
  // SIGNAL-DRIVEN expiry/failure verdict (replaces the 2026-07-14 client-
  // timer guesses, removed 2026-07-15 for disagreeing with the real backend
  // deadline — see BOARD_TX_EXPIRY_MS above). boardDetectSigning() only
  // stops returning a txid once the BACKEND has actually resolved it (tx
  // dropped from state.tx.pending, or marked isFinalStatus, via its own
  // broadcast) — so reacting to that disappearance is exactly in sync with
  // when the board's UI ACTUALLY clears, by construction; no separate clock
  // to drift against it. Short grace window before declaring failure: a
  // genuine SUCCESS is usually already acked via the tx-receipt socket
  // (boardHandleTxUpdate) by the time the tx vanishes from pending, but if
  // that push is still in flight this avoids a false failure flash.
  {
    const nowTxid = boardSigning?.tx?.txid || null
    if(_boardLastSigningTxid && _boardLastSigningTxid !== nowTxid && !boardSuccessAcked.has(_boardLastSigningTxid)){
      const vanished = _boardLastSigningTxid
      // S3: tell the controller the tx left pending — verdicts landing more
      // than a few seconds after this moment present quietly (rule 5).
      window.katomiaTxStatus?.report(vanished, { source: "board", kind: "progress", detail: { event: "left-pending" } })
      // 500ms (was 2000, user 2026-07-15: the wiper lagged the shade lift —
      // fire "pretty much immediately"): still enough for a same-moment
      // success receipt push to win the race, and the shade's synced fade
      // (ring-focusshade--wipe, below) covers the remaining offset.
      //
      // BOARD-TXTRUTH1 (2026-08-07) — NEVER GUESS A FAILURE. ASK THE CHAIN.
      //
      // History, because this got fixed wrong once already: BOARD-VANISHRACE1
      // (2026-08-06) assumed the false "failed" verdict was a race against the main
      // socket reconnecting, and waited for socket.readyState === OPEN before
      // declaring. That fix DID NOT WORK — proved on the user's own device at
      // 07:48:06 on 2026-08-07 running the fixed bundle: tx …1786088873.259000000
      // SUCCEEDED on chain and the board still told the user it failed. The main
      // socket had already reconnected by the time the guess fired, so the guard
      // waved it through.
      //
      // The actual mechanism: the RECEIPT arrives on a SEPARATE socket built by
      // createTxSocket (kpool_widget/websocket.js), and that socket HAS NO RECONNECT
      // — its close handler only logs. So if it drops between "signature saved" and
      // "receipt pushed", the tx_receipt for that txid is lost FOREVER, and this
      // fallback then reports failure for a transaction that actually succeeded.
      // Compare 07:50:44 (no ws:close in the gap → tx_receipt SUCCESS arrived →
      // correct) with 07:48:06 (ws:close at 07:48:10 in the gap → no receipt ever →
      // wrong verdict).
      //
      // Why this class of bug is the worst one we have (user, 2026-08-07): telling
      // someone their payment failed when it succeeded makes them send it again.
      // That already happened — the user re-sent 0.01 USDC at 07:50:40 after being
      // told the 07:48:06 send failed, and BOTH are on chain. A double spend.
      //
      // So: the verdict no longer depends on any socket being alive. Before
      // declaring failure we ask the mirror node, which is the authoritative record
      // and is reachable independently of our backend. Only a definitive on-chain
      // answer — or the tx being genuinely absent well past its expiry — ends this.
      // S3: loop extracted to boardConfirmTxFromChain (also armed at expiry+2s
      // by boardEnsureTxSocket, so the verdict no longer waits on the backend's
      // ~10-13s drop lag). Expiry comes from the controller — boardSigning at
      // this point is the NEXT tx or null, so reading .expiry off it silently
      // anchored the deadline to vanish-detection time instead.
      boardConfirmTxFromChain(vanished, window.katomiaTxStatus?.snapshot(vanished)?.expiry || 0)
    }
    // BOARD-TRAILORPHAN1 (user 2026-07-31, spotted on the live demo; confirmed with
    // Playwright over a full cycle). After-glow trails are PERSISTENT by design —
    // boardFlyRect fades them to 0.75 * boardTrailResidual and leaves them until either
    // the next playTransfers wipes the layer or the offer they map is WITHDRAWN. But a
    // STRIKE is not a withdraw: boardAnimateNewOffers explicitly bails out with
    // `if(boardSigning) return`, deferring the cleanup to "the success/failure settlement
    // flights" — the chips-to-store sweep that was never built (BOARD-SWEEPWIN1). So
    // nothing ever removed them: measured 3 lines surviving the signing phase, the board
    // reset AND into the next round, drawn over a board with no chips left to anchor to.
    // Wipe them at the same moment everything else clears — when the tx leaves signing.
    if(_boardLastSigningTxid && !nowTxid)
      boardTrailLines().forEach(l => l.remove())   // BOARD-TRAILSTUCK1: layer query, works detached
    _boardLastSigningTxid = nowTxid
  }
  // party collapse/expand mid-tween: paint the merged entity list (leavers
  // still on the board at their shrinking widths) instead of the filtered
  // one — account refs re-resolved to LIVE objects each render so a WS state
  // push landing mid-tween doesn't paint 550ms-stale chip data
  const accountMap = getAccountMap()
  if(_boardPartyAnim)
    _boardPartyAnim.entities.forEach(en => {
      if(en.slot.type === "account")
        en.slot.account = accountMap[en.slot.account.id] || en.slot.account
    })
  const accounts = _boardPartyAnim
    ? _boardPartyAnim.entities.filter(en => en.slot.type === "account").map(en => en.slot.account)
    : boardFilteredAccounts()
  const reservedByAccount = boardReserved(accounts)   // SIGN-GHOSTPREVIEW1: signing-phase ghosts merged in
  const etched = ringEtched()

  // BOARD-SEGANIM1 (user 2026-08-03): a player ARRIVING (or leaving) used to snap the
  // ring from N to N+1 segments in a single paint. Reuse the party-toggle tween: when
  // the account set changes between paints, interpolate from the previous paint's REAL
  // slot layout to the new one — the newcomer's segment grows out of its seam (width
  // from 0, which on a spectator board is the empty south point) while the others
  // compress to make room. Departures shrink out the same way. The task's fuller
  // choreography (my-run width reservation, explicit south-wedge birth) stays open —
  // this is the arrive/leave slice. Known limit inherited from the toggle tween: a
  // second membership change landing MID-tween snaps (entities are a snapshot).
  if(!_boardPartyAnim && ring16()){
    const ids = accounts.map(a => a.id).join("|")
    if(_boardLastMemberIds != null && ids !== _boardLastMemberIds && _boardLastSlotLayout){
      const newL = boardComputeSlotLayout(accounts)
      const entities = boardMergeSlotLayouts(_boardLastSlotLayout, newL)
      if(entities.some(en => Math.abs(en.wOld - en.wNew) > 0.01)){
        _boardScrollCancel?.(); _boardScrollCancel = null; _boardOthersRotate = 0
        _boardPartyCancel?.()
        _boardPartyAnim = { entities, e: 0 }
        boardDiag("board:memberanim:start", { count: accounts.length })
        _boardPartyCancel = boardAnimate(550, (e, done) => {
          if(_boardPartyAnim) _boardPartyAnim.e = e
          if(done){ _boardPartyAnim = null; _boardPartyCancel = null; boardDiag("board:memberanim:end", {}) }
          render()
        })
      }
    }
    _boardLastMemberIds = ids
  }

  const W = root.clientWidth, H = root.clientHeight
  const cx = W / 2, cy = H / 2
  const rc = Math.max(24, Math.min(W, H) * 0.045)          // center pivot
  // basket oval — capped so east/west segments keep ≥ ~95px of available-space
  // outside it (portrait phones squeezed chips across the line otherwise)
  let rx = Math.max(92, Math.min(W * 0.30, W / 2 - 95))
  let ry = Math.max(100, Math.min(H * 0.27, H / 2 - 120))
  // CIRCLE LOCK (user 2026-08-03): in panel mode the ring is a true CIRCLE — "we're
  // calling these circles; an oval breaks that a little". The oval geometry stays
  // fully wired (bubbles mode keeps it, and it once flushed out a real bug) — a nerd
  // setting can re-expose elongation later (BOARD-CHATLAYOUT1).
  if(typeof boardChatMode !== "undefined" && boardChatMode === "panel"){
    const rr = Math.min(rx, ry)
    rx = ry = rr
  }

  const rad = deg => deg * Math.PI / 180
  const ovalR = a => (rx * ry) / Math.hypot(ry * Math.cos(a), rx * Math.sin(a))
  const edgeR = a => {
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a))
    return Math.min(c > 1e-6 ? (W / 2) / c : Infinity, s > 1e-6 ? (H / 2) / s : Infinity)
  }

  const frag = document.createDocumentFragment()

  // BOARD-WHEEL1: mine stays fixed+whole; if there are more players than
  // boardMaxSegments, others are windowed with a scroll-divider on each side
  // (boardRingLayoutSlots). Below the cap this is just `accounts` again, one
  // slot each, no dividers — unchanged from before this feature.
  // Party collapse/expand v2: widths interpolate between the two REAL slot
  // layouts captured at toggle (dividers and windowing included — see
  // boardTogglePartyOnly), so both tween endpoints equal the actual screens.
  let slots, step, widths
  if(_boardPartyAnim){
    const e = _boardPartyAnim.e
    slots = _boardPartyAnim.entities.map(en => en.slot)
    widths = _boardPartyAnim.entities.map(en => en.wOld + (en.wNew - en.wOld) * e)
    _boardPartyAnim.entities.forEach(en => {
      if(en.slot.type === "account")
        en.slot.weight = en.wNew < 0.01 ? 1 - e : en.wOld < 0.01 ? e : 1   // chip fade rides this
    })
    const acctW = widths.filter((w, i) => slots[i].type === "account" && w > 1)
    step = acctW.length ? acctW.reduce((s, x) => s + x, 0) / acctW.length : 360   // felt font sizing only
  } else {
    slots = boardRingLayoutSlots(accounts)
    const acctSlotCount = slots.filter(s => s.type === "account").length
    const dividerCount = slots.length - acctSlotCount
    step = acctSlotCount ? (360 - dividerCount * BOARD_DIVIDER_DEG) / acctSlotCount : 360
    widths = slots.map(s => s.type === "divider" ? BOARD_DIVIDER_DEG : step)
    _boardLastStepDeg = step                           // wheel-scroll glide distance
    _boardLastSlotLayout = { slots, widths, step }     // BOARD-SEGANIM1: arrival tween's "before"
  }
  const cumStart = []
  { let acc = 0; widths.forEach(w => { cumStart.push(acc); acc += w }) }

  const geo = { W, H, cx, cy }
  // BOARD-LOCKBAND1 (user 2026-08-06): the felt tap (→ player modal) and the
  // lock-arc tap live on the same pixels, so a near-miss on your own arc used
  // to open YOUR OWN player modal instead of locking. The wedge click handler
  // needs the oval geometry to tell "meant the ring" from "meant the felt" —
  // stashed here, where the solve already happens, rather than recomputed.
  _boardRingGeo = { cx, cy, rx, ry }
  const bottomPad = etched ? 76 : 48        // keep boxes clear of the footer bar
  const segs = []                           // geometry handed to the felt layer (accounts only)

  // ring8 "you at bottom": rotate the layout so the middle of my run of
  // slots points due south (90° screen). Toggle off = everyone sees the
  // identical board (screen-share / spectator mode). Mine is ALWAYS one
  // contiguous run at the layout's front (boardRingLayoutSlots, both
  // branches) — "the position of the current player is the midpoint between
  // the two dividers" (user 2026-07-12).
  let start = boardStartAngle
  if(ring8() && boardSelfBottom){
    const mineIdx = slots.map((s, i) => (s.type === "account" && isMyAccount(s.account)) ? i : -1).filter(i => i >= 0)
    if(mineIdx.length){
      const first = mineIdx[0], last = mineIdx[mineIdx.length - 1]
      const center = boardStartAngle + (cumStart[first] + cumStart[last] + widths[last]) / 2
      start = boardStartAngle + (90 - center)
    } else {
      // SPECTATOR (user 2026-07-12): no accounts of mine, but the mine-gap
      // still has a definition — the zero-width point between the two
      // dividers (the layout's wrap point, angle 0). Face it due south, so
      // the divider pair brackets an empty south seat instead of drifting.
      start = 90
    }
  } else if(ring8() && !_boardPartyAnim && accounts.length <= boardMaxSegments){
    // BOARD-ORDERCANON1 follow-up (user, live 3-browser test, 2026-08-08):
    // "you at bottom" OFF must draw the SAME ring for every viewer, not just
    // the same cycle starting wherever each viewer's own block happens to
    // sit. boardRingLayoutSlots still rotates the array to put mine first
    // (BOARD-WHEEL4 needs one consistent shape in both branches) — so under
    // the cap, undo exactly that rotation here in angle space: shift start by
    // (my canonical join-order index) * step, which is the inverse of the
    // rotation the slots array just applied. Every viewer's own rotation
    // cancels out and everyone lands on the same drawn positions — no
    // dividers under the cap, so `step` is uniform and this is exact. Over
    // the cap this doesn't apply: mine has to stay fixed+whole regardless of
    // the toggle (BOARD-WHEEL1), so that path stays viewer-dependent on
    // purpose (Option C in the BOARD-ORDERCANON1 advisory doc, parked).
    const canonicalMineIdx = accounts.findIndex(a => isMyAccount(a))
    if(canonicalMineIdx > 0) start = boardStartAngle + canonicalMineIdx * step
  }

  // rotate animation: the toggle just flipped — seed the offset so this frame
  // still paints the OLD orientation, then tween the offset to 0 (the new
  // one), re-rendering per frame. Shortest path so 350° goes -10°, not +350°.
  if(_boardAnimateNextRotation && _boardStartRendered != null){
    _boardAnimateNextRotation = false
    _boardRotateCancel?.()
    boardClearTrails()   // drawn trails are screen-frame snapshots — stale once the board turns
    const from = boardShortestDelta(_boardStartRendered - start)
    boardDiag("board:rotanim:start", { fromDeg: Math.round(from), speed: boardAnimSpeed })
    _boardRotateOffset = from
    _boardRotateCancel = boardAnimate(550, (e, done) => {
      _boardRotateOffset = from * (1 - e)
      if(done){ _boardRotateOffset = 0; _boardRotateCancel = null }
      render()
    })
  }
  start += _boardRotateOffset
  _boardStartRendered = start

  // v9 (review 7): when ≥2 DISCONNECTED clusters coexist, segments outside my
  // cluster fade their wash — makes the split visible before it settles by
  // surprise. Uses the LOCK-PROGRESS1 grouping; unconnected accounts count as
  // outside. Only meaningful under the cluster rule.
  let outsideMyCluster = null
  if(ring9() && (gameMeta?.lockRule || "cluster") === "cluster"){
    const gids = new Set(accounts.map(a => getLockProgress(a.id)?.groupId).filter(Boolean))
    if(gids.size > 1){
      const myG = new Set(accounts.filter(a => isMyAccount(a))
        .map(a => getLockProgress(a.id)?.groupId).filter(Boolean))
      if(myG.size)
        outsideMyCluster = a => !myG.has(getLockProgress(a.id)?.groupId)
    }
  }

  // ── wheel-glide clip window (see the v2 note at _boardOthersRotate) ──────
  // Mid-glide, everything in the others group renders inside two clip
  // containers (wedges below the felt, chips above — preserving the normal
  // z-order) cut to the FIXED sector between the dividers, and the LEAVER is
  // re-inserted one slot before the window so it slides out through the near
  // threshold while the newcomer slides in through the far one. The felt's
  // own elements for these segs (arcs/labels/dims) get the same clip inside
  // ringFelt (seg.wclip → SVG clipPath). All of it exists only while the
  // tween runs — the final frame (offset 0) renders the plain layout, which
  // is exactly when the leaver leaves the DOM.
  let renderSlots = slots.map((slot, i) => ({ slot, base: cumStart[i], width: widths[i] }))
  let wheelClip = null, wheelWedgeClip = null, wheelChipClip = null
  const firstOthers = slots.findIndex(s => s.group === "others")
  if(_boardOthersRotate !== 0 && firstOthers >= 0 && !_boardPartyAnim){
    let lastOthers = firstOthers
    slots.forEach((s, i) => { if(s.group === "others") lastOthers = i })
    wheelClip = { a0: start + cumStart[firstOthers],
                  a1: start + cumStart[lastOthers] + widths[lastOthers] }
    // the leaver: the account that just scrolled out of the window. Direction
    // decides which END it fell off and which threshold it exits through:
    // +1 (glide > 0) dropped the FRONT account — re-inserted one slot before
    // the window, exits the near divider; −1 dropped the BACK one —
    // re-inserted one slot after, exits the far divider. With ≥1 hidden it
    // can never also be the entrant.
    const others = accounts.filter(a => !isMyAccount(a))
    if(others.length > 1){
      const off = ((boardOthersScrollOffset % others.length) + others.length) % others.length
      const m = lastOthers - firstOthers + 1
      if(_boardOthersRotate > 0){
        const leaver = others[(off - 1 + others.length) % others.length]
        renderSlots.splice(firstOthers, 0, {
          slot: { type: "account", account: leaver, group: "others" },
          base: cumStart[firstOthers] - step, width: step })
      } else {
        const leaver = others[(off + m) % others.length]
        renderSlots.splice(lastOthers + 1, 0, {
          slot: { type: "account", account: leaver, group: "others" },
          base: cumStart[lastOthers] + widths[lastOthers], width: step })
      }
    }
    const poly = boardSectorPolygon(wheelClip.a0, wheelClip.a1, geo, 8)
    wheelWedgeClip = document.createElement("div")
    wheelWedgeClip.className = "ring-wheelclip ring-wheelclip--wedges"
    wheelWedgeClip.style.clipPath = poly
    wheelChipClip = document.createElement("div")
    wheelChipClip.className = "ring-wheelclip ring-wheelclip--chips"
    wheelChipClip.style.clipPath = poly
    frag.appendChild(wheelWedgeClip)
    frag.appendChild(wheelChipClip)
  }

  renderSlots.forEach(({ slot, base, width }, slotIdx) => {

    // wheel-scroll glide: the others-window slots carry the animated offset;
    // mine and the dividers hold still (the wheel turns, the mouth doesn't)
    const gOff = slot.group === "others" ? _boardOthersRotate : 0
    const a0 = start + base + gOff, a1 = a0 + width

    // element destinations: clipped containers for the others group mid-glide
    const inWheel = slot.group === "others" && wheelClip
    const wedgeDest = inWheel ? wheelWedgeClip : frag
    const chipDest = inWheel ? wheelChipClip : frag

    if(slot.type === "divider"){
      frag.appendChild(makeScrollDividerWedge(a0, a1, geo, slot.hiddenCount, slot.dir))
      return
    }

    const account = slot.account
    const am = rad((a0 + a1) / 2)
    const mine = isMyAccount(account)
    const hac = account.id.split(":")[1] || account.id
    // SIGN-STATUSLANG1: colour each account's arc by ITS OWN signing status —
    // green=signed, orange=pending, grey=not required, red(dashed)=balance
    // shortfall or missing token association — computed by boardRefreshSignStatus
    // from the SAME widget machinery + rules the /m/sign/ modal uses (txRead
    // sigs, per-account threshold solve, and the modal's own precheck parsing
    // for the balance/assoc red state — see boardBalanceIssues). Falls back to
    // the whole-tx status only while perAcct hasn't loaded YET (null) — once it
    // has, even "none" is a real, distinct answer and must win over the generic
    // orange (user 2026-07-12: a party member who's just receiving, with no
    // signature required, was showing orange like everyone else).
    let perAcct = boardSigning && boardSignStatus?.txid === boardSigning.tx?.txid
      ? boardSignStatus.byAccount?.[hac] : null
    if(perAcct === "loading") perAcct = "pending"   // orange while keyInfo loads; no --loading CSS class
    segs.push({ account, a0, a1, am, mine, wclip: !!inWheel,
      weight: slot.weight,   // party-tween fade: felt elements (etched id, arcs) dim with the closing segment
      sign: boardSigning && boardSigning.legs[hac]
        ? (perAcct ?? boardSigning.status)
        : null })

    // wash + fat drop target: the whole slice IS the account (own segments
    // accept drops too — acct → acct moves, and drag-home = withdraw)
    const wedge = makeWedge(account, a0, a1, geo, mine)
    if(mine) wedge.classList.add("board-wedge--mine")
    if(ring8() && account.id === boardSelectedAccount)
      wedge.classList.add("board-wedge--selected")   // footer dropdown highlight
    if(outsideMyCluster && !mine && outsideMyCluster(account))
      wedge.classList.add("board-wedge--othercluster")
    boardDropTarget(wedge, account)
    wedgeDest.appendChild(wedge)

    const chord = fr => Math.max(0.001, 2 * fr * Math.sin(rad(step / 2)))
    const rOval = ovalR(am), rEdge = edgeR(am)

    // BOARD-CHAT1 (user 2026-07-30): record where this account actually sits, so
    // katomia-chat.js can hang a speech bubble off it. Deliberately recorded HERE
    // rather than recomputed there — the angle/radius solve (rotation, wheel glide,
    // organic vs box skins, per-angle oval/edge radii) lives in this function and
    // must not be duplicated. One line in, no behaviour changed.
    _boardChatAnchors[account.id] = {
      x: geo.cx + (rOval + (rEdge - rOval) * 0.55) * Math.cos(am),
      y: geo.cy + (rOval + (rEdge - rOval) * 0.55) * Math.sin(am),
      am, mine, playerId: account.playerId,
      // DEMO-NARRATE1 avatars (user 2026-08-03): where this account's avatar sits, so
      // the speech-bubble tail can aim at the person. Written by ringAvatar() — felt
      // may paint after this line, in which case these are last paint's coordinates,
      // which is fine (they only move when the layout does, and the next paint's
      // reposition() re-aims the tails anyway).
      avx: _boardAvatarPts[account.id]?.x, avy: _boardAvatarPts[account.id]?.y,
    }

    if(ring16()){
      // BOARD-ORGANIC1: no boxes — chips settle individually into the wedge's
      // two zones via the relax pass (solved after the DOM lands, in
      // boardOrganicApply — sizes need real layout). The wrap carries the
      // account's drop target so a drop ON a chip still resolves to this
      // account (events bubble chip → wrap; the wedge already catches drops
      // on bare felt — identical semantics to the old inner/outer boxes,
      // which called the same boardDropTarget(el, account)).
      const wrap = document.createElement("div")
      wrap.className = "ring-organic"
      boardDropTarget(wrap, account)
      // drag feedback used to be the box's .drag-over outline; the wrap spans
      // the whole board so outline it can't — light the account's wedge instead
      wrap.addEventListener("dragenter", () => wedge.classList.add("drag-over"))
      wrap.addEventListener("dragleave", () => wedge.classList.remove("drag-over"))
      wrap.addEventListener("drop", () => wedge.classList.remove("drag-over"))
      // party collapse/expand: chips fade with their segment's weight (the
      // wedge closes over them; BOARD-PHYSICS1 — the sim's walls follow the
      // interpolated zone geometry each frame, squeezing chips with the wedge)
      if(slot.weight != null && slot.weight < 1) wrap.style.opacity = slot.weight
      // belt & braces (user 2026-07-12): clip every segment's chips to its
      // CURRENT wedge sector while the tween runs — whatever the chips do,
      // they can never escape their own closing slice
      if(_boardPartyAnim) wrap.style.clipPath = boardSectorPolygon(a0, a1, geo)

      const basketCont = document.createElement("div")
      boardBasketChips(account, basketCont, accountMap)
      // signing phase: the strike cleared the baskets server-side, but the
      // board keeps the picture — receiving legs render as tx chips in place
      if(boardSigning){
        const legs = boardSigning.legs[hac]
        if(legs && !basketCont.querySelector(".asset")) boardTxChips(legs, basketCont, accounts, account.id)
      }
      const storeCont = document.createElement("div")
      boardStoreChips(account, storeCont, reservedByAccount)
      boardReservedChips(account, storeCont, reservedByAccount)

      const basketChips = [...basketCont.children]
      const storeChips = [...storeCont.children]
      basketChips.forEach(c => wrap.appendChild(c))
      storeChips.forEach(c => wrap.appendChild(c))

      if(account.mode === "lock"){
        // etched skins: 🔒 badge used to ride the outer box — anchor it at the
        // store zone's outer reach instead
        const badge = document.createElement("div")
        badge.className = "ring-lockbadge ring-lockbadge--organic"
        badge.textContent = "🔒"
        const rb = rOval + (rEdge - rOval) * 0.85
        badge.style.left = (cx + rb * Math.cos(am)) + "px"
        badge.style.top = (cy + rb * Math.sin(am)) + "px"
        wrap.appendChild(badge)
      }
      chipDest.appendChild(wrap)

      const midDeg = (a0 + a1) / 2, halfDeg = Math.max(6, step / 2 - 1)
      // BOARD-PHYSICS1: no more endpoint solves — during the party tween these
      // zones carry the per-frame interpolated angles, and the sim's bodies
      // simply follow the moving walls (the wedge clip above covers the squeeze)
      // halfDegFull (user 2026-08-03, BOARD-COUNTER1 R2): the segment's TRUE half
      // width, divider to divider — drawing only. The physics keep the shaved,
      // ±80°-clamped halfDeg; the counter band uses this so adjacent arcs butt up.
      const halfDegFull = (a1 - a0) / 2
      _boardOrganicZones.push(
        { chips: basketChips, midDeg, halfDeg, halfDegFull, rMin: rc + 10, rMax: rOval - 6,
          key: account.id + "|basket" },
        { chips: storeChips, midDeg, halfDeg, halfDegFull, rMin: rOval + 8, rMax: Math.max(rOval + 40, rEdge - 14),
          key: account.id + "|store" })
      return
    }

    // a box's width budget is the TIGHTER of its segment's chord (tangential
    // room) and the annulus depth it sits in (radial room, floored so N/S
    // segments — where radial depth doesn't bound horizontal width — aren't
    // starved). Boxes are also pushed apart radially (inner hub-ward, outer
    // edge-ward) so diagonal segments' boxes don't meet at the oval line.
    const boxW = (radialRoom, tangRoom) =>
      Math.min(Math.max(Math.min(tangRoom, Math.max(radialRoom, 96)), 72), 240)

    // inner box — their basket, inside the oval
    const ri = rc + (rOval - rc) * 0.48
    const innerW = boxW((rOval - rc) * 0.8, chord(Math.max(ri, rOval * 0.55)) * 0.9)
    const inner = document.createElement("div")
    inner.className = "ring-box ring-basket"
    inner.style.maxWidth = innerW + "px"
    inner.style.left = Math.min(Math.max(cx + ri * Math.cos(am), innerW / 2 + 6), W - innerW / 2 - 6) + "px"
    inner.style.top = Math.min(Math.max(cy + ri * Math.sin(am), 40), H - 40) + "px"
    boardBasketChips(account, inner, accountMap)
    // signing phase: the strike cleared the baskets server-side, but the
    // board keeps the picture — receiving legs render as tx chips in place
    if(boardSigning){
      const hac = account.id.split(":")[1] || account.id
      const legs = boardSigning.legs[hac]
      // 5th arg = whose basket this is (SIGN-DUPEACCT1); the 4th stays undefined
      // here on purpose — this path never fed the settle flight
      if(legs && !inner.querySelector(".asset")) boardTxChips(legs, inner, accounts, undefined, account.id)
    }
    boardDropTarget(inner, account)
    chipDest.appendChild(inner)

    // outer box — available (ghosts in place), outside the oval. v1 carries a
    // label row; etched variants write the id into the felt instead so the
    // chips get the room (and the board reads like a board, not a form)
    const ro = rOval + (rEdge - rOval) * 0.62
    const outerW = boxW((rEdge - rOval) * 0.92, chord(ro) * 0.75)
    const outer = document.createElement("div")
    outer.className = "ring-box ring-avail" + (mine ? " ring-avail--mine" : "")
    outer.style.maxWidth = outerW + "px"
    outer.style.left = Math.min(Math.max(cx + ro * Math.cos(am), outerW / 2 + 6), W - outerW / 2 - 6) + "px"
    outer.style.top = Math.min(Math.max(cy + ro * Math.sin(am), 48), H - bottomPad) + "px"

    if(!etched) outer.appendChild(ringHead(account, mine))
    else if(account.mode === "lock" && boardSkin !== "ring7"){
      // ring7 carries lock state on the etched id + darkened store instead
      const badge = document.createElement("div")
      badge.className = "ring-lockbadge"
      badge.textContent = "🔒"
      outer.appendChild(badge)
    }
    const chips = document.createElement("div")
    chips.className = "board-band"
    boardStoreChips(account, chips, reservedByAccount)
    boardReservedChips(account, chips, reservedByAccount)
    outer.appendChild(chips)
    boardDropTarget(outer, account)
    chipDest.appendChild(outer)
  })

  // felt linework: basket oval, segment boundaries, hub ring, etched ids
  frag.appendChild(ringFelt(segs, { W, H, cx, cy, rc, rx, ry, step, edgeR, ovalR, rad, etched, wheelClip }))

  // center pivot — future strike timer / signing hourglass. With lock arcs
  // (ring5/6) the hub rim doubles as the cluster progress ring: the lockbar
  // bent into a circle, orange filling with each required lock.
  const hub = document.createElement("div")
  // BOARD-CHIPSONTOP1 (user 2026-08-06): the hub sits at the BACK — "the chips
  // are on the board, they cover everything… it just feels weird floating that
  // middle point above everything else". The one exception the user allowed is
  // the countdown, which keeps its own pill and rides above the chips: while
  // signing, BOARD-HUBCLEAR1 has already stripped the K, so raising the whole
  // (transparent, --counting) hub raises the counter and nothing else.
  hub.className = "ring-hub" + (ringArcs() ? " ring-hub--ringed" : "")
    + (boardSigning ? " ring-hub--counting" : "")
  hub.style.left = cx + "px"
  hub.style.top = cy + "px"
  hub.style.width = hub.style.height = rc * 2 + "px"
  const lp = boardLockSummary(accounts.filter(a => isMyAccount(a)), accounts)
  if(ring12()){
    // v12: the K comes from an ASSET FILE — swap assets/kpay-k.svg for the
    // real logo (BRAND-K1); the geometric placeholder lives in the file
    const kimg = document.createElement("img")
    kimg.className = "ring-hub-ksvg"
    // BOARD-CLEANUP3: was a relative "assets/kpay-k.svg" — resolved fine at
    // board.php?game=<id> (path depth 1) but 404s under the new /board/<id>
    // route (BOARD-CLEANUP1/58a730a): the .htaccess asset-passthrough rule
    // only rewrites .js/.css, not images, and browsers resolve relative URLs
    // against the CURRENT PATH, not the server-rewritten one. Absolute path
    // sidesteps the whole class of bug instead of chasing every extension.
    kimg.src = (window.KBASE||"") + "/assets/kpay-k.svg"
    kimg.alt = ""
    hub.appendChild(kimg)
  } else if(boardSkin === "ring11"){
    // v11 (review 10): the font K mis-centred (baseline) and fell back to the
    // wrong face on mobile — replaced with a GEOMETRIC K path: square
    // proportions per the KPAY mark, dead-centred, font-independent. The
    // real logo asset swap is BRAND-K1.
    const NS = "http://www.w3.org/2000/svg"
    const ksvg = document.createElementNS(NS, "svg")
    ksvg.setAttribute("class", "ring-hub-ksvg")
    ksvg.setAttribute("viewBox", "0 0 100 100")
    const kpath = document.createElementNS(NS, "path")
    kpath.setAttribute("d", "M30 10 V90 M78 12 L34 50 L78 88")
    kpath.setAttribute("class", "ring-hub-kpath")
    ksvg.appendChild(kpath)
    hub.appendChild(ksvg)
  } else if(ring8()){
    // faint brand K behind the count (KPAY face — Montserrat where loaded,
    // graceful fallback otherwise); the hub doubles as a circular logo.
    // v9: sized to FILL the circle — corners touching the rim (review 7)
    const k = document.createElement("span")
    k.className = "ring-hub-k"
    k.textContent = "K"
    if(ring9()) k.style.fontSize = (rc * 1.9) + "px"
    hub.appendChild(k)
  }
  // BOARD-HUBCLEAR1 (user 2026-07-30, watching the demo): "whilst there's a countdown or
  // anything else on the center, we should hide the K logo". The countdown was being laid
  // ON TOP of the mark. Done once here rather than as a guard inside each skin branch, so
  // it covers every K variant (img, geometric svg, glyph) and any future one.
  if(boardSigning) hub.querySelectorAll(".ring-hub-ksvg, .ring-hub-k").forEach(n => n.remove())

  if(ring12()){
    // v12 (review 11): the hub is CLEAN — thin grey border + K only. The
    // player-colour arcs moved to the board side of the hub (ringFelt),
    // with the party strip-light outside them.
    // v15: in the signing phase the hub is the COUNTDOWN to tx expiry
    // (SIGN-COUNTDOWN1 — landing exactly where the 2026-07-06 doc predicted)
    if(boardSigning){
      const count = document.createElement("span")
      count.className = "ring-hub-count ring-hub-count--" + boardSigning.status
      hub.appendChild(count)
      boardStartCountdown(count)
      /* KBUNDLE-STRIP:extsign */
      // SIGN-HUBLINKPRUNE1 (feedback c8dbd94c, 2026-08-17): the external signing page
      // lives OUTSIDE m/katomia, so standalone bundles (pat/production) don't ship it
      // and this tap landed on a 404 — "you just takes you to a broken link which
      // doesn't look good". Strip-tagged: dev estate keeps the external route ("we do
      // need a way for testing at least to be able to go external"), bundles cut it
      // and the hub stays a plain countdown.
      if(ring16()){
        hub.style.cursor = "pointer"
        hub.title += " — tap for the full signing page (all wallet options)"
        hub.onclick = () => window.open(
          `/m/sign/?network=${encodeURIComponent(gameMeta?.network || "")}` +
          `&txid=${encodeURIComponent(boardSigning.tx.txid)}&pch=${encodeURIComponent(boardSigning.tx.pch || "")}`,
          "_blank")
      }
      /* /KBUNDLE-STRIP:extsign */
    }
  } else if(ring10()){
    // v10 HUB RING (review 9): per-account arcs in each player's colour (the
    // Ludo rim), plus a thin LIT inner arc on accounts in MY party — the
    // preview of what Party-only keeps. Lock count text + progress ring
    // culled: with Party-only on, the ratio is the board itself. The count
    // lives on in the tooltip.
    hub.appendChild(hubPlayersRing(segs, accounts, rc))
  } else {
    const hubText = document.createElement("span")
    hubText.textContent = lp ? `${lp.locked}/${lp.total}` : ""
    hub.appendChild(hubText)
    if(ringArcs() && lp) hub.appendChild(hubProgressRing(lp, rc))
  }
  // "accounts" spelled out (user 2026-07-09): locking counts ACCOUNTS —
  // segments are accounts, a multi-account player locks each separately
  hub.title = (gameMeta?.profile?.name || gameMeta?.id || "") +
    (lp ? ` — ${lp.locked} of ${lp.total} accounts locked (${lp.scope})` : "")
  frag.appendChild(hub)

  if(etched) frag.appendChild(ringFooter(accounts.filter(a => isMyAccount(a))))

  frag.appendChild(boardBrandmark())
  root.replaceChildren(frag)
  boardUpdateBanner()   // signing status / tap-to-offer hint / hidden

  // BOARD-ORGANIC1: chips are in the live DOM now — measure, relax, place.
  // Must run BEFORE the flight animations below (they read chip rects).
  boardOrganicApply(cx, cy, W, H, { rx, ry })

  // ring8: offers from OTHER PLAYERS fly in as they land (one leg of the ▶
  // animation). Player-level guard: your own drops — from ANY of your
  // accounts — don't animate at you; you did the motion. Skipped on the
  // first paint (everything would fly).
  if(ring8()) boardAnimateNewOffers()

  // review 17: the STRIKE MOMENT — entering the signing phase auto-plays the
  // choreography once (legs fly to their baskets while the spotlight fades
  // in at the same speed). No button needed; ▶ replays it.
  if(ring16()){
    const txid = boardSigning?.tx?.txid || null
    if(txid && window.__boardStruckTx !== txid) setTimeout(playTransfers, 80)
    window.__boardStruckTx = txid
  }

  // BOARD-TRAILORPHAN1 R2: the DOM above is now authoritative — drop any after-glow
  // line whose anchor ghost did not survive this paint (playnet instant resolve,
  // player exit, or any future path that removes chips without a withdraw).
  boardPruneOrphanTrails()

  // DEMO-NARRATE1 (first slice): the step timeline along the bottom.
  boardRenderNarrate()
}

/* ── Lazy Susan v1 (review 7) ───────────────────────────────────────────────
   The ring UNWRAPPED for the WIDE phase (many players, pre-cluster): other
   accounts are rectangular cards in a horizontal carousel — arrows + native
   swipe/scroll-snap — and my accounts are full-width strips above the footer
   (basket strip over store strip, mirroring the ring's inside/outside).
   Cards mirror that: store on top, basket at the bottom edge facing mine.
   Same chips, same drop semantics (whole card = the account), same footer,
   net + party filters, same offer/withdraw choreography. Swipe-a-player-away
   to dismiss = later feature. Flow: browse + hook up here, then jump to the
   ring (Party only) once a cluster forms — RENDERPATH doc §8. */

function renderSusanBoard(root){

  const accounts = boardFilteredAccounts()
  const accountMap = getAccountMap()
  const reservedByAccount = boardReserved(accounts)   // SIGN-GHOSTPREVIEW1: signing-phase ghosts merged in
  const mine = accounts.filter(a => isMyAccount(a))
  const others = accounts.filter(a => !isMyAccount(a))
  const ctx = { reservedByAccount, accountMap }

  const frag = document.createDocumentFragment()
  const wrap = document.createElement("div")
  wrap.className = "susan"

  const carWrap = document.createElement("div")
  carWrap.className = "susan-carousel-wrap"
  const car = document.createElement("div")
  car.className = "susan-carousel"
  const arrow = (txt, dx) => {
    const b = document.createElement("button")
    b.className = "susan-arrow"
    b.textContent = txt
    b.onclick = () => car.scrollBy({ left: dx, behavior: "smooth" })
    return b
  }
  others.forEach(account => car.appendChild(susanCard(account, ctx)))
  if(!others.length){
    const hint = document.createElement("div")
    hint.className = "susan-empty"
    hint.textContent = "No one else on the wheel yet"
    car.appendChild(hint)
  }
  carWrap.appendChild(arrow("‹", -230))
  carWrap.appendChild(car)
  carWrap.appendChild(arrow("›", 230))
  wrap.appendChild(carWrap)

  const mineWrap = document.createElement("div")
  mineWrap.className = "susan-mine" + (susan5() ? " susan-mine--cards" : "")
  // susan5 (review 13): my accounts are side-by-side CARDS like everyone
  // else, bands flipped (basket over store) — the page reads store/basket |
  // basket/store down the fold, the ring's symmetry unwrapped
  mine.forEach(account => mineWrap.appendChild(
    susan5() ? susanCard(account, ctx, true) : susanMineRow(account, ctx)))
  wrap.appendChild(mineWrap)

  frag.appendChild(wrap)
  frag.appendChild(ringFooter(mine))
  frag.appendChild(boardBrandmark())
  root.replaceChildren(frag)

  boardAnimateNewOffers()
}

function susanCard(account, ctx, mine = false){
  const card = document.createElement("div")
  card.className = "susan-card"
    + (mine ? " susan-card--mine" : "")
    + (account.mode === "lock" ? " susan-card--locked" : "")
    + (account.id === boardSelectedAccount ? " susan-card--selected" : "")
  card.style.borderTopColor = getPlayerColour(account.playerId)
  card.dataset.accountId = account.id

  const head = document.createElement("div")
  head.className = "susan-head"
  head.style.color = getPlayerColour(account.playerId)
  if(mine){
    // review 14: tapping your own header selects the account (two-way with
    // the footer dropdown — the dropdown may retire in some contexts later)
    head.style.cursor = "pointer"
    head.onclick = () => { boardSelectedAccount = account.id; render() }
  }
  head.textContent = (account.id.split(":")[1] || account.id)
    + (mine ? " (you)" : "")
    + (account.mode === "lock" ? " 🔒" : "")
    + (playerAllowsPick(account.playerId) && !isMyAccount(account) ? " ◀" : "")
  card.appendChild(head)
  const xl = window.accountLabelCache?.[account.id.split(":")[1] || account.id]
  if(xl){
    const sub = document.createElement("div")
    sub.className = "susan-xsub"
    sub.textContent = xl
    card.appendChild(sub)
  }

  const store = document.createElement("div")
  store.className = "board-band susan-store"
  store.title = mine ? "Your store" : "Their store (available)"
  boardStoreChips(account, store, ctx.reservedByAccount)
  boardReservedChips(account, store, ctx.reservedByAccount)

  const basket = document.createElement("div")
  basket.className = "board-band susan-basket"
  basket.title = mine ? "Your basket — offers to you land here" : "Their basket — drop here to offer"
  boardBasketChips(account, basket, ctx.accountMap)

  // mine: basket over store (mirrors the fold); others: store over basket
  if(mine){ card.appendChild(basket); card.appendChild(store) }
  else { card.appendChild(store); card.appendChild(basket) }

  boardDropTarget(card, account)
  return card
}

function susanMineRow(account, ctx){
  const row = document.createElement("div")
  row.className = "susan-mine-row"
  row.style.borderLeft = "4px solid " + getPlayerColour(account.playerId)
  row.dataset.accountId = account.id

  const head = document.createElement("div")
  head.className = "susan-head"
  head.textContent = (account.id.split(":")[1] || account.id) + " (you)"
    + (account.mode === "lock" ? " 🔒" : "")
  row.appendChild(head)

  const basket = document.createElement("div")
  basket.className = "board-band susan-basket"
  basket.title = "Your basket — offers to you land here"
  boardBasketChips(account, basket, ctx.accountMap)
  row.appendChild(basket)

  const store = document.createElement("div")
  store.className = "board-band susan-store"
  store.title = "Your store"
  boardStoreChips(account, store, ctx.reservedByAccount)
  boardReservedChips(account, store, ctx.reservedByAccount)
  row.appendChild(store)

  boardDropTarget(row, account)
  return row
}

// ── ring8/9 helpers ───────────────────────────────────────────────────────

// shared account pipeline: join-order preserved, party filter + netting
function boardFilteredAccounts(){
  const all = getAccounts()
  let accounts = all

  if(ring8() && boardPartyOnly){
    // rule-aware "Party only" (review 7): show the accounts that are party to
    // MY proposal. cluster → my connected component(s) only; active → all
    // active accounts; all → everyone is required, nothing to hide. Uses the
    // LOCK-PROGRESS1 grouping (getLockProgress) so board and lockbar can
    // never disagree. With no trades yet nothing is party — show everyone.
    // v10 (review 9): my OWN unconnected accounts hide too — the lock ratio
    // must match the segments on screen. To bring a spare account to the
    // party, link it with a dust transfer (deliberate, documented gesture).
    const rule = gameMeta?.lockRule || "cluster"
    if(boardSigning || rule !== "all"){
      const partOf = a => boardInMyParty(a, all)
      const party = all.filter(a => ring10() ? partOf(a) : (isMyAccount(a) || partOf(a)))
      // "no party yet → show everyone" gate. Was `party.some(a => !isMyAccount(a))`,
      // which ALSO no-opd when the party was entirely my own accounts (two of my
      // accounts trading each other in a cluster) — the tprop case the user hit on
      // 2026-08-17: "when I toggle party only, I'm not seeing any change to the UI,
      // even though I've got only two accounts involved in a cluster". Gate on real
      // party membership instead: any account actually IN a party means the filter
      // has something true to say, mine-only or not.
      if(party.some(partOf)) accounts = party
    }
  } else if(!ring8() && showActiveOnly){
    const vis = new Set(getVisibleAccounts(all).map(a => a.id))
    accounts = all.filter(a => vis.has(a.id))
  }

  // net view (viewer-local): FULL pairwise netting per FT asset — A→B $1 and
  // B→A $3 collapse to a single B→A $2 (review 7; the tx nets exactly like
  // this, so net-on previews the after and removes the strike jolt). NFTs
  // pass through. BOARD-POLISH1: netted-away chips should fade out / fly
  // into their counterpart and "crash" into the difference — needs FLIP
  // diffing, parked.
  if(ring8() && boardNetView)
    accounts = boardNetAccounts(accounts)

  return boardGroupByPlayer(accounts)
}

// BOARD-PARTYGROUP1 (user 2026-07-11): plain join order can interleave one
// player's accounts with another's — e.g. join order [A1, B1, A2] if A adds a
// second account after B joins. renderRingBoard's "you at bottom" only
// rotates around the FIRST contiguous run of your accounts (below), so a
// non-contiguous 2nd account lands wherever its raw index falls — the user
// saw this as "I'm at the bottom AND the top, with someone else's account
// between them on both sides." Fix: stable-group every player's accounts into
// one contiguous run. Grouped by each player's EARLIEST join index (not "am I
// the viewer") so the board stays the SAME deterministic order for every
// viewer — a reshuffle, not a personalised layout.
function boardGroupByPlayer(accounts){
  const firstIdx = new Map()
  accounts.forEach((a, i) => { if(!firstIdx.has(a.playerId)) firstIdx.set(a.playerId, i) })
  return accounts
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const gx = firstIdx.get(x.a.playerId), gy = firstIdx.get(y.a.playerId)
      return gx !== gy ? gx - gy : x.i - y.i
    })
    .map(x => x.a)
}

const BOARD_DIVIDER_DEG = 14   // fixed angular width of a scroll-wedge divider

/* ── BOARD-PHYSICS1 (2026-07-15): persistent chip physics ─────────────────
   REWRITE of the BOARD-ORGANIC1..4 placement stack, at the user's call after
   the "second asset kicks the first, dotted line goes stale" bug: get the
   physics MENTAL MODEL right — a chip's position is durable state; things
   may push each other, but every push is visible motion, and anything
   attached (ghost alignment, trade lines) tracks the chips continuously.

   OLD MODEL (deleted): a from-scratch solver re-derived every chip's
   position whenever a zone's content changed, then FOUR compensating
   mechanisms hid the teleports: a solve cache (the pickable-scatter saga),
   seeds feeding old positions back in, a FLIP glide animating the jumps
   after the fact, and the party-anim endpoint lerp. Trade lines snapshotted
   rects at hover time and went stale the moment anything moved.

   NEW MODEL: bodies (one per chip identity) persist across renders in
   _boardSimBodies, in the zone-LOCAL frame (x radial along the segment
   mid-angle, y tangential — rotation-independent, so the "You at bottom"
   rotate and the wheel scroll stay free: paint just re-projects under the
   current mid-angle). Each render REBINDS the freshly built DOM elements to
   their bodies (identity: zone + assetId + ghost-or-not + occurrence,
   deliberately NOT the text, so an amount change keeps the body — and since
   position is the body's CENTER, a width change no longer shifts anything).
   A tiny relaxation sim then runs a few iterations per rAF until settled:
     - organic: mutual collision pushes (kicking allowed — and VISIBLE,
       because it happens over frames, not inside a hidden solve) plus a
       gentle damped spring toward the zone anchor (closes gaps when chips
       leave; the damping ramp guarantees convergence), walls as before
       (angular hard, inner band hard, outer soft, basket coin-band inset);
     - shelves: strong springs toward the deterministic boardShelfZone
       targets — an HONEST animated re-flow instead of a pretend-static one;
     - both: the BOARD-SAFEAREA1 screen clamp and the spoke-label keep-out
       run INSIDE the loop, so those constraints are part of the physics,
       not a post-hoc shove that reintroduces overlaps.
   Every paint recomputes the ghost pile→ghost→basket alignment
   (BOARD-CHIPLINE1) and re-aims the hover trade line
   (window.__boardRefreshTradeLine, katomia-helpers) — attached things track
   their chips BY CONSTRUCTION, retiring the stale-line bug class. The sim
   sleeps (no rAF) once movement/frame drops under threshold; membership,
   size, zone-geometry or layout-mode changes re-excite it. A cosmetic
   re-render (pickable/lock/selection class churn) changes none of those, so
   it provably moves nothing — no cache key to get wrong this time.
   _boardChipPrevPos/_boardChipPrevPosOld keep their apply-time semantics:
   flight animations read them (NFT offer origin, withdraw-return spawn). */
let _boardOrganicZones = []           // collected per render, consumed by boardOrganicApply
let _boardChipPrevPos = new Map()     // identity → apply-time {left,top,lx,ly} (flight origins, ghost→store spawn)
let _boardChipPrevPosOld = new Map()  // one apply older — where a chip that vanished THIS apply last stood

let _boardSimBodies = new Map()       // identity → body {el,x,y,w,h,cr,inner,zoneKey,txt,tx,ty,pl,pt}
let _boardSimZones = new Map()        // zoneKey → projected geometry, refreshed every apply
let _boardSimEnv = null               // screen-space env: centre, safe rect, oval, label rects
let _boardSimRaf = 0
let _boardSimCalm = 0                 // frames since last excitement — ramps the anchor spring down
let _boardSimQuiet = 0                // consecutive settled frames — 3 puts the sim to sleep
let _boardSimLastMode = null          // layout mode at the last apply — a toggle re-excites

function boardHash01(s){
  let h = 2166136261
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 10000) / 10000
}

// ── BOARD-ARRANGE1: user-pinned chips ───────────────────────────────────────
// A chip the user placed by hand (drag-to-arrange, or spawn-at-drop-point)
// carries b.pin: it feels no layout spring and is immovable in collisions
// (arrivals find space around it) — but walls still clamp it, so a resize
// never strands it outside the felt. Pins persist per game in localStorage
// as zone-LOCAL coords (radial/tangential — orientation-independent, so a
// rotated ring restores them correctly). 🧹 Tidy clears them.
let _boardPins = null                 // ident → {lx,ly}, lazy-loaded per game
let _boardPendingSpawns = []          // {accountId, assetId, x, y, ts} — drop points awaiting their chip

function boardPinsKey(){ return "katomiaBoardPins:" + (typeof gameId !== "undefined" && gameId ? gameId : "demo") }
function boardPins(){
  if(!_boardPins){
    try { _boardPins = JSON.parse(localStorage.getItem(boardPinsKey()) || "{}") } catch { _boardPins = {} }
  }
  return _boardPins
}
function boardPinsSave(){
  try {
    const pins = boardPins()
    const keys = Object.keys(pins)
    // cap: drop oldest-inserted beyond 200 (object key order = insertion)
    keys.slice(0, Math.max(0, keys.length - 200)).forEach(k => delete pins[k])
    localStorage.setItem(boardPinsKey(), JSON.stringify(pins))
  } catch {}
}
function boardPinRecord(b){
  boardPins()[b.ident] = { lx: Math.round(b.x * 10) / 10, ly: Math.round(b.y * 10) / 10 }
  boardPinsSave()
}
function boardPinsClear(){
  _boardPins = {}
  try { localStorage.removeItem(boardPinsKey()) } catch {}
}
function boardNotePendingSpawn(accountId, assetId, x, y){
  if(!accountId || !assetId) return
  _boardPendingSpawns = _boardPendingSpawns.filter(p => Date.now() - p.ts < 15000)
  _boardPendingSpawns.push({ accountId, assetId, x, y, ts: Date.now() })
}
// consume a pending drop point matching this fresh body (any zone of the
// drop account — offers land in |basket, picks in the shopper's basket too)
function boardPendingSpawnTake(b, z){
  const env = _boardSimEnv
  if(!env || !_boardPendingSpawns.length) return null
  const assetId = b.el?.dataset?.assetId || ""
  const i = _boardPendingSpawns.findIndex(p =>
    Date.now() - p.ts < 15000 && p.assetId === assetId && b.zoneKey.startsWith(p.accountId + "|"))
  if(i < 0) return null
  const p = _boardPendingSpawns.splice(i, 1)[0]
  const gx = p.x - env.cx, gy = p.y - env.cy
  const lx = gx * z.cos + gy * z.sin, ly = -gx * z.sin + gy * z.cos
  return boardWallClamp(env, z, b, lx, ly, false)
}

// drag-to-arrange: place the chip under srcEl at screen point (x,y) IF that
// point lies in the chip's own zone (judged by the wall clamp — a point
// whose clamped position is far away wasn't really in the zone). Returns
// true when the arrange happened (callers then skip drop semantics).
// BOARD-ARRANGEOTHERS1 R3 (user 2026-08-06): where would this chip actually be
// allowed to sit, in SCREEN coordinates, if released at (x,y)? Used to fence the
// drag itself rather than only the release: "let's not allow the asset to move
// out of that segment — it just stops dead in the store area, and your finger can
// carry on sliding, but you're not going to be able to get the asset out, because
// it's not your asset". Teaching the rule by making it unreachable beats letting
// the chip wander and silently snapping it back.
// Returns null when there's nothing to clamp against (no body/zone, or an inner
// rim body, which has its own angular rules) — callers then leave the drag alone.
// ── BOARD-ARRANGEFENCE1 R4 (user 2026-08-06) ────────────────────────────────
// "I was able to drop the chip into the middle logo where the K is, but I haven't
// managed to reproduce it since."
// Reproducible, and it is the SPOKE LEAK ONE WALL OVER. boardWallClamp applies
// the radial floor and the angular wall first, then BOARD-SAFEAREA1's box clamp
// rewrites the position in SCREEN space — and never re-checks either wall. From a
// point near the far screen edge that box step lands the chip near the board
// CENTRE. Measured before this fix, sweeping every zone at 8px: a reachable
// radius of 2px (the middle of the hub) and 212-504 of 5610 points per zone
// finishing inside the hub.
// The cure is the same shape as R2's, generalised: SETTLE the constraints instead
// of applying them once. A second pass converges because the point is already
// inside the safe rect by then, so the box step is a no-op and only the walls
// act. The angular re-assert (R2) stays as the final guarantee, and now covers
// both arrange entry points instead of only the drag.
// Still deliberately OUTSIDE boardWallClamp — that is the physics' per-frame
// solver, where safe-area-wins is the correct precedence (a chip must never be
// parked off-screen). This is the hand-placement fence, where the walls win.
function boardFenceClamp(env, z, body, lx, ly){
  const p = boardWallClamp(env, z, body, lx, ly, false)
  // Re-assert the walls AFTER the box clamp, angular first so the radial floor is
  // measured along a legal direction. Not a second boardWallClamp pass: that just
  // re-runs the box step and the two constraints trade the point back and forth
  // (measured — a re-run still reached radius 2px, and made basket zones worse).
  // Here the walls simply win, which is safe on this path because a chip sitting
  // in its own band at a legal angle is on-screen by construction.
  const halfRad = ((z.halfDegFull ?? z.halfDeg) * Math.PI) / 180
  let off = Math.atan2(p.y, p.x)
  let r = Math.hypot(p.x, p.y) || 1
  if(Math.abs(off) > halfRad) off = halfRad * (off < 0 ? -1 : 1)
  // radial floor, mirroring boardWallClamp's own: the basket clears the hub, the
  // store clears the rim + counter band, both by the chip's half-extent along the
  // ray. THIS is the wall that the box clamp was bypassing to land chips on the K.
  const thS = z.midRad + off
  const he = (Math.abs(Math.cos(thS)) * body.w + Math.abs(Math.sin(thS)) * body.h) / 2
  const minR = z.isBasket ? z.rMin + he : boardRimAt(env, thS) + 8 + (z.band ?? 52) + he
  if(r < minR) r = minR
  const out = { x: r * Math.cos(off), y: r * Math.sin(off) }
  // and keep the chip's BOX inside the angular wall, the same way the clamp does
  const maxY = Math.max(2, out.x * z.tanHalf - body.w / 2)
  out.y = Math.max(-maxY, Math.min(maxY, out.y))
  return out
}

function boardArrangeClamp(srcEl, x, y){
  const env = _boardSimEnv
  if(!env || !srcEl) return null
  let body = null
  _boardSimBodies.forEach(b => { if(b.el === srcEl) body = b })
  if(!body || body.inner) return null
  const z = _boardSimZones.get(body.zoneKey)
  if(!z) return null
  const gx = x - env.cx, gy = y - env.cy
  const lx = gx * z.cos + gy * z.sin, ly = -gx * z.sin + gy * z.cos
  const p = boardFenceClamp(env, z, body, lx, ly)

  // How far did the finger have to be corrected? Measured ONCE, at the end, over
  // every constraint together. Small corrections are normal tracking (the chip's
  // box being kept inside the band); a large one means the finger has genuinely
  // left the space this chip may occupy, which is what the freeze keys off.
  // 20px ≈ a third of a chip: past that it is unambiguous, and below it the chip
  // still slides naturally into the corner rather than stopping short.
  const outside = Math.hypot(p.x - lx, p.y - ly) > 20
  // local (radial/tangential) → screen, the inverse of the projection above
  return {
    x: env.cx + p.x * z.cos - p.y * z.sin,
    y: env.cy + p.x * z.sin + p.y * z.cos,
    outside
  }
}

function boardArrangeAt(srcEl, x, y){
  const env = _boardSimEnv
  if(!env || !srcEl) return false
  let body = null
  _boardSimBodies.forEach(b => { if(b.el === srcEl) body = b })
  if(!body) return false
  const z = _boardSimZones.get(body.zoneKey)
  if(!z) return false
  const gx = x - env.cx, gy = y - env.cy
  const lx = gx * z.cos + gy * z.sin, ly = -gx * z.sin + gy * z.cos
  // BOARD-RIMARRANGE1 (user 2026-08-04): an on-offer chip — simple mode's rim
  // pile, or a ghost — may be REARRANGED ALONG THE COUNTER RING. Before the
  // counterless change you moved a reservation by moving its store pile and
  // the ghost followed; with one chip doing both jobs there was no way left to
  // tidy it, short of withdraw → move → re-offer (which redraws the line from
  // somewhere else — "obviously not satisfactory"). Two zones, as the user put
  // it: chips AUTO-place in the store rows, but a chip that's on offer may
  // also be hand-placed anywhere in the counter band — and only an on-offer
  // chip may be there ("you can only put an asset there if it's on offer",
  // which is what makes the spotlight read).
  // BOARD-PLAYERSCOPE1 guard: never pin a chip into a zone that isn't its own.
  // Cheap, and it makes the reported symptom ("my chip stays in their store")
  // structurally impossible from this path whatever the root cause turns out to
  // be. Logged rather than silent, so it shows up if it ever does fire.
  const zoneAcct = body.zoneKey.slice(0, body.zoneKey.lastIndexOf("|"))
  const owner = srcEl.dataset?.ownerAccount
  if(owner && !body.zoneKey.endsWith("|basket") && owner !== zoneAcct){
    boardDiag("board:arrange:refused-zone", { zone: zoneAcct, chipOwner: owner })
    return false
  }
  if(body.inner) return boardArrangeRim(body, z, lx, ly)
  // ── BOARD-ARRANGEFENCE1 (user 2026-08-06, and the actual BOARD-PLAYERSCOPE1
  // root cause) ─────────────────────────────────────────────────────────────
  // "I took one of my assets from 25200 and dropped it into the OTHER player's
  // store area, also 25200… it got stuck in the other player's store. I know
  // it's not just a placement issue, because when I drop it there it doesn't ask
  // me if I want to offer that amount — it just literally moves the chip."
  // No amount prompt means it never reached the drop path: this function claimed
  // the release as an ARRANGE and pinned it.
  //
  // Why it could: this used to be fenced only by the wall clamp's TANGENTIAL
  // limit, maxY = x·tan(halfDeg) − w/2, with halfDeg capped at 80° to stop tan
  // blowing up near 90°. That cap is exactly what breaks it. With TWO segments
  // each is 180° wide, so halfDeg 89 → capped to 80 → tan 5.67, and at any real
  // radius maxY is larger than the screen — the fence is simply not there, and a
  // release anywhere in the safe rect gets pinned. Two players sharing one
  // account id is precisely the configuration that produces a two-segment board,
  // which is why it looked like an account-scoping bug: the chip stayed in ITS
  // OWN zone (the paint invariant never fired, correctly) but that zone is half
  // the board, and both segments carry the same etched account id.
  // Also explains the spatial signature: dropping in the MIDDLE worked because
  // the basket radius is outside the store zone's radial band, so the clamp moved
  // the point >48px and this function declined — falling through to the offer.
  // Fix: fence on the TRUE segment angle, the way boardArrangeRim always has.
  // halfDegFull is the real divider-to-divider half width (the physics' halfDeg
  // is deliberately shaved), so this matches the wedge you can actually see.
  const off = Math.atan2(ly, lx)
  const halfRad = (z.halfDegFull ?? z.halfDeg) * Math.PI / 180
  if(Math.abs(off) > halfRad) return false          // another segment's air
  const p = boardFenceClamp(env, z, body, lx, ly)
  if(Math.hypot(p.x - lx, p.y - ly) > 48) return false
  body.x = p.x; body.y = p.y
  body.pin = true
  boardPinRecord(body)
  boardSimExcite()   // neighbours make room; the pinned chip itself won't budge
  return true
}

// BOARD-RIMARRANGE1: hand-place an on-offer chip along the counter ring. Only
// the ANGLE of the release is taken — the paint's radial pin already holds
// every inner body on the rim band, so writing the raw local drop point and
// letting the pin normalise the radius keeps the two in agreement by
// construction. Releases outside the band fall through (return false) so the
// existing ghost gestures still work: drag home into the store = withdraw,
// drag onto another segment = redirect.
function boardArrangeRim(body, z, lx, ly){
  const env = _boardSimEnv
  const r = Math.hypot(lx, ly)
  if(!r) return false
  const off = Math.atan2(ly, lx)                       // angle within the segment
  const halfRad = Math.min(z.halfDeg, 80) * Math.PI / 180
  if(Math.abs(off) > halfRad) return false             // another segment's air
  const rim = boardRimAt(env, z.midRad + off)
  const band = z.band || 52
  // generous radial tolerance: the finger lands where the chip LOOKS, and the
  // chip straddles the rim by half its own height
  if(r < rim - 24 || r > rim + band + 24) return false
  body.x = lx; body.y = ly
  body.pin = true
  body.rimpin = true      // paint: respect this angle, skip the pile→basket alignment
  boardPinRecord(body)
  boardSimExcite()
  return true
}

// mouse dnd plumbing for arrange: remember which chip is being dragged
// (dataTransfer is sealed during dragover/drop), and catch releases that
// never reached a drop target (dragend with nothing handled — e.g. over the
// hub) so an own-zone release still arranges.
document.addEventListener("dragstart", e => {
  const chip = e.target?.closest?.(".board-chip")
  window.__boardDragEl = chip || null
  window.__boardDropHandled = false
  // BOARD-DRAGREPAINT1 R2: hold repaints for the DESKTOP drag too — this is the
  // half BOARD-DRAGFLICKER1 never covered, and the reason the board went blank
  // under a mouse drag while the touch path had been quiet since 2026-08-05.
  if(chip) boardEnterDrag()
  if(chip) window.__boardDropTradeLine?.()   // BOARD-TRADELINESTALE1
}, true)
document.addEventListener("drop", () => { window.__boardDropHandled = true }, true)
document.addEventListener("dragend", e => {
  const el = window.__boardDragEl
  window.__boardDragEl = null
  boardReleaseRepaintHold()
  if(!el || window.__boardDropHandled) return
  if(e.clientX || e.clientY) boardArrangeAt(el, e.clientX, e.clientY)
})

// one place owns entering/leaving the drag state, so the touch path, the desktop
// path and any future one can't drift apart. It carries the repaint hold
// (BOARD-DRAGREPAINT1) and sets body.board-dragging as a state hook.
// NOTE: that class must NEVER be used to disable pointer-events on chips —
// BOARD-DROPHIT1 R1 did exactly that and killed native HTML5 dnd outright, since
// dnd resolves its source and targets through the same hit test. Segment
// resolution belongs in boardWedgeAt(), which reads the hit STACK instead.
function boardEnterDrag(){
  window.__boardDragging = true
  window.__boardDragSince = Date.now()
  document.body.classList.add("board-dragging")
}
function boardReleaseRepaintHold(){
  window.__boardDragging = false
  window.__boardDragPayload = null   // the source-segment check must not see a stale drag
  document.body.classList.remove("board-dragging")
  if(!window.__boardRenderPending) return
  window.__boardRenderPending = false
  setTimeout(() => { try { render() } catch(e){} }, 0)
}

// KATUI3 R2: render hold while a full-screen modal covers the board — see the guard
// in render(). On window (not a bare function) because katomia-profile.js loads on
// EVERY page and must be able to call it optionally (`window.boardModalHold?.()`).
// R3 (third mobile report): the catch-up used setTimeout(0), which Chrome runs
// BEFORE the next paint — so the full board rebuild could block the very frame that
// hides the modal, re-creating the freeze the hold was built to kill. Now rAF →
// setTimeout: the rAF fires just before the close frame, the timeout lands AFTER it
// was committed, so the modal visibly closes first and the rebuild follows. Timed
// (board:modalhold:catchup) so a slow rebuild on a phone shows up in kdiag.
window.boardModalHold = on => {
  window.__boardModalHold = !!on
  if(on || !window.__boardRenderPending) return
  window.__boardRenderPending = false
  requestAnimationFrame(() => setTimeout(async () => {
    const t0 = performance.now()
    try { await render() } catch(e){}
    boardDiag("board:modalhold:catchup", { renderMs: Math.round(performance.now() - t0) })
  }, 0))
}

function boardSimExcite(){
  _boardSimCalm = 0
  _boardSimQuiet = 0
  _boardSimFrames = 0
  if(!_boardSimRaf) _boardSimRaf = requestAnimationFrame(boardSimFrame)
}

// BOARD-SIMGIVEUP1 (user 2026-08-06): "if I squash the board up to a really
// small space it's jittering crazily… some way to make the assets give up
// their movement and just sit still instead of thrashing — we need some way to
// terminate the animation early."
// The settle test (movement under threshold) can never fire when the space is
// genuinely over-subscribed: the walls and the collisions have no solution, so
// the bodies oscillate between two impossible states forever. A frame budget
// is the honest answer — after ~2.5s of not converging the sim STOPS where it
// is and pins every body, so a cramped board is merely imperfect rather than
// alive. Any real change (new chip, resize, layout toggle) calls boardSimExcite
// and gets a fresh budget.
const BOARD_SIM_MAX_FRAMES = 150
let _boardSimFrames = 0

function boardSimFrame(){
  _boardSimRaf = 0
  if(!_boardSimEnv || !_boardSimBodies.size) return
  const moved = boardSimTick(2)
  boardSimPaint()
  _boardSimFrames++
  if(moved < 0.15) _boardSimQuiet++
  else _boardSimQuiet = 0
  const givenUp = _boardSimFrames >= BOARD_SIM_MAX_FRAMES
  if(_boardSimQuiet < 3 && !givenUp) _boardSimRaf = requestAnimationFrame(boardSimFrame)
  else {
    // Stopping the rAF loop IS the fix — no frames, no jitter, the chips stay
    // exactly where the last tick left them.
    // R2 (user 2026-08-06, "my own chips glitch a little bit and then they get
    // stuck"): a give-up must NOT set the sticky flags. 🧪 sticky defaults ON,
    // and boardSimTick skips springs entirely for a stuck body — so sticking
    // every chip after an unconverged run froze the whole layout permanently,
    // which is the opposite of what sticky means ("everything found its place,
    // freeze it there"). On a give-up nothing found its place. kdiag showed this
    // firing 332 times in 45 minutes on a live board, so it was near-permanent.
    // Only a CLEAN settle sticks, exactly as before BOARD-SIMGIVEUP1.
    if(!givenUp && boardStickyChips) _boardSimBodies.forEach(b => { b.stick = true })
    if(givenUp) boardDiag("board:sim:giveup", { bodies: _boardSimBodies.size, moved: Math.round(moved * 100) / 100 })
  }
}

// ── OVAL-TRUE WALLS (user 2026-07-16 — the zone-walls overlay's "massive
// reveal"): the radial walls used to be scalar radii sampled at the segment
// MID-ANGLE (zone.rMin/rMax), i.e. CIRCLES — but the rim is an ELLIPSE and
// the screen a rectangle. On a square screen circle≈ellipse and it looked
// right; portrait/landscape put every wall visibly away from the felt: chips
// obeyed invisible circles, baskets poked out of the oval's sides, stores
// stood far off the rim at N/S. Now every radial wall evaluates at the
// chip's OWN screen angle against the TRUE shapes — hub circle, rim ellipse
// (env.oval), screen edge — via these helpers, shared by the physics tick,
// the shelf-target clamp AND the 🧪 walls overlay, so what's drawn is what's
// enforced, by construction.
function boardRimAt(env, th){
  const o = env.oval
  return (o.rx * o.ry) / Math.hypot(o.ry * Math.cos(th), o.rx * Math.sin(th))
}
function boardEdgeAt(env, th){
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th))
  return Math.min(c > 1e-6 ? (env.W / 2) / c : Infinity, s > 1e-6 ? (env.H / 2) / s : Infinity)
}
// clamp a zone-local point to the zone's walls: radial (at the point's own
// angle), angular wedge (straight spokes), safe screen rect. soft=true keeps
// the outer wall springy (physics — pressure spills gradually); false snaps
// it hard (shelf-target clamping, so targets are feasible and the tick's
// spring never fights the wall — that fight would jitter forever).
function boardWallClamp(env, z, b, x, y, soft){
  const r0 = Math.hypot(x, y) || 0.001
  const thL = Math.atan2(y, x)
  const thS = z.midRad + thL
  // chip half-extent along the radial direction (chips are screen-axis-
  // aligned boxes; their reach along a ray depends on the ray's angle)
  const he = (Math.abs(Math.cos(thS)) * b.w + Math.abs(Math.sin(thS)) * b.h) / 2
  let r = r0
  const rim = boardRimAt(env, thS)
  const minR = z.isBasket ? z.rMin + he : rim + 8 + z.band + he
  if(r < minR) r = minR
  // basket outer: rim minus the 6px oval inset minus the 34px coin-label
  // band (BOARD-IDCOIN1); store outer: screen edge minus 14
  const maxR = z.isBasket ? rim - 6 - 34 - he : boardEdgeAt(env, thS) - 14 - he
  if(r > maxR) r = soft ? r - (r - maxR) * 0.3 : maxR
  if(r !== r0){ x = r * Math.cos(thL); y = r * Math.sin(thL) }
  const maxY = Math.max(2, x * z.tanHalf - b.w / 2)
  y = Math.max(-maxY, Math.min(maxY, y))
  // BOARD-SAFEAREA1: clamp the box into the measured visible rect (banner
  // bottom / footer top / side margins) — catches tangential corner spill
  const left = env.cx + x * z.cos - y * z.sin - b.w / 2
  const top = env.cy + x * z.sin + y * z.cos - b.h / 2
  const cl = Math.max(env.safeL, Math.min(left, env.safeR - b.w))
  const ct = Math.max(env.safeTop, Math.min(top, env.safeBot - b.h))
  if(cl !== left || ct !== top){
    const gx = cl + b.w / 2 - env.cx, gy = ct + b.h / 2 - env.cy
    x = gx * z.cos + gy * z.sin
    y = -gx * z.sin + gy * z.cos
  }
  return { x, y }
}

// one physics step: springs → collisions → walls → screen clamps, in the
// zone-local frame. Ghosts (inner) don't participate — the reserved rim band
// already keeps store chips off their patch, and the paint pass pins them to
// the rim / their pile→basket line. Returns the largest displacement, which
// boardSimFrame uses for settle detection. The anchor spring is damped by
// time-since-excitement so the organic equilibrium (spring-in vs push-apart)
// provably converges instead of oscillating at the blob's edge; collision
// resolution stays undamped — overlaps always resolve.
function boardSimTick(iters){
  const env = _boardSimEnv
  if(!env) return 0
  const speed = Math.min(1, boardAnimSpeed || 1)   // Prefs debug throttle rides the sim too
  const damp = 1 / (1 + _boardSimCalm * 0.05)
  _boardSimCalm++
  const shelves = boardLayoutMode === "shelves"
  const byZone = new Map()
  _boardSimBodies.forEach(b => {
    if(!b.el || b.inner) return
    let arr = byZone.get(b.zoneKey)
    if(!arr) byZone.set(b.zoneKey, arr = [])
    arr.push(b)
    b.px0 = b.x; b.py0 = b.y
  })
  for(let it = 0; it < iters; it++){
    byZone.forEach((movers, zk) => {
      const z = _boardSimZones.get(zk)
      if(!z) return
      movers.forEach(b => {
        if(b.pin) return                         // user-pinned: no layout spring, ever
        if(boardStickyChips && b.stick) return   // 🧪 sticky: settled chips feel no springs
        if(shelves){
          if(b.tx != null){ b.x += (b.tx - b.x) * 0.22 * speed; b.y += (b.ty - b.y) * 0.22 * speed }
        } else if(boardAutoArrange){             // BOARD-AUTOARRANGE1: off = chips don't re-home
          b.x += (z.ax - b.x) * 0.03 * speed * damp
          b.y -= b.y * 0.03 * speed * damp
        }
      })
      // SOLID CHIPS (user 2026-07-16: chips were "stacking on top of each
      // other quite heavily — consider them solid objects"): rectangle
      // overlap resolved along the smaller-overlap axis, board-game style.
      // The old circle colliders over-forgave rectangles: a wide text chip's
      // bounding circle × the 0.88 snuggle let another chip sink ~26px into
      // it along the short axis. Chips are SCREEN-axis-aligned rectangles
      // and the local frame is rotated, so the AABB test projects the pair
      // delta to screen, pushes there, and rotates the push back (pure
      // rotation — lengths survive). 60% of the separation per iteration
      // keeps the motion smooth; the iterations finish the job, so settled
      // chips end fully apart (4px seam). cr circles stay as the broadphase.
      // BOARD-AUTOARRANGE1: with auto-arrange off the chips are no longer solid
      // to each other — they stack, which is the whole point of the setting.
      // The wall/label passes below are deliberately OUTSIDE this gate.
      if(!shelves && boardAutoArrange) for(let a = 0; a < movers.length; a++) for(let c = a + 1; c < movers.length; c++){
        const A = movers[a], B = movers[c]
        const dx = B.x - A.x, dy = B.y - A.y
        if(Math.hypot(dx, dy) > A.cr + B.cr) continue      // broadphase: rects can't touch
        const dxs = dx * z.cos - dy * z.sin                // pair delta, screen frame
        const dys = dx * z.sin + dy * z.cos
        const ox = (A.w + B.w) / 2 + 4 - Math.abs(dxs)
        const oy = (A.h + B.h) / 2 + 4 - Math.abs(dys)
        if(ox <= 0 || oy <= 0) continue
        let px = 0, py = 0                                 // screen-frame push on B
        if(dxs === 0 && dys === 0){ px = a % 2 ? 4 : -4; py = 4 }   // dead-centre stack: deterministic nudge
        else if(ox < oy) px = (dxs >= 0 ? 1 : -1) * ox
        else py = (dys >= 0 ? 1 : -1) * oy
        // 🧪 sticky: a settled chip is immovable in collisions — the other
        // party takes the WHOLE separation (board-game feel: your placed
        // pieces stay put, arrivals find space around them). Both sticky
        // (walls squeezed them together) → both move, or they'd never part.
        // User-pinned chips (BOARD-ARRANGE1) hold the same way, regardless
        // of the 🧪 sticky setting.
        const aHold = A.pin || (boardStickyChips && A.stick)
        const bHold = B.pin || (boardStickyChips && B.stick)
        const aStick = aHold && !bHold
        const bStick = bHold && !aHold
        const f = 0.3 * speed                              // half each side × 0.6 step
        const plx = (px * z.cos + py * z.sin) * f
        const ply = (-px * z.sin + py * z.cos) * f
        if(!aStick){ A.x -= plx * (bStick ? 2 : 1); A.y -= ply * (bStick ? 2 : 1) }
        if(!bStick){ B.x += plx * (aStick ? 2 : 1); B.y += ply * (aStick ? 2 : 1) }
      }
      movers.forEach(b => {
        // walls: oval-true radial (at the chip's own angle) + angular +
        // safe rect — the shared clamp, soft outer (pressure spills)
        const p = boardWallClamp(env, z, b, b.x, b.y, true)
        b.x = p.x; b.y = p.y
      })
    })
  }
  // SPOKE-LABEL KEEP-OUT (user 2026-07-15): etched account numbers along the
  // segment boundaries are no-chip zones. Same screen-space push as before,
  // but now part of the tick, so the collision pass re-resolves any overlap
  // the push creates. Skipped during tweens (labels are mid-motion).
  if(env.labelRects.length) byZone.forEach((movers, zk) => {
    const z = _boardSimZones.get(zk)
    if(!z) return
    movers.forEach(b => {
      let left = env.cx + b.x * z.cos - b.y * z.sin - b.w / 2
      let top = env.cy + b.x * z.sin + b.y * z.cos - b.h / 2
      let hit = false
      env.labelRects.forEach(r => {
        const pad = 4
        const ox = Math.min(left + b.w, r.right + pad) - Math.max(left, r.left - pad)
        const oy = Math.min(top + b.h, r.bottom + pad) - Math.max(top, r.top - pad)
        if(ox <= 0 || oy <= 0) return
        hit = true
        if(ox < oy) left += (left + b.w / 2 < (r.left + r.right) / 2 ? -ox : ox)
        else top += (top + b.h / 2 < (r.top + r.bottom) / 2 ? -oy : oy)
      })
      if(hit){
        const gx = left + b.w / 2 - env.cx, gy = top + b.h / 2 - env.cy
        b.x = gx * z.cos + gy * z.sin
        b.y = -gx * z.sin + gy * z.cos
      }
    })
  })
  let maxMove = 0
  byZone.forEach(movers => movers.forEach(b => {
    maxMove = Math.max(maxMove, Math.hypot(b.x - b.px0, b.y - b.py0))
  }))
  return maxMove
}

// project bodies to the screen and write left/top (center-based: the
// half-size offset is applied here, so a width change never moves a chip's
// center). Ghosts are pinned each paint: radially to the rim band, and —
// when both endpoints exist — onto their pile→basket line (BOARD-CHIPLINE1
// colinear geometry, same intersection math as before, now recomputed every
// painted frame so the alignment TRACKS the moving pile/basket chips). The
// hover trade line is re-aimed whenever anything moved.
function boardSimPaint(){
  const env = _boardSimEnv
  if(!env) return
  const piles = new Map(), baskets = new Map(), ghosts = []
  let movedAny = false
  const place = (b, z) => {
    const left = env.cx + b.x * z.cos - b.y * z.sin - b.w / 2
    const top = env.cy + b.x * z.sin + b.y * z.cos - b.h / 2
    if(b.pl !== left || b.pt !== top){
      b.el.style.left = left + "px"
      b.el.style.top = top + "px"
      b.pl = left; b.pt = top
      movedAny = true
    }
    return { left, top }
  }
  _boardSimBodies.forEach(b => {
    const z = _boardSimZones.get(b.zoneKey)
    if(!z || !b.el) return
    if(b.inner){ ghosts.push({ b, z }); return }
    const { left, top } = place(b, z)
    const d = b.el.dataset
    if(z.isBasket && d.ownerAccount && d.assetId && d.toAccount)
      baskets.set(d.ownerAccount + "|" + d.assetId + "|" + d.toAccount, { x: left + b.w / 2, y: top + b.h / 2 })
    else if(!z.isBasket && d.ownerAccount && d.assetId)
      piles.set(d.ownerAccount + "|" + d.assetId, { x: left + b.w / 2, y: top + b.h / 2 })
  })
  const pairSeen = new Map()   // net-off duplicates of a pair fan along the line's normal
  ghosts.forEach(({ b, z }) => {
    b._aligned = false
    // rim pin, oval-true: project the ghost radially onto the rim band at
    // its OWN angle (the old scalar z.rMin pinned it to the mid-angle
    // CIRCLE — visibly off the ellipse at N/S on portrait screens)
    {
      const rr = Math.hypot(b.x, b.y) || 1
      const thS = z.midRad + Math.atan2(b.y, b.x)
      const he = (Math.abs(Math.cos(thS)) * b.w + Math.abs(Math.sin(thS)) * b.h) / 2
      const pin = boardRimAt(env, thS) + 8 + he
      b.x = b.x / rr * pin
      b.y = b.y / rr * pin
    }
    const d = b.el.dataset
    // BOARD-RIMARRANGE1: hand-placed on the ring — the user's angle wins over
    // the pile→basket alignment below (that alignment IS the thing they were
    // overriding). The hover line re-aims to wherever they put it.
    if(b.rimpin){ b._aligned = true; return }
    if(env.oval && !env.party && d.ownerAccount && d.assetId && d.toAccount){
      const P = piles.get(d.ownerAccount + "|" + d.assetId)
      const B = baskets.get(d.ownerAccount + "|" + d.assetId + "|" + d.toAccount)
      if(P && B){
        // intersect P + t(B−P) with the rim band ellipse: P is outside it
        // (store zone starts at oval+8), B inside (basket ends at oval−6),
        // so exactly one root lands in (0,1)
        const eA = env.oval.rx + 8 + b.h / 2, eB = env.oval.ry + 8 + b.h / 2
        const u = (P.x - env.cx) / eA, v = (P.y - env.cy) / eB
        const du = (B.x - P.x) / eA, dv = (B.y - P.y) / eB
        const qa = du * du + dv * dv
        const qb = 2 * (u * du + v * dv)
        const qc = u * u + v * v - 1
        const disc = qb * qb - 4 * qa * qc
        if(disc > 0 && qa){
          const sq = Math.sqrt(disc)
          const t = [(-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa)].find(t => t > 0 && t < 1)
          if(t != null){
            let gx = P.x + t * (B.x - P.x), gy = P.y + t * (B.y - P.y)
            const pk = d.ownerAccount + "|" + d.assetId + "|" + d.toAccount
            const n = pairSeen.get(pk) || 0
            pairSeen.set(pk, n + 1)
            if(n){
              const len = Math.hypot(B.x - P.x, B.y - P.y) || 1
              gx += (-(B.y - P.y) / len) * n * (b.h + 4)
              gy += ((B.x - P.x) / len) * n * (b.h + 4)
            }
            b.x = (gx - env.cx) * z.cos + (gy - env.cy) * z.sin
            b.y = -(gx - env.cx) * z.sin + (gy - env.cy) * z.cos
            b._aligned = true
          }
        }
      }
    }
  })
  // BOARD-COUNTERMODE1: the rim band can now hold several UNPAIRED items per
  // zone — rim piles (simple mode's decremented remainder stacks) alongside
  // NFT ghosts — and radial pinning preserves each one's own angle, so two
  // that started near the same angle sat on top of each other (QA screenshot:
  // the 250-USDC pile under the Kat ghost). Tangential de-overlap sweep, per
  // zone: sort by local y, push apart to chip-width + 6px, never moving a
  // line-ALIGNED ghost (its spot IS the pile→basket line). Idempotent — once
  // separated, later paints find no overlap and change nothing.
  {
    const byZone = new Map()
    ghosts.forEach(g => {
      const list = byZone.get(g.b.zoneKey) || []
      list.push(g.b)
      byZone.set(g.b.zoneKey, list)
    })
    byZone.forEach(list => {
      if(list.length < 2) return
      list.sort((a, b) => a.y - b.y)
      for(let i = 1; i < list.length; i++){
        const p = list[i - 1], c = list[i]
        const need = (p.w + c.w) / 2 + 6
        if(c.y - p.y < need){
          // never shove a HAND-PLACED chip (rimpin) or a line-aligned ghost —
          // both positions are meaningful; the free one yields
          if(!c._aligned && !c.rimpin) c.y = p.y + need
          else if(!p._aligned && !p.rimpin) p.y = c.y - need
        }
      }
    })
  }
  ghosts.forEach(({ b, z }) => place(b, z))
  // BOARD-LINEZ1: the hover line now lives inside #boardRoot, which
  // root.replaceChildren() wipes on every render — so redraw it EVERY paint,
  // not only when something moved (a no-op with no pair on show). Trails keep
  // the movement-gated reanchor; their layer is a body-level sibling.
  window.__boardRefreshTradeLine?.()
  // BOARD-TRAILANCHOR1: reanchor EVERY paint, not only when a chip moved. The
  // movement gate was fine when trails were only redrawn to follow chips, but
  // it also gated the layer re-adoption and the stale-leg cleanup above — a
  // render that rebuilt the DOM without moving anything left the lines
  // detached and pointing at the previous layout.
  boardReanchorTrails()
}

// 🧪 zone-walls debug overlay (user 2026-07-16): the sim's REAL constraint
// geometry, drawn — "if there's a problem with the way the walls are drawn,
// that might be a clue". Solid outline = the region a chip's EDGES may
// occupy (inner + angular walls hard, outer wall soft); the angular walls
// are the ±80°-CLAMPED ones the physics actually enforces, so on an obtuse
// segment the overlay is visibly narrower than the felt wedge — that gap is
// real, not a drawing bug. Dashed inner strip = the ghost-only rim band
// ("cashier's counter"); dashed screen rect = the BOARD-SAFEAREA1 clamp.
// Rebuilt every apply so it tracks rotation and tweens; under the chips
// (z4) so they stay readable. These wedge paths are also the natural hook
// for LATER per-zone highlighting (hover/drop-target lighting) — same
// geometry, different class.
function boardDrawZoneWalls(){
  document.querySelector(".board-zonewalls")?.remove()
  const env = _boardSimEnv
  if(!boardZoneWalls || !env) return
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "board-zonewalls")
  // oval-true: each boundary radius is a FUNCTION of the absolute screen
  // angle, evaluated per sample — the exact same boardRimAt/boardEdgeAt the
  // physics clamps use, so the drawing IS the enforcement (the 2026-07-16
  // circular-walls bug can't silently return)
  const wedge = (z, rInAt, rOutAt, cls) => {
    const half = Math.min(z.halfDeg, 80)
    const steps = 24
    const pts = []
    for(let i = 0; i <= steps; i++){
      const a = (-half + 2 * half * i / steps) * Math.PI / 180
      const r = rInAt(z.midRad + a)
      pts.push([r * Math.cos(a), r * Math.sin(a)])
    }
    for(let i = steps; i >= 0; i--){
      const a = (-half + 2 * half * i / steps) * Math.PI / 180
      const r = rOutAt(z.midRad + a)
      pts.push([r * Math.cos(a), r * Math.sin(a)])
    }
    const d = pts.map(([lx, ly], i) =>
      (i ? "L" : "M")
      + (env.cx + lx * z.cos - ly * z.sin).toFixed(1) + " "
      + (env.cy + lx * z.sin + ly * z.cos).toFixed(1)).join(" ") + " Z"
    const p = document.createElementNS(NS, "path")
    p.setAttribute("d", d)
    p.setAttribute("class", cls)
    svg.appendChild(p)
  }
  _boardSimZones.forEach(z => {
    if(z.isBasket)
      wedge(z, () => z.rMin, th => boardRimAt(env, th) - 6 - 34,
        "board-zonewall board-zonewall--basket")
    else {
      wedge(z, th => boardRimAt(env, th) + 8 + z.band, th => boardEdgeAt(env, th) - 14,
        "board-zonewall board-zonewall--store")
      wedge(z, th => boardRimAt(env, th) + 8, th => boardRimAt(env, th) + 8 + z.band,
        "board-zonewall board-zonewall--band")
    }
  })
  const rect = document.createElementNS(NS, "rect")
  rect.setAttribute("x", env.safeL)
  rect.setAttribute("y", env.safeTop)
  rect.setAttribute("width", env.safeR - env.safeL)
  rect.setAttribute("height", env.safeBot - env.safeTop)
  rect.setAttribute("class", "board-zonewall board-zonewall--safe")
  svg.appendChild(rect)
  document.getElementById("boardRoot")?.appendChild(svg)
}

// BOARD-COUNTER1 (user 2026-08-03): make the counter — the ghost-only band between
// the basket rim and the store — VISIBLY its own region instead of an invisible
// rule chips obey. Three tones per segment: light basket, darkest counter, current
// store wash. Painted from the sim's own band geometry (the exact walls the 🧪
// overlay shows), tinted per player so the barrier still belongs to that player's
// colour scheme; the edge stroke is a darker blend of the same colour rather than
// a neutral grey (same idea as ringDividerTint). Rebuilt every apply, under the
// chips, independent of the zone-walls debug toggle.
function boardDrawCounterShade(){
  document.querySelector(".board-countershade")?.remove()
  const env = _boardSimEnv
  if(!env || !ring16()) return
  // BOARD-COUNTERMODE1 (user 2026-08-04): simple mode drops the visible
  // counter band — the rim band's GEOMETRY (physics reservation) stays, but
  // nothing is drawn; the counter idea survives as spatial separation only.
  // The classic 🧪 toggle brings the tint back.
  if(boardCounterSimple()) return
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "board-countershade")
  const dark = [60, 48, 22]   // the storeshade brown — keeps the tones one family
  _boardSimZones.forEach((z, key) => {
    if(z.isBasket || !z.midRad) return
    const acctId = String(key).replace(/\|store$/, "")
    const playerId = (typeof state !== "undefined" && state?.accounts?.[acctId]?.playerId) || null
    const rgb = boardHexToRgb(getPlayerColour(playerId)) || [153, 153, 153]
    const mix = k => rgb.map((v, i) => Math.round(v * (1 - k) + dark[i] * k)).join(",")
    const band = z.band || 52
    // R2 (user 2026-08-03): full divider-to-divider sweep — the physics' shaved,
    // ±80°-clamped half left a visible gap between adjacent counters (huge with
    // two players, where 90° of arc fell to the clamp). Drawing only.
    const half = z.halfDegFull || Math.min(z.halfDeg, 80)
    // R3 (user 2026-08-03, w/ screenshot): a fixed 24 samples reads as a POLYGON
    // once one segment spans most of the circle — sample per ~1.5° of arc instead
    // (360° ≈ 240 points) so the counter is a circle, not a icositetragon.
    const steps = Math.max(24, Math.ceil(half * 2 / 1.5))
    // R3: inner edge at rim+7 = flush with the 14px lock tube's outer edge
    // (centreline is the rim), so the counter butts the lock ring, no sliver gap.
    const pts = []
    for(let i = 0; i <= steps; i++){
      const a = (-half + 2 * half * i / steps) * Math.PI / 180
      const r = boardRimAt(env, z.midRad + a) + 7
      pts.push([r * Math.cos(a), r * Math.sin(a)])
    }
    for(let i = steps; i >= 0; i--){
      const a = (-half + 2 * half * i / steps) * Math.PI / 180
      const r = boardRimAt(env, z.midRad + a) + 8 + band
      pts.push([r * Math.cos(a), r * Math.sin(a)])
    }
    const d = pts.map(([lx, ly], i) =>
      (i ? "L" : "M")
      + (env.cx + lx * z.cos - ly * z.sin).toFixed(1) + " "
      + (env.cy + lx * z.sin + ly * z.cos).toFixed(1)).join(" ") + " Z"
    const p = document.createElementNS(NS, "path")
    p.setAttribute("d", d)
    p.setAttribute("class", "board-counterband")
    p.setAttribute("fill", `rgba(${mix(0.35)},.16)`)
    p.setAttribute("stroke", `rgba(${mix(0.55)},.45)`)
    svg.appendChild(p)
  })
  document.getElementById("boardRoot")?.appendChild(svg)
}

// BOARD-LAYOUT1 (user 2026-07-14, planning pass → 🧪 toggle): deterministic
// "SHELF" layout, the alternative to the organic relax above. The screenshot
// critique — chips read as ERRATIC — has three concrete causes in the relax:
// hash-random tangential jitter, CIRCLE colliders on wide rectangular labels
// (a "Chickens feb 2024" chip gets a huge phantom radius → uneven gaps), and
// the seeding, which faithfully preserves accumulated disorder forever.
// Shelves instead: chips sit in concentric arc ROWS. Store zones shelve
// OUTWARD starting just past the ghost band; basket zones shelve INWARD from
// the oval — so everything deal-adjacent clusters at the rim (the user's
// "cashier's counter" read) and quantity spreads away from it. Rows are
// centered in the wedge; chips sort tall-first so NFT thumbs group together
// and text labels line up on their own rows. Deterministic per chip set:
// same inputs = same layout, no history drift, no seeds needed. The organic
// relax stays selectable (🧪 Settings) for live comparison.
function boardShelfZone(sizes, keys, zone, inners, isBasket){
  const halfAng = Math.min(zone.halfDeg, 80) * Math.PI / 180
  const tanHalf = Math.tan(halfAng)
  const gap = 6
  const pos = new Array(sizes.length)

  const ghostIdx = [], chipIdx = []
  sizes.forEach((s, i) => (inners?.[i] ? ghostIdx : chipIdx).push(i))

  // ghosts: single rim-band row, in order, centered — the alignment pass
  // then moves paired ones onto their pile→basket lines anyway
  let ghostBandH = 0
  if(ghostIdx.length){
    ghostBandH = Math.max(...ghostIdx.map(i => sizes[i].h))
    const x = zone.rMin + ghostBandH / 2
    const totalW = ghostIdx.reduce((w, i) => w + sizes[i].w, 0) + gap * (ghostIdx.length - 1)
    let y = -totalW / 2
    ghostIdx.forEach(i => {
      const maxY = Math.max(2, x * tanHalf - sizes[i].w / 2)
      pos[i] = { x, y: Math.max(-maxY, Math.min(maxY, y + sizes[i].w / 2)) }
      y += sizes[i].w + gap
    })
  }

  // tall-first, then wide-first, stable — thumbs shelve together
  const order = [...chipIdx].sort((a, b) =>
    sizes[b].h - sizes[a].h || sizes[b].w - sizes[a].w || a - b)

  // store: cursor walks outward from past the RESERVED rim band (ghost-only
  // — "clear the cashier's counter", reserved even before any ghost exists);
  // basket: inward from the oval edge MINUS the coin-label band (user
  // 2026-07-15, KY564 1/300: NFTs rendered under the curved account number —
  // the label band inside the rim is a no-chip zone; 34px approximates the
  // BOARD-IDCOIN1 label depth. Per-glyph hard bounding boxes = later, if the
  // band isn't enough). Row x uses the row's tallest chip.
  // BOARD-RIMBAND1 (user 2026-07-16, fixed 2026-07-30): this used to SWITCH which
  // quantity sized the band — tallest STORE chip while the counter was empty, tallest
  // GHOST once it wasn't. A ghost thumb is smaller than its store chip, so offering an
  // item made the giver's rim band visibly SHRINK, and withdrawing it made it grow:
  // "something in it, it gets smaller; outside, it's bigger — counterintuitive."
  // Taking the MAX of both makes the empty state byte-identical to before (ghostBandH is
  // 0 with no ghosts) while removing the shrink. Residual, deliberately left: if the item
  // offered was itself the tallest chip in the store, the band can still ease down to the
  // next-tallest — the band is genuinely reserving less at that point. See the task.
  // counter flex: prefer the zone's already-flexed band (set in apply pass 2
  // before this is called) so shelves and walls agree; the formula below is
  // the standalone fallback only
  const band = zone.band ?? (Math.max(40, ghostBandH, ...chipIdx.map(i => sizes[i].h)) + 12)
  let cursor = isBasket ? zone.rMax - 34 : zone.rMin + band
  let i = 0
  while(i < order.length){
    const rowH = sizes[order[i]].h
    const x = isBasket ? cursor - rowH / 2 : cursor + rowH / 2
    const rowMax = Math.max(sizes[order[i]].w + 4, 2 * x * tanHalf - 8)
    const row = []
    let rowW = 0
    while(i < order.length){
      const w = sizes[order[i]].w
      if(row.length && rowW + gap + w > rowMax) break
      row.push(order[i])
      rowW += (row.length > 1 ? gap : 0) + w
      i++
    }
    let y = -rowW / 2
    row.forEach(j => {
      const maxY = Math.max(2, x * tanHalf - sizes[j].w / 2)
      pos[j] = { x, y: Math.max(-maxY, Math.min(maxY, y + sizes[j].w / 2)) }
      y += sizes[j].w + gap
    })
    cursor = isBasket ? cursor - rowH - gap : cursor + rowH + gap
  }

  // safety: anything unplaced (shouldn't happen) sits at the zone's inner edge
  sizes.forEach((s, i) => { if(!pos[i]) pos[i] = { x: zone.rMin + s.h / 2, y: 0 } })
  return pos
}

// BOARD-PHYSICS1 apply: sync the persistent sim to this render's DOM, then
// paint. Runs after root.replaceChildren so offsetWidth/Height are real.
// Chips are positioned by left/top with the half-size baked in (NOT
// transform: the flight animations own el.style.transform).
// oval ({rx, ry}, BOARD-CHIPLINE1): the rim ellipse for ghost alignment.
function boardOrganicApply(cx, cy, W, H, oval){
  const zones = _boardOrganicZones
  _boardOrganicZones = []
  if(!zones.length){
    // a skin without organic zones rendered — drop the sim so stale bodies
    // holding dead DOM references don't linger
    if(_boardSimRaf){ cancelAnimationFrame(_boardSimRaf); _boardSimRaf = 0 }
    _boardSimBodies.clear(); _boardSimZones.clear(); _boardSimEnv = null
    boardDrawZoneWalls()   // removes the 🧪 overlay (no env)
    boardDrawCounterShade()   // removes the counter band (no env)
    boardTrailLayer(true)  // BOARD-TRAILSTUCK1: keep the trail layer attached on an
                           // empty board too, so its lines stay wipeable AND visible-
                           // state never diverges from what the queries see
    return
  }

  const tween = !!(_boardPartyAnim || _boardRotateCancel || _boardScrollCancel || _boardOthersRotate)

  // screen-space env, re-measured each apply. Safe rect = BOARD-SAFEAREA1
  // (the visible drawing area: the transparent .app-banner floats over the
  // board's top and .ring-footer over its bottom; both measured, not
  // constants, because their heights vary with skin and wrap on mobile).
  const bannerEl = document.querySelector("body.board-page .app-banner")
  const footerEl = document.querySelector(".ring-footer")
  _boardSimEnv = {
    cx, cy, W, H, oval, party: !!_boardPartyAnim,
    safeTop: (bannerEl ? bannerEl.getBoundingClientRect().bottom : 0) + 6,
    safeBot: (footerEl ? footerEl.getBoundingClientRect().top : H) - 6,
    safeL: 6, safeR: W - 6,
    labelRects: tween ? [] : [...document.querySelectorAll("text.ring-etchlabel")]
      .filter(t => !t.classList.contains("ring-etchsub") && !t.classList.contains("ring-etchlock"))
      .map(t => t.getBoundingClientRect())
  }

  // ── sync pass 1: zone geometry + rebind elements to bodies ──────────────
  // identity: zone + assetId + ghost-or-not + occurrence — deliberately NOT
  // the textContent (an amount change is the same chip) and NOT the class
  // list (pickable/lock/selection churn is cosmetic). `changed` collects
  // whether anything the physics cares about moved: membership, sizes,
  // zone geometry (halfDeg/radii — NOT midDeg: rotation only re-projects,
  // it doesn't disturb the local frame), viewport, layout mode.
  const occ = {}
  const seen = new Set()
  const fresh = []
  let changed = false
  const live = zones.filter(z => z.chips.length)
  const zoneChips = live.map(z => {
    let zrec = _boardSimZones.get(z.key)
    if(!zrec){ zrec = {}; _boardSimZones.set(z.key, zrec) }
    const geo = Math.round(z.halfDeg * 10) + "|" + Math.round(z.rMin) + "|" + Math.round(z.rMax) + "|" + W + "x" + H
    if(zrec.geo !== geo){ zrec.geo = geo; changed = true }
    const midRad = z.midDeg * Math.PI / 180
    zrec.midRad = midRad   // oval-true walls evaluate rim/edge at absolute angles
    zrec.cos = Math.cos(midRad); zrec.sin = Math.sin(midRad)
    zrec.halfDeg = z.halfDeg
    zrec.halfDegFull = z.halfDegFull || z.halfDeg   // drawing-only, see BOARD-COUNTER1 R2
    zrec.tanHalf = Math.tan(Math.min(z.halfDeg, 80) * Math.PI / 180)
    zrec.rMin = z.rMin; zrec.rMax = z.rMax
    zrec.isBasket = /\|basket$/.test(z.key)
    // ── BOARD-PLAYERSCOPE1 invariant (2026-08-06) ──────────────────────────
    // The user's hypothesis for "my chip is sitting in their store, and it stays
    // there": something is matching on the ACCOUNT ID and ignoring the PLAYER, so
    // with one account held by two players the two collapse into each other.
    // Everything on this path is keyed on the PUBLIC id (player:label) and audits
    // clean by reading — so rather than keep guessing, assert it and let the next
    // occurrence produce evidence instead of a description.
    // Store zones only: a STORE chip must belong to the account whose store it is.
    // (Basket zones legitimately hold other people's chips — the giver owns them —
    // and ghosts carry their owner's id, which is the store they left.)
    if(!z.key.endsWith("|basket")){
      const zoneAcct = z.key.slice(0, z.key.lastIndexOf("|"))
      const stray = z.chips.find(el => el.dataset.ownerAccount && el.dataset.ownerAccount !== zoneAcct)
      if(stray) boardDiag("board:paint:zonemismatch", {
        zone: zoneAcct, chipOwner: stray.dataset.ownerAccount, assetId: stray.dataset.assetId || "",
        // the specific collision the user suspects: same account id, different player
        sameLabel: String(stray.dataset.ownerAccount).split(":")[1] === String(zoneAcct).split(":")[1]
      })
    }
    const recs = z.chips.map(el => {
      const isGhost = el.classList.contains("board-ghost")
      // BOARD-COUNTERMODE1: a rim pile (simple mode's decremented remainder
      // stack) is an INNER body — rim-pinned like a ghost — but keeps its
      // store ident (|s#N): it IS the store chip, so flight-origin lookups
      // (`…|s#1` in boardAnimateNewOffers) and the withdraw-return glide
      // keep working unchanged.
      const isInner = isGhost || el.classList.contains("board-rimpile")
      const ident0 = z.key + "|" + (el.dataset.assetId || "") + "|" + (isGhost ? "g" : "s")
      const ident = ident0 + "#" + (occ[ident0] = (occ[ident0] || 0) + 1)
      seen.add(ident)
      let b = _boardSimBodies.get(ident)
      if(!b){
        b = { ident, zoneKey: z.key, inner: isInner, x: null, y: null }
        _boardSimBodies.set(ident, b)
        fresh.push(b)
        changed = true
      }
      if(b.inner !== isInner){
        // store⇄rim transition (offer made / withdrawn, or the 🧪 mode
        // toggled): outbound snaps to the rim pin next paint (the clone
        // flight covers the move); inbound becomes a mover again and the
        // springs glide it back into the store rows
        b.inner = isInner
        // BOARD-RIMARRANGE1: a ring placement is only meaningful while the
        // chip IS on offer — coming home, drop it so the chip rejoins the
        // shelf flow instead of sticking to the rim it no longer belongs on
        if(!isInner && b.rimpin){
          b.rimpin = false; b.pin = false
          delete boardPins()[b.ident]
          boardPinsSave()
        }
        changed = true
      }
      if(b.el !== el){
        // REBIND: renders REPLACE the DOM, so this is a brand-new element
        // with empty styles — void the painted-position memory or the paint
        // dirty-check (pl/pt unchanged since the sim settled) would skip the
        // style write and leave the new element unpositioned at the DOM
        // default, top-left. (Round-1 live bug: every settled chip vanished
        // to the corner on any re-render — "ghost NFTs missing", "spotlight
        // wipes everything to top left" — because ghosts/settled chips are
        // exactly the ones that never move.)
        b.el = el
        b.pl = b.pt = null
      }
      const txt = (el.textContent || "").slice(0, 24)
      if(b.txt !== txt && !tween){
        // text changed → size may have — re-measure (and excite: the new
        // size must feed back into the physics). Center-based positions mean
        // even a width change can't shift the chip's center.
        b.txt = txt
        if(fresh.indexOf(b) < 0) fresh.push(b)
        changed = true
      }
      return b
    })
    return { zrec, recs }
  })
  _boardSimBodies.forEach((b, k) => {
    if(!seen.has(k)){ _boardSimBodies.delete(k); changed = true }
  })
  _boardSimZones.forEach((zr, k) => {
    if(!live.some(z => z.key === k)) _boardSimZones.delete(k)
  })
  if(boardLayoutMode !== _boardSimLastMode){
    _boardSimLastMode = boardLayoutMode
    changed = true
  }

  // measure the fresh/changed ones — tighten wrapped text first so the
  // measured width is final (render() calls boardTightenChips() again
  // later; widths already set by then, so it's a no-op)
  if(fresh.length){
    if(ring9()) boardTightenChips()
    fresh.forEach(b => {
      b.w = b.el.offsetWidth || 40
      b.h = b.el.offsetHeight || 24
      b.cr = boardChipCr(b)
    })
  }

  // ── BOARD-CHIPSIZE1: crowd fit ──────────────────────────────────────────
  // Compare each zone's chip area against its wedge area; the FULLEST zone
  // sets one global shrink factor (uniform — mixed chip sizes across
  // segments read as broken). Bodies were measured at the OLD scale, so
  // areas are normalised by it before choosing the new one. Skipped during
  // tweens (a mid-collapse wedge is momentarily "crowded" — don't pump the
  // size). If the applied scale moves, every cached size is stale: re-apply
  // the var, re-measure everything, and let the sim relax to the new sizes.
  if(!tween){
    const prev = _boardChipScaleApplied || 1
    const pressure = (zrec, recs, band) => {
      const inner = zrec.isBasket ? zrec.rMin : zrec.rMin + band
      const outer = Math.max(inner + 20, zrec.rMax)
      const wedgeArea = (Math.min(zrec.halfDeg, 80) / 180) * Math.PI * (outer * outer - inner * inner)
      const chipArea = recs.reduce((t, b) => t + (b.w || 40) * (b.h || 24), 0) / (prev * prev)
      return chipArea > 0 && wedgeArea > 0 ? Math.sqrt((wedgeArea * 0.5) / chipArea) : 1   // chips may claim ~half the zone
    }
    // counter flex, pass A: pressure at the FULL band decides how much
    // counter space to surrender (bandFull/bandMin cached from the previous
    // apply's pass 2 — one-frame lag, same as the old zrec.band read).
    // worstFull ≥ 1 → roomy, keep the whole counter; ≤ 0.7 → give it all up.
    // UISIZE-aware (user 2026-08-05, "counter doesn't shrink on mobile"):
    // pressure() returns the max BASE-scale the wedge affords, but chips render
    // at fit × uiSize (mobile Normal = 1.3) — judged in base units the wedge
    // reported "roomy" while the 1.3× chips crowded it and the band never
    // yielded. Divide by the DESIRED multiplier so both passes answer "can the
    // chips fit at the size we actually want to draw them?".
    const want = boardUiSizeChip() || 1
    let worstFull = 1
    zoneChips.forEach(({ zrec, recs }) => {
      if(recs.length) worstFull = Math.min(worstFull, pressure(zrec, recs, zrec.bandFull ?? 40) / want)
    })
    const flexWas = _boardBandFlex
    _boardBandFlex = Math.round(Math.max(0, Math.min(1, (worstFull - 0.7) / 0.3)) * 4) / 4
    if(_boardBandFlex !== flexWas)
      boardDiag("board:bandflex", { flex: _boardBandFlex, worstFull: Math.round(worstFull * 100) / 100, want, fit: _boardChipFit })
    // pass B: chip crowd fit at the FLEXED band — chips only shrink for what
    // the surrendered counter space couldn't absorb. worst = fraction of the
    // DESIRED size we can afford; applied scale = base × fit × uiSize.
    let worst = 1
    zoneChips.forEach(({ zrec, recs }) => {
      if(recs.length) worst = Math.min(worst, pressure(zrec, recs, boardBandAt(zrec)) / want)
    })
    // BOARD-CROWDFAIR1 (user-approved 2026-08-05): shrink only absorbs MILD
    // crowding — floor raised 0.65 → 0.85 so one chip-heavy player can't
    // miniaturise the whole table. Past the floor chips overlap instead: the
    // collision radii squash (to 0.6× at worst) so the pile stays inside the
    // crowded wedge — a real table lets chips pile; sticky-drag + 🧹 tidy are
    // the recovery tools. Fewer scale re-applies also means fewer sim
    // re-excitements (the suspected jitter source, BOARD-JITTER1).
    const target = Math.max(0.85, Math.min(1, Math.round(worst * 20) / 20))
    if(Math.abs(target - _boardChipFit) >= 0.1) _boardChipFit = target
    const squash = worst >= 0.85 ? 1 : Math.max(0.6, Math.round((worst / 0.85) * 20) / 20)
    if(squash !== _boardCrowdSquash){
      _boardCrowdSquash = squash
      zoneChips.forEach(({ recs }) => recs.forEach(b => { b.cr = boardChipCr(b) }))
      changed = true
    }
    if(boardApplyChipScale()){
      if(ring9()){
        // boardTightenChips PINS style.width in px — stale at the new scale;
        // release before re-tightening so text re-wraps at the new font size
        document.querySelectorAll(".board-chip:not(.thumb-only)").forEach(el => { el.style.width = "" })
        boardTightenChips()
      }
      zoneChips.forEach(({ recs }) => recs.forEach(b => {
        b.w = b.el.offsetWidth || 40
        b.h = b.el.offsetHeight || 24
        b.cr = boardChipCr(b)
      }))
      changed = true
    }
  }

  // ── sync pass 2: per-zone derived geometry, shelf targets, spawns ───────
  zoneChips.forEach(({ zrec, recs }) => {
    const movers = recs.filter(b => !b.inner)
    const ghostsIn = recs.filter(b => b.inner)
    // reserved rim band ("clear the cashier's counter"): ghost-only, held
    // open even before any ghost exists so the two rings read as distinct
    // BOARD-RIMBAND1: same max-of-both fix as the shelf pass above — these two must agree
    // or the sim's walls and the shelf layout disagree about where the counter ends.
    // Counter flex: bandFull is that classic reservation; bandMin is what the
    // band's occupants actually need (tallest ghost/rim pile + breathing room,
    // or a 12px sliver when empty); _boardBandFlex slides between them under
    // space pressure. A real band move re-excites the sim so walls take hold.
    zrec.bandFull = zrec.isBasket ? 0 :
      Math.max(40, ...ghostsIn.map(b => b.h), ...movers.map(b => b.h)) + 12
    zrec.bandMin = zrec.isBasket ? 0 :
      (ghostsIn.length ? Math.max(...ghostsIn.map(b => b.h)) + 8 : 12)
    const bandWas = zrec.band
    zrec.band = boardBandAt(zrec)
    if(bandWas != null && Math.abs(zrec.band - bandWas) >= 4) changed = true
    // anchor: the blob's home, centred in the radial band (BOARD-ORGANIC4 —
    // wedge-angle-independent, unlike the old tan-based spread)
    const area = movers.reduce((t, b) => t + b.w * b.h, 0)
    const blobR = Math.max(1, Math.sqrt(area / (Math.PI * 0.6)))
    const inW = zrec.isBasket ? zrec.rMin : zrec.rMin + zrec.band
    const outW = zrec.isBasket ? zrec.rMax - 34 : zrec.rMax
    const lo = inW + blobR, hi = outW - blobR
    // 🧪 hugRing: store blobs home at 0.38 of the radial band instead of the
    // midpoint — a MILD inward lean toward the ring; the ghost band still
    // keeps chip edges off it. Baskets keep the midpoint (their "inward" is
    // the rim itself).
    const home = inW + (outW - inW) * (boardHugRing && !zrec.isBasket ? 0.38 : 0.5)
    zrec.ax = lo <= hi ? Math.min(Math.max(home, lo), hi) : lo

    // shelves: deterministic targets, recomputed every apply (pure math, no
    // DOM), sprung to in the tick — an honest animated re-flow
    if(boardLayoutMode === "shelves"){
      const pos = boardShelfZone(
        recs.map(b => ({ w: b.w, h: b.h })), recs.map(b => b.ident),
        zrec, recs.map(b => b.inner), zrec.isBasket)
      // targets HARD-clamped to the oval-true walls: the solver still thinks
      // in mid-angle circles, so rows near the rim/edge would violate the
      // real walls on non-square screens — and an infeasible target makes
      // the tick's spring fight the wall clamp every frame (visible jitter,
      // never settles). Clamping here keeps every target reachable.
      recs.forEach((b, i) => {
        if(b.inner) return
        const t = boardWallClamp(_boardSimEnv, zrec, b, pos[i].x, pos[i].y, false)
        b.tx = t.x; b.ty = t.y
      })
    } else recs.forEach(b => { b.tx = b.ty = null })

    // spawn: initial local position for brand-new bodies. Existing bodies
    // are never touched here — placed chips stay put by construction.
    recs.forEach(b => {
      if(b.x != null) return
      if(!b.inner){
        // BOARD-ARRANGE1: (a) a chip the user just dropped here spawns at
        // the drop point; (b) a pinned arrangement persisted for this game
        // restores. Both pin the body — arrivals route around it.
        const ps = boardPendingSpawnTake(b, zrec)
        if(ps){ b.x = ps.x; b.y = ps.y; b.pin = true; boardPinRecord(b); return }
        const pin = boardPins()[b.ident]
        if(pin && pin.lx != null){
          const p = boardWallClamp(_boardSimEnv, zrec, b, pin.lx, pin.ly, false)
          b.x = p.x; b.y = p.y; b.pin = true
          return
        }
      }
      if(b.inner){
        // BOARD-RIMARRANGE1: a hand-placed ring position is restored the same
        // way store pins are — paint re-pins the radius, so the stored angle
        // is what actually carries
        const pin = boardPins()[b.ident]
        if(pin && pin.lx != null){
          b.x = pin.lx; b.y = pin.ly; b.pin = true; b.rimpin = true
          return
        }
        // ghost spawns at the rim beside its own store pile ("out for sale —
        // near the counter"); the paint alignment settles it onto the line
        const sib = _boardSimBodies.get(b.ident.replace(/\|g#(\d+)$/, "|s#$1")) ||
                    _boardSimBodies.get(b.zoneKey + "|" + (b.el.dataset.assetId || "") + "|s#1")
        b.x = zrec.rMin + b.h / 2
        b.y = sib && sib.y != null ? sib.y : 0
        return
      }
      // withdraw-return: the chip stood at the rim as a ghost last apply —
      // spawn there and let the sim carry it home (replaces the old
      // glide-from special case)
      const gPrev = _boardChipPrevPos.get(b.ident.replace(/\|s#(\d+)$/, "|g#$1"))
      if(gPrev && gPrev.lx != null){ b.x = gPrev.lx; b.y = gPrev.ly; return }
      // shelves: straight to the shelf target (no origin story to animate)
      if(b.tx != null){ b.x = b.tx; b.y = b.ty; return }
      // organic: hash-jittered spot in the anchor disk — the collision pass
      // makes room for it visibly
      const j1 = boardHash01(b.ident), j2 = boardHash01(b.ident + "~")
      const t = j1 * Math.PI * 2, rr = Math.sqrt(j2) * blobR
      b.x = zrec.ax + Math.cos(t) * rr
      b.y = Math.sin(t) * rr
    })
  })

  // ── excite + paint ───────────────────────────────────────────────────────
  if(changed){
    _boardSimCalm = 0
    _boardSimQuiet = 0
    if(fresh.length) boardSimTick(3)   // pre-settle: new chips paint near-home this frame
    if(!_boardSimRaf) _boardSimRaf = requestAnimationFrame(boardSimFrame)
  }
  boardSimPaint()

  // apply-time position bookkeeping — flight animations read these (NFT
  // offer origin via PrevPosOld; withdraw-return spawn via PrevPos)
  const next = new Map()
  _boardSimBodies.forEach((b, k) => {
    if(b.pl != null) next.set(k, { left: b.pl, top: b.pt, lx: b.x, ly: b.y })
  })
  // paint-level movement summary (scatter forensics, kept): catches
  // apply-to-apply movement from ANY source; silent in steady state
  {
    let moved = 0, maxPx = 0
    next.forEach((p, k) => {
      const prev = _boardChipPrevPos.get(k)
      if(!prev) return
      const dd = Math.hypot(p.left - prev.left, p.top - prev.top)
      if(dd > 2){ moved++; maxPx = Math.max(maxPx, dd) }
    })
    if(moved) boardDiag("board:paint:moves", {
      moved, maxPx: Math.round(maxPx), layout: boardLayoutMode, total: next.size
    })
  }
  _boardChipPrevPosOld = _boardChipPrevPos
  _boardChipPrevPos = next

  boardDrawZoneWalls()   // 🧪 debug overlay — no-op unless enabled in Settings
  boardDrawCounterShade()   // BOARD-COUNTER1 — always-on counter band tint
}

/* ── rotate animation for "You at bottom" (user 2026-07-12) ──────────────────
   The toggle used to hard-jump between orientations. Now the start angle
   tweens (shortest path, ease-in-out, ~550ms) from the orientation on screen
   to the new one, re-rendering per frame — cheap because chip bodies live in
   the rotation-independent zone-local frame (BOARD-PHYSICS1: paint just
   re-projects under the new mid-angle, no physics disturbed) and N stays
   small. Any render triggered mid-tween (WS push etc.) just paints at the
   current offset. */
let _boardStartRendered = null      // effective start angle last painted
let _boardRotateOffset = 0          // animated delta, 0 when settled
let _boardRotateCancel = null
let _boardAnimateNextRotation = false   // set by the toggle, consumed by renderRingBoard

function boardShortestDelta(deg){ return ((deg % 360) + 540) % 360 - 180 }

// shared tween driver: onFrame(easedProgress, done) per rAF, easeInOutCubic —
// the one easing every board animation uses. Returns a cancel function.
// boardAnimSpeed (Prefs, user 2026-07-12) divides into every duration — a
// debug throttle so glitches can be watched at ¼/⅒ speed live instead of
// recording the screen and scrubbing.
function boardAnimate(dur, onFrame){
  const t0 = performance.now()
  const effDur = dur / (boardAnimSpeed || 1)
  let raf
  const tick = now => {
    const t = Math.min(1, (now - t0) / effDur)
    const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    if(t < 1) raf = requestAnimationFrame(tick)
    onFrame(e, t >= 1)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

// ── wheel-scroll animation (user 2026-07-12, v2 same day): tapping a divider
// used to snap the others-window one position. Now it reads as a WHEEL
// TURNING UNDER THE BOARD, revealed between the two divider wedges (the
// user's mental model, verbatim): the whole others region — wedges, chips,
// felt arcs/labels — is CLIPPED to the fixed sector between the dividers;
// during the glide the LEAVER keeps rendering one slot before the window
// (sliding out through the near divider) while the newcomer slides in
// through the far one. No pop-in on top, no gap behind: both simply cross
// the thresholds. The leaver drops from the DOM only when the tween
// completes (v1 dropped it at tap — the visible blank the user reported).
// It's a "magic wheel" — the leaver must NOT reappear round the other side,
// which the one-slot-outside placement + clip guarantees by construction.
// Applied as an angle offset on "others"-group slots only.
let _boardOthersRotate = 0
let _boardScrollCancel = null
let _boardLastStepDeg = 0     // account-slot width from the last normal layout

// pie-slice polygon spanning [a0,a1] degrees from the board center out past
// the edges — the one shape used by account wedges, divider wedges and the
// wheel clip windows (CSS clip-path string)
function boardSectorPolygon(a0, a1, geo, steps = 6){
  const R = Math.max(geo.W, geo.H) * 1.6
  const pts = [[geo.cx, geo.cy]]
  for(let s = 0; s <= steps; s++){
    const a = (a0 + (a1 - a0) * s / steps) * Math.PI / 180
    pts.push([geo.cx + R * Math.cos(a), geo.cy + R * Math.sin(a)])
  }
  return "polygon(" + pts.map(p => `${p[0].toFixed(0)}px ${p[1].toFixed(0)}px`).join(",") + ")"
}

// ── party-only collapse/expand (user 2026-07-12): non-party segments close
// like pacman eating — their angular width tweens to 0 while the survivors
// expand to fill, then they drop from the DOM (and the reverse on untick).
// During the tween the render uses the UNION account list with per-account
// width weights; the wheel windowing is bypassed (a transient superset can
// exceed the cap for ~550ms — acceptable, it snaps to the windowed layout at
// the end). Chips fade with their segment's weight rather than re-solving the
// shrinking geometry every frame (boardOrganicApply switches to a geometry-
// loose cache key while this runs — the wedge closes OVER the fading chips,
// which is exactly the eating look).
let _boardPartyAnim = null    // { accounts, removed:Set, added:Set, e }
let _boardPartyCancel = null
// BOARD-SEGANIM1: previous paint's membership + layout, so an arrival/leave can tween
let _boardLastMemberIds = null
let _boardLastSlotLayout = null

// v2 (user 2026-07-12): v1 tweened raw account widths and BYPASSED the wheel
// windowing — so over the segment cap, the divider wedges vanished at tap and
// every width recomputed without them: the jump the user reported. Now the
// tween interpolates between the two REAL slot layouts (dividers, windowing
// and all — boardComputeSlotLayout is the renderer's own math), so e=0 IS the
// pre-toggle screen and e=1 IS the post-toggle screen, dividers gliding/
// shrinking like everything else, revealed others emerging at their divider
// seam. This is the user's two-phase design collapsed into one continuous
// pass (no mid-point handoff to glitch). Deviation noted: revealed segments
// inflate from the seam rather than rolling in behind an animated clip — if
// that reads wrong live, the clip-roll is the follow-up.
function boardTogglePartyOnly(v){
  boardClearTrails()   // segments collapse/expand — every drawn trail goes stale
  const oldL = ring16() ? boardComputeSlotLayout(boardFilteredAccounts()) : null
  boardPartyOnly = v
  boardSavePrefs()
  if(!oldL){ render(); return }
  const newL = boardComputeSlotLayout(boardFilteredAccounts())
  const entities = boardMergeSlotLayouts(oldL, newL)
  if(!entities.some(en => Math.abs(en.wOld - en.wNew) > 0.01)){ render(); return }   // no layout change
  // UNREPRODUCED edge case (user 2026-07-12, "hold that thought"): a
  // rotation that snapped into place at the END of undoing party-only, seen
  // once after adding/removing accounts, not reproducible since. Best clues
  // if it resurfaces: (1) `entities` is a SNAPSHOT — if an account joins or
  // leaves MID-TWEEN (WS push), the e=1 layout no longer equals the fresh
  // post-anim layout and the handoff snaps; (2) adding/removing accounts
  // changes boardGroupByPlayer's earliest-join ordering, so a layout
  // captured before the change and one computed after can disagree about
  // MINE's angular extent → recenter target differs → end rotation snap.
  // Design cue: either restart the tween on any membership change landing
  // mid-flight, or recompute newL per frame instead of snapshotting.
  // a wheel glide mid-flight would fight the layout tween — settle it first
  _boardScrollCancel?.(); _boardScrollCancel = null; _boardOthersRotate = 0
  _boardPartyCancel?.()
  _boardPartyAnim = { entities, e: 0 }
  // BOARD-SEGANIM1: sync the membership tween's baseline to the post-toggle world, or
  // the first paint after this tween ends would see "changed ids" against a stale
  // layout and replay the whole toggle as a second, bogus animation.
  _boardLastMemberIds = boardFilteredAccounts().map(a => a.id).join("|")
  _boardLastSlotLayout = newL
  // animation forensics (user 2026-07-12): the full entity plan up front +
  // a completion marker, so a quoted ktag window shows exactly which slots
  // were collapsing/expanding and to what widths when a glitch was seen
  boardDiag("board:panim:start", { partyOnly: v, speed: boardAnimSpeed,
    entities: entities.map(en => ({
      k: en.slot.type === "divider" ? "D" + en.slot.dividerIndex
        : (en.slot.account.id.split(":")[1] || en.slot.account.id),
      wOld: Math.round(en.wOld), wNew: Math.round(en.wNew) })) })
  _boardPartyCancel = boardAnimate(550, (e, done) => {
    if(_boardPartyAnim) _boardPartyAnim.e = e
    if(done){
      _boardPartyAnim = null; _boardPartyCancel = null
      boardDiag("board:panim:end", { partyOnly: v })
    }
    render()
  })
  render()
}

// BOARD-WHEEL1: turns the (already player-grouped) account list into an
// ordered list of ring "slots" — either an account or a thin scroll-divider.
// Below boardMaxSegments: unchanged status quo, every account shown, no
// dividers (this is the ONLY path when the game is small — no behaviour
// change from before this feature). Above it: mine stays fixed and whole;
// others are windowed to whatever's left of the budget, with a divider on
// each side acting as both the visual seam and the scroll button. The window
// into "others" is a plain modulo slice from boardOthersScrollOffset — tapping
// either divider advances it by one and loops (infinite wheel, per the user's
// spec: "keep it basic for now, just get the concept working").
function boardRingLayoutSlots(accounts){
  // BOARD-ORDERCANON1 (2026-08-08): rotate to my block's start instead of
  // partitioning into mine+others. A partition ([...mine, ...others]) splices
  // players who joined before me past the players who joined after me, so
  // different viewers see genuinely different rings, not just different start
  // points — e.g. join order [B1,A1,A2,C1]: Alice's partition gives
  // [A1,A2,B1,C1] (B1 before C1), Bob's gives [B1,A1,A2,C1] which cyclically
  // is [A1,A2,C1,B1] (C1 before B1). A rotation preserves the one canonical
  // cycle; every viewer just starts reading it at a different point. Safe
  // because boardGroupByPlayer already guarantees "mine" is one contiguous
  // run, which is exactly the precondition a rotation needs.
  const mineIdx = accounts.findIndex(a => isMyAccount(a))
  const rotated = mineIdx > 0 ? [...accounts.slice(mineIdx), ...accounts.slice(0, mineIdx)] : accounts
  const mine = rotated.filter(a => isMyAccount(a))
  const others = rotated.filter(a => !isMyAccount(a))

  // BOARD-WHEEL4 (user 2026-07-12): mine-first in BOTH branches. The
  // under-cap path used to keep raw join-grouped order (mine wherever it
  // fell) while the windowed path forced mine first — so a party toggle that
  // crossed the cap tried to tween between two DIFFERENT slot orderings, and
  // boardMergeSlotLayouts orphaned the accounts whose relative position
  // flipped (they lost their wNew and popped in at the end of the tween —
  // the "suddenly appearing segments" + the end jolt of the recenter). One
  // consistent order kills the whole family. This does make the ARRAY
  // viewer-dependent below the cap too (it already was above it) — but as of
  // BOARD-ORDERCANON1 follow-up (2026-08-08) that's fine: the array is always
  // a rotation of the same canonical cycle, and renderRingBoard's start-angle
  // math (below) compensates for exactly that rotation when "you at bottom"
  // is off, so the DRAWN result is still byte-identical across viewers.
  if(accounts.length <= boardMaxSegments)
    return rotated.map(account => ({ type: "account", account }))

  const visibleOthersCount = Math.max(0, boardMaxSegments - mine.length)

  if(!others.length || !visibleOthersCount)
    return mine.map(account => ({ type: "account", account }))

  const offset = ((boardOthersScrollOffset % others.length) + others.length) % others.length
  const visibleOthers = []
  for(let k = 0; k < Math.min(visibleOthersCount, others.length); k++)
    visibleOthers.push(others[(offset + k) % others.length])

  const hiddenCount = others.length - visibleOthers.length
  // dir: tap direction per divider — OPPOSITE ways (user 2026-07-12; v1 had
  // both going the same way). Current mapping: each divider PULLS the hidden
  // players in through ITSELF (near divider −1, far divider +1). The user is
  // trying both to see which feels intuitive — this mapping may yet flip
  // (swap the signs here, nothing else cares). dividerIndex keys the party
  // tween's layout merge (boardMergeSlotLayouts).
  const divider = (dividerIndex, dir) => ({ type: "divider", hiddenCount, dividerIndex, dir })

  return [
    ...mine.map(account => ({ type: "account", account })),
    divider(0, -1),
    // group tag: the wheel-scroll glide (_boardOthersRotate) applies to these
    // slots only — mine and the dividers hold still while the window turns
    ...visibleOthers.map(account => ({ type: "account", account, group: "others" })),
    divider(1, 1)
  ]
}

// the ONE place slot geometry comes from: accounts+dividers with their
// angular widths. Extracted so the party-toggle tween can compute the exact
// before/after layouts with the same machinery the renderer uses — the tween
// endpoints then EQUAL the real screens by construction (no jumps).
function boardComputeSlotLayout(accountsList){
  const slots = boardRingLayoutSlots(accountsList)
  const acctSlotCount = slots.filter(s => s.type === "account").length
  const dividerCount = slots.length - acctSlotCount
  const step = acctSlotCount ? (360 - dividerCount * BOARD_DIVIDER_DEG) / acctSlotCount : 360
  const widths = slots.map(s => s.type === "divider" ? BOARD_DIVIDER_DEG : step)
  return { slots, widths, step }
}

// merge two slot sequences (old + new layout) into one ordered entity list
// with per-entity old/new widths. Common entities (same account id / same
// divider) keep their shared relative order; old-only entities (leavers,
// vanishing dividers) sit where they were with wNew=0; new-only entities
// (revealed others, appearing dividers) sit where they belong with wOld=0 —
// the cumulative walk then makes them emerge exactly at their seam.
function boardMergeSlotLayouts(oldL, newL){
  const k = s => s.type === "divider" ? "d" + s.dividerIndex : "a" + s.account.id
  const oldKeys = oldL.slots.map(k), newKeys = newL.slots.map(k)
  const newIndex = new Map(newKeys.map((kk, i) => [kk, i]))
  const entities = []
  let nPtr = 0
  const emitNewOnly = upTo => {
    while(nPtr < upTo){
      if(!oldKeys.includes(newKeys[nPtr]))
        entities.push({ slot: newL.slots[nPtr], wOld: 0, wNew: newL.widths[nPtr] })
      nPtr++
    }
  }
  oldL.slots.forEach((s, i) => {
    const ni = newIndex.get(oldKeys[i])
    if(ni != null && ni >= nPtr){
      emitNewOnly(ni)
      entities.push({ slot: newL.slots[ni], wOld: oldL.widths[i], wNew: newL.widths[ni] })
      nPtr = ni + 1
    } else {
      entities.push({ slot: s, wOld: oldL.widths[i], wNew: 0 })
    }
  })
  emitNewOnly(newL.slots.length)
  return entities
}

function boardScrollOthers(step){
  boardOthersScrollOffset += step
  boardDiag("board:wheel:scroll", { offset: boardOthersScrollOffset, step })
  // glide instead of snap: at offset = ±step×width the surviving others paint
  // at their OLD positions (the entrant behind its divider), then everything
  // eases to 0 = the new layout. Sign carries direction: +1 glides the wheel
  // one way (entrant through the FAR divider), −1 the other (entrant through
  // the NEAR one). Rapid taps restart the tween from the new window — slight
  // replay, acceptable.
  _boardScrollCancel?.()
  boardClearTrails()   // the others-wheel turns — trails to/from it go stale
  const from = step * (_boardLastStepDeg || 0)
  if(from){
    _boardOthersRotate = from
    _boardScrollCancel = boardAnimate(450, (e, done) => {
      _boardOthersRotate = from * (1 - e)
      if(done){ _boardOthersRotate = 0; _boardScrollCancel = null }
      render()
    })
  }
  render()
}

/* ── SIGNING LAYER (ring15, first slice) ────────────────────────────────── */
// buildSceneFromTx in embryo: parse the pending tx's pchbasis legs into a
// per-hedera-account view. recv legs paint as basket chips (sleeve = the
// giver when uniquely attributable — a netted tx usually has one sender per
// asset); send legs reserved for the ghost side later.
let boardSigning = null   // set per render; footer reads it
let _boardSignPrevTx      // BOARD-LOCKREDRAW1: last paint's signing txid (undefined = no paint witnessed yet)
let _boardLastSigningTxid = null   // previous render's watched txid — vanish-from-pending expiry verdict (2026-07-15)

// ── SIGN-STATUSLANG1 first pass: per-account signing status on the arcs ──────
// "Zoom out, see how the widget does it, replicate sensibly" (user 2026-07-11).
// Rather than reimplement a parallel (and inevitably divergent — the exact
// trap PROP-SIGN-UNIFY1 exists to avoid) status calc, this REUSES the same
// exported kpool_widget functions the /m/sign/ modal uses:
//   txRead → the signed pubkeys (data.sigs), accounts+roles, AND data.precheck
//            for THIS txid
//   enrichAccountsInfo + calcAccountsThatSign → who must sign (receiver_sig etc)
//   enrichAccountsKeyInfo → each account's key tree (mirror-node)
//   getThresholdSummary → has THIS account met its signing threshold?
// The board loads these via dynamic import() (same mechanism katomia-auth.js
// already uses for the mirror/protobuf modules).
let boardSignStatus = null   // { txid, byAccount: { hac: 'signed'|'pending'|'loading'|'none'|'failed' } }
let _boardSignMod = null
let _boardSignPoll = null
let _boardSignLast = ""

async function boardSignModule(){
  if(_boardSignMod) return _boardSignMod
  const base = "/vendor/kpay/kpool_widget/"
  const [model, threshold, keynorm] = await Promise.all([
    import(base + "model.js"), import(base + "threshold.js"), import(base + "keynorm.js")
  ])
  _boardSignMod = { model, threshold, keynorm }
  return _boardSignMod
}

// user 2026-07-12: "same rules as the regular signing modal" for red too.
// This is a straight copy of kpool_widget/view.js updateCardBalances()'s
// short/unassoc parsing (not imported — that function is wired directly into
// .txcards DOM, not a standalone pure calc). Keep in sync if the modal's
// rules change; the real fix is hoisting this into the shared module
// SIGN-STATUSLANG1 already calls for. Two sources, same as the modal:
// precheck.balances[acct][asset].forecast<0 (structured), and the
// authoritative precheck.tests.fail strings (these carry things forecast
// alone misses, e.g. the HBAR fee buffer). Association is a distinct fault
// from a balance shortfall (it's the RECEIVING side's responsibility) but
// for the arc's single red/not-red verdict both block the same as the modal:
// card.dataset.balanceShort = (short.size || unassoc.size) ? '1' : '0'.
function boardBalanceIssues(precheck){
  const short = {}, unassoc = {}
  const add = (map, acct, key) => { (map[acct] ||= new Set()).add(key) }
  for(const [acct, assets] of Object.entries(precheck?.balances || {}))
    for(const [asset, f] of Object.entries(assets || {}))
      if(f && Number(f.forecast) < 0) add(short, acct, asset)
  for(const line of precheck?.tests?.fail || []){
    let m
    if((m = /has sender (\S+) enough (\S+)/.exec(line))) add(short, m[1], m[2])
    else if((m = /has (\S+) sufficient hbar balance/.exec(line))) add(short, m[1], "hbar")
    else if((m = /has (?:sender|receiver) (\S+) associated (\S+)/.exec(line))) add(unassoc, m[1], m[2])
  }
  return { short, unassoc }
}

async function boardRefreshSignStatus(){
  const tx = boardSigning?.tx
  if(!tx?.txid) return
  const network = gameMeta?.network || ""
  try {
    const { model, threshold, keynorm } = await boardSignModule()
    const { data, accounts } = await model.txRead({ network, txid: tx.txid })
    if(!accounts) return
    await model.enrichAccountsInfo({ network, accounts })
    model.calcAccountsThatSign(accounts)
    await model.enrichAccountsKeyInfo({ network, accounts })
    const signedPubkeys = (data?.sigs || [])
      .map(s => s.pubKey).filter(Boolean).map(keynorm.normalizePublicKey).filter(Boolean)
    const { short, unassoc } = boardBalanceIssues(data?.precheck)
    const byAccount = {}
    for(const [id, acc] of Object.entries(accounts)){
      const hac = id.split(":")[1] || id
      // red wins over everything, same priority as the modal's paintCardRing
      // (balance-short checked BEFORE signState, ahead of mustSign too — a
      // pure receiver needing token association still needs to show red)
      const hasIssue = !!(short[id]?.size || short[hac]?.size || unassoc[id]?.size || unassoc[hac]?.size)
      if(hasIssue){ byAccount[hac] = "failed"; continue }   // reuses the existing red/dashed .ring-signarc--failed
      if(!acc.mustSign){ byAccount[hac] = "none"; continue }
      const keyTree = acc.keyInfo && keynorm.normalizeKeyTree(acc.keyInfo)
      if(!keyTree){ byAccount[hac] = "loading"; continue }
      const s = threshold.getThresholdSummary({ keyTree, signedPubkeys })
      byAccount[hac] = s.thresholdSatisfied ? "signed" : "pending"
    }
    // KATOMIA-VALIDDUR1 (user 2026-07-15): model.txRead already decodes the
    // REAL valid-duration straight from the signed bytes (VALIDD1, model.js)
    // — the exact number the user asked to "get from the raw protobuf on
    // the front end". Riding along on boardSignStatus so boardDetectSigning
    // can prefer it over the BOARD_TX_EXPIRY_MS guess once this poll lands.
    boardAnnounceSigned(tx.txid, byAccount)   // BOARD-ACTIONMSG1 R3: "signed" rows
    boardAnnounceIssues(tx.txid, short, unassoc)   // BOARD-ASSOCWARN1: red arcs say WHY
    boardSignStatus = { txid: tx.txid, byAccount, validDurationSeconds: data?.validDurationSeconds || null }
    const sig = JSON.stringify(byAccount)
    boardDiag("board:signstatus", { txid: tx.txid, byAccount, signedKeys: signedPubkeys.length,
      shortAccts: Object.keys(short), unassocAccts: Object.keys(unassoc),
      validDurationSeconds: data?.validDurationSeconds ?? null })   // KATOMIA-VALIDDUR1: was invisible in traces
    if(sig !== _boardSignLast){ _boardSignLast = sig; render() }   // repaint only on change
  } catch(e){
    boardDiag("board:signstatus:error", { error: String(e) })
  }
}

// BOARD-ACTIONMSG1 R3 (user 2026-08-04): "signed" joins the action vocabulary,
// same shape as lock — the SUBJECT account + its own 🔷/△ + the word "signed",
// no green tick ("it's just an event"). The 🔷/△ carries real meaning here: a
// signature proves the ACCOUNT's key acted, not that this PLAYER holds it —
// with a commitment (🔷) we know it's them; without (△) they may be an agent
// for a signer acting behind the scenes. Derived CLIENT-SIDE from the
// signstatus threshold flip (the same signal the arcs/modal use) rather than
// emitted by the backend: signatures land through the kpool subsystem, not a
// game action, so there is no Ctx to ride — every client polls the same
// signstatus and converges on the same rows. Live-only, like every action row.
// Announced when an account's threshold BECOMES satisfied — multisig partials
// (a key short of threshold) stay silent by construction; per-key partial
// announcements would need kpool's per-signature push and are out of scope.
let _boardSignAnnounced = new Set()   // `${txid}|${hac}` — once per account per tx
function boardAnnounceSigned(txid, byAccount){
  if(document.body.dataset.kchatMode !== "panel") return   // same gate as the other action rows
  if(!window.katomiaChat?.action) return
  for(const [hac, st] of Object.entries(byAccount || {})){
    if(st !== "signed") continue
    const k = txid + "|" + hac
    if(_boardSignAnnounced.has(k)) continue
    _boardSignAnnounced.add(k)
    const acc = Object.values(state?.accounts || {}).find(a => (a.id.split(":")[1] || a.id) === hac)
    if(!acc) continue
    window.katomiaChat.action({
      type: "event",
      message: `${hac} signed`,   // prose fallback, same convention as the backend's
      action: { v: 1, kind: "sign", actor: acc.playerId, account: acc.id, ts: Date.now() }
    })
  }
  if(_boardSignAnnounced.size > 400) _boardSignAnnounced = new Set()
}

// BOARD-ASSOCWARN1 (feedback c8dbd94c, 2026-08-17): "a dotted red line … I think that
// means that the tokens not associated but there's no visual cue other than that no
// explanation". The arc's red already derives from boardBalanceIssues (precheck fails +
// negative forecasts — the same signal as the modal's red ring), so when it paints we
// say WHY, in the message stream, in SIGN-EXPLAIN1's plain words ("not associated",
// "insufficient balance"). One row per instance (txid|account|asset|reason), per the
// submitter: "probably one for each instance because they shouldn't be many" — and per
// KAT-DUPEQUIET1 these are real actionable failures, not decoration; the benign
// auto-associate tier never enters boardBalanceIssues so this cannot cry wolf.
// Delivery follows the verdict precedent (BOARD-CHATMODE1 R3): panel mode → a system
// row in the stream; bubbles mode → a persistent ⚠️ toast (closable, ✕).
let _boardIssueAnnounced = new Set()   // `${txid}|${hac}|${asset}|${reason}` — once per instance
function boardAnnounceIssues(txid, short, unassoc){
  const label = a => String(a).toLowerCase() === "hbar" ? "HBAR"
    : (typeof getAssetMeta === "function"
        && (getAssetMeta(a)?.token_class?.symbol || getAssetMeta(a)?.token_class?.name)) || a
  const rows = []
  for(const [reason, map] of [["unassoc", unassoc], ["short", short]])
    for(const [acct, assets] of Object.entries(map || {})){
      const hac = String(acct).split(":")[1] || String(acct)
      for(const asset of assets || []){
        const k = `${txid}|${hac}|${asset}|${reason}`
        if(_boardIssueAnnounced.has(k)) continue
        _boardIssueAnnounced.add(k)
        rows.push(reason === "unassoc"
          ? `⚠️ ${hac} — ${label(asset)} not associated, the transfer can't settle`
          : `⚠️ ${hac} — insufficient ${label(asset)} balance`)
      }
    }
  if(_boardIssueAnnounced.size > 400) _boardIssueAnnounced = new Set()
  for(const msg of rows){
    if(document.body.dataset.kchatMode === "panel" && window.katomiaChat?.system)
      window.katomiaChat.system(msg)
    else
      notify(msg, "warning", { timeout: 0 })
  }
}

// start/stop the signing-status poll with the signing phase. Called from render()
// after boardSigning is (re)computed. Poll interval mirrors the widget's fallback
// cadence; a live WS feed can supersede this later (PROP-SIGN-UNIFY1).
function boardEnsureSignStatusPoll(){
  if(boardSigning?.tx?.txid && ring16()){
    if(!_boardSignPoll){
      boardRefreshSignStatus()
      _boardSignPoll = setInterval(boardRefreshSignStatus, 4000)
    }
  } else if(_boardSignPoll){
    clearInterval(_boardSignPoll); _boardSignPoll = null
    boardSignStatus = null; _boardSignLast = ""
  }
}

function boardTxLegs(tx){
  // BOARD-TXNETVIS1 (user 2026-08-03, lab1 t-duo): pchbasis is the NETTED on-chain
  // list — one line per (token, account) — so rebuilding the board scene from it
  // DESTROYS per-offer provenance. Measured on t-duo at last lock: Alice's 0.1 KUSD
  // reward netted into her 0.5 KUSD send and her reward chip VANISHED; Bob's two
  // KUSD chips (0.5 from Alice + 0.1 from Goodwin) merged into one sleeveless 0.6.
  // The chain tx was always correct — only the display lied.
  // The pending record already broadcasts the PRE-NET lines as source.offers
  // ({fromId,toId,assetId,amount}, "publicId:0.0.x" form, katomia.js postCluster) —
  // use those for the display scene when present; the netted pchbasis path below
  // remains the fallback (old records, sandbox fixtures) and the signing truth.
  const offers = tx?.source?.offers
  if(Array.isArray(offers) && offers.length){
    const by = {}
    const ent = id => (by[id] ||= { recv: [], send: [] })
    const hac = id => String(id || "").split(":")[1] || String(id || "")
    // SIGN-DUPEACCT1 (user 2026-08-06, live on mainnet): two PLAYERS can hold the
    // same hedera account — the user added 0.0.x that another player had already
    // added — and this map is keyed by hedera id, so one leg lands in both
    // segments: "it introduces the other account as like, oh hang on, there's the
    // other account that's also getting a cent, but it's not, it's the same
    // account". Pre-lock the board is right (offers carry the segment's own
    // account id); only the signing repaint collapses them. The offers path — and
    // ONLY the offers path — still knows the full ids, so carry them onto the leg
    // and let the renderers claim their own. The netted pchbasis fallback below
    // genuinely cannot know (it is on-chain lines, where the two ARE one account),
    // so it keeps today's duplicated behaviour rather than guessing.
    offers.forEach(o => {
      const from = hac(o.fromId), to = hac(o.toId), amount = Number(o.amount ?? 1)
      if(!from || !to || !amount) return
      ent(to).recv.push({ assetId: o.assetId, amount, from, toId: o.toId, fromId: o.fromId })
      ent(from).send.push({ assetId: o.assetId, amount, to, fromId: o.fromId, toId: o.toId })
    })
    return by
  }
  let basis = tx?.pchbasis
  try { if(typeof basis === "string") basis = JSON.parse(basis) } catch { basis = null }
  basis ||= {}
  // REAL shape (computePch → pchbasis.transfers.*; review-15 fix — the first
  // slice parsed a guessed add* shape that doesn't exist, so the board
  // cleared: countdown fired, legs stayed empty). Legacy add* kept as a
  // fallback for the sandbox/old records.
  const t = basis.transfers || {}
  const hbar = t.hbarTransfers || basis.addHbarTransfer || []
  const toks = t.tokenTransfers || basis.addTokenTransfer || []
  const nfts = t.nftTransfers || basis.addNftTransfer || []
  const by = {}
  const ent = id => (by[id] ||= { recv: [], send: [] })
  const senders = {}
  // SIGN-GHOSTPREVIEW1: the mirror image of `senders`. recv legs have always carried
  // `from` so a receiving chip knows who gave it; send legs now carry `to` so the GIVER's
  // side can be reconstructed too — which is what restores the counter ghosts and their
  // dotted lines during signing. Same ambiguity rule: two senders of one asset = null.
  const receivers = {}
  const flow = (acct, assetId, amt) => {
    if(!acct || !amt) return
    if(amt < 0){
      ent(acct).send.push({ assetId, amount: -amt })
      senders[assetId] = (assetId in senders) ? null : acct   // null = ambiguous
    } else {
      ent(acct).recv.push({ assetId, amount: amt })
      receivers[assetId] = (assetId in receivers) ? null : acct
    }
  }
  hbar.forEach(x => flow(x.accountId, "HBAR", Number(x.amount ?? x.value ?? 0)))
  toks.forEach(x => flow(x.accountId, x.tokenId, Number(x.amount ?? x.value ?? 0)))
  nfts.forEach(x => {
    const serial = x.serialNumber ?? x.serial
    const id = `${x.tokenId}#${serial}`
    const from = x.senderAccountId || x.sender || null
    const to = x.receiverAccountId || x.receiver || null
    if(from){ ent(from).send.push({ assetId: id, amount: 1 }); senders[id] = from }
    if(to){ ent(to).recv.push({ assetId: id, amount: 1 }); receivers[id] = to }
  })
  Object.values(by).forEach(e => {
    e.recv.forEach(r => { r.from = senders[r.assetId] || null })
    e.send.forEach(s => { s.to = receivers[s.assetId] || null })   // SIGN-GHOSTPREVIEW1
  })
  return by
}

/**
 * SIGN-GHOSTPREVIEW1 (user 2026-07-30): rebuild the counter ghosts for the signing phase.
 *
 * buildReservedByAccount() derives every ghost from account.basket — but the STRIKE CLEARS
 * THE BASKETS server-side, so the moment a deal composes there is nothing left to derive
 * from and the givers' counters go empty. The receiving side was already compensated
 * (boardTxChips paints the recv legs back in), but the giving side never was: you could see
 * what you were getting and not what you were giving, exactly when you most want to check.
 *
 * So synthesise the giving side from the tx legs, in the same shape buildReservedByAccount
 * produces, and let boardReservedChips render it unchanged — including the dotted
 * hover line, which is why send legs now carry `to`.
 */
function boardSigningReserved(legs, accounts){
  const out = {}
  const fullId = hac => accounts.find(a => (a.id.split(":")[1] || a.id) === hac)?.id || null
  // SIGN-DUPEACCT1: fullId() resolves a hedera id to the FIRST account holding
  // it, which is a coin toss when two players have added the same one. Where the
  // leg carries its own full ids (offers path), they win — same both-guards rule
  // as boardTxChips: only when that id really names an account in this game.
  const known = id => !!(id && accounts.some(a => a.id === id))
  for(const [hac, entry] of Object.entries(legs || {})){
    const fromId = fullId(hac)
    if(!fromId) continue
    for(const leg of entry.send || []){
      const owner = known(leg.fromId) ? leg.fromId : fromId
      ;(out[owner] ||= []).push({
        assetId: leg.assetId,
        amount: leg.amount,
        toAccountId: known(leg.toId) ? leg.toId : ((leg.to && fullId(leg.to)) || "")
      })
    }
  }
  return out
}

/**
 * The reserved map every render should use. Normally just buildReservedByAccount; during
 * signing, accounts whose baskets the strike emptied get their ghosts back from the tx.
 * Merged per-account and only where the real map is empty, so a still-populated basket
 * always wins and nothing is ever drawn twice.
 */
function boardReserved(accounts){
  const base = buildReservedByAccount(accounts)
  if(!boardSigning) return base
  const extra = boardSigningReserved(boardSigning.legs, accounts)
  for(const [id, items] of Object.entries(extra))
    if(!base[id]?.length) base[id] = items
  return base
}

// SIGN-STATUSLANG1 (still open — user 2026-07-11): the lock arcs' `sign` field
// below is a single WHOLE-TX status (pending/signed/failed) applied uniformly
// to every account with legs in the tx — it can't yet distinguish "this
// account hasn't signed" (orange) from "this account signed" (green) from
// "this account can't fund its leg / needs token association" (red), which is
// what was asked for: the exact same per-account rules the signing modal uses
// (kpool_widget/view.js: accountSigningStatus() + updateCardSigning()). Doing
// that correctly needs the same inputs the modal has and the board doesn't
// today — per-account keyInfo + balances from a mirror-node enrichment pass
// (index.js's enrichAccountsKeyInfo/enrichWall), then the same threshold
// solver (getThresholdSummary) — not just data.sigs. Reusing that logic
// directly (rather than re-deriving similar-but-different rules here) is the
// point of SIGN-STATUSLANG1's "shared vocabulary module... reuse on the game
// board" — half-implementing it on the board risked exactly the drift
// PROP-SIGN-UNIFY1 exists to prevent. Flagging as the next queued piece
// rather than guessing at colors for money-moving state.
// SINGLE SOURCE OF TRUTH cross-reference (user 2026-07-15: the displayed
// countdown, an earlier client-side expiry-verdict guess, and the ACTUAL
// backend-driven clearing of signing mode all used DIFFERENT deadlines and
// visibly disagreed — "async expiries", a countdown reading 0:00 while the
// board stayed in signing mode for another minute). The backend is
// authoritative — it's the one that actually resolves + broadcasts:
// hbarlive_hts/katomiaWorker.js, TX_GRACE_MS (10s, was 30s until
// 2026-07-15) + the SDK-default 120s duration → fallback deadline =
// validStart + 130s, checked every INTERVAL (5s). This constant mirrors
// that NUMBER for the countdown display only — and only as the LAST-RESORT
// guess: the broadcast validDurationSeconds (round 3) supersedes it for
// every tx struck since. It does not drive any verdict (that's purely
// signal-driven, see renderRingBoard). Keep numerically in sync with the
// backend constants above if either changes.
const BOARD_TX_EXPIRY_MS = 130000

function boardDetectSigning(){
  if(!ring15()) return null
  const txs = (state?.tx?.pending || []).filter(t => !t.lifecycle?.isFinalStatus)
  if(!txs.length) return null
  const tx = txs[0]
  const st = String(tx.lifecycle?.status || "PENDING").toUpperCase()
  // txid = payer@validStartSeconds.nanos; Hedera valid window defaults 180s
  const vs = Number(String(tx.txid || "").split("@")[1]?.split(".")[0]) * 1000
  return {
    tx,
    legs: boardTxLegs(tx),
    // BOARD-RETRY1 (backlog — user 2026-07-11): a "failed" verdict here just
    // falls through to boardDetectSigning() returning null on the next render
    // (isFinalStatus excludes it from `txs`) — everything silently pops back
    // to stores/negotiation and the deal's history is lost. Owner's design
    // direction: auto-retry by default — repopulate baskets from the failed
    // tx's legs and re-lock as a draft (the inverse of the strike), rather
    // than reconstructing state from scratch via a re-fetched txid. See
    // BOARD-RETRY1 for the full design (and the netted-representation note:
    // reloading by txid alone loses the pre-netting proposal shape, which is
    // fine — represent it netted). Not building this pass, just marking where
    // it hooks in.
    status: st === "SUCCESS" || st === "SIGNED" ? "signed" : /FAIL|ERROR|EXPIRE|INVALID/.test(st) ? "failed" : "pending",
    // KATOMIA-VALIDDUR1 (user 2026-07-15): txDelaySeconds means the tx can
    // sit in pending BEFORE its own validStart is even reached — a distinct
    // "not submittable yet" stage the banner should separate from "waiting
    // for signatures" (which only makes sense once submission is possible).
    validStartMs: vs || null,
    // KATOMIA-VALIDDUR1 source priority (round 3 — the round-2 version waited
    // on the signstatus poll's bytes decode, so the countdown flashed the
    // 150s guess for several seconds before snapping to the real number):
    //   1. tx.validDurationSeconds — the BROADCAST value, stamped on the
    //      pending record by postCluster at build time (the same number
    //      handed to setTransactionValidDuration). Present from the very
    //      first game_state push, so no guess-flash at all for new txs.
    //   2. boardSignStatus.validDurationSeconds — the signstatus poll's
    //      bytes decode (model.txRead VALIDD1), for txs struck before the
    //      broadcast field existed. Guarded by txid so a stale value from a
    //      previous tx can't leak in.
    //   3. BOARD_TX_EXPIRY_MS — the documented fallback guess.
    // boardSigningWindowDiag below logs which source won, once per change.
    expiry: (vs || tx.createdAt || Date.now()) + (
      tx.validDurationSeconds ? tx.validDurationSeconds * 1000
      : boardSignStatus?.txid === tx.txid && boardSignStatus.validDurationSeconds
        ? boardSignStatus.validDurationSeconds * 1000
        : BOARD_TX_EXPIRY_MS),
    durationSource: tx.validDurationSeconds ? "broadcast"
      : boardSignStatus?.txid === tx.txid && boardSignStatus.validDurationSeconds ? "bytes-decode"
      : "fallback-guess"
  }
}

// KATOMIA-VALIDDUR1 diagnostics: one kdiag line whenever the signing window
// CHANGES (new txid, or the duration source/value upgraded mid-flight, e.g.
// fallback-guess → bytes-decode when the poll lands) — the untangling trace
// the timing bugs kept needing. Deliberately not per-render: same window =
// silence.
let _boardWindowLogged = ""
function boardSigningWindowDiag(sig){
  if(!sig){ _boardWindowLogged = ""; return }
  const key = `${sig.tx?.txid}|${sig.durationSource}|${sig.expiry}`
  if(key === _boardWindowLogged) return
  _boardWindowLogged = key
  boardDiag("board:signing:window", {
    txid: sig.tx?.txid,
    network: gameMeta?.network || null,
    validStartMs: sig.validStartMs,
    validStartIso: sig.validStartMs ? new Date(sig.validStartMs).toISOString() : null,
    expiry: sig.expiry,
    expiryIso: new Date(sig.expiry).toISOString(),
    durationSource: sig.durationSource,
    broadcastDurationS: sig.tx?.validDurationSeconds ?? null,
    decodedDurationS: boardSignStatus?.txid === sig.tx?.txid ? boardSignStatus?.validDurationSeconds ?? null : null
  })
}

// paint a party's receiving legs as basket chips (static in this slice —
// withdraw/reject don't apply to a struck tx; sleeve = giver where unique)
// ownerId = whose basket this container IS. Separate from toAccountId (which is
// BOARD-SWEEPWIN1's flight target and is deliberately absent on the ring-box
// path) purely so adding the SIGN-DUPEACCT1 filter can't switch the settle
// flight on for a call site that never had it.
function boardTxChips(legs, container, accounts, toAccountId, ownerId = toAccountId){
  legs.recv.forEach(leg => {
    // SIGN-DUPEACCT1: this legs entry is keyed by hedera id, so when two players
    // have added the same account BOTH their segments land here. A leg that knows
    // its full destination id belongs to exactly one of them. Guarded twice over:
    // no filtering unless the leg carries a full id AND that id actually names an
    // account in this game — if the record's id namespace ever stops matching
    // account.id, this silently degrades to the old duplicated-but-harmless paint
    // rather than dropping a chip that has nowhere else to appear.
    if(ownerId && leg.toId && leg.toId !== ownerId && accounts.some(a => a.id === leg.toId)) return
    const giver = leg.from
      ? accounts.find(a => (a.id.split(":")[1] || a.id) === leg.from)
      : null
    const el = makeAssetEl({
      text: boardAssetText(leg.assetId, leg.amount),
      assetId: leg.assetId,
      ownerAccountId: giver?.id || "",
      ownerPlayerId: giver?.playerId || "",
      basket: !!giver
    })
    applyAssetClasses(el, leg.assetId, leg.amount)
    el.classList.add("board-chip", "board-txchip")
    // BOARD-CHIPART1 fix (user 2026-08-04): tx legs were the one chip built
    // WITHOUT ringTint, so the colour variant had no --own/--own-ink and they
    // rendered blank white (white ink fallback on white face) on the demo
    ringTint(el, giver?.playerId)
    if(leg.from) el.dataset.fromHac = leg.from
    if(toAccountId) el.dataset.toAccount = toAccountId   // BOARD-SWEEPWIN1: settle flight target
    boardTip(el, "Pending transaction leg — awaiting signatures")
    container.appendChild(el)
  })
}

// BOARD-SWEEPWIN1 first slice (user 2026-08-03): on consensus SUCCESS the incoming
// chips visibly move home. Confetti fires first; a beat later each pending-leg chip
// flies from the basket where it sits into its receiving account's own STORE zone —
// easing in and out (clear start, clear end, user's spec) — while the ownership
// sleeve tweens from the GIVER's colour to the NEW OWNER's: consensus is the moment
// ownership changes, and the colour change rides the move. CLONES on a fixed layer,
// because the next state paint owns the real chips and may wipe them mid-flight.
// Rolling snapshot of the on-screen txchips while signing — the settle broadcast can
// wipe the DOM before (or in the same tick as) the success receipt lands, so the
// flight builder needs a memory of where the chips WERE. Refreshed per paint, 600ms
// after, once the organic sim has settled the positions.
let _boardTxChipSnap = []
function boardSnapTxChips(){
  const snap = []
  document.querySelectorAll(".board-txchip").forEach(el => {
    const r = el.getBoundingClientRect()
    if(r.width) snap.push({ toAccount: el.dataset.toAccount, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, html: el.outerHTML })
  })
  if(snap.length) _boardTxChipSnap = snap
}
function boardSettleFlights(){
  try{
    const root = document.getElementById("boardRoot")
    if(!root) return
    const rb = root.getBoundingClientRect()
    const accountMap = getAccountMap()
    // live chips first; fall back to the rolling snapshot when the paint beat us
    let items = []
    document.querySelectorAll(".board-txchip").forEach(el => {
      const r = el.getBoundingClientRect()
      if(!r.width) return
      items.push({ toAccount: el.dataset.toAccount, rect: r, el })
    })
    const fromSnap = !items.length
    if(fromSnap) items = _boardTxChipSnap.map(s => ({ ...s }))
    boardDiag("board:settleflights", { count: items.length, fromSnap })
    if(!items.length) return
    const layer = document.createElement("div")
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:40"
    document.body.appendChild(layer)
    let i = 0
    items.forEach(it => {
      const toId = it.toAccount
      const a = toId && _boardChatAnchors[toId]          // store-band point for that segment
      if(!a) return
      const r = it.rect
      let clone
      if(it.el){ clone = it.el.cloneNode(true); it.el.style.visibility = "hidden" }
      else { const tmp = document.createElement("div"); tmp.innerHTML = it.html; clone = tmp.firstElementChild }
      if(!clone) return
      clone.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:40;transition:transform 1.15s cubic-bezier(.45,0,.22,1), border-left-color 1.15s ease, opacity .35s ease 1.15s;opacity:1`
      layer.appendChild(clone)
      const dx = (rb.left + a.x) - (r.left + r.width / 2)
      const dy = (rb.top + a.y) - (r.top + r.height / 2)
      const newOwner = getPlayerColour(accountMap[toId]?.playerId)
      // movement starts AFTER the confetti beat (700ms), staggered — a procession
      setTimeout(() => {
        clone.style.transform = `translate(${dx}px, ${dy}px) scale(.92)`
        if(newOwner) clone.style.borderLeftColor = newOwner
        clone.style.opacity = "0"                        // settles into the store as the paint catches up
      }, 700 + i++ * 110)
    })
    _boardTxChipSnap = []
    setTimeout(() => layer.remove(), 700 + i * 110 + 1700)
  } catch(e){ boardDiag("board:settleflights:error", { e: String(e) }) }
}

// review 17: the direct WalletConnect signing flow — mirrors the widget's
// "Sign now" (signer-walletconnect.js) without its UI: ensure a connected
// account, take the tx bytes from the broadcast (txhex; txRead fallback),
// WC.signTx, POST the signature to the pool. HashPack-first MVP.
function boardHexToBytes(hex){
  const out = new Uint8Array(hex.length / 2)
  for(let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

// KDIAG-BOARDBLIND1: window.kdiag only exists once the kpool widget's modal
// mounts, which ring16 deliberately never does (board IS the signing surface,
// no modal). Bare window.kdiag?.() calls were silently swallowing every
// board:sign:* event. katomiaDiagSend (katomia-modals.js, now loaded on
// board.php) posts to /diag directly regardless — same fallback pattern as
// katomia-render-orders.js:578.
const boardDiag = (typeof katomiaDiagSend === "function") ? katomiaDiagSend : (msg, data) => window.kdiag?.(msg, data)

// KDIAG-TXBYTES1: /future/?action=txRead proxies through getCachedData(),
// which (bug, tracked separately) can return the literal text
// "error KR994 cache loading locked, please retry" instead of JSON while a
// concurrent origin fetch is in flight. r.json() then throws, gets swallowed,
// and boardDirectSign reported a generic "transaction bytes unavailable" with
// no way to tell a real missing-tx from a transient lock. One short retry
// covers the transient case; either way we now log the raw response.
async function boardReadTxBytes(network, txid){
  for(let attempt = 0; attempt < 2; attempt++){
    const r = await fetch(`/future/?action=txRead&network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`)
    const text = await r.text()
    let j = null
    try { j = JSON.parse(text) } catch {}
    // KDIAG-TXBYTES2: kpool.php wraps the payload as {success, result:{...hex2}} —
    // the widget's own txRead() (model.js:31, `data = rawTx.result`) unwraps this;
    // this call was checking j.hex2 at the top level and always missing it, which
    // is why this always threw "transaction bytes unavailable" (confirmed live:
    // the endpoint returns 200 with a real hex2, just nested under .result).
    const hex2 = j?.result?.hex2 ?? j?.hex2
    if(hex2) return boardHexToBytes(hex2)
    boardDiag("board:sign:bytes-miss", { attempt, status: r.status, bodyStart: text.slice(0, 120) })
    if(attempt === 0) await new Promise(res => setTimeout(res, 1200))
  }
  return null
}

// SIGN-ERRSTR1: WalletConnect rejections are plain objects ({message, code, data}),
// not Error instances — String(e) gave kdiag and the toast "[object Object]",
// which is why the 2026-07-17 network-mismatch incident wasn't self-diagnosing.
function boardWcErrStr(e){
  if(e instanceof Error) return e.message
  if(typeof e === "string") return e
  if(e && typeof e === "object"){
    const parts = [e.message, e.code != null ? `(code ${e.code})` : null].filter(Boolean)
    if(parts.length) return parts.join(" ")
    try { const j = JSON.stringify(e); if(j && j !== "{}") return j } catch {}
  }
  return String(e)
}

async function boardDirectSign(account){
  const wc = window.WC
  const tx = boardSigning?.tx
  if(!tx) return
  const network = gameMeta?.network || ""
  if(!wc?.signTx){
    /* KBUNDLE-STRIP:extsign */
    // bundle missing → the external page still signs (never dead-ends). In stripped
    // bundles (SIGN-HUBLINKPRUNE1) the external page doesn't exist, so this branch
    // just returns — the WC bundle ships in those builds, so reaching here at all
    // means something else is broken.
    window.open(`/m/sign/?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(tx.txid)}&pch=${encodeURIComponent(tx.pch || "")}`, "_blank")
    /* /KBUNDLE-STRIP:extsign */
    return
  }
  const accountId = account.id.split(":")[1] || account.id
  try {
    boardDiag("board:sign:click", { network, txid: tx.txid, accountId })
    // WC-NETSCOPE1: the bundle initialises for config chains[0] (mainnet), and the
    // board never scoped it — so after any reload the first Sign tap on a testnet
    // game built a mainnet connector (mainnet-scoped pairing proposal, wrong-network
    // signers). Same ensureNetwork dance as addAcctConnect / the modals, BEFORE any
    // other WC call so getAccount/connect/signTx all see the game's network.
    if(network && wc.ensureNetwork){
      try {
        await wc.ensureNetwork(network)
        window.kauthPruneWcModals?.()   // WC-NETSWITCH1: drop the stale modal a rebuild left
      } catch(e){ boardDiag("board:sign:ensure-network-fail", { network, error: boardWcErrStr(e) }) }
    }
    let active = null
    try { active = await wc.getAccount?.() } catch {}
    if(!active) active = await wc.connect()          // pairing UI is the wallet's own
    if(active !== accountId && typeof wc.setActiveAccount === "function"){
      try { await wc.setActiveAccount(accountId) } catch(e){
        notify(`Wallet is connected as ${active} — switch to ${accountId} in your wallet, or sign as ${active}`, "warning", { timeout: 6000 })
      }
    }
    let bytes = tx.txhex ? boardHexToBytes(tx.txhex) : null
    if(!bytes) bytes = await boardReadTxBytes(network, tx.txid)
    if(!bytes) throw new Error("transaction bytes unavailable")
    const signAs = (await wc.getAccount?.()) || accountId
    if(signAs !== accountId){
      // WS-ACCTMISMATCH1 (user 2026-08-05, live testnet failure — t-prop, needed
      // 0.0.1879, wallet stayed active as 0.0.1532): wc.setActiveAccount above can
      // resolve without throwing yet not actually switch anything — many WC/Hedera
      // wallet sessions are fixed to one account per pairing, so "switching" is a
      // no-op the SDK doesn't surface as an error. Without this check, signTx below
      // would silently sign with whatever account the wallet actually has active —
      // NOT the account this tx needs — burning the entire signing window on a
      // signature that can never satisfy the lock rule, then failing ~40s later
      // with no clue why ("mainnet works, testnet doesn't" — mainnet games only
      // ever involve one account, so this mismatch can't occur there). Hard-stop
      // here instead: tell the user exactly which account to switch to, immediately.
      boardDiag("board:sign:account-mismatch", { txid: tx.txid, network, needed: accountId, active: signAs })
      notify(`Wallet is connected as ${signAs} but this needs ${accountId} to sign — switch accounts in your wallet (or disconnect and reconnect as ${accountId}), then tap Sign again.`,
        "error", { timeout: 15000 })
      return
    }
    // WS-SIGNDIAG1 (user 2026-08-03, t-prop): "wallet said done, board never got the
    // signature" — the WC RELAY socket can die silently and signTx then just never
    // resolves. Watchdogs (diagnosis + user cue only — a late response still saves):
    // 25s in, note it in kdiag; 60s, tell the user what to try. The real fix
    // (relay health-check/re-subscribe inside the KWC bundle) is WC-RELAYHEALTH1.
    const signT0 = Date.now()
    const wd1 = setTimeout(() => {
      boardDiag("board:sign:slow", { txid: tx.txid, accountId: signAs, waitedMs: Date.now() - signT0 })
    }, 25000)
    const wd2 = setTimeout(() => {
      boardDiag("board:sign:stalled", { txid: tx.txid, accountId: signAs, waitedMs: Date.now() - signT0 })
      // WC-SESSIONWEDGE1 (user 2026-08-04): a wedged WalletConnect session survives
      // page reloads (it lives in this site's localStorage), so "refresh" alone is
      // useless advice — the fix that actually worked was disconnecting this site in
      // the wallet app and re-pairing. Say so explicitly; users can't guess this.
      boardReportTxAdvice(tx.txid, "watchdog", { message: "Still waiting for the wallet's response — if you already approved, the connection is likely stuck. Fix: open your wallet app, disconnect this site, then Sign again to reconnect.", level: "warning", timeout: 12000 })
    }, 60000)
    // S4 / rule 4: register the attempt with the controller. A superseding Sign
    // tap on the same tx, or the tx reaching terminal, fires this abort — the
    // watchdogs die AND the in-flight KWC request is cancelled (KWC-CANCELLED,
    // handled silently below) instead of leaking a timer that fires at +120s.
    const attemptId = window.katomiaTxStatus?.attempt(tx.txid, { accountId: signAs,
      abort: () => { clearTimeout(wd1); clearTimeout(wd2); try { wc.cancelInFlight?.({ label: `signTx:${signAs}`, reason: "superseded or terminal" }) } catch {} } })
    let signedTransactionHex
    try {
      ({ signedTransactionHex } = await wc.signTx({ accountId: signAs, transactionBytes: bytes }))
    } finally {
      clearTimeout(wd1); clearTimeout(wd2)
      if(attemptId) window.katomiaTxStatus?.attemptDone(attemptId)
    }
    const save = await fetch("/future/?action=txSave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network, comment: "board direct sign",
        response: { signedTransaction: Array.from(boardHexToBytes(signedTransactionHex)) } })
    })
    if(!save.ok) throw new Error(`signature save failed (${save.status})`)
    boardDiag("board:sign:saved", { txid: tx.txid, accountId: signAs })
    boardMySignedTx.set(tx.txid, Date.now())   // feeds boardCheckJustSucceeded's "vanished from pending" detector
    notify(`✍ Signed as ${signAs}`, "success", { timeout: 4000 })
  } catch(e){
    // SIGN-ERRSTR1: readable message + the raw rejection as a structured field
    // (not a string) so the next incident is self-explaining in kdiag.
    let raw
    try { raw = JSON.parse(JSON.stringify(e)) } catch {}
    // S2 / TXS-2: the payload now names its transaction — this event carrying
    // no txid was why the 08:11 ghost toasts could not be attributed in kdiag.
    boardDiag("board:sign:error", { txid: tx.txid, accountId, error: boardWcErrStr(e), code: e?.code, raw })
    // S4: a cancelled attempt (superseded by a new tap, or its tx reached
    // terminal) is deliberate silence — logged above, never toasted.
    if(/^KWC-CANCELLED/.test(boardWcErrStr(e))) return
    // WC-RELAYHEALTH1: the bundle now throws typed KWC-* errors (KWC-STALE stale
    // session preflight, KWC-RELAY-LOST transport death mid-request, KWC-TIMEOUT
    // 120s cap) whose messages already carry the actual fix (disconnect the site
    // in the wallet app, re-pair) — show them prominently instead of the generic
    // wrapper, and give them time to be read. S2: routed via the controller, so
    // a KWC-TIMEOUT landing after its tx is already settled is dropped, not shown.
    const _em = boardWcErrStr(e)
    // WC-RELAYHEALTH1 R3 (user 2026-08-13, lab1 ghost-session incident): a KWC-TIMEOUT
    // means the tx's validity window is already dead — there is nothing viable left to
    // kill — and kdiag showed the flow re-using a wallet-side-cleared session forever
    // (7 attempts, ping dead in 4s each time, request published into a dead topic,
    // HashPack opens showing nothing, no error ever comes back). Self-heal HERE:
    // disconnectAccount bins this account's signer AND purges the localStorage session
    // (so init can't resurrect the corpse on reload) — the NEXT Sign tap finds no
    // signer and takes the connect path: fresh pairing modal, then sign. That is the
    // exact behaviour the user praised on lab2, which simply had no stored signer.
    // Cost if the user merely dawdled past the window on a LIVE session: one
    // re-approval tap. The R1 lesson stands — nothing gates or kills an in-flight
    // sign on ping evidence; this acts only after the window has already expired.
    if(/^KWC-TIMEOUT/.test(_em)){
      boardDiag("wc:heal:purge-on-timeout", { txid: tx.txid, accountId })
      try { await wc.disconnectAccount?.(accountId) } catch(e2){ boardDiag("wc:heal:purge-failed", { accountId, error: boardWcErrStr(e2) }) }
      boardReportTxAdvice(tx.txid, "wallet", { message: "⚠ No response from the wallet — that connection was dead and has been reset automatically. On your next Sign you'll be asked to approve a fresh connection, then signing works as normal.", level: "error", timeout: 15000 })
      return
    }
    if(/^KWC-/.test(_em)) boardReportTxAdvice(tx.txid, "wallet", { message: "⚠ " + _em.replace(/^KWC-[A-Z-]+: /, ""), level: "error", timeout: 15000 })
    else boardReportTxAdvice(tx.txid, "wallet", { message: `Signing failed: ${_em}`, level: "error", timeout: 6000 })
  }
}

let _boardCountdownTimer = null
function boardStartCountdown(el){
  clearInterval(_boardCountdownTimer)
  const tick = () => {
    if(!boardSigning || !document.body.contains(el)){ clearInterval(_boardCountdownTimer); return }
    const left = Math.max(0, boardSigning.expiry - Date.now())
    const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000)
    // "Expired?" with the question mark — the BACKEND's own label for this
    // exact state (kpoolHelpers getTxValidityStatus: display 'Expired?'
    // while the verdict is still uncertain, plain 'Expired' only later).
    // User 2026-07-15: the grace limbo needs marking, not a bare "expired"
    // you sit under "dumbly wondering" — this is the egg-timer's last few
    // grains (SIGN-COUNTDOWN1's hourglass framing: sand visually buffers
    // the clock drift we can't be precise about). The definite verdict is
    // the wiper + 🟥 toast when the backend's resolve broadcast lands.
    el.textContent = left ? `${m}:${String(sec).padStart(2, "0")}` : "⌛ expired?"
    // KATOMIA-VALIDDUR1: the pre-submit banner shows a live "opens in Ns" —
    // render() only calls boardUpdateBanner on state changes, which can be
    // sparse during a quiet wait, so this timer (already ticking every
    // second for the hub countdown) keeps it fresh too.
    boardUpdateBanner()
  }
  tick()
  _boardCountdownTimer = setInterval(tick, 1000)
}

// is this account party to MY proposal? Rule-aware, shared by the Party-only
// filter and the hub-ring party cue. cluster → shares a lock group with any
// of my accounts (my own accounts only count if they're IN a group); active →
// any account in the trading graph; all → everyone.
function boardInMyParty(account, allAccounts){
  // signing phase: the struck tx IS the party — the baskets (and with them
  // the lock graph) are cleared server-side at strike
  if(boardSigning){
    const hac = account.id.split(":")[1] || account.id
    return !!boardSigning.legs[hac]
  }
  const rule = gameMeta?.lockRule || "cluster"
  if(rule === "all") return true
  const lp = getLockProgress(account.id)
  if(!lp) return false
  if(rule === "active") return true
  const myGroups = new Set(
    allAccounts.filter(a => isMyAccount(a)).map(a => getLockProgress(a.id)?.groupId).filter(Boolean))
  return myGroups.has(lp.groupId)
}

// net view (user 2026-07-14): one displayed chip = possibly MANY underlying
// basket entries — withdrawing/returning it must take ALL its legs, not one
// at a time (the confirm names the full netted amount; peeling a single leg
// off was a lie). The backend removes one entry per message, so send one per
// raw leg. Direction note: netting also folds OPPOSITE-direction offers into
// the shown chip; those belong to the counterparty and aren't ours to
// withdraw — we clear the shown direction only, so a counter-offer remainder
// re-nets and flips direction, which is visible and truthful.
// FUTURE seam: if net becomes the only view (user is leaning that way, non-
// net kept as a 🧪 escape hatch for now), consider netting the DATA on the
// backend instead — this is the client-side stopgap.
function boardNetLegCount(fromId, toId, assetId){
  if(!(ring8() && boardNetView)) return 1
  const raw = Object.values(state?.accounts || {}).find(a => a.id === toId)?.basket || []
  return Math.max(1, raw.filter(it =>
    String(it.assetId) === String(assetId) && getFromAccountId(it) === fromId).length)
}

function boardNetAccounts(accounts){
  const net = new Map()      // "asset|loId|hiId" → signed amount (+ = lo gives hi)
  const nfts = []            // NFT basket lines pass through untouched
  accounts.forEach(acc => {
    (acc.basket || []).forEach(item => {
      const id = String(item.assetId)
      if(id.includes("#") || !item.fromId){ nfts.push({ to: acc.id, item }); return }
      const [lo, hi] = [item.fromId, acc.id].sort()
      const key = id + "|" + lo + "|" + hi
      const sign = item.fromId === lo ? 1 : -1
      net.set(key, (net.get(key) || 0) + sign * (item.amount || 1))
    })
  })
  const baskets = {}
  accounts.forEach(a => baskets[a.id] = [])
  net.forEach((amt, key) => {
    if(!amt) return
    const [assetId, lo, hi] = key.split("|")
    const to = amt > 0 ? hi : lo, from = amt > 0 ? lo : hi
    if(baskets[to]) baskets[to].push({ assetId, amount: Math.abs(amt), fromId: from })
  })
  nfts.forEach(({ to, item }) => baskets[to] && baskets[to].push(item))
  return accounts.map(a => ({ ...a, basket: baskets[a.id] || [] }))
}

// offer/withdraw choreography: diff the raw state between broadcasts.
// New offers fly ghost→basket for everyone EXCEPT the giver's player (they
// did the motion). Withdrawn/rejected offers fly basket→store for EVERYONE
// including the actor (it's a click, not a drag — the return cue helps).
// Rects+markup are snapshotted each paint so removals can replay from the
// previous layout.
// moves THIS client initiated (offer/pick/redirect) — the flight animation
// skips these; everything else that lands animates, including someone
// picking from MY store (review 14: the old player-level guard wrongly
// suppressed that — the giver is me, but the INITIATOR was the picker)
const _recentLocalMoves = new Map()
function boardNoteLocalMove(toId, fromId, assetId){
  _recentLocalMoves.set(`${toId}|${fromId}|${assetId}`, Date.now())
}
window.boardNoteLocalMove = boardNoteLocalMove   // core.js calls it optionally

let _prevOfferKeys = null
let _prevOfferRects = new Map()
function boardAnimateNewOffers(){
  const keys = new Map()
  Object.values(state?.accounts || {}).forEach(acc => {
    (acc.basket || []).forEach(item => {
      const k = `${acc.id}|${item.fromId}|${item.assetId}`
      keys.set(k, (keys.get(k) || 0) + (item.amount || 1))
    })
  })
  const prev = _prevOfferKeys
  _prevOfferKeys = keys

  const pairEls = k => {
    const [toId, fromId, assetId] = k.split("|")
    const sel = `[data-owner-account="${CSS.escape(fromId)}"]`
      + `[data-asset-id="${CSS.escape(assetId)}"]`
      + `[data-to-account="${CSS.escape(toId)}"]`
    return {
      ghost: document.querySelector(`.asset.reserved${sel}`),
      basket: document.querySelector(`.asset.basket${sel}`)
    }
  }

  if(prev){
    const cutoff = Date.now() - 6000
    _recentLocalMoves.forEach((ts, k) => { if(ts < cutoff) _recentLocalMoves.delete(k) })

    keys.forEach((amt, k) => {
      if((prev.get(k) || 0) >= amt) return
      // OWN moves animate too now (user 2026-07-15, KY564 1/300): the local-
      // move skip worked as designed on touch — and the drop "just appeared,
      // no dotted line". On desktop drag the skip happened to miss, the
      // replay ran anyway, and the user liked it. Consistency wins: always
      // fly the leg; _recentLocalMoves stays maintained in case a use
      // returns (e.g. suppressing double-motion if a drag ghost ever
      // animates live).
      const fromAccount = state.accounts?.[k.split("|")[1]]
      if(!fromAccount) return
      const { ghost, basket } = pairEls(k)
      // KNOWN QUIRK, KEPT ON PURPOSE (user 2026-07-14): repeat drops of the
      // same pair leave slightly OFFSET after-glow lines (the other chips
      // shift a touch each re-solve, so each drop's trail lands a few px
      // apart) — a smudged multi-stroke that accentuates "this happened
      // several times". Bug-as-feature; the seam to watch is chip movement
      // getting big enough that the smudge reads as distinct wrong lines —
      // THEN dedupe by removing lines with this pair key before drawing.
      if(ghost && basket){
        const [, fromId, assetId] = k.split("|")
        const colour = getPlayerColour(fromAccount.playerId)
        const pile = document.querySelector(
          `.asset:not(.basket):not(.reserved)[data-owner-account="${CSS.escape(fromId)}"][data-asset-id="${CSS.escape(assetId)}"]`)
        if(pile){
          // fungible: pile stays — clone flies ghost→basket, pile→ghost
          // segment joins the after-glow
          boardFlyLeg(ghost, basket, colour, 0, k)
          boardTrailPileSegment(fromId, assetId, ghost, colour, k)
        } else {
          // NFT (whole chip moved): store→(arc)→ghost→(straight)→basket in
          // one clone flight, launched from where the store chip stood last
          // frame; plain ghost→basket if that spot is unknown
          const oldStore = _boardChipPrevPosOld.get(`${fromId}|store|${assetId}|s#1`)
          if(oldStore) boardFlyNftOffer(oldStore, ghost, basket, colour, k)
          else boardFlyLeg(ghost, basket, colour, 0, k)
        }
      } else if(basket && boardCounterSimple()){
        // BOARD-COUNTERMODE1 partial fungible: no ghost — the remainder pile
        // itself has just rim-pinned where the ghost would have stood. Same
        // choreography as the NFT offer, with the PILE as the rim waypoint:
        // clone launches from where the full stack stood last frame, arcs to
        // the rim (tangent construction unchanged), "drops off" the
        // decremented pile there and continues straight into the basket.
        const [, fromId, assetId] = k.split("|")
        const colour = getPlayerColour(fromAccount.playerId)
        const pile = document.querySelector(
          `.asset:not(.basket):not(.reserved)[data-owner-account="${CSS.escape(fromId)}"][data-asset-id="${CSS.escape(assetId)}"]`)
        if(pile){
          const oldStore = _boardChipPrevPosOld.get(`${fromId}|store|${assetId}|s#1`)
          if(oldStore) boardFlyNftOffer(oldStore, pile, basket, colour, k)
          else boardFlyLeg(pile, basket, colour, 0, k)
        }
      }
    })

    prev.forEach((amt, k) => {
      if((keys.get(k) || 0) >= amt) return
      // a STRIKE clears every basket at once — that's not a withdraw; the
      // legs stay on the table as tx chips, so no fly-home choreography
      // (the success/failure settlement flights come with the next slice)
      if(boardSigning) return
      // withdrawn offer: its after-glow trail is now redundant (user
      // 2026-07-14) — clear it, and the return flight leaves none
      boardTrailLines().forEach(l => {
        if(l.dataset.pairKey === k) l.remove()
      })
      const snap = _prevOfferRects.get(k)
      if(!snap) return
      const [, fromId, assetId] = k.split("|")
      const owner = state.accounts?.[fromId]
      // return target: the owner's store chip it went back into (new DOM);
      // fall back to where the ghost used to be
      const home = document.querySelector(
        `.asset:not(.basket):not(.reserved)[data-owner-account="${CSS.escape(fromId)}"][data-asset-id="${CSS.escape(assetId)}"]`)
      const target = home ? boardChipRect(home) : snap.ghost   // settled spot, not mid-glide
      if(snap.basket && target)
        boardFlyRect(snap.html, snap.basket, target, getPlayerColour(owner?.playerId), 0, { key: k, persist: false })
    })
  }

  // snapshot for the next diff — settled rects (boardChipRect), not the
  // mid-glide transformed ones
  _prevOfferRects = new Map()
  keys.forEach((amt, k) => {
    const { ghost, basket } = pairEls(k)
    if(basket) _prevOfferRects.set(k, {
      basket: boardChipRect(basket),
      ghost: ghost ? boardChipRect(ghost) : null,
      html: basket.outerHTML
    })
  })
}

// bottom control bar (etched variants) — thumb-reach controls that never
// obscure the board: active-only filter + my lock toggles. Later this bar
// hosts the signing roll-up (wallet pick, sign status) per the 2026-07-09
// review — a footer twin of the signing modal's expanding header.
function ringFooter(mine){

  const bar = document.createElement("div")
  bar.className = "ring-footer"

  const check = (label, checked, onchange, title) => {
    const el = document.createElement("label")
    el.className = "ring-footer-filter"
    if(title) el.title = title
    const cb = document.createElement("input")
    cb.type = "checkbox"
    cb.checked = checked
    cb.onchange = () => onchange(cb.checked)
    el.appendChild(cb)
    el.appendChild(document.createTextNode(" " + label))
    return el
  }

  if(!ring8())
    bar.appendChild(check("Active only", showActiveOnly, v => { showActiveOnly = v; render() }))

  if(ring8()){
    // account dropdown: pick → Lock/Unlock acts on it; ➕ Add last. The 🗑
    // delete button is GONE (KAT-ACCTNORM1, user 2026-08-05): account removal
    // lives in Profile → account list → Remove, the ONE management surface —
    // the footer is the play surface (lock/sign only).
    // When all-locked, the Lock slot becomes the SIGN button (same checkpoint,
    // next phase) — see the scene/tx notes at the bottom of this file.
    // user 2026-07-14 (UX polish): a newly-landed account becomes the
    // selection — you just added it, it's what you want to act on. Cumulative
    // seen-set so the first render seeds silently and a party-filter
    // hide/show doesn't count as new.
    const freshMine = _boardSeenMineIds.size ? mine.find(a => !_boardSeenMineIds.has(a.id)) : null
    if(freshMine) boardSelectedAccount = freshMine.id
    mine.forEach(a => _boardSeenMineIds.add(a.id))
    if(!boardSelectedAccount || !mine.some(a => a.id === boardSelectedAccount))
      boardSelectedAccount = mine[0]?.id || null

    // shared composer modal (addaccount-modal.php + katomia-addaccount.js,
    // user 2026-07-14) — WC-connected / connect / manual, same as the
    // legacy page. prompt() stays only as a belt-and-braces fallback.
    const openAdd = () => {
      if(typeof openAddAccountModal === "function") openAddAccountModal()
      else { const v = prompt("Add account (e.g. 12345 or 0.0.12345):"); if(v) addAccounts(v) }
    }

    if(!mine.length){
      // user bug report (2026-07-14): with NO accounts the select held only
      // the "➕ Add account…" option — already selected, so picking it never
      // fired onchange and Add was a dead end (worked fine once ≥1 account
      // existed). An empty list gets a plain button instead.
      const addBtn = document.createElement("button")
      addBtn.className = "ring-footer-accsel"
      addBtn.textContent = "➕ Add account"   // short form fits mobile (user 2026-08-05)
      addBtn.onclick = openAdd
      bar.appendChild(addBtn)
    } else {
    const sel = document.createElement("select")
    sel.className = "ring-footer-accsel"
    mine.forEach(a => {
      const o = document.createElement("option")
      o.value = a.id
      // 🔒 AFTER the id (review 7) — appears/disappears without the id jumping
      o.textContent = (a.id.split(":")[1] || a.id) + (a.mode === "lock" ? " 🔒" : "")
      sel.appendChild(o)
    })
    const add = document.createElement("option")
    add.value = "__add"
    add.textContent = "➕ Add account"
    sel.appendChild(add)
    if(boardSelectedAccount) sel.value = boardSelectedAccount
    sel.onchange = () => {
      if(sel.value === "__add"){
        sel.value = boardSelectedAccount || ""
        openAdd()
        return
      }
      boardSelectedAccount = sel.value
      render()   // re-highlights the selected wedge
    }
    bar.appendChild(sel)
    }

    const selected = () => mine.find(a => a.id === boardSelectedAccount)

    const lockBtn = document.createElement("button")
    const cur = selected()
    const curHac = cur ? (cur.id.split(":")[1] || cur.id) : null
    if(boardSigning && curHac){
      // signing phase: the Lock slot IS the Sign slot (same checkpoint,
      // next phase). Opens the existing signing page — modal untouched;
      // the embedded roll-up is the next slice.
      // User bug report KTAG 8/577 (2026-07-14): this branch used to also
      // require boardSigning.legs[curHac], so accounts NOT party to the
      // struck tx fell through to the Lock button — but locking isn't a
      // thing mid-signing. Now every account shows Sign; non-party accounts
      // sign as a WITNESS (same label per the user's call — the tooltip
      // carries the distinction, no extra visual complexity).
      const party = !!boardSigning.legs[curHac]
      lockBtn.className = "ring-footer-lock ring-footer-sign"
      lockBtn.dataset.testid = "sign"          // QA-TESTHOOKS1
      lockBtn.textContent = "✍ Sign"
      lockBtn.title = party
        ? "Sign this transaction with the selected account"
        : "Sign as witness — this account has no legs in the transaction, but its signature is still recorded"
      // review 17 CORRECTION: Sign is the modal's SIGN ACTION, not the modal —
      // straight to WalletConnect via the headless WC.signTx (connect first
      // if needed), signature saved back to the pool. No intermediate UI;
      // the board IS the signing surface. External all-wallets page stays on
      // the hub tap; the widget modal remains reachable via the tx list
      // outside the ring.
      lockBtn.onclick = () => boardDirectSign(cur)
    } else {
      lockBtn.className = "ring-footer-lock" + (cur?.mode === "lock" ? " locked" : "")
      lockBtn.dataset.testid = "lock"          // QA-TESTHOOKS1
      lockBtn.textContent = cur?.mode === "lock" ? "🔓 Unlock" : "🔒 Lock"
      lockBtn.disabled = !cur
      lockBtn.onclick = () => { const a = selected(); if(a) boardToggleLock(a) }
      if(ring16() && cur){
        // hover previews WHICH arc this would lock — SAME pale orange as hovering
        // the arc itself (user 2026-08-03; was a thin dashed line). No asset
        // highlighting: a lock commits the whole ring, not just your legs.
        // Armed gate: see boardLockPreviewArmed — no preview re-applied between a
        // click and the pointer actually leaving the button.
        const arcOf = () => document.querySelector(
          `.ring-lockarc[data-account-id="${CSS.escape(boardSelectedAccount || "")}"]`)
        // BOARD-SIGNREADONLY1: no preview during signing — the button is the
        // Sign action then, and the lock it would "preview" can't be changed
        lockBtn.onmouseenter = () => { if(boardLockPreviewArmed && !boardSigning) arcOf()?.classList.add("ring-lockpreview") }
        lockBtn.onmouseleave = () => { boardLockPreviewArmed = true; arcOf()?.classList.remove("ring-lockpreview") }
        lockBtn.onclick = () => {
          const a = selected()
          if(!a) return
          boardLockPreviewArmed = false
          arcOf()?.classList.remove("ring-lockpreview")
          boardToggleLock(a)
        }
      }
    }
    bar.appendChild(lockBtn)
  } else {
    mine.forEach(account => {
      const b = document.createElement("button")
      b.className = "ring-footer-lock" + (account.mode === "lock" ? " locked" : "")
      b.dataset.testid = "lock"                // QA-TESTHOOKS1
      b.dataset.account = account.id
      b.textContent = (account.mode === "lock" ? "🔒 " : "🔁 ") + (account.id.split(":")[1] || account.id)
      b.title = account.mode === "lock" ? "Locked — tap to unlock" : "Trading — tap to lock"
      b.onclick = () => boardToggleLock(account)
      bar.appendChild(b)
    })
  }

  if(ringArcs() || susan()){
    const play = document.createElement("button")
    const focusOn = boardFocusMode || (ring16() && !!boardSigning)
    play.className = "ring-footer-play" + (focusOn ? " ring-footer-play--on" : "")
    play.textContent = (boardFocusMode && !boardSigning) ? "⏸" : "▶"
    play.title = ring16()
      ? "Focus preview: assets fly to their baskets and the spotlight closes on the deal — press again to lift it"
      : "Preview: animate every standing offer from its ghost to where it landed"
    play.onclick = () => {
      if(!ring16()){ playTransfers(); return }
      if(boardSigning){ playTransfers(); return }   // spotlight is permanent here
      boardFocusMode = !boardFocusMode
      if(boardFocusMode){ playTransfers(); render() }
      else {
        // graceful lift: fade the shade out before repainting (review 17 —
        // the instant switch was jarring). __boardShadeOn cleared here so the
        // render's else-if (--wipe fade, for the RESOLVE path) doesn't fade a
        // second shade on top of this one.
        const shade = document.querySelector(".ring-focusshade")
        if(shade){
          shade.classList.add("ring-focusshade--out")
          window.__boardShadeOn = false
          setTimeout(render, 560)
        }
        else render()
      }
    }
    bar.appendChild(play)

    // 🧹 tidy RETIRED (user 2026-08-06): "players can move their assets around
    // by hand — if they do that, they just carry on moving them around by
    // hand. We don't want a sweep button to clean up." The machinery it drove
    // (sticky clear + boardPinsClear + boardSimExcite) is untouched and still
    // runs on layout changes; only the footer affordance is gone.
  }

  if(susan()){
    // no hub on the wheel — cluster progress rides the footer instead
    const lp = boardLockSummary(mine, boardFilteredAccounts())
    if(lp){
      const badge = document.createElement("span")
      badge.className = "ring-footer-lp"
      badge.textContent = `🔒 ${lp.locked}/${lp.total}`
      badge.title = `${lp.locked} of ${lp.total} accounts locked (${lp.scope})`
      bar.appendChild(badge)
    }
  }

  // dev start-angle spinner: frozen skins only — review 7 dropped it for v9+
  // (superseded by You-at-bottom, and a no-op while that toggle is on anyway).
  // Parked juice idea: tween the rotation when You-at-bottom flips — the
  // whole layout hangs off one angle, so it's a single-number animation.
  if(!ring8()){
    const rot = document.createElement("label")
    rot.className = "ring-footer-rot"
    rot.title = "Dev: board start angle (degrees, segments run clockwise from here)"
    rot.appendChild(document.createTextNode("↻"))
    const ri = document.createElement("input")
    ri.type = "number"
    ri.step = 15
    ri.value = boardStartAngle
    ri.onchange = () => { boardStartAngle = Number(ri.value) || 0; render() }
    rot.appendChild(ri)
    bar.appendChild(rot)
  }

  return bar
}

// v10 hub ring: one arc per account in its player's colour, aligned with the
// board segments (circle, so true angle = parametric angle); party members
// carry a thin lit arc just inside — the Party-only preview cue
function hubPlayersRing(segs, accounts, rc){
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "ring-hubring")
  svg.setAttribute("viewBox", `0 0 ${rc * 2} ${rc * 2}`)

  const arc = (r, a0, a1, cls, colour) => {
    const rad = d => d * Math.PI / 180
    const p = a => `${(rc + r * Math.cos(rad(a))).toFixed(1)} ${(rc + r * Math.sin(rad(a))).toFixed(1)}`
    const large = (a1 - a0) > 180 ? 1 : 0
    const el = document.createElementNS(NS, "path")
    el.setAttribute("d", `M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}`)
    el.setAttribute("class", cls)
    if(colour) el.style.stroke = colour
    svg.appendChild(el)
  }

  // full-circle single account: two half arcs (an arc to itself draws nothing)
  segs.forEach(seg => {
    const a0 = seg.a0, a1 = seg.a1 - a0 >= 360 ? seg.a0 + 359.9 : seg.a1
    arc(rc - 3, a0, a1, "ring-hubarc", getPlayerColour(seg.account.playerId))
    // v10 drew the party arc INSIDE the hub — white on white, invisible
    // (review 10). v11 lights it OUTSIDE the hub on the felt (ringFelt).
    if(!ring11() && boardInMyParty(seg.account, accounts))
      arc(rc - 7, a0, a1, "ring-hubarc-party")
  })

  return svg
}

// hub rim as cluster progress: base circle in trading blue, locked fraction
// overlaid in lock orange, starting at 12 o'clock
function hubProgressRing(lp, rc){
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "ring-hubring")
  svg.setAttribute("viewBox", `0 0 ${rc * 2} ${rc * 2}`)
  const mk = cls => {
    const c = document.createElementNS(NS, "circle")
    c.setAttribute("cx", rc); c.setAttribute("cy", rc); c.setAttribute("r", rc - 2)
    c.setAttribute("class", cls)
    c.setAttribute("transform", `rotate(-90 ${rc} ${rc})`)
    svg.appendChild(c)
    return c
  }
  mk("ring-hubring-base")
  const arc = mk("ring-hubring-locked")
  const C = 2 * Math.PI * (rc - 2)
  arc.style.strokeDasharray = `${C * lp.locked / lp.total} ${C}`
  return svg
}

// ▶ preview: replay every standing offer as a chip flying from its ghost to
// where it landed (pure eye-candy over getBoundingClientRect — no state
// change; the signing-modal preview idea transplanted to the board). Each
// flight leaves a TRAILING LINE in the giver's colour that fades slowly
// (review 4 — like the signing-modal animation).
function playTransfers(){
  // fresh slate per replay — persistent after-glow trails (boardTrailResidual)
  // from the previous run would double up under the new ones
  boardTrailLines().forEach(l => l.remove())   // BOARD-TRAILSTUCK1: layer query
  // signing phase (review 17): there are no ghost/basket pairs any more —
  // the legs fly from their GIVER's store zone to where they now sit
  if(boardSigning){
    let i = 0
    document.querySelectorAll(".board-txchip").forEach(chip => {
      const fromHac = chip.dataset.fromHac
      if(!fromHac) return
      // SIGN-GHOSTPREVIEW1 (user 2026-07-30: "the preview button doesn't do anything once
      // you're in signing mode"). It looked ONLY for a .ring-avail box — which exists in
      // the box layout but NOT in the organic/ring12 skin the demo runs, where store chips
      // live loose in the zone wrap. So giverBox was undefined, `from` was null, and every
      // chip bailed out: the button genuinely did nothing on exactly the skin in use.
      // Now fly from the giver's restored GHOST when there is one — a truer source anyway,
      // since that is the chip the asset is leaving — and keep the box as the fallback.
      // SIGN-GHOSTFAN1 (user 2026-08-06, kdiag zulu-uniform-61 / zulu-india-66 on
      // lab2 — three NFTs from ONE store to three different accounts): this
      // matched on the OWNER ALONE, so every chip a giver sent flew from, and
      // drew its line back to, whichever of that giver's ghosts happened to be
      // first in the DOM — "all three NFTs link back to the same ghost". Match
      // the ASSET too (and the destination when both sides know it), which is
      // what makes each leg its own; owner-only stays as the fallback so a leg
      // whose exact ghost doesn't exist (netting merged it, ghost suppressed)
      // still animates from somewhere sane rather than not at all.
      const ownedBy = el => (el.dataset.ownerAccount || "").endsWith(":" + fromHac)
      const sameLeg = el => el.dataset.assetId === chip.dataset.assetId
        && (!chip.dataset.toAccount || !el.dataset.toAccount
            || el.dataset.toAccount === chip.dataset.toAccount)
      const ghosts = [...document.querySelectorAll(".board-ghost")].filter(ownedBy)
      const ghost = ghosts.find(sameLeg) || ghosts[0]
      // BOARD-COUNTERMODE1: simple mode may have no ghost (partial fungible)
      // — the rim-pinned remainder pile is the truthful source instead
      const piles = ghost ? null : [...document.querySelectorAll(".board-rimpile")].filter(ownedBy)
      const rimPile = ghost || piles.find(sameLeg) || piles[0]
      const giverBox = rimPile || [...document.querySelectorAll(".ring-avail")]
        .find(b => (b.dataset.dropAccount || "").endsWith(":" + fromHac))
      const from = giverBox ? giverBox.getBoundingClientRect() : null
      if(!from) return
      const giver = Object.values(state?.accounts || {})
        .find(a => (a.id.split(":")[1] || a.id) === fromHac)
      boardFlyRect(chip.outerHTML, from, chip.getBoundingClientRect(),
        getPlayerColour(giver?.playerId), i++ * 220)
    })
    return
  }
  let i = 0
  document.querySelectorAll(".asset.basket").forEach(basketEl => {
    const { ownerAccount, assetId, toAccount, ownerPlayer } = basketEl.dataset
    if(!ownerAccount || !assetId) return
    const sel = `[data-owner-account="${CSS.escape(ownerAccount)}"]`
      + `[data-asset-id="${CSS.escape(assetId)}"]`
      + `[data-to-account="${CSS.escape(toAccount)}"]`
    // BOARD-COUNTERMODE1: simple mode suppresses the ghost for a partial
    // fungible — replay from the rim-pinned remainder pile instead (it sits
    // exactly where the ghost would have; no separate pile→ghost segment
    // needed, the anchor IS the pile)
    const ghost = document.querySelector(`.asset.reserved${sel}`)
    const anchor = ghost || (boardCounterSimple() ? document.querySelector(
      `.board-rimpile[data-owner-account="${CSS.escape(ownerAccount)}"][data-asset-id="${CSS.escape(assetId)}"]`) : null)
    // KAT-FOCUSANIM1 (user 2026-08-01: "not sure all basket chips are animating —
    // if that's evident from kdiag please fix"): it wasn't evident — this skip was
    // silent. Now every basket chip that can't animate for want of its reserved
    // ghost says so in diagnostics. (Live audit 2026-08-02 on t-duo found no
    // orphans once the Goodwin treat-float outage was fixed — the "missing"
    // animations were chips that never existed.)
    if(!anchor){ boardDiag("board:focus:ghostmiss", { ownerAccount, assetId, toAccount }); return }
    // same pair key shape as boardAnimateNewOffers (to|from|asset) so a
    // withdraw clears replay after-glow too
    const k = `${toAccount}|${ownerAccount}|${assetId}`
    boardFlyLeg(anchor, basketEl, getPlayerColour(ownerPlayer), i++ * 220, k)
    if(ghost) boardTrailPileSegment(ownerAccount, assetId, ghost, getPlayerColour(ownerPlayer), k)
  })
}

// SETTLED chip rect (user's kinked-lines screenshot, 2026-07-14 / KTAG
// 8/872+921): getBoundingClientRect() right after a render catches chips
// MID-GLIDE — the FLIP transform still has them at their spawn position, so
// trails anchored there (fungible looked right only by luck: its spawn point,
// the pile, is ON the line; the NFT's old store spot isn't — hence "line from
// where it used to be" and the kink). Organic chips carry their settled
// layout in style.left/top (board coords == viewport coords, #boardRoot is
// fixed inset:0) — use that; anything else falls back to the live rect.
function boardChipRect(el){
  const l = parseFloat(el.style.left), t = parseFloat(el.style.top)
  if(Number.isFinite(l) && Number.isFinite(t))
    return { left: l, top: t, width: el.offsetWidth, height: el.offsetHeight }
  return el.getBoundingClientRect()
}

// pile→ghost after-glow segment (user 2026-07-14: the replay only restored
// ghost→basket — the store→ghost third of the line should draw too). Same
// pair key so withdraw/movement clearing takes all segments together. NFTs
// have no pile chip left — the segment simply doesn't exist for them.
function boardTrailPileSegment(fromId, assetId, ghostEl, colour, key){
  const pile = document.querySelector(
    `.asset:not(.basket):not(.reserved)[data-owner-account="${CSS.escape(fromId)}"][data-asset-id="${CSS.escape(assetId)}"]`)
  if(pile && ghostEl) boardTrail(boardChipRect(pile), boardChipRect(ghostEl), colour, { key, seg: "pg" })
}

// one leg of the transfer animation: clone flies ghost → basket, trail line
// in the giver's colour draws with it and fades. key (optional) tags the
// trail with its offer pair so a later withdraw can clear the after-glow.
function boardFlyLeg(ghost, basketEl, colour, delay, key){
  boardFlyRect(basketEl.outerHTML, boardChipRect(ghost), boardChipRect(basketEl), colour, delay, { key, seg: "gb" })
}

// NFT offer choreography (user 2026-07-14): the store chip ARCS to the rim,
// drops its ghost there, and continues STRAIGHT to the basket — one motion.
// The arc is a quadratic Bézier whose control point sits on the basket→ghost
// line extended past the ghost, so the curve arrives TANGENT to the straight
// leg — no kink at the handoff (the user's own suggested construction). The
// real ghost stays hidden until the clone passes its spot and "drops it off".
// A clone flight rather than a transform glide on the ghost itself: renders
// replace the DOM (root.replaceChildren), which silently killed the earlier
// element-transform spawn glide — a body-level clone is immune. One-off per
// drop: the ▶ replay only ever replays ghost→basket (the store→ghost move is
// history once the ghost exists — user: no need to draw that line again).
function boardFlyNftOffer(fromPos, ghostEl, basketEl, colour, key){
  const g = boardChipRect(ghostEl), b = boardChipRect(basketEl)
  const P0 = { x: fromPos.left + g.width / 2, y: fromPos.top + g.height / 2 }
  const G = { x: g.left + g.width / 2, y: g.top + g.height / 2 }
  const B = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  const gb = Math.hypot(B.x - G.x, B.y - G.y) || 1
  const ext = Math.min(120, Math.hypot(P0.x - G.x, P0.y - G.y) * 0.5)
  const C = { x: G.x + (G.x - B.x) / gb * ext, y: G.y + (G.y - B.y) / gb * ext }

  // the clone is the ASSET on the move (basket styling, same as boardFlyLeg)
  // — the pale ghost is what gets left behind, not what travels
  const tmp = document.createElement("div")
  tmp.innerHTML = basketEl.outerHTML
  const fly = tmp.firstElementChild
  if(!fly) return
  fly.className += " board-fly"
  fly.style.transition = "none"   // driven per-frame — .board-fly's own transform transition would lag it
  fly.style.left = "0px"
  fly.style.top = "0px"
  fly.style.transform = `translate(${P0.x - b.width / 2}px, ${P0.y - b.height / 2}px)`
  document.body.appendChild(fly)
  ghostEl.style.opacity = "0"

  const arcLen = Math.hypot(P0.x - G.x, P0.y - G.y)
  const split = arcLen / (arcLen + gb)   // time share of the arc leg ≈ length share
  let dropped = false
  boardAnimate(950, (e, done) => {
    let x, y
    if(e < split){
      const t = e / split
      x = (1 - t) * (1 - t) * P0.x + 2 * (1 - t) * t * C.x + t * t * G.x
      y = (1 - t) * (1 - t) * P0.y + 2 * (1 - t) * t * C.y + t * t * G.y
    } else {
      if(!dropped){
        dropped = true
        ghostEl.style.opacity = ""            // ghost left behind at the rim
        boardTrail(g, b, colour, { key, seg: "gb" })     // the straight leg's line draws from here
      }
      const t = (e - split) / (1 - split)
      x = G.x + (B.x - G.x) * t
      y = G.y + (B.y - G.y) * t
    }
    fly.style.transform = `translate(${x - b.width / 2}px, ${y - b.height / 2}px)`
    if(done){
      ghostEl.style.opacity = ""   // belt & braces (a mid-flight re-render swaps the element anyway)
      fly.remove()
    }
  })
}

// markup + two rects → flight (also used for withdraw-back, where the source
// chip no longer exists in the new DOM and we replay from a snapshot).
// opts: { key, persist } forwarded to boardTrail.
function boardFlyRect(html, a, b, colour, delay, opts){
  if(!html || !a || !b) return
  const tmp = document.createElement("div")
  tmp.innerHTML = html
  const fly = tmp.firstElementChild
  if(!fly) return
  fly.className += " board-fly"
  fly.style.left = a.left + "px"
  fly.style.top = a.top + "px"
  document.body.appendChild(fly)
  setTimeout(() => {
    fly.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px)`
    boardTrail(a, b, colour, opts)
  }, (delay || 0) + 30)
  setTimeout(() => fly.remove(), (delay || 0) + 1000)
}

// board movement invalidates every drawn trail — the lines are screen-frame
// snapshots, so any rotation/collapse/wheel-scroll leaves them pointing at
// stale coordinates (user 2026-07-14: "if the segment moves, remove the
// line"). Called at the start of each movement tween. (Trails carrying a
// seg marker now ALSO re-anchor live — boardReanchorTrails below — so these
// clears are belt-and-braces for the big layout tweens.)
function boardClearTrails(){
  boardTrailLines().forEach(l => l.remove())
}

// LIVE TRAILS (user 2026-07-16: "the dotted line is just sitting where it
// was drawn and then assets move around — those joins need to persist"):
// every painted frame something moved, the pile→ghost→basket after-glow
// lines re-aim at their chips' CURRENT positions — exactly the future the
// boardClearTrails note predicted ("re-anchor the lines to their chip
// pairs; the pair keys the lines already carry are the hook"). Endpoints
// are re-queried by selector each time, so the lines also survive the DOM
// being rebuilt by a re-render. A line whose endpoint chip is GONE keeps
// its last geometry — the withdraw path removes those lines itself.
// BOARD-TRAILANCHOR1 (user 2026-08-04, lab1): the giver's-side anchor for an
// after-glow line. Every trail was keyed to the GHOST — which simple counter
// mode deliberately no longer creates for a partial fungible offer, so the
// line could neither re-aim (below) nor be pruned (boardPruneOrphanTrails):
// "drag $1 into a basket, move the residual pile along the ring, and the old
// dotted line just stays where it was". The rim pile IS that anchor now, so
// both passes resolve it the same way, in one place.
function boardTrailAnchorEl(from, asset, to){
  const sel = `[data-owner-account="${CSS.escape(from)}"][data-asset-id="${CSS.escape(asset)}"]`
  return document.querySelector(`.asset.reserved${sel}[data-to-account="${CSS.escape(to)}"]`)
    || document.querySelector(`.board-rimpile${sel}`)
}

function boardReanchorTrails(){
  boardTrailLayer(true)   // re-adopt after a render wiped the host (BOARD-TRAILZ1)
  const lines = boardTrailLines(".board-trailline[data-seg]")
  if(!lines.length) return
  const centre = el => {
    const r = boardChipRect(el)
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  lines.forEach(line => {
    const parts = (line.dataset.pairKey || "").split("|")
    if(parts.length < 3) return
    const to = parts[0], from = parts[1], asset = parts.slice(2).join("|")
    const sel = `[data-owner-account="${CSS.escape(from)}"][data-asset-id="${CSS.escape(asset)}"]`
    const anchor = boardTrailAnchorEl(from, asset, to)
    if(!anchor) return
    const other = line.dataset.seg === "pg"
      ? document.querySelector(`.asset:not(.basket):not(.reserved)${sel}`)
      : document.querySelector(`.asset.basket${sel}[data-to-account="${CSS.escape(to)}"]`)
    // a "pg" (pile→ghost) leg has no meaning once the pile IS the anchor —
    // simple mode draws only the anchor→basket leg, so drop a stale one
    if(!other || other === anchor){ line.remove(); return }
    const g = centre(anchor), o = centre(other)
    line.setAttribute("x1", g.x); line.setAttribute("y1", g.y)
    line.setAttribute("x2", o.x); line.setAttribute("y2", o.y)
  })
}

// BOARD-TRAILORPHAN1 R2 (user feedback 4e22838f, 2026-07-31: "still seeing the ghost
// dotted lines" — on q-crowd). R1 wiped trails when the SIGNING phase ended, which was
// the only orphaning path on t-trio. But q-crowd is PLAYNET: deals resolve instantly
// (resolveTxSuccess at post time), so a signing phase may never be observed across a
// render — and its players EXIT each cycle, which also removes chips with no withdraw
// and no strike. Three ways a chip can vanish; R1 covered one, withdraw covers another,
// and this covers ALL of them by construction: after each paint, any after-glow line
// whose anchor GHOST no longer exists in the fresh DOM is removed. The ghost is the
// right liveness test — it exists exactly while the offer is on the table (including
// through signing, via SIGN-GHOSTPREVIEW1's restored ghosts), so a line outlives it
// only when the thing it points at is genuinely gone. Runs post-render, when the DOM
// is authoritative — never mid-tween.
// ── DEMO-NARRATE1, first slice: the step timeline (user 2026-07-31) ──────────
// "Where we've got the 'You're watching' banner... a bit like a presentation where
// you show your steps in summary, and you're highlighting the one that you're on."
// A narrator (the demo bot, for now) publishes {v, kind:"timeline", steps, current}
// via game_narrate; every viewer — spectators included — sees the same strip.
//
// FORMAT DISCIPLINE: this is the first consumer of the DEMO-NARRATE1 payload format,
// and the task's method is collect-use-cases-before-building because the format is
// the expensive part. So the renderer checks `v` and `kind` and renders NOTHING it
// does not recognise — an old client on a new payload degrades to no strip, never to
// a broken one. Anything beyond kind:"timeline" (banners, callouts, avatars, links)
// is a LATER kind, not a growth of this one.
//
// Placement: directly above whichever bottom bar is visible (the spectator ribbon or
// the footer), measured rather than hard-coded — same reasoning as the chat bubbles'
// topGuard: no magic offsets, keeps working when the bars change height.
function boardRenderNarrate(){
  const host = document.body
  let strip = document.getElementById("boardNarrate")
  const n = state?.narrate
  const ok = n && n.v === 1 && n.kind === "timeline" && Array.isArray(n.steps) && n.steps.length
  if(!ok){ strip?.remove(); return }

  if(!strip){
    strip = document.createElement("div")
    strip.id = "boardNarrate"
    strip.className = "knarr"
    host.appendChild(strip)
  }

  // sit on top of the visible bottom bar (ribbon beats footer when both exist).
  // R4: MEASURE the bar's actual top rather than assuming it's viewport-bottom-
  // anchored — in panel mode the bars ride up to the foot of the board
  // (--kchat-clear-b) and the height-only math parked this strip inside the dock.
  const bar = document.querySelector("body.spectating .kspec-ribbon") ||
              document.querySelector(".ring-footer")
  const barTop = bar ? bar.getBoundingClientRect().top : innerHeight
  strip.style.bottom = Math.max(0, innerHeight - barTop) + "px"

  // Rebuild only when the payload changes — this runs on every paint, and the strip
  // animates via CSS on the --on class flip, which a full rebuild would defeat.
  const sig = JSON.stringify([n.steps.map(s => s?.label ?? s), n.current])
  if(strip.dataset.sig === sig) return
  strip.dataset.sig = sig

  strip.replaceChildren(...n.steps.map((s, i) => {
    const el = document.createElement("span")
    el.className = "knarr-step" +
      (i < n.current ? " knarr-step--done" : i === n.current ? " knarr-step--on" : "")
    el.textContent = String(s?.label ?? s)
    return el
  }))
}

function boardPruneOrphanTrails(){
  boardTrailLines(".board-trailline[data-pair-key]").forEach(line => {
    const parts = (line.dataset.pairKey || "").split("|")
    if(parts.length < 3) return
    const to = parts[0], from = parts[1], asset = parts.slice(2).join("|")
    // BOARD-TRAILANCHOR1: liveness = the giver's anchor (ghost OR rim pile) or
    // the basket chip still being on the table. The ghost alone was the test,
    // which in simple mode is absent by design — that made a live line look
    // orphaned (sporadic disappearances) while a genuinely dead one could
    // linger. Either endpoint surviving means the offer is still real.
    const anchor = boardTrailAnchorEl(from, asset, to)
    const basket = document.querySelector(
      `.asset.basket[data-owner-account="${CSS.escape(from)}"]` +
      `[data-asset-id="${CSS.escape(asset)}"][data-to-account="${CSS.escape(to)}"]`)
    if(!anchor && !basket) line.remove()
  })
}

// trailing line: DOTTED in the giver's colour (review 7 — was solid with a
// draw-in; the dash channel now carries the dot pattern), fades out slowly
// BOARD-TRAILZ1 (user 2026-08-04): the after-glow lines must sit over the lock
// ring like the hover line does — "the semi-transparent one that stays when you
// drop an asset in the basket is still sitting underneath". Same fix as
// BOARD-LINEZ1: host the layer INSIDE #boardRoot, where its z4 lands above the
// felt and the resting arcs but below the chips. The catch the hover line
// doesn't have is that these lines are STATEFUL (fading, persistent), so the
// layer can't be rebuilt per paint — root.replaceChildren() detaches it and we
// re-ADOPT the same element, lines and all, on the next paint.
let _boardTrailSvg = null
// EVERY trail query goes through here, never document.querySelectorAll —
// BOARD-TRAILSTUCK1 (user 2026-08-04, t-duo 14:18/14:21 BST): while the board
// is EMPTY (demo players exited mid-signing) boardOrganicApply early-returns,
// the layer stays DETACHED after replaceChildren, and detached nodes are
// invisible to document queries — so the tx-vanish wipe and the orphan prune
// both silently missed, and the rejoining round re-adopted the svg complete
// with the dead round's lines ("four dotted lines all over the screen, no
// chips"). Querying the layer element itself sees its lines either way.
function boardTrailLines(sel){
  if(!_boardTrailSvg) return []
  return [..._boardTrailSvg.querySelectorAll(sel || ".board-trailline")]
}
function boardTrailLayer(adoptOnly){
  if(!_boardTrailSvg){
    if(adoptOnly) return null
    _boardTrailSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    _boardTrailSvg.setAttribute("class", "board-traillayer")
  }
  const host = document.getElementById("boardRoot") || document.body
  if(_boardTrailSvg.parentElement !== host) host.appendChild(_boardTrailSvg)
  return _boardTrailSvg
}

function boardTrail(a, b, colour, { key, persist = true, seg } = {}){
  const svg = boardTrailLayer()
  svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`)
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
  line.setAttribute("x1", a.left + a.width / 2); line.setAttribute("y1", a.top + a.height / 2)
  line.setAttribute("x2", b.left + b.width / 2); line.setAttribute("y2", b.top + b.height / 2)
  line.setAttribute("class", "board-trailline")
  line.style.stroke = colour || "#999"
  if(key) line.dataset.pairKey = key
  // seg marks WHICH leg of the pile→ghost→basket line this is ("pg"/"gb") so
  // boardReanchorTrails can re-aim it at the chips' live positions each
  // painted frame (LIVE TRAILS, user 2026-07-16). No seg = a transient line
  // (withdraw-return) that fades before movement matters — left static.
  if(seg) line.dataset.seg = seg
  svg.appendChild(line)
  // 🧪 after-glow (boardTrailResidual): fade to a persistent fraction of the
  // starting opacity (.75, see .board-trailline) instead of to nothing — the
  // burn-in stays until the next replay wipes the layer, or until the offer
  // it maps is withdrawn (persist:false + the pairKey removal in
  // boardAnimateNewOffers — a returned asset's line is redundant, user
  // 2026-07-14). 0 = old fade-to-nothing behaviour.
  // persist:false (withdraw-return) also fades FASTER — once it's withdrawn
  // the connection is gone and nobody's interested (user 2026-07-14, called
  // minor: the 200ms/.5s numbers are polish knobs if it still lingers).
  const fast = !persist
  if(fast) line.style.transition = "opacity .5s ease"
  const residual = persist ? 0.75 * (boardTrailResidual || 0) : 0
  requestAnimationFrame(() => {
    setTimeout(() => { line.style.opacity = residual }, fast ? 200 : 1000)   // linger, then fade
  })
  if(!residual) setTimeout(() => line.remove(), fast ? 900 : 3600)
}

// PROP-LOCKSIGN1 commitment flow, shared by the v1 label glyph + footer buttons
async function boardToggleLock(account){
  const locking = account.mode !== "lock"
  // Optimistic paint (user 2026-08-03): the commitment build below is async crypto
  // and the class only really flips on the server's game_state echo — so a click
  // used to leave the arc looking un-locked (hover pale) for a beat. Flip the class
  // NOW; the next repaint is authoritative either way.
  const arcNow = document.querySelector(
    `.ring-lockarc[data-account-id="${CSS.escape(account.id)}"]`)
  arcNow?.classList.remove("ring-lockpreview")
  arcNow?.classList.toggle("ring-lockarc--locked", locking)
  let commitment = null
  if(locking && typeof buildLockCommitment === "function")
    commitment = await buildLockCommitment()
  socket.send(JSON.stringify({
    type: "game_toggleLock", gameId, accountId: account.id,
    ...(commitment ? { commitment } : {})
  }))
  window.__lastLockBasisSent = locking ? (commitment?.payload?.basisHash ?? null) : null
}

// ring drop targets wrap the shared setupDropTarget with the two drag-back
// gestures from the 2026-07-09 review (tap fallbacks all still work):
//  · drag your offered item back HOME (its owner's segment) = plain withdraw
//    (core would withdraw + re-offer to self, which reads as a self-basket)
//  · drag an item YOU received back to its giver's segment = reject; dropped
//    anywhere else it just snaps back (re-render restores it — no-op)
// would this payload do anything if dropped on this account? (drives the
// desktop no-drop cursor — review 12 nice-to-have)
function boardDropValid(p, account){
  if(!p || !account) return true                     // unknown → don't block
  if(p.pick) return isMyAccount(account)
  // BOARD-ARRANGE1: the previously-dead own-zone drops are now valid — they
  // arrange the chip where it lands (the ondrop wrapper intercepts them
  // before any offer/reject semantics could fire)
  if(p.rejectFrom) return account.id === p.rejectFrom || account.id === p.rejectAccount
  if(!p.fromAccountId) return true
  if(account.id === p.fromAccountId && !p.fromBasketToAccountId) return true   // arrange in own store
  if(p.fromBasketToAccountId && account.id === p.fromBasketToAccountId) return true   // arrange in that basket
  return true
}

let _boardLitWedge = null   // BOARD-DROPHIT1 R2: the one wedge lit by a desktop drag

function boardDropTarget(el, account){

  // touch-drag hit test target (elementFromPoint → closest [data-drop-account])
  el.dataset.dropAccount = account.id
  el.__dropAccount = account

  setupDropTarget(el, account)
  // BOARD-LOCKBAND1: setupDropTarget installs core's felt-tap → player modal.
  // Wrap it so taps landing on (or just off) the lock ring belong to the RING,
  // not the modal — the near-miss that used to open your own player card.
  // Wrapped rather than re-assigned in makeWedge because this call is what runs
  // last on the ring board, and it must stay the single owner of the handler.
  const coreClick = el.onclick
  el.onclick = e => {
    const band = boardLockBandAt(e.clientX, e.clientY)
    if(band === "dead") return
    if(band === "lock"){
      if(isMyAccount(account) && !boardSigning) boardToggleLock(account)
      return
    }
    coreClick && coreClick(e)
  }
  const coreOver = el.ondragover

  el.ondragover = e => {
    coreOver && coreOver(e)
    // dataTransfer payloads are sealed during dragover — validity comes from
    // the window-scoped copy set at dragstart
    if(window.__boardDragPayload)
      e.dataTransfer.dropEffect = boardDropValid(window.__boardDragPayload, account) ? "move" : "none"
    // BOARD-DRAGCUE1 (user 2026-08-06): keep the destination wedge lit on
    // DESKTOP the way it is on touch. dragenter alone wasn't enough — the
    // chips sit on their own higher layer, so dragging across one fires
    // dragleave on the wedge and the highlight dropped out mid-drag. dragover
    // re-lights it, and the leave is deferred (below) so crossing a chip
    // doesn't strobe the wedge.
    // BOARD-DROPHIT1 R2: light the WEDGE under the cursor, resolved from the
    // whole hit stack — not `el`, which may be the chip container of whoever
    // owns the chip you happen to be crossing.
    clearTimeout(el.__dragLeaveT)
    const w = boardWedgeAt(e.clientX, e.clientY) || el
    if(!boardIsDragSource(w.__dropAccount)){
      if(_boardLitWedge && _boardLitWedge !== w) _boardLitWedge.classList.remove("drag-over")
      w.classList.add("drag-over")
      _boardLitWedge = w
    }
  }

  const coreLeave = el.ondragleave
  el.ondragleave = e => {
    clearTimeout(el.__dragLeaveT)
    el.__dragLeaveT = setTimeout(() => {
      coreLeave && coreLeave(e)
      el.classList.remove("drag-over")
      _boardLitWedge?.classList.remove("drag-over")
      _boardLitWedge = null
    }, 140)
  }

  el.ondrop = e => {
    // BOARD-DROPHIT1 R2: this handler may be on the chip CONTAINER of whoever
    // owns the chip that happened to be under the cursor. Resolve the segment
    // from the hit stack and, if it's a different one, hand the whole drop to
    // that wedge's identical handler rather than reproducing the semantics here.
    const w = boardWedgeAt(e.clientX, e.clientY)
    if(w && w !== el && w.__dropAccount && w.__dropAccount !== account && typeof w.ondrop === "function"){
      w.ondrop(e)
      return
    }

    // BOARD-ARRANGE1: a drop landing in the dragged chip's OWN zone is an
    // arrange — the chip pins where it fell; no offer/reject/withdraw fires
    if(window.__boardDragEl && boardArrangeAt(window.__boardDragEl, e.clientX, e.clientY)){
      e.preventDefault()
      el.classList.remove("drag-over")
      window.__boardDragEl = null
      return
    }

    // mouse-dnd pick payload routes through the shared executor
    const pickFrom = e.dataTransfer.getData("pickFrom")
    if(pickFrom){
      e.preventDefault()
      el.classList.remove("drag-over")
      boardExecuteDrop({
        pick: true, pickFrom,
        assetId: e.dataTransfer.getData("assetId"),
        available: parseInt(e.dataTransfer.getData("available") || "1", 10)
      }, account, { x: e.clientX, y: e.clientY })
      return
    }

    const rejectFrom = e.dataTransfer.getData("rejectFrom")
    if(rejectFrom){
      e.preventDefault()
      el.classList.remove("drag-over")
      if(account.id === rejectFrom){
        socket.send(JSON.stringify({
          type: "game_reject", gameId,
          accountId: e.dataTransfer.getData("rejectAccount"),
          assetId: e.dataTransfer.getData("assetId")
        }))
        clearSelection()
        render()
      }
      return
    }

    const fromId = e.dataTransfer.getData("fromAccountId")
    const fromBasketTo = e.dataTransfer.getData("fromBasketToAccountId")
    if(fromId && fromBasketTo && account.id === fromId){
      e.preventDefault()
      el.classList.remove("drag-over")
      socket.send(JSON.stringify({
        type: "game_withdraw", gameId,
        fromId, toId: fromBasketTo,
        assetId: e.dataTransfer.getData("assetId")
      }))
      clearSelection()
      render()
      return
    }

    // own-zone drops whose arrange containment failed (release just outside
    // the walls): dead-end here — before BOARD-ARRANGE1 these were blocked
    // at dragover, so legacy coreDrop must never see them (it would read an
    // own-zone drop as an offer)
    if(fromId && !fromBasketTo && account.id === fromId) return
    if(fromBasketTo && account.id === fromBasketTo) return

    // a real offer via mouse dnd. BOARD-AMOUNT1 (user 2026-08-06): routed
    // through boardExecuteDrop rather than coreDrop, so mouse and touch share
    // ONE path — and therefore one (now asynchronous, modal) amount step.
    // coreDrop's semantics are reproduced exactly by the executor's non-pick
    // branch (optional withdraw, then game_offer); the drop point it needs is
    // read here, synchronously, before dataTransfer is sealed.
    boardExecuteDrop({
      assetId: e.dataTransfer.getData("assetId"),
      available: parseInt(e.dataTransfer.getData("available") || "1", 10),
      fromAccountId: fromId,
      fromBasketToAccountId: fromBasketTo
    }, account, { x: e.clientX, y: e.clientY })
  }
}

// ── touch drag (review 8) ───────────────────────────────────────────────────
// HTML5 drag/drop is mouse-only; on touch we clone the chip under the finger
// (pointer events) and on release execute the SAME drop semantics against
// whatever [data-drop-account] sits beneath — amount prompt included via
// getTransferAmount. Tap (no movement) still fires the chip's click handler
// (modal etc.). Chips get touch-action:none, so page/carousel scrolling has
// to start OFF a chip — acceptable board-game trade-off, noted.
function boardTouchDrag(el, payload){

  el.style.touchAction = "none"

  el.addEventListener("pointerdown", e => {
    // mouse keeps native dnd — EXCEPT arrange-only chips (user 2026-08-17, KATUI3
    // feedback pass: "align the mobile and desktop functionality"). R2 (2026-08-06)
    // had banned mouse here because back then the fly clone followed the cursor
    // anywhere and lit every segment; both halves are since fixed IN THIS PATH —
    // applyMove clamps arrange-only chips to the owner's walls (holds at the fence,
    // boardArrangeClamp) and draws no destination cue. So the mouse now gets the
    // same fenced tidy-their-space drag the finger has, and the accidental
    // native-image NFT drag (see makeAssetEl img.draggable=false) is retired.
    if(e.pointerType === "mouse" && !payload?.arrangeOnly) return
    const startX = e.clientX, startY = e.clientY
    let fly = null, dropWedge = null
    // BOARD-DRAGREPAINT1 (user 2026-08-06): "if I drag the chip very, very
    // slowly in one direction, the page basically stays completely white and
    // then it only paints when I slow down." A touch digitizer fires
    // pointermove far faster than the display refreshes, and this handler did
    // a getBoundingClientRect + elementFromPoint on EVERY one — two forced
    // synchronous layouts per event, against a full-viewport SVG felt. The
    // browser spends the frame re-laying-out and never gets to rasterise, so
    // whole tiles show blank. Coalescing to one rAF caps that work at one pass
    // per painted frame, which is all a drag can actually show.
    // (BOARD-DRAGFLICKER1's __boardDragging repaint hold is a different lever —
    // it defers BROADCAST-driven re-renders; this is the drag's own cost.)
    let moveRaf = 0, at = null
    let lastFree = null   // arrange-only: last position the finger legitimately asked for

    const applyMove = () => {
      moveRaf = 0
      if(!fly || !at) return
      // BOARD-DRAGUX1 R2 (user 2026-08-05 review): NO lift at all — the chip
      // stays exactly where it was grabbed and slides with the finger, like a
      // real piece. The 24px lift read as a jump (and, grabbed near the top
      // edge, the chip body sat BELOW the fingertip — "the opposite"): "we're
      // trying to be too clever, and it's just fucking up". Depth comes from
      // the drag shadow instead (.board-touchfly CSS). Wedge under the chip
      // lights as the target; drop point = the chip's centre.
      let ax = at.x, ay = at.y
      if(payload?.arrangeOnly){
        // Fenced: the chip stops at its owner's walls while the finger keeps going.
        // R2 (user 2026-08-06): and once the finger is OUTSIDE the allowed space it
        // stops influencing the chip at all — "the chip is kind of jumping around,
        // wondering what's going on, where it should really just stay still on the
        // edge of where it's allowed to be". Sliding along the wall as the finger
        // wanders outside is the clamp faithfully reporting a projection nobody
        // asked to see. So we hold the LAST ALLOWED position instead.
        // The user's own caveat is why this isn't a "cancel the drag": "you might
        // drag over the edge, find it's not going any further, and then move your
        // finger back, and you would want it to follow your finger back". Bring the
        // finger back inside and the chip picks it up again — the drag is never
        // ended, only ignored while it has nothing legal to say.
        const p = boardArrangeClamp(el, at.x, at.y)
        if(p){
          if(!p.outside) lastFree = p          // finger is somewhere the chip may go
          const hold = p.outside ? (lastFree || p) : p
          ax = hold.x; ay = hold.y
        }
      }
      fly.style.transform = `translate(${ax - startX}px, ${ay - startY}px) scale(1.05)`
      const c = fly.getBoundingClientRect()
      // no destination cue on an arrange — "the colouring in of the segment is
      // useful if you're going to be able to drop the asset there; if you can't,
      // it doesn't make sense" (user 2026-08-06)
      let over = payload?.arrangeOnly ? null : boardWedgeAt(c.left + c.width / 2, c.top + c.height / 2)
      if(over && boardIsDragSource(over.__dropAccount)) over = null   // not a destination
      if(over !== dropWedge){
        dropWedge?.classList.remove("drag-over")
        over?.classList.add("drag-over")
        dropWedge = over
      }
    }

    const move = ev => {
      at = { x: ev.clientX, y: ev.clientY }
      if(!fly){
        if(Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return
        fly = el.cloneNode(true)
        fly.className = el.className + " board-fly board-touchfly"
        const r = el.getBoundingClientRect()
        fly.style.left = r.left + "px"
        fly.style.top = r.top + "px"
        document.body.appendChild(fly)
        boardEnterDrag()   // repaint hold (see boardEnterDrag)
        window.__boardDragPayload = payload   // so the source-segment check sees it on touch too
        el.classList.add("board-dragsrc")
        window.__boardDropTradeLine?.()   // BOARD-TRADELINESTALE1 (touch path)
        // a drag must not ALSO fire the chip's tap action on release
        const swallow = c => { c.stopImmediatePropagation(); c.preventDefault() }
        el.addEventListener("click", swallow, { capture: true, once: true })
        setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 600)
      }
      if(!moveRaf) moveRaf = requestAnimationFrame(applyMove)
    }

    const up = ev => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      if(moveRaf){ cancelAnimationFrame(moveRaf); moveRaf = 0 }   // BOARD-DRAGREPAINT1: no stray frame after release
      el.classList.remove("board-dragsrc")
      dropWedge?.classList.remove("drag-over")
      dropWedge = null
      // BOARD-DRAGFLICKER1: release the repaint hold; catch up on anything that
      // arrived mid-drag with ONE repaint now (shared with the desktop path)
      boardReleaseRepaintHold()
      if(!fly) return                        // plain tap — click proceeds
      // one locus: the drop lands where the CHIP is, not where the finger is
      const c = fly.getBoundingClientRect()
      const dx = c.left + c.width / 2, dy = c.top + c.height / 2
      fly.remove()
      // BOARD-ARRANGE1: released inside the chip's OWN zone = arrange, not
      // an offer — the chip moves to the release point and pins there
      if(boardArrangeAt(el, dx, dy)) return
      // BOARD-ARRANGEOTHERS1: someone else's non-pickable chip. Arranging is the
      // ONLY thing this drag can do; a release anywhere else is a no-op and the
      // chip stays where it was. That refusal IS the feature — a chip that
      // visibly cannot leave its owner's wedge reads as tidying, not taking.
      if(payload?.arrangeOnly) return
      const target = boardWedgeAt(dx, dy)
      if(target?.__dropAccount) boardExecuteDrop(payload, target.__dropAccount, { x: dx, y: dy })
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
  })
}

// BOARD-DRAGCUE1 (user 2026-08-06): desktop drag polish, wired once for every
// chip instead of at each of the six dragstart handlers.
//  · drag image = the chip itself, centred under the pointer. The browser's
//    default ghost is an offset translucent RECTANGLE of the element — the
//    "dotted rectangle… looks like a selection tool, but you're not selecting"
//    the user reported. (The cursor glyph itself is OS-owned during native
//    dnd and can't be made a hand; the grab/grabbing cursors in CSS cover
//    hover and the touch path.)
//  · dragend sweeps any wedge highlight left behind by a cancelled drag.
if(!window.__boardDragCueInit){
  window.__boardDragCueInit = true
  document.addEventListener("dragstart", e => {
    const el = e.target?.closest?.(".board-chip")
    if(!el || !e.dataTransfer) return
    try {
      e.dataTransfer.effectAllowed = "move"
      const r = el.getBoundingClientRect()
      e.dataTransfer.setDragImage(el, r.width / 2, r.height / 2)
    } catch {}
  }, true)
  document.addEventListener("dragend", () => {
    _boardLitWedge = null
    document.querySelectorAll(".drag-over").forEach(n => {
      clearTimeout(n.__dragLeaveT)
      n.classList.remove("drag-over")
    })
  }, true)
}

// ── BOARD-AMOUNT1: "how much?" modal (user 2026-08-06) ──────────────────────
// Replaces the browser prompt() that a drop used to raise. What the user
// asked for, and the reasoning they talked themselves into:
//  · still typeable — the box is the primary control, not a decoration;
//  · a DUST chip ("you might just want to do a dust check test") and All;
//  · NO 25/50/75% chips. Their own steer: percentage chips "kind of give the
//    feel of like a trading thing, but that's not really — we're in a proposal
//    mode here". A slider "gives you more control without having to type";
//  · the slider is LOGARITHMIC, not linear: "if you've got a very large
//    amount then as you slide you get more granularity on the lower amounts,
//    but on the higher amounts you get bigger jumps" — and it lands on round
//    numbers ("sensible steps given the range that's available"), so you can't
//    accidentally propose 51.8347. The scale is labelled as log, per the user.
// Seam kept deliberately open: this modal is where the assistant lives later
// (suggested amounts from what's on the table, or "accept what they asked
// for"). Nothing is wired to that yet — the layout just leaves it room.
//
// Returns a Promise of RAW units (or null if cancelled) by handing the typed
// display value to getTransferAmount via modalAmountOverride — decimals
// scaling, the unknown-meta guard and the audit log all stay in that one
// place (AMOUNT-SCALE1).
function boardAmountDecimals(assetId){
  if(String(assetId).toUpperCase() === "HBAR") return 8
  if(String(assetId).includes("#")) return 0
  return Number(window.assetDisplayCache?.[assetId]?.token_class?.decimals || 0)
}

// round to a "sensible stop" for its own magnitude: thousands step in 100s,
// hundreds in 10s/50s, ones in whole units — the user's "as you get lower and
// lower, the stops are different"
function boardNiceAmount(v, decimals){
  if(!(v > 0)) return 0
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const lead = v / mag
  const step = lead >= 5 ? mag : lead >= 2 ? mag / 2 : mag / 5
  const snapped = Math.round(v / step) * step
  const places = Math.min(decimals, 6)
  return Number(snapped.toFixed(places))
}

// verb: "offer" (default) or "take" — a PICK is you taking from a store that
// allows it, and calling that "Offer" would be plainly wrong.
function boardAskAmount(assetId, available, verb){
  // whole-item moves (NFTs, single units) never had a prompt and don't get one
  if(available <= 1) return Promise.resolve(getTransferAmount(assetId, available))

  const decimals = boardAmountDecimals(assetId)
  const max = decimals ? available / (10 ** decimals) : available
  const unit = decimals ? 1 / (10 ** decimals) : 1
  // dust = the smallest amount worth sending as a test. 0.01 where the token
  // is that divisible (the user's own example), otherwise the token's own
  // smallest unit — never a value the token can't express.
  const dust = Math.min(max, Math.max(unit, decimals >= 2 ? 0.01 : unit))
  const fmt = v => decimals ? Number(v).toFixed(Math.min(decimals, 2)) : String(v)
  // "All" is the one case where readability must lose to truth: rounding a max of
  // 0.415028 to "0.42" is how the offer came to be rejected in the first place
  // (kdiag tango-hotel-17, 15:32:06 — scaled 420000 vs available 415028).
  const fmtAll = v => decimals ? String(Number(Number(v).toFixed(Math.min(decimals, 8)))) : String(v)

  return new Promise(resolve => {
    document.getElementById("boardAmountModal")?.remove()
    const modal = document.createElement("div")
    modal.id = "boardAmountModal"
    modal.className = "asset-modal"
    const card = document.createElement("div")
    card.className = "asset-modal-card board-amountcard"
    modal.appendChild(card)

    const done = value => { modal.remove(); resolve(value) }
    const cancel = () => done(null)
    modal.onclick = e => { if(e.target === modal) cancel() }

    const head = document.createElement("div")
    head.className = "board-amount-head"
    // "Offer", not "Move" (user 2026-08-06): move "implies a transaction at that
    // time, which is not the case — we're just putting stuff into a basket".
    head.textContent = verb === "take" ? "Take how much?" : "Offer how much?"
    const sub = document.createElement("div")
    sub.className = "subtle board-amount-sub"
    // the chip's own text, not getAssetDisplay's raw precision — "6603.87826651
    // available" is noise when you're choosing a round number to send
    sub.textContent = boardAssetText(assetId, available) + " available"
    card.append(head, sub)

    const input = document.createElement("input")
    input.className = "board-amount-input"
    input.type = "number"
    input.min = 0
    input.max = max
    input.step = unit
    input.value = fmt(Math.min(1, max))
    input.inputMode = "decimal"
    card.appendChild(input)

    // log mapping: slider 0…1000 ⇄ dust…max, geometric. Equal slider travel =
    // equal RATIO, which is what "bigger jumps at the top" means.
    const slider = document.createElement("input")
    slider.className = "board-amount-slider"
    slider.type = "range"
    slider.min = 0; slider.max = 1000; slider.step = 1
    const ratio = Math.max(max / dust, 1.0001)
    const posToVal = p => boardNiceAmount(dust * Math.pow(ratio, p / 1000), decimals)
    const valToPos = v => Math.round(1000 * Math.log(Math.max(v, dust) / dust) / Math.log(ratio))
    // --fill drives the hand-rolled track (see CSS): the native accent fill stops
    // at the thumb's centre and leaves a stub of empty track at maximum, which
    // reads as "there's more slider left" when there isn't.
    // "all" is an INTENT, not a number: fmt() rounds for readability, so the
    // displayed maximum can sit either side of the true one. Tracking the intent
    // means All and a full slider always send the exact available amount, while
    // a hand-typed number is still taken literally. (BOARD-AMOUNTMAX1)
    let wantAll = false
    const paintFill = () => slider.style.setProperty("--fill", (Number(slider.value) / 10) + "%")
    const setPos = v => { slider.value = valToPos(v); paintFill() }
    setPos(Math.min(1, max))
    slider.oninput = () => {
      wantAll = Number(slider.value) >= Number(slider.max)
      input.value = fmt(Math.min(max, posToVal(Number(slider.value))))
      paintFill()
    }
    input.oninput = () => {
      wantAll = false
      const n = parseFloat(input.value)
      if(Number.isFinite(n)) setPos(Math.min(n, max))
    }
    card.appendChild(slider)

    const scale = document.createElement("div")
    scale.className = "subtle board-amount-scale"
    scale.textContent = "Logarithmic scale — fine at the bottom, coarse at the top"
    card.appendChild(scale)

    const chips = document.createElement("div")
    chips.className = "board-amount-chips"
    ;[["Dust", dust, "A tiny test amount"], ["All", max, "Everything available"]]
      .forEach(([label, v, title]) => {
        const b = document.createElement("button")
        b.type = "button"
        b.className = "board-amount-chip"
        b.textContent = label
        b.title = title
        b.onclick = () => { wantAll = (v === max); input.value = wantAll ? fmtAll(v) : fmt(v); setPos(v) }
        chips.appendChild(b)
      })
    card.appendChild(chips)

    const row = document.createElement("div")
    row.className = "board-amount-actions"
    const no = document.createElement("button")
    no.type = "button"
    no.className = "kbtn board-amount-btn"
    no.textContent = "Cancel"
    no.onclick = cancel
    const go = document.createElement("button")
    go.type = "button"
    // ENTRY-KBTN1 vocabulary (user 2026-08-06: "standardize the buttons across the
    // app… we can use blue in this case because it's kind of like the idea of flow")
    go.className = "kbtn kbtn-blue board-amount-btn"
    go.textContent = verb === "take" ? "Take" : "Offer"
    go.onclick = () => {
      const n = parseFloat(input.value)
      if(!Number.isFinite(n) || n <= 0) return
      // BOARD-AMOUNTMAX1 (user 2026-08-06): "when you offer the maximum it
      // sometimes doesn't work — I think because of rounding errors."
      // Exactly right, and it failed SILENTLY. The display value is rounded for
      // readability (6603.87826651 ℏ → "6603.88"); scaling that back up gives
      // 660388000000 raw against an available of 660387826651, and
      // getTransferAmount's `if(scaled > available) return null` dropped the
      // offer with nothing said. Any amount at or above the displayed maximum
      // now bypasses the round-trip and sends `available` verbatim — the exact
      // integer the backend holds. "When you click max or all, it just
      // automatically pushes the full amount instead of trying to round it."
      if(wantAll || n >= max){ done(available); return }
      modalAmountOverride = n
      const raw = getTransferAmount(assetId, available)   // one place owns decimals scaling
      modalAmountOverride = null
      if(raw === null) return                             // it already explained why
      done(raw)
    }
    row.append(no, go)
    card.appendChild(row)

    document.body.appendChild(modal)
    setTimeout(() => { try { input.focus(); input.select() } catch {} }, 30)
    input.onkeydown = e => {
      if(e.key === "Enter"){ e.preventDefault(); go.click() }
      if(e.key === "Escape"){ e.preventDefault(); cancel() }
    }
  })
}

// the drop semantics, shared by mouse dnd (boardDropTarget wraps the legacy
// handler) and touch drag (executed directly from the payload). pt (optional
// {x,y} screen coords of the release) feeds spawn-at-drop-point — the chip
// the backend echoes back materialises where the user dropped it.
// async since BOARD-AMOUNT1: the amount step is a modal, not a prompt().
async function boardExecuteDrop(p, account, pt){
  if(!account || !p?.assetId) return

  // SIGN-BOARDFREEZE1 (user 2026-08-18, on lab1): the click route already refuses
  // ("SIGN-GHOSTTAP1: the board is a PICTURE during signing") but a desktop DRAG
  // sailed straight past it — an offered asset could be dropped into another basket
  // mid-signing and the offer went through while the table was locked. Same freeze,
  // same words, at the drop gate. Arrange-only drops never reach here (the ondrop
  // wrapper intercepts them first), so this blocks exactly the mutating verbs:
  // pick / reject / withdraw / offer.
  if(boardSigning){
    notify("The deal is signing — nothing can move until this transaction resolves.", "warning")
    clearSelection(); render()
    return
  }

  if(p.pick){
    // picks land only in YOUR space; the backend re-checks allowPick
    if(!isMyAccount(account)) return
    const amount = await boardAskAmount(p.assetId, p.available || 1, "take")
    if(amount === null) return
    if(pt) boardNotePendingSpawn(account.id, p.assetId, pt.x, pt.y)
    boardNoteLocalMove(account.id, p.pickFrom, p.assetId)
    socket.send(JSON.stringify({
      type: "game_pick", gameId,
      fromId: p.pickFrom, toId: account.id, assetId: p.assetId, amount
    }))
    clearSelection(); render()
    return
  }

  if(p.rejectFrom){
    if(account.id === p.rejectFrom){
      socket.send(JSON.stringify({
        type: "game_reject", gameId,
        accountId: p.rejectAccount, assetId: p.assetId
      }))
      clearSelection(); render()
    }
    return   // anywhere else: snap back (re-render restores)
  }

  if(!p.fromAccountId) return
  if(account.id === p.fromAccountId && !p.fromBasketToAccountId) return
  if(p.fromBasketToAccountId && account.id === p.fromBasketToAccountId) return

  if(p.fromBasketToAccountId && account.id === p.fromAccountId){
    // drag home = plain withdraw
    socket.send(JSON.stringify({
      type: "game_withdraw", gameId,
      fromId: p.fromAccountId, toId: p.fromBasketToAccountId, assetId: p.assetId
    }))
    clearSelection(); render()
    return
  }

  const amount = await boardAskAmount(p.assetId, p.available || 1)
  if(amount === null) return
  // BOARD-PLAYERSCOPE1: record what the drop actually resolved to, so a
  // "it went to the wrong player" report can be checked instead of reasoned
  // about. sameLabel flags the exact collision the user suspects.
  boardDiag("board:drop:resolve", {
    from: p.fromAccountId, to: account.id, assetId: p.assetId, amount,
    sameLabel: String(p.fromAccountId || "").split(":")[1] === String(account.id).split(":")[1],
    samePlayer: getAccountMap()[p.fromAccountId]?.playerId === account.playerId
  })
  if(pt) boardNotePendingSpawn(account.id, p.assetId, pt.x, pt.y)
  boardNoteLocalMove(account.id, p.fromAccountId, p.assetId)
  if(p.fromBasketToAccountId)
    socket.send(JSON.stringify({
      type: "game_withdraw", gameId,
      fromId: p.fromAccountId, toId: p.fromBasketToAccountId, assetId: p.assetId
    }))
  socket.send(JSON.stringify({
    type: "game_offer", gameId,
    fromId: p.fromAccountId, toId: account.id, assetId: p.assetId, amount
  }))
  clearSelection(); render()
}

// touch has no hover: tapping a chip that has no action of yours flashes the
// dotted pair line instead
function flashTradePair(assetId, fromId, toId){
  highlightTradePair(assetId, fromId, toId, true)
  setTimeout(() => highlightTradePair(assetId, fromId, toId, false), 1600)
}

// account label + lock glyph (mine = clickable toggle; the oval-arc lock
// indicator replaces this in stage 2)
function ringHead(account, mine){

  const head = document.createElement("div")
  head.className = "ring-head"

  const label = document.createElement("span")
  label.className = "ring-head-label"
  label.textContent = (account.id.split(":")[1] || account.id) + (mine ? " (you)" : "")
  label.style.borderBottom = "2px solid " + getPlayerColour(account.playerId)
  head.appendChild(label)

  const glyph = document.createElement("span")
  glyph.className = "ring-lock" + (mine ? " clickable" : "")
  glyph.textContent = account.mode === "lock" ? "🔒" : "🔁"
  glyph.title = account.mode === "lock" ? "Locked" : "Trading"

  if(mine){
    glyph.onclick = e => {
      e.stopPropagation()
      boardToggleLock(account)
    }
  }
  head.appendChild(glyph)
  return head
}

// BOARD-WHEEL7 target-strip colour (user 2026-07-12): felt ⊕ this player's
// wedge wash ⊕ half a LIGHTENING (not darkening — user's 2nd-round call,
// after seeing the darkened version live: wants more contrast against the
// dark focus-shade background, so the strip goes lighter, not deeper),
// composited to one flat hex. Constants mirror the CSS literals they're
// standing in for — recompute (edit these) if body.board-page's felt or
// .board-wedge's wash opacity ever change.
const BOARD_FELT_RGB = [245, 241, 232]          // body.board-page background #f5f1e8
const BOARD_WASH_ALPHA = 0.12                   // .board-wedge opacity
// HALFWAY TO WHITE (user round 4, w/ screenshot: "the colour is now exactly
// the same as the inner colour — no change at all"). The first lighten pass
// naively mirrored the darken's alpha (.035) — but compositing distance is
// asymmetric: 3.5% toward rgb(60,48,22) moved a light base ~6 RGB units
// (visible), 3.5% toward white moved it ~0.5 units (imperceptible).
// "Lighten halfway" = halfway to white.
const BOARD_LIGHTEN_ALPHA = 0.5
function boardHexToRgb(hex){
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "")
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [153, 153, 153]
}
const boardMixRgb = (base, tint, alpha) => base.map((c, i) => Math.round(c * (1 - alpha) + tint[i] * alpha))
function boardTargetStripColour(playerHex){
  const washed = boardMixRgb(BOARD_FELT_RGB, boardHexToRgb(playerHex), BOARD_WASH_ALPHA)
  const [r, gC, b] = boardMixRgb(washed, [255, 255, 255], BOARD_LIGHTEN_ALPHA)
  return "#" + [r, gC, b].map(c => c.toString(16).padStart(2, "0")).join("")
}

// BOARD-RINGTONE1 (user 2026-08-04): the ring stops being GREY and joins the
// per-player tonal ladder the retired counter band used — "the tones a function
// of the player colours would just look neater, and state rides the tonality".
// Per segment, over that player's own washed felt:
//   rest   = ONE TONE DARKER than their store wash — the resting ring for
//            everybody, current player included (contrast between players comes
//            from their colours, not from a mine/theirs rule)
//   active = ONE TONE LIGHTER than their basket (which is itself the wash
//            lightened halfway, = boardTargetStripColour) — the segment "lights
//            up" the moment it's party to the live proposal, i.e. needs to lock.
//            This REPLACES the white party strip: same signal, same colour
//            family, so nothing on the ring is off-palette until the genuinely
//            different states — hover/locked orange, then the signing lights.
const BOARD_STORESHADE_RGB = [60, 48, 22]   // the .ring-storeshade brown — the counter band's dark end
const BOARD_RING_DARKEN_ALPHA = 0.20   // toward the storeshade brown
// toward white. The basket sits at .5, so this is genuinely "one tone lighter
// than the basket" — .78 was tried first and read as plain white on the paler
// player colours, throwing away the identity the whole ladder exists to carry.
const BOARD_RING_ACTIVE_ALPHA = 0.68
function boardRingToneColour(playerHex, active){
  const washed = boardMixRgb(BOARD_FELT_RGB, boardHexToRgb(playerHex), BOARD_WASH_ALPHA)
  const [r, gC, b] = active
    ? boardMixRgb(washed, [255, 255, 255], BOARD_RING_ACTIVE_ALPHA)
    : boardMixRgb(washed, BOARD_STORESHADE_RGB, BOARD_RING_DARKEN_ALPHA)
  return "#" + [r, gC, b].map(c => c.toString(16).padStart(2, "0")).join("")
}

function ringFelt(segs, g){
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "ring-felt")
  svg.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`)

  // ring8 splits the felt in two: this base svg (z below the chip boxes) and
  // a TOP svg (z above them) carrying the locked-store dim — the dim shades
  // the chips. Labels used to ride the top svg too, but the user reversed
  // that (2026-07-15, w/ screenshot): the account ids are writing ON the
  // board, so a chip that strays over one must COVER it — a label painting
  // over a chip reads as the number floating above the table. They now get
  // their own LABELS svg at z4, under the chips' z5 (.ring-organic).
  const top = ring8() ? document.createElementNS(NS, "svg") : null
  if(top){
    top.setAttribute("class", "ring-felt ring-felt--top")
    top.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`)
  }
  const labels = ring8() ? document.createElementNS(NS, "svg") : null
  if(labels){
    labels.setAttribute("class", "ring-felt ring-felt--labels")
    labels.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`)
  }
  // BOARD-SHADEOVER1 (user 2026-08-06, same day as BOARD-CHIPSONTOP1): a THIRD
  // felt svg, this one ABOVE the chips (z8). Chips-on-top was right for the felt
  // linework, but it also dropped the two things that are meant to cover the
  // board wholesale: the ▶/signing focus spotlight (a chip in a store now painted
  // THROUGH the blackout — worst on segments not in the round, where the shade
  // did the opposite of its job and made their chips the brightest thing on the
  // board) and the big 🔒 (which the chips it is supposed to be shading over
  // covered instead). Those two move here; everything else stays under the chips.
  const over = ring8() ? document.createElementNS(NS, "svg") : null
  if(over){
    over.setAttribute("class", "ring-felt ring-felt--over")
    over.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`)
  }
  const labelLayer = labels || top || svg
  const dimLayer = top || svg

  // wheel-glide clip (BOARD-WHEEL2 v2): mid-glide, the others-group segs'
  // felt elements (boundary lines, lock/sign arcs, dims, etched ids) render
  // inside an SVG clipPath cut to the fixed sector between the dividers —
  // the same window the DOM-side wedge/chip containers use, so the whole
  // segment crosses the threshold as one piece.
  let baseClipG = null, topClipG = null, labelClipG = null, overClipG = null
  if(g.wheelClip){
    const sectorD = (host, id) => {
      const R = Math.max(g.W, g.H) * 1.6
      let d = `M ${g.cx} ${g.cy}`
      const steps = 8
      for(let s = 0; s <= steps; s++){
        const a = g.rad(g.wheelClip.a0 + (g.wheelClip.a1 - g.wheelClip.a0) * s / steps)
        d += ` L ${(g.cx + R * Math.cos(a)).toFixed(0)} ${(g.cy + R * Math.sin(a)).toFixed(0)}`
      }
      const defs = document.createElementNS(NS, "defs")
      const cp = document.createElementNS(NS, "clipPath")
      cp.setAttribute("id", id)
      const path = document.createElementNS(NS, "path")
      path.setAttribute("d", d + " Z")
      cp.appendChild(path); defs.appendChild(cp); host.appendChild(defs)
      const grp = document.createElementNS(NS, "g")
      grp.setAttribute("clip-path", `url(#${id})`)
      host.appendChild(grp)
      return grp
    }
    baseClipG = sectorD(svg, "kwheelclip-base")
    topClipG = top ? sectorD(top, "kwheelclip-top") : baseClipG
    labelClipG = labels ? sectorD(labels, "kwheelclip-labels") : baseClipG
    overClipG = over ? sectorD(over, "kwheelclip-over") : baseClipG
  }
  // party-tween fade (user 2026-07-12: the collapsing segment's account id
  // "flickers away right at the end" — everything that's going to disappear
  // should fade out as the segment closes). A per-seg <g> with group opacity
  // MULTIPLIES into the children's own CSS opacity (arcs at .22 etc.), which
  // a direct style.opacity would have overridden (making them brighter).
  const fadeWrap = (layer, seg) => {
    if(seg?.weight == null || seg.weight >= 1) return layer
    const gg = document.createElementNS(NS, "g")
    gg.style.opacity = seg.weight
    layer.appendChild(gg)
    return gg
  }
  const segBase = seg => fadeWrap((seg?.wclip && baseClipG) ? baseClipG : svg, seg)
  const segTop = seg => fadeWrap((seg?.wclip && topClipG) ? topClipG : (top || svg), seg)
  const segLabels = seg => fadeWrap((seg?.wclip && labelClipG) ? labelClipG : (labels || svg), seg)
  const segOver = seg => fadeWrap((seg?.wclip && overClipG) ? overClipG : (over || top || svg), seg)
  const _deferredSignArcs = []   // signing arcs render after the focus shade (lights over darkness)

  const mkLine = (a, r0, r1, cls, layer = svg, tint = null) => {
    const line = document.createElementNS(NS, "line")
    line.setAttribute("x1", g.cx + r0 * Math.cos(a))
    line.setAttribute("y1", g.cy + r0 * Math.sin(a))
    line.setAttribute("x2", g.cx + r1 * Math.cos(a))
    line.setAttribute("y2", g.cy + r1 * Math.sin(a))
    line.setAttribute("class", cls)
    if(tint) line.style.stroke = tint   // inline style — presentation attrs lose to the class CSS
    layer.appendChild(line)
  }

  // BOARD-DIVIDERTINT1 (user 2026-08-03, invited judgment — the subtle version): flat
  // grey boundaries read artificial against coloured felts. Each boundary now carries
  // a whisper of its two neighbours — their wash colours averaged, pulled ~⅔ of the
  // way back toward the old neutral (#cfc6b2) and nudged darker, like two felts
  // overlapping. A boundary WITHIN one player's run therefore reads as a darker shade
  // of their own colour; a boundary BETWEEN players blends the pair — a quiet tonal
  // distinction, deliberately shy of a "third hue" (the BOARD-ARCLANG1 lesson). Lock
  // arcs keep their status colours untouched (user: don't vary those per player).
  const ringDividerTint = (c1, c2) => {
    const px = h => (typeof h === "string" && /^#[0-9a-fA-F]{6}$/.test(h)) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null
    const a = px(c1), b = px(c2)
    if(!a || !b) return null
    const base = [0xcf, 0xc6, 0xb2]
    const out = a.map((v, i) => Math.round((base[i] * .62 + ((v + b[i]) / 2) * .38) * .93))
    return `rgb(${out[0]},${out[1]},${out[2]})`
  }

  segs.forEach((seg, i) => {
    const a = g.rad(seg.a0)
    const rE = g.edgeR(a)
    // ring8: a boundary BETWEEN me and another player becomes a solid divider
    // from the basket circle OUT to the screen edge — with the other players'
    // solid arcs it draws ONE continuous line splitting the board into my
    // droppable space (my store + everyone's baskets) vs everyone else's
    // stores. Inside the circle it stays a light boundary (all baskets are
    // droppable — no wall through them).
    const prev = segs[(i + segs.length - 1) % segs.length]
    const tint = segs.length > 1
      ? ringDividerTint(getPlayerColour(seg.account.playerId), getPlayerColour(prev.account.playerId))
      : null
    // spoke inner end (user 2026-08-03, w/ screenshot): stop at the players'
    // colour ring around the hub, not through it onto the K logo's own ring —
    // the K sits separate in its little ring of colour, spokes end at the
    // doorstep with a visible gap.
    const rIn = g.rc + 6
    if(ring8() && segs.length > 1 && (seg.mine !== prev.mine)){
      const rOvalHere = (g.rx * g.ry) / Math.hypot(g.ry * Math.cos(a), g.rx * Math.sin(a))
      mkLine(a, rIn, rOvalHere, "ring-boundary", segBase(seg), tint)
      mkLine(a, rOvalHere, rE, "ring-divider", segBase(seg), tint)
    } else {
      mkLine(a, rIn, rE, "ring-boundary", segBase(seg), tint)
    }
  })

  if(ringArcs()){
    // stage 2 arrives: the oval is split into per-account arcs — an account's
    // arc lights lock-orange when THEY lock, and your own arcs are tappable
    // lock toggles (pointer-events on the stroke only). ring6/7 drop the base
    // line entirely: a soft filled shading marks the basket zone instead, and
    // arcs exist only as lock state (yours get a faint dashed affordance).
    // ring6 shades the basket DARKER; ring7 inverts — the basket is a lit
    // SPOTLIGHT and locking darkens that account's STORE zone instead.
    if(ring10()){
      // v10 spotlight (review 9): v9 had accidentally LOST the v7 lightening
      // (the --lit fill was gated to ring7 only). New spec inverts the
      // mechanism: the basket zone keeps the untouched base felt and the
      // STORE region takes a subtle dark shade instead (evenodd: full board
      // minus the ellipse) — the spotlight is on the deal.
      const shade = document.createElementNS(NS, "path")
      shade.setAttribute("d",
        `M 0 0 H ${g.W} V ${g.H} H 0 Z ` +
        `M ${g.cx - g.rx} ${g.cy} ` +
        `a ${g.rx} ${g.ry} 0 1 0 ${g.rx * 2} 0 ` +
        `a ${g.rx} ${g.ry} 0 1 0 ${-g.rx * 2} 0 Z`)
      shade.setAttribute("fill-rule", "evenodd")
      shade.setAttribute("class", "ring-storeshade")
      svg.appendChild(shade)
    } else if(ringNoOval()){
      const zone = document.createElementNS(NS, "ellipse")
      zone.setAttribute("cx", g.cx); zone.setAttribute("cy", g.cy)
      zone.setAttribute("rx", g.rx); zone.setAttribute("ry", g.ry)
      zone.setAttribute("class", "ring-basketzone"
        + (boardSkin === "ring7" ? " ring-basketzone--lit" : ""))
      svg.appendChild(zone)
    }
    segs.forEach(seg => {
      const locked = seg.account.mode === "lock"
      // ring7/8: a locked account's store goes dark — offers withdrawn from
      // play, the basket spotlight stays lit. On ring8 the dim lives in the
      // TOP layer so the chips darken too; labels are appended after, staying
      // bright.
      if((boardSkin === "ring7" || ring8()) && locked){
        const dim = document.createElementNS(NS, "path")
        dim.setAttribute("d", ringStoreZonePath(seg, g))
        dim.setAttribute("class", "ring-storedim")
        // BOARD-SHADEQUAD1 (contact sheet's first capture, 2026-07-31): this dim is
        // CORRECT geometry — the wedge fans to beyond the viewport like every felt
        // zone — but on a wedge whose boundary spokes happen to sit at 12 and 9
        // o'clock it reads as a hard-edged quarter-page SLAB, because v16's
        // reviewed darkness (.38, "assets barely visible") runs undiminished all
        // the way to the screen corner. Keep that darkness where the assets
        // actually are and FADE it radially toward the edge, so the lock reads as
        // a dimmed store rather than a rendering error. v16 only; earlier
        // families keep their flat lighter dim. Inline style, not attribute —
        // the family CSS fill rule would beat a presentation attribute.
        if(ring16()){
          const R = Math.max(g.W, g.H) * 1.6
          let grad = svg.querySelector("#ringLockFade")
          if(!grad){
            const defs = document.createElementNS(NS, "defs")
            grad = document.createElementNS(NS, "radialGradient")
            grad.setAttribute("id", "ringLockFade")
            grad.setAttribute("gradientUnits", "userSpaceOnUse")
            grad.setAttribute("cx", g.cx); grad.setAttribute("cy", g.cy); grad.setAttribute("r", R)
            const f0 = ((g.rx + g.ry) / 2) / R          // the oval edge, as a gradient offset
            ;[[0, .38], [f0, .38], [Math.min(1, f0 * 2.4), .14], [1, .10]].forEach(([off, a]) => {
              const stop = document.createElementNS(NS, "stop")
              stop.setAttribute("offset", off)
              stop.setAttribute("stop-color", "rgb(45,35,15)")
              stop.setAttribute("stop-opacity", a)
              grad.appendChild(stop)
            })
            defs.appendChild(grad)
            svg.insertBefore(defs, svg.firstChild)
          }
          dim.style.fill = "url(#ringLockFade)"
        }
        segTop(seg).appendChild(dim)
        // v11 (review 10): BIG 🔒 at the store centroid, on top of the dim —
        // third lock cue alongside the orange arc + darkened store.
        // BOARD-SHADEOVER1: on the OVER layer (z8), not segTop — the lock dim
        // shades the chips (via .board-lockdim on the chip itself) and the 🔒 is
        // the cue that says why, so it has to read over them, not from beneath.
        if(ring11()){
          const rl = (g.ovalR(seg.am) + g.edgeR(seg.am)) / 2
          const big = document.createElementNS(NS, "text")
          big.setAttribute("class", "ring-biglock")
          big.setAttribute("x", g.cx + rl * Math.cos(seg.am))
          big.setAttribute("y", g.cy + rl * Math.sin(seg.am))
          big.setAttribute("text-anchor", "middle")
          big.setAttribute("dominant-baseline", "central")
          big.setAttribute("font-size", Math.min(58, Math.max(34, g.step * 0.5)))
          big.textContent = "🔒"
          segOver(seg).appendChild(big)
        }
      }
      // arc visibility matrix — ring8 INVERTS the ownership marking: other
      // players' arcs are solid grey (the divider continues through them);
      // YOUR arc has no line at all — but stays tappable (transparent
      // stroke) and lights orange when you lock
      if(!ring8() && ringNoOval() && !locked && !seg.mine) return
      // v16 TARGET STRIP (user 2026-07-12): accounts party to the live
      // proposal get their oval arc PRE-PAINTED as a thick blended strip —
      // the outer-ring echo of the hub's white party arcs, a visible
      // "shadow of a strip" before anyone locks, a fat hover/tap target,
      // and the bed the lock-orange later FILLS (instead of orange over a
      // bare line, which read harsh). Applied to mine AND other players'
      // party arcs alike, per the user.
      // BOARD-RINGTONE1: `party` = this segment is in the live proposal, i.e.
      // it needs to lock — the state that used to paint the arc WHITE (and
      // which the 2026-08-04 uniform-grey pass accidentally dropped). It now
      // rides the tonal ladder instead: the same player-coloured ring, one
      // tone LIGHTER than their basket. Kept on the --target class so the
      // (now tone-based) resting/active pair keeps one selector.
      const party = ring16() && !seg.sign && !locked
        && boardInMyParty(seg.account, segs.map(s => s.account))
      const arc = document.createElementNS(NS, "path")
      arc.setAttribute("d", ringArcPath(seg, g))
      arc.dataset.accountId = seg.account.id
      arc.setAttribute("class", "ring-lockarc"
        + (locked ? " ring-lockarc--locked" : "")
        + (seg.mine ? " ring-lockarc--mine" : "")
        + (ring8() ? (seg.mine ? " ring-lockarc--open" : " ring-lockarc--wall") : "")
        + (party ? " ring-lockarc--target" : "")
        + (seg.sign ? " ring-signarc ring-signarc--" + seg.sign : ""))
      // TARGET STRIP colour, per segment (user correction round 2, w/
      // screenshot): a fixed CSS hex can't be right — every wedge is ALSO
      // tinted by that player's own wash colour (.board-wedge, opacity
      // .12). felt ⊕ wash(.12) ⊕ lighten(.035), computed to one flat hex —
      // see boardTargetStripColour.
      //
      // Set as a CSS CUSTOM PROPERTY, not arc.style.stroke directly (fixed
      // round 3 — user: hover wasn't turning orange, and locked wasn't
      // staying solid orange). A plain inline `stroke` wins over EVERY
      // selector-based rule unconditionally, including :hover and
      // .ring-lockarc--locked — it doesn't just beat --target's own class,
      // it silently beat every state change downstream too. A custom
      // property carries the colour without that override power: the
      // resting rule still needs !important to beat --open's transparent
      // default (both plain classes, resting order doesn't reliably favour
      // --target), but :hover / --locked keep their normal higher
      // specificity and win over it live, as CSS intends.
      // YAK-SHAVED PAST THE POINT OF PROPORTION for a cosmetic pre-lock
      // affordance strip — candidate to simplify/cull later (a flat
      // per-player CSS variable would do 90% of this for far less code) if
      // it ever becomes a maintenance snag.
      // BOARD-RINGTONE1: every arc carries its player's tone — resting (darker
      // than their store wash) or active (lighter than their basket). Still a
      // custom property, never an inline stroke, for the override reasons the
      // block above documents at length.
      arc.style.setProperty("--tstrip", boardRingToneColour(getPlayerColour(seg.account.playerId), party))
      if(seg.mine){
        arc.onclick = () => boardToggleLock(seg.account)
        const t = document.createElementNS(NS, "title")
        t.textContent = locked ? "Locked — tap your arc to unlock" : "Tap your arc to lock"
        arc.appendChild(t)
      }
      // signing-status arcs are LIGHTS (user 2026-07-12): they must
      // illuminate over the focus/signing darkness, not be buried under it —
      // "only glowing on the inside… the glow needs to sit on top of the
      // dark shadow covering the store". Deferred and appended after the
      // shade below; plain lock arcs keep the normal (base) layering.
      if(seg.sign) _deferredSignArcs.push({ arc, seg })
      // LOCKED arcs join the TOP layer on the dimming skins (user 2026-08-03, w/
      // screenshot): the lock dim (ring-storedim, z6) paints over the store INCLUDING
      // the outer half of a base-layer arc — that was the lingering "two-tone orange"
      // (light inner / dark outer), the same family of artefact the v16 CSS rounds
      // killed for opacity. The orange must SIT ON TOP: one solid tone, same
      // thickness as the neighbouring strip. Dim appends before arcs in this same
      // pass, so the arc lands above it. Tap-to-unlock unaffected — pointer-events:
      // stroke is per-element and both felt svgs are pointer-events:none containers.
      else if(locked && (boardSkin === "ring7" || ring8())) segTop(seg).appendChild(arc)
      else segBase(seg).appendChild(arc)
    })
  } else {
    const oval = document.createElementNS(NS, "ellipse")
    oval.setAttribute("cx", g.cx); oval.setAttribute("cy", g.cy)
    oval.setAttribute("rx", g.rx); oval.setAttribute("ry", g.ry)
    // faded + thick in etched variants: reads as felt, and the width is the
    // stage-2 tap-to-lock arc target
    oval.setAttribute("class", "ring-ovalline" + (g.etched ? " ring-ovalline--faded" : ""))
    svg.appendChild(oval)
  }

  if(g.etched) segs.forEach(seg => segLabels(seg).appendChild(ringEtchLabel(seg, g, NS)))
  // BOARD-IDCOIN1: additive "coin lettering" comparison — same id, curved
  // along the hub rim instead of the segment boundary. Not a replacement;
  // kept side by side with the etched label above per the user's ask.
  // Both label kinds route via segLabels → the z4 labels svg (under chips).
  if(g.etched) segs.forEach(seg => segLabels(seg).appendChild(ringHubCoinLabel(seg, g, NS)))
  // DEMO-NARRATE1 use case 3 (user 2026-08-03): player avatars on the segments.
  // MUST run after ringEtchLabel — it takes whichever boundary spoke the etched id
  // did NOT take this paint (the id prefers the most horizontal; the avatar gets
  // the more vertical one).
  // Feedback 478527e8 (user 2026-08-05, mobile hub crowding): the CURRENT player
  // gets no avatar — the "you" label (ring11+) is the identity mark that matters
  // ("the current player knows who they are"); avatars are for recognising OTHERS.
  // Also clears the you/avatar pile-up in the cramped mobile hub.
  if(g.etched) segs.forEach(seg => {
    if(seg.mine && ring11()) return
    const av = ringAvatar(seg, g, NS); if(av) segLabels(seg).appendChild(av)
  })

  if(ring11()){
    // v11 (review 10): party + identity cues moved to the HUB's doorstep —
    // a warm gold arc just OUTSIDE the hub for every account in MY party
    // (v10's inner version was white-on-white), and an angled "you" beside
    // the hub on my segments (replaces the etched ·you suffix). Later: short
    // player names for others here, tappable → player info/reputation.
    const allAccounts = segs.map(s => s.account)
    const circArc = (r, a0d, a1d, cls, colour, layer = labelLayer) => {
      const p = d => {
        const a = g.rad(d)
        return `${(g.cx + r * Math.cos(a)).toFixed(1)} ${(g.cy + r * Math.sin(a)).toFixed(1)}`
      }
      const span = Math.min(a1d - a0d, 359.9)
      const el = document.createElementNS(NS, "path")
      el.setAttribute("d", `M ${p(a0d)} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${p(a0d + span)}`)
      el.setAttribute("class", cls)
      if(colour) el.style.stroke = colour
      layer.appendChild(el)
    }
    segs.forEach(seg => {
      if(ring12()){
        // v12 (review 11): board-side hub cues, inside→out: hub grey border,
        // PLAYER-COLOUR arc (always), PARTY STRIP-LIGHT (white — gold was
        // clashing with the lock orange; this is "the light comes on")
        // BOARD-HUBARCCUT1 (user 2026-08-04): full segment span, no inset —
        // with butt caps (CSS) the arcs now cut CLEAN at the spokes. The old
        // 2°/3° insets existed to hide round caps that overhung the boundary
        // anyway; the result read as "rounded ends that slightly peak onto the
        // border but don't quite meet".
        // Feedback 0222f750 (user 2026-08-05): these hub-doorstep cues painted OVER
        // the asset chips (segTop z6 > chips z5) — "chips should always be on top".
        // Same call as BOARD-YOUFELT1: felt cues belong on the labels layer (z4),
        // visible on the felt but under the chips.
        circArc(g.rc + 6, seg.a0, seg.a1, "ring-playerarc",
          getPlayerColour(seg.account.playerId), segLabels(seg))
        if(boardInMyParty(seg.account, allAccounts))
          circArc(g.rc + 12, seg.a0, seg.a1, "ring-partylight", null, segLabels(seg))
      } else if(boardInMyParty(seg.account, allAccounts))
        circArc(g.rc + 5, seg.a0 + 3, seg.a1 - 3, "ring-partyarc", null, segTop(seg))
      if(seg.mine){
        const midDeg = (seg.a0 + seg.a1) / 2
        const mid = g.rad(midDeg)
        const rl = g.rc + (ring12() ? 25 : 16)
        const x = g.cx + rl * Math.cos(mid), y = g.cy + rl * Math.sin(mid)
        let rot = (((midDeg + 90) % 360) + 360) % 360   // tangent, reading upright
        if(rot > 90 && rot < 270) rot -= 180
        const you = document.createElementNS(NS, "text")
        you.setAttribute("class", "ring-youlabel")
        you.setAttribute("fill", getPlayerColour(seg.account.playerId))
        you.setAttribute("x", x); you.setAttribute("y", y)
        you.setAttribute("text-anchor", "middle")
        you.setAttribute("dominant-baseline", "central")
        you.setAttribute("transform", `rotate(${rot} ${x} ${y})`)
        you.textContent = "you"
        // BOARD-YOUFELT1 (user 2026-08-04): "you" belongs ON THE FELT, under
        // the chips — at segTop (z6) it painted over them, reading as a label
        // floating above the table. segLabels (z4) is the layer the etched
        // account ids already use for exactly this reason (2026-07-15), and it
        // carries the identical wheel-clip + fade wrapper, so the 2026-07-12
        // fade/clip bug that put this on segTop in the first place — the
        // labels layer didn't exist yet — does not come back.
        segLabels(seg).appendChild(you)
      }
    })
  }

  // ▶ focus / signing spotlight (review 16, corrected review 17): heavy dark
  // outside the basket spotlight, drawn LAST (even the etched ids sink to a
  // faint memory; footer/chrome stay above). During the SIGNING PHASE the
  // spotlight is PERMANENT — not a choice; ▶ only replays the choreography.
  // The darkening FADES IN at the speed of the flight (~.9s, darkest as the
  // assets land) — and only animates on first mount, not on every re-render.
  const shadeOn = ring16() && (boardFocusMode || !!boardSigning)
  // BOARD-SUCCESS1 follow-up (2026-07-17, "no difference at all" — user
  // caught this live via kdiag: board:result:shown fired correctly, the
  // deployed file had the fix, but the fade was invisible regardless of
  // its animation-duration): renderRingBoard's own SVG gets thrown away by
  // root.replaceChildren on EVERY render() — the same "silently killed"
  // trap boardFlyNftOffer's comment (~3690) already documents for a
  // transform glide. render() fires on every game_state push, which is
  // sub-second during an active session, so a one-shot fade element was
  // being destroyed within a fraction of a second of being drawn — the
  // 1.5s/4.25s duration on it never mattered because it never got to run.
  // Fix: track a wall-clock deadline + which class is fading, and redraw
  // the SAME fade on every render until the deadline passes, giving each
  // fresh element a NEGATIVE animation-delay equal to real elapsed time so
  // it resumes exactly where the destroyed one left off instead of
  // restarting from opaque each time.
  const wipeNow = Date.now()
  const wipeActive = !shadeOn && window.__boardWipeUntil && wipeNow < window.__boardWipeUntil
  if(shadeOn){
    // user 2026-07-14 ("fat tire"): the hole now extends PAST the rim by
    // ~1.2× an NFT thumb height (the v8 clamp() below mirrors the CSS), so
    // the ghost chips hugging the rim from outside sit inside the light too
    // — the lit area reads as wheel + tire, before-state and after-state
    // both visible. The edge is blurred (CSS filter on .ring-focusshade) as
    // a soft barrier between reserved and store — deliberately NOT a drawn
    // rim line; whether a hard rim is wanted is an open question, soft
    // first. The outer rect overshoots the viewport so the blur can't thin
    // the shade at the screen edges.
    const thumbH = Math.min(52, Math.max(26, 0.034 * Math.min(g.W, g.H) + 13))
    const m = thumbH * 1.2
    const hrx = g.rx + m, hry = g.ry + m, B = 48
    const shade = document.createElementNS(NS, "path")
    shade.setAttribute("d",
      `M ${-B} ${-B} H ${g.W + B} V ${g.H + B} H ${-B} Z ` +
      `M ${g.cx - hrx} ${g.cy} ` +
      `a ${hrx} ${hry} 0 1 0 ${hrx * 2} 0 ` +
      `a ${hrx} ${hry} 0 1 0 ${-hrx * 2} 0 Z`)
    shade.setAttribute("fill-rule", "evenodd")
    shade.setAttribute("class", "ring-focusshade" + (window.__boardShadeOn ? "" : " ring-focusshade--in"))
    ;(over || top || svg).appendChild(shade)
    window.__boardWipeUntil = 0   // spotlight is back on — any pending wipe is moot
  } else if(wipeActive || window.__boardShadeOn){
    // shade was on last paint and turned off THIS render (signing resolved /
    // tx vanished), OR a wipe from an earlier render is still within its
    // window (see wipeActive comment above) — (re)draw it with a slow fade
    // so it dissolves in step with whichever celebration boardShowResult
    // just kicked off, instead of vanishing a beat before it (user
    // 2026-07-15, failure case). SUCCESS runs confetti (~4.25s,
    // boardCelebrate) — --wipe's 1.5s doused the spotlight mid-confetti, so
    // success gets its own longer fade class timed to match; FAILURE keeps
    // --wipe, tuned to the ~1.6s wiper sweep. The ▶ toggle-off path does
    // its own 0.5s fade pre-render and clears __boardShadeOn to skip this
    // branch entirely (wipeActive stays false since it only arms on the
    // result-driven path below).
    if(!wipeActive){
      // first render of this wipe: arm the deadline off boardShowResult's ok flag
      window.__boardWipeDurMs = window.__boardLastResultOk ? 4250 : 1500
      window.__boardWipeClass = window.__boardLastResultOk ? "ring-focusshade--wipe-success" : "ring-focusshade--wipe"
      window.__boardWipeUntil = wipeNow + window.__boardWipeDurMs
    }
    const elapsedMs = Math.max(0, window.__boardWipeDurMs - (window.__boardWipeUntil - wipeNow))
    const thumbH2 = Math.min(52, Math.max(26, 0.034 * Math.min(g.W, g.H) + 13))
    const m2 = thumbH2 * 1.2, hrx2 = g.rx + m2, hry2 = g.ry + m2, B2 = 48
    const fade = document.createElementNS(NS, "path")
    fade.setAttribute("d",
      `M ${-B2} ${-B2} H ${g.W + B2} V ${g.H + B2} H ${-B2} Z ` +
      `M ${g.cx - hrx2} ${g.cy} ` +
      `a ${hrx2} ${hry2} 0 1 0 ${hrx2 * 2} 0 ` +
      `a ${hrx2} ${hry2} 0 1 0 ${-hrx2 * 2} 0 Z`)
    fade.setAttribute("fill-rule", "evenodd")
    fade.setAttribute("class", "ring-focusshade " + window.__boardWipeClass)
    fade.style.animationDelay = `-${elapsedMs}ms`   // resume mid-fade, not restart opaque
    ;(over || top || svg).appendChild(fade)
  } else {
    window.__boardWipeUntil = 0
  }
  window.__boardShadeOn = shadeOn

  // the deferred signing-status arcs land AFTER the shade: the glow now
  // spills onto the darkened store side too — a light over the darkness,
  // which the spotlight amplifies (the exact effect the user designed).
  // Each arc rides on a plain opaque UNDERLAY strip (user 2026-07-12: the
  // spotlight's hard edge showed THROUGH the translucent glow — "paint the
  // strip light background on first, and then put the strip light on top").
  // Trade-off: mid-wheel-glide these skip the SVG wheel clip (they'd have to
  // sit inside topClipG, which was appended before the shade) — signing +
  // glide simultaneously is rare; revisit if it ever shows.
  _deferredSignArcs.forEach(({ arc, seg }) => {
    // BOARD-SHADEOVER1: follow the shade. It now lives on the OVER layer (z8,
    // above the chips), so the arcs have to join it there or the "light over
    // the darkness" they exist for would be buried under the very shade they
    // are meant to glow through. With no shade painted this render they stay on
    // the felt's top layer, under the chips (BOARD-CHIPSONTOP1).
    const layer = fadeWrap((shadeOn || wipeActive) ? (over || top || svg) : (top || svg), seg)
    const under = document.createElementNS(NS, "path")
    under.setAttribute("d", arc.getAttribute("d"))
    under.setAttribute("class", "ring-signarc-under")
    layer.appendChild(under)
    layer.appendChild(arc)
  })
  _deferredSignArcs.length = 0

  if(top || labels || over){
    const both = document.createDocumentFragment()
    both.appendChild(svg)
    if(labels) both.appendChild(labels)
    if(top) both.appendChild(top)
    if(over) both.appendChild(over)
    return both
  }
  return svg
}

// the ellipse arc across one segment. Segment boundaries are TRUE directions
// from center; ellipse points need the PARAMETRIC angle (t: cos t scaled by
// rx, sin t by ry), so convert first or arcs won't meet the boundary lines.
function ringEllipseParam(g, deg){
  const a = g.rad(deg)
  return Math.atan2(Math.sin(a) / g.ry, Math.cos(a) / g.rx)
}

function ringArcPath(seg, g){
  let t0 = ringEllipseParam(g, seg.a0), t1 = ringEllipseParam(g, seg.a1)
  while(t1 <= t0) t1 += 2 * Math.PI
  const p = t => [g.cx + g.rx * Math.cos(t), g.cy + g.ry * Math.sin(t)]
  const [x0, y0] = p(t0), [x1, y1] = p(t1)
  const large = (t1 - t0) > Math.PI ? 1 : 0
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${g.rx} ${g.ry} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}

// the STORE zone of one segment: the annular region between the basket
// ellipse and the screen edge — outer boundary sampled far past the viewport
// (the svg clips), inner edge follows the ellipse back
function ringStoreZonePath(seg, g){
  const R = Math.max(g.W, g.H) * 1.6
  const pts = []
  const steps = 6
  for(let s = 0; s <= steps; s++){
    const a = g.rad(seg.a0 + (seg.a1 - seg.a0) * s / steps)
    pts.push(`${(g.cx + R * Math.cos(a)).toFixed(0)} ${(g.cy + R * Math.sin(a)).toFixed(0)}`)
  }
  let t0 = ringEllipseParam(g, seg.a0), t1 = ringEllipseParam(g, seg.a1)
  while(t1 <= t0) t1 += 2 * Math.PI
  const p = t => `${(g.cx + g.rx * Math.cos(t)).toFixed(1)} ${(g.cy + g.ry * Math.sin(t)).toFixed(1)}`
  const large = (t1 - t0) > Math.PI ? 1 : 0
  return `M ${p(t0)} L ${pts.join(" L ")} L ${p(t1)} A ${g.rx} ${g.ry} 0 ${large} 0 ${p(t0)} Z`
}

// the account id etched into the felt — big, bold, faded, in the owner's
// colour. ring2: written along the segment's most-horizontal boundary line
// (nudged into the segment); ring3: horizontal at the outer zone's centroid.
const _boardEtchSide = new Map()   // account id → which boundary its etched id last wrote along (hysteresis)
const _boardAvatarPts = {}         // account id → {x,y} of its avatar (chat tails aim here); persists across paints deliberately

// DEMO-NARRATE1 use case 3 — placement exploration log (keep; the user asked for it):
//   R1: boundary spoke OPPOSITE the etched id — rejected, sat beside the NEIGHBOUR's
//       account id across the seam (wrong face next to wrong number).
//   R2: same spoke as the id, inside the basket zone — better, but off-axis.
//   R3 (user 2026-08-03, current default): board-game symmetric — the account id
//       already runs curved along the basket rim (ringHubCoinLabel); the avatar sits
//       CENTRED on the segment on the next concentric ring inward, ROTATED to match
//       the curved id's orientation (upright-flipped per hemisphere like the coin
//       lettering). That inner ring is also the future home of xproof names /
//       identity labels. R2 kept behind 🧪 "Avatar on spoke" (boardAvatarPos) so the
//       two can be compared live; one wins and the switch goes.
// KEMOJI-COLORLESS1: the face is colourless line art; the player's in-game colour
// fills the frame (bg), so segment colour and identity read as one mark.
function ringAvatar(seg, g, NS){
  if(typeof _keFaceSvg !== "function" || typeof kemojiBytesForKey !== "function") return null
  const size = Math.max(26, Math.min(40, ringLabelFontSize(g) * 1.7))
  let x, y, rot = 0
  if(boardAvatarPos === "spoke"){
    // R2: same spoke as the etched id, inside the basket zone
    const sideDeg = _boardEtchSide.get(seg.account.id) === "a1" ? seg.a1 : seg.a0
    const ab = g.rad(sideDeg)
    const rt = g.rc + (g.ovalR(ab) - g.rc) * 0.62
    const inwardSign = sideDeg === seg.a0 ? 1 : -1
    const perp = ab + Math.PI / 2
    x = g.cx + rt * Math.cos(ab) + inwardSign * size * 0.62 * Math.cos(perp)
    y = g.cy + rt * Math.sin(ab) + inwardSign * size * 0.62 * Math.sin(perp)
  } else {
    // R3: segment-centred, one concentric step inside the coin-lettered id ring.
    // The coin label's baseline sits ~fs·0.85+6 inside the oval; drop the avatar a
    // further label-height + half its own size so the two never collide.
    // UNIT TRAP (bug 2026-08-03, avatars stacked east on their sides): segs carry
    // a0/a1 in DEGREES but am ALREADY IN RADIANS (the chat-anchor code uses it raw
    // with Math.cos) — running it through g.rad() again collapsed every mid-angle
    // to ~0-7° and the whole cast piled up at 3 o'clock.
    const am = seg.am
    const fs = ringLabelFontSize(g)
    const inset = fs * 0.85 + 6 + fs * 0.9 + size * 0.55
    const irx = Math.max(g.rc + size * 0.6, g.rx - inset), iry = Math.max(g.rc + size * 0.6, g.ry - inset)
    const rt = (irx * iry) / Math.hypot(iry * Math.cos(am), irx * Math.sin(am))
    x = g.cx + rt * Math.cos(am)
    y = g.cy + rt * Math.sin(am)
    // R4 (user 2026-08-03): UPRIGHT, no arc rotation — the ids rotate only because
    // text wouldn't fit along the arc otherwise; a circular face fits fine, and the
    // rotation was suspected in animation weirdness. rot stays 0.
  }
  _boardAvatarPts[seg.account.id] = { x, y }
  const key = typeof katomiaAvatarKey === "function" ? katomiaAvatarKey(seg.account.playerId) : seg.account.playerId
  const bg = getPlayerColour(seg.account.playerId)
  // face string cached — this runs every paint, including tween frames
  const faceKey = key + ":" + (bg || "")
  let face = _boardAvatarFaces.get(faceKey)
  if(!face){ face = _keFaceSvg(kemojiBytesForKey(key), String(key || "").slice(-12), "circle", bg); _boardAvatarFaces.set(faceKey, face) }
  const wrap = document.createElementNS(NS, "g")
  wrap.setAttribute("class", "ring-avatar")
  wrap.dataset.playerId = seg.account.playerId || ""   // chat pulses the speaker's face
  if(rot) wrap.setAttribute("transform", `rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`)
  // pulse survival: the felt repaints on every broadcast, which used to KILL the pulse
  // animation mid-flight (user: "it seems like it's just flicking") — a fresh element
  // re-joins the pulse while the speaker's window (set by katomia-chat) is open
  if((window._kavPulse || {})[seg.account.playerId] > Date.now()) wrap.classList.add("ring-avatar--pulse")
  if(seg.weight != null && seg.weight < 1) wrap.setAttribute("opacity", seg.weight)
  // nested <svg> so the face keeps its own 0 0 256 256 viewBox at any size
  wrap.innerHTML = face.replace("<svg ", `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" `)
  return wrap
}
const _boardAvatarFaces = new Map()

// shared by ringEtchLabel + ringHubCoinLabel (BOARD-IDCOIN1)
function ringLabelFontSize(g){
  const vScale = ring8() ? Math.min(1.3, Math.max(0.67, Math.min(g.W, g.H) / 800)) : 1
  return 20 * vScale
}

// BIND-BADGE1 (user 2026-08-03): suffix every board account id with its binding
// status — 🔷 the account has a published verified binding for this player (the
// glyph was 💠 until 2026-08-04; the user found it too washed out to register
// at chip size — "it kind of doesn't really show up very well" — so every
// verified marker in the app is now the plain blue diamond. △ = not verified.
// same mark order mode uses, katomia-render.js createAccountAuthMarker), △ no
// binding (a subtle warning). Only meaningful on real networks — playnet has no
// binding concept, so no badge there.
function ringBindBadge(account){
  const net = (typeof gameMeta !== "undefined" && gameMeta?.network) || window.__katomiaNetwork || ""
  if(net !== "testnet" && net !== "mainnet") return ""
  return account?.authBound ? " 🔷" : " △"
}

function ringEtchLabel(seg, g, NS){

  const text = document.createElementNS(NS, "text")
  text.setAttribute("class", "ring-etchlabel")
  text.setAttribute("fill", getPlayerColour(seg.account.playerId))
  // ring7: 🔒 prefix inline (shifts the id — ring8 fixes that with its own
  // anchored node so the account number never moves on lock)
  const lockPrefix = (boardSkin === "ring7" && seg.account.mode === "lock") ? "🔒 " : ""
  // v11: ·you moved to the hub doorstep (angled label); 🛍 marks a store
  // whose player allows picking
  const pickBadge = (ring11() && playerAllowsPick(seg.account.playerId) && !seg.mine) ? " ◀" : ""
  text.textContent = lockPrefix + boardShortAcctId(seg.account.id.split(":")[1] || seg.account.id)
    + ringBindBadge(seg.account)
    + (seg.mine && !ring11() ? " ·you" : "") + pickBadge

  // CONSTANT size (user 2026-07-12): was g.step*0.24 — proportional to
  // segment width, so the id grew/shrank with segment count AND mid-tween
  // (step is the average width, which changes as segments collapse) — the
  // "account number suddenly jumps and gets bigger". Viewport scaling stays
  // (not segment-dependent); animating font size was rejected as messy.
  // ring8: scales with the viewport (~⅔ … ~1.3× of the fixed size) — shared
  // with ringHubCoinLabel (BOARD-IDCOIN1) via ringLabelFontSize().
  const fs = ringLabelFontSize(g)
  text.setAttribute("font-size", fs)
  const halfLen = fs * 0.31 * text.textContent.length   // rough glyph budget

  if(boardSkin === "ring3"){
    // nearer the oval than the chip box (box sits at 0.62) so they layer
    // rather than hide each other; x clamped so long ids stay on screen
    const rl = g.ovalR(seg.am) + (g.edgeR(seg.am) - g.ovalR(seg.am)) * 0.30
    const x = Math.min(Math.max(g.cx + rl * Math.cos(seg.am), halfLen + 6), g.W - halfLen - 6)
    text.setAttribute("x", x)
    text.setAttribute("y", g.cy + rl * Math.sin(seg.am))
    text.setAttribute("text-anchor", "middle")
    return text
  }

  // ring2: pick the boundary that lies most east-west, write along it.
  // STICKY with hysteresis (user 2026-07-12: the id "flashed between two
  // possible positions" during animations — a raw c0>=c1 pick flips back and
  // forth every frame as the segment rotates through the crossover). Keep
  // the previous side unless the other is CLEARLY better; converges to the
  // optimum at rest, never thrashes mid-tween.
  const c0 = Math.abs(Math.cos(g.rad(seg.a0))), c1 = Math.abs(Math.cos(g.rad(seg.a1)))
  let side = c0 >= c1 ? "a0" : "a1"
  const prevSide = _boardEtchSide.get(seg.account.id)
  if(prevSide && prevSide !== side){
    const cPrev = prevSide === "a0" ? c0 : c1
    const cNew = side === "a0" ? c0 : c1
    if(cNew - cPrev < 0.15) side = prevSide
  }
  _boardEtchSide.set(seg.account.id, side)
  const abDeg = side === "a0" ? seg.a0 : seg.a1
  const ab = g.rad(abDeg)
  // pulled in from the screen edge so the text never clips
  const rt = Math.max(g.ovalR(ab) + halfLen * 0.4,
    Math.min((g.ovalR(ab) + g.edgeR(ab)) / 2, g.edgeR(ab) - halfLen - 10))

  // perpendicular nudge INTO the segment (interior sits at larger angle than
  // a0, smaller than a1), plus keep the glyphs upright
  const inwardSign = abDeg === seg.a0 ? 1 : -1
  const perp = ab + Math.PI / 2

  let rot = ((abDeg % 360) + 360) % 360
  if(rot > 90 && rot < 270) rot -= 180

  // v9 (review 7): pad by glyph metrics — a label BELOW the line needs its
  // ASCENDERS cleared (they reach back up toward the line), one ABOVE only
  // its descenders, so a fixed 18px sat close below and roomy above
  let inward = inwardSign * 18
  if(ring9()){
    const rr = rot * Math.PI / 180
    const below = inwardSign * (Math.cos(perp) * Math.cos(rr + Math.PI / 2)
                              + Math.sin(perp) * Math.sin(rr + Math.PI / 2)) > 0
    inward = inwardSign * (below ? 7 + fs * 0.78 : 7 + fs * 0.25)
  }

  const x = g.cx + rt * Math.cos(ab) + inward * Math.cos(perp)
  const y = g.cy + rt * Math.sin(ab) + inward * Math.sin(perp)

  text.setAttribute("x", x)
  text.setAttribute("y", y)
  text.setAttribute("text-anchor", "middle")

  if(!ring8()){
    text.setAttribute("transform", `rotate(${rot} ${x} ${y})`)
    return text
  }

  // ring8: a <g> carries the rotation; the id text NEVER moves — the 🔒 is
  // its own node anchored to end just before the id (overflow is fine), and
  // an xproof label (accountLabelCache) etches smaller underneath
  const grp = document.createElementNS(NS, "g")
  grp.setAttribute("transform", `rotate(${rot} ${x} ${y})`)
  grp.appendChild(text)

  if(seg.account.mode === "lock"){
    const lock = document.createElementNS(NS, "text")
    lock.setAttribute("class", "ring-etchlabel ring-etchlock")
    lock.setAttribute("x", x - halfLen - 6)
    lock.setAttribute("y", y)
    lock.setAttribute("text-anchor", "end")
    lock.setAttribute("font-size", fs * 0.8)
    lock.textContent = "🔒"
    grp.appendChild(lock)
  }

  const hac = seg.account.id.split(":")[1] || seg.account.id
  const xLabel = window.accountLabelCache?.[hac]
  if(xLabel){
    const sub = document.createElementNS(NS, "text")
    sub.setAttribute("class", "ring-etchlabel ring-etchsub")
    sub.setAttribute("fill", getPlayerColour(seg.account.playerId))
    sub.setAttribute("x", x)
    sub.setAttribute("y", y + fs * 0.78)
    sub.setAttribute("text-anchor", "middle")
    sub.setAttribute("font-size", fs * 0.52)
    sub.textContent = xLabel
    grp.appendChild(sub)
  }

  return grp
}

// BOARD-IDCOIN1 (user 2026-07-14): account id curved along the INSIDE of the
// rim (the basket oval — the wheel's "donut" edge), "coin lettering" —
// ADDITIVE alongside ringEtchLabel above (kept for side-by-side comparison,
// not a replacement). v1 sat on the hub; user correction (same day): wrong
// circle — expand out to hug the rim's inner face, and use the same soft
// tone as the etched ids (v1's full-strength player colour was too loud).
//
// Orientation ("like writing on a coin"): top-half segments read like a
// bridge — arc peak up, normal a0→a1 sweep, letters upright. Bottom-half
// read like a plate — arc peak down, sweep REVERSED (a1→a0) — without the
// reversal the glyphs would render upside down at the bottom of the circle.
// Segments near the 3/9 o'clock seam go whichever way the sin() sign falls;
// user: "doesn't really matter which way they go" right at that boundary.
// MOBILE PORTRAIT (user 2026-07-15, parked — BOARD-ACCTNUM1): these curved
// ids are much harder to read in portrait; the SPOKE (etched) ids read well
// there but get covered by the signing spotlight. Likely future: suppress
// the coin variant in portrait and/or rethink which id renders when.
function ringHubCoinLabel(seg, g, NS){
  const hac = boardShortAcctId(seg.account.id.split(":")[1] || seg.account.id)
  const fs = ringLabelFontSize(g)
  // full-circle single account (hubPlayersRing guards the same case): an SVG
  // arc can't have coincident start/end points, so cap the sweep just short.
  const a0 = seg.a0, a1 = seg.a1 - a0 >= 360 ? seg.a0 + 359.9 : seg.a1
  const bottomHalf = Math.sin(seg.am) > 0
  // baseline inset from the oval: textPath glyphs grow "up" from the baseline
  // — toward the rim on top-half arcs (clear the full cap height), toward the
  // hub on bottom-half ones (only descenders reach rimward, less clearance).
  // Top-half +5 (user 2026-08-05): the thickened lock ring left the top arcs
  // "almost no gap" — bottom (dip) arcs were fine and keep their inset.
  const inset = (bottomHalf ? fs * 0.3 + 6 : fs * 0.85 + 11)
  const irx = Math.max(20, g.rx - inset), iry = Math.max(20, g.ry - inset)
  // radius of the inset oval at a true angle — same form as g.ovalR
  const ir = a => (irx * iry) / Math.hypot(iry * Math.cos(a), irx * Math.sin(a))
  const [d0, d1] = bottomHalf ? [a1, a0] : [a0, a1]
  const p = d => {
    const a = g.rad(d), r = ir(a)
    return `${(g.cx + r * Math.cos(a)).toFixed(1)} ${(g.cy + r * Math.sin(a)).toFixed(1)}`
  }
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const sweep = bottomHalf ? 0 : 1

  const path = document.createElementNS(NS, "path")
  const pathId = "board-coinpath-" + hac.replace(/[^a-zA-Z0-9]/g, "_")
  path.setAttribute("id", pathId)
  path.setAttribute("d", `M ${p(d0)} A ${irx} ${iry} 0 ${large} ${sweep} ${p(d1)}`)
  path.setAttribute("fill", "none")

  const text = document.createElementNS(NS, "text")
  text.setAttribute("class", "ring-coinlabel")
  text.setAttribute("font-size", fs)
  text.setAttribute("fill", getPlayerColour(seg.account.playerId))

  const textPath = document.createElementNS(NS, "textPath")
  textPath.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#" + pathId)
  textPath.setAttribute("startOffset", "50%")
  textPath.setAttribute("text-anchor", "middle")
  textPath.textContent = hac + ringBindBadge(seg.account)
  text.appendChild(textPath)

  const grp = document.createElementNS(NS, "g")
  grp.appendChild(path)
  grp.appendChild(text)
  return grp
}

/* ── layout pieces ──────────────────────────────────────────────────────── */

// ── BOARD-LOCKBAND1 (user 2026-08-06) ───────────────────────────────────────
// The lock ring and the felt share pixels: tap the arc = lock, tap the felt =
// open that player's modal. A slightly-off tap on your OWN arc therefore
// opened your own modal — "that's not good". The fix is a graded band around
// the arc's centreline, in multiples of the visible tube thickness T:
//
//   |Δr| ≤ T          → LOCK  (a 2T-wide target: double the visible ring)
//   T < |Δr| ≤ 2T     → NO MAN'S LAND: nothing happens, on purpose
//   |Δr| > 2T         → felt: open the player modal
//
// Other players' arcs can't be locked by you, so their whole band (|Δr| ≤ T)
// is dead too — per the user, deliberately reserved rather than wired to the
// modal, so tapping someone's lock ring never teaches the wrong association
// and stays free for a future action (signing history etc.).
let _boardRingGeo = null

// ── BOARD-DROPHIT1 R2 (user 2026-08-06) ─────────────────────────────────────
// Which SEGMENT is under this point? elementsFromPoint returns the whole stack at
// the coordinate, so the wedge is found even with a chip painted on top of it —
// which is the entire fix, and it needs no pointer-events games. (R1 disabled hit
// testing on chips instead; that killed native HTML5 dnd, whose source and target
// resolution goes through the same hit test. Never take the dragged element out of
// hit testing.)
// Falls back to the old closest() walk if elementsFromPoint is unavailable.
// the segment a drag STARTED from is not a destination — "you don't highlight the
// segment that you've come from, you only highlight the segments that you're
// hovering over as destinations" (user 2026-08-06). Reads the same window-scoped
// payload the desktop dropEffect check uses, so it works on both input paths.
function boardIsDragSource(account){
  const p = window.__boardDragPayload
  if(!p || !account) return false
  return account.id === p.fromAccountId || account.id === p.pickFrom
}

function boardWedgeAt(x, y){
  const stack = document.elementsFromPoint?.(x, y) || []
  for(const el of stack){
    if(el.classList?.contains?.("board-wedge") && el.__dropAccount) return el
  }
  return document.elementFromPoint(x, y)?.closest?.("[data-drop-account]") || null
}

// visible lock-tube thickness — the CSS width for the family in play
// ([data-board-fam~="v16"] .ring-lockarc{ stroke-width: 14 }); earlier
// families run the 12px base rule.
function boardLockTubeW(){ return ring16() ? 14 : 12 }

// Where did this click land relative to the lock ring? → "lock" | "dead" | null
function boardLockBandAt(clientX, clientY){
  const g = _boardRingGeo
  const root = document.getElementById("boardRoot")
  if(!g || !root) return null
  const r = root.getBoundingClientRect()
  const x = clientX - r.left - g.cx, y = clientY - r.top - g.cy
  const dist = Math.hypot(x, y)
  if(!dist) return null
  // radius of the basket ellipse in THIS direction (same solve as ovalR)
  const a = Math.atan2(y, x)
  const rOval = (g.rx * g.ry) / Math.hypot(g.ry * Math.cos(a), g.rx * Math.sin(a))
  const d = Math.abs(dist - rOval), T = boardLockTubeW()
  if(d <= T) return "lock"
  if(d <= T * 2) return "dead"
  return null
}

// Fat pie-slice drop target + low-alpha colour wash, clipped from the board
// center out past the screen edge — dropping anywhere in a player's wedge is
// dropping on that player (direction beats distance on touch).
function makeWedge(account, a0, a1, geo, isMine = false){

  const el = document.createElement("div")
  el.className = "board-wedge"
  el.dataset.accountId = account.id
  el.style.clipPath = boardSectorPolygon(a0, a1, geo)
  el.style.background = getPlayerColour(account.playerId)
  // PLAYER-MODAL1 (user 2026-08-05): tap the FELT anywhere in a segment —
  // not a chip; chips live on a higher layer and keep their own tap —
  // zooms into that player. Drag/drop paths don't synthesise wedge clicks.
  // BOARD-LOCKBAND1: …except near the lock ring, where the tap belongs to the
  // ring (mine: lock; anyone's: dead band, never the modal). See
  // boardLockBandAt for the T / 2T geometry.
  el.onclick = e => {
    const band = boardLockBandAt(e.clientX, e.clientY)
    if(band === "dead") return
    if(band === "lock"){
      if(isMine && !boardSigning) boardToggleLock(account)
      return                                  // others' ring: reserved, does nothing
    }
    if(typeof boardPlayerModal === "function") boardPlayerModal(account.playerId)
  }
  // TAP-TO-OFFER cue: while a chip is selected, candidate destination
  // segments lift a touch so "tap a segment" reads as the next move
  if(typeof selectedAssetId !== "undefined" && selectedAssetId && account.id !== selectedFromAccountId)
    el.classList.add("board-wedge--offertarget")

  if(!isMine) setupDropTarget(el, account)
  return el
}

// BOARD-WHEEL1: same pie-slice geometry as makeWedge, but a plain scroll
// button instead of an account — the seam between "mine" (fixed) and the
// currently-visible window of "others" when there are more players than
// boardMaxSegments. Tap = advance the window by one, looping (basic concept
// per the user's spec — no animation yet).
function makeScrollDividerWedge(a0, a1, geo, hiddenCount, dir = 1){
  const el = document.createElement("div")
  el.className = "board-wedge board-wedge--divider"
  el.title = `${hiddenCount} more player${hiddenCount === 1 ? "" : "s"} — tap to scroll`
  el.style.clipPath = boardSectorPolygon(a0, a1, geo, 3)

  // badge skipped when the divider is mid-collapse in the party tween (a
  // floating count over a vanishing sliver reads wrong)
  if(a1 - a0 >= 6){
    const am = (a0 + a1) / 2 * Math.PI / 180
    const badge = document.createElement("div")
    badge.className = "board-wedge-divider-badge"
    badge.style.left = (geo.cx + Math.min(geo.W, geo.H) * 0.36 * Math.cos(am)) + "px"
    badge.style.top = (geo.cy + Math.min(geo.W, geo.H) * 0.36 * Math.sin(am)) + "px"
    badge.textContent = "⋯" + hiddenCount
    el.appendChild(badge)
  }

  // opposite directions per divider (see boardRingLayoutSlots for the
  // mapping rationale — may flip after the user tries both)
  el.onclick = () => boardScrollOthers(dir)
  return el
}

function makeSeatCard(account, midAngle, geo, seatCount, ctx){

  const el = document.createElement("div")
  el.className = "board-seat" + (seatCount > 5 ? " board-seat--slim" : "")
  el.dataset.accountId = account.id
  el.dataset.mode = account.mode

  const rad = midAngle * Math.PI / 180
  const rx = geo.W * 0.35, ry = geo.H * 0.30
  el.style.left = (geo.cx + rx * Math.cos(rad)) + "px"
  el.style.top = (geo.cy + ry * Math.sin(rad)) + "px"
  el.style.borderTopColor = getPlayerColour(account.playerId)

  const head = document.createElement("div")
  head.className = "board-seat-head"
  const player = state.players?.[account.playerId]
  const label = account.id.split(":")[1] || account.id
  head.textContent = (player?.name && player.name !== "anon" ? player.name + " · " : "")
    + label + ringBindBadge(account)
  if(account.mode === "lock") head.textContent += " 🔒"
  el.appendChild(head)

  // outer band: what they show as available — reserved stays here as ghosts
  const avail = document.createElement("div")
  avail.className = "board-band board-band-avail"
  boardStoreChips(account, avail, ctx.reservedByAccount)
  boardReservedChips(account, avail, ctx.reservedByAccount)
  el.appendChild(avail)

  if(boardSkin === "table"){
    // inner band: their basket — trays coloured by giver
    const basket = document.createElement("div")
    basket.className = "board-band board-band-basket"
    boardBasketChips(account, basket, ctx.accountMap)
    el.appendChild(basket)
  } else if((account.basket || []).length){
    const badge = document.createElement("div")
    badge.className = "board-seat-badge"
    badge.textContent = "🧺 ×" + account.basket.length
    badge.title = "Their basket — offers made to this player"
    el.appendChild(badge)
  }

  setupDropTarget(el, account)
  return el
}

function makeCenterOval(mine, accounts, geo, ctx){

  const el = document.createElement("div")
  el.className = "board-center"

  const w = Math.min(geo.W * 0.46, 360)
  const h = Math.max(boardSkin === "market" ? geo.H * 0.26 : geo.H * 0.18, 110)
  el.style.width = w + "px"
  el.style.height = h + "px"
  el.style.left = geo.cx + "px"
  el.style.top = geo.cy + "px"

  // lock ring — the lockbar bent around the table rim (SVG ellipse, locked
  // fraction in the lockbar's locked orange over its trading blue)
  const lp = boardLockSummary(mine, accounts)
  if(lp){
    el.appendChild(boardLockRing(lp, w, h))
  }

  const inner = document.createElement("div")
  inner.className = "board-center-inner"

  const title = document.createElement("div")
  title.className = "board-center-title"
  title.textContent = gameMeta?.profile?.name || gameMeta?.id || "katomia"
  inner.appendChild(title)

  const sub = document.createElement("div")
  sub.className = "board-center-sub"
  sub.textContent = (gameMeta?.network || "") + (lp ? ` · 🔒 ${lp.locked}/${lp.total}` : "")
  inner.appendChild(sub)

  if(boardSkin === "market"){
    // ego view: the center IS my basket table — trays land here coloured by giver
    const table = document.createElement("div")
    table.className = "board-band board-center-basket"
    mine.forEach(account => boardBasketChips(account, table, ctx.accountMap))
    if(!table.children.length){
      const hint = document.createElement("div")
      hint.className = "board-center-empty"
      hint.textContent = "Your table is empty — offers to you land here"
      table.appendChild(hint)
    }
    inner.appendChild(table)
  }

  el.appendChild(inner)
  return el
}

function makeDock(mine, ctx){

  const dock = document.createElement("div")
  dock.className = "board-dock"

  if(!mine.length){
    const hint = document.createElement("div")
    hint.className = "board-dock-empty"
    hint.textContent = "Spectating — join from the classic view to get a seat"
    dock.appendChild(hint)
    return dock
  }

  mine.forEach(account => {

    const row = document.createElement("div")
    row.className = "board-dock-row"
    row.dataset.accountId = account.id
    row.dataset.mode = account.mode
    row.style.borderLeft = "4px solid " + getPlayerColour(account.playerId)

    const head = document.createElement("div")
    head.className = "board-dock-head"

    const label = document.createElement("div")
    label.className = "board-dock-label"
    label.textContent = (account.id.split(":")[1] || account.id) + " (you)"
    head.appendChild(label)

    // the real mode toggle + lockbar, reused verbatim
    head.appendChild(createAccountModeEl(account))
    row.appendChild(head)

    const chips = document.createElement("div")
    chips.className = "board-band board-dock-chips"
    boardStoreChips(account, chips, ctx.reservedByAccount)
    boardReservedChips(account, chips, ctx.reservedByAccount)
    if(boardSkin === "table")
      boardBasketChips(account, chips, ctx.accountMap)
    row.appendChild(chips)

    dock.appendChild(row)
  })

  return dock
}

/* ── lock ring ──────────────────────────────────────────────────────────── */

// One shared count for the center: my first account's requirement, else the
// first account that has one (mirrors getLockProgress / LOCK-PROGRESS1).
function boardLockSummary(mine, accounts){
  for(const a of [...mine, ...accounts]){
    const lp = getLockProgress(a.id)
    if(lp) return lp
  }
  return null
}

function boardLockRing(lp, w, h){
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "board-lockring")
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`)

  const make = cls => {
    const e = document.createElementNS(NS, "ellipse")
    e.setAttribute("cx", w / 2); e.setAttribute("cy", h / 2)
    e.setAttribute("rx", w / 2 - 3); e.setAttribute("ry", h / 2 - 3)
    e.setAttribute("class", cls)
    svg.appendChild(e)
    return e
  }
  make("board-lockring-base")
  const arc = make("board-lockring-locked")
  // dasharray needs the path length — set once it's in the DOM
  requestAnimationFrame(() => {
    try {
      const len = arc.getTotalLength()
      const frac = Math.max(0, Math.min(1, lp.locked / lp.total))
      arc.style.strokeDasharray = `${len * frac} ${len}`
    } catch {}
  })
  svg.title = `${lp.locked} of ${lp.total} locked (${lp.scope})`
  return svg
}

/* ── chips (compact, but the SAME DOM chips — drag/drop + modal survive) ── */

// Board chips round amounts for game-view legibility (raw precision stays one
// tap away in the asset modal): 1234567.89 → "1.2M", 0.015 → "0.015".
function boardNum(v){
  if(v >= 1e6) return +(v / 1e6).toFixed(1) + "M"
  if(v >= 1e4) return +(v / 1e3).toFixed(1) + "k"
  if(v >= 100) return String(Math.round(v))
  if(v >= 1) return String(+v.toFixed(2))
  return String(+v.toPrecision(2))
}

function boardAssetText(assetId, amount){
  const id = String(assetId)
  const meta = getAssetMeta(assetId)

  if(id.includes("#")){
    // name only — makeAssetEl appends " #serial" itself for the hover tooltip
    return meta?.token_instance_name || meta?.token_class?.name || meta?.token_class?.symbol || id.split("#")[0]
  }

  const isHbar = id.toUpperCase() === "HBAR"
  let sym = isHbar ? "ℏ" : (meta?.token_class?.symbol || meta?.token_class?.name || id)
  if(String(sym).toLowerCase().startsWith("hedera://")) sym = meta?.token_class?.name || id

  const decimals = isHbar ? 8 : Number(meta?.token_class?.decimals || 0)
  if(!decimals)
    return amount > 1 ? `${sym} ×${amount}` : String(sym)

  return `${boardNum(amount / 10 ** decimals)} ${sym}`
}

// etched variants: EVERY chip declares its owner, wherever it sits — no
// cross-referencing. ring2/ring3 tint the chip FACE (kept as a demo of that
// idea); ring4 uses the v1 basket treatment instead — the owner's thick left
// sleeve only, face untouched, because a coloured face collides with NFT
// artwork: the art's colour must never read as ownership.
function ringTint(el, playerId){
  if(!ringEtched() || !playerId) return
  if(ringSleeved()){
    applyOwnerSleeve(el, playerId)
    // BOARD-CHIPART1 (user 2026-08-04): every chip also publishes its owner's
    // colour + a readable ink for it, so the chip-style variants below can
    // paint the FACE without any of them needing their own JS. Ink is picked
    // by luminance, not assumed white — half the palette (amber, teal) is far
    // too light to carry white text, which is exactly how "coloured chips"
    // usually goes wrong.
    const colour = getPlayerColour(playerId)
    el.style.setProperty("--own", colour)
    el.style.setProperty("--own-ink", boardInkFor(colour))
    return
  }
  el.classList.add("chip-owned")
  el.style.background = `color-mix(in srgb, ${getPlayerColour(playerId)} 24%, #fff)`
}

// relative luminance (sRGB, gamma-corrected) → black or white ink. Threshold
// .55 rather than the naive .5: on the mid-tone players white text on colour
// reads better than black, and the board's felt is light so a dark chip has
// more contrast against it anyway.
function boardInkFor(hex){
  const [r, g, b] = boardHexToRgb(hex).map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.55 ? "#1d1a12" : "#ffffff"
}

// BOARD-TIPTOUCH1 (user 2026-08-06): chip tooltips are "fine on desktop, but on
// touch screen they're kind of distracting because they don't really make any
// sense — and if you want information, you can just tap on it". Native title
// tooltips on touch fire on long-press, competing with the drag gesture and the
// tap-to-inspect card that already answers the question properly. So: hover
// devices only. One helper rather than a per-site media query, and it degrades
// to "no tooltip" rather than to a broken one.
function boardCanHover(){
  try { return !window.matchMedia("(hover: none)").matches } catch { return true }
}
function boardTip(el, text){ if(boardCanHover()) el.title = text }

function boardStoreChips(account, container, reservedByAccount){
  const mine = isMyAccount(account)

  Object.entries(account.assets || {}).forEach(([assetId, amount]) => {
    // BOARD-CURATE1 R2 (user 2026-08-06): this viewer marked it "not interested"
    // in the player modal — HIDE means gone, not ghosted ("you don't want to see
    // it at all on the board, not as ghosts, not as nothing"). Checked before the
    // chip is built; the modal's ⭐/🚫/○ toggle un-hides it any time.
    if(!mine && boardCurateGet(account.id, assetId) === "out") return
    const el = makeAssetEl({
      text: boardAssetText(assetId, amount),
      assetId,
      ownerAccountId: account.id,
      ownerPlayerId: account.playerId,
      clickable: mine,
      selected: mine && isSelected(assetId, account.id, null)
    })
    applyAssetClasses(el, assetId, amount)
    el.classList.add("board-chip")
    // BOARD-COUNTERMODE1 (simple mode): part of this stack is offered out —
    // the ghost is suppressed (boardReservedChips) and the REMAINDER PILE
    // itself moves to the rim, where the ghost would have sat. board-rimpile
    // makes the sim treat it as an inner (rim-pinned) body; NOT ghost-styled
    // — there really are 90 still in the store, show them solid. Hover shows
    // the draft line to the basket, same as the ghost used to (first
    // destination only when one asset fans to several recipients — rare, and
    // each basket chip still lights its own line back).
    const reservedHere = boardCounterSimple() && (amount || 0) > 0
      ? (reservedByAccount?.[account.id] || []).filter(r => r.assetId === assetId)
      : []
    if(reservedHere.length){
      el.classList.add("board-rimpile")
      el.onmouseenter = () => highlightTradePair(assetId, account.id, reservedHere[0].toAccountId, true)
      el.onmouseleave = () => highlightTradePair(assetId, account.id, reservedHere[0].toAccountId, false)
    }
    ringTint(el, account.playerId)
    if((ring13() || susan4()) && account.mode === "lock")
      el.classList.add("board-lockdim")   // assets leave the light on lock

    if(mine){
      if((ring13() || susan4()) && playerAllowsPick(account.playerId)){
        // uniform view (review 12): YOUR chips show the price-tag flag too
        el.classList.add("board-pickchip")
        el.style.setProperty("--pickflag", getPlayerColour(account.playerId))
      }
      // TAP = INSPECT (user 2026-08-05, replaces the 2026-07-15 tap-to-offer):
      // dragging covers offering now (BOARD-DRAGUX1 one-locus slide), so a tap
      // opens the asset DETAIL card instead — art, token link, owner, and for
      // your own store chips a "Remove from table" action (GAME-ASSETREMOVE1).
      // The legacy (non-ring8) page keeps its offer modal.
      el.onclick = () => {
        if(ring8()){ boardAssetDetail(assetId, account, amount); return }
        openAssetModal(assetId, account.id, amount)
      }
      el.draggable = true
      el.ondragstart = e => {
        e.dataTransfer.setData("assetId", assetId)
        e.dataTransfer.setData("available", amount || 1)
        e.dataTransfer.setData("fromAccountId", account.id)
        e.dataTransfer.setData("fromBasketToAccountId", "")
        window.__boardDragPayload = { assetId, fromAccountId: account.id, fromBasketToAccountId: "" }
      }
      boardTouchDrag(el, { assetId, available: amount || 1, fromAccountId: account.id, fromBasketToAccountId: "" })
    } else if((ring11() || susan3()) && playerAllowsPick(account.playerId) && getAccounts().some(a => isMyAccount(a))){
      // PICK (review 10 / KAT-PICK1): their player allows picking — grab the
      // chip and drop it into any of YOUR regions; game_pick lands it in
      // your basket as if they offered it (amount prompt as usual).
      // review 11: the cue is the PICK FLAG — a small player-coloured
      // triangle jutting left from the sleeve top (overlaid, zero layout
      // shift when Pickable toggles)
      el.classList.add("board-pickchip")
      el.style.setProperty("--pickflag", getPlayerColour(account.playerId))
      boardTip(el, "Pickable — drag into your space to take it")
      el.draggable = true
      el.ondragstart = e => {
        e.dataTransfer.setData("assetId", assetId)
        e.dataTransfer.setData("available", amount || 1)
        e.dataTransfer.setData("pickFrom", account.id)
        window.__boardDragPayload = { pick: true, assetId, pickFrom: account.id }
      }
      boardTouchDrag(el, { pick: true, assetId, available: amount || 1, pickFrom: account.id })
    }
    // tap-to-inspect works on EVERYONE's store chips (user 2026-08-05: "if you
    // want to examine their assets, you can just tap on them")
    if(!mine && ring8()) el.onclick = () => boardAssetDetail(assetId, account, amount)
    // BOARD-ARRANGEOTHERS1 (user-approved 2026-08-06): "it might be helpful to be
    // able to move them around so that you can see them better, even though you're
    // not actually allowed to pull them into your basket… although maybe that gives
    // a kind of sense of control that you don't have."
    // Resolution: allow it, FENCED to the owner's own wedge. boardArrangeAt already
    // clamps to the body's OWN zone and refuses a release more than 48px outside it,
    // so the fence is the existing geometry, not a new rule — and the chip visibly
    // refusing to cross the boundary is what keeps "tidying" from reading as
    // "taking". The pin is per-viewer (localStorage), exactly like your own
    // arranging: nobody else's board moves. Skipped when the chip is already
    // draggable for a real reason (pickable), which keeps that gesture intact.
    if(!mine && ring8() && !el.classList.contains("board-pickchip")){
      boardTouchDrag(el, { arrangeOnly: true })
      boardTip(el, "Not yours — but you can slide it around their space to see the board better")
    }
    container.appendChild(el)
  })
}

// ── asset detail card (user 2026-08-05) ──────────────────────────────────────
// Tap a store chip — yours or theirs — to inspect it: art, display label,
// token id (HashScan-linked on real networks), owner. Your own chips add
// "Remove from table": game_removeAsset takes it out of the STORE only —
// standing offers of it are withdrawn back server-side first, the wallet is
// untouched (it changes the game selection, nothing on-chain).
function boardAssetDetail(assetId, account, amount, offer){
  document.getElementById("boardAssetDetail")?.remove()
  const modal = document.createElement("div")
  modal.id = "boardAssetDetail"
  modal.className = "asset-modal"
  modal.onclick = e => { if(e.target === modal) modal.remove() }
  const card = document.createElement("div")
  card.className = "asset-modal-card board-assetdetail-card"
  modal.appendChild(card)
  const close = document.createElement("div")
  close.className = "asset-modal-close"
  close.textContent = "✕"
  close.onclick = () => modal.remove()
  card.appendChild(close)

  const meta = typeof getAssetMeta === "function" ? getAssetMeta(assetId) : null
  const thumb = meta && typeof getAssetThumb === "function" ? getAssetThumb(meta) : null
  if(thumb){
    const img = document.createElement("img")
    img.src = thumb
    img.className = "board-assetdetail-art"
    card.appendChild(img)
  }
  const name = document.createElement("div")
  name.className = "asset-modal-name"
  name.textContent = typeof getAssetDisplay === "function" ? getAssetDisplay(assetId, amount) : assetId
  card.appendChild(name)

  const rows = document.createElement("div")
  rows.className = "board-assetdetail-rows subtle"
  const addRow = (k, v) => {
    const r = document.createElement("div")
    const b = document.createElement("b")
    b.textContent = k + ": "
    r.appendChild(b)
    r.appendChild(typeof v === "string" ? document.createTextNode(v) : v)
    rows.appendChild(r)
  }
  const net = gameMeta?.network || ""
  if(String(assetId).toUpperCase() !== "HBAR" && (net === "testnet" || net === "mainnet")){
    const a = document.createElement("a")
    a.href = `https://hashscan.io/${net}/token/${String(assetId).split("#")[0]}`
    a.target = "_blank"; a.rel = "noopener noreferrer"
    a.textContent = String(assetId).replace("#", " #")
    addRow("Token", a)
  } else {
    addRow("Token", String(assetId))
  }
  // PLAYER-MODAL1: the Owner row is the door to the player modal — asset ⇄
  // player browsing (tap owner here; tap an asset there). Swap, not stack.
  const ownerHac = account.id.split(":")[1] || account.id
  const ownerBtn = document.createElement("button")
  ownerBtn.className = "addacct-link"
  ownerBtn.textContent = ownerHac + (isMyAccount(account) ? " (you)" : "") + " ›"
  ownerBtn.title = "View this player — their accounts, assets and bindings"
  ownerBtn.onclick = () => { modal.remove(); boardPlayerModal(account.playerId) }
  addRow("Owner", ownerBtn)
  if(meta?.token_class?.name) addRow("Name", meta.token_class.name)
  card.appendChild(rows)

  // ── BOARD-ASSETACTIONS1 (user 2026-08-06) ────────────────────────────────
  // "It's consistent that when you tap on an asset, you ALWAYS get the detail
  // modal, and then the options or actions that you can perform against it,
  // where relevant, show up." The confirm() pop-ups that used to fire straight
  // off a basket/ghost tap are gone — they raced this card and won, which is
  // how the offer modal ended up "clashing a bit with the remove feature".
  //
  // The ordering rule is the user's: "if something's in play and you want to
  // take it off the board, you have to withdraw first, and then once you've
  // withdrawn it you can tap on it again to take it off the table". So Remove
  // from table is NOT offered while anything is offered out — one action at a
  // time, in the order that can't lose anything.
  const actions = document.createElement("div")
  actions.className = "board-assetdetail-actions"
  const addAction = (cls, text, title, fn, testid) => {
    const b = document.createElement("button")
    b.className = "kbtn " + cls + " board-assetdetail-act"
    b.textContent = text
    if(title) boardTip(b, title)
    if(testid) b.dataset.testid = testid
    b.onclick = fn
    actions.appendChild(b)
    return b
  }
  // ── QA-TESTHOOKS1 (user-approved 2026-08-07) ─────────────────────────────
  // A NON-GESTURAL route to offering an asset: pick a player, pick an amount,
  // done — the same two steps a drag performs, without the drag.
  //
  // Why it exists: every automated board harness drove the board by TAPPING,
  // and when tap-to-offer was retired for the one-locus drag on 2026-08-05
  // (see ~7350) four harnesses broke silently and the end-to-end signing test
  // was dark for two days before anyone noticed. Synthesising a drag from a
  // test is both messy and beside the point — the thing under test is the
  // WalletConnect/signing mechanics, not the pointer choreography, and a
  // gesture-shaped test failure is hard to read. So the harness gets a stable,
  // semantic door instead: data-testid="asset-offer" here, then the existing
  // #assetModal (target list + amount box) which already sets
  // modalAmountOverride and calls offerSelectedToAccount — no prompt(), no
  // hit-testing, no clip-path.
  //
  // ── QA-TESTHOOKS1: TEST-ONLY, NOT RENDERED IN NORMAL USE ──────────────────
  // A non-gestural route to offering an asset — pick a player, pick an amount —
  // so a harness never has to synthesise a drag. It exists ONLY when a test
  // harness has set window.__katomiaTestHooks; in every normal session the
  // button is not created, so there is nothing hidden in the DOM, nothing in the
  // tab order, and no query param or setting that can reveal it.
  //
  // The user asked twice for this to stay out of the UI and was right both
  // times: "I said don't show it. Let's not show it. It's bad UI... I don't
  // wanna bloat the code or fuck things up."
  //
  // The flag is set by the harness via Playwright addInitScript, so it cannot be
  // turned on from a browser the way a URL or localStorage flag could.
  //
  // ── IF WE EVER DO WANT TO OPEN THIS UP ───────────────────────────────────
  // Worth recording, because the idea has merit and the reasoning should not
  // have to be rebuilt from scratch. The case FOR: drag is currently the only
  // way to offer anything, which is a genuine accessibility gap — anyone who
  // cannot drag (motor impairment, switch access, keyboard-only, a trackpad on
  // a bad day) has no route at all. This hook is already that route.
  //
  // The case for keeping it hidden TODAY, which is the decision in force: it
  // would be a second way to do the one thing the board is built around, and a
  // second way needs to be as good as the first or it reads as a leftover. The
  // honest reason is cleanliness and simplicity, not that the feature is wrong.
  //
  // Two paths were sketched with the user on 2026-08-07 and both were parked:
  //   (a) NERD MODE ONLY. Cheapest — swap the flag test below for
  //       document.body.classList.contains("nerd"). Rejected for now because it
  //       leaves the button pointing at openAssetModal, the PRE-ring8 offer
  //       sheet, whose UI has been superseded by the drop-style "offer how much"
  //       sheet. Shipping a visible control that opens the old sheet is worse
  //       than not shipping it.
  //   (b) DO IT PROPERLY. Give the CURRENT drop-style amount sheet an optional
  //       "who to?" step — a player/account picker shown only when no target is
  //       already implied (a drag implies one; this entry point does not) — and
  //       point this button at that instead. Then there is ONE offer sheet with
  //       one look, reached two ways, and the accessibility route is real rather
  //       than a debug door. This is the right shape if it is ever wanted.
  // Either way it is deliberate design work, not a flag flip. Do not add a
  // user-reachable reveal to the version below.
  //
  // It routes to openAssetModal (the pre-ring8 offer sheet) — not dead code being
  // resurrected: that is still the live offer path on the legacy non-ring8 board
  // (see ~7357). If it is ever deleted this hook must move with it, and the
  // harnesses will fail loudly on [data-testid="offer-target"], which is the alarm.
  const addOfferAction = () => {
    if(window.__katomiaTestHooks !== true) return null
    return addAction("kbtn-blue", "➤ Offer to a player…",
      "Test hook — choose who to offer this to, and how much",
      () => { modal.remove(); openAssetModal(assetId, account.id, amount) },
      "asset-offer")
  }
  const say = text => {
    const p = document.createElement("div")
    p.className = "subtle board-assetdetail-state"
    p.textContent = text
    card.appendChild(p)
  }
  const nameOf = accId => {
    const a = getAccountMap()[accId]
    const pl = a ? state?.players?.[a.playerId] : null
    return (pl?.name && pl.name !== "anon" ? pl.name : null) || (accId || "").split(":")[1] || accId
  }

  // SIGN-GHOSTTAP1 (user 2026-08-06, same round as SIGN-GHOSTFAN1): once the
  // deal is struck the ghosts and legs on the board are a PICTURE of a
  // transaction, not live offers — "you tap on any of it, it invites you to
  // withdraw the offer, but we're already in signing mode so that's not
  // possible. I don't think anything happens though if you try." Keep the card
  // (the token/owner detail is still worth seeing) and drop every action,
  // saying why instead of showing a button that cannot work.
  if(boardSigning){
    if(offer) say(offer.kind === "withdraw"
      ? `You have offered this to ${nameOf(offer.toAccountId)}.`
      : `${nameOf(offer.fromAccountId)} has offered this to you.`)
    say("The deal is signing — nothing can move until this transaction resolves.")
    document.body.appendChild(modal)
    return
  }

  if(offer){
    // opened from a BASKET chip: this leg is the subject of the card
    const legs = boardNetLegCount(offer.fromAccountId, offer.toAccountId, assetId)
    if(offer.kind === "withdraw"){
      say(`You have offered this to ${nameOf(offer.toAccountId)}.`)
      addAction("kbtn-blue", "↩ Withdraw offer", "Take it back out of their basket — nothing has moved on-chain yet", () => {
        for(let i = 0; i < legs; i++) socket.send(JSON.stringify({
          type: "game_withdraw", gameId,
          fromId: offer.fromAccountId, toId: offer.toAccountId, assetId
        }))
        clearSelection()
        modal.remove()
      })
    } else {
      say(`${nameOf(offer.fromAccountId)} has offered this to you.`)
      addAction("kbtn-red", "↩ Return to giver", "Hand it back — it returns to their store", () => {
        for(let i = 0; i < legs; i++) socket.send(JSON.stringify({
          type: "game_reject", gameId,
          accountId: offer.toAccountId, assetId
        }))
        clearSelection()
        modal.remove()
      })
    }
  }
  else if(isMyAccount(account)){
    // opened from YOUR store chip (or its ghost): what's outstanding on it?
    const out = (boardReserved(getAccounts())[account.id] || []).filter(i => String(i.assetId) === String(assetId))
    // QA-TESTHOOKS1: offered FIRST, so it is the first action in both branches
    // and a harness never has to care which one it landed in. Offering more of
    // something you have already offered some of is legal, so it belongs in
    // both — unlike Remove from table, which the user's ordering rule keeps
    // behind a withdraw.
    addOfferAction()
    if(out.length){
      const to = [...new Set(out.map(i => nameOf(i.toAccountId)))].join(", ")
      say(`Offered out to ${to} — withdraw it before you can take it off the table.`)
      out.forEach(i => {
        const legs = boardNetLegCount(account.id, i.toAccountId, assetId)
        addAction("kbtn-blue", `↩ Withdraw from ${nameOf(i.toAccountId)}`, null, () => {
          for(let k = 0; k < legs; k++) socket.send(JSON.stringify({
            type: "game_withdraw", gameId,
            fromId: account.id, toId: i.toAccountId, assetId
          }))
          clearSelection()
          modal.remove()
        })
      })
    } else {
      addAction("kbtn-red", "🗑 Remove from table", "Take this asset off the board. Your wallet is untouched.", () => {
        if(!confirm(`Remove ${name.textContent} from the table?\n\nThis only changes what you're playing — your wallet is untouched.`)) return
        if(typeof removeAssetFromTable === "function") removeAssetFromTable(account.id, assetId)
        modal.remove()
      })
    }
  }
  if(actions.children.length) card.appendChild(actions)
  document.body.appendChild(modal)
}

// ── PLAYER-MODAL1 slice 1 (user-approved 2026-08-05; explorer-nav-ideas doc) ──
// Tap the FELT anywhere in a player's wedge → this modal; tap Owner on the
// asset card → this modal. It's the player half of the asset ⇄ player browse
// loop: header (avatar/colour/name/you), then per account (id + 🔷/△ binding
// mark) the asset list. Each in-play row taps through to the asset card.
//
// CURATION (BOARD-CURATE1 first slice, toggle-not-swipe — the user's own
// fallback: "prove out the case first, switch to a swipe gesture later"): each
// of ANOTHER player's in-play assets carries a 3-state cycle ○ no-opinion →
// ⭐ interested → 🚫 not interested → ○. "Not interested" mutes that chip on
// YOUR board only (per-viewer, per-game, localStorage) — always reversible
// right here, never invisible state. Own assets get no toggle (Remove from
// table on the asset card is the global sibling).
//
// OUT-OF-PLAY assets (user 2026-08-05): what the account holds on-chain but
// hasn't brought to the table — fetched via the same hapi.php?action=assets
// the add-account preview uses (real networks only), rendered greyed. Not
// something the viewer can toggle; it's the owner's choice. R4: collapsed
// behind a <details> by default — the count is the summary line.
//
// DESIGN TENSION, PARKED (user 2026-08-06, thought through out loud and then
// explicitly dropped — "I think I might be overcooking this… let's leave it as
// it is, we can always put some comments in the code"): you arrive here by
// tapping ONE segment, which is one ACCOUNT, but the modal answers with the
// whole PLAYER — every account they hold, one long scroll. The alternative
// shape they sketched: filter to the tapped account by default, keep the player
// header, and turn the "3 accounts in this game" sub-line into either a
// call-to-action that expands to all accounts, or a list of the other accounts
// you can jump between — "so you can jump from one view to another, rather than
// having it as one long scroll list". Worth revisiting IF the scroll gets long
// in real games (the R4 collapse of Not-in-play is the cheap half of the same
// fix); the cost of doing it is that boardPlayerModal(playerId) grows a second
// argument and a view state, and every caller (felt tap, Owner link on the asset
// card) has to decide which view it means. Not done on purpose.
function boardCurateKey(){ return "katomiaCurate." + (gameId || gameMeta?.id || "") }
function boardCurateMap(){ try { return JSON.parse(localStorage.getItem(boardCurateKey()) || "{}") } catch { return {} } }
function boardCurateGet(accountId, assetId){ return boardCurateMap()[accountId + "|" + assetId] || null }
function boardCurateSet(accountId, assetId, v){
  const m = boardCurateMap()
  if(v) m[accountId + "|" + assetId] = v
  else delete m[accountId + "|" + assetId]
  try { localStorage.setItem(boardCurateKey(), JSON.stringify(m)) } catch {}
}

// BOARD-CURATE1 R3 (user 2026-08-06): swipe a player-modal asset row — left =
// 🚫 not interested, right = ⭐ interested. Deliberately a thin gesture layer over
// the same setter the tap uses: no state of its own, no threshold cleverness, and
// it gives up the moment the drag looks vertical so the modal can still scroll.
function boardCurateSwipe(row, set){
  let x0 = 0, y0 = 0, dx = 0, live = false
  row.addEventListener("pointerdown", e => {
    if(e.pointerType === "mouse") return          // desktop keeps the tap toggle
    x0 = e.clientX; y0 = e.clientY; dx = 0; live = true
    row.classList.add("board-playercard-asset--swiping")
  })
  row.addEventListener("pointermove", e => {
    if(!live) return
    const ax = e.clientX - x0, ay = e.clientY - y0
    if(Math.abs(ay) > Math.abs(ax) + 6){ live = false; row.style.transform = ""; row.classList.remove("board-playercard-asset--swiping"); return }
    dx = Math.max(-90, Math.min(90, ax))
    row.style.transform = `translateX(${dx}px)`
  })
  const end = () => {
    if(!live) return
    live = false
    row.style.transform = ""
    row.classList.remove("board-playercard-asset--swiping")
    if(dx <= -40) set("out")
    else if(dx >= 40) set("in")
  }
  row.addEventListener("pointerup", end)
  row.addEventListener("pointercancel", end)
}

function boardPlayerModal(playerId){
  document.getElementById("boardAssetDetail")?.remove()
  document.getElementById("boardPlayerModal")?.remove()
  const player = state?.players?.[playerId]
  const accounts = getAccounts().filter(a => a.playerId === playerId)
  if(!player && !accounts.length) return
  const self = playerId === currentPlayerId

  const modal = document.createElement("div")
  modal.id = "boardPlayerModal"
  modal.className = "asset-modal"
  modal.onclick = e => { if(e.target === modal) modal.remove() }
  const card = document.createElement("div")
  card.className = "asset-modal-card board-playercard"
  modal.appendChild(card)
  // PLAYER-MODAL1 R4 (user 2026-08-06): "when you scroll, the little close button
  // disappears off the screen — just leave the X so it's available to close the
  // window anytime". The CARD is the scroll container, so the shared
  // .asset-modal-close (position:absolute) scrolls away with the content. A
  // zero-height STICKY strip pinned to the top of the scroll box carries it
  // instead — no layout footprint, header untouched, and no restructuring of the
  // card into a fixed-header/scrolling-body pair (which would have cost ~60px of
  // a phone-height modal for a change the user didn't ask for).
  const closeWrap = document.createElement("div")
  closeWrap.className = "board-playercard-closewrap"
  const close = document.createElement("div")
  close.className = "asset-modal-close"
  close.textContent = "✕"
  close.onclick = () => modal.remove()
  closeWrap.appendChild(close)
  card.appendChild(closeWrap)

  const head = document.createElement("div")
  head.className = "board-playercard-head"
  const colour = getPlayerColour(playerId)
  if(typeof kemojiEl === "function"){
    const key = typeof katomiaAvatarKey === "function" ? katomiaAvatarKey(playerId) : playerId
    head.appendChild(kemojiEl(key, { size: 44, bg: colour, isSelf: self }))
  }
  const who = document.createElement("div")
  const nm = document.createElement("div")
  nm.className = "board-playercard-name"
  nm.textContent = (player?.name && player.name !== "anon" ? player.name : (player?.publicId || playerId)) + (self ? " · you" : "")
  nm.style.color = colour
  const sub = document.createElement("div")
  sub.className = "subtle board-playercard-sub"
  sub.textContent = accounts.length + " account" + (accounts.length === 1 ? "" : "s") + " in this game"
  who.append(nm, sub)
  head.appendChild(who)
  card.appendChild(head)

  const net = gameMeta?.network || ""
  accounts.forEach(account => {
    const sec = document.createElement("div")
    sec.className = "board-playercard-acct"
    const h = document.createElement("div")
    h.className = "board-playercard-acctid"
    h.textContent = (account.id.split(":")[1] || account.id) + " " + (account.authBound ? "🔷" : "△")
    h.title = account.authBound ? "Reputation-bound & verified" : "No verified binding"
    sec.appendChild(h)

    const list = document.createElement("div")
    list.className = "board-playercard-assets"
    Object.entries(account.assets || {}).forEach(([assetId, amount]) => {
      const row = document.createElement("div")
      row.className = "board-playercard-asset"
      // R3 (user 2026-08-06): the ⭐/🚫/○ toggle moves to the LEFT EDGE — "perhaps
      // that could go at the start, so it's kind of like a bullet list initially,
      // and then you tap on the dots". Built first so it IS the bullet.
      if(!self){
        const st = boardCurateGet(account.id, assetId)
        if(st === "out") row.classList.add("board-playercard-asset--out")
        const tog = document.createElement("button")
        tog.className = "board-playercard-curate"
        const paint = v => {
          tog.textContent = v === "in" ? "⭐" : v === "out" ? "🚫" : "○"
          tog.title = v === "in" ? "Interested — tap: not interested"
                    : v === "out" ? "Not interested (muted on your board) — tap: clear"
                    : "No opinion — tap: interested"
        }
        const set = v => {
          boardCurateSet(account.id, assetId, v)
          paint(v)
          row.classList.toggle("board-playercard-asset--out", v === "out")
          render()   // the board hides/unhides the chip immediately
        }
        paint(st)
        tog.onclick = () => {
          const cur = boardCurateGet(account.id, assetId)
          set(cur === null ? "in" : cur === "in" ? "out" : null)
        }
        row.appendChild(tog)
        // …and the same three states by SWIPE (user: "if you're feeling
        // adventurous — slide left activates the no entry, slide right turns it
        // to star, and obviously you can still tap it to change the mode"). The
        // row tracks the finger and snaps back; the tap path above is untouched,
        // so nothing depends on the gesture being discoverable.
        boardCurateSwipe(row, v => set(v))
      }
      const label = document.createElement("button")
      label.className = "board-playercard-assetbtn"
      // NFTs show their artwork in the list (user 2026-08-06: "if the token's an
      // NFT we should show a little thumbnail, so you can basically see them in
      // the list — I guess they'll be quite small, but that's okay"). Same
      // meta/thumb pair the asset card and the chips use; silently absent for
      // fungibles and for NFTs whose metadata hasn't enriched yet.
      const thumb = (typeof getAssetMeta === "function" && typeof getAssetThumb === "function")
        ? getAssetThumb(getAssetMeta(assetId)) : null
      if(thumb){
        const img = document.createElement("img")
        img.className = "board-playercard-thumb"
        img.src = (typeof getFastThumb === "function") ? getFastThumb(thumb, img) : thumb
        img.decoding = "async"
        img.alt = ""
        img.onerror = () => img.remove()
        label.appendChild(img)
      }
      const txt = document.createElement("span")
      txt.textContent = (typeof getAssetDisplay === "function") ? getAssetDisplay(assetId, amount) : assetId
      label.appendChild(txt)
      // LE mark (user 2026-08-06: "if it's limited edition, maybe a little icon to
      // indicate that — just a little LE in a box or something like that… just do
      // it as a font"). Same getAssetType the orders view classifies with, so the
      // two surfaces can never disagree about what counts as limited edition
      // (zero-decimal fungible, ≤10K held). NFTs say it with their thumbnail; this
      // is for the collectible that has no artwork to show.
      if(typeof getAssetType === "function" && getAssetType(assetId, amount) === "LE"){
        const le = document.createElement("span")
        le.className = "board-playercard-le"
        le.textContent = "LE"
        le.title = "Limited edition"
        label.appendChild(le)
      }
      label.onclick = () => { modal.remove(); boardAssetDetail(assetId, account, amount) }
      row.appendChild(label)
      list.appendChild(row)
    })
    sec.appendChild(list)

    // out-of-play: on-chain holdings not brought to the table (async, greyed)
    const hac = account.label || (account.id.split(":")[1] || account.id)
    if((net === "testnet" || net === "mainnet") && /^0\.0\.\d+$/.test(hac)){
      fetch((window.KBASE || "") + "/hapi.php?action=assets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: net, account: hac })
      }).then(r => r.json()).then(data => {
        if(!data?.ok || !document.getElementById("boardPlayerModal")) return
        const inPlay = new Set(Object.keys(account.assets || {}))
        const out = Object.entries(data.assets || {}).filter(([id]) => !inPlay.has(id))
        if(!out.length) return
        // COLLAPSED BY DEFAULT (user 2026-08-06): "let's make that collapsible —
        // in fact, default collapsed; if you tap it, it expands to show you the
        // not-in-play items". A native <details> does exactly that: the count
        // stays as the summary line, so the information "they hold 12 other
        // things" survives without 12 rows of scroll between you and the next
        // account.
        const det = document.createElement("details")
        det.className = "board-playercard-outbox"
        const cap = document.createElement("summary")
        cap.className = "subtle board-playercard-outcap"
        cap.textContent = "Not in play (" + out.length + ")"
        det.appendChild(cap)
        sec.appendChild(det)
        out.slice(0, 30).forEach(([assetId, amount]) => {
          const row = document.createElement("div")
          row.className = "board-playercard-asset board-playercard-asset--offtable"
          row.title = self ? "In your wallet, not on the table — ➕ Add account brings it in" : "This player holds it but hasn't brought it to the table"
          // same 22px thumb as the in-play rows when we happen to know the art —
          // off-table assets are outside the game's enrichment, so this is
          // best-effort by design and simply absent when the meta isn't cached
          const othumb = (typeof getAssetMeta === "function" && typeof getAssetThumb === "function")
            ? getAssetThumb(getAssetMeta(assetId)) : null
          if(othumb){
            const oimg = document.createElement("img")
            oimg.className = "board-playercard-thumb"
            oimg.src = (typeof getFastThumb === "function") ? getFastThumb(othumb, oimg) : othumb
            oimg.decoding = "async"
            oimg.alt = ""
            oimg.onerror = () => oimg.remove()
            row.appendChild(oimg)
          }
          const s = document.createElement("span")
          s.textContent = (typeof getAssetDisplay === "function") ? getAssetDisplay(assetId, amount) : assetId
          row.appendChild(s)
          if(typeof getAssetType === "function" && getAssetType(assetId, amount) === "LE"){
            const le = document.createElement("span")
            le.className = "board-playercard-le"
            le.textContent = "LE"
            le.title = "Limited edition"
            row.appendChild(le)
          }
          det.appendChild(row)
        })
      }).catch(() => {})
    }
    card.appendChild(sec)
  })

  document.body.appendChild(modal)
}

// does this player allow others to pick from their stores? (KAT-PLAYERPREF1)
function playerAllowsPick(playerId){
  return !!state?.players?.[playerId]?.prefs?.allowPick
}

function boardReservedChips(account, container, reservedByAccount){
  const mine = isMyAccount(account)

  ;(reservedByAccount[account.id] || []).forEach(item => {
    // BOARD-COUNTERMODE1 (simple mode): no ghost while the store still holds
    // a remainder of this asset — the remainder pile itself sits at the rim
    // (see boardStoreChips). Ghosts survive only for whole-item offers
    // (NFTs, full-stack fungibles), where nothing remains to mark the origin.
    // Withdraw stays reachable via the basket chip (tap/drag-home).
    if(boardCounterSimple() && (account.assets?.[item.assetId] || 0) > 0) return
    // BOARD-CURATE1 R2: hidden means hidden — a curated-out asset leaves no
    // ghost behind either (user 2026-08-06)
    if(!mine && boardCurateGet(account.id, item.assetId) === "out") return
    const el = makeAssetEl({
      text: boardAssetText(item.assetId, item.amount || 1),
      assetId: item.assetId,
      ownerAccountId: account.id,
      ownerPlayerId: account.playerId,
      reserved: true,
      clickable: mine
    })
    applyAssetClasses(el, item.assetId, item.amount || 1)
    el.classList.add("board-chip", "board-ghost")
    boardTip(el, "Reserved — already offered out")
    ringTint(el, account.playerId)
    if((ring13() || susan4()) && account.mode === "lock")
      el.classList.add("board-lockdim")

    // hover shows the dotted line to where it landed (legacy pair rules)
    el.dataset.assetId = item.assetId
    el.dataset.toAccount = item.toAccountId
    el.onmouseenter = () => highlightTradePair(item.assetId, account.id, item.toAccountId, true)
    el.onmouseleave = () => highlightTradePair(item.assetId, account.id, item.toAccountId, false)

    if(mine){
      // BOARD-ASSETACTIONS1 (user 2026-08-06): the ghost opens the same card as
      // every other asset tap, carrying its withdraw action — the point of
      // tapping a ghost was always "withdraw without hunting for where it went",
      // and that still works in one extra tap, now with the leg spelled out
      // ("You have offered this to Bob") instead of an account id in a confirm().
      el.onclick = () => boardAssetDetail(item.assetId, account, item.amount || 1,
        { kind: "withdraw", fromAccountId: account.id, toAccountId: item.toAccountId })
      // drag the ghost home = withdraw; onto another segment = redirect
      // (boardDropTarget routes the home case to a plain withdraw)
      // SIGN-GHOSTTAP1: not while signing — these ghosts are synthesised from a
      // struck tx (boardSigningReserved), so a drag-home would be a withdraw
      // against a deal that has already left the table. The card explains the
      // same thing on tap; this is the gesture half of it.
      if(boardSigning){ container.appendChild(el); return }
      el.draggable = true
      el.ondragstart = e => {
        e.dataTransfer.setData("assetId", item.assetId)
        e.dataTransfer.setData("available", item.amount || 1)
        e.dataTransfer.setData("fromAccountId", account.id)
        e.dataTransfer.setData("fromBasketToAccountId", item.toAccountId)
        window.__boardDragPayload = { assetId: item.assetId, fromAccountId: account.id, fromBasketToAccountId: item.toAccountId }
      }
      boardTouchDrag(el, { assetId: item.assetId, available: item.amount || 1, fromAccountId: account.id, fromBasketToAccountId: item.toAccountId })
    } else {
      // not yours: tap = flash where it went (touch has no hover)
      el.onclick = () => flashTradePair(item.assetId, account.id, item.toAccountId)
    }
    container.appendChild(el)
  })
}

function boardBasketChips(account, container, accountMap){

  ;(account.basket || []).forEach(item => {
    const fromAccountId = getFromAccountId(item)
    const fromAccount = fromAccountId ? accountMap[fromAccountId] : null
    const senderIsMine = fromAccount ? isMyAccount(fromAccount) : false
    const receiverIsMine = isMyAccount(account)

    const el = makeAssetEl({
      text: boardAssetText(item.assetId, item.amount || 1),
      assetId: item.assetId,
      ownerAccountId: fromAccountId,
      ownerPlayerId: fromAccount?.playerId || "",
      basket: true,
      clickable: senderIsMine || receiverIsMine
    })
    applyAssetClasses(el, item.assetId, item.amount || 1)
    el.classList.add("board-chip")
    ringTint(el, fromAccount?.playerId)

    // hover shows the dotted line back to the giver's ghost (legacy pair rules)
    el.dataset.assetId = item.assetId
    el.dataset.toAccount = account.id
    if(fromAccountId){
      el.onmouseenter = () => highlightTradePair(item.assetId, fromAccountId, account.id, true)
      el.onmouseleave = () => highlightTradePair(item.assetId, fromAccountId, account.id, false)
    }

    if(senderIsMine){
      boardTip(el, "Your offer — tap for details and to withdraw, drag to redirect")
      // BOARD-ASSETACTIONS1: one door for every asset tap — the card, carrying
      // the withdraw action (was: a bare confirm(), which raced the detail card)
      el.onclick = () => boardAssetDetail(item.assetId, fromAccount || account, item.amount || 1,
        { kind: "withdraw", fromAccountId, toAccountId: account.id })
      el.draggable = true
      el.ondragstart = e => {
        e.dataTransfer.setData("assetId", item.assetId)
        e.dataTransfer.setData("available", item.amount || 1)
        e.dataTransfer.setData("fromAccountId", fromAccountId)
        e.dataTransfer.setData("fromBasketToAccountId", account.id)
        window.__boardDragPayload = { assetId: item.assetId, fromAccountId, fromBasketToAccountId: account.id }
      }
      boardTouchDrag(el, { assetId: item.assetId, available: item.amount || 1, fromAccountId, fromBasketToAccountId: account.id })
    } else if(receiverIsMine){
      boardTip(el, "Offered to you — tap for details and to return it, or drag it back to its giver")
      el.onclick = () => boardAssetDetail(item.assetId, fromAccount || account, item.amount || 1,
        { kind: "return", fromAccountId, toAccountId: account.id })
      // drag-back-to-giver = reject; any other landing snaps back (re-render)
      if(fromAccountId){
        el.draggable = true
        el.ondragstart = e => {
          e.dataTransfer.setData("assetId", item.assetId)
          e.dataTransfer.setData("rejectFrom", fromAccountId)
          e.dataTransfer.setData("rejectAccount", account.id)
          window.__boardDragPayload = { rejectFrom: fromAccountId, rejectAccount: account.id, assetId: item.assetId }
        }
        boardTouchDrag(el, { assetId: item.assetId, rejectFrom: fromAccountId, rejectAccount: account.id })
      }
    } else if(fromAccountId){
      // not your trade: tap = flash the pair line (touch has no hover)
      el.onclick = () => flashTradePair(item.assetId, fromAccountId, account.id)
    }
    container.appendChild(el)
  })
}

/* ── demo sandbox (?demo=1) — fixture state, no socket ──────────────────── */
// A playable local fixture: offers/withdraws/locks mutate the fixture through a
// tiny reducer wired to a fake socket, so drag/drop and taps behave like the
// real game. For skin work and screenshots without a backend.

function boardDemoInit(){

  window.assetDisplayCache = {
    "0.0.456": { token_class: { symbol: "USDC", name: "USD Coin", decimals: 6 } },
    "0.0.555": { token_class: { symbol: "GOLD", name: "Gold pass", decimals: 0 } },
    "0.0.789#12": {
      token_class: { symbol: "KAT", name: "Katomia Cats", decimals: 0 },
      token_instance_name: "Kat",
      token_asset_image_URL: boardDemoSvg("😺", "#ffe0b2")
    },
    "0.0.789#31": {
      token_class: { symbol: "KAT", name: "Katomia Cats", decimals: 0 },
      token_instance_name: "Kat",
      token_asset_image_URL: boardDemoSvg("🐯", "#ffccbc")
    }
  }

  gameMeta = {
    id: "DEMO", network: "playnet", lockRule: "cluster",
    visibility: "demo", profile: { name: "Board demo" }
  }

  state = {
    players: {
      p1: { name: "You",  colour: "#7c4dff" },
      p2: { name: "Ada",  colour: "#e91e63" },
      p3: { name: "Bud",  colour: "#00897b" },
      p4: { name: "Cyn",  colour: "#f59f00", prefs: { allowPick: true } }   // pickable — demo the shopping gesture
    },
    accounts: {
      "p1:0.0.1001": {
        id: "p1:0.0.1001", label: "0.0.1001", playerId: "p1", mode: "shop",
        assets: { "HBAR": 1234500000, "0.0.456": 250000000, "0.0.555": 3 },
        basket: [
          { assetId: "HBAR", amount: 500000000, fromId: "p2:0.0.2002" },
          // second drop from the same giver — exercises the Net toggle (5+2=7ℏ)
          { assetId: "HBAR", amount: 200000000, fromId: "p2:0.0.2002" },
          { assetId: "0.0.789#31", amount: 1, fromId: "p3:0.0.3003" }
        ]
      },
      // second account for the same player — on the ring skin this holds its
      // OWN segment (segments = accounts, the 2026-07-09 structural decision)
      "p1:0.0.1111": {
        id: "p1:0.0.1111", label: "0.0.1111", playerId: "p1", mode: "shop",
        assets: { "HBAR": 220000000 },
        basket: []
      },
      "p2:0.0.2002": {
        id: "p2:0.0.2002", label: "0.0.2002", playerId: "p2", mode: "shop",
        assets: { "HBAR": 8100000000, "0.0.456": 12345678 },
        basket: [
          { assetId: "0.0.789#12", amount: 1, fromId: "p1:0.0.1001" }
        ]
      },
      "p3:0.0.3003": {
        id: "p3:0.0.3003", label: "0.0.3003", playerId: "p3", mode: "lock",
        assets: { "0.0.555": 7 },
        basket: [
          { assetId: "0.0.456", amount: 50000000, fromId: "p1:0.0.1001" }
        ]
      },
      "p4:0.0.4004": {
        id: "p4:0.0.4004", label: "0.0.4004", playerId: "p4", mode: "shop",
        assets: { "HBAR": 42000000, "0.0.789#31": 1 },
        basket: []
      }
    }
  }

  // NB fixture semantics match the backend: an asset sitting in a basket has
  // already LEFT its giver's store (so Kat #12 is in p2's basket, not p1's assets)

  currentPlayerId = "p1"
  socket = { readyState: 1, send: m => boardDemoApply(JSON.parse(m)) }

  // fake xproof label so the etched sublabel (ring8) can be previewed
  window.accountLabelCache = { ...(window.accountLabelCache || {}), "0.0.2002": "ada.kpay.id" }

  render()
}

function boardDemoSvg(emoji, bg){
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'>` +
    `<rect width='100%' height='100%' rx='14' fill='${bg}'/>` +
    `<text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' font-size='52'>${emoji}</text></svg>`
  )
}

function boardDemoApply(msg){

  const acc = id => state.accounts[id]

  // BOARD-ACTIONMSG1 (user 2026-08-04: "I'm not sure in the demo mode we're
  // getting the action messages" — correct, the sandbox reducer emitted
  // nothing). Synthesize the SAME action payloads the backend now sends, fed
  // through the same katomiaChat.action path, so the demo exercises the whole
  // rendering surface offline. Same panel-mode gate as the network route.
  const demoAct = (kind, fields, message) => {
    if(document.body.dataset.kchatMode !== "panel") return
    // actor = the SUBJECT account's player (mirrors actionSubject in chat):
    // reject/pick act from the basket side, everything else from the giver
    const subjId = fields.account || (kind === "reject" || kind === "pick" ? fields.to : fields.from)
    const actor = String(subjId || "").split(":")[0] || null
    window.katomiaChat?.action?.({ type: "event", message,
      action: { v: 1, kind, actor, ts: Date.now(), ...fields } })
  }

  if(msg.type === "game_offer"){
    const from = acc(msg.fromId), to = acc(msg.toId)
    if(!from || !to) return
    const have = from.assets[msg.assetId] || 0
    const amount = Math.min(msg.amount || 1, have)
    if(amount <= 0) return
    if(have - amount <= 0) delete from.assets[msg.assetId]
    else from.assets[msg.assetId] = have - amount
    to.basket.push({ assetId: msg.assetId, amount, fromId: msg.fromId })
    demoAct("offer", { from: msg.fromId, to: msg.toId, assetId: msg.assetId, amount },
      `${msg.fromId} placed ${msg.assetId}`)
  }

  if(msg.type === "game_withdraw" || msg.type === "game_reject"){
    const holder = msg.type === "game_reject" ? acc(msg.accountId) : acc(msg.toId)
    if(!holder) return
    const i = holder.basket.findIndex(it =>
      it.assetId === msg.assetId && (msg.type === "game_reject" || it.fromId === msg.fromId))
    if(i < 0) return
    const [item] = holder.basket.splice(i, 1)
    const owner = acc(item.fromId)
    if(owner) owner.assets[item.assetId] = (owner.assets[item.assetId] || 0) + (item.amount || 1)
    if(msg.type === "game_reject")
      demoAct("reject", { from: item.fromId, to: holder.id, assetId: item.assetId, amount: item.amount || 1 },
        `${holder.id} rejected ${item.assetId}`)
    else
      demoAct("withdraw", { from: item.fromId, to: holder.id, assetId: item.assetId, amount: item.amount || 1 },
        `${item.fromId} withdrew ${item.assetId}`)
  }

  if(msg.type === "game_toggleLock"){
    const a = acc(msg.accountId)
    if(a) a.mode = a.mode === "lock" ? "shop" : "lock"
    if(a) demoAct(a.mode === "lock" ? "lock" : "unlock", { account: a.id },
      `${a.id} ${a.mode === "lock" ? "locked" : "unlocked"}`)

    // sandbox STRIKE: when every active account is locked, synthesize a
    // pending tx exactly in the backend record's shape (txid/pch/pchbasis/
    // lifecycle) so the ring15 signing layer can be exercised offline.
    // (The user tests the real flow on testnet — this is for dev/Playwright.)
    const active = new Set()
    Object.values(state.accounts).forEach(x => {
      if((x.basket || []).length) active.add(x.id)
      ;(x.basket || []).forEach(i => i.fromId && active.add(i.fromId))
    })
    if(active.size && [...active].every(id => state.accounts[id]?.mode === "lock")){
      const hbar = [], tok = [], nft = []
      Object.values(state.accounts).forEach(x => {
        const to = x.id.split(":")[1]
        ;(x.basket || []).forEach(i => {
          const from = String(i.fromId || "").split(":")[1]
          const amt = i.amount || 1
          const id = String(i.assetId)
          if(id === "HBAR"){ hbar.push({ accountId: from, amount: -amt }, { accountId: to, amount: amt }) }
          else if(id.includes("#")){
            const [tokenId, serial] = id.split("#")
            nft.push({ tokenId, serialNumber: serial, senderAccountId: from, receiverAccountId: to })
          }
          else { tok.push({ accountId: from, tokenId: id, amount: -amt }, { accountId: to, tokenId: id, amount: amt }) }
        })
        x.basket = []
        x.mode = "shop"
      })
      // REAL pchbasis shape (computePch): transfers.{hbar,token,nft}Transfers
      state.tx = { pending: [{
        txid: `0.0.999@${Math.floor(Date.now() / 1000)}.000000000`,
        pch: "demo",
        pchbasis: { network: "playnet", type: "TransferTransaction",
          transfers: { hbarTransfers: hbar, tokenTransfers: tok, nftTransfers: nft } },
        lifecycle: { status: "PENDING" }, createdAt: Date.now()
      }] }
    }
  }

  if(msg.type === "game_setPref"){
    const p = state.players?.[currentPlayerId]
    if(p) (p.prefs ||= {})[msg.key] = !!msg.value
  }

  if(msg.type === "game_pick"){
    const from = acc(msg.fromId), to = acc(msg.toId)
    if(from && to){
      const have = from.assets[msg.assetId] || 0
      const amount = Math.min(msg.amount || 1, have)
      if(amount > 0){
        if(have - amount <= 0) delete from.assets[msg.assetId]
        else from.assets[msg.assetId] = have - amount
        to.basket.push({ assetId: msg.assetId, amount, fromId: msg.fromId })
      }
    }
  }

  if(!msg.__seed) render()
}

/* ── SHAPING NOTES: the scene viewmodel (Phase 1.5) ─────────────────────────
   Full discussion: BOARD-UI1-RENDERPATH-20260709.md §3-§5 (workspace tasks).

   Today renderRingBoard() reads proposal state directly (getAccounts,
   buildReservedByAccount). The signing phase paints THE SAME PICTURE from a
   pending TRANSACTION, so the split to make before wireframing it:

     buildSceneFromProposal(state)  ─┐
                                     ├─▶ scene ─▶ renderRingBoard(scene)
     buildSceneFromTx(tx, state)    ─┘

   scene = {
     segments: [{ accountId, playerId, mine, locked,           // arc/wash/dim
                  signStatus?,          // tx phase: null | pending|signed|problem
                  store: [chip], ghosts: [chip], basket: [chip] }],
     hub: { locked, total, scope }     // tx phase: + expiresAt (countdown)
   }
   chip = { assetId, amount, fromAccountId?, fromPlayerId?, handlers-by-phase }

   Phase differences the scene absorbs, so painters never fork:
   - proposal = the BEFORE+AFTER view (store + ghosts + baskets, all mutable);
     tx = the AFTER only (basket legs frozen from tx data; ghosts stay as the
     ghosted "before" — nothing visually leaves the table at strike)
   - NETTING: a tx is inherently netted; the Net toggle above previews that
     during proposal. Net-ON means zero jolt at strike; net-OFF accepts a
     merge jump (or a future merge animation — parked). Likely endgame: net
     always on, toggle demoted to nerd/dev.
   - arcs: locked(orange) → signStatus green/red per account (SIGN-STATUSLANG1
     colours, same language as the signing modal — never diverge)
   - hub: count → countdown (SIGN-COUNTDOWN1 hourglass)
   - footer: the Lock button slot BECOMES the Sign button when all-locked
     (same dropdown picks the signing account); wallet/sign roll-up docks here
   - after execution: success = basket chips animate into their new owners'
     stores, brighter than the (still dimmed) existing store chips — 3 layers:
     old store chips < dim sheet < new arrivals; failure = chips animate back
     to their givers (deal torn down). Both are boardFlyLeg choreography.
──────────────────────────────────────────────────────────────────────────── */
