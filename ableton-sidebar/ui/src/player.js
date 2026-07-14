// Singleton WebAudio player: one preview at a time, seekable, loopable,
// and able to switch between variations while preserving the playhead
// (the core affordance of compare mode). smartToggle() adds beat-synced
// audition: when Live's transport is playing, previews start on the next
// bar boundary, in time with the project.
import { create } from 'zustand'
import { api } from './api.js'

export const usePlayer = create(() => ({
  playingId: null,
  loadingId: null,
}))

let ctx = null
let analyser = null
const buffers = new Map() // id -> AudioBuffer
let current = null // { id, source, startedAt (ctx.currentTime), offset, loop }

function audioCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.75
    analyser.connect(ctx.destination)
  }
  return ctx
}

// Live output level (RMS 0..~1) for the transport meter.
export function level() {
  if (!analyser || !current) return 0
  const a = new Uint8Array(analyser.fftSize)
  analyser.getByteTimeDomainData(a)
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const v = (a[i] - 128) / 128
    sum += v * v
  }
  return Math.min(1, Math.sqrt(sum / a.length) * 1.6)
}

export async function loadBuffer(id, url) {
  if (buffers.has(id)) return buffers.get(id)
  usePlayer.setState({ loadingId: id })
  try {
    const res = await fetch(url)
    const arr = await res.arrayBuffer()
    const buf = await audioCtx().decodeAudioData(arr)
    buffers.set(id, buf)
    return buf
  } finally {
    usePlayer.setState({ loadingId: null })
  }
}

export function stop() {
  if (current) {
    try { current.source.stop() } catch { /* already stopped */ }
    current = null
  }
  usePlayer.setState({ playingId: null })
}

function startSource(id, buf, offset, loop, delaySeconds = 0) {
  const c = audioCtx()
  if (c.state === 'suspended') c.resume()
  const source = c.createBufferSource()
  source.buffer = buf
  source.loop = loop
  source.connect(analyser || c.destination)
  source.start(c.currentTime + delaySeconds, offset % buf.duration)
  source.onended = () => {
    if (current && current.source === source && !loop) {
      current = null
      usePlayer.setState({ playingId: null })
    }
  }
  current = { id, source, startedAt: c.currentTime + delaySeconds, offset, loop }
  usePlayer.setState({ playingId: id })
}

export async function play(id, url, { loop = false, offset = 0 } = {}) {
  stop()
  const buf = await loadBuffer(id, url)
  startSource(id, buf, offset, loop)
}

export async function toggle(id, url, opts) {
  if (usePlayer.getState().playingId === id) stop()
  else await play(id, url, opts)
}

// Compare mode: switch to another variation at the current playhead position.
export async function switchTo(id, url, { loop = true } = {}) {
  const pos = position()
  const wasPlaying = !!current
  stop()
  const buf = await loadBuffer(id, url)
  if (wasPlaying) startSource(id, buf, pos, loop)
}

export async function seek(id, url, fraction, { loop = false } = {}) {
  const buf = await loadBuffer(id, url)
  const offset = fraction * buf.duration
  stop()
  startSource(id, buf, offset, loop)
}

// Current playhead in seconds (of whatever is playing).
export function position() {
  if (!current) return 0
  const buf = current.source.buffer
  const elapsed = Math.max(0, audioCtx().currentTime - current.startedAt) + current.offset
  return current.loop ? elapsed % buf.duration : Math.min(elapsed, buf.duration)
}

// Preview toggle that syncs to Ableton's transport when it's running:
// asks the device for a transport snapshot and schedules playback to land
// exactly on the next bar. Falls back to instant playback otherwise.
export async function smartToggle(output, url, liveConnected) {
  if (usePlayer.getState().playingId === output.id) {
    stop()
    return
  }
  const loop = output.meta?.type === 'loop'
  if (liveConnected) {
    try {
      const buf = await loadBuffer(output.id, url) // decode before timing math
      const t = await api.queryTransport()
      if (t && t.ok && t.playing && t.tempo > 0) {
        const beatsPerBar = t.num || 4
        // the snapshot is ~latency/2 old; advance it before computing the gap
        const beatNow = t.beats + ((t.latencyMs || 100) / 2000) * (t.tempo / 60)
        let delay = ((beatsPerBar - (beatNow % beatsPerBar)) * 60) / t.tempo
        if (delay < 0.08) delay += (beatsPerBar * 60) / t.tempo
        stop()
        startSource(output.id, buf, 0, loop, delay)
        return
      }
    } catch { /* transport unavailable - play immediately */ }
  }
  await play(output.id, url, { loop })
}

export function duration(id) {
  const buf = buffers.get(id)
  return buf ? buf.duration : null
}

export function peaks(id, count = 96) {
  const buf = buffers.get(id)
  if (!buf) return null
  const data = buf.getChannelData(0)
  const block = Math.floor(data.length / count)
  const out = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    let max = 0
    const start = i * block
    for (let j = 0; j < block; j += 16) {
      const v = Math.abs(data[start + j])
      if (v > max) max = v
    }
    out[i] = max
  }
  return out
}

export function evict(id) {
  buffers.delete(id)
  if (current && current.id === id) stop()
}
