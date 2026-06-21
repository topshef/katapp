// -----------------------------------------------------------------------------
// dealPorts.browser.js — KEA (browser) implementation of the dealEngine ports.
//
// This is the browser twin of dealPorts.node.js. The SAME dealEngine.js consumes
// either one. It reuses KEA's existing primitives (kea-utils canonicalJson) and
// the @noble libs KEA already imports in kea-verify.js / kea-sign.js, so there is
// no new dependency surface.
//
// Usage in KEA (e.g. a new kea-deal.js, or inside kea-verify.js):
//
//     import { createDealEngine } from './dealEngine.js'   // see note on loading
//     import { browserPorts } from './dealPorts.browser.js'
//     const dealEngine = createDealEngine(browserPorts)
//     const result = await dealEngine.runChecks(input, policy)
//
// Loading dealEngine.js as an ES module: dealEngine is authored UMD, so it sets
// globalThis.DealEngine when loaded via <script>. For native `import`, add a
// one-line shim file dealEngine.esm.js:
//     import './dealEngine.js'; export const { createDealEngine, fillDeal, normaliseDeal } = globalThis.DealEngine
// and import from that. (Or wrap dealEngine's tail in an `export` during build.)
// -----------------------------------------------------------------------------

import { canonicalJson, hexToBytes } from './kea-utils.js'
import * as ed from 'https://esm.sh/@noble/ed25519@2.1.0'
import { sha512 } from 'https://esm.sh/@noble/hashes@1.4.0/sha512'
import { sha256 } from 'https://esm.sh/@noble/hashes@1.4.0/sha256'

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// MUST match the dealId producer (dealWrite.php: sha256(json_encode(deal))).
// KEA's canonicalJson is JSON.stringify, which agrees with PHP json_encode.
function hashJson(obj) {
  const bytes = new TextEncoder().encode(canonicalJson(obj))
  return bytesToHex(sha256(bytes))
}

async function verifyEd25519(sigBytes, msgBytes, pubBytes) {
  try { return await ed.verifyAsync(sigBytes, msgBytes, pubBytes) }
  catch { return false }
}

// Oracle replay from the browser (only if policy.allowApiReplay). Optional.
async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  return res.json()
}

// Trusted provider keys. In KEA these would live alongside watches/rules,
// editable in the UI ("trusted oracles"), persisted in localStorage / secure
// storage. { providerId: pubkeyHex }
function loadTrustedKeys() {
  try { return JSON.parse(localStorage.keaTrustedOracleKeys || '{}') } catch { return {} }
}

export const browserPorts = {
  log: (obj, label) => console.debug(label || 'dealEngine', obj),
  now: () => Date.now(),
  canonicalJson,
  hashJson,
  verifyEd25519,
  fetchJson,
  get trustedKeys() { return loadTrustedKeys() },
  conditionRegistry: {} // KEA-only pure conditions can be registered here
}
