import { create } from 'zustand'
import { api, subscribeEvents } from './api.js'
import { compilePrompt, draftDuration, detectTypeInPrompt, improveCaption } from './utils.js'
import { evict } from './player.js'
import { showToast } from './dragout.js'

// User actions must never fail silently: surface the reason, keep going.
const surface = (what) => (e) => showToast(`${what} failed — ${e.message}`)

const DEFAULT_ADVANCED = {
  steps: null, // null = engine default
  guidance: null,
  shift: null,
  inferMethod: 'ode',
  language: 'unknown', // 'unknown' = Instrumental / auto (model decides), like Gradio
  seed: null,
  seedLocked: false,
  scheduler: null,
  format: 'wav',
  sampleRate: 48000,
  lyrics: '',
  autoWarp: true,
  loopCrossfade: true,
  referenceFile: null,
}

const DEFAULT_DRAFT = {
  prompt: '',
  type: 'loop',
  autoTags: true,
  instrumental: true,
  hq: true,
  bpm: null, // null = AUTO (model decides)
  key: null, // null = AUTO
  sig: null, // null = AUTO (defaults to 4/4 at render)
  repaint: null, // { outputId, file, name, start, end, strength }
  cover: null,   // { outputId, file, name, strength }
  extend: null,  // { outputId, file, name, srcDuration, addBars }
  variations: 2,
  lengthBars: 4,
  durationSec: 120,
  guided: { role: null, genre: '', moods: [], energy: 3 },
  advanced: { ...DEFAULT_ADVANCED },
}

export const useStore = create((set, get) => ({
  // ---- server-synced state ----
  engine: { status: 'connecting' }, // connecting | online | offline
  live: { connected: false },
  context: { bpm: 120, key: null, sig: '4/4', bpmOverride: null, keyOverride: null, sigOverride: null },
  jobs: [],
  outputs: [],
  history: [],
  settings: null,
  chatAvailable: false,

  // ---- local ui state ----
  mode: localStorage.getItem('ace.mode') || 'quick',
  draft: { ...DEFAULT_DRAFT },
  typeHintDismissed: false,
  chatOpen: true,
  chatMessages: [],
  chatBusy: false,
  settingsOpen: false,
  diagnosticsOpen: false,
  connected: true, // SSE link to the sidecar
  fixing: false, // a "Fix it" action is in progress
  compareJobId: null,
  resultsOpen: true,
  historyOpen: false,
  historyScope: localStorage.getItem('ace.historyScope') || 'project',
  historyQuery: '',
  loadError: null,

  // ---- derived helpers ----
  effectiveContext() {
    const c = get().context
    return {
      bpm: c.bpmOverride ?? c.bpm,
      key: c.keyOverride ?? c.key,
      sig: c.sigOverride ?? c.sig,
    }
  },
  typeConflict() {
    const { draft, typeHintDismissed } = get()
    if (typeHintDismissed) return null
    const detected = detectTypeInPrompt(draft.prompt)
    return detected && detected !== draft.type ? detected : null
  },

  // ---- init ----
  async init() {
    try {
      const s = await api.getState()
      // Stale page (older build than the server is serving)? Reload now.
      if (s.uiBuild) {
        const ours = Array.from(document.scripts).find((x) => x.src.includes('/assets/'))
        if (ours && !ours.src.includes(s.uiBuild)) {
          location.reload()
          return
        }
      }
      set({
        engine: s.engine,
        live: s.live,
        context: s.context,
        jobs: s.jobs,
        outputs: s.outputs,
        settings: s.settings,
        chatAvailable: s.chatAvailable,
        loadError: null,
      })
      get().refreshHistory()
    } catch (e) {
      set({ loadError: e.message, engine: { status: 'offline' } })
      setTimeout(() => get().init(), 3000)
      return
    }
    if (get()._subscribed) return // reconnect path: state refetched above
    set({ _subscribed: true })
    subscribeEvents({
      engine: (engine) => set({ engine }),
      live: (live) => set({ live }),
      context: (context) => set({ context }),
      job: (job) =>
        set((st) => ({
          jobs: st.jobs.some((j) => j.id === job.id)
            ? st.jobs.map((j) => (j.id === job.id ? job : j))
            : [job, ...st.jobs],
        })),
      jobRemoved: ({ id }) => set((st) => ({ jobs: st.jobs.filter((j) => j.id !== id) })),
      output: (output) =>
        set((st) => ({
          outputs: st.outputs.some((o) => o.id === output.id)
            ? st.outputs.map((o) => (o.id === output.id ? output : o))
            : [output, ...st.outputs],
        })),
      outputRemoved: ({ id }) => {
        evict(id)
        set((st) => ({ outputs: st.outputs.filter((o) => o.id !== id) }))
      },
      history: () => get().refreshHistory(),
      chatAvailable: ({ available }) => set({ chatAvailable: available }),
      reload: () => location.reload(),
    }, (up) => {
      const was = get().connected
      set({ connected: up })
      // Reconnected after a drop: resync everything we missed.
      if (up && !was) get().init()
    })
  },

  // ---- draft ----
  setMode(mode) {
    localStorage.setItem('ace.mode', mode)
    set({ mode })
  },
  patchDraft(patch) {
    set((st) => ({ draft: { ...st.draft, ...patch }, typeHintDismissed: false }))
  },
  patchGuided(patch) {
    set((st) => ({ draft: { ...st.draft, guided: { ...st.draft.guided, ...patch } } }))
  },
  patchAdvanced(patch) {
    set((st) => ({ draft: { ...st.draft, advanced: { ...st.draft.advanced, ...patch } } }))
  },
  resetAdvanced() {
    set((st) => ({ draft: { ...st.draft, advanced: { ...DEFAULT_ADVANCED } } }))
  },
  dismissTypeHint() {
    set({ typeHintDismissed: true })
  },
  startRepaint(output) {
    get().clearSourceOps()
    set((st) => ({
      draft: {
        ...st.draft,
        prompt: '',
        repaint: {
          outputId: output.id,
          file: output.file,
          name: output.name,
          start: 0,
          end: Math.round(output.meta?.durationSec || 0) || null,
          strength: 0.5,
        },
      },
    }))
    document.querySelector('.prompt-input')?.focus()
  },
  // Upload an external reference song and use it as the cover source — the
  // engine keeps its melody/structure and re-renders the caption's style.
  async addReference(file) {
    try {
      const { path, name } = await api.uploadRef(file)
      get().clearSourceOps()
      set((st) => ({
        draft: { ...st.draft, cover: { outputId: null, file: path, name, strength: 0.5, ref: true } },
      }))
      showToast(`Reference added — ${name}`)
    } catch (e) {
      showToast(`Reference upload failed — ${e.message}`)
    }
  },
  startCover(output) {
    get().clearSourceOps()
    set((st) => ({
      draft: {
        ...st.draft,
        prompt: '',
        cover: { outputId: output.id, file: output.file, name: output.name, strength: 0.7 },
      },
    }))
    document.querySelector('.prompt-input')?.focus()
  },
  startExtend(output) {
    get().clearSourceOps()
    set((st) => ({
      draft: {
        ...st.draft,
        prompt: output.draft?.prompt || '',
        extend: {
          outputId: output.id,
          file: output.file,
          name: output.name,
          srcDuration: output.meta?.durationSec || 8,
          addBars: 4,
        },
      },
    }))
  },
  patchRepaint(patch) {
    set((st) => ({
      draft: { ...st.draft, repaint: st.draft.repaint ? { ...st.draft.repaint, ...patch } : null },
    }))
  },
  patchCover(patch) {
    set((st) => ({
      draft: { ...st.draft, cover: st.draft.cover ? { ...st.draft.cover, ...patch } : null },
    }))
  },
  patchExtend(patch) {
    set((st) => ({
      draft: { ...st.draft, extend: st.draft.extend ? { ...st.draft.extend, ...patch } : null },
    }))
  },
  clearSourceOps() {
    set((st) => ({ draft: { ...st.draft, repaint: null, cover: null, extend: null } }))
  },
  async initEngine() {
    set((st) => ({ engine: { ...st.engine, loading: true } }))
    await api.initEngine().catch(() => {})
  },

  // Smart "Fix it": detects the problem and repairs it.
  //  - engine down / models not loaded / init error → self-heal (relaunch +
  //    reload) and, if a job failed, retry it once the engine is back.
  //  - engine healthy but a job failed → just retry it.
  async fixIt(job) {
    const st = get()
    const target = job || st.jobs.find((j) => ['failed', 'empty', 'cancelled'].includes(j.status)) || null
    const engineDown = st.engine.status === 'offline' || !!st.engine.initError || st.engine.models === false
    set({ fixing: true })
    try {
      if (engineDown) {
        set((s) => ({ engine: { ...s.engine, loading: true, initError: null } }))
        await api.fix(target?.id) // server revives + reloads, then retries the job when ready
        showToast('Fixing — reviving engine and reloading models…')
      } else if (target) {
        await get().retryJob(target, false)
        showToast('Retrying…')
      } else {
        showToast('Nothing to fix — everything looks healthy')
      }
    } catch (e) {
      showToast(`Fix failed — ${e.message}`)
    } finally {
      set({ fixing: false })
    }
  },

  // Quality repair: rebuild the composer from an output that sounded bad, with
  // a fuller/less-thin caption, and regenerate one fresh take.
  async improveOutput(output) {
    const d = output.draft || {}
    const ctx = d.context || {}
    const caption = improveCaption(d.compiledPrompt || d.prompt || output.name || '')
    set((s) => ({
      draft: {
        ...DEFAULT_DRAFT,
        ...d,
        prompt: caption,
        autoTags: false, // send the improved caption verbatim
        variations: 1,
        // carry the same musical settings (support old outputs that stored them under context)
        bpm: d.bpm ?? ctx.bpm ?? null,
        key: d.key ?? ctx.key ?? null,
        sig: d.sig ?? ctx.sig ?? null,
        repaint: null, cover: null, extend: null,
        guided: { ...DEFAULT_DRAFT.guided, ...(d.guided || {}) },
        advanced: { ...DEFAULT_ADVANCED, ...(d.advanced || {}), seed: null, seedLocked: false },
      },
    }))
    showToast('Improving — regenerating with a fuller caption')
    await get().generate()
  },
  acceptDetectedType(type) {
    set((st) => ({ draft: { ...st.draft, type }, typeHintDismissed: true }))
  },

  // ---- context ----
  async overrideContext(patch) {
    const context = await api.overrideContext(patch)
    set({ context })
  },
  async resyncContext() {
    const context = await api.resyncContext()
    set({ context })
  },

  // ---- generation ----
  async generate() {
    const { draft, mode } = get()
    const payload = {
      ...draft,
      mode,
      compiledPrompt: compilePrompt(draft),
      durationSec: draftDuration(draft),
      // bpm/key/sig live on the draft now; null = let the model decide
      context: { bpm: draft.bpm ?? null, key: draft.key ?? null, sig: draft.sig ?? null },
    }
    if (draft.extend) {
      const secPerBar = (60 / (draft.bpm || 120)) * 4
      payload.durationSec = Math.round(draft.extend.srcDuration + draft.extend.addBars * secPerBar)
    }
    try {
      await api.generate(payload)
      set({ resultsOpen: true })
      if (!draft.advanced.seedLocked) get().patchAdvanced({ seed: null })
      get().clearSourceOps()
    } catch (e) {
      set((st) => ({
        jobs: [
          {
            id: `local-${Date.now()}`,
            status: 'failed',
            label: draft.prompt.slice(0, 60) || draft.type,
            error: e.message,
            draft: payload,
            local: true,
          },
          ...st.jobs,
        ],
      }))
    }
  },
  async cancelJob(id) {
    set((st) => ({
      jobs: st.jobs.map((j) => (j.id === id ? { ...j, status: 'cancelling' } : j)),
    }))
    await api.cancelJob(id).catch(surface('Cancel'))
  },
  async retryJob(job, newSeed) {
    if (job.local) {
      set((st) => ({ jobs: st.jobs.filter((j) => j.id !== job.id) }))
      const advanced = { ...job.draft.advanced, seed: newSeed ? null : job.draft.advanced?.seed }
      await api.generate({ ...job.draft, advanced }).catch(surface('Retry'))
    } else {
      await api.retryJob(job.id, newSeed).catch(surface('Retry'))
    }
  },
  async dismissJob(job) {
    if (job.local) set((st) => ({ jobs: st.jobs.filter((j) => j.id !== job.id) }))
    else await api.dismissJob(job.id).catch(surface('Dismiss'))
  },

  // ---- outputs ----
  async renameOutput(id, name) {
    set((st) => ({ outputs: st.outputs.map((o) => (o.id === id ? { ...o, name } : o)) }))
    await api.renameOutput(id, name).catch(surface('Rename'))
  },
  async starOutput(id, starred) {
    set((st) => ({ outputs: st.outputs.map((o) => (o.id === id ? { ...o, starred } : o)) }))
    await api.starOutput(id, starred).catch(surface('Star'))
  },
  async deleteOutput(id) {
    evict(id)
    set((st) => ({ outputs: st.outputs.filter((o) => o.id !== id) }))
    await api.deleteOutput(id).catch(surface('Delete'))
  },
  reusePrompt(entry) {
    const d = entry.draft || {}
    set((st) => ({
      mode: d.mode || st.mode,
      draft: {
        ...DEFAULT_DRAFT,
        ...d,
        guided: { ...DEFAULT_DRAFT.guided, ...(d.guided || {}) },
        advanced: { ...DEFAULT_ADVANCED, ...(d.advanced || {}), seedLocked: true },
      },
      historyOpen: false,
    }))
  },

  // ---- history ----
  async refreshHistory() {
    const { historyScope, historyQuery } = get()
    try {
      const history = await api.getHistory(historyScope, historyQuery)
      set({ history })
    } catch { /* sidecar down; retried on reconnect */ }
  },
  setHistoryScope(historyScope) {
    localStorage.setItem('ace.historyScope', historyScope)
    set({ historyScope })
    get().refreshHistory()
  },
  setHistoryQuery(historyQuery) {
    set({ historyQuery })
    get().refreshHistory()
  },
  async clearHistory(deleteFiles) {
    await api.clearHistory(deleteFiles)
    set({ history: [], outputs: deleteFiles ? [] : get().outputs })
    get().refreshHistory()
  },

  // ---- chat ----
  toggleChat() {
    set((st) => ({ chatOpen: !st.chatOpen }))
  },
  async sendChat(text) {
    const { chatMessages } = get()
    const msgs = [...chatMessages, { role: 'user', content: text }]
    set({ chatMessages: msgs, chatBusy: true })
    try {
      const res = await api.chat(msgs)
      set((st) => ({
        chatMessages: [...st.chatMessages, { role: 'assistant', content: res.reply, proposal: res.proposal }],
        chatBusy: false,
      }))
    } catch (e) {
      set((st) => ({
        chatMessages: [...st.chatMessages, { role: 'assistant', content: `⚠ ${e.message}`, error: true }],
        chatBusy: false,
      }))
    }
  },
  applyProposal(p) {
    set((st) => ({
      draft: {
        ...st.draft,
        prompt: p.prompt ?? st.draft.prompt,
        type: p.type ?? st.draft.type,
        lengthBars: p.lengthBars ?? st.draft.lengthBars,
        durationSec: p.durationSec ?? st.draft.durationSec,
        guided: { ...st.draft.guided, ...(p.guided || {}) },
      },
      typeHintDismissed: true,
    }))
  },
  clearChat() {
    set({ chatMessages: [] })
  },

  // ---- settings ----
  openSettings(open) {
    set({ settingsOpen: open })
  },
  openDiagnostics(open) {
    set({ diagnosticsOpen: open })
  },
  async saveSettings(settings) {
    const saved = await api.putSettings(settings)
    set({ settings: saved, settingsOpen: false })
  },

  // ---- overlays ----
  openCompare(compareJobId) {
    set({ compareJobId })
  },
  toggleResults() {
    set((st) => ({ resultsOpen: !st.resultsOpen }))
  },
  toggleHistory() {
    set((st) => ({ historyOpen: !st.historyOpen }))
  },
}))
