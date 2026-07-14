import React, { useEffect, useState } from 'react'
import { useStore } from '../store.js'
import { api } from '../api.js'
import { showToast } from '../dragout.js'

// Everything needed to see (or report) what went wrong, without leaving the
// app: engine/link status, the sidecar's recent log, and the engine's own
// stdout/stderr tails — plus one button that copies it all as a report.

function fmtTs(ts) {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8)
}

export default function DiagnosticsSheet() {
  const openDiagnostics = useStore((s) => s.openDiagnostics)
  const engine = useStore((s) => s.engine)
  const live = useStore((s) => s.live)
  const connected = useStore((s) => s.connected)
  const settings = useStore((s) => s.settings)
  const [logs, setLogs] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => api.getLogs(300)
      .then((l) => { if (alive) { setLogs(l); setFailed(false) } })
      .catch(() => { if (alive) setFailed(true) })
    load()
    const t = setInterval(load, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const copyReport = () => {
    const lines = [
      `Backline diagnostic report — ${new Date().toISOString()}`,
      `Sidecar link: ${connected ? 'connected' : 'DISCONNECTED'}`,
      `Engine: ${engine.status}${engine.models ? ' (models loaded)' : ' (models NOT loaded)'}`,
      engine.detail ? `Engine detail: ${engine.detail}` : null,
      engine.initError ? `Model load error: ${engine.initError}` : null,
      `Engine URL: ${settings?.engineUrl || 'default'}`,
      `Ableton link: ${live.connected ? 'connected' : 'not connected'}`,
      '',
      '--- sidecar log ---',
      ...(logs?.sidecar || []).map((e) =>
        `${fmtTs(e.ts)} ${e.level.toUpperCase()} [${e.tag}] ${e.message}${e.detail ? `\n    ${e.detail}` : ''}`),
      '',
      '--- engine stderr (tail) ---',
      logs?.engineErr || '(empty)',
      '',
      '--- engine stdout (tail) ---',
      logs?.engineOut || '(empty)',
    ].filter((x) => x != null)
    navigator.clipboard.writeText(lines.join('\n'))
    showToast('Report copied — paste it anywhere')
  }

  return (
    <div className="sheet">
      <div className="sheet-head">
        Diagnostics
        <button className="icon-btn close" onClick={() => openDiagnostics(false)}>Close</button>
      </div>
      <div className="sheet-body">
        <dl className="diag-grid">
          <dt>Sidecar link</dt>
          <dd className={connected ? '' : 'err'}>{connected ? 'Connected' : 'Disconnected — reconnecting…'}</dd>
          <dt>Engine</dt>
          <dd className={engine.status === 'online' ? '' : 'err'}>
            {engine.status}{engine.status === 'online' && !engine.models ? ' — models not loaded' : ''}
            {engine.detail ? ` · ${engine.detail}` : ''}
          </dd>
          {engine.initError && (<><dt>Model load</dt><dd className="err">{engine.initError}</dd></>)}
          <dt>Ableton link</dt>
          <dd>{live.connected ? `Connected (${live.projectName || 'project'})` : 'Not connected'}</dd>
        </dl>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0 }}>Recent activity</h4>
          <button className="btn" onClick={copyReport}>Copy full report</button>
        </div>

        {failed && <div className="banner">Can't reach the sidecar to load logs.</div>}
        <div className="diag-log">
          {(logs?.sidecar || []).length === 0 && !failed && 'Nothing logged yet this session.'}
          {(logs?.sidecar || []).map((e, i) => (
            <div key={i} className={`lvl-${e.level}`}>
              {fmtTs(e.ts)} [{e.tag}] {e.message}{e.detail ? `\n    ${e.detail}` : ''}
            </div>
          ))}
        </div>

        {logs?.engineErr ? (
          <>
            <h4>Engine log (stderr tail)</h4>
            <div className="diag-log">{logs.engineErr}</div>
          </>
        ) : null}

        {window.backline && (
          <button className="btn" onClick={() => window.backline.openLogs()}>
            Open logs folder
          </button>
        )}
      </div>
    </div>
  )
}
