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
    let k = key.toLowerCase()
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
      threshold: keyNode.threshold ?? 1,
      keyCount: keyNode.keys?.length ?? 0,
      keyLeaves: [],
      children: []
    }

    ;(keyNode.keys || []).forEach((child, i) => {
      const childPath = `${path}_${i + 1}`
      if (typeof child === 'object' && child.threshold)
        result.children.push(convertKeyTreeToGraph(child, childPath))
      else
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

  function createThresholdPieChart(thresholdData, signedStatusData, divId, pieRadius) {
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
        const color = v === 1 ? 0x56c857 : v === 0 ? 0xf5a623 : 0xF0F0F0
        slice.set('fill', am5.color(color))
      })
    })
    seriesSigned.labels.template.setAll({ forceHidden: true })
    seriesSigned.ticks.template.setAll({ forceHidden: true })

    seriesThreshold.appear(1000, 100)
    seriesSigned.appear(1000, 100)
  }

  // ── D3 tree layout ──────────────────────────────────────────────────────────

  function drawTree(jsonData, container) {
    container.innerHTML = ''
    container.style.position = 'relative'
    container.style.overflow = 'visible'

    // KPIE-SCALE1: fit by WIDTH and let the height follow the tree's real aspect ratio
    // (set below once the viewBox is known). The old min(w,h) square forced landscape
    // trees into whatever height the container happened to have, shrinking every node
    // pie; the caller (view.js buildThresholdWidget) now budgets the width by tree
    // complexity and leaves height:auto for us to fill in.
    const rect = container.getBoundingClientRect()
    const size = rect.width || Math.min(rect.width || 110, rect.height || 110)
    const clusterRadius = size / 2
    const maxDepth = d3.hierarchy(jsonData).height || 1
    const edgeLength = clusterRadius / (maxDepth + 1)
    const pieRadius = edgeLength * 0.18

    // Build D3 layout
    const root = d3.hierarchy(jsonData)
    const cluster = d3.cluster().size([2 * Math.PI, clusterRadius])
    cluster(root)
    root.descendants().forEach(d => { d.y = d.depth * (edgeLength * 0.5) })

    // Compute SVG-space positions for every node
    const nodePositions = root.descendants().map(d => ({
      data: d.data,
      svgX: d.y * Math.cos(d.x - Math.PI / 2),
      svgY: d.y * Math.sin(d.x - Math.PI / 2)
    }))

    // Compute viewBox tightly around all nodes
    const allX = nodePositions.map(n => n.svgX)
    const allY = nodePositions.map(n => n.svgY)
    const margin = pieRadius + 2
    const vx = Math.min(...allX) - margin
    const vy = Math.min(...allY) - margin
    const vw = Math.max(...allX) - Math.min(...allX) + margin * 2
    const vh = Math.max(...allY) - Math.min(...allY) + margin * 2

    // SVG for lines and node border circles only — no foreignObjects
    const svg = d3.select(container)
      .append('svg')
      .attr('viewBox', `${vx} ${vy} ${vw} ${vh}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('position', 'absolute')
      .style('top', '0').style('left', '0')
      .style('width', '100%').style('height', '100%')
      .style('overflow', 'hidden')

    svg.selectAll('.kpie-link')
      .data(root.links())
      .join('line')
      .attr('class', 'kpie-link')
      .attr('x1', d => d.source.y * Math.cos(d.source.x - Math.PI / 2))
      .attr('y1', d => d.source.y * Math.sin(d.source.x - Math.PI / 2))
      .attr('x2', d => d.target.y * Math.cos(d.target.x - Math.PI / 2))
      .attr('y2', d => d.target.y * Math.sin(d.target.x - Math.PI / 2))
      .attr('stroke', '#ccc')

    svg.append('circle')
      .attr('cx', nodePositions[0].svgX)
      .attr('cy', nodePositions[0].svgY)
      .attr('r', pieRadius)
      .attr('fill', 'none')
      .attr('stroke', '#ccc')
      .attr('stroke-width', 2)

    // KPIE-SCALE1: width is the budget; height = width scaled by the viewBox aspect, so
    // the container hugs the tree (landscape or portrait) instead of squaring it off.
    container.style.height = Math.round(vh * (size / vw)) + 'px'
    // Then RE-MEASURE and centre exactly like the SVG's xMidYMid meet does: CSS can
    // override the height we just set (e.g. the caller's min-height floor), and if the
    // real box is taller/wider than the viewBox aspect the SVG recentres its frame —
    // the node divs must follow the same maths or they detach from the lines/rings
    // (the lifted-pies bug). This is the original centring, now against the real box.
    const box = container.getBoundingClientRect()
    const boxW = box.width || size
    const boxH = box.height || (vh * (size / vw))
    const scale = Math.min(boxW / vw, boxH / vh)
    const offsetX = (boxW - vw * scale) / 2
    const offsetY = (boxH - vh * scale) / 2
    // node-pie cap scales with the budget (was a flat 44px — pointlessly small once the
    // container is allowed to grow), floor stays for legibility on tiny cells.
    const pieCssSize = Math.max(8, Math.min(Math.max(44, Math.round(size / 5)), Math.round(pieRadius * 2 * scale)))

    // Absolutely-positioned divs for amCharts — no SVG scaling involved
    const seq = ++_chartSeq
    nodePositions.forEach(({ data: nodeData, svgX, svgY }) => {
      const cssX = (svgX - vx) * scale + offsetX
      const cssY = (svgY - vy) * scale + offsetY

      const divId = `kpie_c_${nodeData.name}_${seq}`
      const div = document.createElement('div')
      div.id = divId
      div.style.cssText = [
        'position:absolute',
        `width:${pieCssSize}px`,
        `height:${pieCssSize}px`,
        `left:${Math.round(cssX - pieCssSize / 2)}px`,
        `top:${Math.round(cssY - pieCssSize / 2)}px`,
        'margin:0', 'padding:0'
      ].join(';')
      container.appendChild(div)
      renderNodePie(nodeData, divId, pieCssSize / 2)
    })
  }
  
  // ── Public API ──────────────────────────────────────────────────────────────

  async function render(container, { keyInfo, signedPubkeys = [] }) {
    if (!keyInfo) return
    await loadDeps()
    const graph = convertKeyTreeToGraph(keyInfo)
    updateSigningStatus(graph, signedPubkeys)

    const hasTreeChildren = graph.children && graph.children.length > 0

    if (!hasTreeChildren) {
      // Render amCharts directly — no SVG wrapper, no foreignObject, no scaling
      container.innerHTML = ''
      container.style.overflow = 'visible'
      const rect = container.getBoundingClientRect()
      const size = Math.min(rect.width || 110, rect.height || 110)
      const divId = `kpie_direct_${++_chartSeq}`
      const div = document.createElement('div')
      div.id = divId
      div.style.cssText = 'width:100%;height:100%;margin:0;padding:0'
      container.appendChild(div)
      // renderNodePie(graph, divId, size * 0.38)
      renderNodePie(graph, divId, 42)
    } else {
      drawTree(graph, container)
    }
  }

  function renderNodePie(nodeData, divId, pieRadius) {
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
    createThresholdPieChart(thresholdData, signedStatusData, divId, pieRadius)
  }
  

  global.kpie = { render }

})(window)
