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

// ═══ KAT-DEPLOY1b (2026-08-05): app base path is DYNAMIC, not a literal ═══
// On swap/labs the app lives at /m/katomia; on a standalone bundle domain
// (app/pat.katomia.com) the app IS the docroot and links must be root-clean —
// the whole point of the bundle. Never hardcode '/m/katomia' in an href/fetch:
// PHP uses $katomiaBase, JS uses KBASE (katomia-core.js) or the same
// location.pathname test inline on core-less pages.
$katomiaBase = (realpath($_SERVER['DOCUMENT_ROOT'] ?? '') === __DIR__) ? '' : '/m/katomia';
// ROOT-MOVE1 (owner 2026-10-31): katapp serves Katomia at the hostname ROOT on lab1
// (lab1.katomia.com/board/<id>, no /m/katomia). The static build renders with the shared
// docroot (its includes need it), so it says "root" explicitly: build-static.sh starts the
// render server with KATOMIA_AT_ROOT=1.
if (getenv('KATOMIA_AT_ROOT') === '1') $katomiaBase = '';
// The same-origin Katomia API. Under /m/katomia it is the app's own hapi/ (the router maps
// /m/katomia/hapi/<x> to /hapi/katomia/<x>); at the root, /hapi/<x> is the backend's WHOLE
// namespace (/hapi/ws, /hapi/kpool/…), so Katomia's calls name /hapi/katomia/ themselves.
// JS has the same pair as window.KBASE / window.KAPI (katomia-core.js).
$katomiaApi = $katomiaBase === '' ? '/hapi/katomia' : $katomiaBase . '/hapi';

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
