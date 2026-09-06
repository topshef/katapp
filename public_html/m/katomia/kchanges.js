// kchanges.js — KCHANGES1 (user feedback tango-delta-81, 2026-09-06): changes, shown
// on the page they changed, and listed in one place from the ☰ menu.
//
// "Whenever we put in a change, we can visually post-it-note that change on the screen
//  … a short reference, a letter and two numbers … fade out over a week, gone after two
//  … tap it and you get information about the change … an x to close and remove the
//  post-it … thumbs up, thumbs down, comment … toggled on and off from the hamburger
//  menu, admin only."
//
// ROUND 2 (same day, from using it): "the post-its that are in context don't seem to be
// working, I tap on them and nothing comes up … the ones that are not in context, let's
// not show them on the page … another item on the hamburger menu to a list of all the
// changes … tap it and it either takes you to the context if there is one, or it opens
// up there so you can review it with thumbs up, down, comment."
//
// TWO SURFACES
//   TAGS   ☰ → 🗒️ Show changes. A tag beside each changed thing THAT IS ON THIS PAGE.
//          Nothing else — a change with nowhere to point at is not drawn over the app.
//   LIST   ☰ → 📋 Changes. Every change, wherever it lives. Each row says whether it
//          can be reached from here, and tapping it acts on that:
//            on this page   → closes the list, opens that tag's note on the page
//            somewhere else → goes there, and opens the note on arrival (?kch=REF)
//            nowhere yet    → expands in the list, with the same note and 👍 👎 💬
//          The ⌄ on any row expands it in place instead — so a change can always be
//          read and commented on from a second device, even with no context to visit.
//
// WHY THE TAGS DIDN'T TAP (fixed here)
//   The tag was positioned with `transform: translate(-100%,-55%)`. katomia.css:1159 has
//   a global `button:active{transform:translateY(1px)}` — pressing a tag REPLACED the
//   positioning transform, so the tag jumped ~50px right the instant the finger landed:
//   pointerdown hit the tag, pointerup hit the board behind it, and the click retargeted
//   to <body>. Nothing happened, every time, on exactly the tags that were over the app.
//   Tags now carry no transform at all — the offset is folded into left/top — and the
//   rule is neutralised (`transform:none!important`) so no page's button styling can
//   move a tag mid-tap. Placement is also frozen while a tag is pressed.
//
// WHAT IT IS NOT
//   Not a security boundary. Nothing here reveals anything a user can't see already —
//   the changes are on the page whether or not they are labelled. The admin gate keeps
//   dev annotations away from players; it is a courtesy, not a lock, so it may run
//   client-side against the public admin list.
//
// AGE
//   Fresh = full strength. Opacity eases to 35% over 7 days; at 14 days the tag is gone
//   and the entry leaves the list.
//
// GATE
//   Both menu rows appear when any of these holds:
//     · a live auth record in this browser (katomiaAuthRecords) is for an account in the
//       backend's admin group (GET /katomia/admins — katomiaAccountGroups.json, the same
//       list that decides whose feedback is "actioning")
//     · body.kadmin (the IP-admin disclosure header.php already sets)
//     · ?kchanges=1 on the URL (testing without a phone to authenticate on)
//   The tags on/off state is localStorage (katomia.kchanges.v1), per device; so is the
//   ✕ Done list (katomia.kchanges.done.v1).
//
// KBUNDLE-STRIP:kchanges — dev estate only. Standalone bundles should strip this file,
// kchanges-log.js and the menu rows (add "kchanges" to STRIP_FEATURES when that matters).
(function () {
  "use strict";

  var ON_KEY = "katomia.kchanges.v1";            // "1" = tags on
  var DONE_KEY = "katomia.kchanges.done.v1";     // JSON array of refs ticked off (✕)
  var ADMINS_KEY = "katomia.kchanges.admins";    // sessionStorage cache of /katomia/admins
  var BOARD_KEY = "katomia.kchanges.lastboard";  // last circle seen, for "@board" deep links
  var SAID_KEY = "katomia.kchanges.said.v1";     // KCHSAID1: what I have already fed back on
  var VOTED_KEY = "katomia.kfeedbits.voted.v1";  // kfeedbits' own map, read for thumbs
  var FADE_DAYS = 7, GONE_DAYS = 14;

  var log = Array.isArray(window.KCHANGES_LOG) ? window.KCHANGES_LOG : [];
  var on = false, layer = null, pop = null, openRef = null, sheet = null, pressing = false, popAt = 0;
  var tags = {};   // ref -> { el, anchor }

  // ── helpers ────────────────────────────────────────────────────────────────
  function hapiBase() {
    var b = (window.CONFIG && window.CONFIG.HAPI_BASE) || "";
    if (!b) return "";
    return (/^https?:\/\//.test(b) ? b : "https://" + b).replace(/\/$/, "");
  }
  function readDone() { try { return JSON.parse(localStorage.getItem(DONE_KEY)) || []; } catch (e) { return []; } }
  function writeDone(a) { try { localStorage.setItem(DONE_KEY, JSON.stringify(a)); } catch (e) {} }
  function markDone(ref) {
    var d = readDone(); if (d.indexOf(ref) === -1) d.push(ref); writeDone(d);
  }
  // ── KCHSAID1: "I have already said something about this one" ───────────────
  // Your feedback, 2026-09-06: "if I've already given a comment, recolour the post-it
  // … grey it out … some indication that the feedback has already been given, maybe a
  // link to that feedback, and then I can manually mark done if I've nothing more."
  // So this is a THIRD state, not Done: Done is you closing an item; this is simply the
  // record of what you have already told me, kept per browser, and it colours itself in
  // the moment a vote or a comment lands. Every comment is its own feedback record —
  // they are tied together by the change's reference, which the quote always carries.
  function readSaid() { try { return JSON.parse(localStorage.getItem(SAID_KEY)) || {}; } catch (e) { return {}; } }
  function writeSaid(m) { try { localStorage.setItem(SAID_KEY, JSON.stringify(m)); } catch (e) {} }
  function noteSaid(ref, kind, id, tag) {
    if (!ref) return;
    var m = readSaid();
    var list = m[ref] = (m[ref] || []);
    list.push({ at: new Date().toISOString(), kind: kind, id: id || null, tag: tag || null });
    if (list.length > 12) m[ref] = list.slice(-12);
    writeSaid(m);
    place();
    if (sheet) renderSheet();
    if (pop && openRef === ref) refreshSaidLine(openRef);
  }
  // What I have said about one change: this browser's own record, plus any thumb
  // kfeedbits stored before KCHSAID1 shipped (that map is keyed "change-<REF>").
  function saidFor(ref) {
    var list = (readSaid()[ref] || []).slice();
    var verdict = null, comments = 0, last = null;
    list.forEach(function (e) {
      if (e.kind === "comment") comments++; else verdict = e.kind;
      if (!last || e.at > last.at) last = e;
      if (e.kind === "comment" && (!last || e.at >= last.at)) last = e;
    });
    if (!verdict) {
      try {
        var v = (JSON.parse(localStorage.getItem(VOTED_KEY)) || {})["change-" + ref];
        if (v === "up" || v === "down") verdict = v;
      } catch (e) {}
    }
    if (!verdict && !comments) return null;
    return { verdict: verdict, comments: comments, last: last };
  }
  function saidIcon(said) {
    if (!said) return "\u{1F5D2}\uFE0F";
    if (said.comments) return "\u{1F4AC}";
    return said.verdict === "down" ? "\u{1F44E}" : "\u{1F44D}";
  }
  function saidWords(said) {
    if (!said) return "";
    var bits = [];
    if (said.comments) bits.push(said.comments > 1 ? said.comments + " comments" : "commented");
    if (said.verdict) bits.push(said.verdict === "up" ? "\u{1F44D}" : "\u{1F44E}");
    var when = said.last && said.last.at ? " on " + fmtDate(said.last.at) : "";
    return "You've fed back \u2014 " + bits.join(" \u00b7 ") + when;
  }

  function ageDays(entry) {
    var t = Date.parse(entry.at || "");
    return isNaN(t) ? 0 : Math.max(0, (Date.now() - t) / 864e5);
  }
  function strength(entry) {
    var d = ageDays(entry);
    if (d >= GONE_DAYS) return 0;
    return 1 - 0.65 * Math.min(d / FADE_DAYS, 1);
  }
  function matchesPage(w) {
    if (!w || !w.page) return true;
    try { return new RegExp(w.page).test(location.pathname); } catch (e) { return false; }
  }
  function onThisPage(entry) { return (entry.where || []).some(matchesPage); }
  function anchorFor(entry) {
    var ws = (entry.where || []).filter(matchesPage);
    for (var i = 0; i < ws.length; i++) {
      if (!ws[i].sel) continue;
      var el = null;
      try { el = document.querySelector(ws[i].sel); } catch (e) {}
      if (el && el.getClientRects().length) return el;
    }
    return null;
  }
  // the feedback permalink, on THIS site's origin (feedback b2a7df20: never hand the
  // user a backend URL). The Worker proxies /hapi/<x> → backend /<x>.
  function feedbackUrl(id) { return id ? location.origin + "/hapi/kfeedback/view/" + id : null; }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso || "";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  function liveEntries() {
    var done = readDone();
    return log.filter(function (e) {
      return e && e.ref && strength(e) > 0 && done.indexOf(e.ref) === -1;
    }).slice().reverse();   // newest first
  }

  // ── where a change can be seen ─────────────────────────────────────────────
  // "here"  the thing it changed is on this page right now → the tag is out there
  // "page"  this page is the right place, but it isn't showing (a modal, the menu,
  //         a signing phase) → entry.needs says what to open
  // "go"    somewhere else, and we can name the URL
  // "none"  nothing to visit (a toast, a phase that has to happen) → read it in the list
  function rememberBoard() {
    if (/\/(board|game)(\/|\.|$)/.test(location.pathname)) {
      try { localStorage.setItem(BOARD_KEY, location.pathname + location.search); } catch (e) {}
    }
  }
  function resolveGoto(entry) {
    var g = entry.goto;
    if (!g) return null;
    var url = g, label = entry.gotoLabel || "";
    if (g === "@board") {
      var last = "";
      try { last = localStorage.getItem(BOARD_KEY) || ""; } catch (e) {}
      url = last || "/m/katomia/circles";
      label = label || (last ? "your last circle" : "pick a circle");
    }
    if (!url || url.indexOf(location.pathname) === 0 && url.length === location.pathname.length) return null;
    return { url: url, label: label || "go there" };
  }
  function contextOf(entry) {
    if (anchorFor(entry)) return { state: "here" };
    if (onThisPage(entry)) return { state: "page", needs: entry.needs || "not showing just now" };
    var g = resolveGoto(entry);
    if (g) return { state: "go", url: g.url, label: g.label };
    return { state: "none", needs: entry.needs || "nowhere to visit — read it here" };
  }

  // ── admin gate ─────────────────────────────────────────────────────────────
  function liveAccounts() {
    try {
      var m = JSON.parse(localStorage.getItem("katomiaAuthRecords") || "null") || {};
      return Object.keys(m).filter(function (k) {
        var r = m[k];
        if (!r || !r.accountId) return false;
        if (!r.expiresAt) return true;
        return new Date(r.expiresAt).getTime() > Date.now();
      }).map(function (k) { return m[k].accountId; });
    } catch (e) { return []; }
  }
  function fetchAdmins() {
    try {
      var c = JSON.parse(sessionStorage.getItem(ADMINS_KEY) || "null");
      if (c && c.at && Date.now() - c.at < 36e5 && Array.isArray(c.admins)) return Promise.resolve(c.admins);
    } catch (e) {}
    var url = (hapiBase() || "") + "/katomia/admins";
    if (!hapiBase()) url = "/hapi/katomia/admins";
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var admins = (j && Array.isArray(j.admins)) ? j.admins : [];
      try { sessionStorage.setItem(ADMINS_KEY, JSON.stringify({ at: Date.now(), admins: admins })); } catch (e) {}
      return admins;
    }).catch(function () { return []; });
  }
  function isAdmin() {
    if (new URLSearchParams(location.search).get("kchanges") === "1") return Promise.resolve(true);
    if (document.body && document.body.classList.contains("kadmin")) return Promise.resolve(true);
    var mine = liveAccounts();
    if (!mine.length) return Promise.resolve(false);
    return fetchAdmins().then(function (admins) {
      return mine.some(function (a) { return admins.indexOf(a) !== -1; });
    });
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById("kchanges-css")) return;
    var s = document.createElement("style");
    s.id = "kchanges-css";
    s.textContent =
      ".kch-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483050}" +
      // no transform, at any state: katomia.css's global button:active{transform:translateY(1px)}
      // would otherwise replace a positioning transform and move the tag out from under
      // the finger between pointerdown and pointerup. The offset lives in left/top.
      ".kch-tag{position:absolute;pointer-events:auto;display:inline-flex;align-items:center;gap:3px;" +
        "padding:1px 6px 1px 4px;border-radius:9px;background:#fff7c2;color:#5b4a00;border:1px solid #e6cf5a;" +
        "box-shadow:0 1px 4px rgba(0,0,0,.18);font:700 11px/1.5 ui-monospace,Menlo,Consolas,monospace;" +
        "cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;" +
        "transition:opacity .2s ease,background .12s ease}" +
      ".kch-tag,.kch-tag:hover,.kch-tag:active,.kch-tag:focus{transform:none!important}" +
      ".kch-tag:hover,.kch-tag:active{background:#ffef9a}" +
      ".kch-tag.kch-open{outline:2px solid #2f6fed;outline-offset:1px}" +
      // KCHSAID1: already fed back → off the yellow, onto a quiet slate, so at a glance
      // the page shows what is still waiting on you.
      ".kch-tag--said{background:#eef1f5;border-color:#c9d2de;color:#5b6472;box-shadow:0 1px 3px rgba(0,0,0,.12)}" +
      ".kch-tag--said:hover,.kch-tag--said:active{background:#e3e8ef}" +
      ".kch-tag.kch-flash{animation:kch-flash .9s ease 2}" +
      "@keyframes kch-flash{0%,100%{box-shadow:0 1px 4px rgba(0,0,0,.18)}50%{box-shadow:0 0 0 6px rgba(47,111,237,.35)}}" +
      ".kch-tag .kch-ico{font-size:12px;line-height:1}" +

      ".kch-pop{position:fixed;pointer-events:auto;z-index:2147483060;width:min(360px,calc(100vw - 16px));" +
        "background:#fff;color:#1f2937;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);" +
        "border:1px solid #e5e7eb;padding:12px 14px 10px;font:14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}" +
      ".kch-pop-head{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}" +
      ".kch-pop-ref{font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;background:#fff7c2;border:1px solid #e6cf5a;" +
        "color:#5b4a00;padding:3px 6px;border-radius:7px}" +
      ".kch-pop-title{font-weight:600;flex:1 1 auto;min-width:0}" +
      ".kch-pop-x{border:0;background:none;color:#9ca3af;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;flex:none}" +
      ".kch-pop-x:hover{color:#374151}" +
      ".kch-pop-meta{font-size:12px;color:#6b7482;margin-bottom:6px}" +
      ".kch-pop-meta a{color:#2f6fed}" +
      ".kch-pop-said{font-size:12px;color:#41506a;background:#eef1f5;border:1px solid #dde3ec;border-radius:8px;" +
        "padding:5px 8px;margin-bottom:7px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}" +
      ".kch-pop-said a{color:#2f6fed}" +
      ".kch-pop-detail{font-size:13px;color:#374151;white-space:pre-wrap;max-height:40vh;overflow:auto;margin-bottom:8px}" +
      ".kch-pop-cite{font-size:11px;color:#9aa3b2}" +
      ".kch-pop-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid #f0f2f5;padding-top:8px}" +
      ".kch-pop-done{border:1px solid #dde3ec;background:#fff;border-radius:8px;padding:4px 10px;font:600 12px system-ui,sans-serif;" +
        "color:#374151;cursor:pointer}" +
      ".kch-pop-done:hover{border-color:#b91c1c;color:#b91c1c}" +

      // ── the list ──
      ".kch-sheet{position:fixed;inset:0;z-index:2147483070;display:flex;flex-direction:column;" +
        "background:rgba(15,20,30,.45);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);" +
        "font:14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}" +
      ".kch-sheet-panel{background:#f7f7f8;color:#1f2937;margin:auto auto 0;width:100%;max-width:640px;" +
        "max-height:92vh;display:flex;flex-direction:column;border-radius:14px 14px 0 0;box-shadow:0 -8px 40px rgba(0,0,0,.3)}" +
      "@media (min-width:700px){.kch-sheet-panel{margin:auto;border-radius:14px;max-height:80vh}}" +
      ".kch-sheet-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #e5e7eb;flex:none}" +
      ".kch-sheet-head b{font-size:15px}" +
      ".kch-sheet-count{color:#6b7482;font-size:12.5px;flex:1 1 auto}" +
      ".kch-sheet-x{border:1px solid #dde3ec;background:#fff;border-radius:9px;width:34px;height:34px;font-size:17px;" +
        "line-height:1;color:#374151;cursor:pointer;flex:none;transform:none!important}" +
      ".kch-sheet-x:hover{border-color:#b91c1c;color:#b91c1c}" +
      ".kch-sheet-list{overflow:auto;padding:8px 10px 14px;-webkit-overflow-scrolling:touch}" +
      ".kch-row{background:#fff;border:1px solid #e5e7eb;border-radius:11px;margin-bottom:8px;overflow:hidden}" +
      ".kch-row-main{display:flex;align-items:flex-start;gap:9px;width:100%;text-align:left;background:none;border:0;" +
        "padding:10px 10px 9px;cursor:pointer;font:inherit;color:inherit;transform:none!important}" +
      ".kch-row-top{display:flex;align-items:stretch}" +
      ".kch-row-top:hover{background:#f5f8ff}" +
      ".kch-row-ref{font:700 11.5px/1.5 ui-monospace,Menlo,Consolas,monospace;background:#fff7c2;border:1px solid #e6cf5a;" +
        "color:#5b4a00;padding:0 5px;border-radius:7px;flex:none;margin-top:1px}" +
      ".kch-row-body{flex:1 1 auto;min-width:0}" +
      ".kch-row-title{font-weight:600;font-size:13.5px}" +
      ".kch-row-sub{font-size:11.5px;color:#6b7482;margin-top:2px}" +
      ".kch-cue{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:1px 7px;border-radius:999px;" +
        "border:1px solid transparent;white-space:nowrap;margin-top:4px}" +
      ".kch-cue--here{background:#e7f6ec;border-color:#b7e2c6;color:#136c34}" +
      ".kch-cue--go{background:#eaf1fe;border-color:#c3d6fb;color:#1e40af}" +
      ".kch-cue--page{background:#fff5e5;border-color:#f0d9ac;color:#8a5a09}" +
      ".kch-cue--none{background:#f3f4f6;border-color:#e2e5ea;color:#6b7482}" +
      ".kch-row--said .kch-row-ref{background:#eef1f5;border-color:#c9d2de;color:#5b6472}" +
      ".kch-row--said .kch-row-title{color:#5b6472;font-weight:500}" +
      ".kch-said-pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:1px 7px;border-radius:999px;" +
        "background:#eef1f5;border:1px solid #d3dae4;color:#41506a;margin-top:4px;margin-left:6px;white-space:nowrap}" +
      ".kch-row-chev{border:0;background:none;color:#9ca3af;font-size:15px;cursor:pointer;padding:8px 10px;flex:none;" +
        "align-self:stretch;transform:none!important}" +
      ".kch-row-chev:hover{color:#2f6fed}" +
      ".kch-row-open{border-top:1px solid #f0f2f5;padding:10px 12px 11px;background:#fcfdff}" +
      ".kch-row-detail{font-size:13px;color:#374151;white-space:pre-wrap;margin-bottom:9px}" +
      ".kch-row-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}" +
      ".kch-row-go{border:1px solid #2f6fed;background:#2f6fed;color:#fff;border-radius:8px;padding:5px 11px;" +
        "font:600 12px system-ui,sans-serif;cursor:pointer;transform:none!important}" +
      ".kch-sheet-note{font-size:11.5px;color:#6b7482;padding:2px 4px 0}" +
      ".kch-sheet-empty{text-align:center;color:#6b7482;padding:26px 10px}" +

      // kfeedbits (👍 👎 💬) — same look as learn.php, scoped here so it renders anywhere
      ".kch-pop .kfb,.kch-row .kfb{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".kch-pop .kfb-btn,.kch-row .kfb-btn{border:1px solid #dde3ec;background:#fff;border-radius:999px;cursor:pointer;" +
        "padding:3px 9px;font-size:14px;line-height:1.2;transform:none!important}" +
      ".kch-pop .kfb-btn:hover,.kch-row .kfb-btn:hover{border-color:#2f6fed}" +
      ".kch-pop .kfb-btn.on,.kch-row .kfb-btn.on{border-color:#2f6fed;background:#eaf1fe}" +
      ".kch-pop .kfb-btn:disabled,.kch-row .kfb-btn:disabled{opacity:.5;cursor:default}" +
      ".kch-pop .kfb-msg,.kch-row .kfb-msg{font-size:12.5px;color:#2f6fed}" +
      ".kch-pop .kfb-msg-warn,.kch-row .kfb-msg-warn{color:#b4690e}" +
      ".kch-pop .kfb-lead,.kch-row .kfb-lead{display:none}" +
      "@media (prefers-reduced-motion:reduce){.kch-tag{transition:none}.kch-tag.kch-flash{animation:none}}";
    document.head.appendChild(s);
  }

  // ── tags on the page ───────────────────────────────────────────────────────
  function ensureLayer() {
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "kch-layer";
      document.body.appendChild(layer);
    }
  }
  function makeTag(entry) {
    var t = document.createElement("button");
    t.type = "button";
    t.className = "kch-tag";
    t.dataset.ref = entry.ref;
    t.title = entry.title || entry.ref;
    t.innerHTML = '<span class="kch-ico"></span><span></span>';
    t.lastChild.textContent = entry.ref;
    t.style.opacity = String(strength(entry));
    paintTag(t, entry.ref);
    // Freeze placement for the length of the press: a live board re-renders constantly,
    // and a tag that re-anchors between pointerdown and pointerup loses the tap.
    t.addEventListener("pointerdown", function (e) { pressing = true; e.stopPropagation(); });
    t.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); togglePop(entry, t); });
    return t;
  }
  // Grey with a 💬/👍/👎 once you have said something; yellow 🗒️ while it still wants
  // your eye. Re-applied on every placement so it changes the moment feedback lands.
  function paintTag(el, ref) {
    var said = saidFor(ref);
    el.classList.toggle("kch-tag--said", !!said);
    el.firstChild.textContent = saidIcon(said);
    el.title = said ? saidWords(said) : (el.title || ref);
  }

  function pageEntries() {
    return liveEntries().filter(onThisPage);
  }
  function place() {
    if (!on || pressing) return;
    ensureLayer();
    var seen = {};
    pageEntries().forEach(function (entry) {
      var a = anchorFor(entry);
      if (!a) return;                       // no anchor here → it lives in the list only
      seen[entry.ref] = true;
      var rec = tags[entry.ref];
      if (!rec) rec = tags[entry.ref] = { el: makeTag(entry), anchor: null };
      rec.anchor = a;
      if (rec.el.parentNode !== layer) layer.appendChild(rec.el);
      paintTag(rec.el, entry.ref);
      var r = a.getBoundingClientRect();
      var w = rec.el.offsetWidth || 52, h = rec.el.offsetHeight || 20;
      // top-right corner of the anchor, pulled in over the thing it labels
      var left = Math.max(2, Math.min(window.innerWidth - w - 2, r.right - 2 - w));
      var top = Math.max(2, Math.min(window.innerHeight - h - 2, r.top + 2 - Math.round(h * 0.55)));
      rec.el.style.left = left + "px";
      rec.el.style.top = top + "px";
      rec.el.style.display = (r.bottom < 0 || r.top > window.innerHeight) ? "none" : "";
    });
    Object.keys(tags).forEach(function (ref) {
      if (!seen[ref]) { tags[ref].el.remove(); delete tags[ref]; }
    });
    if (pop && openRef && tags[openRef]) positionPop(tags[openRef].el);
  }
  var placeQueued = false;
  function schedulePlace() {
    if (!on || placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(function () { placeQueued = false; place(); });
  }
  var mo = null, moTimer = null;
  function watch() {
    window.addEventListener("scroll", schedulePlace, { passive: true, capture: true });
    window.addEventListener("resize", schedulePlace);
    if (!mo && typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(function () {
        clearTimeout(moTimer);
        moTimer = setTimeout(schedulePlace, 250);
      });
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style"] });
    }
  }
  function unwatch() {
    window.removeEventListener("scroll", schedulePlace, { capture: true });
    window.removeEventListener("resize", schedulePlace);
    if (mo) { mo.disconnect(); mo = null; }
  }
  window.addEventListener("pointerup", function () { if (pressing) { pressing = false; schedulePlace(); } }, true);
  window.addEventListener("pointercancel", function () { pressing = false; }, true);

  // ── the note (popover on a tag) ────────────────────────────────────────────
  function closePop() {
    if (pop) { pop.remove(); pop = null; }
    if (openRef && tags[openRef]) tags[openRef].el.classList.remove("kch-open");
    openRef = null;
  }
  function positionPop(tagEl) {
    if (!pop) return;
    var r = tagEl.getBoundingClientRect();
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
    var top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }
  // The detail text is what 💬 quotes: kfeedbits selects this element's contents and
  // opens the feedback modal, so the follow-up carries the change's own reference.
  function detailBlock(entry, cls, id) {
    var d = document.createElement("div");
    d.className = cls;
    d.id = id;
    var cite = document.createElement("span");
    cite.className = "kch-pop-cite";
    cite.textContent = entry.ref + " — " + (entry.title || "");
    d.appendChild(cite);
    if (entry.detail) d.appendChild(document.createTextNode("\n" + entry.detail));
    return d;
  }
  function kfbFor(entry, detailId) {
    var kfb = document.createElement("div");
    kfb.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest(".kfb-chat"))
        pendingComment = { ref: entry.ref, at: Date.now() };
    }, true);
    kfb.setAttribute("data-kfb", "change-" + entry.ref);
    kfb.setAttribute("data-kfb-label", "Change " + entry.ref + ": " + (entry.title || ""));
    kfb.setAttribute("data-kfb-target", "#" + detailId);
    return kfb;
  }
  // A comment goes out through the feedback widget, which knows nothing about changes —
  // so remember which change opened it, and claim the next record the widget reports.
  // Five minutes, one shot: long enough to write a paragraph, short enough that an
  // unrelated piece of feedback later is not filed against a change.
  var pendingComment = null;
  document.addEventListener("kfb:voted", function (e) {
    var d = e.detail || {};
    var m = /^change-(.+)$/.exec(d.id || "");
    if (m) noteSaid(m[1], d.verdict === "down" ? "down" : "up", d.record, d.tag);
  });
  document.addEventListener("kfw:sent", function (e) {
    if (!pendingComment || Date.now() - pendingComment.at > 3e5) { pendingComment = null; return; }
    var d = e.detail || {};
    var ref = pendingComment.ref;
    pendingComment = null;
    noteSaid(ref, "comment", d.id, d.tag);
  });

  function renderKfb(kfb) {
    if (window.kfeedbits && window.kfeedbits.render) { try { window.kfeedbits.render(kfb); return; } catch (e) {} }
    kfb.remove();
  }
  function metaLine(entry) {
    var meta = document.createElement("div");
    meta.className = "kch-pop-meta";
    meta.textContent = fmtDate(entry.at) + (entry.from ? " · from your feedback " : "");
    if (entry.from) {
      var a = document.createElement("a");
      a.href = feedbackUrl(entry.feedback) || "#";
      a.target = "_blank"; a.rel = "noopener";
      a.textContent = entry.from;
      if (!entry.feedback) a.removeAttribute("href");
      meta.appendChild(a);
    }
    return meta;
  }
  // "You've fed back on this" — with a link to what you actually said, when we have the
  // record id (a comment always; a thumb from KCHSAID1 onwards).
  function saidLine(ref) {
    var said = saidFor(ref);
    if (!said) return null;
    var d = document.createElement("div");
    d.className = "kch-pop-said";
    var t = document.createElement("span");
    t.textContent = "\u2713 " + saidWords(said);
    d.appendChild(t);
    var id = said.last && said.last.id;
    if (id) {
      var a = document.createElement("a");
      a.href = feedbackUrl(id);
      a.target = "_blank"; a.rel = "noopener";
      a.textContent = (said.last.tag ? said.last.tag + " " : "") + "\u2197";
      a.title = "Open what you said";
      d.appendChild(a);
    }
    return d;
  }
  function refreshSaidLine(ref) {
    if (!pop) return;
    var existing = pop.querySelector(".kch-pop-said");
    var fresh = saidLine(ref);
    if (existing && fresh) existing.replaceWith(fresh);
    else if (fresh) pop.insertBefore(fresh, pop.querySelector(".kch-pop-detail"));
    else if (existing) existing.remove();
  }

  function togglePop(entry, tagEl) {
    if (openRef === entry.ref) { closePop(); return; }
    closePop();
    openRef = entry.ref;
    popAt = Date.now();
    tagEl.classList.add("kch-open");

    pop = document.createElement("div");
    pop.className = "kch-pop";
    pop.addEventListener("click", function (e) { e.stopPropagation(); });

    var head = document.createElement("div");
    head.className = "kch-pop-head";
    var ref = document.createElement("span"); ref.className = "kch-pop-ref"; ref.textContent = entry.ref;
    var title = document.createElement("span"); title.className = "kch-pop-title"; title.textContent = entry.title || "";
    var x = document.createElement("button"); x.type = "button"; x.className = "kch-pop-x"; x.textContent = "×";
    x.title = "Close (the tag stays)";
    x.onclick = closePop;
    head.append(ref, title, x);

    var detail = detailBlock(entry, "kch-pop-detail", "kch-detail-" + entry.ref);
    var foot = document.createElement("div");
    foot.className = "kch-pop-foot";
    var kfb = kfbFor(entry, detail.id);
    var done = document.createElement("button");
    done.type = "button"; done.className = "kch-pop-done";
    done.textContent = "✕ Done, remove";
    done.title = "Tick this off your own list (this browser). Separate from feedback \u2014 saying something already greys the tag.";
    done.onclick = function () { markDone(entry.ref); closePop(); place(); if (sheet) renderSheet(); };
    foot.append(kfb, done);

    var said = saidLine(entry.ref);
    pop.append(head, metaLine(entry));
    if (said) pop.appendChild(said);
    pop.append(detail, foot);
    document.body.appendChild(pop);
    renderKfb(kfb);
    positionPop(tagEl);
  }
  document.addEventListener("click", function (e) {
    // The click that OPENED a note is still bubbling when it is opened from the list
    // (the row is gone by then, so neither test below can recognise it) — that click
    // must not close the note it just asked for.
    if (Date.now() - popAt < 350) return;
    if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest(".kch-tag"))) closePop();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (sheet) closeSheet(); else closePop();
  });

  // ── the list ───────────────────────────────────────────────────────────────
  function showOnPage(entry) {
    closeSheet();
    setOn(true);
    var a = anchorFor(entry);
    if (a && a.scrollIntoView) { try { a.scrollIntoView({ block: "center", inline: "center" }); } catch (e) { a.scrollIntoView(); } }
    place();
    var rec = tags[entry.ref];
    if (!rec) return false;
    rec.el.classList.add("kch-flash");
    setTimeout(function () { rec.el.classList.remove("kch-flash"); }, 1900);
    togglePop(entry, rec.el);
    return true;
  }
  function cueFor(ctx) {
    var span = document.createElement("span");
    span.className = "kch-cue kch-cue--" + ctx.state;
    span.textContent =
      ctx.state === "here" ? "● on this page — show me" :
      ctx.state === "go" ? "→ " + ctx.label :
      ctx.state === "page" ? "◐ here — " + ctx.needs :
      "○ " + ctx.needs;
    return span;
  }
  function makeRow(entry) {
    var ctx = contextOf(entry);
    var row = document.createElement("div");
    row.className = "kch-row";
    row.dataset.ref = entry.ref;

    var main = document.createElement("button");
    main.type = "button";
    main.className = "kch-row-main";
    var ref = document.createElement("span"); ref.className = "kch-row-ref"; ref.textContent = entry.ref;
    var body = document.createElement("div"); body.className = "kch-row-body";
    var t = document.createElement("div"); t.className = "kch-row-title"; t.textContent = entry.title || "";
    var sub = document.createElement("div"); sub.className = "kch-row-sub";
    sub.textContent = fmtDate(entry.at) + (entry.from ? " · " + entry.from : "");
    body.append(t, sub, cueFor(ctx));
    var said = saidFor(entry.ref);
    if (said) {
      row.classList.add("kch-row--said");
      var pill = document.createElement("span");
      pill.className = "kch-said-pill";
      pill.textContent = "\u2713 " + (said.comments ? "\u{1F4AC}" : (said.verdict === "down" ? "\u{1F44E}" : "\u{1F44D}")) + " fed back";
      pill.title = saidWords(said);
      body.appendChild(pill);
    }
    main.append(ref, body);

    var chev = document.createElement("button");
    chev.type = "button";
    chev.className = "kch-row-chev";
    chev.textContent = "⌄";
    chev.title = "Read it here, and comment, without leaving this page";
    chev.setAttribute("aria-label", "Expand " + entry.ref);

    var top = document.createElement("div");
    top.className = "kch-row-top";
    top.append(main, chev);
    row.appendChild(top);

    function expand() {
      if (row.querySelector(".kch-row-open")) { row.querySelector(".kch-row-open").remove(); chev.textContent = "⌄"; return; }
      var open = document.createElement("div");
      open.className = "kch-row-open";
      var detail = detailBlock(entry, "kch-row-detail", "kch-rowdetail-" + entry.ref);
      var foot = document.createElement("div"); foot.className = "kch-row-foot";
      var kfb = kfbFor(entry, detail.id);
      var right = document.createElement("div");
      right.style.display = "flex"; right.style.gap = "8px"; right.style.alignItems = "center";
      if (ctx.state === "go" || ctx.state === "here") {
        var go = document.createElement("button");
        go.type = "button"; go.className = "kch-row-go";
        go.textContent = ctx.state === "here" ? "Show me →" : "Take me there →";
        go.onclick = function () { act(); };
        right.appendChild(go);
      }
      var done = document.createElement("button");
      done.type = "button"; done.className = "kch-pop-done";
      done.textContent = "✕ Done, remove";
      done.onclick = function () { markDone(entry.ref); renderSheet(); };
      right.appendChild(done);
      foot.append(kfb, right);
      var rowSaid = saidLine(entry.ref);
      open.appendChild(metaLine(entry));
      if (rowSaid) open.appendChild(rowSaid);
      open.append(detail, foot);
      row.appendChild(open);
      renderKfb(kfb);
      chev.textContent = "⌃";
    }
    function act() {
      if (ctx.state === "here") { if (!showOnPage(entry)) expand(); return; }
      if (ctx.state === "go") {
        var u = ctx.url + (ctx.url.indexOf("?") === -1 ? "?" : "&") + "kch=" + encodeURIComponent(entry.ref);
        location.href = u;
        return;
      }
      expand();
    }
    main.onclick = act;
    chev.onclick = expand;
    return { el: row, expand: expand };
  }
  function renderSheet() {
    if (!sheet) return;
    var list = sheet.querySelector(".kch-sheet-list");
    var entries = liveEntries();
    list.textContent = "";
    sheet.querySelector(".kch-sheet-count").textContent =
      entries.length ? entries.length + " open" : "";
    if (!entries.length) {
      var e = document.createElement("div");
      e.className = "kch-sheet-empty";
      e.textContent = "Nothing outstanding — every change is ticked off or older than two weeks.";
      list.appendChild(e);
      return;
    }
    var note = document.createElement("div");
    note.className = "kch-sheet-note";
    note.textContent = "Tap a change to see it where it happened, or ⌄ to read and comment here. ✕ Done is remembered in this browser.";
    list.appendChild(note);
    entries.forEach(function (entry) { list.appendChild(makeRow(entry).el); });
  }
  function openSheet(focusRef) {
    injectCSS();
    if (sheet) { renderSheet(); return; }
    closePop();
    sheet = document.createElement("div");
    sheet.className = "kch-sheet";
    var panel = document.createElement("div");
    panel.className = "kch-sheet-panel";
    var head = document.createElement("div");
    head.className = "kch-sheet-head";
    var b = document.createElement("b"); b.textContent = "🗒️ Changes";
    var count = document.createElement("span"); count.className = "kch-sheet-count";
    var x = document.createElement("button");
    x.type = "button"; x.className = "kch-sheet-x"; x.textContent = "✕";
    x.title = "Close and go back";
    x.setAttribute("aria-label", "Close changes");
    x.onclick = closeSheet;
    head.append(b, count, x);
    var list = document.createElement("div");
    list.className = "kch-sheet-list";
    panel.append(head, list);
    sheet.appendChild(panel);
    sheet.addEventListener("click", function (e) { if (e.target === sheet) closeSheet(); });
    document.body.appendChild(sheet);
    renderSheet();
    if (focusRef) {
      var row = list.querySelector('.kch-row[data-ref="' + focusRef + '"]');
      if (row) {
        row.querySelector(".kch-row-chev").click();
        try { row.scrollIntoView({ block: "center" }); } catch (e) {}
      }
    }
    if (window.katomiaDiagSend) { try { window.katomiaDiagSend("kchanges:list", { entries: liveEntries().length }); } catch (e) {} }
  }
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }

  // ── on / off ───────────────────────────────────────────────────────────────
  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(ON_KEY, on ? "1" : "0"); } catch (e) {}
    injectCSS();
    if (on) { ensureLayer(); watch(); place(); }
    else {
      unwatch(); closePop();
      Object.keys(tags).forEach(function (r) { tags[r].el.remove(); });
      tags = {};
    }
    document.querySelectorAll("[data-menu-kchanges]").forEach(function (b) {
      b.classList.toggle("app-menu-kchanges--on", on);
      b.textContent = (on ? "✓ " : "") + "🗒️ Show changes";
      b.setAttribute("aria-pressed", String(on));
    });
    if (window.katomiaDiagSend) { try { window.katomiaDiagSend("kchanges:toggle", { on: on, entries: pageEntries().length }); } catch (e) {} }
  }

  // ── arrival from a list deep link (?kch=REF) ───────────────────────────────
  function handleArrival() {
    var ref = new URLSearchParams(location.search).get("kch");
    if (!ref) return;
    try {
      var u = new URL(location.href);
      u.searchParams.delete("kch");
      history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
    } catch (e) {}
    var entry = log.filter(function (e2) { return e2.ref === ref; })[0];
    if (!entry) return;
    setOn(true);
    // the thing it changed may be built after load (a board renders async) — look for a
    // few seconds, then fall back to the list with the row open.
    var tries = 0;
    (function look() {
      if (anchorFor(entry)) { showOnPage(entry); return; }
      if (++tries > 20) { openSheet(ref); return; }
      setTimeout(look, 250);
    })();
  }

  function initMenu() {
    rememberBoard();
    var toggles = document.querySelectorAll("[data-menu-kchanges]");
    var lists = document.querySelectorAll("[data-menu-kchanges-list]");
    if (!toggles.length && !lists.length) return;
    isAdmin().then(function (admin) {
      if (!admin) return;
      toggles.forEach(function (b) {
        b.hidden = false;
        b.addEventListener("click", function (e) { e.preventDefault(); setOn(!on); });
      });
      lists.forEach(function (b) {
        b.hidden = false;
        // next frame: this row also closes the ☰ menu (it is an .app-menu-item), and the
        // list reads what is on screen — measured before the menu shuts, every entry
        // anchored inside the menu would read as "on this page".
        b.addEventListener("click", function (e) {
          e.preventDefault();
          requestAnimationFrame(function () { requestAnimationFrame(function () { openSheet(); }); });
        });
      });
      var stored = "0";
      try { stored = localStorage.getItem(ON_KEY) || "0"; } catch (e) {}
      setOn(stored === "1");
      handleArrival();
    });
  }

  window.kchanges = {
    on: function () { return on; },
    set: setOn,
    entries: function () { return log.slice(); },
    open: function () { return liveEntries(); },
    list: openSheet,
    close: closeSheet,
    refresh: schedulePlace
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMenu);
  else initMenu();
})();
