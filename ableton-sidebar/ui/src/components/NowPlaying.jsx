import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.js'
import { fileUrl } from '../api.js'
import { usePlayer, toggle, stop, position, duration, level } from '../player.js'
import { fmtTime, TYPE_LABEL } from '../utils.js'
import Waveform from './Waveform.jsx'

// A stereo LED level meter — the signature "this is an audio player" flourish.
const SEG = 14
function Meter({ active }) {
  const ref = useRef(null)
  useEffect(() => {
    let raf
    let smoothed = 0
    const draw = () => {
      const el = ref.current
      if (el) {
        const lv = active ? level() : 0
        // decay for a natural meter fall-off; the two channels drift slightly
        smoothed = Math.max(lv, smoothed * 0.86)
        const segs = el.querySelectorAll('.seg')
        for (const s of segs) {
          const seg = +s.dataset.seg
          const jitter = s.dataset.ch === '1' ? 0.94 : 1
          const lit = Math.round(smoothed * jitter * SEG)
          const on = seg < lit
          s.style.opacity = on ? '1' : '0.1'
          s.style.background = seg >= SEG - 2 ? 'var(--error)' : seg >= SEG - 5 ? 'var(--accent-2)' : 'var(--accent)'
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [active])
  return (
    <div className="pb-meter" ref={ref} aria-hidden="true">
      {[0, 1].map((ch) => (
        <div className="pb-ch" key={ch}>
          {Array.from({ length: SEG }).map((_, i) => <span className="seg" key={i} data-seg={i} data-ch={ch} />)}
        </div>
      ))}
    </div>
  )
}

export default function NowPlaying() {
  const outputs = useStore((s) => s.outputs)
  const playingId = usePlayer((s) => s.playingId)
  const [lastId, setLastId] = useState(null)
  const [clock, setClock] = useState(0)

  useEffect(() => { if (playingId) setLastId(playingId) }, [playingId])

  const isPlaying = !!playingId
  const output = outputs.find((o) => o.id === (playingId || lastId))

  // tick the transport clock while playing
  useEffect(() => {
    if (!isPlaying) return
    let raf
    const tick = () => { setClock(position()); raf = requestAnimationFrame(tick) }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  if (!output) {
    return (
      <div className="player-bar idle">
        <button className="pb-play" disabled>▶</button>
        <span className="pb-name" style={{ color: 'var(--faint)' }}>Nothing playing</span>
        <div className="pb-scrub empty" />
        <span className="pb-time">0:00 / 0:00</span>
      </div>
    )
  }

  const dur = duration(output.id) ?? output.meta?.durationSec ?? 0
  const isLoop = output.meta?.type === 'loop'
  const meta = [
    TYPE_LABEL[output.meta?.type],
    output.meta?.bpm && `${Math.round(output.meta.bpm)} BPM`,
    output.meta?.key,
    isLoop && 'loop',
  ].filter(Boolean).join(' · ')

  return (
    <div className={`player-bar ${isPlaying ? 'live' : ''}`}>
      <button className={`pb-play ${isPlaying ? 'on' : ''}`}
        title={isPlaying ? 'Pause' : 'Play'}
        onClick={() => toggle(output.id, fileUrl(output), { loop: isLoop })}>
        {isPlaying ? '❚❚' : '▶'}
      </button>

      <div className="pb-titles">
        <span className="pb-name" title={output.name}>{output.name}</span>
        <span className="pb-meta">{meta}</span>
      </div>

      <div className="pb-scrub">
        <Waveform output={output} loop={isLoop} />
      </div>

      <span className="pb-time">{fmtTime(clock)} / {fmtTime(dur)}</span>

      <Meter active={isPlaying} />
    </div>
  )
}
