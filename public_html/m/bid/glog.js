// ┌─┐┬─┐┌─┐┬ ┬┌─┐  ┬  ┌─┐┌─┐┌─┐┬┌┐┌┌─┐
// │ ┬├┬┘│ ││ │├─┘  │  │ ││ ┬│ ┬│││││ ┬
// └─┘┴└─└─┘└─┘┴    ┴─┘└─┘└─┘└─┘┴┘└┘└─┘
// group logging

//v0.1 initial version at m/bid

const IDLE_TIMEOUT = 3000
let idleTimer

const buckets = {}

function glog(bucket, ...args) {
  if (!buckets[bucket]) buckets[bucket] = []
  buckets[bucket].push(args)

  clearTimeout(idleTimer)
  idleTimer = setTimeout(flushGlogs, IDLE_TIMEOUT)
}

function glogStart(bucket, ...args) {
  flushGlogs()
  glog(bucket, ...args)
}

function glogEnd(bucket, ...args) {
  glog(bucket, ...args)
  flushGlogs()
}

function flushGlogs() {
  clearTimeout(idleTimer)

  Object.entries(buckets).forEach(([bucket, entries]) => {
    console.groupCollapsed(`${entries.length}x ${bucket}`)
    entries.forEach(args => console.log(...args))
    console.groupEnd()
  })

  for (const key in buckets) delete buckets[key]
}