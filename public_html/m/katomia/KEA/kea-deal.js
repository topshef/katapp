// -----------------------------------------------------------------------------
// kea-deal.js — deal template cache + verification bridge for KEA.
//
// Wires the portable dealEngine into the KEA check pipeline. When a rule's query
// includes a `dealId`, KEA:
//   1. fetches the deal template (a JSON document) from the KPool API,
//   2. verifies that sha256(canonical(template)) === dealId  (content-addressed),
//   3. caches the verified template in localStorage (keyed by dealId), and
//   4. on every incoming transaction, runs dealEngine.runChecks against the
//      pchBasis transfers from the KEA approval package.
//
// The deal engine runs the full pipeline: claimed-deal, dealId hash, template
// replay, transfer comparison, conditions, oracles, and scope. For simple deals
// (no API bindings, no oracles), the condition and transfer checks are the ones
// that do real work. Oracle/api checks produce 'onhold' / 'skip' when not wired
// — the engine never silently passes.
//
// STUB: the deal-template fetch URL is currently `${baseUrl}/kpool/deal?dealId=…`
// — adjust when the endpoint is confirmed. The backend may not serve this yet;
// fetch failures are reported cleanly and the rule still works for intent-sig
// checks if orderPubkey is also in the query.
// -----------------------------------------------------------------------------

import { createDealEngine } from './dealEngine.esm.js'
import { browserPorts }     from './dealPorts.browser.js'

const engine = createDealEngine(browserPorts)

// ── deal template cache (localStorage, keyed by verified dealId) ──────────

const CACHE_PREFIX = 'keaDeal:'

export function getCachedDeal(dealId) {
  if (!dealId) return null
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + dealId)
    if (!raw) return null
    const entry = JSON.parse(raw)
    // Quick integrity check: the stored hash must still match the dealId.
    if (entry.dealId !== dealId) return null
    return entry // { dealId, template, fetchedAt }
  } catch { return null }
}

function cacheDeal(dealId, template) {
  const entry = { dealId, template, fetchedAt: Date.now() }
  try { localStorage.setItem(CACHE_PREFIX + dealId, JSON.stringify(entry)) }
  catch (e) { console.warn('[kea-deal] cache write failed', e) }
  return entry
}

export function clearDealCache(dealId) {
  if (dealId) localStorage.removeItem(CACHE_PREFIX + dealId)
}

// ── fetch + verify ────────────────────────────────────────────────────────
//
// Fetches the deal template from the KPool API, hashes it, and verifies the
// hash matches `dealId`. On success, caches and returns the entry. On failure,
// throws with a descriptive message.
//
// STUB: the endpoint path is a best-guess convention. Adjust the URL pattern
// once the backend endpoint is confirmed. The backend must return canonical
// JSON so sha256(response body) === dealId.

export async function fetchAndVerifyDeal(dealId, baseUrl) {
  if (!dealId) throw new Error('No dealId to fetch')

  // STUB: endpoint path — adjust when confirmed.
  // const url = `${baseUrl}/kpool/deal?dealId=${encodeURIComponent(dealId)}`  // todo add wrapper to backend ahead of migrating deals
  const url = `https://kpos.uk/deal/query/?dealId=${encodeURIComponent(dealId)}`
  console.debug('[kea-deal] fetching deal template', { dealId, url })

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Deal fetch failed: ${res.status} ${res.statusText}`)

  const template = await res.json()

  // Content-address verification: sha256(canonical(template)) must === dealId.
  const basis = template.deal
  const computed = browserPorts.hashJson(basis)
  if (computed !== dealId) {
    throw new Error(`Deal hash mismatch: expected ${dealId}, got ${computed}`)
  }

  console.debug('[kea-deal] deal verified + cached', { dealId })
  return cacheDeal(dealId, template)
}

// ── run deal checks against an incoming KEA approval package ──────────────
//
// Called from the verification pipeline when the rule's query includes a dealId.
// `kea` is the approval package as returned by txRead?detail=1; `dealEntry` is
// the { dealId, template } object from the cache.
//
// The engine receives pchBasis as the actual-transfers source (it already
// handles the KEA pchBasis transfer shape: hbarTransfers, tokenTransfers,
// nftTransfers). Bindings are extracted from the approval package if the
// backend supplies them; otherwise the template is run with empty bindings
// (conditions still fire; transfer replay will skip/fail rather than silently
// pass — the engine never auto-passes an incomplete pipeline).
//
// Returns the engine's { verdict, checks, summary, … } object directly.

// ── infer bindings from actual transfers ──────────────────────────────────
//
// FALLBACK. Eventually the backend should supply bindings directly, or the
// deal format should evolve to support binding-free shape comparison. This
// reverse-matching approach is a pragmatic first pass — it extracts variable
// values by matching the template's transfer lines against the actual pchBasis
// transfers (by tokenId and amount direction). It's good enough to run
// conditions (e.g. "usd_amount LT 10000000") even when nobody supplies the
// bindings explicitly.
//
// Limitations:
//   - Picks the largest-magnitude match per template line, so rounding dust
//     from N-party clearing doesn't confuse the assignment.
//   - If two template lines use the same tokenId in the same direction, the
//     second one may get a different (smaller) match — ambiguous in general.
//   - Amounts are the actual transaction amounts, not the full-order amounts.
//     For partial fills these differ from what the full deal would produce, so
//     the "transfers" exact comparison will likely fail. The "conditions" check
//     still runs against the real values, which is what Sally cares about.

function inferBindings(dealTemplate, pchBasis) {
  const bindings = {}
  if (!dealTemplate || !pchBasis) return bindings

  const transfers = pchBasis?.transfers || pchBasis
  const actual = []

  // Flatten pchBasis into [{tokenId, accountId, amount}] for matching.
  for (const t of (transfers.tokenTransfers || []))
    actual.push({ tokenId: t.tokenId, accountId: t.accountId, amount: Number(t.amount), used: false })
  for (const t of (transfers.hbarTransfers || []))
    actual.push({ tokenId: 'HBAR', accountId: t.accountId, amount: Number(t.amount), used: false })

  // Resolve aliases from the deal template (e.g. KBRL -> 0.0.2340890).
  const alias = dealTemplate.alias || dealTemplate.constants || {}

  function resolveTokenId(raw) {
    if (alias[raw]) return alias[raw]
    return raw
  }

  // For each template transfer line, find the best actual match by tokenId and
  // amount sign. "Best" = largest absolute amount (skip dust).
  const templateLines = dealTemplate.addTokenTransfer || []
  for (const tpl of templateLines) {
    const tokenId = resolveTokenId(tpl.tokenId)
    const valueStr = String(tpl.value || '')
    const isNegative = valueStr.startsWith('-')

    // Find unmatched actual transfers with the same tokenId and same sign.
    const candidates = actual.filter(function(a) {
      if (a.used || a.tokenId !== tokenId) return false
      return isNegative ? a.amount < 0 : a.amount > 0
    })

    // Pick the largest absolute amount (primary counterparty, not dust).
    candidates.sort(function(a, b) { return Math.abs(b.amount) - Math.abs(a.amount) })
    const match = candidates[0]
    if (!match) continue
    match.used = true

    // Extract the account ID variable (first match wins — don't overwrite a
    // value already inferred from an earlier template line).
    const acctVar = (tpl.accountId || '').match(/^\{(.+)\}$/)
    if (acctVar && !(acctVar[1] in bindings)) bindings[acctVar[1]] = match.accountId

    // Extract the amount variable. The value might be "-{brl_amount}" or
    // "{usd_amount}" — strip the sign and braces to get the variable name.
    // First-match wins so the sender's amount (which is exact) takes priority
    // over the receiver's (which may differ by rounding dust in N-party fills).
    const amtMatch = valueStr.match(/\{(.+)\}/)
    if (amtMatch && !(amtMatch[1] in bindings)) bindings[amtMatch[1]] = String(Math.abs(match.amount))
  }

  return bindings
}

// Convert pchBasis (KEA format) to deal format so the engine's exact
// comparator can see the transfers. Without this, compareTransfersExact
// looks for actual.addTokenTransfer (deal keys) but finds nothing because
// pchBasis uses transfers.tokenTransfers (KEA keys).
function pchBasisToDealFormat(pchBasis) {
  if (!pchBasis) return null
  const t = pchBasis.transfers || pchBasis
  return {
    addHbarTransfer: (t.hbarTransfers || []).map(function(x) {
      return { accountId: x.accountId, value: Number(x.amount) }
    }),
    addTokenTransfer: (t.tokenTransfers || []).map(function(x) {
      return { tokenId: x.tokenId, accountId: x.accountId, value: Number(x.amount) }
    }),
    addNftTransfer: (t.nftTransfers || []).map(function(x) {
      return { tokenId: x.tokenId, sender: x.senderAccountId, receiver: x.receiverAccountId, serial: x.serialNumber }
    })
  }
}

export async function runDealChecks(kea, dealEntry) {
  const pchBasis = kea?.execution?.pchBasis
  // The engine accepts pchBasis directly — toCanonicalTransfers handles both
  // the deal shape (addHbarTransfer etc.) and the KEA pchBasis shape
  // (transfers.hbarTransfers etc.).

  // dealEntry.template is the full API response ({ dealId, domain, deal, ... }).
  // The engine needs the INNER deal object — the same thing we hashed at save
  // time (template.deal). Passing the wrapper would hash the wrong object.
  const dealTemplate = dealEntry.template?.deal || dealEntry.template

  // If the backend doesn't supply bindings, infer them from the actual
  // transfers. See the comment block above inferBindings for limitations.
  const suppliedBindings = kea?.deal?.bindings || {}
  const hasSupplied = Object.keys(suppliedBindings).length > 0
  const inferred = hasSupplied ? {} : inferBindings(dealTemplate, pchBasis)
  const bindings = hasSupplied ? suppliedBindings : inferred

  // The engine's exact comparator expects both sides in deal format
  // (addTokenTransfer etc.), but pchBasis uses KEA format (transfers.
  // tokenTransfers etc.). Convert so the comparison sees the data.
  const actualTransfers = pchBasisToDealFormat(pchBasis)

  const input = {
    dealTemplate:   dealTemplate,
    claimedDealId:  dealEntry.dealId,
    actualTransfers: actualTransfers,
    pchBasis:       pchBasis || null,
    bindings:       bindings,
    buyerAccountId: kea?.deal?.buyerAccountId || null,
    promises:       kea?.deal?.promises || [],
    transaction:    kea?.transaction || {}
  }

  const result = await engine.runChecks(input, {
    // Default to exact comparison for deal-policy checks.
    mode: 'exact'
    // STUB: noisy mode. In future, a quiet/noisy toggle on the rule could be
    // passed here as `filter: 'quiet'` to discard non-matching transactions
    // before they reach the UI. For now, every transaction is shown and
    // checked — the user sees passes and failures alike.
  })

  return result
}

// Re-export the engine for debug / advanced usage.
export { engine }