import * as GlogModule from './glog.module.js'

const moduleUrl = import.meta.url

const script = [...document.scripts].find(
  s => s.src === moduleUrl
)

const flatMode = script?.hasAttribute('data-global')
const namespace = script?.dataset?.namespace

if (flatMode) {
  Object.assign(window, GlogModule)
} else {
  const name = namespace || 'Glog'
  window[name] = GlogModule
}
