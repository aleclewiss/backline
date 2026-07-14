// Bridge to Max for Live. Two modes:
//
// 1. In-process (sidecar running inside Max's node.script, modern Node):
//    'max-api' exists and messages flow directly to the device patch.
// 2. Remote bridge (the normal setup): the sidecar runs standalone
//    (autostarted at login) and the M4L device runs device/live-link.js,
//    which POSTs Live context to /api/live/context and executes
//    "maxCommand" SSE events (insert_clip / stage) in the device.
//
// Standalone with no device open: everything degrades gracefully —
// context keeps defaults, insert reports "not connected".
import { execFile } from 'node:child_process'
import { setContext, setLive, state, broadcast } from './state.js'

let maxApi = null
let lastBridgeSeen = 0

const BRIDGE_TIMEOUT_MS = 30000

export function bridgeAlive() {
  return !!maxApi || Date.now() - lastBridgeSeen < BRIDGE_TIMEOUT_MS
}

// Called by the /api/live/context route when the device bridge reports in.
export function bridgeReport(body) {
  lastBridgeSeen = Date.now()
  if (!state.live.connected) setLive({ connected: true })
  if (body.projectName && body.projectName !== state.live.projectName) {
    setLive({ projectName: body.projectName })
  }
  const patch = {}
  if (typeof body.bpm === 'number' && body.bpm > 0 && body.bpm !== state.context.bpm) patch.bpm = body.bpm
  if (body.sig && body.sig !== state.context.sig) patch.sig = body.sig
  if (body.key && body.key !== state.context.key) patch.key = body.key
  if (Object.keys(patch).length) setContext(patch)
}

// Flip live.connected off when the device bridge stops heartbeating.
export function watchBridge() {
  setInterval(() => {
    if (!maxApi && state.live.connected && Date.now() - lastBridgeSeen > BRIDGE_TIMEOUT_MS) {
      setLive({ connected: false })
    }
  }, 10000)
}

function sendToMax(cmd, ...args) {
  if (maxApi) {
    maxApi.outlet(cmd, ...args)
    return true
  }
  if (bridgeAlive()) {
    broadcast('maxCommand', { cmd, args })
    return true
  }
  return false
}

export async function initMaxBridge() {
  try {
    maxApi = (await import('max-api')).default
  } catch {
    return false // standalone: the device bridge connects over HTTP instead
  }

  setLive({ connected: true })
  maxApi.addHandler('transport', (playing, beats, tempo, num) =>
    transportReport({ playing: +playing, beats: +beats, tempo: +tempo, num: +num }))
  maxApi.addHandler('tempo', (bpm) => setContext({ bpm }))
  maxApi.addHandler('signature', (num, den) => setContext({ sig: `${num}/${den}` }))
  maxApi.addHandler('scale', (rootName, scaleName) => {
    if (rootName) setContext({ key: `${rootName} ${(scaleName || 'major').toLowerCase()}` })
  })
  maxApi.addHandler('project', (name) => setLive({ projectName: name || 'default' }))

  maxApi.post('[ace-sidebar] node bridge up')
  maxApi.outlet('sidecar_ready')
  return true
}

export function resyncFromLive() {
  sendToMax('resync')
}

// ---- transport snapshot (beat-synced audition) ----

let transportWaiters = []

// Called when a transport snapshot arrives (local handler or bridge POST).
export function transportReport(body) {
  lastBridgeSeen = Date.now()
  const waiters = transportWaiters
  transportWaiters = []
  for (const w of waiters) w(body)
}

// Ask Live for is_playing / song position / tempo. Resolves null when no
// device is connected or Live doesn't answer in time.
export function queryTransport(timeoutMs = 700) {
  if (!sendToMax('transport')) return Promise.resolve(null)
  const t0 = Date.now()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      transportWaiters = transportWaiters.filter((w) => w !== waiter)
      resolve(null)
    }, timeoutMs)
    const waiter = (body) => {
      clearTimeout(timer)
      resolve({ ...body, latencyMs: Date.now() - t0 })
    }
    transportWaiters.push(waiter)
  })
}

// Ask the device to drop the file onto the selected track's clip slot; the
// patch falls back to staging on [live.drag] if the Live version can't
// create audio clips through the API.
export async function insertClip(output) {
  return sendToMax('insert_clip', output.file, output.name, output.meta?.type || 'loop')
}

// Put the file on the device's [live.drag] chip for manual drag-in.
export async function stageForDrag(output) {
  return sendToMax('stage', output.file)
}

export function revealFile(file) {
  if (process.platform === 'win32') {
    execFile('explorer.exe', ['/select,', file])
  } else if (process.platform === 'darwin') {
    execFile('open', ['-R', file])
  }
}
