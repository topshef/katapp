/* kfade.js — ENTRY-FADES1 (user 2026-07-30)
 *
 * The QUIET page transition. kbubbleOpen (kbubbleopen.js) is the loud one — the
 * border inflating into a window onto the target page — and the user's ruling is
 * that it is reserved for ENTERING a circle. Everything else (hamburger
 * destinations, create form, profile, admin) still needs the jolt taken off, but
 * must stay serious: a plain page flip reads as a jump cut.
 *
 * So: cross-fade, like a film scene change. Fade the outgoing page down while the
 * incoming one comes up. No sliding — the user explicitly ruled sliding out
 * ("cool in its time, but it's a physical analogy of pulling something down");
 * fades are gentler and carry no spatial metaphor.
 *
 * Design constraints that shaped this:
 *  - MUST load in <head>, not at the end of <body>. The fade-IN is a CSS animation
 *    on <body> armed by a class on <html>; arming it after paint would flash the
 *    content first and then fade it, which is worse than no transition.
 *  - MUST fail visible. If JS dies, no class is ever added and the page renders
 *    normally. The fade-out class is also cleared on pageshow so a bfcache
 *    back-navigation can never strand a page at opacity 0.
 *  - Respects prefers-reduced-motion: both directions become no-ops.
 *
 * Usage:  <script src="kfade.js"></script>   (in <head>, before the stylesheet is fine)
 * Opt out of the fade for one link:  <a data-kfade="off" ...>
 * Opt out for a whole page:          <html data-kfade="off">  or  kfade.enabled = false
 */
(function () {
  "use strict";

  var OUT_MS = 170;   // outgoing page fades down — short, this is dead time
  var IN_MS  = 260;   // incoming page comes up a touch slower — feels like arrival

  var doc = document;
  var root = doc.documentElement;

  var reduced = false;
  try {
    reduced = window.matchMedia &&
              window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  var api = {
    enabled: !reduced,
    outMs: OUT_MS,
    inMs: IN_MS,
    /* Fade out, then run done(). Used by the link interceptor and callable
       directly for programmatic navigation (form submits, JS redirects). */
    leave: leave,
    /* Escape hatch: cancel a fade-out that is in flight. */
    cancel: cancel
  };
  window.kfade = api;

  if (reduced) return;   // nothing injected, nothing armed — plain navigation

  // ── styles ────────────────────────────────────────────────────────────────
  var style = doc.createElement("style");
  style.textContent =
    "@keyframes kfadeIn{from{opacity:0}to{opacity:1}}" +
    "html.kfade-in body{animation:kfadeIn " + IN_MS + "ms ease both}" +
    "html.kfade-out body{opacity:0;transition:opacity " + OUT_MS + "ms ease}" +
    /* Never let a half-faded page eat clicks — once we're leaving, the UI is
       inert anyway and a stray click on the next page's coordinates is worse. */
    "html.kfade-out body{pointer-events:none}";
  (doc.head || root).appendChild(style);

  // ── fade in ───────────────────────────────────────────────────────────────
  root.classList.add("kfade-in");

  // ── fade out ──────────────────────────────────────────────────────────────
  var leaving = false;
  var timer = null;

  function cancel() {
    leaving = false;
    if (timer) { clearTimeout(timer); timer = null; }
    root.classList.remove("kfade-out");
  }

  function leave(done) {
    if (!api.enabled) { done && done(); return; }
    if (leaving) return;            // a second click must not queue a second nav
    leaving = true;
    root.classList.add("kfade-out");
    timer = setTimeout(function () {
      timer = null;
      done && done();
    }, api.outMs);
  }

  /* A page restored from bfcache keeps whatever classes it had when it left —
     including kfade-out, which would show a blank page. Reset on the way back in. */
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) cancel();
  });

  // ── link interception ─────────────────────────────────────────────────────
  function optedOut(el) {
    for (var n = el; n && n !== doc; n = n.parentNode) {
      if (n.getAttribute && n.getAttribute("data-kfade") === "off") return true;
    }
    return root.getAttribute("data-kfade") === "off";
  }

  doc.addEventListener("click", function (e) {
    if (!api.enabled) return;
    // Modified clicks are the user asking for a new tab/window — leave them alone.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
        e.shiftKey || e.altKey) return;

    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;

    // kbubbleOpen owns its own links — it runs the loud transition and navigates
    // itself. Double-handling would fade the page out from under the bubble.
    if (a.hasAttribute("data-kbubble-open") || a.classList.contains("kbubble-open")) return;

    if (a.target && a.target !== "_self") return;      // new tab/frame
    if (a.hasAttribute("download")) return;
    if (optedOut(a)) return;

    var href = a.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#") return;                  // in-page anchor
    if (/^(mailto:|tel:|javascript:|data:|blob:)/i.test(href)) return;

    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;                   // off-site

    // Same page + only the hash differs → it's an anchor jump, not a navigation.
    if (url.pathname === location.pathname &&
        url.search === location.search && url.hash) return;

    e.preventDefault();
    leave(function () { location.href = a.href; });
  }, false);
})();
