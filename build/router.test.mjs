// Route-map unit test for the katui router Worker: node build/router.test.mjs
// Pure function `route(url)` — no Cloudflare runtime needed. Keep this in step with
// public_html/m/katomia/.htaccess whenever a clean URL is added there.
import { route, handThrough } from './router.js';
import assert from 'node:assert/strict';

const O = 'https://katui.example';
const A = path => ({ kind: 'asset', path });
const R = to => ({ kind: 'redirect', to, code: 302 });   // ROOT-MOVE1: an old page address → the root
const cases = [
  // ROOT-MOVE1 (owner 2026-10-31): Katomia at the hostname root
  ['/',                                   A('/m/katomia/index.html')],
  ['/welcome',                            A('/m/katomia/index.html')],
  ['/?skin=clay',                         A('/m/katomia/index-clay.html')],
  ['/?skin=nope',                         A('/m/katomia/index.html')],
  ['/markets',                            A('/m/katomia/markets.html')],
  ['/circles/',                           A('/m/katomia/circles.html')],
  ['/learn',                              A('/m/katomia/learn.html')],
  ['/host',                               A('/m/katomia/host.html')],
  ['/advisor',                            A('/m/katomia/advisor.html')],
  ['/create',                             A('/m/katomia/create.html')],
  ['/create?skin=basic',                  A('/m/katomia/create-basic.html')],
  ['/create/?skin=basic&x=1',             A('/m/katomia/create-basic.html')],
  ['/binding?network=testnet',            A('/m/katomia/binding.html')],
  ['/binding.php?network=testnet&accountId=0.0.1879', A('/m/katomia/binding.html')],
  ['/qa',                                 { kind: 'redirect', to: '/qa/' }],
  ['/qa/',                                A('/m/katomia/qa/index.html')],
  ['/qa/tests.html',                      null],                         // the fetch falls back to m/katomia/
  ['/qa/results.php?days=14',             { kind: 'alias', path: '/hapi/qa/results' }],
  ['/m',                                  { kind: 'redirect', to: '/' }],
  ['/m/',                                 { kind: 'redirect', to: '/' }],
  ['/KEA',                                { kind: 'redirect', to: '/KEA/' }],   // KEA-WEB1
  ['/kea/',                               { kind: 'redirect', to: '/KEA/' }],
  ['/KEA/',                               A('/m/katomia/KEA/index.html')],
  ['/KEA/app.html',                       A('/m/katomia/KEA/index.html')],
  ['/KEA/kea-app.js',                     null],                         // the fetch falls back to m/katomia/
  ['/game/AbC123',                        A('/m/katomia/game.html')],
  ['/game/AbC123/',                       A('/m/katomia/game.html')],
  ['/board/AbC123',                       A('/m/katomia/board.html')],
  ['/board/t-prop~3',                     A('/m/katomia/board.html')],
  ['/board',                              A('/m/katomia/board.html')],
  // sibling rewrite: a relative "kemoji.js" on /board/<id> resolves to /board/kemoji.js
  // (ONE segment deep — P3 router fix 8b60244)
  ['/board/kemoji.js',                    A('/m/katomia/kemoji.js')],
  ['/game/katomia.css?v=1',               A('/m/katomia/katomia.css')],
  ['/game/assets/k.svg',                  A('/m/katomia/assets/k.svg')],
  ['/katomia-core.js?v=1',                null],                         // the fetch falls back to m/katomia/
  ['/nope',                               null],
  ['/hapi.php?action=assets',             { kind: 'alias', path: '/hapi/katomia/assets', search: '' }],
  ['/hapi.php?action=authenticate&x=1',   { kind: 'alias', path: '/hapi/katomia/authenticate', search: '?x=1' }],
  ['/hapi.php?action=a.b',                { kind: 'bad' }],
  ['/hapi/katomia/games',                 { kind: 'alias', path: '/hapi/katomia/games' }],
  // every old page address redirects to the same path without /m/katomia (the Worker keeps the
  // query); 302 during the lab1 trial, see OLDPAGE_CODE
  ['/m/katomia',                          R('/')],
  ['/m/katomia/',                         R('/')],
  ['/m/katomia/welcome',                  R('/welcome')],
  ['/m/katomia/?skin=clay',               R('/')],
  ['/m/katomia/markets',                  R('/markets')],
  ['/m/katomia/circles/',                 R('/circles/')],
  ['/m/katomia/create?skin=basic',        R('/create')],
  ['/m/katomia/advisor',                  R('/advisor')],
  ['/m/katomia/binding.php?network=testnet&accountId=0.0.1879', R('/binding.php')],
  ['/m/katomia/qa',                       R('/qa')],
  ['/m/katomia/qa/',                      R('/qa/')],
  ['/m/katomia/KEA',                      R('/KEA')],
  ['/m/katomia/kea/',                     R('/kea/')],
  ['/m/katomia/KEA/',                     R('/KEA/')],
  ['/m/katomia/KEA/app.html',             R('/KEA/app.html')],
  ['/m/katomia/game/AbC123',              R('/game/AbC123')],
  ['/m/katomia/board/t-trio',             R('/board/t-trio')],
  ['/m/katomia/board',                    R('/board')],
  // ...but the old FILES and API stay where they were, so a page cached before the move works
  ['/m/katomia/qa/tests.html',            null],                         // plain asset
  ['/m/katomia/KEA/kea-app.js',           null],
  ['/m/katomia/board/kemoji.js',          A('/m/katomia/kemoji.js')],
  ['/m/katomia/game/katomia.css?v=1',     A('/m/katomia/katomia.css')],
  ['/m/katomia/game/assets/k.svg',        A('/m/katomia/assets/k.svg')],
  ['/m/katomia/qa/results.php?days=14',   { kind: 'alias', path: '/hapi/qa/results' }],
  ['/deal',                               { kind: 'redirect', to: '/deal/' }],            // DEALPAGE1
  ['/deal/',                              A('/deal/index.html')],
  ['/deal/?id=0c516f',                    A('/deal/index.html')],
  ['/future/v3/convert/',                 { kind: 'redirect', to: '/deal/convert/', code: 301 }],    // DEAL-CONVERT2: moved
  ['/future/v3/convert',                  { kind: 'redirect', to: '/deal/convert/', code: 301 }],
  ['/deal/convert',                       { kind: 'redirect', to: '/deal/convert/' }],
  ['/deal/convert/',                      A('/deal/convert/index.html')],
  ['/deal/convert/?id=0c516f',            A('/deal/convert/index.html')],
  ['/deal/edit',                          { kind: 'redirect', to: '/deal/edit/' }],       // KATOMIC1
  ['/deal/edit/',                         A('/deal/edit/index.html')],
  ['/deal/edit/?id=0c516f',               A('/deal/edit/index.html')],
  ['/deal/edit/spec',                     { kind: 'redirect', to: '/deal/edit/spec/' }],
  ['/deal/edit/spec/',                    A('/deal/edit/spec/index.html')],
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
  ['/m/feedback/?product=katomia',        A('/m/feedback/index.html')],
  ['/m/feedback',                         A('/m/feedback/index.html')],
  ['/assets/css/style.css.php?1788180897', A('/assets/css/style.php.css')],
  ['/diag',                               { kind: 'alias', path: '/hapi/diag' }],
  ['/kflow',                              { kind: 'empty' }],
  ['/m/tools/glog/latest/glog.js',        A('/m/tools/glog/src/glog.js')],
  ['/feedback-widget.js',                 { kind: 'alias', path: '/feedback-widget.js' }],
  ['/kfeedback/vote',                     { kind: 'alias', path: '/kfeedback/vote' }],
  ['/vendor/walletconnect/config.json',   { kind: 'wc' }],
  // SIGNER-VIEW1 / NOTES-CHROME1: the static pages under /keaton
  ['/keaton',                             { kind: 'redirect', to: '/keaton/' }],
  ['/keaton/',                            A('/keaton/index.html')],
  ['/keaton/?action=txList&network=testnet', { kind: 'alias', path: '/hapi/kpool/txList', search: '?network=testnet' }],
  ['/keaton/help/',                       A('/keaton/help/index.html')],
  ['/keaton/notes/bots/',                 A('/keaton/notes/bots/index.html')],
  ['/keaton/notes/bots',                  { kind: 'redirect', to: '/keaton/notes/bots/' }],
  // KEATON-HOME1: every old address, permanently, whole path and query kept
  ['/future/v3',                          { kind: 'redirect', to: '/keaton/', code: 301 }],
  ['/future/v3/',                         { kind: 'redirect', to: '/keaton/', code: 301 }],
  ['/future/v3/index.html',               { kind: 'redirect', to: '/keaton/index.html', code: 301 }],
  ['/future/v3/help/',                    { kind: 'redirect', to: '/keaton/help/', code: 301 }],
  ['/future/v3/help/business/',           { kind: 'redirect', to: '/keaton/help/business/', code: 301 }],
  ['/future/v3/notes/bots/',              { kind: 'redirect', to: '/keaton/notes/bots/', code: 301 }],
  ['/future/v3/widget.json',              { kind: 'redirect', to: '/keaton/widget.json', code: 301 }],
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
// KATAPP-SPLIT1: what goes to the PAGES Worker — the three prefixes that stayed in phpjabbers,
// whole segments only, and nothing Katomia uses (its signing page, widget, feedback, API shims)
const handed = ['/keaton', '/keaton/', '/keaton/notes/bots/', '/deal', '/deal/convert/?id=1', '/deal/edit/spec/',
  '/deals', '/deals/', '/deals/kbar/', '/deals/index.json', '/assets/js/page-feedback.js',   // ROOT-MOVE1: added to phpjabbers after the split
  '/legacy/deals/', '/legacy/deals/?action=status', '/future/v3', '/future/v3/help/'];
const kept = ['/', '/m/katomia/', '/m/katomia/board/t-trio', '/board/t-trio', '/circles', '/dealsx', '/assets/js/page-feedback.jsx', '/assets/js/x.js', '/dealer', '/m/sign/', '/future/', '/future/?action=txRead',
  '/m/bid/explore/kpool', '/m/feedback/', '/hapi/kpool/txList', '/dealer', '/keatonx', '/legacyx', '/future/v30',
  '/vendor/walletconnect/config.json', '/m/katomia/deal'];
for (const p of handed) assert.equal(handThrough(new URL(O + p)), true, `handThrough(${p}) should be true`);
for (const p of kept) assert.equal(handThrough(new URL(O + p)), false, `handThrough(${p}) should be false`);
console.log(`router: ${handed.length + kept.length} hand-through cases OK`);
