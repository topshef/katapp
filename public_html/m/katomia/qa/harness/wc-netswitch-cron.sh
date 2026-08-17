#!/bin/bash
# wc-netswitch-cron.sh — WCNETSWITCH class, runs wc-netswitch-auto.cjs unattended
# on a schedule. Same safety shape as hbarxfer-cron.sh (shared testnet kWallet):
# skip entirely if kWallet has pending items (a human may be mid-approval),
# restore its mode unconditionally afterward.
#
# Cron: */120 offset +45min from hbarxfer-cron.sh (see crontab -l) so the two
# don't contend for the shared testnet kWallet in the same run.
set -euo pipefail

cd "$(dirname "$0")"
LOG="/var/www/swap.kpay.live-katlab/lab1/logs/qa/wc-netswitch-cron.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) wc-netswitch-cron start ==="

set -a; source /opt/kwallet/.env; set +a
export TRIGGER="cron:wc-netswitch-cron.sh"

STATE=$(curl -s "http://127.0.0.1:8790/api/state?token=$KWALLET_TOKEN")
MODE=$(echo "$STATE" | python3 -c "import json,sys;print(json.load(sys.stdin)['mode'])")
# STALE-PENDING FIX (2026-08-08): a FAILED run leaves its own unanswered pairing
# proposal behind, and the old "skip on ANY pending" guard then muted the test
# indefinitely — three HBARXFER runs were skipped overnight 2026-08-07 for exactly
# this, and MAINNETSMOKE-01 had been mute since 08-07. Only RECENT items count as
# "a human is mid-approval"; stale ones are reported and ignored.
STALE_MIN="${STALE_MIN:-30}"
read -r PENDING FRESH STALE <<<"$(echo "$STATE" | STALE_MIN="$STALE_MIN" python3 -c "
import json,sys,time,os
p=json.load(sys.stdin).get('pending',[])
cut=time.time()*1000-float(os.environ['STALE_MIN'])*60000
fresh=[x for x in p if x.get('createdAt',0)>=cut]
print(len(p),len(fresh),len(p)-len(fresh))")"
if [ "$STALE" != "0" ]; then
  echo "WARNING: kWallet holds $STALE pending item(s) older than ${STALE_MIN}m — abandoned by a previous failed run. NOT skipping for those."
fi
if [ "$FRESH" != "0" ]; then
  echo "kWallet has $FRESH recent pending item(s) — skipping this run (don't interrupt a human)."
  exit 0
fi

KWALLET_TOKEN="$KWALLET_TOKEN" timeout 200 node wc-netswitch-auto.cjs
RC=$?

curl -s -X POST "http://127.0.0.1:8790/api/mode?token=$KWALLET_TOKEN" -H "Content-Type: application/json" -d '{"mode":"'"$MODE"'"}' > /dev/null
echo "kWallet mode restored to $MODE"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) wc-netswitch-cron end (exit $RC) ==="
exit $RC
