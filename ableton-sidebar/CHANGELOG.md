# Backline — Changelog

Backline is a standalone desktop app for producing finished songs from a prompt,
built on the open-source **ACE-Step** music model. Product design & creative
direction by Alec Lewis; application developed with AI coding assistance.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## 2026-07-10

### Added
- **Three-pane studio layout** — Results (left sidebar) · Composer + player (center) · Assistant chat (right sidebar).
- **Spotify-style results list** — compact rows with cover-art thumbnail, hover-to-play (row number ⇄ play), duration, star, and an amber "now-playing" row; in-progress rows show a spinner + inline progress; variation groups show an "N takes · Compare" bar.
- **Slim now-playing transport** — play/pause, track name/meta, a scrubbable waveform, `elapsed / total` clock, and a **live stereo LED meter** wired to a real WebAudio `AnalyserNode`.
- **Gradio-faithful options** — full ACE-Step vocal-language dropdown (50 languages) with **"Instrumental / auto"** (`unknown`) as the first choice, and **AUTO** toggles on Tempo / Key / Time / Vocal language.
- **Procedural cover art** (`CoverArt.jsx`) — deterministic seeded canvas art per output.
- **Smart "Fix it" button** — one action that self-heals: revive a crashed engine, reload models, and retry the failed job; plus **"✨ Improve & regenerate"** on a result (rewrites a thin/fake caption via `improveCaption()` and re-renders).
- **Reference audio upload** — "+ Reference audio" in the composer → `POST /api/upload/ref` (raw bytes) → routed through the engine's cover pipeline.
- `POST /api/engine/fix` sidecar route; `fixEngine()` in `ace.js`.

### Changed
- **Repositioned from Ableton companion → standalone music-maker.** Dropped the Live dependency: removed the "Live linked" pill and Max-embed "Hide" button; **AUTO now means "let the model decide"** (BPM/Key/Time/Vocal live on the draft, `null` = auto) instead of "follow Live"; results are **Download-first** (⤓) instead of insert-to-track (drag-out kept as a generic file drag).
- Retired the docked-strip mode as the primary experience (the full window is the product).
- Moved the Vocals (instrumental) control out of the top bar into the params row, beside Vocal language.

### Fixed
- **`stageForEngine()`** — the ACE-Step API rejects any `src_audio_path` outside the system temp dir (`release_task_audio_paths.py`), which silently broke cover/repaint/extend/reference. The sidecar now copies source files into `os.tmpdir()` before handing them to the engine.
- **`killStaleEngine()`** — a crashed engine leaves orphaned venv python processes that hold RAM/port and block the next start; `reviveEngine()` now kills project-venv python before respawning, so **Fix-it can recover the "wedged offline" state** that previously needed manual cleanup.
- Waveform recolored for the dark theme; default `.wave-wrap` height restored (compare-overlay waveforms no longer collapse).

### Known limitations (verified in the engine source, this deployment)
- **Extend / repaint cannot lengthen a clip.** When a source audio is supplied, `batch_prep.py` sets the output duration to the *source* length and ignores the requested duration — so "extend beyond end" returns a same-length render. Building a song out from a clip requires a DAW (arrange generated sections) — not an in-tool op.
- **Cover/reference regenerates** the whole track from the source melody; it does not overdub/layer onto the original recording.
- **Complete / Lego / Extract** (add sections/stems to audio) are **base-model only**; only the `acestep-v15-turbo` checkpoint is on disk.
- **GTX 1070 (8 GB) render ceiling** — long repaint/extend and 2-take songs crash at the quantized-DiT CPU-offload step. Mitigations: single takes, modest lengths, and **fast mode (`hq=false`, LM off)** to slip under low free RAM.

---

## 2026-07-09

### Added / Changed
- **Ported the "creation-studio" visual direction into the real React app** — dark warm-charcoal design system, single amber accent, animated aurora + film-grain, titlebar brand mark + equalizer, wide studio layout.
- Rebuilt the composer to mirror the ACE-Step generation tab: dual **Tags | Lyrics** editors, Instrumental toggle, `[verse]/[chorus]` structure inserts, music params with AUTO, Mode segment (Custom/Simple/Cover), Advanced accordion.
- Results as a procedural cover-art gallery (later superseded by the Spotify list).
- Dialed the amber accent back after the first pass read as over-saturated / AI-generated.
