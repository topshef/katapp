#!/bin/bash
# hbarxfer-pat-cron.sh — HBARXFER-01 against PAT (pat.katomia.com / hapi7).
#
# Same script and same safety shape as hbarxfer-cron.sh; the only differences are
# that BASE points at the deployed bundle and the game is created on PAT'S OWN
# backend (hapi7) rather than lab1's alpha — a board can only play a game its own
# backend knows about, which is why the target is not just a BASE swap.
#
# TXSTATUS-CONSOLIDATE1 (2026-08-08): added when the user promoted S1-S8 to pat
# and asked for the suite to run there too. QA-BENCHFREEZE1 item 1 (a tracked,
# target-parameterised runner) is the general version of this; this is the
# honest minimum until that lands.
set -euo pipefail

cd "$(dirname "$0")"
LOG="/var/www/swap.kpay.live-katlab/lab1/logs/qa/hbarxfer-pat.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

BASE="${BASE:-https://pat.katomia.com}"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) hbarxfer-pat start ($BASE) ==="

set -a; source /opt/kwallet/.env; set +a

STATE=$(curl -s "http://127.0.0.1:8790/api/state?token=$KWALLET_TOKEN")
MODE=$(echo "$STATE" | python3 -c "import json,sys;print(json.load(sys.stdin)['mode'])")
PENDING=$(echo "$STATE" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['pending']))")
if [ "$PENDING" != "0" ]; then
  echo "kWallet has $PENDING pending item(s) — skipping this run (don't interrupt a human)."
  exit 0
fi

GAME=$(curl -s -X POST "$BASE/hapi.php?action=create" \
  -H "Content-Type: application/json" \
  -d '{"profile":{"name":"QA: HBARXFER (pat)"},"network":"testnet","visibility":"public","joinRule":"*","lockRule":"all","config":{"tradingMode":"proposal","txDelaySeconds":0,"validDurationSeconds":180}}' \
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

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) hbarxfer-pat end (exit $RC) ==="
exit $RC
