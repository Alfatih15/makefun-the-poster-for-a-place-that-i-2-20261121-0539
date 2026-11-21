// ZEPHYRIA — a travel poster for a place that isn't there.
// make.fun competition: the-poster-for-a-place-that-i-2-20261121-0539
//
// This program paints one 1024x1024 poster of the floating isles of
// Zephyria at dusk and writes it to /output/entry.png (or the directory
// named by $MAKEFUN_OUTPUT_DIR). Everything is computed here with the
// Node 22 standard library only: no network, no fonts on disk, no
// third-party packages. The picture is built from a small canvas class,
// a stroke-lettering table, and a hand-rolled PNG writer (zlib deflate
// plus a CRC32 table, both written out longhand below).
//
// The run is fully deterministic: one fixed seed drives every random
// choice, so the same bytes come out every time.
//
// SPDX-License-Identifier: MIT

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

const SIZE = 1024;
const OUT_NAME = "entry.png";
const MAX_BYTES = 1_048_576;

// A colour is three channel values, 0..255.
type Tint = [number, number, number];

function clampByte(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}

// SplitMix-style deterministic generator. One instance, one seed, and
// every random draw in the picture comes from it in paint order.
class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    let x = (this.state += 0x9e3779b9) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
    x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
    return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }
}
const rng = new Rng(20261121);

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Blend two colours channel by channel.
function mixTint(a: Tint, b: Tint, t: number): Tint {
  const out: Tint = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[i] = lerpNum(a[i], b[i], t);
  return out;
}

// ---------------------------------------------------------------------------
// Canvas — a flat RGB buffer plus the drawing verbs the poster needs.
// ---------------------------------------------------------------------------
class Canvas {
  readonly w: number;
  readonly h: number;
  readonly buf: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.buf = new Uint8Array(w * h * 3);
  }

  private idx(x: number, y: number): number {
    return (y * this.w + x) * 3;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  // Set a pixel outright.
  set(x: number, y: number, c: Tint): void {
    if (!this.inside(x, y)) return;
    const i = this.idx(x, y);
    this.buf[i] = clampByte(c[0]);
    this.buf[i + 1] = clampByte(c[1]);
    this.buf[i + 2] = clampByte(c[2]);
  }

  // Lay colour c over a pixel with opacity a (0..1).
  over(x: number, y: number, c: Tint, a: number): void {
    if (!this.inside(x, y) || a <= 0) return;
    if (a >= 1) {
      this.set(x, y, c);
      return;
    }
    const i = this.idx(x, y);
    for (let k = 0; k < 3; k++) {
      this.buf[i + k] = clampByte(lerpNum(this.buf[i + k], c[k], a));
    }
  }

  rect(x0: number, y0: number, x1: number, y1: number, c: Tint, a = 1): void {
    const xa = Math.max(0, Math.floor(x0));
    const xb = Math.min(this.w - 1, Math.ceil(x1));
    const ya = Math.max(0, Math.floor(y0));
    const yb = Math.min(this.h - 1, Math.ceil(y1));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) this.over(x, y, c, a);
    }
  }

  // Fill the whole canvas with a vertical gradient through [y, colour]
  // stops, with a whisper of dither so the sky never bands.
  vGrad(stops: Array<[number, Tint]>): void {
    for (let y = 0; y < this.h; y++) {
      let c: Tint = stops[stops.length - 1][1];
      for (let s = 0; s + 1 < stops.length; s++) {
        const y0 = stops[s][0];
        const y1 = stops[s + 1][0];
        if (y < y0) {
          c = stops[s][1];
          break;
        }
        if (y <= y1) {
          c = mixTint(stops[s][1], stops[s + 1][1], (y - y0) / Math.max(1, y1 - y0));
          break;
        }
      }
      const d = (rng.next() - 0.5) * 2.5;
      for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y);
        this.buf[i] = clampByte(c[0] + d);
        this.buf[i + 1] = clampByte(c[1] + d);
        this.buf[i + 2] = clampByte(c[2] + d);
      }
    }
  }

  // A disc whose rim softens over `feather` pixels.
  disc(cx: number, cy: number, r: number, c: Tint, a = 1, feather = 0): void {
    const xa = Math.max(0, Math.floor(cx - r - feather));
    const xb = Math.min(this.w - 1, Math.ceil(cx + r + feather));
    const ya = Math.max(0, Math.floor(cy - r - feather));
    const yb = Math.min(this.h - 1, Math.ceil(cy + r + feather));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r + feather) continue;
        let alpha = a;
        if (feather > 0 && d > r) alpha = a * (1 - (d - r) / feather);
        this.over(x, y, c, alpha);
      }
    }
  }

  // A soft ellipse: full strength inside, fading over `feather` outside.
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Tint, a = 1, feather = 18): void {
    const xa = Math.max(0, Math.floor(cx - rx - feather));
    const xb = Math.min(this.w - 1, Math.ceil(cx + rx + feather));
    const ya = Math.max(0, Math.floor(cy - ry - feather));
    const yb = Math.min(this.h - 1, Math.ceil(cy + ry + feather));
    const rim = feather / Math.max(rx, ry);
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d > 1 + rim) continue;
        const alpha = d <= 1 ? a : a * Math.max(0, 1 - (d - 1) / rim);
        this.over(x, y, c, alpha);
      }
    }
  }

  // Scanline fill of a polygon.
  poly(points: Array<[number, number]>, c: Tint, a = 1): void {
    let top = this.h;
    let bottom = 0;
    for (const p of points) {
      if (p[1] < top) top = p[1];
      if (p[1] > bottom) bottom = p[1];
    }
    for (let y = Math.max(0, Math.ceil(top)); y <= Math.min(this.h - 1, Math.floor(bottom)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const p0 = points[i];
        const p1 = points[(i + 1) % points.length];
        if ((p0[1] <= y && p1[1] > y) || (p1[1] <= y && p0[1] > y)) {
          xs.push(p0[0] + ((y - p0[1]) * (p1[0] - p0[0])) / (p1[1] - p0[1]));
        }
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k]));
        const xb = Math.min(this.w - 1, Math.floor(xs[k + 1]));
        for (let x = xa; x <= xb; x++) this.over(x, y, c, a);
      }
    }
  }

  // A thick segment, drawn as a chain of discs so caps and joins are round.
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: Tint, a = 1): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / Math.max(1, w / 3)));
    const r = w / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(lerpNum(x0, x1, t), lerpNum(y0, y1, t), r, c, a, 0.5);
    }
  }

  polyline(points: Array<[number, number]>, w: number, c: Tint, a = 1): void {
    for (let i = 0; i + 1 < points.length; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      this.line(p0[0], p0[1], p1[0], p1[1], w, c, a);
    }
  }
}

const cv = new Canvas(SIZE, SIZE);

// ---------------------------------------------------------------------------
// Stroke lettering. Each capital lives on a 6-wide by 10-tall grid as a
// string: strokes separated by "|", points inside a stroke separated by
// spaces, each point "x,y". The parser below turns a string into the
// polylines the canvas draws with a thick round pen.
// ---------------------------------------------------------------------------
const GLYPHS: Record<string, string> = {
  A: "0,10 3,0 6,10|1.3,6.5 4.7,6.5",
  B: "0,0 0,10|0,0 4,0 5.6,1.6 4,5 0,5|0,5 4.4,5 6,6.6 4.8,10 0,10",
  C: "5.6,1.6 4,0 1.6,0 0,2 0,8 1.6,10 4,10 5.6,8.4",
  D: "0,0 0,10 3.4,10 6,8 6,2 3.4,0 0,0",
  E: "6,0 0,0 0,10 6,10|0,5 4.4,5",
  F: "6,0 0,0 0,10|0,5 4.4,5",
  G: "5.6,1.6 4,0 1.6,0 0,2 0,8 1.6,10 4,10 6,8 6,5 3.4,5",
  H: "0,0 0,10|6,0 6,10|0,5 6,5",
  I: "3,0 3,10|1,0 5,0|1,10 5,10",
  J: "2,0 6,0|5,0 5,8 3.4,10 1.4,10 0.4,8.6",
  K: "0,0 0,10|5.6,0 0,5 5.6,10",
  L: "0,0 0,10 6,10",
  M: "0,10 0,0 3,6 6,0 6,10",
  N: "0,10 0,0 6,10 6,0",
  O: "1.6,0 4.4,0 6,2 6,8 4.4,10 1.6,10 0,8 0,2 1.6,0",
  P: "0,10 0,0 4,0 6,1.6 6,3.6 4,5 0,5",
  Q: "1.6,0 4.4,0 6,2 6,8 4.4,10 1.6,10 0,8 0,2 1.6,0|4,7.6 6.6,10.6",
  R: "0,10 0,0 4,0 6,1.6 6,3.6 4,5 0,5|3.6,5 6,10",
  S: "5.6,1.6 4,0 2,0 0.4,1.6 0.4,3.4 2,5 4,5 5.6,6.6 5.6,8.4 4,10 2,10 0.4,8.4",
  T: "0,0 6,0|3,0 3,10",
  U: "0,0 0,8 1.6,10 4.4,10 6,8 6,0",
  V: "0,0 3,10 6,0",
  W: "0,0 1.5,10 3,4 4.5,10 6,0",
  X: "0,0 6,10|6,0 0,10",
  Y: "0,0 3,5 6,0|3,5 3,10",
  Z: "0,0 6,0 0,10 6,10",
  "•": "3,4.4 3,5.6",
  "-": "1,5 5,5",
  "'": "3,0 3,2",
};

type Strokes = Array<Array<[number, number]>>;

function parseGlyph(spec: string): Strokes {
  const strokes: Strokes = [];
  for (const strokeText of spec.split("|")) {
    const pts: Array<[number, number]> = [];
    for (const pair of strokeText.trim().split(/\s+/)) {
      const [gx, gy] = pair.split(",");
      pts.push([Number(gx), Number(gy)]);
    }
    if (pts.length > 0) strokes.push(pts);
  }
  return strokes;
}

// Width of `text` in pixels at a glyph scale, tracking included.
function measureText(text: string, scale: number, tracking: number): number {
  let w = 0;
  for (const ch of text) {
    w += (ch === " " ? 4 : 6) * scale + tracking;
  }
  return w - tracking;
}

// Draw `text` centred on cx, its cap-top at `top`.
function drawText(
  text: string,
  cx: number,
  top: number,
  scale: number,
  strokeW: number,
  c: Tint,
  tracking: number,
  a = 1,
): void {
  let x = cx - measureText(text, scale, tracking) / 2;
  for (const ch of text) {
    if (ch === " ") {
      x += 4 * scale + tracking;
      continue;
    }
    const spec = GLYPHS[ch];
    if (spec !== undefined) {
      for (const stroke of parseGlyph(spec)) {
        const pts: Array<[number, number]> = [];
        for (const [gx, gy] of stroke) pts.push([x + gx * scale, top + gy * scale]);
        cv.polyline(pts, strokeW, c, a);
      }
    }
    x += 6 * scale + tracking;
  }
}

// ---------------------------------------------------------------------------
// The scene: ZEPHYRIA, floating isles above a calm sea at dusk.
// Colours are shared here so the palette stays one decision, not many.
// ---------------------------------------------------------------------------
const CREAM: Tint = [253, 243, 221];
const GOLD: Tint = [242, 178, 92];
const SUN_CORE: Tint = [255, 233, 176];
const INK: Tint = [18, 35, 58];

function paintSky(): void {
  cv.vGrad([
    [0, [22, 30, 68]],
    [260, [38, 74, 110]],
    [480, [94, 122, 128]],
    [620, [214, 141, 86]],
    [700, [242, 178, 92]],
  ]);
}

function paintSun(): void {
  cv.disc(690, 470, 190, [247, 185, 92], 0.35, 90);
  cv.disc(690, 470, 130, [250, 205, 120], 0.55, 50);
  cv.disc(690, 470, 96, SUN_CORE, 1, 2);
  cv.ellipse(690, 470, 150, 60, [255, 220, 160], 0.25, 40);
}

function cloud(cx: number, cy: number, s: number, tint: Tint, a: number): void {
  cv.ellipse(cx, cy, 150 * s, 26 * s, tint, a, 22);
  cv.ellipse(cx - 95 * s, cy + 10 * s, 95 * s, 20 * s, tint, a * 0.9, 18);
  cv.ellipse(cx + 100 * s, cy + 12 * s, 105 * s, 22 * s, tint, a * 0.9, 18);
  cv.ellipse(cx + 20 * s, cy - 16 * s, 80 * s, 18 * s, tint, a * 0.8, 16);
}

function paintClouds(): void {
  cloud(210, 268, 0.85, [246, 217, 184], 0.55);
  cloud(830, 238, 0.7, [250, 226, 196], 0.5);
  cloud(520, 300, 0.55, [238, 198, 168], 0.45);
  // Low mist hugging the horizon and the waterfalls' feet.
  cv.ellipse(512, 668, 480, 46, [248, 205, 150], 0.35, 40);
  cv.ellipse(300, 640, 260, 34, [240, 190, 140], 0.3, 36);
  cv.ellipse(760, 650, 300, 38, [250, 210, 155], 0.3, 36);
}

// One little pine: trunk plus three stacked triangles.
function pine(x: number, y: number, s: number, c: Tint): void {
  cv.rect(x - 1.4 * s, y - 6 * s, x + 1.4 * s, y, c);
  const tiers: Array<[number, number, number]> = [
    [7, 5, 16],
    [6, 11, 21],
    [4.6, 17, 25],
  ];
  for (const [half, base, tip] of tiers) {
    cv.poly(
      [
        [x - half * s, y - base * s],
        [x + half * s, y - base * s],
        [x, y - tip * s],
      ],
      c,
    );
  }
}

function waterfall(x: number, top: number, bottom: number, w: number): void {
  const steps = Math.floor((bottom - top) / 6);
  for (let i = 0; i < steps; i++) {
    const y = top + i * 6;
    const t = i / steps;
    const fade = 1 - t * 0.55;
    const wob = Math.sin(i * 0.9) * 2;
    cv.line(x + wob, y, x + wob, y + 7, w * fade, [214, 232, 226], 0.5 * fade);
    cv.line(x + w * 0.32 + wob, y, x + w * 0.32 + wob, y + 7, w * 0.5 * fade, [246, 250, 244], 0.6 * fade);
  }
  cv.ellipse(x, bottom + 8, w * 3.2, 16, [240, 228, 205], 0.5, 14);
}

interface IsleSpec {
  cx: number;
  top: number;
  halfW: number;
  depth: number;
  grass: Tint;
  rock: Tint;
  dark: Tint;
  pines: Array<[number, number, number]>;
  fall: [number, number, number, number] | null;
}

function paintIsle(spec: IsleSpec): void {
  const { cx, top, halfW, depth } = spec;
  const tipY = top + depth;
  // Rocky body, wide at the grass line and tapering to a point.
  cv.poly(
    [
      [cx - halfW, top],
      [cx + halfW, top],
      [cx + halfW * 0.55, top + depth * 0.45],
      [cx + halfW * 0.18, tipY],
      [cx - halfW * 0.22, top + depth * 0.55],
    ],
    spec.rock,
  );
  // A dark facet on the shaded side, a lit one where the sun catches it.
  cv.poly(
    [
      [cx + halfW * 0.1, top],
      [cx + halfW, top],
      [cx + halfW * 0.55, top + depth * 0.45],
      [cx + halfW * 0.18, tipY],
    ],
    spec.dark,
    0.55,
  );
  cv.poly(
    [
      [cx - halfW, top],
      [cx - halfW * 0.35, top],
      [cx - halfW * 0.22, top + depth * 0.55],
      [cx - halfW * 0.6, top + depth * 0.3],
    ],
    [255, 214, 150],
    0.28,
  );
  // Grassy crown, slightly domed, with a warm rim along the sunlit edge.
  cv.poly(
    [
      [cx - halfW, top],
      [cx + halfW, top],
      [cx + halfW - 14, top - 16],
      [cx - halfW + 14, top - 16],
    ],
    spec.grass,
  );
  cv.line(cx - halfW + 10, top - 15, cx + halfW - 10, top - 15, 4, [255, 205, 130], 0.8);
  for (const [px, py, ps] of spec.pines) {
    const shade: Tint = ps > 1.4 ? [16, 44, 40] : [14, 40, 36];
    pine(px, py, ps, shade);
  }
  if (spec.fall !== null) {
    waterfall(spec.fall[0], spec.fall[1], spec.fall[2], spec.fall[3]);
  }
}

// The three isles, largest first so the smaller ones overlap it naturally.
const ISLES: IsleSpec[] = [
  {
    cx: 330, top: 448, halfW: 175, depth: 150,
    grass: [46, 107, 79], rock: [24, 52, 66], dark: [14, 32, 46],
    pines: [[268, 434, 1.6], [318, 430, 1.9], [372, 434, 1.5], [420, 436, 1.2]],
    fall: [452, 452, 640, 13],
  },
  {
    cx: 742, top: 392, halfW: 128, depth: 108,
    grass: [52, 112, 82], rock: [26, 54, 68], dark: [14, 32, 46],
    pines: [[706, 380, 1.3], [748, 376, 1.5], [788, 380, 1.1]],
    fall: [838, 396, 560, 9],
  },
  {
    cx: 150, top: 560, halfW: 88, depth: 74,
    grass: [44, 96, 76], rock: [24, 50, 64], dark: [16, 34, 48],
    pines: [[128, 550, 1.0], [168, 548, 1.2]],
    fall: null,
  },
];

function airship(cx: number, cy: number, s: number): void {
  cv.ellipse(cx, cy, 46 * s, 30 * s, [198, 96, 62], 1, 3);
  cv.ellipse(cx, cy - 4 * s, 46 * s, 22 * s, [232, 140, 88], 0.9, 3);
  cv.rect(cx - 46 * s, cy - 8 * s, cx + 46 * s, cy + 2 * s, [253, 243, 221], 0.9);
  cv.ellipse(cx, cy - 12 * s, 30 * s, 12 * s, [255, 220, 160], 0.7, 4);
  cv.line(cx - 14 * s, cy + 30 * s, cx - 14 * s, cy + 40 * s, 2, INK, 0.9);
  cv.line(cx + 14 * s, cy + 30 * s, cx + 14 * s, cy + 40 * s, 2, INK, 0.9);
  cv.rect(cx - 18 * s, cy + 40 * s, cx + 18 * s, cy + 52 * s, INK, 0.95);
  cv.poly(
    [
      [cx + 44 * s, cy - 6 * s],
      [cx + 62 * s, cy - 18 * s],
      [cx + 58 * s, cy + 4 * s],
    ],
    [198, 96, 62],
  );
}

function bird(x: number, y: number, s: number): void {
  cv.line(x - 9 * s, y, x, y - 6 * s, 2.4, INK, 0.85);
  cv.line(x, y - 6 * s, x + 9 * s, y, 2.4, INK, 0.85);
}

const BIRDS: Array<[number, number, number]> = [
  [296, 318, 1.0],
  [348, 292, 0.8],
  [392, 330, 0.7],
  [580, 268, 0.75],
];

// ---------------------------------------------------------------------------
// Sea, headlands, lettering, frame.
// ---------------------------------------------------------------------------
function paintSea(): void {
  const horizon = 700;
  const top: Tint = [38, 92, 108];
  const bottom: Tint = [10, 30, 48];
  // The sea deepens from the horizon to the foot of the poster.
  for (let y = horizon; y < SIZE; y++) {
    const t = (y - horizon) / (SIZE - horizon);
    const c = mixTint(top, bottom, t);
    const d = (rng.next() - 0.5) * 2;
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 3;
      cv.buf[i] = clampByte(c[0] + d);
      cv.buf[i + 1] = clampByte(c[1] + d);
      cv.buf[i + 2] = clampByte(c[2] + d);
    }
  }
  // The sun-road: a shimmering column of gold under the sun, widening and
  // dimming as it runs down the water.
  for (let y = horizon + 6; y < 1010; y++) {
    const t = (y - horizon) / 310;
    const spread = 26 + t * 150;
    const count = 3 + Math.floor(t * 5);
    for (let k = 0; k < count; k++) {
      const x = 690 + (rng.next() - 0.5) * 2 * spread;
      const len = 14 + rng.next() * 42 * (1 - t * 0.4);
      const a = Math.max(0.04, (0.5 - t * 0.32) * (0.5 + rng.next() * 0.5));
      cv.line(x, y, x + len, y, 3.5, [255, 196, 110], a);
    }
  }
  // A few calm horizontal strokes for water texture.
  for (let k = 0; k < 46; k++) {
    const y = 720 + rng.next() * 280;
    const x = rng.next() * SIZE;
    const len = 20 + rng.next() * 90;
    cv.line(x, y, x + len, y, 2.5, [150, 200, 205], 0.05 + rng.next() * 0.1);
  }
}

function paintCliffs(): void {
  const dark: Tint = [13, 28, 44];
  const silhouette: Tint = [10, 22, 36];
  // Dark headlands frame the bottom corners and ground the composition.
  cv.poly(
    [[0, 1024], [0, 906], [86, 872], [150, 918], [216, 968], [252, 1024]],
    dark,
  );
  cv.poly(
    [[1024, 1024], [1024, 918], [950, 884], [892, 928], [836, 976], [800, 1024]],
    dark,
  );
  // Pines silhouetted on the headlands.
  const headlandPines: Array<[number, number, number]> = [
    [96, 884, 1.5],
    [140, 912, 1.1],
    [56, 902, 1.0],
    [936, 896, 1.4],
    [884, 930, 1.0],
  ];
  for (const [px, py, ps] of headlandPines) pine(px, py, ps, silhouette);
}

function paintTitle(): void {
  const name = "ZEPHYRIA";
  const tag = "SLEEP ABOVE THE CLOUDS";
  // A soft shadow first, then the cream lettering — the name reads first.
  drawText(name, 512 + 5, 82 + 6, 13.5, 8, [12, 24, 44], 26, 0.55);
  drawText(name, 512, 82, 13.5, 8, CREAM, 26, 1);
  // Gold rules flanking the tagline, then the tagline itself.
  const tagW = measureText(tag, 4.8, 6);
  const ruleY = 242;
  cv.line(512 - tagW / 2 - 72, ruleY, 512 - tagW / 2 - 20, ruleY, 3, GOLD, 0.95);
  cv.line(512 + tagW / 2 + 20, ruleY, 512 + tagW / 2 + 72, ruleY, 3, GOLD, 0.95);
  cv.disc(512 - tagW / 2 - 82, ruleY, 4, GOLD, 1);
  cv.disc(512 + tagW / 2 + 82, ruleY, 4, GOLD, 1);
  drawText(tag, 512, 228, 4.8, 3.2, [255, 226, 170], 6, 1);
  // A small compass star above the title, like a maker's mark.
  const cy = 52;
  cv.disc(512, cy, 3, GOLD, 1);
  cv.line(512, cy - 12, 512, cy + 12, 2.5, GOLD, 1);
  cv.line(512 - 12, cy, 512 + 12, cy, 2.5, GOLD, 1);
  cv.line(512 - 8, cy - 8, 512 + 8, cy + 8, 2, GOLD, 0.8);
  cv.line(512 + 8, cy - 8, 512 - 8, cy + 8, 2, GOLD, 0.8);
}

function paintFrame(): void {
  // A thin double rule, the way a printed poster is edged.
  const rules: Array<[number, number, number]> = [
    [26, 3, 0.85],
    [36, 1.5, 0.4],
  ];
  for (const [m, w, a] of rules) {
    cv.line(m, m, SIZE - m, m, w, CREAM, a);
    cv.line(m, SIZE - m, SIZE - m, SIZE - m, w, CREAM, a);
    cv.line(m, m, m, SIZE - m, w, CREAM, a);
    cv.line(SIZE - m, m, SIZE - m, SIZE - m, w, CREAM, a);
  }
}

function paint(): void {
  paintSky();
  paintSun();
  paintClouds();
  for (const isle of ISLES) paintIsle(isle);
  airship(846, 300, 0.85);
  for (const [bx, by, bs] of BIRDS) bird(bx, by, bs);
  paintSea();
  paintCliffs();
  paintTitle();
  paintFrame();
}

// ---------------------------------------------------------------------------
// PNG writer, written out longhand: signature, IHDR, one IDAT (zlib
// deflate at level 9), IEND. Each scanline is stored with the filter —
// None or Up — whose signed bytes sum smaller, which keeps the file
// well under the 1 MiB gate.
// ---------------------------------------------------------------------------
function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = buildCrcTable();

function crc32Of(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32Of(body), 8 + data.length);
  return out;
}

// Score a filtered row by the sum of absolute signed byte values: the
// filter that makes the row's bytes smallest compresses best.
function scoreFiltered(row: Uint8Array, prev: Uint8Array, useUp: boolean): number {
  let total = 0;
  for (let i = 0; i < row.length; i++) {
    const v = useUp ? (row[i] - prev[i] + 256) % 256 : row[i];
    total += v > 127 ? 256 - v : v;
  }
  return total;
}

function encodePNG(): Buffer {
  const stride = SIZE * 3;
  const raw = Buffer.alloc(SIZE * (1 + stride));
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < SIZE; y++) {
    const row = cv.buf.subarray(y * stride, (y + 1) * stride);
    const off = y * (1 + stride);
    const useUp = scoreFiltered(row, prev, true) < scoreFiltered(row, prev, false);
    raw[off] = useUp ? 2 : 0;
    for (let i = 0; i < stride; i++) {
      raw[off + 1 + i] = useUp ? (row[i] - prev[i] + 256) % 256 : row[i];
    }
    prev.set(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2: truecolour RGB
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  const idat = deflateSync(raw, { level: 9 });
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ];
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  paint();
  const png = encodePNG();
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, OUT_NAME);
  writeFileSync(outPath, png);
  const sha = createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${outPath} (${png.length} bytes, sha256 ${sha})`);
  if (png.length > MAX_BYTES) {
    console.error("ERROR: entry.png exceeds the 1 MiB gate");
    process.exit(1);
  }
}

main();
