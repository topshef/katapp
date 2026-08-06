#!/bin/bash
# wc-paths-cron.sh — daily headless WalletConnect path tests on TESTNET.
#
# WC-RELAYHEALTH1 (user 2026-08-06): "we don't have any conclusive test results at
# all, everything has basically been smoke tests — let the tests roll for a bit."
# This is that. Two kWallet-driven harnesses run unattended every day against the
# live lab1 bundle and report into the QA results grid (kflow), so evidence
# accumulates over time instead of being re-derived from one-off manual runs.
#
#   WC-A5-ONLINE  a5-ghost-recovery.cjs  — wallet clears the connection while the
#                 dApp is online. NOTE: passes on pre-fix bundles too, so treat it
#                 as a health check, NOT as proof the ghost fix works.
#   WC-A5B-GHOST  a5b-storage-ghost.cjs  — the discriminating one: rebuilds a true
#                 ghost (session in the dApp's IndexedDB that the wallet destroyed
#                 without the dApp hearing) and signs against it. NOT YET RELIABLE
#                 as of 2026-08-06 — ensureNetwork stalled on one run. Left in
#                 deliberately: an error verdict on the grid is information.
#
# Testnet only — no real value moves, so daily is free. Same safety shape as the
# other crons: skip entirely if a human has pending items in kWallet, and restore
# its mode unconditionally afterwards.
set -uo pipefail

cd "$(dirname "$0")"
LOG="/var/www/swap.kpay.live-katlab/lab1/logs/qa/wc-paths-cron.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) wc-paths-cron start ==="

set -a; source /opt/kwallet/.env; set +a

STATE=$(curl -s "http://127.0.0.1:8790/api/state?token=$KWALLET_TOKEN")
if [ -z "$STATE" ]; then echo "kwallet not answering on 8790 — skipping"; exit 0; fi
MODE=$(echo "$STATE"    | python3 -c "import json,sys;print(json.load(sys.stdin)['mode'])" 2>/dev/null || echo manual)
PENDING=$(echo "$STATE" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['pending']))" 2>/dev/null || echo 0)
if [ "$PENDING" != "0" ]; then
  echo "kwallet has $PENDING pending item(s) — skipping this run (don't interrupt a human)."
  exit 0
fi

# Each harness runs its own in-process wallet peer, so kWallet's own sessions are
# left alone; we only read its state above to stay out of a human's way.
RC=0
for H in a5-ghost-recovery.cjs a5b-storage-ghost.cjs; do
  echo "--- $H ---"
  KWALLET_NETWORK=testnet timeout 420 node "/opt/kwallet/$H"
  R=$?
  echo "--- $H exit $R ---"
  [ "$R" != "0" ] && RC=$R
done

curl -s -X POST "http://127.0.0.1:8790/api/mode?token=$KWALLET_TOKEN" \
  -H "Content-Type: application/json" -d '{"mode":"'"$MODE"'"}' > /dev/null
echo "kwallet mode restored to $MODE"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) wc-paths-cron end (exit $RC) ==="
exit $RC
