---
name: roblox-cinematic-animation
description: Use for Roblox cinematics and character animation through a Roblox Studio MCP - cutscenes, intros, trailers, game-page videos, camera shots and moves, shot lists, and R15/R6/creature animations (attacks, combos, idles, walks, runs, reactions, emotes). Load before writing any cutscene, camera sequence, trailer plan or KeyframeSequence, even a small one.
---

# Roblox cinematics and character animation

Built the same way as the VFX skill (`roblox-vfx-animation`): **measured numbers instead of
taste, tools that do the error-prone parts, and pictures to look at before calling anything
done.** First attempts at animation and cinematics fail in predictable, measurable ways (Linear
spacing, every joint on the same frame, frozen holds, a hips-still punch; FOV 70 on every shot,
a camera that never stops gliding, equal shot lengths, jump cuts, crossing the line). Each has a
number here and a check in the tools. Follow them.

**Read `references/tools.md` first, every time.** It says how to run every step with the Studio
MCP and a shell. `SKILL_DIR` there means this folder.

## What's here

| Path | What it is |
| --- | --- |
| `references/tools.md` | Installing the modules, running every script, the capture loop, MCP quirks, cleanup. |
| `references/animation-craft.md` | The pro-animation rules as numbers: timing, spacing, arcs, overlap, weight, anticipation, holds, locomotion, emotion; every lint id. |
| `references/animation-measured-tables.md` | Full measured tables (gaits, styles, strikes, raises, waves, turns, holds). |
| `references/animation-recipes.md` | Tested recipes (cross, heavy slash, combat idle) and the anti-recipe. |
| `references/character-animation.md` | The pose JSON format (adn's), props, NPC wiring, R6. |
| `references/creature-animation.md` | Custom rigs, `waves`, `gait`, creature recipes. |
| `references/playback.md` | Tracks, priorities, blending, markers, loaders in game code. |
| `references/cinematics.md` | Shot sizes, lenses, composition, coverage, cutting, movement, DOF, grade, events; the full Cine and analyze reference. |
| `references/trailer.md` | Trailer kinds, structure, rhythm, cards, music, recording, Roblox page-video rules. |
| `scripts/animpro.mjs` | Pose compiler + pro passes (spline, overlap, settle, moving holds, breathing) + checks + craft lint + sheet/graph/trails + Luau. |
| `scripts/trailerplan.mjs` | Trailer edit plan (sections, lognormal accelerating shots, beat snapping, cards) and a Cine skeleton. |
| `scripts/cineplan.mjs` | Draws a cut's top-down blocking plan and timeline from `Cine.analyze(..., {json = true})`. |
| `scripts/install.mjs` | Writes the Luau that installs Cine and Capture in a place. |
| `scripts/read_rig.lua` | Reads a creature's rig for `--rig-json`. |
| `templates/cine/Cine.lua` | Shot-list player: framing by shot size, lenses in mm, moves, handheld noise, impact shake, DOF, grade, letterbox, cards, animation/VFX/sound events, hitstop, slow-mo; `Cine.analyze`. |
| `templates/cine/Capture.lua` | Freezes a playing cut at chosen times for `screen_capture`. |
| `templates/cine/examples/duel.lua` | A tested 6-shot two-character scene to copy. |
| `templates/cine/examples/fight.lua` + `recipes/fight/` | A tested 16 s fight: 11 clips with reactions, hitstops, slow-mo knockdown. Start here for any combat cinematic. |
| `recipes/*.json` | Pose JSON for the tested recipes. |

## Quick reference

- **A character animation** (attack, idle, gait, reaction, emote):
  1. Read `animation-craft.md` and `character-animation.md` (format); check which rig the place's
     players use (R15 or R6).
  2. Choose numbers first: total length, contact time, hold, recovery, hip drop, turn (craft
     sections 2-9). Player attacks: short anticipation; NPC: long.
  3. Copy the nearest recipe; key poses first, breakdowns second, on uneven times; hips, then
     chest, then arms; never both arms on the same frame with mirrored shapes.
  4. `node SKILL_DIR/scripts/animpro.mjs X.json --grounded --sheet s.png --graph g.png --trails t.png`
     (`--locomotion` for gaits). **Look at all three images.**
  5. Fix every failing check and every lint `fix` (exit 0); weigh each `consider`.
  6. `--out X.lua`, send it with `execute_luau`, preview on a dummy or in a one-shot Cine cut at
     the contact frame, from the game's camera angle.
  7. Tell the user the publish step (right-click > Save to Roblox) and what you checked.
- **A fight or any exchange between characters**: every action needs a reaction clip started on its contact frame, plus hitstop and shake there; stage within reach; read `recipes/fight/README.md` first.
- **A cinematic / cutscene**:
  1. Read `cinematics.md`. Install Cine and Capture (`tools.md`).
  2. Block it: the scene in one sentence, the action line, the side of it the camera lives on
     (chosen so the key action faces the camera), rigs within reach if they touch.
  3. Write the cut from `examples/duel.lua`: each shot has a reason, a size, an angle, a lens, a
     varied duration; most shots static; strikes in profile.
  4. `Cine.analyze(cut)` until no `[fix]`; draw the plan with `cineplan.mjs` and look at it.
  5. Capture the moments that matter (first frame of each shot, hits, mid-move, the end), look,
     fix. `screen_capture` shows no letterbox or cards: that is expected.
  6. `Capture.stop()`; check cleanup; ask the user to watch it in real time.
- **A trailer**: read `trailer.md` (and `cinematics.md`). Ask which kind it is if unclear (a Roblox
  page video must be real gameplay). Plan with `trailerplan.mjs`, fill the skeleton, analyze,
  capture, then give the user the recording steps.
- Animations play from `Animator`s on a `Humanoid` or `AnimationController`; set `Priority`
  deliberately; gameplay cues come from markers (`GetMarkerReachedSignal`), never timers.
- Cutscenes in a live game run in a LocalScript (Cine binds after the camera scripts); the
  server only says when.
- Leave the place as you found it: camera `Custom`, no `CineGrade`/`CineBloom`/`CineDOF`, no
  `CineOverlay`, no `_VFXCapture`, no test rigs.

Motion and cuts are judged by eye at full speed. When done, say what you checked (the numbers,
the images, the captured moments) and ask the user to watch it in a playtest.
