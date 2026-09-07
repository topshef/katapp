// qa/board — BOARD-REGRESSION1 (2026-09-07): the board's two shapes, driven in a real browser.
//
// Born with CAROUSEL1. The operator's condition for adding a second board shape was that it
// must not break the first: "build any necessary regression tests and run those before
// applying any changes". This suite is that guard, kept: the Round Table's baseline facts and
// the Carousel's contract, over the BUILT bundle (build/dist) and the demo fixture (?demo=1 —
// a local reducer behind a fake socket, no backend, no network). Real pointer input; an
// offer is made by an actual drag, the board's own amount modal and its Offer button.
//
//   node qa/board/run.mjs            DIST=build/dist-gcp node qa/board/run.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIST = resolve(ROOT, process.env.DIST || 'build/dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
let failed = 0, total = 0
const ok = (c, m, x) => { total++; if (c) console.log('  PASS ' + m); else { failed++; console.log('  FAIL ' + m + (x !== undefined ? ' — ' + x : '')) } }

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'
  const file = join(DIST, p); if (!file.startsWith(DIST)) { res.writeHead(403); return res.end() }
  let body; try { body = readFileSync(file) } catch { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(body)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()

async function open(q) {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)))
  page.on('dialog', d => d.accept('1'))
  await page.goto(`${BASE}/m/katomia/board.html?demo=1${q ? '&' + q : ''}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => { document.getElementById('preloader')?.remove(); document.getElementById('cookieNotice')?.remove() })
  await page.waitForTimeout(1000)
  return { page, errs }
}
const baskets = page => page.evaluate(() => Object.values(state.accounts).reduce((n, a) => n + (a.basket || []).length, 0))

// ── Round Table baseline ──────────────────────────────────────────────────────────────────
console.log('1. Round Table is the default and renders whole')
{
  const { page, errs } = await open('')
  const r = await page.evaluate(() => {
    const zones = [...(_boardSimZones ? _boardSimZones.entries() : [])].filter(([, z]) => !z.isBasket).map(([, z]) => z.bandFull)
    return { skin: document.body.dataset.boardSkin, svg: !!document.querySelector('#boardRoot svg'), hub: !!document.querySelector('.ring-hub'),
      chips: document.querySelectorAll('.asset').length, owners: new Set([...document.querySelectorAll('.board-chip[data-owner-account]')].map(c => c.dataset.ownerAccount)).size,
      chipShape: document.body.dataset.chipShape, tallSplit: !!document.querySelector('.board-chip .asset-sym, .board-chip [class*="sym"]'),
      bands: zones, options: [...document.getElementById('boardSkinSelect').options].map(o => o.value) }
  })
  ok(!errs.length, 'no page errors', JSON.stringify(errs))
  ok(r.skin === 'ring16' && r.svg && r.hub, 'ring16 by default, with its SVG felt and hub', JSON.stringify(r))
  ok(r.chips === 15 && r.owners === 5, 'all 15 demo chips across 5 owners', `${r.chips}/${r.owners}`)
  ok(r.chipShape === 'tall', 'tall chips are the default (F06)')
  ok(new Set(r.bands).size === 1, 'COUNTER-UNIFORM1: one counter depth for every segment', JSON.stringify(r.bands))
  ok(r.options.includes('ring16') && r.options.includes('carousel'), 'the skin dropdown lists Round Table and Carousel', JSON.stringify(r.options))
  await page.close()
}

// ── Carousel ──────────────────────────────────────────────────────────────────────────────
console.log('2. Carousel: two stripes, baskets meeting in the middle, footer clear')
{
  const { page, errs } = await open('skin=carousel')
  const r = await page.evaluate(() => {
    const b = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }
    const q = s => [...document.querySelectorAll(s)]
    return { skin: document.body.dataset.boardSkin, root: !!document.querySelector('.carousel'), svg: !!document.querySelector('#boardRoot svg'),
      others: q('.carousel-row--others .carousel-card').length, mine: q('.carousel-row--mine .carousel-card').length, chips: q('.asset').length,
      top: b(document.querySelector('.carousel-row--others')), centre: b(document.querySelector('.carousel-centre')), bottom: b(document.querySelector('.carousel-row--mine')), footer: b(document.querySelector('.ring-footer')),
      otherBasketLow: (() => { const c = document.querySelector('.carousel-card--other'); return c && c.querySelector('.carousel-basket').getBoundingClientRect().top > c.querySelector('.carousel-store').getBoundingClientRect().top })(),
      mineBasketHigh: (() => { const c = document.querySelector('.carousel-card--mine'); return c && c.querySelector('.carousel-basket').getBoundingClientRect().top < c.querySelector('.carousel-store').getBoundingClientRect().top })(),
      selected: document.getElementById('boardSkinSelect').value, lockTally: document.querySelector('.carousel-centre-lp')?.textContent || '' }
  })
  ok(!errs.length, 'no page errors', JSON.stringify(errs))
  ok(r.skin === 'carousel' && r.root && !r.svg, 'carousel root, no ring SVG')
  ok(r.others === 3 && r.mine === 2 && r.chips === 15, 'three other players on top, my two below, every chip present', JSON.stringify([r.others, r.mine, r.chips]))
  ok(r.top[1] + r.top[3] <= r.centre[1] + 1 && r.centre[1] + r.centre[3] <= r.bottom[1] + 1, 'others / centre strip / mine, in that order')
  ok(r.bottom[1] + r.bottom[3] <= r.footer[1] + 1, 'my row ends above the footer', `${JSON.stringify(r.bottom)} vs ${JSON.stringify(r.footer)}`)
  ok(Math.abs(r.top[3] - r.bottom[3]) <= 8, 'the rows split the space evenly', `${r.top[3]} vs ${r.bottom[3]}`)
  ok(r.otherBasketLow && r.mineBasketHigh, 'baskets face the centre strip')
  ok(r.selected === 'carousel' && /🔒 \d\/\d/.test(r.lockTally), 'dropdown shows it selected; the strip carries the lock tally', r.lockTally)

  console.log('3. Carousel: an offer by real drag, through the shared drop target and the amount modal')
  const b0 = await baskets(page)
  await page.locator('.carousel-card--mine .carousel-store .asset').first().dragTo(page.locator('.carousel-card--other').first())
  const offer = page.locator('.board-amount-btn', { hasText: /^Offer$/ })
  await offer.waitFor({ timeout: 8000 })
  await page.locator('input[type=number], input[inputmode=decimal]').last().fill('1')
  await offer.click(); await page.waitForTimeout(1000)
  const b1 = await baskets(page)
  ok(b1 === b0 + 1, 'one more item in a basket in the game state', `${b0} → ${b1}`)

  console.log('4. Carousel: the signing countdown lives in the centre strip')
  await page.evaluate(() => { window.__real = boardDetectSigning; boardDetectSigning = () => ({ status: 'pending', expiry: Date.now() + 90000, tx: { txid: 'demo' }, legs: {} }); render() })
  await page.waitForTimeout(1300)
  const s = await page.evaluate(() => ({ pill: document.querySelector('.carousel-centre .ring-hub-count')?.textContent || '', counting: !!document.querySelector('.carousel-centre--counting') }))
  ok(/^\d:\d\d$/.test(s.pill) && s.counting, 'the hub\'s countdown pill ticks in the strip', JSON.stringify(s))
  await page.evaluate(() => { boardDetectSigning = window.__real; render() })
  await page.close()
}

console.log('5. Carousel: the conveyor drifts and stops')
{
  const { page, errs } = await open('skin=carousel&conveyor=1')
  const sl = () => page.evaluate(() => document.querySelector('.carousel-row--others .carousel-track').scrollLeft)
  const a = await sl(); await page.waitForTimeout(1200); const b = await sl()
  ok(b > a, 'the top row moves by itself', `${a} → ${b}`)
  await page.locator('.carousel-conveyor').click(); await page.waitForTimeout(400)
  const c = await sl(); await page.waitForTimeout(900); const d = await sl()
  ok(d === c, '⟳ stops it', `${c} → ${d}`)
  ok(!errs.length, 'no page errors', JSON.stringify(errs))
  await page.close()
}

await browser.close(); server.close()
console.log(`\n${total - failed}/${total} passed` + (failed ? ` — ${failed} FAILED` : ' — both board shapes hold'))
process.exit(failed ? 1 : 0)
