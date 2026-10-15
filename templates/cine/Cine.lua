--[[
Cine: a shot-list player for Roblox cinematics and trailers.

Install as a ModuleScript at ReplicatedStorage.Cine (beside ReplicatedStorage.VFX.Emit if you use VFX events).
Runs in Studio edit mode (preview + VFXCapture screenshots) and in a LocalScript in play (recording).

  local Cine = require(game.ReplicatedStorage.Cine)
  local handle = Cine.play(cut, { start = 0 })   -- returns a handle: time, duration, finished, setTimeScale, stop, seek
  print(Cine.analyze(cut))                        -- framing / continuity / pacing report (no rendering)
  local json = Cine.analyze(cut, { json = true }) -- data for scripts/cineplan.mjs

A cut (Luau table, or JSON with arrays for vectors):
  {
    name = "Trailer", letterbox = 2.39, music = { id = "rbxassetid://...", bpm = 120, offset = 0.0, volume = 0.6 },
    grade = { contrast = 0.12, saturation = -0.08, tint = {255, 236, 214}, bloom = { intensity = 0.8, size = 56, threshold = 0.9 } },
    line = { "Workspace.Hero", "Workspace.Villain" },   -- action line for the 180-degree check (optional)
    shots = {
      { name = "Hero intro", dur = 2.4, subject = "Workspace.Hero",
        camera = { frame = { size = "MS", yaw = 35, pitch = 4, lens = 50 }, to = { size = "MCU" }, ease = "inout" },
        noise = "auto", dof = true, events = { { t = 0.3, anim = { rig = "Workspace.Hero", seq = "ServerStorage.Animations.Draw" } } } },
      { name = "Title", dur = 2.5, role = "card", card = { text = "CLEAN ALL THE CANDY", style = "title" }, fadeIn = 0.2 },
    },
  }
See references/cinematics.md for every field, the measured numbers behind the defaults, and the workflow.
Adapted conventions: easing names, Cinemachine handheld noise presets (amplitudes in degrees, Hz).
]]

local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Lighting = game:GetService("Lighting")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local Cine = {}
Cine.__index = Cine

-- ---------------------------------------------------------------- utilities
local UP = Vector3.new(0, 1, 0)

local function resolve(spec)
	if typeof(spec) == "Instance" then return spec end
	if type(spec) ~= "string" then return nil end
	local node = game
	for seg in string.gmatch(spec, "[^%.]+") do
		if seg ~= "game" then
			if node == game then
				local ok, svc = pcall(function() return game:GetService(seg) end)
				node = (ok and svc) or game:FindFirstChild(seg)
			else
				node = node and node:FindFirstChild(seg)
			end
		end
	end
	return node
end

local function V3(v)
	if typeof(v) == "Vector3" then return v end
	if type(v) == "table" then return Vector3.new(v[1] or v.x or 0, v[2] or v.y or 0, v[3] or v.z or 0) end
	return nil
end

local function C3(v)
	if typeof(v) == "Color3" then return v end
	if type(v) == "table" then
		local r, g, b = v[1] or 1, v[2] or 1, v[3] or 1
		if r > 1 or g > 1 or b > 1 then return Color3.fromRGB(r, g, b) end
		return Color3.new(r, g, b)
	end
	return Color3.new(1, 1, 1)
end

-- Full-frame 16:9 gate is 36 x 20.25 mm: vertical FOV = 2 atan(10.125 / f).
local function mmToFov(mm) return math.deg(2 * math.atan(10.125 / mm)) end
local function fovToMm(fov) return 10.125 / math.tan(math.rad(fov) / 2) end
Cine.mmToFov, Cine.fovToMm = mmToFov, fovToMm

local EASE = {
	linear = { Enum.EasingStyle.Linear, Enum.EasingDirection.InOut },
	inout = { Enum.EasingStyle.Sine, Enum.EasingDirection.InOut },
	["in"] = { Enum.EasingStyle.Sine, Enum.EasingDirection.In },
	out = { Enum.EasingStyle.Sine, Enum.EasingDirection.Out },
	quadinout = { Enum.EasingStyle.Quad, Enum.EasingDirection.InOut },
	quadout = { Enum.EasingStyle.Quad, Enum.EasingDirection.Out },
	expoout = { Enum.EasingStyle.Exponential, Enum.EasingDirection.Out },
	cubicinout = { Enum.EasingStyle.Cubic, Enum.EasingDirection.InOut },
	backout = { Enum.EasingStyle.Back, Enum.EasingDirection.Out },
}
local function ease(name, a)
	a = math.clamp(a, 0, 1)
	if name == "smooth" then return a * a * a * (a * (a * 6 - 15) + 10) end
	local e = EASE[name or "inout"] or EASE.inout
	return TweenService:GetValue(a, e[1], e[2])
end

-- Shot sizes: frame height as a multiple of the subject's height.
local SIZES = { EWS = 6.0, VWS = 3.0, WS = 1.6, FS = 1.2, MWS = 0.9, MS = 0.62, MCU = 0.42, CU = 0.28, ECU = 0.14 }
Cine.SIZES = SIZES
-- Default lens per size (full-frame mm): wides on wide glass, close-ups on long glass.
local SIZE_LENS = { EWS = 21, VWS = 24, WS = 28, FS = 32, MWS = 35, MS = 40, MCU = 50, CU = 65, ECU = 85 }
-- Depth of field per size: InFocusRadius (studs), FarIntensity.
local SIZE_DOF = { EWS = { 40, 0.03 }, VWS = { 25, 0.05 }, WS = { 12, 0.1 }, FS = { 8, 0.15 }, MWS = { 6, 0.25 }, MS = { 4, 0.35 }, MCU = { 2.5, 0.5 }, CU = { 1.6, 0.6 }, ECU = { 0.9, 0.7 } }

local function sizeOfRatio(r)
	local best, bd = "MS", math.huge
	for name, v in SIZES do
		local d = math.abs(math.log(r / v))
		if d < bd then best, bd = name, d end
	end
	return best
end
Cine.sizeOfRatio = sizeOfRatio

-- Cinemachine handheld noise presets (amplitude deg, frequency Hz), from com.unity.cinemachine/Presets/Noise.
-- Channel value = (Perlin - 0.5) * amplitude, so the peak is about +-amplitude/2.
local NOISE = {
	handheld_tele_mild = { x = { { 4, 0.2 }, { 2, 0.4 }, { 1, 0.7 } }, y = { { 2, 0.15 }, { 2, 0.5 }, { 1, 0.6 } }, z = {} },
	handheld_normal_mild = { x = { { 7, 0.15 }, { 4, 0.8 }, { 1, 1.2 } }, y = { { 5, 0.1 }, { 2, 0.75 }, { 0.8, 1.5 } }, z = {} },
	handheld_wide_mild = { x = { { 12, 0.15 }, { 5, 0.6 }, { 1, 1.5 } }, y = { { 5, 0.1 }, { 4, 0.45 }, { 1, 1.2 } }, z = {} },
	handheld_normal_strong = { x = { { 10, 0.4 }, { 5, 1.44 }, { 3, 2.49 } }, y = { { 10, 0.06 }, { 3, 0.73 }, { 1, 2.0 } }, z = {} },
	handheld_tele_strong = { x = { { 6.19, 0.39 }, { 1.84, 1.75 }, { 2.3, 2.0 } }, y = { { 4, 0.15 }, { 0.5, 0.9 }, { 0.5, 1.4 } }, z = { { 1, 0.1 } } },
	handheld_wide_strong = { x = { { 17.46, 0.5 }, { 12.47, 0.94 }, { 4, 1.2 } }, y = { { 5, 0.25 }, { 4, 0.5 }, { 2, 1.3 } }, z = { { 1, 0.4 } } },
	handheld_normal_extreme = { x = { { 15, 0.2 }, { 5, 0.9 }, { 2, 2.0 } }, y = { { 7, 0.25 }, { 3, 1.0 }, { 1, 0.5 } }, z = {} },
}
Cine.NOISE = NOISE

local function noiseChannel(layers, t, seed, gain)
	local s = 0
	for i, l in layers do
		s += math.noise(t * l[2] + seed * 17.13 + i * 3.7, seed * 1.9 + i, 0.5) * 0.5 * l[1]
	end
	return s * gain
end

local function noisePreset(spec, fov)
	if spec == nil or spec == false or spec == "none" then return nil end
	local gain = 0.5
	local name = spec
	if type(spec) == "table" then
		gain = spec.gain or gain
		name = spec.preset or "auto"
		if spec.x or spec.y then return { p = spec, gain = gain } end
	end
	if name == "auto" or name == true then
		local lens = fov > 45 and "wide" or (fov < 20 and "tele" or "normal")
		name = "handheld_" .. lens .. "_mild"
	elseif name == "strong" then
		local lens = fov > 45 and "wide" or (fov < 20 and "tele" or "normal")
		name = "handheld_" .. lens .. "_strong"
	end
	local p = NOISE[name]
	if not p then return nil end
	return { p = p, gain = gain }
end

-- ---------------------------------------------------------------- subjects
local function subjectInfo(spec, cache)
	local inst = resolve(spec)
	if not inst then return nil end
	local info = { inst = inst }
	if inst:IsA("BasePart") then
		info.anchor = inst
		info.height = cache and cache.height or inst.Size.Y
		info.base = inst.Position - UP * (inst.Size.Y / 2)
		info.eye = inst.Position + UP * (inst.Size.Y * 0.33)
		info.facing = inst.CFrame.LookVector
	elseif inst:IsA("Model") then
		local hum = inst:FindFirstChildOfClass("Humanoid")
		local root = (hum and hum.RootPart) or inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)
		local head = inst:FindFirstChild("Head")
		local height = cache and cache.height
		local bottomOffset = cache and cache.bottomOffset
		if not height then
			local cf, size = inst:GetBoundingBox()
			height = size.Y
			bottomOffset = (root and root.Position.Y or cf.Position.Y) - (cf.Position.Y - size.Y / 2)
		end
		info.anchor = root
		info.height = height
		info.bottomOffset = bottomOffset
		local rp = root and root.Position or inst:GetPivot().Position
		info.base = Vector3.new(rp.X, rp.Y - bottomOffset, rp.Z)
		if head and head:IsA("BasePart") then
			info.eye = head.Position + UP * (head.Size.Y * 0.1)
		else
			info.eye = info.base + UP * (height * 0.9)
		end
		info.facing = root and root.CFrame.LookVector or inst:GetPivot().LookVector
	else
		return nil
	end
	local f = Vector3.new(info.facing.X, 0, info.facing.Z)
	info.facing = f.Magnitude > 1e-4 and f.Unit or Vector3.new(0, 0, -1)
	info.center = info.base + UP * (info.height * 0.5)
	info.top = info.base + UP * info.height
	return info
end
Cine.subjectInfo = subjectInfo

local function pointOf(spec, shotSubject)
	if spec == nil then return nil end
	local v = V3(spec)
	if v and (typeof(spec) == "Vector3" or type(spec[1]) == "number") then return v end
	if type(spec) == "table" and (spec.at or spec.subject) then
		local s = subjectInfo(spec.at or spec.subject)
		if not s then return nil end
		local base = (spec.part == "eye" or spec.part == nil) and s.eye or (spec.part == "center" and s.center or (spec.part == "base" and s.base or s.eye))
		local off = V3(spec.offset) or Vector3.zero
		return base + off
	end
	local s = subjectInfo(spec)
	if s then return s.eye end
	local inst = resolve(spec)
	if inst and inst:IsA("BasePart") then return inst.Position end
	return nil
end

-- ---------------------------------------------------------------- framing
local function viewportAspect(cam)
	local vs = cam and cam.ViewportSize or Vector2.new(1920, 1080)
	if vs.Y < 1 then return 16 / 9 end
	return vs.X / vs.Y
end

-- Camera CFrame and FOV that frame `s` with params p = {size, yaw, pitch, lens|fov, side, height, dist, roll}.
local function framedCFrame(s, p, aspect, letterbox, avoid, excludes)
	local fov = p.fov or mmToFov(p.lens or SIZE_LENS[p.sizeName or "MS"] or 40)
	local visibleFrac = 1
	if letterbox and letterbox > aspect then visibleFrac = aspect / letterbox end
	local frameH = p.ratio * s.height
	local d = frameH / (2 * math.tan(math.rad(fov) / 2) * visibleFrac) * (p.dist or 1)
	local tight = p.ratio < 1
	local P = tight and s.eye or s.center
	local f = s.facing
	local dir = CFrame.fromAxisAngle(UP, math.rad(p.yaw or 0)):VectorToWorldSpace(f)
	local right = dir:Cross(UP)
	if right.Magnitude < 1e-4 then right = Vector3.new(1, 0, 0) end
	dir = CFrame.fromAxisAngle(right.Unit, math.rad(p.pitch or 0)):VectorToWorldSpace(dir)
	local camPos = P + dir * d + UP * (p.height or 0)
	if avoid then
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = excludes or {}
		local hit = workspace:Raycast(P, camPos - P, params)
		if hit then camPos = hit.Position + hit.Normal * 0.4 end
	end
	local base = CFrame.lookAt(camPos, P)
	-- screen placement: sx 0 = left .. 1 = right, sy 0 = top .. 1 = bottom (inside the visible, letterboxed area)
	local camRight = base.RightVector
	local sx = p.side
	if sx == nil or sx == "auto" then
		local lateral = s.facing:Dot(camRight)
		sx = math.abs(lateral) < 0.25 and 0.5 or (lateral > 0 and 1 / 3 or 2 / 3)
	elseif sx == "left" then sx = 1 / 3
	elseif sx == "right" then sx = 2 / 3
	elseif sx == "center" then sx = 0.5 end
	local sy = p.eyeY or (tight and 1 / 3 or 0.55)
	local syFull = 0.5 + (sy - 0.5) * visibleFrac
	local tv = math.tan(math.rad(fov) / 2)
	local th = tv * aspect
	local ax = math.atan((sx - 0.5) * 2 * th)
	local ay = math.atan((0.5 - syFull) * 2 * tv)
	local cf = base * CFrame.Angles(0, ax, 0) * CFrame.Angles(-ay, 0, 0)
	if p.roll and p.roll ~= 0 then cf = cf * CFrame.Angles(0, 0, math.rad(p.roll)) end
	return cf, fov
end
Cine.framedCFrame = framedCFrame

local function frameParams(spec, base)
	spec = spec or {}
	base = base or {}
	local sizeName = spec.size or base.sizeName or "MS"
	local ratio = type(sizeName) == "number" and sizeName or (SIZES[sizeName] or 0.62)
	if type(sizeName) == "number" then sizeName = sizeOfRatio(sizeName) end
	local lens = spec.lens or (spec.fov and fovToMm(spec.fov)) or base.lens or SIZE_LENS[sizeName] or 40
	return {
		sizeName = sizeName, ratio = ratio, lens = lens,
		yaw = spec.yaw or base.yaw or 30, pitch = spec.pitch or base.pitch or 0,
		side = spec.side or base.side, eyeY = spec.eyeY or base.eyeY, height = spec.height or base.height or 0,
		dist = spec.dist or base.dist or 1, roll = spec.roll or base.roll or 0,
	}
end

local function lerpFrame(a, b, e)
	local function L(x, y) return x + (y - x) * e end
	local side = a.side
	if type(a.side) == "number" and type(b.side) == "number" then side = L(a.side, b.side) elseif e > 0.5 then side = b.side end
	local ratio = math.exp(L(math.log(a.ratio), math.log(b.ratio)))
	return {
		sizeName = sizeOfRatio(ratio), ratio = ratio, lens = math.exp(L(math.log(a.lens), math.log(b.lens))),
		yaw = L(a.yaw, b.yaw), pitch = L(a.pitch, b.pitch), side = side,
		eyeY = (a.eyeY and b.eyeY) and L(a.eyeY, b.eyeY) or (a.eyeY or b.eyeY), height = L(a.height, b.height),
		dist = L(a.dist, b.dist), roll = L(a.roll, b.roll),
	}
end

-- centripetal Catmull-Rom through points P[i] at times T[i]
local function catmull(P, T, t)
	local n = #P
	if n == 1 then return P[1] end
	if t <= T[1] then return P[1] end
	if t >= T[n] then return P[n] end
	local k = 1
	while k < n - 1 and T[k + 1] <= t do k += 1 end
	local p1, p2 = P[k], P[k + 1]
	local p0 = P[k - 1] or (p1 + (p1 - p2))
	local p3 = P[k + 2] or (p2 + (p2 - p1))
	local u = (t - T[k]) / math.max(T[k + 1] - T[k], 1e-6)
	local u2, u3 = u * u, u * u * u
	return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
end

-- ---------------------------------------------------------------- compile
local function compile(cut)
	if type(cut) == "string" then cut = HttpService:JSONDecode(cut) end
	local shots, t = {}, 0
	for i, s in cut.shots or {} do
		local dur = s.dur or s.duration or 2
		table.insert(shots, { def = s, index = i, start = t, dur = dur, name = s.name or ("Shot " .. i) })
		t += dur
	end
	return { def = cut, shots = shots, duration = t }
end
Cine.compile = compile

local function shotAt(c, t)
	for i, s in c.shots do
		if t < s.start + s.dur or i == #c.shots then return s, i end
	end
	return c.shots[1], 1
end

-- Evaluate the camera for shot `sh` at shot-local time tau. Returns cf, fov, info.
local function evalCamera(c, sh, tau, aspect, cacheBySubject, useNoise)
	local d = sh.def
	local cam = d.camera or {}
	local u = math.clamp(tau / math.max(sh.dur, 1e-6), 0, 1)
	local subjSpec = d.subject or cam.subject
	local cache = subjSpec and cacheBySubject and cacheBySubject[sh.index] or nil
	local s = subjSpec and subjectInfo(subjSpec, cache) or nil
	if s and cacheBySubject and not cacheBySubject[sh.index] then
		cacheBySubject[sh.index] = { height = s.height, bottomOffset = s.bottomOffset }
	end
	local cf, fov
	local letterbox = c.def.letterbox
	if cam.frame and s then
		local moving = cam.to or cam.orbit or cam.crane or cam.dolly or cam.truck or cam.zoom
		local e = moving and ease(cam.ease or "inout", u) or 0
		local a = frameParams(cam.frame)
		local b = a
		if cam.to then b = frameParams(cam.to, a) end
		local p = moving and lerpFrame(a, b, e) or a
		if cam.orbit then p.yaw += cam.orbit * e end
		if cam.crane then p.height += cam.crane * e end
		if cam.dolly then p.dist *= math.max(0.05, 1 + cam.dolly * e) end
		if cam.zoom then p.lens *= (cam.zoom ^ e) end
		-- follow modes: track (default), lock (camera fixed from shot start), pan (position fixed, re-aims)
		local follow = cam.follow or "track"
		local sNow = s
		if follow ~= "track" and cacheBySubject then
			local key = "start" .. sh.index
			if not cacheBySubject[key] then
				cacheBySubject[key] = { eye = s.eye, center = s.center, base = s.base, top = s.top, facing = s.facing, height = s.height }
			end
			local s0 = cacheBySubject[key]
			if follow == "lock" then sNow = s0 end
			if follow == "pan" then
				local cf0 = framedCFrame(s0, p, aspect, letterbox, cam.avoid ~= false, { s.inst })
				local target = (p.ratio < 1) and s.eye or s.center
				cf = CFrame.lookAt(cf0.Position, target)
				fov = p.fov or mmToFov(p.lens)
			end
		end
		if not cf then
			cf, fov = framedCFrame(sNow, p, aspect, letterbox, cam.avoid ~= false, { s.inst })
		end
	elseif cam.keys then
		local keys = cam.keys
		local T, P, L, F, R = {}, {}, {}, {}, {}
		local defaultFov = cam.fov or (cam.lens and mmToFov(cam.lens)) or 40
		for i, k in keys do
			-- indexed writes: table.insert(t, nil) is a no-op and would shift every later key
			T[i] = k.t or 0
			P[i] = pointOf(k.pos, subjSpec) or V3(k.pos) or Vector3.zero
			L[i] = pointOf(k.look, subjSpec) or (s and s.eye) or Vector3.zero
			F[i] = k.fov or (k.lens and mmToFov(k.lens)) or (k.mm and mmToFov(k.mm)) or defaultFov
			R[i] = k.roll or 0
		end
		local tt = T[1] + (T[#T] - T[1]) * ease(cam.ease or "inout", (T[#T] > T[1]) and math.clamp((tau - T[1]) / (T[#T] - T[1]), 0, 1) or 0)
		local pos = if cam.path == "linear" then nil else catmull(P, T, tt)
		if not pos then
			local k = 1
			while k < #T - 1 and T[k + 1] <= tt do k += 1 end
			local a = (#T > 1) and math.clamp((tt - T[k]) / math.max(T[k + 1] - T[k], 1e-6), 0, 1) or 0
			pos = P[k]:Lerp(P[math.min(k + 1, #P)], a)
		end
		local look = catmull(L, T, tt)
		if cam.lookAt then look = pointOf(cam.lookAt, subjSpec) or look end
		local fovs = F
		local k = 1
		while k < #T - 1 and T[k + 1] <= tt do k += 1 end
		local a = (#T > 1) and math.clamp((tt - T[k]) / math.max(T[k + 1] - T[k], 1e-6), 0, 1) or 0
		local mmA, mmB = fovToMm(fovs[k]), fovToMm(fovs[math.min(k + 1, #fovs)])
		fov = mmToFov(math.exp(math.log(mmA) + (math.log(mmB) - math.log(mmA)) * a))
		local roll = R[k] + (R[math.min(k + 1, #R)] - R[k]) * a
		cf = CFrame.lookAt(pos, look) * CFrame.Angles(0, 0, math.rad(roll))
	elseif cam.cframe then
		cf = typeof(cam.cframe) == "CFrame" and cam.cframe or CFrame.new(table.unpack(cam.cframe))
		fov = cam.fov or (cam.lens and mmToFov(cam.lens)) or 40
	else
		local w = workspace.CurrentCamera
		cf, fov = w.CFrame, w.FieldOfView
	end
	if useNoise then
		local np = noisePreset(d.noise, fov)
		if np then
			local seed = sh.index
			local ct = c._clockForNoise or tau
			local x = noiseChannel(np.p.x or {}, ct, seed, np.gain)
			local y = noiseChannel(np.p.y or {}, ct, seed + 101, np.gain)
			local z = noiseChannel(np.p.z or {}, ct, seed + 202, np.gain)
			cf = cf * CFrame.Angles(math.rad(x), math.rad(y), math.rad(z))
		end
	end
	return cf, fov, { subject = s, u = u }
end

-- ---------------------------------------------------------------- overlay (letterbox, fades, cards)
local function makeOverlay()
	local gui = Instance.new("ScreenGui")
	gui.Name = "CineOverlay"
	gui.IgnoreGuiInset = true
	gui.ResetOnSpawn = false
	gui.DisplayOrder = 1000
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	local function bar(name)
		local f = Instance.new("Frame")
		f.Name = name
		f.BackgroundColor3 = Color3.new(0, 0, 0)
		f.BorderSizePixel = 0
		f.Size = UDim2.new(1, 0, 0, 0)
		f.ZIndex = 5
		f.Parent = gui
		return f
	end
	local top, bottom = bar("Top"), bar("Bottom")
	bottom.AnchorPoint = Vector2.new(0, 1)
	bottom.Position = UDim2.new(0, 0, 1, 0)
	local fade = Instance.new("Frame")
	fade.Name = "Fade"
	fade.BackgroundColor3 = Color3.new(0, 0, 0)
	fade.BorderSizePixel = 0
	fade.Size = UDim2.fromScale(1, 1)
	fade.BackgroundTransparency = 1
	fade.ZIndex = 4
	fade.Parent = gui
	local card = Instance.new("TextLabel")
	card.Name = "Card"
	card.BackgroundTransparency = 1
	card.Size = UDim2.fromScale(0.8, 0.2)
	card.AnchorPoint = Vector2.new(0.5, 0.5)
	card.Position = UDim2.fromScale(0.5, 0.5)
	card.TextScaled = true
	card.Font = Enum.Font.GothamBlack
	card.TextColor3 = Color3.new(1, 1, 1)
	card.TextTransparency = 1
	card.ZIndex = 6
	card.Text = ""
	local cons = Instance.new("UITextSizeConstraint")
	cons.MaxTextSize = 96
	cons.Parent = card
	card.Parent = gui
	local parent
	if RunService:IsRunning() and Players.LocalPlayer then
		parent = Players.LocalPlayer:FindFirstChildOfClass("PlayerGui")
	else
		local ok = pcall(function() gui.Parent = game:GetService("CoreGui") end)
		if ok then parent = gui.Parent end
	end
	if parent then gui.Parent = parent else gui:Destroy() return nil end
	return { gui = gui, top = top, bottom = bottom, fade = fade, card = card }
end

-- ---------------------------------------------------------------- post effects
local function ensureEffect(className, name)
	local e = Lighting:FindFirstChild(name)
	if not e then
		e = Instance.new(className)
		e.Name = name
		e.Parent = Lighting
	end
	return e
end

local function applyGrade(g)
	if not g then return end
	local cc = ensureEffect("ColorCorrectionEffect", "CineGrade")
	cc.Contrast = g.contrast or 0
	cc.Saturation = g.saturation or 0
	cc.Brightness = g.brightness or 0
	cc.TintColor = C3(g.tint)
	if g.bloom then
		local b = ensureEffect("BloomEffect", "CineBloom")
		b.Intensity = g.bloom.intensity or 0.4
		b.Size = g.bloom.size or 24
		b.Threshold = g.bloom.threshold or 0.95
	end
	if g.exposure then Lighting.ExposureCompensation = g.exposure end
end

-- ---------------------------------------------------------------- play
local Handle = {}
Handle.__index = Handle

local function stepAnimators(list, dt)
	if RunService:IsRunning() then return end
	for animator in list do
		pcall(function() animator:StepAnimations(dt) end)
	end
end

local function getAnimator(rig)
	local hum = rig:FindFirstChildOfClass("Humanoid") or rig:FindFirstChildOfClass("AnimationController")
	if not hum then return nil end
	local an = hum:FindFirstChildOfClass("Animator")
	if not an then
		an = Instance.new("Animator")
		an.Parent = hum
	end
	return an
end

local function animationId(spec)
	if spec.id then return spec.id end
	if spec.seq then
		local seq = resolve(spec.seq)
		if seq and seq:IsA("KeyframeSequence") then
			local pid = seq:GetAttribute("PreviewId")
			if not pid then
				local ok, id = pcall(function() return game:GetService("AnimationClipProvider"):RegisterAnimationClip(seq) end)
				if ok then pid = tostring(id); seq:SetAttribute("PreviewId", pid) end
			end
			return pid
		end
	end
	return nil
end

function Handle:_fire(ev, late)
	if ev.anim then
		local rig = resolve(ev.anim.rig)
		local an = rig and getAnimator(rig)
		local id = animationId(ev.anim)
		if an and id then
			local a = Instance.new("Animation")
			a.AnimationId = id
			local ok, track = pcall(function() return an:LoadAnimation(a) end)
			if ok and track then
				track.Looped = ev.anim.looped == true
				-- no fade when starting mid-clip or while paused: a fade never completes if time does not advance
				local fade = (late or self._scale * self._world <= 0) and 0 or (ev.anim.fade or 0.1)
				track:Play(fade, 1, (ev.anim.speed or 1) * self._scale * self._world)
				if late and late > 0 then
					-- the clip loads asynchronously: Length is 0 until it has, and TimePosition set before that is lost
					local startedAt = self.time - late
					task.spawn(function()
						local t0 = os.clock()
						while track.Length <= 0 and os.clock() - t0 < 3 do task.wait() end
						track.TimePosition = math.min((self.time - startedAt) * (ev.anim.speed or 1), math.max(track.Length - 0.01, 0))
					end)
				end
				table.insert(self._tracks, { track = track, speed = ev.anim.speed or 1 })
				self._animators[an] = true
			end
		end
	end
	if ev.vfx then
		local ok, VFX = pcall(function() return require(game:GetService("ReplicatedStorage").VFX.Emit) end)
		local template = resolve(ev.vfx.template)
		if ok and VFX and template then
			local at = ev.vfx.cframe
			if at and typeof(at) ~= "CFrame" then at = CFrame.new(table.unpack(at)) end
			if not at then
				local p = pointOf(ev.vfx.at, nil)
				at = p and CFrame.new(p) or CFrame.new()
			end
			local h = VFX.play(template, at, { timeScale = self._scale * self._world })
			table.insert(self._vfx, h)
		end
	end
	if ev.sound then
		local s = Instance.new("Sound")
		s.SoundId = ev.sound.id
		s.Volume = ev.sound.volume or 0.5
		s.PlaybackSpeed = (ev.sound.speed or 1) * (self._world > 0 and self._world or 1)
		s.Parent = workspace.CurrentCamera
		s:Play()
		if late and late > 0 then s.TimePosition = late end
		table.insert(self._sounds, s)
	end
	if ev.move then
		local inst = resolve(ev.move.part)
		if inst then
			local goal = {}
			local to = ev.move.to
			if typeof(to) == "CFrame" then goal.CFrame = to
			elseif type(to) == "table" and #to == 12 then goal.CFrame = CFrame.new(table.unpack(to))
			else
				-- a point: the part's position or the model's pivot goes there, keeping its rotation
				local p = pointOf(to)
				local rot = inst:IsA("BasePart") and inst.CFrame.Rotation or (inst:IsA("Model") and inst:GetPivot().Rotation) or CFrame.new()
				if p then goal.CFrame = CFrame.new(p) * rot end
			end
			if inst:IsA("Model") then
				local cv = Instance.new("CFrameValue")
				cv.Value = inst:GetPivot()
				cv.Changed:Connect(function(v) inst:PivotTo(v) end)
				local tw = TweenService:Create(cv, TweenInfo.new(ev.move.dur or 1, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), { Value = goal.CFrame })
				tw:Play()
			else
				TweenService:Create(inst, TweenInfo.new(ev.move.dur or 1, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), goal):Play()
			end
		end
	end
	if ev.timescale then
		self._worldTween = { from = self._world, to = ev.timescale.scale or 1, start = self.time, dur = ev.timescale.ramp or 0.15, hold = ev.timescale.dur }
	end
	if ev.hitstop then
		self._hitstopUntil = self.time + ev.hitstop
	end
	if ev.shake then
		table.insert(self._shakes, { start = self.time, strength = ev.shake.strength or ev.shake or 0.5, dur = ev.shake.dur or 0.4 })
	end
	if ev.call then
		task.spawn(ev.call, self)
	end
end

function Handle:_applyWorldScale()
	local w = self._world * self._scale
	for _, t in self._tracks do pcall(function() t.track:AdjustSpeed(t.speed * w) end) end
	for _, h in self._vfx do pcall(function() if not h.finished then h:setTimeScale(w) end end) end
	for _, s in self._sounds do
		pcall(function()
			if w <= 0 then s:Pause() else if not s.IsPlaying then s:Resume() end end
		end)
	end
end

function Handle:setTimeScale(s)
	self._scale = s
	self:_applyWorldScale()
end

function Handle:_step(dt)
	if self.finished then return end
	local cam = workspace.CurrentCamera
	local c = self._c
	local realDt = dt
	dt = dt * self._scale
	self.time += dt
	self._clock += dt
	c._clockForNoise = self._clock
	-- world time (slow motion / hitstop) affects animations, VFX and sounds
	local world = 1
	if self._worldTween then
		local wt = self._worldTween
		local a = math.clamp((self.time - wt.start) / math.max(wt.dur, 1e-3), 0, 1)
		world = wt.from + (wt.to - wt.from) * ease("inout", a)
		if wt.hold and self.time > wt.start + wt.hold then
			self._worldTween = { from = world, to = 1, start = self.time, dur = 0.2 }
		end
	end
	if self._hitstopUntil and self.time < self._hitstopUntil then world = 0 end
	if math.abs(world - self._world) > 1e-3 then self._world = world; self:_applyWorldScale() end
	stepAnimators(self._animators, dt * self._world)
	-- events
	while self._nextEvent <= #self._events and self._events[self._nextEvent].at <= self.time do
		local ev = self._events[self._nextEvent]
		self._nextEvent += 1
		self:_fire(ev.def, self.time - ev.at > 0.05 and (self.time - ev.at) or nil)
	end
	if self.time >= c.duration then
		self:_finish()
		return
	end
	local sh = shotAt(c, self.time)
	local tau = self.time - sh.start
	if sh.index ~= self._shot then
		self._shot = sh.index
		local d = sh.def
		applyGrade(d.grade or self._baseGrade)
		if self._overlay then
			local card = d.card
			self._overlay.card.Text = card and card.text or ""
			self._overlay.card.Font = card and card.font and Enum.Font[card.font] or Enum.Font.GothamBlack
			self._overlay.fade.BackgroundColor3 = (d.fadeColor and C3(d.fadeColor)) or Color3.new(0, 0, 0)
		end
	end
	local cf, fov, info = evalCamera(c, sh, tau, viewportAspect(cam), self._cache, true)
	-- impact shake (trauma squared), on top of handheld noise
	local sx, sy, sz = 0, 0, 0
	for i = #self._shakes, 1, -1 do
		local sk = self._shakes[i]
		local age = self.time - sk.start
		if age > sk.dur then table.remove(self._shakes, i) else
			local trauma = sk.strength * (1 - age / sk.dur)
			local k = trauma * trauma
			sx += math.noise(self._clock * 22, i, 1) * 2.0 * k
			sy += math.noise(self._clock * 22, i, 2) * 2.0 * k
			sz += math.noise(self._clock * 22, i, 3) * 1.0 * k
		end
	end
	if sx ~= 0 or sy ~= 0 then cf = cf * CFrame.Angles(math.rad(sx), math.rad(sy), math.rad(sz)) end
	cam.CameraType = Enum.CameraType.Scriptable
	cam.CFrame = cf
	cam.FieldOfView = math.clamp(fov, 1, 120)
	-- depth of field follows the subject
	local d = sh.def
	if d.dof and info.subject then
		local dof = ensureEffect("DepthOfFieldEffect", "CineDOF")
		local size = (d.camera and d.camera.frame and d.camera.frame.size) or "MS"
		local preset = SIZE_DOF[size] or SIZE_DOF.MS
		local spec = type(d.dof) == "table" and d.dof or {}
		local focusPoint = info.subject.eye
		if spec.focus then
			local p2 = pointOf(spec.focus) or focusPoint
			if spec.at then
				local a = ease("inout", math.clamp((tau - spec.at) / math.max(spec.pull or 0.4, 1e-3), 0, 1))
				focusPoint = focusPoint:Lerp(p2, a)
			else
				focusPoint = p2
			end
		end
		dof.FocusDistance = (cf.Position - focusPoint).Magnitude
		dof.InFocusRadius = spec.radius or preset[1]
		dof.FarIntensity = spec.far or preset[2]
		dof.NearIntensity = spec.near or 0
		dof.Enabled = true
	else
		local dof = Lighting:FindFirstChild("CineDOF")
		if dof then dof.Enabled = false end
	end
	-- overlay
	local o = self._overlay
	if o then
		local vs = cam.ViewportSize
		local lb = c.def.letterbox
		local barH = 0
		if lb and vs.X > 0 and vs.Y > 0 and vs.X / vs.Y < lb then barH = math.floor((vs.Y - vs.X / lb) / 2 + 0.5) end
		o.top.Size = UDim2.new(1, 0, 0, barH)
		o.bottom.Size = UDim2.new(1, 0, 0, barH)
		local fadeA = 1
		if d.fadeIn and tau < d.fadeIn then fadeA = math.min(fadeA, tau / d.fadeIn) end
		if d.fadeOut and tau > sh.dur - d.fadeOut then fadeA = math.min(fadeA, (sh.dur - tau) / d.fadeOut) end
		if d.black then fadeA = 0 end
		if d.flash and tau >= (d.flash.t or 0) and tau < (d.flash.t or 0) + (d.flash.dur or 0.08) then
			o.fade.BackgroundColor3 = C3(d.flash.color or { 1, 1, 1 })
			fadeA = 0
		end
		o.fade.BackgroundTransparency = math.clamp(fadeA, 0, 1)
		if d.card then
			local cin, cout = d.card.fadeIn or 0.2, d.card.fadeOut or 0.25
			local ca = 0
			if tau < cin then ca = 1 - tau / cin elseif tau > sh.dur - cout then ca = 1 - (sh.dur - tau) / cout end
			o.card.TextTransparency = math.clamp(ca, 0, 1)
		else
			o.card.TextTransparency = 1
		end
	end
	if self._onFrame then self._onFrame(self, sh, tau) end
	local _ = realDt
end

function Handle:_finish()
	if self.finished then return end
	self.finished = true
	if self._conn then self._conn:Disconnect() end
	if self._renderName then pcall(function() RunService:UnbindFromRenderStep(self._renderName) end) end
	if self._onDone then task.spawn(self._onDone, self) end
	if self._autoStop then self:stop() end
end

function Handle:stop()
	self.finished = true
	if self._conn then self._conn:Disconnect() end
	if self._renderName then pcall(function() RunService:UnbindFromRenderStep(self._renderName) end) end
	for _, t in self._tracks do pcall(function() t.track:Stop(0) end) end
	if not RunService:IsRunning() then
		-- edit mode: stopped tracks leave their last pose on the joints until the Animator steps again
		for animator in self._animators do
			pcall(function() animator:StepAnimations(1 / 60) end)
			local rig = animator.Parent and animator.Parent.Parent
			if rig then
				for _, j in rig:GetDescendants() do
					-- modern R15 avatars joint with AnimationConstraints, older rigs with Motor6Ds; both carry Transform
					if j:IsA("Motor6D") or j:IsA("AnimationConstraint") then pcall(function() j.Transform = CFrame.identity end) end
				end
			end
		end
	end
	for _, h in self._vfx do pcall(function() h:stop() end) end
	for _, s in self._sounds do pcall(function() s:Destroy() end) end
	if self._music then pcall(function() self._music:Destroy() end) end
	if self._overlay then self._overlay.gui:Destroy() end
	for _, n in { "CineGrade", "CineBloom", "CineDOF" } do
		local e = Lighting:FindFirstChild(n)
		if e then e:Destroy() end
	end
	if self._restoreExposure then Lighting.ExposureCompensation = self._restoreExposure end
	local cam = workspace.CurrentCamera
	cam.FieldOfView = self._restoreFov or 70
	if not RunService:IsRunning() then
		-- edit mode: always hand the editor its normal camera back (an earlier call may have left it Scriptable)
		cam.CameraType = Enum.CameraType.Custom
	elseif self._restoreCameraType then
		cam.CameraType = self._restoreCameraType
	end
	return "stopped"
end

-- Jump to cinematic time t (re-fires the events that should be running at t).
function Handle:seek(t)
	for _, tr in self._tracks do pcall(function() tr.track:Stop(0) end) end
	self._tracks = {}
	self.time = 0
	self._nextEvent = 1
	self._shot = nil
	self:_step(0)
	self.time = t
	self:_step(0)
end

-- options: { start = seconds, timeScale = number, onDone = fn, onFrame = fn(handle, shot, tau), autoStop = true, overlay = true }
function Cine.play(cut, options)
	options = options or {}
	local c = compile(cut)
	local cam = workspace.CurrentCamera
	local self = setmetatable({
		time = 0, duration = c.duration, finished = false, root = nil,
		shots = {}, _c = c, _scale = options.timeScale or 1, _world = 1, _clock = 0,
		_events = {}, _nextEvent = 1, _tracks = {}, _vfx = {}, _sounds = {}, _shakes = {}, _animators = {},
		_cache = {}, _onDone = options.onDone, _onFrame = options.onFrame, _autoStop = options.autoStop ~= false,
		_restoreFov = cam.FieldOfView, _restoreCameraType = cam.CameraType, _restoreExposure = Lighting.ExposureCompensation,
		_baseGrade = c.def.grade,
	}, Handle)
	for _, sh in c.shots do
		table.insert(self.shots, { name = sh.name, start = sh.start, dur = sh.dur })
		for _, ev in sh.def.events or {} do
			table.insert(self._events, { at = sh.start + (ev.t or 0), def = ev })
		end
		if sh.def.shake then table.insert(self._events, { at = sh.start + (sh.def.shake.t or 0), def = { shake = sh.def.shake } }) end
	end
	for _, ev in c.def.events or {} do table.insert(self._events, { at = ev.t or 0, def = ev }) end
	table.sort(self._events, function(a, b) return a.at < b.at end)
	if options.overlay ~= false then self._overlay = makeOverlay() end
	applyGrade(c.def.grade)
	if c.def.music and c.def.music.id then
		local m = Instance.new("Sound")
		m.SoundId = c.def.music.id
		m.Volume = c.def.music.volume or 0.6
		m.Parent = cam
		m.TimePosition = (c.def.music.start or 0) + (options.start or 0)
		m:Play()
		self._music = m
		table.insert(self._sounds, m)
	end
	local start = options.start or 0
	if start > 0 then
		-- fire events that began before `start` so animations/VFX are mid-flight
		self.time = 0
		while self._nextEvent <= #self._events and self._events[self._nextEvent].at <= start do
			local ev = self._events[self._nextEvent]
			self._nextEvent += 1
			self.time = start
			self:_fire(ev.def, start - ev.at)
		end
		self.time = start
	end
	if RunService:IsRunning() and RunService:IsClient() then
		self._renderName = "Cine_" .. HttpService:GenerateGUID(false)
		RunService:BindToRenderStep(self._renderName, Enum.RenderPriority.Camera.Value + 1, function(dt) self:_step(dt) end)
	else
		self._conn = RunService.Heartbeat:Connect(function(dt) self:_step(dt) end)
	end
	self:_step(0)
	return self
end

-- ---------------------------------------------------------------- analyze
local function project(cf, fov, aspect, p)
	local o = cf:PointToObjectSpace(p)
	if o.Z >= -1e-3 then return nil end
	local tv = math.tan(math.rad(fov) / 2)
	local x = (o.X / -o.Z) / (tv * aspect)
	local y = (o.Y / -o.Z) / tv
	return 0.5 + x / 2, 0.5 - y / 2, -o.Z
end

local function fmt(x, d) return string.format("%." .. (d or 2) .. "f", x) end

-- Returns a text report (or JSON with options.json). Positions are read from the place as it is now.
function Cine.analyze(cut, options)
	options = options or {}
	local c = compile(cut)
	local aspect = options.aspect or 16 / 9
	local lb = c.def.letterbox
	local visibleFrac = (lb and lb > aspect) and aspect / lb or 1
	local cache = {}
	local F = {}
	local function add(level, id, msg) table.insert(F, { level = level, id = id, msg = msg }) end
	local shotsOut = {}
	local durations = {}
	for _, sh in c.shots do
		local d = sh.def
		table.insert(durations, sh.dur)
		local rec = { name = sh.name, start = sh.start, dur = sh.dur, role = d.role, samples = {} }
		local subjSpec = d.subject or (d.camera and d.camera.subject)
		local N = math.max(2, math.floor(sh.dur * 30))
		local maxPan, prevLook, prevPos, maxMove = 0, nil, nil, 0
		local fovs = {}
		for i = 0, N do
			local tau = sh.dur * i / N
			local cf, fov, info = evalCamera(c, sh, tau, aspect, cache, false)
			table.insert(fovs, fov)
			if prevLook then
				local a = math.deg(math.acos(math.clamp(prevLook:Dot(cf.LookVector), -1, 1))) / (sh.dur / N)
				maxPan = math.max(maxPan, a)
				maxMove = math.max(maxMove, (cf.Position - prevPos).Magnitude / (sh.dur / N))
			end
			prevLook, prevPos = cf.LookVector, cf.Position
			if i % math.max(1, math.floor(N / 4)) == 0 or i == N then
				local srec = { t = tau, pos = { cf.X, cf.Y, cf.Z }, look = { cf.LookVector.X, cf.LookVector.Y, cf.LookVector.Z }, fov = fov }
				local s = info.subject
				if s then
					local ex, ey = project(cf, fov, aspect, s.eye)
					local _, ty = project(cf, fov, aspect, s.top)
					local _, by = project(cf, fov, aspect, s.base)
					srec.subject = { pos = { s.base.X, s.base.Y, s.base.Z }, facing = { s.facing.X, s.facing.Z }, height = s.height }
					if ex and ty and by then
						-- convert to the visible (letterboxed) frame
						local function vis(y) return (y - 0.5) / visibleFrac + 0.5 end
						srec.eye = { ex, vis(ey) }
						srec.headTop = vis(ty)
						srec.screenHeight = (by - ty) / visibleFrac
						local camRight = cf.RightVector
						srec.facingScreen = s.facing:Dot(camRight)
					else
						srec.offscreen = true
					end
				end
				table.insert(rec.samples, srec)
			end
		end
		rec.maxPan = maxPan
		rec.maxMove = maxMove
		rec.fovMin, rec.fovMax = math.huge, 0
		for _, f in fovs do rec.fovMin = math.min(rec.fovMin, f); rec.fovMax = math.max(rec.fovMax, f) end
		local camDef = d.camera or {}
		rec.moving = (camDef.to or camDef.orbit or camDef.crane or camDef.dolly or camDef.truck or camDef.zoom or (camDef.keys and #camDef.keys > 1)) and true or false
		rec.ease = camDef.ease or "inout"
		-- per-shot checks
		local mid = rec.samples[math.max(1, math.floor(#rec.samples / 2) + 1)]
		if d.role ~= "card" and subjSpec then
			if not mid or mid.offscreen or not mid.eye then
				add("fix", "subjectOffscreen", string.format("%s: the subject is behind or outside the camera at mid-shot.", sh.name))
			else
				local sizeRatio = 1 / math.max(mid.screenHeight, 1e-3)
				rec.size = sizeOfRatio(sizeRatio)
				local ex, ey = mid.eye[1], mid.eye[2]
				if ex < 0.03 or ex > 0.97 or ey < 0.03 or ey > 0.97 then add("fix", "eyesOutOfFrame", string.format("%s: the subject's eyes sit at (%s, %s) of the frame, at the edge or outside.", sh.name, fmt(ex), fmt(ey))) end
				if sizeRatio < 1 and (ey < 0.2 or ey > 0.45) then add("consider", "eyeLine", string.format("%s (%s): eyes at %d%% from the top; standard framing keeps them near one third (28-38%%). Headroom shrinks as shots tighten; eyes stay on the upper third.", sh.name, rec.size, math.floor(ey * 100 + 0.5))) end
				if sizeRatio < 1.3 and mid.headTop and mid.headTop > 0.25 then add("consider", "headroom", string.format("%s (%s): %d%% headroom above the head; tight and medium shots keep it small (eyes on the upper third).", sh.name, rec.size, math.floor(mid.headTop * 100))) end
				if mid.facingScreen and math.abs(mid.facingScreen) > 0.35 then
					local shortSided = (mid.facingScreen > 0 and ex > 0.58) or (mid.facingScreen < 0 and ex < 0.42)
					if shortSided and not d.shortSided then add("consider", "leadRoom", string.format("%s: the subject faces toward the near edge (short-sided). Put more space in front of the gaze or motion than behind; short-siding is a deliberate signal of unease (set shortSided = true if meant).", sh.name)) end
				end
			end
		end
		if rec.fovMax >= 62 and d.role ~= "card" then add("consider", "defaultFov", string.format("%s: FOV %d is a ~%dmm ultra-wide (Roblox's default 70 = 14.5mm). Cinematic coverage lives between FOV ~46 (24mm) and ~9 (135mm); close-ups at FOV 14-23 (50-85mm).", sh.name, math.floor(rec.fovMax), math.floor(fovToMm(rec.fovMax)))) end
		local hfov = math.deg(2 * math.atan(math.tan(math.rad(rec.fovMin) / 2) * aspect))
		if maxPan > 0 and not d.whip then
			local cross = hfov / maxPan
			if cross < 2.0 then add("consider", "fastPan", string.format("%s: the view pans %d deg/s, crossing the frame in %s s. Smooth pans take >= 7 s per frame width at 24 fps (~3.5 s at 60); faster reads as judder unless it is a deliberate whip (whip = true).", sh.name, math.floor(maxPan), fmt(cross, 1))) end
		end
		if rec.moving and rec.ease == "linear" and not d.cutIn and not d.cutOut then add("consider", "linearMove", string.format("%s: a linear camera move that starts and stops on screen. Ease moves that begin and end in the shot (inout); use out when the move starts on a cut, in when it ends on one, linear only for constant tracking cut on both ends.", sh.name)) end
		if d.card then
			local words = 0
			for _ in string.gmatch(d.card.text or "", "%S+") do words += 1 end
			local chars = #(d.card.text or "")
			local need = math.max(0.83, chars / 20) + 0.5
			if words > 5 then add("consider", "cardWords", string.format("%s: card has %d words; keep cards to 5 words or fewer.", sh.name, words)) end
			if sh.dur > 3.5 and sh.dur > need + 1.5 then add("consider", "cardLong", string.format("%s: card held %s s; ~%s s reads it (20 chars/s + settle). Cards over ~3 s stall a trailer.", sh.name, fmt(sh.dur, 1), fmt(need, 1))) end
			if sh.dur < need then add("fix", "cardShort", string.format("%s: card held %s s, too short to read (%d chars needs ~%s s).", sh.name, fmt(sh.dur, 1), chars, fmt(need, 1))) end
		end
		if sh.dur < 3 / 30 then add("fix", "flashFrame", string.format("%s lasts %s s (under 3 frames): a flash frame.", sh.name, fmt(sh.dur, 3))) end
		table.insert(shotsOut, rec)
	end
	-- continuity between consecutive shots on the same subject
	for i = 2, #c.shots do
		local a, b = c.shots[i - 1].def, c.shots[i].def
		local sa, sb = shotsOut[i - 1], shotsOut[i]
		local subjA, subjB = a.subject or (a.camera and a.camera.subject), b.subject or (b.camera and b.camera.subject)
		if subjA and subjA == subjB and sa.samples[#sa.samples].subject and sb.samples[1].subject then
			local pa, pb = sa.samples[#sa.samples], sb.samples[1]
			local s = Vector3.new(table.unpack(pb.subject.pos))
			local ca, cb = Vector3.new(table.unpack(pa.pos)), Vector3.new(table.unpack(pb.pos))
			local da, db = (ca - s) * Vector3.new(1, 0, 1), (cb - s) * Vector3.new(1, 0, 1)
			local yaw = (da.Magnitude > 1e-3 and db.Magnitude > 1e-3) and math.deg(math.acos(math.clamp(da.Unit:Dot(db.Unit), -1, 1))) or 0
			local ha, hb = pa.screenHeight or 1, pb.screenHeight or 1
			local ratio = math.max(ha, hb) / math.max(math.min(ha, hb), 1e-3)
			if yaw < 30 and ratio < 1.4 and not b.jumpCut then add("fix", "jumpCut", string.format("%s -> %s: same subject, camera moved only %d deg and the size changed only %sx. Change the angle by >= 30 deg or the size by >= ~1.5x (wide -> medium), or it reads as a jump cut.", sa.name, sb.name, math.floor(yaw), fmt(ratio, 2))) end
		end
		-- 180-degree rule
		local line = b.line or a.line or c.def.line
		if line and not b.crossLine then
			local A, B = pointOf(line[1]), pointOf(line[2])
			if A and B then
				local axis = (B - A) * Vector3.new(1, 0, 1)
				local function side(rec)
					local p = Vector3.new(table.unpack(rec.samples[math.max(1, math.floor(#rec.samples / 2) + 1)].pos))
					local v = (p - A) * Vector3.new(1, 0, 1)
					local cr = axis.X * v.Z - axis.Z * v.X
					if math.abs(cr) / math.max(axis.Magnitude * v.Magnitude, 1e-3) < 0.17 then return 0 end
					return cr > 0 and 1 or -1
				end
				local s1, s2 = side(sa), side(sb)
				if s1 ~= 0 and s2 ~= 0 and s1 ~= s2 then add("fix", "crossedLine", string.format("%s -> %s: the camera crosses the action line between the two subjects (180-degree rule), flipping screen direction. Stay on one side, cut through a neutral on-axis shot, or set crossLine = true if deliberate.", sa.name, sb.name)) end
			end
		end
	end
	-- pacing
	local content = {}
	for i, sh in c.shots do if sh.def.role ~= "card" and sh.def.role ~= "title" and sh.def.role ~= "button" then table.insert(content, sh.dur) end end
	local function mean(t) local s = 0 for _, v in t do s += v end return #t > 0 and s / #t or 0 end
	local function med(t) local u = table.clone(t) table.sort(u) return #u > 0 and u[math.floor(#u / 2) + 1] or 0 end
	local asl, md = mean(content), med(content)
	local sd = 0
	for _, v in content do sd += (v - asl) ^ 2 end
	sd = #content > 0 and math.sqrt(sd / #content) or 0
	add("info", "pacing", string.format("%d shots, %s s. Content shots: ASL %s s, median %s s (median/mean %s), CV %s. References: theatrical trailers ~1.9 s/shot (0.54 shots/s, 288 trailers), modern blockbuster trailers ~1.4 s; game trailers 1.3 s (AAA) to 2.6-4.25 s (clear indie gameplay); films' median shot is ~half their mean (lognormal).", #c.shots, fmt(c.duration, 1), fmt(asl), fmt(md), fmt(md / math.max(asl, 1e-3)), fmt(sd / math.max(asl, 1e-3))))
	local run = 1
	for i = 2, #content do
		if math.abs(content[i] - content[i - 1]) < 0.06 then run += 1 else run = 1 end
		if run == 3 then add("fix", "uniformShots", "Three or more consecutive shots have the same length. Shot lengths should vary (a few long holds, many short shots); never cut at a fixed interval.") end
	end
	if #content >= 6 then
		local third = math.floor(#content / 3)
		local first, last = {}, {}
		for i = 1, third do table.insert(first, content[i]) end
		for i = #content - third + 1, #content do table.insert(last, content[i]) end
		local a1, a3 = mean(first), mean(last)
		if a3 >= a1 * 0.85 then add("consider", "noAcceleration", string.format("The last third averages %s s per shot vs %s s in the first third. Trailers accelerate into the climax (shots shorten sharply), then breathe (~5 s) before the title.", fmt(a3), fmt(a1))) end
	end
	local sizes, moving, total = {}, 0, 0
	for _, r in shotsOut do
		if r.size then sizes[r.size] = true end
		if r.role ~= "card" then total += 1; if r.moving then moving += 1 end end
	end
	local nsizes = 0
	for _ in sizes do nsizes += 1 end
	if total >= 4 and nsizes < 3 then add("consider", "sizeVariety", string.format("Only %d shot size(s) used. Vary between wide, medium and close; scenes open wide, move closer, and pull back at the end.", nsizes)) end
	if total >= 4 then
		local frac = moving / total
		if frac > 0.85 then add("consider", "alwaysMoving", string.format("%d%% of shots move the camera. Locked-off shots give moves their power (films: 6-16%% moving shots); every move needs a motive: follow, reveal, or change size.", math.floor(frac * 100))) end
	end
	if c.def.music and c.def.music.bpm then
		local bpm, off = c.def.music.bpm, c.def.music.offset or 0
		local beat = 60 / bpm
		local onBeat, onBar, cuts = 0, 0, 0
		for i = 2, #c.shots do
			local t = c.shots[i].start
			cuts += 1
			local k = (t - off) / beat
			if math.abs(k - math.floor(k + 0.5)) * beat < 1 / 30 then
				onBeat += 1
				if math.floor(k + 0.5) % 4 == 0 then onBar += 1 end
			end
		end
		if cuts > 0 then
			add("info", "beatSync", string.format("%d of %d cuts land on a beat (%d on bar downbeats) at %d BPM.", onBeat, cuts, onBar, bpm))
			if onBeat == 0 then add("consider", "offBeat", "No cut lands on the music. Land key cuts on beats and accents (vary it: secondary beats, in-shot motion on accents).") end
			if onBar == cuts and cuts >= 4 then add("consider", "everyBar", "Every cut lands on a bar downbeat: predictable. Cut on secondary beats and on actions, and sync in-shot motion to accents.") end
		end
	end
	if c.def.target == "roblox-page" then
		if c.duration > 30 then add("consider", "pageLength", "Roblox experience-page videos: keep it short (forum reports a 30-60 s cap; VideoFrame uploads max 30 s).") end
		if lb then add("consider", "pageCinematic", "Experience-page videos must show real gameplay: no cinematic trailers, voiceover, lyrics or visuals beyond what players see. Letterboxed cinematic framing may be rejected.") end
	end
	if options.json then
		local function rnd(v)
			if type(v) == "number" then return math.floor(v * 1000 + 0.5) / 1000 end
			if type(v) == "table" then local o = {} for k, x in v do o[k] = rnd(x) end return o end
			return v
		end
		local linePts = nil
		if c.def.line then
			local A, B = pointOf(c.def.line[1]), pointOf(c.def.line[2])
			if A and B then linePts = { { A.X, A.Z }, { B.X, B.Z } } end
		end
		return HttpService:JSONEncode(rnd({ name = c.def.name, duration = c.duration, letterbox = lb, line = linePts, shots = shotsOut, findings = F }))
	end
	local lines = { string.format("CINE ANALYZE %s (%s s, %d shots)", tostring(c.def.name or ""), fmt(c.duration, 1), #c.shots) }
	for _, r in shotsOut do
		table.insert(lines, string.format("  %-18s %5.2f s  %-4s fov %d-%d%s pan %d deg/s", string.sub(r.name, 1, 18), r.dur, r.size or "-", math.floor(r.fovMin), math.floor(r.fovMax), r.moving and " moving" or " static", math.floor(r.maxPan)))
	end
	for _, f in F do table.insert(lines, string.format("[%s] %s: %s", f.level, f.id, f.msg)) end
	return table.concat(lines, "\n")
end

return Cine
