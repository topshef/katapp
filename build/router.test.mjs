// Route-map unit test for the katui router Worker: node build/router.test.mjs
// Pure function `route(url)` — no Cloudflare runtime needed. Keep this in step with
// public_html/m/katomia/.htaccess whenever a clean URL is added there.
import { route } from './router.js';
import assert from 'node:assert/strict';

const O = 'https://katui.example';
const A = path => ({ kind: 'asset', path });
const cases = [
  ['/',                                   { kind: 'redirect', to: '/m/katomia/' }],
  ['/m/katomia',                          A('/m/katomia/index.html')],
  ['/m/katomia/',                         A('/m/katomia/index.html')],
  ['/m/katomia/welcome',                  A('/m/katomia/index.html')],
  ['/m/katomia/?skin=clay',               A('/m/katomia/index-clay.html')],
  ['/m/katomia/?skin=nope',               A('/m/katomia/index.html')],
  ['/m/katomia/markets',                  A('/m/katomia/markets.html')],
  ['/m/katomia/circles/',                 A('/m/katomia/circles.html')],
  ['/m/katomia/learn',                    A('/m/katomia/learn.html')],
  ['/m/katomia/host',                     A('/m/katomia/host.html')],
  ['/m/katomia/create',                   A('/m/katomia/create.html')],
  ['/m/katomia/create?skin=basic',        A('/m/katomia/create-basic.html')],
  ['/m/katomia/create/?skin=basic&x=1',   A('/m/katomia/create-basic.html')],
  ['/m/katomia/binding?network=testnet',  A('/m/katomia/binding.html')],
  ['/qa',                                 { kind: 'redirect', to: '/m/katomia/qa/' }],
  ['/m/katomia/qa',                       { kind: 'redirect', to: '/m/katomia/qa/' }],
  ['/m/katomia/qa/',                      A('/m/katomia/qa/index.html')],
  ['/m/katomia/qa/tests.html',            null],                         // plain asset
  ['/deal',                               { kind: 'redirect', to: '/deal/' }],            // DEALPAGE1
  ['/deal/',                              A('/deal/index.html')],
  ['/deal/?id=0c516f',                    A('/deal/index.html')],
  ['/deal/edit',                          { kind: 'redirect', to: '/deal/edit/' }],       // KATOMIC1
  ['/deal/edit/',                         A('/deal/edit/index.html')],
  ['/deal/edit/?id=0c516f',               A('/deal/edit/index.html')],
  ['/deal/edit/spec',                     { kind: 'redirect', to: '/deal/edit/spec/' }],
  ['/deal/edit/spec/',                    A('/deal/edit/spec/index.html')],
  ['/m/katomia/KEA',                      { kind: 'redirect', to: '/m/katomia/KEA/' }],   // KEA-WEB1
  ['/m/katomia/kea/',                     { kind: 'redirect', to: '/m/katomia/KEA/' }],
  ['/m/katomia/KEA/',                     A('/m/katomia/KEA/index.html')],
  ['/m/katomia/KEA/app.html',             A('/m/katomia/KEA/index.html')],
  ['/m/katomia/KEA/kea-app.js',           null],                         // plain asset
  ['/m/katomia/game/AbC123',              A('/m/katomia/game.html')],
  ['/m/katomia/game/AbC123/',             A('/m/katomia/game.html')],
  ['/m/katomia/board/AbC123',             A('/m/katomia/board.html')],
  ['/m/katomia/board',                    A('/m/katomia/board.html')],
  // sibling rewrite: a relative "kemoji.js" on /m/katomia/board/<id> resolves to
  // /m/katomia/board/kemoji.js (ONE segment deep — P3 router fix 8b60244)
  ['/m/katomia/board/kemoji.js',          A('/m/katomia/kemoji.js')],
  ['/m/katomia/game/katomia.css?v=1',     A('/m/katomia/katomia.css')],
  ['/m/katomia/game/assets/k.svg',        A('/m/katomia/assets/k.svg')],
  // same-origin API: /m/katomia/hapi/<x> is the .htaccess hapi rule → backend /katomia/<x>
  ['/m/katomia/hapi/create',              { kind: 'alias', path: '/hapi/katomia/create' }],
  ['/m/katomia/hapi/circle/update',       { kind: 'alias', path: '/hapi/katomia/circle/update' }],
  ['/m/katomia/hapi/game/AbC123?x=1',     { kind: 'alias', path: '/hapi/katomia/game/AbC123' }],
  ['/hapi/nodes',                         { kind: 'alias', path: '/hapi/nodes' }],             // root vhost proxy
  ['/hapi/ws',                            { kind: 'alias', path: '/hapi/ws' }],
  ['/m/katomia/hapi/../etc',              null],                         // dots unexpressible
  ['/m/katomia/hapi/a.b',                 null],
  // lab22 PHP shims (KATUI-SHIMS1)
  ['/m/katomia/hapi.php?action=games',    { kind: 'alias', path: '/hapi/katomia/games', search: '' }],
  ['/m/katomia/hapi.php',                 { kind: 'alias', path: '/hapi/katomia/create', search: '' }],
  ['/m/katomia/hapi.php?action=bindings&network=testnet', { kind: 'alias', path: '/hapi/katomia/bindings', search: '?network=testnet' }],
  ['/m/katomia/hapi.php?action=a.b',      { kind: 'bad' }],
  ['/future/?action=txRead&txid=1',       { kind: 'alias', path: '/hapi/kpool/txRead', search: '?txid=1' }],
  // the kpool widget's own hardcoded txRead path (model.js) — lab22 served it via
  // m/bid/explore/.htaccess -> kpool.php. Its absence stalled board signing on orange.
  ['/m/bid/explore/kpool?action=txRead&network=testnet&txid=0.0.1-2-3&detail=1',
                                          { kind: 'alias', path: '/hapi/kpool/txRead', search: '?network=testnet&txid=0.0.1-2-3&detail=1' }],
  ['/m/bid/explore/kpool.php?action=txRead&txid=1', { kind: 'alias', path: '/hapi/kpool/txRead', search: '?txid=1' }],
  ['/m/bid/explore/kpool',                { kind: 'alias', path: '/hapi/kpool/txList', search: '' }],
  ['/m/bid/explore/kpool?action=a.b',     { kind: 'bad' }],
  // the admin-only override is never forwarded upstream (kpool.php stripped it too)
  ['/m/bid/explore/kpool?action=txRead&txid=1&hapi_base=evil.example',
                                          { kind: 'alias', path: '/hapi/kpool/txRead', search: '?txid=1' }],
  ['/future/index.php?action=txList',     { kind: 'alias', path: '/hapi/kpool/txList', search: '' }],
  // SIGNPAGE-STATIC1: the external signing page (future/index_v2.php) and its own ?action= proxy
  ['/future/',                            A('/m/sign/index.html')],
  ['/m/sign',                             A('/m/sign/index.html')],
  ['/m/sign/?network=testnet&txid=0.0.1@2.3&pch=abc', A('/m/sign/index.html')],
  ['/m/sign/index.php?txid=1',            A('/m/sign/index.html')],
  ['/m/sign/?action=txList&network=testnet&since=600&until=600',
                                          { kind: 'alias', path: '/hapi/kpool/txList', search: '?network=testnet&since=600&until=600' }],
  ['/m/sign/?action=txSave',              { kind: 'alias', path: '/hapi/kpool/txSave', search: '' }],
  ['/m/signs/',                           null],
  ['/m/katomia/binding.php?network=testnet&accountId=0.0.1879', A('/m/katomia/binding.html')],
  ['/m/feedback/?product=katomia',        A('/m/feedback/index.html')],
  ['/m/feedback',                         A('/m/feedback/index.html')],
  ['/assets/css/style.css.php?1788180897', A('/assets/css/style.php.css')],
  ['/diag',                               { kind: 'alias', path: '/hapi/diag' }],
  ['/m/katomia/qa/results.php?days=14',   { kind: 'alias', path: '/hapi/qa/results' }],
  ['/kflow',                              { kind: 'empty' }],
  ['/m/tools/glog/latest/glog.js',        A('/m/tools/glog/src/glog.js')],
  ['/feedback-widget.js',                 { kind: 'alias', path: '/feedback-widget.js' }],
  ['/kfeedback/vote',                     { kind: 'alias', path: '/kfeedback/vote' }],
  ['/vendor/walletconnect/config.json',   { kind: 'wc' }],
  // SIGNER-VIEW1 / NOTES-CHROME1 / DEAL-CONVERT1: the static pages under /future/v3
  ['/future/v3',                          { kind: 'redirect', to: '/future/v3/' }],
  ['/future/v3/',                         A('/future/v3/index.html')],
  ['/future/v3/?action=txList&network=testnet', { kind: 'alias', path: '/hapi/kpool/txList', search: '?network=testnet' }],
  ['/future/v3/help/',                    A('/future/v3/help/index.html')],
  ['/future/v3/notes/bots/',              A('/future/v3/notes/bots/index.html')],
  ['/future/v3/notes/bots',               { kind: 'redirect', to: '/future/v3/notes/bots/' }],
  ['/future/v3/convert',                  { kind: 'redirect', to: '/future/v3/convert/' }],
  ['/future/v3/convert/',                 A('/future/v3/convert/index.html')],
  ['/future/v3/convert/index.html',       A('/future/v3/convert/index.html')],
  ['/future/v3/convert/kea-convert.browser.js', null],                  // plain asset beside the page
  // LEGACY-DEALS1: the V1 deal archive lookup, on its own prefix
  ['/legacy/deals',                       { kind: 'redirect', to: '/legacy/deals/' }],
  ['/legacy/deals/',                      A('/legacy/deals/index.html')],
  ['/legacy/deals/index.html',            A('/legacy/deals/index.html')],
  ['/legacy/deals/?action=search&id=35d71e', { kind: 'alias', path: '/hapi/legacy/search', search: '?id=35d71e' }],
  ['/legacy/deals/?action=status',        { kind: 'alias', path: '/hapi/legacy/status', search: '' }],
  ['/legacy/deals/?action=deal&dealId=35d71e', { kind: 'alias', path: '/hapi/legacy/deal', search: '?dealId=35d71e' }],
  ['/legacy/deals/?action=../evil',       { kind: 'bad' }],          // the action allowlist, not a path
  ['/legacy/',                            null],                     // no index of its own
  ['/legacy/deals/nope',                  null],
  ['/m/katomia/katomia-core.js?v=1',      null],
  ['/m/katomia/nope',                     null],
];
let n = 0;
for (const [path, want] of cases) {
  const got = route(new URL(O + path));
  assert.deepEqual(got, want, `route(${path}) → ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  n++;
}
console.log(`router: ${n}/${cases.length} route cases OK`);
