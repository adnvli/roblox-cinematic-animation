# Notice

**roblox-cinematic-animation** by adn. Free and open source under the GNU AGPL v3 (`LICENSE`).

## Third-party material

- `references/playback.md` is based on TabooHarmony/roblox-brain 2.2.0, MIT licence
  (`LICENSE-roblox-brain.txt`).

## Data sources

- **Bandai Namco Research Motion Dataset** 1 and 2 (CC BY-NC 4.0),
  https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset,
  © 2022 Bandai Namco Research Inc. Paper: "Motion Capture Dataset for Practical Use of AI-based
  Motion Editing and Stylization". This skill contains **no motion data**, only aggregate
  statistics measured from it (medians, ranges, timings in `animation-measured-tables.md`,
  `animation-craft.md` and the default amplitudes in `animpro.mjs`). The dataset licence is
  non-commercial: keep that in mind before using this skill commercially.
- **Roblox animation packs**: timings and ranges measured read-only in Studio (no animation data
  included).
- **Unity Cinemachine** noise preset values (`com.unity.cinemachine/Presets/Noise`, Unity
  Companion License): numeric amplitudes and frequencies only, in `Cine.lua`.
- Published research and practitioner sources cited by tag in the references, chiefly:
  Cutting, DeLong & Brunick 2011 and Cutting 2016 (film pacing); Salt (Cinemetrics, shot-length
  distributions); Hecht & Kalkofen 2009 (cut gaps); Stephen Follows (shot counts, trailer
  lengths); Tilburg University trailer corpus (288 trailers); Derek Lieu (game trailer
  editing); Dmytryk, Murch (editing); RED (pan speed); Netflix timed-text guide (reading speed);
  Steamworks and Roblox Creator Docs; SF6, Tekken 8, Guilty Gear Strive and Smash Ultimate frame
  data (ultimateframedata.com, tekkendocs.com, dustloop.com, ssbwiki.com); Jonathan Cooper (Game
  Anim); Richard Williams; clinical gait references (AAPM&R, physio-pedia). The numbers are
  quoted as facts with attribution; no text is reproduced at length.

Not affiliated with or endorsed by Roblox Corporation, Unity or Bandai Namco.
