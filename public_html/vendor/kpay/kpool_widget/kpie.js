// kpie.js — standalone threshold pie chart widget
// Replaces iframe-based ksig_pie_widget.php
//
// Usage:
//   <script src="kpie.js"></script>
//   await window.kpie.render(containerEl, { keyInfo, signedPubkeys })

;(function(global) {
  'use strict'

  const ED25519_DER_PREFIX = '302a300506032b6570032100'

  function normalizeKey(key) {
    if (!key) return key
    const k = key.toLowerCase()
    return k.startsWith(ED25519_DER_PREFIX) ? k.slice(ED25519_DER_PREFIX.length) : k
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
      centerX: am5.percent(0),
      centerY: am5.percent(0),
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

    const rect = container.getBoundingClientRect()
    const size = Math.min(rect.width || 110, rect.height || 110)
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

    // CSS scale matching xMidYMid meet
    const scale = Math.min(size / vw, size / vh)
    const offsetX = (size - vw * scale) / 2
    const offsetY = (size - vh * scale) / 2
    const pieCssSize = Math.max(8, Math.round(pieRadius * 2 * scale))

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
      renderNodePie(graph, divId, size / 2 - 2)
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
