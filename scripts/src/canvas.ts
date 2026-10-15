// Tiny dependency-free raster canvas with a 5x7 font, PNG output via adn's encoder.
import { rgbaToPng } from '<adn checkout>/packages/core/src/png-encoder.ts';

export type RGB = [number, number, number];

// 5x7 glyphs, rows top to bottom, 5 bits each (MSB = left).
const F: Record<string, number[]> = {
  'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30], 'C': [14, 17, 16, 16, 16, 17, 14], 'D': [30, 17, 17, 17, 17, 17, 30],
  'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16], 'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17],
  'I': [14, 4, 4, 4, 4, 4, 14], 'J': [7, 2, 2, 2, 2, 18, 12], 'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
  'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 17, 25, 21, 19, 17, 17], 'O': [14, 17, 17, 17, 17, 17, 14], 'P': [30, 17, 17, 30, 16, 16, 16],
  'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17], 'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4],
  'U': [17, 17, 17, 17, 17, 17, 14], 'V': [17, 17, 17, 17, 17, 10, 4], 'W': [17, 17, 17, 21, 21, 21, 10], 'X': [17, 17, 10, 4, 10, 17, 17],
  'Y': [17, 17, 10, 4, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
  '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0], '/': [1, 1, 2, 4, 8, 16, 16], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], '%': [24, 25, 2, 4, 8, 19, 3], '_': [0, 0, 0, 0, 0, 0, 31], '=': [0, 0, 31, 0, 31, 0, 0],
  '>': [8, 4, 2, 1, 2, 4, 8], '<': [2, 4, 8, 16, 8, 4, 2], '[': [14, 8, 8, 8, 8, 8, 14], ']': [14, 2, 2, 2, 2, 2, 14],
  '#': [10, 10, 31, 10, 31, 10, 10], '*': [0, 4, 21, 14, 21, 4, 0], '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4],
  "'": [4, 4, 8, 0, 0, 0, 0], '|': [4, 4, 4, 4, 4, 4, 4], '~': [0, 0, 8, 21, 2, 0, 0],
};
F['°'] = [12, 18, 18, 12, 0, 0, 0];

export class Canvas {
  readonly w: number; readonly h: number; readonly px: Buffer;
  constructor(w: number, h: number, bg: RGB = [18, 20, 26]) {
    this.w = w; this.h = h; this.px = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) { this.px[i * 4] = bg[0]; this.px[i * 4 + 1] = bg[1]; this.px[i * 4 + 2] = bg[2]; this.px[i * 4 + 3] = 255; }
  }
  set(x: number, y: number, c: RGB, a = 1) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.px[i] = this.px[i] * (1 - a) + c[0] * a; this.px[i + 1] = this.px[i + 1] * (1 - a) + c[1] * a; this.px[i + 2] = this.px[i + 2] * (1 - a) + c[2] * a;
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 1) {
    for (let j = Math.max(0, Math.floor(y)); j < Math.min(this.h, y + h); j++) for (let i = Math.max(0, Math.floor(x)); i < Math.min(this.w, x + w); i++) this.set(i, j, c, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1, thick = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
      if (thick <= 1) this.set(x, y, c, a); else this.dot(x, y, thick / 2, c, a);
    }
  }
  dot(x: number, y: number, r: number, c: RGB, a = 1) {
    for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) if (i * i + j * j <= r * r + 0.25) this.set(x + i, y + j, c, a);
  }
  text(x: number, y: number, s: string, c: RGB = [230, 232, 238], scale = 1) {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = F[ch] ?? F['?'];
      for (let r = 0; r < 7; r++) for (let b = 0; b < 5; b++) if (g[r] & (16 >> b)) this.rect(cx + b * scale, y + r * scale, scale, scale, c);
      cx += 6 * scale;
    }
    return cx;
  }
  textWidth(s: string, scale = 1) { return s.length * 6 * scale; }
  png(): Buffer { return rgbaToPng(this.px, this.w, this.h); }
}

export function speedColor(t: number): RGB {
  // 0 = slow (blue) .. 1 = fast (red), through green/yellow
  t = Math.max(0, Math.min(1, t));
  const stops: RGB[] = [[70, 130, 255], [60, 210, 200], [120, 230, 90], [250, 220, 60], [255, 80, 60]];
  const s = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(s)), f = s - i;
  return [0, 1, 2].map((k) => stops[i][k] * (1 - f) + stops[i + 1][k] * f) as RGB;
}
