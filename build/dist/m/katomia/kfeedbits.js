/* kfeedbits.js — ENTRY-VARIANTS1 round 1 (user 2026-07-30)
 *
 * A tiny, reusable "what do you think of THIS bit?" control: 👍 👎 💬.
 *
 * Built generic on purpose. The user's brief: "maybe think about that generically
 * because there might be a few places where we want to do multiple styles tests, and
 * we just want to provide little button of options like that with thumbs down, thumbs
 * up, and comments." First consumer is the explainer/FAQ page (learn.php); the variant
 * switcher for A/B-ing UI options is the same control with a selector in front of it.
 *
 * Why the thumbs POST directly instead of opening the modal:
 *   A thumb has to be ONE tap or it isn't a thumb. The feedback modal is the right
 *   home for prose, not for a verdict. So 👍/👎 send a compact record straight to
 *   /kfeedback (the same endpoint and the same queue the modal writes to — this is
 *   not a second, parallel feedback system), and 💬 opens the modal for anything that
 *   needs words. Both are real: nothing here is a decorative control.
 *
 * The 💬 quote:
 *   The modal already renders a fixed, non-editable quote block above the input when
 *   the page has a live text selection (KPAD-DOCCOMMENT1) — exactly the "user can see
 *   what they're feedbacking on and doesn't have to describe it" behaviour the user
 *   asked for. Rather than inventing a second mechanism, we programmatically select
 *   the item's own text and then open the modal, so the existing quote UI does the
 *   work. The widget's own ✕ still lets them drop the quote.
 *
 * Markup — put this anywhere:
 *   <div data-kfb="faq-atomic" data-kfb-label="FAQ: is it atomic?"></div>
 *   <div data-kfb="sec-areas" data-kfb-scope="section" data-kfb-target="#areas"></div>
 *
 *   data-kfb        (required) stable id for the thing being rated
 *   data-kfb-label  human label sent with the vote; defaults to the target's heading
 *   data-kfb-scope  "item" (default) | "section" — section renders larger
 *   data-kfb-target CSS selector for the element to quote; defaults to the closest
 *                   section/article/li, else the control's parent
 *
 * Nerd-only per-item controls are a CSS concern, not this file's: the page decides
 * which scopes it shows to whom.
 */
(function () {
  "use strict";

  var VOTED_KEY = "katomia.kfeedbits.voted.v1";
  var PRODUCT = (document.documentElement.getAttribute("data-kfb-product")) || "katomia";

  function apiUrl() {
    var base = (window.CONFIG && window.CONFIG.HAPI_BASE) || "";
    if (!base) return "/kfeedback";
    if (!/^https?:\/\//.test(base)) base = "https://" + base;
    return base.replace(/\/$/, "") + "/kfeedback";
  }

  /* Remember this browser's votes so the control can show them back. Purely a UI
     nicety — the record of record is server-side. Never blocks on storage. */
  function readVoted() {
    try { return JSON.parse(localStorage.getItem(VOTED_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeVoted(map) {
    try { localStorage.setItem(VOTED_KEY, JSON.stringify(map)); } catch (e) {}
  }

  function targetEl(host) {
    var sel = host.getAttribute("data-kfb-target");
    if (sel) { var t = document.querySelector(sel); if (t) return t; }
    return host.closest("section,article,li,.kfb-scope") || host.parentElement;
  }

  function labelFor(host) {
    var explicit = host.getAttribute("data-kfb-label");
    if (explicit) return explicit;
    var t = targetEl(host);
    var h = t && t.querySelector("h1,h2,h3,h4,summary,.kfb-title");
    return (h ? h.textContent : (t ? t.textContent : "")).trim().slice(0, 120) || host.getAttribute("data-kfb");
  }

  async function send(host, verdict) {
    var id = host.getAttribute("data-kfb");
    var body = {
      product: PRODUCT,
      message: (verdict === "up" ? "👍" : "👎") + " " + labelFor(host),
      diagnosticsOptIn: false,
      context: {
        url: location.href,
        kind: "kfeedbits-vote",
        itemId: id,
        itemLabel: labelFor(host),
        verdict: verdict,
        // What the page currently calls a "circle" — a vote on wording is
        // meaningless without knowing which wording was on screen.
        terms: (window.KTERMS && window.KTERMS.one) || null
      }
    };
    var res = await fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res;
  }

  function openComment(host) {
    // Select the target's text so the modal picks it up as its quote block.
    var t = targetEl(host);
    var selected = false;
    try {
      if (t && window.getSelection) {
        var r = document.createRange();
        r.selectNodeContents(t);
        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
        selected = true;
      }
    } catch (e) {}

    if (window.KFeedbackWidget) {
      window.KFeedbackWidget.open();
      // Drop our synthetic highlight once the modal has taken its copy, so the page
      // isn't left looking like the user smeared a selection across it.
      setTimeout(function () {
        try { if (selected) window.getSelection().removeAllRanges(); } catch (e) {}
      }, 120);
      return;
    }
    // Widget absent (script blocked / not loaded) — the standalone page still works.
    location.href = "/m/feedback/?product=" + encodeURIComponent(PRODUCT) +
                    "&note=" + encodeURIComponent(labelFor(host));
  }

  function render(host) {
    if (host.dataset.kfbReady) return;
    host.dataset.kfbReady = "1";

    var scope = host.getAttribute("data-kfb-scope") || "item";
    host.classList.add("kfb", "kfb-" + scope);

    var voted = readVoted()[host.getAttribute("data-kfb")];

    var up = document.createElement("button");
    up.type = "button"; up.className = "kfb-btn kfb-up"; up.textContent = "👍";
    up.title = "This is clear / I like this";
    var down = document.createElement("button");
    down.type = "button"; down.className = "kfb-btn kfb-down"; down.textContent = "👎";
    down.title = "This is unclear / I don't like this";
    var chat = document.createElement("button");
    chat.type = "button"; chat.className = "kfb-btn kfb-chat"; chat.textContent = "💬";
    chat.title = "Say something about this — it'll be quoted for you, just type your thoughts";
    var msg = document.createElement("span");
    msg.className = "kfb-msg";

    if (scope === "section") {
      var lead = document.createElement("span");
      lead.className = "kfb-lead";
      lead.textContent = "Was this clear?";
      host.appendChild(lead);
    }
    host.appendChild(up); host.appendChild(down); host.appendChild(chat); host.appendChild(msg);

    function mark(verdict) {
      up.classList.toggle("on", verdict === "up");
      down.classList.toggle("on", verdict === "down");
    }
    if (voted) mark(voted);

    function vote(verdict) {
      return async function () {
        up.disabled = down.disabled = true;
        msg.textContent = "…";
        msg.className = "kfb-msg";
        try {
          var res = await send(host, verdict);
          var m = readVoted(); m[host.getAttribute("data-kfb")] = verdict; writeVoted(m);
          mark(verdict);
          msg.textContent = "Thanks — noted.";
          // KCHSAID1: say what was recorded, so a host that cares (the change notes) can
          // mark its own item as "you've fed back on this" and link to the record. The
          // stored map above is unchanged — this is additive and nobody has to listen.
          var rec = null;
          try { rec = (await res.clone().json()).feedback || null; } catch (e2) {}
          try {
            document.dispatchEvent(new CustomEvent("kfb:voted", { detail: {
              id: host.getAttribute("data-kfb"), verdict: verdict,
              record: rec && rec.id, tag: rec && rec.tag
            } }));
          } catch (e2) {}
        } catch (e) {
          // Say so. A thumb that silently failed is worse than no thumb.
          msg.textContent = "Didn't send — try again?";
          msg.className = "kfb-msg kfb-msg-warn";
          console.warn("[kfeedbits] vote failed", e);
        }
        up.disabled = down.disabled = false;
      };
    }

    up.addEventListener("click", vote("up"));
    down.addEventListener("click", vote("down"));
    chat.addEventListener("click", function () { openComment(host); });
  }

  function scan(root) {
    (root || document).querySelectorAll("[data-kfb]").forEach(render);
  }

  window.kfeedbits = { scan: scan, render: render };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function () { scan(); });
  else scan();
})();
