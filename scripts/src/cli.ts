import { readFileSync, writeFileSync } from 'fs';
import { prepareAnimation, compactChecks } from '<adn checkout>/packages/core/src/animation/animation-tool.ts';
import { checkMotion } from '<adn checkout>/packages/core/src/animation/motion-checks.ts';
import { renderContactSheet } from '<adn checkout>/packages/core/src/animation/contact-sheet.ts';
import { rigFor } from '<adn checkout>/packages/core/src/animation/rigs.ts';
import { rigFromModel } from '<adn checkout>/packages/core/src/animation/model-rig.ts';
import { bake, reduceKeys, toSequence, type PolishOptions } from './polish.ts';
import { lint } from './lint.ts';
import { graphSheet, trailSheet } from './charts.ts';

const USAGE = `usage: node animpro.mjs <animation.json> [options]

Compiles a pose-format animation (references/character-animation.md), applies the pro passes
(spline, overlap, optional settle springs, moving holds, breathing), bakes to dense Linear keys,
reduces them, runs adn's motion checks plus the craft lint, and writes sheets and Luau.

  --locomotion | --grounded     motion checks for gaits / standing actions
  --waive id,id                 accept failing adn checks on purpose
  --rig-json reading.json       a creature or custom rig read with scripts/read_rig.lua
  --raw                         no pro passes: compile and check as authored (adn behaviour)
  --fps N                       bake rate (default 30)
  --no-spline                   keep Roblox easing between keys
  --overlap off|on              child-joint lag down the arm/neck chains (default on)
  --settle off|light|medium|strong   spring overshoot/settle on wrists, neck, props (default off)
  --life X                      moving-hold drift multiplier: 0 off, 0.5 calm, 1 default, 2 restless
  --breathe                     add a breathing layer (default for loops named *idle*)
  --tolerance DEG               key reduction tolerance (default 0.3)
  --sheet f.png  --graph f.png  --trails f.png   contact sheet, graph editor, motion trails
  --out f.lua [--parent game.ServerStorage]      Luau that builds the KeyframeSequence (run with execute_luau)
  --json f.json                 full report
The JSON may carry "pro": { fps, spline, overlap (bool or {Joint: frames}), settle (preset or {Joint: {f, z}}),
life, breathe (bool or {period, amp}), tolerance } instead of flags. Flags win.
Exit: 0 all checks pass and no lint 'fix' findings; 3 checks or fixes outstanding; 1 refused.`;

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith('-')) { console.error(USAGE); process.exit(2); }
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n: string) => args.includes(n);
let anim: any;
try { anim = JSON.parse(readFileSync(args[0], 'utf8')); } catch (e) { console.error(`Could not read ${args[0]}: ${(e as Error).message}`); process.exit(1); }
const pro = anim.pro ?? {}; delete anim.pro;

let model: any;
const rigJson = opt('--rig-json');
if (rigJson) {
  const reading = JSON.parse(readFileSync(rigJson, 'utf8')); const r = rigFromModel(reading);
  if (!r.ok) { console.log(JSON.stringify({ ok: false, errors: r.errors }, null, 2)); process.exit(1); }
  model = r.rig; anim.rig = reading.path;
}
const locomotion = flag('--locomotion'), grounded = flag('--grounded');
const waive = opt('--waive')?.split(',');
const prep = prepareAnimation(anim, { locomotion, grounded, waive }, model);
if (!prep.ok) { console.log(JSON.stringify({ ok: false, errors: prep.errors }, null, 2)); process.exit(1); }
const compiled = prep.value.sequence as any; const rig = model ?? rigFor(compiled.rig);

// ---- options
const raw = flag('--raw');
const fps = Number(opt('--fps') ?? pro.fps ?? 30);
const spline = raw ? false : flag('--no-spline') ? false : pro.spline !== false;
const ovFlag = opt('--overlap'); const overlapOn = raw ? false : ovFlag ? ovFlag !== 'off' : pro.overlap !== false;
const settleArg = opt('--settle') ?? (typeof pro.settle === 'string' ? pro.settle : undefined) ?? 'off';
const life = raw ? 0 : Number(opt('--life') ?? pro.life ?? 1);
const isIdle = /idle/i.test(compiled.name);
const breatheOn = raw ? false : flag('--breathe') || pro.breathe === true || typeof pro.breathe === 'object' || (pro.breathe === undefined && isIdle && compiled.loop);
const breathe = breatheOn ? { period: pro.breathe?.period ?? 4, amp: pro.breathe?.amp ?? 0.8 } : null;
const tol = Number(opt('--tolerance') ?? pro.tolerance ?? 0.3);

const jointPart = new Map<string, string>(rig.joints.map((j: any) => [j.name, j.childPart]));
const childrenOf = (part: string): string[] => rig.joints.filter((j: any) => j.parentPart === part).flatMap((j: any) => [j.childPart, ...childrenOf(j.childPart)]);
// explicit easing (segments that keep Roblox easing)
const explicitSet = new Set<string>();
for (const kf of anim.keyframes ?? []) {
  if (kf.easing) for (const p of jointPart.values()) explicitSet.add(`${p}@${kf.time}`);
  for (const [j, pose] of Object.entries<any>(kf.joints ?? {})) if (pose && pose.easing) { const p = jointPart.get(j); if (p) explicitSet.add(`${p}@${kf.time}`); }
}
const explicit = (part: string, t: number) => explicitSet.has(`${part}@${Math.round(t * 1e4) / 1e4}`) || explicitSet.has(`${part}@${t}`);
// lags (seconds)
const lags: Record<string, number> = {};
const R15LAG: Record<string, number> = { Neck: 1, LeftElbow: 1, RightElbow: 1, LeftWrist: 2, RightWrist: 2, Weapon: 2, OffHand: 2 };
const R6LAG: Record<string, number> = { Neck: 1 };
const excluded = new Set<string>();
for (const kf of anim.keyframes ?? []) for (const [j, pose] of Object.entries<any>(kf.joints ?? {})) if (pose && (pose.aimAt || pose.grip)) { const p = jointPart.get(j); if (p) { excluded.add(p); childrenOf(p).forEach((c) => excluded.add(c)); } }
if (overlapOn) {
  const table: Record<string, number> = typeof pro.overlap === 'object' ? pro.overlap : compiled.rig === 'R15' ? R15LAG : compiled.rig === 'R6' ? R6LAG : {};
  for (const [j, f] of Object.entries(table)) { const p = jointPart.get(j); if (p && !excluded.has(p)) lags[p] = Number(f) / 30; }
}
const PRESET: Record<string, { f: number; z: number }> = { light: { f: 7, z: 0.75 }, medium: { f: 5, z: 0.55 }, strong: { f: 3.5, z: 0.4 } };
const springs: Record<string, { f: number; z: number }> = {};
if (!raw) {
  if (typeof pro.settle === 'object' && !opt('--settle')) { for (const [j, s] of Object.entries<any>(pro.settle)) { const p = jointPart.get(j); if (p) springs[p] = s; } }
  else if (PRESET[settleArg]) for (const j of ['Neck', 'LeftWrist', 'RightWrist', 'Weapon', 'OffHand']) { const p = jointPart.get(j); if (p && !excluded.has(p)) springs[p] = PRESET[settleArg]; }
}
const maxLag = Math.max(0, ...Object.values(lags));
const tail = compiled.loop ? 0 : maxLag + (Object.keys(springs).length ? 0.35 : 0);

const markers: { time: number; name: string; value: string }[] = [];
for (const kf of compiled.keyframes) for (const m of kf.markers ?? []) markers.push({ time: kf.time, name: m.name, value: m.value ?? '' });

const popt: PolishOptions = { fps, spline, loop: compiled.loop, duration: compiled.duration, lags, springs, life, breathe, explicit, tailSeconds: tail };
const baked = bake(compiled, rig, popt);
const keep = new Map<string, number[]>();
let keyCount = 0;
for (const [part, d] of baked.parts) {
  const moving = d.q.some((q, i) => i && Math.abs(q[0] - d.q[0][0]) + Math.abs(q[1] - d.q[0][1]) + Math.abs(q[2] - d.q[0][2]) > 1e-5) || d.p.some((p) => Math.abs(p[0] - d.p[0][0]) + Math.abs(p[1] - d.p[0][1]) + Math.abs(p[2] - d.p[0][2]) > 1e-5);
  const ks = moving ? reduceKeys(d, baked.times, tol, 0.003) : [0, baked.times.length - 1];
  keep.set(part, ks); keyCount += ks.length;
}
const seq = toSequence(baked, rig, keep, compiled.loop, markers);
const report = checkMotion(seq as any, { locomotion, grounded }, rig);
const failing = report.checks.filter((c) => c.status === 'fail').map((c) => c.id).filter((id) => !(waive ?? []).includes(id));
const authoredTimes = (anim.keyframes ?? []).map((k: any) => k.time);
const linearDefaultKeys = (anim.keyframes ?? []).filter((k: any) => !k.easing && !anim.easing && !Object.values<any>(k.joints ?? {}).some((p) => p?.easing)).length;
const L = lint(baked, rig, { locomotion, authoredTimes, linearDefaultKeys, spline, groundSpeed: report.groundSpeed, loop: compiled.loop });
const fixes = L.findings.filter((f) => f.level === 'fix');

const summary: any = {
  ok: failing.length === 0 && fixes.length === 0, name: compiled.name, rig: compiled.rig, loop: compiled.loop, priority: compiled.priority,
  authoredDuration: compiled.duration, bakedDuration: Math.round(baked.duration * 1000) / 1000,
  passes: raw ? 'raw' : { spline, overlapFrames30: Object.fromEntries(Object.entries(lags).map(([k, v]) => [k, Math.round(v * 30)])), settle: Object.keys(springs).length ? springs : 'off', life, breathe, fps, overlapExcluded: [...excluded] },
  bakedKeys: seq.keyframes.length, poseKeys: keyCount, markers: markers.length, groundSpeed: report.groundSpeed,
  failing, checks: compactChecks(report),
  lint: L.findings.map((f) => ({ [f.level]: f.id, message: f.message })), measured: L.measured,
};
const title = `${compiled.name} (${compiled.rig}) ${raw ? 'RAW' : 'PRO'} ${baked.duration.toFixed(2)}S`;
if (opt('--sheet')) { const s = renderContactSheet(seq as any, undefined, { locomotion, rig }); writeFileSync(opt('--sheet')!, s.png); summary.sheet = opt('--sheet'); }
if (opt('--graph')) { writeFileSync(opt('--graph')!, graphSheet(baked, rig, authoredTimes, title)); summary.graph = opt('--graph'); }
if (opt('--trails')) { writeFileSync(opt('--trails')!, trailSheet(baked, rig, authoredTimes, title)); summary.trails = opt('--trails'); }
if (opt('--out')) { const lua = toLuau(seq, compiled, opt('--parent') ?? 'game.ServerStorage'); writeFileSync(opt('--out')!, lua); summary.luau = opt('--out'); summary.luauBytes = lua.length; }
if (opt('--json')) writeFileSync(opt('--json')!, JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.ok ? 0 : 3);

function toLuau(s: any, c: any, parent: string): string {
  const parentOf: Record<string, string> = {}; for (const j of rig.joints) parentOf[j.childPart] = j.parentPart;
  const r = (x: number, d: number) => { const v = Math.round(x * 10 ** d) / 10 ** d; return Object.is(v, -0) ? '0' : String(v); };
  const lines: string[] = []; const markerLines: string[] = [];
  s.keyframes.forEach((kf: any, idx: number) => {
    const items: string[] = [];
    const walk = (node: any) => {
      if (node.weight > 0) {
        const cf = node.cframe; const m = cf.slice(3);
        // quaternion from rotation matrix
        const tr = m[0] + m[4] + m[8]; let x, y, z, w;
        if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; w = S / 4; x = (m[7] - m[5]) / S; y = (m[2] - m[6]) / S; z = (m[3] - m[1]) / S; }
        else if (m[0] > m[4] && m[0] > m[8]) { const S = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; w = (m[7] - m[5]) / S; x = S / 4; y = (m[1] + m[3]) / S; z = (m[2] + m[6]) / S; }
        else if (m[4] > m[8]) { const S = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; w = (m[2] - m[6]) / S; x = (m[1] + m[3]) / S; y = S / 4; z = (m[5] + m[7]) / S; }
        else { const S = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; w = (m[3] - m[1]) / S; x = (m[2] + m[6]) / S; y = (m[5] + m[7]) / S; z = S / 4; }
        const nums = [r(x, 4), r(y, 4), r(z, 4), r(w, 4)];
        if (Math.abs(cf[0]) + Math.abs(cf[1]) + Math.abs(cf[2]) > 1e-4) nums.push(r(cf[0], 3), r(cf[1], 3), r(cf[2], 3));
        items.push(`${node.part}=${nums.join(',')}`);
      }
      for (const ch of node.children) walk(ch);
    };
    walk(kf.root);
    lines.push(`${r(kf.time, 4)};${items.join(';')}`);
    if (kf.markers) markerLines.push(`[${idx + 1}]={${kf.markers.map((m: any) => `{${JSON.stringify(m.name)},${JSON.stringify(m.value ?? '')}}`).join(',')}}`);
  });
  return `-- Generated by roblox-cinematic-animation/scripts/animpro.mjs (pose compiler from adn, AGPL-3.0). Run with execute_luau.
-- ${c.name}: ${s.keyframes.length} baked keyframes (Linear between dense keys, as Roblox's own animation packs are made).
local DATA = [==[
${lines.join('\n')}
]==]
local ROOT = ${JSON.stringify(rig.rootPart)}
local PARENT = {${Object.entries(parentOf).map(([k, v]) => `[${JSON.stringify(k)}]=${JSON.stringify(v)}`).join(',')}}
local MARKERS = {${markerLines.join(',')}}
local seq = Instance.new("KeyframeSequence")
seq.Name = ${JSON.stringify(c.name)}
seq.Loop = ${c.loop ? 'true' : 'false'}
seq.Priority = Enum.AnimationPriority.${c.priority}
local idx = 0
for line in string.gmatch(DATA, "[^\\n]+") do
	idx += 1
	local t, rest = string.match(line, "^([^;]+);?(.*)$")
	local kf = Instance.new("Keyframe")
	kf.Time = tonumber(t)
	local poses = {}
	local function ensure(part)
		local p = poses[part]
		if p then return p end
		p = Instance.new("Pose")
		p.Name = part
		p.Weight = 0
		p.EasingStyle = Enum.PoseEasingStyle.Linear
		poses[part] = p
		local par = PARENT[part]
		p.Parent = if par then ensure(par) else kf
		return p
	end
	ensure(ROOT)
	for part, vals in string.gmatch(rest, "([^=;]+)=([^;]+)") do
		local n = {}
		for v in string.gmatch(vals, "[^,]+") do table.insert(n, tonumber(v)) end
		local p = ensure(part)
		p.Weight = 1
		p.CFrame = CFrame.new(n[5] or 0, n[6] or 0, n[7] or 0, n[1], n[2], n[3], n[4])
	end
	for _, m in MARKERS[idx] or {} do
		local mk = Instance.new("KeyframeMarker")
		mk.Name = m[1]
		mk.Value = m[2]
		mk.Parent = kf
	end
	kf.Parent = seq
end
local folder = ${parent}:FindFirstChild("Animations") or Instance.new("Folder")
folder.Name = "Animations"
folder.Parent = ${parent}
local old = folder:FindFirstChild(seq.Name)
if old then old:Destroy() end
seq.Parent = folder
local ok, id = pcall(function() return game:GetService("AnimationClipProvider"):RegisterAnimationClip(seq) end)
seq:SetAttribute("PreviewId", ok and tostring(id) or nil)
return string.format("built %s (%d keyframes, %.2f s); preview id: %s", seq:GetFullName(), #seq:GetKeyframes(), seq:GetKeyframes()[#seq:GetKeyframes()].Time, tostring(ok and id or nil))
`;
}
