import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { state, addSseClient, broadcast, setContext, publicJob, removeOutput, armed, setArmed } from './state.js'
import { loadConfig, saveConfig, publicConfig } from './config.js'
import * as jobs from './jobs.js'
import * as history from './history.js'
import * as llm from './llm.js'
import * as ace from './ace.js'
import { renameFile, deleteFile } from './library.js'
import {
  insertClip, stageForDrag, revealFile, resyncFromLive,
  bridgeReport, transportReport, queryTransport,
} from './maxbridge.js'
import { error as logError, recentLogs, tailFile, LOG_DIR } from './log.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, '..', 'public')

let dragOutPending = null
let drawerPending = null

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.mp3': 'audio/mpeg',
  '.json': 'application/json', '.map': 'application/json',
}

function json(res, code, data) {
  const body = JSON.stringify(data ?? {})
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    const e = new Error('Request body is not valid JSON')
    e.httpStatus = 400
    throw e
  }
}

// Collect the raw request bytes (for binary uploads).
async function readRaw(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

// Stream a file to the response with an error handler — an unhandled stream
// 'error' event would crash the whole sidecar process.
function streamFile(res, file, headers) {
  res.writeHead(200, headers)
  const stream = fs.createReadStream(file)
  stream.on('error', (e) => {
    logError('http', `stream failed for ${file}: ${e.message}`)
    res.destroy()
  })
  stream.pipe(res)
}

function findOutput(id) {
  return state.outputs.find((o) => o.id === id)
}

async function route(req, res, url) {
  const p = url.pathname
  const m = req.method

  // ---- state & events ----
  if (m === 'GET' && p === '/api/state') {
    return json(res, 200, {
      uiBuild: currentUiBuild(),
      engine: state.engine,
      live: state.live,
      context: state.context,
      jobs: state.jobs.map(publicJob),
      outputs: state.outputs,
      settings: publicConfig(),
      chatAvailable: llm.chatAvailable(),
    })
  }
  if (m === 'GET' && p === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    res.write(':ok\n\n')
    addSseClient(res)
    return
  }

  // ---- Live device bridge (device/live-link.js) ----
  if (m === 'POST' && p === '/api/live/context') {
    bridgeReport(await readBody(req))
    return json(res, 200, { ok: true })
  }
  if (m === 'POST' && p === '/api/live/transport') {
    transportReport(await readBody(req))
    return json(res, 200, { ok: true })
  }
  if (m === 'POST' && p === '/api/transport/query') {
    const t = await queryTransport()
    return json(res, 200, t ? { ok: true, ...t } : { ok: false })
  }

  // ---- context ----
  if (m === 'POST' && p === '/api/context/override') {
    const body = await readBody(req)
    const patch = {}
    for (const k of ['bpmOverride', 'keyOverride', 'sigOverride']) {
      if (k in body) patch[k] = body[k]
    }
    setContext(patch)
    return json(res, 200, state.context)
  }
  if (m === 'POST' && p === '/api/context/resync') {
    setContext({ bpmOverride: null, keyOverride: null, sigOverride: null })
    resyncFromLive()
    return json(res, 200, state.context)
  }

  // ---- generation ----
  if (m === 'POST' && p === '/api/generate') {
    const draft = await readBody(req)
    if (!draft.compiledPrompt && !draft.prompt) {
      return json(res, 400, { error: 'Empty prompt' })
    }
    const job = jobs.enqueue(draft)
    return json(res, 200, { jobId: job.id })
  }
  // Upload a reference audio file for cover/reference generation. Raw bytes in
  // the body; original name in the x-filename header. Saved into the library's
  // refs/ folder (no spaces) and its absolute path handed back for src_audio_path.
  if (m === 'POST' && p === '/api/upload/ref') {
    const len = +(req.headers['content-length'] || 0)
    if (len > 80 * 1024 * 1024) return json(res, 413, { error: 'Reference too large (max 80 MB)' })
    const buf = await readRaw(req)
    if (!buf.length) return json(res, 400, { error: 'Empty upload' })
    const orig = String(req.headers['x-filename'] || 'reference.wav')
    const ext = (path.extname(orig) || '.wav').toLowerCase()
    const stem = (path.basename(orig, path.extname(orig)) || 'reference').replace(/[^\w-]+/g, '_').slice(0, 40) || 'reference'
    const dir = path.join(loadConfig().libraryPath, 'refs')
    fs.mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, `${stem}${ext}`)
    fs.writeFileSync(dest, buf)
    return json(res, 200, { path: dest, name: `${stem}${ext}` })
  }
  let jm
  if ((jm = /^\/api\/jobs\/([\w-]+)\/(cancel|retry|dismiss)$/.exec(p)) && m === 'POST') {
    const [, id, action] = jm
    if (action === 'cancel') return json(res, 200, { ok: jobs.cancel(id) })
    if (action === 'dismiss') { jobs.dismiss(id); return json(res, 200, { ok: true }) }
    const body = await readBody(req)
    const job = jobs.retry(id, !!body.newSeed)
    return json(res, job ? 200 : 404, job ? { jobId: job.id } : { error: 'Job not found' })
  }

  // ---- outputs ----
  let om
  if ((om = /^\/api\/outputs\/([\w-]+)$/.exec(p))) {
    const output = findOutput(om[1])
    if (!output) return json(res, 404, { error: 'Output not found' })
    if (m === 'PATCH') {
      const body = await readBody(req)
      if (typeof body.name === 'string' && body.name.trim() && body.name !== output.name) {
        output.file = renameFile(output.file, body.name.trim())
        output.name = path.basename(output.file, path.extname(output.file))
        history.updateEntry(history.findByOutputId(output.id)?.id, {
          name: output.name, file: output.file,
        })
        if (armed && armed.outputId === output.id) setArmed(output) // path moved
      }
      if (typeof body.starred === 'boolean') {
        output.starred = body.starred
        history.updateEntry(history.findByOutputId(output.id)?.id, { starred: body.starred })
      }
      broadcast('output', output)
      return json(res, 200, output)
    }
    if (m === 'DELETE') {
      deleteFile(output.file)
      history.updateEntry(history.findByOutputId(output.id)?.id, { status: 'deleted', file: null })
      removeOutput(output.id)
      if (armed && armed.outputId === output.id) setArmed(state.outputs[0] || null)
      return json(res, 200, { ok: true })
    }
  }
  // Native drag-out: the UI posts here on ⠿ mousedown; the window manager
  // (pin-sidebar.ps1) polls /api/dragout/poll and starts a real Windows
  // file drag under the still-held cursor.
  if ((om = /^\/api\/outputs\/([\w-]+)\/dragout$/.exec(p)) && m === 'POST') {
    const output = findOutput(om[1])
    if (!output) return json(res, 404, { error: 'Output not found' })
    setArmed(output)
    dragOutPending = { file: output.file, outputId: output.id, name: output.name, ts: Date.now() }
    return json(res, 200, { ok: true })
  }
  if (m === 'GET' && p === '/api/dragout/poll') {
    const pending = dragOutPending && Date.now() - dragOutPending.ts < 3000 ? dragOutPending : null
    dragOutPending = null
    return json(res, 200, { file: pending ? pending.file : null })
  }
  // Drawer commands from the UI (tuck button / Esc), consumed by the
  // window manager on its next poll.
  if (m === 'POST' && p === '/api/drawer') {
    const body = await readBody(req)
    if (['collapse', 'expand', 'toggle'].includes(body.action)) drawerPending = body.action
    return json(res, 200, { ok: true })
  }
  if (m === 'GET' && p === '/api/winmgr/poll') {
    const drag = dragOutPending && Date.now() - dragOutPending.ts < 3000 ? dragOutPending : null
    const drawer = drawerPending
    dragOutPending = null
    drawerPending = null
    return json(res, 200, {
      file: drag ? drag.file : null,
      outputId: drag ? drag.outputId : null,
      name: drag ? drag.name : null,
      drawer,
      armed,
    })
  }

  if ((om = /^\/api\/outputs\/([\w-]+)\/(insert|reveal|stage)$/.exec(p)) && m === 'POST') {
    const output = findOutput(om[1])
    if (!output) return json(res, 404, { error: 'Output not found' })
    if (om[2] === 'insert') {
      const ok = await insertClip(output)
      return json(res, ok ? 200 : 409, ok ? { ok: true } : { error: 'Not connected to Ableton Live' })
    }
    if (om[2] === 'stage') {
      await stageForDrag(output)
      return json(res, 200, { ok: true })
    }
    revealFile(output.file)
    return json(res, 200, { ok: true })
  }

  // ---- history ----
  if (m === 'GET' && p === '/api/history') {
    return json(res, 200, history.query(url.searchParams.get('scope') || 'project', url.searchParams.get('q')))
  }
  if (m === 'POST' && p === '/api/history/clear') {
    const body = await readBody(req)
    history.clear(!!body.deleteFiles)
    if (body.deleteFiles) {
      for (const o of [...state.outputs]) removeOutput(o.id)
    }
    broadcast('history', {})
    return json(res, 200, { ok: true })
  }

  // ---- chat ----
  if (m === 'POST' && p === '/api/chat') {
    const body = await readBody(req)
    try {
      const result = await llm.chat(body.messages || [])
      return json(res, 200, result)
    } catch (e) {
      return json(res, 502, { error: e.message })
    }
  }

  // ---- settings & engine ----
  if (m === 'GET' && p === '/api/settings') return json(res, 200, publicConfig())
  if (m === 'PUT' && p === '/api/settings') {
    const body = await readBody(req)
    const allowed = ['engineUrl', 'libraryPath', 'chatProvider', 'chatModel', 'chatApiKey', 'chatBaseUrl']
    const patch = {}
    for (const k of allowed) if (k in body) patch[k] = body[k]
    saveConfig(patch)
    broadcast('chatAvailable', { available: llm.chatAvailable() })
    ace.checkEngine()
    return json(res, 200, publicConfig())
  }
  if (m === 'POST' && p === '/api/engine/test') {
    const r = await ace.checkEngine()
    return json(res, 200, r)
  }
  if (m === 'POST' && p === '/api/engine/init') {
    ace.initEngine()
    return json(res, 200, { ok: true })
  }
  // Smart "Fix it": revive a crashed engine, reload models, then optionally
  // retry the job that failed. Fire-and-forget — the UI watches state via SSE.
  if (m === 'POST' && p === '/api/engine/fix') {
    const body = await readBody(req).catch(() => ({}))
    ace.fixEngine()
      .then((r) => { if (r.ok && body.retryJobId) { try { jobs.retry(body.retryJobId, false) } catch { /* job gone */ } } })
      .catch(() => {})
    return json(res, 200, { ok: true })
  }

  // ---- LoRA adapters ----
  let lm2
  if ((lm2 = /^\/api\/lora\/(load|unload|scale|status)$/.exec(p))) {
    try {
      const payload = m === 'POST' ? await readBody(req) : undefined
      const r = await ace.lora(lm2[1], payload)
      return json(res, 200, r ?? { ok: true })
    } catch (e) {
      return json(res, 502, { error: e.message })
    }
  }

  // ---- audio files ----
  if (m === 'GET' && p.startsWith('/files/')) {
    const id = decodeURIComponent(p.slice(7)).replace(/\.[^.]+$/, '')
    const output = findOutput(id)
    const file = output?.file || history.findByOutputId(id)?.file
    if (!file || !fs.existsSync(file)) return json(res, 404, { error: 'File not found' })
    const ext = path.extname(file).toLowerCase()
    streamFile(res, file, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': fs.statSync(file).size,
      'accept-ranges': 'bytes',
    })
    return
  }

  // ---- diagnostics ----
  if (m === 'GET' && p === '/api/logs') {
    const limit = Math.min(500, Number(url.searchParams.get('limit')) || 200)
    return json(res, 200, {
      sidecar: recentLogs(limit),
      engineOut: tailFile(path.join(LOG_DIR, 'engine.out.log'), 8 * 1024),
      engineErr: tailFile(path.join(LOG_DIR, 'engine.err.log'), 8 * 1024),
      engine: state.engine,
      live: state.live,
    })
  }

  // ---- static UI ----
  if (m === 'GET') {
    if (p === '/') {
      // Which browser is embedding us? (jweb's Chromium version matters)
      console.log(`[ui] page load from: ${req.headers['user-agent'] || 'unknown'}`)
    }
    let rel = p === '/' ? '/index.html' : p
    const file = path.normalize(path.join(PUBLIC_DIR, rel))
    if (file.startsWith(PUBLIC_DIR) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      streamFile(res, file, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
      return
    }
  }

  json(res, 404, { error: 'Not found' })
}

// The hashed JS bundle name identifies the build; pages compare it against
// their own script tag and self-reload on mismatch (survives races between
// builds and sidecar restarts).
function currentUiBuild() {
  try {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
    const m = /assets\/(index-[\w-]+\.js)/.exec(html)
    return m ? m[1] : null
  } catch {
    return null
  }
}

// When a new UI build lands in public/, tell every open page (device strip,
// floating sidebar, browser tabs) to reload itself — no set-reopening.
function watchUiBuild() {
  let timer = null
  try {
    fs.watch(PUBLIC_DIR, { recursive: true }, () => {
      clearTimeout(timer)
      timer = setTimeout(() => broadcast('reload', {}), 800)
    })
  } catch { /* fs.watch unavailable; manual reload still works */ }
}

export function startServer(port = 8765) {
  loadConfig()
  watchUiBuild()
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    route(req, res, url).catch((e) => {
      const status = e.httpStatus || 500
      if (status >= 500) {
        logError('http', `${req.method} ${url.pathname} -> ${e.message}`,
          e.stack?.split('\n').slice(0, 6).join('\n'))
      }
      if (!res.headersSent) json(res, status, { error: e.message })
      else res.destroy()
    })
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`[ace-sidebar] http://127.0.0.1:${port}`)
  })
  return server
}
