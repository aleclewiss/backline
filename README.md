<p align="center">
    <img src="./ableton-sidebar/shell/assets/backline.png" height="96" alt="Backline">
</p>
<h1 align="center">Backline</h1>
<p align="center"><b>Turn a prompt into a finished-sounding song.</b><br>
A standalone desktop music studio for the open-source ACE-Step model —
describe the vibe, write (or auto-generate) lyrics, audition takes, and drag
the result into any DAW. Optional Ableton Live link for tempo/key sync and
clip drop-in.</p>

> Product & creative direction by Alec Lewis. Application developed with AI
> coding assistance.

---

## What Backline adds

The music generation itself is [ACE-Step](https://github.com/ACE-Step/ACE-Step-1.5)'s
open-source model. **Backline is the studio built around it** — everything in
[`ableton-sidebar/`](./ableton-sidebar/):

- **A composer, not a form** — style caption, structured **BPM / Key / Time /
  Duration / Vocal language** fields (any of them **AUTO**), and lyrics with
  `[verse]`/`[chorus]` structure tags, sent to the engine as real parameters.
- **An audition workflow** — Spotify-style results list, hover-to-play,
  waveform scrubber, variation groups with a Compare view, persistent history.
- **Reliability as a feature** — job queue with live progress, diagnostics
  panel, and a smart **Fix it** button that revives a crashed engine, reloads
  models, and retries the failed job.
- **A path into your DAW** — download the WAV, native drag-out to anywhere,
  or a Max for Live bridge that syncs Live's tempo/key and inserts clips
  straight into a Session slot.
- **The desktop shell** — Electron window with tray and always-on-top pin,
  a zero-dependency Node sidecar serving the React UI.

**📖 [Full Backline documentation →](./ableton-sidebar/README.md)** — features,
architecture, Ableton Live setup, troubleshooting, and honest known limits.
Design narrative in [JOURNAL.md](./ableton-sidebar/JOURNAL.md).

## Quick start

You need: an NVIDIA GPU (8 GB works — the launcher applies low-VRAM-safe
settings), Python (installed by the engine setup below), and Node 18+.

1. **Set up the ACE-Step engine** — run `install_uv.bat` (Windows) or
   `install_uv.sh`. Models download on first run. Engine details live in the
   [ACE-Step documentation](./README-ACESTEP.md).
2. **Build the Backline UI** (once, and after UI changes):
   ```
   cd ableton-sidebar/ui && npm install && npm run build
   ```
3. **Launch** — `start_ableton_sidebar.bat` starts the engine (port 8001) and
   the Backline sidecar (port 8765) with GPU-safe settings
   (`ACESTEP_DTYPE=float32`, `ACESTEP_OFFLOAD_DIT_TO_CPU=true`,
   `ACESTEP_QUANTIZATION=auto`) already set. The first generation triggers a
   one-time model load + quantization — how long it takes depends on your
   hardware; the UI shows "loading models" and waits automatically.
4. Open **http://127.0.0.1:8765**, type a prompt, hit Generate — or run the
   desktop app: `cd ableton-sidebar/shell && npm install && npm start`.

The optional **chat assistant** is your own AI: add your own API key in
Settings (Anthropic / OpenAI / OpenRouter / any OpenAI-compatible endpoint)
and that model assists you in-app. No key ships with Backline — yours stays
in `~/.ace-sidebar/config.json` on your machine. Generation needs no key.

## What's mine vs. what's upstream

To be clear about credit: this repo is a fork of
[ACE-Step/ACE-Step-1.5](https://github.com/ACE-Step/ACE-Step-1.5) — the model,
the `acestep/` engine code, and the platform launcher scripts are theirs, and
their documentation lives in **[README-ACESTEP.md](./README-ACESTEP.md)**.

My work is **Backline**: the entire [`ableton-sidebar/`](./ableton-sidebar/)
directory (Electron shell, Node sidecar, React UI, Max for Live device),
`start_ableton_sidebar.bat`, and small patches to the engine's init service
so it runs well on 8 GB GPUs.

## License

MIT — see [LICENSE](./LICENSE). ACE-Step is by the ACE Studio & StepFun team;
Backline is an independent application built on it.
