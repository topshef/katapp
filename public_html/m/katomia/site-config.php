<?php
// site-config.php — KATOMIA-CONFIG1: loads site-config.json (git-tracked, see
// .gitignore). Returns [] on any read/parse failure so callers can treat a
// missing/broken config as "nothing configured" rather than fatal.
if (!function_exists('katomiaSiteConfig')) {
  function katomiaSiteConfig() {
    static $config = null;
    if ($config !== null) return $config;
    $path = __DIR__ . '/site-config.json';
    $raw = is_file($path) ? file_get_contents($path) : false;
    $decoded = $raw !== false ? json_decode($raw, true) : null;
    $config = is_array($decoded) ? $decoded : [];
    return $config;
  }
}
