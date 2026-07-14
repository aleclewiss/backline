import React, { useEffect, useState } from 'react'
import { useStore } from '../store.js'
import { showToast } from '../dragout.js'
import { fmtElapsed } from '../utils.js'
import OutputCard from './OutputCard.jsx'
import HistoryList from './HistoryList.jsx'

function JobRow({ job }) {
  const cancelJob = useStore((s) => s.cancelJob)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const p = job.progress
  const pct = p && p.total ? Math.round((p.step / p.total) * 100) : null
  const step = job.status === 'queued'
    ? 'Waiting…'
    : p && p.total === 100
      ? `${p.label || 'working'} · ${p.step}%`
      : p && p.total
        ? `${p.label} ${p.step}/${p.total}`
        : p?.label || 'Starting…'

  return (
    <div className="track track-job">
      <span className="t-play"><span className="t-spin" /></span>
      <div className="t-art shimmer" />
      <div className="t-main">
        <span className="t-name" title={job.label}>{job.label}</span>
        <div className="progress-track">
          <div className={`progress-fill ${pct == null ? 'indeterminate' : ''}`} style={pct != null ? { width: `${pct}%` } : {}} />
        </div>
        <span className="t-sub">{step}{job.variations > 1 && p?.variation ? ` · take ${p.variation}/${job.variations}` : ''}</span>
      </div>
      <div className="t-end">
        {job.startedAt && <span className="t-dur">{fmtElapsed(job.startedAt)}</span>}
        <button className="cancel-btn" onClick={() => cancelJob(job.id)} disabled={job.status === 'cancelling'}>
          {job.status === 'cancelling' ? '…' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}

function FailedCard({ job }) {
  const retryJob = useStore((s) => s.retryJob)
  const dismissJob = useStore((s) => s.dismissJob)
  const fixIt = useStore((s) => s.fixIt)
  const fixing = useStore((s) => s.fixing)
  const cancelled = job.status === 'cancelled'
  const empty = job.status === 'empty'
  return (
    <div className="error-card">
      <div className="err-title">{cancelled ? 'Cancelled' : empty ? 'Result was empty' : 'Generation failed'}</div>
      <div style={{ color: 'var(--muted)' }}>
        {cancelled ? job.label
          : empty ? 'This usually means the prompt was too vague or settings conflicted.'
            : job.error || 'Unknown error'}
      </div>
      {!cancelled && job.errorDetail && (
        <details><summary>Details</summary><pre>{job.errorDetail}</pre></details>
      )}
      <div className="err-actions">
        {!cancelled && <button className="fix-btn" disabled={fixing} onClick={() => fixIt(job)}>{fixing ? 'Fixing…' : '⚡ Fix it'}</button>}
        <button onClick={() => retryJob(job, false)}>Retry</button>
        {!cancelled && <button onClick={() => retryJob(job, true)}>Retry new seed</button>}
        {!cancelled && (
          <button onClick={() => {
            navigator.clipboard.writeText(`${job.error || ''}\n${job.errorDetail || ''}`.trim())
            showToast('Error copied')
          }}>Copy</button>
        )}
        {!cancelled && <button onClick={() => useStore.getState().openDiagnostics(true)}>Diagnostics</button>}
        <button onClick={() => dismissJob(job)} style={{ marginLeft: 'auto' }}>Dismiss</button>
      </div>
    </div>
  )
}

export default function Results() {
  const jobs = useStore((s) => s.jobs)
  const outputs = useStore((s) => s.outputs)
  const historyOpen = useStore((s) => s.historyOpen)
  const toggleHistory = useStore((s) => s.toggleHistory)
  const history = useStore((s) => s.history)
  const openCompare = useStore((s) => s.openCompare)

  const active = jobs.filter((j) => ['queued', 'running', 'cancelling'].includes(j.status))
  const failed = jobs.filter((j) => ['failed', 'cancelled', 'empty'].includes(j.status))

  // Group outputs by job, newest first.
  const byJob = []
  const seen = new Set()
  for (const o of outputs) {
    if (seen.has(o.jobId)) continue
    seen.add(o.jobId)
    byJob.push({ jobId: o.jobId, outputs: outputs.filter((x) => x.jobId === o.jobId) })
  }

  const empty = active.length === 0 && failed.length === 0 && outputs.length === 0

  return (
    <div className="side side-results">
      <div className="side-head">
        <span>Results</span>
        <span className="count">{outputs.length}</span>
      </div>
      <div className="side-scroll">
        <div className="track-list">
          {active.map((j) => <JobRow key={j.id} job={j} />)}
          {failed.map((j) => <FailedCard key={j.id} job={j} />)}
          {(() => {
            let n = 0
            return byJob.map((g) => (
              <React.Fragment key={g.jobId}>
                {g.outputs.length > 1 && (
                  <div className="track-group">
                    <span>{g.outputs.length} takes</span>
                    <button className="compare-btn" onClick={() => openCompare(g.jobId)}>Compare</button>
                  </div>
                )}
                {g.outputs.map((o) => <OutputCard key={o.id} output={o} index={++n} />)}
              </React.Fragment>
            ))
          })()}
          {empty && <div className="empty-note">Your takes appear here.<br />Describe a sound and hit Generate.</div>}
        </div>

        <button className="section-head" onClick={toggleHistory} style={{ marginTop: 10 }}>
          {historyOpen ? '▾' : '▸'} History <span className="count">({history.length})</span>
        </button>
        {historyOpen && <HistoryList />}
      </div>
    </div>
  )
}
