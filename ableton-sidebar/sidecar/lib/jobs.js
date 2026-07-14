import crypto from 'node:crypto'
import { state, upsertJob, removeJob, addOutput, publicJob, setArmed } from './state.js'
import { defaultName, adoptFile, fileSize } from './library.js'
import * as history from './history.js'
import * as ace from './ace.js'
import { stageForDrag } from './maxbridge.js'
import { info, error as logError } from './log.js'

// Serial job queue: one generation at a time (single consumer GPU).
// Each job renders N variations; every finished variation becomes an
// output + history entry immediately, so partial results survive a cancel.

let running = false
const queue = []

export function enqueue(draft) {
  const job = {
    id: crypto.randomUUID().slice(0, 8),
    status: 'queued',
    label: draft.prompt?.trim() || draft.compiledPrompt || draft.type,
    draft,
    variations: Math.max(1, Math.min(8, draft.variations || 1)),
    progress: null,
    createdAt: Date.now(),
    startedAt: null,
  }
  queue.push(job)
  upsertJob(job)
  pump()
  return publicJob(job)
}

export function cancel(id) {
  const qi = queue.findIndex((j) => j.id === id)
  if (qi >= 0) {
    const [job] = queue.splice(qi, 1)
    job.status = 'cancelled'
    upsertJob(job)
    recordTerminal(job)
    return true
  }
  const job = state.jobs.find((j) => j.id === id)
  if (job && job.status === 'running') {
    job.status = 'cancelling'
    upsertJob(job)
    job._abort?.abort()
    return true
  }
  return false
}

export function retry(id, newSeed) {
  const job = state.jobs.find((j) => j.id === id)
  if (!job) return null
  removeJob(id)
  const draft = { ...job.draft }
  if (newSeed) draft.advanced = { ...draft.advanced, seed: null }
  return enqueue(draft)
}

export function dismiss(id) {
  const job = state.jobs.find((j) => j.id === id)
  if (job && ['failed', 'cancelled', 'empty'].includes(job.status)) removeJob(id)
}

async function pump() {
  if (running) return
  const job = queue.shift()
  if (!job) return
  running = true
  try {
    await run(job)
  } finally {
    running = false
    pump()
  }
}

async function run(job) {
  if (job.status !== 'queued') return
  info('job', `${job.id} start: "${job.label?.slice(0, 80)}" x${job.variations}`)
  job.status = 'running'
  job.startedAt = Date.now()
  job._abort = new AbortController()
  upsertJob(job)

  const d = job.draft
  const ctx = d.context || {}
  const baseSeed = d.advanced?.seed ?? Math.floor(Math.random() * 2 ** 31)
  const produced = []

  try {
    for (let v = 0; v < job.variations; v++) {
      if (job._abort.signal.aborted) break
      const seed = baseSeed + v
      const result = await ace.generate({
        caption: d.compiledPrompt || d.prompt,
        lyrics: d.type === 'song' ? d.advanced?.lyrics || '' : '',
        instrumental: d.type !== 'song' || !d.advanced?.lyrics,
        durationSec: d.durationSec,
        bpm: ctx.bpm,
        key: ctx.key,
        timeSig: ctx.sig,
        seed,
        quality: d.hq !== false,
        steps: d.advanced?.steps,
        guidance: d.advanced?.guidance,
        shift: d.advanced?.shift,
        inferMethod: d.advanced?.inferMethod,
        language: d.advanced?.language,
        repaint: d.repaint,
        cover: d.cover,
        extend: d.extend,
        format: d.advanced?.format || 'wav',
        signal: job._abort.signal,
        onProgress: (p) => {
          job.progress = { ...p, variation: v + 1 }
          upsertJob(job)
        },
      })

      if (job._abort.signal.aborted) break

      const name = defaultName(d, ctx, v, job.variations)
      const ext = `.${d.advanced?.format || 'wav'}`
      const file = adoptFile(result.file, name, ext)

      if (fileSize(file) < 1000) {
        // Engine "succeeded" but produced nothing audible.
        logError('job', `${job.id} variation ${v + 1}: engine returned ${fileSize(file)} bytes - discarded`)
        continue
      }

      const output = {
        id: crypto.randomUUID().slice(0, 10),
        jobId: job.id,
        name: file.split(/[\\/]/).pop().replace(/\.[^.]+$/, ''),
        ext,
        file,
        starred: false,
        createdAt: Date.now(),
        draft: d,
        meta: {
          type: d.type,
          bpm: ctx.bpm,
          key: ctx.key,
          bars: d.type !== 'song' && d.type !== 'oneshot' ? d.lengthBars : null,
          durationSec: d.durationSec,
          seed,
        },
      }
      produced.push(output)
      addOutput(output)
      // Zero-click handoff: newest result arms the drop-bar + M4L drag chip.
      setArmed(output)
      stageForDrag(output).catch(() => {})
      history.addEntry({
        id: crypto.randomUUID().slice(0, 10),
        jobId: job.id,
        outputId: output.id,
        name: output.name,
        ext,
        file,
        prompt: d.prompt,
        type: d.type,
        status: 'done',
        draft: d,
        meta: output.meta,
        project: state.live.projectName || 'default',
        createdAt: Date.now(),
      })
    }

    if (job._abort.signal.aborted) {
      job.status = produced.length ? 'done' : 'cancelled'
    } else if (produced.length === 0) {
      job.status = 'empty'
    } else {
      job.status = 'done'
    }
  } catch (e) {
    if (job._abort.signal.aborted) {
      job.status = produced.length ? 'done' : 'cancelled'
    } else {
      job.status = 'failed'
      job.error = e.message || 'Generation failed'
      job.errorDetail = e.detail || e.stack?.split('\n').slice(0, 6).join('\n')
      logError('job', `${job.id} "${job.label?.slice(0, 60)}" failed: ${job.error}`, job.errorDetail)
    }
  }

  if (job.status === 'empty') {
    logError('job', `${job.id} "${job.label?.slice(0, 60)}" produced no audio (all variations < 1000 bytes)`)
  }

  job.progress = null
  upsertJob(job)
  if (job.status === 'done') {
    // Completed jobs leave the active list; their outputs remain.
    removeJob(job.id)
  } else {
    recordTerminal(job)
  }
}

function recordTerminal(job) {
  if (job.status === 'cancelled' || job.status === 'failed' || job.status === 'empty') {
    history.addEntry({
      id: crypto.randomUUID().slice(0, 10),
      jobId: job.id,
      name: job.label.slice(0, 60),
      prompt: job.draft.prompt,
      type: job.draft.type,
      status: job.status === 'empty' ? 'failed' : job.status,
      draft: job.draft,
      project: state.live.projectName || 'default',
      createdAt: Date.now(),
    })
  }
}
