#!/usr/bin/env node
'use strict';

// Renders the README preview images with the plugin's real render.js into docs/previews/<name>.png
// at 2× device scale. Needs Google Chrome (headless). Usage: node scripts/previews.js
// All sample content is made up: track titles, artists, cover art and app badges.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { renderAudio, renderNowPlaying } = require('../com.oneatdrt.audio.sdPlugin/plugin/render');
const { siteInfo } = require('../com.oneatdrt.audio.sdPlugin/plugin/sites');

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, '..', 'docs', 'previews');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-previews-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Headless Chrome writes the screenshot but doesn't always exit, so wait for the file, then stop it.
async function screenshot(html, width, height, out, scale = 2) {
  const page = path.join(TMP, 'page.html');
  fs.writeFileSync(page, html);
  fs.rmSync(out, { force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(TMP, 'profile')}`, `--force-device-scale-factor=${scale}`,
    `--window-size=${width},${height}`, `--screenshot=${out}`, `file://${page}`
  ], { stdio: 'ignore', detached: true });
  let exited = false;
  chrome.on('exit', () => { exited = true; });
  try {
    for (let waited = 0; !fs.existsSync(out); waited += 100) {
      if (exited || waited > 30000) throw new Error(`Chrome produced no screenshot for ${path.basename(out)}`);
      await sleep(100);
    }
    await sleep(300); // let the write finish
  } finally {
    if (!exited) {
      try { process.kill(-chrome.pid, 'SIGKILL'); } catch {}
      while (!exited) await sleep(50);
    }
  }
  return out;
}

const pageHtml = (body, style = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#000;overflow:hidden}img{display:block}${style}</style></head><body>${body}</body></html>`;

// Abstract artwork rasterised to a PNG data URI, like the plugin's cached covers and app icons.
async function pngFromSvg(svg, size = 64) {
  const file = await screenshot(pageHtml(`<img width="${size}" height="${size}" src="data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}">`),
    size, size, path.join(TMP, 'art.png'), 1);
  return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
}

async function makeArt() {
  return {
    // Warm sunset gradient with a sun disc.
    sunset: await pngFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f97316"/><stop offset="0.55" stop-color="#db2777"/><stop offset="1" stop-color="#4c1d95"/></linearGradient></defs>
<rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="36" r="13" fill="#fde68a" opacity="0.9"/>
<rect y="44" width="64" height="20" fill="#312e81" opacity="0.85"/></svg>`),
    // Cool abstract waves.
    waves: await pngFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>
<rect width="64" height="64" fill="url(#g)"/>
<path d="M0 30 Q16 20 32 30 T64 30" stroke="#a5f3fc" stroke-width="4" fill="none"/>
<path d="M0 42 Q16 32 32 42 T64 42" stroke="#67e8f9" stroke-width="4" fill="none" opacity="0.7"/></svg>`),
    // Video thumbnail-like: hills and a moon.
    thumb: await pngFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#14532d"/><stop offset="1" stop-color="#65a30d"/></linearGradient></defs>
<rect width="64" height="64" fill="url(#g)"/><polygon points="0,64 22,30 38,50 48,38 64,64" fill="#052e16"/>
<circle cx="48" cy="18" r="7" fill="#fef9c3"/></svg>`),
    // Generic music app badge: rounded square with a note.
    musicApp: await pngFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fb7185"/><stop offset="1" stop-color="#e11d48"/></linearGradient></defs>
<rect width="64" height="64" rx="14" fill="url(#g)"/>
<path d="M42 14 v26 a7 7 0 1 1 -4 -6.3 V24 l-12 3 v17 a7 7 0 1 1 -4 -6.3 V20 z" fill="#fff"/></svg>`),
    // Generic browser badge: a globe.
    browser: await pngFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#f1f5f9"/>
<circle cx="32" cy="32" r="20" fill="#3b82f6"/>
<g fill="none" stroke="#fff" stroke-width="2.5"><circle cx="32" cy="32" r="20"/><ellipse cx="32" cy="32" rx="8" ry="20"/>
<path d="M12 32 H52 M15 22 H49 M15 42 H49"/></g></svg>`)
  };
}

// [name, image, width, height, caption]
function previews(art) {
  const knob = (name, uri, caption) => [name, uri, 176, 112, caption];
  const key = (name, uri, caption) => [name, uri, 144, 144, caption];
  const drive = {
    track: { title: 'Golden Hour Drive', artist: 'Amber Coast', playing: true, bundleId: 'com.example.music' },
    app: { name: 'Music', icon: art.musicApp },
    artwork: art.sunset
  };
  return [
    knob('volume-on', renderAudio({ volume: 45, speakerMuted: false, micMuted: false }), 'Volume: speaker and mic on'),
    knob('volume-mic-muted', renderAudio({ volume: 62, speakerMuted: false, micMuted: true }), 'Volume: mic muted'),
    knob('volume-all-muted', renderAudio({ volume: 45, speakerMuted: true, micMuted: true }), 'Volume: all muted'),
    knob('volume-100', renderAudio({ volume: 100, speakerMuted: false, micMuted: false }), 'Volume: 100%'),
    knob('nowplaying-app', renderNowPlaying(drive), 'Now Playing: app with cover art'),
    knob('nowplaying-browser', renderNowPlaying({
      track: { title: 'Forest Walk – 4K Nature Ambience', artist: 'Quiet Trails', playing: true, bundleId: 'com.example.browser' },
      app: { name: 'Browser', icon: art.browser },
      site: siteInfo('https://www.youtube.com/watch?v=preview'),
      artwork: art.thumb
    }), 'Now Playing: YouTube in a browser'),
    knob('nowplaying-paused', renderNowPlaying({
      track: { title: 'Moonlight Sonata', artist: 'Ludwig van Beethoven', playing: false, bundleId: 'com.example.music' },
      app: { name: 'Music', icon: art.musicApp },
      artwork: art.waves
    }), 'Now Playing: paused'),
    knob('nowplaying-nothing', renderNowPlaying({ track: null }), 'Now Playing: nothing playing'),
    key('key-volume', renderAudio({ volume: 62, speakerMuted: false, micMuted: true }, { square: true }), 'Volume on a key'),
    key('key-nowplaying', renderNowPlaying(drive, { square: true }), 'Now Playing on a key')
  ];
}

const GALLERY = ['volume-on', 'volume-mic-muted', 'volume-all-muted', 'nowplaying-app', 'nowplaying-browser', 'nowplaying-paused'];

function checkPng(file, width, height) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  const w = Number(/pixelWidth: (\d+)/.exec(out)[1]);
  const h = Number(/pixelHeight: (\d+)/.exec(out)[1]);
  if (w !== width || h !== height) throw new Error(`${path.basename(file)}: ${w}×${h}, expected ${width}×${height}`);
  // A blank screenshot compresses to almost nothing.
  if (fs.statSync(file).size < 2000) throw new Error(`${path.basename(file)} looks blank`);
  return `${w}×${h}`;
}

// The main states in a captioned grid on a dark backdrop.
async function gallery(items) {
  const cols = 3;
  const pad = 20;
  const gap = 16;
  const rows = Math.ceil(items.length / cols);
  const cellH = 112 + 6 + 14;
  const W = pad * 2 + cols * 176 + (cols - 1) * gap;
  const H = pad * 2 + rows * cellH + (rows - 1) * gap;
  const cells = items.map(([, uri, , , caption]) => `<figure><img width="176" height="112" src="${uri}"><figcaption>${caption}</figcaption></figure>`).join('');
  const html = pageHtml(`<div class="grid">${cells}</div>`, `
body{background:#0a0a0a}
.grid{display:grid;grid-template-columns:repeat(${cols},176px);gap:${gap}px;padding:${pad}px}
figure{margin:0;width:176px}img{border-radius:6px}
figcaption{font:500 11px/14px -apple-system,Helvetica,Arial,sans-serif;color:#94a3b8;margin-top:6px;text-align:center;white-space:nowrap}`);
  const file = await screenshot(html, W, H, path.join(OUT, 'gallery.png'));
  console.log(`gallery.png ${checkPng(file, W * 2, H * 2)}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const list = previews(await makeArt());
  for (const [name, uri, w, h] of list) {
    const file = await screenshot(pageHtml(`<img width="${w}" height="${h}" src="${uri}">`), w, h, path.join(OUT, `${name}.png`));
    console.log(`${name}.png ${checkPng(file, w * 2, h * 2)}`);
  }
  await gallery(GALLERY.map((n) => list.find((p) => p[0] === n)));
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => fs.rmSync(TMP, { recursive: true, force: true }));
