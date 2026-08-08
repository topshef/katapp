#!/bin/bash
# mainnet-smoke-cron.sh — MAINNETSMOKE class, runs mainnet-smoke-auto.cjs
# unattended, once a day. Real HBAR spent every run (~0.0115 total) — cadence
# is a deliberate user decision (QA-MAINNETSMOKE1, 2026-07-17: daily). Same
# safety shape as hbarxfer-cron.sh/wc-netswitch-cron.sh: skip if kwallet-mainnet
# has pending items, restore its mode unconditionally after. The script itself
# also skips (not fails) if the sender's balance is below the 1 HBAR floor.
#
# Cron: once daily, off-peak, offset from the testnet crons (see crontab -l).
set -euo pipefail

cd "$(dirname "$0")"
LOG="/var/www/swap.kpay.live-katlab/lab1/logs/qa/mainnet-smoke-cron.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) mainnet-smoke-cron start ==="

set -a; source /opt/kwallet-mainnet/.env; set +a

STATE=$(curl -s "http://127.0.0.1:8791/api/state?token=$KWALLET_TOKEN")
MODE=$(echo "$STATE" | python3 -c "import json,sys;print(json.load(sys.stdin)['mode'])")
# STALE-PENDING FIX (2026-08-08). The guard used to skip on ANY pending item. A
# FAILED run leaves its own unanswered pairing proposal behind, so one failure
# silently muted the test for good: the 2026-08-07 05:20 run died at the join
# step, left a proposal at 05:21, and every run after that skipped — the
# dashboard showed "2 consecutive non-passes" while the truth was "not run
# since". The same trap ate three testnet HBARXFER runs the same night.
# A proposal from hours ago is not a human mid-approval: only RECENT items
# (< STALE_MIN minutes) block. Stale ones are reported loudly and ignored —
# deliberately NOT auto-rejected, since that is a wallet-state change and the
# skip was the actual bug.
STALE_MIN="${STALE_MIN:-30}"
read -r PENDING FRESH STALE <<<"$(echo "$STATE" | STALE_MIN="$STALE_MIN" python3 -c "
import json,sys,time,os
p=json.load(sys.stdin).get('pending',[])
cut=time.time()*1000-float(os.environ['STALE_MIN'])*60000
fresh=[x for x in p if x.get('createdAt',0)>=cut]
print(len(p),len(fresh),len(p)-len(fresh))")"
if [ "$STALE" != "0" ]; then
  echo "WARNING: kwallet-mainnet holds $STALE pending item(s) older than ${STALE_MIN}m — almost certainly abandoned by a previous failed run. NOT skipping for those; clear them with /api/reject if they persist."
fi
if [ "$FRESH" != "0" ]; then
  echo "kwallet-mainnet has $FRESH recent pending item(s) — skipping this run (don't interrupt a human)."
  exit 0
fi

KWALLET_TOKEN="$KWALLET_TOKEN" timeout 240 node mainnet-smoke-auto.cjs
RC=$?

curl -s -X POST "http://127.0.0.1:8791/api/mode?token=$KWALLET_TOKEN" -H "Content-Type: application/json" -d '{"mode":"'"$MODE"'"}' > /dev/null
echo "kwallet-mainnet mode restored to $MODE"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) mainnet-smoke-cron end (exit $RC) ==="
exit $RC
