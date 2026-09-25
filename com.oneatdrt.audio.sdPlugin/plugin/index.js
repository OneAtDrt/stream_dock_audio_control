'use strict';

const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
const { readState, toggleMuteAll, changeVolume } = require('./audio');
const { renderAudio, renderError } = require('./render');
const { setKnobColor, readRingColors } = require('./knob-led');

// Picks up volume/mute changes made elsewhere (keyboard keys, menu bar, other apps).
const POLL_MS = 1000;
// Wait for Stream Dock to finish streaming the new panel image before touching the USB link,
// so our packet never lands inside its image transfer. Re-assert rarely in case it repaints rings.
const RING_DELAY_MS = 800;
const RING_REASSERT_MS = 60000;
const RING_MUTED = [255, 0, 0];
const RING_MIC_ONLY = [255, 140, 0];
const RING_ON = [0x19, 0xfa, 0x1f];
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

ws.on('open', () => {
  log('connected');
  send({ uuid: startup.pluginUuid, event: startup.registerEvent });
  setInterval(() => enqueue(async () => setState(await readState())), POLL_MS);
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
    if (item && item.knobIndex >= 0) setTimeout(() => paintRing(item.knobIndex, readRingColors()[item.knobIndex]), RING_DELAY_MS);
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
  try {
    setKnobColor(knobIndex, rgb);
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
