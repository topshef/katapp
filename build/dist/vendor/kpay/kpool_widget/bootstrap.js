

window.__KBUILD_MONITOR_MANUAL__ = true

if (0) {  // not needed but left for ref in case rewiring connection to hapi
  const script = document.querySelector('script[data-hapi-base]')

  const HAPI_BASE = script?.dataset?.hapiBase

  console.log(script)
  window.__HAPI_BASE__ = HAPI_BASE
}

// STATIC BUILD (SIGNPAGE-KBM2): no /build.php here and the bundle is immutable per
// deploy, so the boot never waits on build diagnostics and the cache-bust is stable.
// The live PHP site keeps the original kbuild-monitor behaviour.
window.__BUILD_HASH__ = "dc1b397"

let appRoot = `./index.js?v=${window.__BUILD_HASH__}`

await import(appRoot)

