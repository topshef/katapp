#!/bin/bash
# env-suite-cron.sh — QA-ENVCOVERAGE1 (2026-08-26): run the environment-agnostic, TESTNET
# QA harnesses against ANY environment (pat, prod, lab1), so the same tests appear on each
# environment's grid — not just lab1. Each harness already takes BASE + PREFIX and reports
# into that environment's kflow via reportKflow(), so results surface on that env's
# results.html automatically (proven 2026-08-26).
#
#   env-suite-cron.sh <ENV_LABEL> <BASE_URL>
#   e.g.  env-suite-cron.sh pat  https://pat.katomia.com
#         env-suite-cron.sh prod https://swap.kpay.live
#
# Only harnesses that are BASE+PREFIX-clean (no hardcoded /m/katomia/ paths) are listed —
# the HARDPATH ones need the shared env lib retrofit first (see lib/qaenv.cjs). Signing is
# TESTNET via the local kWallet (127.0.0.1:8790) regardless of which frontend BASE is driven;
# MAINNET harnesses are deliberately excluded (mainnet key rotated/out of action).
set -uo pipefail
cd "$(dirname "$0")"

ENVLABEL="${1:?usage: env-suite-cron.sh <env-label> <base-url>}"
BASE="${2:?usage: env-suite-cron.sh <env-label> <base-url>}"
LOG="/var/www/swap.kpay.live-katlab/lab1/logs/qa/env-suite-${ENVLABEL}.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) env-suite start env=$ENVLABEL base=$BASE ==="

# testnet kWallet env (account/token) for the signing harnesses
set -a; source /opt/kwallet/.env 2>/dev/null; set +a
export BASE
export TRIGGER="cron:env-suite:${ENVLABEL}"

# The BASE+PREFIX-clean, testnet-safe harnesses. Read-only + light-signing only; no
# game-creating spike tests here (those pollute a shared env / need cleanup).
HARNESSES=(
  enrichcold-check.cjs      # asset enrich cold/warm/burst (read-only)
  wc-singleinit-check.cjs   # WC single-init (testnet)
  signdeadtx-check.cjs      # dead-tx signing gate (testnet)
)

rc_any=0
for h in "${HARNESSES[@]}"; do
  [ -f "$h" ] || { echo "  skip (missing) $h"; continue; }
  echo "--- $(date -u +%H:%M:%SZ) $h"
  timeout 180 node "$h" 2>&1 | tail -6 || { echo "  $h exited rc=$?"; rc_any=1; }
done

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) env-suite done env=$ENVLABEL rc_any=$rc_any ==="
exit 0
