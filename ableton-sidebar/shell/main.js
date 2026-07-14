// Backline desktop shell: a real window for the sidebar UI, always-on-top
// beside Ableton, with NATIVE file drag-out (webContents.startDrag) — the
// same pattern Splice uses, and the reliable answer to the drag saga
// (DoDragDrop from a window we own, on a fresh press on that window).
//
// The sidecar keeps running standalone (autostart); if it isn't up yet the
// shell spawns it. The Max device stays as a headless Live-API bridge.

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const SIDECAR_URL = 'http://127.0.0.1:8765'
const SIDECAR_MAIN = path.join(__dirname, '..', 'sidecar', 'main.js')
const LOG_DIR = path.join(__dirname, '..', 'logs')

let win = null
let tray = null
let sidecarChild = null // set only if WE started it

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) { win.show(); win.focus() }
  })
}

async function sidecarUp() {
  try {
    const res = await fetch(SIDECAR_URL + '/api/state', { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch { return false }
}

async function ensureSidecar() {
  if (await sidecarUp()) return true
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    const out = fs.openSync(path.join(LOG_DIR, 'sidecar.out.log'), 'a')
    const err = fs.openSync(path.join(LOG_DIR, 'sidecar.err.log'), 'a')
    sidecarChild = spawn(process.platform === 'win32' ? 'node.exe' : 'node', [SIDECAR_MAIN], {
      cwd: path.dirname(SIDECAR_MAIN),
      stdio: ['ignore', out, err],
      windowsHide: true,
    })
  } catch (e) {
    console.error('failed to spawn sidecar:', e)
  }
  for (let i = 0; i < 40; i++) { // ~20 s
    if (await sidecarUp()) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

function dragIcon() {
  // Simple 32x32 note glyph rendered to a data URL at build time would be
  // nicer; a solid rounded square reads fine as a drag ghost.
  const png = nativeImage.createFromPath(path.join(__dirname, 'assets', 'drag.png'))
  return png.isEmpty() ? nativeImage.createEmpty() : png
}

function createWindow() {
  win = new BrowserWindow({
    title: 'Backline',
    width: 480,
    height: 940,
    minWidth: 390,
    minHeight: 600,
    autoHideMenuBar: true,
    alwaysOnTop: false,
    backgroundColor: '#f7f6f3',
    icon: path.join(__dirname, 'assets', 'backline.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadURL(SIDECAR_URL)
  win.on('closed', () => { win = null })

  // Keep "always on top" honest across Live grabbing focus: 'floating' level
  // sits above normal windows but below fullscreen video etc.
  ipcMain.removeAllListeners('backline:always-on-top')
  ipcMain.on('backline:always-on-top', (_e, on) => {
    win?.setAlwaysOnTop(!!on, 'floating')
    updateTray()
  })
}

// Native file drag-out: the renderer calls this on mousedown+drag of a card.
ipcMain.on('backline:dragout', (event, filePath) => {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return
  event.sender.startDrag({ file: filePath, icon: dragIcon() })
})

ipcMain.handle('backline:is-always-on-top', () => win?.isAlwaysOnTop() ?? false)
ipcMain.on('backline:open-logs', () => shell.openPath(LOG_DIR))

function updateTray() {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win?.isVisible() ? 'Hide Backline' : 'Show Backline',
      click: () => { if (!win) return createWindow(); win.isVisible() ? win.hide() : win.show() } },
    { label: 'Always on top', type: 'checkbox', checked: win?.isAlwaysOnTop() ?? false,
      click: (item) => { win?.setAlwaysOnTop(item.checked, 'floating') } },
    { type: 'separator' },
    { label: 'Open logs folder', click: () => shell.openPath(LOG_DIR) },
    { label: 'Reload UI', click: () => win?.webContents.reloadIgnoringCache() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]))
}

app.whenReady().then(async () => {
  const ok = await ensureSidecar()
  createWindow()
  if (!ok) {
    // The UI itself shows a clear banner once the sidecar comes up; until
    // then Electron's failed-load page would be blank, so retry the load.
    const retry = setInterval(async () => {
      if (await sidecarUp()) { clearInterval(retry); win?.loadURL(SIDECAR_URL) }
    }, 2000)
  }
  const trayImg = nativeImage.createFromPath(path.join(__dirname, 'assets', 'backline.png'))
  tray = new Tray(trayImg.isEmpty() ? nativeImage.createEmpty() : trayImg.resize({ width: 16, height: 16 }))
  tray.setToolTip('Backline')
  tray.on('click', () => { if (!win) return createWindow(); win.show(); win.focus() })
  updateTray()
})

app.on('window-all-closed', () => {
  // Stay in the tray; Quit lives in the tray menu.
})

app.on('before-quit', () => {
  // Only stop the sidecar if this shell started it (autostarted ones keep
  // serving the Max device strip and browser tabs).
  if (sidecarChild && !sidecarChild.killed) sidecarChild.kill()
})
