import { api } from './api.js'

let toastEl = null
let toastTimer = null

export function showToast(text) {
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.className = 'toast'
    document.body.appendChild(toastEl)
  }
  toastEl.textContent = text
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600)
}

// Whole-card drag-out.
//
// In the Backline desktop shell: window.backline.startDrag() starts a REAL
// OS file drag from our own window (Electron webContents.startDrag) — drop
// it straight onto any Ableton track. Wired via onDragStart below.
//
// In Max's jweb / plain browsers: moving >5px while held stages the file on
// the device's drag square (jweb can't carry files in a drag).
export function dragOutHandler(output) {
  const outputId = typeof output === 'string' ? output : output.id
  return (e) => {
    if (window.backline) return // native path handles it via onDragStart
    if (e.button !== 0) return
    if (e.target.closest('button, input, select, textarea, .menu')) return
    const x0 = e.clientX
    const y0 = e.clientY
    let done = false
    const cleanup = () => {
      done = true
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', cleanup)
    }
    const onMove = (ev) => {
      if (done) return
      if (Math.abs(ev.clientX - x0) > 5 || Math.abs(ev.clientY - y0) > 5) {
        // Pulling a card loads it onto the device's drag square.
        api.stageOutput(outputId).catch((err) => showToast(`Stage failed — ${err.message}`))
        showToast('On the drag square in the Backline device — drag it in from there')
        cleanup()
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', cleanup)
    setTimeout(cleanup, 10000) // OS drag can swallow mouseup; don't leak
  }
}

// Native drag (desktop shell only): call from an element's onDragStart.
export function nativeDragStart(output) {
  return (e) => {
    if (!window.backline || !output?.file) return
    e.preventDefault() // hand the gesture to the OS drag Electron starts
    window.backline.startDrag(output.file)
  }
}
