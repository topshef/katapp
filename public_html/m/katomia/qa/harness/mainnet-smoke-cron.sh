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
PENDING=$(echo "$STATE" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['pending']))")
if [ "$PENDING" != "0" ]; then
  echo "kwallet-mainnet has $PENDING pending item(s) — skipping this run (don't interrupt a human)."
  exit 0
fi

KWALLET_TOKEN="$KWALLET_TOKEN" timeout 240 node mainnet-smoke-auto.cjs
RC=$?

curl -s -X POST "http://127.0.0.1:8791/api/mode?token=$KWALLET_TOKEN" -H "Content-Type: application/json" -d '{"mode":"'"$MODE"'"}' > /dev/null
echo "kwallet-mainnet mode restored to $MODE"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) mainnet-smoke-cron end (exit $RC) ==="
exit $RC
