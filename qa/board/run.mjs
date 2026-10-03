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

await browser.close(); server.close()
console.log(`\n${total - failed}/${total} passed` + (failed ? ` — ${failed} FAILED` : ' — both board shapes hold'))
process.exit(failed ? 1 : 0)
