<?php
// kasset(): cache-bust a same-dir asset with its file mtime, so an edited JS/CSS
// file is refetched immediately — no manual version bump, no hard refresh needed
// (important for mobile testing where hard-refresh is awkward). Falls back to the
// bare path if the file is missing. Local assets only; vendor/CDN keep their own.
// Shared by every page (HEADER-UNIFY); guarded so double-includes stay harmless.
if (!function_exists('kasset')) {
  function kasset($file) {
    $p = __DIR__ . '/' . $file;
    $v = is_file($p) ? filemtime($p) : false;
    return htmlspecialchars($v ? "$file?v=$v" : $file, ENT_QUOTES, 'UTF-8');
  }

  // CACHE-FRESH1 (user 2026-08-05): ?v=mtime only busts caches if the HTML that
  // carries the stamps is itself fresh — and these PHP pages sent NO Cache-Control,
  // so mobile browsers could heuristically serve a stale page whose old ?v= values
  // then pin every asset stale too (counter-flex "fix not visible" incident; a
  // mobile can't hard-refresh, so this must never rely on the user). no-cache =
  // store allowed but MUST revalidate; PHP sends no validators, so a navigation
  // refetches the few-KB HTML and the ?v= stamps do the rest. Runs at include
  // time — kasset.php is required before any output on every page that uses it.
  if (!headers_sent()) {
    header('Cache-Control: no-cache, must-revalidate');
  }
}
