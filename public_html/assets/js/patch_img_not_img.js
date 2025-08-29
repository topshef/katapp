document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || ''
    if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(src)) {
      const video = document.createElement('video')
      video.src = src
      video.autoplay = true
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.controls = true   // shows play/pause/fullscreen
      video.className = img.className   // keep existing classes
      video.style.borderRadius = '12px'

      img.replaceWith(video)
    }
  })
})
