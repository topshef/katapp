#!/bin/bash
# push-bundle.sh — KAT-DEPLOY1: push the standalone bundle (built by
# build-standalone.sh) from Lincoln to the GCP box and hot-swap it live.
#
#   ops/push-bundle.sh app          # deploy to app.katomia.com (prod, hapi6)
#   ops/push-bundle.sh pat          # deploy to pat.katomia.com (staging, hapi7)
#   ops/push-bundle.sh pat --dry    # rsync --dry-run, no flip
#
# Layout on the target (created on first push):
#   /mnt/data/www/<domain>/releases/{blue,green}   two build slots
#   /mnt/data/www/<domain>/public_html -> releases/<active>   (atomic flip)
#   /mnt/data/www/<domain>/{.env_hapi,pagevisit.php,logEvent.php,data/,logs/}
# Rollback = flip the symlink back to the previous slot:
#   ssh $REMOTE 'ln -sfnT releases/blue /mnt/data/www/<domain>/public_html'
#
# .env_hapi is per-box config (which backend this frontend talks to) and is
# NEVER pushed — the script fails loudly if it's missing on the target.
set -euo pipefail

APP="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$APP/build"
GCP_IP="8.234.137.64"
SSH="ssh -i /root/.ssh/google_compute_engine -o StrictHostKeyChecking=accept-new"
REMOTE="root@$GCP_IP"

TARGET="${1:?usage: push-bundle.sh app|pat [--dry]}"
DRY="${2:-}"
case "$TARGET" in
  app) DOMAIN="app.katomia.com" ;;
  pat) DOMAIN="pat.katomia.com" ;;
  *) echo "unknown target '$TARGET' (want app|pat)"; exit 1 ;;
esac
SITE="/mnt/data/www/$DOMAIN"

[ -f "$BUILD/build-info.json" ] || { echo "no build at $BUILD — run build-standalone.sh first"; exit 1; }

# Pick the inactive slot (blue/green); first push goes to blue.
ACTIVE="$($SSH $REMOTE "readlink $SITE/public_html 2>/dev/null | xargs -r basename" </dev/null)"
case "$ACTIVE" in
  blue)  SLOT="green" ;;
  *)     SLOT="blue"  ;;
esac
DEST="$SITE/releases/$SLOT"
echo "target $DOMAIN: active slot '${ACTIVE:-none}' → pushing to '$SLOT'"

$SSH $REMOTE "mkdir -p $DEST $SITE/logs $SITE/data/pagevisit" </dev/null

RSYNC_FLAGS="-az --delete"
[ "$DRY" = "--dry" ] && RSYNC_FLAGS="$RSYNC_FLAGS --dry-run -v"
rsync $RSYNC_FLAGS -e "$SSH" "$BUILD/" "$REMOTE:$DEST/"
[ "$DRY" = "--dry" ] && { echo "dry run only — no flip"; exit 0; }

# Install/refresh site-level deps + perms, verify .env_hapi, then atomic flip.
$SSH $REMOTE bash -s </dev/null <<EOF
set -euo pipefail
cp "$DEST/_site/pagevisit.php" "$DEST/_site/logEvent.php" "$SITE/"
chown -R www-data:www-data "$SITE/data" "$SITE/logs" "$DEST/cache" "$DEST/m/cache" "$DEST/logs" 2>/dev/null || true
chown -R www-data:www-data "$DEST"
if [ ! -f "$SITE/.env_hapi" ]; then
  echo "FATAL: $SITE/.env_hapi missing — create it (HAPI_BASE=<backend host>),"
  echo "chmod 644 root:www-data (OPS-GCE1 L-fix4: 600 = silent dead-backend fallback)."
  exit 1
fi
# enforce the L-fix4 lesson every push: PHP-read config must be www-data-readable
chown root:www-data "$SITE/.env_hapi"; chmod 644 "$SITE/.env_hapi"
ln -sfnT "releases/$SLOT" "$SITE/public_html"
# PHP's realpath cache (ttl 120s) otherwise serves a MIX of old+new slots after
# the flip (seen 2026-08-05: blue m/index.php pulling green config.php = fatal)
systemctl reload apache2
echo "flipped: $DOMAIN now serves \$(readlink $SITE/public_html)"
EOF

# Verify over real DNS (GCP serves these domains).
sleep 1
echo "— verify —"
curl -so /dev/null -w "root: %{http_code} %{time_total}s\n" "https://$DOMAIN/"
curl -s "https://$DOMAIN/m/?format=json&productId=testnet;0.0.5138857" | head -c 120; echo
curl -s "https://$DOMAIN/build-info.json"
