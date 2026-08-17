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
export TRIGGER="cron:hbarxfer-pat-cron.sh"

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
