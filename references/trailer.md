# Trailers: structure, rhythm, cards, music, recording

A trailer is an edit before it is footage: structure and rhythm first, then shots to fill it.
`scripts/trailerplan.mjs` turns the numbers below into a shot table and a Cine skeleton; `Cine`
plays and checks it; the user records it. Tags as in `cinematics.md`.

## 0. Which trailer is this?

| Kind | Length | Shot length (ASL) | Notes |
| --- | --- | --- | --- |
| Roblox experience-page video | ≤ 30 s to be safe (forum reports 30-60 s) | 2-4 s | **real gameplay only** (section 6) |
| Social clip / teaser | 15-30 s | 1-2.5 s | hook in the first 3 s, title card before 5 s |
| Indie gameplay trailer | 45-90 s ("under 90 unless you know what you're doing") | 2.5-4.5 s | clarity over flash **[pro rule, Lieu]** |
| Action / AAA-style game trailer | 60-120 s | 1.3-2 s | climax under 1 s |
| Theatrical-style cinematic | 90-150 s | ~1.9 s mean (288 trailers), ~1.4 s modern blockbuster | **[study]** |

Measured: *Baba Is You* 4.25 s, *Papers, Please* 2.6 s, *Modern Warfare II* 1.3 s, *Fast X*
trailer 0.82 s **[pro rule, Lieu]**. Copying AAA cutting for a simple game obscures the gameplay;
"more editing is not better editing" **[pro rule, Lieu]**. Ask the user which kind it is if the
request doesn't say; for a Roblox game page, it is the first row.

## 1. Structure

Derek Lieu's five beats for game trailers **[pro rule]**, which match the theatrical cold open /
acts / title / button structure:

1. **Cold open / hook** (first 3-5 s): the most striking readable moment, a gameplay slice or a
   joke. No studio logo (unless famous), no fade from black, no slow establishing shot. Steam
   gives you < 10 s, autoplays muted, and loops a 6 s microtrailer cut from the first trailer's
   seconds: every second must read on its own, without sound **[docs, Steam]**. Henson: show
   what the game is within 3 s of silence **[pro rule]**.
2. **Introduction**: slow down, set up the world and the core verb. Longer shots, wides.
3. **Escalation**: new mechanics, places, enemies; shots shorten; title cards reset energy
   between blocks. Show similar things in threes or fewer, the third different; order from
   simple to striking ("lows don't look low without a high") **[pro rule, Lieu]**.
4. **Climax**: the fastest cutting (theatrical climaxes drop shot lengths sharply **[study]**),
   then a **stopdown** (the music cuts for about a beat) and **one final hit**.
5. **Breath, title, button**: ~5 s of breathing room after the peak, the title on a downbeat
   with platforms/date and **one** call to action, then a button: a joke, a reaction, one last
   beat **[pro rule]**.

Lieu's *Spiritfarer* sections: 6 / 14 / 5 / 14 / 15 / 5 / 16 / 6 / 60 s, with 5 s transitions
and a 5 s breathe after the climax **[pro rule]**. Theatrical: Act 2 around 1:00, Act 3 around
1:30, a fortissimo last 15-30 s **[pro rule]**.

## 2. Rhythm

- **Accelerate**: the last third's shots clearly shorter than the first third's (e.g. 3-4 s →
  1-1.5 s), then breathe **[study, pro rule]**. `analyze` checks `noAcceleration`.
- **Lognormal lengths**: many short shots, a few long holds; median ≈ 0.5-0.6 x mean; never a run
  of equal lengths (`uniformShots`), never a fixed interval **[study, pro rule]**.
- **Cut on the music, but not on every beat**: key cuts on beats and accents, others on secondary
  beats and on actions; sync in-shot motion (a hit, a landing) to accents instead of cutting
  there. Cutting on every downbeat is predictable "and even nauseating" **[pro rule, Lieu,
  Jordan]**. `analyze` reports `beatSync` and flags `offBeat` / `everyBar`.
- **Music first.** Choose the track before cutting; it marks the turning points **[pro rule]**.
  A trailer usually combines 3-4 pieces/sections; each new section (melody, tempo or density
  change) raises the stakes **[pro rule]**.
- **Stopdowns** (music drops for a beat) before a drop or the final hit make it bigger; too many
  cheapen them **[pro rule]**. One beat at 100-120 BPM = 0.5-0.6 s **[derived]**.
- **SFX under the music**: hits, whooshes, risers. Music with no SFX feels dry **[pro rule]**.
- **Motion vs length**: high-motion shots short, wides and slow beats longer **[study]**.

trailerplan does this for you:

```bash
node SKILL_DIR/scripts/trailerplan.mjs --length 75 --bpm 120 --offset 0.0 --style indie --title "CANDY RUSH" --out plan.json --cine skeleton.lua
```

- Sections: cold open 8%, intro 22%, escalation A/B/C 20/20/14% (cards between B and C), climax
  16% of the content time, then breath (~6% of length, ≤ 5 s), title 2.5 s, button 3-5 s. Short
  trailers (≤ 35 s): hook 15%, core loop 45%, escalation 40%, title 2 s.
- ASL ranges per style (start → end of section): indie cold 2.2→2.0, intro 3.6→3.0, escalation
  2.8→1.6, climax 1.2→0.8; action 1.4/2.2/1.6→1.0/0.8→0.5; story slower (3.0/4.5/3.2→2.0/1.6→1.0).
- Durations drawn lognormal around the target (σ 0.28 climax, 0.35 cold, 0.42 elsewhere),
  clamped 0.45 s to 2.2x target; cuts snapped to half-beats (60% of cuts, 85% in the climax).
- Sizes by position (cold open CU/MS, intro WS→MS→MCU, climax mixed, escalation varied) and
  moves (mostly static; pushIn, orbit, track, crane sometimes).
- `--seed` for another variation; `--target roblox-page` for a short, unletterboxed page video.

Then fill the skeleton: subjects, angles (cinematics.md), events (animations, VFX, sounds).
Replace the `<BENEFIT>` cards. Run `Cine.analyze` on it.

## 3. Cards and titles

- **≤ 5 words**, on screen **1.5-3 s**; never under 0.83 s or over ~7 s. Reading speed 20
  characters/s for adults (Netflix) + ~0.5 s to settle **[docs, derived]**. `analyze` checks
  `cardWords`, `cardShort`, `cardLong`.
- Say **player benefits**, not features; never put a claim on a card the footage doesn't show
  right after ("see, don't say") **[pro rule, Lieu]**.
- Cine cards (`role = "card"`, `card = { text, font }`, `black = true` for a black background)
  are a ScreenGui overlay: they do **not** appear in `screen_capture`. Check wording and timing
  in the analyze report and in one real-time run.
- Every title or cut to black usually gets a riser + hit/whoosh **[pro rule]**.

## 4. Shots that make a trailer

- **Close-ups feel cinematic** because games are played wide **[pro rule, Lieu]**: use CU/MCU
  more than gameplay does.
- Keep the focal point in roughly the same screen position across fast cuts so the eye doesn't
  hunt **[pro rule]**.
- One idea per shot; HUD off unless the shot is about it; no deaths or damage unless the game is
  about them **[pro rule]**.
- Order the verbs as players meet them for a first trailer (chronological works for beginners)
  **[pro rule]**.
- No novelty transitions. Cuts, a few cuts to black, one fade at the end.

## 5. Recording (what to tell the user)

Cine plays the cut; Studio cannot export video, so the user records it:

1. A LocalScript in `StarterPlayerScripts` (temporary) that waits for the character, then
   `require(game.ReplicatedStorage.Cine).play(require(path.to.CutModule))`. Put the cut in a
   ModuleScript that returns the table.
2. Playtest (or a private server). Hide UI: **Ctrl+Shift+G** core UI, **Ctrl+Shift+C** your
   ScreenGuis, **Ctrl+Shift+B** billboards, **Ctrl+Shift+N** nameplates; hide the cursor
   (`UserInputService.MouseIconEnabled = false`) **[docs]**. Cine's own overlay (letterbox,
   cards) stays.
3. Record with **OBS** or ShadowPlay at **60 fps** minimum; set Roblox's Maximum Framerate to
   120-240 and record high-fps for slow motion and frame-blended motion blur in the editor
   **[docs, derived]**. Graphics quality to max (DOF and shadows depend on it).
4. Record each shot with handles (start the cut a little early with `start`), several takes;
   pros capture 3-5x more footage than they use **[pro rule]**.
5. Edit in any editor: cut to the music, add SFX and the music track, export H.264 1080p
   (Steam: 5,000+ kbps, 30 or 60 fps **[docs]**).

Alternatively the user can free-cam (**Shift+P** in a playtest: scroll changes FOV, Z/C roll)
for handheld gameplay shots **[docs]**, and use Cine for the authored ones.

## 6. Roblox experience-page videos (rules)

Page videos are **gameplay previews, not trailers** **[docs]**:

- Prohibited: cinematic trailers, dramatized gameplay, graphics enhanced beyond what players
  see, real-life footage, voiceover, **music with lyrics**, removed content, promotional claims
  ("50% off").
- Allowed: varied camera angles including Studio's free camera, minor brightness/contrast,
  non-linear highlight reels of real gameplay, in-game UI text, a logo overlay, brief context
  text, music from the Roblox catalog.
- Up to 10 images/videos per page; 3 video uploads per month (rejections count); images 16:9,
  1920x1080, < 3 MB; keep key content away from the bottom edge (player-count overlay).
  VideoFrame uploads (in-experience video) max 30 s, recommended 1080p60 **[docs]**.

So for a page video: `target = "roblox-page"`, no letterbox, a grade within the "minor" range
(or none), real gameplay moments shot with good angles and cut well, catalog music. `analyze`
adds `pageLength` and `pageCinematic` checks. Tell the user the rules exist; a rejected upload
costs one of their three monthly uploads.

## 7. Checklist before handing a trailer plan over

- [ ] Hook readable in the first 3-5 s, muted, no logo first.
- [ ] Sections: intro → escalation (cards between blocks) → climax → stopdown + hit → breath →
      title → button.
- [ ] `analyze`: no `[fix]`; acceleration present; median/mean ≈ 0.5-0.7; beat sync varied.
- [ ] Sizes vary; close-ups present; most shots static; moves motivated and eased.
- [ ] Cards ≤ 5 words, 1.5-3 s, each followed by footage proving it.
- [ ] Every strike filmed from a side that shows it; hitstop on the extended frame.
- [ ] Roblox page target: gameplay only, rules above.
- [ ] Captures checked at hits and the first frame of every section; the user has watched it in
      real time.
