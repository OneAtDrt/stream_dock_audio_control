'use strict';

// App icon -> key image + ring colour. Most apps ship CFBundleIconFile (.icns, sips reads it); some
// keep the icon only in Assets.car (Calendar) or ship a transparent stub .icns (Books). For those,
// ask AppKit (NSWorkspace iconForFile) to render the icon as the Finder shows it.

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseBmp, dominantColor } = require('./color');

// argv: app path, output PNG, size in points (Retina screens may render it at 2x).
const WORKSPACE_SCRIPT = `ObjC.import('AppKit');
function run(argv) {
  const n = Number(argv[2] || 144);
  const src = $.NSWorkspace.sharedWorkspace.iconForFile(argv[0]);
  const dst = $.NSImage.alloc.initWithSize($.NSMakeSize(n, n));
  dst.lockFocus;
  src.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, n, n), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1);
  const rep = $.NSBitmapImageRep.alloc.initWithFocusedViewRect($.NSMakeRect(0, 0, n, n));
  dst.unlockFocus;
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary).writeToFileAtomically(argv[1], true);
}
`;
const SCRIPT_PATH = path.join(os.tmpdir(), 'oneatdrt-np-app-icon.js');

function run(file, args, timeout = 4000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout }, (error, stdout) => (error ? reject(error) : resolve(stdout.trim())));
  });
}

function scriptFile() {
  if (fs.existsSync(SCRIPT_PATH) && fs.readFileSync(SCRIPT_PATH, 'utf8') === WORKSPACE_SCRIPT) return SCRIPT_PATH;
  fs.writeFileSync(SCRIPT_PATH, WORKSPACE_SCRIPT);
  return SCRIPT_PATH;
}

// Renders the app's icon to outPng via NSWorkspace (~150 ms, no permission prompts).
async function iconPngViaWorkspace(appPath, outPng, size = 144) {
  fs.rmSync(outPng, { force: true });
  await run('/usr/bin/osascript', ['-l', 'JavaScript', scriptFile(), appPath, outPng, String(size)]);
  if (!fs.existsSync(outPng)) throw new Error(`no icon rendered for ${appPath}`);
  return outPng;
}

// Any image sips reads (.icns, .png) -> { icon: PNG data URI, color: rgb | null, opaque }.
// opaque = false means the image is fully transparent (a stub icon).
async function iconArt(src, key, size = 64) {
  const out = path.join(os.tmpdir(), `oneatdrt-np-${key}.png`);
  await run('/usr/bin/sips', ['-s', 'format', 'png', '--resampleHeightWidth', String(size), String(size), src, '--out', out]);
  const icon = `data:image/png;base64,${fs.readFileSync(out).toString('base64')}`;
  // A tiny uncompressed copy is enough to find the icon's main colour without an image library.
  const bmp = path.join(os.tmpdir(), `oneatdrt-np-${key}.bmp`);
  await run('/usr/bin/sips', ['-s', 'format', 'bmp', '--resampleHeightWidth', '24', '24', src, '--out', bmp]);
  const pixels = parseBmp(fs.readFileSync(bmp));
  return { icon, color: dominantColor(pixels), opaque: pixels.some((p) => p.a >= 128) };
}

module.exports = { iconPngViaWorkspace, iconArt };
