// Draws the extension icons (16/48/128) with pure Node: supersampled rasterizer + PNG encoder (zlib).
import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/icons');
const SS = 4; // supersampling factor

// 5x7 bitmap font for the glyphs we need.
const FONT = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  ';': ['000', '000', '010', '010', '000', '010', '100'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
};

function insideRoundRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Returns a function (x,y in 0..size) -> [r,g,b,a] or null for "no ink" on top of the base.
function makeShape(size) {
  const r = size * 0.22;
  const bg = [67, 56, 202]; // indigo, reads on both light and dark toolbars
  const fg = [255, 255, 255];
  const ring = size * 0.045;
  const marks = []; // rects in size units
  if (size >= 48) {
    const cols = 27;
    const cell = (size * 0.8) / cols;
    const x0 = (size - cell * cols) / 2;
    const y0 = (size - cell * 7) / 2;
    let cx = x0;
    for (const ch of 'TL;DR') {
      const g = FONT[ch];
      g.forEach((row, ry) => [...row].forEach((v, rx) => v === '1' && marks.push([cx + rx * cell, y0 + ry * cell, cell, cell])));
      cx += (g[0].length + 1) * cell;
    }
  } else {
    // 16px: text is illegible, draw a "summary lines" glyph instead.
    const w = size;
    marks.push([w * 0.2, w * 0.24, w * 0.6, w * 0.15], [w * 0.2, w * 0.46, w * 0.6, w * 0.15], [w * 0.2, w * 0.68, w * 0.36, w * 0.15]);
  }
  return (x, y) => {
    if (!insideRoundRect(x, y, size, r)) return null;
    for (const [mx, my, mw, mh] of marks) if (x >= mx && x < mx + mw && y >= my && y < my + mh) return [...fg, 255];
    if (!insideRoundRect(x, y, size, r) || !insideRoundRect(x - ring, y - ring, size - 2 * ring, r - ring) ) return [165, 180, 252, 255];
    return [...bg, 255];
  };
}

function render(size) {
  const shape = makeShape(size);
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shape(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const cov = a / (255 * n);
      px[i] = cov ? Math.round(r / (cov * n)) : 0;
      px[i + 1] = cov ? Math.round(g / (cov * n)) : 0;
      px[i + 2] = cov ? Math.round(b / (cov * n)) : 0;
      px[i + 3] = Math.round(cov * 255);
    }
  }
  return encodePng(size, px);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(outDir, { recursive: true });
for (const s of [16, 48, 128]) {
  await writeFile(path.join(outDir, `icon${s}.png`), render(s));
  console.log(`icon${s}.png`);
}
