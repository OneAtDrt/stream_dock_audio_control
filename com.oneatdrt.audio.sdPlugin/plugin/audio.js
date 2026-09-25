'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = path.join(__dirname, 'state.json');
const DEFAULT_MIC_LEVEL = 50;
const VOLUME_STEP = 2;

function osascript(lines) {
  const args = lines.flatMap((line) => ['-e', line]);
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', args, { timeout: 3000 }, (error, stdout) => {
      if (error) return reject(error);
      resolve(stdout.trim());
    });
  });
}

// "output volume:56, input volume:28, alert volume:100, output muted:false"
function parseVolumeSettings(text) {
  const field = (name) => (text.match(new RegExp(`${name}:([^,]+)`)) || [])[1]?.trim();
  const output = Number(field('output volume'));
  const input = Number(field('input volume'));
  return {
    volume: Number.isFinite(output) ? output : 0,
    // No output device with volume control reports "missing value"; treat as unmuted.
    speakerMuted: field('output muted') === 'true',
    micLevel: Number.isFinite(input) ? input : 0,
    micMuted: Number.isFinite(input) && input === 0
  };
}

async function readState() {
  return parseVolumeSettings(await osascript(['get volume settings']));
}

// The mic "mute" is input volume 0, so remember the level to restore — across plugin restarts too.
function loadSavedMicLevel() {
  try {
    const level = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).micLevel;
    return Number.isFinite(level) && level > 0 ? level : DEFAULT_MIC_LEVEL;
  } catch {
    return DEFAULT_MIC_LEVEL;
  }
}

function saveMicLevel(level) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ micLevel: level }));
  } catch {
    // Non-fatal: we fall back to DEFAULT_MIC_LEVEL on unmute.
  }
}

// Press: if anything is live, silence both; if both are already silent, bring both back.
async function toggleMuteAll() {
  const state = await readState();
  if (!state.speakerMuted || !state.micMuted) {
    if (state.micLevel > 0) saveMicLevel(state.micLevel);
    await osascript(['set volume with output muted', 'set volume input volume 0']);
  } else {
    await osascript(['set volume without output muted', `set volume input volume ${loadSavedMicLevel()}`]);
  }
  return readState();
}

function nextVolume(current, ticks) {
  return Math.max(0, Math.min(100, current + ticks * VOLUME_STEP));
}

// Like the keyboard volume keys: reaching 0 mutes the output (level 0 alone can still leak
// sound on some devices), anything above 0 unmutes it. The mic is left alone.
function volumeCommands(volume) {
  return [`set volume output volume ${volume}`, volume === 0 ? 'set volume with output muted' : 'set volume without output muted'];
}

async function changeVolume(ticks) {
  const state = await readState();
  const volume = nextVolume(state.volume, ticks);
  await osascript(volumeCommands(volume));
  return { ...state, volume, speakerMuted: volume === 0 };
}

module.exports = { readState, toggleMuteAll, changeVolume, parseVolumeSettings, nextVolume, volumeCommands };
