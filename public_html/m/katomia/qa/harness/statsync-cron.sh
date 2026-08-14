#!/bin/bash
# statsync-cron.sh — STATSYNC1 regression guard: runs the playnet statsync suites
# unattended, daily, and reports one verdict per suite to the QA grid (kflow
# test:start/test:verdict, same convention as wc-netswitch-auto.cjs).
#
# Suites (all playnet, free, no wallet, no shared resources — safe to run any time):
#   T:STATSYNC-01/-02/-03  statsync-baseline.cjs  (protocol: convergence, delta
#                          equivalence, gap→catch-up — 15 assertions)
#   T:STATSYNC-04          statsync-frontend.cjs  (real board via Playwright:
#                          delta page ≡ full-state page, forced-gap self-heal)
#
# Purpose (user, 2026-08-14): the migration-grade detail already exists in these
# harnesses; this just re-runs them daily so future tweaks that break the
# incremental-state path get caught, not discovered. No --record: benchmark
# snapshots stay a manual per-phase act, the cron only asserts correctness.
#
# Cron: daily 04:10 UTC — see crontab -l. Logs to logs/qa/statsync-cron.log.
set -uo pipefail

cd "$(dirname "$0")"
LOG="/var/www/swap.kpay.live-katlab/lab1/logs/qa/statsync-cron.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) statsync-cron start ==="

RUN="statsync-$(date +%s | xargs printf '%x')"
COMMIT=$(curl -s "https://lab1.katlab.kpay.live/m/katomia/qa/results.php?days=1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('commit',''))" 2>/dev/null || echo "")

kflow(){ # $1 checkpoint  $2 v  $3 instance  $4 note
  curl -s -X POST "https://lab1.katlab.kpay.live/kflow" -H "Content-Type: application/json" -d "{
    \"events\": [{ \"t\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\", \"run\": \"$RUN\",
      \"seq\": $([ "$1" = "test:start" ] && echo 1 || echo 2), \"tier\": \"fe\",
      \"checkpoint\": \"$1\", \"v\": \"$2\", \"commit\": \"$COMMIT\",
      \"detail\": { \"source\": \"cron\", \"instance\": \"$3\", \"note\": \"$4\" } }] }" > /dev/null
}

# verdict per suite from the harness output: fail if that suite printed a ❌,
# error if the harness itself died (no assertion lines at all for the suite).
verdict_for(){ # $1 suite-id  $2 output-file  $3 harness-rc
  if grep -q "❌ T:$1\." "$2"; then echo fail
  elif grep -q "T:$1\." "$2"; then echo pass
  else echo error; fi
}

OUT_P=$(mktemp) OUT_F=$(mktemp)
trap 'rm -f "$OUT_P" "$OUT_F"' EXIT

for S in STATSYNC-01 STATSYNC-02 STATSYNC-03 STATSYNC-04; do kflow "test:start" "$S" "$S" ""; done

SAMPLE_GAME= timeout 180 node statsync-baseline.cjs > "$OUT_P" 2>&1; RC_P=$?
timeout 240 node statsync-frontend.cjs > "$OUT_F" 2>&1; RC_F=$?

for S in STATSYNC-01 STATSYNC-02 STATSYNC-03; do
  V=$(verdict_for "$S" "$OUT_P" "$RC_P")
  kflow "test:verdict" "$V" "$S" "rc=$RC_P"
  echo "$S: $V"
done
V=$(verdict_for STATSYNC-04 "$OUT_F" "$RC_F")
kflow "test:verdict" "$V" "STATSYNC-04" "rc=$RC_F"
echo "STATSYNC-04: $V"

# keep the assertion lines (and only those) in the log — enough to see WHAT failed
grep -E "✅|❌|HARNESS ERROR" "$OUT_P" || true
grep -E "✅|❌|HARNESS ERROR|page errors" "$OUT_F" || true

RC=$(( RC_P || RC_F ? 1 : 0 ))
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) statsync-cron end (exit $RC) ==="
exit $RC
