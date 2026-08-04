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
  function bubblesAllowed() { return chatMode() !== "panel" && !logOpen; }

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
    systemMsgs.push({ id: "sys" + (++_sysN), ts: Date.now(), text: String(text || ""), link: (opts && opts.link) || null, linkText: (opts && opts.linkText) || null, system: true });
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
   * v1 fixed-height slice; the fuller layout (square board + draggable divider +
   * toasts folded into chat + a send box) is BOARD-CHATLAYOUT1. */
  function syncDock() {
    document.body.dataset.kchatMode = chatMode();
    var on = chatMode() === "panel";
    var d = document.getElementById("boardChatDock");
    if (on && !d) {
      d = document.createElement("div");
      d.id = "boardChatDock";
      d.className = "kchat-dock";
      // BOARD-CHATSEND1 (user 2026-08-03): the first in-game chat input — plain text,
      // broadcast to the group (game_chat, the same action the demo bots use). WHO MAY
      // SEND is the server's call and is already enforced there: spectators get the
      // action-refused message; being an eligible PLAYER is enough (no account needs
      // adding — "get permission to play, don't add the account, and commentate").
      // @mention bumping is logged on BOARD-CHATLAYOUT1, not built.
      d.innerHTML = '<div class="kchat-dock-list"></div>'
        + '<form class="kchat-send" autocomplete="off">'
        + '<input type="text" maxlength="280" placeholder="Message the table…" aria-label="Message">'
        + '<button type="submit" title="Send">➤</button></form>';
      d.querySelector(".kchat-send").addEventListener("submit", function (e) {
        e.preventDefault();
        var inp = d.querySelector(".kchat-send input");
        var text = (inp.value || "").trim();
        if (!text) return;
        var gid = (typeof gameId !== "undefined" && gameId) || (typeof getGameId === "function" ? getGameId() : null);
        var sk = (typeof socket !== "undefined" && socket) || null;
        if (!gid || !sk || sk.readyState !== 1) return;
        sk.send(JSON.stringify({ type: "game_chat", gameId: gid, text: text }));
        inp.value = "";
      });
      document.body.appendChild(d);
    }
    // R2 (user 2026-08-03, seeing v1 live): the dock is a SIDE panel on landscape —
    // full height, right-hand edge, ~quarter width — and a bottom slice on portrait.
    // Either way the BOARD YIELDS the space ("it shouldn't be covering up the board")
    // via the --kchat-clear-* vars that #boardRoot's panel-mode override consumes.
    var side = on && innerWidth > innerHeight && innerWidth >= 700;
    var clearB = 0, clearR = 0;
    if (d) {
      d.style.display = on ? "" : "none";
      d.classList.toggle("kchat-dock--side", side);
      if (on) {
        if (side) {
          clearR = Math.round(Math.min(380, Math.max(250, innerWidth * 0.25)));
          d.style.width = clearR + "px";
          d.style.bottom = "0px";
          d.style.height = "";        // side variant sizes via CSS (top/bottom pinned)
        } else {
          d.style.width = "";
          // R4 (user 2026-08-03): SQUARE CARVE — the board keeps a ~width×width square
          // at the top (the ring is circle-locked to match), the board's OWN bottom
          // bars (footer/ribbon, and the narrate strip that stacks on them) sit at the
          // FOOT OF THE BOARD (they follow --kchat-clear-b up via CSS), and everything
          // below is messaging: board → board footer → messages.
          var stackH = 0;
          [".ring-footer", ".kspec-ribbon"].forEach(function (s) {
            var el = document.querySelector(s);
            if (el && getComputedStyle(el).display !== "none") stackH += el.getBoundingClientRect().height;
          });
          clearB = Math.round(Math.max(140, Math.min(innerHeight * 0.55, innerHeight - innerWidth - stackH)));
          d.style.bottom = "0px";
          // height comes from the SAME --kchat-clear-b var the board yields (CSS), so
          // the pair can never disagree by a measurement race
          d.style.height = "";
        }
      }
    }
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
    // system entries ride along, ordered by time
    if (systemMsgs.length)
      chat = chat.concat(systemMsgs).sort(function (a, b) { return new Date(a.ts) - new Date(b.ts); });
    var p = panel();
    var count = p && p.querySelector(".kchat-panel-count");
    if (count) count.textContent = chat.length ? String(chat.length) : "";
    // BOARD-CHAT1 R2: two destinations — the desktop panel and the mobile full-screen
    // stream. Both get the same rows; CSS decides which one the device can see.
    renderInto(p && p.querySelector(".kchat-panel-list"), chat);
    renderInto(document.getElementById("boardChatFullList"), chat);
    renderInto(document.querySelector("#boardChatDock .kchat-dock-list"), chat);
    var sub = document.getElementById("boardChatFullSub");
    if (sub) sub.textContent = chat.length ? chat.length + " so far" : "nothing said yet";
  }

  function renderInto(list, chat) {
    if (!list) return;
    var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
    list.innerHTML = "";
    if (!chat.length) {
      var e = document.createElement("div");
      e.className = "kchat-full-empty";
      e.textContent = "No messages yet.";
      list.appendChild(e);
      return;
    }
    chat.slice(-MAX_LOG).forEach(function (m) {
      // Row anatomy R2 (user 2026-08-03): full-height colour BAR (not a dot — same
      // ownership cue as chip sleeves and bubble bars), the player's AVATAR on their
      // colour (the fruit emoji is gone from display names everywhere), then bold
      // name + time + the text INLINE, wrapping — compact, chat-app familiar.
      var row = document.createElement("div");
      row.className = "kchat-row" + (m.system ? " kchat-row--sys" : "");
      var c = m.system ? null : colourFor(m.playerId);
      var t = new Date(m.ts);
      var hh = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      var bar = document.createElement("span");
      bar.className = "kchat-row-bar";
      if (c) bar.style.background = c;
      row.appendChild(bar);
      if (m.system) {
        var bot = document.createElement("span");
        bot.className = "kchat-sys-emoji";
        bot.textContent = "🤖";
        row.appendChild(bot);
      } else if (typeof kemojiEl === "function") {
        row.appendChild(kemojiEl(avatarKey(m.playerId), { size: 16, bg: c }));
      }
      var main = document.createElement("span");
      main.className = "kchat-row-main";
      var nm = document.createElement("b");
      nm.textContent = m.system ? "Katomia" : displayName(m);
      var tm = document.createElement("i");
      tm.textContent = hh;
      var tx = document.createElement("span");
      tx.className = "kchat-row-text";
      tx.textContent = m.text;                      // textContent — chat is user input
      if (m.to) {
        var to = document.createElement("em");
        to.className = "kchat-row-to";
        to.textContent = "→ " + m.to;
        nm.appendChild(to);
      }
      main.append(nm, " ", tm, " ", tx);
      if (m.system && m.link) {
        // the WHOLE payload (e.g. the txid) is the link, not a fiddly arrow (user 2026-08-03)
        var a2 = document.createElement("a");
        a2.href = m.link; a2.target = "_blank"; a2.rel = "noopener noreferrer";
        a2.textContent = m.linkText || "↗";
        main.append(" ", a2);
      }
      row.appendChild(main);
      list.appendChild(row);
    });
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  // BOARD-CHAT1 R2: full-screen transcript for phones, opened from ☰ → 💬 Messages.
  function openFull(on) {
    var el = document.getElementById("boardChatFull");
    if (!el) return;
    el.classList.toggle("open", on !== false);
    // R2 (user 2026-08-03, got STUCK in here on mobile): the banner (z70) sat on top
    // of this overlay (was z60), parking the hamburger exactly over the ✕. The
    // overlay now outranks the banner (CSS z2000) and the banner hides while open.
    document.body.classList.toggle("kchat-fullopen", on !== false);
    if (on !== false) {
      var l = document.getElementById("boardChatFullList");
      if (l) l.scrollTop = l.scrollHeight;
      document.getElementById("appMenu")?.classList.add("hidden");
    }
  }

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
    get live() { return live.length; },
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

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-menu-chat]")) { e.preventDefault(); openFull(true); }
    else if (e.target.closest("#boardChatFullClose")) { e.preventDefault(); openFull(false); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") openFull(false); });

  // Rotation and resize move wedges without a state change — follow them. The dock
  // re-decides side-vs-bottom on resize too (landscape ⇄ portrait).
  window.addEventListener("resize", function () { setTimeout(function () { syncDock(); reposition(); }, 60); });
})();
