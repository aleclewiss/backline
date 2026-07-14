// In-memory app state + SSE broadcast. Jobs/outputs are rehydrated from the
// history store on boot; live Ableton context arrives via the Max bridge.

const sseClients = new Set()

export const state = {
  engine: { status: 'connecting' },
  live: { connected: false, projectName: 'default' },
  context: {
    bpm: 120,
    key: null,
    sig: '4/4',
    bpmOverride: null,
    keyOverride: null,
    sigOverride: null,
  },
  jobs: [], // newest first
  outputs: [], // newest first
}

export function effectiveContext() {
  const c = state.context
  return {
    bpm: c.bpmOverride ?? c.bpm,
    key: c.keyOverride ?? c.key,
    sig: c.sigOverride ?? c.sig,
  }
}

export function addSseClient(res) {
  sseClients.add(res)
  res.on('close', () => sseClients.delete(res))
}

export function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of sseClients) {
    try { res.write(payload) } catch { sseClients.delete(res) }
  }
}

export function upsertJob(job) {
  const i = state.jobs.findIndex((j) => j.id === job.id)
  if (i >= 0) state.jobs[i] = job
  else state.jobs.unshift(job)
  broadcast('job', publicJob(job))
}

export function removeJob(id) {
  state.jobs = state.jobs.filter((j) => j.id !== id)
  broadcast('jobRemoved', { id })
}

export function addOutput(output) {
  state.outputs.unshift(output)
  broadcast('output', output)
}

export function removeOutput(id) {
  state.outputs = state.outputs.filter((o) => o.id !== id)
  broadcast('outputRemoved', { id })
}

export function setEngine(engine) {
  state.engine = engine
  broadcast('engine', engine)
}

export function setContext(patch) {
  state.context = { ...state.context, ...patch }
  broadcast('context', state.context)
}

export function setLive(patch) {
  state.live = { ...state.live, ...patch }
  broadcast('live', state.live)
}

// Strip internals (abort controllers etc.) before sending a job to the UI.
export function publicJob(job) {
  const { _abort, _proc, ...pub } = job
  return pub
}

// The "armed" clip: what the native drop-bar (window manager) offers for
// drag-out. Newest generation auto-arms; pulling a card re-arms.
export let armed = null

export function setArmed(output) {
  armed = output ? { outputId: output.id, file: output.file, name: output.name } : null
}
