// Craft checks on a baked animation: what a lead animator would flag, with measured references.
import type { Rig } from '<adn checkout>/packages/core/src/animation/rig.ts';
import { type Baked, type Q, type V, qAngleDeg, partFrames } from './polish.ts';

export interface Finding { id: string; level: 'fix' | 'consider' | 'info'; message: string; data?: Record<string, unknown>; }
export interface LintContext { locomotion: boolean; authoredTimes: number[]; linearDefaultKeys: number; spline: boolean; groundSpeed?: number; loop: boolean; }

const R15_PAIRS: [string, string][] = [['UpperTorso', 'Head'], ['RightUpperArm', 'RightLowerArm'], ['RightLowerArm', 'RightHand'], ['LeftUpperArm', 'LeftLowerArm'], ['LeftLowerArm', 'LeftHand']];
const TWINS: [string, string][] = [['LeftUpperArm', 'RightUpperArm'], ['LeftLowerArm', 'RightLowerArm'], ['LeftUpperLeg', 'RightUpperLeg'], ['Left Arm', 'Right Arm'], ['Left Leg', 'Right Leg']];

function segments(s: number[], thr: number, minLen: number): [number, number][] {
  const out: [number, number][] = []; let i = 0;
  while (i < s.length) { if (s[i] <= thr) { i++; continue; } let j = i; while (j < s.length && s[j] > thr) j++; if (j - i >= minLen) out.push([i, j - 1]); i = j; }
  return out;
}
const median = (a: number[]) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const fmt = (x: number, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '-';

function xcorrLag(a: number[], b: number[], minL: number, maxL: number) {
  const norm = (v: number[]) => { const m = v.reduce((s, x) => s + x, 0) / v.length; const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1; return v.map((x) => (x - m) / sd); };
  const A = norm(a), B = norm(b); let best = -2, bl = 0; const vals: Record<number, number> = {};
  for (let L = minL; L <= maxL; L++) {
    let c = 0, n = 0; for (let i = 0; i < A.length; i++) { const j = i + L; if (j >= 0 && j < B.length) { c += A[i] * B[j]; n++; } }
    c /= Math.max(n, 1); vals[L] = c; if (c > best) { best = c; bl = L; }
  }
  let lag = bl; if (vals[bl - 1] !== undefined && vals[bl + 1] !== undefined) { const d = vals[bl - 1] - 2 * vals[bl] + vals[bl + 1]; if (Math.abs(d) > 1e-9) lag = bl + 0.5 * (vals[bl - 1] - vals[bl + 1]) / d; }
  return { lag, corr: best };
}

export function lint(baked: Baked, rig: Rig, ctx: LintContext) {
  const F: Finding[] = []; const fps = baked.fps; const n = baked.times.length; const f30 = 30 / fps;
  const H = rig.hipHeight || 2;
  const parts = [...baked.parts.keys()];
  // local angular speed per part
  const w = new Map<string, number[]>();
  for (const [p, d] of baked.parts) { const s = [0]; for (let i = 1; i < n; i++) s.push(qAngleDeg(d.q[i - 1], d.q[i]) * fps); s[0] = s[1] ?? 0; w.set(p, s); }
  // world frames
  const frames = baked.times.map((_, i) => partFrames(baked, rig, i));
  const pos = (part: string, off: V = [0, 0, 0]) => frames.map((m) => { const f = m.get(part); if (!f) return [NaN, NaN, NaN] as V; const r = f.r; return [f.p[0] + r[0] * off[0] + r[1] * off[1] + r[2] * off[2], f.p[1] + r[3] * off[0] + r[4] * off[1] + r[5] * off[2], f.p[2] + r[6] * off[0] + r[7] * off[1] + r[8] * off[2]] as V; });
  const speedOf = (P: V[]) => P.map((p, i) => i === 0 ? 0 : len(sub(p, P[i - 1])) * fps).map((v, i, a) => i === 0 ? (a[1] ?? 0) : v);
  const rootJointPart = rig.joints.find((j) => j.name === rig.rootJoint)?.childPart ?? (parts.includes('LowerTorso') ? 'LowerTorso' : parts.includes('Torso') ? 'Torso' : undefined);
  const effectors: { name: string; P: V[] }[] = [];
  for (const e of ['RightHand', 'LeftHand', 'Right Arm', 'Left Arm']) if (frames[0].has(e)) effectors.push({ name: e, P: pos(e, e.includes('Arm') ? [0, -1, 0] : [0, 0, 0]) });
  if (baked.parts.has('BodyAttach')) effectors.push({ name: 'weapon tip', P: pos('BodyAttach', [0, 4, 0]) });
  if (frames[0].has('Head')) effectors.push({ name: 'Head', P: pos('Head') });
  if (!ctx.locomotion) for (const e of ['RightFoot', 'LeftFoot', 'Right Leg', 'Left Leg']) if (frames[0].has(e)) effectors.push({ name: e, P: pos(e, e.includes('Leg') ? [0, -1, 0] : [0, 0, 0]) });

  // 1. spacing
  const ratios: number[] = []; const tpk: number[] = []; let linearSegs = 0, segCount = 0;
  for (const [p, s] of w) {
    if (p === 'HumanoidRootPart') continue;
    for (const [a, b] of segments(s, Math.max(20, 0.15 * Math.max(...s)), 4)) {
      const seg = s.slice(a, b + 1); const pk = Math.max(...seg); const mean = seg.reduce((x, y) => x + y, 0) / seg.length;
      const swept = mean * seg.length / fps; if (pk < 90 || swept < 12) continue;
      segCount++; const r = pk / mean; ratios.push(r); tpk.push(seg.indexOf(pk) / Math.max(1, seg.length - 1));
      if (r < 1.15 && seg.length >= 6) linearSegs++;
    }
  }
  if (segCount && linearSegs / segCount >= 0.3) F.push({ id: 'linearSpacing', level: 'fix', message: `${linearSegs} of ${segCount} joint moves travel at constant speed (peak/average speed <= 1.15, median ${fmt(median(ratios))}). Real motion peaks at about 1.4x its average speed (1,315 measured arm raises, IQR 1.33-1.47). Keep the spline pass on, or add breakdown keys that cluster near the extremes.`, data: { linearSegs, segCount } });
  if (tpk.length >= 4) {
    const m = median(tpk);
    if (m > 0.46 && m < 0.54) F.push({ id: 'symmetricEasing', level: 'consider', message: `Moves peak in speed at ${Math.round(m * 100)}% of their duration: every move eases in and out the same amount. Measured gestures reach peak speed at 38% (they leave fast and arrive slowly); tired/old characters at ~25%; only snappy, energetic ones near 50%. Put a breakdown key early in the move or favour the arrival.`, data: { medianPeakAt: m } });
  }
  // 2. overlap
  const lags: Record<string, number> = {};
  const pairs = parts.includes('UpperTorso') ? R15_PAIRS : rig.joints.filter((j) => rig.joints.some((k) => k.childPart === j.parentPart && k.name !== rig.rootJoint)).map((j) => [j.parentPart, j.childPart] as [string, string]);
  for (const [a, b] of pairs) {
    const sa = w.get(a), sb = w.get(b); if (!sa || !sb) continue;
    if (Math.max(...sa) < 60 || Math.max(...sb) < 60) continue;
    const lo = -Math.round(3 / f30), hi = Math.round(6 / f30);
    const { lag, corr } = xcorrLag(sa, sb, lo, hi);
    if (corr > 0.5 && lag > lo + 0.5 && lag < hi - 0.5) lags[`${a}>${b}`] = lag * f30;
  }
  const allLags = Object.values(lags);
  if (allLags.length >= 2 && median(allLags) <= 0.3) F.push({ id: 'noOverlap', level: 'fix', message: `Child joints move on the same frames as their parents (median lag ${fmt(median(allLags), 1)} frames at 30 fps: ${Object.entries(lags).map(([k, v]) => `${k} ${fmt(v, 1)}`).join(', ')}). Pros offset each joint down a chain 1-2 frames; mocap measures elbow +1 frame (33 ms) after the upper arm and hand +1 frame after the elbow; Roblox's Cartoony and Stylish walks trail the forearm by 3-4 frames. Use the overlap pass (default) or offset the child keys.`, data: { lags } });
  // 3. twinning
  if (!ctx.locomotion) for (const [l, r] of TWINS) {
    const dl = baked.parts.get(l), dr = baked.parts.get(r); if (!dl || !dr) continue;
    const sl = w.get(l)!, sr = w.get(r)!; const swept = (s: number[]) => s.reduce((x, y) => x + y, 0) / fps;
    if (swept(sl) < 25 || swept(sr) < 25) continue;
    const diffs: number[] = []; for (let i = 0; i < n; i++) { const m: Q = [dr.q[i][0], -dr.q[i][1], -dr.q[i][2], dr.q[i][3]]; diffs.push(qAngleDeg(dl.q[i], m)); }
    const { lag, corr } = xcorrLag(sl, sr, -3, 3);
    if (median(diffs) < 6 && corr > 0.9 && Math.abs(lag) < 0.5) F.push({ id: 'twinning', level: 'fix', message: `${l} and ${r} mirror each other on the same frames (median mirrored difference ${fmt(median(diffs), 1)} deg). Symmetry reads stiff; lead with one side and let the other follow a few frames later with a different shape, unless the beat is deliberately symmetric (a two-handed overhead slam).`, data: { median: median(diffs) } });
  }
  // 4. dead holds
  const act = baked.times.map((_, i) => Math.max(...[...w.values()].map((s) => s[i])));
  const rootP = rootJointPart ? pos(rootJointPart) : null; const rootSp = rootP ? speedOf(rootP) : act.map(() => 0);
  const dead: [number, number][] = []; let i0 = -1;
  for (let i = 0; i <= n; i++) {
    const still = i < n && act[i] < 1 && rootSp[i] < 0.02;
    if (still && i0 < 0) i0 = i; if (!still && i0 >= 0) { if ((i - i0) / fps >= 0.4) dead.push([i0, i - 1]); i0 = -1; }
  }
  if (dead.length) { const tot = dead.reduce((s, [a, b]) => s + (b - a + 1) / fps, 0); const lg = dead.reduce((m, d) => (d[1] - d[0] > m[1] - m[0] ? d : m)); F.push({ id: 'deadHold', level: 'fix', message: `${dead.length} frozen hold(s), ${fmt(tot)} s in all, longest ${fmt((lg[1] - lg[0] + 1) / fps)} s from ${fmt(baked.times[lg[0]])} s. Nobody holds perfectly still: across 1,233 measured held poses the hand drifts 2-5 cm, the hips sway ~1 cm, the head moves 1-2 deg and the trunk ~1 deg per second. Use --life 1 (default) or key a slow drift.`, data: { dead } }); }
  // 5. arcs
  for (const e of effectors) {
    if (e.P.some((p) => !Number.isFinite(p[0]))) continue;
    const s = speedOf(e.P); const mx = Math.max(...s);
    for (const [a, b] of segments(s, Math.max(1.5, 0.2 * mx), 4)) {
      const chord = sub(e.P[b], e.P[a]); const L = len(chord); if (L < 0.6) continue;
      const u: V = [chord[0] / L, chord[1] / L, chord[2] / L]; let dev = 0;
      for (let k = a; k <= b; k++) { const d = sub(e.P[k], e.P[a]); const along = d[0] * u[0] + d[1] * u[1] + d[2] * u[2]; dev = Math.max(dev, len([d[0] - along * u[0], d[1] - along * u[1], d[2] - along * u[2]])); }
      if (dev / L < 0.04) F.push({ id: 'straightPath', level: 'consider', message: `${e.name} moves in a straight line from ${fmt(baked.times[a])} to ${fmt(baked.times[b])} s (bows ${fmt(100 * dev / L, 0)}% of its ${fmt(L, 1)}-stud path). Organic moves curve: measured arm raises bow 22% of their travel, slashes 36%, even punches 6-12%. Add a breakdown key off the straight line (usually higher, or swinging out).`, data: { from: baked.times[a], to: baked.times[b], dev: dev / L } });
    }
  }
  // 6-8. action analysis (one-shots)
  let action: any = null;
  if (!ctx.locomotion && !ctx.loop) {
    let best: any = null;
    for (const e of effectors) { if (e.name === 'Head') continue; const s = speedOf(e.P); const mx = Math.max(...s); if (!best || mx > best.mx) best = { e, s, mx }; }
    if (best && best.mx > 2.0 * H) { // speeds scale with body size: hipHeight H studs ~ 0.91 m of a measured actor, so 1 m/s ~ 1.1*H studs/s
      const { e, s, mx } = best; const pk = s.indexOf(mx);
      let on = pk; while (on > 0 && s[on] > 0.12 * mx && !(s[on] < s[on - 1] && s[on] < 0.35 * mx)) on--;
      let stop = pk; while (stop < n - 2 && !(s[stop] <= s[stop + 1] && s[stop] < 0.5 * mx)) stop++;
      const dir = sub(e.P[stop], e.P[on]); const dl = len(dir) || 1; const u: V = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
      // after the strike: follow-through (still moving along the strike), hold (quiet), recovery (the way back)
      const quiet = (k: number) => s[k] < Math.max(0.06 * mx, 0.5);
      const along = (k: number) => { const d = sub(e.P[Math.min(n - 1, k + 1)], e.P[k]); return d[0] * u[0] + d[1] * u[1] + d[2] * u[2]; };
      let ft = stop; while (ft < n - 1 && !quiet(ft) && along(ft) > 0) ft++;
      let h = ft; while (h < n - 1 && quiet(h)) h++;
      let rec = h; let q = 0; while (rec < n - 1) { rec++; q = quiet(rec) ? q + 1 : 0; if (q >= 4) { rec -= 3; break; } }
      const pre = Math.max(0, on - Math.round(0.6 * fps));
      let back = 0; for (let k = pre + 1; k <= on; k++) { const d = sub(e.P[k], e.P[k - 1]); back += Math.max(0, -(d[0] * u[0] + d[1] * u[1] + d[2] * u[2])); }
      const drop = rootP ? rootP[on][1] - Math.min(...rootP.slice(pre, stop + 1).map((p) => p[1])) : 0;
      const shift = rootP ? Math.hypot(rootP[stop][0] - rootP[pre][0], rootP[stop][2] - rootP[pre][2]) : 0;
      // kinetic chain: torso peak angular speed vs effector peak
      const torso = w.get('LowerTorso') ?? w.get('Torso'); const chest = w.get('UpperTorso');
      const win = (sig?: number[]) => { if (!sig) return null; let bi = Math.max(0, on - Math.round(0.25 * fps)); for (let k = bi; k <= Math.min(n - 1, stop + 2); k++) if (sig[k] > sig[bi]) bi = k; return { t: (bi - pk) / fps * 1000, v: sig[bi] }; };
      const ct = win(torso), cc = win(chest);
      action = { effector: e.name, peakSpeed: mx, onset: baked.times[on], peak: baked.times[pk], stop: baked.times[stop], strike_s: (stop - on) / fps, followThrough_s: (ft - stop) / fps, hold_s: (h - ft) / fps, recovery_s: (rec - h) / fps, windupBack: back, rootDrop: drop, rootShift: shift, torsoPeak_ms: ct?.t, chestPeak_ms: cc?.t };
      if (mx > 3.0 * H && drop < 0.02 * H && shift < 0.05 * H) F.push({ id: 'noWeightShift', level: 'fix', message: `The ${e.name} strikes at ${fmt(mx, 0)} studs/s but the hips barely move (drop ${fmt(drop)} studs, shift ${fmt(shift)} studs). The body must commit: in 10 measured punches the hips drop 3-20 cm (median ~8% of hip height = ${fmt(0.08 * H)} studs here) and travel 16-34 cm toward the target (${fmt(0.18 * H)}-${fmt(0.37 * H)} studs); slashes drop the hips 5-8 cm. Key the Root down and forward through the strike.`, data: action });
      const torsoMoves = (ct && ct.v > 60) || (cc && cc.v > 60);
      if (mx > 3.0 * H && ((back < 0.05 * H && drop < 0.02 * H && !torsoMoves) || on / fps < 0.05)) F.push({ id: 'noAnticipation', level: 'consider', message: `The ${e.name} launches from a dead start${on / fps < 0.05 ? ' on the first frames of the clip' : ''}: no pull-back, no hip load, no dip in the 0.6 s before it. Real punches don't pull the hand back; they load the hips (pelvis turn peaks ~50 ms before the hand, shoulders ~35 ms before). Slashes raise first for 0.7-1.4 s. Game telegraphs: player light attacks 0.07-0.1 s, heavies 0.17-0.2 s, NPC attacks the player must read >= 0.34 s (Dark Souls 3).`, data: action });
      if (mx > 3.5 * H && ct && cc && ct.v > 60 && Math.min(ct.t, cc.t) > 0) F.push({ id: 'armFirst', level: 'consider', message: `The torso peaks after the ${e.name} (hips ${fmt(ct.t, 0)} ms, chest ${fmt(cc.t, 0)} ms relative to the effector's peak). Power flows from the ground up: measured strikes peak the pelvis ~50 ms and the shoulders ~35 ms BEFORE the hand, and the elbow locks ~25 ms after. Move the torso keys 1-3 frames earlier.`, data: action });
      if (action.strike_s > 0 && action.recovery_s > 0 && action.recovery_s < 0.6 * action.strike_s) F.push({ id: 'shortRecovery', level: 'consider', message: `Recovery (${fmt(action.recovery_s)} s) is shorter than the strike (${fmt(action.strike_s)} s). Weight shows in the follow-through: measured punches recover in 1.1-2.6x the strike time at about half its speed; fighting-game normals spend 1.5-2x their startup recovering. If this is a player move, mark where control returns instead of cutting the recovery.`, data: action });
    }
  }
  // locomotion bob
  if (ctx.locomotion && rootP) {
    const ys = rootP.map((p) => p[1]); const bob = Math.max(...ys) - Math.min(...ys);
    const run = (ctx.groundSpeed ?? 0) >= 12; const lo = run ? 0.05 : 0.015;
    let mins = 0; for (let i = 1; i < n - 1; i++) if (ys[i] < ys[i - 1] && ys[i] <= ys[i + 1]) mins++;
    F.push({ id: 'bobReport', level: 'info', message: `Root bob ${fmt(bob, 3)} studs (${fmt(100 * bob / H, 1)}% of hip height), ${mins} low point(s) per cycle. References: mocap walk ~4.3% of hip height (two dips per cycle, lowest just after each heel strike), run ~12%; Roblox's own walks 0.10-0.29 studs, runs 0.19-0.90 studs.` });
    if (bob < lo * H) F.push({ id: 'flatBob', level: 'fix', message: `The hips barely bob (${fmt(bob, 3)} studs): the ${run ? 'run' : 'walk'} will glide. Lower the Root on each Down pose (just after contact) and raise it on Up/passing: walk ${fmt(0.04 * H)}-${fmt(0.12 * H)} studs, run ${fmt(0.1 * H)}-${fmt(0.35 * H)} studs peak to peak.` });
  }
  // 9. rhythm of authored keys
  const at = [...new Set(ctx.authoredTimes)].sort((a, b) => a - b); const iv = at.slice(1).map((t, i) => t - at[i]);
  if (iv.length >= 4) { const m = iv.reduce((s, x) => s + x, 0) / iv.length; const sd = Math.sqrt(iv.reduce((s, x) => s + (x - m) ** 2, 0) / iv.length); if (sd / m < 0.08) F.push({ id: 'evenKeys', level: 'consider', message: `Keys are evenly spaced (every ${fmt(m)} s). Action has rhythm: a quick strike between slower anticipation and recovery, holds of different lengths. Re-time the keys so the beats differ.` }); }
  // 10. easing defaults
  if (!ctx.spline && ctx.linearDefaultKeys > 2) F.push({ id: 'linearEasing', level: 'fix', message: `${ctx.linearDefaultKeys} keyframes use Roblox's default Linear easing with the spline pass off. Linear starts and stops at full speed and kinks at every key. Turn the spline pass back on, or set CubicV2/InOut (never legacy Cubic In/Out, which plays reversed on Humanoids).` });
  return { findings: F, measured: { lags, spacingPeakOverMean: median(ratios), peakAt: median(tpk), action } };
}
