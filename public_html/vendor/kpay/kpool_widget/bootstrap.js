

let workingHash = null   // changes if any of the git tracked code changes
let lastNotifiedHash = null
let watchEnabled = true

try {
	const res = await fetch("/build.php", { cache: "no-store" })
	const serverState = await res.json()

	window.__BUILD__ = serverState
	
	showBootstrapStatus(serverState)

	console.log("🛠 Build diagnostics", serverState)

	workingHash = serverState.workingHash

	console.info("Server workingHash:", workingHash)

} catch {
  // Non-JSON or denied → silently skip diagnostics
}


// can we do 

let appRoot = "./index.js"
if (workingHash)
  appRoot += `?v=${workingHash}`

await import(appRoot)



if (workingHash) {
  setInterval(async () => {
    try {
			
			if (!watchEnabled)
				return
			
      const res = await fetch("/build.php", { cache: "no-store" })
      const { workingHash: latest } = await res.json()

			if (latest !== workingHash && latest !== lastNotifiedHash) {
				lastNotifiedHash = latest
				showReloadBanner()
			}

			
    } catch {}
  }, 5000)
}

function showBootstrapStatus(state) {
  // kill any existing one
  const old = document.getElementById("build-bootstrap-overlay")
  if (old) old.remove()

  const overlay = document.createElement("div")
  overlay.id = "build-bootstrap-overlay"
  overlay.style.cssText = `
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147483647 !important;
    pointer-events: all !important;
    background: rgba(0,0,0,0.001) !important;
  `

  const banner = document.createElement("div")
  banner.style.cssText = `
    position: fixed !important;
    top: 8px !important;
    right: 8px !important;
    border: 1px solid rgba(120,160,220,0.8) !important;
    border-radius: 8px !important;
    color: #123 !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    padding: 8px 10px !important;
    max-width: 420px !important;
    box-shadow: 0 4px 10px rgba(0,0,0,0.2) !important;
    pointer-events: all !important;
  `

	const dirtyEntries = Object.entries(state.dirtyFiles || {})

	const isClean = dirtyEntries.length === 0
	
	banner.style.background = isClean
		? "rgba(220,245,220,0.95)"   // light green
		: "rgba(220,235,255,0.95)"   // blue
	

  const dirtyLabel = isClean
    ? "✅ clean"
    : `🧹 ${dirtyEntries.length} dirty`
	

  const commitUrl = `https://github.com/${state.repo}/commit/${state.buildId}`

  banner.innerHTML = `
    <button id="close"
      style="position:absolute;top:4px;right:6px;border-radius:4px;">
      ×
    </button>

    <div style="margin-bottom:4px;padding-right:18px;">
      📦 ${state.repo}
    </div>

    <div>
      🧱 <a href="${commitUrl}" target="_blank" style="color:inherit;">
        ${state.buildId}
      </a>
      · 🔧 ${state.workingHash}
      · ${dirtyLabel}
    </div>

		${dirtyEntries.length
			? `<div style="margin-top:6px;font-weight:400;">
					 ${dirtyEntries.map(([path, rec]) => {
						 const seconds = rec.mtime
							 ? Math.floor(Date.now() / 1000 - rec.mtime)
							 : "?"
						 return `${seconds}s ${path}`
					 }).join("<br>")}
				 </div>`
			: ""}

  `

  banner.onclick = e => e.stopPropagation()
  overlay.onclick = e => { e.preventDefault(); e.stopPropagation() }

  banner.querySelector("#close").onclick = e => {
    e.stopPropagation()
    overlay.remove()
  }

  overlay.appendChild(banner)
  document.body.appendChild(overlay)

  if (isClean)
		setTimeout(() => overlay.remove(), 20000)

}


function showReloadBanner() {
  if (document.getElementById("build-reload-banner"))
    return

  const banner = document.createElement("div")
  banner.id = "build-reload-banner"

	banner.style.position = "fixed"
	banner.style.top = "8px"
	banner.style.right = "8px"

	banner.style.background = "rgba(255, 245, 230, 0.85)" // warm, mostly opaque
	banner.style.border = "1px solid rgba(255, 165, 0, 0.6)"
	banner.style.borderRadius = "8px"

	banner.style.color = "#222"
	banner.style.fontWeight = "500"
	banner.style.fontSize = "13px"

	banner.style.padding = "8px 10px"
	banner.style.zIndex = "99999"

	banner.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)"

  banner.innerHTML = `
    <span>📣 New version available.</span>
    <button id="reload" style="margin-left: 6px; border-radius: 4px;">Reload</button>
    <button id="dismiss" style="border-radius: 4px;">×</button>
  `

  banner.querySelector("#reload").onclick = () => location.reload()
  // banner.querySelector("#dismiss").onclick = () => banner.remove()  //only remove banner, but allow retrigger
	banner.querySelector("#dismiss").onclick = () => {
		watchEnabled = false  // turn off watch completely (admin user needs to reload to reenable)
		banner.remove()
	}

  document.body.appendChild(banner)
}

/////