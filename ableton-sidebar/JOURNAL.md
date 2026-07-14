# Backline — Work Journal

A narrative record of the work — decisions, what shipped, what we made, and the
honest findings. Doubles as source material for the portfolio case study.

Session: **2026-07-09 → 2026-07-10**

---

## 1. Finishing the UI (creative direction)

The app started as a plain, light "sidebar tool." Over roughly a dozen directed
iterations it became a standalone dark "creation studio." The decisions that
shaped it (each a taste call, not a template):

1. **Dark creation-studio glowup** — from a form into a premium, plugin-like workspace.
2. **"Less gold"** — the first pass over-used amber; pulled it back to a single accent that means "the sound."
3. **Rejected the hardware/faceplate + big soundbar** — felt clunky; kept the smooth surface and a *slim* player.
4. **Chat moved to a side panel; layout reworked.**
5. **Results → Spotify-style track list** (fast to audition many takes).
6. **Three-pane layout** — Results left, composer center, chat right.
7. **Gradio-faithful options** — full language list incl. "Instrumental / auto," AUTO toggles.
8. **Repositioned to a standalone app** — dropped the Ableton dependency; Download-first.
9. **Smart "Fix it"** — reliability as a feature.

Verification throughout: build clean via `npm run build`, plus a published
static snapshot artifact for eyeballing each look before wiring it in.

## 2. Making it real

- Launched the Electron desktop app; confirmed the sidecar serves the current build.
- Triggered model load; discovered the first hq generation also loads the 5Hz LM (a multi-minute one-time cost).
- **Verified end-to-end**: generated a real 8s loop → a genuine 48 kHz stereo WAV landed in the library. The full chain works: prompt → LM "thinking" → diffusion → VAE decode → file → UI.

## 3. Music produced (all user-directed)

| Genre | Idea | Settings |
|---|---|---|
| Acoustic pop | Ed Sheeran-lane ballad, "Four in the Morning" | 88 bpm · G maj · ~2:30 |
| Tropical house | "Cold Water" vibe | 93 bpm · D maj · ~2:30 |
| Indie pop | intimate, "You Are Enough" (Suriel Hess-style lyrics) | 95 bpm · G maj · auto ~3:00 |
| Indie rock | nostalgic, "The Way We Were" (Backseat Lovers lean) | 135–140 bpm · E maj |
| Folk instrumental | fresh ~2:00 warm-folk piece (user's vibe) | fast mode |

Craft notes that emerged:
- **Full arrangements beat sparse prompts.** Stripped/"solo acoustic/organic/raw" reads thin and fake; keep the production full and describe the *lead instrument*.
- **Tone lives in the caption, not the reference** — jangly vs distorted, warm overdrive vs high-gain, etc.
- **Vocal character is near the prompt-only ceiling** — the honest fix for "sounds like the band" is DAW production + a real/recorded vocal.

## 4. Portfolio thread

- Discussed how the user genuinely owns this: **product/creative direction + curation** are theirs; execution was AI-assisted. Honest framing: *"I direct generative tools as an instrument; the vision and curation are mine."*
- Built a **Backline case-study page** (artifact) with the design-decision timeline, architecture, and the tracks — with placeholders for screenshots + hosted audio links.
- Established the workflow shift: user drives the caption/lyrics/curation; the model assists and critiques.

## 5. The reference / extend investigation (and honest limits)

Goal: keep the user's own folk instrumental and build it out.

- Built a **reference-audio upload** feature.
- Hit and fixed a real bug: the engine **rejects source paths outside the system temp dir** → added `stageForEngine()`.
- Long **extend/repaint crashed** the GTX 1070 at the quantized-DiT CPU-offload step; a crashed load left a **~6 GB zombie python** that starved the next load. Diagnosed (not commit exhaustion — no reboot needed), cleared it, and **hardened Fix-it** with `killStaleEngine()`.
- **Definitive finding (read in engine source):** with a source audio supplied, the engine caps output to the *source length* — so **extend/repaint cannot lengthen a clip** here, and cover *regenerates* rather than layering. Neither keeps-and-extends the user's recording.
- Delivered what the setup *can* do: a **fresh longer folk instrumental** in the user's vibe (~2:00, fast mode), plus the reliable path for keeping their recording — **DAW arrangement** with generated complementary sections.

## 6. Lessons banked

- On an 8 GB GPU: single takes, modest lengths, and `hq=false` when RAM is tight.
- Fix-it now self-cleans stale processes — the "stuck offline" state recovers with one click.
- The strongest portfolio story is the honest one: a directed tool + curated output + documented iteration, including the walls we hit and hardened against.
