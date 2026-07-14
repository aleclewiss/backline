import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'
import { state } from './state.js'

// ---- naming ----

const ROLE_WORDS = ['bass', 'bassline', 'sub', 'drums', 'drum', 'beat', 'kick',
  'snare', 'hat', 'hats', 'perc', 'keys', 'piano', 'pad', 'pads', 'lead',
  'synth', 'vocal', 'vox', 'guitar', 'strings', 'brass', 'fx', 'arp', 'arps',
  'pluck', 'chord', 'chords', 'melody', 'texture', 'stab', 'riser']

const STOP_WORDS = new Set(['a', 'an', 'the', 'with', 'and', 'or', 'of', 'in', 'for',
  'some', 'make', 'me', 'i', 'want', 'need', 'please', 'that', 'this', 'like',
  'sounds', 'sounding', 'style', 'bpm', 'key', 'bars', 'bar', 'loop', 'one-shot',
  'oneshot', 'stem', 'phrase', 'song', 'full', 'seamless', 'instrumental'])

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9#]+/g, '_').replace(/^_+|_+$/g, '')
}

export function shortKey(key) {
  if (!key) return null
  const m = /^([A-G][#b]?)\s*(major|minor|maj|min|m)?/i.exec(key.trim())
  if (!m) return slug(key)
  const root = m[1].toUpperCase().replace('B#', 'C')
  const isMinor = m[2] && /^min|^m$/i.test(m[2])
  return isMinor ? `${root}m` : root
}

// bass_dark_8bar_120bpm_Am
export function defaultName(draft, ctx, index, total) {
  const words = (draft.prompt || '').toLowerCase().split(/[^a-z0-9#]+/).filter(Boolean)
  let role = draft.guided?.role ? draft.guided.role.toLowerCase() : null
  if (!role) role = words.find((w) => ROLE_WORDS.includes(w)) || null
  if (!role) role = draft.type === 'song' ? 'song' : draft.type

  const descriptors = []
  if (draft.guided?.moods?.length) descriptors.push(draft.guided.moods[0].toLowerCase())
  for (const w of words) {
    if (descriptors.length >= 2) break
    if (w !== role && !descriptors.includes(w) && !STOP_WORDS.has(w) && !ROLE_WORDS.includes(w) && w.length > 2) {
      descriptors.push(w)
    }
  }

  const parts = [role, ...descriptors.slice(0, 2)]
  if (draft.type !== 'song' && draft.type !== 'oneshot') parts.push(`${draft.lengthBars}bar`)
  if (ctx.bpm && draft.type !== 'oneshot') parts.push(`${Math.round(ctx.bpm)}bpm`)
  let name = parts.map(slug).filter(Boolean).join('_')
  const k = shortKey(ctx.key) // appended un-slugged: Am, not am
  if (k) name += `_${k.replace(/[^A-Ga-g#bm]/g, '')}`
  if (total > 1) name += `_v${index + 1}`
  return name
}

// ---- files ----

export function projectDir() {
  const cfg = loadConfig()
  const dir = path.join(cfg.libraryPath, sanitize(state.live.projectName || 'default'))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function sanitize(s) {
  // Spaces break Max message parsing when paths are sent to the device.
  return s.replace(/[<>:"/\\|?*]+/g, '_').trim().replace(/\s+/g, '_') || 'default'
}

export function uniquePath(dir, base, ext) {
  let p = path.join(dir, base + ext)
  let n = 2
  while (fs.existsSync(p)) p = path.join(dir, `${base}_${n++}${ext}`)
  return p
}

// Move a generated file into the library under its default name.
export function adoptFile(srcPath, name, ext) {
  const dest = uniquePath(projectDir(), name, ext)
  try {
    fs.renameSync(srcPath, dest)
  } catch {
    fs.copyFileSync(srcPath, dest) // cross-device fallback
    try { fs.unlinkSync(srcPath) } catch { /* leave source */ }
  }
  return dest
}

export function writeFileToLibrary(buffer, name, ext) {
  const dest = uniquePath(projectDir(), name, ext)
  fs.writeFileSync(dest, buffer)
  return dest
}

export function renameFile(oldPath, newName) {
  const ext = path.extname(oldPath)
  const dest = uniquePath(path.dirname(oldPath), sanitize(newName), ext)
  fs.renameSync(oldPath, dest)
  return dest
}

export function deleteFile(p) {
  try { fs.unlinkSync(p) } catch { /* already gone */ }
}

export function fileSize(p) {
  try { return fs.statSync(p).size } catch { return 0 }
}
