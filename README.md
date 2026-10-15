# roblox-cinematic-animation

**A Claude Code skill that makes Claude build pro-level Roblox character animations and cinematics** — through the stock Roblox Studio MCP. By **adn**.

Base Claude guesses at animation and camera work, so it looks stiff and amateur: constant-speed Linear motion, every joint moving on the same frame, frozen holds, punches with no body behind them, FOV 70 on every shot, a camera that never stops gliding, equal shot lengths, jump cuts.

This skill replaces guessing with **measured numbers** (from pro motion capture, fighting-game frame data, Roblox's own animation packs, and film/trailer research), **tools that do the error-prone parts**, and **a loop that makes Claude look at the result** before calling it done.

## What it does

**Character animation**
- `animpro.mjs` — compiles pose JSON into a KeyframeSequence and adds the polish a pro animator does by hand: spline easing, overlap down the arm/neck chains, moving holds (measured drift), breathing, optional spring settle.
- A craft lint that flags what no pass can invent: twinning, hips-still strikes, no anticipation, arm-before-body, short recovery, flat walk bob, straight paths.
- Contact sheet, graph editor and motion-trail images for every animation.
- Tested recipes: cross, heavy slash, combat idle, and a full **11-clip fight set** (slip, body hook, cross-counter, uppercut, haymaker, hit reactions, stagger, knockdown).

**Cinematics & trailers**
- `Cine` — a shot-list player for Studio: shot sizes, real lenses in mm, eased moves, handheld noise, impact shake, depth of field, grade, letterbox, cards, animation/VFX/sound events, hitstop, slow-mo.
- `Cine.analyze` — catches jump cuts, crossing the 180° line, bad eye-line/headroom/lead room, fast pans, uniform shot lengths, no acceleration, wordy cards.
- `cineplan.mjs` — top-down blocking plan + timeline image.
- `trailerplan.mjs` — trailer structure (hook → escalation → climax → title → button) with lognormal, beat-snapped shot lengths, exported as a Cine skeleton.
- Roblox experience-page video rules built in.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- A Roblox Studio MCP (needs `execute_luau` and `screen_capture`)
- Node.js 18+

## Install

macOS / Linux:

```bash
git clone https://github.com/adnvli/roblox-cinematic-animation ~/.claude/skills/roblox-cinematic-animation
```

Windows (PowerShell):

```powershell
git clone https://github.com/adnvli/roblox-cinematic-animation "$env:USERPROFILE\.claude\skills\roblox-cinematic-animation"
```

Restart Claude Code, then check `/skills`. Claude uses it automatically for cutscenes, trailers and animations, or ask for it by name.

## Try it

> Make a 15-second cinematic of two R15 dummies having a fight with real hit reactions.

> Animate a heavy two-handed sword slash for my NPC.

> Plan a 30-second trailer for my game page.

Start from `templates/cine/examples/fight.lua` and `recipes/fight/` for combat scenes.

## Layout

```
SKILL.md                 entry point Claude reads
references/              craft guides (animation, cinematics, trailers) + tools
scripts/                 animpro, trailerplan, cineplan, install (+ TypeScript source)
templates/cine/          Cine player, Capture, example cuts
recipes/                 tested animation JSON (incl. fight set)
```

## License

GNU AGPL v3 — see `LICENSE`. Third-party material and data sources are credited in `NOTICE.md`.
