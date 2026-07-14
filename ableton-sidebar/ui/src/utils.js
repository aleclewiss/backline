export const TYPES = [
  { id: 'loop', label: 'Loop' },
  { id: 'oneshot', label: 'One-shot' },
  { id: 'stem', label: 'Stem' },
  { id: 'phrase', label: 'Phrase' },
  { id: 'texture', label: 'Texture' },
  { id: 'song', label: 'Full Song' },
]

export const ROLES = ['Drums', 'Bass', 'Guitar', 'Keys', 'Pads', 'Lead', 'Vocal', 'FX']
export const MOODS = [
  'dark', 'bright', 'warm', 'cold', 'dreamy', 'aggressive', 'chill',
  'epic', 'melancholic', 'uplifting', 'gritty', 'lush',
]
export const GENRES = [
  'house', 'deep house', 'techno', 'trance', 'drum and bass', 'dubstep',
  'hip hop', 'trap', 'lo-fi', 'ambient', 'synthwave', 'pop', 'rock',
  'funk', 'jazz', 'r&b', 'soul', 'cinematic', 'orchestral', 'edm',
]
export const BAR_OPTIONS = [1, 2, 4, 8, 16]

const TYPE_PATTERNS = [
  [/\bfull\s+song\b|\bwhole\s+song\b|\bcomplete\s+song\b|\bentire\s+track\b/i, 'song'],
  [/\bone[\s-]?shot\b|\bsingle\s+hit\b|\bstab\b/i, 'oneshot'],
  [/\btexture\b|\batmosphere\b|\bsoundscape\b|\bdrone\b/i, 'texture'],
  [/\bstem\b/i, 'stem'],
  [/\bphrase\b|\briff\b|\blick\b|\bmelody\s+line\b/i, 'phrase'],
  [/\bloop\b/i, 'loop'],
]

// Returns a type id if the prompt clearly implies one, else null.
export function detectTypeInPrompt(prompt) {
  for (const [re, type] of TYPE_PATTERNS) {
    if (re.test(prompt)) return type
  }
  return null
}

const TYPE_DESCRIPTOR = {
  loop: 'seamless loop',
  oneshot: 'single one-shot hit, short decay, silence after',
  stem: 'isolated solo stem, no other instruments',
  phrase: 'short musical phrase',
  texture: 'evolving ambient texture, atmospheric',
  song: 'full song with structure',
}

// Compiles the draft into the style caption sent to the engine.
// The caption is STYLE ONLY — bpm, key, time signature, and duration always
// travel as structured settings (the engine builds its own metadata from
// them); repeating them as caption text degrades results. With Enhance off
// (or repainting), the user's words go through verbatim.
export function compilePrompt(draft) {
  if (draft.autoTags === false || draft.repaint || draft.cover || draft.extend) {
    return draft.prompt.trim()
  }
  const parts = []
  if (draft.prompt.trim()) parts.push(draft.prompt.trim())
  parts.push(TYPE_DESCRIPTOR[draft.type])
  if (draft.type !== 'song') parts.push('instrumental')
  return parts.join(', ')
}

// Duration in seconds for the requested asset at the chosen tempo (AUTO → 120).
export function draftDuration(draft) {
  if (draft.type === 'song') return draft.durationSec
  const bpm = draft.bpm ?? 120
  const [num] = parseSig(draft.sig ?? '4/4')
  const secPerBar = (60 / bpm) * num
  if (draft.type === 'oneshot') return Math.max(2, Math.round(secPerBar))
  return Math.max(3, Math.round(secPerBar * draft.lengthBars))
}

export function parseSig(sig) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(sig || '4/4')
  return m ? [+m[1], +m[2]] : [4, 4]
}

export function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return '0:00'
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function fmtElapsed(startedAt) {
  return fmtTime((Date.now() - startedAt) / 1000)
}

export function relDay(ts) {
  const d = new Date(ts)
  const today = new Date()
  const yest = new Date(today.getTime() - 86400000)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, yest)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.id, t.label]))

// Heuristic caption repair for the "Fix it → improve" path. ACE-Step sounds
// thin/fake when a prompt is sparse or asks for an exposed solo instrument;
// it sounds best with a full, polished arrangement. So: drop the thinning
// descriptors, reframe an exposed guitar as a strummed rhythm, and ensure
// fuller-production cues are present. Deterministic — works with no API key.
const THINNING = /\b(stripped[-\s]?back|stripped[-\s]?down|organic|raw|sparse|minimal(ist)?|bare|bedroom|unplugged|acoustic[-\s]?only|solo)\b/i
const FULL_CUES = ['layered background harmonies', 'tight punchy drums', 'warm and polished', 'radio-ready']

export function improveCaption(caption) {
  let parts = String(caption || '').split(',').map((s) => s.trim()).filter(Boolean)
  parts = parts.filter((p) => !THINNING.test(p))
  const joined = () => parts.join(', ').toLowerCase()
  if (/guitar/.test(joined()) && !/strummed/.test(joined())) {
    parts.push('realistic strummed rhythm guitar with natural string resonance')
  }
  for (const cue of FULL_CUES) {
    const head = cue.split(' ')[0]
    if (!joined().includes(head)) parts.push(cue)
  }
  return parts.join(', ')
}
