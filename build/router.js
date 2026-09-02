// katui router — the Worker in front of the static katomia bundle (build/dist).
// Mirrors lab22's Apache rules (public_html/m/katomia/.htaccess) so the same URLs
// people already share keep working on Cloudflare:
//
//  page routes (clean URL → rendered shell; the shell's JS reads ids from the URL)
//   /                                  → /m/katomia/index.html   (welcome)
//   /m/katomia/, /m/katomia/welcome    → index.html   (?skin=liquid|clay|bubble → index-<skin>.html)
//   /m/katomia/markets|circles|learn|host|create → <name>.html  (create?skin=basic → create-basic.html)
//   /m/katomia/game/<id>               → game.html
//   /m/katomia/board/<id>              → board.html
//   /m/katomia/binding                 → binding.html
//   /m/katomia/qa/                     → qa/index.html   (/qa and /m/katomia/qa 302 → the slash form,
//                                        so the dashboard's relative data/… fetches resolve)
//  sibling assets (pages use RELATIVE asset paths; under /game/<id> and /board/<id> the
//  browser resolves them one level deep, so rewrite back to the /m/katomia/ sibling)
//   /m/katomia/(game|board)/<file>.<ext> → /m/katomia/<file>.<ext>
//  API (same-origin, like the .htaccess `^hapi/(...)` rule → hapi.php → backend)
//   /m/katomia/hapi/<path>, /hapi/<path>, /kfeedback…, /feedback-widget.js
//     → the kpay-api-alias Worker (service binding ALIAS; fallback env.ALIAS_ORIGIN)
//  config
//   /vendor/walletconnect/config.json → static file with metadata.url/name patched to the
//     serving origin (what vendor/walletconnect/config.php does per request on lab22)
//
// Everything else is served straight from assets.

const K = '/m/katomia';
const PAGES = new Set(['welcome', 'markets', 'circles', 'learn', 'host', 'create', 'binding']);
const LANDING_SKINS = new Set(['liquid', 'clay', 'bubble']);
// /katomia/<action> through the alias must stay within the PHP allowlist shape — no dots,
// so "..", hidden files and traversal are unexpressible (same SAFE BY OMISSION rule as .htaccess)
const HAPI = /^(?:\/m\/katomia)?\/hapi\/([A-Za-z0-9/_-]+)\/?$/;
const SIBLING = /^\/m\/katomia\/(?:game|board)\/(.+\.[^/]+)$/;       // …/game/<any>.<ext>
const IDPAGE = /^\/m\/katomia\/(game|board)(?:\/([^/.]+))?\/?$/;     // game, board, or …/<id>
const BRANDS = [
  ['gomint.me',   { name: 'GoMint',  description: 'Tokenizing the future' }],
  ['katomia.com', { name: 'Katomia', description: 'Multi-party value exchange on Hedera' }],
  ['katomic.org', { name: 'Katomia', description: 'Multi-party value exchange on Hedera' }],
];

function asset(env, request, url, path) {
  return env.ASSETS.fetch(new Request(new URL(path + url.search, url), request));
}

async function proxyAlias(env, request, url, path) {
  // /hapi/<path> on the alias == <BACKEND_ORIGIN>/<path>; /kfeedback + widget are clean aliases there
  const target = new URL(path + url.search, env.ALIAS_ORIGIN || 'https://kpay-api-alias.tayloa17.workers.dev');
  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', url.host);
  const init = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) { init.body = request.body; init.duplex = 'half'; }  // duplex: required by Node's fetch for stream bodies, ignored by Workers
  const req = new Request(target, init);
  return env.ALIAS ? env.ALIAS.fetch(req) : fetch(req);
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
  // returns { kind: 'asset', path } | { kind: 'alias', path } | { kind: 'wc' } | { kind: 'redirect', to } | null
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
  if ((m = p.match(HAPI))) return { kind: 'alias', path: '/hapi/' + m[1] };
  if (p === '/feedback-widget.js' || p.startsWith('/kfeedback')) return { kind: 'alias', path: p };
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
      case 'alias':    return proxyAlias(env, request, url, r.path);
      case 'wc':       return wcConfig(env, request, url);
    }
  },
};
