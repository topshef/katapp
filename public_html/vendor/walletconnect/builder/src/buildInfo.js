
// BUILDID is injected during deployment using deploy.sh
// const BUILDID = "2026-02-17 Tue 16:32:57 UTC  topshef/phpjabbers/tree/kswap#03fc5db"
// console.log("[WC] BUILD " + BUILDID); 


// console.log('YH83643 Build meta:', __BUILD_META__)

const buildMeta = typeof __BUILD_META__ !== 'undefined'
  ? __BUILD_META__
  : { mode: 'dev', commit: null, built: null }

console.log('YH83643 Build meta:', buildMeta)



/* --------------------------------------------------
   METHOD 1 — document.currentScript (IIFE-safe)
-------------------------------------------------- */

try {
  const scriptEl = document.currentScript

  if (scriptEl && scriptEl.src) {
    const url1 = new URL('release.json', scriptEl.src)

    fetch(url1, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        console.log('METHOD 1 URL:', url1.href)
        if (data) console.log('METHOD 1 Release meta:', data)
      })
      .catch(() => {
        console.log('METHOD 1 failed silently')
      })
  } else {
    console.log('METHOD 1: no currentScript')
  }
} catch (e) {
  console.log('METHOD 1 exception:', e)
}


/* --------------------------------------------------
   METHOD 2 — derive from last loaded script tag
-------------------------------------------------- */

try {
  const scripts = document.getElementsByTagName('script')
  const lastScript = scripts[scripts.length - 1]

  if (lastScript && lastScript.src) {
    const url2 = new URL('release.json', lastScript.src)

    fetch(url2, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        console.log('METHOD 2 URL:', url2.href)
        if (data) console.log('METHOD 2 Release meta:', data)
      })
      .catch(() => {
        console.log('METHOD 2 failed silently')
      })
  } else {
    console.log('METHOD 2: no script src')
  }
} catch (e) {
  console.log('METHOD 2 exception:', e)
}
