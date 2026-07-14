import React, { useState } from 'react'
import { useStore } from '../store.js'

// Single collapsed "More options" section — everything optional lives here.
export default function AdvancedControls() {
  const [open, setOpen] = useState(false)
  const adv = useStore((s) => s.draft.advanced)
  const patchAdvanced = useStore((s) => s.patchAdvanced)
  const resetAdvanced = useStore((s) => s.resetAdvanced)

  return (
    <div className="accordion">
      <button className="accordion-head" onClick={() => setOpen(!open)}>
        <span>More options</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="accordion-body">
          <div className="row">
            <label style={{ width: 64 }}>Seed</label>
            <input
              className="control"
              style={{ width: 110 }}
              type="number"
              placeholder="random"
              value={adv.seed ?? ''}
              onChange={(e) => patchAdvanced({ seed: e.target.value === '' ? null : +e.target.value })}
            />
            <button
              className={`tag-chip ${adv.seedLocked ? 'on' : ''}`}
              title="Keep this seed across generations — same seed keeps the same character"
              onClick={() => patchAdvanced({ seedLocked: !adv.seedLocked })}
            >
              {adv.seedLocked ? 'Locked' : 'Lock'}
            </button>
          </div>

          <div className="row">
            <label style={{ width: 64 }}>Steps</label>
            <input
              className="control small"
              type="number"
              min={1}
              max={200}
              placeholder="auto"
              value={adv.steps ?? ''}
              onChange={(e) => patchAdvanced({ steps: e.target.value === '' ? null : +e.target.value })}
            />
            <label>Guidance</label>
            <input
              className="control small"
              type="number"
              step={0.5}
              min={0}
              max={30}
              placeholder="auto"
              value={adv.guidance ?? ''}
              onChange={(e) => patchAdvanced({ guidance: e.target.value === '' ? null : +e.target.value })}
            />
            <label>Shift</label>
            <input
              className="control small"
              type="number"
              step={0.5}
              min={1}
              max={5}
              placeholder="auto"
              value={adv.shift ?? ''}
              onChange={(e) => patchAdvanced({ shift: e.target.value === '' ? null : +e.target.value })}
            />
          </div>

          <div className="row">
            <label style={{ width: 64 }}>Sampler</label>
            <select
              className="control"
              value={adv.inferMethod || 'ode'}
              onChange={(e) => patchAdvanced({ inferMethod: e.target.value })}
            >
              <option value="ode">ODE (clean)</option>
              <option value="sde">SDE (textured)</option>
            </select>
            <label>Format</label>
            <select className="control" value={adv.format} onChange={(e) => patchAdvanced({ format: e.target.value })}>
              <option value="wav">WAV</option>
              <option value="flac">FLAC</option>
              <option value="mp3">MP3</option>
            </select>
          </div>

          <button className="reset-link" onClick={resetAdvanced}>Reset to defaults</button>
        </div>
      )}
    </div>
  )
}
