import React, { useEffect } from 'react'
import { useStore } from './store.js'
import StripApp from './components/StripApp.jsx'
import Header from './components/Header.jsx'
import GenerateZone from './components/GenerateZone.jsx'
import NowPlaying from './components/NowPlaying.jsx'
import ChatSide from './components/ChatSide.jsx'
import Results from './components/Results.jsx'
import CompareOverlay from './components/CompareOverlay.jsx'
import SettingsSheet from './components/SettingsSheet.jsx'
import DiagnosticsSheet from './components/DiagnosticsSheet.jsx'

export default function App() {
  // ?strip=1 → compact layout embedded in Live's device view
  if (new URLSearchParams(location.search).has('strip')) return <StripApp />
  return <FullApp />
}

function FullApp() {
  const init = useStore((s) => s.init)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const diagnosticsOpen = useStore((s) => s.diagnosticsOpen)
  const compareJobId = useStore((s) => s.compareJobId)

  useEffect(() => {
    init()
  }, [])

  // Ctrl+Alt+G (global, via the window manager) lands here: focus the prompt.
  useEffect(() => {
    const onFocus = () => document.querySelector('.prompt-input, .strip-prompt')?.focus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Shortcuts: Cmd/Ctrl+L focuses prompt, Esc closes overlays / tucks panel.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        document.querySelector('.prompt-input')?.focus()
      }
      if (e.key === 'Escape') {
        const st = useStore.getState()
        if (st.compareJobId) st.openCompare(null)
        else if (st.settingsOpen) st.openSettings(false)
        else if (typeof window.max !== 'undefined') {
          import('./api.js').then(({ api }) => api.drawer('collapse').catch(() => {}))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app" style={{ position: 'relative' }}>
      <Header />
      <div className="body">
        <Results />
        <div className="content">
          <div className="content-scroll">
            <div className="studio">
              <GenerateZone />
            </div>
          </div>
          <NowPlaying />
        </div>
        <ChatSide />
      </div>
      {compareJobId && <CompareOverlay />}
      {settingsOpen && <SettingsSheet />}
      {diagnosticsOpen && <DiagnosticsSheet />}
    </div>
  )
}
