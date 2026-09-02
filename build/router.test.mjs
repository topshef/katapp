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
  ['/m/katomia/game/AbC123',              A('/m/katomia/game.html')],
  ['/m/katomia/game/AbC123/',             A('/m/katomia/game.html')],
  ['/m/katomia/board/AbC123',             A('/m/katomia/board.html')],
  ['/m/katomia/board',                    A('/m/katomia/board.html')],
  // sibling rewrite: a relative "kemoji.js" on /m/katomia/board/<id> resolves to
  // /m/katomia/board/kemoji.js (ONE segment deep — P3 router fix 8b60244)
  ['/m/katomia/board/kemoji.js',          A('/m/katomia/kemoji.js')],
  ['/m/katomia/game/katomia.css?v=1',     A('/m/katomia/katomia.css')],
  ['/m/katomia/game/assets/k.svg',        A('/m/katomia/assets/k.svg')],
  ['/m/katomia/hapi/create',              { kind: 'alias', path: '/hapi/create' }],
  ['/m/katomia/hapi/circle/update',       { kind: 'alias', path: '/hapi/circle/update' }],
  ['/m/katomia/hapi/game/AbC123?x=1',     { kind: 'alias', path: '/hapi/game/AbC123' }],
  ['/hapi/nodes',                         { kind: 'alias', path: '/hapi/nodes' }],
  ['/m/katomia/hapi/../etc',              null],                         // dots unexpressible
  ['/m/katomia/hapi/a.b',                 null],
  ['/feedback-widget.js',                 { kind: 'alias', path: '/feedback-widget.js' }],
  ['/kfeedback/vote',                     { kind: 'alias', path: '/kfeedback/vote' }],
  ['/vendor/walletconnect/config.json',   { kind: 'wc' }],
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
