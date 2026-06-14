
    // -------------------------------------------------------------------------
    // LOW-LEVEL UTILS
    // -------------------------------------------------------------------------

    export function $(id) {
      return document.getElementById(id)
    }

    export function makeId() {
      return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    }

    export function cleanUrl(x) {
      return String(x || '').trim().replace(/\/$/, '')
    }

    export function canonicalJson(obj) {
      return JSON.stringify(obj)
    }



    export function hexToBytes(hex) {
      const clean = String(hex || '').trim()
      const pairs = clean.match(/.{1,2}/g) || []
      return Uint8Array.from(pairs.map(function(x) { return parseInt(x, 16) }))
    }

    export function bytesToHex(bytes) {
      return [...bytes].map(function(b) { return b.toString(16).padStart(2, '0') }).join('')
    }

    export function normaliseAssetId(asset) {
      return String(asset).toUpperCase() === 'HBAR' ? 'HBAR' : String(asset)
    }
    
    
    
    export function formatHost(url) {
      try { return new URL(url).host } catch { return String(url || '-') }
    }

    export function shortHash(x, n = 8) {
      x = String(x || '')
      return x.length > n ? x.slice(0, n) : x
    }

    export function shortKey(x) {
      x = String(x || '')
      return x.length > 12 ? `${x.slice(0, 8)}…${x.slice(-4)}` : x
    }
