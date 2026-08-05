<?php
// qa/txdata.php — QA-TXLOG1: JSON feed for qa/tx.html. Reads the durable
// per-tx lifecycle rows that lib/qatx.php (wired into diag.php's ingestion)
// writes to logs/qa-tx/qa-tx.<date>.jsonl — one row per Hedera tx ATTEMPT
// (mainnet + testnet), independent of the volatile kdiag ring buffer.
// Read-only, same-origin.
declare(strict_types=1);
header('Content-Type: application/json');
header('Cache-Control: no-store');

$dir  = dirname(__DIR__, 4) . '/logs/qa-tx';
$days = min(90, max(1, (int)($_GET['days'] ?? 14)));
$rows = [];
foreach (glob("$dir/qa-tx.*.jsonl") ?: [] as $f) {
    if (@filemtime($f) < time() - $days * 86400) continue;
    foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $ln) {
        $r = json_decode($ln, true);
        if (is_array($r)) $rows[] = $r;
    }
}
usort($rows, fn($a, $b) => strcmp(
    (string)($b['startAt'] ?? $b['finalizedAt'] ?? ''),
    (string)($a['startAt'] ?? $a['finalizedAt'] ?? '')
));

echo json_encode(['rows' => $rows], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
