'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { APP_COLORS, appColorOverride } = require('./app-colors');
const { iconPngViaWorkspace, iconArt } = require('./app-icon');
const { resolveApp } = require('./nowplaying');

const DATA_URI = /^data:image\/png;base64,/;
// System-app tests need macOS and the app itself; they skip elsewhere.
const appAt = (p) => (process.platform === 'darwin' && fs.existsSync(p) ? false : `${p} not present`);

async function timed(t, label, fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  t.diagnostic(`${label}: ${Number(process.hrtime.bigint() - start) / 1e6} ms`);
  return result;
}

test('app colour overrides', () => {
  assert.deepEqual(appColorOverride('com.spotify.client'), [30, 215, 96]);
  assert.deepEqual(appColorOverride('com.apple.Music'), [250, 36, 60]);
  assert.equal(appColorOverride('com.google.Chrome'), null);
  assert.equal(appColorOverride('com.example.unknown'), undefined);
  assert.equal(appColorOverride('toString'), undefined);
  for (const [id, rgb] of Object.entries(APP_COLORS)) {
    if (rgb === null) continue;
    assert.equal(rgb.length, 3, id);
    assert.ok(rgb.every((c) => Number.isInteger(c) && c >= 0 && c <= 255), id);
  }
});

test('renders an Assets.car-only icon via NSWorkspace', { skip: appAt('/System/Applications/Calendar.app') }, async (t) => {
  const png = path.join(os.tmpdir(), 'oneatdrt-np-test-calendar.png');
  await timed(t, 'iconPngViaWorkspace(Calendar)', () => iconPngViaWorkspace('/System/Applications/Calendar.app', png));
  const art = await iconArt(png, 'test-calendar');
  assert.match(art.icon, DATA_URI);
  assert.ok(art.opaque);
});

test('Calendar (no CFBundleIconFile) still gets an icon', { skip: appAt('/System/Applications/Calendar.app') }, async (t) => {
  const app = await timed(t, 'resolveApp(Calendar)', () => resolveApp('com.apple.iCal', null));
  assert.equal(app.failedAt, undefined);
  assert.match(app.icon, DATA_URI);
});

test('Books (transparent stub .icns) gets an icon and an orange ring', { skip: appAt('/System/Applications/Books.app') }, async (t) => {
  const app = await timed(t, 'resolveApp(Books)', () => resolveApp('com.apple.iBooksX', null));
  assert.match(app.icon, DATA_URI);
  const [r, g, b] = app.color;
  assert.ok(r > 200 && g > 80 && g < 200 && b < 80, `orange-ish, got ${app.color}`);
});

test('Music uses its override colour', { skip: appAt('/System/Applications/Music.app') }, async (t) => {
  const app = await timed(t, 'resolveApp(Music)', () => resolveApp('com.apple.Music', null));
  assert.match(app.icon, DATA_URI);
  assert.deepEqual(app.color, [250, 36, 60]);
  const again = await timed(t, 'resolveApp(Music) cached', () => resolveApp('com.apple.Music', null));
  assert.equal(again, app);
});

test('unknown bundle id falls back gracefully', async (t) => {
  const app = await timed(t, 'resolveApp(unknown)', () => resolveApp('com.oneatdrt.no-such-app', null));
  assert.equal(app.name, 'no-such-app');
  assert.equal(app.icon, null);
  assert.equal(app.color, null);
});

test('concurrent lookups of one app share the result instead of a placeholder', { skip: process.platform !== 'darwin' || !require('node:fs').existsSync('/System/Applications/Music.app') }, async () => {
  const { resolveApp } = require('./nowplaying');
  // A burst of stream updates asks for the same app at once; none may get the bare-id placeholder.
  const results = await Promise.all([resolveApp('com.apple.Music'), resolveApp('com.apple.Music'), resolveApp('com.apple.Music')]);
  for (const app of results) {
    assert.equal(app.name, 'Music');
    assert.ok(app.icon);
    assert.equal(app.failedAt, undefined);
  }
});
