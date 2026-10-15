-- FIGHT: a 15.7 s choreographed exchange (tested in Studio). Uses recipes/fight/* built with animpro --out
-- into ReplicatedStorage.CineDemo.Animations (change A below to where yours live). See recipes/fight/README.md.
local W = "Workspace.CineDemo."
local HERO, VILLAIN = W .. "Hero", W .. "Villain"
local A = "ReplicatedStorage.CineDemo.Animations."
local GAP = 3.6

local function stage()
	local hero, villain = workspace.CineDemo.Hero, workspace.CineDemo.Villain
	local y = hero:GetPivot().Y
	hero:PivotTo(CFrame.lookAt(Vector3.new(-GAP / 2, y, 0), Vector3.new(10, y, 0)))
	villain:PivotTo(CFrame.lookAt(Vector3.new(GAP / 2, y, 0), Vector3.new(-10, y, 0)))
end
local function shift(name, studs)
	return function() local m = workspace.CineDemo[name]; m:PivotTo(m:GetPivot() + Vector3.new(studs, 0, 0)) end
end
local function stopIdle(name)
	return function()
		local an = workspace.CineDemo[name].Humanoid:FindFirstChildOfClass("Animator")
		for _, t in an:GetPlayingAnimationTracks() do if t.Priority == Enum.AnimationPriority.Idle then t:Stop(0.15) end end
	end
end
local function anim(rig, name, extra)
	local a = { rig = rig, seq = A .. name }
	for k, v in extra or {} do a[k] = v end
	return a
end

return {
	name = "Fight", letterbox = 2.39, line = { HERO, VILLAIN },
	grade = { contrast = 0.16, saturation = -0.1, tint = { 255, 236, 214 }, bloom = { intensity = 0.8, size = 56, threshold = 0.88 } },
	events = {
		{ t = 0, call = stage },
		{ t = 0.01, anim = anim(HERO, "CombatIdle", { looped = true, fade = 0 }) },
		{ t = 0.01, anim = anim(VILLAIN, "CombatIdle", { looped = true, fade = 0, speed = 0.93 }) },
		{ t = 2.50, anim = anim(VILLAIN, "VillainHaymaker", { fade = 0.08 }) },
		{ t = 2.78, anim = anim(HERO, "HeroSlip", { fade = 0.06 }) },
		{ t = 3.85, anim = anim(HERO, "HeroBodyHook", { fade = 0.05 }) },
		{ t = 4.10, anim = anim(VILLAIN, "VillainHitBody", { fade = 0.02 }) },
		{ t = 4.10, hitstop = 0.07 },
		{ t = 4.10, shake = { strength = 0.45, dur = 0.3 } },
		{ t = 6.00, anim = anim(VILLAIN, "VillainJab", { fade = 0.04 }) },
		{ t = 5.90, anim = anim(HERO, "Cross", { fade = 0.04 }) },
		{ t = 6.18, anim = anim(VILLAIN, "VillainHitHead", { fade = 0.02 }) },
		{ t = 6.18, hitstop = 0.1 },
		{ t = 6.18, shake = { strength = 0.7, dur = 0.35 } },
		{ t = 7.39, call = shift("Villain", 0.9) },
		{ t = 8.05, anim = anim(HERO, "HeroStepIn", { fade = 0.05 }) },
		{ t = 8.67, call = shift("Hero", 0.9) },
		{ t = 8.95, anim = anim(HERO, "HeroUppercut", { fade = 0.05 }) },
		{ t = 9.30, timescale = { scale = 0.25, ramp = 0.06, dur = 1.3 } },
		{ t = 9.33, anim = anim(VILLAIN, "VillainKnockdown", { fade = 0.02 }) },
		{ t = 9.33, call = stopIdle("Villain") },
		{ t = 9.33, hitstop = 0.12 },
		{ t = 9.33, shake = { strength = 0.95, dur = 0.5 } },
		{ t = 12.35, anim = anim(VILLAIN, "VillainDowned", { looped = true, fade = 0.25 }) },
	},
	shots = {
		{ name = "Standoff", dur = 2.5, subject = HERO, fadeIn = 0.5, camera = { frame = { size = "VWS", yaw = -75, pitch = 10 }, crane = -2.5, orbit = 8, ease = "out" }, noise = "auto", dof = true },
		{ name = "Telegraph", dur = 0.5, subject = VILLAIN, camera = { frame = { size = "MWS", yaw = 82, pitch = 5 } }, noise = "auto", dof = true },
		{ name = "Slip", dur = 0.95, subject = HERO, camera = { frame = { size = "FS", yaw = -88, pitch = 2, side = "left" } }, noise = "auto" },
		{ name = "Body shot", dur = 1.15, subject = VILLAIN, camera = { frame = { size = "MWS", yaw = 88, pitch = -10, side = "center" } }, noise = "auto", dof = true },
		{ name = "Square up", dur = 0.8, subject = HERO, camera = { frame = { size = "MS", yaw = -50, pitch = 2 } }, noise = "auto", dof = true },
		{ name = "Cross-counter", dur = 0.6, subject = HERO, camera = { frame = { size = "FS", yaw = -95, pitch = 0, side = "left" } }, noise = "auto", flash = { t = 0.28, dur = 0.05 } },
		{ name = "Head snap", dur = 1.25, subject = VILLAIN, camera = { frame = { size = "MS", yaw = 72, pitch = 0 }, to = { size = "MWS" }, ease = "out" }, noise = "strong", dof = true },
		{ name = "Reset", dur = 1.0, subject = HERO, camera = { frame = { size = "WS", yaw = -60, pitch = 6, side = "left" } }, noise = "auto", dof = true },
		{ name = "Load", dur = 0.55, subject = HERO, camera = { frame = { size = "CU", yaw = -20, pitch = -8 } }, noise = "auto", dof = true },
		{ name = "Uppercut", dur = 3.0, subject = HERO, camera = { frame = { size = "WS", yaw = -84, pitch = -12, side = "left" }, to = { size = 1.9 }, ease = "inout" }, noise = "auto", flash = { t = 0.0, dur = 0.05 } },
		{ name = "Aftermath", dur = 3.4, subject = HERO, fadeOut = 1.0, camera = { frame = { size = "WS", yaw = -40, pitch = 18, eyeY = 0.25 }, to = { size = "VWS", pitch = 30, eyeY = 0.22 }, ease = "inout" }, noise = "auto", dof = true },
	},
}
