import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Structured sidecar logging: everything goes to the console (so autostart's
// redirect still works), to logs/sidecar.log (size-rotated), and into an
// in-memory ring buffer that /api/logs serves to the UI's diagnostics panel.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const LOG_DIR = path.join(__dirname, '..', '..', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'sidecar.log')
const MAX_FILE_BYTES = 1024 * 1024 // rotate at 1 MB, keep one .old
const RING_MAX = 500

const ring = []

function stamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function rotateIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_FILE_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.old') // overwrites previous .old
    }
  } catch { /* rotation is best-effort */ }
}

export function log(level, tag, message, detail) {
  const entry = { ts: Date.now(), level, tag, message: String(message) }
  if (detail != null) entry.detail = String(detail).slice(0, 2000)
  ring.push(entry)
  if (ring.length > RING_MAX) ring.shift()

  const line = `${stamp()} ${level.toUpperCase().padEnd(5)} [${tag}] ${entry.message}` +
    (entry.detail ? `\n    ${entry.detail.replace(/\n/g, '\n    ')}` : '')
  ;(level === 'error' ? console.error : console.log)(line)
  try {
    rotateIfNeeded()
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch { /* disk logging is best-effort */ }
}

export const info = (tag, msg, detail) => log('info', tag, msg, detail)
export const warn = (tag, msg, detail) => log('warn', tag, msg, detail)
export const error = (tag, msg, detail) => log('error', tag, msg, detail)

export function recentLogs(limit = 200) {
  return ring.slice(-limit)
}

// Tail a log file (engine stdout/stderr) without loading the whole thing.
export function tailFile(file, maxBytes = 16 * 1024) {
  try {
    const size = fs.statSync(file).size
    const fd = fs.openSync(file, 'r')
    const start = Math.max(0, size - maxBytes)
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    fs.closeSync(fd)
    const text = buf.toString('utf8')
    // drop the first partial line when we started mid-file
    return start > 0 ? text.slice(text.indexOf('\n') + 1) : text
  } catch {
    return ''
  }
}
