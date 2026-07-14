import React, { useState, useEffect } from 'react'
import { useStore } from '../store.js'

// The three Backline bars — matches the app icon; middle bar is "the sound".
function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i /><i /><i />
    </span>
  )
}

// Titlebar equalizer — animates only while the engine is working.
function Equalizer({ live }) {
  return (
    <span className={`eq ${live ? 'live' : ''}`} aria-hidden="true">
      <span /><span /><span /><span /><span />
    </span>
  )
}

// One honest pill: what the engine is doing right now.
function StatusPill() {
  const engine = useStore((s) => s.engine)
  const jobs = useStore((s) => s.jobs)
  const connected = useStore((s) => s.connected)
  const openDiagnostics = useStore((s) => s.openDiagnostics)

  let cls = 'ok'
  let text = 'Ready'
  if (!connected) { cls = 'err'; text = 'Reconnecting…' }
  else if (engine.status === 'offline') { cls = 'err'; text = 'Engine offline' }
  else if (engine.loading) { cls = 'busy'; text = 'Loading models' }
  else if (engine.initError) { cls = 'err'; text = 'Load failed' }
  else if (engine.models === false) { cls = 'warn'; text = 'Models not loaded' }
  else if (jobs.some((j) => j.status === 'running')) { cls = 'busy'; text = 'Generating' }
  else if (jobs.some((j) => j.status === 'queued')) { cls = 'busy'; text = 'Queued' }

  return (
    <button
      className={`status-pill clickable ${cls}`}
      title="Open diagnostics"
      onClick={() => openDiagnostics(true)}
    >
      {text}
    </button>
  )
}

function PinButton() {
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    window.backline?.isAlwaysOnTop().then(setPinned)
  }, [])
  if (!window.backline) return null
  return (
    <button
      className="icon-btn"
      title={pinned ? 'Unpin from top' : 'Keep on top of Ableton'}
      onClick={() => { window.backline.setAlwaysOnTop(!pinned); setPinned(!pinned) }}
    >
      {pinned ? 'Unpin' : 'Pin'}
    </button>
  )
}

export default function Header() {
  const jobs = useStore((s) => s.jobs)
  const openSettings = useStore((s) => s.openSettings)
  const working = jobs.some((j) => j.status === 'running' || j.status === 'queued')

  return (
    <div className="header">
      <span className="logo" title="Backline">
        <BrandMark />
        <span className="word">Backline</span>
      </span>
      <Equalizer live={working} />

      <span className="spacer" />

      <StatusPill />
      <PinButton />
      <button className="icon-btn" onClick={() => openSettings(true)}>Settings</button>
    </div>
  )
}
