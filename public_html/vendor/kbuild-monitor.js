
/*
	v0.12 extracted from kpay_widget bootstrap.js and converted to module
  v0.11 bucket days
  v0.1  initial version
	bootstrap.js — Admin build / live-reload helper

  Purpose:
  - Fetches server build state from /build.php on load
  - Imports index.js with a cache-busting hash (workingHash)
  - Shows a non-intrusive admin banner with:
      • repo + latest commit link
      • working hash
      • clean / dirty status
      • list of dirty files with coarse “age” hints
  - Polls server state every 5s while banner is active

  Behaviour:
  - Green banner: repo clean and page in sync
  - Orange banner: repo dirty OR page out of sync
  - Reload button appears once server workingHash changes
    (even if repo later becomes clean again)
  - Closing the banner disables further polling until page reload

  Scope:
  - Intended for admin / dev use only
  - No impact on normal users
*/

//NOTE import using module option to prevent global polution
// eg 	<script type="module" src="/vendor/kbuild-monitor.js"></script>

let bannerActive = true
let bannerTimer = null

export async function initBuildBanner({
  endpoint = "/build.php",
  pollMs = 5000
} = {}) {

	let workingHash = null   // changes if any of the git tracked code changes
	let lastNotifiedHash = null
	let watchEnabled = true


	try {
		const res = await fetch(endpoint, { cache: "no-store" })
		const serverState = await res.json()

		window.__BUILD__ = serverState
		
		showBootstrapStatus(serverState)

		console.log("🛠 Build diagnostics", serverState)

		workingHash = serverState.workingHash

		console.info("Server workingHash:", workingHash)

	} catch {
		// Non-JSON or denied → silently skip diagnostics
	}


	if (workingHash) {
		bannerTimer = setInterval(async () => {
			try {
				if (!bannerActive)
					return

				const res = await fetch("/build.php", { cache: "no-store" })
				const state = await res.json()

				const hasChanged = state.workingHash !== workingHash

				showBuildBanner({
					state,
					mode: hasChanged ? "reload" : "info",
					onReload: hasChanged ? () => location.reload() : null
				})

			} catch {}
		}, pollMs)
	}
	
  return window.__BUILD__ || null
}


function showBootstrapStatus(state) {
  const dirtyCount = Object.keys(state.dirtyFiles || {}).length

  showBuildBanner({
    state,
    mode: "info",
    autoDismissMs: dirtyCount === 0 ? 20000 : null
  })
}


function showReloadBanner(state) {
  showBuildBanner({
    state,
    mode: "reload",
    onReload: () => location.reload()
  })
}


function showBuildBanner({
  state,
  mode,            // "info" | "reload"
  onReload = null, // function or null
  autoDismissMs = null
}) {
  // remove any existing banner
  const old = document.getElementById("build-banner-overlay")
  if (old) old.remove()

  const overlay = document.createElement("div")
  overlay.id = "build-banner-overlay"
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: all;
    background: rgba(0,0,0,0.001);
  `

  const banner = document.createElement("div")
  banner.style.cssText = `
    position: fixed;
    top: 8px;
    right: 8px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    padding: 8px 10px;
    max-width: 420px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
    pointer-events: all;
  `

  const dirtyEntries = Object.entries(state.dirtyFiles || {})
  const isClean = dirtyEntries.length === 0

  // color by mode / state
  if (mode === "reload") {
    banner.style.background = "rgba(255,245,230,0.95)"
    banner.style.border = "1px solid rgba(255,165,0,0.6)"
    banner.style.color = "#222"
  } else {
		banner.style.background = isClean
			? "rgba(220,245,220,0.95)"   // green
			: "rgba(255,245,230,0.95)"   // orange

		banner.style.border = isClean
			? "1px solid rgba(120,180,120,0.8)"
			: "1px solid rgba(255,165,0,0.6)"

		banner.style.color = "#222"
  }

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

							let age = "?"

							if (rec.mtime) {
								const seconds = Math.floor(Date.now() / 1000 - rec.mtime)

								if (seconds < 60)
									age = "<1m"
								else if (seconds < 3600)
									age = "<1h"
								else if (seconds < 86400)
									age = `${Math.floor(seconds / 3600)}h`
								else
									age = `${Math.floor(seconds / 86400)}d`
							}

							return `${age} ${path}`

           }).join("<br>")}
         </div>`
      : ""}

    ${mode === "reload"
      ? `<div style="margin-top:6px;">
           <button id="reload" style="border-radius:4px;">Reload</button>
         </div>`
      : ""}
  `

  banner.onclick = e => e.stopPropagation()
  overlay.onclick = e => { e.preventDefault(); e.stopPropagation() }

	banner.querySelector("#close").onclick = e => {
		e.stopPropagation()
		bannerActive = false
		if (bannerTimer)
			clearInterval(bannerTimer)
		overlay.remove()
	}


  if (onReload) {
    banner.querySelector("#reload").onclick = () => onReload()
  }

  overlay.appendChild(banner)
  document.body.appendChild(overlay)

  if (autoDismissMs)
    setTimeout(() => overlay.remove(), autoDismissMs)
}


if (!window.__KBUILD_MONITOR_MANUAL__)
  initBuildBanner()
