/*
========================================
KEMOJI — Deterministic face avatar
========================================
Extracted from kemoji.html Facehash Demo.
Pure generation engine — no DOM interaction except kemojiEl().

Public API:
  kemojiBytesForKey(key)           → Uint8Array (sync)
  kemojiHue(key)                   → number 0–360 (sync)
  kemojiEl(key, opts)              → HTMLElement (sync)
    opts: { size=24, shape="circle", isSelf=false }
*/

const _kemojiCache = new Map()

// ── tiny helpers ──────────────────────────────────────────────────────────────

function _keEsc(text){
  return String(text).replace(/[&<>"']/g, ch =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])
  )
}
const _keByte  = (bytes,i)        => bytes[i % bytes.length]
const _keBit   = (bytes,i,mask)   => (_keByte(bytes,i) & mask) !== 0
const _keRange = (bytes,i,mn,mx)  => mn + (_keByte(bytes,i) / 255) * (mx - mn)
const _keNum   = n => Number(n).toFixed(1).replace(/\.0$/,"")

// ── key → bytes (sync) ───────────────────────────────────────────────────────

function _keParseHex(raw){
  const clean = raw.trim().replace(/^0x/i,"").replace(/[\s:_-]/g,"")
  if(!/^[0-9a-fA-F]{64}$/.test(clean)) return null
  return new Uint8Array(clean.match(/../g).map(p => parseInt(p,16)))
}

function _keFallback(text){
  let h1=0xdeadbeef,h2=0x41c6ce57,h3=0x9e3779b9,h4=0x85ebca6b
  for(let i=0;i<text.length;i++){
    const ch=text.charCodeAt(i)
    h1=Math.imul(h1^ch,2654435761); h2=Math.imul(h2^ch,1597334677)
    h3=Math.imul(h3^ch,2246822507); h4=Math.imul(h4^ch,3266489909)
  }
  const words=[h1,h2,h3,h4,h1^h3,h2^h4,h1^h4,h2^h3]
  const out=new Uint8Array(32)
  words.forEach((w,i)=>{
    let v=w>>>0
    out[i*4]=v&255; out[i*4+1]=(v>>>8)&255; out[i*4+2]=(v>>>16)&255; out[i*4+3]=(v>>>24)&255
  })
  return out
}

// ── face parts ────────────────────────────────────────────────────────────────

function _keFrameEl(shape,fill,extra=""){
  if(shape==="square")   return `<rect x="8" y="8" width="240" height="240" rx="22" fill="${fill}" ${extra}/>`
  if(shape==="squircle") return `<rect x="8" y="8" width="240" height="240" rx="58" fill="${fill}" ${extra}/>`
  return `<circle cx="128" cy="128" r="120" fill="${fill}" ${extra}/>`
}

function _keClipEl(shape){
  if(shape==="square")   return `<rect x="8" y="8" width="240" height="240" rx="22"/>`
  if(shape==="squircle") return `<rect x="8" y="8" width="240" height="240" rx="58"/>`
  return `<circle cx="128" cy="128" r="120"/>`
}

function _keEye(type,x,y,w,h,tilt,stroke,fill,sw){
  const n=_keNum
  const t=`transform="rotate(${n(tilt)} ${n(x)} ${n(y)})"`
  if(type===0) return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(w)}" ry="${n(h)}" fill="${stroke}" ${t}/>`
  if(type===1) return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(w+3)}" ry="${n(h+2)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" ${t}/><circle cx="${n(x+w*.25)}" cy="${n(y-h*.15)}" r="${n(Math.max(2.2,w*.35))}" fill="${stroke}"/>`
  if(type===2) return `<path d="M ${n(x-w)} ${n(y)} Q ${n(x)} ${n(y-h)} ${n(x+w)} ${n(y)}" fill="none" stroke="${stroke}" stroke-width="${n(sw+1)}" stroke-linecap="round" ${t}/>`
  if(type===3) return `<path d="M ${n(x-w)} ${n(y)} L ${n(x+w)} ${n(y)}" fill="none" stroke="${stroke}" stroke-width="${n(sw+1.4)}" stroke-linecap="round" ${t}/>`
  if(type===4) return `<path d="M ${n(x)} ${n(y-h)} L ${n(x+w)} ${n(y)} L ${n(x)} ${n(y+h)} L ${n(x-w)} ${n(y)} Z" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" ${t}/>`
  return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(Math.max(w,h))}" fill="none" stroke="${stroke}" stroke-width="${n(sw)}"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(Math.max(2.2,Math.min(w,h)*.45))}" fill="${stroke}"/>`
}

function _keHair(style,cx,top,w,stroke,fill,bytes){
  const n=_keNum, r=_keRange
  const left=cx-w*.42, right=cx+w*.42
  if(style===0) return ""
  if(style===1){
    let d=`M ${n(left)} ${n(top+22)}`
    for(let i=0;i<8;i++){
      const x=left+(right-left)*(i/7), y=top+r(bytes,12+i,-10,24)
      d+=` L ${n(x)} ${n(y)}`
    }
    d+=` L ${n(right)} ${n(top+24)}`
    return `<path d="${d}" fill="${stroke}" opacity=".95"/>`
  }
  if(style===2) return `<path d="M ${n(left+4)} ${n(top+30)} C ${n(cx-42)} ${n(top-20)}, ${n(cx+52)} ${n(top-20)}, ${n(right-4)} ${n(top+28)}" fill="none" stroke="${stroke}" stroke-width="9" stroke-linecap="round"/>`
  if(style===3) return `<path d="M ${n(left+12)} ${n(top+18)} C ${n(cx-8)} ${n(top+52)}, ${n(cx+12)} ${n(top-14)}, ${n(right-12)} ${n(top+22)}" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round"/>`
  return `<path d="M ${n(left+8)} ${n(top+25)} Q ${n(cx-18)} ${n(top-18)} ${n(cx+8)} ${n(top+28)} Q ${n(cx+34)} ${n(top-2)} ${n(right-8)} ${n(top+26)}" fill="${stroke}" opacity=".9"/>`
}

function _keEar(type,x,y,rx,ry,side,fill,stroke,sw,bytes){
  const n=_keNum, r=_keRange
  const outer=x+side*rx*r(bytes,6+type,1.05,1.55)
  const inner=x-side*rx*.22
  const top=y-ry, bottom=y+ry
  const rot=side*r(bytes,18+type,-5,8)
  const tf=`transform="rotate(${n(rot)} ${n(x)} ${n(y)})"`
  if(type===0) return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" ${tf}/>`
  if(type===1) return `<path d="M ${n(inner)} ${n(top+ry*.22)} C ${n(outer)} ${n(top-ry*.05)}, ${n(outer)} ${n(bottom+ry*.05)}, ${n(inner)} ${n(bottom-ry*.22)} Q ${n(x+side*rx*.22)} ${n(y)} ${n(inner)} ${n(top+ry*.22)} Z" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linejoin="round" ${tf}/>`
  if(type===2) return `<path d="M ${n(inner)} ${n(top+ry*.18)} L ${n(outer)} ${n(y)} L ${n(inner)} ${n(bottom-ry*.18)} Q ${n(x+side*rx*.1)} ${n(y)} ${n(inner)} ${n(top+ry*.18)} Z" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linejoin="round" ${tf}/>`
  if(type===3) return `<rect x="${n(side<0?x-rx*1.6:x-rx*.05)}" y="${n(y-ry*.82)}" width="${n(rx*1.65)}" height="${n(ry*1.64)}" rx="${n(r(bytes,20,4,13))}" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" ${tf}/>`
  return `<g ${tf}><path d="M ${n(inner)} ${n(top+ry*.08)} C ${n(outer)} ${n(top+ry*.18)}, ${n(outer)} ${n(bottom-ry*.08)}, ${n(inner)} ${n(bottom-ry*.12)} C ${n(x+side*rx*.36)} ${n(y+ry*.16)}, ${n(x+side*rx*.34)} ${n(y-ry*.24)}, ${n(inner)} ${n(top+ry*.08)} Z" fill="${fill}" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linejoin="round"/><path d="M ${n(x+side*rx*.18)} ${n(y-ry*.38)} C ${n(x+side*rx*.62)} ${n(y-ry*.1)}, ${n(x+side*rx*.55)} ${n(y+ry*.3)}, ${n(x+side*rx*.1)} ${n(y+ry*.42)}" fill="none" stroke="${stroke}" stroke-width="${n(sw*.42)}" stroke-linecap="round" opacity=".55"/></g>`
}

// ── main SVG generator ────────────────────────────────────────────────────────

function _keFaceSvg(bytes, label, shape){
  const n=_keNum, b=_keByte, bit=_keBit, r=_keRange

  const hue        = b(bytes,0)*360/256
  const hue2       = (hue+r(bytes,1,48,145))%360
  const bg1        = `hsl(${n(hue)} 72% 66%)`
  const bg2        = `hsl(${n(hue2)} 76% 74%)`
  const faceFill   = `hsl(${n((hue+28)%360)} 74% 96%)`
  const stroke     = `hsl(${n((hue+210)%360)} 48% 18%)`
  const blush      = `hsl(${n((hue+330)%360)} 80% 74%)`
  const sw         = r(bytes,2,4.2,7.6)
  const cx         = 128+r(bytes,3,-5,5)
  const cy         = 130+r(bytes,4,-5,5)
  const w          = r(bytes,5,126,166)
  const h          = r(bytes,6,138,178)
  const jaw        = r(bytes,7,-10,18)
  const crown      = cy-h/2
  const chin       = cy+h*.48
  const left       = cx-w/2
  const right      = cx+w/2
  const head       = `M ${n(cx)} ${n(crown)} C ${n(right+r(bytes,8,-4,10))} ${n(crown+12)}, ${n(right+r(bytes,9,-4,10))} ${n(cy+32)}, ${n(cx+w*.32+jaw)} ${n(chin)} C ${n(cx+w*.16)} ${n(chin+r(bytes,10,7,23))}, ${n(cx-w*.16)} ${n(chin+r(bytes,11,7,23))}, ${n(cx-w*.32+jaw)} ${n(chin)} C ${n(left+r(bytes,12,-10,4))} ${n(cy+32)}, ${n(left+r(bytes,13,-10,4))} ${n(crown+12)}, ${n(cx)} ${n(crown)} Z`
  const eyeType    = b(bytes,14)%6
  const fDrop      = r(bytes,27,-3,10)
  const fSpreadY   = r(bytes,28,.9,1.12)
  const eyeY       = cy-r(bytes,15,18,34)*fSpreadY+fDrop
  const spacing    = r(bytes,16,39,61)
  const eyeW       = r(bytes,17,7,15)
  const eyeH       = r(bytes,18,5,12)
  const tilt       = r(bytes,19,-18,18)
  const mouthY     = cy+r(bytes,20,30,45)*fSpreadY+fDrop
  const mouthW     = r(bytes,21,25,48)
  const smile      = r(bytes,22,-25,29)
  const noseLen    = r(bytes,23,12,28)
  const noseBend   = r(bytes,24,-8,8)
  const browTilt   = r(bytes,25,-21,21)
  const hairStyle  = b(bytes,26)%5
  const ear        = bit(bytes,27,1)
  const earType    = b(bytes,27)%5
  const earY       = cy+r(bytes,24,-2,12)
  const earRx      = r(bytes,11,10,18)
  const earRy      = r(bytes,12,17,27)
  const glasses    = b(bytes,28)>188
  const freckles   = b(bytes,29)%8
  const cheekOn    = bit(bytes,30,2)
  const mouthType  = b(bytes,31)%5
  const lx = cx-spacing/2, rx = cx+spacing/2

  // Include shape char in clipId so circle and square variants don't collide in DOM.
  const sc = shape==="circle" ? "c" : shape==="squircle" ? "q" : "s"
  const clipId = `ke${sc}${bytes[0].toString(16).padStart(2,"0")}${bytes[1].toString(16).padStart(2,"0")}${bytes[2].toString(16).padStart(2,"0")}`
  const gradId = `keg${bytes[3].toString(16).padStart(2,"0")}${bytes[4].toString(16).padStart(2,"0")}${bytes[5].toString(16).padStart(2,"0")}`

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${_keEsc(String(label).slice(0,40))}">`
  s += `<defs><clipPath id="${clipId}">${_keClipEl(shape)}</clipPath><linearGradient id="${gradId}" x1="30" y1="20" x2="226" y2="236"><stop stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>`
  s += `<g clip-path="url(#${clipId})">`
  s += _keFrameEl(shape,`url(#${gradId})`)
  s += `<circle cx="${n(74+r(bytes,5,-18,18))}" cy="${n(64+r(bytes,6,-10,18))}" r="${n(r(bytes,7,22,52))}" fill="white" opacity=".18"/>`
  s += `<circle cx="${n(197+r(bytes,8,-20,18))}" cy="${n(203+r(bytes,9,-22,12))}" r="${n(r(bytes,10,18,44))}" fill="black" opacity=".06"/>`

  if(ear){
    s += _keEar(earType,left+2,earY,earRx,earRy,-1,faceFill,stroke,sw,bytes)
    s += _keEar(earType,right-2,earY+r(bytes,13,-1.5,1.5),earRx,earRy,1,faceFill,stroke,sw,bytes)
  }

  s += `<path d="${head}" fill="${faceFill}" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linejoin="round"/>`
  s += _keHair(hairStyle,cx,crown,w,stroke,faceFill,bytes)
  s += `<g>`
  s += `<path d="M ${n(lx-eyeW-6)} ${n(eyeY-20+browTilt*.2)} L ${n(lx+eyeW+6)} ${n(eyeY-22-browTilt*.35)}" stroke="${stroke}" stroke-width="${n(sw*.72)}" stroke-linecap="round" opacity=".9"/>`
  s += `<path d="M ${n(rx-eyeW-6)} ${n(eyeY-22-browTilt*.35)} L ${n(rx+eyeW+6)} ${n(eyeY-20+browTilt*.2)}" stroke="${stroke}" stroke-width="${n(sw*.72)}" stroke-linecap="round" opacity=".9"/>`
  s += _keEye(eyeType,lx,eyeY,eyeW,eyeH,-tilt,stroke,faceFill,sw)
  s += _keEye(eyeType,rx,eyeY+r(bytes,13,-2,2),eyeW+r(bytes,14,-1.5,1.5),eyeH,tilt,stroke,faceFill,sw)
  s += `</g>`

  if(glasses){
    const gr=Math.max(eyeW+11,18)
    s += `<circle cx="${n(lx)}" cy="${n(eyeY)}" r="${n(gr)}" fill="none" stroke="${stroke}" stroke-width="${n(sw*.62)}" opacity=".74"/>`
    s += `<circle cx="${n(rx)}" cy="${n(eyeY)}" r="${n(gr)}" fill="none" stroke="${stroke}" stroke-width="${n(sw*.62)}" opacity=".74"/>`
    s += `<path d="M ${n(lx+gr)} ${n(eyeY)} L ${n(rx-gr)} ${n(eyeY)}" stroke="${stroke}" stroke-width="${n(sw*.5)}" stroke-linecap="round" opacity=".74"/>`
  }

  s += `<path d="M ${n(cx+noseBend*.2)} ${n(eyeY+15)} C ${n(cx+noseBend)} ${n(eyeY+noseLen)}, ${n(cx-noseBend*.8)} ${n(eyeY+noseLen+10)}, ${n(cx+r(bytes,15,-8,8))} ${n(eyeY+noseLen+16)}" fill="none" stroke="${stroke}" stroke-width="${n(sw*.58)}" stroke-linecap="round" opacity=".72"/>`

  if(cheekOn){
    s += `<ellipse cx="${n(lx-15)}" cy="${n(mouthY-10)}" rx="14" ry="8" fill="${blush}" opacity=".33"/>`
    s += `<ellipse cx="${n(rx+15)}" cy="${n(mouthY-10)}" rx="14" ry="8" fill="${blush}" opacity=".33"/>`
  }

  for(let i=0;i<freckles;i++){
    const side=i%2===0?-1:1
    s += `<circle cx="${n(cx+side*r(bytes,16+i,24,48))}" cy="${n(cy+r(bytes,18+i,0,28))}" r="${n(r(bytes,20+i,1.3,2.6))}" fill="${stroke}" opacity=".22"/>`
  }

  if(mouthType===0) s += `<path d="M ${n(cx-mouthW)} ${n(mouthY)} Q ${n(cx)} ${n(mouthY+smile)} ${n(cx+mouthW)} ${n(mouthY)}" fill="none" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linecap="round"/>`
  if(mouthType===1) s += `<path d="M ${n(cx-mouthW*.75)} ${n(mouthY)} C ${n(cx-mouthW*.3)} ${n(mouthY+smile)}, ${n(cx+mouthW*.3)} ${n(mouthY+smile)}, ${n(cx+mouthW*.75)} ${n(mouthY)}" fill="none" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linecap="round"/>`
  if(mouthType===2) s += `<ellipse cx="${n(cx)}" cy="${n(mouthY+Math.max(0,smile*.35))}" rx="${n(mouthW*.36)}" ry="${n(r(bytes,17,7,16))}" fill="none" stroke="${stroke}" stroke-width="${n(sw)}"/>`
  if(mouthType===3) s += `<path d="M ${n(cx-mouthW*.55)} ${n(mouthY)} L ${n(cx+mouthW*.55)} ${n(mouthY)}" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linecap="round"/>`
  if(mouthType===4) s += `<path d="M ${n(cx-mouthW*.7)} ${n(mouthY)} Q ${n(cx)} ${n(mouthY-Math.abs(smile)*.75-5)} ${n(cx+mouthW*.7)} ${n(mouthY)}" fill="none" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linecap="round"/>`

  s += `</g></svg>`
  return s
}

// ── public API ────────────────────────────────────────────────────────────────

function kemojiBytesForKey(key){
  return _keParseHex(String(key || "")) || _keFallback(String(key || "unknown"))
}

function kemojiHue(key){
  return kemojiBytesForKey(key)[0] * 360 / 256
}

function kemojiSleeveColor(key){
  return `hsl(${Math.round(kemojiHue(key))} 55% 50%)`
}

function kemojiEl(key, opts){
  const size   = opts?.size   ?? 24
  const shape  = opts?.shape  ?? "circle"
  const isSelf = opts?.isSelf ?? false

  const cacheKey = `${key}:${shape}`
  if(!_kemojiCache.has(cacheKey)){
    const bytes = kemojiBytesForKey(key)
    _kemojiCache.set(cacheKey, _keFaceSvg(bytes, String(key || "").slice(-12), shape))
  }

  const svgStr = _kemojiCache.get(cacheKey)

  const el = document.createElement("span")
  el.className = "kemoji" + (isSelf ? " kemoji-self" : "")
  el.style.cssText = `display:inline-flex;width:${size}px;height:${size}px;flex-shrink:0;vertical-align:middle;`
  el.innerHTML = svgStr.replace("<svg ", `<svg width="${size}" height="${size}" `)

  if(key) el.dataset.kemojiKey = String(key).slice(-12)

  return el
}
