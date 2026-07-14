import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { loadConfig } from './config.js'
import { setEngine, state } from './state.js'
import { projectDir } from './library.js'
import { info, warn, error as logError, tailFile, LOG_DIR } from './log.js'

// Client for the ACE-Step 1.5 API server (FastAPI, default 127.0.0.1:8001).
// Flow: POST /release_task -> task_id, poll POST /query_result until
// status 1 (done) / 2 (failed), then download GET /v1/audio?path=...
// There is NO server-side cancel: aborting stops polling and discards the
// result; the engine finishes its current render in the background.

const POLL_MS = 1000

function base() {
  return loadConfig().engineUrl.replace(/\/$/, '')
}

// Combine the caller's abort signal with a hard timeout, so a hung (but not
// crashed) engine can't hang a fetch forever — only /health had one before.
function withTimeout(signal, ms) {
  const t = AbortSignal.timeout(ms)
  if (!signal) return t
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, t])
  const ctrl = new AbortController()
  const abort = (s) => () => ctrl.abort(s.reason)
  signal.addEventListener('abort', abort(signal), { once: true })
  t.addEventListener('abort', abort(t), { once: true })
  return ctrl.signal
}

function engineErrTail(bytes = 4096) {
  return tailFile(path.join(LOG_DIR, 'engine.err.log'), bytes).trim()
}

async function post(pathname, body, signal, timeoutMs = 30000) {
  const res = await fetch(base() + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: withTimeout(signal, timeoutMs),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 429) {
    throw new Error('Engine queue is full - try again in a moment')
  }
  if (!res.ok || (json.code && json.code !== 200)) {
    const e = new Error(json.error || `Engine error ${res.status}`)
    e.detail = JSON.stringify(json).slice(0, 500)
    throw e
  }
  return json.data ?? json
}

// "a minor" -> "A Minor", "f#" -> "F# Major"
function normalizeKey(key) {
  if (!key) return ''
  const m = /^([a-gA-G][#b]?)\s*(minor|min|m)?/.exec(key.trim())
  if (!m) return key
  const root = m[1][0].toUpperCase() + (m[1][1] || '')
  return `${root} ${m[2] ? 'Minor' : 'Major'}`
}

// The engine's FIRST /release_task blocks its HTTP response for the entire
// model load (~6 min on slow GPUs) — longer than Node's fetch timeout. So
// when the engine reports models_initialized=false we kick off /v1/init
// (fire-and-forget) and poll /health until warm before releasing the task.
async function ensureModelsReady(signal, onProgress, wantLM) {
  // The server can take a minute or two to start listening after launch
  // (cold python imports) — don't fail a job over that. ~90s of patience,
  // then call it offline.
  const ATTEMPTS = 18
  let health = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (signal?.aborted) throw abortError()
    try {
      const res = await fetch(base() + '/health', timeoutOpts(5000))
      const j = await res.json()
      health = j.data ?? j
      break
    } catch {
      if (attempt === ATTEMPTS - 1) {
        throw new Error(`Engine offline - cannot reach ${base()} (is the ACE-Step server running?)`)
      }
      onProgress?.({ step: null, total: null, label: 'waiting for engine' })
      await sleep(5000, signal)
    }
  }
  const ready = (h) => h.models_initialized !== false && (!wantLM || h.llm_initialized === true)
  if (ready(health)) return

  onProgress?.({ step: null, total: null, label: 'loading models (one-time, a few minutes)' })
  fetch(base() + '/v1/init', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ init_llm: !!wantLM }),
  }).catch(() => { /* long-blocking by design; we watch /health instead */ })

  const deadline = Date.now() + 30 * 60 * 1000
  while (Date.now() < deadline) {
    if (signal?.aborted) throw abortError()
    await sleep(5000, signal)
    try {
      const res = await fetch(base() + '/health', timeoutOpts(5000))
      const j = await res.json()
      if (ready(j.data ?? j)) return
    } catch { /* engine busy loading; keep polling */ }
  }
  throw new Error('Engine model load did not finish within 30 minutes')
}

function timeoutOpts(ms) {
  return typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(ms) } : {}
}

// The engine only accepts source-audio paths inside the system temp dir
// (security check in release_task_audio_paths.py). Library/upload files live
// elsewhere, so copy them into temp and hand the engine that path.
function stageForEngine(src) {
  const tmp = path.resolve(os.tmpdir())
  const resolved = path.resolve(src)
  if (resolved.toLowerCase().startsWith(tmp.toLowerCase() + path.sep)) return resolved
  const safe = path.basename(resolved).replace(/[^\w.-]+/g, '_')
  const dest = path.join(tmp, `acesrc_${crypto.randomBytes(4).toString('hex')}_${safe}`)
  fs.copyFileSync(resolved, dest)
  return dest
}

export async function generate(opts) {
  const {
    caption, lyrics, instrumental, durationSec, bpm, key, timeSig,
    seed, steps, guidance, shift, format, signal, onProgress, quality,
    inferMethod, language, repaint, cover, extend,
  } = opts

  await ensureModelsReady(signal, onProgress, !!quality)

  const body = {
    prompt: caption,
    lyrics: instrumental ? '' : lyrics || '',
    task_type: 'text2music',
    audio_duration: durationSec || null,
    bpm: bpm ? Math.round(bpm) : null,
    key_scale: normalizeKey(key),
    time_signature: timeSig ? String(timeSig).split('/')[0] : '',
    vocal_language: language || 'en',
    infer_method: inferMethod || 'ode',
    batch_size: 1, // variations are rendered serially with distinct seeds (8GB GPU)
    audio_format: format || 'wav',
    use_random_seed: false,
    seed,
    use_tiled_decode: true,
    // Quality mode routes through the 5Hz LM ("thinking"): it composes
    // audio codes that guide the DiT — the difference between realistic
    // instruments and the distorted DiT-only fast path.
    thinking: !!quality,
    use_cot_caption: !!quality,
    use_cot_language: !!quality,
    lm_backend: 'pt',
  }
  if (steps != null) body.inference_steps = steps
  if (guidance != null) body.guidance_scale = guidance
  if (shift != null) body.shift = shift

  // Repaint: regenerate a time range of an existing clip.
  if (repaint && repaint.file) {
    body.task_type = 'repaint'
    body.src_audio_path = stageForEngine(repaint.file) // must live under system temp
    body.repainting_start = repaint.start ?? 0
    body.repainting_end = repaint.end ?? -1
    body.repaint_mode = 'balanced'
    body.repaint_strength = repaint.strength ?? 0.5
    body.audio_duration = null // keep the source clip's length
  }

  // Cover: re-render an existing clip in the style the caption describes.
  if (cover && cover.file) {
    body.task_type = 'cover'
    body.src_audio_path = stageForEngine(cover.file)
    body.audio_cover_strength = cover.strength ?? 0.7
  }

  // Extend: continue a clip past its end (repaint of the region beyond it).
  if (extend && extend.file) {
    body.task_type = 'repaint'
    body.src_audio_path = stageForEngine(extend.file)
    body.repainting_start = Math.max(0, extend.srcDuration - 0.5) // slight overlap for a seamless join
    body.repainting_end = -1
    body.repaint_mode = 'balanced'
    body.audio_duration = durationSec || null // new total length
  }

  // ensureModelsReady just confirmed the engine is reachable, so a fetch
  // failure here is transient - retry a couple of times before giving up.
  let released
  for (let attempt = 0; ; attempt++) {
    try {
      released = await post('/release_task', body, signal)
      break
    } catch (e) {
      if (signal?.aborted) throw abortError()
      if (attempt < 2 && /fetch failed|terminated|timeout|ECONNRESET/i.test(e.message)) {
        await sleep(4000, signal)
        continue
      }
      throw e
    }
  }
  const taskId = released.task_id
  if (!taskId) {
    // Some engine paths execute synchronously and return the result directly.
    const direct = extractFileUrl(released)
    if (direct) return { file: await download(direct, format || 'wav', signal), raw: released }
    const err = new Error('Engine did not return a task id')
    err.detail = JSON.stringify(released).slice(0, 500)
    throw err
  }

  // Poll until terminal. A dead or restarted engine must FAIL the job with a
  // clear message — never leave it spinning "running" forever.
  let pollFails = 0 // consecutive /query_result failures
  let missingPolls = 0 // consecutive polls where the engine doesn't list our task
  for (;;) {
    if (signal?.aborted) throw abortError()
    await sleep(POLL_MS, signal)
    let items
    try {
      const data = await post('/query_result', { task_id_list: [taskId] }, signal, 15000)
      items = Array.isArray(data) ? data : data.results || data.tasks || [data]
      pollFails = 0
    } catch (e) {
      if (signal?.aborted) throw abortError()
      pollFails++
      if (pollFails === 8 || pollFails === 16) {
        // ~8s+ of straight failures: is the engine still alive at all?
        const h = await checkEngine()
        if (!h.ok) {
          const dead = new Error('Engine went offline mid-generation - it likely crashed or was killed')
          dead.detail = `${h.detail}\nLast poll error: ${e.message}` +
            (engineErrTail() ? `\n--- engine stderr tail ---\n${engineErrTail()}` : '')
          logError('generate', dead.message, dead.detail)
          throw dead
        }
      }
      if (pollFails >= 24) {
        const stuck = new Error('Engine is online but stopped answering result polls')
        stuck.detail = `Last poll error: ${e.message}`
        logError('generate', stuck.message, stuck.detail)
        throw stuck
      }
      continue // transient poll failure; keep trying
    }
    const item = items.find((x) => x && (x.task_id === taskId || items.length === 1))
    if (!item) {
      // Task vanished from the engine's table — usually an engine restart.
      if (++missingPolls >= 15) {
        const lost = new Error('Engine no longer knows this task - it likely restarted mid-generation')
        lost.detail = `task_id ${taskId} disappeared from /query_result` +
          (engineErrTail() ? `\n--- engine stderr tail ---\n${engineErrTail()}` : '')
        logError('generate', lost.message, lost.detail)
        throw lost
      }
      continue
    }
    missingPolls = 0

    const status = Number(item.status)
    if (status === 0 || Number.isNaN(status)) {
      if (onProgress) onProgress(describeProgress(item))
      continue
    }
    if (status === 2) {
      const e = new Error(trimProgress(item.progress_text) || 'Generation failed on the engine')
      e.detail = (typeof item.result === 'string' ? item.result.slice(0, 500) : '') +
        (engineErrTail() ? `\n--- engine stderr tail ---\n${engineErrTail(2048)}` : '') || undefined
      logError('generate', `engine reported failure: ${e.message}`, e.detail)
      throw e
    }

    // status === 1: success — extract the audio URL and download it.
    const fileUrl = extractFileUrl(item)
    if (!fileUrl) {
      const e = new Error('Engine reported success but returned no audio')
      e.detail = JSON.stringify(item).slice(0, 500)
      throw e
    }
    return { file: await download(fileUrl, format || 'wav', signal), raw: item }
  }
}

function extractFileUrl(item) {
  let result = item.result
  if (typeof result === 'string') {
    try { result = JSON.parse(result) } catch { return null }
  }
  const entries = Array.isArray(result) ? result : result ? [result] : []
  for (const e of entries) {
    if (e && typeof e.file === 'string' && e.file) return e.file
    if (e && Array.isArray(e.audio_paths) && e.audio_paths[0]) return e.audio_paths[0]
  }
  if (typeof item.first_audio_path === 'string') return item.first_audio_path
  return null
}

async function download(fileUrl, format, signal) {
  const url = fileUrl.startsWith('http') ? fileUrl : base() + fileUrl
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Audio download failed (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1000) {
    const e = new Error('Engine returned an empty audio file')
    e.detail = `Downloaded ${buf.length} bytes from ${url}`
    throw e
  }
  const tmp = path.join(projectDir(), `.incoming-${crypto.randomUUID().slice(0, 8)}.${format}`)
  fs.writeFileSync(tmp, buf)
  return tmp
}

// ---- engine health ----

export async function checkEngine() {
  const prev = state.engine.status
  try {
    const res = await fetch(base() + '/health', { signal: AbortSignal.timeout(4000) })
    const j = await res.json()
    const d = j.data ?? j
    const ok = res.ok && d.status === 'ok'
    setEngine({
      ...state.engine, // keep initError & friends
      status: ok ? 'online' : 'offline',
      detail: d.loaded_model || '',
      models: d.models_initialized === true,
      llm: d.llm_initialized === true,
      loading: state.engine.loading && d.models_initialized !== true,
    })
    if (prev !== state.engine.status) info('engine', `status: ${prev} -> ${state.engine.status}`)
    return { ok, detail: d.loaded_model || d.version || 'ok' }
  } catch (e) {
    const detail = `Cannot reach ${base()} - ${e.message}`
    setEngine({ ...state.engine, status: 'offline', detail, models: false, llm: false })
    if (prev !== 'offline') warn('engine', `status: ${prev} -> offline`, detail)
    return { ok: false, detail }
  }
}

// User-initiated model load (also used as a fallback by generation).
export function initEngine() {
  if (state.engine.loading) return
  info('engine', 'model load requested')
  setEngine({ ...state.engine, loading: true, initError: null })
  fetch(base() + '/v1/init', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ init_llm: true }),
  }).then((res) => {
    // /v1/init blocks until the load finishes, so a response here is news
    // either way; failures are also caught by the /health deadline below.
    if (!res.ok) warn('engine', `/v1/init answered ${res.status} - watching /health`)
  }).catch((e) => {
    warn('engine', `/v1/init request ended early (${e.message}) - load may still be running; watching /health`)
  })
  // Poll /health until warm — with a deadline, so the "loading models" banner
  // can never spin forever when the load silently died.
  const deadline = Date.now() + 45 * 60 * 1000
  const t = setInterval(async () => {
    await checkEngine()
    if (state.engine.models) {
      info('engine', 'models loaded')
      setEngine({ ...state.engine, loading: false, initError: null })
      clearInterval(t)
    } else if (state.engine.status === 'offline') {
      logError('engine', 'engine went offline during model load')
      setEngine({ ...state.engine, loading: false, initError: 'Engine went offline during model load' })
      clearInterval(t)
    } else if (Date.now() > deadline) {
      logError('engine', 'model load did not finish within 45 minutes')
      setEngine({ ...state.engine, loading: false, initError: 'Model load did not finish within 45 minutes' })
      clearInterval(t)
    }
  }, 5000)
}

// User-initiated recovery ("Fix it"): force-relaunch a dead engine (bypassing
// the revive cooldown), wait for it to bind, then load models. Resolves only
// once models are ready (or it gives up), so callers can retry a job after.
export async function fixEngine() {
  lastRevive = 0 // bypass the 3-min anti-spam guard for an explicit user action
  let r = await checkEngine()
  if (!r.ok) {
    warn('engine', 'fix requested - relaunching engine')
    await reviveEngine()
    const bindDeadline = Date.now() + 120000 // up to 2 min to bind the port
    while (Date.now() < bindDeadline) {
      await sleep(4000)
      r = await checkEngine()
      if (r.ok) break
    }
    if (!r.ok) { logError('engine', 'fix: engine did not come back'); return { ok: false } }
  }
  if (!state.engine.models && !state.engine.loading) initEngine()
  // wait for the (self-polling) init to finish
  const loadDeadline = Date.now() + 20 * 60 * 1000
  while (!state.engine.models && Date.now() < loadDeadline) {
    if (state.engine.initError) break
    await sleep(3000)
  }
  return { ok: state.engine.models === true }
}

// ---- LoRA (inference-time adapters) ----
export async function lora(action, payload) {
  const paths = { load: '/v1/lora/load', unload: '/v1/lora/unload', scale: '/v1/lora/scale', status: '/v1/lora/status' }
  const res = await fetch(base() + paths[action], {
    method: action === 'status' ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: action === 'status' ? undefined : JSON.stringify(payload || {}),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || j.detail || `LoRA ${action} failed (${res.status})`)
  return j.data ?? j
}

let lastRevive = 0

// After a crash, the engine can leave orphaned python workers (and sometimes a
// half-dead main) that hold the port/GPU and block a clean restart. Kill any
// python running from THIS project's venv before respawning. Scoped to the
// venv path so unrelated python is never touched. Windows-only (this deploy).
async function killStaleEngine() {
  if (process.platform !== 'win32') return
  const { execFile } = await import('node:child_process')
  const ps =
    "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | " +
    "Where-Object { $_.ExecutablePath -like '*ACE-Step-1.5\\.venv\\*' } | " +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
  await new Promise((resolve) => {
    try {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 15000 }, () => resolve())
    } catch { resolve() }
  })
  await sleep(1500) // let the OS release the port/handles
}

// If the engine process died (e.g. OS memory pressure), relaunch it with the
// GTX-1070-safe settings. Lives here so no extra watchdog process is needed.
async function reviveEngine() {
  if (Date.now() - lastRevive < 3 * 60 * 1000) return // don't spam spawns
  if (!/127\.0\.0\.1|localhost/.test(loadConfig().engineUrl)) return // remote engine: not ours to manage
  lastRevive = Date.now()
  warn('engine', 'offline - clearing stale python, relaunching')
  await killStaleEngine() // clear orphaned workers that would block the restart
  const { spawn } = await import('node:child_process')
  // Keep the revived engine's output in the log files — a watchdog-spawned
  // engine that logs nowhere makes its next crash undiagnosable.
  let out = 'ignore', err = 'ignore'
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    out = fs.openSync(path.join(LOG_DIR, 'engine.out.log'), 'a')
    err = fs.openSync(path.join(LOG_DIR, 'engine.err.log'), 'a')
  } catch { /* fall back to ignore */ }
  const child = spawn(
    'D:\\ACE-Step-1.5\\.venv\\Scripts\\python.exe',
    ['-m', 'acestep.api_server', '--host', '127.0.0.1', '--port', '8001'],
    {
      cwd: 'D:\\ACE-Step-1.5',
      detached: true,
      stdio: ['ignore', out, err],
      env: {
        ...process.env,
        ACESTEP_DTYPE: 'float32',
        ACESTEP_INIT_LLM: 'auto',
        ACESTEP_LM_OFFLOAD_TO_CPU: 'true',
        ACESTEP_OFFLOAD_DIT_TO_CPU: 'true',
        ACESTEP_QUANTIZATION: 'auto',
      },
    },
  )
  child.unref()
}

export function watchEngine() {
  setInterval(async () => {
    // Skip health checks while generating: the single-worker server is busy
    // and a slow /health would just add noise.
    if (state.jobs.some((j) => j.status === 'running')) return
    const r = await checkEngine()
    if (!r.ok) reviveEngine()
  }, 15000)
}

// Translate the engine's raw progress_text (its latest log line) into a
// human phase, with a percent when the engine reports one.
function describeProgress(item) {
  const text = String(item.progress_text || '').replace(/\s+/g, ' ')
  let label = null
  if (/diffusion|DCW|DWT|service_generate/i.test(text)) label = 'composing (diffusion)'
  else if (/tiled_decode|vae|decoding latents|decode/i.test(text)) label = 'rendering audio'
  else if (/embedding|text_encoder|conditioning|lyric/i.test(text)) label = 'reading your prompt'
  else if (/loading .* to (cuda|cpu)|checkpoint|initializ|quantiz/i.test(text)) label = 'loading models'
  else if (/peak=|normali[sz]|audio \d/i.test(text)) label = 'finishing up'
  else if (/queue/i.test(text)) label = 'queued on engine'
  const frac = typeof item.progress === 'number' && item.progress > 0 ? item.progress : null
  if (frac != null) {
    return { step: Math.round(frac * 100), total: 100, label: label || 'working' }
  }
  return { step: null, total: null, label: label || trimProgress(text) || 'working…' }
}

function trimProgress(text) {
  if (!text) return null
  const s = String(text)
    .replace(/\s+/g, ' ')
    .trim()
    // progress_text is the engine's latest log line - drop its log prefix
    .replace(/^[\d-]*\s*\d{2}:\d{2}:\d{2}[\d.]*\s*\|\s*\w+\s*\|\s*/, '')
    .replace(/^\[[\w_]+\]\s*/, '')
  return s.slice(0, 80) || null
}

function abortError() {
  const e = new Error('Cancelled')
  e.name = 'AbortError'
  return e
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()) }, { once: true })
  })
}
