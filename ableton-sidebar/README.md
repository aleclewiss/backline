# Backline

**Turn a prompt into a finished-sounding song.** Backline is a standalone
desktop studio for making music with the open-source
[ACE-Step](https://github.com/ace-step/ACE-Step) model — describe the vibe,
write (or auto-generate) lyrics, audition takes, and download or drag the
result into any DAW. It also links to **Ableton Live** for tempo/key sync and
clip drop-in when Live is running, but Live is optional.

> Product & creative direction by Alec Lewis. Application developed with AI
> coding assistance.

---

## What it does

- **Text-to-music** — a caption (style only), structured **BPM / Key / Time /
  Duration / Vocal language** fields, and optional **lyrics** with
  `[verse]`/`[chorus]` structure tags. Any field can be set to **AUTO** to let
  the model decide.
- **Instrumental or vocal** — 50-language vocal dropdown, with
  "Instrumental / auto" as the default.
- **Cover / reference / repaint / extend** — seed a generation from an existing
  audio file (see limits below).
- **Audition fast** — Spotify-style results list, hover-to-play, waveform
  scrubber, live stereo meter, variation groups with a Compare view.
- **Self-heal** — a smart **Fix it** button that revives a crashed engine,
  reloads models, and retries the failed job.
- **Get audio out** — download the WAV, drag the file anywhere, or (with Live)
  insert straight into the selected Session slot.

The engine renders at project tempo with exact bar lengths, so clips warp 1:1.

---

## Architecture

```
ableton-sidebar/
├── shell/     Electron desktop app — the Backline window. Tray, always-on-top
│              "Pin", and native file drag-out. `npm start`. Spawns the
│              sidecar if it isn't already running.
├── ui/        React + Vite front end (Zustand store). Builds into
│              sidecar/public. Three-pane studio: Results (left) · Composer +
│              player (center) · Assistant chat (right).
├── sidecar/   Zero-dependency Node server on 127.0.0.1:8765. Job queue, SSE,
│              history/library, structured logging, ACE-Step client, chat proxy.
├── device/    Max for Live device — a HEADLESS Live-API bridge: forwards
│              tempo/key/signature/project to the sidecar and executes
│              insert-clip / stage commands from it.
└── scripts/   Autostart (login VBS/PowerShell) and helper utilities.
```

**Why the split:** the ACE-Step engine is a separate Python REST server (port
8001). The sidecar is the brain — it talks to that engine, manages files and
jobs, and serves the UI. The Electron shell is the everyday window; the M4L
device is a thin bridge so the app can sync with Live and drop clips in
without depending on Live's older bundled Node runtime.

### Key components

| Layer | Files |
| --- | --- |
| Composer / options | `ui/src/components/GenerateZone.jsx`, `ModeTabs.jsx`, `AdvancedControls.jsx` |
| Results / playback | `Results.jsx`, `OutputCard.jsx`, `NowPlaying.jsx`, `Waveform.jsx`, `CompareOverlay.jsx`, `CoverArt.jsx` |
| Assistant | `ChatSide.jsx` (+ `sidecar/lib/llm.js`) |
| Reliability | `DiagnosticsSheet.jsx`, `Header.jsx` status pill; `sidecar/lib/log.js`, `ace.js` (`fixEngine`, `killStaleEngine`, `stageForEngine`) |
| Engine client | `sidecar/lib/ace.js` |
| Live bridge | `device/live-link.js`, `device/live-bridge.js`, `sidecar/lib/maxbridge.js` |

---

## Quick start (dev — no Ableton needed)

1. **Start the ACE-Step engine** (from the repo root):
   ```
   start_api_server.bat        # serves on http://127.0.0.1:8001
   ```
   On 8 GB GPUs, launch it with the GPU-critical settings
   (`ACESTEP_DTYPE=float32`, `ACESTEP_OFFLOAD_DIT_TO_CPU=true`,
   `ACESTEP_QUANTIZATION=auto`) — set them in a repo-root `.env` (see
   `.env.example`) or use `start_ableton_sidebar.bat`, which sets them for
   you. Without them a single loop can take an hour (CPU-decode / swap
   path). The **first** generation after a
   server start triggers a one-time model load + INT8 quantization
   (~10–20 min); the UI shows "loading models" and waits automatically.

2. **Build the UI and run the sidecar:**
   ```
   cd ableton-sidebar/ui && npm install && npm run build
   cd ../sidecar && node main.js
   ```

3. Open **http://127.0.0.1:8765**, type a prompt, hit Generate.

**Desktop app:** `cd ableton-sidebar/shell && npm install && npm start` — the
Electron window spawns the sidecar itself if it isn't up.

**UI hot reload:** `npm run dev` in `ui/` (proxies to the sidecar) →
http://127.0.0.1:5173.

---

## Using it with Ableton Live (optional)

Requirements: Live 11/12 **Suite**, or Live + Max for Live.

The sidecar runs **standalone** (autostart at login via `scripts/`, or
`start_ableton_sidebar.bat`). The M4L device is a thin bridge that forwards
Live context to the sidecar and executes insert/stage commands back.

1. Build the UI once and make sure the sidecar is running.
2. In Live, drop a **Max Audio Effect** on any track (a return track is tidy),
   open its patcher, and paste in `device/ACE_Sidebar.maxpat`. Save the device
   **into `device/`** so it can resolve `live-link.js` / `live-bridge.js`.
3. Open the Backline window (Electron shell, or the device's Open Sidebar).
4. The header link dot goes solid when the bridge is up; tempo and time
   signature then follow your set.

**Getting audio in:**
- **Insert to selected track** — creates the clip in the highlighted Session
  slot via the Live API (needs a Live version with `create_audio_clip`).
- **Drag** — pull a result card / drag chip into any track, Drum Rack pad, or
  Simpler.
- **Live browser** — add the library folder (`~/Music/ACE-Sidebar/`, **no
  spaces** — Max messages split on them) to Live's **Places**; every
  generation shows up there, named with BPM/key
  (e.g. `bass_dark_8bar_120bpm_Am.wav`).

Notes: key detection needs Live 12's scale awareness (on Live 11, tap the key
chip once per project); insert falls back to the drag chip on older APIs.

---

## Chat assistant (optional)

Settings → Chat assistant. Bring your own key — Anthropic, OpenAI, OpenRouter,
or any OpenAI-compatible endpoint. Keys are stored in
`~/.ace-sidebar/config.json` on your machine, never in a Live set. Generation
works without any key.

---

## Things to know

- **Cancel** stops the sidebar from waiting and discards the result, but the
  ACE-Step server has **no abort API** — the GPU finishes the current render
  before the next job starts.
- **Variations** render one at a time with consecutive seeds (`batch_size: 1`)
  — the right call on 8 GB GPUs. Reuse a prompt from history to recover its seed.
- The engine queue is single-worker; the sidecar queues extra jobs and shows
  their position.
- History lives in `<library>/history.json` and persists across sessions.
- Structured params (BPM, key, time signature, duration, vocal language,
  lyrics) are sent to the engine as **fields**, never injected into the caption.

## Known limitations (verified in the engine source, this deployment)

These are real constraints of the ACE-Step turbo checkpoint on an 8 GB GPU:

- **Extend / repaint can't lengthen a clip.** When a source audio is supplied,
  the engine caps output to the *source* length. Building a song out from a
  clip means arranging generated sections in a DAW — not an in-tool op.
- **Cover / reference regenerates** the whole track from the source melody; it
  does not overdub or layer onto your recording.
- **Complete / Lego / Extract** (add sections/stems to audio) are **base-model
  only** — only the `acestep-v15-turbo` checkpoint is on disk.
- **LoRA is unavailable on quantized models.** Backline runs w8a8-quantized to
  fit 8 GB, and the engine refuses LoRA on quantized models. Using or training
  a LoRA needs an unquantized model → a ≥12–16 GB GPU or cloud.
- **GTX 1070 render ceiling** — long repaint/extend and 2-take songs can crash
  at the quantized-DiT CPU-offload step. Use single takes, modest lengths, and
  fast mode (`hq=false`, LM off) when RAM is tight. **Fix it** recovers a
  wedged engine (it kills orphaned venv python that would starve the next load).

---

## Troubleshooting

In-app: click the **status pill** (top right) → **Diagnostics** for engine/link
status, live logs, and a one-click "Copy full report". Same data at
`GET /api/logs`.

| Symptom | Fix |
| --- | --- |
| "Engine offline" banner | Start the API server; check Settings → engine URL; `GET /health` should answer. Or hit **Fix it**. |
| Fails instantly with NaN / silent audio | Launch the engine with `ACESTEP_DTYPE=float32` (required on GTX 10xx). |
| A single loop takes 30+ min | Engine running unquantized/un-offloaded — ensure `ACESTEP_QUANTIZATION=auto` and `ACESTEP_OFFLOAD_DIT_TO_CPU=true` (set in your `.env`, or launch via `start_ableton_sidebar.bat` which sets them). |
| Stuck at "loading models" | Normal one-time model load + quantization per engine start (~10–20 min on slow machines). |
| Engine wedged / offline after a crash | **Fix it** — revives the engine, kills stale venv python, reloads models, retries the job. |
| Chat says "needs API key" | Add a provider key in Settings. |
| Sidebar blank in Max | Sidecar isn't running — check the Max console for `[ace-sidebar]` lines; ensure the device was saved into `device/`. |
| Insert did nothing | Your Live version lacks API audio-clip creation — the file was staged on the drag chip; drag it in from there. |

---

See **CHANGELOG.md** for release history and **JOURNAL.md** for the design
narrative and honest findings.
