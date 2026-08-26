<?php
// qa/results.php — QA results feed (QA-UXGRID1): scans this seat's frontend
// kflow log (logs/kflow/kflow.*.jsonl, written by /kflow ← kflow.js and the
// qa/results.html recorder) for test:* checkpoints, and returns them plus the
// CURRENT frontend commit — the dashboard's grid + the recorder's commit
// stamp both come from here. Read-only, same-origin.
//
// FEEDBACK-SESSION BRIDGE (user 2026-07-16, "why isn't my feedback session
// showing up here?"): feedback sessions (long-press -> Start session) emit a
// totally SEPARATE checkpoint vocabulary — session:start/stop/close/abandon —
// which this endpoint never looked at, so they were invisible on the grid by
// construction, not by any test-detection failure. Now also scanned, and
// enriched with the actual feedback TEXT: that text was never in kflow at all
// (it's sent to the BACKEND kfeedback inbox by the widget's Send&close), so
// sessions[] is cross-referenced against that inbox by session id to attach
// it. Two independently-built systems, joined here rather than merged, since
// their jobs differ (kflow = fast breadcrumbs; kfeedback = the durable,
// signed, triaged record) — this endpoint is the seam that makes them read as
// one QA surface, not a merge of the underlying stores.
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

// QA-ENVCOVERAGE1 (2026-08-26): resolve the kflow log dir ROBUSTLY across deploy layouts.
// On Lincoln (lab1/prod) dirname(DOCUMENT_ROOT)/logs/kflow is correct. On the GCP kdeploy
// release layout the docroot is a symlink one level above the real release tree, while
// kflow.php writes via dirname(__DIR__) (real realpath) into releases/logs/kflow — so
// reader and writer diverged and pat's grid stayed empty despite events being logged.
// The qa/ dir sits at a different depth in the two layouts, so don't count dirnames: walk
// up from BOTH the docroot and this file's real path and take the first logs/kflow that
// actually holds kflow files. Falls back to the classic docroot-relative path.
$default = dirname($_SERVER['DOCUMENT_ROOT']) . '/logs/kflow';
$dir = $default;
$bases = [$_SERVER['DOCUMENT_ROOT'] ?? '', __DIR__];
$found = null;
foreach ($bases as $b) {
    $p = $b;
    for ($up = 0; $up < 5 && $p && $p !== '/' && $p !== '.'; $up++) {
        $cand = $p . '/logs/kflow';
        if (glob("$cand/kflow.*.jsonl")) { $found = $cand; break 2; }
        $p = dirname($p);
    }
}
if ($found) $dir = $found;
$days = min(60, max(1, (int)($_GET['days'] ?? 30)));
$events = [];
$sessionsRaw = []; // slug => {slug, id, startedAt, briefing, commit, t}
foreach (glob("$dir/kflow.*.jsonl") ?: [] as $f) {
    if (@filemtime($f) < time() - $days * 86400) continue;
    foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $ln) {
        $isTest = strpos($ln, '"test:') !== false;
        $isSess = strpos($ln, '"session:') !== false;
        if (!$isTest && !$isSess) continue;                      // cheap prefilter
        $e = json_decode($ln, true);
        if (!is_array($e)) continue;
        $cp = (string)($e['checkpoint'] ?? '');
        if ($isTest && strpos($cp, 'test:') === 0) {
            $events[] = [
                't'          => $e['t'] ?? '',
                'run'        => $e['run'] ?? '',
                'checkpoint' => $cp,
                'v'          => $e['v'] ?? '',
                'commit'     => $e['commit'] ?? '',
                'user'       => $e['user'] ?? '',
                'detail'     => $e['detail'] ?? null,
            ];
        } elseif ($isSess && strpos($cp, 'session:') === 0) {
            $slug = (string)($e['v'] ?? '');
            if (!$slug) continue;
            if (!isset($sessionsRaw[$slug])) $sessionsRaw[$slug] = ['slug' => $slug, 'commit' => $e['commit'] ?? ''];
            $s =& $sessionsRaw[$slug];
            if ($cp === 'session:start') { $s['startedAt'] = $e['t'] ?? ''; $s['briefing'] = $e['detail']['briefing'] ?? ''; $s['commit'] = $e['commit'] ?? $s['commit']; }
            if ($cp === 'session:close') $s['closedAt'] = $e['t'] ?? '';
            if ($cp === 'session:abandon') $s['abandoned'] = true;
            unset($s);
        }
    }
}
usort($events, fn($a, $b) => strcmp($a['t'], $b['t']));

// enrich with the actual feedback text from the backend inbox (same box,
// different app — read-only, absolute path; no network hop needed)
$inbox = '/home/hbarlive_hts-alpha/data/feedback/inbox.jsonl';
if ($sessionsRaw && is_file($inbox)) {
    $fh = @fopen($inbox, 'r');
    if ($fh) {
        while (($ln = fgets($fh)) !== false) {
            $r = json_decode($ln, true);
            $slug = $r['diagnostics']['session']['slug'] ?? null;
            if (!$slug || !isset($sessionsRaw[$slug])) continue;
            $msg = preg_replace('/^\[.*?\]\n?/', '', (string)($r['message'] ?? '')); // strip [slug · part i/N]
            $sessionsRaw[$slug]['notes'][] = ['t' => $r['ts'] ?? '', 'text' => $msg];
        }
        fclose($fh);
    }
}
$sessions = array_values($sessionsRaw);
foreach ($sessions as &$s) {
    $notes = $s['notes'] ?? [];
    usort($notes, fn($a, $b) => strcmp($a['t'], $b['t']));
    $s['notes'] = $notes;
}
unset($s);

// COMMIT TIMESTAMPS (user 2026-07-16: "along the top we've got, like, some
// kind of timestamp on the commit... a pseudo timeline, not linear, but a
// measure of time going forward"): the grid's columns are commit hashes with
// no sense of when each landed. Look up each distinct commit's real git
// commit date so the header can show it. `git log` resolves a short (7-char)
// hash fine as long as it's still in this repo's history.
$commits = array_unique(array_filter(array_merge(
    array_column($events, 'commit'), array_column($sessions, 'commit'), [$commit])));
$commitTimes = [];
if ($commits) {
    $repo = escapeshellarg(dirname($_SERVER['DOCUMENT_ROOT']));
    foreach ($commits as $h) {
        $safe = escapeshellarg($h);
        $out = @shell_exec("git -C $repo log -1 --format=%cI $safe 2>/dev/null");
        if ($out) $commitTimes[$h] = trim($out);
    }
}

echo json_encode(['commit' => $commit, 'events' => $events, 'sessions' => $sessions, 'commitTimes' => $commitTimes],
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
