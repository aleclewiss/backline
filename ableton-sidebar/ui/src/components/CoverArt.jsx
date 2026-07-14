import React, { useEffect, useRef } from 'react'

// Deterministic procedural cover art — every sound gets its own amber "album cover",
// seeded from its id/seed so it's stable across renders and reloads.
function hashSeed(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function CoverArt({ seed }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const rnd = mulberry32(hashSeed(String(seed)))
    const S = 256
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = S * dpr
    canvas.height = S * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    // matte charcoal base — the covers read as dark textured art, amber only hinted
    const tilt = rnd()
    const g0 = ctx.createLinearGradient(0, 0, S, S)
    g0.addColorStop(0, `hsl(${32 + tilt * 8}, 14%, ${8 + tilt * 3}%)`)
    g0.addColorStop(1, `hsl(28, 12%, 6%)`)
    ctx.fillStyle = g0
    ctx.fillRect(0, 0, S, S)

    // 2–3 soft, muted amber blobs — low alpha, lower saturation
    const blobs = 2 + Math.floor(rnd() * 2)
    for (let i = 0; i < blobs; i++) {
      const x = rnd() * S
      const y = rnd() * S
      const r = 60 + rnd() * 130
      const light = 38 + rnd() * 14
      const grd = ctx.createRadialGradient(x, y, 0, x, y, r)
      grd.addColorStop(0, `hsla(${36 + rnd() * 10}, 48%, ${light}%, ${0.16 + rnd() * 0.12})`)
      grd.addColorStop(1, 'hsla(38, 48%, 42%, 0)')
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, S, S)
    }

    // spectrum ridge — a seeded "frequency print", kept subtle
    const bars = 26 + Math.floor(rnd() * 18)
    const bw = S / bars
    ctx.globalCompositeOperation = 'lighter'
    let prev = rnd()
    for (let i = 0; i < bars; i++) {
      prev = prev * 0.55 + rnd() * 0.45
      const h = (0.14 + prev * 0.7) * S
      const x = i * bw
      const alpha = 0.05 + prev * 0.14
      ctx.fillStyle = `hsla(${38 + prev * 10}, 60%, ${50 + prev * 8}%, ${alpha})`
      ctx.fillRect(x + bw * 0.16, S - h, bw * 0.68, h)
    }
    ctx.globalCompositeOperation = 'source-over'

    // fine grain
    const img = ctx.getImageData(0, 0, S, S)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 14
      d[i] += n; d[i + 1] += n; d[i + 2] += n
    }
    ctx.putImageData(img, 0, 0)

    // subtle vignette
    const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, S, S)
  }, [seed])

  return <canvas ref={ref} aria-hidden="true" />
}
