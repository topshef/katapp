<?php
// /m/feedback — standalone feedback landing page (KAT-FEEDBACK1).
// Normally the widget is triggered in-context by a long-press inside an app
// (e.g. Katomia's game page). This page is the bare fallback: someone lands
// here directly (optionally with ?product=...&note=... query params) and
// gets the same modal auto-opened immediately, with the URL params folded
// into its context payload by the widget itself.

require_once($_SERVER['DOCUMENT_ROOT'] . '/hapi_base.php');
$hapi_base = get_hapi_base();
// KAT-SAMEORIGIN-FE1 (2026-08-21): this page was a bypass — CONFIG and the widget
// src both carried the backend origin regardless of the switch. Same rule as
// m/katomia/config.php: KAT_SAMEORIGIN=1 (and no ?hapi_base= override) hands the
// browser no backend origin; the widget loads from /feedback-widget.js on the
// page origin (root .htaccess → hapi-proxy.php on Lincoln, ProxyPass on GCP).
$kat_env = @parse_ini_file(dirname($_SERVER['DOCUMENT_ROOT']) . '/.env_hapi') ?: [];
$fb_sameorigin = !empty($kat_env['KAT_SAMEORIGIN']) && trim((string)($_GET['hapi_base'] ?? '')) === '';
$fb_widget_src = $fb_sameorigin ? '/feedback-widget.js' : "https://$hapi_base/feedback-widget.js";
if ($fb_sameorigin) $hapi_base = '';
$product = isset($_GET['product']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['product']) : 'feedback-page';
?>
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Send Feedback</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;background:#f7f7f8;color:#333;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;text-align:center}
  </style>
</head>
<body>
  <div>
    <p>Opening the feedback form…</p>
    <p><a href="javascript:void(0)" onclick="window.KFeedbackWidget &amp;&amp; window.KFeedbackWidget.open()">Click here</a> if it didn't open.</p>
    <!-- feedback 7b3d4bbf (2026-08-21): after sending, this page just sat here with
         the spent launcher copy and the only link re-opened the form — "no way to
         get out". A way back, always visible, going wherever the visitor came from
         (or the app home when opened directly). -->
    <p><a href="javascript:void(0)" onclick="history.length > 1 ? history.back() : location.href = '/m/katomia/circles.php'">← Done — go back</a></p>
  </div>

  <script>
    window.CONFIG = { HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>" }
    // GCP feedback 2026-08-13 ("click to open form goes back to form already sent"):
    // returning here via back/forward restores this page from bfcache with the OLD
    // DOM — the auto-open never re-runs and the visitor sees the spent form. On a
    // bfcache restore, open a fresh modal (openModal rebuilds from scratch).
    addEventListener('pageshow', e => {
      if(e.persisted && window.KFeedbackWidget) window.KFeedbackWidget.open()
    })
  </script>
  <!-- KPAD-SELFFEED1: served from the backend (its canonical home) — no local copy -->
  <script src="<?= htmlspecialchars($fb_widget_src, ENT_QUOTES, 'UTF-8') ?>"
          data-product="<?= htmlspecialchars($product, ENT_QUOTES, 'UTF-8') ?>"
          data-auto-open="1"></script>
</body>
</html>
