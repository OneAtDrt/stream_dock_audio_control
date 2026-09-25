'use strict';

// The Stream Dock plugin API has no way to colour knob rings, so we talk to the N4 Pro directly
// over USB HID, opened NON-exclusively (hidapi seizes the device by default on macOS, which knocks
// Stream Dock off it and freezes the screen). Protocol from mirajazz:
// report 0 + "CRT\0\0SETLB" + [r,g,b] per knob, padded to 1024 bytes.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VENDOR_ID = 0x5548;
const PRODUCT_IDS = [0x1021, 0x1023, 0x1008]; // N4 Pro E, VSD N4 Pro, N4 Pro
const USAGE_PAGE = 0xffa0;
const PACKET_SIZE = 1024;
const KNOB_COUNT = 4;
const HEADER = [0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x53, 0x45, 0x54, 0x4c, 0x42];
const CONFIG_FILE = path.join(os.homedir(), 'Library/Application Support/HotSpot/StreamDock/config/StreamDockConfig.plist');

let HID = null;
try {
  HID = require('node-hid');
} catch {
  // Without node-hid the knob panel still works; only the ring colour is skipped.
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Ring colours chosen in the Stream Dock app live in its INI-style config:
//   [DeviceLightBrightness]
//   N4ProE000000000000\2=#19fa1f
function parseRingColors(text) {
  const colors = Array.from({ length: KNOB_COUNT }, () => [0, 0, 0]);
  const section = /\[DeviceLightBrightness\]([\s\S]*?)(?:\n\[|$)/.exec(text || '');
  if (!section) return colors;
  for (const match of section[1].matchAll(/^N4Pro\w*\\(\d)=(#[0-9a-fA-F]{6})\s*$/gm)) {
    const index = Number(match[1]);
    if (index < KNOB_COUNT) colors[index] = hexToRgb(match[2]);
  }
  return colors;
}

function readRingColors() {
  try {
    return parseRingColors(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return Array.from({ length: KNOB_COUNT }, () => [0, 0, 0]);
  }
}

function buildPacket(colors) {
  const buf = Buffer.alloc(1 + PACKET_SIZE);
  Buffer.from(HEADER).copy(buf);
  colors.slice(0, KNOB_COUNT).flat().forEach((value, i) => { buf[HEADER.length + i] = value; });
  return buf;
}

function writeColors(colors) {
  if (!HID) throw new Error('node-hid unavailable');
  const info = HID.devices().find((d) => d.vendorId === VENDOR_ID && PRODUCT_IDS.includes(d.productId) && d.usagePage === USAGE_PAGE);
  if (!info) throw new Error('N4 Pro not found');
  const device = new HID.HID(info.path, { nonExclusive: true });
  try {
    device.write([...buildPacket(colors)]);
  } finally {
    device.close();
  }
}

// Paints `knobIndex` with `rgb` and every other ring with the colour set in the Stream Dock app.
function setKnobColor(knobIndex, rgb) {
  const colors = readRingColors();
  if (knobIndex >= 0 && knobIndex < KNOB_COUNT) colors[knobIndex] = rgb;
  writeColors(colors);
}

module.exports = { setKnobColor, readRingColors, parseRingColors, buildPacket, hexToRgb };
