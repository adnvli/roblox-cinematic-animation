-- Example cut: a two-character face-off that ends in one punch (13.6 s). Tested in Studio: analyze is clean
-- (no [fix] / [consider]) and every frame below was captured and checked.
-- Set ROOT to where your two R15 rigs live. Hero faces Villain along a line; for the punch to connect
-- stage them within reach (~3 studs apart between root parts) or add a `move` event before it.
-- Needs ServerStorage.Animations.Cross (recipes/cross.json built with animpro.mjs --out).
--
-- Why each choice (cinematics.md has the rules):
--  * every shot stays on ONE side of the Hero-Villain line (negative yaw on Hero = positive on Villain here),
--    so Hero always looks screen-right and Villain screen-left;
--  * the side was chosen so the PUNCHING arm (Hero's right) faces the camera: from the other side the
--    cross hides behind the body, and a frontal or over-the-shoulder angle foreshortens it into a blob;
--  * strikes read in profile (yaw ~85-90), full shot so the whole body's commitment shows;
--  * hitstop lands on the extended frame (0.28 s into Cross = event t 0.35 + 0.28), not the marker's 0.24:
--    overlap lags the elbow a frame, so the arm is still straightening at 0.24;
--  * sizes go wide -> MCU -> CU (tension) -> full (action) -> CU (reaction) -> wide (aftermath).
local ROOT = "Workspace" -- e.g. "Workspace.Arena"
local HERO, VILLAIN = ROOT .. ".Hero", ROOT .. ".Villain"
return {
	name = "Duel",
	letterbox = 2.39,
	line = { HERO, VILLAIN },
	grade = { contrast = 0.12, saturation = -0.08, tint = { 255, 238, 220 }, bloom = { intensity = 0.7, size = 56, threshold = 0.9 } },
	shots = {
		{ name = "Establish", dur = 3.4, subject = HERO, fadeIn = 0.6,
			camera = { frame = { size = "VWS", yaw = -70, pitch = 12 }, crane = -3, ease = "out" },
			noise = "auto", dof = true },
		{ name = "Villain MCU", dur = 2.1, subject = VILLAIN,
			camera = { frame = { size = "MCU", yaw = 35, pitch = 2 } }, noise = "auto", dof = true },
		{ name = "Hero CU push", dur = 2.3, subject = HERO,
			camera = { frame = { size = "MCU", yaw = -35, pitch = 1 }, to = { size = "CU" }, ease = "inout" },
			noise = "auto", dof = true },
		{ name = "Punch profile", dur = 1.7, subject = HERO,
			camera = { frame = { size = "FS", yaw = -88, pitch = 2, side = "left" } }, noise = "auto",
			events = {
				{ t = 0.35, anim = { rig = HERO, seq = "ServerStorage.Animations.Cross" } },
				{ t = 0.63, hitstop = 0.12 },
				{ t = 0.63, shake = { strength = 0.6, dur = 0.35 } },
			} },
		{ name = "Villain reaction", dur = 1.3, subject = VILLAIN,
			camera = { frame = { size = "CU", yaw = 50, pitch = -3 } }, noise = "auto", dof = true,
			events = { { t = 0, timescale = { scale = 0.35, ramp = 0.1, dur = 0.8 } } } },
		{ name = "Aftermath wide", dur = 2.8, subject = HERO, fadeOut = 0.8,
			camera = { frame = { size = "WS", yaw = -60, pitch = 8 }, to = { size = "VWS", pitch = 14 }, ease = "inout" },
			noise = "auto", dof = true },
	},
}
