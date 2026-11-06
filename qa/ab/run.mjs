// qa/ab — AB-LABS1 (owner 2026-11-06): labs (phpjabbers, the benchmark) against lab1 (katapp), live.
//
// "Do a QA assessment … to make sure that we've crossed off any kind of comparison tests between
// what we had in PHP Jabbers versus what's going forward with Cat App." Every address labs
// answers is asked of both hosts — lab1 at its root form — over plain HTTP and in a real phone-
// sized browser, and the two are compared: status, title, how much is on the page, the cards and
// seats it draws, the live socket on a circle, same-site requests that fail, page errors. Then
// the old /m/katomia addresses are asked of lab1, to prove each lands on its root form.
//
// It compares SHAPE, not bytes: the two hosts are the same backend at two moments, and lab1
// differs on purpose in a few places (listed in EXPECTED below), so "same" means the same pages,
// the same data, nothing broken that works on labs.
//
//   node qa/ab/run.mjs                       labs.katomia.com vs lab1.katomia.com
//   A=https://labs.katomia.com B=https://lab1.katomia.com OUT=qa/ab/reports/x.md node qa/ab/run.mjs
// Exit code 1 if any check fails. Needs network (both hosts and the API behind them).
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const A = (process.env.A || 'https://labs.katomia.com').replace(/\/$/, '')   // the benchmark
const B = (process.env.B || 'https://lab1.katomia.com').replace(/\/$/, '')   // katapp
const K = '/m/katomia'
const OUT = process.env.OUT || ''

// What lab1 does differently ON PURPOSE — reported, never counted as a failure.
const EXPECTED = [
  'Katomia lives at the root on lab1 (ROOT-MOVE1); old /m/katomia page addresses redirect there (302 while on trial).',
  'Account numbers are set into the felt on phones (FELT-NUMBER1) — a board page carries more digits on lab1.',
  'The felt shows the xproof domain only; the holder\'s own label is in the player card (XPROOF-FELTDOMAIN1).',
  'The KEA signer loads its crypto from the site itself, not esm.sh / jsDelivr (KEA-VENDOR1).',
  'The intent key is non-extractable in IndexedDB (INTENTKEY-SAFE1) — not visible from outside the page.',
  'window.katomiaView exists on lab1 boards (VIEW-API1).',
]

// labs path → lab1 path. `kind` picks what is compared in the browser.
const PAGES = [
  ['Home',                  `${K}/`,                    '/',                      'cards'],
  ['Home · clay skin',      `${K}/?skin=clay`,          '/?skin=clay',            'page'],
  ['Circles',               `${K}/circles`,             '/circles',               'cards'],
  ['Markets',               `${K}/markets`,             '/markets',               'page'],
  ['Learn',                 `${K}/learn`,               '/learn',                 'page'],
  ['Advisor',               `${K}/advisor`,             '/advisor',               'page'],
  ['Host',                  `${K}/host`,                '/host',                  'page'],
  ['Create',                `${K}/create`,              '/create',                'page'],
  ['Create · basic',        `${K}/create?skin=basic`,   '/create?skin=basic',     'page'],
  ['Circle t-trio',         `${K}/board/t-trio`,        '/board/t-trio',          'board'],
  ['Circle t-prop',         `${K}/board/t-prop`,        '/board/t-prop',          'board'],
  ['Circle t-trio carousel',`${K}/board/t-trio?skin=carousel`, '/board/t-trio?skin=carousel', 'board'],
  ['Order book t-order',    `${K}/game/t-order`,        '/game/t-order',          'game'],
  ['KEA signer',            `${K}/KEA/`,                '/KEA/',                  'page'],
  ['QA dashboard',          `${K}/qa/`,                 '/qa/',                   'page'],
  ['Binding',               `${K}/binding.php?network=testnet&accountId=0.0.1879`, '/binding.php?network=testnet&accountId=0.0.1879', 'page'],
  ['Signing page',          '/m/sign/?network=testnet', '/m/sign/?network=testnet', 'page'],
  ['Feedback page',         '/m/feedback/?product=katomia', '/m/feedback/?product=katomia', 'page'],
  ['Keaton',                '/keaton/',                 '/keaton/',               'page'],
  ['Keaton · shop help',    '/keaton/help/shop/',       '/keaton/help/shop/',     'page'],
  ['Deal lookup',           '/deal/',                   '/deal/',                 'page'],
  ['Deal editor',           '/deal/edit/',              '/deal/edit/',            'page'],
  ['Deals (shop)',          '/deals/',                  '/deals/',                'page'],
  ['Deal · KBAR',           '/deals/kbar/',             '/deals/kbar/',           'page'],
  ['V1 archive',            '/legacy/deals/',           '/legacy/deals/',         'page'],
]

// same-origin API: labs path → lab1 path; compared as parsed JSON shape
const API = [
  ['Circle list',           `${K}/hapi/games`,          '/hapi/katomia/games'],
  ['Circle list (old path)',`${K}/hapi/games`,          `${K}/hapi/games`],
  ['One circle',            `${K}/hapi/game/t-trio`,    '/hapi/katomia/game/t-trio'],
  ['Pool list (sign page)', '/m/sign/?action=txList&network=testnet&since=60&until=60', '/m/sign/?action=txList&network=testnet&since=60&until=60'],
  ['Pool list (widget)',    '/m/bid/explore/kpool?action=txList&network=testnet', '/m/bid/explore/kpool?action=txList&network=testnet'],
  ['WalletConnect config',  '/vendor/walletconnect/config.json', '/vendor/walletconnect/config.json'],
]

// noise that is neither host's fault: Cloudflare's analytics beacon, external fonts and CDNs
const NOISE = /cloudflareinsights|beacon\.min\.js|fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|walletconnect\.(com|org)|web3modal|explorer-api/
const results = []
const rec = (area, name, pass, a, b, note = '') => { results.push({ area, name, pass, a, b, note }); console.log(`${pass ? '  ok ' : 'FAIL'}  ${area} · ${name}${note ? ' — ' + note : ''}`) }
const strip = p => p.replace(/^\/m\/katomia(?=\/|$)/, '') || '/'

// ── 1. API: same backend, same answers ────────────────────────────────────────────────────────
console.log(`AB-LABS1: ${A}  vs  ${B}\n\n1. API`)
const shape = v => Array.isArray(v) ? `array(${v.length})` : v && typeof v === 'object' ? Object.keys(v).sort().join(',') : typeof v
for (const [name, pa, pb] of API) {
  const [ra, rb] = await Promise.all([fetch(A + pa), fetch(B + pb)])
  const [ta, tb] = await Promise.all([ra.text(), rb.text()])
  let ja, jb; try { ja = JSON.parse(ta) } catch {} try { jb = JSON.parse(tb) } catch {}
  let pass = ra.status === rb.status && (ja === undefined) === (jb === undefined) && shape(ja) === shape(jb)
  let note = `${ra.status}/${rb.status} · ${shape(ja)}`
  if (name.startsWith('Circle list')) {
    const ga = Object.keys(ja?.games || {}).sort(), gb = Object.keys(jb?.games || {}).sort()
    pass = pass && ga.join() === gb.join(); note += ` · ${ga.length}/${gb.length} circles`
  }
  if (name === 'WalletConnect config') {
    pass = pass && ja?.metadata?.url === A && jb?.metadata?.url === B; note += ' · each names its own origin'
  }
  rec('api', name, pass, ra.status, rb.status, note)
}

// ── 2. pages in a phone-sized browser ─────────────────────────────────────────────────────────
console.log('\n2. Pages (390×800, touch)')
const browser = await chromium.launch()
async function look(origin, path, kind) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const errs = [], bad = [], offsite = [], ws = { url: '', state: false }
  page.on('pageerror', e => errs.push(e.message.slice(0, 140)))
  page.on('response', r => { const u = new URL(r.url()); if (u.origin === origin && r.status() >= 400 && !NOISE.test(r.url())) bad.push(`${r.status()} ${strip(u.pathname)}`) })
  page.on('requestfailed', r => {
    const u = new URL(r.url()); const f = r.failure()?.errorText || ''
    if (/ERR_ABORTED/.test(f) || NOISE.test(r.url())) return
    if (u.origin === origin) bad.push(`failed ${strip(u.pathname)} ${f}`)
    else offsite.push(u.hostname)   // a third-party host this page needed and could not reach
  })
  page.on('websocket', w => { ws.url = w.url(); w.on('framereceived', f => { if (/game_state/.test(String(f.payload).slice(0, 300))) ws.state = true }) })
  let status = 0
  try { const r = await page.goto(origin + path, { waitUntil: 'load', timeout: 45000 }); status = r?.status() || 0 } catch (e) { errs.push('load: ' + e.message.slice(0, 100)) }
  await page.waitForTimeout(kind === 'board' || kind === 'game' ? 7000 : kind === 'cards' ? 4000 : 2500)
  const info = await page.evaluate(() => ({
    path: location.pathname, title: document.title, text: document.body?.innerText.length || 0,
    cards: document.querySelectorAll('.circle-card, .landing-card').length,
    // from the page's own game state: the seats it knows, whatever the skin draws
    seats: typeof state !== 'undefined' && state?.accounts ? Object.keys(state.accounts).length : -1,
    chips: document.querySelectorAll('.board-chip').length,
    felt: document.querySelectorAll('.ring-feltnum').length,
    links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/m/katomia')).length,
  })).catch(e => ({ err: e.message }))
  await ctx.close()
  return { status, ...info, errs, bad: [...new Set(bad)], offsite: [...new Set(offsite)], ws }
}
for (const [name, pa, pb, kind] of PAGES) {
  // both at the same moment: a live circle trades in rounds, so two loads seconds apart can
  // legitimately differ (bots seat, settle and restock)
  const [a, b] = await Promise.all([look(A, pa, kind), look(B, pb, kind)])
  const newErrs = b.errs.filter(e => !a.errs.includes(e))
  const newBad = b.bad.filter(x => !a.bad.includes(x))
  const checks = []
  checks.push([a.status === b.status && b.status < 400, `status ${a.status}/${b.status}`])
  checks.push([a.title === b.title, a.title === b.title ? 'same title' : `title "${a.title}" vs "${b.title}"`])
  checks.push([!newErrs.length, newErrs.length ? 'new page errors: ' + newErrs.join(' | ') : 'no new page errors'])
  checks.push([!newBad.length, newBad.length ? 'new failed requests: ' + newBad.join(' | ') : 'no new failed requests'])
  if (kind === 'cards') checks.push([a.cards === b.cards && b.cards > 0, `cards ${a.cards}/${b.cards}`])
  if (kind === 'board') {
    checks.push([a.seats === b.seats && b.seats >= 0, `seats ${a.seats}/${b.seats}`])
    checks.push([a.ws.state === b.ws.state && b.ws.state, `live socket ${a.ws.state ? 'yes' : 'no'}/${b.ws.state ? 'yes' : 'no'}`])
    checks.push([Math.abs(a.chips - b.chips) <= 2, `chips ${a.chips}/${b.chips}`])
  }
  if (kind === 'game') checks.push([a.ws.state === b.ws.state, `live socket ${a.ws.state ? 'yes' : 'no'}/${b.ws.state ? 'yes' : 'no'}`])
  if (kind !== 'board' && kind !== 'cards') {
    // text: the same page within 10% (Home's skins carry live rows; lab1's felt digits are
    // board-only); cards pages are compared by their cards instead
    // (one-sided when A could not reach a third-party host B no longer needs — e.g. KEA's crypto
    //  from esm.sh, which lab1 now serves itself: A then draws less, through no fault of B)
    const d = Math.abs(a.text - b.text) / Math.max(1, a.text)
    const aStarved = a.offsite.some(h => !b.offsite.includes(h)) && b.text >= a.text
    checks.push([d <= 0.10 || aStarved, `text ${a.text}/${b.text}` + (aStarved ? ` (A could not reach ${a.offsite.join(', ')})` : '')])
  }
  if (pb === '/' || pb.startsWith('/board') || pb.startsWith('/circles')) checks.push([b.links === 0, b.links ? `${b.links} links still under /m/katomia` : 'no links under /m/katomia'])
  const pass = checks.every(c => c[0])
  rec('page', name, pass, a, b, checks.filter(c => !c[0]).map(c => c[1]).join('; ') || checks.map(c => c[1]).slice(0, 4).join(' · ') + (kind === 'board' ? ` · felt blocks ${b.felt}` : ''))
}

// ── 3. the old addresses on lab1 ──────────────────────────────────────────────────────────────
console.log('\n3. Old /m/katomia addresses on lab1')
for (const [name, pa] of PAGES.filter(p => p[1].startsWith(K)).map(p => [p[0], p[1]])) {
  const r = await fetch(B + pa, { redirect: 'manual' })
  const loc = r.headers.get('location') ? new URL(r.headers.get('location'), B) : null
  const want = strip(pa.split('?')[0]) + (pa.includes('?') ? '?' + pa.split('?')[1] : '')
  const landed = loc ? await fetch(loc).then(x => x.status) : 0
  const pass = [301, 302].includes(r.status) && loc && loc.pathname + loc.search === want && landed === 200
  rec('redirect', name, pass, r.status, landed, `${pa} → ${loc ? loc.pathname + loc.search : '(none)'} → ${landed}`)
}
await browser.close()

// ── report ────────────────────────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.pass)
const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
const md = [
  `# labs vs lab1 — ${when}`, '',
  `**${results.length - failed.length}/${results.length} checks pass.** A = ${A} (phpjabbers, the benchmark) · B = ${B} (katapp). Generated by \`qa/ab/run.mjs\` (AB-LABS1).`, '',
  '## Different on purpose', '', ...EXPECTED.map(e => `- ${e}`), '',
  '## Checks', '', '| | area | what | detail |', '| --- | --- | --- | --- |',
  ...results.map(r => `| ${r.pass ? 'ok' : '**FAIL**'} | ${r.area} | ${r.name} | ${String(r.note).replace(/\|/g, '/')} |`), '',
]
if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, md.join('\n')) ; console.log(`\nreport → ${OUT}`) }
console.log(`\n${results.length - failed.length}/${results.length} checks pass` + (failed.length ? ` — ${failed.length} FAILED` : ''))
process.exit(failed.length ? 1 : 0)
