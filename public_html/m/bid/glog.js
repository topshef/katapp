// ┌─┐┬─┐┌─┐┬ ┬┌─┐  ┬  ┌─┐┌─┐┌─┐┬┌┐┌┌─┐
// │ ┬├┬┘│ ││ │├─┘  │  │ ││ ┬│ ┬│││││ ┬
// └─┘┴└─└─┘└─┘┴    ┴─┘└─┘└─┘└─┘┴┘└┘└─┘
// group logging

//v0.11 nested groups
//v0.1 initial version at m/bid

const IDLE_TIMEOUT = 3000
let idleTimer


const isChrome =
  typeof window !== 'undefined' &&
  !!window.chrome &&
  navigator.userAgent.includes('Chrome') &&
  !navigator.userAgent.includes('Edg')


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


function countEntries(node) {
  let count = node.entries.length

  for (const childName in node.children)
    count += countEntries(node.children[childName])

  return count
}

function flushNode(node, label) {
	const total = countEntries(node)

	const script =
		node.entries[0]?.location ||
		Object.values(node.children)[0]?.entries[0]?.location ||
		'unknown error TG39874'

	const hasChildren = Object.keys(node.children).length > 0

	// Chrome DevTools quirk: collapsing structural parents causes inert child headers.
	// Only apply structural auto-open workaround in Chrome.
	// Edge handles nested collapse correctly.
	const shouldCollapse =
		!hasChildren || !isChrome

	const groupFn = shouldCollapse
		? console.groupCollapsed
		: console.group

	groupFn(
		`%c${script} %c${label} %c${total}x`,
		'font-weight: normal; color: #888; opacity: 0.7;',
		'font-weight: bold;',
		'font-weight: normal; color: #888; opacity: 0.7;'
	)


  node.entries.forEach(({ args, location }) => {
    console.log(...args, `\n📍 ${location}`)
  })

  for (const childName in node.children)
    flushNode(node.children[childName], childName)

  // console.groupEnd()
	safeGroupEnd()
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

function safeGroupEnd() {  //probably redundant whilst chasing chrome bug
  try { console.groupEnd() } catch (e) { console.warn('groupEnd failed', e) }
}





