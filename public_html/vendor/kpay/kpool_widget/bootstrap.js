

window.__KBUILD_MONITOR_MANUAL__ = true

import { initBuildBanner } from "/vendor/kbuild-monitor.js"

const state = await initBuildBanner()

let appRoot = "./index.js"
if (state?.workingHash)
  appRoot += `?v=${state.workingHash}`

await import(appRoot)

