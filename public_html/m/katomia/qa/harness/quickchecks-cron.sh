#!/bin/bash
# quickchecks-cron.sh — daily cheap regression probes (user 2026-08-17: flesh out
# the acknowledged-missing tests). No kWallet involvement, so no pending-item
# guard is needed — these can never interrupt a human mid-approval.
#
#   PRIVJOIN-01       private-game join delivers frames (t-private fixture, alpha)
#   CHIPCANARY-01     board geometry canaries banked from data/canaries.json
#                     (paint / settle / containment / rim-geometry, 2 viewports)
#   WCSINGLEINIT-01   exactly one WC client per page load (WC-DOUBLEINIT1)
#   ENRICHCOLD-01     asset-enrich endpoint + cold-profile board (ENRICH-COLDPATH1)
#   GOODWIN-FLOAT-01  demo economy solvency, mirror-truthed (GOODWIN-DEMO class)
#
# Cron: daily, offset from the other QA jobs (see crontab -l).
set -uo pipefail

cd "$(dirname "$0")"
LOG="/var/www/swap.kpay.live-katlab/lab1/logs/qa/quickchecks-cron.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) quickchecks start ==="
export TRIGGER="cron:quickchecks-cron.sh"
RC=0
for H in privjoin-check.cjs chip-canary.cjs wc-singleinit-check.cjs enrichcold-check.cjs goodwin-float-check.cjs; do
  echo "--- $H ---"
  timeout 180 node "$H"
  R=$?
  echo "--- $H exit $R ---"
  [ "$R" != "0" ] && RC=$R
done
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) quickchecks end (exit $RC) ==="
exit $RC
