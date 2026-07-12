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
const BOARD_PREFS_KEY = "katomiaBoardPrefs"
function boardLoadPrefs(){
  try { return JSON.parse(localStorage.getItem(BOARD_PREFS_KEY) || "{}") } catch { return {} }
}
function boardSavePrefs(){
  try {
    localStorage.setItem(BOARD_PREFS_KEY, JSON.stringify({
      skin: boardSkin, selfBottom: boardSelfBottom,
      netView: boardNetView, partyOnly: boardPartyOnly,
      maxSegments: boardMaxSegments
    }))
  } catch {}
}
const _bp = boardLoadPrefs()
let boardSelfBottom = _bp.selfBottom ?? true   // me at 6 o'clock; off = shared
let boardNetView = _bp.netView ?? false        // FULL pairwise netting
let boardSelectedAccount = null                // footer dropdown selection
let boardPartyOnly = _bp.partyOnly ?? false    // rule-aware party filter

// BOARD-WHEEL1 (user 2026-07-11): Lazy Susan is retired (scope, not code —
// still in git history / renderSusanBoard if ever needed). Its job — "too
// many players to fit" — moves onto the ring itself: mine stays fixed, OTHER
// players become a scrollable window capped at boardMaxSegments total slots
// (mine + visible others). A footer number input controls this; default 6.
let boardMaxSegments = Math.max(3, Number(_bp.maxSegments) || 6)
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
function boardShowResult(txid, ok){
  if(boardSuccessAcked.has(txid)) return
  boardSuccessAcked.add(txid)
  boardSaveAckedTx(boardSuccessAcked)
  boardDiag("board:result:shown", { txid, ok })
  alert(ok
    ? `✅ Transaction successful\n\n${txid}\n\nTap OK to continue.`
    : `⚠️ Transaction failed or expired\n\n${txid}\n\nIt was not executed on-chain. Tap OK to continue.`)
  boardDiag("board:result:acked", { txid, ok })
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

  // diagnostic only now — resolution itself comes from the tx socket
  // (boardEnsureTxSocket/boardHandleTxUpdate), which doesn't depend on US
  // having been the one to sign, so it also covers "someone else's last
  // signature completed it while I watched"
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
  // party collapse/expand mid-tween: paint the UNION list (leavers still on
  // the board at their shrinking widths) instead of the filtered one —
  // re-resolved to LIVE account objects each render so a WS state push
  // landing mid-tween doesn't paint 550ms-stale chip data
  const accountMap = getAccountMap()
  const accounts = _boardPartyAnim
    ? _boardPartyAnim.accounts.map(a => accountMap[a.id] || a)
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
  // Party collapse/expand: windowing bypassed, every union account gets a
  // slot whose width is weighted by the tween (leavers 1→0, arrivals 0→1,
  // keepers 1) — the pacman close/open. Snaps to the normal layout on done.
  let slots, step, widths
  if(_boardPartyAnim){
    slots = accounts.map(account => ({ type: "account", account }))
    const e = _boardPartyAnim.e
    const wts = accounts.map(a =>
      _boardPartyAnim.removed.has(a.id) ? 1 - e :
      _boardPartyAnim.added.has(a.id) ? e : 1)
    const tot = wts.reduce((s, x) => s + x, 0) || 1
    widths = wts.map(w => w / tot * 360)
    slots.forEach((s, i) => { s.weight = wts[i] })     // chip fade rides this
    step = 360 / Math.max(1, accounts.length)          // felt font sizing only
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

  // ring8 "you at bottom": rotate the shared layout so the middle of my run
  // of slots points due south (90° screen). Toggle off = everyone sees the
  // identical board (screen-share / spectator mode). Mine is ALWAYS one
  // contiguous run now — boardGroupByPlayer (under the cap) and
  // boardRingLayoutSlots' construction (over the cap) both guarantee it — so
  // this no longer needs to hunt for the first contiguous run, just find mine.
  let start = boardStartAngle
  if(ring8() && boardSelfBottom){
    const mineIdx = slots.map((s, i) => (s.type === "account" && isMyAccount(s.account)) ? i : -1).filter(i => i >= 0)
    if(mineIdx.length){
      const first = mineIdx[0], last = mineIdx[mineIdx.length - 1]
      const center = boardStartAngle + (cumStart[first] + cumStart[last] + widths[last]) / 2
      start = boardStartAngle + (90 - center)
    }
  }

  // rotate animation: the toggle just flipped — seed the offset so this frame
  // still paints the OLD orientation, then tween the offset to 0 (the new
  // one), re-rendering per frame. Shortest path so 350° goes -10°, not +350°.
  if(_boardAnimateNextRotation && _boardStartRendered != null){
    _boardAnimateNextRotation = false
    cancelAnimationFrame(_boardRotateRaf)
    const from = boardShortestDelta(_boardStartRendered - start)
    _boardRotateOffset = from
    const t0 = performance.now(), dur = 550
    const tick = now => {
      const t = Math.min(1, (now - t0) / dur)
      const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2   // easeInOutCubic
      _boardRotateOffset = from * (1 - e)
      if(t < 1) _boardRotateRaf = requestAnimationFrame(tick)
      else _boardRotateOffset = 0
      render()
    }
    _boardRotateRaf = requestAnimationFrame(tick)
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

  slots.forEach((slot, i) => {

    // wheel-scroll glide: the others-window slots carry the animated offset;
    // mine and the dividers hold still (the wheel turns, the mouth doesn't)
    const gOff = slot.group === "others" ? _boardOthersRotate : 0
    const a0 = start + cumStart[i] + gOff, a1 = a0 + widths[i]

    if(slot.type === "divider"){
      frag.appendChild(makeScrollDividerWedge(a0, a1, geo, slot.hiddenCount))
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
    segs.push({ account, a0, a1, am, mine,
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
    frag.appendChild(wedge)

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
      frag.appendChild(wrap)

      const midDeg = (a0 + a1) / 2, halfDeg = Math.max(6, step / 2 - 1)
      _boardOrganicZones.push(
        { chips: basketChips, midDeg, halfDeg, rMin: rc + 10, rMax: rOval - 6,
          key: account.id + "|basket" },
        { chips: storeChips, midDeg, halfDeg, rMin: rOval + 8, rMax: Math.max(rOval + 40, rEdge - 14),
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
      if(legs && !inner.querySelector(".asset")) boardTxChips(legs, inner, accounts)
    }
    boardDropTarget(inner, account)
    frag.appendChild(inner)

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
    frag.appendChild(outer)
  })

  // felt linework: basket oval, segment boundaries, hub ring, etched ids
  frag.appendChild(ringFelt(segs, { W, H, cx, cy, rc, rx, ry, step, edgeR, ovalR, rad, etched }))

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

  // BOARD-ORGANIC1: chips are in the live DOM now — measure, relax, place.
  // Must run BEFORE the flight animations below (they read chip rects).
  boardOrganicApply(cx, cy, W, H)

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

function boardHash01(s){
  let h = 2166136261
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 10000) / 10000
}

// relax pass in the segment-local frame. sizes: [{w,h}] px; zone: {halfDeg,
// rMin, rMax}. Returns [{x,y}] — x along the segment's mid-angle (radial),
// y tangential. Angular clamp hard, radial max soft (see policy note above).
function boardRelaxZone(sizes, keys, zone){
  const halfAng = Math.min(zone.halfDeg, 80) * Math.PI / 180
  const tanHalf = Math.tan(halfAng)
  const items = sizes.map((s, i) => {
    const j1 = boardHash01(keys[i]), j2 = boardHash01(keys[i] + "~")
    const x = zone.rMin + ((i + 0.5) / sizes.length * 0.8 + j2 * 0.2) * Math.max(1, zone.rMax - zone.rMin)
    const maxY = Math.max(2, x * tanHalf - s.w / 2)
    return { w: s.w, h: s.h, cr: Math.max(s.w, s.h) / 2 + 3, x, y: (j1 * 2 - 1) * maxY * 0.8 }
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
      A.x = Math.max(zone.rMin + A.h / 2, A.x)                    // inner wall hard (hub / oval)
      const over = A.x - (zone.rMax - A.h / 2)
      if(over > 0) A.x -= over * 0.3                              // outer wall SOFT — pressure spills outward
      const maxY = Math.max(2, A.x * tanHalf - A.w / 2)
      A.y = Math.max(-maxY, Math.min(maxY, A.y))                  // wedge walls HARD — never a neighbour's space
    })
  }
  return items.map(A => ({ x: A.x, y: A.y }))
}

// measure → solve (or cache-hit) → place, in board coordinates. Runs after
// root.replaceChildren so offsetWidth/Height are real. Chips are positioned
// by left/top with the half-size baked in (NOT transform: the flight
// animations and future FLIP passes own el.style.transform).
function boardOrganicApply(cx, cy, W, H){
  const zones = _boardOrganicZones
  _boardOrganicZones = []
  if(!zones.length) return

  const prepped = zones.filter(z => z.chips.length).map(z => {
    const chipKeys = z.chips.map(el =>
      (el.dataset.assetId || "") + "|" + el.className + "|" + (el.textContent || "").slice(0, 24))
    // party collapse/expand: segment geometry (halfDeg/radii) changes every
    // frame of the tween — a geometry-strict key would miss (= re-measure +
    // re-solve per frame). Drop geometry from the key while it runs: chips
    // keep their first-frame positions and the shrinking wedge closes over
    // them (the pacman look), with a fresh strict solve on the final layout.
    const cacheKey = _boardPartyAnim
      ? "panim|" + z.key + "|" + chipKeys.join(";") + "|" + W + "x" + H
      : z.key + "|" + chipKeys.join(";") + "|" + Math.round(z.rMin) + "|"
        + Math.round(z.rMax) + "|" + z.halfDeg.toFixed(1) + "|" + W + "x" + H
    return { z, chipKeys, cacheKey, entry: _boardOrganicCache.get(cacheKey) }
  })

  if(prepped.some(p => !p.entry)){
    // about to measure fresh sizes — run the wrapped-text width shrink FIRST
    // so the measured (and cached) width is the final one. render() calls
    // boardTightenChips() again later; by then widths are already set, so
    // it's a no-op. Gated to cache misses so rotation frames (all hits)
    // never touch layout beyond the left/top writes below.
    if(ring9()) boardTightenChips()
    prepped.forEach(p => {
      if(p.entry) return
      const sizes = p.z.chips.map(el => ({ w: el.offsetWidth || 40, h: el.offsetHeight || 24 }))
      p.entry = { pos: boardRelaxZone(sizes, p.chipKeys, p.z), sizes }
      if(_boardOrganicCache.size > 300) _boardOrganicCache.clear()
      _boardOrganicCache.set(p.cacheKey, p.entry)
    })
  }

  prepped.forEach(({ z, entry }) => {
    const mid = z.midDeg * Math.PI / 180
    const cos = Math.cos(mid), sin = Math.sin(mid)
    z.chips.forEach((el, i) => {
      const p = entry.pos[i], s = entry.sizes[i]
      el.style.left = (cx + p.x * cos - p.y * sin - s.w / 2) + "px"
      el.style.top = (cy + p.x * sin + p.y * cos - s.h / 2) + "px"
    })
  })
}

/* ── rotate animation for "You at bottom" (user 2026-07-12) ──────────────────
   The toggle used to hard-jump between orientations. Now the start angle
   tweens (shortest path, ease-in-out, ~550ms) from the orientation on screen
   to the new one, re-rendering per frame — cheap because the organic solve is
   rotation-independent (cache hit per frame) and N stays small. Any render
   triggered mid-tween (WS push etc.) just paints at the current offset. */
let _boardStartRendered = null      // effective start angle last painted
let _boardRotateOffset = 0          // animated delta, 0 when settled
let _boardRotateRaf = null
let _boardAnimateNextRotation = false   // set by the toggle, consumed by renderRingBoard

function boardShortestDelta(deg){ return ((deg % 360) + 540) % 360 - 180 }

// shared tween driver: onFrame(easedProgress, done) per rAF, easeInOutCubic —
// the one easing every board animation uses. Returns a cancel function.
function boardAnimate(dur, onFrame){
  const t0 = performance.now()
  let raf
  const tick = now => {
    const t = Math.min(1, (now - t0) / dur)
    const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    if(t < 1) raf = requestAnimationFrame(tick)
    onFrame(e, t >= 1)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

// ── wheel-scroll animation (user 2026-07-12): tapping a divider used to snap
// the others-window one position — now the OTHERS' segments glide one
// account-width (same ease as the self-bottom rotation), the newcomer
// sweeping in through the far divider. Mine + the dividers stay fixed (the
// wheel turns inside the pacman mouth, the mouth doesn't move). The leaver is
// simply gone at tap — its gap is what the glide closes. Applied as an
// angle offset on "others"-group slots only (boardRingLayoutSlots marks them).
let _boardOthersRotate = 0
let _boardScrollCancel = null
let _boardLastStepDeg = 0     // account-slot width from the last normal layout

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

function boardTogglePartyOnly(v){
  const before = boardFilteredAccounts()
  boardPartyOnly = v
  boardSavePrefs()
  const after = boardFilteredAccounts()
  const beforeIds = new Set(before.map(a => a.id))
  const afterIds = new Set(after.map(a => a.id))
  const removed = new Set(before.filter(a => !afterIds.has(a.id)).map(a => a.id))
  const added = new Set(after.filter(a => !beforeIds.has(a.id)).map(a => a.id))
  if((!removed.size && !added.size) || !ring16()){ render(); return }   // no membership change → nothing to animate
  // the union is whichever side is the superset (collapse: before ⊇ after;
  // expand: after ⊇ before) — party filtering only ever adds/removes, and
  // both lists come out of the same grouped ordering
  const union = removed.size ? before : after
  _boardPartyCancel?.()
  _boardPartyAnim = { accounts: union, removed, added, e: 0 }
  _boardPartyCancel = boardAnimate(550, (e, done) => {
    if(_boardPartyAnim) _boardPartyAnim.e = e
    if(done){ _boardPartyAnim = null; _boardPartyCancel = null }
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
  if(accounts.length <= boardMaxSegments)
    return accounts.map(account => ({ type: "account", account }))

  const mine = accounts.filter(a => isMyAccount(a))
  const others = accounts.filter(a => !isMyAccount(a))
  const visibleOthersCount = Math.max(0, boardMaxSegments - mine.length)

  if(!others.length || !visibleOthersCount)
    return mine.map(account => ({ type: "account", account }))

  const offset = ((boardOthersScrollOffset % others.length) + others.length) % others.length
  const visibleOthers = []
  for(let k = 0; k < Math.min(visibleOthersCount, others.length); k++)
    visibleOthers.push(others[(offset + k) % others.length])

  const hiddenCount = others.length - visibleOthers.length
  const divider = () => ({ type: "divider", hiddenCount })

  return [
    ...mine.map(account => ({ type: "account", account })),
    divider(),
    // group tag: the wheel-scroll glide (_boardOthersRotate) applies to these
    // slots only — mine and the dividers hold still while the window turns
    ...visibleOthers.map(account => ({ type: "account", account, group: "others" })),
    divider()
  ]
}

function boardScrollOthers(step){
  boardOthersScrollOffset += step
  boardDiag("board:wheel:scroll", { offset: boardOthersScrollOffset, step })
  // glide instead of snap: at offset = +step×width the surviving others paint
  // at their OLD positions (the newcomer at the far divider), then everything
  // eases to 0 = the new layout. Rapid taps restart the tween from the new
  // window — slight replay, acceptable.
  _boardScrollCancel?.()
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
    boardSignStatus = { txid: tx.txid, byAccount }
    const sig = JSON.stringify(byAccount)
    boardDiag("board:signstatus", { txid: tx.txid, byAccount, signedKeys: signedPubkeys.length,
      shortAccts: Object.keys(short), unassocAccts: Object.keys(unassoc) })
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
    expiry: (vs || tx.createdAt || Date.now()) + 180000
  }
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
    el.textContent = left ? `${m}:${String(sec).padStart(2, "0")}` : "expired"
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
      if(_recentLocalMoves.has(k)) return          // I did this myself
      const fromAccount = state.accounts?.[k.split("|")[1]]
      if(!fromAccount) return
      const { ghost, basket } = pairEls(k)
      if(ghost && basket) boardFlyLeg(ghost, basket, getPlayerColour(fromAccount.playerId), 0)
    })

    prev.forEach((amt, k) => {
      if((keys.get(k) || 0) >= amt) return
      // a STRIKE clears every basket at once — that's not a withdraw; the
      // legs stay on the table as tx chips, so no fly-home choreography
      // (the success/failure settlement flights come with the next slice)
      if(boardSigning) return
      const snap = _prevOfferRects.get(k)
      if(!snap) return
      const [, fromId, assetId] = k.split("|")
      const owner = state.accounts?.[fromId]
      // return target: the owner's store chip it went back into (new DOM);
      // fall back to where the ghost used to be
      const home = document.querySelector(
        `.asset:not(.basket):not(.reserved)[data-owner-account="${CSS.escape(fromId)}"][data-asset-id="${CSS.escape(assetId)}"]`)
      const target = home ? home.getBoundingClientRect() : snap.ghost
      if(snap.basket && target)
        boardFlyRect(snap.html, snap.basket, target, getPlayerColour(owner?.playerId), 0)
    })
  }

  // snapshot for the next diff
  _prevOfferRects = new Map()
  keys.forEach((amt, k) => {
    const { ghost, basket } = pairEls(k)
    if(basket) _prevOfferRects.set(k, {
      basket: basket.getBoundingClientRect(),
      ghost: ghost ? ghost.getBoundingClientRect() : null,
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

  if(ring8()){
    // "Party only" (was "Active only", review 7): rule-aware — who is party
    // to MY proposal. cluster → my cluster; active → all active; all → n/a.
    bar.appendChild(check("Party only", boardPartyOnly,
      v => boardTogglePartyOnly(v),   // animated collapse/expand of non-party segments
      "Show only accounts party to your proposal (follows the game's lock rule: " + (gameMeta?.lockRule || "cluster") + ")"))
  } else {
    bar.appendChild(check("Active only", showActiveOnly, v => { showActiveOnly = v; render() }))
  }

  if(ring8()){
    bar.appendChild(check("Net", boardNetView,
      v => { boardNetView = v; boardSavePrefs(); render() },
      "View baskets fully netted per pair: opposite-direction flows of the same asset collapse to their difference (the transaction nets exactly like this — net-on previews the after and avoids the strike jolt)"))
    bar.appendChild(check("You at bottom", boardSelfBottom,
      v => { boardSelfBottom = v; _boardAnimateNextRotation = true; boardSavePrefs(); render() },
      "On: the board rotates so your accounts face you. Off: everyone sees the identical layout (screen-share / spectator)"))

    // BOARD-WHEEL1: max ring slots (mine + visible others) before the rest
    // become a scrollable window behind a divider wedge. Lazy Susan's old job
    // — too many players to fit — now lives here instead of a second board.
    const maxLabel = document.createElement("label")
    maxLabel.className = "ring-footer-filter"
    maxLabel.title = "Maximum players shown on the ring at once (yours + others). Above this, the rest scroll behind a tap-to-advance divider."
    const maxInput = document.createElement("input")
    maxInput.type = "number"
    maxInput.min = "3"
    maxInput.max = "24"
    maxInput.className = "ring-footer-maxseg"
    maxInput.value = boardMaxSegments
    maxInput.onchange = () => {
      const v = Math.max(3, Math.min(24, Number(maxInput.value) || 6))
      maxInput.value = v
      boardMaxSegments = v
      boardOthersScrollOffset = 0
      boardSavePrefs()
      render()
    }
    maxLabel.appendChild(document.createTextNode("Max on ring "))
    maxLabel.appendChild(maxInput)
    bar.appendChild(maxLabel)

    // Pickable (review 8) — the first GENERIC player pref (KAT-PLAYERPREF1,
    // backend game_setPref → broadcast in players[].prefs). Declares "others
    // may pick assets straight from my store" — window-shopping on the wheel.
    // The pick GESTURE itself needs its backend action, next pass.
    const myPrefs = state?.players?.[currentPlayerId]?.prefs || {}
    bar.appendChild(check("Pickable", !!myPrefs.allowPick,
      v => socket.send(JSON.stringify({ type: "game_setPref", gameId, key: "allowPick", value: v })),
      "Allow other players to pick assets straight from your store (they shop, you agreed in advance)"))

    // account dropdown: pick → Lock/Unlock + 🗑 Delete act on it; ➕ Add last.
    // When all-locked, the Lock slot becomes the SIGN button (same checkpoint,
    // next phase) — see the scene/tx notes at the bottom of this file.
    if(!boardSelectedAccount || !mine.some(a => a.id === boardSelectedAccount))
      boardSelectedAccount = mine[0]?.id || null

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
        // add-account MODAL lives on game.php (katomia-addaccount.js + markup)
        // — port it to board.php later; prompt is the stopgap composer
        const v = prompt("Add account (e.g. 12345 or 0.0.12345):")
        if(v) addAccounts(v)
        return
      }
      boardSelectedAccount = sel.value
      render()   // re-highlights the selected wedge
    }
    bar.appendChild(sel)

    const selected = () => mine.find(a => a.id === boardSelectedAccount)

    const lockBtn = document.createElement("button")
    const cur = selected()
    const curHac = cur ? (cur.id.split(":")[1] || cur.id) : null
    if(boardSigning && curHac && boardSigning.legs[curHac]){
      // signing phase: the Lock slot IS the Sign slot (same checkpoint,
      // next phase). Opens the existing signing page — modal untouched;
      // the embedded roll-up is the next slice.
      lockBtn.className = "ring-footer-lock ring-footer-sign"
      lockBtn.textContent = "✍ Sign"
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
        // the instant switch was jarring)
        const shade = document.querySelector(".ring-focusshade")
        if(shade){ shade.classList.add("ring-focusshade--out"); setTimeout(render, 560) }
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
    boardFlyLeg(ghost, basketEl, getPlayerColour(ownerPlayer), i++ * 220)
  })
}

// one leg of the transfer animation: clone flies ghost → basket, trail line
// in the giver's colour draws with it and fades
function boardFlyLeg(ghost, basketEl, colour, delay){
  boardFlyRect(basketEl.outerHTML, ghost.getBoundingClientRect(), basketEl.getBoundingClientRect(), colour, delay)
}

// markup + two rects → flight (also used for withdraw-back, where the source
// chip no longer exists in the new DOM and we replay from a snapshot)
function boardFlyRect(html, a, b, colour, delay){
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
    boardTrail(a, b, colour)
  }, (delay || 0) + 30)
  setTimeout(() => fly.remove(), (delay || 0) + 1000)
}

// trailing line: DOTTED in the giver's colour (review 7 — was solid with a
// draw-in; the dash channel now carries the dot pattern), fades out slowly
function boardTrail(a, b, colour){
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
  svg.appendChild(line)
  requestAnimationFrame(() => {
    setTimeout(() => { line.style.opacity = 0 }, 1000)   // linger, then fade
  })
  setTimeout(() => line.remove(), 3600)
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

function ringFelt(segs, g){
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "ring-felt")
  svg.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`)

  // ring8 splits the felt in two: this base svg (z below the chip boxes) and
  // a TOP svg (z above them) carrying the locked-store dim + etched labels —
  // so the dim shades the chips but never the account id / 🔒 / xproof label
  const top = ring8() ? document.createElementNS(NS, "svg") : null
  if(top){
    top.setAttribute("class", "ring-felt ring-felt--top")
    top.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`)
  }
  const labelLayer = top || svg
  const dimLayer = top || svg

  const mkLine = (a, r0, r1, cls) => {
    const line = document.createElementNS(NS, "line")
    line.setAttribute("x1", g.cx + r0 * Math.cos(a))
    line.setAttribute("y1", g.cy + r0 * Math.sin(a))
    line.setAttribute("x2", g.cx + r1 * Math.cos(a))
    line.setAttribute("y2", g.cy + r1 * Math.sin(a))
    line.setAttribute("class", cls)
    svg.appendChild(line)
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
      mkLine(a, g.rc, rOvalHere, "ring-boundary")
      mkLine(a, rOvalHere, rE, "ring-divider")
    } else {
      mkLine(a, g.rc, rE, "ring-boundary")
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
        dimLayer.appendChild(dim)
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
          dimLayer.appendChild(big)
        }
      }
      // arc visibility matrix — ring8 INVERTS the ownership marking: other
      // players' arcs are solid grey (the divider continues through them);
      // YOUR arc has no line at all — but stays tappable (transparent
      // stroke) and lights orange when you lock
      if(!ring8() && ringNoOval() && !locked && !seg.mine) return
      const arc = document.createElementNS(NS, "path")
      arc.setAttribute("d", ringArcPath(seg, g))
      arc.dataset.accountId = seg.account.id
      arc.setAttribute("class", "ring-lockarc"
        + (locked ? " ring-lockarc--locked" : "")
        + (seg.mine ? " ring-lockarc--mine" : "")
        + (ring8() ? (seg.mine ? " ring-lockarc--open" : " ring-lockarc--wall") : "")
        + (seg.sign ? " ring-signarc ring-signarc--" + seg.sign : ""))
      if(seg.mine){
        arc.onclick = () => boardToggleLock(seg.account)
        const t = document.createElementNS(NS, "title")
        t.textContent = locked ? "Locked — tap your arc to unlock" : "Tap your arc to lock"
        arc.appendChild(t)
      }
      svg.appendChild(arc)
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

  if(g.etched) segs.forEach(seg => labelLayer.appendChild(ringEtchLabel(seg, g, NS)))

  if(ring11()){
    // v11 (review 10): party + identity cues moved to the HUB's doorstep —
    // a warm gold arc just OUTSIDE the hub for every account in MY party
    // (v10's inner version was white-on-white), and an angled "you" beside
    // the hub on my segments (replaces the etched ·you suffix). Later: short
    // player names for others here, tappable → player info/reputation.
    const allAccounts = segs.map(s => s.account)
    const circArc = (r, a0d, a1d, cls, colour) => {
      const p = d => {
        const a = g.rad(d)
        return `${(g.cx + r * Math.cos(a)).toFixed(1)} ${(g.cy + r * Math.sin(a)).toFixed(1)}`
      }
      const span = Math.min(a1d - a0d, 359.9)
      const el = document.createElementNS(NS, "path")
      el.setAttribute("d", `M ${p(a0d)} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${p(a0d + span)}`)
      el.setAttribute("class", cls)
      if(colour) el.style.stroke = colour
      labelLayer.appendChild(el)
    }
    segs.forEach(seg => {
      if(ring12()){
        // v12 (review 11): board-side hub cues, inside→out: hub grey border,
        // PLAYER-COLOUR arc (always), PARTY STRIP-LIGHT (white — gold was
        // clashing with the lock orange; this is "the light comes on")
        circArc(g.rc + 6, seg.a0 + 2, seg.a1 - 2, "ring-playerarc",
          getPlayerColour(seg.account.playerId))
        if(boardInMyParty(seg.account, allAccounts))
          circArc(g.rc + 12, seg.a0 + 3, seg.a1 - 3, "ring-partylight")
      } else if(boardInMyParty(seg.account, allAccounts))
        circArc(g.rc + 5, seg.a0 + 3, seg.a1 - 3, "ring-partyarc")
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
        labelLayer.appendChild(you)
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
    const shade = document.createElementNS(NS, "path")
    shade.setAttribute("d",
      `M 0 0 H ${g.W} V ${g.H} H 0 Z ` +
      `M ${g.cx - g.rx} ${g.cy} ` +
      `a ${g.rx} ${g.ry} 0 1 0 ${g.rx * 2} 0 ` +
      `a ${g.rx} ${g.ry} 0 1 0 ${-g.rx * 2} 0 Z`)
    shade.setAttribute("fill-rule", "evenodd")
    shade.setAttribute("class", "ring-focusshade" + (window.__boardShadeOn ? "" : " ring-focusshade--in"))
    ;(top || svg).appendChild(shade)
  }
  window.__boardShadeOn = shadeOn

  if(top){
    const both = document.createDocumentFragment()
    both.appendChild(svg)
    both.appendChild(top)
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

  // ring8: etched ids scale with the viewport (~⅔ … ~1.3× of the fixed size)
  const vScale = ring8() ? Math.min(1.3, Math.max(0.67, Math.min(g.W, g.H) / 800)) : 1
  const fs = Math.min(28, Math.max(16, g.step * 0.24)) * vScale
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

  // ring2: pick the boundary that lies most east-west, write along it
  const c0 = Math.abs(Math.cos(g.rad(seg.a0))), c1 = Math.abs(Math.cos(g.rad(seg.a1)))
  const abDeg = c0 >= c1 ? seg.a0 : seg.a1
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

/* ── layout pieces ──────────────────────────────────────────────────────── */

// Fat pie-slice drop target + low-alpha colour wash, clipped from the board
// center out past the screen edge — dropping anywhere in a player's wedge is
// dropping on that player (direction beats distance on touch).
function makeWedge(account, a0, a1, geo, isMine = false){

  const el = document.createElement("div")
  el.className = "board-wedge"
  el.dataset.accountId = account.id

  const R = Math.max(geo.W, geo.H) * 1.6
  const pts = [[geo.cx, geo.cy]]
  const steps = 6
  for(let s = 0; s <= steps; s++){
    const a = (a0 + (a1 - a0) * s / steps) * Math.PI / 180
    pts.push([geo.cx + R * Math.cos(a), geo.cy + R * Math.sin(a)])
  }
  el.style.clipPath = "polygon(" + pts.map(p => `${p[0].toFixed(0)}px ${p[1].toFixed(0)}px`).join(",") + ")"
  el.style.background = getPlayerColour(account.playerId)

  if(!isMine) setupDropTarget(el, account)
  return el
}

// BOARD-WHEEL1: same pie-slice geometry as makeWedge, but a plain scroll
// button instead of an account — the seam between "mine" (fixed) and the
// currently-visible window of "others" when there are more players than
// boardMaxSegments. Tap = advance the window by one, looping (basic concept
// per the user's spec — no animation yet).
function makeScrollDividerWedge(a0, a1, geo, hiddenCount){
  const el = document.createElement("div")
  el.className = "board-wedge board-wedge--divider"
  el.title = `${hiddenCount} more player${hiddenCount === 1 ? "" : "s"} — tap to scroll`

  const R = Math.max(geo.W, geo.H) * 1.6
  const pts = [[geo.cx, geo.cy]]
  const steps = 3
  for(let s = 0; s <= steps; s++){
    const a = (a0 + (a1 - a0) * s / steps) * Math.PI / 180
    pts.push([geo.cx + R * Math.cos(a), geo.cy + R * Math.sin(a)])
  }
  el.style.clipPath = "polygon(" + pts.map(p => `${p[0].toFixed(0)}px ${p[1].toFixed(0)}px`).join(",") + ")"

  const am = (a0 + a1) / 2 * Math.PI / 180
  const badge = document.createElement("div")
  badge.className = "board-wedge-divider-badge"
  badge.style.left = (geo.cx + Math.min(geo.W, geo.H) * 0.36 * Math.cos(am)) + "px"
  badge.style.top = (geo.cy + Math.min(geo.W, geo.H) * 0.36 * Math.sin(am)) + "px"
  badge.textContent = "⋯" + hiddenCount
  el.appendChild(badge)

  el.onclick = () => boardScrollOthers(1)
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
      clickable: mine
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
      el.onclick = () => openAssetModal(assetId, account.id, amount)
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
        socket.send(JSON.stringify({
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
        socket.send(JSON.stringify({
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
        socket.send(JSON.stringify({
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
