# Animation craft, by the numbers

This is what separates a pro's character animation from a first attempt, written as numbers
you can author to and checks `animpro.mjs` runs. Read it with `character-animation.md` (the
pose format) and keep `animation-measured-tables.md` open for the full tables.

Trust tags, as in the VFX skill: **[mocap]** measured by this skill from professional actors'
motion capture (Bandai Namco Research Motion Dataset, see NOTICE.md); **[roblox]** measured
read-only from Roblox's own animation packs in Studio; **[frame data]** published fighting-game
frame data; **[study]** biomechanics or perception research; **[pro rule]** a working
animator's stated rule; **[derived]** arithmetic from the above.

## 0. Why first attempts look bad, in one table

A first-attempt animation is a handful of poses, keyed on round times, all joints on the same
frames, Linear or symmetric easing, frozen between keys. Each of those has a measured fix:

| What a first attempt does | What real motion does | Lint id | Fixed by |
| --- | --- | --- | --- |
| Moves at constant speed between keys | peaks at ~1.4x its average speed **[mocap, 1,315 arm raises]** | `linearSpacing` | spline pass (auto) |
| Eases in and out the same amount | reaches peak speed at ~38% of the move: leaves fast, arrives slowly **[mocap]** | `symmetricEasing` | timing of keys (you) |
| Every joint on the same frame | children lag parents 1-2 frames at 30 fps **[pro rule]**; elbow starts ~33 ms after the upper arm **[mocap]** | `noOverlap` | overlap pass (auto) |
| Left and right mirror each other | one side leads, the other follows a few frames later with a different shape **[pro rule]** | `twinning` | you |
| Freezes between keys | a "still" person drifts: hands ~3.7 cm, head ~1.2 cm, trunk ~1° in ~1 s **[mocap, 1,233 holds]** | `deadHold` | moving-hold pass (auto) |
| Straight-line paths | arm raises bow ~22% of their travel, slashes ~36% **[mocap]** | `straightPath` | breakdown keys (you) |
| Arm swings, hips stay put | punches drop the hips 3-20 cm and turn the pelvis 40-96° **[mocap]** | `noWeightShift` | you |
| Strike from a dead start | load first: hip dip, pull-back or a torso turn in the 0.6 s before **[mocap, pro rule]** | `noAnticipation` | you |
| Arm moves before the body | pelvis peaks ~50 ms and shoulders ~30 ms before the hand **[mocap]** | `armFirst` | you |
| Snaps back to idle | recovery 1.1-2.6x the strike; weight shows in the follow-through **[mocap, pro rule]** | `shortRecovery` | you |
| Walk with flat hips | hips bob ~4.3% of hip height in a walk, ~12% in a run, twice per cycle **[mocap]** | `flatBob` | you |
| Keys every 0.25 s exactly | rhythm: quick strike between slower anticipation and recovery | `evenKeys` | you |
| Roblox's default Linear easing | (Roblox Animation Editor default is Linear **[docs]**) | `linearEasing` | spline pass (auto) |

"auto" means `animpro.mjs` fixes it in its pro passes; "you" means it is authoring feedback:
change the poses or the timing and run it again. A clean run is `"ok": true` with no `fix` in
`lint`.

## 1. Units and scale

- 1 stud = 0.28 m **[docs]**. The mocap actors' hip height is ~91 cm; R15's is ~2.0-2.2 studs.
  To move a mocap distance onto a rig: `studs = cm x (rig hip height in studs / 91)`. For R15
  (2.19), 1 cm ≈ 0.024 studs, so a 8 cm hip drop ≈ 0.19 studs.
- Times do not scale with size for a human-proportioned rig. For a giant (3x), slow everything
  by about sqrt(3) ≈ 1.7x (pendulum timing) **[derived]**; for a small creature, speed up.
- 30 fps is the authoring rate here (Roblox editor default). 60 fps frame data / 2 = 30 fps
  frames; 24 fps frames x 1.25 = 30 fps frames.
- `animpro` scales its speed thresholds by the rig's hip height (`H`), so its checks work for
  any size of rig.

## 2. Timing

### 2a. Attacks: anticipation / contact / recovery

Every gameplay action has three parts: **anticipation** (wind-up), **apex** (the contact frame
or active window), **recovery** (return to a pose the next animation can blend from)
**[pro rule, Cooper]**.

| Attack | Startup (to contact) | Active | Recovery | Total | Source |
| --- | --- | --- | --- | --- | --- |
| Light (jab) | 0.07-0.10 s (2-3 f @30) | 0.05-0.1 s | 0.12-0.2 s | 0.22-0.32 s | SF6 Ryu LP/LK **[frame data]** |
| Medium | 0.10-0.15 s (3-5 f) | 0.07-0.13 s | 0.18-0.3 s | 0.33-0.48 s | SF6 MP/MK |
| Heavy | 0.17-0.20 s (5-6 f) | 0.07-0.08 s | 0.3-0.35 s | 0.53-0.58 s | SF6 HP/HK |
| Heavy character's heavy | 0.2-0.4 s (charged 0.4-0.7) | | | 0.6-0.87 s | SF6 Marisa |
| Telegraphed enemy (soulslike) | telegraph + attack ≥ 0.34 s | 2-4 f | end-pose hold ≥ 0.24 s, then return | | Dark Souls 3 **[pro rule]** |
| Real (mocap) punch | 0.11-0.33 s onset to peak | | 0.53-0.67 s | | **[mocap]** |
| Real two-handed slash | 0.15-0.39 s; wind-up 1.1-1.4 s when telegraphed | | hold 0.5-1.1 s, recovery 0.3-1.4 s | | **[mocap]** |
| Real kick | lift to chamber 0.2 s, chamber to extension 0.17-0.2 s | | extension to landing ~0.5 s | | **[mocap]** |

Rules:

- **Player attacks: short anticipation** (every anticipation frame is input delay). Put the load
  into the stance or idle instead. **NPC attacks: long anticipation** so the player can react.
  Bigger damage = longer anticipation **[pro rule, Cooper]**.
- **Weight comes from follow-through and recovery, not from a slow start.** A punch going from
  recoil to full extension over 2 frames reads faster and harder than over 5 **[pro rule]**.
- **Recovery ≥ strike.** Measured punches recover at 0.4-0.6x the speed they struck at.
- **Hold the contact pose** for 1-3 frames (or hitstop, below) so it reads.
- **Hits closer than ~5 frames at 30 fps read as one hit** **[pro rule]**. A 3-hit combo lands
  9-13 f apart at 30 fps (Ninja Gaiden) **[frame data]**.
- Mark the frame control returns (a `Recover`/`Cancel` marker) **before** follow-through ends;
  follow-through plays out only when no new input arrives **[pro rule]**.
- Roblox combat practice: hitbox spawned from a `Hit` marker, never a timer.

### 2b. Hitstop and shake (pair them with the animation)

- Fighting games freeze attacker and victim 11-15 frames @60 (0.18-0.25 s) on normal hits, up to
  ~0.5 s on big counters **[frame data, GGST, Smash]**. Action/indie games use 2-10 frames.
  Scale with damage, cap it, freeze **both** characters.
- During hitstop the victim shakes and blends into the hurt pose over ~4 frames **[pro rule,
  Sakurai]**.
- Camera: trauma-squared shake, short (0.2-0.4 s) and small. Cine's `hitstop` and `shake`
  events do both (`cinematics.md`).

### 2c. Gestures and reactions

| Measured (normal style, median) | Value | **[mocap]** |
| --- | --- | --- |
| Arm raise up / hold / down | 0.43 / 0.73 / 0.50 s | 229 raises |
| Peak speed / mean speed | 1.47 | |
| Peak speed at fraction of move | 0.38 (tired/old ~0.25) | |
| Overshoot past the target | 0.4% of travel (tiny: real arms barely overshoot) | |
| Elbow starts after upper arm | 33 ms (elderly 133, exhausted 100) | |
| Wave frequency | 1.7 Hz normal, 0.85 tired/old, 2.1-2.6 energetic | 624 waves |
| Head leads pelvis in a 90° walking turn | 533 ms normal (150 exhausted - 900 youthful) | 470 turns |
| Pelvis leads the walking path | ~133 ms | |

Take-aways: **leave fast, arrive slow** (peak at 35-40% of the move); **settle, don't bounce**
(overshoot is a stylistic choice, keep it small for realism, larger for cartoon);
**eyes/head lead turns** by a quarter to half a second.

## 3. Spacing (how fast between the keys)

- The same timing with different spacing is a different motion (Williams' coin test).
- **Roblox's Animation Editor defaults to Linear** **[docs]**: constant speed with a kink at
  every key. All of Roblox's own packs are stored as dense Linear keys (10-30 per second) baked
  from curves **[roblox]**, which is what `animpro` produces.
- Legacy `Cubic` In/Out play **reversed** on Humanoids **[docs]**. If you key easing by hand,
  use `CubicV2` or `InOut`. With the spline pass on (default), easing on keys is replaced by
  the spline anyway.
- To make a move **leave fast and arrive slow** with the spline, add a breakdown key at ~60% of
  the distance, ~40% of the time into the move. To snap out of a pose, key the pose a frame
  later than the last anticipation key with the body already moving.
- Sword swings: fast in, slow out; a falling object: slow in, fast out **[pro rule]**.

## 4. Arcs

Organic moves curve. Measured arm raises bow ~22% of their travel; slashes ~36%; even punches
curve a little **[mocap]**. A hand or weapon tip that travels in a straight line between two
keys is the commonest "robotic" tell after Linear spacing.

- Add a breakdown key in the middle of any large move, pushed off the straight line (for an
  overhead slash: the arm forward and high at mid-swing, so it goes over the top).
- A turn > 90° gets in-betweens automatically, along the **short** way round. A wide arc needs
  its own key partway (the compiler refuses ≥ 175° turns).
- Look at `--trails`: every path should be a curve.

## 5. Overlap and sequencing

- **Down a chain** (shoulder > elbow > wrist > prop; spine > neck > head) each joint trails its
  parent 1-2 frames at 30 fps; heavier or looser parts trail more; the outermost settles last
  **[pro rule]**. The overlap pass does this (Neck 1, elbows 1, wrists/props 2 frames at
  30 fps); per-joint override: `"pro": {"overlap": {"RightWrist": 3}}`.
- **Through the body** (kinetic chain), power flows from the ground up. Measured strikes:
  pelvis rotation peaks 16-96 ms before the fist, the shoulder line 8-48 ms before **[mocap]**.
  Key the hips first, the chest one or two frames later, then the arm. This is authoring, not
  automatic: the lint's `armFirst` tells you when the order is wrong.
- **Leading with the head/eyes** in turns and looks (2c).
- **Twinning**: never let both arms or both legs hit mirrored poses on the same frame. Offset
  the second side 2-4 frames and give it a different shape. Symmetry only for deliberate
  high-force beats (a two-handed overhead slam).

## 6. Weight and commitment

Measured punches **[mocap, 10 strikes]**: hips drop 3-20 cm (median ~8% of hip height), travel
16-34 cm toward the target, pelvis turns 40-96°, shoulders turn 61-113°. The body commits; the
arm finishes the job.

For R15 (hip height ~2.2): Root drop 0.07-0.26 studs, Root travel 0.4-0.8 studs, Root/Waist yaw
combined 40-90°.

- Planted feet (`aimAt` on the hips, y ≈ -2.88 for R15) stay on the floor only while the Root's
  drop stays within ~0.26 studs and the Root is not pitched: pitch the **Waist**, not the Root,
  for a forward lean. `groundContact` fails otherwise (`animation-recipes.md` has the numbers
  that pass).
- A heavy weapon: longer recovery, more hip drop, the body is pulled past the target by the
  weapon (follow-through), the off hand counterbalances.
- Landing: soft landings bend the knees ~117°, stiff ones ~77° **[study]**; compression 0-2
  frames, recover 3-5, blend out by 6-8 at 60 fps **[pro rule]**.

## 7. Anticipation

- The amount of anticipation sells the size of the action. Measured telegraphed slashes wind up
  1.1-1.4 s and pull the weapon back 31-41 cm **[mocap]**; an untelegraphed punch has
  essentially none (the load is in the stance).
- Forms: a hip dip (load the legs), a counter-turn of the torso, a pull-back of the striking
  limb, a weight shift onto the back foot. One or two are enough.
- The longer the anticipation hold, the faster the action that follows can be and still read.
- Player-controlled jumps: 0-4 frames of anticipation at 60 fps; NPC or cinematic jumps can use
  the real ~0.3-0.5 s countermovement **[pro rule, study]**.

## 8. Holds, idles and life

- **No dead holds.** A frozen character "instantly appears dead" **[pro rule]**. The moving-hold
  pass adds measured drift; `--life 0.5` for calm/disciplined, `2` for restless/young.
  Measured peak-to-peak in ~1.1 s holds **[mocap, all styles]**: hands 3.7 cm (normal 2.0,
  youthful 10.7), hips 1.0 cm, head 1.2 cm, trunk lean 1.1°, head pitch 2.0°.
- **Breathing**: resting rate 12-15/min, ~2 s in, ~3 s out **[study]**. The breathe pass: 4 s
  cycle, ~0.8°, inhale 40%. Loops named `*idle*` get it automatically.
- **Weight shifts**: people standing freely change posture about every 20 s **[study]**. A long
  idle (Roblox's Rthro idle is a 10 s loop of 1-7° drifts **[roblox]**) beats a 2 s loop. Give
  idles at least one weight shift and one head/look change.
- **Idle shows personality and readiness**: confident = wide upright stance; shy = feet together,
  slightly off balance **[pro rule, Overwatch]**. A combat idle keeps the guard up, weight on the
  balls of the feet, a small rhythmic bounce.
- **Loops must close**: Roblox does not interpolate the last key back to the first, so the last
  key repeats the first **[docs]** (the format enforces it).

## 9. Locomotion

### Measured gaits **[mocap, dataset 2 medians]** and Roblox's own **[roblox]**

| | speed m/s | steps/min | stance (of cycle) | hip bob % of hip height | low point (fraction of step after contact) | lean ° |
| --- | --- | --- | --- | --- | --- | --- |
| Walk, normal | 1.10 | 109 | 0.60 | 4.3 | 0.12 | 0 |
| Walk, active | 1.42 | 133 | 0.55 | 8.1 | 0.21 | 5 |
| Run, normal | 2.82 | 157 | 0.28 | 11.9 | 0.21 | 9.5 |
| Run, active | 3.43 | 144 | 0.22 | 14.4 | 0.18 | 15.5 |
| Roblox packs, walk | | cycle 0.62-0.67 s | | bob 0.10-0.29 studs | | |
| Roblox packs, run | | cycle 0.62-0.67 s | | bob 0.19-0.90 studs | | |

- **Key order per step** (Williams; Roblox's own tutorial at 24 fps): Contact → **Down** (lowest,
  weight lands on the bent front leg, just after contact) → Passing → **Up** (highest, push-off)
  → Contact **[pro rule, docs]**. Hips dip **twice** per cycle.
- **Arms opposite to legs**; furthest out at Down, closest at Passing. Normal walk: arm forward
  ~28°, back ~18°; run: forward ~12°, back ~48°, elbows bent ~110° **[mocap]**.
- **Pelvis and shoulders counter-rotate**: walk pelvis yaw ±7.5°, shoulders ±3°; the head stays
  nearly level **[mocap, study]**.
- **Feet must not slide.** `animpro` reports `groundSpeed` (how fast planted feet travel
  backward, studs/s). The Humanoid's WalkSpeed (default 16, physically a 4.5 m/s jog) should be
  within ~0.5-2x of it, or the playback speed scaled to match (`creature-animation.md` and
  `character-animation.md` "NPCs"). Halving every key time doubles ground speed; a longer stride
  raises it too.
- **Blended cycles** (walk and run under one controller) must be the same length and start on
  the same foot **[pro rule, Cooper]**.

### Style and emotion (what changes, measured **[mocap dataset 1, study]**)

| Emotion/style | Speed | Stride | Lean | Head | Arm swing | Elbows |
| --- | --- | --- | --- | --- | --- | --- |
| Normal | 1.2 m/s | 1.63 leg | -1° | level | +23/-28° | 32° |
| Happy | faster | long | +4.5° | up (-9°) | big (+34/-51°) | 89° |
| Angry | fast cadence (130) | shorter, heavy | +10° | down (+11°) | back-heavy (+8/-54°) | 74° |
| Sad | slowest (0.49) | shortest | +3° | down | almost none (+5/-9°) | 27° |
| Proud | slow, long | long | -3° (back) | up (-17°) | small fwd | 92° |
| Tired | slow | short | +10° | down (+35°) | small | 35° |
| Old | slowest cadence | short | +19° | down (+26°) | small | 46° |
| Not confident | | very short | +14° | down (+27°) | almost none | 76° |

Observers recognise sad gait 94%, angry 90%, happy 74% even with the head hidden, and the
differences survive at matched speed: **posture and amplitude, not just speed, sell emotion**
**[study]**.

## 10. Poses and silhouettes

- **Read from the game camera.** Check the contact sheet's three-quarter view: can you tell what
  the character is doing from the silhouette alone? Arms clear of the body, weapon clear of the
  head.
- **Line of action**: one clear curve through the body on every key pose of an action.
- **Contrapposto**: weight on one leg, hips and shoulders tilted opposite ways. Weight on both
  legs evenly reads stiff.
- **Exaggerate extremes, hold key poses slightly longer than real** so they read at game speed
  **[pro rule, Overwatch/Cooper]**.
- **Avoid level lines** across both shoulders, both hands, both feet.

## 11. Game technicalities (Roblox)

- `AnimationTrack:Play(fadeTime = 0.1, weight = 1, speed = 1)`; the default Animate script blends
  walk/idle over 0.2 s **[docs]**. Attacks: 0.05-0.1 s fade in, cut hits with no crossfade.
- Priority: Idle 0 < Movement 1 < Action 2 < Action2-4; Core is the lowest despite its value
  **[docs]**. Attacks are Action or higher; a combat idle is Idle.
- Markers (`markers` in a keyframe) → `track:GetMarkerReachedSignal("Hit")`. A keyframe's
  `name` is not a marker.
- Jump airtime with JumpPower 50 and gravity 196.2: ~0.51 s **[derived]**. A jump's air
  animation should loop or hold, not be timed.
- `playback.md` has tracks, blending, layering, and the loader patterns.

## 12. The authoring loop (do this every time)

1. Decide **what it's for**: player or NPC, light or heavy, the emotion, the camera it's seen
   from. Pick numbers from sections 2-9 *before* posing: total length, contact time, hold,
   recovery, hip drop, turn amounts.
2. Start from the nearest recipe (`animation-recipes.md`, `character-animation.md`). Copy it.
3. Pose the **keys** (contact/extremes) first, then **breakdowns** (arcs, leave-fast-arrive-slow),
   on uneven times. Hips first, then chest, then arms.
4. Run `animpro.mjs --grounded --sheet --graph --trails`. **Look at all three images.**
5. Fix every failing check and every lint `fix`; weigh every `consider`. Run again.
6. Build (`--out`), preview on a dummy at the contact frame and one mid-recovery frame
   (`tools.md`), from the camera players will see it from.
7. Tell the user what you checked, the numbers you aimed for, and that they should watch it at
   full speed in a playtest.

## 13. Lint reference

| id | level | fires when | fix |
| --- | --- | --- | --- |
| `linearSpacing` | fix | ≥30% of joint moves have peak/average speed ≤ 1.15 | spline on; breakdown keys |
| `symmetricEasing` | consider | moves peak at 46-54% of their duration | move breakdowns earlier |
| `noOverlap` | fix | children move on their parents' frames (median lag ≤ 0.3 f) | overlap on (default) |
| `twinning` | fix | left/right mirror on the same frames (< 6° apart, corr > 0.9) | offset and reshape one side |
| `deadHold` | fix | every joint frozen for a stretch | `--life`, or key a drift |
| `straightPath` | consider | an effector's path bows < 4% | breakdown key off the line |
| `noWeightShift` | fix | a fast strike (> 3 H/s) with hips nearly still | drop and shift the Root, turn the hips |
| `noAnticipation` | consider | a fast strike from a dead start | hip dip, pull-back or counter-turn first |
| `armFirst` | consider | the torso peaks after the hand | key hips and chest earlier |
| `shortRecovery` | consider | recovery shorter than 0.6x the strike | longer recovery, follow-through |
| `bobReport` | info | locomotion | compare with section 9 |
| `flatBob` | fix | hips bob < 4% (walk) / 10% (run) of hip height | lower the Root on Down, raise on Up |
| `evenKeys` | consider | keys evenly spaced | vary key intervals |
| `linearEasing` | fix | Linear keys with the spline pass off | spline on, or CubicV2/InOut |

The JSON's `measured.action` block reports the main strike as baked: `effector`, `onset`,
`peak`, `stop` (seconds), `strike_s`, `followThrough_s`, `hold_s`, `recovery_s`, `peakSpeed`
(studs/s), `windupBack` (pull-back, studs), `rootDrop` and `rootShift` (studs), and
`torsoPeak_ms` / `chestPeak_ms` (hips and chest speed peaks relative to the effector's;
negative = before, which is right). `measured` also has `lags` (frames per joint),
`spacingPeakOverMean` (aim ~1.3-1.5) and `peakAt` (aim ~0.35-0.45). Compare them with sections
2 and 6 before calling an attack done.
