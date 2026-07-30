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

// ═══ ENTRY-CIRCLES1 (user 2026-07-30): parameterised product vocabulary ═══
// The word for "the space people meet in" is config, not code. Internally it is
// always a proposal game; only the DISPLAY word moves. See site-config.json's
// terms._comment for the why (audience-dependent framing; 'ring' rejected).
//
// katomiaTerms()    → ['one'=>'circle','One'=>'Circle','many'=>'circles','Many'=>'Circles']
// katomiaTerm('one')→ 'circle'
// katomiaTermFill($s) → substitutes {one}/{One}/{many}/{Many} in any string.
//
// Never concatenate the term by hand — always go through these, so a rename in
// site-config.json is genuinely one edit.
if (!function_exists('katomiaTerms')) {
  function katomiaTerms() {
    static $terms = null;
    if ($terms !== null) return $terms;
    $config = katomiaSiteConfig();
    $space  = $config['terms']['space'] ?? [];
    // Defaults keep every caller safe if the block is missing or half-filled.
    $terms = [
      'one'  => (string)($space['one']  ?? 'circle'),
      'One'  => (string)($space['One']  ?? 'Circle'),
      'many' => (string)($space['many'] ?? 'circles'),
      'Many' => (string)($space['Many'] ?? 'Circles'),
    ];
    return $terms;
  }
}

if (!function_exists('katomiaTerm')) {
  function katomiaTerm($form = 'one') {
    $terms = katomiaTerms();
    return $terms[$form] ?? $terms['one'];
  }
}

if (!function_exists('katomiaTermFill')) {
  function katomiaTermFill($str) {
    if (!is_string($str) || strpos($str, '{') === false) return $str;
    $terms = katomiaTerms();
    return strtr($str, [
      '{one}'  => $terms['one'],
      '{One}'  => $terms['One'],
      '{many}' => $terms['many'],
      '{Many}' => $terms['Many'],
    ]);
  }
}

// Convenience for the common "fill the term, then escape for HTML" pair.
if (!function_exists('katomiaTermEsc')) {
  function katomiaTermEsc($str) {
    return htmlspecialchars(katomiaTermFill((string)$str), ENT_QUOTES, 'UTF-8');
  }
}
