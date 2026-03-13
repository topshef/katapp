function loadScript(src){
  const s = document.createElement("script")
  s.src = src
  s.defer = true
  document.head.appendChild(s)
}

loadScript("katomia-core.js")
loadScript("katomia-helpers.js")
loadScript("katomia-render.js")
loadScript("katomia-network.js")
loadScript("katomia-enrich.js")

window.addEventListener("load", () => {

  const token = localStorage.getItem("katomiaPlayerToken")
  if(!token) return

  if(typeof connect === "function"){
    connect()
  }

})

