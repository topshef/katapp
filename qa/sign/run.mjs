// qa/sign — SIGN-PRECHECK-QA1: the "not enough" regression suite for the signing modal.
//
// Operator, 2026-09-06, after an NFT the sender no longer held left the modal on "Ready to
// submit" with every card green: "update the QA with some regression tests we can keep
// running that can detect if this ever breaks — and generally cover this class of issue:
// not enough balance in anything."
//
// The class: the backend's precheck refuses to submit and says why. Each reason must land
// in the SAME three places on the account card — red ring, red chip, a plain-words line in
// the expanded detail — and the header must not claim the transaction is ready. One
// scenario per reason the precheck can produce, plus the clean / incomplete / expired
// controls so a fix for one cannot silently regress another.
//
// Drives the REAL built bundle (build/dist) in headless Chromium, served locally. The one
// backend call the modal makes (txRead) is answered from a fixture captured off the live
// backend — public transaction bytes, public keys, signatures; nothing secret — with the
// precheck verdict grafted on per scenario. Every other request is refused, so this never
// touches a network. Clicks are real pointer clicks.
//
//   node qa/sign/run.mjs            (from the repo root; needs playwright + chromium)
//   DIST=<another dist> node …      to test another build
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const DIST = resolve(ROOT, process.env.DIST || 'build/dist')
const PCH  = 'e3de61ab30b8c852dfcf41a427f3cea54bca858fa33b707b807f4522d3a3b574'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }

let failed = 0, total = 0
const ok = (c, m, x) => { total++; if (c) console.log('  PASS ' + m); else { failed++; console.log('  FAIL ' + m + (x !== undefined ? ' — ' + x : '')) } }

// ── a tiny static server over the built dist (no python, no deps) ──────────────
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p.endsWith('/')) p += 'index.html'
  const file = join(DIST, p)
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end() }
  let body
  try { body = readFileSync(file) } catch { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
  res.end(body)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

// ── the fixture, and the per-scenario precheck grafts ──────────────────────────
const SENDER = '0.0.3833789', RECEIVER = '0.0.9940704'
const FT = '0.0.3833795'                     // a fungible the fixture already sends
const NFT = '0.0.1263996', SERIAL = 8         // the real refused serial (KPLAY #8)
function fixture({ precheck, nftLeg = false, expired = false, succeeded = false }) {
  const f = JSON.parse(readFileSync(join(HERE, 'fixtures', 'txread-open.json'), 'utf8'))
  const r = f.result
  // an OPEN, in-window transaction: re-stamp the valid-start and drop the captured
  // EXPIRED status (the real tx expired after capture, and EXPIRED correctly outranks Held)
  if (!expired) { r.txid = r.txid.replace(/@\d+/, '@' + Math.floor(Date.now() / 1000)); delete r.comboStatus; delete r.mirrorStatus; delete r.isStatusFinal; r.receiptSuccess = false }
  // SIGNSETTLED1: the same capture, landed. Re-stamped as above so nothing else in the modal
  // thinks the clock has run out, then marked the way the backend marks a tx that reached
  // consensus — which is what the settled-ring rules key off.
  if (succeeded) { r.comboStatus = 'SUCCESS'; r.receiptSuccess = true; r.isStatusFinal = true }
  if (nftLeg) {
    // getAllTransfers reads NFT legs from PCH_basis.transfers (then the deal) and throws
    // on mixed sources — an unsettled tx has no mirror transactions, so set both
    const leg = { tokenId: NFT, serial: SERIAL, sender: SENDER, receiver: RECEIVER }
    r.deal.addNftTransfer = [leg]
    if (r.PCH_basis?.transfers) r.PCH_basis.transfers.nftTransfers = [leg]
    if (r.deal?.pchbasis?.transfers) r.deal.pchbasis.transfers.nftTransfers = [leg]
  }
  r.precheck = precheck === undefined ? r.precheck : precheck
  return f
}
const verdict = (fail = [], untested = [], balances = {}) => ({
  status: fail.length ? 'fail' : 'pass', complete: true, checkedAt: new Date().toISOString(),
  balances, tests: { fail, untested, pass: [] }
})

// KEYCOLS1: a 2-of-3 ThresholdKey as the mirror really returns it (Key.thresholdKey,
// field 5, ProtobufEncoded), built over the two pubkeys the fixture's signatures actually
// carry plus one that never signs. hedera-mirror.js decodes this and computes the Banzhaf
// and control scores locally, which is what makes the key table render at all — without a
// `key` on the account there is no table to test.
const KEY_2OF3 = '2a700802126c0a2212201b8c52be82f4310e42ec6078146d04902e11969197beb794684b6b3decee71940a221220650d41e75fe3162c64583c5563f82ebc4a87ae0700df7c726775b55d5dd7d60f0a221220a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'

const browser = await chromium.launch()
async function open(fx, { maxAutoAssoc, senderKey } = {}) {
  const page = await browser.newPage({ viewport: { width: 376, height: 900 } })
  await page.route('**/*', route => {
    const u = route.request().url()
    if (/action=txRead|kpool\/txRead/.test(u))
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fx) })
    // the modal looks every card's account up on the mirror; the association wording and
    // chip style branch on max_automatic_token_associations from that record. Answer it
    // for the receiver when a scenario sets it, so the datum arrives the way it really does.
    let m
    if (maxAutoAssoc !== undefined && (m = /\/accounts\/(0\.0\.\d+)(?:[?#]|$)/.exec(u)) && m[1] === RECEIVER)
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ account: RECEIVER, deleted: false, max_automatic_token_associations: maxAutoAssoc, balance: { balance: 100000000, tokens: [] } }) })
    // the sender's key structure, same endpoint — getKeyInfo reads it off the account record
    if (senderKey && (m = /\/accounts\/(0\.0\.\d+)(?:[?#]|$)/.exec(u)) && m[1] === SENDER)
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ account: SENDER, deleted: false, max_automatic_token_associations: 0,
          key: { _type: 'ProtobufEncoded', key: senderKey }, balance: { balance: 100000000, tokens: [] } }) })
    if (u.startsWith(BASE)) return route.continue()
    return route.abort()
  })
  page.on('pageerror', e => { if (!/\.slick is not a function|\.tabs is not a function/.test(e.message)) { failed++; total++; console.log('  FAIL page error: ' + e.message) } })
  await page.goto(`${BASE}/m/sign/?network=mainnet&txid=${encodeURIComponent(fx.result.txid)}&pch=${PCH}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.txcard', { timeout: 45000 })
  await page.evaluate(() => { document.getElementById('cookieNotice')?.remove(); document.getElementById('preloader')?.remove() })
  await page.waitForTimeout(900)
  return page
}
const state = (page, acct) => page.evaluate(({ acct }) => {
  const card = document.querySelector(`.txcard-head[data-acct="${acct}"]`)?.closest('.txcard')
  const chips = [...(card?.querySelectorAll('.txcard-chip') || [])]
  return {
    red: !!card?.classList.contains('txcard--balance-short'),
    redChips: chips.filter(c => c.classList.contains('txcard-chip--short')).map(c => c.dataset.side + ':' + c.dataset.assetKey),
    dashedChips: chips.filter(c => c.classList.contains('txcard-chip--unassoc') || c.classList.contains('txcard-chip--unassoc-hard')).map(c => c.dataset.side + ':' + c.dataset.assetKey + (c.classList.contains('txcard-chip--unassoc-hard') ? ':hard' : ':soft')),
    pill: document.querySelector('.kpm-head')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    banner: !!document.body.contains(document.getElementById('txread-precheck')),
    // SIGNSETTLED1: which settled mode the body is in, and what the card's ring RESOLVES to —
    // read off the cascade with getComputedStyle rather than from the class list, because the
    // whole point of the feature is that a live ring class now paints a different colour once
    // the transaction stops being live. Asserting the class would prove nothing.
    settled: document.body.classList.contains('tx-settled-ok') ? 'ok'
      : document.body.classList.contains('tx-settled-expired') ? 'expired' : '',
    ring: card ? (cs => {
      // a glow is a box-shadow layer with a BLUR radius; the settled ring keeps the 1px
      // spread and drops the blur, so "no glow" is "every layer has blur 0". Computed
      // box-shadow is `<color> <x> <y> <blur> <spread>` per layer — mask the colours (they
      // contain commas) before splitting layers, then read the third length.
      const layers = cs.boxShadow.replace(/rgba?\([^)]*\)/g, 'C').split(',')
      const len = (l, i) => parseFloat((l.trim().match(/-?[\d.]+px/g) || [])[i] || '0')
      return {
        border: cs.borderTopColor, shadow: cs.boxShadow,
        glows: layers.some(l => len(l, 2) > 0),      // any layer with a blur radius
        spread: len(layers[0], 3)                    // the ring layer's spread
      }
    })(getComputedStyle(card)) : null
  }
}, { acct })
async function expand(page, acct) {
  await (await page.$(`.txcard-head[data-acct="${acct}"]`)).click()
  await page.waitForTimeout(800)
  return page.evaluate(({ acct }) => {
    const card = document.querySelector(`.txcard-head[data-acct="${acct}"]`)?.closest('.txcard')
    const link = card?.querySelector('.txcard-issue-link')
    return { open: !!card?.classList.contains('txcard--open'), text: (card?.textContent || '').replace(/\s+/g, ' '),
      link: link ? { text: link.textContent, href: link.href, target: link.target, rel: link.rel } : null }
  }, { acct })
}

// ── scenarios ───────────────────────────────────────────────────────────────────
console.log('1. NFT the sender no longer holds (the real 2026-09-06 case)')
{
  const page = await open(fixture({ nftLeg: true, precheck: verdict([`does sender ${SENDER} own ${NFT} #${SERIAL} ?`]) }))
  const s = await state(page, SENDER), rc = await state(page, RECEIVER)
  ok(s.red, 'sender card rings red')
  ok(!rc.red, 'receiver card does not')
  ok(s.redChips.includes(`send:${NFT}#${SERIAL}`), 'the NFT send chip is solid red', JSON.stringify(s.redChips))
  ok(/\bHeld\b/.test(s.pill) && !/Ready to submit/.test(s.pill), 'header says Held, not Ready to submit', s.pill)
  ok(!s.banner, 'no precheck banner at the top')
  const d = await expand(page, SENDER)
  ok(d.open, 'a real click expands the card')
  ok(/doesn't hold .*#8/.test(d.text) && /would fail/.test(d.text), 'detail says the account does not hold that serial and the transfer would fail', d.text.slice(0, 220))
  ok(!/Not enough/.test(d.text), 'not misdescribed as an amount shortfall')
  ok(d.link?.text === 'another account' && d.link.href === `https://hashscan.io/mainnet/token/${NFT}/${SERIAL}`,
     '"another account" links to that serial on HashScan (mainnet)', JSON.stringify(d.link))
  ok(d.link?.target === '_blank' && /noopener/.test(d.link?.rel || ''), 'opens in a new tab with noopener')
  await page.close()
}

console.log('2. fungible token shortfall')
{
  const page = await open(fixture({ precheck: verdict([`has sender ${SENDER} enough ${FT} ?`], [], { [SENDER]: { [FT]: { forecast: -50 } } }) }))
  const s = await state(page, SENDER), rc = await state(page, RECEIVER)
  ok(s.red && !rc.red, 'sender red, receiver not', JSON.stringify({ s: s.red, r: rc.red }))
  ok(s.redChips.includes(`send:${FT}`), 'the token send chip is red', JSON.stringify(s.redChips))
  ok(/\bHeld\b/.test(s.pill), 'header says Held', s.pill)
  const d = await expand(page, SENDER)
  ok(/Not enough/.test(d.text) && /won't cover/.test(d.text), 'detail: "Not enough … won\'t cover what this account sends"', d.text.slice(0, 200))
  await page.close()
}

console.log('3. HBAR shortfall (fee payer)')
{
  const page = await open(fixture({ precheck: verdict([`has ${SENDER} sufficient hbar balance ?`], [], { [SENDER]: { hbar: { forecast: -1 } } }) }))
  const s = await state(page, SENDER)
  ok(s.red, 'sender card rings red')
  ok(s.redChips.some(k => k === 'send:tinybar'), 'the HBAR chip is red (precheck says hbar, chip is keyed tinybar)', JSON.stringify(s.redChips))
  const d = await expand(page, SENDER)
  ok(/Not enough [\d.,]* ?HBAR/i.test(d.text), 'detail names HBAR (with the amount off the chip)', d.text.slice(0, 200))
  await page.close()
}

console.log('4. receiver not associated — soft (has auto-association slots)')
{
  const page = await open(fixture({ precheck: verdict([`has receiver ${RECEIVER} associated ${FT} ?`]) }), { maxAutoAssoc: -1 })
  const rc = await state(page, RECEIVER), s = await state(page, SENDER)
  ok(rc.red && !s.red, 'RECEIVER card rings (it is their responsibility), sender does not', JSON.stringify({ r: rc.red, s: s.red }))
  ok(rc.dashedChips.includes(`receive:${FT}:soft`), 'the receive chip is DASHED red (may still land via a free slot)', JSON.stringify(rc.dashedChips))
  const d = await expand(page, RECEIVER)
  ok(/not associated/.test(d.text) && /may still land/.test(d.text), 'detail: not associated, may still land', d.text.slice(0, 220))
  await page.close()
}

console.log('5. receiver not associated — hard (no auto-association slots)')
{
  const page = await open(fixture({ precheck: verdict([`has receiver ${RECEIVER} associated ${FT} ?`]) }), { maxAutoAssoc: 0 })
  const rc = await state(page, RECEIVER)
  ok(rc.dashedChips.includes(`receive:${FT}:hard`), 'the receive chip is SOLID red (definite fail)', JSON.stringify(rc.dashedChips))
  const d = await expand(page, RECEIVER)
  ok(/no auto-association slots/.test(d.text) && /will fail/.test(d.text), 'detail: will fail until the account associates', d.text.slice(0, 220))
  await page.close()
}

console.log('6. clean precheck — nothing rings, header ready')
{
  const page = await open(fixture({ precheck: verdict([]) }))
  const s = await state(page, SENDER), rc = await state(page, RECEIVER)
  ok(!s.red && !rc.red && !s.redChips.length && !rc.dashedChips.length, 'no card and no chip is red', JSON.stringify({ s, rc }))
  ok(!/\bHeld\b/.test(s.pill), 'header does not say Held', s.pill)
  await page.close()
}

console.log('7. incomplete precheck — could not verify is not "will fail"')
{
  const v = verdict([], [`⚠️ could not fetch token relationship for ${SENDER} / ${FT} (timeout)`]); v.complete = false
  const page = await open(fixture({ precheck: v }))
  const s = await state(page, SENDER)
  ok(!s.red, 'sender card does NOT ring red on an unverified check')
  ok(!/\bHeld\b/.test(s.pill), 'header does not say Held', s.pill)
  await page.close()
}

console.log('8. window shut with nothing on chain')
{
  const page = await open(fixture({ expired: true, precheck: verdict([]) }))
  const s = await state(page, SENDER)
  ok(/Expired/.test(s.pill) && !/Ready to submit/.test(s.pill), 'header reads Expired, never Ready beside a dead clock', s.pill)
  await page.close()
}

// SIGNSETTLED1 (operator, 2026-09-17): the modal stays open, and is reopenable by URL, long
// after the transaction stops being live — so the glowing "this can still change" rings
// outlive what they were reporting on. The reported case: a card ringed red for "not enough
// KUSD" sitting under a green Success header, because the last precheck ran before submission
// and nothing re-runs it. Two settled treatments, and the contrast between them is the point,
// so both are pinned here: SUCCESS forces one dark green over every ring (consensus overrules
// the pre-flight guess); EXPIRED keeps each ring's own colour, darkened (nothing cleared, so
// the last thing we knew is still the best answer to "why did this never go through").
// each live colour taken down a notch (L x0.78, S x0.90, hue untouched) — see the rules in
// view.js. Dark enough to read as off, light enough that red is still red.
const DARK    = { green: 'rgb(60, 163, 61)', amber: 'rgb(199, 131, 19)', red: 'rgb(197, 38, 43)' }
const LIVE    = { amber: 'rgb(245, 166, 35)', red: 'rgb(229, 72, 77)' }
const NEUTRAL = 'rgb(228, 228, 231)'   // .txcard's own border — a card with no ring at all
// This fixture's signer rings AMBER (signatures outstanding) on a clean precheck and RED on a
// shortfall; the receiver has no obligation and never rings. That is enough to pin both rules,
// and the amber case is the sharper one — the same card must go dark-AMBER when the window
// shuts and dark-GREEN when the transaction lands. (A bright-green sign-ready card needs a
// fully-signed capture we do not have; it takes the identical rule to the amber one.)
const SHORT = [`has sender ${SENDER} enough ${FT} KUSD ? (-2.062561)`]

console.log('9. SUCCESS settles every ring dark green — even one that was red')
{
  // the exact reported shape: the tx LANDED, but the precheck captured before submission says
  // the sender was short. Consensus wins; that red ring must not survive it.
  const page = await open(fixture({ succeeded: true, precheck: verdict(SHORT) }))
  const s = await state(page, SENDER), rc = await state(page, RECEIVER)
  ok(/Success/.test(s.pill), 'header reads Success', s.pill)
  ok(s.settled === 'ok', 'body is in the settled-success mode', s.settled)
  ok(s.red, 'the card still CARRIES the live red class — the record is not rewritten', JSON.stringify(s.ring))
  ok(s.ring.border === DARK.green, '…but it PAINTS dark green, the same ink as the Success header', s.ring.border)
  ok(!s.ring.glows, 'and it does not glow: nothing here can change any more', s.ring.shadow)
  ok(s.ring.spread === 2, 'the ring fattens to 2px spread, paying back the weight the glow carried', s.ring.spread)
  ok(rc.ring.border === NEUTRAL && !rc.ring.glows, 'a card that never rang does not GAIN a ring on settling', rc.ring.border)
  await page.close()
}

console.log('9b. …and an amber "still waiting on signatures" ring goes green too')
{
  const page = await open(fixture({ succeeded: true, precheck: verdict([]) }))
  const s = await state(page, SENDER)
  ok(s.ring.border === DARK.green, 'signatures cannot have been outstanding if it reached consensus', s.ring.border)
  ok(!s.ring.glows, 'no glow', s.ring.shadow)
  await page.close()
}

console.log('10. EXPIRED puts the lights out but keeps each ring its own colour')
{
  const page = await open(fixture({ expired: true, precheck: verdict(SHORT) }))
  const s = await state(page, SENDER), rc = await state(page, RECEIVER)
  ok(s.settled === 'expired', 'body is in the settled-expired mode', s.settled)
  ok(s.ring.border === DARK.red, 'a red card stays RED, darkened — it is the likely reason, not a verdict', s.ring.border)
  ok(s.ring.border !== DARK.green, 'expired never flattens a red ring to green — that is the SUCCESS rule only', s.ring.border)
  ok(!s.ring.glows, 'but the glow is gone', s.ring.shadow)
  ok(s.ring.spread === 2, 'and fattens the same way success does', s.ring.spread)
  ok(rc.ring.border === NEUTRAL, 'an unringed card stays unringed', rc.ring.border)
  await page.close()
}

console.log('10b. …the same card, same clock, amber instead of red')
{
  const page = await open(fixture({ expired: true, precheck: verdict([]) }))
  const s = await state(page, SENDER)
  ok(s.ring.border === DARK.amber, 'amber stays AMBER, darkened — the signatures never arrived', s.ring.border)
  ok(!s.ring.glows, 'lights out', s.ring.shadow)
  ok(s.ring.border !== LIVE.amber, 'and it is not simply the live amber left on the screen', s.ring.border)
  await page.close()
}

console.log('11. a LIVE transaction still glows (the rings only settle when there is a result)')
{
  const page = await open(fixture({ precheck: verdict([`has sender ${SENDER} enough ${FT} KUSD ? (-2.062561)`]) }))
  const s = await state(page, SENDER)
  ok(s.settled === '', 'body carries neither settled class while the tx is open', s.settled)
  ok(s.ring.border === LIVE.red, 'the red ring is the live red, not a darkened one', s.ring.border)
  ok(s.ring.glows, 'and it glows — live status that can still change', s.ring.shadow)
  ok(s.ring.spread === 1, 'a live ring stays the thinner 1px spread', s.ring.spread)
  await page.close()
}

console.log('12. the key columns explain themselves (KEYCOLS1)')
{
  // Those five headings carry title tooltips, which a touch device never shows. The heading
  // row is now a button that opens the same text as a panel. Driven with real clicks, and
  // the card must survive them — the heading sits inside an expanded card whose own header
  // is a collapse toggle, so a stray bubble would shut the thing you are reading.
  const page = await open(fixture({ precheck: verdict([]) }), { senderKey: KEY_2OF3 })
  await (await page.$(`.txcard-head[data-acct="${SENDER}"]`)).click()   // expand the card
  await page.waitForTimeout(900)

  const read = () => page.evaluate(({ acct }) => {
    const card = document.querySelector(`.txcard-head[data-acct="${acct}"]`)?.closest('.txcard')
    const head = card?.querySelector('.txcard-keys-head')
    const panel = card?.querySelector('.txcard-keys-explain')
    const row = [...(card?.querySelectorAll('.txcard-keys-row') || [])].find(r => !r.classList.contains('txcard-keys-head'))
    const vis = el => !!el && getComputedStyle(el).display !== 'none'
    return {
      hasTable: !!head, cardOpen: !!card?.classList.contains('txcard--open'),
      expanded: head?.getAttribute('aria-expanded'), role: head?.getAttribute('role'),
      panelShown: vis(panel), panelText: (panel?.textContent || '').replace(/\s+/g, ' ').trim(),
      headings: [...(head?.children || [])].map(c => c.textContent),
      headCursor: head ? getComputedStyle(head).cursor : null,
      rowCursor: row ? getComputedStyle(row).cursor : null,
      rowSelect: row ? (getComputedStyle(row).userSelect || getComputedStyle(row).webkitUserSelect) : null,
      linkCursor: row?.querySelector('a') ? getComputedStyle(row.querySelector('a')).cursor : null,
      // KEYCOLS1 R2: the panel is prose and must not be the smallest text on the card.
      // Measured against the card's own body text rather than a hard number, so the rule
      // survives someone rescaling the card: the row is the key table's text, the xproof
      // line and the detail note are the muted body copy elsewhere in the same card.
      explainFont: panel ? parseFloat(getComputedStyle(panel).fontSize) : null,
      rowFont: row ? parseFloat(getComputedStyle(row).fontSize) : null
    }
  }, { acct: SENDER })

  let st = await read()
  ok(st.hasTable, 'the key table renders from the mirror key structure', JSON.stringify(st))
  ok(st.headings.join('|') === '✍️|🔑|⚖️|Redund|Ctrl', 'five headings, unchanged', st.headings)
  ok(!st.panelShown && st.expanded === 'false', 'the explainer starts closed', JSON.stringify({ p: st.panelShown, e: st.expanded }))
  ok(st.role === 'button', 'the heading row announces itself as a button', st.role)

  // CURSOR1: no I-beam anywhere in the table
  ok(st.rowCursor === 'default', 'a value row shows the arrow, not the I-beam', st.rowCursor)
  ok(st.rowSelect === 'none', 'and its values are not selectable', st.rowSelect)
  ok(st.headCursor === 'pointer', 'the heading row shows the hand — it is a button (and wins the cascade)', st.headCursor)
  ok(st.linkCursor === 'pointer', 'the key link keeps its own hand', st.linkCursor)

  // KEYCOLS1 R2: it shipped at 11px — smaller than everything else on the card
  ok(st.explainFont >= st.rowFont, 'the explainer is never smaller than the key rows it explains',
     JSON.stringify({ explain: st.explainFont, row: st.rowFont }))
  ok(st.explainFont >= 13, 'and clears the card\'s 12px body-text floor with room to spare', st.explainFont)

  await (await page.$('.txcard-keys-head')).click()
  await page.waitForTimeout(250)
  st = await read()
  ok(st.panelShown && st.expanded === 'true', 'tapping the headings opens the explainer', JSON.stringify({ p: st.panelShown, e: st.expanded }))
  ok(st.cardOpen, 'and does NOT collapse the card it lives in', st.cardOpen)
  for (const word of ['Banzhaf', 'Redundancy', 'Control', 'Signed yet', 'last 4 characters'])
    ok(st.panelText.includes(word), `the panel explains ${word}`, st.panelText.slice(0, 90))

  await (await page.$('.txcard-keys-head')).click()
  await page.waitForTimeout(250)
  st = await read()
  ok(!st.panelShown && st.expanded === 'false', 'tapping again closes it', JSON.stringify({ p: st.panelShown, e: st.expanded }))
  ok(st.cardOpen, 'card still open after both taps', st.cardOpen)
  await page.close()
}

console.log('13. every tooltip leads with ℹ️ (KPOOL-TIPLEAD1)')
{
  // A large mouse pointer covers the first characters of a native title tooltip, so every
  // title in the widget leads with ℹ️ + a zero-width space + spaces: the pointer covers
  // the disposable part instead of the first word. Asserted across EVERY element carrying a
  // title, because the failure mode is a new tooltip added later without the lead — and one
  // bare tooltip is exactly the one someone cannot read.
  const page = await open(fixture({ precheck: verdict([]) }), { senderKey: KEY_2OF3 })
  await (await page.$(`.txcard-head[data-acct="${SENDER}"]`)).click()
  await page.waitForTimeout(900)
  const tips = await page.evaluate(() =>
    [...document.querySelectorAll('[title]')]
      .map(el => ({
        title: el.getAttribute('title'),
        where: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')
      }))
      .filter(t => t.title && t.title.trim()))
  const bare = tips.filter(t => !t.title.startsWith('\u2139\uFE0F'))
  ok(tips.length > 0, 'the modal carries tooltips at all', tips.length)
  ok(bare.length === 0, 'every tooltip leads with the ℹ️ mark',
    bare.slice(0, 4).map(b => `${b.where} => ${JSON.stringify(b.title.slice(0, 40))}`).join('  |  '))
  ok(tips.every(t => !/^\u2139\uFE0F\u200B?\s*$/.test(t.title)), 'no tooltip is the lead and nothing else', 'a title had no text after the mark')
  await page.close()
}

await browser.close(); server.close()
console.log(`\n${total - failed}/${total} passed` + (failed ? ` — ${failed} FAILED` : ' — every "not enough" reaches the card'))
process.exit(failed ? 1 : 0)
