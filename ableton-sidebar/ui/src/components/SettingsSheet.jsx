import React, { useState } from 'react'
import { useStore } from '../store.js'
import { api } from '../api.js'

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)' },
]

export default function SettingsSheet() {
  const settings = useStore((s) => s.settings) || {}
  const saveSettings = useStore((s) => s.saveSettings)
  const openSettings = useStore((s) => s.openSettings)
  const clearHistory = useStore((s) => s.clearHistory)
  const [form, setForm] = useState({
    engineUrl: settings.engineUrl || 'http://127.0.0.1:8001',
    libraryPath: settings.libraryPath || '',
    chatProvider: settings.chatProvider || 'anthropic',
    chatModel: settings.chatModel || '',
    chatApiKey: '', // never echoed back; blank = keep existing
    chatBaseUrl: settings.chatBaseUrl || '',
    hasChatKey: settings.hasChatKey,
  })
  const [testResult, setTestResult] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [loraStatus, setLoraStatus] = useState(null)

  const patch = (p) => setForm((f) => ({ ...f, ...p }))

  const save = () => {
    const out = { ...form }
    if (!out.chatApiKey) delete out.chatApiKey
    delete out.hasChatKey
    saveSettings(out)
  }

  const test = async () => {
    setTestResult('testing…')
    try {
      const r = await api.testEngine()
      setTestResult(r.ok ? `✓ engine online (${r.detail || 'ok'})` : `✗ ${r.detail}`)
    } catch (e) {
      setTestResult(`✗ ${e.message}`)
    }
  }

  return (
    <div className="sheet">
      <div className="sheet-head">
        Settings
        <button className="icon-btn close" onClick={() => openSettings(false)}>✕</button>
      </div>
      <div className="sheet-body">
        <h4>Engine</h4>
        <div className="field">
          <label>ACE-Step API URL</label>
          <input value={form.engineUrl} onChange={(e) => patch({ engineUrl: e.target.value })} />
          <span className="note">
            {testResult || 'The local ACE-Step server this sidebar generates with.'}
          </span>
        </div>
        <button className="btn" onClick={test}>Test connection</button>

        <h4>Library</h4>
        <div className="field">
          <label>Output folder</label>
          <input
            value={form.libraryPath}
            placeholder="(default: ~/Music/ACE-Sidebar — avoid spaces)"
            onChange={(e) => patch({ libraryPath: e.target.value })}
          />
          <span className="note">Add this folder to Live's browser Places for drag &amp; drop.</span>
        </div>

        <h4>Chat assistant</h4>
        <div className="field">
          <label>Provider</label>
          <select value={form.chatProvider} onChange={(e) => patch({ chatProvider: e.target.value })}>
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>API key {form.hasChatKey ? '(saved — leave blank to keep)' : ''}</label>
          <input
            type="password"
            value={form.chatApiKey}
            placeholder={form.hasChatKey ? '••••••••' : 'sk-…'}
            onChange={(e) => patch({ chatApiKey: e.target.value })}
          />
          <span className="note">Stored locally on this machine, never inside your Live set.</span>
        </div>
        <div className="field">
          <label>Model (optional)</label>
          <input
            value={form.chatModel}
            placeholder="provider default"
            onChange={(e) => patch({ chatModel: e.target.value })}
          />
        </div>
        {form.chatProvider === 'custom' && (
          <div className="field">
            <label>Base URL</label>
            <input
              value={form.chatBaseUrl}
              placeholder="https://my-proxy.example/v1"
              onChange={(e) => patch({ chatBaseUrl: e.target.value })}
            />
          </div>
        )}

        <h4>LoRA adapter</h4>
        <div className="field">
          <label>Adapter path</label>
          <input
            value={form.loraPath || ''}
            placeholder="D:\path\to\adapter (folder or .safetensors)"
            onChange={(e) => patch({ loraPath: e.target.value })}
          />
          <span className="note">
            {loraStatus || 'Style adapters trained on your own audio. Applies to every generation while loaded.'}
          </span>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={async () => {
              setLoraStatus('Loading adapter...')
              try {
                await api.lora('load', { lora_path: form.loraPath })
                setLoraStatus('Adapter loaded.')
              } catch (e) { setLoraStatus(e.message) }
            }}
          >
            Load
          </button>
          <button
            className="btn"
            onClick={async () => {
              try { await api.lora('unload'); setLoraStatus('Adapter unloaded.') }
              catch (e) { setLoraStatus(e.message) }
            }}
          >
            Unload
          </button>
          <label>Amount</label>
          <input
            className="control small"
            type="number"
            step={0.1}
            min={0}
            max={2}
            value={form.loraScale ?? 1}
            onChange={(e) => patch({ loraScale: +e.target.value })}
            onBlur={() => api.lora('scale', { scale: form.loraScale ?? 1 }).catch(() => {})}
          />
        </div>

        <h4>History</h4>
        {!confirmClear ? (
          <button className="btn danger" onClick={() => setConfirmClear(true)}>Clear history…</button>
        ) : (
          <div className="field">
            <label>Clear all history?</label>
            <div className="row">
              <button className="btn" onClick={() => { clearHistory(false); setConfirmClear(false) }}>
                Remove entries, keep audio files
              </button>
            </div>
            <div className="row">
              <button className="btn danger" onClick={() => { clearHistory(true); setConfirmClear(false) }}>
                Delete entries + audio files
              </button>
            </div>
            <div className="row">
              <button className="btn" onClick={() => setConfirmClear(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ height: 8 }} />
        <button className="btn primary" onClick={save}>Save settings</button>
      </div>
    </div>
  )
}
