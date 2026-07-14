import React, { useEffect, useRef, useState } from 'react'
import { fileUrl } from '../api.js'
import { loadBuffer, peaks, duration, position, seek, usePlayer } from '../player.js'

// Canvas waveform with playhead + click-to-seek. Decodes lazily on mount.
export default function Waveform({ output, loop }) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const playingId = usePlayer((s) => s.playingId)
  const isPlaying = playingId === output.id

  useEffect(() => {
    let alive = true
    loadBuffer(output.id, fileUrl(output))
      .then(() => alive && setReady(true))
      .catch(() => {})
    return () => { alive = false }
  }, [output.id])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    let raf

    const draw = () => {
      try {
        drawInner()
      } catch { /* never let a paint error take down the app */ }
    }
    const drawInner = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const pk = ready ? peaks(output.id) : null
      const n = pk ? pk.length : 48
      const barW = w / n
      const dur = ready ? duration(output.id) : null
      const playFrac = isPlaying && dur ? position() / dur : -1

      for (let i = 0; i < n; i++) {
        const amp = pk ? Math.max(0.05, pk[i]) : 0.07
        const bh = amp * (h - 6)
        const x = i * barW
        const played = playFrac >= 0 && i / n <= playFrac
        ctx.fillStyle = played ? '#ecc270' : ready ? 'rgba(211,162,76,0.55)' : 'rgba(236,230,218,0.22)'
        const bw = Math.max(1.5, barW - 2)
        // plain rects: ctx.roundRect needs Chrome 99+, jweb in Live 11 is Chrome 90
        ctx.fillRect(x + 1, (h - bh) / 2, bw, bh)
      }

      if (playFrac >= 0) {
        ctx.fillStyle = '#ecc270'
        ctx.fillRect(playFrac * w, 0, 1.5, h)
      }
      if (isPlaying) raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [ready, isPlaying, output.id])

  const onClick = (e) => {
    if (!ready) return
    const rect = canvasRef.current.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    seek(output.id, fileUrl(output), Math.min(0.999, Math.max(0, frac)), { loop })
  }

  return (
    <div className="wave-wrap" onClick={onClick} title="Click to seek">
      <canvas ref={canvasRef} />
    </div>
  )
}
