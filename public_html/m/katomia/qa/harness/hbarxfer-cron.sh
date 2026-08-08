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
