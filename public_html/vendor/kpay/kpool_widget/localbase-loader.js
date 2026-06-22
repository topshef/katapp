let loadPromise = null

export async function loadLocalbase() {
  if (window.Localbase) return window.Localbase

  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = new URL('./localbase.min.js', import.meta.url).href
      script.async = true

      script.onload = () => {
        if (!window.Localbase)
          reject(new Error('Localbase loaded but not found on window'))
        else
          resolve(window.Localbase)
      }

      script.onerror = reject
      document.head.appendChild(script)
    })
  }

  return loadPromise
}
