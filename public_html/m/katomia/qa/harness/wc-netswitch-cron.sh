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

STATE=$(curl -s "http://127.0.0.1:8790/api/state?token=$KWALLET_TOKEN")
MODE=$(echo "$STATE" | python3 -c "import json,sys;print(json.load(sys.stdin)['mode'])")
PENDING=$(echo "$STATE" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['pending']))")
if [ "$PENDING" != "0" ]; then
  echo "kWallet has $PENDING pending item(s) — skipping this run (don't interrupt a human)."
  exit 0
fi

KWALLET_TOKEN="$KWALLET_TOKEN" timeout 200 node wc-netswitch-auto.cjs
RC=$?

curl -s -X POST "http://127.0.0.1:8790/api/mode?token=$KWALLET_TOKEN" -H "Content-Type: application/json" -d '{"mode":"'"$MODE"'"}' > /dev/null
echo "kWallet mode restored to $MODE"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) wc-netswitch-cron end (exit $RC) ==="
exit $RC
