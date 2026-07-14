import React from 'react'
import { useStore } from '../store.js'

const MODES = [
  { id: 'quick', label: 'Quick' },
  { id: 'guided', label: 'Guided' },
  { id: 'advanced', label: 'Advanced' },
]

export default function ModeTabs() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  return (
    <div className="mode-tabs">
      {MODES.map((m) => (
        <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>
          {m.label}
        </button>
      ))}
    </div>
  )
}
