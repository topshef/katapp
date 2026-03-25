
if (globalThis.glog) {
  console.log("gobal glog is ", typeof globalThis)
} else {
  globalThis.glog = (() => {})
  console.log('glog missing, fallback to noop / JE34432')
}

// const glog = (typeof globalThis !== 'undefined' && globalThis.glog) || (() => {})


import "./buildInfo.js";    // 
import "./transactionHandler.js";
import "./dealPage.js";
