#!/bin/bash
# hbarxfer-kswap-cron.sh — HBARXFER-01 against KSWAP (swap.kpay.live, the main
# worktree / promotion base for PAT + production).
#
# QA-ENVMATRIX (user 2026-08-16): "kswap should certainly have running tests
# since that's the base for our promotion to PAT and production" — until this,
# every scheduled run targeted lab1 only, so swap.kpay.live/m/katomia/qa/kwallet.html
# was silent by construction (each environment's page reads its OWN kflow log).
#
# Same script and same safety shape as hbarxfer-pat-cron.sh; differences are the
# BASE and that kswap serves the app under /m/katomia (the spike script already
# derives that prefix from the BASE hostname), so the game is created at
# $BASE/m/katomia/hapi.php — a board can only play a game its own backend knows.
# QA-BENCHFREEZE1 item 1 (a tracked, target-parameterised runner) is the general
# version of this family; this is the honest minimum until that lands.
set -euo pipefail

cd "$(dirname "$0")"
LOG="/var/www/swap.kpay.live-katlab/lab1/logs/qa/hbarxfer-kswap.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

BASE="${BASE:-https://swap.kpay.live}"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) hbarxfer-kswap start ($BASE) ==="

set -a; source /opt/kwallet/.env; set +a
export TRIGGER="cron:hbarxfer-kswap-cron.sh"

STATE=$(curl -s "http://127.0.0.1:8790/api/state?token=$KWALLET_TOKEN")
MODE=$(echo "$STATE" | python3 -c "import json,sys;print(json.load(sys.stdin)['mode'])")
# STALE-PENDING guard, same as the other crons (2026-08-08 fix): only RECENT
# pending items count as "a human is mid-approval"; stale ones — abandoned by a
# previous failed run — are reported loudly and ignored, never auto-rejected.
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

GAME=$(curl -s -X POST "$BASE/m/katomia/hapi.php?action=create" \
  -H "Content-Type: application/json" \
  -d '{"profile":{"name":"QA: HBARXFER (kswap)"},"network":"testnet","visibility":"public","joinRule":"*","lockRule":"all","config":{"tradingMode":"proposal","txDelaySeconds":0,"validDurationSeconds":180}}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('gameId',''))")
if [ -z "$GAME" ]; then
  echo "game create failed on $BASE — aborting"
  exit 1
fi
echo "game: $GAME"

curl -s -X POST "http://127.0.0.1:8790/api/mode?token=$KWALLET_TOKEN" -H "Content-Type: application/json" -d '{"mode":"auto"}' > /dev/null

BASE="$BASE" GAME="$GAME" KWALLET_TOKEN="$KWALLET_TOKEN" timeout 150 node hbarxfer-auto-spike.cjs
RC=$?

curl -s -X POST "http://127.0.0.1:8790/api/mode?token=$KWALLET_TOKEN" -H "Content-Type: application/json" -d '{"mode":"'"$MODE"'"}' > /dev/null
echo "kWallet mode restored to $MODE"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) hbarxfer-kswap end (exit $RC) ==="
exit $RC
