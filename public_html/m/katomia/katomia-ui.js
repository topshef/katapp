async function injectHtml(id, url){
  const el = document.getElementById(id)
  if(!el) return

  const html = await fetch(url).then(r => r.text())
  el.innerHTML = html
}

injectHtml("siteHeader", "/m/katomia/header.html")
injectHtml("siteFooter", "/m/katomia/footer.html")