import { loadConfig } from './config.js'
import { state, effectiveContext } from './state.js'

// Chat assistant proxy. The UI never sees API keys; requests route through
// here to whichever provider the user configured.

const SYSTEM_PROMPT = `You are a music production assistant embedded in an Ableton Live sidebar that generates audio with ACE-Step (a text-to-music model). Help the user refine ideas, suggest what to layer next, and convert conversation into generation prompts.

Be brief (2-4 sentences unless asked for more). You are talking to a producer mid-session.

When you have a concrete generation suggestion, end your reply with a proposal block in EXACTLY this format (one line, valid JSON):
PROPOSAL: {"prompt": "<caption text>", "type": "loop|oneshot|stem|phrase|texture|song", "lengthBars": <1|2|4|8|16>, "guided": {"role": "<Drums|Bass|Keys|Pads|Lead|Vocal|FX or null>", "genre": "<genre or empty>", "moods": ["<up to 3>"]}}
Only include a PROPOSAL when you're actually proposing something to generate. The prompt should be a comma-separated caption of instrument, genre, mood, character - the style ACE-Step responds well to. Do not mention the PROPOSAL mechanism to the user.`

function contextBlock() {
  const c = effectiveContext()
  return `Current session: ${c.bpm} BPM, key ${c.key || 'unknown'}, ${c.sig}. Recent generations: ${
    state.outputs.slice(0, 5).map((o) => o.name).join(', ') || 'none yet'
  }.`
}

export function chatAvailable() {
  return !!loadConfig().chatApiKey
}

export async function chat(messages) {
  const cfg = loadConfig()
  if (!cfg.chatApiKey) {
    const err = new Error('No API key configured - add one in Settings')
    err.code = 'no_key'
    throw err
  }
  const sys = `${SYSTEM_PROMPT}\n\n${contextBlock()}`
  const raw =
    cfg.chatProvider === 'anthropic'
      ? await chatAnthropic(cfg, sys, messages)
      : await chatOpenAICompat(cfg, sys, messages)
  return parseProposal(raw)
}

async function chatAnthropic(cfg, system, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': cfg.chatApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.chatModel || 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  })
  if (!res.ok) throw await providerError(res, 'Anthropic')
  const data = await res.json()
  return data.content?.map((b) => b.text || '').join('') || ''
}

async function chatOpenAICompat(cfg, system, messages) {
  const base =
    cfg.chatProvider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : cfg.chatProvider === 'custom'
        ? (cfg.chatBaseUrl || '').replace(/\/$/, '')
        : 'https://api.openai.com/v1'
  if (!base) throw new Error('Custom provider needs a base URL in Settings')
  const model =
    cfg.chatModel ||
    (cfg.chatProvider === 'openrouter' ? 'anthropic/claude-haiku-4.5' : 'gpt-4o-mini')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.chatApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  })
  if (!res.ok) throw await providerError(res, cfg.chatProvider)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function providerError(res, provider) {
  let detail = ''
  try {
    const j = await res.json()
    detail = j.error?.message || j.message || ''
  } catch { /* non-json body */ }
  if (res.status === 401 || res.status === 403) {
    return new Error(`${provider}: API key rejected - check it in Settings`)
  }
  if (res.status === 429) return new Error(`${provider}: rate limited - try again shortly`)
  if (res.status >= 500) return new Error(`${provider} is unavailable right now`)
  return new Error(`${provider} error ${res.status}${detail ? `: ${detail}` : ''}`)
}

function parseProposal(text) {
  const m = /PROPOSAL:\s*(\{.*\})\s*$/s.exec(text)
  if (!m) return { reply: text.trim(), proposal: null }
  let proposal = null
  try {
    proposal = JSON.parse(m[1])
  } catch { /* malformed - show as text */ }
  return { reply: text.slice(0, m.index).trim(), proposal }
}
