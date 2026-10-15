// Pro passes on a compiled animation: spline interpolation, overlap, settle springs,
// moving holds, breathing, then bake to dense Linear keys and reduce.
import { buildTracks, sampleTrack, poseRig, type Frame, type MotionSequence } from '<adn checkout>/packages/core/src/animation/motion.ts';
import type { Rig } from '<adn checkout>/packages/core/src/animation/rig.ts';

export type Q = [number, number, number, number]; // x y z w
export type V = [number, number, number];

// ---------- quaternion helpers ----------
export function qFromM(r: readonly number[]): Q {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = r;
  const tr = m00 + m11 + m22; let x, y, z, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
  return qNorm([x, y, z, w]);
}
export function mFromQ(q: Q): number[] {
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
          2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
          2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}
export const qNorm = (q: Q): Q => { const n = Math.hypot(...q) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
export const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
export const qInv = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
export const qDot = (a: Q, b: Q) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export function qLog(q: Q): V { // rotation vector (radians)
  if (q[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
  const s = Math.hypot(q[0], q[1], q[2]); if (s < 1e-9) return [0, 0, 0];
  const th = 2 * Math.atan2(s, q[3]); return [q[0] / s * th, q[1] / s * th, q[2] / s * th];
}
export function qExp(v: V): Q {
  const th = Math.hypot(...v); if (th < 1e-9) return [0, 0, 0, 1];
  const s = Math.sin(th / 2) / th; return [v[0] * s, v[1] * s, v[2] * s, Math.cos(th / 2)];
}
export const qAngleDeg = (a: Q, b: Q) => 2 * Math.acos(Math.min(1, Math.abs(qDot(a, b)))) * 180 / Math.PI;
export function eulerFromQ(q: Q): V { // Roblox ToEulerAnglesXYZ (R = Rx*Ry*Rz), degrees
  const m = mFromQ(q); const d = 180 / Math.PI;
  const y = Math.asin(Math.max(-1, Math.min(1, m[2])));
  const x = Math.atan2(-m[5], m[8]); const z = Math.atan2(-m[1], m[0]);
  return [x * d, y * d, z * d];
}

// ---------- monotone cubic (Fritsch-Carlson) ----------
function monotoneTangents(t: number[], y: number[]): number[] {
  const n = t.length; const d: number[] = []; const m = new Array(n).fill(0);
  for (let k = 0; k < n - 1; k++) d.push((y[k + 1] - y[k]) / Math.max(t[k + 1] - t[k], 1e-9));
  if (n === 1) return [0];
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
  for (let k = 0; k < n - 1; k++) {
    if (Math.abs(d[k]) < 1e-12) { m[k] = 0; m[k + 1] = 0; continue; }
    const a = m[k] / d[k], b = m[k + 1] / d[k]; const s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); m[k] = tau * a * d[k]; m[k + 1] = tau * b * d[k]; }
  }
  return m;
}
function hermite(y0: number, y1: number, m0: number, m1: number, h: number, u: number) {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * m1;
}

export interface Track { times: number[]; ref: Q; r: V[]; p: V[]; style: string[]; dir: string[]; explicit: boolean[]; mr: V[]; mp: V[]; }

export interface PolishOptions {
  fps: number; spline: boolean; loop: boolean; duration: number;
  lags: Record<string, number>;          // part -> lag seconds
  springs: Record<string, { f: number; z: number }>; // part -> spring
  life: number;                          // moving-hold amplitude multiplier (0 = off)
  breathe: { period: number; amp: number } | null;
  explicit: (part: string, t: number) => boolean; // segment keeps authored easing
  tailSeconds: number;                   // extra time added at the end of a one-shot so lags/springs finish
}

export function makeTracks(seq: MotionSequence, explicit: PolishOptions['explicit']): Map<string, Track> {
  const raw = buildTracks(seq); const out = new Map<string, Track>();
  for (const [part, keys] of raw) {
    const ref = keys[0].q as Q; const times: number[] = []; const r: V[] = []; const p: V[] = []; const style: string[] = []; const dir: string[] = []; const ex: boolean[] = [];
    let prev: V | null = null;
    for (const k of keys) {
      let rel = qMul(qInv(ref), k.q as Q); let v = qLog(rel);
      // keep rotation vectors continuous (avoid 2*pi jumps)
      if (prev) {
        const th = Math.hypot(...v);
        if (th > 1e-6) {
          const alt: V = v.map((c) => c - c / th * 2 * Math.PI) as V;
          const dA = Math.hypot(v[0] - prev[0], v[1] - prev[1], v[2] - prev[2]); const dB = Math.hypot(alt[0] - prev[0], alt[1] - prev[1], alt[2] - prev[2]);
          if (dB < dA) v = alt;
        }
      }
      prev = v; times.push(k.time); r.push(v); p.push([...k.p] as V); style.push(k.style); dir.push(k.direction); ex.push(explicit(part, k.time));
    }
    out.set(part, { times, ref, r, p, style, dir, explicit: ex, mr: [], mp: [] });
  }
  return out;
}

function tangentsFor(tr: Track, loop: boolean, duration: number) {
  const n = tr.times.length; tr.mr = []; tr.mp = [];
  let T = tr.times, R = tr.r, P = tr.p;
  if (loop && n > 2) { // periodic extension for tangents: keys are k[0..n-1] with k[n-1] == k[0] at duration
    T = [tr.times[n - 2] - duration, ...tr.times, tr.times[1] + duration];
    R = [tr.r[n - 2], ...tr.r, tr.r[1]]; P = [tr.p[n - 2], ...tr.p, tr.p[1]];
  }
  const mR: number[][] = [0, 1, 2].map((c) => monotoneTangents(T, R.map((v) => v[c])));
  const mP: number[][] = [0, 1, 2].map((c) => monotoneTangents(T, P.map((v) => v[c])));
  const off = loop && n > 2 ? 1 : 0;
  if (!loop) { // a one-shot starts and ends at rest: no velocity out of the first key or into the last
    for (const m of [...mR, ...mP]) { m[0] = 0; m[m.length - 1] = 0; }
  }
  for (let k = 0; k < n; k++) { tr.mr.push([mR[0][k + off], mR[1][k + off], mR[2][k + off]]); tr.mp.push([mP[0][k + off], mP[1][k + off], mP[2][k + off]]); }
}

/** Sample one part's local transform at time t (seconds). */
export function sampleSpline(tr: Track, t: number, rawKeys: any, useSpline: boolean): { q: Q; p: V } {
  const n = tr.times.length;
  if (t <= tr.times[0] || n === 1) return { q: qMul(tr.ref, qExp(tr.r[0])), p: tr.p[0] };
  if (t >= tr.times[n - 1]) return { q: qMul(tr.ref, qExp(tr.r[n - 1])), p: tr.p[n - 1] };
  let k = 0; while (k < n - 2 && tr.times[k + 1] <= t) k++;
  const st = tr.style[k];
  if (!useSpline || tr.explicit[k] || st === 'Constant' || st === 'Elastic' || st === 'Bounce') {
    const f = sampleTrack(rawKeys, t); return { q: qFromM(f.r), p: [...f.p] as V };
  }
  const h = tr.times[k + 1] - tr.times[k]; const u = (t - tr.times[k]) / h;
  const r: V = [0, 1, 2].map((c) => hermite(tr.r[k][c], tr.r[k + 1][c], tr.mr[k][c], tr.mr[k + 1][c], h, u)) as V;
  const p: V = [0, 1, 2].map((c) => hermite(tr.p[k][c], tr.p[k + 1][c], tr.mp[k][c], tr.mp[k + 1][c], h, u)) as V;
  return { q: qMul(tr.ref, qExp(r)), p };
}

// smooth band-limited noise in [-1, 1]
function noise(seed: number) {
  const rnd = (i: number) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
  const comps = [0.31, 0.53, 0.97].map((f, i) => ({ f: f * (0.85 + 0.3 * rnd(i)), ph: rnd(i + 7) * Math.PI * 2, a: [1, 0.6, 0.3][i] }));
  const norm = comps.reduce((s, c) => s + c.a, 0);
  return (t: number) => comps.reduce((s, c) => s + c.a * Math.sin(2 * Math.PI * c.f * t + c.ph), 0) / norm;
}

// Moving-hold drift, half-amplitudes in degrees (x, y, z) at life = 1, from measured holds
// (Bandai-Namco mocap, 1,233 held raised-arm poses: trunk ~1 deg p-p, head pitch ~2 deg p-p, hand drift 2-5 cm).
const DRIFT: Record<string, V> = {
  UpperTorso: [0.5, 0.4, 0.3], Head: [1.0, 1.0, 0.4], LowerTorso: [0.25, 0.3, 0.2],
  LeftUpperArm: [1.0, 0.6, 0.8], RightUpperArm: [1.0, 0.6, 0.8], LeftLowerArm: [0.8, 0.4, 0.4], RightLowerArm: [0.8, 0.4, 0.4],
  LeftHand: [1.0, 0.8, 0.8], RightHand: [1.0, 0.8, 0.8], Torso: [0.5, 0.4, 0.3], 'Left Arm': [1.0, 0.6, 0.8], 'Right Arm': [1.0, 0.6, 0.8],
};
const DRIFT_POS = 0.012; // studs half-amplitude on the root joint (hips sway ~1 cm p-p scaled to R15)

export interface Baked { fps: number; times: number[]; parts: Map<string, { q: Q[]; p: V[] }>; holdMask: number[]; duration: number; }

export function bake(seq: MotionSequence, rig: Rig, opt: PolishOptions): Baked {
  const tracks = makeTracks(seq, opt.explicit);
  const raw = buildTracks(seq);
  for (const tr of tracks.values()) tangentsFor(tr, opt.loop, opt.duration);
  const T = opt.duration; const total = opt.loop ? T : T + opt.tailSeconds;
  const N = Math.max(2, Math.round(total * opt.fps));
  const times: number[] = []; for (let i = 0; i <= N; i++) times.push(Math.min(total, i / opt.fps));
  if (times[times.length - 1] < total - 1e-6) times.push(total);
  const wrapT = (t: number) => opt.loop ? ((t % T) + T) % T : Math.max(0, Math.min(T, t));
  const parts = new Map<string, { q: Q[]; p: V[] }>();
  for (const [part, tr] of tracks) {
    const lag = opt.lags[part] ?? 0; const q: Q[] = []; const p: V[] = [];
    for (const t of times) { const s = sampleSpline(tr, wrapT(t - lag), raw.get(part), opt.spline); q.push(s.q); p.push(s.p); }
    // hemisphere continuity
    for (let i = 1; i < q.length; i++) if (qDot(q[i], q[i - 1]) < 0) q[i] = q[i].map((c) => -c) as Q;
    parts.set(part, { q, p });
  }
  // settle springs on rotation vectors relative to the part's own target
  for (const [part, sp] of Object.entries(opt.springs)) {
    const d = parts.get(part); if (!d) continue;
    const w = 2 * Math.PI * sp.f, z = sp.z; const ref = d.q[0];
    const target = d.q.map((q) => qLog(qMul(qInv(ref), q)));
    const sub = 8; const h = 1 / opt.fps / sub;
    let x: V = [...target[0]] as V; let v: V = [0, 0, 0];
    const run = (store: boolean) => {
      const out: V[] = [];
      for (let i = 0; i < target.length; i++) {
        for (let s = 0; s < sub; s++) {
          for (let c = 0; c < 3; c++) { const a = w * w * (target[i][c] - x[c]) - 2 * z * w * v[c]; v[c] += a * h; x[c] += v[c] * h; }
        }
        if (store) out.push([...x] as V);
      }
      return out;
    };
    if (opt.loop) run(false); // settle into the cycle first
    const res = run(true);
    d.q = res.map((r) => qMul(ref, qExp(r)));
  }
  // activity per frame (deg/s, max over parts) -> hold mask
  const act = times.map(() => 0);
  for (const d of parts.values()) for (let i = 1; i < times.length; i++) {
    const w = qAngleDeg(d.q[i - 1], d.q[i]) / Math.max(times[i] - times[i - 1], 1e-6); act[i] = Math.max(act[i], w);
  }
  act[0] = act[1] ?? 0;
  const still = act.map((a) => a < 6);
  const minRun = Math.round(0.3 * opt.fps); const mask = times.map(() => 0);
  for (let i = 0; i < still.length;) {
    let j = i; while (j < still.length && still[j] === still[i]) j++;
    if (still[i] && j - i >= minRun) for (let k = i; k < j; k++) mask[k] = 1;
    i = j;
  }
  // soften mask edges (0.15 s)
  const ramp = Math.max(1, Math.round(0.15 * opt.fps)); const soft = mask.map((_, i) => {
    let s = 0, c = 0; for (let k = i - ramp; k <= i + ramp; k++) { const kk = opt.loop ? (k + mask.length) % mask.length : Math.max(0, Math.min(mask.length - 1, k)); s += mask[kk]; c++; } return s / c;
  });
  if (opt.life > 0) {
    let seed = 1;
    for (const [part, d] of parts) {
      const amp = DRIFT[part]; seed++;
      if (!amp) continue;
      const nz = [noise(seed * 3.1), noise(seed * 5.7), noise(seed * 9.3)];
      for (let i = 0; i < times.length; i++) {
        if (soft[i] <= 0) continue;
        const t = opt.loop ? times[i] : times[i];
        const e: V = [0, 1, 2].map((c) => amp[c] * opt.life * soft[i] * nz[c](t) * Math.PI / 180) as V;
        d.q[i] = qNorm(qMul(d.q[i], qExp(e)));
      }
    }
    const rootPart = rig.joints.find((j) => j.name === rig.rootJoint)?.childPart;
    const rd = rootPart ? parts.get(rootPart) : undefined;
    if (rd) {
      const nx = noise(101), nz2 = noise(203);
      for (let i = 0; i < times.length; i++) if (soft[i] > 0) { rd.p[i] = [rd.p[i][0] + DRIFT_POS * opt.life * soft[i] * nx(times[i]), rd.p[i][1], rd.p[i][2] + DRIFT_POS * opt.life * soft[i] * nz2(times[i])]; }
    }
  }
  if (opt.breathe) {
    const per = opt.loop ? T / Math.max(1, Math.round(T / opt.breathe.period)) : opt.breathe.period;
    const A = opt.breathe.amp * Math.PI / 180;
    const wave = (t: number) => { // asymmetric: inhale 40 %, exhale 60 %
      const u = ((t / per) % 1 + 1) % 1; return u < 0.4 ? 0.5 - 0.5 * Math.cos(Math.PI * u / 0.4) : 0.5 + 0.5 * Math.cos(Math.PI * (u - 0.4) / 0.6);
    };
    const add = (part: string, ax: V, k: number) => { const d = parts.get(part); if (!d) return; for (let i = 0; i < times.length; i++) { const b = (wave(times[i]) - 0.5) * 2 * A * k; d.q[i] = qNorm(qMul(d.q[i], qExp([ax[0] * b, ax[1] * b, ax[2] * b]))); } };
    add('UpperTorso', [-1, 0, 0], 1); add('Torso', [-1, 0, 0], 1); add('Head', [1, 0, 0], 0.5);
    add('LeftUpperArm', [0, 0, -1], 0.5); add('RightUpperArm', [0, 0, 1], 0.5);
  }
  if (opt.loop) for (const d of parts.values()) { d.q[d.q.length - 1] = d.q[0]; d.p[d.p.length - 1] = d.p[0]; }
  return { fps: opt.fps, times, parts, holdMask: soft, duration: total };
}

/** Greedy key reduction per part; returns kept frame indices. */
export function reduceKeys(d: { q: Q[]; p: V[] }, times: number[], tolDeg: number, tolPos: number): number[] {
  const n = d.q.length; const keep = [0]; let a = 0;
  const lerpQ = (x: Q, y: Q, u: number): Q => { const yy = qDot(x, y) < 0 ? y.map((c) => -c) as Q : y; return qNorm([0, 1, 2, 3].map((c) => x[c] + (yy[c] - x[c]) * u) as Q); };
  for (let b = 2; b < n; b++) {
    let ok = true;
    for (let k = a + 1; k < b; k++) {
      const u = (times[k] - times[a]) / (times[b] - times[a]);
      if (qAngleDeg(lerpQ(d.q[a], d.q[b], u), d.q[k]) > tolDeg) { ok = false; break; }
      const pp = [0, 1, 2].map((c) => d.p[a][c] + (d.p[b][c] - d.p[a][c]) * u);
      if (Math.hypot(pp[0] - d.p[k][0], pp[1] - d.p[k][1], pp[2] - d.p[k][2]) > tolPos) { ok = false; break; }
    }
    if (!ok) { keep.push(b - 1); a = b - 1; }
  }
  if (keep[keep.length - 1] !== n - 1) keep.push(n - 1);
  return keep;
}

/** Rebuild a MotionSequence-shaped description (pose trees) from baked, reduced keys. */
export function toSequence(baked: Baked, rig: Rig, keep: Map<string, number[]>, loop: boolean, markers: { time: number; name: string; value: string }[]) {
  const parentOf = new Map<string, string>(); for (const j of rig.joints) parentOf.set(j.childPart, j.parentPart);
  const frameSet = new Set<number>(); for (const ks of keep.values()) for (const k of ks) frameSet.add(k);
  for (const m of markers) { let best = 0; baked.times.forEach((t, i) => { if (Math.abs(t - m.time) < Math.abs(baked.times[best] - m.time)) best = i; }); frameSet.add(best); }
  const frames = [...frameSet].sort((a, b) => a - b);
  const keyed = new Map<string, Set<number>>(); for (const [part, ks] of keep) keyed.set(part, new Set(ks));
  const keyframes = frames.map((fi) => {
    const nodes = new Map<string, any>();
    const ensure = (part: string): any => {
      if (nodes.has(part)) return nodes.get(part);
      const d = baked.parts.get(part); const isKey = keyed.get(part)?.has(fi) && d;
      const q = d ? d.q[fi] : [0, 0, 0, 1] as Q; const p = d ? d.p[fi] : [0, 0, 0] as V;
      const node = { part, weight: isKey ? 1 : 0, cframe: [...p, ...mFromQ(q)], easingStyle: 'Linear', easingDirection: 'In', children: [] as any[] };
      nodes.set(part, node);
      const par = parentOf.get(part); if (par) ensure(par).children.push(node);
      return node;
    };
    ensure(rig.rootPart);
    for (const [part, set] of keyed) if (set.has(fi)) ensure(part);
    const t = baked.times[fi];
    const mk = markers.filter((m) => { let best = 0; baked.times.forEach((tt, i) => { if (Math.abs(tt - m.time) < Math.abs(baked.times[best] - m.time)) best = i; }); return best === fi; });
    return { time: Math.round(t * 10000) / 10000, root: nodes.get(rig.rootPart), ...(mk.length ? { markers: mk.map((m) => ({ name: m.name, value: m.value })) } : {}) };
  });
  return { loop, keyframes };
}

/** World-ish part frames (in the root part's frame) per baked frame, via adn's FK. */
export function partFrames(baked: Baked, rig: Rig, frameIndex: number) {
  const tracks = new Map<string, any>();
  for (const [part, d] of baked.parts) tracks.set(part, [{ time: 0, q: d.q[frameIndex], p: d.p[frameIndex], style: 'Linear', direction: 'In' }]);
  return poseRig(tracks as any, 0, rig).parts;
}
export type { Frame };
