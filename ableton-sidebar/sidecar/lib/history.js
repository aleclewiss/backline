import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'
import { state } from './state.js'
import { deleteFile } from './library.js'

// Append-friendly JSON store: one file for all projects, survives Live
// restarts. Small enough (<few MB) that read-modify-write is fine.

function storePath() {
  return path.join(loadConfig().libraryPath, 'history.json')
}

let cache = null

function load() {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(storePath(), 'utf8'))
    if (!Array.isArray(cache.entries)) cache = { entries: [] }
  } catch {
    cache = { entries: [] }
  }
  return cache
}

function persist() {
  const p = storePath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 1))
  fs.renameSync(tmp, p)
}

export function addEntry(entry) {
  const db = load()
  db.entries.unshift(entry)
  if (db.entries.length > 5000) db.entries.length = 5000
  persist()
  return entry
}

export function updateEntry(id, patch) {
  const db = load()
  const e = db.entries.find((x) => x.id === id)
  if (e) {
    Object.assign(e, patch)
    persist()
  }
  return e
}

export function query(scope, q) {
  const db = load()
  let out = db.entries
  if (scope === 'project') {
    const proj = state.live.projectName || 'default'
    out = out.filter((e) => e.project === proj)
  }
  if (q) {
    const needle = q.toLowerCase()
    out = out.filter(
      (e) =>
        (e.name || '').toLowerCase().includes(needle) ||
        (e.prompt || '').toLowerCase().includes(needle),
    )
  }
  return out.slice(0, 500)
}

export function clear(deleteFiles) {
  const db = load()
  if (deleteFiles) {
    for (const e of db.entries) {
      if (e.file) deleteFile(e.file)
    }
  }
  cache = { entries: [] }
  persist()
}

// Rebuild in-memory outputs from history on boot so previous session's
// results reappear in the sidebar.
export function rehydrateOutputs() {
  const db = load()
  const outputs = []
  for (const e of db.entries) {
    if (e.status === 'done' && e.outputId && e.file && fs.existsSync(e.file)) {
      outputs.push({
        id: e.outputId,
        jobId: e.jobId,
        name: e.name,
        ext: e.ext || '.wav',
        file: e.file,
        meta: e.meta || {},
        starred: !!e.starred,
        createdAt: e.createdAt,
        draft: e.draft,
      })
    }
    if (outputs.length >= 40) break
  }
  return outputs
}

export function findByOutputId(outputId) {
  return load().entries.find((e) => e.outputId === outputId)
}
