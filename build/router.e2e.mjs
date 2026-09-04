// Worker-level test of build/dist + router.js without the Cloudflare runtime:
//   node build/router.e2e.mjs            → asserts the deployed contract, exits non-zero on failure
//   node build/router.e2e.mjs --serve    → serves the bundle on http://127.0.0.1:8787 through
//                                          the same router (for Playwright / eyeballing)
// env.ASSETS is emulated over build/dist; the alias hop is captured (never sent) so the test
// proves WHAT the Worker would forward, not whether the backend is up.
import worker from './router.js';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

const DIST = new URL('./dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const ASSETS = { async fetch(req) {
  const p = decodeURIComponent(new URL(req.url).pathname);
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST)) return new Response('forbidden', { status: 403 });
  try {
    if (!(await stat(f)).isFile()) throw 0;
    return new Response(await readFile(f), { headers: { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' } });
  } catch { return new Response('not found', { status: 404 }); }
} };

const forwarded = [];
const env = { ASSETS, ALIAS_ORIGIN: 'https://kpay-api-alias.tayloa17.workers.dev',
  HAPI: { async fetch(req) { forwarded.push({ url: req.url, method: req.method, body: await req.text(), xfh: req.headers.get('x-forwarded-host') });
           return new Response('{"stub":true}', { headers: { 'content-type': 'application/json' } }); } } };

const call = (p, init, origin = 'https://katui.example') => worker.fetch(new Request(origin + p, init), env);

if (process.argv.includes('--serve')) {
  createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await call(req.url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }, 'http://' + (req.headers.host || '127.0.0.1:8787'));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  }).listen(8787, '127.0.0.1', () => console.log('katui bundle on http://127.0.0.1:8787 (alias calls stubbed)'));
} else {
  let r;
  r = await call('/'); assert.equal(r.status, 302); assert.equal(new URL(r.headers.get('location')).pathname, '/m/katomia/');
  r = await call('/qa'); assert.equal(r.status, 302); assert.equal(new URL(r.headers.get('location')).pathname, '/m/katomia/qa/');
  r = await call('/m/katomia/qa/data/tests.json'); assert.equal(r.status, 200);
  for (const [p, needle] of [
    ['/m/katomia/',               'Katomia'],
    ['/m/katomia/create',         'Create your own circle'],
    ['/m/katomia/create?skin=basic', 'class="form skin-basic"'],
    ['/m/katomia/circles',        'Katomia'],
    ['/m/katomia/host',           'Katomia'],
    ['/m/katomia/learn',          'Katomia'],
    ['/m/katomia/markets',        'Katomia'],
    ['/m/katomia/game/AbC123',    'HAPI_BASE: "kpay-api-alias.tayloa17.workers.dev/hapi"'],
    ['/m/katomia/board/AbC123',   'HAPI_BASE: "kpay-api-alias.tayloa17.workers.dev/hapi"'],
    ['/m/katomia/qa/',            'data/tests.json'],
    ['/m/katomia/qa/tests.html',  '<html'],
    ['/m/katomia/board/kemoji.js', ''],
    ['/m/katomia/katomia-core.js', 'getGameId'],
    ['/m/katomia/footer.html',    ''],
    ['/vendor/kpay/kpool_widget/config.js', 'HAPI_BASE: "kpay-api-alias.tayloa17.workers.dev/hapi"'],
    // SIGNPAGE-STATIC1: the external signing page + the site chrome it pulls in
    ['/m/sign/?network=testnet&txid=0.0.1@2.3&pch=abc', '<base href="/">'],
    ['/future/',                  'kpool_widget/bootstrap.js'],
    ['/m/katomia/binding.php?network=testnet&accountId=0.0.1879', 'hapi.php?action=bindings'],
    ['/assets/css/style.css.php?1', ''],
    ['/future/future.css',        ''],
    ['/vendor/bootstrap/css/bootstrap.min.css', ''],
    ['/vendor/jquery/jquery.min.js', ''],
  ]) {
    r = await call(p); const body = await r.text();
    assert.equal(r.status, 200, `${p} → ${r.status}`);
    assert.ok(body.includes(needle), `${p}: expected to contain ${JSON.stringify(needle)}`);
    assert.ok(!/<\?php|<\?=/.test(body), `${p}: unrendered PHP`);
  }
  // every page shell references the alias, never a backend host and never lab22
  for (const p of ['/m/katomia/', '/m/katomia/create', '/m/katomia/board/x', '/m/katomia/game/x', '/m/katomia/circles', '/m/katomia/host', '/m/sign/']) {
    const body = await (await call(p)).text();
    assert.ok(!/hapi2\.hbar\.live|lab22\.kpay\.uk|127\.0\.0\.1/.test(body), `${p}: leaks a backend/lab/render host`);
  }
  // domain-aware walletconnect config
  const wc = await (await call('/vendor/walletconnect/config.json')).json();
  assert.equal(wc.metadata.url, 'https://katui.example');
  // same-origin API: the create form POSTs ./hapi/create → alias /hapi/katomia/create (= backend
  // /katomia/create), body intact, over the HAPI service binding
  r = await call('/m/katomia/hapi/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"qa"}' });
  assert.equal(r.status, 200);
  assert.deepEqual(forwarded.at(-1), { url: 'https://kpay-api-alias.tayloa17.workers.dev/hapi/katomia/create', method: 'POST', body: '{"name":"qa"}', xfh: 'katui.example' });
  await call('/m/katomia/hapi/entities?network=testnet');
  assert.equal(forwarded.at(-1).url, 'https://kpay-api-alias.tayloa17.workers.dev/hapi/katomia/entities?network=testnet');
  await call('/m/katomia/hapi.php?action=games');
  assert.equal(forwarded.at(-1).url, 'https://kpay-api-alias.tayloa17.workers.dev/hapi/katomia/games');
  await call('/m/sign/?action=txList&network=testnet&since=600&until=600');
  assert.equal(forwarded.at(-1).url, 'https://kpay-api-alias.tayloa17.workers.dev/hapi/kpool/txList?network=testnet&since=600&until=600');
  r = await call('/m/sign/?action=txSave', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"network":"testnet"}' });
  assert.equal(forwarded.at(-1).url, 'https://kpay-api-alias.tayloa17.workers.dev/hapi/kpool/txSave');
  assert.equal(forwarded.at(-1).body, '{"network":"testnet"}');
  await call('/future/?action=txRead&txid=0.0.1@2');
  assert.equal(forwarded.at(-1).url, 'https://kpay-api-alias.tayloa17.workers.dev/hapi/kpool/txRead?txid=0.0.1%402');
  // the widget's hardcoded txRead path must reach the same backend route, or a signed tx
  // never gets its status read back and the board stays orange
  await call('/m/bid/explore/kpool?action=txRead&network=testnet&txid=0.0.1-2-3&detail=1');
  assert.equal(forwarded.at(-1).url, 'https://kpay-api-alias.tayloa17.workers.dev/hapi/kpool/txRead?network=testnet&txid=0.0.1-2-3&detail=1');
  r = await call('/m/katomia/hapi.php?action=..'); assert.equal(r.status, 400);
  r = await call('/diag', { method: 'POST', body: '{"k":"board:result:shown"}' }); assert.equal(r.status, 200);
  assert.equal(forwarded.at(-1).url, 'https://kpay-api-alias.tayloa17.workers.dev/hapi/diag');
  assert.equal(forwarded.at(-1).body, '{"k":"board:result:shown"}');
  r = await call('/m/katomia/build-info.json'); assert.equal(r.status, 200); assert.ok((await r.json()).source_sha);
  await call('/feedback-widget.js');
  assert.equal(forwarded.at(-1).url, 'https://kpay-api-alias.tayloa17.workers.dev/feedback-widget.js');
  r = await call('/m/katomia/hapi/../x'); assert.equal(r.status, 404);
  r = await call('/m/katomia/nope'); assert.equal(r.status, 404);
  console.log('router e2e: bundle + Worker contract OK');
}
