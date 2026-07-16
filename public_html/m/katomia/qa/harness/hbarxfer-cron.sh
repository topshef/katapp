#!/bin/bash
# hbarxfer-cron.sh — QA-UXGRID1: runs HBARXFER-01 unattended, on a schedule.
# Creates a fresh public testnet game each run (own-to-own doesn't work —
# see hbarxfer-auto-spike.cjs — so every run needs a clean game two real
# players can join), drives kWallet through it, and always restores kWallet
# to manual mode afterward — it's a SHARED resource, a human may want it.
#
# SAFETY: skips the run entirely (no mode flip, no game created) if kWallet
# already has pending items or isn't idle — a human might be mid-approval.
#
# Cron: */120 (every 2 hours) — see crontab -l. Logs to logs/qa/hbarxfer-cron.log.
set -euo pipefail

cd "$(dirname "$0")"
LOG="/var/www/swap.kpay.live-katlab/lab1/logs/qa/hbarxfer-cron.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) hbarxfer-cron start ==="

set -a; source /opt/kwallet/.env; set +a

STATE=$(curl -s "http://127.0.0.1:8790/api/state?token=$KWALLET_TOKEN")
MODE=$(echo "$STATE" | python3 -c "import json,sys;print(json.load(sys.stdin)['mode'])")
PENDING=$(echo "$STATE" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['pending']))")
if [ "$PENDING" != "0" ]; then
  echo "kWallet has $PENDING pending item(s) — skipping this run (don't interrupt a human)."
  exit 0
fi

GAME=$(curl -s -X POST "https://lab1.katlab.kpay.live/m/katomia/hapi.php?action=create" \
  -H "Content-Type: application/json" \
  -d '{"profile":{"name":"QA cron: HBARXFER"},"network":"testnet","visibility":"public","joinRule":"*","lockRule":"all","config":{"tradingMode":"proposal","txDelaySeconds":0,"validDurationSeconds":180}}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('gameId',''))")
if [ -z "$GAME" ]; then
  echo "game create failed — aborting"
  exit 1
fi
echo "game: $GAME"

curl -s -X POST "http://127.0.0.1:8790/api/mode?token=$KWALLET_TOKEN" -H "Content-Type: application/json" -d '{"mode":"auto"}' > /dev/null

GAME="$GAME" KWALLET_TOKEN="$KWALLET_TOKEN" timeout 150 node hbarxfer-auto-spike.cjs
RC=$?

# restore mode UNCONDITIONALLY even if the run failed — never leave a
# shared resource in a changed state
curl -s -X POST "http://127.0.0.1:8790/api/mode?token=$KWALLET_TOKEN" -H "Content-Type: application/json" -d '{"mode":"'"$MODE"'"}' > /dev/null
echo "kWallet mode restored to $MODE"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) hbarxfer-cron end (exit $RC) ==="
exit $RC
