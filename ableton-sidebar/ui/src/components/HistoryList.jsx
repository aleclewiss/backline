import React from 'react'
import { useStore } from '../store.js'
import { api, fileUrl } from '../api.js'
import { toggle } from '../player.js'
import { relDay } from '../utils.js'

export default function HistoryList() {
  const history = useStore((s) => s.history)
  const historyScope = useStore((s) => s.historyScope)
  const setHistoryScope = useStore((s) => s.setHistoryScope)
  const historyQuery = useStore((s) => s.historyQuery)
  const setHistoryQuery = useStore((s) => s.setHistoryQuery)
  const reusePrompt = useStore((s) => s.reusePrompt)

  let lastDay = null

  return (
    <div>
      <div className="row" style={{ marginBottom: 4 }}>
        <select className="control" value={historyScope} onChange={(e) => setHistoryScope(e.target.value)}>
          <option value="project">This project</option>
          <option value="all">All projects</option>
        </select>
      </div>
      <input
        className="history-search"
        placeholder="Search history…"
        value={historyQuery}
        onChange={(e) => setHistoryQuery(e.target.value)}
      />
      {history.length === 0 && <div className="empty-note">Nothing yet.</div>}
      {history.map((h) => {
        const day = relDay(h.createdAt)
        const showDay = day !== lastDay
        lastDay = day
        return (
          <React.Fragment key={h.id}>
            {showDay && <div className="history-day">{day}</div>}
            <div className="history-item">
              <span className="h-name" title={h.prompt}>{h.name}</span>
              <span className="h-meta">
                {h.status === 'done' ? '' : h.status === 'cancelled' ? '✕ cancelled' : '⚠ failed'}
              </span>
              <span className="h-actions">
                {h.status === 'done' && h.outputId && (
                  <button
                    className="icon-btn"
                    title="Preview"
                    onClick={() => toggle(h.outputId, fileUrl({ id: h.outputId, ext: h.ext }), { loop: h.type === 'loop' })}
                  >
                    ▶
                  </button>
                )}
                <button className="icon-btn" title="Reuse prompt" onClick={() => reusePrompt(h)}>↻</button>
                {h.status === 'done' && h.outputId && (
                  <button
                    className="icon-btn"
                    title="Insert to selected track"
                    onClick={() => api.insertOutput(h.outputId).catch(() => {})}
                  >
                    ⤵
                  </button>
                )}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
