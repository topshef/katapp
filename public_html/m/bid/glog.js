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

  const location = getCallerLocation()

  buckets[bucket].push({ args, location })

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

    entries.forEach(({ args, location }) => {
      console.log(...args, `\n📍 ${location}`)
    })

    console.groupEnd()
  })

  for (const key in buckets) delete buckets[key]
}

function getCallerLocation() {
  const stack = new Error().stack?.split('\n') || []

  // find first stack entry NOT in glog.js
  const caller = stack.find(line =>
    line.includes('.js') &&
    !line.includes('glog.js')
  )

  return caller?.trim() || ''
}

