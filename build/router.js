// katui router — the Worker in front of the static katomia bundle (build/dist, build/dist-gcp).
// Mirrors lab22's Apache rules (public_html/m/katomia/.htaccess + the root vhost) so the
// URLs people already share keep working on Cloudflare, plus shims for the lab22 PHP
// endpoints the static bundle lost (KATUI-SHIMS1). Route map:
//
//  page routes (clean URL → rendered shell; the shell's JS reads ids from the URL)
//   /, /m, /m/                         → 302 /m/katomia/
//   /m/katomia/, /m/katomia/welcome    → index.html   (?skin=liquid|clay|bubble → index-<skin>.html)
//   /m/katomia/markets|circles|learn|host|create|binding → <name>.html
//                                        (create?skin=basic → create-basic.html)
//   /m/katomia/game/<id>               → game.html
//   /m/katomia/board/<id>              → board.html
//   /m/katomia/qa/                     → qa/index.html   (/qa and /m/katomia/qa 302 → the slash
//                                        form, so the dashboard's relative data/… fetches resolve)
//  sibling assets (pages use RELATIVE asset paths; under /game/<id> and /board/<id> the
//  browser resolves them one level deep, so rewrite back to the /m/katomia/ sibling)
//   /m/katomia/(game|board)/<file>.<ext> → /m/katomia/<file>.<ext>
//  API — everything below is forwarded to the kpay-api-alias Worker over the HAPI SERVICE
//  BINDING (Workers cannot fetch sibling *.workers.dev URLs on the same account, error 1042).
//  The alias maps /hapi/<path> → <BACKEND_ORIGIN>/<path>.
//   /m/katomia/hapi/<x>                → /hapi/katomia/<x>   (.htaccess ^hapi/… → hapi.php → /katomia/<x>)
//   /m/katomia/hapi.php?action=X&qs    → /hapi/katomia/X?qs  (lab22 hapi.php convention, default create)
//   /future/?action=X&qs               → /hapi/kpool/X?qs    (lab22 future/kpool.php; board signing
//                                                             reads tx bytes from /future/?action=txRead)
//   /hapi/<x>                          → /hapi/<x>           (root vhost /hapi/ reverse proxy: /hapi/ws,
//                                                             used when a page runs with HAPI_BASE "")
//   /kfeedback…, /feedback-widget.js   → same paths          (clean aliases on the alias Worker)
//  local-only endpoints
//   /diag, /kflow                      → 204  (lab22-local log drops; no backend equivalent)
//   /m/tools/glog/latest/*             → /m/tools/glog/src/* (glog ships no dist build)
//  config
//   /vendor/walletconnect/config.json  → static file with metadata.url/name patched to the
//     serving origin (what vendor/walletconnect/config.php does per request on lab22)
//
// Everything else is served straight from assets (html_handling = none: no auto redirects,
// so an asset named board.html never captures /board/<id> — that bit KATUI-HOME1).

const K = '/m/katomia';
const PAGES = new Set(['welcome', 'markets', 'circles', 'learn', 'host', 'create', 'binding']);
const LANDING_SKINS = new Set(['liquid', 'clay', 'bubble']);
// The alias's own path allowlist is [A-Za-z0-9/_-]: no dots, so "..", hidden files and
// traversal are unexpressible (same SAFE BY OMISSION rule as the .htaccess hapi rule).
const KHAPI = /^\/m\/katomia\/hapi\/([A-Za-z0-9/_-]+)\/?$/;
const RHAPI = /^\/hapi\/([A-Za-z0-9/_-]+)\/?$/;
const ACTION = /^[A-Za-z0-9_-]+$/;
const SIBLING = /^\/m\/katomia\/(?:game|board)\/(.+\.[^/]+)$/;       // …/game/<any>.<ext>
const IDPAGE = /^\/m\/katomia\/(game|board)(?:\/([^/.]+))?\/?$/;     // game, board, or …/<id>
const GLOG = /^\/m\/tools\/glog\/latest\/(.+)$/;
const BRANDS = [
  ['gomint.me',   { name: 'GoMint',  description: 'Tokenizing the future' }],
  ['katomia.com', { name: 'Katomia', description: 'Multi-party value exchange on Hedera' }],
  ['katomic.org', { name: 'Katomia', description: 'Multi-party value exchange on Hedera' }],
];

function asset(env, request, url, path) {
  return env.ASSETS.fetch(new Request(new URL(path + url.search, url), request));
}

async function proxyAlias(env, request, url, path, search = url.search) {
  const target = new URL(path + search, env.ALIAS_ORIGIN || 'https://kpay-api-alias.tayloa17.workers.dev');
  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', url.host);   // backend-built permalinks point at THIS origin
  const init = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) { init.body = request.body; init.duplex = 'half'; }  // duplex: Node's fetch needs it for stream bodies; Workers ignore it
  const req = new Request(target, init);
  return env.HAPI ? env.HAPI.fetch(req) : fetch(req);   // binding in production; plain fetch only for local harnesses
}

// lab22's ?action= proxy convention → the alias's path convention
function actionRoute(url, base, defAction) {
  const q = new URLSearchParams(url.search);
  const action = q.get('action') || defAction;
  q.delete('action');
  if (!ACTION.test(action)) return { kind: 'bad' };
  const qs = q.toString();
  return { kind: 'alias', path: base + action, search: qs ? '?' + qs : '' };
}

async function wcConfig(env, request, url) {
  const res = await asset(env, request, url, '/vendor/walletconnect/config.json');
  if (!res.ok) return res;
  let cfg;
  try { cfg = await res.json(); } catch { return res; }
  cfg.metadata = cfg.metadata || {};
  cfg.metadata.url = url.origin;
  for (const [suffix, brand] of BRANDS)
    if (url.hostname.endsWith(suffix)) { cfg.metadata.name = brand.name; cfg.metadata.description = brand.description; break; }
  return new Response(JSON.stringify(cfg, null, 2), {
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-cache' },
  });
}

export function route(url) {
  // { kind: 'asset', path } | { kind: 'alias', path, search? } | { kind: 'wc' } | { kind: 'redirect', to }
  // | { kind: 'empty' } | { kind: 'bad' } | null (plain asset)
  const p = url.pathname;
  let m;
  if (p === '/' || p === '/m' || p === '/m/') return { kind: 'redirect', to: K + '/' };
  if (p === K || p === K + '/' || p === K + '/welcome' || p === K + '/welcome/') {
    const skin = url.searchParams.get('skin');
    return { kind: 'asset', path: K + (skin && LANDING_SKINS.has(skin) ? `/index-${skin}.html` : '/index.html') };
  }
  if ((m = p.match(/^\/m\/katomia\/([a-z]+)\/?$/)) && PAGES.has(m[1])) {
    if (m[1] === 'create' && url.searchParams.get('skin') === 'basic') return { kind: 'asset', path: K + '/create-basic.html' };
    return { kind: 'asset', path: K + `/${m[1]}.html` };
  }
  if (p === '/qa' || p === '/qa/' || p === K + '/qa') return { kind: 'redirect', to: K + '/qa/' };
  if (p === K + '/qa/') return { kind: 'asset', path: K + '/qa/index.html' };
  if ((m = p.match(KHAPI))) return { kind: 'alias', path: '/hapi/katomia/' + m[1] };
  if (p === K + '/hapi.php') return actionRoute(url, '/hapi/katomia/', 'create');   // 'create' = hapi.php's own default
  if (/^\/future\/(index\.php)?$/.test(p) && url.searchParams.has('action')) return actionRoute(url, '/hapi/kpool/', '');
  if ((m = p.match(RHAPI))) return { kind: 'alias', path: '/hapi/' + m[1] };
  if (p === '/feedback-widget.js' || p.startsWith('/kfeedback')) return { kind: 'alias', path: p };
  if (p === '/diag' || p === '/kflow') return { kind: 'empty' };
  if ((m = p.match(GLOG))) return { kind: 'asset', path: '/m/tools/glog/src/' + m[1] };
  if ((m = p.match(SIBLING))) return { kind: 'asset', path: K + '/' + m[1] };
  if ((m = p.match(IDPAGE))) return { kind: 'asset', path: K + `/${m[1]}.html` };
  if (p === '/vendor/walletconnect/config.json') return { kind: 'wc' };
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const r = route(url);
    if (!r) return env.ASSETS.fetch(request);
    switch (r.kind) {
      case 'redirect': return Response.redirect(new URL(r.to + url.search, url), 302);
      case 'asset':    return asset(env, request, url, r.path);
      case 'alias':    return proxyAlias(env, request, url, r.path, r.search);
      case 'wc':       return wcConfig(env, request, url);
      case 'empty':    return new Response(null, { status: 204 });
      case 'bad':      return new Response('bad action', { status: 400 });
    }
  },
};
