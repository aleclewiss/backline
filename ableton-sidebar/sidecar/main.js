import { startServer } from './lib/server.js'
import { initMaxBridge, watchBridge } from './lib/maxbridge.js'
import { rehydrateOutputs } from './lib/history.js'
import { state, setArmed } from './lib/state.js'
import { checkEngine, watchEngine } from './lib/ace.js'

const PORT = Number(process.env.ACE_SIDEBAR_PORT || 8765)

state.outputs = rehydrateOutputs()
setArmed(state.outputs[0] || null)
await initMaxBridge()
startServer(PORT)
checkEngine()
watchEngine()
watchBridge()
