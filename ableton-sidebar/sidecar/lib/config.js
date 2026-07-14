import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const CONFIG_DIR = path.join(os.homedir(), '.ace-sidebar')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const DEFAULTS = {
  engineUrl: process.env.ACE_ENGINE_URL || 'http://127.0.0.1:8001',
  // No spaces: file paths travel through Max messages, which split on spaces.
  libraryPath: path.join(os.homedir(), 'Music', 'ACE-Sidebar'),
  chatProvider: 'anthropic',
  chatModel: '',
  chatApiKey: '',
  chatBaseUrl: '',
}

let config = null

export function loadConfig() {
  if (config) return config
  try {
    config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }
  } catch {
    config = { ...DEFAULTS }
  }
  fs.mkdirSync(config.libraryPath, { recursive: true })
  return config
}

export function saveConfig(patch) {
  config = { ...loadConfig(), ...patch }
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
  fs.mkdirSync(config.libraryPath, { recursive: true })
  return config
}

// What the UI is allowed to see (no secrets).
export function publicConfig() {
  const c = loadConfig()
  return {
    engineUrl: c.engineUrl,
    libraryPath: c.libraryPath,
    chatProvider: c.chatProvider,
    chatModel: c.chatModel,
    chatBaseUrl: c.chatBaseUrl,
    hasChatKey: !!c.chatApiKey,
  }
}
