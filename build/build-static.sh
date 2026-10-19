#!/bin/bash
# build-static.sh — render the katomia app to a static bundle for Cloudflare Workers
# (assets + the router Worker in build/router.js).
#
# STATIC-BUILD2 (2026-09-02): renders from THIS CHECKOUT with the PHP CLI dev server —
# no lab22, no live site, no network. GitHub is the source of truth: anyone with php
# (>= 8) can regenerate build/dist from the repo alone, which is what lets the dev
# server retire. The katomia pages carry no per-user server state, so each route is
# rendered ONCE as a game-agnostic shell; the client reads the real gameId from the
# URL (getGameId() in katomia-core.js). Config is rendered straight to the API alias
# via a build-time .env_hapi, so HTTP + WS go through the Worker.
#
# Usage:  build/build-static.sh          → build/dist, named by build/variant.env (see below)
#
# KATAPP-SPLIT1 (owner 2026-10-19): this is katapp, the Katomia front end split out of
# phpjabbers with its history. Three differences from the phpjabbers script, all deliberate:
#   - ONE variant. phpjabbers also built build/dist-gcp (katui-gcp, a comparison rig that was
#     never deployed); katapp does not carry it, so a bare run builds build/dist and nothing else.
#   - The Worker's NAME and custom domain come from build/variant.env, which katapp ALWAYS
#     carries (LAB2-DEPLOY1's hook, made mandatory). Today it names katui-lab1 on
#     lab1.katomia.com, so nothing built from this repo can deploy over katui (labs), which
#     stays on phpjabbers as the benchmark until the owner rewires it.
#   - Keaton (/keaton), the deal pages (/deal) and the V1 archive (/legacy) are not Katomia and
#     stayed in phpjabbers. They are not copied; router.js hands those paths to the PAGES
#     service binding (the katui Worker) so this host still answers them identically.
#   ALIAS=host/path  override the API alias (host+path, scheme-less — HAPI_BASE convention)
#   ALIAS_SERVICE=x  override the alias WORKER'S NAME for the service binding. This is not
#                    the hostname and must not be derived from it (see ALIASNAME1 below).
#   SITE_HOST=…      Host header used for the render (router patches the WC config per request
#                    anyway; kept for parity with lab22 renders)
set -euo pipefail
VARIANT="${1:-katui}"
if [ "$VARIANT" = "katui" ] || [ "$VARIANT" = "both" ]; then   # "both": phpjabbers muscle memory, same thing here
  NAME="katui";     ALIAS="${ALIAS:-api.katomia.com/hapi}";     DIST_NAME="dist"
  ALIAS_SERVICE="${ALIAS_SERVICE:-kpay-api-alias}"
else
  echo "unknown variant '$VARIANT' (katapp builds one variant: katui, named by build/variant.env)"; exit 1
fi
# ALIASNAME1 (2026-09-17): the service-binding name is DECLARED, not derived from the host.
# It used to be `${ALIAS%%.*}` — "the first label of the alias's workers.dev host" — which was
# true only while the alias was reached at kpay-api-alias.tayloa17.workers.dev. The moment it
# got a custom domain (api.katomia.com) that expression started yielding "api", and every
# Cloudflare deploy failed with `Service binding 'HAPI' references Worker 'api' which was not
# found` [10143] — silently, because the failure is in Cloudflare's build log and not in CI.
# A Worker's NAME and the HOSTNAME it answers on are independent, and this script now says so.
: "${ALIAS_SERVICE:?internal: ALIAS_SERVICE must be set per variant above}"
SITE_HOST="${SITE_HOST:-$NAME.tayloa17.workers.dev}"   # before variant.env renames the Worker: same render as labs
PORT="${PORT:-8099}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# LAB2-DEPLOY1 / KATAPP-SPLIT1: build/variant.env names the Worker this checkout deploys as, its
# custom domain, and the Worker that serves what katapp does not carry (PAGES_SERVICE). Missing
# file = refuse: a katapp build named plain "katui" would be one git connection away from
# deploying over labs.
[ -f "$ROOT/build/variant.env" ] || { echo "build/variant.env missing — it names the Worker this repo deploys as (see README)"; exit 1; }
KATUI_NAME=""; KATUI_DOMAIN=""; PAGES_SERVICE=""
# shellcheck disable=SC1091
. "$ROOT/build/variant.env"
NAME="${KATUI_NAME:?build/variant.env must set KATUI_NAME}"
PAGES_SERVICE="${PAGES_SERVICE:-katui}"
[ "$PAGES_SERVICE" = "$NAME" ] && { echo "PAGES_SERVICE=$PAGES_SERVICE is this Worker itself — the hand-through would loop"; exit 1; }
echo "→ variant.env: Worker $NAME${KATUI_DOMAIN:+ on $KATUI_DOMAIN}; /keaton /deal /legacy handed to $PAGES_SERVICE"
PUB="$ROOT/public_html"; DIST="$ROOT/build/$DIST_NAME"; SRC="http://127.0.0.1:$PORT"
KWC_SNAP="4a3351b"   # KWC-CLEANBUILD1 bundle (see vendor/walletconnect/kwcScriptTag.php)

command -v php >/dev/null || { echo "php CLI required (>= 8.0)"; exit 1; }

# ── build-time env: hapi_base.php reads dirname(DOCUMENT_ROOT)/.env_hapi ──────────
# Never clobber a real one (lab22 / a GCP checkout serving PHP): stash + restore.
ENV_FILE="$ROOT/.env_hapi"; ENV_BAK=""
if [ -e "$ENV_FILE" ]; then ENV_BAK="$(mktemp)"; cp "$ENV_FILE" "$ENV_BAK"; fi
# SIGNPAGE-STATIC1: the site chrome (config.php → gatekeep.php) refuses to render without
# ip_allowed in public_html/.env ("code YF723"). The static bundle has no IP gate — Cloudflare
# serves it to everyone — so the build renders with ip_allowed=any. Same stash/restore rule.
GK_FILE="$PUB/.env"; GK_BAK=""
if [ -e "$GK_FILE" ]; then GK_BAK="$(mktemp)"; cp "$GK_FILE" "$GK_BAK"; fi
cleanup(){
  [ -n "${PHP_PID:-}" ] && kill "$PHP_PID" 2>/dev/null || true
  if [ -n "$ENV_BAK" ]; then cp "$ENV_BAK" "$ENV_FILE"; rm -f "$ENV_BAK"; else rm -f "$ENV_FILE"; fi
  if [ -n "$GK_BAK" ]; then cp "$GK_BAK" "$GK_FILE"; rm -f "$GK_BAK"; else rm -f "$GK_FILE"; fi
}
trap cleanup EXIT
printf 'HAPI_BASE=%s\n' "$ALIAS" > "$ENV_FILE"
printf 'ip_allowed=any\n' > "$GK_FILE"
mkdir -p "$ROOT/logs"   # elog.php writes here; must exist or the render dies noisily

# ── local PHP server over public_html (DOCUMENT_ROOT = public_html, as on lab22) ──
php -S "127.0.0.1:$PORT" -t "$PUB" >"$ROOT/logs/build-static-php.log" 2>&1 &
PHP_PID=$!
for i in $(seq 1 30); do curl -s -o /dev/null "$SRC/" && break; sleep 0.2; done

get(){ # $1 = path (+query) under the docroot
  local out; out="$(curl -s -f -H "Host: $SITE_HOST" "$SRC$1")" || { echo "render FAILED: $1" >&2; exit 1; }
  printf '%s' "$out"
}
render(){ # $1 = source path, $2 = dist file
  mkdir -p "$DIST/$(dirname "$2")"
  get "$1" > "$DIST/$2"
  grep -q "Fatal error\|Parse error" "$DIST/$2" && { echo "PHP error in $1" >&2; exit 1; }
  echo "   $2  ← $1"
}

# ── keep the committed KWC bundle when the shared store isn't on this box ─────────
STASH="$(mktemp -d)"
for d in "$DIST" "$ROOT/build/dist"; do
  # KWC-SNAPMETA2 (2026-09-05): require a COMPLETE snapshot, not merely a directory. The
  # old test took the first dist that had the folder at all, so a dist holding only
  # kwc.iife.js became the stash source and re-propagated the loss to every later build —
  # the exact mechanism KWC-SNAPMETA1 describes, still live because the check was "-d".
  if [ -f "$d/vendor/walletconnect/snapshots/$KWC_SNAP/kwc.iife.js" ] \
  && [ -f "$d/vendor/walletconnect/snapshots/$KWC_SNAP/build.json" ] \
  && [ -f "$d/vendor/walletconnect/snapshots/$KWC_SNAP/release.json" ]; then
    cp -r "$d/vendor/walletconnect/snapshots/$KWC_SNAP" "$STASH/"; break
  fi
done
rm -rf "$DIST"; mkdir -p "$DIST/m/katomia"

echo "→ rendering page shells (one per route; see router.js for the URL map)"
K=/m/katomia
render "$K/index.php"                        m/katomia/index.html          # welcome (default root)
for skin in liquid clay bubble; do                                          # ENTRY-SKINS1 (nerd-mode picker)
  render "$K/index.php?skin=$skin"           "m/katomia/index-$skin.html"
done
render "$K/index.php?page=markets"           m/katomia/markets.html
render "$K/index.php?page=circles"           m/katomia/circles.html
render "$K/index.php?page=learn"             m/katomia/learn.html
# KATOMIA-MCP5: the advisor help page. Buried — reached from /learn's FAQ, not the menu.
render "$K/index.php?page=advisor"           m/katomia/advisor.html
render "$K/index.php?page=host"              m/katomia/host.html
render "$K/index.php?page=create"            m/katomia/create.html
render "$K/index.php?page=create&skin=basic" m/katomia/create-basic.html   # ENTRY-CREATEBASIC1
render "$K/game.php?game="                   m/katomia/game.html           # shell: id from URL
render "$K/board.php"                        m/katomia/board.html          # shell: id from URL
render "$K/binding.php"                      m/katomia/binding.html
render "$K/KEA/index.php"                    m/katomia/KEA/index.html      # KEA-WEB1: the signer's web app (app.html via index.php)

echo "→ external signing page: /m/sign = future/index.php → index_v2.php (SIGNPAGE-STATIC1)"
# One game-agnostic shell; ?network=&txid=&pch= are read client-side (index_v2.php falls back
# to the URL when PHP saw none). The chrome's <base> is built from SERVER_NAME (127.0.0.1 under
# the dev server, the vhost on lab22): rewrite it root-relative so the same shell serves on
# every origin (katui, katui-gcp, a custom domain) — the reason the katomia pages never used it.
render /m/sign/                              m/sign/index.html
render /assets/css/style.css.php             assets/css/style.php.css     # chrome stylesheet (PHP: theme vars)
sed -i -e 's#<base href="[^"]*">#<base href="/">#' \
       -e 's#assets/css/style\.css\.php?[0-9]*#assets/css/style.php.css#' "$DIST/m/sign/index.html"
grep -q '<base href="/">' "$DIST/m/sign/index.html" || { echo "sign page: <base> rewrite failed" >&2; exit 1; }
grep -q 'code YF72' "$DIST/m/sign/index.html" && { echo "sign page: gatekeep refused the render" >&2; exit 1; }

echo "→ feedback fallback page (/m/feedback/?product=katomia; the widget's no-JS/failed-load link)"
render "/m/feedback/?product=katomia"         m/feedback/index.html
sed -i -e 's#<base href="[^"]*">#<base href="/">#' -e 's#assets/css/style\.css\.php?[0-9]*#assets/css/style.php.css#' "$DIST/m/feedback/index.html"

echo "→ rendering widget config.js (config.js.php) + walletconnect config.json (config.php)"
render /vendor/kpay/kpool_widget/config.js.php vendor/kpay/kpool_widget/config.js
render /vendor/walletconnect/config.php        vendor/walletconnect/config.json
kill "$PHP_PID"; PHP_PID=""

echo "→ copying static asset trees (js/css/assets/images/wasm — no .php)"
copytree(){ # $1 = path under public_html, $2 = extra find args (optional)
  ( cd "$PUB" && find "$1" -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.png' -o -name '*.jpg' -o -name '*.gif' -o -name '*.ico' -o -name '*.json' -o -name '*.wasm' -o -name '*.webmanifest' -o -name '*.woff2' \) \
      -not -path '*/qa/*' -not -path '*/.git/*' -not -name '*.test.*' -print0 ) \
  | while IFS= read -r -d '' f; do mkdir -p "$DIST/$(dirname "$f")"; cp "$PUB/$f" "$DIST/$f"; done
}
copytree m/katomia
copytree m/bid
copytree vendor/kpay/kpool_widget
copytree m/tools/glog 2>/dev/null || true
# SIGNPAGE-STATIC1: the site chrome the signing page inherits from headheader.php/footer.php
# (bootstrap, jquery, owl/slick, fontawesome, GM.ico) + the page's own future.css
copytree assets/css; copytree assets/js
copytree vendor/bootstrap; copytree vendor/jquery; copytree future

# KATAPP-SPLIT1: /keaton (the Keaton dashboard and its widget.json), /deal and /legacy are NOT
# copied — they are not Katomia and stayed in phpjabbers. router.js hands those paths to the
# PAGES service binding (PAGES_SERVICE in build/variant.env) so this host answers them exactly
# as labs does, from the Worker that still builds them.
# SIGNPAGE-KBM1 (2026-09-05): vendor/kbuild-monitor.js is a loose file directly under
# vendor/, so no copytree above reaches it — and kpool_widget/bootstrap.js TOP-LEVEL imports
# it. A missing module there rejects the whole bootstrap, so index.js never runs, window.KPOOL
# is never defined, and the sign page's modal reports "Signing widget failed to load".
# Copy it explicitly and fail loudly if it goes missing, rather than shipping a dead widget.
[ -f "$PUB/vendor/kbuild-monitor.js" ] || { echo "   !! vendor/kbuild-monitor.js missing — the kpool widget cannot boot without it"; exit 1; }
mkdir -p "$DIST/vendor"; cp "$PUB/vendor/kbuild-monitor.js" "$DIST/vendor/kbuild-monitor.js"

# SIGNPAGE-KBM2 (2026-09-05): and stop the widget BOOT depending on it. On the live PHP site
# kbuild-monitor polls /build.php for live-reload diagnostics; a static bundle has no such
# endpoint, so bootstrap.js paid a 404 round trip before importing the widget and then fell
# back to Date.now() for the cache-bust -- which re-downloaded 47 KB of widget JS on EVERY
# load and pushed window.KPOOL past the sign page's 5s whenReady() budget, surfacing as
# "Signing widget failed to load". The bundle is immutable per deploy, so stamp the source
# sha and import immediately. kbuild-monitor.js is still shipped above for any page that
# loads it directly. Fails loudly if the boot block moves, rather than shipping a dead widget.
BOOT="$DIST/vendor/kpay/kpool_widget/bootstrap.js"
SRC_SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo static)"
grep -q 'await initBuildBanner()' "$BOOT" || { echo "   !! bootstrap.js boot block changed - re-point SIGNPAGE-KBM2"; exit 1; }
perl -0pi -e "s{import \\{ initBuildBanner \\}.*?Date\\.now\\(\\)}{// STATIC BUILD (SIGNPAGE-KBM2): no /build.php here and the bundle is immutable per\n// deploy, so the boot never waits on build diagnostics and the cache-bust is stable.\n// The live PHP site keeps the original kbuild-monitor behaviour.\nwindow.__BUILD_HASH__ = \"$SRC_SHA\"}s" "$BOOT"
grep -q "__BUILD_HASH__ = \"$SRC_SHA\"" "$BOOT" || { echo "   !! bootstrap.js rewrite did not apply"; exit 1; }
echo "   bootstrap.js  boot stamped $SRC_SHA (no /build.php round trip)"
# only the images the page actually references (the chrome's hero jpgs are not in the repo, and
# the repo-wide *.gif ignore would leave a copied gif uncommitted → dist-fresh gate false alarm)
mkdir -p "$DIST/assets/images"; cp "$PUB/assets/images/GM.ico" "$DIST/assets/images/"
# the two HTML fragments pages fetch at runtime (footer) / link to (keakonnect → kea-bind.html)
cp "$PUB/m/katomia/footer.html" "$PUB/m/katomia/kea-bind.html" "$DIST/m/katomia/"

echo "→ QA dashboard: static pages + git-tracked data (the .php feeds need a server; pages degrade)"
( cd "$PUB" && find m/katomia/qa -maxdepth 1 -type f -name '*.html' -print0; find m/katomia/qa/data -type f -name '*.json' -print0 ) \
  | while IFS= read -r -d '' f; do mkdir -p "$DIST/$(dirname "$f")"; cp "$PUB/$f" "$DIST/$f"; done

echo "→ KWC bundle $KWC_SNAP"
mkdir -p "$DIST/vendor/walletconnect/snapshots"
if [ -d "/var/www/kwc-snapshots/$KWC_SNAP" ]; then
  cp -r "/var/www/kwc-snapshots/$KWC_SNAP" "$DIST/vendor/walletconnect/snapshots/"
elif [ -d "$STASH/$KWC_SNAP" ]; then
  cp -r "$STASH/$KWC_SNAP" "$DIST/vendor/walletconnect/snapshots/"
else
  echo "   !! no KWC snapshot $KWC_SNAP available (shared store absent, dist had none)"; exit 1
fi
# KWC-SNAPMETA1 (2026-09-04): the bundle fetches release.json at boot, and an interrupted
# build once left a dist holding only kwc.iife.js — which then became the stash source for
# every later build, propagating the loss silently. Fail loudly instead.
for meta in build.json release.json; do
  [ -f "$DIST/vendor/walletconnect/snapshots/$KWC_SNAP/$meta" ] || {
    echo "   !! KWC snapshot $KWC_SNAP is missing $meta — restore it (git checkout build/dist/vendor/walletconnect/snapshots/$KWC_SNAP) before building"; exit 1; }
done
rm -rf "$STASH"

echo "→ router Worker + wrangler.toml ($NAME → $ALIAS_SERVICE); router mirrors lab22's .htaccess"
cp "$ROOT/build/router.js" "$DIST/router.js"
cat > "$DIST/wrangler.toml" <<WT
name = "$NAME"
main = "router.js"
compatibility_date = "2026-08-01"
[assets]
directory = "."
binding = "ASSETS"
# none: no automatic .html redirects, so an asset named board.html can never capture
# /board/<id> (that bit KATUI-HOME1 under auto-trailing-slash); router.js maps every clean URL
html_handling = "none"
not_found_handling = "none"
# Assets are normally served BEFORE the Worker runs (the same ordering that let _redirects
# hijack CSS in KATUI-CSS1). The walletconnect config is a real file that router.js must
# patch per request (metadata.url = serving origin), so route just that path Worker-first.
run_worker_first = ["/vendor/walletconnect/config.json"]

# Same-origin API path: /m/katomia/hapi/*, /hapi/*, /kfeedback*, /feedback-widget.js and the
# hapi.php / future shims are forwarded by router.js to the API alias Worker over this
# SERVICE BINDING — Workers cannot fetch sibling *.workers.dev URLs on the same account
# (error 1042). ALIAS_ORIGIN is the plain-fetch fallback for local harnesses only.
[[services]]
binding = "HAPI"
service = "$ALIAS_SERVICE"

# KATAPP-SPLIT1: /keaton, /deal and /legacy are handed to the Worker that still builds them
# (router.js, PAGES) — katapp does not carry those pages.
[[services]]
binding = "PAGES"
service = "$PAGES_SERVICE"

[vars]
ALIAS_ORIGIN = "https://${ALIAS%%/*}"
$( [ -n "$KATUI_DOMAIN" ] && printf '\n# LAB2-DEPLOY1: wrangler attaches the custom domain on deploy (zone on the same account)\nroutes = [{ pattern = "%s", custom_domain = true }]\n' "$KATUI_DOMAIN" )
WT

echo "→ .assetsignore (keep Worker config + wrangler's own droppings out of the PUBLIC bundle:"
echo "   a deploy run from inside dist/ once uploaded .wrangler/cache/wrangler-account.json — KATUI-LEAK1)"
cat > "$DIST/.assetsignore" <<AI
.wrangler
router.js
wrangler.toml
.assetsignore
AI

echo "→ build-info.json (KAT-BUILDSTAMP1: the profile build stamp reads this)"
cat > "$DIST/m/katomia/build-info.json" <<BI
{
  "source_sha": "$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)",
  "variant": "$NAME",
  "alias": "$ALIAS",
  "kwc_snapshot": "$KWC_SNAP",
  "built": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
BI

echo "✓ dist ready: $DIST  (variant: $NAME → $ALIAS_SERVICE)"
echo "  files: $(find "$DIST" -type f | wc -l), size: $(du -sh "$DIST" | cut -f1)"
