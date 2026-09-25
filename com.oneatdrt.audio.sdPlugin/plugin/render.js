'use strict';

const FONT = 'font-family="-apple-system, Helvetica, Arial, sans-serif"';
const ON = '#f8fafc';
const OFF = '#ef4444';
const DIM = '#64748b';

function speakerIcon(muted) {
  const color = muted ? OFF : ON;
  const waves = muted
    ? `<path d="M28 13 L40 27 M40 13 L28 27" stroke="${OFF}" stroke-width="4" stroke-linecap="round"/>`
    : `<path d="M28 13 a9 9 0 0 1 0 14" stroke="${ON}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
       <path d="M32 7 a16 16 0 0 1 0 26" stroke="${ON}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  return `<g transform="translate(12 20)">
  <polygon points="2,13 10,13 21,4 21,36 10,27 2,27" fill="${color}"/>
  ${waves}
</g>`;
}

function micIcon(muted) {
  const color = muted ? OFF : ON;
  const slash = muted ? `<line x1="-2" y1="-2" x2="30" y2="40" stroke="${OFF}" stroke-width="4" stroke-linecap="round"/>` : '';
  return `<g transform="translate(136 18)">
  <rect x="8" y="0" width="12" height="22" rx="6" fill="${color}"/>
  <path d="M3 15 a11 11 0 0 0 22 0" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <line x1="14" y1="26" x2="14" y2="33" stroke="${color}" stroke-width="3"/>
  <line x1="8" y1="34" x2="20" y2="34" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
  ${slash}
</g>`;
}

function statusLine(state) {
  if (state.speakerMuted && state.micMuted) return { text: 'ALL MUTED', color: OFF };
  if (state.speakerMuted) return { text: 'SPEAKER MUTED', color: OFF };
  if (state.micMuted) return { text: 'MIC MUTED', color: '#f59e0b' };
  return { text: 'SPEAKER · MIC ON', color: '#22c55e' };
}

// Drawn for the 176×112 knob panel; on a 144×144 key the same drawing is letterboxed.
function renderAudio(state, { square = false } = {}) {
  const allMuted = state.speakerMuted && state.micMuted;
  const bg = allMuted ? '#450a0a' : '#0b1120';
  const status = statusLine(state);
  const barWidth = Math.round(152 * Math.max(0, Math.min(100, state.volume)) / 100);
  const size = square ? 'width="144" height="144" viewBox="0 -32 176 176"' : 'width="176" height="112" viewBox="0 0 176 112"';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${size}>
<rect x="0" y="${square ? -32 : 0}" width="176" height="${square ? 176 : 112}" fill="${bg}"/>
${speakerIcon(state.speakerMuted)}
<text x="62" y="52" ${FONT} font-size="${state.volume >= 100 ? 25 : 30}" font-weight="800" fill="${state.speakerMuted ? DIM : ON}">${state.volume}%</text>
${micIcon(state.micMuted)}
<rect x="12" y="72" width="152" height="10" rx="5" fill="#1e293b"/>
<rect x="12" y="72" width="${barWidth}" height="10" rx="5" fill="${state.speakerMuted ? DIM : '#22c55e'}"/>
<text x="88" y="102" ${FONT} font-size="14" font-weight="800" fill="${status.color}" text-anchor="middle" letter-spacing="1">${status.text}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

function renderError(message) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="176" height="112" viewBox="0 0 176 112">
<rect width="176" height="112" fill="#0b1120"/>
<text x="88" y="50" ${FONT} font-size="16" font-weight="800" fill="${OFF}" text-anchor="middle">AUDIO</text>
<text x="88" y="74" ${FONT} font-size="12" fill="#fca5a5" text-anchor="middle">${message}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

module.exports = { renderAudio, renderError, statusLine };
