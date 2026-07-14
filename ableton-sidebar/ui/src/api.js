// Thin client for the sidecar API. All endpoints are same-origin
// (sidecar serves the built UI; vite dev proxies to it).

async function req(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).error || '' } catch { /* ignore */ }
    throw new Error(detail || `${method} ${path} failed (${res.status})`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  getState: () => req('GET', '/api/state'),
  overrideContext: (patch) => req('POST', '/api/context/override', patch),
  resyncContext: () => req('POST', '/api/context/resync'),

  generate: (draft) => req('POST', '/api/generate', draft),
  uploadRef: async (file) => {
    const res = await fetch('/api/upload/ref', {
      method: 'POST',
      headers: { 'x-filename': file.name || 'reference.wav', 'content-type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) {
      let detail = ''
      try { detail = (await res.json()).error || '' } catch { /* ignore */ }
      throw new Error(detail || `upload failed (${res.status})`)
    }
    return res.json()
  },
  cancelJob: (id) => req('POST', `/api/jobs/${id}/cancel`),
  retryJob: (id, newSeed) => req('POST', `/api/jobs/${id}/retry`, { newSeed }),
  dismissJob: (id) => req('POST', `/api/jobs/${id}/dismiss`),

  renameOutput: (id, name) => req('PATCH', `/api/outputs/${id}`, { name }),
  starOutput: (id, starred) => req('PATCH', `/api/outputs/${id}`, { starred }),
  deleteOutput: (id) => req('DELETE', `/api/outputs/${id}`),
  insertOutput: (id) => req('POST', `/api/outputs/${id}/insert`),
  stageOutput: (id) => req('POST', `/api/outputs/${id}/stage`),
  dragOut: (id) => req('POST', `/api/outputs/${id}/dragout`),
  drawer: (action) => req('POST', '/api/drawer', { action }),
  revealOutput: (id) => req('POST', `/api/outputs/${id}/reveal`),

  getHistory: (scope, q) =>
    req('GET', `/api/history?scope=${scope}&q=${encodeURIComponent(q || '')}`),
  clearHistory: (deleteFiles) => req('POST', '/api/history/clear', { deleteFiles }),

  chat: (messages) => req('POST', '/api/chat', { messages }),

  queryTransport: () => req('POST', '/api/transport/query'),
  getLogs: (limit) => req('GET', `/api/logs${limit ? `?limit=${limit}` : ''}`),
  getSettings: () => req('GET', '/api/settings'),
  putSettings: (settings) => req('PUT', '/api/settings', settings),
  testEngine: () => req('POST', '/api/engine/test'),
  initEngine: () => req('POST', '/api/engine/init'),
  fix: (retryJobId) => req('POST', '/api/engine/fix', { retryJobId }),
  lora: (action, payload) =>
    action === 'status' ? req('GET', '/api/lora/status') : req('POST', `/api/lora/${action}`, payload),
}

// Server-sent events: job progress, new outputs, context changes, engine status.
// `onConnection(bool)` fires on open/drop so the UI can show a live banner
// instead of silently freezing on stale data.
export function subscribeEvents(handlers, onConnection) {
  let es
  let closed = false
  const connect = () => {
    if (closed) return
    es = new EventSource('/events')
    es.onopen = () => onConnection?.(true)
    for (const [type, fn] of Object.entries(handlers)) {
      es.addEventListener(type, (e) => fn(JSON.parse(e.data)))
    }
    es.onerror = () => {
      onConnection?.(false)
      es.close()
      if (!closed) setTimeout(connect, 2000)
    }
  }
  connect()
  return () => { closed = true; es && es.close() }
}

export function fileUrl(output) {
  return `/files/${output.id}${output.ext || '.wav'}`
}
