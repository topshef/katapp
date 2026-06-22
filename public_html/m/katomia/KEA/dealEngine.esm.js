// ESM shim: dealEngine.js is UMD, so importing it sets globalThis.DealEngine.
// Re-export the public surface as named ES exports for KEA's module graph.
import './dealEngine.js'
export const { createDealEngine, fillDeal, normaliseDeal, compareTransfersExact, compareTransfersNetting, toCanonicalTransfers, runConditions } = globalThis.DealEngine
