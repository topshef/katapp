
// console.log('dev GH23454')

// if (globalThis.glog) {
  // console.log("glob glog is ", typeof globalThis)
// } else {
  // globalThis.glog = (() => {})
  // console.log('glog missing, fallback to noop / JE34432')
// }

// const glog = (typeof globalThis !== 'undefined' && globalThis.glog) || (() => {})


import "./buildInfo.js";    // 
import "./kwcCore.js";
import "./kwcUI.js";
