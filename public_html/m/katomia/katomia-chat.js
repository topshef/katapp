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
  var MAX_LOG = 80;
  var seen = new Set();    // chat ids already animated in — state.chat resends everything
  var live = [];           // { id, playerId, el, until }
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
      }
    });
    return p;
  }

  function who(msg) {
    return msg.playerName || ("player " + String(msg.playerId || "?").slice(0, 6));
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
    var p = panel();
    var count = p && p.querySelector(".kchat-panel-count");
    if (count) count.textContent = chat.length ? String(chat.length) : "";
    // BOARD-CHAT1 R2: two destinations — the desktop panel and the mobile full-screen
    // stream. Both get the same rows; CSS decides which one the device can see.
    renderInto(p && p.querySelector(".kchat-panel-list"), chat);
    renderInto(document.getElementById("boardChatFullList"), chat);
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
      var row = document.createElement("div");
      row.className = "kchat-row";
      var c = colourFor(m.playerId);
      var t = new Date(m.ts);
      var hh = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      var dot = document.createElement("span");
      dot.className = "kchat-row-dot";
      if (c) dot.style.background = c;
      var nm = document.createElement("b");
      nm.textContent = who(m);
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
      row.append(dot, nm, tm, tx);
      list.appendChild(row);
    });
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  // BOARD-CHAT1 R2: full-screen transcript for phones, opened from ☰ → 💬 Messages.
  function openFull(on) {
    var el = document.getElementById("boardChatFull");
    if (!el) return;
    el.classList.toggle("open", on !== false);
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

  function place(el, a) {
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

    // board pixels -> viewport pixels, then clamp inside the board's on-screen box
    var vx = o.x + a.x, vy = o.y + a.y;
    var wantL = vx - w / 2, wantT = vy - ht / 2;
    var l = Math.max(o.x + PAD, Math.min(wantL, o.x + o.w - w - PAD));
    var t = Math.max(o.y + PAD, Math.min(wantT, o.y + o.h - ht - PAD));

    // Switch off the centring transform and position by corner, so the clamp is exact.
    el.style.setProperty("--kchat-dx", "0px");
    el.style.left = l + "px";
    el.style.top = t + "px";
    el.classList.add("kchat-bub--placed");

    // tail x within the bubble, tracking the speaker even after clamping
    var tail = Math.max(12, Math.min(vx - l, w - 12));
    el.style.setProperty("--kchat-tail", tail + "px");
  }

  function reposition() {
    live.forEach(function (b) {
      var a = anchorFor(b.playerId);
      if (a) { place(b.el, a); b.el.classList.remove("kchat-bub--orphan"); }
      else b.el.classList.add("kchat-bub--orphan");   // speaker has no visible segment
    });
  }

  function pop(msg) {
    var h = host();
    if (!h) return;
    var a = anchorFor(msg.playerId);
    if (!a) return;                     // no wedge to hang it off — the log still has it

    var el = document.createElement("div");
    el.className = "kchat-bub";
    var c = colourFor(msg.playerId);
    if (c) el.style.setProperty("--kchat-accent", c);
    var nm = document.createElement("b");
    nm.className = "kchat-bub-who";
    nm.textContent = who(msg);
    var tx = document.createElement("span");
    tx.className = "kchat-bub-text";
    tx.textContent = msg.text;
    el.append(nm, tx);
    place(el, a);
    h.appendChild(el);

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
    live.slice().forEach(function (r) { if (r.until <= now) retire(r); });
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
    var r = window.katomiaSpectatorReason;
    why.textContent = window.katomiaSpectator
      ? (r ? "— " + r + ". You can follow along, but not take part." : "— you can follow along, but not take part.")
      : "";
  }

  window.boardRenderChat = function(){ boardRenderChat(); syncSpectatorRibbon(); syncAudience(); };
  window.katomiaChat = {
    render: boardRenderChat,
    reposition: reposition,
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

  // Rotation and resize move wedges without a state change — follow them.
  window.addEventListener("resize", function () { setTimeout(reposition, 60); });
})();
