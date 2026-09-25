'use strict';

// Known media sites: page URL -> { name, color } for the knob label and LED ring. Colours are
// brand colours, pushed vivid where the brand is black/white or too dark for an LED
// (colorGuess: no official colour, or the LED colour is our proposal).

const hex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));

// First match wins: specific hosts/paths before their parent domain.
const SITES = [
  // Music
  { re: /(^|\.)music\.youtube\.com$/, name: 'YouTube Music', color: hex('FF0000') },
  { re: /(^|\.)spotify\.com$/, name: 'Spotify', color: hex('1ED760') },
  { re: /(^|\.)music\.apple\.com$/, name: 'Apple Music', color: hex('FA243C') },
  { re: /(^|\.)deezer\.com$/, name: 'Deezer', color: hex('A238FF') },
  { re: /(^|\.)soundcloud\.com$/, name: 'SoundCloud', color: hex('FF5500') },
  { re: /(^|\.)music\.yandex\.(ru|com|by|kz|uz|com\.tr|az|fr)$/, name: 'Yandex Music', color: hex('FFCC00') },
  { re: /(^|\.)vk\.(com|ru)$/, path: /^\/(audio|music)/, name: 'VK Music', color: hex('0077FF') },
  { re: /(^|\.)tidal\.com$/, name: 'Tidal', color: [0, 255, 255], colorGuess: true },
  { re: /(^|\.)music\.amazon\.[a-z.]+$/, name: 'Amazon Music', color: [37, 209, 218] },
  { re: /(^|\.)qobuz\.com$/, name: 'Qobuz', color: [0, 112, 239], colorGuess: true },
  { re: /(^|\.)pandora\.com$/, name: 'Pandora', color: [54, 104, 255] },
  { re: /(^|\.)bandcamp\.com$/, name: 'Bandcamp', color: hex('1DA0C3') },
  { re: /(^|\.)mixcloud\.com$/, name: 'Mixcloud', color: hex('5000FF') },
  { re: /(^|\.)audiomack\.com$/, name: 'Audiomack', color: hex('FFA200') },
  { re: /(^|\.)iheart(radio)?\.com$/, name: 'iHeartRadio', color: [220, 0, 43] },
  { re: /(^|\.)anghami\.com$/, name: 'Anghami', color: hex('F300F9'), colorGuess: true },
  { re: /(^|\.)boomplay(music)?\.com$/, name: 'Boomplay', color: hex('0052FF'), colorGuess: true },
  { re: /(^|\.)jiosaavn\.com$/, name: 'JioSaavn', color: hex('2BC5B4') },
  { re: /(^|\.)gaana\.com$/, name: 'Gaana', color: hex('E72D30') },
  { re: /(^|\.)music\.163\.com$/, name: 'NetEase Cloud Music', color: hex('D43C33') },
  { re: /(^|\.)y\.qq\.com$/, name: 'QQ Music', color: hex('31C27C') },
  { re: /(^|\.)kkbox\.com$/, name: 'KKBOX', color: hex('09CEF6'), colorGuess: true },
  { re: /(^|\.)(sber-)?zvuk\.com$/, name: 'Zvuk', color: [40, 232, 220], colorGuess: true },
  { re: /(^|\.)music\.mts\.ru$/, name: 'MTS Music', color: hex('E30611') },

  // Podcasts, radio, audiobooks (before video: Yandex Books / Play Books share parent hosts)
  { re: /(^|\.)pocketcasts\.com$/, name: 'Pocket Casts', color: hex('F43E37') },
  { re: /(^|\.)castbox\.fm$/, name: 'Castbox', color: hex('F55B23') },
  { re: /(^|\.)podbean\.com$/, name: 'Podbean', color: [90, 180, 0] },
  { re: /(^|\.)podcasts\.apple\.com$/, name: 'Apple Podcasts', color: hex('B150E2') },
  { re: /(^|\.)overcast\.fm$/, name: 'Overcast', color: hex('FC7E0F') },
  { re: /(^|\.)audible\.(com|ca|co\.uk|de|fr|it|es|in|co\.jp|com\.au|com\.br)$/, name: 'Audible', color: hex('F8991C') },
  { re: /(^|\.)storytel\.com$/, name: 'Storytel', color: hex('FF501C') },
  { re: /(^|\.)(everand|scribd)\.com$/, name: 'Everand', color: [30, 180, 190], colorGuess: true },
  { re: /^play\.google\.com$/, path: /^\/(store\/)?books/, name: 'Google Play Books', color: hex('4285F4') },
  { re: /(^|\.)litres\.ru$/, name: 'Litres', color: [255, 85, 0], colorGuess: true },
  { re: /(^|\.)mybook\.ru$/, name: 'MyBook', color: [255, 90, 60], colorGuess: true },
  { re: /(^|\.)books\.yandex\.ru$|(^|\.)bookmate\.(com|ru)$/, name: 'Yandex Books', color: hex('FFCC00'), colorGuess: true },
  { re: /(^|\.)tunein\.com$/, name: 'TuneIn', color: hex('14D8CC') },
  { re: /(^|\.)radio\.garden$/, name: 'Radio Garden', color: [60, 220, 90], colorGuess: true },
  { re: /(^|\.)mytuner-radio\.com$/, name: 'myTuner', color: [0, 200, 220], colorGuess: true },
  { re: /(^|\.)somafm\.com$/, name: 'SomaFM', color: [230, 150, 40], colorGuess: true },
  { re: /(^|\.)radio\.(net|de|at|fr|it|es|pt|pl|dk|se)$/, name: 'radio.net', color: [40, 110, 230], colorGuess: true },
  { re: /(^|\.)radiorecord\.ru$/, name: 'Radio Record', color: [255, 90, 0], colorGuess: true },
  { re: /(^|\.)101\.ru$/, name: '101.ru', color: hex('FFDD19') },
  { re: /(^|\.)onlineradiobox\.com$/, name: 'Online Radio Box', color: [47, 110, 220] },

  // Video
  { re: /(^|\.)youtube(-nocookie)?\.com$|(^|\.)youtu\.be$/, name: 'YouTube', color: hex('FF0000') },
  { re: /(^|\.)twitch\.tv$/, name: 'Twitch', color: [145, 70, 255] },
  { re: /(^|\.)vkvideo\.ru$/, name: 'VK Video', color: hex('0077FF') },
  { re: /(^|\.)vk\.(com|ru)$/, name: 'VK', color: hex('0077FF') },
  { re: /(^|\.)netflix\.com$/, name: 'Netflix', color: hex('E50914') },
  { re: /(^|\.)primevideo\.com$/, name: 'Prime Video', color: hex('00A8E1') },
  { re: /(^|\.)amazon\.[a-z.]+$/, path: /^\/gp\/video/, name: 'Prime Video', color: hex('00A8E1') },
  { re: /(^|\.)disneyplus\.com$/, name: 'Disney+', color: [0, 99, 229] },
  { re: /(^|\.)tv\.apple\.com$/, name: 'Apple TV', color: [255, 255, 255] },
  { re: /(^|\.)(hbo)?max\.com$/, name: 'HBO Max', color: [153, 30, 235], colorGuess: true },
  { re: /(^|\.)hulu\.com$/, name: 'Hulu', color: hex('1CE783') },
  { re: /(^|\.)paramountplus\.com$/, name: 'Paramount+', color: hex('0064FF') },
  { re: /(^|\.)peacocktv\.com$/, name: 'Peacock', color: hex('FFDC23') },
  { re: /(^|\.)crunchyroll\.com$/, name: 'Crunchyroll', color: hex('F47521') },
  { re: /(^|\.)app\.plex\.tv$|(^|\.)plex\.direct$/, name: 'Plex', color: hex('E5A00D') },
  { re: /(^|\.)vimeo\.com$/, name: 'Vimeo', color: [26, 183, 234] },
  { re: /(^|\.)dailymotion\.com$|(^|\.)dai\.ly$/, name: 'Dailymotion', color: [0, 102, 220] },
  { re: /(^|\.)kick\.com$/, name: 'Kick', color: hex('53FC18') },
  { re: /(^|\.)rumble\.com$/, name: 'Rumble', color: [133, 199, 66] },
  { re: /(^|\.)bilibili\.(com|tv)$|(^|\.)b23\.tv$/, name: 'Bilibili', color: hex('00A1D6') },
  { re: /(^|\.)nicovideo\.jp$/, name: 'Niconico', color: [255, 255, 255] },
  { re: /(^|\.)tiktok\.com$/, name: 'TikTok', color: hex('FE2C55') },
  { re: /(^|\.)instagram\.com$/, name: 'Instagram', color: hex('E1306C') },
  { re: /(^|\.)facebook\.com$|(^|\.)fb\.watch$/, name: 'Facebook', color: hex('0866FF') },
  { re: /(^|\.)(x|twitter)\.com$/, name: 'X', color: [255, 255, 255] },
  { re: /(^|\.)rutube\.ru$/, name: 'Rutube', color: hex('ED143B') },
  { re: /(^|\.)dzen\.ru$/, name: 'Dzen', color: [255, 255, 255] },
  { re: /(^|\.)kinopoisk\.ru$/, name: 'Kinopoisk', color: hex('FF5500') },
  { re: /(^|\.)okko\.tv$/, name: 'Okko', color: [106, 43, 255], colorGuess: true },
  { re: /(^|\.)ivi\.(ru|tv)$/, name: 'Ivi', color: hex('F30745') },
  { re: /(^|\.)wink\.ru$/, name: 'Wink', color: [255, 91, 33] },
  { re: /(^|\.)premier\.one$/, name: 'Premier', color: hex('FDDD2D') },
  { re: /(^|\.)start\.ru$/, name: 'Start', color: hex('FF0019') },
  { re: /(^|\.)kion\.ru$/, name: 'KION', color: hex('C9024E') },
  { re: /^(www\.)?yandex\.[a-z.]+$/, path: /^\/video/, name: 'Yandex Video', color: hex('FC3F1D') }
];

// Self-hosted players with no fixed host: only recognisable by their tab title.
const TITLE_ONLY = [{ name: 'Jellyfin', color: hex('AA5CC3') }];

function parseUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname ? { host: u.hostname.toLowerCase(), path: u.pathname } : null;
  } catch {
    return null;
  }
}

function findSite(u) {
  return SITES.find((s) => s.re.test(u.host) && (!s.path || s.path.test(u.path)));
}

// { name, color } for a page URL: known sites get their brand name and colour, others show the
// bare domain (colour null -> caller falls back to the browser icon colour). null for bad URLs.
function siteInfo(url) {
  const u = parseUrl(url);
  if (!u) return null;
  const hit = findSite(u);
  return hit ? { name: hit.name, color: hit.color } : { name: u.host.replace(/^www\./, ''), color: null };
}

function isMediaHost(url) {
  const u = parseUrl(url);
  return Boolean(u && findSite(u));
}

// Players whose page title never names what's playing (it stays "Netflix", the station, the
// album…), so History can't be matched by title. Only these may be guessed from a recent visit:
// sites with proper titles (Rutube, Yandex Video, YouTube…) are always found by title instead.
const GENERIC_TITLE = new Set([
  'YouTube Music', 'Apple Music', 'Bandcamp', 'Mixcloud', 'iHeartRadio', 'Pocket Casts', 'Audible',
  'TuneIn', 'Radio Garden', 'myTuner', 'SomaFM', 'radio.net', 'Radio Record', 'Online Radio Box',
  'Netflix', 'Prime Video', 'Disney+', 'HBO Max', 'Hulu', 'Paramount+', 'Peacock', 'Plex',
  'Twitch', 'Kick', 'Dailymotion'
]);

function isGenericTitleSite(url) {
  const u = parseUrl(url);
  const hit = u && findSite(u);
  return Boolean(hit && GENERIC_TITLE.has(hit.name));
}

// Sites without Media Session metadata make macOS report the tab title, which for many players
// is just the service name ("Netflix"): map that back to the site.
function siteByTitle(title) {
  const t = String(title ?? '').trim().toLowerCase();
  if (!t) return null;
  const hit = [...SITES, ...TITLE_ONLY].find((s) => s.name.toLowerCase() === t);
  return hit ? { name: hit.name, color: hit.color } : null;
}

module.exports = { SITES, GENERIC_TITLE, siteInfo, isMediaHost, isGenericTitleSite, siteByTitle };
