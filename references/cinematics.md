# Cinematics: shots, lenses, cutting and movement, by the numbers

How to make an in-engine cinematic (a cutscene, an intro, a trailer shot) look shot by a
cinematographer and cut by an editor. You write a **cut** (a shot list) for `Cine`, check it
with `Cine.analyze`, look at the blocking plan, look through the lens at chosen moments, fix,
repeat. `tools.md` has the commands; `trailer.md` has trailer structure and rhythm.

Trust tags: **[study]** measured over a film corpus; **[engine]** read from engine source or
shipped presets; **[docs]** vendor docs; **[pro rule]** a named professional's rule;
**[derived]** arithmetic from those. Sources are in NOTICE.md.

## 0. Why first attempts look bad

| A first attempt | A pro | Check |
| --- | --- | --- |
| Roblox's default FOV 70 on everything (a ~14.5 mm ultra-wide) | coverage between FOV ~46 (24 mm) and ~9 (135 mm); close-ups FOV 14-23 (50-85 mm) **[derived]** | `defaultFov` |
| The camera always moving, gliding at constant speed | locked-off shots dominate (moving shots were 6-16% of film shots **[study]**); every move eased and motivated | `alwaysMoving`, `linearMove` |
| Every shot the same length | lognormal: a few long holds, many short shots; median ≈ half the mean **[study]** | `uniformShots`, pacing CV |
| Subject dead centre with headroom to spare | eyes on the upper third (28-38% from the top); space in front of the gaze **[pro rule]** | `eyeLine`, `headroom`, `leadRoom` |
| Cuts between nearly identical angles | change the angle ≥ 30° or the size ≥ ~1.5x **[pro rule]** | `jumpCut` |
| Camera hops across the two characters | stays on one side of the action line (180° rule) | `crossedLine` |
| Fast pans | a subject takes ≥ 7 s to cross the frame at 24 fps (~3.5 s at 60) unless it's a whip **[pro rule, RED]** | `fastPan` |
| Strikes filmed head-on | strikes read in profile or near it; a straight punch toward the lens foreshortens into a blob (tested) | your eye |
| One size throughout | wide → closer → wide per scene; close-ups shorter than wides **[study]** | `sizeVariety` |
| Big slow shake on every hit | short trauma-squared shake, small, plus hitstop; handheld drift tiny and slower than 2.5 Hz **[engine]** | your eye |
| No grade, or a heavy one | contrast 0.05-0.25, saturation -0.15 to +0.1, bloom threshold ≥ 0.85 **[docs: Roblox samples]** | `grade` values |

## 1. The workflow

1. **Block it.** Decide what the scene is about (one sentence), who is in it, where the action
   line runs (between the two characters, or along the direction of travel), and which side of
   it the camera lives on. Place the rigs within reach of each other if they touch.
2. **Shot list.** Write the cut: for each shot a reason (establish, reveal, react, show the
   hit), a size, an angle, a lens, a duration. Start from `templates/cine/examples/duel.lua` or
   a `trailerplan.mjs` skeleton. Pick sizes and durations from sections 2 and 5.
3. **Analyze** (`Cine.analyze(cut)`): fix every `[fix]`, weigh every `[consider]`.
4. **Plan image** (`cineplan.mjs`): look at it. Is the camera on one side of the amber line in
   every panel? Do sizes progress? Does the timeline accelerate where it should?
5. **Look through the lens** (Capture flow): the first frame of each shot, every hit frame,
   mid-move frames, the last frame. Judge: does the subject read? does the eye land where the
   last shot left it? is the strike visible? is anything in the way?
6. **Fix and repeat**, then play it in real time and have the user watch it.

`Cine.analyze` reads positions from the place **as it is now**: it does not run animations or
`move` events. For subjects that travel, give the camera `keys` or `follow = "lock"` and check
with captures.

## 2. Shot sizes and lenses

Cine frames a subject by **size**: the frame's visible height as a multiple of the subject's
height, then sets the distance from the lens so that is true.

| Size | Frame height / subject height | Default lens (mm) | FOV | Use |
| --- | --- | --- | --- | --- |
| EWS extreme wide | 6.0 | 21 | 51.5 | place, scale, the start of a scene |
| VWS very wide | 3.0 | 24 | 45.7 | geography: who is where |
| WS wide | 1.6 | 28 | 39.8 | the whole action with space |
| FS full | 1.2 | 32 | 35 | whole body: action, fights, dance |
| MWS medium wide | 0.9 | 35 | 32.3 | knees up: walking dialogue, stance |
| MS medium | 0.62 | 40 | 28.4 | waist up: most dialogue |
| MCU medium close | 0.42 | 50 | 22.9 | chest up: emotion starts here |
| CU close-up | 0.28 | 65 | 17.7 | face: reaction, decision |
| ECU extreme close | 0.14 | 85 | 13.6 | eyes, a hand, an object: punctuation |

- Vertical FOV from a full-frame 16:9 lens: `FOV = 2·atan(10.125 / mm)` (`Cine.mmToFov`).
  Roblox's FieldOfView is vertical, so this column is what Roblox uses **[derived]**.
  Roblox default 70 ≈ 14.5 mm; 50 ≈ 21.7; 40 ≈ 27.8; 30 ≈ 37.8; 20 ≈ 57; 15 ≈ 77; 10 ≈ 116 mm.
- **Wide lens close** exaggerates depth and speed (action, dread). **Long lens far** flattens
  and stacks the background (heroic portraits, crowds, chases). 85 mm is the classic portrait
  lens; 24-35 mm on a face distorts it **[pro rule]**.
- Override per shot: `frame = { size = "CU", lens = 85 }` (or `fov = 13`).
- A 2.39 letterbox crops the vertical view: FOV 40 shows ~30°, FOV 20 shows ~15° **[derived]**.
  Cine accounts for it when it frames.

## 3. Composition

- **Eyes on the upper third** (28-38% from the top) for anything MS or tighter. Headroom shrinks
  as shots tighten; in an ECU the top of the head may leave the frame, the eyes stay on the
  third **[pro rule]**. Cine's default: eyes at 1/3 for sizes tighter than 1.0, the subject's
  centre at 55% for wider shots. Override with `eyeY`.
- **Lead room**: put the subject on the third *behind* their gaze or motion, so the space is in
  front. Cine's `side = "auto"` (default) does it from the subject's facing; `"left"`,
  `"right"`, `"center"` or a number 0-1 override. Short-siding (looking at the near edge) reads
  as unease; mark it `shortSided = true` if meant **[pro rule]**.
- **Keep the eye where it was**: across a cut the viewer's eye is where the last shot left it.
  Matching eyelines (A on the left third looking right, B on the right third looking left) is
  what makes a dialogue cut invisible **[pro rule]**.
- **Angles**: three-quarter (yaw 25-45°) is the default for faces; profile (yaw 80-95°) for
  strikes, reaches and anything that moves across the body; frontal (yaw 0-15°) is
  confrontational and flat, use it on purpose **[pro rule]**. Low pitch (camera below eye,
  `pitch` negative) makes a subject big; high makes them small; keep within ±15° unless that is
  the point.
- In dialogue more than half the shots are reactions **[pro rule]**: cut to the listener.
- **Dutch angle** (`roll`): 5-10° is felt not seen; 25-45° is overt instability. Establish level
  first, use it rarely **[pro rule]**.
- Hide the HUD, nameplates and the cursor for anything recorded.

## 4. Coverage and cutting

### The 180° rule (action line)

The line runs between the two characters (or along the direction of travel). Every camera stays
on one side, so A is always screen-left looking right and B screen-right looking left. Set
`line = { A, B }` on the cut; `analyze` flags a crossing (`crossedLine`) and `cineplan` draws
the line and labels each panel's side. To cross on purpose: cut through a shot on the line
itself, or move the camera across the line *within* a shot, or set `crossLine = true` on the
shot that crosses.

**Pick the side for the action, not only the faces.** The side decides which arm the audience
sees. In the tested duel, the camera on Hero's left hid his right cross behind his body; moving
the whole scene to Hero's right made it read. Decide the side from the key action first, then
place every other shot on that side.

### The 30° rule (jump cuts)

Two consecutive shots of the same subject must differ by ≥ 30° of camera angle around them **or**
by a clear size change (≥ ~1.5x: wide → medium, medium → close-up). A small change in both reads
as a jump **[pro rule]**. `analyze` checks both (`jumpCut`); `jumpCut = true` on the shot marks
a deliberate one.

### Where to cut

- **Cut on action**: start the motion in shot A, finish it in shot B. Movement takes ~1/5 s and a
  cut inside it goes unnoticed **[pro rule, Dmytryk]**.
- **Leave a small gap, not an overlap**, at a mid-action cut: viewers prefer ~180 ms of action
  skipped (≈4 frames at 24 fps) for a sideways camera jump, up to ~350 ms when cutting **wider**;
  cutting much **closer** prefers continuous or a 1-2 frame overlap **[study, Hecht & Kalkofen
  2009]**. With Cine you re-run the same action from several cameras, so you control this
  exactly: when the next shot is wider, start its events ~0.15-0.3 s further into the action.
- **Exits/entrances**: cut as the eyes leave frame; start the next shot 3-5 frames before they
  re-enter **[pro rule]**.
- **Reactions**: cut ~3-4 frames after the reaction starts **[pro rule]**.
- Cuts are ~99% of transitions in modern film **[study]**: no wipes, spins or page turns. Fades
  only to begin or end a sequence (`fadeIn`, `fadeOut`), a cut to black for a beat (`black =
  true`), a white flash for an impact (`flash = { t, dur = 0.06 }`).
- No shot under 3 frames (`flashFrame`).

### Shot length

- Pace follows content: **the more motion in a shot, the shorter it can be**; close-ups are
  measurably shorter than wides; wides and establishing shots longer **[study, Cutting]**.
- Film ASL today ~2-4 s; action ~4 s average with many under 2; horror ~15 s **[study]**.
  Shot lengths are lognormal: median ≈ half the mean **[study, Salt]**. Never cut at a fixed
  interval (`uniformShots`).
- Scenes start wide, move closer, pull back at the end **[study]**.
- For trailers see `trailer.md` (1-4 s depending on style, accelerating to ~0.5-0.8 s).

## 5. Camera movement

- **Most shots are still.** Moving shots fell from 16% (1959) to 6% (1999) of film shots;
  modern pace comes from cutting and subject motion **[study]**. Keep moves for a reason:
  **follow** a subject, **reveal** something, or **change the size** (push in on a realisation,
  pull out to reveal the situation). `alwaysMoving` flags > 85% moving.
- **Ease every move that starts and ends on screen** (`ease = "inout"`, the default). A move
  that starts on the cut uses `"out"` (the cut hides the start), one that ends on the cut `"in"`;
  `"linear"` only for constant tracking cut at both ends (mark it `cutIn`/`cutOut` = true).
- **Speed**: a subject or the background crosses the frame in ≥ 7 s at 24 fps (~3.5 s at 60 fps).
  That is ~horizontal FOV ÷ 7 degrees per second: ~7°/s at FOV 30, ~3.7°/s at FOV 15
  **[derived from RED]**. Faster is a whip pan: say so (`whip = true`) and cut on the blur.
- **Moves in Cine** (all eased by `ease`, over the whole shot):
  - `to = { size = "CU" }` push-in / pull-out (interpolates size, lens, angles in log space);
  - `orbit = 25` degrees around the subject;
  - `crane = 3` studs up (negative down);
  - `dolly = -0.3` change of distance (fraction);
  - `zoom = 1.5` lens multiplier (a zoom, not a dolly: flatter, more "documentary");
  - `follow = "track"` (default: the camera keeps framing a moving subject), `"lock"` (camera
    fixed where the shot starts, the subject moves through), `"pan"` (position fixed, the camera
    turns to follow);
  - `keys = { { t, pos, look, lens|fov, roll }, ... }` for a free path through points
    (centripetal Catmull-Rom; `path = "linear"` for straight segments). `pos`/`look` take a
    Vector3, `{x, y, z}`, or `{ at = "Workspace.Hero", part = "eye"|"center"|"base", offset =
    {x, y, z} }`.
- **Handheld noise** (`noise`): the Unity Cinemachine presets **[engine]**: slow drift
  (0.1-0.5 Hz) + sway (0.4-1.75 Hz) + jitter (0.6-2.5 Hz), pitch > yaw, no roll. `"auto"` picks
  tele/normal/wide by FOV (long lenses get about half the amplitude) at gain 0.5 (±1-2°):
  barely felt, which is right. `"strong"` for chaos; `{ preset = "handheld_normal_mild", gain =
  0.3 }`; `false` for a tripod. Use noise on most live-action-feel shots; skip it on stylised
  locked-off or symmetrical frames.
- **Impact shake** (`shake = { strength = 0.6, dur = 0.35 }` event, or per shot): trauma-squared
  Perlin at ~22 Hz, decaying linearly; peak ~2° at strength 1. Keep it short (0.2-0.4 s) and pair
  it with hitstop. Strength 0.3 light hit, 0.6 heavy, 1.0 explosion.

## 6. Time: hitstop, slow motion, speed ramps

- `hitstop = 0.12` (event): freezes the world (animations, VFX, sounds) for that long while the
  camera's shake keeps moving. Fighting games use 0.18-0.25 s on normal hits, action games 2-10
  frames **[frame data]**. Land it on the **visibly extended** frame, which with overlap is a
  frame or two after the animation's `Hit` marker (check with a capture).
- `timescale = { scale = 0.35, ramp = 0.1, dur = 0.8 }` (event): world slow-motion with an
  eased ramp in, holding `dur` seconds, then easing back over 0.2 s. The camera keeps real time,
  so moves stay smooth. Slow-mo for a reaction or a reveal, not for everything.
- Recording at 120-240 fps and slowing in an editor gives cleaner 20-50% slow motion
  **[derived]**: `trailer.md`, "Recording".

## 7. Depth of field

`dof = true` on a shot focuses on the subject's eyes every frame with per-size settings:

| Size | InFocusRadius (studs) | FarIntensity |
| --- | --- | --- |
| EWS / VWS | 40 / 25 | 0.03 / 0.05 |
| WS / FS | 12 / 8 | 0.1 / 0.15 |
| MWS / MS | 6 / 4 | 0.25 / 0.35 |
| MCU / CU / ECU | 2.5 / 1.6 / 0.9 | 0.5 / 0.6 / 0.7 |

Roblox's own environment sample uses FarIntensity 0.05 for gameplay **[docs]**; cinematic close
work goes much higher. NearIntensity stays 0 unless you frame through a foreground object.
A **rack focus**: `dof = { focus = "Workspace.Villain", at = 0.8, pull = 0.5 }` moves focus from
the subject to another point starting 0.8 s into the shot over 0.5 s (eased). Put a rack inside
a motivating action (a head turn, a door) and match its speed to the scene's tension
**[pro rule]**. `radius`, `far`, `near` override the table.

DOF renders differently on low graphics quality; set Studio's quality high before capturing.

## 8. Light and grade

- Cut-level `grade = { contrast, saturation, brightness, tint = {r,g,b}, bloom = { intensity,
  size, threshold }, exposure }` (a shot can carry its own). Creates `CineGrade`
  (ColorCorrection) and `CineBloom`, removed by `stop()`.
- Ranges from Roblox's own finished sample places **[docs]**: contrast 0.05-0.25, saturation
  -0.15 to +0.1, brightness ≤ 0.02, tint near white (warm: 255, 214-240, 143-222), bloom size
  56-80 with threshold 0.85-0.9, intensity 0.7-1.5. Beyond ±0.3 contrast or saturation reads
  over-processed.
- Teal-orange: warm the subject (tint, warm key light), cool the surroundings (ambient,
  atmosphere colour) so the subject separates **[pro rule]**.
- Films darken toward ~3/4 of the runtime and brighten through the climax **[study]**: plan the
  grade arc (darker before the climax, a brighter release).
- Three-point lighting with Roblox lights **[derived]**: key = SpotLight with shadows, 45° off
  the lens axis and above eye line; fill = PointLight/SurfaceLight at 1/4-1/2 the key, no
  shadows, opposite side; rim = SpotLight behind, aimed at the silhouette, ≥ the key, contrasting
  colour. Light range caps at 60 studs. Parent the rig to an invisible part on the subject so the
  lights travel with them.
- No built-in vignette or motion blur: a vignette is an ImageLabel overlay; motion blur comes
  from recording at high frame rate and blending frames in an editor.

## 9. Events: making things happen on cue

Events live on a shot (`events = { ... }`, `t` relative to the shot start) or on the cut
(`t` absolute). All are re-fired correctly when you `seek` or start mid-cut.

| Event | Fields | Notes |
| --- | --- | --- |
| `anim` | `rig`, `seq` (KeyframeSequence path) or `id`, `speed`, `fade` (0.1), `looped` | edit mode steps the Animator for you; `seq` registers a preview id |
| `vfx` | `template`, `at` (point spec) or `cframe` | needs the VFX skill's `ReplicatedStorage.VFX.Emit`; follows slow-mo and hitstop |
| `sound` | `id`, `volume`, `speed` | follows slow-mo (pitch) and pauses in hitstop |
| `move` | `part` (Part or Model), `to` (CFrame, 12 numbers, or a point), `dur` | Sine InOut tween; a model's pivot goes to the point, rotation kept |
| `timescale` | `scale`, `ramp`, `dur` | world time only |
| `hitstop` | seconds | world freeze |
| `shake` | `{ strength, dur }` or a number | camera |
| `call` | a function(handle) | anything else (Luau tables only) |

Cut-level `music = { id, bpm, offset, volume, start }` plays a track and lets `analyze` check
cut-to-beat (`beatSync`). See `trailer.md`.

## 10. Cine reference

```text
cut = {
  name, letterbox = 2.39 | nil, line = { A, B }, grade = {...}, music = {...}, events = {...},
  target = "roblox-page" | nil,          -- adds Roblox page-video checks
  shots = { shot, ... },
}
shot = {
  name, dur, subject = "Workspace.X",     -- a Model (Humanoid rig) or a BasePart
  role = "card" | nil,                    -- a card: card = { text, font, fadeIn = 0.2, fadeOut = 0.25 }, black = true
  camera = {
    frame = { size, yaw = 30, pitch = 0, lens | fov, side = "auto", eyeY, height = 0, dist = 1, roll = 0 },
    to = { ...frame fields... }, orbit, crane, dolly, zoom, ease = "inout", follow = "track",
    avoid = true,                         -- pull the camera in front of walls between it and the subject
    -- or: keys = { { t, pos, look, lens | fov, roll } }, path, lookAt, lens | fov
    -- or: cframe = CFrame, fov | lens
  },
  noise = "auto" | "strong" | false | presetName | { preset, gain },
  dof = true | { focus, at, pull, radius, far, near },
  fadeIn, fadeOut, fadeColor, black, flash = { t, dur, color },
  shake = { t, strength, dur }, events = { ... }, grade = { ... },
  -- flags that silence a deliberate rule break: whip, cutIn, cutOut, shortSided, jumpCut, crossLine
}
yaw: degrees around the subject from their facing: 0 = straight in front, +90 = at their LEFT
side, -90 = at their RIGHT side, 180 = behind. pitch: degrees above eye level (+ = looking down).
Easing names: linear, inout (Sine), in, out, quadinout, quadout, expoout, cubicinout, backout, smooth.
```

`Cine.play(cut, { start, timeScale, onDone, onFrame, autoStop = true, overlay = true })` returns
a handle: `time`, `duration`, `finished`, `shots`, `setTimeScale(s)`, `seek(t)`, `stop()`.
In edit mode it runs on Heartbeat; in a playtest LocalScript it binds to RenderStep after the
camera scripts. `Cine.analyze(cut, { json = true, aspect = 16/9 })`.

Yaw sign in practice: positive yaw puts the camera on the subject's left, negative on their
right. Two characters facing each other: the *same* side of the line is negative yaw on one and
positive on the other (the duel example: Hero negative = Hero's right side, where his punching arm
is; Villain positive). Confirm on `cineplan`'s top-down panels after the first analyze.

## 11. `analyze` reference

| id | level | rule |
| --- | --- | --- |
| `subjectOffscreen` | fix | subject behind or outside the camera at mid-shot |
| `eyesOutOfFrame` | fix | eyes within 3% of an edge |
| `eyeLine` | consider | MS or tighter with eyes outside 20-45% from the top |
| `headroom` | consider | more than 25% above the head on a medium or tighter shot |
| `leadRoom` | consider | subject short-sided |
| `defaultFov` | consider | FOV ≥ 62 (an ultra-wide) |
| `fastPan` | consider | the view crosses the frame in under 2 s |
| `linearMove` | consider | a linear move that starts/stops on screen |
| `cardWords` / `cardLong` / `cardShort` | consider / consider / fix | > 5 words; held > 3.5 s and far longer than needed; shorter than chars/20 + 0.5 s |
| `flashFrame` | fix | a shot under 3 frames |
| `jumpCut` | fix | same subject, < 30° and < 1.4x size change |
| `crossedLine` | fix | camera changes side of the action line |
| `pacing` | info | ASL, median, median/mean, CV |
| `uniformShots` | fix | three shots in a row of the same length |
| `noAcceleration` | consider | the last third's shots not ≥ 15% shorter than the first third's (≥ 6 shots) |
| `sizeVariety` | consider | fewer than 3 sizes in 4+ shots |
| `alwaysMoving` | consider | > 85% of shots move |
| `beatSync` / `offBeat` / `everyBar` | info / consider / consider | cuts on beats; none; all on downbeats |
| `pageLength` / `pageCinematic` | consider | `target = "roblox-page"`: over 30 s; letterboxed |

## 12. Failure modes seen while testing (and the fix)

- **A strike hidden behind the body** or foreshortened toward the lens: choose the line side so
  the striking arm faces the camera; shoot it in profile at FS.
- **Hitstop on the marker frame** catches the arm still bending (overlap lags it): put hitstop
  1-2 frames after the marker and capture to confirm.
- **Characters too far apart**: the punch lands on air in a profile shot. Stage within reach.
- **Captures show no letterbox or cards**: expected (viewport only). Judge composition inside
  the letterbox by `analyze` (it measures in the letterboxed frame), and watch one real run.
- **Animation not playing in edit mode**: the KeyframeSequence's `PreviewId` belongs to an
  earlier Studio session; re-run the `--out` Luau.
- **The camera fights you between calls**: only a playing cut holds the camera; place-and-capture
  in back-to-back calls otherwise.
