

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
  const banner = document.createElement("div")

  banner.style.position = "fixed"
  banner.style.top = "8px"
  banner.style.right = "8px"

  banner.style.background = "rgba(220, 235, 255, 0.9)" // soft info blue
  banner.style.border = "1px solid rgba(120, 160, 220, 0.8)"
  banner.style.borderRadius = "8px"

  banner.style.color = "#123"
  banner.style.fontSize = "12px"
  banner.style.fontWeight = "500"

  banner.style.padding = "6px 10px"
  banner.style.zIndex = "99998"
  banner.style.boxShadow = "0 4px 10px rgba(0,0,0,0.15)"

  const dirtyCount = Object.keys(state.dirtyFiles).length    //state.dirtyFiles?.length ?? 0
  const dirtyLabel = dirtyCount === 0
    ? "🧹 clean"
    : `🧹 ${dirtyCount} dirty`

  banner.innerHTML = `
    <span>
      🧱 ${state.buildId}
      &nbsp;·&nbsp;
      🔧 ${state.workingHash}
      &nbsp;·&nbsp;
      ${dirtyLabel}
    </span>
    <button id="close" style="margin-left: 8px; border-radius: 4px;">×</button>
  `

  banner.querySelector("#close").onclick = () => banner.remove()

  document.body.appendChild(banner)

  setTimeout(() => banner.remove(), 10000)
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