'use strict';

const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
const { readState, toggleMuteAll, changeVolume } = require('./audio');
const { renderAudio, renderError, renderNowPlaying } = require('./render');
const { startStream, sendCommand } = require('./nowplaying');
const { dim } = require('./color');
const { setKnobColor, releaseKnob } = require('./knob-led');

// Picks up volume/mute changes made elsewhere (keyboard keys, menu bar, other apps).
const POLL_MS = 1000;
// Wait for Stream Dock to finish streaming the new panel image before touching the USB link,
// so our packet never lands inside its image transfer. Re-assert rarely in case it repaints rings.
const RING_DELAY_MS = 800;
const RING_REASSERT_MS = 60000;
const RING_MUTED = [255, 0, 0];
const RING_MIC_ONLY = [255, 140, 0];
const RING_ON = [0x19, 0xfa, 0x1f];
// Now Playing ring: the source's colour, dimmed while paused.
const NP_PAUSED_DIM = 0.2;
const NOW_PLAYING_ACTION = 'com.oneatdrt.audio.nowplaying';
// One track skip per knob gesture, however many ticks a fast spin produces.
const SKIP_THROTTLE_MS = 350;
// Track changes arrive as a burst (empty -> other app -> partial -> final); draw only the settled state.
const NP_SETTLE_MS = 400;
const LOG_FILE = path.join(__dirname, 'log', 'plugin.log');

const startup = parseStartupArgs(process.argv);
const ws = new WebSocket(`ws://127.0.0.1:${startup.port}`);

// context -> { square, knobIndex, lastImage, lastRing, ringAt }
const contexts = new Map();
let state = null;
let failed = false;
let queue = Promise.resolve();
let pendingTicks = 0;
let ringTimer = null;

// Now Playing action: context -> { square, knobIndex, lastImage, lastRing, ringAt }
const npContexts = new Map();
let nowPlaying = { track: null };
let lastSkipAt = 0;
let npTimer = null;
let npRingTimer = null;

ws.on('open', () => {
  log('connected');
  send({ uuid: startup.pluginUuid, event: startup.registerEvent });
  setInterval(() => enqueue(async () => setState(await readState())), POLL_MS);
  startStream((next) => {
    nowPlaying = next;
    clearTimeout(npTimer);
    npTimer = setTimeout(paintNowPlaying, NP_SETTLE_MS);
  }, log);
});

ws.on('close', () => process.exit(0));

ws.on('message', (raw) => {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return;
  }
  const { event, context, payload = {} } = message;

  if (npContexts.has(context) || (event === 'willAppear' && message.action === NOW_PLAYING_ACTION)) {
    handleNowPlaying(event, context, payload);
    return;
  }

  if (event === 'willAppear') {
    const square = payload.controller === 'Keypad';
    const knobIndex = square ? -1 : Number(payload.coordinates?.column ?? -1);
    contexts.set(context, { square, knobIndex, lastImage: null, lastRing: null, ringAt: 0 });
    log(`appear ${payload.controller} at ${JSON.stringify(payload.coordinates)} -> ring ${knobIndex}`);
    enqueue(async () => setState(await readState()));
  } else if (event === 'willDisappear') {
    const item = contexts.get(context);
    contexts.delete(context);
    // Leaving the page: hand the ring back to the colour chosen in the Stream Dock app.
    if (item && item.knobIndex >= 0) setTimeout(() => ringCall(() => releaseKnob(item.knobIndex)), RING_DELAY_MS);
  } else if (event === 'dialRotate') {
    // Coalesce fast spins into one volume change per osascript round-trip.
    pendingTicks += Number(payload.ticks) || 0;
    enqueue(async () => {
      const ticks = pendingTicks;
      pendingTicks = 0;
      if (ticks) setState(await changeVolume(ticks));
    });
  } else if (event === 'dialDown' || event === 'keyUp') {
    enqueue(async () => setState(await toggleMuteAll()));
  }
});

function handleNowPlaying(event, context, payload) {
  if (event === 'willAppear') {
    const square = payload.controller === 'Keypad';
    const knobIndex = square ? -1 : Number(payload.coordinates?.column ?? -1);
    npContexts.set(context, { square, knobIndex, lastImage: null, lastRing: null, ringAt: 0 });
    paintNowPlaying();
  } else if (event === 'willDisappear') {
    const item = npContexts.get(context);
    npContexts.delete(context);
    if (item && item.knobIndex >= 0) setTimeout(() => ringCall(() => releaseKnob(item.knobIndex)), RING_DELAY_MS);
  } else if (event === 'dialRotate') {
    const ticks = Number(payload.ticks) || 0;
    const now = Date.now();
    if (!ticks || now - lastSkipAt < SKIP_THROTTLE_MS) return;
    lastSkipAt = now;
    mediaCommand(ticks > 0 ? 'next-track' : 'previous-track');
  } else if (event === 'dialDown' || event === 'keyUp') {
    // Flip the icon right away; the stream confirms (or corrects) it a moment later.
    if (nowPlaying.track) {
      nowPlaying = { ...nowPlaying, track: { ...nowPlaying.track, playing: !nowPlaying.track.playing } };
      paintNowPlaying();
    }
    mediaCommand('toggle-play-pause');
  }
}

function mediaCommand(command) {
  sendCommand(command).catch((err) => log(`media-control ${command} failed: ${err.message}`));
}

function paintNowPlaying() {
  for (const [context, item] of npContexts) {
    const image = renderNowPlaying(nowPlaying, { square: item.square });
    if (image === item.lastImage) continue;
    item.lastImage = image;
    send({ event: 'setImage', context, payload: { target: 0, image } });
  }
  clearTimeout(npRingTimer);
  npRingTimer = setTimeout(paintNowPlayingRings, RING_DELAY_MS);
}

function nowPlayingRing() {
  const { track, color } = nowPlaying;
  if (!track || !color) return null;
  return track.playing ? color : dim(color, NP_PAUSED_DIM);
}

function paintNowPlayingRings() {
  const now = Date.now();
  const rgb = nowPlayingRing();
  for (const item of npContexts.values()) {
    if (item.knobIndex < 0) continue;
    const key = rgb ? rgb.join(',') : 'released';
    if (key === item.lastRing && now - item.ringAt < RING_REASSERT_MS) continue;
    const ok = rgb ? paintRing(item.knobIndex, rgb) : ringCall(() => releaseKnob(item.knobIndex));
    if (ok) {
      item.lastRing = key;
      item.ringAt = now;
    }
  }
}

function enqueue(task) {
  queue = queue.then(task).then(
    () => { failed = false; },
    (err) => {
      if (!failed) log(`audio command failed: ${err.message}`);
      failed = true;
      paintAll();
    }
  );
}

function setState(next) {
  state = next;
  paintAll();
  clearTimeout(ringTimer);
  ringTimer = setTimeout(paintRings, RING_DELAY_MS);
}

function ringColorFor() {
  if (state.speakerMuted) return RING_MUTED;
  if (state.micMuted) return RING_MIC_ONLY;
  return RING_ON;
}

function paintRings() {
  paintNowPlayingRings();
  const now = Date.now();
  for (const item of contexts.values()) {
    if (item.knobIndex < 0 || !state) continue;
    const rgb = ringColorFor();
    const key = rgb.join(',');
    if (key === item.lastRing && now - item.ringAt < RING_REASSERT_MS) continue;
    if (paintRing(item.knobIndex, rgb)) {
      item.lastRing = key;
      item.ringAt = now;
    }
  }
}

let ringErrorLogged = false;
function paintRing(knobIndex, rgb) {
  return ringCall(() => setKnobColor(knobIndex, rgb));
}

function ringCall(fn) {
  try {
    fn();
    ringErrorLogged = false;
    return true;
  } catch (err) {
    if (!ringErrorLogged) log(`knob ring update failed: ${err.message}`);
    ringErrorLogged = true;
    return false;
  }
}

function paintAll() {
  for (const [context, item] of contexts) {
    const image = failed || !state ? renderError('osascript failed') : renderAudio(state, { square: item.square });
    if (image === item.lastImage) continue;
    item.lastImage = image;
    send({ event: 'setImage', context, payload: { target: 0, image } });
  }
}

function send(message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function log(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Logging must never break knob handling.
  }
}

function parseStartupArgs(argv) {
  const flags = new Map();
  for (let i = 2; i < argv.length - 1; i += 1) {
    if (argv[i].startsWith('-')) flags.set(argv[i].replace(/^-+/, ''), argv[i + 1]);
  }
  return { port: flags.get('port'), pluginUuid: flags.get('pluginUUID'), registerEvent: flags.get('registerEvent') };
}
