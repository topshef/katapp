/* katomia-chat.js — BOARD-CHAT1 (user 2026-07-30)
 *
 * Show what players are SAYING on the board. The backend has carried this all along:
 * `game_chat` is an accepted action, messages land in `game.chat[]` and ride out in
 * every broadcast `state.chat`. Nothing on the front end has ever rendered them, which
 * is why the bot demo's narration was invisible.
 *
 * Two surfaces, because the user asked for both and they do different jobs:
 *
 *   1. SPEECH BUBBLES anchored to the speaker's own wedge. The default, per the user:
 *      "really you don't have the context properly, then you need the messages to emit
 *      from the player." A floating transcript tells you what was said; a bubble over
 *      a wedge tells you WHO said it and about what. Anchors come from
 *      _boardChatAnchors, filled by katomia-board.js during its own angle solve — this
 *      file never recomputes board geometry.
 *
 *   2. A GLASSY TRANSCRIPT PANEL — the scrolling log, collapsible, so you can catch up
 *      on what you missed and read back past the bubble's lifetime. Also the fallback
 *      when a speaker has no anchor (a player with no visible segment).
 *
 * Deliberately NOT done yet (user parked these, and they need board work, not chat work):
 *   · bubbles from the divider wedge for off-screen players, click-to-rotate-to-speaker
 *   · @mention highlighting between two wedges
 *   · a spectator's own "you are not playing" wedge due south
 *   · audience comments — needs a game-level allow-comments setting first, and the user
 *     decided the demo should NOT accept them (sabotage/shilling risk)
 *
 * Read-only: this file sends nothing. It cannot, yet — there is no front-end chat input.
 */
(function () {
  "use strict";

  var BUBBLE_MS = 14000;   // how long a bubble stays up. Long: demo narration is the point.
  // Gentler exit (user 2026-08-03): same TOTAL lifetime, but the fade starts this much
  // before expiry and runs long, instead of the late .3s blink-out. Hard-coded for now —
  // promote to the catrun/board config alongside BUBBLE_MS if demos want their own pacing.
  var FADE_MS = 4500;
  var MAX_LOG = 80;
  var seen = new Set();    // chat ids already animated in — state.chat resends everything
  var live = [];           // { id, playerId, el, until }
  // BOARD-CHATMODE1 R3 (user 2026-08-03): system/toast announcements folded into the
  // stream as "🤖 Katomia" entries — LOCAL only (not in state.chat, not broadcast),
  // merged into the render by timestamp. Toasts still show alongside for now except
  // the tx verdict, which lives only here in panel mode.
  var systemMsgs = [];
  var _sysN = 0;
  var booted = false;
  var logOpen = false;
  var lastCount = 0;

  // The layer and panel are STATIC siblings declared in board.php, deliberately outside
  // #boardRoot: renderRingBoard() calls root.replaceChildren() on every paint, so a layer
  // parked inside would be destroyed at exactly the moment a new message arrives. Same
  // reasoning as the existing #game.board-linelayer passthrough.
  function host() { return document.getElementById("boardChatLayer"); }

  // Board pixels -> viewport pixels. Anchors are recorded relative to the board's own
  // box; the overlay is position:fixed, so bubbles need the board's on-screen origin.
  function boardOrigin() {
    var r = document.getElementById("boardRoot");
    if (!r) return null;
    var b = r.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }

  /* ── the transcript panel ─────────────────────────────────────────────────── */
  function panel() {
    var p = document.getElementById("boardChatPanel");
    if (!p) return null;
    if (p.dataset.kchatReady) return p;
    p.dataset.kchatReady = "1";
    p.innerHTML =
      '<button type="button" class="kchat-panel-tab" title="Show or hide what players have said">' +
        '<span class="kchat-panel-icon">💬</span>' +
        '<span class="kchat-panel-count"></span>' +
      '</button>' +
      '<div class="kchat-panel-body"><div class="kchat-panel-list"></div></div>';
    p.querySelector(".kchat-panel-tab").addEventListener("click", function () {
      logOpen = !logOpen;
      p.classList.toggle("kchat-panel--open", logOpen);
      if (logOpen) {
        var list = p.querySelector(".kchat-panel-list");
        list.scrollTop = list.scrollHeight;
        // BOARD-CHATMODE1: open panel = message mode — the live bubbles step aside
        // (they return for new messages once the panel is closed again)
        live.slice().forEach(retire);
      }
    });
    return p;
  }

  // CHAT-IDENTITY1 (user 2026-08-03): a player holding at least one bound (verified)
  // account speaks as that Hedera account instead of "anon" — lowest account id wins
  // when several are bound. Display-only, resolved from live board state per render;
  // players with a real name (demo cast etc.) keep it.
  function accountLess(a, b) {
    var pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (var i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0); }
    return false;
  }
  // bound=true → verified accounts only (the preferred identity); bound=false →
  // any account this player holds, the fallback added 2026-08-04 (see who()).
  function accountFor(playerId, bound) {
    try {
      var accs = (typeof state !== "undefined" && state && state.accounts) ? state.accounts : null;
      if (!accs || !playerId) return null;
      var best = null;
      Object.keys(accs).forEach(function (k) {
        var a = accs[k];
        if (!a || a.playerId !== playerId) return;
        if (bound && !a.authBound) return;
        var id = a.accountId || a.label || String(a.id || k).split(":")[1];
        if (id && (!best || accountLess(id, best))) best = id;
      });
      return best;
    } catch (e) { return null; }
  }
  function boundAccountFor(playerId) { return accountFor(playerId, true); }
  // SPEECH-ONLY default (BOARD-ACTIONMSG1 R2, user 2026-08-04): this canonical
  // pick — the player's first verified account, then any account — applies to
  // TYPED MESSAGES only, where no account is the action's subject. Action rows
  // never come here; they show the account acted on (actionSubject). The user
  // has flagged this default as provisional: a proper player label may replace
  // it later (a typed message isn't really "from" one account), possibly with
  // account @-mentions in the body. Keep that in mind before building on it.
  // CHAT-IDENTITY1 follow-up (user 2026-08-04: "let's not use the player labels
  // p1, p2, p3 — that's not used anywhere, so let's not display that at all").
  // The old last resort printed exactly that, and it was NOT an edge case: web
  // players join as `anon` (katomia-network.js), so any unnamed player without a
  // VERIFIED binding fell straight through to "player p1". Now an unverified
  // account id is preferred over the raw player id, and the id is only ever a
  // silent "—" if the player somehow holds no account at all.
  function who(msg) {
    var n = msg.playerName;
    if (!n || n === "anon") {
      return boundAccountFor(msg.playerId) || accountFor(msg.playerId, false) || "—";
    }
    return n;
  }

  // Bubble display name (user 2026-08-03): the cast emoji that leads demo names is
  // replaced in the bubble by the player's generated avatar, so strip any leading
  // pictographs here. The transcript panel keeps the full name untouched.
  function displayName(msg) {
    return who(msg).replace(/^(?:[\p{Extended_Pictographic}️‍]|\s)+/u, "") || who(msg);
  }

  // One identity key for avatar faces, shared with the board's segment avatars —
  // pubkey when the player has one (matches the order page), else the player id.
  function avatarKey(playerId) {
    try {
      var p = (typeof state !== "undefined" && state && state.players) ? state.players[playerId] : null;
      return (p && (p.intentPublicKey || p.pubkeyHex)) || playerId;
    } catch (e) { return playerId; }
  }
  window.katomiaAvatarKey = avatarKey;

  /* BOARD-CHATMODE1 (user 2026-08-03): "bubbles" or "panel". The pref lives with the
   * board (boardChatMode, Settings toggle); defaults phone=panel / desktop=bubbles.
   * Panel mode = no bubbles at all; messages live in the docked strip (mobile) and
   * the floating panel is hidden. On desktop with bubbles, OPENING the 💬 panel also
   * switches to message mode for as long as it's open (user: "press the speech
   * bubble → it switches to message mode instead and the bubbles go away"). */
  function chatMode() {
    try { if (typeof boardChatMode !== "undefined" && boardChatMode) return boardChatMode; } catch (e) {}
    return "bubbles";
  }
  function bubblesAllowed() { return chatMode() !== "panel" && !logOpen && !document.body.classList.contains("kchat-fullopen"); }

  // A new message pulses the speaker's board avatar (scale up, settle back) — the
  // "someone is talking" cue that survives whichever chat surface is active. The
  // window in _kavPulse lets ringAvatar re-join the pulse after a repaint (the felt
  // repaints per broadcast, which used to kill the animation and read as a flick).
  function pulseAvatar(playerId) {
    if (!playerId) return;
    window._kavPulse = window._kavPulse || {};
    window._kavPulse[playerId] = Date.now() + 1400;
    var sel = '.ring-avatar[data-player-id="' + (window.CSS && CSS.escape ? CSS.escape(playerId) : playerId) + '"]';
    document.querySelectorAll(sel).forEach(function (g) {
      g.classList.remove("ring-avatar--pulse");
      void g.getBoundingClientRect();
      g.classList.add("ring-avatar--pulse");
    });
  }

  // Katomia (the system) speaking: entry into the stream + the hub K swells.
  function system(text, opts) {
    // SIGN-STRIKEMSG1 R3: opts.txid marks a tx-verdict echo — renderLog retires it
    // once the backend's persisted verdict row for the same txid is in state.chat.
    systemMsgs.push({ id: "sys" + (++_sysN), ts: Date.now(), text: String(text || ""), link: (opts && opts.link) || null, linkText: (opts && opts.linkText) || null, txid: (opts && opts.txid) || null, system: true });
    if (systemMsgs.length > 100) systemMsgs.shift();
    var hub = document.querySelector(".ring-hub");
    if (hub) {
      hub.classList.remove("ring-hub--pulse");
      void hub.offsetWidth;
      hub.classList.add("ring-hub--pulse");
    }
    var st = (typeof state !== "undefined" && state) || null;
    renderLog((st && Array.isArray(st.chat)) ? st.chat : []);
  }

  /* The mobile dock — a bottom strip of scrolling chat above the footer/ribbon.
   * R5: board-first split — see the portrait branch in syncDock. */

  // R5 (feedback 08568c88): the portrait split's shared bounds, used by both the
  // default layout and the drag bar. min = one row + the send box; def = ~3 rows
  // + send box; max = the larger of 55% of the viewport and what the 4:5 board
  // cap leaves over (a very tall phone gives the surplus to messages, not to a
  // board stretched past 4:5).
  // BOARD-SIDEDRAG1: the landscape panel's bounds. Floor keeps the action rows readable;
  // ceiling stops an ultrawide handing the whole screen to chat.
  var sideW = 0;
  function sideLimits() { return { min: 170, max: Math.max(220, Math.round(innerWidth * 0.5)) }; }

  // VIEW-SNAP2: the bar on screen — players' control bar, or a spectator's ribbon
  function barNow() {
    var els = document.querySelectorAll(".ring-footer, .kspec-ribbon");
    for (var i = 0; i < els.length; i++) if (els[i].getClientRects().length) return els[i];
    return null;
  }
  function dockLimits() {
    var stackH = 0;
    [".ring-footer", ".kspec-ribbon"].forEach(function (s) {
      var el = document.querySelector(s);
      if (el && getComputedStyle(el).display !== "none") stackH += el.getBoundingClientRect().height;
    });
    // Cap 1.8×w: the wedge layout genuinely uses portrait height (probe: no dead
    // space at 1.25 — chips and counters fill the taller wedges), so the cap only
    // guards absurd stretch on very tall screens. At 1.25 the cap BOUND typical
    // phones and forced a ~270px dock — the opposite of the "~3 lines" default.
    var boardCap = Math.round(innerWidth * 1.8);
    var minFromCap = Math.max(0, innerHeight - stackH - boardCap);
    return {
      min: Math.max(64, minFromCap),
      def: Math.max(120, minFromCap),
      max: Math.max(Math.round(innerHeight * 0.55), minFromCap)
    };
  }

  // Shared send-box wiring (GCP feedback 2026-08-08, messages-view parity): the split
  // dock and the full-screen messages view carried the SAME .kchat-send form, both wired
  // here so send behaviour (and CHAT-COMMITGATE1 recovery) couldn't drift apart. Since
  // VIEW-MSGS2 the messages view IS the dock, so there is one form; the helper stays.
  function wireChatSend(form) {
    if (!form || form._kwired) return;
    form._kwired = true;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = form.querySelector("input");
      var text = (inp.value || "").trim();
      if (!text) return;
      var gid = (typeof gameId !== "undefined" && gameId) || (typeof getGameId === "function" ? getGameId() : null);
      var sk = (typeof socket !== "undefined" && socket) || null;
      if (!gid || !sk || sk.readyState !== 1) return;
      window.__kchatLastSent = { text: text, ts: Date.now() };   // CHAT-COMMITGATE1: recoverable on refusal
      sk.send(JSON.stringify({ type: "game_chat", gameId: gid, text: text }));
      inp.value = "";
    });
  }

  // First-screen fit (lab1 seat 2026-08-13, chat first-row clip): with no user-chosen
  // split, the 3-line welcome message overflows the ~120px default dock by a few px and
  // bottom-anchoring slices its top line mid-glyph — on the opening screen that reads
  // as a rendering bug, not a scrolled chat. Once, at the first non-empty render, grow
  // the dock just enough to fit the opening rows (≤3 — a longer history IS a scrolled
  // chat and keeps the default) up to the drag limits. A user-dragged split (saved)
  // always wins; autoFitB feeds syncDock so later passes don't fight the fit.
  var autoFitB = 0, autoFitDone = false;
  function autoFitDock() {
    if (autoFitDone) return;
    var d = document.getElementById("boardChatDock");
    var list = d && !d.classList.contains("kchat-dock--side") && d.querySelector(".kchat-dock-list");
    if (!list) return;
    var rows = list.querySelectorAll(".kchat-row").length;
    if (!rows) return;
    autoFitDone = true;
    var saved = 0;
    try { saved = +(localStorage.getItem("katomiaChatSplit") || 0); } catch (e) {}
    if (saved || rows > 3) return;
    var overflow = list.scrollHeight - list.clientHeight;
    if (overflow <= 0) return;
    var cur = d.getBoundingClientRect().height;
    autoFitB = Math.min(dockLimits().max, Math.ceil((cur + overflow) / 10) * 10);
    syncDock();
  }

  function syncDock() {
    document.body.dataset.kchatMode = chatMode();
    var on = chatMode() === "panel";
    // VIEW-MSGS2: the messages view is this dock at full height, in either chat mode
    var full = document.body.classList.contains("kchat-fullopen");
    var d = document.getElementById("boardChatDock");
    if ((on || full) && !d) {
      d = document.createElement("div");
      d.id = "boardChatDock";
      d.className = "kchat-dock";
      // BOARD-CHATSEND1 (user 2026-08-03): the first in-game chat input — plain text,
      // broadcast to the group (game_chat, the same action the demo bots use). WHO MAY
      // SEND is the server's call and is already enforced there: spectators get the
      // action-refused message; being an eligible PLAYER is enough (no account needs
      // adding — "get permission to play, don't add the account, and commentate").
      // @mention bumping is logged on BOARD-CHATLAYOUT1, not built.
      // R5 (feedback 08568c88): a grab bar on the dock's top edge — drag up/down
      // to trade message space against board space. Portrait only (the side
      // panel keeps its width logic); the chosen height persists per device.
      d.innerHTML = '<div class="kchat-drag" title="Drag to resize messages"></div>'
        + '<div class="kchat-dock-list"></div>'
        + '<form class="kchat-send" autocomplete="off">'
        + '<input type="text" maxlength="280" placeholder="Message the table…" aria-label="Message">'
        + '<button type="submit" title="Send">➤</button></form>';
      var drag = d.querySelector(".kchat-drag");
      // BOARD-CTRLBAR-DRAG1: the drag core, shared by the grab bar (claims the
      // gesture at pointerdown, as before) and the control bar's blank space
      // (claims only after vertical intent — see the delegated starter below).
      // startY is the claim point so the split tracks the finger, not the jump.
      // VIEW-SNAP2 (owner 2026-10-09, second pass): the split follows the finger from ANY of the
      // three views — "once it's at an extreme you should be able to drag it back, it shouldn't
      // just jump". opts.startB is where the dock starts (0 from the board alone, the full
      // height from messages alone); the view is already switched to the split by the caller.
      // Listeners are on the WINDOW, keyed by pointer: the bar is rebuilt by every render, so a
      // listener on it (the old capEl) went deaf the moment a render landed mid-drag.
      var startSplitDrag = function (e, capEl, startY, opts) {
        opts = opts || {};
        try { capEl.setPointerCapture && capEl.setPointerCapture(e.pointerId); } catch (e0) {}
        if (startY == null) startY = e.clientY;
        var root = document.documentElement, pid = e.pointerId;
        // dock looked up fresh — the delegated starter below outlives d's closure
        // (the dock is torn down and rebuilt when chat mode toggles)
        var dockNow = document.getElementById("boardChatDock") || d;
        var cur = parseInt(getComputedStyle(root).getPropertyValue("--kchat-clear-b")) || dockNow.getBoundingClientRect().height;
        var startB = opts.startB != null ? opts.startB : cur;
        var lim = dockLimits();
        var saved = 0;
        try { saved = +(localStorage.getItem("katomiaChatSplit") || 0); } catch (e1) {}
        var keep = Math.round(Math.max(lim.min, Math.min(lim.max, saved || cur || lim.def)));
        // BOARD-SPLITDRAG1 (user 2026-08-06): while the divider moves, the BOARD
        // MUST NOT RESIZE. It used to yield live — "the whole board scales down
        // and then it redraws to go big again… it squashes everything up and
        // grows bigger again, which is weird". The dock simply grows OVER the
        // board during the drag ("you're just covering it up"), and the board
        // re-solves once, at rest. --kchat-clear-b0 pins the board's bottom to
        // where it was when the drag started; the CSS override reads it.
        root.style.setProperty("--kchat-clear-b0", (opts.from === "board" ? 0 : opts.from === "messages" ? keep : startB) + "px");
        root.style.setProperty("--kchat-clear-b", Math.round(startB) + "px");
        document.body.classList.add("kchat-dragging");
        // VIEW-SNAP1/2: below the dock's floor the drag has no effect — letting go there closes
        // the messages (the board alone), "the same as if you were trying to close it"; far
        // enough past the ceiling it opens messages alone. In between, a split at that height.
        var bar = barNow();
        var avail = Math.max(lim.max, innerHeight - (bar ? bar.getBoundingClientRect().height : 40));
        var raw = startB, snap = null;
        var move = function (ev) {
          if (ev.pointerId !== pid) return;
          raw = startB + (startY - ev.clientY);
          snap = raw < lim.min ? "board" : raw > lim.max + (avail - lim.max) * 0.5 ? "messages" : null;
          document.body.classList.toggle("kchat-snap-board", snap === "board");
          document.body.classList.toggle("kchat-snap-messages", snap === "messages");
          root.style.setProperty("--kchat-clear-b", Math.round(Math.max(0, Math.min(avail, raw))) + "px");
        };
        var up = function (ev) {
          if (ev.pointerId !== pid) return;
          removeEventListener("pointermove", move);
          removeEventListener("pointerup", up);
          removeEventListener("pointercancel", up);
          document.body.classList.remove("kchat-dragging", "kchat-snap-board", "kchat-snap-messages");   // BOARD-SPLITDRAG1: board yields again, then re-solves below
          if (snap && typeof boardSetView === "function") {
            // the split you had is kept for the way back; the view takes over
            root.style.setProperty("--kchat-clear-b", keep + "px");
            boardSetView(snap);
            return;
          }
          var b = Math.round(Math.max(lim.min, Math.min(lim.max, raw)));
          root.style.setProperty("--kchat-clear-b", b + "px");
          try { localStorage.setItem("katomiaChatSplit", String(b)); } catch (e2) {}
          // one geometry re-solve at rest — dragging only moves the CSS var
          if (typeof render === "function") setTimeout(function () { try { render(); } catch (e3) {} }, 0);
        };
        addEventListener("pointermove", move);
        addEventListener("pointerup", up);
        addEventListener("pointercancel", up);
      };
      // BOARD-SIDEDRAG1 (user 2026-09-04: "on proposal mode we also should be able to
      // drag the split width"). Portrait keeps the height drag; landscape's side panel
      // now drags its WIDTH, saved under the same key order mode uses (katomiaChatSplitW)
      // so one choice follows the user between the two modes.
      var startWidthDrag = function (e, capEl) {
        capEl.setPointerCapture && capEl.setPointerCapture(e.pointerId);
        var startX = e.clientX;
        var dockNow = document.getElementById("boardChatDock") || d;
        var startW = dockNow.getBoundingClientRect().width;
        var lim = sideLimits();
        document.body.classList.add("kchat-dragging");
        // VIEW-SNAP1: the side panel snaps the same way — narrower than half its floor is the
        // board alone, past halfway from its ceiling to the screen edge is messages alone
        var snap = null, keepW = Math.round(Math.max(lim.min, Math.min(lim.max, startW)));
        var move = function (ev) {
          var raw = startW + (startX - ev.clientX);
          snap = raw < lim.min * 0.5 ? "board" : raw > lim.max + (innerWidth - lim.max) * 0.5 ? "messages" : null;
          var w = Math.max(lim.min, Math.min(lim.max, raw));
          sideW = Math.round(w);
          dockNow.style.width = sideW + "px";
          document.documentElement.style.setProperty("--kchat-clear-r", sideW + "px");
        };
        var up = function () {
          capEl.removeEventListener("pointermove", move);
          capEl.removeEventListener("pointerup", up);
          capEl.removeEventListener("pointercancel", up);
          document.body.classList.remove("kchat-dragging");
          if (snap && typeof boardSetView === "function") { sideW = keepW; boardSetView(snap); return; }
          try { localStorage.setItem("katomiaChatSplitW", String(sideW)); } catch (e2) {}
          if (typeof render === "function") setTimeout(function () { try { render(); } catch (e3) {} }, 0);
        };
        capEl.addEventListener("pointermove", move);
        capEl.addEventListener("pointerup", up);
        capEl.addEventListener("pointercancel", up);
      };
      drag.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        if (d.classList.contains("kchat-dock--side")) startWidthDrag(e, drag);
        else startSplitDrag(e, drag);
      });
      // BOARD-CTRLBAR-DRAG1 (feedback 44050cee): "extend that gesture to include
      // any blank area of the control bar… provided it doesn't conflict with
      // tapping sign". Delegated (the footer is rebuilt every render) and
      // vertical-intent gated: a touch on blank bar space claims the split drag
      // only once it has moved ≥8px predominantly vertically — taps on Lock /
      // account select / ▶ never enter here (interactive targets are excluded at
      // pointerdown), and horizontal swipes stay the bar's native overflow-x pan
      // (CSS touch-action: pan-x keeps those events native on touch).
      if (!window.__kbarDragInit) {
        window.__kbarDragInit = true;
        document.addEventListener("pointerdown", function (e) {
          // VIEW-SNAP2: the grip is the BAR — the players' control bar, or for a spectator the
          // "You're watching" ribbon that stands in for it — in every view, and nothing else
          // (the dock's own line below it is gone: one handle, one place).
          var bar = e.target.closest(".ring-footer, .kspec-ribbon");
          if (!bar) return;
          if (e.target.closest("button, input, select, textarea, a, label, [role=button]")) return;
          // VIEW-SNAP1: a mouse drag on the bar's blank space must not start a text selection —
          // it did, and the NEXT drag then picked that selection up as a native drag-and-drop,
          // which cancels the pointer mid-gesture (desktop only; touch never selects here)
          if (e.pointerType === "mouse") { e.preventDefault(); window.getSelection && window.getSelection().removeAllRanges(); }
          var dock = document.getElementById("boardChatDock");
          // the view the drag starts from (the dock element outlives a switch to the board
          // alone — it is only hidden — so the view is read from the chat mode)
          var full = document.body.classList.contains("kchat-fullopen");
          var from = full ? "messages" : (document.body.dataset.kchatMode !== "panel" ? "board" : "split");
          if (from === "split" && (!dock || dock.classList.contains("kchat-dock--side"))) return;
          if (from !== "split" && innerWidth > innerHeight && innerWidth > 700) return;   // landscape: the side panel's edge is its grip
          var sx = e.clientX, sy = e.clientY, pid = e.pointerId;
          var probe = function (ev) {
            if (ev.pointerId !== pid) return;
            var dx = ev.clientX - sx, dy = ev.clientY - sy;
            if (Math.abs(dy) >= 8 && Math.abs(dy) > Math.abs(dx)) {
              cleanup();
              if (from === "split") { startSplitDrag(ev, bar, sy); return; }
              // from an extreme: become the split NOW, at the finger, and keep following it
              var startB = from === "board" ? 0 : Math.max(0, innerHeight - bar.getBoundingClientRect().height);
              if (typeof boardSetView === "function") boardSetView("split");
              startSplitDrag(ev, bar, sy, { from: from, startB: startB });
            }
            else if (Math.abs(dx) >= 12) cleanup();   // horizontal — the bar's own scroll, not ours
          };
          var cleanup = function () {
            document.removeEventListener("pointermove", probe);
            document.removeEventListener("pointerup", cleanup);
            document.removeEventListener("pointercancel", cleanup);
          };
          document.addEventListener("pointermove", probe);
          document.addEventListener("pointerup", cleanup);
          document.addEventListener("pointercancel", cleanup);
        });
      }
      wireChatSend(d.querySelector(".kchat-send"));
      // CHAT-COMMITGATE1 (user 2026-08-05): a chat refused for missing commitment
      // used to be silently LOST with no path to the fix. On the backend's
      // chat-identity refusal: put the text back in the box and open the
      // authenticate modal (one wallet signature) with the resend explained.
      if (!window.__kchatGateInit) {
        window.__kchatGateInit = true;
        document.addEventListener("katomia:gamemsg", function (e) {
          var m = e.detail;
          if (!m || m.code !== "chat-identity") return;
          var last = window.__kchatLastSent;
          // refill the send box (one box since VIEW-MSGS2 — the dock's, in every view)
          var inp2 = document.querySelector("#boardChatDock .kchat-send input");
          if (inp2 && last && Date.now() - last.ts < 15000 && !inp2.value) inp2.value = last.text;
          if (window.katomiaAuthenticateModal) window.katomiaAuthenticateModal.open({
            message: "Your message wasn't sent — messaging needs a verified account. Authenticate with one wallet signature; your message is back in the box, just hit send again after.",
            onDone: function () { try { if (inp2) inp2.focus(); } catch (e2) {} }
          });
        });
      }
      document.body.appendChild(d);
    }
    // R2 (user 2026-08-03, seeing v1 live): the dock is a SIDE panel on landscape —
    // full height, right-hand edge, ~quarter width — and a bottom slice on portrait.
    // Either way the BOARD YIELDS the space ("it shouldn't be covering up the board")
    // via the --kchat-clear-* vars that #boardRoot's panel-mode override consumes.
    var side = on && innerWidth > innerHeight && innerWidth >= 700;
    var clearB = 0, clearR = 0;
    if (d) {
      d.style.display = (on || full) ? "" : "none";
      d.classList.toggle("kchat-dock--side", side);
      if (on) {
        if (side) {
          // BOARD-DESKRATIO1 (user 2026-08-04): the board column caps at 5:4
          // (width : height) and may COLLAPSE TO SQUARE before the circle ever
          // shrinks — the old quarter-width panel left the board "quite wide,
          // wasting board space" while action rows wrapped in a squashed panel.
          // The panel takes everything past the board's 5:4 cap, prefers ~420px
          // (one-line action rows) by squeezing the board down toward square,
          // and never dips below 250px. Capped at 560px so an ultrawide gives
          // the excess back to the board margins, not an absurd chat column.
          var minBoard = Math.min(innerHeight, innerWidth - 250);       // square, if it fits
          var maxBoard = Math.round(innerHeight * 1.25);                // the 5:4 cap
          var boardW = Math.max(minBoard, Math.min(innerWidth - 420, maxBoard));
          clearR = Math.min(560, Math.max(250, innerWidth - boardW));
          // BOARD-SIDEDRAG1: a width the user dragged wins over the computed default
          var savedW = 0;
          try { savedW = +(localStorage.getItem("katomiaChatSplitW") || 0); } catch (e) {}
          if (savedW) { var sl = sideLimits(); clearR = Math.max(sl.min, Math.min(sl.max, savedW)); }
          sideW = clearR;
          d.style.width = clearR + "px";
          d.style.bottom = "0px";
          d.style.height = "";        // side variant sizes via CSS (top/bottom pinned)
        } else {
          d.style.width = "";
          // R4 (user 2026-08-03): SQUARE CARVE — board on top, its own bottom bars at
          // the foot of the board, messages below: board → board footer → messages.
          // R5 (feedback 08568c88, user 2026-08-05): the board is TALLER than square
          // now — it takes everything the messages don't, capped at 4:5 (w:h, the
          // portrait mirror of desktop's 5:4 BOARD-DESKRATIO1 cap). The ring stays a
          // circle (width-bound); the extra height is outside-ring room for the top
          // and bottom players. Messages default to ~3 rows + the send box, and the
          // drag bar (kchat-drag above) lets the user move the split; their choice
          // persists (localStorage katomiaChatSplit) and wins within the limits.
          var lim = dockLimits();
          var saved = +(localStorage.getItem("katomiaChatSplit") || 0);
          clearB = Math.round(Math.max(lim.min, Math.min(lim.max, saved || autoFitB || lim.def)));
          d.style.bottom = "0px";
          // height comes from the SAME --kchat-clear-b var the board yields (CSS), so
          // the pair can never disagree by a measurement race
          d.style.height = "";
        }
      }
    }
    if (full) fitFull();
    var rootStyle = document.documentElement.style;
    // snap to a 10px grid: the bar-height measurements wobble a few px between passes
    // (ribbon appearing, safe-area padding) and would otherwise churn the var
    clearB = Math.round(clearB / 10) * 10;
    var wantB = clearB + "px", wantR = clearR + "px";
    if (rootStyle.getPropertyValue("--kchat-clear-b") !== wantB ||
        rootStyle.getPropertyValue("--kchat-clear-r") !== wantR) {
      rootStyle.setProperty("--kchat-clear-b", wantB);
      rootStyle.setProperty("--kchat-clear-r", wantR);
      // the board must re-solve its geometry for the smaller box. Deferred + guarded:
      // render() calls back into syncDock, but the vars are unchanged on that pass,
      // so this fires exactly once per real change.
      if (typeof render === "function") setTimeout(function () { try { render(); } catch (e) {} }, 0);
    }
    return d;
  }

  function setMode(m) {
    if (m === "panel") live.slice().forEach(retire);   // bubbles leave when the panel takes over
    syncDock();
    var st = (typeof state !== "undefined" && state) || null;
    if (st && Array.isArray(st.chat)) renderLog(st.chat);
  }

  function colourFor(playerId) {
    // Reuse the board's own player colours so a bubble matches its wedge. If the board
    // hasn't defined one (non-ring view), fall through to the CSS default.
    try {
      if (typeof getPlayerColour === "function") return getPlayerColour(playerId);
    } catch (e) {}
    return null;
  }

  function renderLog(chat) {
    // system entries ride along, ordered by time.
    // SIGN-STRIKEMSG1 R3: the backend persists the ✅/⌛ tx verdict into game.chat —
    // once that row is in the broadcast state, the instant local echo (tagged with its
    // txid by boardShowResult) retires so the verdict shows exactly once. Only rows
    // that LEAD with the verdict emoji count: strike rows also carry the txid in
    // their text and must not suppress a verdict still in flight.
    if (systemMsgs.length) {
      var verdictRows = chat.filter(function (m) { return m.system && /^[✅⌛]/.test(m.text || ""); });
      var sys = !verdictRows.length ? systemMsgs : systemMsgs.filter(function (s) {
        return !(s.txid && verdictRows.some(function (m) {
          return (m.linkText || "").indexOf(s.txid) >= 0 || (m.text || "").indexOf(s.txid) >= 0;
        }));
      });
      if (sys.length)
        chat = chat.concat(sys).sort(function (a, b) { return new Date(a.ts) - new Date(b.ts); });
    }
    var p = panel();
    var count = p && p.querySelector(".kchat-panel-count");
    if (count) count.textContent = chat.length ? String(chat.length) : "";
    // BOARD-CHAT1 R2: the desktop panel and the dock (split AND messages views, VIEW-MSGS2)
    // get the same rows; CSS decides which one the device can see.
    renderInto(p && p.querySelector(".kchat-panel-list"), chat);
    renderInto(document.querySelector("#boardChatDock .kchat-dock-list"), chat);
    autoFitDock();
  }

  /* ── BOARD-ACTIONMSG1 action rendering (user 2026-08-04) ───────────────────
     The backend now sends {v:1, kind, actor, from, to, assetId, amount, ts}
     alongside the prose comment (katomiaHelpers.js → Ctx.act). Identity arrives
     as PUBLIC ids and everything displayable — account label, verified marker,
     player colour, asset name — is resolved HERE from live state, so a row can
     never show a stale label the message happened to be built with.

     FORMAT DISCIPLINE, inherited from DEMO-NARRATE1 and restated in the doc: we
     render only what we recognise. An unknown v or kind falls back to the
     prose, which is exactly why the user asked for it to keep being sent. */

  var ACTION_VERBS = {
    offer:    { verb: "offers",     joiner: "→" },
    pick:     { verb: "picked",     joiner: "from" },
    withdraw: { verb: "took back",  joiner: "from" },
    reject:   { verb: "returned",   joiner: "to" },
    lock:     { verb: "locked",     solo: true },
    unlock:   { verb: "unlocked",   solo: true },
    sign:     { verb: "signed",     solo: true },  // R3: subject + "signed", no green tick
    // PROP-TICKETS1 (user 2026-08-21): ticket moves were silent here. A ticket
    // names TWO sides, so these use `pair` — give chips, "for", want chips —
    // rather than the single-asset shape the other verbs share.
    ticketPost:   { verb: "priced",         pair: true },
    ticketTake:   { verb: "took the ticket", pair: true, joiner: "from" },
    ticketTearUp: { verb: "tore up the ticket for", pair: "giveOnly" }
  };

  function actionRenderable(a) {
    return !!(a && a.v === 1 && ACTION_VERBS[a.kind]);
  }

  // BOARD-ACTIONMSG1 R2 (user 2026-08-04): the SUBJECT of an action row is the
  // ACCOUNT the action concerns — never the player's canonical/bound account.
  // A player's verified account must not lend its verification stamp to an
  // action performed on a DIFFERENT, unverified account; and for lock/unlock
  // it is the account that locks, not one account locking another. The
  // canonical-account rule survives only for SPEECH, where no account is the
  // subject (see who()).
  function actionSubject(a) {
    switch (a.kind) {
      case "offer":                       // the account the asset leaves
      case "withdraw": return a.from;     // the account taking it back
      case "reject":   return a.to;       // the basket account handing it back
      case "pick":     return a.to;       // the account doing the shopping
      case "lock":
      case "unlock":                      // the account changing mode
      case "sign":     return a.account;  // the account whose key signed (R3)
      case "ticketPost":
      case "ticketTearUp": return a.account;  // the stall the ticket sits on
      case "ticketTake":   return a.to;       // the account doing the taking
    }
    return null;
  }

  function accountObj(publicId) {
    try { return (state && state.accounts && state.accounts[publicId]) || null; } catch (e) { return null; }
  }
  function accountLabel(publicId) {
    var a = accountObj(publicId);
    return (a && (a.label || a.accountId)) || String(publicId || "").split(":")[1] || String(publicId || "");
  }
  // 🔷 verified / △ not — only on networks where binding means something, the
  // same gate the board's ringBindBadge uses (playnet shows neither).
  function verifyMark(publicId) {
    var net = "";
    try { net = (typeof gameMeta !== "undefined" && gameMeta && gameMeta.network) || ""; } catch (e) {}
    if (net !== "testnet" && net !== "mainnet") return null;
    var a = accountObj(publicId);
    return a && a.authBound ? "\u{1F537}" : "△";
  }
  // Feedback 01a1ed32: account ids link out for more info — HashScan for now
  // (the link target may change; one helper, one place to change it).
  // BOARD-OFFERASSOC1 (user 2026-08-18, follow-on from BOARD-ASSOCWARN1): the signing
  // phase now says why an arc is red, but the receiver should hear about a missing
  // association WHEN THE OFFER LANDS, not at signing. Deliberately NOT a warning —
  // "during proposal mode it's not a warning because no one has locked, so there's no
  // timing pressure" — just a muted "(not yet associated)" suffix on the offer row.
  // Nerd-UI placeholder by the user's own call; a friendlier treatment (and maybe an
  // inline associate affordance) is the enrichment to do later. Association is
  // per token CLASS, so NFT serials strip to their collection id first.
  // Answered by the mirror node (same per-network bases as boardConfirmTxFromChain);
  // cached per account|token for the session — "not YET associated" wording covers
  // the receiver associating later without us re-checking every paint. Unknown
  // (fetch failed / playnet / non-token) stays silent: never claim what we didn't see.
  var _assocCache = {};
  function appendAssocHint(host, publicId, assetId) {
    var net = "";
    try { net = (typeof gameMeta !== "undefined" && gameMeta && gameMeta.network) || ""; } catch (e) {}
    if (net !== "testnet" && net !== "mainnet") return;
    var token = String(assetId || "").split("#")[0];
    if (!/^0\.0\.\d+$/.test(token)) return;              // hbar / playnet assets: no association concept
    var acct = accountObj(publicId);
    var hedId = (acct && acct.accountId) || String(publicId || "").split(":")[1] || "";
    if (!/^0\.0\.\d+$/.test(hedId)) return;
    var key = net + "|" + hedId + "|" + token;
    if (!(key in _assocCache)) {
      var mirror = net === "mainnet" ? "https://mainnet-public.mirrornode.hedera.com"
                                     : "https://" + net + ".mirrornode.hedera.com";
      _assocCache[key] = fetch(mirror + "/api/v1/accounts/" + hedId + "/tokens?token.id=" + token + "&limit=1")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j ? !!(j.tokens && j.tokens.length) : null; })
        .catch(function () { return null; });
    }
    var el = document.createElement("span");
    el.className = "kchat-act-assoc";
    host.appendChild(el);
    _assocCache[key].then(function (assoc) {
      if (assoc === false) el.textContent = " (not yet associated)";
    });
  }
  function acctLinkEl(label) {
    var net = (typeof gameMeta !== "undefined" && gameMeta && gameMeta.network) || "";
    if ((net === "mainnet" || net === "testnet") && /^0\.0\.\d+$/.test(label)) {
      var a = document.createElement("a");
      a.href = "https://hashscan.io/" + net + "/account/" + label;
      a.target = "_blank"; a.rel = "noopener noreferrer";
      a.className = "kchat-acct-link";
      a.textContent = label;
      return a;
    }
    return document.createTextNode(label);
  }
  function appendAccount(host, publicId) {
    var el = document.createElement("span");
    el.className = "kchat-act-acct";
    el.appendChild(acctLinkEl(accountLabel(publicId)));
    var mk = verifyMark(publicId);
    if (mk) {
      var m = document.createElement("span");
      m.className = "kchat-act-mark" + (mk === "△" ? " kchat-act-mark--un" : "");
      m.textContent = mk;
      el.appendChild(document.createTextNode(" "));
      el.appendChild(m);
    }
    host.appendChild(el);
  }
  // R2: the marker for a SPECIFIC account — the action's subject wears its own
  // verification state, nobody else's (the R1 version looked up the player's
  // best bound account, which is exactly the stamp-borrowing the user vetoed)
  function appendMarkFor(host, publicId) {
    var mk = verifyMark(publicId);
    if (!mk) return;
    var m = document.createElement("span");
    m.className = "kchat-act-mark" + (mk === "△" ? " kchat-act-mark--un" : "");
    m.textContent = " " + mk;
    host.appendChild(m);
  }
  // the asset as a mini CHIP — same object, same look as on the felt: the
  // giver's colour on the sleeve, the amount inside it rather than in the
  // sentence (the doc's open question, settled that way for exactly this
  // reason — the chip on the board reads "10 USDC" too)
  function appendAssetChip(host, a) {
    var chip = document.createElement("span");
    chip.className = "kchat-act-chip";
    var owner = accountObj(a.from);
    var colour = owner ? colourFor(owner.playerId) : null;
    if (colour) chip.style.borderLeftColor = colour;
    var text = String(a.assetId || "");
    try {
      if (typeof boardAssetText === "function") text = boardAssetText(a.assetId, a.amount || 1);
    } catch (e) {}
    chip.textContent = text;
    host.appendChild(chip);
  }
  // one chip per leg, "+" between them — a ticket may name several either side
  function appendLegChips(host, legs, ownerId) {
    (legs || []).forEach(function (l, i) {
      if (i) { appendWord(host, "+"); host.appendChild(document.createTextNode(" ")); }
      appendAssetChip(host, { assetId: l.assetId, amount: l.amount, from: ownerId });
      host.appendChild(document.createTextNode(" "));
    });
  }
  function appendWord(host, w) {
    var s = document.createElement("span");
    s.className = "kchat-act-verb";
    s.textContent = w;
    host.appendChild(s);
  }

  function renderActionText(host, a) {
    var spec = ACTION_VERBS[a.kind];
    if (!spec) return;
    // Feedback 01a1ed32 (user 2026-08-05): the verb + asset + joiner + account is
    // ONE meaningful chunk — inline-block moves the whole phrase to the next line
    // when it fits there, instead of stranding "→ 0.0.x" alone on line two.
    var ph = document.createElement("span");
    ph.className = "kchat-act-phrase";
    host.appendChild(ph);
    appendWord(ph, spec.verb);
    ph.appendChild(document.createTextNode(" "));
    if (spec.solo) {
      // lock / unlock (R2): the subject account is already the row's sender —
      // repeating it here read as one account locking ANOTHER. The doc's
      // wording was right all along: "<account> locked their side 🔒".
      if (a.kind === "lock") appendWord(ph, "their side \u{1F512}");
      return;
    }
    // PROP-TICKETS1: a ticket has two sides, so it renders as
    // "<verb> <give chips> for <want chips> [from <account>]"
    if (spec.pair) {
      appendLegChips(ph, a.gives, a.from || a.account);
      if (spec.pair !== "giveOnly") {
        appendWord(ph, "for");
        ph.appendChild(document.createTextNode(" "));
        appendLegChips(ph, a.wants, a.to || a.account);
      }
      if (spec.joiner) {
        appendWord(ph, spec.joiner);
        ph.appendChild(document.createTextNode(" "));
        appendAccount(ph, a.from);
      }
      return;
    }
    appendAssetChip(ph, a);
    ph.appendChild(document.createTextNode(" "));
    appendWord(ph, spec.joiner);
    ph.appendChild(document.createTextNode(" "));
    // who the OTHER end is depends on which way the asset travelled
    appendAccount(ph, a.kind === "offer" ? a.to
                      : a.kind === "reject" ? a.from
                      : a.kind === "pick" ? a.from
                      : a.to);
    // BOARD-OFFERASSOC1: "(not yet associated)" after the receiving account
    if (a.kind === "offer") appendAssocHint(ph, a.to, a.assetId);
    // hovering the row lights the same pair on the board — the chips already
    // carry this exact triple, so no board change was needed (doc §5)
    if (a.from && a.to && a.assetId) {
      host.dataset.actFrom = a.from;
      host.dataset.actTo = a.to;
      host.dataset.actAsset = a.assetId;
    }
  }

  // action rows arriving off the wire — merged into the same local stream the
  // toasts use. NOT persisted server-side (the actions ride the message pool,
  // not game.chat), so this is a live feed, same lifetime as a toast.
  function action(msg) {
    if (!actionRenderable(msg && msg.action)) return false;
    systemMsgs.push({
      id: "act" + (++_sysN),
      ts: msg.action.ts || Date.now(),
      text: msg.message || "",
      action: msg.action,
      playerId: msg.action.actor
    });
    if (systemMsgs.length > 100) systemMsgs.shift();
    pulseAvatar(msg.action.actor);           // the actor's wedge avatar swells
    var st = (typeof state !== "undefined" && state) || null;
    renderLog((st && Array.isArray(st.chat)) ? st.chat : []);   // renderLog folds systemMsgs in
    return true;
  }

  function renderInto(list, chat) {
    if (!list) return;
    // Pinned-to-bottom is now a TRACKED state, not a measurement (user 2026-08-05:
    // "messages appearing off screen, not scrolling to the bottom"). Measuring at
    // render time broke under the smooth glide: a render landing MID-GLIDE saw the
    // scroll far from the bottom and concluded the reader had scrolled up — then
    // never followed again. Only USER scroll gestures (wheel/touch, 800ms window)
    // change pinnedness; programmatic scrolls can't unpin.
    if (!list._kpinInit) {
      list._kpinInit = true;
      list._kpinned = true;
      var mark = function () { list._kuser = Date.now(); };
      list.addEventListener("wheel", mark, { passive: true });
      list.addEventListener("touchmove", mark, { passive: true });
      list.addEventListener("scroll", function () {
        if (Date.now() - (list._kuser || 0) > 800) return;   // programmatic — ignore
        list._kpinned = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      }, { passive: true });
    }
    var atBottom = list._kpinned !== false;
    // BOARD-MSGANIM1 (feedback f8a34f4c, user 2026-08-05): new messages animate
    // into place instead of popping. The list is rebuilt wholesale each render,
    // so "new" = rows past the UNTRIMMED chat length this list saw last time
    // (untrimmed so the cap-full list keeps animating); recreated old rows
    // appear instantly. First render (backfill) animates nothing.
    var prevTotal = +(list.dataset.kcount || 0);
    var prevScroll = list.scrollTop;
    list.innerHTML = "";
    if (!chat.length) {
      var e = document.createElement("div");
      e.className = "kchat-full-empty";
      e.textContent = "No messages yet.";
      list.appendChild(e);
      return;
    }
    var shown = Math.min(chat.length, MAX_LOG);
    chat.slice(-MAX_LOG).forEach(function (m, idx) {
      // Row anatomy R2 (user 2026-08-03): full-height colour BAR (not a dot — same
      // ownership cue as chip sleeves and bubble bars), the player's AVATAR on their
      // colour (the fruit emoji is gone from display names everywhere), then bold
      // name + time + the text INLINE, wrapping — compact, chat-app familiar.
      // BOARD-ACTIONMSG1: a THIRD row variant. `system` (🤖 Katomia, gold bar) is
      // the machine talking; an ACTION is a player doing something, so it keeps
      // the actor's colour and avatar exactly like their speech — the difference
      // is carried by the wording, not by demoting them to a system notice.
      var row = document.createElement("div");
      row.className = "kchat-row" + (m.system ? " kchat-row--sys" : "")
        + (m.action ? " kchat-row--act" : "");
      var c = m.action ? colourFor(m.action.actor) : (m.system ? null : colourFor(m.playerId));
      var t = new Date(m.ts);
      var hh = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      // CHAT-DATE1 (2026-09-30): the feed persists across days (circles are saved and
      // reloaded), so a row from three nights ago read as "21:13" beside today's — the
      // owner asked whether it was from today. A row not from today carries its date.
      var today = new Date();
      if (t.getFullYear() !== today.getFullYear() || t.getMonth() !== today.getMonth() || t.getDate() !== today.getDate()) {
        hh = t.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " " + hh;
      }
      var bar = document.createElement("span");
      bar.className = "kchat-row-bar";
      if (c) bar.style.background = c;
      row.appendChild(bar);
      if (m.action) {
        if (typeof kemojiEl === "function")
          row.appendChild(kemojiEl(avatarKey(m.action.actor), { size: 16, bg: c }));
      } else if (m.system) {
        // CHAT-WELCOME1 R2: a system row now says WHO is speaking. `speaker:"host"` is the
        // circle's organizer talking through Katomia's machinery (their own configured
        // copy); anything else — including every pre-existing system row, which carries no
        // speaker at all — is Katomia itself. Never label organizer-written words as
        // Katomia: a circle can be created by anyone and say anything.
        var bot = document.createElement("span");
        bot.className = "kchat-sys-emoji";
        // KATO-PERSONA1 (user 2026-08-21): Kato rows drop the generic 🤖 for the
        // brand ring — a simplified inline copy of assets/katomia-ring.svg (the
        // TABTITLE1 favicon donut), so the official voice is visually distinct
        // from any future bot at a glance, not just by name. The row also gets
        // a .kchat-row--kato tint below. Host rows keep the 🎪 tent. Inline SVG
        // (no asset path — the /board/<id> rewrite makes relative paths route-
        // dependent, the BOARD-CLEANUP3 trap). aria-hidden: "Kato" is already
        // the row's visible speaker text.
        if (m.speaker === "host") bot.textContent = "🎪";
        else {
          bot.innerHTML =
            '<svg viewBox="0 0 64 64" width="15" height="15" aria-hidden="true" style="display:block">' +
            '<g fill="none" stroke-width="11">' +
            '<path d="M32 10A22 22 0 0 1 51 21" stroke="#f0754c"/>' +
            '<path d="M51 21A22 22 0 0 1 51 43" stroke="#c7f04c"/>' +
            '<path d="M51 43A22 22 0 0 1 32 54" stroke="#4cf09e"/>' +
            '<path d="M32 54A22 22 0 0 1 13 43" stroke="#4c9ef0"/>' +
            '<path d="M13 43A22 22 0 0 1 13 21" stroke="#9e4cf0"/>' +
            '<path d="M13 21A22 22 0 0 1 32 10" stroke="#f04c9e"/>' +
            '</g></svg>';
          row.classList.add("kchat-row--kato");
        }
        row.appendChild(bot);
      } else if (typeof kemojiEl === "function") {
        row.appendChild(kemojiEl(avatarKey(m.playerId), { size: 16, bg: c }));
      }
      var main = document.createElement("span");
      main.className = "kchat-row-main";
      var nm = document.createElement("b");
      // BOARD-ACTIONMSG1 R2 (user 2026-08-04): an action row's sender IS the
      // subject account — the one the action concerns — wearing that account's
      // own 🔷/△, even when the same player holds a verified account elsewhere.
      // Speech keeps the canonical-account display name (displayName → who()):
      // a typed message doesn't pertain to an account, so a default is fine
      // there — see the note on who() about the possible future player label.
      var subj = m.action ? actionSubject(m.action) : null;
      if (subj) {
        // R4 (user 2026-08-04, watching the t-duo demo): when the player HAS a
        // name (demo cast — Alice, Bob, Goodwin; the same state.players[].name
        // field speech already uses, set at join and by catrun), it reads
        // friendlier in front of the account id: "Ada 0.0.2002 🔷 offers…".
        // Web players join as "anon", so a normal game keeps the bare account
        // id — nothing here is demo-gated, names simply appear where they exist.
        var subjAcc = accountObj(subj);
        var pn = subjAcc && state && state.players && state.players[subjAcc.playerId]
          ? (state.players[subjAcc.playerId].name || null) : null;
        if (pn && pn !== "anon") pn = pn.replace(/^(?:[\p{Extended_Pictographic}️‍]|\s)+/u, "") || pn;
        // 01a1ed32: the sender's account id renders through the same .kchat-act-acct
        // styling (and HashScan link) as in-phrase ids — consistent ids everywhere
        nm.textContent = (pn && pn !== "anon" ? pn + " " : "");
        var idsp = document.createElement("span");
        idsp.className = "kchat-act-acct";
        idsp.appendChild(acctLinkEl(accountLabel(subj)));
        nm.appendChild(idsp);
        appendMarkFor(nm, subj);
      } else {
        // "Kato" (feedback b20e8fa1, 2026-08-21): Katomia is the infrastructure; KATO
        // is the resident character/educator (2023 lineage) — shorter, sayable, and a
        // clean subset of the word. Full persona (self-intro for new users, global
        // feed presence) is the KATO-PERSONA1 task; this is just the speaker label.
        nm.textContent = m.system ? (m.speaker === "host" ? "Host" : "Kato") : displayName(m);
      }
      var tm = document.createElement("i");
      tm.textContent = hh;
      var tx = document.createElement("span");
      tx.className = "kchat-row-text";
      if (m.action) renderActionText(tx, m.action);  // structured → elements
      else if (m.system) tx.textContent = m.text;    // textContent — chat is user input
      else {
        // BOARD-ACTIONMSG1: mark SPEECH, not actions — with actions expected to
        // dominate the stream, the typed message is the rarer thing and so the
        // cheaper one to flag (user's own lean, agreed in the design doc)
        var q = document.createElement("span");
        q.className = "kchat-row-say";
        q.textContent = "\u{1F4AC} ";
        tx.appendChild(q);
        tx.appendChild(document.createTextNode(m.text));
      }
      // CHAT-WELCOME1: `to` on a PLAYER message is meaningful addressing ("→ p3" tells the
      // room who you were talking to). On a SYSTEM message it is just the privacy filter
      // doing its job — you are the only one who can see the row, so "→ p3" is noise
      // telling you what you already know. Only system messages use `to` this way today.
      if (m.to && !m.system) {
        var to = document.createElement("em");
        to.className = "kchat-row-to";
        to.textContent = "→ " + m.to;
        nm.appendChild(to);
      }
      main.append(nm, " ", tm, " ", tx);
      if (m.system && m.link) {
        // the WHOLE payload (e.g. the txid) is the link, not a fiddly arrow (user 2026-08-03)
        var a2 = document.createElement("a");
        a2.href = m.link;
        // TABTARGET1 (user 2026-08-19): circle-to-circle links (KAT-BREAKOUT1's parent<->
        // child breadcrumbs, always a RELATIVE circle id) were opening a fresh "_blank" tab
        // on every click — dozens of tabs for the same circle after a few hops. Target the
        // tab by circle NAME instead (every board tab names itself window.name = <circle>,
        // katomia-core.js), so repeat clicks reuse it. R2: circle links must NOT carry
        // rel=noopener — noopener severs the browsing-context group, and named-target
        // lookup only searches within the group (verified: with it, every hop still
        // opened a new tab). Same-origin app tabs don't need opener protection; external
        // links (HashScan tx/account, feedback URL — always absolute) keep _blank+noopener:
        // each is a genuinely different destination, not a circle you'd hop back to.
        if (/^https?:\/\//i.test(m.link)) { a2.target = "_blank"; a2.rel = "noopener noreferrer"; }
        else a2.target = m.link;
        a2.textContent = m.linkText || "↗";
        main.append(" ", a2);
      }
      // BOARD-ACTIONMSG1 (doc §5): hovering an action row lights the same pair on
      // the board. Free — the chips already carry this exact triple, so this is
      // the board's own highlightTradePair with no board-side change at all.
      if (m.action && m.action.from && m.action.to && m.action.assetId
          && typeof highlightTradePair === "function") {
        var act = m.action;
        row.classList.add("kchat-row--linked");
        row.onmouseenter = function () { try { highlightTradePair(act.assetId, act.from, act.to, true); } catch (e) {} };
        row.onmouseleave = function () { try { highlightTradePair(act.assetId, act.from, act.to, false); } catch (e) {} };
      }
      row.appendChild(main);
      if (prevTotal && (chat.length - shown + idx) >= prevTotal) row.classList.add("kchat-row--in");
      list.appendChild(row);
    });
    // 01a1ed32: a wrapped (multi-line) row promotes its avatar to double height —
    // more prominent where there's more row to own. Measured post-append; a
    // hidden list measures 0 and just skips (re-applied on the next visible render).
    if (list.offsetParent) {
      for (var ri = 0; ri < list.children.length; ri++) {
        var r = list.children[ri];
        if (!r.classList || !r.classList.contains("kchat-row")) continue;
        // measure the CONTENT span, not the padded row, and derive a line height
        // even when computed line-height is "normal" (parseFloat → NaN)
        var main = r.querySelector(".kchat-row-main");
        if (!main) continue;
        var cs = getComputedStyle(main);
        var lh = parseFloat(cs.lineHeight);
        if (!lh || isNaN(lh)) lh = (parseFloat(cs.fontSize) || 13) * 1.5;
        if (main.offsetHeight > lh * 1.6) r.classList.add("kchat-row--tall");
      }
    }
    list.dataset.kcount = chat.length;
    // Scroll: restore the pre-rebuild position instantly (innerHTML wipe zeroed
    // it), then glide to the bottom so the stream visibly moves up as the new
    // row is revealed (smooth only when pinned to the bottom and something new
    // actually arrived — reader scrolled up = don't yank them).
    if (atBottom) {
      if (prevTotal && chat.length > prevTotal && list.scrollTo) {
        list.scrollTop = Math.min(prevScroll, list.scrollHeight);
        requestAnimationFrame(function () { list.scrollTo({ top: list.scrollHeight, behavior: "smooth" }); });
      } else {
        list.scrollTop = list.scrollHeight;
      }
    } else {
      list.scrollTop = prevScroll;
    }
  }

  // BOARD-CHAT1 R2: full-screen transcript for phones, opened from ☰ → 💬 Messages.
  // VIEW-MSGS1 (owner 2026-10-09, carried from lab2 KMAP2): messages is one of the three
  // VIEWS, not a modal — no Close button; the ☰ row stays on top of it, so ☰ → View switches
  // back like any other view, and the menu is NOT closed when you pick it (you toggle the
  // views to compare them). The bar (account · lock/sign) moves to the top, under the ☰ row,
  // and stays a grip: drag it down for the split (VIEW-SNAP1).
  // VIEW-MSGS2 (owner 2026-10-09, third pass: "use the normal message style when you've got
  // split screen and just make that full height. Don't introduce a new style"): messages alone
  // IS the split's dock, stretched from under the bar to the foot of the screen. It used to be a
  // separate overlay (#boardChatFull) with its own look, and its list carried .kchat-panel-list —
  // the desktop panel's class, capped at min(44vh,300px) — so the transcript stopped just past
  // half the screen, in a bigger font on a different background. Dragging the bar showed the
  // dock, which is why the view "self-corrected" the moment a drag began and went back on
  // release. One surface now: the same rows, font, background and send box in all three views.
  function openFull(on) {
    document.body.classList.toggle("kchat-fullopen", on !== false);
    syncDock();   // creates the dock if the board-alone view never had one; fitFull runs inside
    var st = (typeof state !== "undefined" && state) || null;
    if (on !== false) {
      live.slice().forEach(retire);   // no bubbles over the transcript
      if (st && Array.isArray(st.chat)) renderLog(st.chat);
      var l = document.querySelector("#boardChatDock .kchat-dock-list");
      if (l) { l._kpinned = true; l.scrollTop = l.scrollHeight; }
    }
  }
  // VIEW-SNAP2 (owner 2026-10-09): in messages alone the bar goes right to the TOP, under the ☰
  // ("the hamburger menu basically just ends up sitting on top of the drag bar") — the banner
  // lets touches through everywhere but the ☰ and its menu (katomia.css) — and the dock starts
  // below the bar. Re-measured on every syncDock (every render): the bar's height changes as
  // its contents do (an account select, Lock appearing).
  function fitFull() {
    var root = document.documentElement;
    var f = barNow();
    root.style.setProperty("--kchat-full-bar", "0px");
    root.style.setProperty("--kchat-full-top", (f ? Math.round(f.getBoundingClientRect().height) : 0) + "px");
  }
  addEventListener("resize", function () { if (document.body.classList.contains("kchat-fullopen")) fitFull(); });

  /* ── bubbles ──────────────────────────────────────────────────────────────── */
  function anchorFor(playerId) {
    var map = (typeof _boardChatAnchors !== "undefined" && _boardChatAnchors) || {};
    // A player may hold several accounts; the first is fine and is stable in join order.
    for (var id in map) if (map[id] && map[id].playerId === playerId) return map[id];
    return null;
  }

  /* BOARD-CHAT2 — one-way bubble physics (user 2026-07-30).
   *
   * "The bubbles work quite well, but on desktop where there's plenty of room they
   * could do with sitting away from the actual chips, so they're not cluttering the
   * board or covering up the chips." His proposed mechanism, and the important detail:
   * let the CHIPS influence where a bubble settles, but let the bubble have NO effect
   * on the chips — "they still place as they would, even if there were no speech
   * bubble". That asymmetry is the whole idea.
   *
   * Implemented against RECTS rather than by adding bodies to the chip sim. Same
   * one-way result, and deliberately so: putting a bubble into the sim risks
   * destabilising chip layout, which is exactly what the user said must not happen.
   * The chips here are read-only — we never write to a chip, only measure it.
   *
   * Resolution pushes the bubble RADIALLY OUTWARD from the board centre first. That is
   * the direction with room in it (chips live on the felt, the margin does not), it
   * matches "sit a little bit away", and it keeps the tail pointing sensibly back at
   * the speaker instead of the bubble drifting sideways across other players' wedges.
   *
   * Also fixes the overlap defect already recorded on this task: three concurrent
   * bubbles on a three-player board could land on each other, because clamping happens
   * per bubble with no knowledge of the others. Bubbles placed earlier in the same pass
   * are treated as obstacles too, so later ones step around them.
   */
  function obstacleRects() {
    // Chips only — read, never write. Ghosts included: covering the counter is the
    // specific complaint ("covering up the chips").
    var out = [];
    var els = document.querySelectorAll(".board-chip");
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width && r.height) out.push(r);
    }
    return out;
  }

  function overlaps(a, b, pad) {
    pad = pad || 0;
    return !(a.right + pad <= b.left || a.left - pad >= b.right ||
             a.bottom + pad <= b.top || a.top - pad >= b.bottom);
  }

  /* Nudge {l,t,w,h} outward from (cx,cy) until it clears `obs`, or we run out of room.
   * Bounded iterations — this runs on every reposition, so it must be cheap and must
   * never be able to spin. Returns the adjusted {l,t}. */
  function pushClear(box, obs, cx, cy, bounds, pad) {
    var dx = box.l + box.w / 2 - cx, dy = box.t + box.h / 2 - cy;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;          // unit vector, board centre → bubble
    var STEP = 10, MAX = 18;

    // Direction priority. Radial-out is the one we WANT — it is where the room is and
    // it keeps the tail honest. But a bubble the clamp has already pinned to the board
    // edge has no outward left, and the first cut of this gave up there and left the
    // overlap in place (measured: bubble-on-bubble fixed, one bubble-on-chip surviving).
    // So fall back to sliding ALONG the edge, which is free, before ever considering
    // moving inward over the felt.
    var dirs = [
      [ ux,  uy],                              // out
      [-uy,  ux],                              // tangential, one way
      [ uy, -ux],                              // tangential, the other
      [-ux, -uy]                               // inward — last resort, still better than sitting on a chip
    ];

    var hitCount = function (b) {
      var rect = { left: b.l, top: b.t, right: b.l + b.w, bottom: b.t + b.h };
      var n = 0;
      for (var j = 0; j < obs.length; j++) if (overlaps(rect, obs[j], pad)) n++;
      return n;
    };
    var inBounds = function (b) {
      return b.l >= bounds.l && b.l + b.w <= bounds.r && b.t >= bounds.t && b.t + b.h <= bounds.b;
    };

    var best = { l: box.l, t: box.t }, bestHits = hitCount(box);
    if (!bestHits) return box;

    for (var d = 0; d < dirs.length && bestHits; d++) {
      var cur = { l: box.l, t: box.t, w: box.w, h: box.h };
      for (var i = 0; i < MAX; i++) {
        var nxt = { l: cur.l + dirs[d][0] * STEP, t: cur.t + dirs[d][1] * STEP, w: box.w, h: box.h };
        if (!inBounds(nxt)) break;             // this direction is exhausted; try the next
        cur = nxt;
        var h = hitCount(cur);
        if (h < bestHits) { bestHits = h; best = { l: cur.l, t: cur.t }; }
        if (!h) break;                         // fully clear — take it
      }
    }
    box.l = best.l; box.t = best.t;
    return box;
  }

  function place(el, a, obs, same) {
    // Bubbles sit outside the oval at the speaker's angle. With only two players the
    // wedge midpoints land at 3 and 9 o'clock, i.e. hard against the board edges — so
    // the anchor alone is not enough: a 270px bubble centred on x=99 hangs 36px off
    // screen. Clamp the BOX into the board, then slide the TAIL to keep pointing at the
    // speaker, so the bubble stays readable without lying about who is talking.
    var deg = ((a.am * 180 / Math.PI) % 360 + 360) % 360;
    var leftSide = deg > 90 && deg < 270;
    el.classList.toggle("kchat-bub--left", leftSide);
    el.classList.toggle("kchat-bub--mine", !!a.mine);
    var o = boardOrigin();
    if (!o) return;
    var PAD = 8;
    var w = el.offsetWidth, ht = el.offsetHeight;
    if (!w) return;                             // not laid out yet — next reposition fixes it

    // board pixels -> viewport pixels, then clamp inside the board's on-screen box.
    // R2 (user 2026-07-30): the top of the board is contested — #boardBanner appears
    // there mid-deal ("Ready to submit — collecting signatures") and a bubble landed
    // underneath it. Rather than pick a magic offset, measure whatever is currently
    // occupying the top lane and start below it, so this keeps working if another
    // banner is added later.
    var vx = o.x + a.x, vy = o.y + a.y;

    // Centrifuge bias (user 2026-08-03): during SIGNING the centre of the board is
    // the story — bubbles drift outward toward the rim so the middle stays readable.
    // Mild push only; the clamp below still owns the final position.
    if (typeof boardSigning !== "undefined" && boardSigning) {
      var ccx = o.x + o.w / 2, ccy = o.y + o.h / 2;
      var odx = vx - ccx, ody = vy - ccy, olen = Math.sqrt(odx * odx + ody * ody) || 1;
      var opush = Math.min(o.w, o.h) * 0.18;
      vx += odx / olen * opush; vy += ody / olen * opush;
    }
    var topGuard = o.y + PAD;
    var bn = document.getElementById("boardBanner");
    if (bn) {
      var br = bn.getBoundingClientRect();
      if (br.height) topGuard = Math.max(topGuard, br.bottom + 8);
    }
    var wantL = vx - w / 2, wantT = vy - ht / 2;
    var l = Math.max(o.x + PAD, Math.min(wantL, o.x + o.w - w - PAD));
    var t = Math.max(topGuard, Math.min(wantT, o.y + o.h - ht - PAD));

    // BOARD-CHAT2: step outward off any chip (and off bubbles already placed this
    // pass). R3 (user 2026-08-03): the <620px skip is GONE — on a phone, opposite
    // players' bubbles land side by side and overlap, which is worse than a bounded
    // nudge fighting the clamp. pushClear keeps the best position it finds, so when
    // there is genuinely no room the bubble stays put and overlap is accepted.
    if (obs && obs.length) {
      var bounds = { l: o.x + PAD, r: o.x + o.w - PAD, t: topGuard, b: o.y + o.h - PAD };
      var box = pushClear({ l: l, t: t, w: w, h: ht }, obs,
                          o.x + o.w / 2, o.y + o.h / 2, bounds, 6);
      l = box.l; t = box.t;
      // Re-clamp: pushClear refuses out-of-bounds steps, but topGuard can move between
      // passes (the banner appearing mid-deal) so this stays honest.
      l = Math.max(bounds.l, Math.min(l, bounds.r - w));
      t = Math.max(bounds.t, Math.min(t, bounds.b - ht));
    }

    // Same-speaker stacking (user 2026-08-03): a repeat line used to land ON its
    // predecessor (same anchor), a partial inset that read as a glitch. When the new
    // box collides with the speaker's own earlier bubbles, lift it to sit ABOVE their
    // topmost one instead — a vertical thread per player. No headroom → overlap stands.
    if (same && same.length) {
      var mine = { left: l, top: t, right: l + w, bottom: t + ht };
      var minTop = Infinity, hitOwn = false;
      for (var s = 0; s < same.length; s++) {
        if (overlaps(mine, same[s], 4)) hitOwn = true;
        if (same[s].top < minTop) minTop = same[s].top;
      }
      if (hitOwn) t = Math.max(topGuard, minTop - ht - 6);
    }

    // Switch off the centring transform and position by corner, so the clamp is exact.
    el.style.setProperty("--kchat-dx", "0px");
    el.style.left = l + "px";
    el.style.top = t + "px";
    el.classList.add("kchat-bub--placed");

    // Tail placement. Historically: bottom edge, x tracking the speaker's anchor.
    // R3 (user 2026-08-03): when the board has registered an AVATAR for the speaker
    // (a.avx/avy, see ringEtchLabel), the tail instead slides around the bubble to the
    // edge point nearest the avatar and rotates to aim at it — the bubble visibly
    // comes FROM the person, not vaguely from a wedge.
    var tgx = a.avx != null ? o.x + a.avx : vx, tgy = a.avy != null ? o.y + a.avy : vy;
    var px = Math.max(l + 12, Math.min(tgx, l + w - 12));
    var py = Math.max(t + 8, Math.min(tgy, t + ht - 8));
    var dl = px - l, dr = l + w - px, dt = py - t, db = t + ht - py;
    var m = Math.min(dl, dr, dt, db);
    var edge = m === db ? "bottom" : m === dt ? "top" : m === dl ? "left" : "right";
    el.dataset.kchatTailEdge = edge;
    el.style.setProperty("--kchat-tail", Math.max(12, Math.min(px - l, w - 12)) + "px");
    el.style.setProperty("--kchat-taily", Math.max(8, Math.min(py - t, ht - 8)) + "px");
    // angle from the tail's edge point to the target; the square's protruding corner
    // sits at rotate(45deg) when aimed straight down, so offset by -45.
    var ang = Math.atan2(tgy - py, tgx - px) * 180 / Math.PI;
    el.style.setProperty("--kchat-tailrot", (ang - 45) + "deg");
  }

  function reposition() {
    // BOARD-CHAT2: measure the chips ONCE per pass, not per bubble — with a crowded
    // board and several bubbles the per-bubble query was the expensive part, and this
    // runs on every board paint. Each bubble's final box joins the obstacle list so the
    // next one steps around it, which is what fixes three-bubble overlap.
    var obs = obstacleRects();
    var byPlayer = {};   // rects already placed this pass, per speaker — feeds stacking
    live.forEach(function (b) {
      var a = anchorFor(b.playerId);
      if (a) {
        place(b.el, a, obs, byPlayer[b.playerId] || []);
        b.el.classList.remove("kchat-bub--orphan");
        var r = b.el.getBoundingClientRect();
        if (r.width && r.height) {
          obs.push(r);
          (byPlayer[b.playerId] = byPlayer[b.playerId] || []).push(r);
        }
      }
      else b.el.classList.add("kchat-bub--orphan");   // speaker has no visible segment
    });
  }

  function pop(msg) {
    if (!bubblesAllowed()) return;      // panel mode / panel open — the dock has it
    var h = host();
    if (!h) return;
    var a = anchorFor(msg.playerId);
    if (!a) return;                     // no wedge to hang it off — the log still has it

    var el = document.createElement("div");
    el.className = "kchat-bub";
    var c = colourFor(msg.playerId);
    if (c) el.style.setProperty("--kchat-accent", c);
    // Name row, R3 (user 2026-08-03): the name was WRITTEN in the player colour, which
    // is too dark to read on the glass. The colour moves into a small vertical bar —
    // the same ownership cue as the chip sleeves — the name renders in the bubble's
    // normal text colour, and the leading cast emoji is replaced by the player's
    // generated avatar (the order page's identity mark).
    var nm = document.createElement("b");
    nm.className = "kchat-bub-who";
    var bar = document.createElement("span");
    bar.className = "kchat-bub-bar";
    if (c) bar.style.background = c;
    nm.appendChild(bar);
    if (typeof kemojiEl === "function") nm.appendChild(kemojiEl(avatarKey(msg.playerId), { size: 14, bg: c }));
    nm.appendChild(document.createTextNode(displayName(msg)));
    var tx = document.createElement("span");
    tx.className = "kchat-bub-text";
    tx.textContent = msg.text;
    el.append(nm, tx);
    // BOARD-CHAT2: the element must be IN the document before place() can measure it
    // (offsetWidth is 0 while detached, and place() bails on that), so append first and
    // place after — the original order worked only because place() then no-op'd and the
    // next reposition() tidied up. With chip avoidance that would show as a bubble
    // landing on a chip and then hopping off it.
    h.appendChild(el);
    // Live bubbles join the obstacle list at pop() time too (R3): the first placement
    // used to see only chips, so a new bubble landed ON an existing one and only
    // separated at the next reposition — visible as a double-exposure flash.
    var obs = obstacleRects(), same = [];
    live.forEach(function (b) {
      var r = b.el.getBoundingClientRect();
      if (r.width && r.height) {
        obs.push(r);
        if (b.playerId === msg.playerId) same.push(r);
      }
    });
    place(el, a, obs, same);

    // one frame later so the entry transition actually runs
    requestAnimationFrame(function () { el.classList.add("kchat-bub--in"); });

    var rec = { id: msg.id, playerId: msg.playerId, el: el, until: Date.now() + BUBBLE_MS };
    live.push(rec);

    // Keep the board readable: at most three bubbles up at once, oldest retired first.
    while (live.length > 3) retire(live[0]);
  }

  function retire(rec) {
    var i = live.indexOf(rec);
    if (i >= 0) live.splice(i, 1);
    rec.el.classList.remove("kchat-bub--in");
    rec.el.classList.add("kchat-bub--out");
    setTimeout(function () { rec.el.remove(); }, 420);
  }

  function sweep() {
    var now = Date.now();
    live.slice().forEach(function (r) {
      if (r.until <= now) retire(r);
      else if (r.until - now <= FADE_MS) r.el.classList.add("kchat-bub--fading");
    });
  }

  /* ── entry point, called from render() after the board paints ─────────────── */
  function boardRenderChat() {
    var st = (typeof state !== "undefined" && state) || null;
    var chat = (st && Array.isArray(st.chat)) ? st.chat : null;
    if (!chat) return;

    renderLog(chat);

    // First paint: adopt the backlog silently. Popping twenty historic bubbles the
    // moment someone opens a long-running demo would be a wall of noise — the panel
    // is where history belongs.
    if (!booted) {
      booted = true;
      chat.forEach(function (m) { seen.add(m.id); });
      lastCount = chat.length;
      startTimer();
      return;
    }

    chat.forEach(function (m) {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      pulseAvatar(m.playerId);   // the face flickers alive whichever surface shows the text
      pop(m);
    });
    lastCount = chat.length;

    // Every paint may have moved the wedges (rotation, a player joining, resize).
    reposition();
  }

  var timer = null;
  function startTimer() {
    if (timer) return;
    timer = setInterval(sweep, 1000);
  }

  // DEMO-SPECTATE1: keep the ribbon's explanation in step with the server's reason.
  // Lives here because this file already runs after every board paint.
  // DEMO-WATCHERS1: render the live audience. Only shown once there is someone to
  // report — a badge reading "0 watching" on a quiet board is noise, not information.
  function syncAudience(){
    var el = document.getElementById("boardAudience");
    if(!el) return;
    var w = window.katomiaWatching, p = window.katomiaPlaying;
    if(!Number.isFinite(w) && !Number.isFinite(p)){ el.hidden = true; return; }
    var bits = [];
    if(p) bits.push('<b>' + p + '</b> playing');
    if(w) bits.push('👀 <b>' + w + '</b> watching');
    if(!bits.length){ el.hidden = true; return; }
    el.innerHTML = bits.join('<span class="kaud-sep"> · </span>');
    el.hidden = false;
  }

  function syncSpectatorRibbon(){
    var why = document.getElementById("boardSpectatorWhy");
    if(!why) return;
    // R2 (user 2026-08-03): watching IS the point — no call-to-action about raising a
    // commitment down here. The server's reason still drives the action-refused toast;
    // when/how to teach raising one is a separate flow, not this footer's job.
    why.textContent = window.katomiaSpectator ? "— you can follow along, but not take part." : "";
  }

  window.boardRenderChat = function(){ syncDock(); boardRenderChat(); syncSpectatorRibbon(); syncAudience(); };
  window.katomiaChat = {
    render: boardRenderChat,
    reposition: reposition,
    setMode: setMode,
    system: system,
    action: action,                 // BOARD-ACTIONMSG1 — structured player actions
    canRender: actionRenderable,    // …so the network layer knows to suppress the toast
    get live() { return live.length; },
    // SIDECIRCLE-SOFTSWAP1: the tab switched circle in place — the next paint adopts
    // the new circle's backlog silently (as a fresh load would), instead of popping
    // every row whose id happens not to collide with the old circle's.
    rebase: function () { seen = new Set(); booted = false; lastCount = 0; },
    openLog: function (on) {
      logOpen = on !== false;
      var p = panel();
      if (p) p.classList.toggle("kchat-panel--open", logOpen);
    }
  };

  window.katomiaChat.openFull = openFull;

  // DEMO-SPECTATE1 R2: raising a commitment while watching upgrades you in place.
  // The profile modal fires this after a binding is published; a re-join makes the
  // server recompute the role on the same socket. Chained so any existing handler
  // (e.g. the markets list refresh) still runs.
  {
    const prev = window.onKatomiaBindingPublished;
    window.onKatomiaBindingPublished = function(){
      try { prev && prev.apply(this, arguments) } catch(e){ console.warn("[chat] prior binding handler failed", e) }
      if(window.katomiaSpectator) window.katomiaRejoin?.();
    };
  }

  // KAT-FEEDMANUAL1 (user 2026-08-07): a sent piece of feedback leaves a durable
  // trace in the message stream, not just a toast that fades. The row carries the
  // reference tag (readable aloud) and links to the record's own permalink page on
  // the backend that stored it — "we just generate the link in the message stream,
  // and if you click on it the user can save that link". Detail comes from the
  // feedback widget's kfw:sent event; every field is optional, so a widget older
  // than this still degrades to a plain thank-you row.
  // KAT-FEEDACK1: this listener covers EVERY entry path (menu, long-press) because
  // both now open the widget IN PLACE on this page — the menu's old navigate-to-
  // /m/feedback fallback only fires if the widget script truly failed to load
  // (which is what happened while the double-gzip proxy bug had it dead).
  // GLOBAL-FEED STUB: pages with no circle feed (home, circles list, learn…) have
  // nowhere to drop this row — a general-level message feed is planned; when it
  // exists, deliverAck below should route there ("push that message to wherever
  // the user is"), instead of relying on the widget's own toast. Keep the ack
  // payload shape (text + link/linkText) so that hand-over is a one-liner.
  function deliverAck(text, opts) {
    // future: if (!inCircleFeed) globalFeed.post(text, opts)
    system(text, opts);
  }
  document.addEventListener("kfw:sent", function (e) {
    var d = (e && e.detail) || {};
    deliverAck("Feedback sent — thank you." + (d.tag ? " Reference " + d.tag + "." : ""),
      d.url ? { link: d.url, linkText: "View your feedback" } : null);
  });

  // ── KATO-PERSONA1: Kato's one-time self-intro ──────────────────────────────
  // Flagged by katomia-core.js when a brand-new intent keypair is minted;
  // delivered here because this script only loads where a circle feed exists —
  // so "the first circle feed the user is in" falls out for free. Local rows
  // (never broadcast, same channel as the feedback ack). Copy notes (user,
  // 2026-08-21): Kato REPRESENTS Katomia — the app personified, not an employee
  // ("the voice of Katomia", not "I work here"); keeps users INFORMED, not
  // "explains" (patronising to those who know); promises nothing interactive —
  // Kato can't answer yet (NORA1 unbuilt), so the only invitation is the
  // long-press feedback path, which moved HERE from the per-circle welcome so
  // joining every circle no longer repeats it. The 1.8s delay lets the host's
  // welcome land first: host greets the circle, then Kato jumps in — once ever.
  // When the general-level feed exists, deliver there instead (deliverAck seam).
  // The flag test lives INSIDE the timeout: the keypair mints asynchronously
  // after this script's init, so a check at init time ran before the flag
  // existed and the intro slipped to the user's SECOND circle (probe-caught).
  setTimeout(function () {
    try {
      if (localStorage.getItem("katoIntroPending") !== "1" || localStorage.getItem("katoIntroSeen") === "1") return;
      system("Hi, I'm Kato — the voice of Katomia. I'll keep you posted here in the feed as things happen.");
      system("Your intent key is set up — it's what signs your agreements. If anything's unclear, long-press anywhere to ask a question or send feedback.");
      localStorage.setItem("katoIntroSeen", "1"); localStorage.removeItem("katoIntroPending");
    } catch (e2) {}
  }, 1800);

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-menu-chat]")) { e.preventDefault(); openFull(true); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") openFull(false); });

  // Rotation and resize move wedges without a state change — follow them. The dock
  // re-decides side-vs-bottom on resize too (landscape ⇄ portrait).
  window.addEventListener("resize", function () { setTimeout(function () { syncDock(); reposition(); }, 60); });
})();
