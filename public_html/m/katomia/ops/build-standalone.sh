#!/bin/bash
# build-standalone.sh — KAT-DOMAIN1: assemble m/katomia into a self-contained
# docroot at m/katomia/build/, servable at the root of its own domain
# (pat.katomia.com test vhost). Deployment-only: copies live files verbatim,
# no app code changes.
#
# What a standalone deploy needs beyond m/katomia itself (discovered 2026-07-28):
#   - docroot PHP shims: elog.php, readenv.php, hapi_base.php, kmon.php,
#     assets/php/sendPost.php (kmon dep), .env (readenv dep)
#   - vendor/walletconnect subset: kwcScriptTag.php + config.php/.json +
#     .htaccess (config + snapshot routing) + the pinned snapshot bundle
#   - vendor/kpay/kpool_widget (signing widget, admin/legacy path)
#   - m/tools/glog (page diagnostics beacon)
#   - ../.env_hapi  (hapi_base reads dirname(DOCUMENT_ROOT)/.env_hapi)
#   - a generated .htaccess: host gate + legacy /m/katomia/* rewrite + the
#     app's own routes appended verbatim
# CDN deps (esm.sh/cdnjs/jsdelivr) are NOT localised here — that is BUNDLE1.
set -euo pipefail

APP="$(cd "$(dirname "$0")/.." && pwd)"        # .../public_html/m/katomia
ROOT="$(cd "$APP/../.." && pwd)"               # .../public_html
SITE="$(dirname "$ROOT")"                      # .../swap.kpay.live
BUILD="$APP/build"
KWC_SNAPSHOT="$(php -r 'include "'"$ROOT"'/vendor/walletconnect/kwcScriptTag.php";' 2>/dev/null | grep -oE 'snapshots/[a-f0-9]+' | head -1 | cut -d/ -f2)"
KWC_SNAPSHOT="${KWC_SNAPSHOT:-30c3fd9}"

mkdir -p "$BUILD"

# 1. The app itself → build root. Protect (P) everything this script adds
#    afterwards so --delete doesn't sweep it on rebuild.
rsync -a --delete \
  --exclude '/build' --exclude '/ops' --exclude '/logs' \
  --exclude '/.env_hapi' --exclude '/.htaccess' \
  --exclude 'node_modules' --exclude '*.bak' \
  --filter='P /vendor' --filter='P /m' \
  --filter='P /assets/php' \
  --filter='P /elog.php' --filter='P /readenv.php' \
  --filter='P /hapi_base.php' --filter='P /kmon.php' \
  --filter='P /kflow.php' --filter='P /diag.php' \
  --filter='P /.env' --filter='P /.htaccess' \
  --filter='P /build-info.json' \
  "$APP/" "$BUILD/"

# 2. Docroot PHP shims + env + diagnostics endpoints (kflow/diag — the "k
#    diagnostics"; without them beacons 404 and a failed session leaves no trace)
cp "$ROOT/elog.php" "$ROOT/readenv.php" "$ROOT/hapi_base.php" "$ROOT/kmon.php" \
   "$ROOT/kflow.php" "$ROOT/diag.php" "$BUILD/"
mkdir -p "$BUILD/assets/php"
cp "$ROOT/assets/php/sendPost.php" "$ROOT/assets/php/elog.php" "$BUILD/assets/php/"
[ -f "$ROOT/.env" ] && cp "$ROOT/.env" "$BUILD/.env"

# 2b. /m/bid local-cache stack — game.php/board.php load these absolutely; their
#     404 on pat killed the module chain the signer flow hangs off (KAT-DOMAIN1
#     test 1 failure, 2026-07-28) — plus the kpool explorer (tx mirror reads)
mkdir -p "$BUILD/m/bid/explore"
cp "$ROOT/m/bid/localbase.min.js" "$ROOT/m/bid/localCacheDB.js" \
   "$ROOT/m/bid/localCacheDB.module.js" "$ROOT/m/bid/localCacheIFPS.js" \
   "$ROOT/m/bid/localCacheArweave.js" "$BUILD/m/bid/"
cp "$ROOT/m/bid/explore/kpool.php" "$ROOT/m/bid/explore/.htaccess" "$BUILD/m/bid/explore/"

# 2c. writable log dirs beside the docroot (kflow/diag/elog write ../logs/*)
mkdir -p "$APP/logs/kflow" "$APP/logs/kdiag"
chown -R www-data:www-data "$APP/logs"

# 3. Vendor subset (vendor/walletconnect on main is 1.5G — take only the served bits)
mkdir -p "$BUILD/vendor/walletconnect/builder/snapshots"
cp "$ROOT/vendor/walletconnect/kwcScriptTag.php" \
   "$ROOT/vendor/walletconnect/config.php" \
   "$ROOT/vendor/walletconnect/config.json" \
   "$ROOT/vendor/walletconnect/.htaccess" \
   "$BUILD/vendor/walletconnect/"
rsync -a --delete "$ROOT/vendor/walletconnect/builder/snapshots/$KWC_SNAPSHOT/" \
   "$BUILD/vendor/walletconnect/builder/snapshots/$KWC_SNAPSHOT/"
# lazy-hydrate: catchall for snapshot artifacts missing locally (e.g. the bundle's
# release.json probe) — same 404 semantics as live, and on a foreign server it can
# hydrate from swap.kpay.live (in its $origins). Needs assets/php/elog.php (2. above).
cp "$ROOT/vendor/walletconnect/builder/lazy-hydrate.php" "$BUILD/vendor/walletconnect/builder/"
# same-box only: link the shared snapshot store if present
[ -d /var/www/kwc-snapshots ] && ln -sfn /var/www/kwc-snapshots "$BUILD/vendor/walletconnect/builder/snapshots-shared"
mkdir -p "$BUILD/vendor/kpay/kpool_widget"
rsync -a --delete --exclude 'node_modules' \
   "$ROOT/vendor/kpay/kpool_widget/" "$BUILD/vendor/kpay/kpool_widget/"

# 4. glog diagnostics (/m/tools/glog/latest/glog.js)
mkdir -p "$BUILD/m/tools"
rsync -aL --delete --exclude 'node_modules' --exclude 'src' \
   "$ROOT/m/tools/glog/" "$BUILD/m/tools/glog/"

# 5. hapi_base reads dirname(DOCUMENT_ROOT)/.env_hapi → for docroot=build that
#    is m/katomia/.env_hapi (web access denied in m/katomia/.htaccess)
[ -f "$SITE/.env_hapi" ] && cp "$SITE/.env_hapi" "$APP/.env_hapi"

# 6. Generated .htaccess: host gate + env deny + legacy path rewrite, then the
#    app's live routes verbatim
{
cat <<'EOF'
# GENERATED by ops/build-standalone.sh — do not hand-edit; edit the script or
# the app's own .htaccess and rebuild.
RewriteEngine On

# Host gate: this folder is web-reachable via swap.kpay.live/m/katomia/build/
# too — deny the dev hosts rather than allow-list one domain, so the same
# artifact deploys unmodified to any standalone domain (user-approved block,
# 2026-07-28; made domain-agnostic for remote installs same day)
RewriteCond %{HTTP_HOST} ^(www\.)?swap\.kpay\.live$ [NC]
RewriteRule ^ - [F]

# never serve env files
<FilesMatch "^\.(env|envpath)">
  Require all denied
</FilesMatch>

# Legacy absolute /m/katomia/* references → same file at docroot
RewriteRule ^m/katomia/?$ index.php [L,QSA]
RewriteRule ^m/katomia/(.*)$ $1 [L,QSA]

# diagnostics endpoints (extensionless, same as the swap site root's rules)
RewriteRule ^kflow$ kflow.php [L,QSA]
RewriteRule ^diag$ diag.php [L,QSA]

# ---- app routes, copied verbatim from m/katomia/.htaccess ----
EOF
cat "$APP/.htaccess"
} > "$BUILD/.htaccess"

# 7. Build stamp
SHA="$(git -C "$SITE" rev-parse --short HEAD 2>/dev/null || echo unknown)"
printf '{"source_sha":"%s","kwc_snapshot":"%s","built":"%s"}\n' \
  "$SHA" "$KWC_SNAPSHOT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BUILD/build-info.json"

chown -R www-data:www-data "$BUILD"
echo "built $BUILD (source $SHA, kwc $KWC_SNAPSHOT): $(du -sh "$BUILD" | cut -f1)"
