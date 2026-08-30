#!/bin/bash
# build-static.sh — P3: render the katomia app to a static bundle for Cloudflare Pages.
# The katomia pages have no per-user server state, so each is rendered ONCE (empty game
# = game-agnostic shell; the client reads the real gameId from the URL via getGameId()).
# Config is repointed from same-origin "" to the API alias so HTTP + WS go through the Worker.
set -euo pipefail
SRC="https://127.0.0.1"; HOST="lab22.kpay.uk"
ALIAS="kpay-api-alias.tayloa17.workers.dev/hapi"     # host+path, scheme-less (HAPI_BASE convention)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$ROOT/public_html"; DIST="$ROOT/build/dist"
get(){ curl -s -k -H "Host: $HOST" "$SRC$1"; }
# rewrite the same-origin config to the alias (works for both HAPI_BASE:"" and config.js)
repoint(){ sed "s#HAPI_BASE: *\"\"#HAPI_BASE: \"$ALIAS\"#g"; }

rm -rf "$DIST"; mkdir -p "$DIST/m/katomia"
echo "→ rendering board shell (empty game = game-agnostic)"
get "/m/katomia/board.php" | repoint \
  | sed "s#/feedback-widget.js#https://$ALIAS/feedback-widget.js#g" \
  > "$DIST/m/katomia/board.html"

echo "→ rendering widget config.js (config.js.php → static, alias-pinned)"
mkdir -p "$DIST/vendor/kpay/kpool_widget"
get "/vendor/kpay/kpool_widget/config.js" | repoint > "$DIST/vendor/kpay/kpool_widget/config.js"

echo "→ rendering walletconnect config.json (config.php → static)"
mkdir -p "$DIST/vendor/walletconnect"
get "/vendor/walletconnect/config.json" > "$DIST/vendor/walletconnect/config.json"

echo "→ copying static asset trees (js/css/assets/images/wasm — no .php)"
copytree(){ # $1 = path under public_html
  cd "$PUB"
  find "$1" -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.png' -o -name '*.jpg' -o -name '*.gif' -o -name '*.ico' -o -name '*.json' -o -name '*.wasm' -o -name '*.webmanifest' -o -name '*.woff2' \) \
    -not -path '*/qa/*' -not -path '*/.git/*' | while read -r f; do
      mkdir -p "$DIST/$(dirname "$f")"; cp "$f" "$DIST/$f"
  done
}
copytree m/katomia
copytree m/bid
copytree vendor/kpay/kpool_widget
# KWC bundle lives in the shared store (symlinked on lab22), copy it directly
mkdir -p "$DIST/vendor/walletconnect/snapshots/4a3351b"
cp /var/www/kwc-snapshots/4a3351b/* "$DIST/vendor/walletconnect/snapshots/4a3351b/"
copytree m/tools/glog 2>/dev/null || true

echo "→ wrangler.toml (assets-only Worker, so the Workers&Pages flow serves the folder)"
cat > "$DIST/router.js" <<'RT'
const BOARD = /^\/m\/katomia\/board(\/[^/]+)?\/?$/;
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (BOARD.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/m/katomia/board.html', url), request));
    return env.ASSETS.fetch(request);
  }
};
RT
cat > "$DIST/wrangler.toml" <<WT
name = "katui"
main = "router.js"
compatibility_date = "2026-08-01"
[assets]
directory = "."
binding = "ASSETS"
html_handling = "none"
WT

echo "→ Cloudflare Pages routing (_redirects): /board/<id> → the shell"
cat > "$DIST/_redirects" <<EOF
/m/katomia/board/*   /m/katomia/board.html   200
EOF

echo "✓ dist ready: $DIST"
echo "  files: $(find "$DIST" -type f | wc -l), size: $(du -sh "$DIST" | cut -f1)"
