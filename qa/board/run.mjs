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
  // HOSTMENU-STATIC2: the Worker's clean-URL rewrites (build/router.js IDPAGE + SIBLING), so a
  // scenario can load /m/katomia/board/<id> exactly as labs serves it — no ?game= to lean on
  p = p.replace(/^\/m\/katomia\/(game|board)\/[^/.]+\/?$/, '/m/katomia/$1.html').replace(/^\/m\/katomia\/(?:game|board)\/([^/]+\.[^/]+)$/, '/m/katomia/$1')
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

  console.log('4. Carousel: the rows stay where you left them across a render')
  await page.evaluate(() => { document.querySelector('.carousel-row--others .carousel-track').scrollLeft = 200 })
  await page.waitForTimeout(300); await page.evaluate(() => render()); await page.waitForTimeout(300)
  const kept = await page.evaluate(() => document.querySelector('.carousel-row--others .carousel-track').scrollLeft)
  ok(kept > 150, 'the top row kept its scroll position (CAROUSEL2 sticky rows)', kept)

  console.log('5. Carousel: the REAL strike — every side locks, the demo raises a tx, the board signs')
  // the demo reducer strikes on the last lock exactly as the backend does: baskets are
  // emptied server-side and a pending tx appears — the board must keep the picture
  const active = await page.evaluate(() => { const s = new Set(); Object.values(state.accounts).forEach(x => { if (x.basket.length) s.add(x.id); x.basket.forEach(i => i.fromId && s.add(i.fromId)) }); return [...s] })
  for (const id of active) { await page.evaluate(id => socket.send(JSON.stringify({ type: 'game_toggleLock', accountId: id })), id); await page.waitForTimeout(150) }
  await page.waitForTimeout(700)
  const s = await page.evaluate(() => ({
    pending: (state.tx?.pending || []).length, signing: !!boardSigning,
    pill: document.querySelector('.carousel-centre .ring-hub-count')?.textContent || '',
    counting: !!document.querySelector('.carousel-centre--counting'),
    txchipsInBaskets: document.querySelectorAll('.carousel-basket .board-txchip').length,
    signBtn: document.querySelector('[data-testid=sign]')?.textContent || '',
    banner: document.getElementById('boardBanner')?.textContent || '',
    bodySigning: document.body.dataset.signing === '1',
    rims: document.querySelectorAll('.carousel-rim[class*="carousel-rim--"]').length
  }))
  ok(s.pending === 1 && s.signing, 'the carousel detects the signing phase (boardDetectSigning admits it)', JSON.stringify(s))
  ok(/^\d:\d\d$/.test(s.pill) && s.counting, 'the hub\'s countdown pill ticks on the centre line', s.pill)
  ok(s.txchipsInBaskets > 0, 'the struck legs stay painted in the baskets — the table is not cleared', s.txchipsInBaskets)
  ok(/Sign/.test(s.signBtn), 'the footer offers ✍ Sign', s.signBtn)
  ok(/submit|signatures/i.test(s.banner), 'the banner narrates the signing phase', s.banner)
  ok(s.bodySigning && s.rims > 0, 'read-only cues: body marked signing, rims carry signature status', `${s.bodySigning}/${s.rims}`)
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

console.log('8. SIDECIRCLE-SOFTSWAP1: the last lock on a breakout circle follows the deal in place — no page load')
{
  const page = await browser.newPage({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)))
  page.on('dialog', d => d.accept('1'))
  // the clean /board/<id> route, as labs serves it, so the switch has a real address to rewrite
  await page.goto(`${BASE}/m/katomia/board/DEMO?demo=1&skin=ring16&breakout=1`, { waitUntil: 'networkidle' })
  await page.evaluate(() => { document.getElementById('preloader')?.remove(); document.getElementById('cookieNotice')?.remove(); window.__pageLived = 1 })
  await page.waitForTimeout(1000)
  const before = await page.evaluate(() => ({ id: window.katomiaGameId(), n: boardFilteredAccounts().length, name: window.name }))
  ok(before.id === 'DEMO' && before.n === 5 && before.name === 'DEMO', 'starts on the parent with all five accounts', JSON.stringify(before))
  // per-frame trace of the membership tween — the leavers must shrink out, not vanish
  await page.evaluate(() => { window.__trace = []; const t0 = performance.now(); const tick = () => { window.__trace.push({ t: (performance.now() - t0) | 0, n: boardFilteredAccounts().length, anim: !!_boardPartyAnim, id: window.katomiaGameId(), signing: !!boardSigning }); if (performance.now() - t0 < 3000) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  // Bud (0.0.3003) is locked in the fixture; Ada then You complete the cluster's locks
  for (const id of ['p2:0.0.2002', 'p1:0.0.1001']) { await page.evaluate(id => socket.send(JSON.stringify({ type: 'game_toggleLock', accountId: id })), id); await page.waitForTimeout(200) }
  await page.waitForTimeout(2500)
  const r = await page.evaluate(() => ({
    id: window.katomiaGameId(), path: location.pathname, search: location.search, name: window.name, title: document.title,
    parent: state.parent, accounts: Object.keys(state.accounts).sort(), signing: !!boardSigning, lived: window.__pageLived,
    moveOut: _boardMoveOutParty, movedTo: window.__kMovedTo, switching: window.__kSwitchingTo,
    signBtn: document.querySelector('[data-testid=sign]')?.textContent || '', banner: document.getElementById('boardBanner')?.textContent || '',
    tweened: window.__trace.some(s => s.anim && s.id === 'DEMO'), framesWhileTweening: window.__trace.filter(s => s.anim).length,
    neverFewerThanParty: window.__trace.every(s => s.n >= 3)
  }))
  ok(!errs.length, 'no page errors', JSON.stringify(errs))
  ok(r.lived === 1 && r.id === 'DEMO~1', 'the tab is now in the side circle without a page load', JSON.stringify({ lived: r.lived, id: r.id }))
  ok(r.path.endsWith('/board/DEMO~1') && r.search.includes('demo=1') && r.name === 'DEMO~1' && /^DEMO~1 /.test(r.title), 'address bar, tab name and title follow the circle (query kept)', `${r.path}${r.search} / ${r.name} / ${r.title}`)
  ok(r.parent === 'DEMO' && r.accounts.join() === 'p1:0.0.1001,p2:0.0.2002,p3:0.0.3003', 'the side circle holds exactly the deal\'s three accounts', JSON.stringify(r.accounts))
  ok(r.tweened && r.framesWhileTweening > 5 && r.neverFewerThanParty, 'the two non-party segments tweened out on the parent before the switch', JSON.stringify({ tweened: r.tweened, frames: r.framesWhileTweening }))
  ok(r.signing && /Sign/.test(r.signBtn) && /submit|signatures/i.test(r.banner), 'the side circle arrives in the signing phase', `${r.signBtn} / ${r.banner}`)
  ok(r.moveOut === null && r.movedTo === null && r.switching === null, 'the move-out filter and the switch guards are released on arrival', JSON.stringify({ moveOut: r.moveOut, movedTo: r.movedTo, switching: r.switching }))
  await page.close()
}

console.log('9. ASSETMEM1: an automatic re-add brings back what the account last had on the table, not everything')
{
  const page = await browser.newPage({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)))
  await page.goto(`${BASE}/m/katomia/board/DEMO?demo=1&skin=ring16`, { waitUntil: 'networkidle' })
  await page.evaluate(() => { document.getElementById('preloader')?.remove(); document.getElementById('cookieNotice')?.remove() })
  await page.waitForTimeout(800)
  const r = await page.evaluate(() => {
    const out = {}
    // the sandbox has no circle id; the in-place switch gives it one (the fake socket swallows the join)
    switchGame('DEMO')
    rememberAssetsOnTable()
    out.full = rememberedAddLabel('0.0.1001')          // store + its two standing offers, deduped
    out.second = rememberedAddLabel('0.0.1111')
    out.unknown = rememberedAddLabel('0.0.9999')       // never seen here → bare (everything, as before)
    out.filtered = rememberedAddLabel('0.0.1001(0.0.555)')   // a caller's own filter is kept
    delete state.accounts['p1:0.0.1001'].assets['0.0.555']   // hidden / taken off the table
    rememberAssetsOnTable()
    out.afterHide = rememberedAddLabel('0.0.1001')
    delete state.accounts['p1:0.0.1001']                     // the idle sweep bounced it
    rememberAssetsOnTable()
    out.afterKick = rememberedAddLabel('0.0.1001')
    state.accounts['p1:0.0.1111'].assets = {}                // on the table with nothing showing
    rememberAssetsOnTable()
    out.empty = rememberedAddLabel('0.0.1111')
    forgetAssetsOnTable('0.0.1001')                          // 🗑 Remove account — a fresh add next time
    out.afterForget = rememberedAddLabel('0.0.1001')
    out.key = Object.keys(localStorage).find(k => k.startsWith('katomiaAssetsOnTable:DEMO:')) || null
    return out
  })
  ok(!errs.length, 'no page errors', JSON.stringify(errs))
  ok(r.full === '0.0.1001(HBAR,0.0.456,0.0.555,0.0.789-12)', 'store plus standing offers, NFT serial in wire form, no duplicates', r.full)
  ok(r.second === '0.0.1111(HBAR)' && r.unknown === '0.0.9999' && r.filtered === '0.0.1001(0.0.555)', 'a second account, an unseen label (bare) and a caller-filtered label', `${r.second} / ${r.unknown} / ${r.filtered}`)
  ok(r.afterHide === '0.0.1001(HBAR,0.0.456,0.0.789-12)', 'a hidden asset stays hidden on re-add', r.afterHide)
  ok(r.afterKick === '0.0.1001(HBAR,0.0.456,0.0.789-12)', 'the memory survives the account being bounced from the game', r.afterKick)
  ok(r.empty === '0.0.1111(!none)', 'an account that showed nothing comes back showing nothing', r.empty)
  ok(r.afterForget === '0.0.1001' && !!r.key, 'a deliberate Remove account forgets it; memory is scoped per circle and player', `${r.afterForget} / ${r.key}`)
  await page.close()
}

console.log('10. COUNTER-NFT1 + BOARD-SAFEAREA2: the counter is one thumbnail deep whatever is on the board; the header reserve hugs its content; walls stay in bounds')
{
  const page = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)))
  await page.goto(`${BASE}/m/katomia/board.html?demo=1&skin=ring16`, { waitUntil: 'networkidle' })
  await page.evaluate(() => { document.getElementById('preloader')?.remove(); document.getElementById('cookieNotice')?.remove(); boardZoneWalls = true; render() })
  await page.waitForTimeout(1200)
  const probe = () => page.evaluate(() => {
    const root = document.getElementById('boardRoot')
    const thumb = boardThumbHeight(root.clientWidth, root.clientHeight)
    const stores = [...(_boardSimZones ? _boardSimZones.entries() : [])].filter(([, z]) => !z.isBasket).map(([, z]) => z.bandFull)
    const banner = document.querySelector('body.board-page .app-banner')
    let contentBottom = 0; for (const el of banner.querySelectorAll('*')) { if (el.getClientRects().length) contentBottom = Math.max(contentBottom, el.getBoundingClientRect().bottom) }
    const walls = [...document.querySelectorAll('.board-zonewalls path')]
    return { thumb, stores, uniform: new Set(stores).size === 1, safeTop: _boardSimEnv.safeTop, bannerBox: banner.getBoundingClientRect().bottom, contentBottom,
      hasThumbOnBoard: !!document.querySelector('.board-chip .asset-thumb'), walls: walls.length, clipped: walls.every(p => /board-zonewalls-clip/.test(p.getAttribute('clip-path') || '')) }
  })
  const a = await probe()
  ok(!errs.length, 'no page errors', JSON.stringify(errs))
  ok(a.hasThumbOnBoard && a.uniform && a.stores[0] === a.thumb + 8, 'with NFTs on the board: every store reserves exactly one thumbnail + 8px', JSON.stringify({ thumb: a.thumb, stores: a.stores }))
  await page.evaluate(() => { for (const x of Object.values(state.accounts)) { for (const k of Object.keys(x.assets)) if (k.includes('#')) delete x.assets[k]; x.basket = x.basket.filter(i => !String(i.assetId).includes('#')) } render() })
  await page.waitForTimeout(1200)
  const b = await probe()
  ok(!b.hasThumbOnBoard && b.uniform && b.stores[0] === a.stores[0], 'with no NFT anywhere: the same reservation — the gauge is the CSS, not whatever chip is present', JSON.stringify({ stores: b.stores, before: a.stores[0] }))
  ok(a.safeTop === Math.round(a.contentBottom) + 4 && a.safeTop < a.bannerBox, 'the header reserve ends 4px under the banner\'s content, inside the banner box', JSON.stringify({ safeTop: a.safeTop, contentBottom: a.contentBottom, bannerBox: a.bannerBox }))
  ok(a.walls > 0 && a.clipped, 'every zone wall is clipped to the safe rect', `${a.walls} paths`)
  await page.close()
}

console.log('6. Player card on desktop: tapping an account header filters to it (ACCTFILTER1), and Host options is in the page (HOSTMENU-STATIC1)')
{
  // desktop + fine pointer is exactly where the 2026-09-05 "drag the card aside" took pointer
  // capture on press and swallowed the header's click
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)))
  await page.goto(`${BASE}/m/katomia/board.html?demo=1`, { waitUntil: 'networkidle' })
  await page.evaluate(() => { document.getElementById('preloader')?.remove(); document.getElementById('cookieNotice')?.remove() })
  await page.waitForTimeout(800)
  await page.evaluate(() => boardPlayerModal('p1'))
  await page.waitForTimeout(300)
  const before = await page.evaluate(() => ({ heads: document.querySelectorAll('#boardPlayerModal .board-playercard-acctid').length, tappable: document.querySelectorAll('#boardPlayerModal .board-playercard-acctid--tappable').length }))
  ok(before.heads === 2 && before.tappable === 2, 'the card shows both of p1\'s accounts, both tappable', JSON.stringify(before))
  await page.locator('#boardPlayerModal .board-playercard-acctid--tappable').first().click()
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => ({ heads: document.querySelectorAll('#boardPlayerModal .board-playercard-acctid').length, showAll: !!document.querySelector('#boardPlayerModal .board-playercard-showall'), sub: document.querySelector('#boardPlayerModal .board-playercard-sub')?.textContent || '' }))
  ok(after.heads === 1 && after.showAll, 'a real click on the header filters the card to that account and offers Show all', JSON.stringify(after))
  await page.locator('#boardPlayerModal .board-playercard-showall').click()
  await page.waitForTimeout(300)
  const back = await page.evaluate(() => document.querySelectorAll('#boardPlayerModal .board-playercard-acctid').length)
  ok(back === 2, 'Show all brings both back', String(back))
  const host = await page.evaluate(() => { const el = document.getElementById('katomiaHostOptions'); return { present: !!el, hidden: el?.hidden, shown: el ? getComputedStyle(el).display : null } })
  ok(host.present && host.hidden && host.shown === 'none', 'Host options is in the static page, hidden, and hidden means not displayed', JSON.stringify(host))
  ok(!errs.length, 'no page errors', JSON.stringify(errs))
  await page.close()
}

console.log('7. Host options reveals to the host on the CLEAN /board/<id> URL (HOSTMENU-STATIC2)')
{
  // The first fix passed only because this suite loaded board.html?game=… — the header's
  // reveal script runs before katomia-core.js exists, so on labs' /board/<id> (no ?game=)
  // the id resolved to "" and the script quit before registering its load handler.
  const adminHex = 'ab'.repeat(32)
  const jwkX = Buffer.from(adminHex, 'hex').toString('base64url')
  const open = async (keyHex) => {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } })
    if (keyHex) await ctx.addInitScript(x => localStorage.setItem('katomiaPlayerKeypair', JSON.stringify({ publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x } })), Buffer.from(keyHex, 'hex').toString('base64url'))
    const page = await ctx.newPage()
    const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)))
    await page.goto(`${BASE}/m/katomia/board/QA-HOST?demo=1`, { waitUntil: 'load' })
    // the socket would deliver this meta ~600 ms after join; the demo has no socket, so hand it over
    await page.evaluate(hex => { gameMeta = { ...(typeof gameMeta === 'object' && gameMeta ? gameMeta : {}), id: 'QA-HOST', admin: { type: 'ed25519PublicKeyHex', value: hex } } }, adminHex)
    await page.waitForTimeout(1200)
    const r = await page.evaluate(() => { const el = document.getElementById('katomiaHostOptions'); return { gameId: typeof getGameId === 'function' ? getGameId() : null, hidden: el.hidden, display: getComputedStyle(el).display, href: el.getAttribute('href'), errs: [] } })
    r.errs = errs; await ctx.close(); return r
  }
  const asHost = await open(adminHex)
  ok(asHost.gameId === 'QA-HOST', 'the clean URL yields the circle id client-side', JSON.stringify(asHost))
  ok(asHost.hidden === false && asHost.display !== 'none' && asHost.href === '/m/katomia/host?game=QA-HOST', 'the host sees 🎪 Host options, linked to this circle', JSON.stringify(asHost))
  ok(!asHost.errs.length, 'no page errors', JSON.stringify(asHost.errs))
  const asGuest = await open('cd'.repeat(32))
  ok(asGuest.hidden === true && asGuest.display === 'none', 'another key does not see it', JSON.stringify(asGuest))
  const noKey = await open(null)
  ok(noKey.hidden === true, 'a browser with no key does not see it', JSON.stringify(noKey))
}

console.log('11. MENU-SPEC1 + MENU-NET1: the ☰ by page — network only on Home, no row for the page you are on, You, Developer nested')
{
  const GAMES = { ok: true, games: {
    'QA-T1': { id: 'QA-T1', config: { tradingMode: 'proposal', network: 'testnet' }, profile: { name: 'Test circle' } },
    'QA-T1~1': { id: 'QA-T1~1', config: { tradingMode: 'proposal', network: 'testnet' }, profile: { name: 'Side circle' } },
    'QA-M1': { id: 'QA-M1', config: { tradingMode: 'proposal', network: 'mainnet' }, profile: { name: 'Main circle' } },
    'demo-play': { id: 'demo-play', config: { tradingMode: 'proposal', network: 'playnet' }, profile: { name: 'Play demo' } } } }
  const visit = async (path, { nerd = false, net = null, width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } })
    await ctx.addInitScript(([n, v]) => { localStorage.setItem('katomia.nerd.v1', n ? '1' : '0'); if (v) localStorage.setItem('katomiaNetwork', v) }, [nerd, net])
    await ctx.route('**/hapi/games*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(GAMES) }))
    const page = await ctx.newPage()
    const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)))
    await page.goto(`${BASE}/m/katomia/${path}`, { waitUntil: 'load' })
    await page.waitForTimeout(900)
    await page.evaluate(() => { document.getElementById('preloader')?.remove(); document.getElementById('cookieNotice')?.remove() })
    const rows = () => page.evaluate(() => {
      const shown = el => !!el && el.getClientRects().length > 0
      const menu = document.getElementById('appMenu')
      return { items: [...menu.querySelectorAll(':scope > .app-menu-item')].filter(shown).map(e => e.textContent.trim()),
        netrow: shown(menu.querySelector('[data-menu-network]')), dev: shown(menu.querySelector('[data-menu-group="dev"]')),
        playnet: shown(menu.querySelector('[data-net="playnet"]')),
        pressed: [...menu.querySelectorAll('[data-net][aria-pressed="true"]')].map(b => b.dataset.net) }
    })
    return { ctx, page, errs, rows }
  }
  // Home
  {
    const { ctx, page, errs, rows } = await visit('index.html')
    await page.click('#appMenuBtn'); await page.waitForTimeout(250)
    const r = await rows()
    ok(r.netrow && !r.items.some(t => /Home/.test(t)), 'Home: the network row heads the menu and there is no 🏠 Home row', JSON.stringify(r))
    ok(['Circles', 'You', 'Send feedback'].every(w => r.items.some(t => t.includes(w))) && !r.items.some(t => /Profile/.test(t)), 'Home: ⭕ Circles, 👤 You, 💬 Send feedback — and "Profile" is gone', JSON.stringify(r.items))
    ok(!r.dev && !r.playnet && r.pressed.join() === 'testnet', 'Home, normal mode: no Developer group, no Playnet, testnet until chosen', JSON.stringify(r))
    for (const n of ['mainnet', 'testnet', 'mainnet', 'testnet', 'mainnet']) await page.click(`[data-net="${n}"]`)
    const s = await page.evaluate(() => ({ stored: localStorage.getItem('katomiaNetwork'), open: !document.getElementById('appMenu').classList.contains('hidden'),
      auth: document.getElementById('authNetwork')?.value, kam: document.getElementById('kamNetwork')?.value,
      notes: document.querySelectorAll('[data-network-note]').length, noteText: document.querySelector('[data-network-note="authNetwork"]')?.textContent,
      rows: [...document.querySelectorAll('#authNetworkRow, #kamNetworkRow')].map(e => e.classList.contains('hidden')) }))
    ok(s.stored === 'mainnet' && s.open, 'tapping Mainnet stores it and the menu stays open (a switch, not a destination)', JSON.stringify(s))
    ok(s.auth === 'mainnet' && s.kam === 'mainnet' && s.noteText === 'Mainnet', 'the You and Authenticate wallet pickers follow it, and the note names it', JSON.stringify(s))
    ok(s.notes === 2 && s.rows.every(Boolean), 'five switches later there is still exactly one note per modal and both picker rows stay hidden (lab2 piled notes up)', JSON.stringify(s))
    ok(!errs.length, 'no page errors on Home', JSON.stringify(errs))
    await ctx.close()
  }
  {
    const { ctx, page, rows } = await visit('index.html', { nerd: true, net: 'playnet' })
    await page.click('#appMenuBtn'); await page.waitForTimeout(250)
    const r = await rows()
    ok(r.dev && r.playnet && r.pressed.join() === 'playnet', 'developer mode: a 🧪 Developer group and Playnet appear', JSON.stringify(r))
    const clip = () => page.evaluate(() => { const i = document.querySelector('[data-menu-group="dev"] .app-menu-groupinner'); return { h: Math.round(i.getBoundingClientRect().height), vis: getComputedStyle(i).visibility,
      w: Math.round(document.getElementById('appMenu').getBoundingClientRect().width), open: !document.getElementById('appMenu').classList.contains('hidden'),
      items: [...i.querySelectorAll('.app-menu-item')].filter(e => e.getClientRects().length).map(e => e.textContent.trim()) } })
    const before = await clip()
    await page.click('[data-menu-group="dev"] > .app-menu-grouphead'); await page.waitForTimeout(400)
    const after = await clip()
    ok(before.h === 0 && before.vis === 'hidden' && after.h > 40 && after.vis === 'visible' && after.open, 'the group is collapsed until tapped, then unrolls in place with the menu still open', JSON.stringify({ before, after }))
    ok(after.items.some(t => /All markets/.test(t)) && after.items.some(t => /QA/.test(t)), 'inside: All markets (raw) and QA', JSON.stringify(after.items))
    ok(before.w === after.w, 'the menu does not get wider as the group opens — it was full width from the start', `${before.w} → ${after.w}`)
    await ctx.close()
  }
  {
    const { ctx, page, rows } = await visit('index.html', { nerd: false, net: 'playnet' })
    await page.click('#appMenuBtn'); await page.waitForTimeout(250)
    const r = await rows()
    ok(r.pressed.join() === 'testnet', 'a stored Playnet reads as Testnet once developer mode is off', JSON.stringify(r))
    await ctx.close()
  }
  // Circles — MENU-NET2: the same switch as Home, no chips, the list follows it live
  {
    const { ctx, page, errs, rows } = await visit('circles.html', { net: 'testnet' })
    await page.click('#appMenuBtn'); await page.waitForTimeout(250)
    const r = await rows()
    ok(r.netrow && r.pressed.join() === 'testnet' && r.items.some(t => /Home/.test(t)) && !r.items.some(t => /Circles/.test(t)), 'Circles: the network switch heads the ☰ (as on Home), 🏠 Home, no ⭕ Circles row', JSON.stringify(r))
    const names = () => page.evaluate(() => ({ names: [...document.querySelectorAll('#circlesList .circle-name')].map(e => e.textContent),
      netChips: [...document.querySelectorAll('.circles-filterrow .circles-filterlabel')].map(e => e.textContent), url: location.search }))
    const l = await names()
    ok(l.names.includes('Test circle') && l.names.includes('Play demo') && !l.names.includes('Main circle'), 'the list follows the network: testnet circles plus play demos, no mainnet', JSON.stringify(l))
    ok(!l.names.includes('Side circle'), 'side circles (<parent>~<n>) are never listed', JSON.stringify(l.names))
    ok(!l.netChips.includes('Network'), 'no network chips on the page — the ☰ is the switch', JSON.stringify(l.netChips))
    await page.click('#appMenu [data-net="mainnet"]'); await page.waitForTimeout(300)
    const m = await names()
    const stored = await page.evaluate(() => localStorage.getItem('katomiaNetwork'))
    ok(m.names.includes('Main circle') && !m.names.includes('Test circle') && stored === 'mainnet' && !/network=/.test(m.url), 'switching to Mainnet in this ☰ re-lists at once and sets the same setting Home reads', JSON.stringify({ m, stored }))
    ok(!errs.length, 'no page errors on Circles', JSON.stringify(errs))
    await ctx.close()
  }
  {
    const { ctx, page } = await visit('circles.html?network=mainnet', { net: 'testnet' })
    const st = await page.evaluate(() => ({ stored: localStorage.getItem('katomiaNetwork'), url: location.search, names: [...document.querySelectorAll('#circlesList .circle-name')].map(e => e.textContent) }))
    ok(st.stored === 'mainnet' && st.names.includes('Main circle') && !/network=/.test(st.url), 'a ?network= deep link sets the network (the one setting) and leaves the URL', JSON.stringify(st))
    await ctx.close()
  }
  // Board — MENU-NET2: the network is shown, read-only
  {
    const { ctx, page, errs, rows } = await visit('board.html?demo=1')
    await page.click('#appMenuBtn'); await page.waitForTimeout(250)
    const r = await rows()
    const ro = await page.evaluate(() => { const p = document.querySelector('[data-menu-network-ro] .app-menu-netpill'); return { shown: !!p && p.getClientRects().length > 0, text: p?.textContent, net: p?.dataset.net, buttons: document.querySelectorAll('#appMenu [data-net] button, #appMenu button[data-net]').length, first: document.querySelector('#appMenu > *:not(script)')?.matches('[data-menu-network-ro]') } })
    ok(!r.netrow && r.items.some(t => /Home/.test(t)) && !r.items.some(t => /Circles/.test(t)) && r.items.some(t => /You/.test(t)), 'on a board: 🏠 Home and 👤 You, no Circles, no network SWITCH', JSON.stringify(r))
    ok(ro.shown && ro.first && ro.net && ro.text === { playnet: 'Playnet', testnet: 'Testnet', mainnet: 'Mainnet' }[ro.net] && ro.buttons === 0, 'the ☰ opens on "Network <this circle\'s network>", read-only', JSON.stringify(ro))
    ok(!errs.length, 'no page errors on the board', JSON.stringify(errs))
    await ctx.close()
  }
}

console.log('12. MENU-VIEW1: one 👁 View group on the board — screen views, layout, Round-Table rows, Chips, Lab; the board does not shrink under an open menu')
{
  const visit = async ({ nerd = false, width = 390 } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } })
    await ctx.addInitScript(n => { localStorage.setItem('katomia.nerd.v1', n ? '1' : '0') }, nerd)
    const page = await ctx.newPage()
    const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)))
    await page.goto(`${BASE}/m/katomia/board.html?demo=1`, { waitUntil: 'networkidle' })
    await page.evaluate(() => { document.getElementById('preloader')?.remove(); document.getElementById('cookieNotice')?.remove() })
    await page.waitForTimeout(1000)
    return { ctx, page, errs }
  }
  const look = page => page.evaluate(() => {
    const shown = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && el.closest('.app-menu-groupinner')?.getBoundingClientRect().height !== 0
    const lab = id => document.getElementById(id)?.closest('label')
    const menu = document.getElementById('appMenu')
    return { top: [...menu.querySelectorAll(':scope > .app-menu-item, :scope > .app-menu-group > .app-menu-grouphead')].filter(e => e.getClientRects().length).map(e => e.textContent.trim()),
      w: Math.round(menu.getBoundingClientRect().width),
      viewRow: shown(menu.querySelector('[data-menu-view="split"]')), layout: shown(lab('boardSkinSelect')), layoutText: lab('boardSkinSelect')?.firstChild?.textContent.trim(),
      selfBottom: shown(lab('boardPrefSelfBottom')), maxSeg: shown(lab('boardPrefMaxSeg')), partyOnly: shown(lab('boardPrefPartyOnly')),
      chips: ['boardPrefAutoArrange', 'boardPrefUiSize', 'boardPrefLayout', 'boardPrefChipShape', 'boardPrefChipStyle', 'boardPrefNet', 'boardPrefSticky', 'boardPrefTrailResidual'].map(id => shown(lab(id))),
      labHead: shown(menu.querySelector('[data-menu-group="view.lab"] > .app-menu-grouphead')),
      lab: ['boardPrefChipScale', 'boardPrefAnimSpeed', 'boardPrefHugRing', 'boardPrefClassicCounter', 'boardPrefAvatarSpoke', 'boardPrefZoneWalls'].map(id => shown(lab(id))),
      inMenu: ['boardPrefPickable', 'boardPrefExtSign', 'boardPrefTickets'].map(id => !!menu.querySelector('#' + id)),
      safeTop: Math.round(_boardSimEnv?.safeTop || 0), skin: document.body.dataset.boardSkin }
  })
  {
    const { ctx, page, errs } = await visit()
    const closedTop = await page.evaluate(() => Math.round(_boardSimEnv?.safeTop || 0))
    await page.click('#appMenuBtn'); await page.waitForTimeout(300)
    const a = await look(page)
    ok(a.top.join('|') === '🏠 Home|👁View▸|👤 You|💬 Send feedback', 'the board ☰ reads Home, View, You (and Send feedback) — no ⚙ Settings, no Circles', JSON.stringify(a.top))
    ok(!a.viewRow && !a.layout, 'View starts collapsed', JSON.stringify(a))
    await page.click('[data-menu-group="view"] > .app-menu-grouphead'); await page.waitForTimeout(400)
    const b = await look(page)
    ok(b.viewRow && b.layout && b.layoutText === 'Board layout' && b.partyOnly, 'View unrolls: the three screen views first, then Board layout, then Party only', JSON.stringify(b))
    ok(b.selfBottom && b.maxSeg && b.skin === 'ring16', 'Round Table shows You at bottom and Max on ring', JSON.stringify(b))
    ok(b.w === a.w, 'the menu kept its width while View unrolled', `${a.w} → ${b.w}`)
    ok(b.inMenu.every(x => !x), 'Pickable, Advanced signing and Allow tickets are no longer in the board menu', JSON.stringify(b.inMenu))
    ok(!b.labHead, 'normal mode: no Lab group', JSON.stringify(b))
    await page.click('[data-menu-group="view.chips"] > .app-menu-grouphead'); await page.waitForTimeout(400)
    const c = await look(page)
    ok(c.chips.every(Boolean), 'Chips: auto-arrange, size, layout, shape, style, net, sticky, trail after-glow', JSON.stringify(c.chips))
    ok(c.w === a.w, 'still the same width with Chips open too', `${a.w} → ${c.w}`)
    await page.selectOption('#boardPrefChipStyle', 'dark'); await page.waitForTimeout(700)
    const d = await look(page)
    ok(d.safeTop === closedTop, 'changing a chip setting with the menu open does not push the board down (header reserve ignores the open menu)', `${closedTop} → ${d.safeTop}`)
    await page.selectOption('#boardSkinSelect', 'carousel'); await page.waitForTimeout(700)
    const e = await look(page)
    ok(e.skin === 'carousel' && !e.selfBottom && !e.maxSeg && e.layout, 'Carousel: You at bottom and Max on ring step out of the way', JSON.stringify(e))
    await page.selectOption('#boardSkinSelect', 'ring16'); await page.waitForTimeout(500)
    const f = await look(page)
    ok(f.skin === 'ring16' && f.selfBottom && f.maxSeg, 'back to Round Table, they come back', JSON.stringify(f))
    // You → Preferences on a board: the three gameplay switches, live
    await page.click('#appMenuBtn'); await page.waitForTimeout(150)
    await page.evaluate(() => { document.getElementById('appMenu').classList.remove('hidden'); document.querySelector('[data-menu-profile]').click() })
    await page.waitForTimeout(500)
    const p = await page.evaluate(() => { const pk = document.getElementById('boardPrefPickable'); return { inModal: !!pk?.closest('#profileModal'), disabled: pk?.disabled,
      ext: !!document.getElementById('boardPrefExtSign')?.closest('#profileModal'), tix: !!document.getElementById('boardPrefTickets')?.closest('#profileModal'),
      uiSizeInModal: !!document.querySelector('#profileModal #boardPrefUiSize') } })
    ok(p.inModal && p.disabled === false && p.ext && p.tix && !p.uiSizeInModal, 'You → Preferences holds Pickable (live on a board), Advanced signing and Allow tickets; Size is gone from it', JSON.stringify(p))
    ok(!errs.length, 'no page errors', JSON.stringify(errs))
    await ctx.close()
  }
  {
    const { ctx, page, errs } = await visit({ nerd: true })
    await page.click('#appMenuBtn'); await page.waitForTimeout(200)
    const st = await page.evaluate(() => ({ view: document.querySelector('[data-menu-group="view"]').classList.contains('is-open'), chips: document.querySelector('[data-menu-group="view.chips"]').classList.contains('is-open') }))
    if (!st.view) { await page.click('[data-menu-group="view"] > .app-menu-grouphead'); await page.waitForTimeout(400) }
    await page.click('[data-menu-group="view.lab"] > .app-menu-grouphead'); await page.waitForTimeout(400)
    const g = await look(page)
    ok(g.labHead && g.lab.every(Boolean), 'developer mode: a 🧪 Lab group with chip scale, anim speed, hug ring, classic counter, avatar spoke, zone walls', JSON.stringify(g.lab))
    ok(g.top.some(t => /Developer/.test(t)), 'and the 🧪 Developer group at the foot of the menu', JSON.stringify(g.top))
    ok(!errs.length, 'no page errors (developer mode)', JSON.stringify(errs))
    await ctx.close()
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/m/katomia/index.html`, { waitUntil: 'load' }); await page.waitForTimeout(800)
    await page.evaluate(() => document.querySelector('[data-menu-profile]').click()); await page.waitForTimeout(500)
    const p = await page.evaluate(() => ({ disabled: document.getElementById('boardPrefPickable')?.disabled, note: document.getElementById('kprefPickableScope')?.textContent }))
    ok(p.disabled === true && /inside a circle/.test(p.note), 'off a board Pickable shows disabled and says it is set inside a circle', JSON.stringify(p))
    await ctx.close()
  }
}

console.log('13. MENU-YOU1: the You modal — Reputation / Commit, one intent key, Fees and rewards, Preferences, Tech')
{
  const youModal = async nerd => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } })
    await ctx.addInitScript(n => localStorage.setItem('katomia.nerd.v1', n ? '1' : '0'), nerd)
    const page = await ctx.newPage()
    const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)))
    await page.goto(`${BASE}/m/katomia/index.html`, { waitUntil: 'load' }); await page.waitForTimeout(800)
    await page.evaluate(() => { document.querySelector('[data-menu-profile]').click(); document.querySelectorAll('#profileModal details.profile-section').forEach(d => { d.open = true }) })
    await page.waitForTimeout(500)
    // the Reputation fold shows once a signable wallet account is chosen (kauthRenderLadder) — no wallet here, so show it
    await page.evaluate(() => document.getElementById('profileCommitSection').classList.remove('hidden'))
    const r = await page.evaluate(() => {
      const M = document.getElementById('profileModal')
      const shown = el => !!el && el.getClientRects().length > 0
      const sec = cls => M.querySelector('details.' + cls)
      const has = (d, id) => !!d?.querySelector('#' + id) && shown(d.querySelector('#' + id).closest('label, div, button'))
      return {
        titles: [...M.querySelectorAll('details.profile-section > summary, .profile-section > .profile-section-title, details.profile-commit > summary')].filter(shown).map(e => e.textContent.replace(/\s+/g, ' ').trim()),
        commitBtn: document.getElementById('authBtn')?.textContent.trim(),
        keys: [...M.querySelectorAll('#profilePubkey, #profileCommitPubkey')].map(e => e.id),
        scopeInFold: !!document.getElementById('profileScope')?.closest('#profileCommitSection'),
        kvacInFees: !!document.getElementById('profileKvac')?.closest('details.profile-fees'),
        prefs: ['kprefAutoAdd', 'kprefAutoSignReq', 'boardPrefPickable', 'boardPrefExtSign', 'boardPrefTickets'].map(id => has(sec('profile-prefs'), id)),
        tech: ['katomia-nerd-toggle', 'kdiagRemoteToggle', 'profileCopyDiagBtn', 'profileBuildStamp'].map(id => has(sec('profile-tech'), id)),
        prefWords: (sec('profile-prefs')?.textContent || '').replace(/\s+/g, ' ')
      }
    })
    await page.evaluate(() => { document.getElementById('profileCommitSection').open = true })
    const more0 = await page.evaluate(() => document.getElementById('authCommitMore').hidden)
    await page.click('#profileCommitSection .profile-info'); await page.waitForTimeout(150)
    const more1 = await page.evaluate(() => document.getElementById('authCommitMore').hidden)
    r.more = [more0, more1]; r.errs = errs
    // AUTH-NETSTATEMENT1: the statements name the network (feedback zulu-november-92)
    r.statements = await page.evaluate(() => {
      window.__kauthActive = '0.0.1879'; window.__kauthWcSet = new Set(['0.0.1879']); window.__kamActive = '0.0.1879'
      const sel = document.getElementById('authAccount'); if (sel) sel.innerHTML = '<option value="0.0.1879">0.0.1879</option>'
      const ksel = document.getElementById('kamAccount'); if (ksel) ksel.innerHTML = '<option value="0.0.1879">0.0.1879</option>'
      updateAuthStatement(); kamUpdateStatement()
      return [document.getElementById('authStatement').textContent, document.getElementById('kamStatement').textContent]
    })
    await ctx.close(); return r
  }
  const a = await youModal(false)
  ok(a.titles.join('|') === 'Wallet connection|🔗 Reputation optional|Preferences|Tech', 'normal mode: Wallet connection, 🔗 Reputation, Preferences, Tech — no Fees and rewards', JSON.stringify(a.titles))
  ok(a.commitBtn === '◈ Commit', 'the button is just "Commit"', a.commitBtn)
  ok(a.more[0] === true && a.more[1] === false, 'the short line\'s ⓘ unrolls the longer explanation on a tap', JSON.stringify(a.more))
  ok(a.prefs.join() === 'true,true,true,false,false' && !/Size/.test(a.prefWords), 'Preferences: auto-add, auto-request signatures, Pickable — the two lab switches only in developer mode, no Size', JSON.stringify(a.prefs))
  ok(a.tech.every(Boolean), 'Tech: nerd mode, remote logging, copy diagnostics, build stamp', JSON.stringify(a.tech))
  ok(a.statements.every(t => /control Hedera Testnet account 0\.0\.1879/.test(t)), 'both statements say "I control Hedera Testnet account 0.0.1879"', JSON.stringify(a.statements))
  ok(!a.errs.length, 'no page errors', JSON.stringify(a.errs))
  const b = await youModal(true)
  ok(b.titles.join('|') === 'Wallet connection|🔗 Reputation optional|Fees and rewards|Preferences|Tech', 'developer mode adds Fees and rewards', JSON.stringify(b.titles))
  ok(b.keys.join() === 'profileCommitPubkey' && b.scopeInFold && b.kvacInFees, 'the intent key appears once (in Reputation, with its scope); the access token sits in Fees and rewards', JSON.stringify(b))
  ok(b.prefs.every(Boolean), 'developer mode: Advanced signing and Allow tickets join Preferences', JSON.stringify(b.prefs))
}

console.log('14. LANDING-NET1 + RECENT-VISITS1 + LIVE-NOW1 + LIST-MINE1: Home by network, your way back, who is here now; Circles "Mine" and ▶ ⏸ 👁')
{
  const A = (playing, waiting, watching) => ({ accounts: 2, pending: 0, playing, waiting, watching, lastActivity: Date.now() })
  const G = (id, net, name, act, you) => ({ id, config: { tradingMode: 'proposal', network: net }, profile: { name }, activity: act, ...(you ? { you: { accounts: you } } : {}) })
  const GAMES = { ok: true, games: {
    't-prop': G('t-prop', 'testnet', '🐫 proposal', A(0, 1, 0), 1), 'm-prop': G('m-prop', 'mainnet', '🐫 Silk Road', A(0, 0, 0)),
    't-busy': G('t-busy', 'testnet', 'Busy', A(4, 1, 2)), 't-bench': G('t-bench', 'testnet', 'Bench', A(0, 3, 0)), 't-stands': G('t-stands', 'testnet', 'Stands', A(0, 0, 5)),
    't-quiet': G('t-quiet', 'testnet', 'Quiet', A(0, 0, 0)), 't-a': G('t-a', 'testnet', 'Alpha', A(1, 0, 0)), 't-b': G('t-b', 'testnet', 'Bravo', A(0, 1, 1)),
    't-c': G('t-c', 'testnet', 'Charlie', A(0, 0, 1)), 'm-live': G('m-live', 'mainnet', 'Main live', A(2, 0, 0)),
    't-prop~3': G('t-prop~3', 'testnet', 'side room', A(2, 0, 0), 1) } }
  const visit = async (path, { net = 'testnet', nerd = false, recent = null } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } })
    await ctx.addInitScript(([v, n, r]) => { localStorage.setItem('katomiaNetwork', v); localStorage.setItem('katomia.nerd.v1', n ? '1' : '0'); if (r) localStorage.setItem('katomiaRecent', JSON.stringify(r)) }, [net, nerd, recent])
    let token = null
    await ctx.route('**/hapi/games*', r => { token = r.request().headers()['x-player-token']; r.fulfill({ contentType: 'application/json', body: JSON.stringify(GAMES) }) })
    const page = await ctx.newPage()
    const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)))
    await page.goto(`${BASE}/m/katomia/${path}`, { waitUntil: 'load' }); await page.waitForTimeout(900)
    return { ctx, page, errs, token: () => token }
  }
  const home = page => page.evaluate(() => ({
    doors: [...document.querySelectorAll('.landing-list .landing-card')].filter(c => !c.hidden && c.getClientRects().length).map(c => c.querySelector('.landing-card-label').textContent.trim().split('\n')[0]),
    recent: [...document.querySelectorAll('#landingRecent .landing-row')].map(r => r.dataset.id), recentShown: !document.getElementById('landingRecent').hidden,
    live: [...document.querySelectorAll('#landingLive .landing-row')].map(r => r.dataset.id),
    more: document.querySelector('#landingRecent [data-more]')?.textContent.trim() || null,
    aud: document.querySelector('#landingLive .landing-row[data-id="t-busy"] .katomia-aud')?.textContent.replace(/\s+/g, ' ').trim() || '',
    sideHref: document.querySelector('#landingRecent .landing-row[data-id="t-prop~3"] a')?.getAttribute('href') || null }))
  {
    const { ctx, page, errs, token } = await visit('index.html', { net: 'testnet', recent: [
      { id: 't-prop~3', view: 'board', net: 'testnet', name: '', at: 5 }, { id: 't-busy', view: 'board', net: 'testnet', at: 4 },
      { id: 'm-prop', view: 'board', net: 'mainnet', at: 3 }, { id: 't-quiet', view: 'board', net: 'testnet', at: 2 }, { id: 'kqa-x', view: 'game', net: 'testnet', name: 'Old order book', at: 1 }] })
    const h = await home(page)
    ok(h.doors.some(t => /Testnet/.test(t)) && !h.doors.some(t => /Mainnet|Playnet/.test(t)) && h.doors.some(t => /Watch/.test(t)), 'Home on Testnet: the Testnet door (and the watch-only demo), not Mainnet or Playnet', JSON.stringify(h.doors))
    ok(h.recentShown && h.recent.join() === 't-prop~3,t-busy,m-prop' && /Show all \(5\)/.test(h.more || ''), 'Recently visited: newest first, the last three, "Show all (5)"', JSON.stringify(h))
    ok(h.sideHref === '/m/katomia/board/t-prop~3', 'side circles are in your history (unlike the Circles list) and link straight back', String(h.sideHref))
    ok(!h.live.includes('t-busy') && h.live.join() === 't-a,t-bench,t-b,t-prop,t-stands', 'Live now: top five on Testnet by playing, then waiting, then watching — minus what Recent already shows, no side circles, no mainnet', JSON.stringify(h.live))
    ok(typeof token() === 'string' && token().length > 8, 'Home asks the games list with this browser\'s player token (so `you` can come back)', String(token()))
    await page.click('#landingRecent [data-more]'); await page.waitForTimeout(100)
    const all = await home(page)
    ok(all.recent.length === 5 && /Show fewer/.test(all.more || ''), 'Show all lists the whole history', JSON.stringify(all.recent))
    await page.click('#landingRecent [data-forget="m-prop"]'); await page.waitForTimeout(100)
    const forgot = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#landingRecent .landing-row')].map(r => r.dataset.id), stored: JSON.parse(localStorage.getItem('katomiaRecent')).map(x => x.id), url: location.pathname }))
    ok(!forgot.rows.includes('m-prop') && !forgot.stored.includes('m-prop') && forgot.url.endsWith('/index.html'), '× forgets one visit, here and in storage, without navigating', JSON.stringify(forgot))
    await page.click('#landingRecent [data-clear]'); await page.waitForTimeout(100)
    const cleared = await home(page)
    const stored = await page.evaluate(() => localStorage.getItem('katomiaRecent'))
    ok(!cleared.recentShown && stored === null && cleared.live.includes('t-busy'), 'Clear history empties it (section hidden), and Live now can show what Recent was hiding', JSON.stringify({ cleared, stored }))
    await page.click('#appMenuBtn'); await page.waitForTimeout(150)
    await page.click('#appMenu [data-net="mainnet"]'); await page.waitForTimeout(200)
    const m = await home(page)
    ok(m.doors.some(t => /Mainnet/.test(t)) && !m.doors.some(t => /Testnet/.test(t)) && m.live.join() === 'm-live', 'switching to Mainnet swaps the door and Live now with it', JSON.stringify(m))
    ok(!errs.length, 'no page errors on Home', JSON.stringify(errs))
    await ctx.close()
  }
  {
    const { ctx, page } = await visit('index.html', { net: 'playnet', nerd: true })
    const h = await home(page)
    ok(h.doors.some(t => /Playnet/.test(t)) && !h.doors.some(t => /Testnet|Mainnet/.test(t)), 'developer mode on Playnet: the Playnet door (p-prop)', JSON.stringify(h.doors))
    ok(!h.recentShown, 'no history yet: no Recently visited section at all', JSON.stringify(h))
    await ctx.close()
  }
  // a visit is recorded from the board, under the circle's own id
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/m/katomia/board.html?demo=1`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200)
    // the sandbox sets its first state directly; a real board gets every state through the frame handler
    const r = await page.evaluate(() => {
      katomiaHandleFrame({ data: JSON.stringify({ type: 'game_state', meta: { id: 'QA-VISIT~2', network: 'testnet', profile: { name: 'Visit me' } }, state, myPlayerId: currentPlayerId }) })
      return JSON.parse(localStorage.getItem('katomiaRecent') || '[]')
    })
    ok(r.length === 1 && r[0].id === 'QA-VISIT~2' && r[0].view === 'board' && r[0].net === 'testnet' && r[0].name === 'Visit me', 'a board state records the visit under the circle it names — side circles included', JSON.stringify(r))
    await ctx.close()
  }
  // Circles: Mine row + the audience on each card
  {
    const { ctx, page, errs } = await visit('circles.html', { net: 'testnet' })
    const c = await page.evaluate(() => ({ rows: [...document.querySelectorAll('.circles-filterrow')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
      mine: !!document.querySelector('.circle-card .circle-chip--mine'), aud: [...document.querySelectorAll('.circle-card')].find(c => /Busy/.test(c.textContent))?.querySelector('.katomia-aud')?.textContent.replace(/\s+/g, ' ').trim() }))
    ok(c.rows.some(r => /^Mine ?I'm in ?1 ?Others ?\d+/.test(r)) && c.mine, 'Circles: a "Mine" row (I\'m in / Others) and a "you\'re in" chip on the circle you are seated at', JSON.stringify(c))
    ok(/▶.?4/.test(c.aud || '') && /⏸.?1/.test(c.aud || '') && /👁.?2/.test(c.aud || ''), 'each card carries ▶ playing ⏸ waiting 👁 watching', JSON.stringify(c.aud))
    await page.click('.circles-filterrow:has(.circles-filterlabel:text-is("Mine")) .circles-filter >> nth=1'); await page.waitForTimeout(200)
    const only = await page.evaluate(() => ({ names: [...document.querySelectorAll('#circlesList .circle-name')].map(e => e.textContent), url: location.search }))
    ok(only.names.join() === '🐫 proposal' && /mine=in/.test(only.url), 'untick Others: only the circles you are in, and ?mine=in in the URL', JSON.stringify(only))
    ok(!errs.length, 'no page errors on Circles', JSON.stringify(errs))
    await ctx.close()
  }
}

await browser.close(); server.close()
console.log(`\n${total - failed}/${total} passed` + (failed ? ` — ${failed} FAILED` : ' — both board shapes hold'))
process.exit(failed ? 1 : 0)
