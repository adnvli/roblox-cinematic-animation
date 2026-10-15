# Tools: every step with a stock Roblox Studio MCP and a shell

This skill needs only:

- the **Roblox Studio MCP** (`execute_luau`, `screen_capture`, `get_console_output`,
  `start_stop_play`, `insert_asset`, and so on);
- a **shell** with **Node 18+** to run the scripts in `scripts/` (no npm install: each
  `.mjs` is a self-contained bundle).

`SKILL_DIR` means this skill's folder (where `SKILL.md` is). Use its absolute path in commands.

## Translation table (for the ported references)

`character-animation.md`, `creature-animation.md` and `playback.md` were written for adn,
which has its own Studio bridge. Do their steps like this:

| The reference says | Do this |
| --- | --- |
| the `animation` tool's `check` | `node SKILL_DIR/scripts/animpro.mjs anim.json --grounded --sheet s.png --graph g.png` (below) |
| the `animation` tool's `build` | the Luau `--out` writes, sent with `execute_luau` |
| the `animation` tool's `rig` action (read a creature) | `SKILL_DIR/scripts/read_rig.lua` via `execute_luau`, saved to JSON, `--rig-json` |
| the `animation` tool's `publish` | the user: right-click the KeyframeSequence > Save to Roblox (or Animation Editor > Publish) |
| the `animation` tool's `wire` | write the LocalScript/Script yourself (`playback.md` has the patterns) |
| the `animation` tool's `verify` | play it on a dummy (below) or in a playtest; `screen_capture` at the key times |
| `capture_moments` | the Capture flow below (`Capture.start(handle)`, `step(t)`, `screen_capture`) |
| `build_instances` | `execute_luau` creating the instances directly |
| `get_runtime_logs` | `get_console_output` |
| "adn shows you the preview" | read the PNGs the scripts write, and the `screen_capture` images, yourself |

## Installing the Studio modules (once per place, and after every module change)

```bash
node SKILL_DIR/scripts/install.mjs --out install_cine.lua
```

Read `install_cine.lua` and send **its whole text** as one `execute_luau` call. It installs:

- `templates/cine/Cine.lua` as `ReplicatedStorage.Cine` (the shot-list player + `Cine.analyze`);
- `templates/cine/Capture.lua` as `ReplicatedStorage.VFX.Capture` (holds a playing cut or effect
  at chosen moments for screenshots; the same module the VFX skill uses).

It returns `Cine ok at ReplicatedStorage.Cine; Capture ok at ...`. Anything else: read the error.

- In edit mode `require` caches a ModuleScript's first result for the whole Studio session. The
  installer always destroys and recreates the instances, so re-run it after any edit to a
  template; never edit `.Source` in place and expect the new code to run.
- `--only Cine` or `--only Capture` installs one.
- Do not leave a test copy anywhere else (a second `Cine` in Workspace means two caches).

## Character animation: `animpro.mjs`

```bash
node SKILL_DIR/scripts/animpro.mjs Slash.json --grounded --sheet Slash_sheet.png --graph Slash_graph.png --trails Slash_trails.png --out Slash.lua
```

What it does, in order:

1. Validates and compiles the pose JSON with adn's compiler (`character-animation.md`).
2. Pro passes (skip all with `--raw`):
   - **spline**: monotone cubic through the keys in rotation space; one-shots start and end at
     rest (zero tangents), loops wrap. This replaces Roblox's default Linear easing.
   - **overlap**: child joints lag their parent (R15 at 30 fps: Neck 1 frame, elbows 1, wrists
     and props 2). Joints posed with `aimAt` (planted feet) and gripped props are excluded.
     The clip grows by up to 2 frames.
   - **settle** (`--settle light|medium|strong`, off by default): a damped spring on wrists,
     neck and props (7 Hz/0.75, 5 Hz/0.55, 3.5 Hz/0.4) for overshoot and settle.
   - **moving holds** (`--life`, default 1): wherever the body holds, adds drift sized from
     1,233 measured mocap holds (hands ~3.7 cm, head ~1.2 cm, trunk ~1° peak-to-peak).
   - **breathing** (`--breathe`, automatic for loops named `*idle*`): 4 s cycle, ~0.8°,
     inhale 40% of the cycle.
3. Bakes at 30 fps and removes keys that change nothing (0.3°, 0.003 studs): dense Linear keys,
   which is exactly how Roblox's own animation packs are stored.
4. Runs adn's motion checks (`jointLimits`, `groundContact`, `selfIntersection`, ...) and the
   **craft lint** (`animation-craft.md` section 10 lists every id).

Output: JSON on stdout (`ok`, `failing`, `checks`, `lint`, `action` phases, `passes`).
Exit 0 = every check passes and no lint `fix`; 3 = something to fix; 1 = format refused
(`errors` say where).

Flags: `--locomotion` (walks, runs) or `--grounded` (anything else standing); `--waive id,id`
to accept a failing check on purpose (say why); `--rig-json r.json` for a creature; `--fps N`;
`--no-spline`; `--overlap off|on`; `--settle ...`; `--life X` (0 off, 0.5 calm, 2 restless);
`--tolerance DEG`; `--json report.json`; `--parent game.ServerStorage`. The JSON can carry the
same settings in a `"pro"` block: `{ "fps": 30, "overlap": {"RightWrist": 3}, "settle": "light",
"life": 0.5, "breathe": {"period": 4, "amp": 0.8} }`. Flags win.

**Look at the images every time.** You cannot judge motion from numbers alone:

- `--sheet`: contact sheet, three-quarter view on top, front/side below, one figure per sampled
  time. Check silhouettes, feet on the ground line, the line of action.
- `--graph`: a graph editor: one panel per body part, X/Y/Z rotation curves (red/green/blue)
  plus the Root's position, one dot per frame (wide gaps = fast), white ticks at your keys, an
  amber band over moving holds. Check: curves ease into and out of keys (no straight ramps, no
  kinks), children peak a frame or two after parents, holds still drift, nothing flat-lines.
- `--trails`: motion trails of head, hands, feet and weapon tip from the side, front and top,
  one dot per frame coloured by speed (blue slow, red fast), grey ghosts at your key poses.
  Check: paths arc (no zigzags or straight lines), dots cluster at the extremes (ease) and
  spread through the strike, the weapon tip sweeps a clean curve.

Then send `Slash.lua` with `execute_luau`. It builds the KeyframeSequence at
`<parent>.Animations.<name>` and registers a preview id (attribute `PreviewId`) with
`AnimationClipProvider:RegisterAnimationClip`. The preview id plays in Studio on this computer
only. For the live game the user must publish it (right-click > Save to Roblox); say so.

**Previewing on a dummy (edit mode, no playtest):**

```luau
local seq = game.ServerStorage.Animations.Slash
local rig = workspace.Dummy                       -- R15 with Humanoid
local animator = rig.Humanoid:FindFirstChildOfClass("Animator") or Instance.new("Animator", rig.Humanoid)
local a = Instance.new("Animation"); a.AnimationId = seq:GetAttribute("PreviewId")
local track = animator:LoadAnimation(a)
track:Play(0); track:AdjustSpeed(0)
task.wait(0.1)                                    -- the clip loads asynchronously; Length is 0 until then
track.TimePosition = 0.56                         -- the moment to look at
animator:StepAnimations(0)                        -- edit mode does not step animators by itself
return track.Length
```

Then aim the camera (`Capture.aim(rig, 12, 10, 70)`) and `screen_capture`. Afterwards stop the
track and reset the joints: in edit mode a stopped track leaves its pose on the joints, so set
`Transform = CFrame.identity` on every `Motor6D` **and** `AnimationConstraint` (modern R15
avatars made by `Players:CreateHumanoidModelFromDescription` use AnimationConstraints).

Easier: play it through a one-shot Cine cut (`anim` event, `seq =` the KeyframeSequence path),
which loads, steps and cleans up for you, and works with Capture.

**Creatures and custom rigs:** set `MODEL_PATH` in `scripts/read_rig.lua`, run it with
`execute_luau`, save the returned JSON verbatim to a file, pass `--rig-json`.
`creature-animation.md` has the rest.

## Cinematics: Cine, analyze, plan, look

The loop (details in `cinematics.md`):

1. **Write the cut** as a Luau table (or JSON) in a file you keep, e.g. `cut.lua` returning the
   table. Keep subjects as paths (`"Workspace.Hero"`).
2. **Analyze before rendering** (one `execute_luau`):
   ```luau
   local Cine = require(game.ReplicatedStorage.Cine)
   local cut = <paste the table>
   return Cine.analyze(cut)                 -- text report: [fix] / [consider] / [info]
   ```
   Fix every `[fix]`; weigh every `[consider]`. Re-run until clean.
3. **Draw the blocking plan:**
   ```luau
   return require(game.ReplicatedStorage.Cine).analyze(cut, { json = true })
   ```
   Save the returned text verbatim to `cut_analyze.json`, then
   `node SKILL_DIR/scripts/cineplan.mjs cut_analyze.json cut_plan.png` and **look at it**: a
   top-down panel per shot (camera path, view cone, subject and facing, the action line and
   which side of it the camera is on) and a timeline coloured by shot size.
4. **Look through the lens at the moments that matter** (Capture flow):
   ```luau
   -- call 1: start, frozen at t = 0
   local Cine = require(game.ReplicatedStorage.Cine)
   local Capture = require(game.ReplicatedStorage.VFX.Capture)
   _G.__cut = <the table>
   return Capture.start(Cine.play(_G.__cut))
   ```
   then for each time, in rising order, two calls:
   `return require(game.ReplicatedStorage.VFX.Capture).step(3.73)` then `screen_capture`.
   Finish with `return require(game.ReplicatedStorage.VFX.Capture).stop()`, which stops the
   cut, restores the camera type, FOV, exposure, removes `CineGrade`/`CineBloom`/`CineDOF`, the
   overlay, and resets animated joints.
   Pick: first frame of each shot, each hit/marker frame, the middle of each camera move, and
   the last frame. Capture costs two calls per moment; choose 6-12 moments, not 40.
5. **Watch it in real time** once frames are right: `Cine.play(cut)` in edit mode plays at
   real speed (Heartbeat). Ask the user to watch the viewport; Studio cannot record for you.
6. **Record** (the user does this): a playtest with a LocalScript that requires Cine and plays
   the cut (it binds to RenderStep after the camera scripts), UI hidden, OBS or ShadowPlay at
   60+ fps. `trailer.md`, "Recording".

### What `screen_capture` does not show

- It grabs the **3D viewport only**: no ScreenGui, so letterbox bars, fades and cards are
  invisible in captures. Check them by reasoning (and by `Cine.analyze`'s card checks), and
  ask the user to watch one real-time run.
- The image is small. For a face or hand detail, capture a tighter shot or move closer.
- Post effects (`CineGrade`, bloom, DOF) **do** show.

### Studio MCP quirks (measured, 2026-10)

- `execute_luau` runs without the RobloxScript capability: some properties (e.g.
  `Lighting.Technology`) cannot be read; wrap optional reads in `pcall`.
- The edit camera keeps whatever `CameraType` the last call left (often `Scriptable`). A playing
  cut reasserts `Scriptable` every frame, so it survives between calls; `stop()` in edit mode
  always sets `Custom` back. Your own one-off camera placement can be disturbed by Studio between
  calls, so place and capture in consecutive calls.
- `Animator:StepAnimations(dt)` is what moves rigs in edit mode; Cine calls it for you.
- `AnimationTrack.Length` is 0 until the clip finishes loading; setting `TimePosition` before
  that is silently lost (Cine waits for it).
- A fade-in never finishes while time is frozen; Cine starts tracks with no fade when paused or
  joined late.
- A KeyframeSequence's `PreviewId` lives only for this Studio session on this computer. If a cut
  says the animation does not play, re-run the `--out` Luau to re-register it.

## Trailer planning: `trailerplan.mjs`

```bash
node SKILL_DIR/scripts/trailerplan.mjs --length 60 --bpm 120 --style indie --title "CANDY RUSH" --out plan.json --cine skeleton.lua
```

Prints a shot table (start, duration, section, size, move, notes) from measured trailer
structure: cold open, intro, escalation blocks separated by cards, climax with accelerating
cuts snapped to half-beats, stopdown, breath, title, button. `--cine` writes a Cine skeleton to
fill in (subjects, angles, events). `--style indie|action|story`, `--target
youtube|steam|roblox-page` (the page target makes it short and drops the letterbox), `--seed N`
for another variation. Details in `trailer.md`.

## Cleanup before you call anything done

- `Capture.stop()` (or `handle:stop()`) was called: the camera is `Custom` again (check
  `workspace.CurrentCamera.CameraType`), FOV back to what it was.
- No `CineOverlay` ScreenGui left in CoreGui/PlayerGui; no `CineGrade`, `CineBloom`,
  `CineDOF` in Lighting unless the user wants the grade kept (then rename them).
- No `_VFXCapture` folder in Workspace; no test rigs, markers or `_G` globals you created.
- `get_console_output` is free of errors from your run.
- Tell the user which modules and KeyframeSequences you added and where.

## Rebuilding the scripts (only if you change the TypeScript)

`scripts/src/*.ts` is the source of `animpro.mjs`, `trailerplan.mjs` and `cineplan.mjs`.
`animpro` also imports adn's pose compiler (AGPL-3.0,
`src/animation/*`): clone it, point the imports marked `<adn checkout>/` at it, then bundle:

```bash
npx esbuild src/cli.ts --bundle --platform=node --format=esm --target=node18 --outfile=animpro.mjs \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
```
