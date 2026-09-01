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
# KATUI-HOME1 (2026-09-01): render the whole entry surface, not just the board.
# Same one-shot logic as the board shell: none of these pages carries per-user
# server state — only HAPI_BASE is injected (repoint rewrites it) and the
# feedback widget src is pinned to the alias (its canonical home is the backend).
# Clean URLs (/circles etc.) are served by html_handling=auto-trailing-slash.
render(){ get "$1" | repoint \
  | sed "s#/feedback-widget.js#https://$ALIAS/feedback-widget.js#g" \
  > "$DIST/m/katomia/$2"; }
echo "→ rendering board shell (empty game = game-agnostic)"
# board-SHELL, not board.html: with html_handling=auto-trailing-slash an asset named
# board.html OWNS the /board path and 307-normalizes /board/<id> → /board, stripping
# the game id before the Worker ever runs. A name no URL uses keeps /board/* with
# router.js (KATUI-HOME1).
render "/m/katomia/board.php" board-shell.html
echo "→ rendering entry pages (KATUI-HOME1)"
render "/m/katomia/"        index.html     # landing — the default root (ENTRY-DEFAULTROOT1)
render "/m/katomia/welcome" welcome.html   # same landing at its opt-in path
render "/m/katomia/circles" circles.html
render "/m/katomia/markets" markets.html
render "/m/katomia/learn"   learn.html
render "/m/katomia/host"    host.html

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

echo "→ router.js + wrangler.toml (Worker with assets; router adds the PHP shims)"
cat > "$DIST/router.js" <<'RT'
// katui router. Mirrors lab22's board .htaccess sibling rule, plus shims for the
// lab22 PHP endpoints the static bundle lost (KATUI-SHIMS1, 2026-08-31):
//  · /m/katomia/board/<id>             → board.html shell (URL kept → getGameId() reads <id>)
//  · /m/katomia/board/<anything>.<ext> → /m/katomia/<anything>.<ext>
//    (board.html uses RELATIVE asset paths; under /board/<id> the browser resolves them
//     against /m/katomia/board/, so they must be rewritten back to the /m/katomia/ siblings)
//  · /m/katomia/hapi.php?action=X&<qs> → alias /hapi/katomia/X?<qs>   (lab22 hapi.php)
//  · /future/?action=X&<qs>            → alias /hapi/kpool/X?<qs>     (lab22 future/kpool.php;
//    board signing reads tx bytes from /future/?action=txRead)
//  · /diag, /kflow                     → 204. These are lab22-LOCAL log drops (diag.php/
//    kflow.php → logs/); the backend has no equivalent (probed 404, 2026-08-31), and lab22
//    itself is admin-IP-only so the Worker cannot forward there. Swallow the beacons so the
//    console stays clean; client-side kdiag (profile → Copy diagnostics) is unaffected.
//  · /m/tools/glog/latest/*            → /m/tools/glog/src/*  (glog ships no dist/ build;
//    same file the lab22 .htaccess "working/" dev alias serves)
// The alias is reached via a SERVICE BINDING (env.HAPI): Workers cannot fetch sibling
// *.workers.dev URLs on the same account (error 1042) — bindings are the sanctioned path.
const ASSET = /^\/m\/katomia\/board\/(.+\.[^/]+)$/;   // anything after board/ ending in .ext
const PAGE  = /^\/m\/katomia\/board(\/[^/.]+)?\/?$/;  // board, or board/<id> (no dot)
const GLOG  = /^\/m\/tools\/glog\/latest\/(.+)$/;
// KATUI-HOME1: clean backend route — mirrors lab22's .htaccess
// ^hapi/([a-zA-Z0-9/_-]+)$ → hapi.php?action=$1. Same no-dot class, same reason:
// traversal/hidden files are unexpressible. Client JS calls e.g. /m/katomia/hapi/games.
const KHAPI = /^\/m\/katomia\/hapi\/([A-Za-z0-9/_-]+)$/;
// Translate lab22's ?action= proxy convention to the alias Worker's path convention.
// Action is restricted to the alias's own allowlist alphabet so no path tricks pass.
function toAlias(request, url, base, defAction, env) {
  const q = new URLSearchParams(url.search);
  const action = q.get('action') || defAction;
  q.delete('action');
  if (!/^[A-Za-z0-9_-]+$/.test(action)) return new Response('bad action', { status: 400 });
  const qs = q.toString();
  const target = 'https://kpay-api-alias.tayloa17.workers.dev/hapi' + base + action + (qs ? '?' + qs : '');
  return env.HAPI.fetch(new Request(target, request));
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url); let m;
    if ((m = url.pathname.match(ASSET)))
      return env.ASSETS.fetch(new Request(new URL('/m/katomia/' + m[1] + url.search, url), request));
    if (PAGE.test(url.pathname))   // extensionless: ASSETS 307-canonicalizes *.html under auto-trailing-slash
      return env.ASSETS.fetch(new Request(new URL('/m/katomia/board-shell', url), request));
    if (url.pathname === '/m/katomia/hapi.php')
      return toAlias(request, url, '/katomia/', 'create', env);   // 'create' = hapi.php's own default
    if (/^\/future\/(index\.php)?$/.test(url.pathname) && url.searchParams.has('action'))
      return toAlias(request, url, '/kpool/', '', env);
    if ((m = url.pathname.match(KHAPI)))
      return env.HAPI.fetch(new Request('https://kpay-api-alias.tayloa17.workers.dev/hapi/katomia/' + m[1] + url.search, request));
    // feedback widget same-origin fallback (pages without window.CONFIG, e.g. host):
    // the alias routes /kfeedback* to the backend verbatim
    if (url.pathname.startsWith('/kfeedback'))
      return env.HAPI.fetch(new Request('https://kpay-api-alias.tayloa17.workers.dev' + url.pathname + url.search, request));
    if (url.pathname === '/diag' || url.pathname === '/kflow')
      return new Response(null, { status: 204 });
    if (url.pathname === '/')
      return Response.redirect(new URL('/m/katomia/', url), 302);
    if ((m = url.pathname.match(GLOG)))
      return env.ASSETS.fetch(new Request(new URL('/m/tools/glog/src/' + m[1] + url.search, url), request));
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
# auto-trailing-slash: /m/katomia/ serves index.html, /m/katomia/circles serves
# circles.html — no per-page router mapping needed (KATUI-HOME1)
html_handling = "auto-trailing-slash"

# hapi.php / future shim route through the API alias Worker (same account), see router.js
[[services]]
binding = "HAPI"
service = "kpay-api-alias"
WT

echo "→ .assetsignore (keep Worker config + wrangler's own droppings out of the PUBLIC bundle:"
echo "   a deploy run from inside dist/ once uploaded .wrangler/cache/wrangler-account.json"
echo "   — account id + name — as a public asset, KATUI-LEAK1 2026-08-31)"
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
  "kwc_snapshot": "4a3351b",
  "built": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
BI

# NOTE: no _redirects file. Workers static assets DO honor _redirects, and asset
# routing runs BEFORE the Worker script -- so a /m/katomia/board/* catch-all here
# hijacks board/katomia.css etc. and serves the HTML shell instead of letting
# router.js rewrite them to the /m/katomia/ siblings (KATUI-CSS1, 2026-08-31).
# router.js alone handles both the shell rewrite and the asset rewrite.

echo "✓ dist ready: $DIST"
echo "  files: $(find "$DIST" -type f | wc -l), size: $(du -sh "$DIST" | cut -f1)"
