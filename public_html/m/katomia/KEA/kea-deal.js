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
  const url = `${baseUrl}/kpool/deal?dealId=${encodeURIComponent(dealId)}`
  console.debug('[kea-deal] fetching deal template', { dealId, url })

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Deal fetch failed: ${res.status} ${res.statusText}`)

  const template = await res.json()

  // Content-address verification: sha256(canonical(template)) must === dealId.
  const computed = browserPorts.hashJson(template)
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

export async function runDealChecks(kea, dealEntry) {
  const pchBasis = kea?.execution?.pchBasis
  // The engine accepts pchBasis directly — toCanonicalTransfers handles both
  // the deal shape (addHbarTransfer etc.) and the KEA pchBasis shape
  // (transfers.hbarTransfers etc.).

  const input = {
    dealTemplate:   dealEntry.template,
    claimedDealId:  dealEntry.dealId,
    pchBasis:       pchBasis || null,
    // Bindings: the backend may supply these in the approval package. If not,
    // the engine runs with empty bindings — replay will be incomplete but
    // conditions and scope checks still run.
    bindings:       kea?.deal?.bindings || {},
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
