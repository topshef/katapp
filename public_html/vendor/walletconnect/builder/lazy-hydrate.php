<?php
/**
 * lazy-hydrate.php
 *
 * Pull-through cache for missing kwc build artifacts.
 *
 * Apache rewrites any /releases/<version>/* or /snapshots/<hash>/* request whose
 * file exists neither locally nor in the shared store to this script. It fetches
 * the artifact set from the first origin with a VALID copy, persists it (into the
 * shared store when present, so every seat on this box benefits), then serves it.
 *
 * This is the cross-server hydration path: to hydrate between castles, add the
 * other servers' builder URLs to $origins below. Within one box the shared store
 * (snapshots-shared -> /var/www/kwc-snapshots) normally answers first and this
 * script never runs.
 *
 * WC-LABPROP1 hardening (2026-07-19) — the previous version:
 *   - lost its rewrite context on double internal rewrite (REDIRECT_gitCommit
 *     unset -> bailed with a 200 'UJ39848' console.log stub)
 *   - tested an undefined $ext, so even a good fetch never registered as success
 *   - persisted origin ERROR BODIES as the artifact (origins answer 200 for their
 *     own hydrate errors) — that is how 52-byte stubs got written under immutable
 *     snapshot paths on lab1/main
 * Now: context is re-derived from the request URI, bodies are validated before
 * being persisted, failures are real 404s with no-store, self-origin is skipped,
 * and hydrate sub-requests carry X-KWC-Hydrate so two hydrators can never recurse
 * into each other.
 */

require_once "{$_SERVER['DOCUMENT_ROOT']}/assets/php/elog.php";

// a fellow hydrator asking us — we don't have the file either (or Apache would have
// served it before rewriting to us). Answer 404 immediately, never recurse.
if (!empty($_SERVER['HTTP_X_KWC_HYDRATE']))
    hydrate_fail(404, 'UJ39849 no artifact here (hydrate sub-request, not recursing)');

// -------------------------------
// Context — the request URI is the reliable source (REDIRECT_* env vars gain a
// REDIRECT_ prefix per internal rewrite round and get lost); envs are fallback.
// -------------------------------
$appName     = 'kwc';
$appFilename = 'kwc.iife';
$appVersion  = false;
$gitCommit   = false;

$reqPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
if (preg_match('#/releases/([^/]+)/#', $reqPath, $m)) $appVersion = $m[1];
elseif (preg_match('#/snapshots/([a-f0-9]{7,40})/#', $reqPath, $m)) $gitCommit = $m[1];

if (!$appVersion && !$gitCommit) foreach ($_SERVER as $k => $v) {
    if ($v && substr($k, -9) === 'gitCommit' && preg_match('/^[a-f0-9]{7,40}$/', $v)) $gitCommit = $v;
    if ($v && substr($k, -10) === 'appVersion') $appVersion = $v;
}

// mutable pointers (latest/hottest/dirty) are seat-local by design — never hydrated
if (!$appVersion && !$gitCommit)
    hydrate_fail(404, 'UJ39848 invalid hydrate context (no immutable version in request)');

$buildDir = $appVersion ? "releases/$appVersion" : "snapshots/$gitCommit";

// snapshots persist into the shared store when the symlink exists (all seats gain
// the artifact at once); releases, or store-less installs, stay local.
$snapRoot = ($gitCommit && is_dir(__DIR__ . '/snapshots-shared')) ? __DIR__ . '/snapshots-shared' : __DIR__ . '/snapshots';
$localDir = $appVersion ? __DIR__ . "/releases/$appVersion" : "$snapRoot/$gitCommit";

// -------------------------------
// Origins (no trailing slash). Self is skipped at fetch time, so the same list
// can ship everywhere. Cross-server: append other castles' builder URLs here.
// -------------------------------
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ SECURITY 2026-08-28 (KWC-HYDRATE-KILL1): AUTO-HYDRATION DISABLED.       │
// │                                                                         │
// │ Every origin below resolves to 176.126.78.48 — the box breached in the  │
// │ Aug 2026 incident. This script fetched a WALLET-SIGNING BUNDLE from     │
// │ them with NO hash/signature check (looks_valid() only tests size and a  │
// │ stub prefix), persisted it to disk, and served it under a 1-year        │
// │ `immutable` Cache-Control. That is a trojaned-bundle / wallet-drainer   │
// │ path that silently defeats the whole clean-rebuild + pin-by-hash        │
// │ process, and it triggers precisely when a pinned bundle is MISSING.     │
// │                                                                         │
// │ Snapshots are now placed deliberately and verified by SHA256 before     │
// │ serving (see the KWC deploy handover). A missing bundle must FAIL LOUD, │
// │ never self-heal from an untrusted origin.                               │
// │                                                                         │
// │ Do NOT re-enable by re-adding hosts. If cross-seat hydration is ever    │
// │ wanted again it must: (1) fetch only from trusted, post-breach-verified │
// │ origins, and (2) verify a published SHA256 before persisting.           │
// └─────────────────────────────────────────────────────────────────────────┘
hydrate_fail(404, 'KWC-HYDRATE-KILL1: auto-hydration disabled (untrusted origins). '
    . 'Place the verified snapshot manually — see the KWC deploy handover.');

$origins = [
    // DISABLED — all of these are 176.126.78.48 (breached box). Kept for reference only.
    // 'https://swap.kpay.live/vendor/walletconnect/builder',
    // 'https://lab1.katlab.kpay.live/vendor/walletconnect/builder',
    // 'https://lab2.katlab.kpay.live/vendor/walletconnect/builder',
    // 'https://lab3.katlab.kpay.live/vendor/walletconnect/builder',
];
$selfHost = strtolower($_SERVER['HTTP_HOST'] ?? '');

// must match the naming in build.sh — the .js is the artifact, the rest is best-effort
$requiredFile  = "$appFilename.js";
$optionalFiles = ["$appFilename.js.map", 'build.md', 'build.json', 'release.json', "$appName.tar.gz"];

// WC-HYDRATE404 (2026-08-07) — what was ACTUALLY asked for. Previously this script
// assumed every request routed here wanted the .js, hydrated the set and served
// kwc.iife.js regardless of the filename in the URI. The kwc bundle probes for a
// release.json that only 6 of 48 snapshots have, so that probe fell through to here
// and got back the 3.2MB bundle as 'application/javascript' with an immutable
// year-long cache header — twice per board page load, and a fat contributor to the
// request bursts that were tripping mod_evasive.
$requestedFile = basename(parse_url($reqPath, PHP_URL_PATH) ?: '');
if (!in_array($requestedFile, array_merge([$requiredFile], $optionalFiles), true))
    hydrate_fail(404, "DW39245 '$requestedFile' is not a kwc artifact — not hydrating");

$isSuccess = false;
$debug = [];

foreach ($origins as $origin) {
    if (strtolower(parse_url($origin, PHP_URL_HOST) ?: '') === $selfHost) continue;

    $raw = fetch_artifact("$origin/$buildDir/$requiredFile");
    if (!looks_valid($requiredFile, $raw)) {
        $debug[] = "DW39244 no valid $requiredFile at $origin/$buildDir";
        continue;
    }
    if (!atomic_write("$localDir/$requiredFile", $raw))
        hydrate_fail(500, "RH23744 failed to save valid artifact $appName $appVersion $gitCommit");
    $isSuccess = true;

    foreach ($optionalFiles as $filename) {
        $opt = fetch_artifact("$origin/$buildDir/$filename");
        if (looks_valid($filename, $opt)) atomic_write("$localDir/$filename", $opt);
    }
    break;
}

if (!$isSuccess) {
    elog($debug, 'lazy-hydrate: all origins failed');
    hydrate_fail(404, "DW39244 failed to hydrate $buildDir from any origin");
}

elog("lazy-hydrate: hydrated $buildDir into $localDir");

// -------------------------------
// Serve the file that was requested — not always the js (WC-HYDRATE404)
// -------------------------------
$servePath = "$localDir/$requestedFile";
if (!file_exists($servePath) || !($size = filesize($servePath))) {
    // The required .js hydrated, but this optional member does not exist at the
    // origin either. It genuinely is not in this snapshot — say so, and say it
    // cheaply, so the caller stops asking.
    if ($requestedFile !== $requiredFile)
        hydrate_fail(404, "DW39246 '$requestedFile' not present in $buildDir at any origin");
    hydrate_fail(500, 'JS94833 hydrated js missing/empty after success');
}

$types = [
    'js'  => 'application/javascript', 'map' => 'application/json',
    'json' => 'application/json',      'md'  => 'text/markdown; charset=utf-8',
    'gz'  => 'application/gzip',
];
$ext = strtolower(pathinfo($requestedFile, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Content-Length: ' . $size);
header('Cache-Control: public, max-age=31536000, immutable'); // only immutable versions reach this point
readfile($servePath);
exit;


// -------------------------------
// Helpers
// -------------------------------

function fetch_artifact($url) {
    $context = stream_context_create(['http' => [
        'ignore_errors' => true,
        'timeout'       => 20,
        'header'        => "X-KWC-Hydrate: 1\r\n",
    ]]);
    $raw = @file_get_contents($url, false, $context);
    $status = get_final_status($http_response_header ?? []);
    if ($status < 200 || $status >= 300) { elog("YH83744 status=$status fetching $url"); return false; }
    return $raw;
}

// never persist an origin's error body as an artifact — that is the poison vector
function looks_valid($filename, $raw) {
    if ($raw === false || !strlen($raw)) return false;
    if (strncmp($raw, "console.log('", 13) === 0) return false;       // legacy 200-stub from an unfixed origin
    if (substr($filename, -3) === '.js' && strlen($raw) < 10240) return false; // real bundles are MBs, stubs are bytes
    return true;
}

function hydrate_fail($status, $msg) {
    elog("lazy-hydrate fail $status: $msg");
    http_response_code($status);
    header('Content-Type: text/plain');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    exit("hydrate: $msg");
}

function get_final_status(array $headers) {
    $status = 0;
    foreach ($headers as $line)
        if (strpos($line, 'HTTP/') === 0 && preg_match('#HTTP/\S+\s+(\d+)#', $line, $m)) $status = (int)$m[1];
    return $status;
}

function atomic_write($path, $data) {
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) return false;

    $tmp = $path . '.tmp.' . uniqid('', true);
    if (file_put_contents($tmp, $data, LOCK_EX) === false) { @unlink($tmp); return false; }
    if (!rename($tmp, $path)) { @unlink($tmp); return false; }
    @chmod($path, 0644);
    return true;
}
