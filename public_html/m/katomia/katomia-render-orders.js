

/*
========================================
KATOMIA ORDER RENDERING
========================================

Rendering/UI layer for orders + markets.

Allowed:
- DOM
- SVG
- tooltips
- prompts
- click handlers

Forbidden:
- market calculations
- matching algorithms
- settlement logic
*/


function renderMarketHeatmap(pair, heatmap, opts = {}){

  const width =
    opts.width ?? 420

  const height =
    opts.height ?? 140

  const pad =
    opts.pad ?? 12

  const barWidth =
    opts.barWidth ?? 16

  const opacity =
    opts.opacity ?? 0.14

  const jitter =
    opts.jitter ?? 0

  const svg =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    )




  svg.setAttribute("width", width)
  svg.setAttribute("height", height)

  svg.classList.add("market-chart")

  const {
    minRate,
    maxRate,
    maxVolume
  } = heatmap.stats

  const chartW =
    width - (pad * 2)

  const chartH =
    height - (pad * 2)

  heatmap.rows.forEach(row => {

    const rate =
      row.displayRate

    const volume =
      row.displayBaseAmount

    const x =
      pad +
      (
        (rate - minRate)
        / (maxRate - minRate || 1)
      ) * chartW

    const h =
      (
        volume / (maxVolume || 1)
      ) * chartH

    const y =
      height - pad - h

    const rect =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      )

    const rectData = {
      row,
      y,
      w: barWidth,
      h
    }

    const jitterX =
      jitter
        ? (Math.random() - 0.5) * jitter
        : 0

    rectData.x =
      x - (barWidth / 2) + jitterX
      
    rect.setAttribute(
      "x",
      x - (barWidth / 2) + jitterX
    )

    rect.setAttribute("y", y)

    rect.setAttribute(
      "width",
      barWidth
    )

    rect.setAttribute(
      "height",
      h
    )

    rect.setAttribute(
      "fill",
      row.side === "buy"
        ? "#2ecc71"
        : "#e74c3c"
    )

    rect.setAttribute(
      "fill-opacity",
      opacity
    )

    rect.dataset.rate = rate
    rect.dataset.volume = volume
    rect.dataset.orderId = row.orderId

    rect.__heatmapData = rectData

    svg.appendChild(rect)
  })

  return svg
}


function ensureMarketTooltip(){

  let el =
    document.getElementById(
      "marketHeatmapTooltip"
    )

  if(el) return el

  el = document.createElement("div")

  el.id = "marketHeatmapTooltip"

  document.body.appendChild(el)

  return el
}


document.addEventListener("mousemove", e => {

  const tooltip =
    ensureMarketTooltip()

  const svg =
    e.target.closest(".market-chart")

  if(!svg){
    tooltip.style.display = "none"
    return
  }

  const rects =
    [...svg.querySelectorAll("rect")]

  const matches = []

  rects.forEach(rect => {

    const d = rect.__heatmapData

    if(!d) return

    const box =
      rect.getBoundingClientRect()

    const hit =
      e.clientX >= box.left &&
      e.clientX <= box.right &&
      e.clientY >= box.top &&
      e.clientY <= box.bottom

    if(hit)
      matches.push(d.row)
  })

  if(!matches.length){
    tooltip.style.display = "none"
    return
  }

  tooltip.innerHTML =
    matches.map(row => {

      return (
        `#${row.orderId} ` +
        `${row.side} ` +
        `${row.displayBaseAmount} ` +
        `@ ${row.displayRate}`
      )
    }).join("<br>")

  tooltip.style.display = "block"

  tooltip.style.left =
    (e.pageX + 12) + "px"

  tooltip.style.top =
    (e.pageY + 12) + "px"
})


function renderOrderMarketSummary(){

  const el = document.querySelector(
    "#ordersSection .orders-market-summary"
  )

  if(!el) return

  el.innerHTML = ""

  const markets = getSimpleFxMarkets()

  Object.entries(markets).forEach(([pair, rows]) => {

    const row = document.createElement("div")
    row.className = "market-summary-row"

    const summary = rows
      .map(row => {

      return (
        `#${row.orderId} ` +
        `${row.side} ` +
        `${row.displayBaseAmount} ` +
        `@ ${row.displayRate}`
      )
      })
      .join(" | ")

    row.textContent =
      `${pair} (${rows.length}) ${summary}`

    el.appendChild(row)

    const heatmap =
      buildMarketStats(rows)

    const chart =
      renderMarketHeatmap(
        pair,
        heatmap,
        {

          opacity: 0.16,

          // set 0 to disable
          jitter: 10,

          barWidth: 16
        }
      )
    el.appendChild(chart)
  })
}




/*
orders
  ↓
simple fx rows
  ↓
orderbook buckets
  ↓
svg renderer

*/