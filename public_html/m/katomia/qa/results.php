<?php
// qa/results.php — QA results feed (QA-UXGRID1): scans this seat's frontend
// kflow log (logs/kflow/kflow.*.jsonl, written by /kflow ← kflow.js and the
// qa/results.html recorder) for test:* checkpoints, and returns them plus the
// CURRENT frontend commit — the dashboard's grid + the recorder's commit
// stamp both come from here. Read-only, same-origin.
declare(strict_types=1);
header('Content-Type: application/json');
header('Cache-Control: no-store');

// current commit — worktree-safe derivation, same as game.php's KFLOW_COMMIT
$kg = dirname($_SERVER['DOCUMENT_ROOT']) . '/.git';
if (is_file($kg) && preg_match('/^gitdir:\s*(.+)$/m', (string)@file_get_contents($kg), $km)) $kg = trim($km[1]);
$khead = trim((string)@file_get_contents("$kg/HEAD"));
if (preg_match('#^ref:\s*(.+)#', $khead, $km)) {
    $kcommon = trim((string)@file_get_contents("$kg/commondir"));
    $kroot = $kcommon ? ($kcommon[0] === '/' ? $kcommon : "$kg/$kcommon") : $kg;
    $khead = trim((string)@file_get_contents($kroot . '/' . trim($km[1])));
}
$commit = preg_match('/^[0-9a-f]{40}$/', $khead) ? substr($khead, 0, 7) : '';

$dir  = dirname($_SERVER['DOCUMENT_ROOT']) . '/logs/kflow';
$days = min(60, max(1, (int)($_GET['days'] ?? 30)));
$events = [];
foreach (glob("$dir/kflow.*.jsonl") ?: [] as $f) {
    if (@filemtime($f) < time() - $days * 86400) continue;
    foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $ln) {
        if (strpos($ln, '"test:') === false) continue;          // cheap prefilter
        $e = json_decode($ln, true);
        if (!is_array($e) || strpos((string)($e['checkpoint'] ?? ''), 'test:') !== 0) continue;
        $events[] = [
            't'          => $e['t'] ?? '',
            'run'        => $e['run'] ?? '',
            'checkpoint' => $e['checkpoint'],
            'v'          => $e['v'] ?? '',
            'commit'     => $e['commit'] ?? '',
            'user'       => $e['user'] ?? '',
            'detail'     => $e['detail'] ?? null,
        ];
    }
}
usort($events, fn($a, $b) => strcmp($a['t'], $b['t']));
echo json_encode(['commit' => $commit, 'events' => $events], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
