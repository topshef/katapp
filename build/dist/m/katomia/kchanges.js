// kchanges.js — KCHANGES1 (user feedback tango-delta-81, 2026-09-06): changes, shown
// on the page they changed.
//
// "Whenever we put in a change, we can visually post-it-note that change on the screen
//  … a short reference, a letter and two numbers … fade out over a week, gone after two
//  … tap it and you get information about the change … an x to close and remove the
//  post-it … thumbs up, thumbs down, comment … toggled on and off from the hamburger
//  menu, admin only."
//
// WHAT IT IS
//   A log of shipped changes (kchanges-log.js, one entry per change, hand-written by
//   whoever ships it) and, for an admin who has switched it on, a small 🗒️ tag beside
//   each changed thing on the current page. Tap the tag: what changed, when, which
//   feedback asked for it, and the same 👍 👎 💬 control the Learn page uses — so the
//   follow-up lands in the SAME feedback queue the change came from, quoting its own
//   reference. ✕ ticks it off: a personal checklist, kept in this browser only.
//
// WHAT IT IS NOT
//   Not a security boundary. Nothing here reveals anything a user can't see already —
//   the changes are on the page whether or not they are labelled. The admin gate keeps
//   dev annotations away from players; it is a courtesy, not a lock, so it may run
//   client-side against the public admin list.
//
// AGE
//   Fresh = full strength. Opacity eases to 35% over 7 days; at 14 days the tag is gone.
//   The reference tells you which batch it came from; the fade tells you how long ago.
//
// ANCHORS
//   Each entry names the pages it applies to and a CSS selector for the thing that
//   changed. The tag sits at the anchor's top-right corner in a fixed overlay layer and
//   re-measures on scroll/resize and on DOM changes (the signing modal and the account
//   modals are built dynamically, so anchors come and go). An entry whose anchor isn't
//   on screen — a backend fix, a rule that changed with no single element to point at —
//   goes in a small tray at the bottom-left instead, so nothing that changed is invisible.
//
// GATE
//   ☰ menu → "🗒️ Show changes" appears when any of these holds:
//     · a live auth record in this browser (katomiaAuthRecords) is for an account in the
//       backend's admin group (GET /katomia/admins — katomiaAccountGroups.json, the same
//       list that decides whose feedback is "actioning")
//     · body.kadmin (the IP-admin disclosure header.php already sets)
//     · ?kchanges=1 on the URL (testing without a phone to authenticate on)
//   The on/off state itself is localStorage (katomia.kchanges.v1), per device.
//
// KBUNDLE-STRIP:kchanges — dev estate only. Standalone bundles should strip this file,
// kchanges-log.js and the menu row (add "kchanges" to STRIP_FEATURES when that matters).
(function () {
  "use strict";

  var ON_KEY = "katomia.kchanges.v1";          // "1" = tags on
  var DONE_KEY = "katomia.kchanges.done.v1";   // JSON array of refs ticked off (✕)
  var ADMINS_KEY = "katomia.kchanges.admins";  // sessionStorage cache of /katomia/admins
  var FADE_DAYS = 7, GONE_DAYS = 14;

  var log = Array.isArray(window.KCHANGES_LOG) ? window.KCHANGES_LOG : [];
  var on = false, layer = null, tray = null, pop = null, openRef = null;
  var tags = {};   // ref -> { el, anchor }

  // ── helpers ────────────────────────────────────────────────────────────────
  function hapiBase() {
    var b = (window.CONFIG && window.CONFIG.HAPI_BASE) || "";
    if (!b) return "";
    return (/^https?:\/\//.test(b) ? b : "https://" + b).replace(/\/$/, "");
  }
  function readDone() { try { return JSON.parse(localStorage.getItem(DONE_KEY)) || []; } catch (e) { return []; } }
  function writeDone(a) { try { localStorage.setItem(DONE_KEY, JSON.stringify(a)); } catch (e) {} }
  function ageDays(entry) {
    var t = Date.parse(entry.at || "");
    return isNaN(t) ? 0 : Math.max(0, (Date.now() - t) / 864e5);
  }
  function strength(entry) {
    var d = ageDays(entry);
    if (d >= GONE_DAYS) return 0;
    return 1 - 0.65 * Math.min(d / FADE_DAYS, 1);
  }
  function onThisPage(entry) {
    var p = location.pathname;
    return (entry.where || []).some(function (w) {
      if (!w.page) return true;
      try { return new RegExp(w.page).test(p); } catch (e) { return false; }
    });
  }
  function anchorFor(entry) {
    var ws = (entry.where || []).filter(function (w) {
      if (!w.page) return true;
      try { return new RegExp(w.page).test(location.pathname); } catch (e) { return false; }
    });
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
      ".kch-tag{position:absolute;pointer-events:auto;display:inline-flex;align-items:center;gap:3px;" +
        "padding:1px 6px 1px 4px;border-radius:9px;background:#fff7c2;color:#5b4a00;border:1px solid #e6cf5a;" +
        "box-shadow:0 1px 4px rgba(0,0,0,.18);font:700 11px/1.5 ui-monospace,Menlo,Consolas,monospace;" +
        "cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;transform:translate(-100%,-55%);" +
        "transition:opacity .2s ease}" +
      ".kch-tag:hover{background:#ffef9a}" +
      ".kch-tag.kch-open{outline:2px solid #2f6fed;outline-offset:1px}" +
      ".kch-tag .kch-ico{font-size:12px;line-height:1}" +
      ".kch-tray{position:fixed;left:8px;bottom:8px;pointer-events:auto;display:flex;flex-wrap:wrap;gap:4px;max-width:60vw;" +
        "z-index:2147483050;align-items:center}" +
      ".kch-tray .kch-tag{position:static;transform:none}" +
      ".kch-tray-lbl{font:600 10px/1 system-ui,sans-serif;color:#6b7482;background:rgba(255,255,255,.85);" +
        "padding:3px 6px;border-radius:6px}" +
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
      ".kch-pop-detail{font-size:13px;color:#374151;white-space:pre-wrap;max-height:40vh;overflow:auto;margin-bottom:8px}" +
      ".kch-pop-cite{font-size:11px;color:#9aa3b2}" +
      ".kch-pop-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid #f0f2f5;padding-top:8px}" +
      ".kch-pop-done{border:1px solid #dde3ec;background:#fff;border-radius:8px;padding:4px 10px;font:600 12px system-ui,sans-serif;" +
        "color:#374151;cursor:pointer}" +
      ".kch-pop-done:hover{border-color:#b91c1c;color:#b91c1c}" +
      // kfeedbits (👍 👎 💬) — same look as learn.php, scoped here so it renders on any page
      ".kch-pop .kfb{display:flex;align-items:center;gap:6px;flex-wrap:wrap}" +
      ".kch-pop .kfb-btn{border:1px solid #dde3ec;background:#fff;border-radius:999px;cursor:pointer;padding:3px 9px;font-size:14px;line-height:1.2}" +
      ".kch-pop .kfb-btn:hover{border-color:#2f6fed}" +
      ".kch-pop .kfb-btn.on{border-color:#2f6fed;background:#eaf1fe}" +
      ".kch-pop .kfb-btn:disabled{opacity:.5;cursor:default}" +
      ".kch-pop .kfb-msg{font-size:12.5px;color:#2f6fed}" +
      ".kch-pop .kfb-msg-warn{color:#b4690e}" +
      ".kch-pop .kfb-lead{display:none}" +
      "@media (prefers-reduced-motion:reduce){.kch-tag{transition:none}}";
    document.head.appendChild(s);
  }

  // ── tags ───────────────────────────────────────────────────────────────────
  function ensureLayer() {
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "kch-layer";
      document.body.appendChild(layer);
    }
    if (!tray) {
      tray = document.createElement("div");
      tray.className = "kch-tray";
      tray.hidden = true;
      document.body.appendChild(tray);
    }
  }
  function makeTag(entry) {
    var t = document.createElement("button");
    t.type = "button";
    t.className = "kch-tag";
    t.dataset.ref = entry.ref;
    t.title = entry.title || entry.ref;
    t.innerHTML = '<span class="kch-ico">🗒️</span><span></span>';
    t.lastChild.textContent = entry.ref;
    t.style.opacity = String(strength(entry));
    t.addEventListener("click", function (e) { e.stopPropagation(); togglePop(entry, t); });
    return t;
  }
  function visibleEntries() {
    var done = readDone();
    return log.filter(function (e) {
      return e && e.ref && strength(e) > 0 && done.indexOf(e.ref) === -1 && onThisPage(e);
    });
  }
  function place() {
    if (!on) return;
    ensureLayer();
    var entries = visibleEntries();
    var seen = {};
    var trayCount = 0;
    entries.forEach(function (entry) {
      seen[entry.ref] = true;
      var a = anchorFor(entry);
      var rec = tags[entry.ref];
      if (!rec) { rec = tags[entry.ref] = { el: makeTag(entry), anchor: null }; }
      rec.anchor = a;
      if (a) {
        if (rec.el.parentNode !== layer) layer.appendChild(rec.el);
        var r = a.getBoundingClientRect();
        // top-right corner of the anchor, nudged in so it overlaps the element it labels
        rec.el.style.left = Math.min(window.innerWidth - 4, r.right - 2) + "px";
        rec.el.style.top = Math.max(8, r.top + 2) + "px";
        rec.el.style.display = (r.bottom < 0 || r.top > window.innerHeight) ? "none" : "";
      } else {
        if (rec.el.parentNode !== tray) tray.appendChild(rec.el);
        trayCount++;
      }
    });
    Object.keys(tags).forEach(function (ref) {
      if (!seen[ref]) { tags[ref].el.remove(); delete tags[ref]; }
    });
    var lbl = tray.querySelector(".kch-tray-lbl");
    if (!lbl) { lbl = document.createElement("span"); lbl.className = "kch-tray-lbl"; tray.prepend(lbl); }
    lbl.textContent = trayCount ? "changes without a spot on this page" : "";
    tray.hidden = !trayCount;
    if (trayCount) tray.style.bottom = (8 + dockedBottomHeight()) + "px";
    if (pop && openRef && tags[openRef]) positionPop(tags[openRef].el);
  }
  // Height of anything docked to the bottom edge (the board's chat dock, a sticky footer)
  // so the tray sits above it instead of covering the send box. Probes the bottom-left
  // corner with the tray itself made transparent to hit-testing.
  function dockedBottomHeight() {
    var prev = tray.style.pointerEvents;
    tray.style.pointerEvents = "none";
    var h = 0;
    try {
      var el = document.elementFromPoint(16, window.innerHeight - 6);
      while (el && el !== document.body && el !== document.documentElement) {
        var cs = getComputedStyle(el);
        if (cs.position === "fixed" || cs.position === "sticky") {
          var r = el.getBoundingClientRect();
          if (r.top > window.innerHeight * 0.4) h = Math.max(h, window.innerHeight - r.top);
          break;
        }
        el = el.parentElement;
      }
    } catch (e) {}
    tray.style.pointerEvents = prev;
    return Math.round(h);
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

  // ── popover ────────────────────────────────────────────────────────────────
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
  function togglePop(entry, tagEl) {
    if (openRef === entry.ref) { closePop(); return; }
    closePop();
    openRef = entry.ref;
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

    var meta = document.createElement("div");
    meta.className = "kch-pop-meta";
    meta.textContent = fmtDate(entry.at) + (entry.from ? " · from your feedback " : "");
    if (entry.from) {
      var a = document.createElement("a");
      a.href = feedbackUrl(entry.feedback) || "#";
      a.target = "_blank"; a.rel = "noopener";
      a.textContent = entry.from;
      if (!entry.feedback) { a.removeAttribute("href"); }
      meta.appendChild(a);
    }

    // The text the 💬 will quote — kfeedbits selects this element's contents and opens
    // the feedback modal, so the follow-up carries the reference in its quote.
    var detail = document.createElement("div");
    detail.className = "kch-pop-detail";
    detail.id = "kch-detail-" + entry.ref;
    // First line is the citation the quote carries (ref + title); shown muted so it reads
    // as a reference, not a repeat of the header.
    var cite = document.createElement("span"); cite.className = "kch-pop-cite";
    cite.textContent = entry.ref + " — " + (entry.title || "");
    detail.appendChild(cite);
    if (entry.detail) detail.appendChild(document.createTextNode("\n" + entry.detail));

    var foot = document.createElement("div");
    foot.className = "kch-pop-foot";
    var kfb = document.createElement("div");
    kfb.setAttribute("data-kfb", "change-" + entry.ref);
    kfb.setAttribute("data-kfb-label", "Change " + entry.ref + ": " + (entry.title || ""));
    kfb.setAttribute("data-kfb-target", "#" + detail.id);
    var done = document.createElement("button");
    done.type = "button"; done.className = "kch-pop-done";
    done.textContent = "✕ Done, remove";
    done.title = "Tick this change off — the tag goes for good in this browser";
    done.onclick = function () {
      var d = readDone(); if (d.indexOf(entry.ref) === -1) d.push(entry.ref); writeDone(d);
      closePop(); place();
    };
    foot.append(kfb, done);

    pop.append(head, meta, detail, foot);
    document.body.appendChild(pop);
    if (window.kfeedbits && window.kfeedbits.render) { try { window.kfeedbits.render(kfb); } catch (e) {} }
    else { kfb.remove(); }
    positionPop(tagEl);
  }
  document.addEventListener("click", function (e) {
    if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest(".kch-tag"))) closePop();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePop(); });

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
      if (tray) tray.hidden = true;
    }
    document.querySelectorAll("[data-menu-kchanges]").forEach(function (b) {
      b.classList.toggle("app-menu-kchanges--on", on);
      b.textContent = (on ? "✓ " : "") + "🗒️ Show changes";
      b.setAttribute("aria-pressed", String(on));
    });
    if (window.katomiaDiagSend) { try { window.katomiaDiagSend("kchanges:toggle", { on: on, entries: visibleEntries().length }); } catch (e) {} }
  }

  function initMenu() {
    var rows = document.querySelectorAll("[data-menu-kchanges]");
    if (!rows.length) return;
    isAdmin().then(function (admin) {
      if (!admin) return;
      rows.forEach(function (b) {
        b.hidden = false;
        b.addEventListener("click", function (e) { e.preventDefault(); setOn(!on); });
      });
      var stored = "0";
      try { stored = localStorage.getItem(ON_KEY) || "0"; } catch (e) {}
      if (stored === "1") setOn(true); else setOn(false);
    });
  }

  window.kchanges = {
    on: function () { return on; },
    set: setOn,
    entries: function () { return log.slice(); },
    refresh: schedulePlace
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMenu);
  else initMenu();
})();
