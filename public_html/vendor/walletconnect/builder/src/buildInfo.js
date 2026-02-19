
// BUILDID is injected during deployment using deploy.sh
// const BUILDID = "2026-02-17 Tue 16:32:57 UTC  topshef/phpjabbers/tree/kswap#03fc5db"
// console.log("[WC] BUILD " + BUILDID); 


// console.log('YH83643 Build meta:', __BUILD_META__)

const buildMeta = typeof __BUILD_META__ !== 'undefined'
  ? __BUILD_META__
  : { mode: 'dev', commit: null, built: null }

console.log('YH83643 Build meta:', buildMeta)


;(async () => {
  try {
    const res = await fetch('./release.json', { cache: 'no-store' })
    if (!res.ok) return

    const releaseMeta = await res.json()
    console.log('TE93848 Release meta:', releaseMeta)
  } catch {
    // silent
  }
})()
