'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVolumeSettings, nextVolume } = require('./audio');
const { renderAudio, statusLine } = require('./render');

test('parses osascript volume settings', () => {
  assert.deepEqual(parseVolumeSettings('output volume:56, input volume:28, alert volume:100, output muted:false'),
    { volume: 56, speakerMuted: false, micLevel: 28, micMuted: false });
  assert.deepEqual(parseVolumeSettings('output volume:56, input volume:0, alert volume:100, output muted:true'),
    { volume: 56, speakerMuted: true, micLevel: 0, micMuted: true });
  const noDevice = parseVolumeSettings('output volume:missing value, input volume:missing value, alert volume:100, output muted:missing value');
  assert.equal(noDevice.speakerMuted, false);
  assert.equal(noDevice.micMuted, false);
});

test('volume steps are clamped', () => {
  assert.equal(nextVolume(50, 3), 56);
  assert.equal(nextVolume(1, -2), 0);
  assert.equal(nextVolume(99, 5), 100);
});

test('status line and rendering reflect mute state', () => {
  assert.equal(statusLine({ speakerMuted: true, micMuted: true }).text, 'ALL MUTED');
  assert.equal(statusLine({ speakerMuted: false, micMuted: true }).text, 'MIC MUTED');
  assert.equal(statusLine({ speakerMuted: true, micMuted: false }).text, 'SPEAKER MUTED');
  const svg = decodeURIComponent(renderAudio({ volume: 40, speakerMuted: true, micMuted: true, micLevel: 0 }));
  assert.match(svg, /ALL MUTED/);
  assert.match(svg, /width="176" height="112"/);
  assert.match(decodeURIComponent(renderAudio({ volume: 40, speakerMuted: false, micMuted: false }, { square: true })), /width="144"/);
});

const { parseRingColors, buildPacket, hexToRgb } = require('./knob-led');

test('reads knob ring colours from the Stream Dock config', () => {
  const ini = '[DeviceBrightness]\nN4ProE000000000000=100\n\n[DeviceLightBrightness]\nN4ProE000000000000=2\nN4ProE000000000000\\2=#19fa1f\nN4ProE000000000000\\3=#584dfa\n\n[K1ProUSDeviceConfig]\nx=1\n';
  assert.deepEqual(parseRingColors(ini), [[0, 0, 0], [0, 0, 0], [0x19, 0xfa, 0x1f], [0x58, 0x4d, 0xfa]]);
  assert.deepEqual(parseRingColors(''), [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(hexToRgb('#ff0000'), [255, 0, 0]);
});

test('builds the SETLB HID packet', () => {
  const buf = buildPacket([[1, 2, 3], [4, 5, 6], [255, 0, 0], [7, 8, 9]]);
  assert.equal(buf.length, 1025);
  assert.equal(buf.subarray(1, 11).toString('latin1'), 'CRT\0\0SETLB');
  assert.deepEqual([...buf.subarray(11, 23)], [1, 2, 3, 4, 5, 6, 255, 0, 0, 7, 8, 9]);
  assert.equal(buf[23], 0);
});
