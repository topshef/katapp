
// import { getData } from './localCacheDB.module.js'
// window.getData = getData

import * as Kache from './localCacheDB.module.js'

const moduleUrl = import.meta.url

const script = [...document.scripts].find(
  s => s.src === moduleUrl
)
console.log({moduleUrl, script})

const flatMode = script?.hasAttribute('data-global')
const namespace = script?.dataset?.namespace


if (flatMode) {
  Object.assign(window, Kache)
} else {
  const name = namespace || 'Kache'
  window[name] = Kache
}
