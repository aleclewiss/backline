// live-link.js — runs in [node.script] inside the ACE Sidebar M4L device.
// Thin bridge between Ableton Live and the standalone sidecar server
// (autostarted at login on http://127.0.0.1:8765).
//
//   Live -> server : context updates from live-bridge.js (tempo/sig/scale/
//                    project) are POSTed to /api/live/context (+heartbeat)
//   server -> Live : SSE /events "maxCommand" events are re-emitted out of
//                    node.script (insert_clip -> [js], stage -> [live.drag])
//
// Deliberately old-Node-safe: CommonJS, node:http only, no fetch/??/?.

const maxApi = require('max-api')
const http = require('http')

const HOST = '127.0.0.1'
const PORT = parseInt(process.env.ACE_SIDEBAR_PORT || '8765', 10)

let context = { bpm: null, sig: null, key: null, projectName: null }
let postTimer = null
let sseAlive = false

function log(msg) {
  maxApi.post('[ace-link] ' + msg)
}

// ---- Live -> server ----

function queuePost() {
  if (postTimer) clearTimeout(postTimer)
  postTimer = setTimeout(postContext, 300)
}

function postJson(path, obj) {
  const body = JSON.stringify(obj)
  const req = http.request(
    { host: HOST, port: PORT, path: path, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
    function (res) { res.resume() },
  )
  req.on('error', function () { /* server down; heartbeat will retry */ })
  req.end(body)
}

function postContext() {
  postTimer = null
  postJson('/api/live/context', context)
}

maxApi.addHandler('tempo', function (bpm) {
  context.bpm = Number(bpm)
  queuePost()
})
maxApi.addHandler('signature', function (num, den) {
  context.sig = String(num) + '/' + String(den)
  queuePost()
})
maxApi.addHandler('scale', function (root, scale) {
  context.key = String(root) + ' ' + String(scale || 'major').toLowerCase()
  queuePost()
})
maxApi.addHandler('project', function (name) {
  context.projectName = String(name || 'default')
  queuePost()
})
maxApi.addHandler('insert_result', function (ok) {
  // best-effort informational; the server treats staging as success anyway
})
maxApi.addHandler('transport', function (playing, beats, tempo, num) {
  postJson('/api/live/transport', {
    playing: Number(playing), beats: Number(beats),
    tempo: Number(tempo), num: Number(num),
  })
})

setInterval(postContext, 10000) // heartbeat: keeps live.connected=true server-side

// ---- server -> Live (SSE) ----

function connectEvents() {
  const req = http.request(
    { host: HOST, port: PORT, path: '/events', method: 'GET',
      headers: { accept: 'text/event-stream' } },
    function (res) {
      sseAlive = true
      log('connected to sidecar')
      postContext()
      maxApi.outlet('resync') // ask live-bridge.js to push fresh context
      let buf = ''
      let eventType = ''
      res.setEncoding('utf8')
      res.on('data', function (chunk) {
        buf += chunk
        let idx
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '')
          buf = buf.slice(idx + 1)
          if (line.indexOf('event: ') === 0) {
            eventType = line.slice(7).trim()
          } else if (line.indexOf('data: ') === 0 && eventType === 'maxCommand') {
            try {
              const cmd = JSON.parse(line.slice(6))
              const args = [cmd.cmd].concat(cmd.args || [])
              maxApi.outlet.apply(maxApi, args)
            } catch (e) { log('bad maxCommand: ' + e.message) }
          } else if (line === '') {
            eventType = ''
          }
        }
      })
      res.on('end', retry)
      res.on('error', retry)
    },
  )
  req.on('error', retry)
  req.end()

  let retried = false
  function retry() {
    if (retried) return
    retried = true
    if (sseAlive) log('lost sidecar - reconnecting')
    sseAlive = false
    setTimeout(connectEvents, 3000)
  }
}

connectEvents()
log('bridge up - sidecar expected at http://' + HOST + ':' + PORT)
