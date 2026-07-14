import React, { useEffect } from 'react'
import { useStore } from '../store.js'
import { api, fileUrl } from '../api.js'
import { TYPES, fmtElapsed } from '../utils.js'
import { smartToggle, usePlayer } from '../player.js'
import Waveform from './Waveform.jsx'
import { dragOutHandler } from '../dragout.js'

// Compact layout embedded directly in Live's device view (~170px tall).
// Everything essential on two rows; chat/history/compare live in the
// expanded floating window (the device's "Expand" button).

function MiniJob({ job }) {
  const cancelJob = useStore((s) => s.cancelJob)
  const p = job.progress
  const pct = p && p.total ? Math.round((p.step / p.total) * 100) : null
  return (
    <div className="mini-card mini-job">
      <div className="mini-name">{job.label}</div>
      <div className="progress-track">
        <div
          className={`progress-fill ${pct == null ? 'indeterminate' : ''}`}
          style={pct != null ? { width: `${pct}%` } : {}}
        />
      </div>
      <div className="mini-meta">{p?.label || (job.status === 'queued' ? 'queued' : 'starting…')}</div>
      <button className="mini-cancel" onClick={() => cancelJob(job.id)}>
        {job.status === 'cancelling' ? '…' : 'Cancel'}
      </button>
    </div>
  )
}

function MiniFailed({ job }) {
  const retryJob = useStore((s) => s.retryJob)
  const dismissJob = useStore((s) => s.dismissJob)
  return (
    <div className="mini-card mini-failed">
      <div className="mini-name">{job.status === 'cancelled' ? 'Cancelled' : 'Failed'}</div>
      <div className="mini-meta" title={job.error}>{job.error || job.label}</div>
      <div className="mini-actions">
        <button onClick={() => retryJob(job, true)}>Retry</button>
        <button onClick={() => dismissJob(job)}>✕</button>
      </div>
    </div>
  )
}

function MiniCard({ output }) {
  const playingId = usePlayer((s) => s.playingId)
  const live = useStore((s) => s.live)
  const isLoop = output.meta?.type === 'loop'
  const isPlaying = playingId === output.id
  return (
    <div
      className={`mini-card ${isPlaying ? 'playing' : ''}`}
      onMouseDown={dragOutHandler(output.id)}
      title="Drag this card into any Ableton track"
    >
      <div className="mini-name">{output.name}</div>
      <div className="mini-wave">
        <Waveform output={output} loop={isLoop} />
      </div>
      <div className="mini-actions">
        <button
          className={isPlaying ? 'on' : ''}
          title={live.connected ? 'Preview (starts on the next bar while Live plays)' : 'Preview'}
          onClick={() => smartToggle(output, fileUrl(output), live.connected)}
        >
          {isPlaying ? 'Stop' : 'Play'}
        </button>
        <button
          title={live.connected ? 'Add to the selected track' : 'Needs Live'}
          onClick={() => api.insertOutput(output.id).catch(() => {})}
        >
          Add
        </button>
      </div>
    </div>
  )
}

export default function StripApp() {
  const init = useStore((s) => s.init)
  const context = useStore((s) => s.context)
  const engine = useStore((s) => s.engine)
  const draft = useStore((s) => s.draft)
  const jobs = useStore((s) => s.jobs)
  const outputs = useStore((s) => s.outputs)
  const patchDraft = useStore((s) => s.patchDraft)
  const generate = useStore((s) => s.generate)

  useEffect(() => { init() }, [])

  const bpm = context.bpmOverride ?? context.bpm
  const key = context.keyOverride ?? context.key
  const sig = context.sigOverride ?? context.sig
  const active = jobs.filter((j) => ['queued', 'running', 'cancelling'].includes(j.status))
  const failed = jobs.filter((j) => ['failed', 'cancelled', 'empty'].includes(j.status))
  const engineOffline = engine.status === 'offline'
  const canGenerate = !engineOffline && draft.prompt.trim()

  return (
    <div className="strip-app">
      <div className="strip-top">
        <span className="strip-logo" title={engineOffline ? 'Engine offline' : 'Engine online'}>
          <span className={`strip-dot ${engineOffline ? 'off' : ''}`} />
          Backline
        </span>
        <span className="strip-ctx">
          {bpm ? Math.round(bpm) : '—'} · {key || 'key?'} · {sig}
        </span>
        <input
          className="strip-prompt"
          placeholder={engineOffline ? 'Engine offline — start the ACE-Step server' : 'Describe a loop, one-shot, stem… (Enter to generate)'}
          value={draft.prompt}
          onChange={(e) => patchDraft({ prompt: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && canGenerate) generate() }}
        />
        <select
          className="control strip-type"
          value={draft.type}
          onChange={(e) => patchDraft({ type: e.target.value })}
        >
          {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <div className="stepper strip-var" title="Variations">
          <button onClick={() => patchDraft({ variations: Math.max(1, draft.variations - 1) })}>−</button>
          <span>{draft.variations}</span>
          <button onClick={() => patchDraft({ variations: Math.min(8, draft.variations + 1) })}>+</button>
        </div>
        <button className="strip-generate" disabled={!canGenerate} onClick={generate}>
          Generate
        </button>
      </div>

      <div className="strip-results">
        {active.map((j) => <MiniJob key={j.id} job={j} />)}
        {failed.map((j) => <MiniFailed key={j.id} job={j} />)}
        {outputs.map((o) => <MiniCard key={o.id} output={o} />)}
        {active.length + failed.length + outputs.length === 0 && (
          <div className="strip-empty">Type a prompt and hit Generate — then drag any result card straight onto a track.</div>
        )}
      </div>
    </div>
  )
}
