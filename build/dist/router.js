// katui router — the Worker in front of the static katomia bundle (build/dist, build/dist-gcp).
// Mirrors lab22's Apache rules (public_html/m/katomia/.htaccess + the root vhost) so the
// URLs people already share keep working on Cloudflare, plus shims for the lab22 PHP
// endpoints the static bundle lost (KATUI-SHIMS1). Route map:
//
//  page routes (clean URL → rendered shell; the shell's JS reads ids from the URL)
//   /, /m, /m/                         → 302 /m/katomia/
//   /m/katomia/, /m/katomia/welcome    → index.html   (?skin=liquid|clay|bubble → index-<skin>.html)
//   /m/katomia/markets|circles|learn|host|create|binding|advisor → <name>.html
//                                        (create?skin=basic → create-basic.html)
//   /m/katomia/game/<id>               → game.html
//   /m/katomia/board/<id>              → board.html
//   /m/katomia/KEA/                    → KEA/index.html   (KEA-WEB1: the signer's web app; /KEA and /kea/ redirect)
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
//   /m/sign/?action=X&qs                                       reads tx bytes from /future/?action=txRead;
//                                                             the sign page lists via /m/sign/?action=txList)
//   /m/sign/, /future/ (no action)     → m/sign/index.html  (SIGNPAGE-STATIC1: the external signing page,
//                                                             future/index_v2.php rendered at build; deep-link
//                                                             ?network=&txid=&pch= is read client-side)
//   /m/katomia/binding.php?…           → binding.html        (katomia-auth.js links the .php name)
//   /m/feedback/?product=…             → m/feedback/index.html (the feedback widget's fallback link)
//   /assets/css/style.css.php?ts       → /assets/css/style.php.css (site chrome, rendered at build)
//   /m/bid/explore/kpool?action=X&qs   → /hapi/kpool/X?qs    (the kpool WIDGET's own txRead path)
//   /hapi/<x>                          → /hapi/<x>           (root vhost /hapi/ reverse proxy: /hapi/ws,
//                                                             used when a page runs with HAPI_BASE "")
//   /kfeedback…, /feedback-widget.js   → same paths          (clean aliases on the alias Worker)
//   /legacy/deals/                     → legacy/deals/index.html   (LEGACY-DEALS1: the V1 deal
//   /legacy/deals/?action=X&qs         → /hapi/legacy/X?qs           archive lookup. Own top-level
//                                                                    prefix so ONE Cloudflare rule
//                                                                    gates the page and its API.)
//  local-only endpoints
//   /diag                              → /hapi/diag  (DIAG-SINK1: the backend keeps the client trail)
//   /kflow                             → 204  (lab22-local log drop; no backend equivalent)
//   /m/tools/glog/latest/*             → /m/tools/glog/src/* (glog ships no dist build)
//  config
//   /vendor/walletconnect/config.json  → static file with metadata.url/name patched to the
//     serving origin (what vendor/walletconnect/config.php does per request on lab22)
//
// Everything else is served straight from assets (html_handling = none: no auto redirects,
// so an asset named board.html never captures /board/<id> — that bit KATUI-HOME1).

const K = '/m/katomia';
const PAGES = new Set(['welcome', 'markets', 'circles', 'learn', 'host', 'create', 'binding', 'advisor']);
const LANDING_SKINS = new Set(['liquid', 'clay', 'bubble']);
// The alias's own path allowlist is [A-Za-z0-9/_-]: no dots, so "..", hidden files and
// traversal are unexpressible (same SAFE BY OMISSION rule as the .htaccess hapi rule).
const KHAPI = /^\/m\/katomia\/hapi\/([A-Za-z0-9/_-]+)\/?$/;
const RHAPI = /^\/hapi\/([A-Za-z0-9/_-]+)\/?$/;
const ACTION = /^[A-Za-z0-9_-]+$/;
const SIBLING = /^\/m\/katomia\/(?:game|board)\/(.+\.[^/]+)$/;       // …/game/<any>.<ext>
const IDPAGE = /^\/m\/katomia\/(game|board)(?:\/([^/.]+))?\/?$/;     // game, board, or …/<id>
// The kpool widget's txRead is hardcoded to this absolute path (model.js), which lab22
// served via m/bid/explore/.htaccess `^kpool$ -> kpool.php` -> <backend>/kpool/<action>.
// Missing it cost a real signing flow: the tx signs and submits fine, but the status
// readback 404s, so the board never repaints the signature green (2026-09-03).
const KPOOL = /^\/m\/bid\/explore\/kpool(\.php)?$/;
// SIGNPAGE-STATIC1: /m/sign/ is lab22's `require /future/index.php` shim, so both spellings are
// the same page AND the same ?action= proxy (future/index.php dispatches to kpool.php on action).
// SIGNER-SLASH1 (2026-09-17): these match the SLASH form only. The bare /future/v3 used to
// match too and served the same page — but the page resolves its API base relatively, as
// `new URL('../')`, which is /future/ from /future/v3/ and / from /future/v3. Without the
// slash every call went to /?action=… , which 302s to the katomia home page, so the dashboard
// parsed HTML as JSON and reported "could not reach the pool" while every endpoint was fine.
// A directory-style page has to have its trailing slash; the bare form redirects to it below,
// exactly as /qa and /m/katomia/KEA already do.
const SIGNERVIEW = /^\/future\/v3(?:\/|\/index\.html)$/;    // SIGNER-VIEW1: the signer view
const SIGNERHELP = /^\/future\/v3\/help(?:\/|\/index\.html)$/;  // SIGNER-VIEW1: how KEA works
const SIGNERBIZ  = /^\/future\/v3\/help\/business(?:\/|\/index\.html)$/;  // the same, in business terms
// NOTES-CHROME1: the working notes — design notes and post-mortems, one directory each, so the
// set can grow without touching this file again. Served at /future/v3/notes/<slug>/.
const SIGNERNOTE  = /^\/future\/v3\/notes(?:\/|\/index\.html)$/;
// DEAL-CONVERT1: the v1 → v2 deal converter, a static page + a bundled module beside it.
const SIGNERCONV  = /^\/future\/v3\/convert(?:\/|\/index\.html)$/;
// LEGACY-DEALS1: the V1 deal archive lookup. Its own top-level prefix on purpose — the page
// AND every call it makes live under /legacy, so one Cloudflare rule gates the whole feature
// without touching code, and removing the feature is deleting these lines plus the directory.
// Same ?action= convention as the v3 pages: /legacy/deals/?action=search → /hapi/legacy/search.
const LEGACYDEALS = /^\/legacy\/deals(?:\/|\/index\.html)$/;
const SIGNERNOTES = /^\/future\/v3\/notes\/([a-z0-9-]+)(?:\/|\/index\.html)$/;
const SIGNPAGE = /^\/(?:m\/sign|future)(?:\/|\/index\.php)?$/;
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
  const target = new URL(path + search, env.ALIAS_ORIGIN || 'https://api.katomia.com');
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
  q.delete('hapi_base');   // admin-only override; kpool.php never forwarded it upstream either
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
  // KEA-WEB1: the KEA web app (the browser body of the signer) — index.php renders to KEA/index.html
  if (p === K + '/KEA' || p === K + '/kea' || p === K + '/kea/') return { kind: 'redirect', to: K + '/KEA/' };
  if (p === K + '/KEA/' || p === K + '/KEA/index.php' || p === K + '/KEA/app.html') return { kind: 'asset', path: K + '/KEA/index.html' };
  if ((m = p.match(KHAPI))) return { kind: 'alias', path: '/hapi/katomia/' + m[1] };
  if (p === K + '/hapi.php') return actionRoute(url, '/hapi/katomia/', 'create');   // 'create' = hapi.php's own default
  // SIGNER-VIEW1: the signer view, a plain static page. Matched BEFORE SIGNPAGE so the
  // /future prefix cannot swallow it, and it keeps its own ?action= proxy so the page can
  // call the pass-through relatively (../?action=…) exactly as it does on the PHP host.
  // SIGNER-SLASH1: the slash-less forms, longest first, before the matchers above see them
  if (p === '/future/v3')               return { kind: 'redirect', to: '/future/v3/' };
  if (p === '/future/v3/help')          return { kind: 'redirect', to: '/future/v3/help/' };
  if (p === '/future/v3/help/business') return { kind: 'redirect', to: '/future/v3/help/business/' };
  if (p === '/future/v3/notes')         return { kind: 'redirect', to: '/future/v3/notes/' };
  if (p === '/future/v3/convert')       return { kind: 'redirect', to: '/future/v3/convert/' };
  if (/^\/future\/v3\/notes\/[a-z0-9-]+$/.test(p)) return { kind: 'redirect', to: p + '/' };
  if (SIGNERNOTES.test(p)) return { kind: 'asset', path: '/future/v3/notes/' + SIGNERNOTES.exec(p)[1] + '/index.html' };
  if (SIGNERNOTE.test(p))  return { kind: 'asset', path: '/future/v3/notes/index.html' };
  if (SIGNERCONV.test(p))  return { kind: 'asset', path: '/future/v3/convert/index.html' };
  if (SIGNERBIZ.test(p))  return { kind: 'asset', path: '/future/v3/help/business/index.html' };
  if (SIGNERHELP.test(p)) return { kind: 'asset', path: '/future/v3/help/index.html' };
  if (SIGNERVIEW.test(p)) return url.searchParams.has('action')
    ? actionRoute(url, '/hapi/kpool/', '')
    : { kind: 'asset', path: '/future/v3/index.html' };
  if (p === '/legacy/deals') return { kind: 'redirect', to: '/legacy/deals/' };
  if (LEGACYDEALS.test(p)) return url.searchParams.has('action')
    ? actionRoute(url, '/hapi/legacy/', '')
    : { kind: 'asset', path: '/legacy/deals/index.html' };
  if (SIGNPAGE.test(p)) return url.searchParams.has('action') ? actionRoute(url, '/hapi/kpool/', '') : { kind: 'asset', path: '/m/sign/index.html' };
  if (p === K + '/binding.php') return { kind: 'asset', path: K + '/binding.html' };
  if (/^\/m\/feedback(?:\/|\/index\.php)?$/.test(p)) return { kind: 'asset', path: '/m/feedback/index.html' };   // widget fallback link
  if (p === '/assets/css/style.css.php') return { kind: 'asset', path: '/assets/css/style.php.css' };
  if (KPOOL.test(p)) return actionRoute(url, '/hapi/kpool/', 'txList');
  if ((m = p.match(RHAPI))) return { kind: 'alias', path: '/hapi/' + m[1] };
  if (p === '/feedback-widget.js' || p.startsWith('/kfeedback')) return { kind: 'alias', path: p };
  if (p === '/diag') return { kind: 'alias', path: '/hapi/diag' };
  if (p === '/m/katomia/qa/results.php') return { kind: 'alias', path: '/hapi/qa/results' };   // QA-EVENTS1: kwallet.html's verdict feed, now served by the backend   // DIAG-SINK1: client diag beacons → backend data/diag
  if (p === '/kflow') return { kind: 'empty' };
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
