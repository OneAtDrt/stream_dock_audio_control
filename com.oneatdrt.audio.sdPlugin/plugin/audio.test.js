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

const { volumeCommands } = require('./audio');
const { applyStreamLine, toTrack } = require('./nowplaying');
const { renderNowPlaying } = require('./render');

test('knob at 0 mutes the output, above 0 unmutes', () => {
  assert.deepEqual(volumeCommands(0), ['set volume output volume 0', 'set volume with output muted']);
  assert.deepEqual(volumeCommands(4), ['set volume output volume 4', 'set volume without output muted']);
});

test('merges media-control stream snapshots and diffs', () => {
  let info = {};
  info = applyStreamLine(info, '{"type":"data","diff":false,"payload":{"bundleIdentifier":"com.example.player","title":"Song","artist":"Band","playing":true}}');
  assert.deepEqual(toTrack(info), { bundleId: 'com.example.player', pid: null, title: 'Song', artist: 'Band', album: '', playing: true });
  info = applyStreamLine(info, '{"type":"data","diff":true,"payload":{"playing":false}}');
  assert.equal(toTrack(info).playing, false);
  assert.equal(toTrack(info).title, 'Song');
  assert.deepEqual(toTrack({ bundleIdentifier: 'com.apple.WebKit.GPU', parentApplicationBundleIdentifier: 'com.apple.Safari', processIdentifier: 7, title: 'T', playing: true }),
    { bundleId: 'com.apple.Safari', pid: null, title: 'T', artist: '', album: '', playing: true });
  info = applyStreamLine(info, 'not json');
  assert.equal(toTrack(info).title, 'Song');
  info = applyStreamLine(info, '{"type":"data","diff":false,"payload":{}}');
  assert.equal(toTrack(info), null);
});

test('now playing panel renders track, idle and error states', () => {
  const np = { track: { bundleId: 'x', title: 'A <Very> Long Song Title That Wraps', artist: 'Band & Co', playing: true }, app: { name: 'Player', icon: null } };
  const svg = decodeURIComponent(renderNowPlaying(np));
  assert.match(svg, /Player/);
  assert.match(decodeURIComponent(renderNowPlaying({ ...np, site: { name: 'SoundCloud', color: null } })), />SoundCloud</);
  assert.match(svg, /&lt;Very&gt;/);
  assert.match(svg, /Band &amp; Co/);
  assert.match(svg, /polygon points="150,12/); // play triangle
  assert.match(decodeURIComponent(renderNowPlaying({ track: null })), /Nothing playing/);
  assert.match(decodeURIComponent(renderNowPlaying({ error: 'brew install media-control' })), /brew install media-control/);
});

const { siteInfo, siteColor, parseBmp, dominantColor, dim } = require('./color');
const { parseTabs, findPlayingTab, likeContains } = require('./browser-site');

// Builds a tiny top-down 32-bit BI_BITFIELDS BMP like the one `sips` writes.
function makeBmp(width, height, pixels) {
  const offset = 138;
  const buf = Buffer.alloc(offset + width * height * 4);
  buf.write('BM', 0, 'latin1');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(offset, 10);
  buf.writeUInt32LE(124, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(32, 28);
  buf.writeUInt32LE(3, 30);
  buf.writeUInt32LE(0x00ff0000, 54);
  buf.writeUInt32LE(0x0000ff00, 58);
  buf.writeUInt32LE(0x000000ff, 62);
  buf.writeUInt32LE(0xff000000, 66);
  pixels.forEach(([r, g, b, a], i) => buf.writeUInt32LE(((a << 24) | (r << 16) | (g << 8) | b) >>> 0, offset + i * 4));
  return buf;
}

test('dominant icon colour ignores grey, dark and transparent pixels', () => {
  const yellow = [250, 220, 0, 255];
  const pixels = [yellow, yellow, yellow, [255, 255, 255, 255], [20, 20, 20, 255], [0, 0, 255, 0], [120, 120, 120, 255], [0, 200, 0, 255], yellow];
  const decoded = parseBmp(makeBmp(3, 3, pixels));
  assert.deepEqual(decoded[0], { r: 250, g: 220, b: 0, a: 255 });
  assert.deepEqual(dominantColor(decoded), [255, 224, 0]);
  assert.equal(dominantColor(parseBmp(makeBmp(1, 1, [[128, 128, 128, 255]]))), null);
  assert.deepEqual(dim([255, 100, 0], 0.2), [51, 20, 0]);
});

test('browser tabs map to site brand colours', () => {
  assert.deepEqual(siteColor('https://www.youtube.com/watch?v=abc'), [255, 0, 0]);
  assert.deepEqual(siteColor('https://music.youtube.com/watch?v=abc'), [255, 0, 0]);
  assert.deepEqual(siteColor('https://music.yandex.ru/album/1'), [255, 204, 0]);
  assert.equal(siteColor('https://example.com/'), null);
  assert.equal(siteColor('not a url'), null);
  assert.deepEqual(siteColor('https://vkvideo.ru/video-1_2'), [0, 119, 255]);
  assert.deepEqual(siteInfo('https://soundcloud.com/artist/track'), { name: 'SoundCloud', color: [255, 85, 0] });
  assert.equal(siteInfo('https://music.youtube.com/watch?v=1').name, 'YouTube Music');
  assert.equal(siteInfo('https://vkvideo.ru/video-1').name, 'VK Video');
  assert.deepEqual(siteInfo('https://www.example.org/a'), { name: 'example.org', color: null });
  assert.equal(likeContains("It's 100%_done"), "'%It''s 100\\%\\_done%' ESCAPE '\\'");
  const tabs = parseTabs('https://mail.example.com/\tInbox\nhttps://www.youtube.com/watch?v=1\tGreat Song (Live) - YouTube\n');
  assert.equal(tabs.length, 2);
  assert.equal(findPlayingTab(tabs, 'great song (live)').url, 'https://www.youtube.com/watch?v=1');
  assert.equal(findPlayingTab(tabs, 'Other'), null);
  assert.equal(findPlayingTab(tabs, ''), null);
});
