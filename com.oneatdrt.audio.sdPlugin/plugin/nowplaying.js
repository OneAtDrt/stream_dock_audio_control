'use strict';

// macOS 15.4+ blocks third-party apps from the MediaRemote "now playing" API. `media-control`
// (brew install media-control) works around it, so we stream from it and send commands through it.

const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
const { siteInfo, parseBmp, dominantColor } = require('./color');
const { isBrowser, playingUrl, titleSite } = require('./browser-site');
const { iconPngViaWorkspace, iconArt } = require('./app-icon');
const { appColorOverride } = require('./app-colors');

const CANDIDATES = ['/opt/homebrew/bin/media-control', '/usr/local/bin/media-control'];
const MEDIA_CONTROL = process.env.MEDIA_CONTROL_BIN || CANDIDATES.find((p) => fs.existsSync(p)) || null;
const RESTART_DELAY_MS = 3000;
const ICON_SIZE = 64;
const ARTWORK_SIZE = 64;
const ARTWORK_CACHE_MAX = 20;

function run(file, args, timeout = 4000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout }, (error, stdout) => (error ? reject(error) : resolve(stdout.trim())));
  });
}

// `media-control stream` prints one JSON object per line: a full snapshot (diff: false), then diffs.
function applyStreamLine(current, line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return current;
  }
  if (message.type !== 'data' || !message.payload) return current;
  const next = message.diff ? { ...current, ...message.payload } : { ...message.payload };
  for (const [key, value] of Object.entries(next)) if (value === null) delete next[key];
  return next;
}

function toTrack(info) {
  if (!info || !info.bundleIdentifier) return null;
  // Safari (and other WebKit apps) play through a helper like com.apple.WebKit.GPU; the real app
  // is the parent. The helper's pid says nothing about the app then, so drop it.
  const parent = info.parentApplicationBundleIdentifier;
  return {
    bundleId: parent || info.bundleIdentifier,
    pid: parent ? null : info.processIdentifier || null,
    title: info.title || '',
    artist: info.artist || info.album || '',
    album: info.album || '',
    playing: Boolean(info.playing)
  };
}

// bundle id + track title -> the playing site ({ name, color }) for browsers. Only hits are kept
// for good; a miss is retried after a while (the page may not be in History yet). Pages without
// media metadata report the service itself as the title ("Netflix"): that needs no lookup.
const siteCache = new Map();
const MISS_RETRY_MS = 2500;
// A new page can take a few seconds to reach the browser's History: re-check this often, this many times.
const SITE_RECHECK_MS = 3000;
const SITE_RECHECK_TRIES = 8;

async function playingSite(track) {
  if (!isBrowser(track.bundleId)) return null;
  const key = `${track.bundleId}\u0000${track.title}`;
  const cached = siteCache.get(key);
  if (cached && (cached.site || Date.now() - cached.at < MISS_RETRY_MS)) return cached.site;
  let site = titleSite(track);
  try {
    const url = site ? null : await playingUrl(track.bundleId, track);
    if (url) site = siteInfo(url);
  } catch {
    // Browser data unreadable (or Safari permission denied): show the browser itself.
  }
  siteCache.set(key, { site, at: Date.now() });
  return site;
}

// bundle id -> { name, icon, color } where icon is a PNG data URI (or null)
const appCache = new Map();

// Where the app lives, without AppleScript (which makes macOS ask permission for every app):
// the playing process's executable path, else a Spotlight lookup by bundle id.
async function appPathFor(bundleId, pid) {
  if (pid) {
    const exe = await run('/bin/ps', ['-o', 'comm=', '-p', String(pid)]).catch(() => '');
    const m = /^(.*?\.app)\//.exec(exe);
    if (m) return m[1];
  }
  const found = await run('/usr/bin/mdfind', [`kMDItemCFBundleIdentifier == '${bundleId.replace(/'/g, '')}'`]).catch(() => '');
  const first = found.split('\n').find((p) => p.endsWith('.app'));
  if (!first) throw new Error(`app not found: ${bundleId}`);
  return first;
}

// Lookups in progress, so a burst of stream updates shares one lookup instead of seeing a
// half-done entry (which used to publish the bare "music" placeholder and stick).
const appInFlight = new Map();

async function resolveApp(bundleId, pid) {
  const cached = appCache.get(bundleId);
  if (cached && (!cached.failedAt || Date.now() - cached.failedAt < MISS_RETRY_MS)) return cached;
  if (appInFlight.has(bundleId)) return appInFlight.get(bundleId);
  const lookup = lookupApp(bundleId, pid).finally(() => appInFlight.delete(bundleId));
  appInFlight.set(bundleId, lookup);
  return lookup;
}

async function lookupApp(bundleId, pid) {
  const override = appColorOverride(bundleId);
  try {
    const appPath = await appPathFor(bundleId, pid);
    const plist = path.join(appPath, 'Contents/Info.plist');
    const read = (key) => run('/usr/bin/plutil', ['-extract', key, 'raw', plist]).catch(() => '');
    const name = (await read('CFBundleDisplayName')) || (await read('CFBundleName')) || path.basename(appPath, '.app');
    let art = null;
    let iconFile = await read('CFBundleIconFile');
    if (iconFile) {
      if (!path.extname(iconFile)) iconFile += '.icns';
      art = await iconArt(path.join(appPath, 'Contents/Resources', iconFile), bundleId, ICON_SIZE).catch(() => null);
    }
    // No .icns (Assets.car only), a transparent stub, or no colour we need: ask AppKit for the icon.
    if (!art || !art.opaque || (!art.color && override === undefined)) {
      const png = path.join(os.tmpdir(), `oneatdrt-np-${bundleId}.ws.png`);
      const ws = await iconPngViaWorkspace(appPath, png).then((f) => iconArt(f, bundleId, ICON_SIZE)).catch(() => null);
      if (ws && ws.opaque) art = ws;
    }
    const resolved = { name, icon: art?.icon || null, color: override !== undefined ? override : art?.color || null };
    appCache.set(bundleId, resolved);
    return resolved;
  } catch {
    const failed = { name: bundleId.split('.').pop(), icon: null, color: override || null, failedAt: Date.now() };
    appCache.set(bundleId, failed);
    return failed;
  }
}

// `media-control stream` runs as a perl child that outlives us if Stream Dock hard-kills the
// plugin. Reap such orphans (parent = launchd) left by a previous run before starting our own.
function killOrphanedStreams(log) {
  try {
    const out = require('node:child_process').execFileSync('/bin/ps', ['-Ao', 'pid=,ppid=,command=']).toString();
    for (const line of out.split('\n')) {
      const m = /^\s*(\d+)\s+1\s+(.*)$/.exec(line);
      if (m && /mediaremote-adapter\.pl/.test(m[2]) && /\sstream\b/.test(m[2])) {
        process.kill(Number(m[1]));
        log(`killed orphaned media-control stream ${m[1]}`);
      }
    }
  } catch {
    // Best effort only.
  }
}

// Cover art arrives as base64 (often hundreds of KB); shrink it once per cover so every key
// image sent to the device stays small. Returns a JPEG data URI or null.
const artworkCache = new Map();

async function artworkFor(info) {
  if (!info.artworkData) return null;
  const key = crypto.createHash('sha1').update(info.artworkData).digest('hex');
  if (artworkCache.has(key)) return artworkCache.get(key);
  let uri = null;
  try {
    const ext = /png/i.test(info.artworkMimeType || '') ? 'png' : 'jpg';
    const src = path.join(os.tmpdir(), `oneatdrt-art-${key}.${ext}`);
    const out = path.join(os.tmpdir(), `oneatdrt-art-${key}.out.jpg`);
    fs.writeFileSync(src, Buffer.from(info.artworkData, 'base64'));
    await run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '-Z', String(ARTWORK_SIZE), src, '--out', out]);
    uri = `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`;
    fs.rmSync(src, { force: true });
    fs.rmSync(out, { force: true });
  } catch {
    // Unreadable image: show the app icon instead.
  }
  if (artworkCache.size >= ARTWORK_CACHE_MAX) artworkCache.delete(artworkCache.keys().next().value);
  artworkCache.set(key, uri);
  return uri;
}

// Emits { track, app, color, artwork } (or { track: null }) whenever what's playing changes.
function startStream(onChange, log) {
  if (!MEDIA_CONTROL) {
    onChange({ error: 'brew install media-control' });
    return () => {};
  }
  let child = null;
  let stopped = false;
  let info = {};
  // Each update is resolved asynchronously (icon, site lookup, cover); a slow older one must not
  // overwrite a newer one, so only the latest sequence number may publish.
  let seq = 0;
  let recheck = { key: null, tries: 0, timer: null };

  const publish = async () => {
    const mine = ++seq;
    const snapshot = info;
    const track = toTrack(snapshot);
    const app = track ? await resolveApp(track.bundleId, track.pid) : null;
    const site = track ? await playingSite(track) : null;
    const artwork = track ? await artworkFor(snapshot) : null;
    if (mine !== seq) return;
    onChange({
      track,
      app,
      site,
      // Ring: the site's brand colour. A browser's own icon colour says nothing about what's playing
      // (and would differ per browser), so browsers without a known site get none.
      color: site?.color || (track && isBrowser(track.bundleId) ? null : app?.color) || null,
      artwork
    });
    scheduleSiteRecheck(track, site);
  };

  const scheduleSiteRecheck = (track, site) => {
    const key = track && isBrowser(track.bundleId) ? `${track.bundleId}\u0000${track.title}` : null;
    if (key !== recheck.key) recheck = { key, tries: 0, timer: clearTimeout(recheck.timer) };
    if (!key || site || recheck.tries >= SITE_RECHECK_TRIES || recheck.timer) return;
    recheck.tries += 1;
    recheck.timer = setTimeout(() => {
      recheck.timer = null;
      publish();
    }, SITE_RECHECK_MS);
  };

  killOrphanedStreams(log);
  const stop = () => {
    stopped = true;
    if (child) child.kill();
  };
  process.on('exit', stop);
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { stop(); process.exit(0); });

  const launch = () => {
    child = spawn(MEDIA_CONTROL, ['stream'], { stdio: ['ignore', 'pipe', 'ignore'] });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      info = applyStreamLine(info, line);
      publish();
    });
    child.on('exit', (code) => {
      if (stopped) return;
      log(`media-control stream exited (${code}), restarting`);
      setTimeout(launch, RESTART_DELAY_MS);
    });
  };
  launch();
  return stop;
}

function sendCommand(command) {
  if (!MEDIA_CONTROL) return Promise.reject(new Error('media-control not installed'));
  return run(MEDIA_CONTROL, [command]);
}

module.exports = { startStream, sendCommand, applyStreamLine, toTrack, resolveApp };
