import React, { useState, useRef, useEffect } from 'react'
import { useStore } from '../store.js'
import { fileUrl } from '../api.js'
import { api } from '../api.js'
import { smartToggle, usePlayer } from '../player.js'
import { fmtTime, TYPE_LABEL } from '../utils.js'
import CoverArt from './CoverArt.jsx'
import { dragOutHandler, nativeDragStart } from '../dragout.js'

// Save the rendered audio file to the user's machine.
function downloadOutput(o) {
  const a = document.createElement('a')
  a.href = fileUrl(o)
  a.download = (o.name || 'clip') + (o.ext || '.wav')
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function Menu({ output, onClose }) {
  const ref = useRef(null)
  const deleteOutput = useStore((s) => s.deleteOutput)
  const reusePrompt = useStore((s) => s.reusePrompt)

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div className="menu" ref={ref}>
      <button onClick={() => { useStore.getState().improveOutput(output); onClose() }}>✨ Improve &amp; regenerate</button>
      <hr />
      <button onClick={() => { useStore.getState().startRepaint(output); onClose() }}>Repaint a section</button>
      <button onClick={() => { useStore.getState().startCover(output); onClose() }}>Restyle (cover)</button>
      <button onClick={() => { useStore.getState().startExtend(output); onClose() }}>Extend</button>
      <button onClick={() => { reusePrompt(output.historyEntry || { draft: output.draft }); onClose() }}>Reuse prompt</button>
      <button onClick={() => { api.revealOutput(output.id).catch(() => {}); onClose() }}>Reveal file</button>
      <hr />
      <button className="danger" onClick={() => { deleteOutput(output.id); onClose() }}>Delete</button>
    </div>
  )
}

// A Spotify-style track row: index/play · cover · name+meta · duration · actions.
export default function OutputCard({ output, index }) {
  const renameOutput = useStore((s) => s.renameOutput)
  const starOutput = useStore((s) => s.starOutput)
  const playingId = usePlayer((s) => s.playingId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [name, setName] = useState(output.name)
  const nameTimer = useRef(null)

  useEffect(() => setName(output.name), [output.name])

  const isPlaying = playingId === output.id
  const isLoop = output.meta?.type === 'loop'

  const onNameChange = (e) => {
    setName(e.target.value)
    clearTimeout(nameTimer.current)
    nameTimer.current = setTimeout(() => renameOutput(output.id, e.target.value.trim() || output.name), 500)
  }

  const play = () => smartToggle(output, fileUrl(output), false)

  const sub = [
    TYPE_LABEL[output.meta?.type],
    output.meta?.bpm && `${Math.round(output.meta.bpm)} bpm`,
    output.meta?.key,
    isLoop && 'loop',
  ].filter(Boolean).join(' · ')

  const dur = output.meta?.durationSec

  return (
    <div
      className={`track ${isPlaying ? 'playing' : ''}`}
      draggable={!!window.backline}
      onDragStart={nativeDragStart(output)}
      onMouseDown={dragOutHandler(output)}
      title="Drag the audio file out, or use Download"
    >
      <button className="t-play" onClick={play} title={isPlaying ? 'Pause' : 'Play'}>
        <span className="t-num">{index}</span>
        <span className="t-ico">{isPlaying ? '❚❚' : '▶'}</span>
      </button>

      <div className="t-art"><CoverArt seed={output.meta?.seed ?? output.id} /></div>

      <div className="t-main">
        <input className="t-name" value={name} onChange={onNameChange} spellCheck={false}
          onMouseDown={(e) => e.stopPropagation()} />
        <span className="t-sub">{sub}</span>
      </div>

      <div className="t-end">
        <button className={`t-star ${output.starred ? 'on' : ''}`} title="Star"
          onClick={() => starOutput(output.id, !output.starred)}>
          {output.starred ? '★' : '☆'}
        </button>
        <span className="t-dur">{dur ? fmtTime(dur) : ''}</span>
        <div className="t-actions">
          <button className="t-add" title="Download" onClick={() => downloadOutput(output)}>⤓</button>
          <div className="menu-anchor">
            <button title="More" onClick={() => setMenuOpen(!menuOpen)}>⋮</button>
            {menuOpen && <Menu output={output} onClose={() => setMenuOpen(false)} />}
          </div>
        </div>
      </div>
    </div>
  )
}
