

let workingHash = null   // changes if any of the git tracked code changes
let lastNotifiedHash = null

try {
	const res = await fetch("/build.php", { cache: "no-store" })
	const serverState = await res.json()

	window.__BUILD__ = serverState

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
      const res = await fetch("/build.php", { cache: "no-store" })
      const { workingHash: latest } = await res.json()

      // if (latest !== workingHash)
        // showReloadBanner()
			
			if (latest !== workingHash && latest !== lastNotifiedHash) {
				lastNotifiedHash = latest
				showReloadBanner()
			}
			
    } catch {}
  }, 5000)
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

	banner.style.fontWeight = "500"

  banner.style.padding = "8px 10px"
  banner.style.borderRadius = "6px"
  banner.style.zIndex = "99999"
  banner.style.fontSize = "13px"

  banner.innerHTML = `
    <span>📣 New version available.</span>
    <button id="reload" style="margin-left: 6px; border-radius: 4px;">Reload</button>
    <button id="dismiss" style="border-radius: 4px;">×</button>
  `

  banner.querySelector("#reload").onclick = () => location.reload()
  banner.querySelector("#dismiss").onclick = () => banner.remove()

  document.body.appendChild(banner)
}

