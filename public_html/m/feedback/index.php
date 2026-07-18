<?php
// /m/feedback — standalone feedback landing page (KAT-FEEDBACK1).
// Normally the widget is triggered in-context by a long-press inside an app
// (e.g. Katomia's game page). This page is the bare fallback: someone lands
// here directly (optionally with ?product=...&note=... query params) and
// gets the same modal auto-opened immediately, with the URL params folded
// into its context payload by the widget itself.

require_once($_SERVER['DOCUMENT_ROOT'] . '/hapi_base.php');
$hapi_base = get_hapi_base();
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
  </div>

  <script>
    window.CONFIG = { HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>" }
  </script>
  <!-- KPAD-SELFFEED1: served from the backend (its canonical home) — no local copy -->
  <script src="https://<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>/feedback-widget.js"
          data-product="<?= htmlspecialchars($product, ENT_QUOTES, 'UTF-8') ?>"
          data-auto-open="1"></script>
</body>
</html>
