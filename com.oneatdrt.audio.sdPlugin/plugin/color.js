'use strict';

// Picks a knob ring colour for the playing source: a known site's brand colour when a browser is
// playing, otherwise the dominant vivid colour of the app icon.

const { siteInfo } = require('./sites');

function siteColor(url) {
  return siteInfo(url)?.color || null;
}

function maskShift(mask) {
  let shift = 0;
  while (mask && !(mask & 1)) { mask >>>= 1; shift += 1; }
  return shift;
}

// Decodes the 32-bit BI_BITFIELDS BMP that `sips -s format bmp` writes into [{r,g,b,a}].
function parseBmp(buf) {
  if (buf.toString('latin1', 0, 2) !== 'BM') throw new Error('not a BMP');
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  if (bpp !== 32) throw new Error(`unsupported BMP depth ${bpp}`);
  const compression = buf.readUInt32LE(30);
  const masks = compression === 3
    ? [buf.readUInt32LE(54), buf.readUInt32LE(58), buf.readUInt32LE(62), buf.readUInt32LE(66)]
    : [0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000];
  const shifts = masks.map(maskShift);
  const pixels = [];
  const height = Math.abs(rawHeight);
  for (let i = 0; i < width * height; i += 1) {
    const v = buf.readUInt32LE(offset + i * 4);
    const [r, g, b, a] = masks.map((m, c) => (masks[c] ? ((v & m) >>> shifts[c]) & 255 : 255));
    pixels.push({ r, g, b, a });
  }
  return pixels;
}

function toHsv({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max / 255 };
}

// The most prominent vivid colour: hue histogram weighted by saturation × brightness, ignoring
// transparent, grey, black and white pixels. Returned at full brightness so the LED looks vivid.
function dominantColor(pixels) {
  const buckets = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  for (const p of pixels) {
    if (p.a < 128) continue;
    const { h, s, v } = toHsv(p);
    if (s < 0.35 || v < 0.3) continue;
    const w = s * v;
    const bucket = buckets[Math.floor(h / 15) % 24];
    bucket.weight += w;
    bucket.r += p.r * w;
    bucket.g += p.g * w;
    bucket.b += p.b * w;
  }
  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a));
  if (best.weight === 0) return null;
  const rgb = [best.r, best.g, best.b].map((c) => c / best.weight);
  const scale = 255 / Math.max(...rgb, 1);
  return rgb.map((c) => Math.min(255, Math.round(c * scale)));
}

function dim(rgb, factor) {
  return rgb.map((c) => Math.round(c * factor));
}

module.exports = { siteInfo, siteColor, parseBmp, dominantColor, dim };
