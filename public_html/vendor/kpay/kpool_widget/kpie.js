// kpie.js — standalone threshold pie chart widget
// Replaces iframe-based ksig_pie_widget.php
//
// Usage:
//   <script src="kpie.js"></script>
//   await window.kpie.render(containerEl, { keyInfo, signedPubkeys })

;(function(global) {
  'use strict'

  // keynorm.js is the canonical normalizer shared by model.js + view.js (SIGN-NORM1).
  // kpie is a STANDALONE, dependency-free widget (classic <script>, not an ES module),
  // so it can't import keynorm.js without losing that drop-in property — it keeps this
  // local copy by design. In practice view.js feeds kpie an already-normalized tree +
  // signedPubkeys (see view.js renderAccountKeyInfo), so this is only a defensive
  // idempotent second pass. Keep these prefixes in sync with keynorm.KEY_PREFIXES.
  const KEY_DER_PREFIXES = [
    '302a300506032b6570032100',                          // ED25519
    '302d300706052b8104000a032200',                      // ECDSA secp256k1 DER
    '3036301006072a8648ce3d020106052b8104000a032200',    // ECDSA secp256k1 SPKI
  ]

  function normalizeKey(key) {
    if (!key) return key
    let k = String(key).toLowerCase()
    for (const p of KEY_DER_PREFIXES) if (k.startsWith(p)) { k = k.slice(p.length); break }
    return k
  }

  // ── Dependency loading ──────────────────────────────────────────────────────

  let _depsPromise = null

  function loadDeps() {
    if (_depsPromise) return _depsPromise
    _depsPromise = (async () => {
      await loadScript('https://cdn.amcharts.com/lib/5/index.js')
      await loadScript('https://cdn.amcharts.com/lib/5/percent.js')
      await loadScript('https://cdn.amcharts.com/lib/5/themes/Animated.js')
      if (!global.d3)
        await loadScript('https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js')
    })()
    return _depsPromise
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script')
      s.src = src
      s.onload = resolve
      s.onerror = () => reject(new Error('[kpie] failed to load: ' + src))
      document.head.appendChild(s)
    })
  }

  // ── Key tree → graph ────────────────────────────────────────────────────────

  function convertKeyTreeToGraph(keyNode, path = 'root') {
    if (!keyNode) return { name: path, threshold: 1, keyCount: 0, keyLeaves: [], children: [] }

    if (typeof keyNode === 'string') return {
      name: path,
      threshold: 1,
      keyCount: 1,
      keyLeaves: [keyNode],
      children: []
    }

    const result = {
      name: path,
      // a Hedera KeyList has threshold null/absent = ALL must sign, not 1-of-n
      threshold: keyNode.threshold ?? (keyNode.keys?.length || 1),
      keyCount: keyNode.keys?.length ?? 0,
      keyLeaves: [],
      children: []
    }

    ;(keyNode.keys || []).forEach((child, i) => {
      const childPath = `${path}_${i + 1}`
      // any node with a keys[] array is a GROUP (threshold OR keyList — a keyList's
      // threshold is null, the old `child.threshold` truthy check dropped those into
      // keyLeaves as objects and crashed normalizeKey downstream)
      if (child && typeof child === 'object' && Array.isArray(child.keys))
        result.children.push(convertKeyTreeToGraph(child, childPath))
      else if (child && typeof child === 'object')
        // raw leaf shapes ({ _type, key } / { ed25519 } / { ECDSASecp256k1 }) → string
        result.keyLeaves.push(String(child.key ?? child.ed25519 ?? child.ECDSASecp256k1 ?? ''))
      else if (child)
        result.keyLeaves.push(child)
    })

    return result
  }

  function updateSigningStatus(keyGraph, signedPublicKeys = []) {
    const normalizedSigned = signedPublicKeys.map(normalizeKey)
    let keyCountSigned = 0

    ;(keyGraph.children || []).forEach(child => {
      updateSigningStatus(child, signedPublicKeys)
      if (child.isThresholdMet) keyCountSigned++
    })

    ;(keyGraph.keyLeaves || []).forEach(leaf => {
      if (normalizedSigned.includes(normalizeKey(leaf))) keyCountSigned++
    })

    keyGraph.keyCountSigned = keyCountSigned
    keyGraph.isThresholdMet = keyCountSigned >= keyGraph.threshold
  }

  // ── amCharts pie ────────────────────────────────────────────────────────────

  // unique id counter to avoid amcharts div collisions across multiple widgets
  let _chartSeq = 0

  function createThresholdPieChart(thresholdData, signedStatusData, divId, pieRadius, neutral = false) {
    const root = am5.Root.new(divId)
    root.setThemes([am5themes_Animated.new(root)])
    // root._renderer.resolution = 10
    root._renderer.resolution = Math.ceil(window.devicePixelRatio || 2)
    //root.container.setAll({ paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 })

    const bgColor = root.interfaceColors.get('background')

    const chart = root.container.children.push(am5percent.PieChart.new(root, {
      layout: root.verticalLayout,
      x: am5.percent(50),
      y: am5.percent(50),
      centerX: am5.percent(50),
      centerY: am5.percent(50),
      width: pieRadius * 2,
      height: pieRadius * 2,
      innerRadius: 0,
      radius: pieRadius
    }))

    // inner ring — threshold proportion
    const seriesThreshold = chart.series.push(am5percent.PieSeries.new(root, {
      valueField: 'weight',
      categoryField: 'category',
      innerRadius: am5.percent(0),
      radius: am5.percent(60)
    }))
    seriesThreshold.data.setAll(thresholdData)
    seriesThreshold.slices.template.setAll({ stroke: bgColor, strokeWidth: 1, tooltip: null, tooltipText: '' })
    seriesThreshold.slices.template.states.create('hover', { shiftRadius: 0, scale: 1 })
    seriesThreshold.slices.template.states.create('active', { shiftRadius: 0, scale: 1 })
    seriesThreshold.events.on('datavalidated', () => {
      seriesThreshold.slices.each(slice => {
        const color = slice.dataItem.dataContext.category === 'Threshold needed' ? 0x000000 : 0xD9D9D9
        slice.set('fill', am5.color(color))
      })
    })
    seriesThreshold.labels.template.setAll({ forceHidden: true })
    seriesThreshold.ticks.template.setAll({ forceHidden: true })

    // outer ring — per-key signed status
    const seriesSigned = chart.series.push(am5percent.PieSeries.new(root, {
      valueField: 'weight',
      categoryField: 'publicKey',
      innerRadius: am5.percent(50)
    }))
    seriesSigned.data.setAll(signedStatusData)
    seriesSigned.slices.template.setAll({ stroke: bgColor, strokeWidth: 1, tooltip: null, tooltipText: '' })
    seriesSigned.slices.template.states.create('hover', { shiftRadius: 0, scale: 1 })
    seriesSigned.slices.template.states.create('active', { shiftRadius: 0, scale: 1 })
    seriesSigned.events.on('datavalidated', () => {
      seriesSigned.slices.each(slice => {
        const v = slice.dataItem.dataContext.isSigned
        // neutral (account shown for reference, no signature needed): drop the
        // green/orange signing semantics — two-tone gray keeps the key structure
        // readable without implying anything is pending.
        const color = neutral
          ? (v === 1 ? 0xa1a1aa : v === 0 ? 0xdadade : 0xF0F0F0)
          : (v === 1 ? 0x56c857 : v === 0 ? 0xf5a623 : 0xF0F0F0)
        slice.set('fill', am5.color(color))
      })
    })
    seriesSigned.labels.template.setAll({ forceHidden: true })
    seriesSigned.ticks.template.setAll({ forceHidden: true })

    seriesThreshold.appear(1000, 100)
    seriesSigned.appear(1000, 100)
  }

  // ── D3 tree layout ──────────────────────────────────────────────────────────

  // KPIE-SCALE1 v2: FAMILY-TREE layout replacing the old radial cluster. The radial
  // form needed a parent ring to say who the parent was and its connectors overcut the
  // circle; a top-down tidy tree (d3.tree = Reingold–Tilford — deterministic, compact,
  // no physics jitter) makes hierarchy positional: the parent sits ABOVE, children hang
  // below, so the ring is gone entirely. Connector lines are trimmed to each pie's rim
  // (no overcut). Everything is computed in real CSS pixels and the SVG gets explicit
  // px width/height (no viewBox/meet scaling), so the lines and the amCharts divs can
  // never disagree again (the lifted-pies bug class is structurally gone). The root pie
  // renders slightly larger than its children — another "this is the parent" cue.
  // Sizing: width is the budget (set by the caller from tree complexity, up to full
  // detail width on desktop); pies shrink as the widest generation grows, floored for
  // legibility; height follows generation count and is set here.
  function drawTree(jsonData, container, neutral = false) {
    container.innerHTML = ''
    container.style.position = 'relative'
    container.style.overflow = 'visible'

    const rect = container.getBoundingClientRect()
    const budget = rect.width || 220

    // tidy tree in unit coordinates: 1 unit sibling gap, wider gap between subtrees
    const root = d3.hierarchy(jsonData)
    d3.tree().nodeSize([1, 1]).separation((a, b) => a.parent === b.parent ? 1 : 1.3)(root)

    const nodes = root.descendants()
    const xs = nodes.map(d => d.x)
    const minX = Math.min(...xs)
    const unitsW = (Math.max(...xs) - minX) || 1

    // px per sibling-unit from the width budget; pie ~72% of a unit so neighbours never
    // touch. Floor 14px (below that the m-of-n wedges are unreadable anyway), cap 56px.
    const pxPerUnit = budget / (unitsW + 1)
    const pieCssSize = Math.max(14, Math.min(56, Math.round(pxPerUnit * 0.72)))
    // parent cue: bigger than its children, and never below 28px — the root's m-of-n is
    // the single most important wedge on the chart, it stays readable even when a wide
    // council squeezes the children to the floor.
    const rootPieSize = Math.min(64, Math.max(28, Math.round(pieCssSize * 1.25)))
    const levelGap = Math.round(pieCssSize * 1.9)
    const pad = Math.round(rootPieSize / 2) + 4

    const sizeOf = d => d.depth === 0 ? rootPieSize : pieCssSize
    const boxW = Math.max(budget, Math.round(unitsW * pxPerUnit) + pad * 2)
    // top pad clears the root's radius; bottom needs the deepest generation's radius
    const boxH = (root.height * levelGap) + pad + pieCssSize / 2 + 4
    const cx = d => Math.round((d.x - minX) * pxPerUnit) + pad
    const cy = d => d.depth * levelGap + pad

    container.style.height = Math.round(boxH) + 'px'

    // SVG in the same pixel space as the divs — connector lines only, trimmed to rims
    const svg = d3.select(container)
      .append('svg')
      .attr('width', boxW).attr('height', Math.round(boxH))
      .style('position', 'absolute')
      .style('top', '0').style('left', '0')
      .style('overflow', 'visible')

    // Org-chart ELBOW connectors: parent bottom → down to a rail midway between the
    // generations → along the rail → down into the child's top. Straight point-to-point
    // lines went nearly horizontal on wide fans and cut THROUGH sibling pies; elbows
    // only ever travel in clear lanes, and they read as a family tree (per user). Ends
    // stop at the pies' rims (no overcut).
    svg.selectAll('.kpie-link')
      .data(root.links())
      .join('path')
      .attr('class', 'kpie-link')
      .attr('d', d => {
        const x1 = cx(d.source), y1 = cy(d.source) + sizeOf(d.source) / 2 + 1
        const x2 = cx(d.target), y2 = cy(d.target) - sizeOf(d.target) / 2 - 1
        const rail = cy(d.source) + levelGap / 2
        return `M${x1},${y1} V${rail} H${x2} V${y2}`
      })
      .attr('fill', 'none')
      .attr('stroke', '#ccc')
      .attr('stroke-width', 1.5)

    // (the old parent ring is deliberately gone — position now carries the hierarchy;
    // if a cue is ever wanted back, a THIN circle at r=sizeOf(root)/2+3 here would do)

    // Absolutely-positioned divs for amCharts — same pixel space as the SVG
    const seq = ++_chartSeq
    nodes.forEach(d => {
      const s = sizeOf(d)
      const divId = `kpie_c_${d.data.name}_${seq}`
      const div = document.createElement('div')
      div.id = divId
      div.style.cssText = [
        'position:absolute',
        `width:${s}px`,
        `height:${s}px`,
        `left:${Math.round(cx(d) - s / 2)}px`,
        `top:${Math.round(cy(d) - s / 2)}px`,
        'margin:0', 'padding:0'
      ].join(';')
      container.appendChild(div)
      renderNodePie(d.data, divId, s / 2, neutral)
    })
  }
  
  // ── Public API ──────────────────────────────────────────────────────────────

  async function render(container, { keyInfo, signedPubkeys = [], neutral = false }) {
    if (!keyInfo) return
    await loadDeps()
    const graph = convertKeyTreeToGraph(keyInfo)
    updateSigningStatus(graph, signedPubkeys)

    const hasTreeChildren = graph.children && graph.children.length > 0

    if (!hasTreeChildren) {
      // Render amCharts directly — no SVG wrapper, no foreignObject, no scaling
      container.innerHTML = ''
      container.style.overflow = 'visible'
      let rect = container.getBoundingClientRect()
      // a width-only container (height:auto) collapses to 0 → invisible pie; square it
      if (!rect.height && rect.width) { container.style.height = Math.round(rect.width) + 'px'; rect = container.getBoundingClientRect() }
      const size = Math.min(rect.width || 110, rect.height || 110)
      const divId = `kpie_direct_${++_chartSeq}`
      const div = document.createElement('div')
      div.id = divId
      div.style.cssText = 'width:100%;height:100%;margin:0;padding:0'
      container.appendChild(div)
      // renderNodePie(graph, divId, size * 0.38)
      renderNodePie(graph, divId, 42, neutral)
    } else {
      drawTree(graph, container, neutral)
    }
  }

  function renderNodePie(nodeData, divId, pieRadius, neutral = false) {
    const numerator = nodeData.threshold ?? 1
    const denominator = nodeData.keyCount || 1
    const thresholdData = [
      { category: 'Threshold needed', weight: numerator },
      { category: '',                 weight: Math.max(0, denominator - numerator) }
    ]
    const signedStatusData = []
    for (let i = 1; i <= denominator; i++) {
      const isSigned = i <= nodeData.keyCountSigned ? 1 : i > nodeData.threshold ? null : 0
      signedStatusData.push({ weight: 1, isSigned })
    }
    createThresholdPieChart(thresholdData, signedStatusData, divId, pieRadius, neutral)
  }
  

  global.kpie = { render }

})(window)
