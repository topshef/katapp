// ┬┌─┌─┐┌─┐┬ ┬   ┌─┐┌┬┐┌┐ ┌─┐┌┬┐
// ├┴┐├─┘├─┤└┬┘   ├┤ │││├┴┐├┤  ││
// ┴ ┴┴  ┴ ┴ ┴    └─┘┴ ┴└─┘└─┘─┴┘
// Drop-in, CDN-style loader for the KPAY signing widget. Lets ANY page open the
// signing modal with nothing but a script tag — no build step, no module wiring.
//
//   <script src="https://<host>/vendor/kpay/kpool_widget/kpay-embed.js" defer></script>
//
// Then either:
//   • Markup-only: put data-kpay-txid (+ data-kpay-network, data-kpay-pch) on any
//     clickable element. Clicking it opens the modal — UNLESS the click lands on a
//     real <a>, so existing detail/hashscan links keep working untouched.
//   • Programmatic: call  window.KPaySign({ network, txid, pch })  yourself.
//
// Endpoints (all same-origin, absolute, so they don't depend on the host page's
// path): tx detail comes from the widget's own /m/bid/explore/kpool reader; the
// signer reads/saves bytes from the "future" endpoint. Override the future base
// with  window.KPAY_FUTURE_BASE  (e.g. "https://swap.kpay.live/future/") and the
// widget asset base with  window.KPAY_WIDGET_BASE  or  data-base="…"  on the tag.
//
// Requires window.WC on the host page for in-browser WalletConnect signing
// (load it the same way the OG page does, e.g. kwcScriptTag.php). Without it the
// modal still opens and shows status; the WalletConnect tab just prompts to
// connect via the other methods.

(function () {
  'use strict'

  if (window.KPaySign) return   // already embedded

  var thisScript = document.currentScript
  var WIDGET_BASE = (thisScript && thisScript.dataset && thisScript.dataset.base)
    || window.KPAY_WIDGET_BASE
    || '/vendor/kpay/kpool_widget'

  var FUTURE_BASE = window.KPAY_FUTURE_BASE || '/future/'

  // ── lazy widget load ──────────────────────────────────────────────────────
  // index.js is an ES module that assigns window.KPOOL = { mount, open, readStatus }.
  // We import it directly (rather than via bootstrap.js) so there's no build-banner
  // dependency — keeps the embed portable on third-party pages.
  var _loading = null
  function ensureWidget() {
    if (window.KPOOL && window.KPOOL.open) return Promise.resolve()
    if (_loading) return _loading

    _loading = new Promise(function (resolve, reject) {
      if (!window.__BUILD_HASH__) window.__BUILD_HASH__ = Date.now()
      var url = WIDGET_BASE + '/index.js?v=' + window.__BUILD_HASH__

      var s = document.createElement('script')
      s.type = 'module'
      s.textContent =
        'import(' + JSON.stringify(url) + ')' +
        '.catch(function(e){ console.error("[kpay-embed] widget load failed", e) })'
      document.head.appendChild(s)

      var tries = 0
      var poll = setInterval(function () {
        if (window.KPOOL && window.KPOOL.open) { clearInterval(poll); resolve() }
        else if (++tries > 240) { clearInterval(poll); reject(new Error('kpay-embed: KPOOL not ready')) }
      }, 25)
    })
    return _loading
  }

  // ── default endpoints (signer) ──────────────────────────────────────────────
  function futureReadUrl(o) {
    return FUTURE_BASE + '?action=txRead'
      + '&network=' + encodeURIComponent(o.network)
      + '&txid='    + encodeURIComponent(o.txid)
  }
  function futureSaveUrl() { return FUTURE_BASE + '?action=txSave' }

  // ── singleton modal tracking ─────────────────────────────────────────────────
  // Only one modal can be open at a time. The view layer uses document.getElementById
  // with fixed IDs (txread-precheck, txread-status, etc.) so two concurrent modals
  // would cause getElementById to target the wrong DOM element, showing stale data
  // from a previous transaction until the older modal's DOM is removed.
  var _currentModal = null

  function closeCurrentModal() {
    if (!_currentModal) return
    try { _currentModal.close() } catch (e) {}
    _currentModal = null
  }

  // ── public entry ─────────────────────────────────────────────────────────────
  window.KPaySign = function (opts) {
    opts = opts || {}
    if (!opts.network || !opts.txid) {
      console.warn('[kpay-embed] KPaySign needs { network, txid }')
      return Promise.resolve(null)
    }

    closeCurrentModal()

    var callerOnClose = opts.brand && opts.brand.onClose
    var brand = Object.assign({}, opts.brand || {}, {
      onClose: function () { _currentModal = null; if (callerOnClose) callerOnClose() }
    })

    return ensureWidget().then(function () {
      return window.KPOOL.open({
        network: opts.network,
        txid:    opts.txid,
        pch:     opts.pch || 'no_pch',
        readUrl: opts.readUrl || futureReadUrl,   // signer byte fetch
        saveUrl: opts.saveUrl || futureSaveUrl,   // signer write-back
        brand:   brand
      }).then(function (modal) {
        _currentModal = modal
        return modal
      })
    })
  }

  // ── markup-only wiring ───────────────────────────────────────────────────────
  // Delegated so it works for rows rendered after this script runs. A click on a
  // real <a> is left alone (test/detail links keep working); anything else inside
  // a [data-kpay-txid] element opens the modal.
  document.addEventListener('click', function (e) {
    if (e.target.closest('a')) return
    var el = e.target.closest('[data-kpay-txid]')
    if (!el) return
    e.preventDefault()
    window.KPaySign({
      network: el.getAttribute('data-kpay-network'),
      txid:    el.getAttribute('data-kpay-txid'),
      pch:     el.getAttribute('data-kpay-pch') || undefined
    })
  })
})()
