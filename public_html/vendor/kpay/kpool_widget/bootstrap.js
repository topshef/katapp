

window.__KBUILD_MONITOR_MANUAL__ = true


// const script = document.currentScript
const script = document.querySelector('script[data-hapi-base]')

const HAPI_BASE = script?.dataset?.hapiBase

console.log(script)
window.__HAPI_BASE__ = HAPI_BASE


import { initBuildBanner } from "/vendor/kbuild-monitor.js"

const state = await initBuildBanner()

let appRoot = "./index.js"
if (state?.workingHash)
  appRoot += `?v=${state.workingHash}`

await import(appRoot)

