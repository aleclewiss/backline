import React from 'react'
import { useStore } from '../store.js'
import { ROLES, MOODS, GENRES } from '../utils.js'

export default function GuidedControls() {
  const guided = useStore((s) => s.draft.guided)
  const patchGuided = useStore((s) => s.patchGuided)

  const toggleMood = (m) => {
    const on = guided.moods.includes(m)
    if (!on && guided.moods.length >= 3) return
    patchGuided({ moods: on ? guided.moods.filter((x) => x !== m) : [...guided.moods, m] })
  }

  return (
    <>
      <div className="chip-row">
        {ROLES.map((r) => (
          <button
            key={r}
            className={`tag-chip ${guided.role === r ? 'on' : ''}`}
            onClick={() => patchGuided({ role: guided.role === r ? null : r })}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="row">
        <label>Genre</label>
        <input
          className="control"
          list="ace-genres"
          style={{ flex: 1 }}
          placeholder="any"
          value={guided.genre}
          onChange={(e) => patchGuided({ genre: e.target.value })}
        />
        <datalist id="ace-genres">
          {GENRES.map((g) => <option key={g} value={g} />)}
        </datalist>
      </div>

      <div className="chip-row">
        {MOODS.map((m) => (
          <button
            key={m}
            className={`tag-chip ${guided.moods.includes(m) ? 'on' : ''}`}
            onClick={() => toggleMood(m)}
            title={guided.moods.length >= 3 && !guided.moods.includes(m) ? 'Max 3 moods' : ''}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="slider-row">
        <label>Energy</label>
        <input
          type="range"
          min="1"
          max="5"
          value={guided.energy}
          onChange={(e) => patchGuided({ energy: +e.target.value })}
        />
        <span style={{ width: 12, textAlign: 'center' }}>{guided.energy}</span>
      </div>
    </>
  )
}
