# Tested recipes (pass every check, clean lint)

These are in `recipes/` as pose JSON. Each was written to the numbers in `animation-craft.md`,
run through `animpro.mjs --grounded`, looked at (sheet, graph, trails), and played on an R15
avatar in Studio. Copy the nearest one and change it; don't start from a blank file.
`character-animation.md` has adn's own recipes too (walk, run, jump, idle, slash, cast,
creature gaits): run them through `animpro.mjs` the same way.

```bash
node SKILL_DIR/scripts/animpro.mjs SKILL_DIR/recipes/cross.json --grounded --sheet cross.png --graph cross_graph.png --trails cross_trails.png
```

## Cross (player punch) `recipes/cross.json`

Right-hand cross from a boxing guard. Action priority, 0.9 s authored (0.97 s baked: overlap
adds two frames), `Hit` marker at 0.24 s.

| t (s) | Key | What happens |
| --- | --- | --- |
| 0 | Guard | Root down 0.15, turned -16°, left foot forward; left hand up (elbow 100°), right fist by the chin (130°) |
| 0.10 | Load | anticipation in the body, not the arm: hips dip to -0.26 and counter-turn to -24°, Root eases back 0.06 |
| 0.17 | breakdown | pelvis already through +4°, chest following, fist leaving fast (elbow 80°) |
| 0.24 | **Hit** | arm straight (elbow 4°), Root forward 0.2 and turned +12° (36° from Load), Waist +14°, head counter-turned -12° to keep the eyes on the target; left hand stays home (no twinning) |
| 0.30 | breakdown | a short hold on the extension so it reads |
| 0.62 | recovery | most of the way back, guard reforming |
| 0.90 | Guard | = the first key, so it chains into an idle or another punch |

Measured on the baked result: strike 0.27 s, recovery 0.40 s (1.5x), peak/mean speed 1.39,
hips and chest peak 33 ms before the fist, root shift 0.16 studs, lags Head 1.2 / elbows 0.8-1.2
frames. A medium attack in the fighting-game table (0.24 s to contact); for a jab, compress
Load→Hit to 0.07-0.1 s and halve the hip turn.

Variations: jab = left hand, no hip turn beyond 15°, recovery 0.25 s; hook = arm bent 90° at
Hit, swing in the horizontal plane with a key at mid-arc, pelvis turn 50°+; uppercut = Root drop
0.2 at Load, rise through Hit, arm aim up.

## Heavy slash (two-handed, weapon prop) `recipes/heavyslash.json`

An overhead-to-low two-handed slash with a telegraph. Needs the `Weapon` prop joint (see
`character-animation.md`, "Props"). Action priority, 1.55 s, `Hit` at 0.56 s.

| t (s) | Key | What happens |
| --- | --- | --- |
| 0 | Guard | weapon held mid, weight centred |
| 0.38 | WindUp | blade high and back, chest counter-turned, weight on the back foot (the telegraph) |
| 0.46 | breakdown | the hips already driving forward while the blade is still high (overlap through the body) |
| 0.56 | **Hit** | Root down 0.25 and forward 0.2, Waist pitched -18° (lean from the Waist, not the Root, so the feet stay planted), blade through the target |
| 0.66 | follow-through | blade carries past and low, the body pulled after it |
| 1.02 | FollowThroughHold | moving hold: the weight settles, the pass adds drift |
| 1.55 | Guard | recovery ~0.5 s, longer than the 0.27 s strike |

Measured: weapon tip peaks at ~169 studs/s, strike 0.27 s, follow-through 0.1 s, hold 0.37 s,
recovery 0.5 s, root drop 0.2 studs, chest peaks 133 ms and hips 33 ms before the tip (power
from the ground up). The lint's only note is `symmetricEasing` (consider): the swing peaks at
50% of its duration. For a heavier, slower character move the 0.46 breakdown to ~0.43 and let
the arrival into Hit slow.

The groundContact lesson from writing it: planted feet (`aimAt` y -2.88) sink if the Root drops
more than ~0.26 or the Root is pitched. Keep big leans in the Waist.

## Combat idle (loop) `recipes/combatidle.json`

A boxing-guard idle that never freezes. Idle priority, loop 3.2 s, keys at 0, 1.15, 1.9, 3.2
(uneven on purpose).

- Weight drifts between the feet (Root x +0.04 to -0.03, roll -1.5° to +1.2°), hips dip 0.04,
  the guard hands breathe a few degrees out of phase with each other, the head looks around
  slightly (yaw 9-14°). Keys at 1.15 and 1.9 key different joints, so nothing arrives together.
- `--breathe` is on automatically (the name contains "idle"), moving holds on.
- A real person shifts posture every ~20 s: for a long idle, make a second, longer variant
  (8-12 s) with one big weight shift and a look-away, and alternate the two in the loader.

## The anti-recipe: what a first attempt looks like `recipes/anti/naive_punch.json`

Four keys at 0, 0.25, 0.5, 0.75, 1.5 s; only the arms keyed; both arms moving on the same
frames; nothing else. Run it both ways to see what each layer of this skill does:

```bash
node SKILL_DIR/scripts/animpro.mjs SKILL_DIR/recipes/anti/naive_punch.json --grounded --raw   # as written
node SKILL_DIR/scripts/animpro.mjs SKILL_DIR/recipes/anti/naive_punch.json --grounded         # with pro passes
```

- `--raw` lint: `linearSpacing`, `noOverlap`, `twinning` (x2), `deadHold`, `noWeightShift`,
  `linearEasing`: seven fixes.
- With the pro passes: spacing, overlap, dead holds and easing are gone. What remains is what no
  pass can invent: `twinning` (x2), `noWeightShift` and `noAnticipation`. Those need a
  different performance: hips, a lead hand, a load. Compare it with `cross.json`.

This is the point of the tool split: the passes do the mechanical polish a pro does by hand in
the graph editor; the acting (weight, intent, asymmetry) is still yours, and the lint will not
let you skip it.

## Fight set: a full choreographed exchange `recipes/fight/`

Eleven clips for a two-fighter scene (slip, body hook, block, step-in, uppercut; haymaker, jab, body-hit,
head-snap stagger, knockdown, downed loop) and the 16 s cut that plays them
(`templates/cine/examples/fight.lua`). `recipes/fight/README.md` has each clip's contact frame and the
six lessons from staging it: reactions on the contact frame, staging within reach, never punching into
a raised guard, travel committed by teleport at clip end, computing clip ends after hitstop and
slow-mo, and holding end poses with a looped follow-up.
