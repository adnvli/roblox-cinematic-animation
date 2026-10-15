// Draws a cinematic's blocking plan (top-down, per shot) and timeline from Cine.analyze(cut, {json = true}).
import { readFileSync, writeFileSync } from 'fs';
import { Canvas, type RGB } from './canvas.ts';

const args = process.argv.slice(2);
if (args.length < 2) { console.error('usage: node cineplan.mjs <analyze.json> <plan.png>\nSave the string Cine.analyze(cut, { json = true }) returns to a file, then draw it.'); process.exit(2); }
const data = JSON.parse(readFileSync(args[0], 'utf8'));
const shots: any[] = data.shots ?? [];
const SIZE_COL: Record<string, RGB> = { EWS: [60, 90, 160], VWS: [70, 110, 190], WS: [80, 140, 220], FS: [90, 170, 210], MWS: [90, 190, 170], MS: [110, 200, 120], MCU: [200, 200, 90], CU: [230, 150, 70], ECU: [235, 90, 80] };
const cols = 4, cw = 300, ch = 260, top = 44;
const rows = Math.max(1, Math.ceil(shots.length / cols));
const cv = new Canvas(cols * (cw + 10) + 10, top + rows * (ch + 30) + 120);
cv.text(10, 12, `${data.name ?? 'CUT'} BLOCKING PLAN (TOP DOWN)  ${shots.length} SHOTS ${Number(data.duration).toFixed(1)}S`, [255, 255, 255], 2);
shots.forEach((s, k) => {
  const x0 = 10 + (k % cols) * (cw + 10), y0 = top + Math.floor(k / cols) * (ch + 30);
  cv.rect(x0, y0, cw, ch, [28, 31, 40]);
  const pts: number[][] = [];
  for (const sm of s.samples) { pts.push([sm.pos[0], sm.pos[2]]); if (sm.subject) pts.push([sm.subject.pos[0], sm.subject.pos[2]]); }
  if (data.line) for (const p of data.line) pts.push(p);
  if (!pts.length) { cv.text(x0 + 6, y0 + 6, `${k + 1}. ${s.name}`.slice(0, 46)); return; }
  let xl = Infinity, xh = -Infinity, zl = Infinity, zh = -Infinity; for (const p of pts) { xl = Math.min(xl, p[0]); xh = Math.max(xh, p[0]); zl = Math.min(zl, p[1]); zh = Math.max(zh, p[1]); }
  const span = Math.max(xh - xl, zh - zl, 6) * 1.35; const cx = (xl + xh) / 2, cz = (zl + zh) / 2; const sc = (Math.min(cw, ch) - 30) / span;
  const X = (x: number) => x0 + cw / 2 + (x - cx) * sc, Y = (z: number) => y0 + ch / 2 + 10 + (z - cz) * sc;
  // grid every 10 studs
  for (let g = Math.ceil((cx - span / 2) / 10) * 10; g < cx + span / 2; g += 10) for (let y = y0 + 20; y < y0 + ch; y += 4) cv.set(X(g), y, [50, 54, 66]);
  // action line (180-degree rule): dashed, through both characters
  if (data.line && s.role !== 'card') {
    const [A, B] = data.line; const dx = B[0] - A[0], dz = B[1] - A[1]; const L2 = Math.hypot(dx, dz) || 1;
    for (let u = -3; u <= 4; u += 0.02) { if (Math.floor(u * 50) % 2) continue; const px = X(A[0] + dx * u), py = Y(A[1] + dz * u); if (px > x0 + 2 && px < x0 + cw - 2 && py > y0 + 18 && py < y0 + ch - 16) cv.dot(px, py, 0.8, [255, 200, 90], 0.7); }
    for (const p of data.line) cv.dot(X(p[0]), Y(p[1]), 3, [200, 200, 210]);
    // which side the camera is on
    const c = s.samples[Math.floor(s.samples.length / 2)].pos; const cr = dx * (c[2] - A[1]) - dz * (c[0] - A[0]);
    cv.text(x0 + cw - 60, y0 + 6, cr > 0 ? 'SIDE A' : 'SIDE B', cr > 0 ? [120, 220, 255] : [255, 150, 120]);
    void L2;
  }
  // camera path
  for (let i = 1; i < s.samples.length; i++) cv.line(X(s.samples[i - 1].pos[0]), Y(s.samples[i - 1].pos[2]), X(s.samples[i].pos[0]), Y(s.samples[i].pos[2]), [240, 240, 250], 0.9, 2);
  const mid = s.samples[Math.floor(s.samples.length / 2)];
  const col = SIZE_COL[s.size] ?? [200, 200, 200];
  // frustum at mid-shot
  const hf = Math.atan(Math.tan(mid.fov * Math.PI / 360) * 16 / 9);
  const lx = mid.look[0], lz = mid.look[2]; const ln = Math.hypot(lx, lz) || 1;
  const L = span * 0.45;
  for (const sgn of [-1, 1]) { const a = Math.atan2(lz / ln, lx / ln) + sgn * hf; cv.line(X(mid.pos[0]), Y(mid.pos[2]), X(mid.pos[0] + Math.cos(a) * L), Y(mid.pos[2] + Math.sin(a) * L), col, 0.8, 1); }
  cv.dot(X(mid.pos[0]), Y(mid.pos[2]), 4, col);
  // subject + facing
  for (const sm of s.samples) if (sm.subject) {
    const p = sm.subject.pos; cv.dot(X(p[0]), Y(p[2]), 3, [255, 120, 200]);
    const f = sm.subject.facing; cv.line(X(p[0]), Y(p[2]), X(p[0] + f[0] * 2.5), Y(p[2] + f[1] * 2.5), [255, 120, 200], 1, 2);
  }
  cv.text(x0 + 6, y0 + 6, `${k + 1}. ${s.name}`.slice(0, 46), [235, 235, 245]);
  cv.text(x0 + 6, y0 + ch - 12, `${Number(s.dur).toFixed(2)}S ${s.size ?? ''} FOV ${Math.round(s.fovMin)}${s.fovMax - s.fovMin > 1 ? '-' + Math.round(s.fovMax) : ''} ${s.moving ? 'MOVE' : 'STATIC'}`, col);
});
// timeline
const ty = top + rows * (ch + 30) + 10; const tw = cv.w - 20; const T = Number(data.duration) || 1;
cv.text(10, ty, 'TIMELINE (WIDTH = DURATION, COLOUR = SHOT SIZE: BLUE WIDE ... RED EXTREME CLOSE)', [200, 200, 215]);
shots.forEach((s) => { const x = 10 + s.start / T * tw, w = Math.max(2, s.dur / T * tw - 2); cv.rect(x, ty + 14, w, 30, s.role === 'card' ? [90, 90, 100] : (SIZE_COL[s.size] ?? [150, 150, 150])); });
for (let g = 0; g <= Math.floor(T); g++) { const x = 10 + g / T * tw; cv.line(x, ty + 46, x, ty + (g % 5 === 0 ? 56 : 50), [160, 160, 175]); if (g % 5 === 0) cv.text(x + 2, ty + 58, `${g}`, [160, 160, 175]); }
const fx = (data.findings ?? []).filter((f: any) => f.level !== 'info').length;
cv.text(10, ty + 76, `${fx} FINDINGS (SEE THE TEXT REPORT). PINK = SUBJECT AND FACING, WHITE = CAMERA PATH, CONE = VIEW AT MID-SHOT, AMBER DASHES = ACTION LINE (STAY ON ONE SIDE).`, [200, 200, 215]);
writeFileSync(args[1], cv.png());
console.log(`wrote ${args[1]}`);
