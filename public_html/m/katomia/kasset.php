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
}
