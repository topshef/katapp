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
      trailResidual: boardTrailResidual, layoutMode: boardLayoutMode
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
// boardPrefsOpen (⚙ popover open/closed) retired BOARD-HEADERINT1 — Preferences
// now lives in profile-modal.php, opened via the normal Profile menu item.
// 🧪 chip layout (BOARD-LAYOUT1, user 2026-07-14): "shelves" = deterministic
// concentric rows clustered at the rim; "organic" = the original relax
// solver. Toggle kept so both can be compared live; loser gets removed.
let boardLayoutMode = _bp.layoutMode === "organic" ? "organic" : "shelves"

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

function boardShowResult(txid, ok){
  if(boardSuccessAcked.has(txid)) return
  boardSuccessAcked.add(txid)
  boardSaveAckedTx(boardSuccessAcked)
  boardDiag("board:result:shown", { txid, ok })
  boardCelebrate(ok)
  // PERSISTENT, CLOSABLE TOAST (user 2026-07-15): the verdict used to be a
  // banner bubble + a blocking alert(); now it's a toast that stays until
  // the user closes it (timeout 0 = persistent, ✕ per GM-TOAST-X1) — the
  // format the user wants to grow into progress-status messaging generally.
  // Squares = Hedera consensus status (ring colours stay signing status).
  // The alert() is gone: the wiper/confetti + toast carry the moment, and
  // the real result MODAL (Try again etc.) is KAT-PROPRECALL1's design.
  try {
    notify((ok ? "🟩 Transaction successful" : "🟥 Transaction failed or expired") + ` · ${txid}`,
      ok ? "success" : "error", { timeout: 0 })
  } catch {}
}

let _boardTxSocket = null
let _boardTxSocketId = null
const BOARD_NO_RECEIPT_MS = 45000   // honest timeout: "unresolved", never a confident false failure guess

function boardHandleTxUpdate(txid, update){
  boardDiag("board:txsocket:update", { txid, type: update?.type, hasReceipt: !!update?.receipt, hasSigs: !!update?.sigs })
  if(update?.type === "tx_receipt" && update.receipt){
    const status = update.receipt.status?._code || update.receipt.status
    boardShowResult(txid, status === "SUCCESS")
  }
  if(update?.sigs) boardRefreshSignStatus()   // event-driven — don't wait for the poll tick
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
  // preload the confetti lib now, while signing is underway — at result time
  // the burst then fires synchronously, before the alert() blocks the thread
  boardLoadConfetti()
  // EXPIRY VERDICT: no longer a client-side timer guess (removed 2026-07-15 —
  // see BOARD_TX_EXPIRY_MS below for why). renderRingBoard's vanish-from-
  // pending watch is now the only source of an expiry/failure verdict.
  ;(async () => {
    try {
      const { createTxSocket } = await import("/vendor/kpay/kpool_widget/websocket.js")
      if(_boardTxSocketId !== txid) return   // superseded while the import was in flight
      _boardTxSocket = createTxSocket({
        baseUrl: window.CONFIG?.HAPI_BASE || "",
        txid,
        onTxUpdate: update => boardHandleTxUpdate(txid, update)
      })
      boardDiag("board:txsocket:open", { txid })
      // honest fallback: if 45s pass with no receipt push at all (socket down,
      // backend hiccup), say so — do NOT guess success or failure
      setTimeout(() => {
        if(_boardTxSocketId === txid && !boardSuccessAcked.has(txid)){
          boardDiag("board:txsocket:no-receipt", { txid })
        }
      }, BOARD_NO_RECEIPT_MS)
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
    if(st === "SUCCESS" || st === "SIGNED") boardShowResult(t.txid, true)
    else if(/FAIL|ERROR|EXPIRE|INVALID/.test(st)) boardShowResult(t.txid, false)
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
function boardSyncPrefsUI(){
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
  const trailRes = document.getElementById("boardPrefTrailResidual")
  if(trailRes){
    trailRes.value = String(boardTrailResidual)
    if(trailRes.selectedIndex < 0) trailRes.value = "0.5"
    trailRes.onchange = () => { boardTrailResidual = Number(trailRes.value) || 0; boardSavePrefs() }
  }
  const layout = document.getElementById("boardPrefLayout")
  if(layout){
    layout.value = boardLayoutMode
    layout.onchange = () => {
      boardLayoutMode = layout.value === "organic" ? "organic" : "shelves"
      boardClearTrails()   // full reshuffle — drawn trails go stale
      boardSavePrefs()
      render()             // FLIP glides every chip to its new arrangement
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
    pickable.onchange = () =>
      socket.send(JSON.stringify({ type: "game_setPref", gameId, key: "allowPick", value: pickable.checked }))
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
  if(gameMeta?.network)
    document.body.dataset.network = gameMeta.network.toLowerCase()

  // stuck pair line (review 9): mouseleave never fires when the hovered chip
  // is re-rendered away — clear the hover line on every paint
  try { clearTradeLine() } catch {}

  renderBoard()

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
  const reservedByAccount = buildReservedByAccount(accounts)

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

function renderRingBoard(root){

  // join order — shared board for all; filters preserve join order
  // (getVisibleAccounts sorts mine-first, which would reseat the shared board)
  boardSigning = boardDetectSigning()
  boardSigningWindowDiag(boardSigning)   // KATOMIA-VALIDDUR1: log window changes
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
      // 500ms (was 2000, user 2026-07-15: the wiper lagged the shade lift —
      // fire "pretty much immediately"): still enough for a same-moment
      // success receipt push to win the race, and the shade's synced fade
      // (ring-focusshade--wipe, below) covers the remaining offset.
      setTimeout(() => {
        if(!boardSuccessAcked.has(vanished)){
          boardDiag("board:result:vanished-from-pending", { txid: vanished })
          boardShowResult(vanished, false)
        }
      }, 500)
    }
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
  const reservedByAccount = buildReservedByAccount(accounts)
  const etched = ringEtched()

  const W = root.clientWidth, H = root.clientHeight
  const cx = W / 2, cy = H / 2
  const rc = Math.max(24, Math.min(W, H) * 0.045)          // center pivot
  // basket oval — capped so east/west segments keep ≥ ~95px of available-space
  // outside it (portrait phones squeezed chips across the line otherwise)
  const rx = Math.max(92, Math.min(W * 0.30, W / 2 - 95))
  const ry = Math.max(100, Math.min(H * 0.27, H / 2 - 120))

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
    // BOARD-ORGANIC2 (chip glide): the e=1 layout, so each chip can be given
    // its final solved position to glide toward during the tween
    const wN = _boardPartyAnim.entities.map(en => en.wNew)
    const cumN = []
    { let a = 0; wN.forEach(w => { cumN.push(a); a += w }) }
    _boardPartyAnim.targetWidths = wN
    _boardPartyAnim.targetCum = cumN
  } else {
    slots = boardRingLayoutSlots(accounts)
    const acctSlotCount = slots.filter(s => s.type === "account").length
    const dividerCount = slots.length - acctSlotCount
    step = acctSlotCount ? (360 - dividerCount * BOARD_DIVIDER_DEG) / acctSlotCount : 360
    widths = slots.map(s => s.type === "divider" ? BOARD_DIVIDER_DEG : step)
    _boardLastStepDeg = step                           // wheel-scroll glide distance
  }
  const cumStart = []
  { let acc = 0; widths.forEach(w => { cumStart.push(acc); acc += w }) }

  const geo = { W, H, cx, cy }
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

  // BOARD-ORGANIC2: the e=1 start angle (same recenter math over the target
  // widths, no animation offsets) — anchors each chip's glide destination
  let targetStart = null
  if(_boardPartyAnim){
    targetStart = boardStartAngle
    if(ring8() && boardSelfBottom){
      const tw = _boardPartyAnim.targetWidths, tc = _boardPartyAnim.targetCum
      const mineIdx = slots.map((s, i) => (s.type === "account" && isMyAccount(s.account)) ? i : -1).filter(i => i >= 0)
      if(mineIdx.length){
        const first = mineIdx[0], last = mineIdx[mineIdx.length - 1]
        const center = boardStartAngle + (tc[first] + tc[last] + tw[last]) / 2
        targetStart = boardStartAngle + (90 - center)
      } else {
        targetStart = 90
      }
    }
  }

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

    // BOARD-ORGANIC2: this slot's e=1 angles (party anim renders entities
    // 1:1 — no splices — so slotIdx indexes targetCum/targetWidths directly)
    let tMid = null, tW = 0
    if(_boardPartyAnim && slot.type === "account"){
      tW = _boardPartyAnim.targetWidths[slotIdx]
      tMid = targetStart + _boardPartyAnim.targetCum[slotIdx] + tW / 2
    }
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
      // wedge closes over them — boardOrganicApply keeps their positions
      // frozen via the geometry-loose cache key during the tween)
      if(slot.weight != null && slot.weight < 1) wrap.style.opacity = slot.weight
      // belt & braces (user 2026-07-12): chips keep their first-frame
      // positions during the party tween (geometry-loose cache), so a
      // narrowing wedge no longer contains them — they were "briefly
      // spilling into adjacent segments". Clip every segment's chips to its
      // CURRENT wedge sector while the tween runs: whatever the chips do,
      // they can never escape their own closing slice. (The end-of-tween
      // chip REPOSITION jump is a separate parked item — the user wants the
      // asset drawing/positioning story looked at as its own pass, in the
      // context of these animations; FLIP-glide between relax states is the
      // likely shape. See BOARD-ORGANIC1 follow-ups.)
      if(_boardPartyAnim) wrap.style.clipPath = boardSectorPolygon(a0, a1, geo)

      const basketCont = document.createElement("div")
      boardBasketChips(account, basketCont, accountMap)
      // signing phase: the strike cleared the baskets server-side, but the
      // board keeps the picture — receiving legs render as tx chips in place
      if(boardSigning){
        const legs = boardSigning.legs[hac]
        if(legs && !basketCont.querySelector(".asset")) boardTxChips(legs, basketCont, accounts)
      }
      const storeCont = document.createElement("div")
      boardStoreChips(account, storeCont)
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
      // BOARD-ORGANIC2: e=1 zone geometry for the chip glide — built with the
      // EXACT same formulas as the normal path uses (halfDeg from the final
      // uniform width, radii at the final mid-angle), so the end solve caches
      // under the SAME strict key the post-anim render computes: the final
      // tween frame IS the final layout, no settle jump. Leavers (tW→0) get
      // no target — they hold their start positions while fading/clipping.
      let tBasket = null, tStore = null
      if(tMid != null && tW > 2){
        const tAm = rad(tMid)
        const tOval = ovalR(tAm), tEdge = edgeR(tAm)
        const tHalf = Math.max(6, tW / 2 - 1)
        tBasket = { midDeg: tMid, halfDeg: tHalf, rMin: rc + 10, rMax: tOval - 6 }
        tStore = { midDeg: tMid, halfDeg: tHalf, rMin: tOval + 8, rMax: Math.max(tOval + 40, tEdge - 14) }
      }
      _boardOrganicZones.push(
        { chips: basketChips, midDeg, halfDeg, rMin: rc + 10, rMax: rOval - 6,
          key: account.id + "|basket", target: tBasket },
        { chips: storeChips, midDeg, halfDeg, rMin: rOval + 8, rMax: Math.max(rOval + 40, rEdge - 14),
          key: account.id + "|store", target: tStore })
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
      if(legs && !inner.querySelector(".asset")) boardTxChips(legs, inner, accounts)
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
    boardStoreChips(account, chips)
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
  hub.className = "ring-hub" + (ringArcs() ? " ring-hub--ringed" : "")
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
    kimg.src = "/m/katomia/assets/kpay-k.svg"
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
      if(ring16()){
        hub.style.cursor = "pointer"
        hub.title += " — tap for the full signing page (all wallet options)"
        hub.onclick = () => window.open(
          `/m/sign/?network=${encodeURIComponent(gameMeta?.network || "")}` +
          `&txid=${encodeURIComponent(boardSigning.tx.txid)}&pch=${encodeURIComponent(boardSigning.tx.pch || "")}`,
          "_blank")
      }
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
  const reservedByAccount = buildReservedByAccount(accounts)
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
  boardStoreChips(account, store)
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
  boardStoreChips(account, store)
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
      if(party.some(a => !isMyAccount(a))) accounts = party
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

/* ── BOARD-ORGANIC1: collision-relax chip positioning (RENDERPATH Phase 2b) ──
   Chips stop living in rectangular flex boxes and settle individually into
   their segment's annular zone (basket inside the oval, store outside), via a
   small relax solver — "d3-force or ~80 lines by hand; wedge boundaries +
   oval as constraint walls" (BOARD-ORGANIC1). Done by hand: no dependency,
   and the solver runs in a SEGMENT-LOCAL frame (x = radial, y = tangential,
   mid-angle = x-axis) so results are cacheable independent of board rotation
   — that's what makes the "You at bottom" rotate animation cheap (per frame:
   cache hit + rotate, no re-solve, no re-measure).
   Decisions honoured from the task/review notes:
   - review 14 overflow policy: angular walls are HARD (a chip never enters a
     neighbour's wedge); radial max is SOFT, so pressure spills chips outward
     — off the board's edge for stores (off-screen, per the policy), across
     the oval into the account's OWN store zone for baskets (never sideways).
   - deterministic: seeds hash off stable chip keys, fixed iteration count —
     same state ⇒ same layout across re-renders (no jitter on poll repaints).
   - renderer/data flow untouched: same chip builders, same DOM elements,
     same drag/tap/hover handlers; only WHERE chips sit changes. */
let _boardOrganicZones = []               // collected per render, consumed by boardOrganicApply
const _boardOrganicCache = new Map()      // solve results keyed by zone+chips+geometry (rotation-independent)
let _boardChipPrevPos = new Map()         // chip identity → last painted {left,top,lx,ly} (FLIP glide, BOARD-ORGANIC3)
let _boardChipPrevPosOld = new Map()      // the frame BEFORE that — where a chip that vanished THIS frame last stood (NFT offer flight origin)

function boardHash01(s){
  let h = 2166136261
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 10000) / 10000
}

// relax pass in the segment-local frame. sizes: [{w,h}] px; zone: {halfDeg,
// rMin, rMax}. Returns [{x,y}] — x along the segment's mid-angle (radial),
// y tangential. Angular clamp hard, radial max soft (see policy note above).
// inners[i] (user 2026-07-14): ghost/reserved chips are "involved in the
// deal", so they gravitate to the zone's INNER wall — hugging the rim from
// the outside (rMin in the store zone is oval+8, so the 8px is the buffer:
// they never touch the ring itself). They keep a little collision slack
// outward but are otherwise pinned; uninvolved chips get pushed out, which
// also stops ghosts landing off-screen (the old symptom: the ▶ replay
// animated "from nowhere" because its ghost origin had spilled past the
// viewport — the outer wall is soft, and ghosts had no reason to stay in).
// seeds[i] (BOARD-ORGANIC3 round 2, user 2026-07-14: "the netting should
// land on the EXISTING location of the chip, not draw a new location"):
// chips that were already on screen START the relax at their previous
// local position instead of the index/hash spread — survivors stay put
// (modulo collision nudges the glide animates), only genuinely new chips
// hunt for a spot. Local coords are rotation-independent (x radial along
// the segment mid, y tangential), so seeds survive board rotation.
// RESERVED RIM BAND (user 2026-07-14 night: "clear the cashier's counter"):
// in store zones the first ~chip-height past the oval belongs to GHOSTS
// ONLY — store chips' inner wall starts beyond it, even before any ghost
// exists, so reserved vs store reads as two distinct rings. Basket zones
// (inside the oval) are unaffected. Seeded chips from pre-band layouts get
// walled out by the hard clamp; the FLIP glide animates the eviction.
function boardRelaxZone(sizes, keys, zone, inners, seeds, isBasket){
  const halfAng = Math.min(zone.halfDeg, 80) * Math.PI / 180
  const tanHalf = Math.tan(halfAng)
  const hasGhost = !!inners?.some(Boolean)
  const band = isBasket ? 0 :
    (hasGhost ? Math.max(...sizes.filter((_, i) => inners[i]).map(s => s.h))
              : Math.max(40, ...sizes.map(s => s.h))) + 12
  const items = sizes.map((s, i) => {
    const j1 = boardHash01(keys[i]), j2 = boardHash01(keys[i] + "~")
    const inner = !!inners?.[i]
    const seed = seeds?.[i]
    const base = inner ? zone.rMin : zone.rMin + band
    const x = seed ? seed.x
      : inner ? zone.rMin + s.h / 2
      : base + ((i + 0.5) / sizes.length * 0.8 + j2 * 0.2) * Math.max(1, zone.rMax - base)
    const maxY = Math.max(2, x * tanHalf - s.w / 2)
    const y = seed ? seed.y : (j1 * 2 - 1) * maxY * 0.8
    return { w: s.w, h: s.h, cr: Math.max(s.w, s.h) / 2 + 3, x, y, inner }
  })
  for(let it = 0; it < 40; it++){
    for(let a = 0; a < items.length; a++) for(let b = a + 1; b < items.length; b++){
      const A = items[a], B = items[b]
      const dx = B.x - A.x, dy = B.y - A.y
      const d = Math.hypot(dx, dy) || 0.001
      const min = (A.cr + B.cr) * 0.88          // circle-ish colliders, slight tolerated snuggle
      if(d < min){
        const push = (min - d) / d / 2
        A.x -= dx * push; A.y -= dy * push
        B.x += dx * push; B.y += dy * push
      }
    }
    items.forEach(A => {
      // inner wall hard: ghosts at the oval, store chips past the reserved band
      A.x = Math.max(zone.rMin + (A.inner ? 0 : band) + A.h / 2, A.x)
      if(A.inner) A.x = Math.min(A.x, zone.rMin + A.h / 2 + 12)   // ghosts hug the rim (12px collision slack)
      // basket zones: outer edge inset 34px so chips keep off the curved
      // account-number band inside the rim (BOARD-IDCOIN1; user 2026-07-15)
      const over = A.x - (zone.rMax - (isBasket ? 34 : 0) - A.h / 2)
      if(over > 0) A.x -= over * 0.3                              // outer wall SOFT — pressure spills outward
      const maxY = Math.max(2, A.x * tanHalf - A.w / 2)
      A.y = Math.max(-maxY, Math.min(maxY, A.y))                  // wedge walls HARD — never a neighbour's space
    })
  }
  return items.map(A => ({ x: A.x, y: A.y }))
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
  const band = (ghostIdx.length ? ghostBandH : Math.max(40, ...chipIdx.map(i => sizes[i].h))) + 12
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

// FLIP glide (BOARD-ORGANIC3): animate a chip from where it last painted to
// its new left/top. transform is free for this — flights use clones.
function boardGlideChip(el, prev, left, top){
  if(!prev) return
  const dx = prev.left - left, dy = prev.top - top
  if(Math.hypot(dx, dy) < 4) return
  el.style.transition = "none"
  el.style.transform = `translate(${dx}px, ${dy}px)`
  requestAnimationFrame(() => {
    el.style.transition = "transform " + Math.round(450 / (boardAnimSpeed || 1)) + "ms cubic-bezier(.65,0,.35,1)"
    el.style.transform = ""
    setTimeout(() => { el.style.transition = "" }, 520 / (boardAnimSpeed || 1))
  })
}

// measure → solve (or cache-hit) → place, in board coordinates. Runs after
// root.replaceChildren so offsetWidth/Height are real. Chips are positioned
// by left/top with the half-size baked in (NOT transform: the flight
// animations and future FLIP passes own el.style.transform).
// oval ({rx, ry}, BOARD-CHIPLINE1): the rim ellipse — lets the ghost
// alignment pass below put each ghost on its pile→basket line.
function boardOrganicApply(cx, cy, W, H, oval){
  const zones = _boardOrganicZones
  _boardOrganicZones = []
  if(!zones.length) return

  const cacheSet = (key, entry) => {
    if(_boardOrganicCache.size > 300) _boardOrganicCache.clear()
    _boardOrganicCache.set(key, entry)
  }
  const strictKey = (z, chipKeys, gz) =>
    z.key + "|" + chipKeys.join(";") + "|" + Math.round(gz.rMin) + "|"
      + Math.round(gz.rMax) + "|" + gz.halfDeg.toFixed(1) + "|" + W + "x" + H
      + "|" + boardLayoutMode   // BOARD-LAYOUT1: shelf/organic solves must not share cache entries

  // BOARD-ORGANIC2 (user 2026-07-12: the assets "reposition themselves" when
  // the animation settles — animate them to their target location instead).
  // During the party tween each chip GLIDES between two solves: START (the
  // pre-toggle geometry, solved on the first frame under a geometry-loose
  // key) and END (the e=1 geometry, solved once under the SAME strict key
  // the post-anim render computes — so the last tween frame equals the next
  // normal render exactly: no settle jump, and the end solve is already
  // cached when the tween hands back). Chosen over the also-considered
  // per-frame re-solve: solver outputs aren't continuous in geometry (chips
  // can swap arrangements between nearby solves), so per-frame re-solving
  // risks mid-tween jiggle; two endpoint solves + lerp is cheaper AND
  // guaranteed smooth. Leavers have no target (width→0) — they hold their
  // start positions while their wedge clips + fades over them.
  // stable chip identity (BOARD-ORGANIC3): assetId + zone + ghost-or-not
  // (+ occurrence) — deliberately NOT the textContent, so an amount change
  // (drop 1 HBAR → 499.7 becomes 498.7) is the SAME chip. Feeds both the
  // solve seeding (chips keep their spots) and the FLIP glide below.
  const occ = {}
  const prepped = zones.filter(z => z.chips.length).map(z => {
    // VOLATILE STATE CLASSES stripped from the cache key (user bug
    // 2026-07-15: toggling Pickable scattered every chip "all over the
    // place" — board-pickchip joining the className changed every chip's
    // key, forcing a full re-solve for a purely cosmetic overlay). The key
    // exists to invalidate on things that change SIZE or membership; these
    // classes change neither (the pick flag is absolutely overlaid, lockdim
    // is a filter, selected is an outline). With them stripped, a Pickable/
    // lock/selection toggle is a cache HIT — chips provably cannot move.
    const chipKeys = z.chips.map(el =>
      (el.dataset.assetId || "") + "|" +
      el.className.replace(/\b(board-pickchip|board-lockdim|selected)\b/g, "").replace(/\s+/g, " ") +
      "|" + (el.textContent || "").slice(0, 24))
    const idents = z.chips.map(el => {
      const ident = z.key + "|" + (el.dataset.assetId || "") + "|" + (el.classList.contains("board-ghost") ? "g" : "s")
      return ident + "#" + (occ[ident] = (occ[ident] || 0) + 1)
    })
    if(_boardPartyAnim){
      const startKey = "panim|" + z.key + "|" + chipKeys.join(";") + "|" + W + "x" + H + "|" + boardLayoutMode
      const endKey = z.target ? strictKey(z, chipKeys, z.target) : null
      return { z, chipKeys, idents, startKey, endKey,
        entry: _boardOrganicCache.get(startKey),
        endEntry: endKey ? _boardOrganicCache.get(endKey) : null }
    }
    const key = strictKey(z, chipKeys, z)
    return { z, chipKeys, idents, startKey: key, endKey: null, entry: _boardOrganicCache.get(key), endEntry: null }
  })

  if(prepped.some(p => !p.entry || (p.endKey && !p.endEntry))){
    // about to measure fresh sizes — run the wrapped-text width shrink FIRST
    // so the measured (and cached) width is the final one. render() calls
    // boardTightenChips() again later; by then widths are already set, so
    // it's a no-op. Gated to cache misses so animation frames (all hits)
    // never touch layout beyond the left/top writes below.
    if(ring9()) boardTightenChips()
    prepped.forEach(p => {
      // ghost/reserved chips hug the rim (boardRelaxZone inners) — the flag
      // is in the className, which is already part of the cache key
      const inners = p.z.chips.map(el => el.classList.contains("board-ghost"))
      // survivors start the solve where they last painted (local coords) —
      // only genuinely new chips get the spread placement. Shelf mode is
      // deterministic and ignores seeds entirely (BOARD-LAYOUT1).
      const seeds = p.idents.map(k => {
        const pp = _boardChipPrevPos.get(k)
        return pp && pp.lx != null ? { x: pp.lx, y: pp.ly } : null
      })
      const isBasket = /\|basket$/.test(p.z.key)
      const sizes = p.entry?.sizes || p.z.chips.map(el => ({ w: el.offsetWidth || 40, h: el.offsetHeight || 24 }))
      const solve = gz => boardLayoutMode === "shelves"
        ? boardShelfZone(sizes, p.chipKeys, gz, inners, isBasket)
        : boardRelaxZone(sizes, p.chipKeys, gz, inners, seeds, isBasket)
      if(!p.entry){
        p.entry = { pos: solve(p.z), sizes }
        cacheSet(p.startKey, p.entry)
        // solve diagnostics (2026-07-15, chasing the pickable scatter): one
        // kdiag line per FRESH solve — seed hit/miss counts + how far chips
        // actually moved from their previous spots. A healthy re-solve of
        // surviving chips reads seedsHit=n maxDriftPx≈0; a scatter shows up
        // as seedsMiss>0 or a big drift, pointing at identity churn. Fresh
        // solves only happen on real content change, so this stays quiet.
        let maxDrift = 0
        p.entry.pos.forEach((pos, i) => {
          const pp = _boardChipPrevPos.get(p.idents[i])
          if(pp?.lx != null) maxDrift = Math.max(maxDrift, Math.hypot(pos.x - pp.lx, pos.y - pp.ly))
        })
        boardDiag("board:organic:solve", {
          zone: p.z.key, layout: boardLayoutMode, chips: p.z.chips.length,
          seedsHit: seeds.filter(Boolean).length, seedsMiss: seeds.filter(s => !s).length,
          maxDriftPx: Math.round(maxDrift)
        })
      }
      if(p.endKey && !p.endEntry){
        // same chips, same sizes — only the zone geometry differs
        p.endEntry = { pos: solve(p.z.target), sizes }
        cacheSet(p.endKey, p.endEntry)
      }
    })
  }

  // BOARD-ORGANIC3 (user 2026-07-14, "stuff is just jumping around"): when a
  // zone re-solves (a new ghost changes the chip list → fresh solve → every
  // chip in the zone lands somewhere new), surviving chips now GLIDE from
  // where they last painted to their new spot instead of teleporting. FLIP
  // via transform (left/top stay the layout truth; flights use clones so the
  // chips' own transform is free). Identity is assetId + zone + ghost-or-not
  // (+ occurrence) — deliberately NOT the textContent, so an amount change
  // (drop 1 HBAR → 499.7 becomes 498.7) glides the same pile instead of
  // treating it as a brand-new chip. New chips don't glide (arrivals are the
  // flight animations' job); the tween-driven passes (party/rotate/scroll)
  // position per-frame themselves, so gliding is skipped while they run —
  // positions still recorded for continuity when they hand back.
  const e = _boardPartyAnim ? _boardPartyAnim.e : 0
  const skipGlide = !!(_boardPartyAnim || _boardRotateCancel || _boardScrollCancel || _boardOthersRotate)
  const nextPos = new Map()
  // BOARD-CHIPLINE1 endpoint collection: store piles + basket chips indexed by
  // pair, ghosts deferred (their glide waits for the alignment pass below —
  // otherwise they'd animate to the solver spot and then jump to the line)
  const piles = new Map(), baskets = new Map(), ghostRecs = [], chipGlides = []
  prepped.forEach(({ z, idents, entry, endEntry }) => {
    const mid = z.midDeg * Math.PI / 180
    const cos = Math.cos(mid), sin = Math.sin(mid)
    z.chips.forEach((el, i) => {
      let p = entry.pos[i]
      if(endEntry && endEntry.pos[i])
        p = { x: p.x + (endEntry.pos[i].x - p.x) * e, y: p.y + (endEntry.pos[i].y - p.y) * e }
      const s = entry.sizes[i]
      const left = cx + p.x * cos - p.y * sin - s.w / 2
      const top = cy + p.x * sin + p.y * cos - s.h / 2
      el.style.left = left + "px"
      el.style.top = top + "px"

      const k = idents[i]
      const prev = _boardChipPrevPos.get(k)
      nextPos.set(k, { left, top, lx: p.x, ly: p.y })   // screen for the glide, local for the seed

      const d = el.dataset
      const isGhost = el.classList.contains("board-ghost")
      if(isGhost){
        ghostRecs.push({ el, k, prev, w: s.w, h: s.h, cos, sin,
          pairFrom: d.ownerAccount, pairAsset: d.assetId, pairTo: d.toAccount })
        return   // glide deferred to the alignment pass
      }
      const isBasket = el.classList.contains("basket")
      if(isBasket && d.ownerAccount && d.assetId && d.toAccount)
        baskets.set(d.ownerAccount + "|" + d.assetId + "|" + d.toAccount, { x: left + s.w / 2, y: top + s.h / 2 })
      else if(!isBasket && d.ownerAccount && d.assetId)
        piles.set(d.ownerAccount + "|" + d.assetId, { x: left + s.w / 2, y: top + s.h / 2 })

      // withdraw-return glide (user 2026-07-14): an NFT coming home has no
      // prev under its store identity — it lived at the rim as a ghost last
      // frame. Glide it back from there instead of teleporting.
      let glideFrom = prev
      if(!glideFrom && !isBasket && d.ownerAccount && d.assetId)
        glideFrom = _boardChipPrevPos.get(k.replace(/\|s#(\d+)$/, "|g#$1"))
      // glide deferred until after the label keep-out pass below, so the
      // animation targets the FINAL spot, not a pre-push one
      chipGlides.push({ el, k, from: glideFrom, w: s.w, h: s.h })
    })
  })

  // SPOKE-LABEL KEEP-OUT (user 2026-07-15: the etched account numbers along
  // the segment boundaries were printing over asset chips — "box off the
  // number area", chips may not sit on it). Screen-space post-pass, layout-
  // mode agnostic: for each main etched id's rect, intersecting chips get
  // pushed out along the smaller-overlap axis, two passes. Ghosts are exempt
  // (they live at the rim, and pushing them would break the pile→ghost→basket
  // line). Note: the push may re-introduce small chip-chip overlaps — the
  // solver doesn't re-run; acceptable until labels become real obstacles
  // inside the solvers. lx/ly seeds keep their pre-push values on purpose:
  // the next solve re-lands there and this pass re-evicts, which is stable.
  if(!_boardPartyAnim){
    const labelRects = [...document.querySelectorAll("text.ring-etchlabel")]
      .filter(t => !t.classList.contains("ring-etchsub") && !t.classList.contains("ring-etchlock"))
      .map(t => t.getBoundingClientRect())
    if(labelRects.length) for(let pass = 0; pass < 2; pass++)
      chipGlides.forEach(c => {
        const p = nextPos.get(c.k)
        if(!p) return
        labelRects.forEach(r => {
          const pad = 4
          const ox = Math.min(p.left + c.w, r.right + pad) - Math.max(p.left, r.left - pad)
          const oy = Math.min(p.top + c.h, r.bottom + pad) - Math.max(p.top, r.top - pad)
          if(ox <= 0 || oy <= 0) return
          if(ox < oy) p.left += (p.left + c.w / 2 < (r.left + r.right) / 2 ? -ox : ox)
          else p.top += (p.top + c.h / 2 < (r.top + r.bottom) / 2 ? -oy : oy)
          c.el.style.left = p.left + "px"
          c.el.style.top = p.top + "px"
        })
      })
  }
  if(!skipGlide) chipGlides.forEach(c => {
    const p = nextPos.get(c.k)
    if(p) boardGlideChip(c.el, c.from, p.left, p.top)
  })

  // ── BOARD-CHIPLINE1 (user 2026-07-14): colinear chip geometry — each ghost
  // moves to where the straight line from its STORE PILE to its BASKET chip
  // crosses the rim band, so pile → ghost → basket read as one line (and the
  // offer animation launches along it instead of from a solver-chosen spot).
  // Ghosts without both endpoints (NFTs — no pile remainder — or a basket
  // hidden by filters) keep their solver rim-hug position. Skipped during the
  // party tween (chips are frozen + wedge-clipped there); fine during
  // rotate/scroll since both endpoints move together each frame.
  const bandFor = h => oval ? { A: oval.rx + 8 + h / 2, B: oval.ry + 8 + h / 2 } : null
  const pairSeen = new Map()   // duplicate pairs (net off): fan along the line's normal
  if(oval && !_boardPartyAnim) ghostRecs.forEach(g => {
    if(!(g.pairFrom && g.pairAsset && g.pairTo)) return
    const P = piles.get(g.pairFrom + "|" + g.pairAsset)
    const B = baskets.get(g.pairFrom + "|" + g.pairAsset + "|" + g.pairTo)
    if(!P || !B) return
    const band = bandFor(g.h)
    // intersect P + t(B−P) with the band ellipse: P sits outside it (store
    // zone starts at oval+8), B inside (basket zone ends at oval−6), so
    // exactly one root lands in (0,1)
    const u = (P.x - cx) / band.A, v = (P.y - cy) / band.B
    const du = (B.x - P.x) / band.A, dv = (B.y - P.y) / band.B
    const a = du * du + dv * dv
    const b = 2 * (u * du + v * dv)
    const c = u * u + v * v - 1
    const disc = b * b - 4 * a * c
    if(disc <= 0 || !a) return
    const sq = Math.sqrt(disc)
    const t = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].find(t => t > 0 && t < 1)
    if(t == null) return
    let gx = P.x + t * (B.x - P.x), gy = P.y + t * (B.y - P.y)
    // net-off duplicates of the same pair: nudge along the line's normal
    const pk = g.pairFrom + "|" + g.pairAsset + "|" + g.pairTo
    const n = pairSeen.get(pk) || 0
    pairSeen.set(pk, n + 1)
    if(n){
      const len = Math.hypot(B.x - P.x, B.y - P.y) || 1
      gx += (-(B.y - P.y) / len) * n * (g.h + 4)
      gy += ((B.x - P.x) / len) * n * (g.h + 4)
    }
    const left = gx - g.w / 2, top = gy - g.h / 2
    g.el.style.left = left + "px"
    g.el.style.top = top + "px"
    // keep the seed/glide memory pointing at the ALIGNED spot (local coords
    // via the zone frame's inverse rotation) or the next solve tugs it back
    const dxs = gx - cx, dys = gy - cy
    nextPos.set(g.k, { left, top, lx: dxs * g.cos + dys * g.sin, ly: -dxs * g.sin + dys * g.cos })
    g.aligned = true
  })
  // ghosts glide to wherever they ended up (aligned or solver spot).
  // Spawn glide (user 2026-07-14, "like an asset going out for sale — near
  // the counter"): a BRAND-NEW fungible ghost has no prev of its own, so it
  // animates out of its store pile. NFT spawns are NOT handled here any
  // more — boardFlyNftOffer (a clone flight, immune to the re-renders that
  // kill an element transform mid-glide) owns the whole store→ghost→basket
  // choreography for them.
  if(!skipGlide) ghostRecs.forEach(g => {
    const cur = nextPos.get(g.k)
    if(!cur) return
    let from = g.prev
    if(!from){
      const pile = g.pairFrom && g.pairAsset ? piles.get(g.pairFrom + "|" + g.pairAsset) : null
      if(pile) from = { left: pile.x - g.w / 2, top: pile.y - g.h / 2 }
    }
    boardGlideChip(g.el, from, cur.left, cur.top)
  })

  _boardChipPrevPosOld = _boardChipPrevPos   // keep one frame of history — vanished chips' last stand
  _boardChipPrevPos = nextPos                // stale identities pruned every apply
}

/* ── rotate animation for "You at bottom" (user 2026-07-12) ──────────────────
   The toggle used to hard-jump between orientations. Now the start angle
   tweens (shortest path, ease-in-out, ~550ms) from the orientation on screen
   to the new one, re-rendering per frame — cheap because the organic solve is
   rotation-independent (cache hit per frame) and N stays small. Any render
   triggered mid-tween (WS push etc.) just paints at the current offset. */
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
  const mine = accounts.filter(a => isMyAccount(a))
  const others = accounts.filter(a => !isMyAccount(a))

  // BOARD-WHEEL4 (user 2026-07-12): mine-first in BOTH branches. The
  // under-cap path used to keep raw join-grouped order (mine wherever it
  // fell) while the windowed path forced mine first — so a party toggle that
  // crossed the cap tried to tween between two DIFFERENT slot orderings, and
  // boardMergeSlotLayouts orphaned the accounts whose relative position
  // flipped (they lost their wNew and popped in at the end of the tween —
  // the "suddenly appearing segments" + the end jolt of the recenter). One
  // consistent order kills the whole family. This does make the layout
  // viewer-dependent below the cap too (it already was above it) — accepted:
  // "you at bottom will become the standard... the dividing and rotating
  // means there's no unified view for everyone anyway" (user, verbatim).
  if(accounts.length <= boardMaxSegments)
    return [...mine, ...others].map(account => ({ type: "account", account }))

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
  const flow = (acct, assetId, amt) => {
    if(!acct || !amt) return
    if(amt < 0){
      ent(acct).send.push({ assetId, amount: -amt })
      senders[assetId] = (assetId in senders) ? null : acct   // null = ambiguous
    } else ent(acct).recv.push({ assetId, amount: amt })
  }
  hbar.forEach(x => flow(x.accountId, "HBAR", Number(x.amount ?? x.value ?? 0)))
  toks.forEach(x => flow(x.accountId, x.tokenId, Number(x.amount ?? x.value ?? 0)))
  nfts.forEach(x => {
    const serial = x.serialNumber ?? x.serial
    const id = `${x.tokenId}#${serial}`
    const from = x.senderAccountId || x.sender || null
    const to = x.receiverAccountId || x.receiver || null
    if(from){ ent(from).send.push({ assetId: id, amount: 1 }); senders[id] = from }
    if(to) ent(to).recv.push({ assetId: id, amount: 1 })
  })
  Object.values(by).forEach(e => e.recv.forEach(r => { r.from = senders[r.assetId] || null }))
  return by
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
function boardTxChips(legs, container, accounts){
  legs.recv.forEach(leg => {
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
    if(leg.from) el.dataset.fromHac = leg.from
    el.title = "Pending transaction leg — awaiting signatures"
    container.appendChild(el)
  })
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

async function boardDirectSign(account){
  const wc = window.WC
  const tx = boardSigning?.tx
  if(!tx) return
  const network = gameMeta?.network || ""
  if(!wc?.signTx){
    // bundle missing → the external page still signs (never dead-ends)
    window.open(`/m/sign/?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(tx.txid)}&pch=${encodeURIComponent(tx.pch || "")}`, "_blank")
    return
  }
  const accountId = account.id.split(":")[1] || account.id
  try {
    boardDiag("board:sign:click", { network, txid: tx.txid, accountId })
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
    const { signedTransactionHex } = await wc.signTx({ accountId: signAs, transactionBytes: bytes })
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
    boardDiag("board:sign:error", { error: String(e) })
    notify(`Signing failed: ${e.message || e}`, "error", { timeout: 6000 })
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
      document.querySelectorAll(".board-trailline").forEach(l => {
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
    // account dropdown: pick → Lock/Unlock + 🗑 Delete act on it; ➕ Add last.
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
      addBtn.textContent = "➕ Add account…"
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
    add.textContent = "➕ Add account…"
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
      lockBtn.textContent = cur?.mode === "lock" ? "🔓 Unlock" : "🔒 Lock"
      lockBtn.disabled = !cur
      lockBtn.onclick = () => { const a = selected(); if(a) boardToggleLock(a) }
      if(ring16() && cur){
        // hover previews WHICH arc this would lock — thin dashed orange, not
        // the locked look (the click thickens it). No asset highlighting:
        // a lock commits the whole ring, not just your legs.
        const arcOf = () => document.querySelector(
          `.ring-lockarc[data-account-id="${CSS.escape(boardSelectedAccount || "")}"]`)
        lockBtn.onmouseenter = () => arcOf()?.classList.add("ring-lockpreview")
        lockBtn.onmouseleave = () => arcOf()?.classList.remove("ring-lockpreview")
      }
    }
    bar.appendChild(lockBtn)

    const delBtn = document.createElement("button")
    delBtn.className = "ring-footer-del"
    delBtn.textContent = "🗑"
    delBtn.title = "Remove the selected account from the game"
    delBtn.disabled = !cur
    delBtn.onclick = () => {
      const a = selected()
      if(a && typeof removeAccount === "function") removeAccount(a.id)  // KAT-AUTOLOAD2-safe path
    }
    bar.appendChild(delBtn)
  } else {
    mine.forEach(account => {
      const b = document.createElement("button")
      b.className = "ring-footer-lock" + (account.mode === "lock" ? " locked" : "")
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
  document.querySelectorAll(".board-trailline").forEach(l => l.remove())
  // signing phase (review 17): there are no ghost/basket pairs any more —
  // the legs fly from their GIVER's store zone to where they now sit
  if(boardSigning){
    let i = 0
    document.querySelectorAll(".board-txchip").forEach(chip => {
      const fromHac = chip.dataset.fromHac
      if(!fromHac) return
      const giverBox = [...document.querySelectorAll(".ring-avail")]
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
    const ghost = document.querySelector(`.asset.reserved${sel}`)
    if(!ghost) return
    // same pair key shape as boardAnimateNewOffers (to|from|asset) so a
    // withdraw clears replay after-glow too
    const k = `${toAccount}|${ownerAccount}|${assetId}`
    boardFlyLeg(ghost, basketEl, getPlayerColour(ownerPlayer), i++ * 220, k)
    boardTrailPileSegment(ownerAccount, assetId, ghost, getPlayerColour(ownerPlayer), k)
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
  if(pile && ghostEl) boardTrail(boardChipRect(pile), boardChipRect(ghostEl), colour, { key })
}

// one leg of the transfer animation: clone flies ghost → basket, trail line
// in the giver's colour draws with it and fades. key (optional) tags the
// trail with its offer pair so a later withdraw can clear the after-glow.
function boardFlyLeg(ghost, basketEl, colour, delay, key){
  boardFlyRect(basketEl.outerHTML, boardChipRect(ghost), boardChipRect(basketEl), colour, delay, { key })
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
        boardTrail(g, b, colour, { key })     // the straight leg's line draws from here
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
// line"). Called at the start of each movement tween. FUTURE (nice-to-have,
// user rated it likely-complicated and low priority): instead of removing,
// re-anchor the lines to their chip pairs and redraw them live through the
// motion — the pair keys the lines already carry are the hook for that.
function boardClearTrails(){
  document.querySelectorAll(".board-trailline").forEach(l => l.remove())
}

// trailing line: DOTTED in the giver's colour (review 7 — was solid with a
// draw-in; the dash channel now carries the dot pattern), fades out slowly
function boardTrail(a, b, colour, { key, persist = true } = {}){
  let svg = document.querySelector(".board-traillayer")
  if(!svg){
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("class", "board-traillayer")
    document.body.appendChild(svg)
  }
  svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`)
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
  line.setAttribute("x1", a.left + a.width / 2); line.setAttribute("y1", a.top + a.height / 2)
  line.setAttribute("x2", b.left + b.width / 2); line.setAttribute("y2", b.top + b.height / 2)
  line.setAttribute("class", "board-trailline")
  line.style.stroke = colour || "#999"
  if(key) line.dataset.pairKey = key
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
  if(p.rejectFrom) return account.id === p.rejectFrom
  if(!p.fromAccountId) return true
  if(account.id === p.fromAccountId && !p.fromBasketToAccountId) return false
  if(p.fromBasketToAccountId && account.id === p.fromBasketToAccountId) return false
  return true
}

function boardDropTarget(el, account){

  // touch-drag hit test target (elementFromPoint → closest [data-drop-account])
  el.dataset.dropAccount = account.id
  el.__dropAccount = account

  setupDropTarget(el, account)
  const coreDrop = el.ondrop
  const coreOver = el.ondragover

  el.ondragover = e => {
    coreOver && coreOver(e)
    // dataTransfer payloads are sealed during dragover — validity comes from
    // the window-scoped copy set at dragstart
    if(window.__boardDragPayload)
      e.dataTransfer.dropEffect = boardDropValid(window.__boardDragPayload, account) ? "move" : "none"
  }

  el.ondrop = e => {

    // mouse-dnd pick payload routes through the shared executor
    const pickFrom = e.dataTransfer.getData("pickFrom")
    if(pickFrom){
      e.preventDefault()
      el.classList.remove("drag-over")
      boardExecuteDrop({
        pick: true, pickFrom,
        assetId: e.dataTransfer.getData("assetId"),
        available: parseInt(e.dataTransfer.getData("available") || "1", 10)
      }, account)
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

    coreDrop(e)
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
    if(e.pointerType === "mouse") return    // mouse keeps native dnd
    const startX = e.clientX, startY = e.clientY
    let fly = null, halo = null

    const move = ev => {
      if(!fly){
        if(Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return
        fly = el.cloneNode(true)
        fly.className = el.className + " board-fly board-touchfly"
        const r = el.getBoundingClientRect()
        fly.style.left = r.left + "px"
        fly.style.top = r.top + "px"
        document.body.appendChild(fly)
        // review 13: the clone tracked the finger EXACTLY — i.e. it sat
        // hidden under the fingertip. It now rides LIFTED above the touch
        // point, and a dotted halo ring marks the touch itself (the user's
        // tap-oval idea) so the drag is always visible.
        halo = document.createElement("div")
        halo.className = "board-touchhalo"
        document.body.appendChild(halo)
        el.classList.add("board-dragsrc")
        // a drag must not ALSO fire the chip's tap action on release
        const swallow = c => { c.stopImmediatePropagation(); c.preventDefault() }
        el.addEventListener("click", swallow, { capture: true, once: true })
        setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 600)
      }
      const lift = 54   // chip floats clear above the fingertip, projected larger
      fly.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - startY - lift}px) scale(1.3)`
      halo.style.left = ev.clientX + "px"
      halo.style.top = ev.clientY + "px"
    }

    const up = ev => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      el.classList.remove("board-dragsrc")
      if(!fly) return                        // plain tap — click proceeds
      fly.remove()
      halo?.remove()
      const hit = document.elementFromPoint(ev.clientX, ev.clientY)
      const target = hit?.closest?.("[data-drop-account]")
      if(target?.__dropAccount) boardExecuteDrop(payload, target.__dropAccount)
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
  })
}

// the drop semantics, shared by mouse dnd (boardDropTarget wraps the legacy
// handler) and touch drag (executed directly from the payload)
function boardExecuteDrop(p, account){
  if(!account || !p?.assetId) return

  if(p.pick){
    // picks land only in YOUR space; the backend re-checks allowPick
    if(!isMyAccount(account)) return
    const amount = getTransferAmount(p.assetId, p.available || 1)
    if(amount === null) return
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

  const amount = getTransferAmount(p.assetId, p.available || 1)
  if(amount === null) return
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
  const labelLayer = labels || top || svg
  const dimLayer = top || svg

  // wheel-glide clip (BOARD-WHEEL2 v2): mid-glide, the others-group segs'
  // felt elements (boundary lines, lock/sign arcs, dims, etched ids) render
  // inside an SVG clipPath cut to the fixed sector between the dividers —
  // the same window the DOM-side wedge/chip containers use, so the whole
  // segment crosses the threshold as one piece.
  let baseClipG = null, topClipG = null, labelClipG = null
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
  const _deferredSignArcs = []   // signing arcs render after the focus shade (lights over darkness)

  const mkLine = (a, r0, r1, cls, layer = svg) => {
    const line = document.createElementNS(NS, "line")
    line.setAttribute("x1", g.cx + r0 * Math.cos(a))
    line.setAttribute("y1", g.cy + r0 * Math.sin(a))
    line.setAttribute("x2", g.cx + r1 * Math.cos(a))
    line.setAttribute("y2", g.cy + r1 * Math.sin(a))
    line.setAttribute("class", cls)
    layer.appendChild(line)
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
    if(ring8() && segs.length > 1 && (seg.mine !== prev.mine)){
      const rOvalHere = (g.rx * g.ry) / Math.hypot(g.ry * Math.cos(a), g.rx * Math.sin(a))
      mkLine(a, g.rc, rOvalHere, "ring-boundary", segBase(seg))
      mkLine(a, rOvalHere, rE, "ring-divider", segBase(seg))
    } else {
      mkLine(a, g.rc, rE, "ring-boundary", segBase(seg))
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
        segTop(seg).appendChild(dim)
        // v11 (review 10): BIG 🔒 at the store centroid, on top of the dim —
        // third lock cue alongside the orange arc + darkened store
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
          segTop(seg).appendChild(big)
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
      if(party) arc.style.setProperty("--tstrip", boardTargetStripColour(getPlayerColour(seg.account.playerId)))
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
        circArc(g.rc + 6, seg.a0 + 2, seg.a1 - 2, "ring-playerarc",
          getPlayerColour(seg.account.playerId), segTop(seg))
        if(boardInMyParty(seg.account, allAccounts))
          circArc(g.rc + 12, seg.a0 + 3, seg.a1 - 3, "ring-partylight", null, segTop(seg))
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
        // segTop, not labelLayer (user 2026-07-12): the "you" label was the
        // one element outside the fade/clip scope — it overhung its
        // collapsing segment and popped instead of fading in/out with it
        segTop(seg).appendChild(you)
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
    ;(top || svg).appendChild(shade)
  } else if(window.__boardShadeOn){
    // shade was on last paint and turned off THIS render (signing resolved /
    // tx vanished): draw it one last time with the slow --wipe fade so it
    // dissolves in step with the wiper sweep instead of vanishing a beat
    // before it (user 2026-07-15). The ▶ toggle-off path does its own
    // 0.5s fade pre-render and clears __boardShadeOn to skip this.
    const thumbH2 = Math.min(52, Math.max(26, 0.034 * Math.min(g.W, g.H) + 13))
    const m2 = thumbH2 * 1.2, hrx2 = g.rx + m2, hry2 = g.ry + m2, B2 = 48
    const fade = document.createElementNS(NS, "path")
    fade.setAttribute("d",
      `M ${-B2} ${-B2} H ${g.W + B2} V ${g.H + B2} H ${-B2} Z ` +
      `M ${g.cx - hrx2} ${g.cy} ` +
      `a ${hrx2} ${hry2} 0 1 0 ${hrx2 * 2} 0 ` +
      `a ${hrx2} ${hry2} 0 1 0 ${-hrx2 * 2} 0 Z`)
    fade.setAttribute("fill-rule", "evenodd")
    fade.setAttribute("class", "ring-focusshade ring-focusshade--wipe")
    ;(top || svg).appendChild(fade)
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
    const layer = fadeWrap(top || svg, seg)
    const under = document.createElementNS(NS, "path")
    under.setAttribute("d", arc.getAttribute("d"))
    under.setAttribute("class", "ring-signarc-under")
    layer.appendChild(under)
    layer.appendChild(arc)
  })
  _deferredSignArcs.length = 0

  if(top || labels){
    const both = document.createDocumentFragment()
    both.appendChild(svg)
    if(labels) both.appendChild(labels)
    if(top) both.appendChild(top)
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

// shared by ringEtchLabel + ringHubCoinLabel (BOARD-IDCOIN1)
function ringLabelFontSize(g){
  const vScale = ring8() ? Math.min(1.3, Math.max(0.67, Math.min(g.W, g.H) / 800)) : 1
  return 20 * vScale
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
  text.textContent = lockPrefix + (seg.account.id.split(":")[1] || seg.account.id)
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
  const hac = seg.account.id.split(":")[1] || seg.account.id
  const fs = ringLabelFontSize(g)
  // full-circle single account (hubPlayersRing guards the same case): an SVG
  // arc can't have coincident start/end points, so cap the sweep just short.
  const a0 = seg.a0, a1 = seg.a1 - a0 >= 360 ? seg.a0 + 359.9 : seg.a1
  const bottomHalf = Math.sin(seg.am) > 0
  // baseline inset from the oval: textPath glyphs grow "up" from the baseline
  // — toward the rim on top-half arcs (clear the full cap height), toward the
  // hub on bottom-half ones (only descenders reach rimward, less clearance).
  const inset = (bottomHalf ? fs * 0.3 : fs * 0.85) + 6
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
  textPath.textContent = hac
  text.appendChild(textPath)

  const grp = document.createElementNS(NS, "g")
  grp.appendChild(path)
  grp.appendChild(text)
  return grp
}

/* ── layout pieces ──────────────────────────────────────────────────────── */

// Fat pie-slice drop target + low-alpha colour wash, clipped from the board
// center out past the screen edge — dropping anywhere in a player's wedge is
// dropping on that player (direction beats distance on touch).
function makeWedge(account, a0, a1, geo, isMine = false){

  const el = document.createElement("div")
  el.className = "board-wedge"
  el.dataset.accountId = account.id
  el.style.clipPath = boardSectorPolygon(a0, a1, geo)
  el.style.background = getPlayerColour(account.playerId)
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
  head.textContent = (player?.name && player.name !== "anon" ? player.name + " · " : "") + label
  if(account.mode === "lock") head.textContent += " 🔒"
  el.appendChild(head)

  // outer band: what they show as available — reserved stays here as ghosts
  const avail = document.createElement("div")
  avail.className = "board-band board-band-avail"
  boardStoreChips(account, avail)
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
    boardStoreChips(account, chips)
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
    return
  }
  el.classList.add("chip-owned")
  el.style.background = `color-mix(in srgb, ${getPlayerColour(playerId)} 24%, #fff)`
}

function boardStoreChips(account, container){
  const mine = isMyAccount(account)

  Object.entries(account.assets || {}).forEach(([assetId, amount]) => {
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
    ringTint(el, account.playerId)
    if((ring13() || susan4()) && account.mode === "lock")
      el.classList.add("board-lockdim")   // assets leave the light on lock

    if(mine){
      if((ring13() || susan4()) && playerAllowsPick(account.playerId)){
        // uniform view (review 12): YOUR chips show the price-tag flag too
        el.classList.add("board-pickchip")
        el.style.setProperty("--pickflag", getPlayerColour(account.playerId))
      }
      // TAP-TO-OFFER (user 2026-07-15): tap selects the chip (legacy grid's
      // own setSelectedAsset machinery — setupDropTarget's click handler on
      // every wedge already completes the offer via offerSelectedToAccount,
      // amount prompt included), replacing the old openAssetModal popup which
      // the user found confusing on the board. Tap the chip again to cancel.
      // The legacy game.php page keeps its modal. FUTURE: multi-tap selection
      // (several chips → one destination) — the state is single-asset today.
      el.onclick = () => {
        if(ring8()){
          if(isSelected(assetId, account.id, null)){ clearSelection(); render() }
          else setSelectedAsset(assetId, account.id, null)
          return
        }
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
      el.title = "Pickable — drag into your space to take it"
      el.draggable = true
      el.ondragstart = e => {
        e.dataTransfer.setData("assetId", assetId)
        e.dataTransfer.setData("available", amount || 1)
        e.dataTransfer.setData("pickFrom", account.id)
        window.__boardDragPayload = { pick: true, assetId, pickFrom: account.id }
      }
      boardTouchDrag(el, { pick: true, assetId, available: amount || 1, pickFrom: account.id })
    }
    container.appendChild(el)
  })
}

// does this player allow others to pick from their stores? (KAT-PLAYERPREF1)
function playerAllowsPick(playerId){
  return !!state?.players?.[playerId]?.prefs?.allowPick
}

function boardReservedChips(account, container, reservedByAccount){
  const mine = isMyAccount(account)

  ;(reservedByAccount[account.id] || []).forEach(item => {
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
    el.title = "Reserved — already offered out"
    ringTint(el, account.playerId)
    if((ring13() || susan4()) && account.mode === "lock")
      el.classList.add("board-lockdim")

    // hover shows the dotted line to where it landed (legacy pair rules)
    el.dataset.assetId = item.assetId
    el.dataset.toAccount = item.toAccountId
    el.onmouseenter = () => highlightTradePair(item.assetId, account.id, item.toAccountId, true)
    el.onmouseleave = () => highlightTradePair(item.assetId, account.id, item.toAccountId, false)

    if(mine){
      el.onclick = () => {
        const ok = confirm("Withdraw " + boardAssetText(item.assetId, item.amount || 1) + " from " + item.toAccountId + "?")
        if(!ok) return
        // net view: the chip is the whole netted stack — withdraw every leg
        const n = boardNetLegCount(account.id, item.toAccountId, item.assetId)
        for(let i = 0; i < n; i++) socket.send(JSON.stringify({
          type: "game_withdraw", gameId,
          fromId: account.id, toId: item.toAccountId, assetId: item.assetId
        }))
        clearSelection()
      }
      // drag the ghost home = withdraw; onto another segment = redirect
      // (boardDropTarget routes the home case to a plain withdraw)
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
      el.title = "Your offer — tap to withdraw, drag to redirect"
      el.onclick = () => {
        const ok = confirm("Withdraw " + boardAssetText(item.assetId, item.amount || 1) + " from " + account.id + "?")
        if(!ok) return
        // net view: the chip is the whole netted stack — withdraw every leg
        const n = boardNetLegCount(fromAccountId, account.id, item.assetId)
        for(let i = 0; i < n; i++) socket.send(JSON.stringify({
          type: "game_withdraw", gameId,
          fromId: fromAccountId, toId: account.id, assetId: item.assetId
        }))
        clearSelection()
      }
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
      el.title = "Offered to you — tap to return it, or drag it back to its giver"
      el.onclick = () => {
        const ok = confirm("Return " + boardAssetText(item.assetId, item.amount || 1) + " to " + fromAccountId + "?")
        if(!ok) return
        // net view: same all-legs treatment as withdraw
        const n = boardNetLegCount(fromAccountId, account.id, item.assetId)
        for(let i = 0; i < n; i++) socket.send(JSON.stringify({
          type: "game_reject", gameId,
          accountId: account.id, assetId: item.assetId
        }))
        clearSelection()
      }
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

  if(msg.type === "game_offer"){
    const from = acc(msg.fromId), to = acc(msg.toId)
    if(!from || !to) return
    const have = from.assets[msg.assetId] || 0
    const amount = Math.min(msg.amount || 1, have)
    if(amount <= 0) return
    if(have - amount <= 0) delete from.assets[msg.assetId]
    else from.assets[msg.assetId] = have - amount
    to.basket.push({ assetId: msg.assetId, amount, fromId: msg.fromId })
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
  }

  if(msg.type === "game_toggleLock"){
    const a = acc(msg.accountId)
    if(a) a.mode = a.mode === "lock" ? "shop" : "lock"

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
