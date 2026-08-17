#!/bin/bash
# txtruth-cron.sh — TXTRUTH-01: never guess a FAILED verdict (BOARD-TXTRUTH1).
# Runs txtruth-check.cjs unattended: full HBARXFER flow with the /live receipt
# socket severed after Sign — the board must reach a truthful success via
# backend-state/mirror, never a guessed FAILED. Same shared-kWallet safety
# shape as hbarxfer-cron.sh (stale-pending fix included from birth).
#
# Cron: daily, offset from the other testnet-kWallet jobs (see crontab -l).
set -euo pipefail

cd "$(dirname "$0")"
LOG="/var/www/swap.kpay.live-katlab/lab1/logs/qa/txtruth-cron.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) txtruth-cron start ==="

set -a; source /opt/kwallet/.env; set +a
export TRIGGER="cron:txtruth-cron.sh"

STATE=$(curl -s "http://127.0.0.1:8790/api/state?token=$KWALLET_TOKEN")
MODE=$(echo "$STATE" | python3 -c "import json,sys;print(json.load(sys.stdin)['mode'])")
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

GAME=$(curl -s -X POST "https://lab1.katlab.kpay.live/m/katomia/hapi.php?action=create" \
  -H "Content-Type: application/json" \
  -d '{"profile":{"name":"QA cron: TXTRUTH"},"network":"testnet","visibility":"public","joinRule":"*","lockRule":"all","config":{"tradingMode":"proposal","txDelaySeconds":0,"validDurationSeconds":120}}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('gameId',''))")
if [ -z "$GAME" ]; then
  echo "game create failed — aborting"
  exit 1
fi
echo "game: $GAME"

curl -s -X POST "http://127.0.0.1:8790/api/mode?token=$KWALLET_TOKEN" -H "Content-Type: application/json" -d '{"mode":"auto"}' > /dev/null

GAME="$GAME" KWALLET_TOKEN="$KWALLET_TOKEN" timeout 280 node txtruth-check.cjs
RC=$?

curl -s -X POST "http://127.0.0.1:8790/api/mode?token=$KWALLET_TOKEN" -H "Content-Type: application/json" -d '{"mode":"'"$MODE"'"}' > /dev/null
echo "kWallet mode restored to $MODE"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) txtruth-cron end (exit $RC) ==="
exit $RC
