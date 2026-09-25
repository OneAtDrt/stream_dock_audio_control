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

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// Greedy word wrap; hard-cuts long words and ellipsizes whatever doesn't fit.
function wrap(text, maxChars, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let word of words) {
    while (word.length > maxChars) {
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!line) line = word;
    else if (`${line} ${word}`.length <= maxChars) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1)}…`;
    return kept;
  }
  return lines;
}

function playStateIcon(playing) {
  return playing
    ? '<polygon points="150,12 150,32 167,22" fill="#22c55e"/>'
    : `<rect x="149" y="12" width="6" height="20" rx="1" fill="${DIM}"/><rect x="160" y="12" width="6" height="20" rx="1" fill="${DIM}"/>`;
}

const NOTE_ICON = `<rect x="8" y="8" width="52" height="52" rx="8" fill="#1e293b"/>
<path d="M44 18 v22 a7 7 0 1 1 -4 -6.3 V27 l-12 3 v14 a7 7 0 1 1 -4 -6.3 V24 z" fill="${ON}"/>`;

// Now Playing panel: source app icon + name, play state, track title and artist.
function renderNowPlaying(np, { square = false } = {}) {
  const size = square ? 'width="144" height="144" viewBox="0 -32 176 176"' : 'width="176" height="112" viewBox="0 0 176 112"';
  const bg = `<rect x="0" y="${square ? -32 : 0}" width="176" height="${square ? 176 : 112}" fill="#0b1120"/>`;
  let body;
  if (np?.error) {
    body = `<text x="88" y="46" ${FONT} font-size="14" font-weight="800" fill="${OFF}" text-anchor="middle">NOW PLAYING</text>
<text x="88" y="70" ${FONT} font-size="11" fill="#fca5a5" text-anchor="middle">${escapeXml(np.error)}</text>`;
  } else if (!np?.track) {
    body = `${NOTE_ICON}
<text x="72" y="38" ${FONT} font-size="13" font-weight="700" fill="${DIM}">Nothing playing</text>`;
  } else {
    const { track, app, artwork } = np; // np.site: the playing website when the app is a browser
    const img = (uri, x, y, w) => `<image x="${x}" y="${y}" width="${w}" height="${w}" href="${uri}" xlink:href="${uri}" preserveAspectRatio="xMidYMid slice" clip-path="url(#r${w})"/>`;
    // Cover art (like the macOS Now Playing widget) with the source app as a small badge;
    // without cover art the app icon takes its place.
    let cover;
    if (artwork) {
      cover = img(artwork, 8, 8, 52);
      if (app?.icon) cover += `\n<rect x="44" y="44" width="22" height="22" rx="6" fill="#0b1120"/>\n${img(app.icon, 46, 46, 18)}`;
    } else if (app?.icon) {
      cover = img(app.icon, 8, 8, 52);
    } else {
      cover = NOTE_ICON;
    }
    const title = wrap(track.title || 'Unknown', 17, 2);
    const titleY = title.length > 1 ? [88, 106] : [96];
    const color = track.playing ? ON : DIM;
    body = `<defs>
<clipPath id="r52"><rect x="8" y="8" width="52" height="52" rx="8"/></clipPath>
<clipPath id="r18"><rect x="46" y="46" width="18" height="18" rx="4"/></clipPath>
</defs>
${cover}
<text x="72" y="26" ${FONT} font-size="11" font-weight="700" fill="#94a3b8">${escapeXml(wrap(np.site?.name || app?.name || track.bundleId, 12, 1)[0])}</text>
${playStateIcon(track.playing)}
${wrap(track.artist, 12, 2).map((l, i) => `<text x="72" y="${46 + i * 15}" ${FONT} font-size="13" font-weight="600" fill="#cbd5e1">${escapeXml(l)}</text>`).join('')}
${title.map((l, i) => `<text x="8" y="${titleY[i]}" ${FONT} font-size="16" font-weight="800" fill="${color}">${escapeXml(l)}</text>`).join('')}`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${size}>
${bg}
${body}
</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

module.exports = { renderAudio, renderError, renderNowPlaying, statusLine, wrap };
