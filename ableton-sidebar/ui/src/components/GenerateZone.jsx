import React, { useState } from 'react'
import { useStore } from '../store.js'
import { TYPES, TYPE_LABEL, BAR_OPTIONS, compilePrompt } from '../utils.js'
import AdvancedControls from './AdvancedControls.jsx'
import CoverArt from './CoverArt.jsx'

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const SIGS = ['4/4', '3/4', '6/8', '5/4', '7/8', '12/8']
const STRUCTURE = ['[intro]', '[verse]', '[chorus]', '[bridge]', '[outro]']
// Full ACE-Step language set (matches Gradio's VALID_LANGUAGES); 'unknown' is
// shown as "Instrumental / auto" exactly like the Gradio Vocal Language dropdown.
const LANGS = [
  ['unknown', 'Instrumental / auto'],
  ['en', 'English'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean'], ['es', 'Spanish'],
  ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['ru', 'Russian'],
  ['ar', 'Arabic'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['id', 'Indonesian'], ['nl', 'Dutch'],
  ['pl', 'Polish'], ['tr', 'Turkish'], ['vi', 'Vietnamese'], ['th', 'Thai'], ['uk', 'Ukrainian'],
  ['sv', 'Swedish'], ['no', 'Norwegian'], ['da', 'Danish'], ['fi', 'Finnish'], ['el', 'Greek'],
  ['he', 'Hebrew'], ['ro', 'Romanian'], ['cs', 'Czech'], ['sk', 'Slovak'], ['hr', 'Croatian'],
  ['sr', 'Serbian'], ['bg', 'Bulgarian'], ['hu', 'Hungarian'], ['ca', 'Catalan'], ['ms', 'Malay'],
  ['tl', 'Tagalog'], ['ta', 'Tamil'], ['te', 'Telugu'], ['pa', 'Punjabi'], ['ur', 'Urdu'],
  ['fa', 'Persian'], ['sw', 'Swahili'], ['az', 'Azerbaijani'], ['is', 'Icelandic'], ['la', 'Latin'],
  ['lt', 'Lithuanian'], ['ne', 'Nepali'], ['sa', 'Sanskrit'], ['ht', 'Haitian Creole'], ['yue', 'Cantonese'],
]

// A music-parameter card that can follow Live (AUTO) or be pinned manually.
function AutoParam({ label, auto, onToggle, children }) {
  return (
    <div className={`param ${auto ? 'auto' : ''}`}>
      <div className="param-top">
        <span className="param-label">{label}</span>
        <button className={`auto-btn ${auto ? 'on' : ''}`} onClick={onToggle} title="Auto — let the model decide">
          AUTO
        </button>
      </div>
      <div className="param-value">{children}</div>
    </div>
  )
}

export default function GenerateZone() {
  const draft = useStore((s) => s.draft)
  const outputs = useStore((s) => s.outputs)
  const engine = useStore((s) => s.engine)
  const connected = useStore((s) => s.connected)
  const jobs = useStore((s) => s.jobs)
  const patchDraft = useStore((s) => s.patchDraft)
  const patchAdvanced = useStore((s) => s.patchAdvanced)
  const generate = useStore((s) => s.generate)
  const fixIt = useStore((s) => s.fixIt)
  const fixing = useStore((s) => s.fixing)
  const cancelJob = useStore((s) => s.cancelJob)
  const acceptDetectedType = useStore((s) => s.acceptDetectedType)
  const dismissTypeHint = useStore((s) => s.dismissTypeHint)
  const typeConflict = useStore((s) => s.typeConflict())
  const [confirming, setConfirming] = useState(false)
  const [view, setView] = useState('custom') // custom | simple | cover

  const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued')
  const isGenerating = running.length > 0
  const engineOffline = engine.status === 'offline'
  const canGenerate = !engineOffline && draft.prompt.trim()
  const isSong = draft.type === 'song'
  const sourceOp = draft.repaint || draft.cover || draft.extend

  const autoBpm = draft.bpm == null
  const autoKey = draft.key == null
  const autoSig = draft.sig == null
  const autoLang = !draft.advanced.language || draft.advanced.language === 'unknown'

  const [keyRoot, keyScale] = (() => {
    const m = /^([A-G]#?b?)\s*(.*)$/.exec(draft.key || '')
    return m ? [m[1], m[2] || 'major'] : ['A', 'minor']
  })()

  // instrumental only means anything for songs; assets are always instrumental
  const instrumental = !isSong || draft.instrumental !== false
  const lyricsActive = isSong && !instrumental

  const onPromptKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canGenerate) setConfirming(true)
    }
  }

  const insertStructure = (tag) => {
    const cur = draft.advanced.lyrics || ''
    patchAdvanced({ lyrics: cur + (cur && !cur.endsWith('\n') ? '\n' : '') + tag + '\n' })
  }

  const simple = view === 'simple'

  return (
    <div className="composer">
      {!connected && (
        <div className="banner">Lost the sidecar server — reconnecting… (what you see may be stale)</div>
      )}
      {engineOffline && (
        <div className="banner">
          <span>
            Engine offline — it should relaunch by itself in a moment.
            {engine.detail ? <span style={{ display: 'block', fontWeight: 400, opacity: 0.8 }}>{engine.detail}</span> : null}
          </span>
          <button className="fix-btn" disabled={fixing} onClick={() => fixIt()}>{fixing ? 'Fixing…' : '⚡ Fix it'}</button>
          <button onClick={() => useStore.getState().openDiagnostics(true)}>Details</button>
        </div>
      )}
      {!engineOffline && engine.initError && (
        <div className="banner">
          Model load failed: {engine.initError}
          <button className="fix-btn" disabled={fixing} onClick={() => fixIt()}>{fixing ? 'Fixing…' : '⚡ Fix it'}</button>
          <button onClick={() => useStore.getState().openDiagnostics(true)}>Details</button>
        </div>
      )}
      {!engineOffline && !engine.initError && engine.models === false && (
        <div className="banner info">
          {engine.loading
            ? 'Loading models — a few minutes, one time per session.'
            : 'Engine is idle. Load the models to start generating.'}
          {!engine.loading && <button onClick={() => useStore.getState().initEngine()}>Load models</button>}
        </div>
      )}

      {/* mode + type + enhance */}
      <div className="composer-top">
        <div className="segment">
          {['custom', 'simple', 'cover'].map((m) => (
            <button key={m} className={view === m ? 'on' : ''} onClick={() => setView(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <select className="control" value={draft.type} onChange={(e) => patchDraft({ type: e.target.value })}>
          {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <button
          className={`toggle ${draft.autoTags !== false ? 'on' : ''}`}
          title="Enhance — add type/tempo/key hints to your tags"
          onClick={() => patchDraft({ autoTags: draft.autoTags === false })}
        >
          <span className="dot" /> Enhance
        </button>

        <label className={`tag-chip ${draft.cover?.ref ? 'on' : ''}`} style={{ cursor: 'pointer' }}
          title="Add a reference song — the model keeps its melody/structure and restyles to your caption">
          {draft.cover?.ref ? '♪ Reference set' : '+ Reference audio'}
          <input type="file" accept="audio/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) useStore.getState().addReference(f); e.target.value = '' }} />
        </label>

        <span style={{ flex: 1 }} />

        <span className="param-label" style={{ alignSelf: 'center' }}>Takes</span>
        <div className="stepper">
          <button onClick={() => patchDraft({ variations: Math.max(1, draft.variations - 1) })}>−</button>
          <span>{draft.variations}</span>
          <button onClick={() => patchDraft({ variations: Math.min(8, draft.variations + 1) })}>+</button>
        </div>
      </div>

      {/* source-op hints */}
      {draft.repaint && (
        <div className="hint">
          Repainting {draft.repaint.name} — from
          <input className="control small" type="number" min={0} value={draft.repaint.start}
            onChange={(e) => useStore.getState().patchRepaint({ start: +e.target.value })} />
          to
          <input className="control small" type="number" min={0} placeholder="end" value={draft.repaint.end ?? ''}
            onChange={(e) => useStore.getState().patchRepaint({ end: e.target.value === '' ? null : +e.target.value })} />
          s
          <button className="link dismiss" onClick={() => useStore.getState().clearSourceOps()}>Cancel</button>
        </div>
      )}
      {draft.cover && (
        <div className="hint">
          {draft.cover.ref ? '♪ Reference: ' : 'Restyling '}{draft.cover.name} — keep
          <select className="control" value={draft.cover.strength}
            onChange={(e) => useStore.getState().patchCover({ strength: +e.target.value })}>
            <option value={0.4}>most of the original</option>
            <option value={0.7}>the groove, change the sound</option>
            <option value={1.0}>only the outline</option>
          </select>
          <button className="link dismiss" onClick={() => useStore.getState().clearSourceOps()}>
            {draft.cover.ref ? 'Remove' : 'Cancel'}
          </button>
        </div>
      )}
      {draft.extend && (
        <div className="hint">
          Extending {draft.extend.name} by
          <select className="control" value={draft.extend.addBars}
            onChange={(e) => useStore.getState().patchExtend({ addBars: +e.target.value })}>
            {[2, 4, 8, 16].map((b) => <option key={b} value={b}>{b} bars</option>)}
          </select>
          <button className="link dismiss" onClick={() => useStore.getState().clearSourceOps()}>Cancel</button>
        </div>
      )}
      {view === 'cover' && !sourceOp && (
        outputs.length ? (
          <div>
            <div className="editor-head" style={{ marginBottom: 8 }}><span>Pick a clip to restyle</span></div>
            <div className="source-picker">
              {outputs.slice(0, 8).map((o) => (
                <div key={o.id} className="source-chip" title={`Restyle ${o.name}`}
                  onClick={() => useStore.getState().startCover(o)}>
                  <div className="sc-art"><CoverArt seed={o.meta?.seed ?? o.id} /></div>
                  <div className="sc-name">{o.name}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="hint">Generate a clip first — then Cover mode lets you restyle it into a new sound.</div>
        )
      )}

      {/* dual editors */}
      <div className="editors">
        <div className="editor">
          <div className="editor-head"><span>Tags — style &amp; sound</span></div>
          <div className="field-box">
            <textarea
              className="tags prompt-input"
              placeholder={
                draft.repaint ? 'Describe what this section should become'
                  : draft.cover ? 'Describe the new style for this clip'
                    : draft.extend ? 'Optional: steer where the continuation goes'
                      : 'instrument, feel, character, genre…'
              }
              value={draft.prompt}
              onChange={(e) => patchDraft({ prompt: e.target.value })}
              onKeyDown={onPromptKey}
            />
          </div>
          {draft.prompt.trim() && draft.autoTags !== false && !sourceOp && (
            <div className="compiled-preview" title="What will be sent — click to copy"
              onClick={() => navigator.clipboard.writeText(compilePrompt(draft))}>
              {compilePrompt(draft)}
            </div>
          )}
          {typeConflict && (
            <div className="hint">
              Sounds like a {TYPE_LABEL[typeConflict]}.
              <button className="link" onClick={() => acceptDetectedType(typeConflict)}>Switch</button>
              <button className="link dismiss" onClick={dismissTypeHint}>Dismiss</button>
            </div>
          )}
        </div>

        {!simple && (
          <div className="editor">
            <div className="editor-head">
              <span>Lyrics</span>
              <span className="grow" />
              {lyricsActive && STRUCTURE.map((t) => (
                <span key={t} className="tagbar" style={{ display: 'inline' }}>
                  <button onClick={() => insertStructure(t)}>{t}</button>
                </span>
              ))}
            </div>
            <div className={`field-box ${lyricsActive ? '' : 'disabled'}`}>
              <textarea
                className="lyrics"
                placeholder={isSong ? '[verse]\n…\n[chorus]\n…' : 'Only full songs have vocals'}
                value={draft.advanced.lyrics}
                onChange={(e) => patchAdvanced({ lyrics: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      {/* music params */}
      {!simple && (
        <div className="params">
          <AutoParam label="Tempo" auto={autoBpm}
            onToggle={() => patchDraft({ bpm: autoBpm ? 120 : null })}>
            {autoBpm
              ? <span style={{ fontSize: 15 }}>Auto</span>
              : <input type="number" min="20" max="300" value={draft.bpm}
                  onChange={(e) => patchDraft({ bpm: +e.target.value })} />}
          </AutoParam>

          <AutoParam label="Key" auto={autoKey}
            onToggle={() => patchDraft({ key: autoKey ? 'A minor' : null })}>
            {autoKey
              ? <span style={{ fontSize: 15 }}>Auto</span>
              : (
                <span style={{ display: 'flex', gap: 4 }}>
                  <select value={keyRoot} onChange={(e) => patchDraft({ key: `${e.target.value} ${keyScale.includes('min') ? 'minor' : 'major'}` })}>
                    {KEYS.map((k) => <option key={k}>{k}</option>)}
                  </select>
                  <select value={keyScale.includes('min') ? 'minor' : 'major'} onChange={(e) => patchDraft({ key: `${keyRoot} ${e.target.value}` })}>
                    <option>major</option><option>minor</option>
                  </select>
                </span>
              )}
          </AutoParam>

          <AutoParam label="Time" auto={autoSig}
            onToggle={() => patchDraft({ sig: autoSig ? '4/4' : null })}>
            {autoSig
              ? <span style={{ fontSize: 15 }}>Auto</span>
              : <select value={draft.sig || '4/4'} onChange={(e) => patchDraft({ sig: e.target.value })}>
                  {SIGS.map((s) => <option key={s}>{s}</option>)}
                </select>}
          </AutoParam>

          <div className="param">
            <div className="param-top"><span className="param-label">Length</span></div>
            <div className="param-value">
              {isSong ? (
                <select value={draft.durationSec} onChange={(e) => patchDraft({ durationSec: +e.target.value })}>
                  <option value={60}>1:00</option><option value={120}>2:00</option>
                  <option value={180}>3:00</option><option value={240}>4:00</option>
                </select>
              ) : draft.type === 'oneshot' ? (
                <span style={{ fontSize: 15, color: 'var(--muted)' }}>one hit</span>
              ) : (
                <select value={draft.lengthBars} onChange={(e) => patchDraft({ lengthBars: +e.target.value })}>
                  {BAR_OPTIONS.map((b) => <option key={b} value={b}>{b} bar{b > 1 ? 's' : ''}</option>)}
                </select>
              )}
            </div>
          </div>

          {isSong && (
            <div className="param">
              <div className="param-top"><span className="param-label">Vocals</span></div>
              <div className="param-value">
                <button
                  className={`toggle ${instrumental ? '' : 'on'}`}
                  style={{ padding: '5px 12px', fontSize: 12 }}
                  title="Instrumental = no vocals"
                  onClick={() => {
                    const next = !instrumental
                    patchDraft({ instrumental: next })
                    if (next) patchAdvanced({ lyrics: '' })
                  }}
                >
                  <span className="dot" /> {instrumental ? 'Instrumental' : 'Vocals on'}
                </button>
              </div>
            </div>
          )}

          {lyricsActive && (
            <AutoParam label="Vocal language" auto={autoLang}
              onToggle={() => patchAdvanced({ language: autoLang ? 'en' : 'unknown' })}>
              {autoLang
                ? <span style={{ fontSize: 15 }}>Auto</span>
                : (
                  <select value={draft.advanced.language} onChange={(e) => patchAdvanced({ language: e.target.value })}>
                    {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
            </AutoParam>
          )}
        </div>
      )}

      {!simple && <AdvancedControls />}

      {/* generate */}
      {isGenerating ? (
        <div className="generate-row">
          <button className="generate-btn cancel" onClick={() => running.forEach((j) => cancelJob(j.id))}>
            Cancel{running.length > 1 ? ` all (${running.length})` : ''}
          </button>
        </div>
      ) : confirming ? (
        <div className="confirm-bar">
          <span className="summary">
            {autoBpm ? 'auto bpm' : `${draft.bpm} bpm`} · {draft.key || 'auto key'} · {draft.sig || '4/4'}
            {!isSong ? ` · ${draft.lengthBars} bars` : ''} · {draft.variations} take{draft.variations > 1 ? 's' : ''}
          </span>
          <span className="actions">
            <button className="btn" onClick={() => setConfirming(false)}>Back</button>
            <button className="btn primary" onClick={() => { setConfirming(false); generate() }}>Confirm</button>
          </span>
        </div>
      ) : (
        <div className="generate-row">
          <button
            className="generate-btn"
            disabled={!canGenerate && !draft.extend}
            title={engineOffline ? 'Engine offline' : !canGenerate && !draft.extend ? 'Describe the sound first' : ''}
            onClick={() => setConfirming(true)}
          >
            Generate
          </button>
        </div>
      )}
    </div>
  )
}
