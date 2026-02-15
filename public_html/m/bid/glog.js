// ┌─┐┬─┐┌─┐┬ ┬┌─┐  ┬  ┌─┐┌─┐┌─┐┬┌┐┌┌─┐
// │ ┬├┬┘│ ││ │├─┘  │  │ ││ ┬│ ┬│││││ ┬
// └─┘┴└─└─┘└─┘┴    ┴─┘└─┘└─┘└─┘┴┘└┘└─┘
// group logging

//v0.11 nested groups
//v0.1 initial version at m/bid

const IDLE_TIMEOUT = 3000
let idleTimer

const buckets = {}

function glogStart(bucket, ...args) {
  flushGlogs()
  glog(bucket, ...args)
}

function glogEnd(bucket, ...args) {
  glog(bucket, ...args)
  flushGlogs()
}

function glog(bucketPath, ...args) {
  const levels = parsePath(bucketPath)
  const entry = {
    args,
    location: getCallerLocation()
  }

  insertEntry(levels, entry)

  clearTimeout(idleTimer)
  idleTimer = setTimeout(flushGlogs, IDLE_TIMEOUT)
}


function parsePath(bucketPath) {
  return bucketPath.includes('|')
    ? bucketPath.split('|').map(s => s.trim())
    : [bucketPath]
}


function insertEntry(levels, entry) {
  let node = buckets

  levels.forEach((level, i) => {
    if (!node[level])
      node[level] = { entries: [], children: {} }

    if (i === levels.length - 1)
      node[level].entries.push(entry)

    node = node[level].children
  })
}

function flushGlogs() {
  clearTimeout(idleTimer)

  for (const name in buckets)
    flushNode(buckets[name], name)

  for (const key in buckets)
    delete buckets[key]
}

function flushNode(node, label) {
  const total = node.entries.length

  // console.groupCollapsed(`${total}x ${label}`)
	const script = node.entries[0]?.location || ''
	const suffix = script ? ` (${script})` : ''
	console.groupCollapsed(`${total}x ${label}${suffix}`)

  node.entries.forEach(({ args, location }) => {
    console.log(...args, `\n📍 ${location}`)
  })

  for (const childName in node.children)
    flushNode(node.children[childName], childName)

  console.groupEnd()
}

function getCallerLocation() {
  const stack = new Error().stack?.split('\n') || []

  const caller = stack.find(line =>
    line.includes('.js') &&
    !line.includes('glog.js')
  )

  if (!caller) return ''

  // extract filename without line/column/query
  const match = caller.match(/\/([^\/]+\.js)(?:\?|:)/)

  return match ? match[1] : ''
}



