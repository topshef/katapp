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
    if (PAGE.test(url.pathname))
      return env.ASSETS.fetch(new Request(new URL('/m/katomia/board.html', url), request));
    if (url.pathname === '/m/katomia/hapi.php')
      return toAlias(request, url, '/katomia/', 'create', env);   // 'create' = hapi.php's own default
    if (/^\/future\/(index\.php)?$/.test(url.pathname) && url.searchParams.has('action'))
      return toAlias(request, url, '/kpool/', '', env);
    if (url.pathname === '/diag' || url.pathname === '/kflow')
      return new Response(null, { status: 204 });
    if ((m = url.pathname.match(GLOG)))
      return env.ASSETS.fetch(new Request(new URL('/m/tools/glog/src/' + m[1] + url.search, url), request));
    return env.ASSETS.fetch(request);
  }
};
