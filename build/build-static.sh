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
# Usage:  build/build-static.sh            # dist → build/dist (committed)
#   ALIAS=host/path  override the API alias (host+path, scheme-less — HAPI_BASE convention)
#   SITE_HOST=…      Host header used for the render (only affects nothing the router
#                    doesn't already patch per-request; kept for parity with lab22 renders)
set -euo pipefail
ALIAS="${ALIAS:-kpay-api-alias.tayloa17.workers.dev/hapi}"
SITE_HOST="${SITE_HOST:-katui.tayloa17.workers.dev}"
PORT="${PORT:-8099}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$ROOT/public_html"; DIST="$ROOT/build/dist"; SRC="http://127.0.0.1:$PORT"
KWC_SNAP="4a3351b"   # KWC-CLEANBUILD1 bundle (see vendor/walletconnect/kwcScriptTag.php)

command -v php >/dev/null || { echo "php CLI required (>= 8.0)"; exit 1; }

# ── build-time env: hapi_base.php reads dirname(DOCUMENT_ROOT)/.env_hapi ──────────
# Never clobber a real one (lab22 / a GCP checkout serving PHP): stash + restore.
ENV_FILE="$ROOT/.env_hapi"; ENV_BAK=""
if [ -e "$ENV_FILE" ]; then ENV_BAK="$(mktemp)"; cp "$ENV_FILE" "$ENV_BAK"; fi
cleanup(){
  [ -n "${PHP_PID:-}" ] && kill "$PHP_PID" 2>/dev/null || true
  if [ -n "$ENV_BAK" ]; then cp "$ENV_BAK" "$ENV_FILE"; rm -f "$ENV_BAK"; else rm -f "$ENV_FILE"; fi
}
trap cleanup EXIT
printf 'HAPI_BASE=%s\n' "$ALIAS" > "$ENV_FILE"
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
[ -d "$DIST/vendor/walletconnect/snapshots/$KWC_SNAP" ] && cp -r "$DIST/vendor/walletconnect/snapshots/$KWC_SNAP" "$STASH/"
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
render "$K/index.php?page=host"              m/katomia/host.html
render "$K/index.php?page=create"            m/katomia/create.html
render "$K/index.php?page=create&skin=basic" m/katomia/create-basic.html   # ENTRY-CREATEBASIC1
render "$K/game.php?game="                   m/katomia/game.html           # shell: id from URL
render "$K/board.php"                        m/katomia/board.html          # shell: id from URL
render "$K/binding.php"                      m/katomia/binding.html

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
rm -rf "$STASH"

echo "→ router Worker + wrangler.toml (assets-only Worker; router mirrors lab22's .htaccess)"
cp "$ROOT/build/router.js" "$DIST/router.js"
cat > "$DIST/wrangler.toml" <<WT
name = "katui"
main = "router.js"
compatibility_date = "2026-08-01"
[assets]
directory = "."
binding = "ASSETS"
html_handling = "none"
not_found_handling = "none"

# Same-origin API path: /m/katomia/hapi/* (and /hapi/*, /kfeedback*, /feedback-widget.js)
# are forwarded by router.js to the API alias Worker at ALIAS_ORIGIN (Worker-to-Worker
# fetch; a [[services]] binding named ALIAS would be used instead if one is added).
[vars]
ALIAS_ORIGIN = "https://${ALIAS%%/*}"
WT

echo "✓ dist ready: $DIST"
echo "  files: $(find "$DIST" -type f | wc -l), size: $(du -sh "$DIST" | cut -f1)"
