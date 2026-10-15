# Fight set (tested in Studio, 2026-10)

Two R15 fighters, orthodox stance, 3.6 studs apart root to root. Every file passes animpro's checks
(`--grounded`; StepIn and HitHead with `--waive rootDrift`, Knockdown/Downed with `--waive rootDrift,groundContact`).
`generate.py` writes all of them from one shared guard pose: edit it rather than the JSON.

| Clip | Length | Contact / key moment | Notes |
| --- | --- | --- | --- |
| HeroSlip | 0.9 s | lowest at 0.26 | deep bob-and-weave (Root -0.62) under a hook |
| HeroBodyHook | 0.85 s | Hit 0.25 | lead hook to the body, hips first |
| HeroBlock | 0.62 s | impact 0.17 | high guard, rocked back 0.14 |
| HeroStepIn | 0.56 s | ends 0.9 forward | teleport the model +0.9 forward when it ends |
| HeroUppercut | 1.65 s | Hit 0.38 | dip, drive, fist under the chin, held follow-through |
| VillainHaymaker | 1.45 s | swing peak ~0.56 | telegraphed wind-up 0.25-0.42, overextends on the miss |
| VillainHitBody | 1.25 s | contact at 0 | folds over, hurt moving hold, recovers |
| VillainJab | 0.6 s | Hit 0.14 | quick lead jab |
| VillainHitHead | 1.05 s | contact at 0 | head snaps (0.18), staggers back 0.9 (back foot first) — teleport +0.9 back at the end |
| VillainKnockdown | 2.6 s | contact at 0 | lifted, falls on his back, lies still (Action2) |
| VillainDowned | 3.2 s loop | — | lying + breathing (Action3); start it before Knockdown ends |

The cut that uses them (16 s, 11 shots, hitstops, slow-mo finisher) is `templates/cine/examples/fight.lua`.

Lessons from making it (in order of how much they mattered):
1. Every hit needs a reaction clip started on the contact frame, plus hitstop (0.07-0.12 s) and shake on that frame.
2. Stage within reach (3.6 studs here); a dodge must clear the strike (the slip drops the head ~0.6 below the hook's path).
3. Don't land a punch on a raised guard: counter while the opponent's arm is out (the cross-counter over the jab).
4. Travel (stagger, step-in) is animated in the clip and committed with a model teleport at the clip's end, so feet never slide.
5. After hitstop/slow-mo, world time lags the cut's clock: compute when a clip ends (start + length + hitstop + slow-mo stretch).
6. A non-looping clip snaps back to idle when it ends: hold end poses with a looped follow-up clip (Downed) and stop the idle.
