

window.__KBUILD_MONITOR_MANUAL__ = true

if (0) {  // not needed but left for ref in case rewiring connection to hapi
  const script = document.querySelector('script[data-hapi-base]')

  const HAPI_BASE = script?.dataset?.hapiBase

  console.log(script)
  window.__HAPI_BASE__ = HAPI_BASE
}

import { initBuildBanner } from "/vendor/kbuild-monitor.js"

const state = await initBuildBanner()

window.__BUILD_HASH__ = state?.workingHash || Date.now()

let appRoot = `./index.js?v=${window.__BUILD_HASH__}`

await import(appRoot)

