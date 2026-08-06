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
#    afterwards so --delete doesn't sweep it on rebuild. 'P /*.php' is broad
#    (covers the whole shop-root PHP layer, step 2e) — if an APP root php file
#    is ever deleted upstream, rm -rf build/ once for a from-scratch rebuild.
rsync -a --delete \
  --exclude '/build' --exclude '/ops' --exclude '/logs' \
  --exclude '/.env_hapi' --exclude '/.htaccess' \
  --exclude 'node_modules' --exclude '*.bak' \
  --filter='P /vendor' --filter='P /m' \
  --filter='P /assets' --filter='P /future' \
  --filter='P /*.php' \
  --filter='P /content' --filter='P /download' \
  --filter='P /cache' --filter='P /_site' \
  --filter='P /.env' --filter='P /.htaccess' \
  --filter='P /build-info.json' \
  "$APP/" "$BUILD/"

# 2. Docroot PHP shims + env + diagnostics endpoints (kflow/diag — the "k
#    diagnostics"; without them beacons 404 and a failed session leaves no trace)
cp "$ROOT/readenv.php" "$ROOT/hapi_base.php" "$ROOT/kmon.php" \
   "$ROOT/kflow.php" "$ROOT/diag.php" "$BUILD/"
mkdir -p "$BUILD/lib"
cp "$ROOT/lib/qatx.php" "$BUILD/lib/"
# root elog.php is a RELATIVE SYMLINK to assets/php/elog.php on live — recreate it
# as one (require_once dedupes by realpath; two real copies = redeclare fatal)
ln -sfn assets/php/elog.php "$BUILD/elog.php"
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

# 2b2. /future kpool proxy — the signer widget AND katomia-board.js read/write
#      tx bytes via /future/?action=txRead|txSave (absolute). ?action= requests
#      short-circuit into kpool.php before index.php's heavy page deps, so only
#      these two files (+ getCachedData) are needed; the /future PAGE view is
#      NOT bundled and will error — it's the swap-hosted power route.
#      (KAT-DOMAIN1 test 2 failure, 2026-07-28: raise-tx worked, signing died
#      "kpool record not found" because /future/ 404'd.)
mkdir -p "$BUILD/future"
cp "$ROOT/future/index.php" "$ROOT/future/kpool.php" "$BUILD/future/"
cp "$ROOT/assets/php/getCachedData.php" "$BUILD/assets/php/"

# 2c. writable log dirs beside the docroot (kflow/diag/elog write ../logs/*)
mkdir -p "$APP/logs/kflow" "$APP/logs/kdiag"
chown -R www-data:www-data "$APP/logs"

# 2e. SHOP LAYER — makes the bundle gameplay-complete (KAT-DEPLOY1, 2026-08-05).
#     Asset enrichment is same-origin: Kache.getData("/m", {format:json, productId})
#     → m/index.php → product-details.php → product-details-OG2022.php, whose
#     include chain reaches most of the shop root (auth/config/constants/gatekeep/
#     query/products/headheader/footer/botblock/pagecache/cookieConsent, plus
#     assets/php cards+functions, vendor/kpay, vendor/hashconnect, download/,
#     content/ catalogue). The OPS-GCE1 rehearsal proved a bundle without this
#     layer can never resolve asset metadata ("still loading asset details").
#     Strategy: copy the layer wholesale rather than cherry-pick — robustness
#     over minimalism (~60M, rsync delta-transfers on push anyway).
#
# 2e-i. shop root PHP, except: index.php (the app's must win at docroot),
#       config.php (merged below), phpinfo.php (never ship).
find "$ROOT" -maxdepth 1 -name '*.php' \
  ! -name index.php ! -name config.php ! -name phpinfo.php \
  -exec cp {} "$BUILD/" \;
#
# 2e-ii. config.php COLLISION MERGE: the app ships a 6-line config.php
#        (hapi_base) while the shop chain expects the root config.php
#        (gatekeep/constants/loadcontent/getUserProfile). Both include it as
#        DOCUMENT_ROOT/config.php, so the bundle's single config.php is the
#        shop config with the app's lines appended (require_once dedupes;
#        gatekeep passes with the bundled .env ip_allowed=any).
#        Site-level includes (pagevisit/logEvent) are rewritten from
#        __DIR__/../ to dirname(DOCUMENT_ROOT) — same convention hapi_base
#        uses for .env_hapi — because deploy layouts put the docroot deeper
#        than live does (releases/<slot>); a logEvent stub keeps config.php
#        from fataling if a deploy misses them.
{
  printf '<?php\n// GENERATED MERGE by ops/build-standalone.sh: shop root config.php\n// + app (m/katomia) config.php — see step 2e-ii.\n'
  sed -e '1s/^<?php//' -e '/^?>[[:space:]]*$/d' \
      -e "s#include __DIR__ . '/\.\./#@include dirname(\$_SERVER['DOCUMENT_ROOT']) . '/#" \
      "$ROOT/config.php" \
  | sed -e "/@include dirname(\$_SERVER\['DOCUMENT_ROOT'\]) . '\/logEvent.php';/a\\
if (!function_exists('logEvent')) { function logEvent(\$m = null, \$f = null, \$i = null) { return false; } }"
  sed -e '1s/^<?php//' "$APP/config.php"
} > "$BUILD/config.php"
#
# 2e-iii. shop assets + catalogue + small vendors + download. The app's own
#         assets/ (kpay-k.svg) has no path overlap with the shop's — verified
#         2026-08-05 — so no --delete and both coexist.
rsync -a --exclude 'node_modules' "$ROOT/assets/" "$BUILD/assets/"
rsync -a --delete "$ROOT/content/" "$BUILD/content/"
rsync -a --delete "$ROOT/download/" "$BUILD/download/"
mkdir -p "$BUILD/vendor"
rsync -a --delete --exclude 'node_modules' "$ROOT/vendor/kpay/" "$BUILD/vendor/kpay/"
rsync -a --delete --exclude 'node_modules' "$ROOT/vendor/hashconnect/" "$BUILD/vendor/hashconnect/"
#
# 2e-iv. the /m module itself (router + local cache + ipfs proxy + feedback
#        fallback). NOT the whole /m tree — api/go/sign stay swap-hosted.
cp "$ROOT/m/index.php" "$BUILD/m/"
cp "$ROOT/m/ipfs-proxy.php" "$BUILD/m/" 2>/dev/null || true
mkdir -p "$BUILD/m/cache" "$BUILD/m/feedback"
cp "$ROOT/m/cache/index.php" "$BUILD/m/cache/" 2>/dev/null || true
cp "$ROOT/m/feedback/index.php" "$BUILD/m/feedback/" 2>/dev/null || true
#
# 2e-v. writable caches (getCachedData writes DOCROOT/cache/, product cache
#       in m/cache/) — perms set by the final chown; deploy must keep them
#       www-data-writable.
mkdir -p "$BUILD/cache"
#
# 2e-vi. site-level deps: root config includes dirname(docroot)/pagevisit.php
#        + logEvent.php (live layout). Ship copies in _site/ (web-denied via
#        the generated .htaccess) so the deploy script can install them beside
#        the docroot; also place them at $APP for Lincoln-local serving of
#        build/ (pat-on-Lincoln pattern), where dirname(docroot) = m/katomia.
mkdir -p "$BUILD/_site"
cp "$SITE/pagevisit.php" "$SITE/logEvent.php" "$BUILD/_site/"
cp "$SITE/pagevisit.php" "$SITE/logEvent.php" "$APP/"
mkdir -p "$APP/data/pagevisit"
chown -R www-data:www-data "$APP/data"

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

# _site/ carries site-level deploy files (pagevisit/logEvent) — not web content
RewriteRule ^_site(/|$) - [F]

# Legacy /m/katomia/* URLs → EXTERNAL 308 to the clean root path (KAT-DEPLOY1b:
# an internal rewrite kept the ugly URL in the address bar — the point of the
# bundle is clean URLs, and old shared links should normalize). 308 not 301:
# method-preserving, so any stale cached JS POSTing to /m/katomia/hapi.php
# still works instead of degrading to GET.
RewriteRule ^m/katomia/?$ / [R=308,L]
RewriteRule ^m/katomia/(.*)$ /$1 [R=308,L,QSA]

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
