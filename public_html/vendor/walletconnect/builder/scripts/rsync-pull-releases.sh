#!/bin/bash

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ---- Defaults (fallbacks) ----
SSH_KEY="$HOME/.ssh/id_pull_7848"
REMOTE_HOST="root@swap.kpay.live"
REMOTE_PATH="/var/www/swap.kpay.live/public_html/vendor/walletconnect/builder"

# ---- Optional local override ----
if [ -f "$BASE_DIR/.local.env" ]; then
  source "$BASE_DIR/.local.env"
fi

echo "Using SSH key: $SSH_KEY"
echo "Remote: $REMOTE_HOST:$REMOTE_PATH"

echo "Syncing releases..."
rsync -avz -e "ssh -i $SSH_KEY" \
  "$REMOTE_HOST:$REMOTE_PATH/releases/" \
  "$BASE_DIR/releases/"

echo "Syncing snapshots..."
rsync -avz -e "ssh -i $SSH_KEY" \
  "$REMOTE_HOST:$REMOTE_PATH/snapshots/" \
  "$BASE_DIR/snapshots/"

echo "Sync complete."
