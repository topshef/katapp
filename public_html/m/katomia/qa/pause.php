<?php
// qa/pause.php — QA-ENVCOVERAGE1 (2026-08-26): pause/unpause a QA test instance so
// gridwatch stops alerting on it and the grid shows it as intentionally parked, with a
// reason. Used for tests that are knowingly out of action (e.g. MAINNETSMOKE while the
// mainnet key is rotated/awaiting replacement) or broken-and-triaged harnesses, so a
// stable green plateau isn't drowned in known reds.
//
//   GET  /m/katomia/qa/pause.php            -> { paused: { INSTANCE: {reason,at,by} } }
//   POST /m/katomia/qa/pause.php  (JSON)    -> { instance, paused:true|false, reason }
//
// Stored in the SAME persistent logs area kflow uses, resolved the SAME robust way (so it
// survives redeploys and works on both Lincoln and the GCP release layout).

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// resolve a persistent dir that survives redeploys (mirrors results.php / kflow logic)
function qa_state_dir() {
    $bases = [$_SERVER['DOCUMENT_ROOT'] ?? '', __DIR__];
    foreach ($bases as $b) {
        $p = $b;
        for ($up = 0; $up < 5 && $p && $p !== '/' && $p !== '.'; $up++) {
            if (is_dir("$p/logs")) return "$p/logs";
            $p = dirname($p);
        }
    }
    return dirname($_SERVER['DOCUMENT_ROOT'] ?? __DIR__) . '/logs';
}

$file = qa_state_dir() . '/qa-paused.json';

function load_paused($file) {
    if (!is_file($file)) return [];
    $j = json_decode((string)@file_get_contents($file), true);
    return is_array($j) ? $j : [];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['paused' => load_paused($file)]);
    exit;
}

// ---- write path ----
// Light dev-phase gate: known admin IPs may toggle; others are refused. This is QA-alert
// config, not a security boundary — it just stops randoms muting your alerts.
$ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '')[0]);
$ADMIN_IPS = ['130.185.251.53', '84.66.200.207', '127.0.0.1', '::1', '176.126.78.48'];
if (!in_array($ip, $ADMIN_IPS, true)) {
    http_response_code(403);
    echo json_encode(['error' => 'not authorised to change pause state', 'ip' => $ip]);
    exit;
}

$in = json_decode((string)file_get_contents('php://input'), true) ?: [];
$instance = trim((string)($in['instance'] ?? ''));
if ($instance === '' || !preg_match('/^[A-Za-z0-9._:-]+$/', $instance)) {
    http_response_code(400);
    echo json_encode(['error' => 'valid instance required']);
    exit;
}

$paused = load_paused($file);
if (!empty($in['paused'])) {
    $paused[$instance] = [
        'reason' => substr(trim((string)($in['reason'] ?? '')), 0, 300),
        'at'     => gmdate('Y-m-d\TH:i:s\Z'),
        'by'     => $ip,
    ];
} else {
    unset($paused[$instance]);
}

// atomic write
$tmp = $file . '.tmp';
if (@file_put_contents($tmp, json_encode($paused, JSON_PRETTY_PRINT)) === false || !@rename($tmp, $file)) {
    http_response_code(500);
    echo json_encode(['error' => 'could not persist pause state (dir not writable?)', 'dir' => dirname($file)]);
    exit;
}

echo json_encode(['ok' => true, 'paused' => $paused]);
