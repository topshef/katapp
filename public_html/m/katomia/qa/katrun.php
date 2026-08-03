<?php
// qa/katrun.php — KATRUN-INDEX1 (user 2026-08-01): one page indexing every katrun
// scenario and continuous demo loop across the seat backends — what exists, its
// published JSON shape, whether it's running right now, and how its last run went.
//
// WHY THIS PAGE. katrun started as a test harness; demonstration (the treats/duo/trio
// circles) grew out of the same machinery, and interactivity is next (DEMO-PROGRESS1's
// trigger-based helpers). The user's direction: publish the SPEC SHAPE internally now,
// so that offering community-authored runs later ("script your own katrun, run it on
// your own instance") is a publishing decision, not a re-engineering one. This page is
// the internal first step — it lives in QA because testing was the first use case.
//
// DATA SOURCES (all read-only, all local):
//  - scenario specs:  /home/hbarlive_hts*/kbot/katrun/*.json   (git-tracked in each
//    backend checkout, so the specs are tamper-evident via the repo history Audrey
//    already freezes — see AUDIT note at the bottom of the page)
//  - demo loops:      /home/hbarlive_hts*/kbot/{board,trio,treats,treats-duo}-demo-loop.js
//  - run records:     /home/hbarlive_hts*/kbot/katrun/output/*.json (newest per testId)
//  - live status:     /proc scan for node processes whose cmdline names the scenario
//    file or loop script (works for pm2- and hand-started runs alike; no pm2 access
//    needed, which www-data doesn't have)
//
// SECRETS: scenario specs reference key ENV NAMES (seedHexEnv/playerTokenEnv), never
// values — but the raw-spec viewer still redacts any long-hex value whose key smells
// like a secret, as a belt against a future scenario breaking that convention.

$BACKENDS = [];
foreach (glob('/home/hbarlive_hts*', GLOB_ONLYDIR) as $d) {
  $name = basename($d) === 'hbarlive_hts' ? 'main' : str_replace('hbarlive_hts-', '', basename($d));
  $BACKENDS[$name] = $d;
}
ksort($BACKENDS);

$DEMO_LOOPS = [
  'board-demo-loop.js'  => ['label' => '📺 two-party demo (chicken⇄ℏ replay)', 'game' => 't-kat-demo'],
  'trio-demo-loop.js'   => ['label' => '📺 three-way swap demo',               'game' => 't-trio'],
  'treats-demo-loop.js' => ['label' => '🎁 triangle rewards (reward bot)',      'game' => 't-treats'],
  'treats-duo-loop.js'  => ['label' => '🎁 first swap (reward bot)',           'game' => 't-duo'],
];

// ── live processes: scan /proc for node cmdlines mentioning our scripts ────────
function liveProcs() {
  $out = [];
  foreach (glob('/proc/[0-9]*/cmdline') as $f) {
    $raw = @file_get_contents($f);
    if ($raw === false || $raw === '') continue;
    $cmd = str_replace("\0", ' ', $raw);
    if (strpos($cmd, 'node') === false) continue;
    if (strpos($cmd, 'katrun') !== false || strpos($cmd, '-demo-loop') !== false
        || strpos($cmd, 'scenario-runner') !== false || strpos($cmd, 'prop-sign') !== false
        || strpos($cmd, 'treats-recycle') !== false)
      $out[] = ['pid' => (int)basename(dirname($f)), 'cmd' => trim($cmd)];
  }
  return $out;
}
$procs = liveProcs();
function runningFor($needle, $procs) {
  foreach ($procs as $p) if (strpos($p['cmd'], $needle) !== false) return $p;
  return null;
}

// ── newest run record per (backend, testId) ────────────────────────────────────
function lastRun($backendDir, $testId) {
  $files = glob($backendDir . '/kbot/katrun/output/*;' . $testId . ';*.json');
  if (!$files) return null;
  sort($files);                       // runId prefix is a sortable timestamp
  $rec = json_decode(@file_get_contents(end($files)), true);
  if (!$rec) return null;
  $txs = is_array($rec['txs'] ?? null) ? count($rec['txs']) : null;
  $expect = $rec['scenarioInput']['expect'] ?? null;
  $verdict = null;                    // PASS iff every expect key matches the counts we can derive
  if ($expect) {
    $verdict = 'PASS';
    if (isset($expect['txCount']) && $txs !== null && $txs !== $expect['txCount']) $verdict = 'FAIL';
    $fills = 0;   // fills ride on the draft tx's source (kpool doorbell shape), not the tx root
    foreach (($rec['txs'] ?? []) as $t) $fills += count($t['source']['fills'] ?? ($t['fills'] ?? []));
    if (isset($expect['fillCount']) && $fills !== $expect['fillCount']) $verdict = 'FAIL';
  }
  return ['file' => basename(end($files)), 'finishedAt' => $rec['finishedAt'] ?? null,
          'txs' => $txs, 'verdict' => $verdict];
}

// ── raw-spec viewer (?spec=<backend>/<file>) with secret-smell redaction ────────
if (isset($_GET['spec'])) {
  header('Content-Type: application/json');
  [$b, $f] = array_pad(explode('/', $_GET['spec'], 2), 2, '');
  $path = ($BACKENDS[$b] ?? '') . '/kbot/katrun/' . basename($f);
  if (!$b || !isset($BACKENDS[$b]) || !preg_match('/\.json$/', $f) || !is_readable($path)) {
    http_response_code(404); echo '{"error":"not found"}'; exit;
  }
  $spec = json_decode(file_get_contents($path), true);
  array_walk_recursive($spec, function (&$v, $k) {
    if (is_string($v) && preg_match('/key|seed|secret|private/i', (string)$k)
        && preg_match('/^[0-9a-f]{32,}$/i', $v)) $v = '«redacted»';
  });
  echo json_encode($spec, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES); exit;
}

// ── collect scenarios per backend ──────────────────────────────────────────────
$rows = [];
foreach ($BACKENDS as $bname => $bdir) {
  foreach (glob($bdir . '/kbot/katrun/*.json') as $sf) {
    $s = json_decode(@file_get_contents($sf), true);
    if (!$s || empty($s['testId'])) continue;
    $proc = runningFor(basename($sf), $procs)
         ?: (strpos($bdir, $bname) !== false ? runningFor('katrun' . ($bname === 'main' ? '' : '-' . $bname), $procs) : null);
    $rows[] = [
      'backend' => $bname, 'file' => basename($sf), 'testId' => $s['testId'],
      'name' => $s['name'] ?? '', 'network' => $s['network'] ?? '?', 'gameId' => $s['gameId'] ?? '(fresh)',
      'mode' => $s['tradingMode'] ?? '?', 'loop' => $s['loopEveryMs'] ?? 0,
      'expect' => $s['expect'] ?? null, 'running' => $proc, 'last' => lastRun($bdir, $s['testId']),
    ];
  }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Katomia QA — katrun index</title>
<style>
  body{ font-family: system-ui, sans-serif; margin: 0 auto; max-width: 1060px; padding: 24px 16px 80px; color: #222; line-height: 1.5; }
  h1{ font-size: 24px; } h2{ font-size: 18px; margin-top: 34px; }
  .note{ color: #777; font-size: 12.5px; }
  a{ color: #2a5a78; }
  table{ border-collapse: collapse; width: 100%; font-size: 13px; }
  th,td{ text-align: left; padding: 6px 8px; border-bottom: 1px solid #e3e0d8; vertical-align: top; }
  th{ font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  code{ background: #f1ede2; border-radius: 4px; padding: 1px 5px; font-size: 12px; }
  .pill{ display:inline-block; font-size: 11px; font-weight: 600; border-radius: 999px; padding: 1px 8px; }
  .on{ background:#e2f2e6; color:#1d8a44; } .off{ background:#eee; color:#777; }
  .pass{ background:#e2f2e6; color:#1d8a44; } .fail{ background:#fbe9e7; color:#b3261e; }
  .scroll{ overflow-x: auto; }
  pre{ background:#23272e; color:#dde3ea; padding: 12px 14px; border-radius: 8px; font-size: 12px; overflow-x:auto; }
</style>
</head>
<body>
<h1>katrun index</h1>
<p class="note">Every scripted run across the seat backends: scenario specs (the published JSON shape),
live status (read off the process table just now), and each scenario's most recent recorded run.
Task <b>KATRUN-INDEX1</b> · spec reference: the <a href="#shape">scenario shape</a> below and each
row's <i>spec</i> link (secret-smelling values redacted). Back to <a href="./">QA home</a>.</p>

<h2>Scenarios</h2>
<div class="scroll"><table>
<tr><th>backend</th><th>testId</th><th>name</th><th>net</th><th>game</th><th>mode</th><th>cadence</th><th>status</th><th>last recorded run</th><th>spec</th></tr>
<?php foreach ($rows as $r): ?>
<tr>
  <td><?= htmlspecialchars($r['backend']) ?></td>
  <td><code><?= htmlspecialchars($r['testId']) ?></code></td>
  <td><?= htmlspecialchars(mb_strimwidth($r['name'], 0, 70, '…')) ?></td>
  <td><?= htmlspecialchars($r['network']) ?></td>
  <td><code><?= htmlspecialchars($r['gameId']) ?></code></td>
  <td><?= htmlspecialchars($r['mode']) ?></td>
  <td><?= $r['loop'] ? 'every ' . round($r['loop'] / 1000) . 's' : 'one-shot' ?></td>
  <td><?= $r['running'] ? '<span class="pill on">running pid ' . $r['running']['pid'] . '</span>' : '<span class="pill off">not running</span>' ?></td>
  <td><?php if ($r['last']): ?>
        <?php if ($r['last']['verdict']): ?><span class="pill <?= strtolower($r['last']['verdict']) ?>"><?= $r['last']['verdict'] ?></span><?php endif; ?>
        <?= $r['last']['txs'] !== null ? $r['last']['txs'] . ' tx' : '' ?>
        <span class="note"><?= $r['last']['finishedAt'] ? date('Y-m-d H:i', (int)($r['last']['finishedAt'] / 1000)) . 'Z' : '' ?></span>
      <?php else: ?><span class="note">no record</span><?php endif; ?></td>
  <td><a href="?spec=<?= urlencode($r['backend'] . '/' . $r['file']) ?>">view</a></td>
</tr>
<?php endforeach; ?>
</table></div>

<h2>Continuous demo loops <span class="note">(same machinery, demonstration use case)</span></h2>
<div class="scroll"><table>
<tr><th>backend</th><th>loop</th><th>game</th><th>status</th><th>watch</th></tr>
<?php foreach ($BACKENDS as $bname => $bdir): foreach ($DEMO_LOOPS as $file => $meta):
  if (!is_file($bdir . '/kbot/' . $file)) continue;
  $proc = null;
  foreach ($procs as $p)
    if (strpos($p['cmd'], $file) !== false && strpos($p['cmd'], $bdir . '/') !== false) { $proc = $p; break; }
?>
<tr>
  <td><?= htmlspecialchars($bname) ?></td>
  <td><?= htmlspecialchars($meta['label']) ?> <span class="note"><?= htmlspecialchars($file) ?></span></td>
  <td><code><?= htmlspecialchars($meta['game']) ?></code></td>
  <td><?= $proc ? '<span class="pill on">running pid ' . $proc['pid'] . '</span>' : '<span class="pill off">not running</span>' ?></td>
  <td><a href="/m/katomia/board/<?= htmlspecialchars($meta['game']) ?>">board</a></td>
</tr>
<?php endforeach; endforeach; ?>
</table></div>

<h2 id="shape">The scenario shape</h2>
<p class="note">This is the JSON contract a run is scripted in — the thing we'd publish for
community-authored runs. Canonical reference: <code>kbot/katrun/README.md</code> in the backend repo
(git-tracked, so the spec's history rides the same audit trail as the code).</p>
<pre>{
  "testId":  "my-scenario",            // trace tag — lands in order memos and the run record name
  "name":    "human label",
  "network": "testnet",
  "gameId":  "KQA1",                   // fixed game, or blank = fresh isolated game per run
  "tradingMode": "orderBook",
  "settleMs": 4000,                    // wait after the last step before recording the outcome
  "loopEveryMs": 120000,               // 0 = one-shot; &gt;0 = continuous, fresh state each loop

  "assets":   { "KUSD": { "id": "0.0.2341021", "decimals": 6 } },
  "defaults": { "minFill": {"numerator":1,"denominator":200000}, "timeInForce": "GTC" },
  "actors":   { "alice": { "accountId": "0.0.4271", "name": "🧪 alice" } },

  "steps": [                           // the script — each step at its offset
    { "waitMs": 500,  "action": "deleteOrders" },
    { "waitMs": 1000, "actor": "alice", "action": "order",
      "offer":   { "asset": "KUSD", "amount": 1000000 },
      "request": { "asset": "KBRL", "amount": 5000000 } }
  ],

  "expect": { "txCount": 1, "fillCount": 1 }   // the verdict — checked per run, lands in kflow
}</pre>

<p class="note"><b>Audit note:</b> scenario specs and the runner are git-tracked in each backend
checkout — their history is inside the commit trail Audrey Hashmore already freezes daily. Run
OUTPUT records and this page's live-status reads are ephemeral by design; if/when this index is
published externally (alpha release), the published copy should be generated + hashed into
Audrey's batch like the other published surfaces, not served live.</p>

</body>
</html>
