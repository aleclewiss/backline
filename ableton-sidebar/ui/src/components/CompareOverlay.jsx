import React, { useEffect, useState } from 'react'
import { useStore } from '../store.js'
import { fileUrl } from '../api.js'
import { dragOutHandler } from '../dragout.js'
import { switchTo, toggle, stop, usePlayer } from '../player.js'
import Waveform from './Waveform.jsx'

// Side-by-side variation comparison. Hotkeys 1-8 switch playback between
// variations at the SAME playhead position. Star keepers; optionally delete
// the rest on exit.
export default function CompareOverlay() {
  const compareJobId = useStore((s) => s.compareJobId)
  const openCompare = useStore((s) => s.openCompare)
  const outputs = useStore((s) => s.outputs).filter((o) => o.jobId === compareJobId)
  const starOutput = useStore((s) => s.starOutput)
  const deleteOutput = useStore((s) => s.deleteOutput)
  const playingId = usePlayer((s) => s.playingId)
  const [activeIdx, setActiveIdx] = useState(0)

  const active = outputs[activeIdx]

  useEffect(() => {
    const onKey = (e) => {
      const n = +e.key
      if (n >= 1 && n <= outputs.length) {
        e.preventDefault()
        const idx = n - 1
        setActiveIdx(idx)
        switchTo(outputs[idx].id, fileUrl(outputs[idx]), { loop: outputs[idx].meta?.type === 'loop' })
      }
      if (e.code === 'Space') {
        e.preventDefault()
        if (active) toggle(active.id, fileUrl(active), { loop: active.meta?.type === 'loop' })
      }
      if (e.key === 'Escape') stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [outputs, active])

  const close = () => { stop(); openCompare(null) }

  const deleteUnstarred = () => {
    const unstarred = outputs.filter((o) => !o.starred)
    if (unstarred.length === outputs.length) return // never delete everything silently
    unstarred.forEach((o) => deleteOutput(o.id))
    close()
  }

  const anyStarred = outputs.some((o) => o.starred)

  return (
    <div className="overlay">
      <div className="overlay-head">
        <b>Compare</b>
        <span style={{ color: 'var(--muted)' }}>press 1–{outputs.length} to switch · space to play</span>
        <button className="icon-btn close" onClick={close}>✕</button>
      </div>
      <div className="overlay-body">
        {outputs.map((o, i) => (
          <div
            key={o.id}
            className={`compare-row ${i === activeIdx ? 'active' : ''}`}
            title="Click to audition · drag onto a track to keep"
            onMouseDown={dragOutHandler(o.id)}
            onClick={() => {
              setActiveIdx(i)
              switchTo(o.id, fileUrl(o), { loop: o.meta?.type === 'loop' })
            }}
          >
            <div className="cr-top">
              <span className="hotkey">{i + 1}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</span>
              <button
                className={`star-btn ${o.starred ? 'on' : ''}`}
                onClick={(e) => { e.stopPropagation(); starOutput(o.id, !o.starred) }}
              >
                {o.starred ? '★' : '☆'}
              </button>
              {playingId === o.id && <span style={{ color: 'var(--accent)' }}>▶</span>}
            </div>
            <Waveform output={o} loop={o.meta?.type === 'loop'} />
          </div>
        ))}
      </div>
      <div className="overlay-foot">
        <button onClick={close}>Done</button>
        {anyStarred && (
          <button className="danger" onClick={deleteUnstarred}>
            Keep ★ starred, delete rest
          </button>
        )}
      </div>
    </div>
  )
}
