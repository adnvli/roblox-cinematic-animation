// Graph-editor sheet and motion-trail sheet, so the model can see curves, spacing and arcs.
import type { Rig } from '<adn checkout>/packages/core/src/animation/rig.ts';
import { Canvas, speedColor, type RGB } from './canvas.ts';
import { type Baked, type V, eulerFromQ, partFrames } from './polish.ts';

const AX: RGB[] = [[255, 95, 95], [110, 220, 110], [100, 160, 255]];

export function graphSheet(baked: Baked, rig: Rig, authored: number[], title: string): Buffer {
  const pref = ['LowerTorso', 'UpperTorso', 'Head', 'RightUpperArm', 'RightLowerArm', 'RightHand', 'LeftUpperArm', 'LeftLowerArm', 'RightUpperLeg', 'RightLowerLeg', 'LeftUpperLeg', 'LeftLowerLeg', 'BodyAttach', 'Torso', 'Right Arm', 'Left Arm', 'Right Leg', 'Left Leg'];
  let parts = pref.filter((p) => baked.parts.has(p));
  if (parts.length < 4) parts = [...baked.parts.keys()].filter((p) => p !== rig.rootPart).slice(0, 12);
  const rootPart = rig.joints.find((j) => j.name === rig.rootJoint)?.childPart;
  const panels: { name: string; series: number[][]; unit: string }[] = [];
  if (rootPart && baked.parts.has(rootPart)) {
    const d = baked.parts.get(rootPart)!; panels.push({ name: `${rootPart} position (studs)`, unit: 'st', series: [0, 1, 2].map((c) => d.p.map((p) => p[c])) });
  }
  for (const p of parts) {
    const d = baked.parts.get(p)!; const e = d.q.map(eulerFromQ);
    const series = [0, 1, 2].map((c) => { const out: number[] = []; let prev = 0; for (let i = 0; i < e.length; i++) { let v = e[i][c]; if (i) { while (v - prev > 180) v -= 360; while (v - prev < -180) v += 360; } out.push(v); prev = v; } return out; });
    panels.push({ name: `${p} rotation (deg)`, unit: 'deg', series });
  }
  const cols = 2, pw = 560, ph = 150, pad = 34, top = 40;
  const rows = Math.ceil(panels.length / cols);
  const cv = new Canvas(cols * pw + (cols + 1) * 12, top + rows * (ph + pad) + 30);
  cv.text(12, 12, title, [255, 255, 255], 2);
  cv.text(12, cv.h - 18, 'RED X  GREEN Y  BLUE Z. DOTS = ONE PER FRAME (WIDE GAPS = FAST). WHITE TICKS = YOUR KEYS. AMBER BAND = MOVING HOLD.', [170, 175, 190]);
  const T = baked.duration; const n = baked.times.length;
  panels.forEach((pn, k) => {
    const x0 = 12 + (k % cols) * (pw + 12), y0 = top + Math.floor(k / cols) * (ph + pad);
    cv.rect(x0, y0, pw, ph, [28, 31, 40]);
    // hold mask band
    for (let i = 0; i < n; i++) if (baked.holdMask[i] > 0.05) cv.rect(x0 + baked.times[i] / T * pw, y0, Math.max(1, pw / n), ph, [120, 90, 20], 0.25 * baked.holdMask[i]);
    let lo = Infinity, hi = -Infinity; for (const s of pn.series) for (const v of s) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const minSpan = pn.unit === 'deg' ? 10 : 0.2; if (hi - lo < minSpan) { const m = (hi + lo) / 2; lo = m - minSpan / 2; hi = m + minSpan / 2; }
    const X = (t: number) => x0 + 4 + t / T * (pw - 8); const Y = (v: number) => y0 + ph - 6 - (v - lo) / (hi - lo) * (ph - 12);
    // zero line + time grid
    for (let g = 0; g <= Math.floor(T * 10); g++) { const gx = X(g / 10); for (let y = y0; y < y0 + ph; y += 3) cv.set(gx, y, [60, 64, 78], g % 5 === 0 ? 1 : 0.4); }
    for (const t of authored) cv.line(X(t), y0, X(t), y0 + ph, [235, 235, 245], 0.55);
    pn.series.forEach((s, c) => {
      const range = Math.max(...s) - Math.min(...s); if (range < (pn.unit === 'deg' ? 0.5 : 0.005)) return;
      for (let i = 1; i < n; i++) cv.line(X(baked.times[i - 1]), Y(s[i - 1]), X(baked.times[i]), Y(s[i]), AX[c], 0.9);
      for (let i = 0; i < n; i++) cv.dot(X(baked.times[i]), Y(s[i]), 1.4, AX[c]);
    });
    cv.text(x0 + 4, y0 + 4, pn.name, [230, 230, 240]);
    const lab = `${lo.toFixed(pn.unit === 'deg' ? 0 : 2)} TO ${hi.toFixed(pn.unit === 'deg' ? 0 : 2)}`; cv.text(x0 + pw - cv.textWidth(lab) - 4, y0 + 4, lab, [150, 155, 170]);
    cv.text(x0 + 2, y0 + ph + 4, '0', [140, 145, 160]); const tl = `${T.toFixed(2)}S`; cv.text(x0 + pw - cv.textWidth(tl), y0 + ph + 4, tl, [140, 145, 160]);
  });
  return cv.png();
}

export function trailSheet(baked: Baked, rig: Rig, authored: number[], title: string): Buffer {
  const n = baked.times.length; const frames = baked.times.map((_, i) => partFrames(baked, rig, i));
  const P = (m: Map<string, any>, part: string, off: V = [0, 0, 0]): V | null => { const f = m.get(part); if (!f) return null; const r = f.r; return [f.p[0] + r[0] * off[0] + r[1] * off[1] + r[2] * off[2], f.p[1] + r[3] * off[0] + r[4] * off[1] + r[5] * off[2], f.p[2] + r[6] * off[0] + r[7] * off[1] + r[8] * off[2]]; };
  const eff: { name: string; part: string; off: V; col: RGB }[] = [];
  const add = (name: string, part: string, off: V = [0, 0, 0]) => { if (frames[0].has(part)) eff.push({ name, part, off, col: [0, 0, 0] }); };
  add('R HAND', 'RightHand'); add('L HAND', 'LeftHand'); add('R HAND', 'Right Arm', [0, -1, 0]); add('L HAND', 'Left Arm', [0, -1, 0]);
  add('HEAD', 'Head'); add('R FOOT', 'RightFoot'); add('L FOOT', 'LeftFoot'); add('R FOOT', 'Right Leg', [0, -1, 0]); add('L FOOT', 'Left Leg', [0, -1, 0]);
  if (baked.parts.has('BodyAttach')) add('TIP', 'BodyAttach', [0, 4, 0]);
  const trails = eff.map((e) => frames.map((m) => P(m, e.part, e.off)!));
  const speeds = trails.map((T) => T.map((p, i) => i ? Math.hypot(p[0] - T[i - 1][0], p[1] - T[i - 1][1], p[2] - T[i - 1][2]) * baked.fps : 0));
  const vmax = Math.max(1, ...speeds.flat());
  const parentOf = new Map(rig.joints.map((j) => [j.childPart, j.parentPart] as [string, string]));
  // views: side (forward=-Z to the right, Y up), front (X right, Y up), top (X right, forward up)
  const views = [
    { name: 'SIDE', h: (p: V) => -p[2], v: (p: V) => p[1] },
    { name: 'FRONT', h: (p: V) => -p[0], v: (p: V) => p[1] },
    { name: 'TOP', h: (p: V) => -p[0], v: (p: V) => -p[2] },
  ];
  const cw = 420, chh = 460, top = 40;
  const cv = new Canvas(3 * cw + 4 * 12, top + chh + 50);
  cv.text(12, 12, title, [255, 255, 255], 2);
  const keyIdx = [...new Set(authored.map((t) => { let b = 0; baked.times.forEach((x, i) => { if (Math.abs(x - t) < Math.abs(baked.times[b] - t)) b = i; }); return b; }))];
  views.forEach((vw, k) => {
    const x0 = 12 + k * (cw + 12), y0 = top;
    cv.rect(x0, y0, cw, chh, [28, 31, 40]);
    const pts: V[] = []; for (const m of frames) for (const f of m.values()) pts.push(f.p as V); for (const T of trails) pts.push(...T);
    let hl = Infinity, hh = -Infinity, vl = Infinity, vh = -Infinity; for (const p of pts) { hl = Math.min(hl, vw.h(p)); hh = Math.max(hh, vw.h(p)); vl = Math.min(vl, vw.v(p)); vh = Math.max(vh, vw.v(p)); }
    const span = Math.max(hh - hl, vh - vl) * 1.1 + 0.5; const cx = (hl + hh) / 2, cy = (vl + vh) / 2; const s = (Math.min(cw, chh) - 20) / span;
    const X = (p: V) => x0 + cw / 2 + (vw.h(p) - cx) * s; const Y = (p: V) => y0 + chh / 2 - (vw.v(p) - cy) * s;
    // ghost figures at the authored keys
    keyIdx.forEach((fi, j) => {
      const m = frames[fi]; const a = 0.18 + 0.5 * j / Math.max(1, keyIdx.length - 1);
      for (const [part, f] of m) { const par = parentOf.get(part); if (!par || par === rig.rootPart) continue; const pf = m.get(par); if (pf) cv.line(X(pf.p as V), Y(pf.p as V), X(f.p as V), Y(f.p as V), [200, 205, 220], a, 2); }
    });
    // trails with per-frame dots coloured by speed
    trails.forEach((T, e) => {
      for (let i = 1; i < n; i++) cv.line(X(T[i - 1]), Y(T[i - 1]), X(T[i]), Y(T[i]), [120, 125, 140], 0.5);
      for (let i = 0; i < n; i++) cv.dot(X(T[i]), Y(T[i]), 2, speedColor(speeds[e][i] / vmax));
      const last = T[n - 1]; cv.text(X(last) + 4, Y(last) - 3, eff[e].name, [210, 210, 225]);
    });
    cv.text(x0 + 6, y0 + 6, vw.name, [230, 230, 240]);
  });
  cv.text(12, top + chh + 10, `DOTS = ONE PER FRAME. BLUE = SLOW, RED = FAST (MAX ${vmax.toFixed(1)} STUDS/S). CLUSTERED DOTS = EASE. GHOSTS = YOUR KEY POSES. CURVES SHOULD ARC, NOT ZIGZAG.`, [170, 175, 190]);
  return cv.png();
}
