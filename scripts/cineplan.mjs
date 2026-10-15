// cineplan.ts
import { readFileSync, writeFileSync } from "fs";

// ../../../tmp/adn/packages/core/src/png-encoder.ts
import { deflateSync } from "zlib";
var PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
var CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let crc = 4294967295;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
function writeChunk(type, data2) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data2.length);
  const crcInput = Buffer.concat([typeBytes, data2]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([length, typeBytes, data2, checksum]);
}
function rgbaToPng(rgba, width, height) {
  if (width <= 0 || height <= 0) throw new Error(`Invalid PNG dimensions: ${width}x${height}`);
  const expected = width * height * 4;
  if (rgba.length < expected) throw new Error(`Buffer too small: got ${rgba.length}, need ${expected}`);
  const stride = width * 4;
  const filtered = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    filtered[y * (1 + stride)] = 0;
    rgba.copy(filtered, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    writeChunk("IHDR", ihdr),
    writeChunk("IDAT", deflateSync(filtered)),
    writeChunk("IEND", Buffer.alloc(0))
  ]);
}

// canvas.ts
var F = {
  "A": [14, 17, 17, 31, 17, 17, 17],
  "B": [30, 17, 17, 30, 17, 17, 30],
  "C": [14, 17, 16, 16, 16, 17, 14],
  "D": [30, 17, 17, 17, 17, 17, 30],
  "E": [31, 16, 16, 30, 16, 16, 31],
  "F": [31, 16, 16, 30, 16, 16, 16],
  "G": [14, 17, 16, 23, 17, 17, 15],
  "H": [17, 17, 17, 31, 17, 17, 17],
  "I": [14, 4, 4, 4, 4, 4, 14],
  "J": [7, 2, 2, 2, 2, 18, 12],
  "K": [17, 18, 20, 24, 20, 18, 17],
  "L": [16, 16, 16, 16, 16, 16, 31],
  "M": [17, 27, 21, 21, 17, 17, 17],
  "N": [17, 17, 25, 21, 19, 17, 17],
  "O": [14, 17, 17, 17, 17, 17, 14],
  "P": [30, 17, 17, 30, 16, 16, 16],
  "Q": [14, 17, 17, 17, 21, 18, 13],
  "R": [30, 17, 17, 30, 20, 18, 17],
  "S": [15, 16, 16, 14, 1, 1, 30],
  "T": [31, 4, 4, 4, 4, 4, 4],
  "U": [17, 17, 17, 17, 17, 17, 14],
  "V": [17, 17, 17, 17, 17, 10, 4],
  "W": [17, 17, 17, 21, 21, 21, 10],
  "X": [17, 17, 10, 4, 10, 17, 17],
  "Y": [17, 17, 10, 4, 4, 4, 4],
  "Z": [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0],
  "-": [0, 0, 0, 31, 0, 0, 0],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "/": [1, 1, 2, 4, 8, 16, 16],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "%": [24, 25, 2, 4, 8, 19, 3],
  "_": [0, 0, 0, 0, 0, 0, 31],
  "=": [0, 0, 31, 0, 31, 0, 0],
  ">": [8, 4, 2, 1, 2, 4, 8],
  "<": [2, 4, 8, 16, 8, 4, 2],
  "[": [14, 8, 8, 8, 8, 8, 14],
  "]": [14, 2, 2, 2, 2, 2, 14],
  "#": [10, 10, 31, 10, 31, 10, 10],
  "*": [0, 4, 21, 14, 21, 4, 0],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "'": [4, 4, 8, 0, 0, 0, 0],
  "|": [4, 4, 4, 4, 4, 4, 4],
  "~": [0, 0, 8, 21, 2, 0, 0]
};
F["\xB0"] = [12, 18, 18, 12, 0, 0, 0];
var Canvas = class {
  w;
  h;
  px;
  constructor(w, h, bg = [18, 20, 26]) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 4] = bg[0];
      this.px[i * 4 + 1] = bg[1];
      this.px[i * 4 + 2] = bg[2];
      this.px[i * 4 + 3] = 255;
    }
  }
  set(x, y, c, a = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = this.px[i] * (1 - a) + c[0] * a;
    this.px[i + 1] = this.px[i + 1] * (1 - a) + c[1] * a;
    this.px[i + 2] = this.px[i + 2] * (1 - a) + c[2] * a;
  }
  rect(x, y, w, h, c, a = 1) {
    for (let j = Math.max(0, Math.floor(y)); j < Math.min(this.h, y + h); j++) for (let i = Math.max(0, Math.floor(x)); i < Math.min(this.w, x + w); i++) this.set(i, j, c, a);
  }
  line(x0, y0, x1, y1, c, a = 1, thick = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
      if (thick <= 1) this.set(x, y, c, a);
      else this.dot(x, y, thick / 2, c, a);
    }
  }
  dot(x, y, r, c, a = 1) {
    for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) if (i * i + j * j <= r * r + 0.25) this.set(x + i, y + j, c, a);
  }
  text(x, y, s, c = [230, 232, 238], scale = 1) {
    let cx = x;
    for (const ch2 of s.toUpperCase()) {
      const g = F[ch2] ?? F["?"];
      for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (g[r] & 16 >> b) this.rect(cx + b * scale, y + r * scale, scale, scale, c);
      cx += 6 * scale;
    }
    return cx;
  }
  textWidth(s, scale = 1) {
    return s.length * 6 * scale;
  }
  png() {
    return rgbaToPng(this.px, this.w, this.h);
  }
};

// cineplan.ts
var args = process.argv.slice(2);
if (args.length < 2) {
  console.error("usage: node cineplan.mjs <analyze.json> <plan.png>\nSave the string Cine.analyze(cut, { json = true }) returns to a file, then draw it.");
  process.exit(2);
}
var data = JSON.parse(readFileSync(args[0], "utf8"));
var shots = data.shots ?? [];
var SIZE_COL = { EWS: [60, 90, 160], VWS: [70, 110, 190], WS: [80, 140, 220], FS: [90, 170, 210], MWS: [90, 190, 170], MS: [110, 200, 120], MCU: [200, 200, 90], CU: [230, 150, 70], ECU: [235, 90, 80] };
var cols = 4;
var cw = 300;
var ch = 260;
var top = 44;
var rows = Math.max(1, Math.ceil(shots.length / cols));
var cv = new Canvas(cols * (cw + 10) + 10, top + rows * (ch + 30) + 120);
cv.text(10, 12, `${data.name ?? "CUT"} BLOCKING PLAN (TOP DOWN)  ${shots.length} SHOTS ${Number(data.duration).toFixed(1)}S`, [255, 255, 255], 2);
shots.forEach((s, k) => {
  const x0 = 10 + k % cols * (cw + 10), y0 = top + Math.floor(k / cols) * (ch + 30);
  cv.rect(x0, y0, cw, ch, [28, 31, 40]);
  const pts = [];
  for (const sm of s.samples) {
    pts.push([sm.pos[0], sm.pos[2]]);
    if (sm.subject) pts.push([sm.subject.pos[0], sm.subject.pos[2]]);
  }
  if (data.line) for (const p of data.line) pts.push(p);
  if (!pts.length) {
    cv.text(x0 + 6, y0 + 6, `${k + 1}. ${s.name}`.slice(0, 46));
    return;
  }
  let xl = Infinity, xh = -Infinity, zl = Infinity, zh = -Infinity;
  for (const p of pts) {
    xl = Math.min(xl, p[0]);
    xh = Math.max(xh, p[0]);
    zl = Math.min(zl, p[1]);
    zh = Math.max(zh, p[1]);
  }
  const span = Math.max(xh - xl, zh - zl, 6) * 1.35;
  const cx = (xl + xh) / 2, cz = (zl + zh) / 2;
  const sc = (Math.min(cw, ch) - 30) / span;
  const X = (x) => x0 + cw / 2 + (x - cx) * sc, Y = (z) => y0 + ch / 2 + 10 + (z - cz) * sc;
  for (let g = Math.ceil((cx - span / 2) / 10) * 10; g < cx + span / 2; g += 10) for (let y = y0 + 20; y < y0 + ch; y += 4) cv.set(X(g), y, [50, 54, 66]);
  if (data.line && s.role !== "card") {
    const [A, B] = data.line;
    const dx = B[0] - A[0], dz = B[1] - A[1];
    const L2 = Math.hypot(dx, dz) || 1;
    for (let u = -3; u <= 4; u += 0.02) {
      if (Math.floor(u * 50) % 2) continue;
      const px = X(A[0] + dx * u), py = Y(A[1] + dz * u);
      if (px > x0 + 2 && px < x0 + cw - 2 && py > y0 + 18 && py < y0 + ch - 16) cv.dot(px, py, 0.8, [255, 200, 90], 0.7);
    }
    for (const p of data.line) cv.dot(X(p[0]), Y(p[1]), 3, [200, 200, 210]);
    const c = s.samples[Math.floor(s.samples.length / 2)].pos;
    const cr = dx * (c[2] - A[1]) - dz * (c[0] - A[0]);
    cv.text(x0 + cw - 60, y0 + 6, cr > 0 ? "SIDE A" : "SIDE B", cr > 0 ? [120, 220, 255] : [255, 150, 120]);
  }
  for (let i = 1; i < s.samples.length; i++) cv.line(X(s.samples[i - 1].pos[0]), Y(s.samples[i - 1].pos[2]), X(s.samples[i].pos[0]), Y(s.samples[i].pos[2]), [240, 240, 250], 0.9, 2);
  const mid = s.samples[Math.floor(s.samples.length / 2)];
  const col = SIZE_COL[s.size] ?? [200, 200, 200];
  const hf = Math.atan(Math.tan(mid.fov * Math.PI / 360) * 16 / 9);
  const lx = mid.look[0], lz = mid.look[2];
  const ln = Math.hypot(lx, lz) || 1;
  const L = span * 0.45;
  for (const sgn of [-1, 1]) {
    const a = Math.atan2(lz / ln, lx / ln) + sgn * hf;
    cv.line(X(mid.pos[0]), Y(mid.pos[2]), X(mid.pos[0] + Math.cos(a) * L), Y(mid.pos[2] + Math.sin(a) * L), col, 0.8, 1);
  }
  cv.dot(X(mid.pos[0]), Y(mid.pos[2]), 4, col);
  for (const sm of s.samples) if (sm.subject) {
    const p = sm.subject.pos;
    cv.dot(X(p[0]), Y(p[2]), 3, [255, 120, 200]);
    const f = sm.subject.facing;
    cv.line(X(p[0]), Y(p[2]), X(p[0] + f[0] * 2.5), Y(p[2] + f[1] * 2.5), [255, 120, 200], 1, 2);
  }
  cv.text(x0 + 6, y0 + 6, `${k + 1}. ${s.name}`.slice(0, 46), [235, 235, 245]);
  cv.text(x0 + 6, y0 + ch - 12, `${Number(s.dur).toFixed(2)}S ${s.size ?? ""} FOV ${Math.round(s.fovMin)}${s.fovMax - s.fovMin > 1 ? "-" + Math.round(s.fovMax) : ""} ${s.moving ? "MOVE" : "STATIC"}`, col);
});
var ty = top + rows * (ch + 30) + 10;
var tw = cv.w - 20;
var T = Number(data.duration) || 1;
cv.text(10, ty, "TIMELINE (WIDTH = DURATION, COLOUR = SHOT SIZE: BLUE WIDE ... RED EXTREME CLOSE)", [200, 200, 215]);
shots.forEach((s) => {
  const x = 10 + s.start / T * tw, w = Math.max(2, s.dur / T * tw - 2);
  cv.rect(x, ty + 14, w, 30, s.role === "card" ? [90, 90, 100] : SIZE_COL[s.size] ?? [150, 150, 150]);
});
for (let g = 0; g <= Math.floor(T); g++) {
  const x = 10 + g / T * tw;
  cv.line(x, ty + 46, x, ty + (g % 5 === 0 ? 56 : 50), [160, 160, 175]);
  if (g % 5 === 0) cv.text(x + 2, ty + 58, `${g}`, [160, 160, 175]);
}
var fx = (data.findings ?? []).filter((f) => f.level !== "info").length;
cv.text(10, ty + 76, `${fx} FINDINGS (SEE THE TEXT REPORT). PINK = SUBJECT AND FACING, WHITE = CAMERA PATH, CONE = VIEW AT MID-SHOT, AMBER DASHES = ACTION LINE (STAY ON ONE SIDE).`, [200, 200, 215]);
writeFileSync(args[1], cv.png());
console.log(`wrote ${args[1]}`);
