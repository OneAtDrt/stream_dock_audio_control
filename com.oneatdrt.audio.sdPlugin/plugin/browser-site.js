'use strict';

// Finds the URL of the page a browser is playing, so the knob ring can use the site's colour.
// Chromium and Firefox browsers: look the track up in a copy of the browser's History database.
// That needs no macOS permission, unlike asking the browser over AppleScript (one prompt per app).
// Safari and other WebKit browsers: their history is privacy-protected, so we ask for their tabs
// (one-time prompt).
//
// Match order: page title contains the track title; else the artist or album; else the newest
// known media site visited in the last few minutes (for pages whose title says nothing useful).

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isGenericTitleSite, siteByTitle } = require('./sites');

const APP_SUPPORT = path.join(os.homedir(), 'Library/Application Support');

// bundle id -> browser data folder (profiles are its subfolders that contain a History file)
const CHROMIUM = {
  'com.google.Chrome': 'Google/Chrome',
  'com.google.Chrome.beta': 'Google/Chrome Beta',
  'com.google.Chrome.dev': 'Google/Chrome Dev',
  'com.google.Chrome.canary': 'Google/Chrome Canary',
  'org.chromium.Chromium': 'Chromium',
  'ru.cryptopro.chromium-gost': 'Chromium',
  'com.brave.Browser': 'BraveSoftware/Brave-Browser',
  'com.brave.Browser.beta': 'BraveSoftware/Brave-Browser-Beta',
  'com.brave.Browser.nightly': 'BraveSoftware/Brave-Browser-Nightly',
  'com.microsoft.edgemac': 'Microsoft Edge',
  'com.microsoft.edgemac.Beta': 'Microsoft Edge Beta',
  'com.microsoft.edgemac.Dev': 'Microsoft Edge Dev',
  'com.microsoft.edgemac.Canary': 'Microsoft Edge Canary',
  'company.thebrowser.Browser': 'Arc/User Data',
  'company.thebrowser.dia': 'Dia/User Data',
  'com.vivaldi.Vivaldi': 'Vivaldi',
  'com.vivaldi.Vivaldi.snapshot': 'Vivaldi Snapshot',
  'com.operasoftware.Opera': 'com.operasoftware.Opera',
  'com.operasoftware.OperaGX': 'com.operasoftware.OperaGX',
  'com.operasoftware.OperaAir': 'com.operasoftware.OperaAir',
  'ru.yandex.desktop.yandex-browser': 'Yandex/YandexBrowser',
  'ai.perplexity.comet': 'Comet',
  'com.openai.atlas': 'com.openai.atlas/browser-data/host',
  'org.chromium.Thorium': 'Thorium'
};
// bundle id -> browser data folder (profiles are Profiles/*, each with a places.sqlite)
const FIREFOX = {
  'org.mozilla.firefox': 'Firefox',
  'org.mozilla.firefoxdeveloperedition': 'Firefox',
  'org.mozilla.nightly': 'Firefox',
  'app.zen-browser.zen': 'zen',
  'org.mozilla.librewolf': 'librewolf',
  'io.gitlab.librewolf-community': 'librewolf',
  'net.waterfox.waterfox': 'Waterfox',
  'one.ablaze.floorp': 'Floorp'
};
// Browsers asked for their tabs over AppleScript (Orion's `name` of tab is unverified).
const WEBKIT = new Set(['com.apple.Safari', 'com.apple.SafariTechnologyPreview', 'com.kagi.kagimacOS']);

// How each History database stores visits. Times are µs since `epochUs` before the Unix epoch.
const ENGINES = {
  chromium: { table: 'urls', time: 'last_visit_time', epochUs: 11644473600000000n },
  firefox: { table: 'moz_places', time: 'last_visit_date', epochUs: 0n }
};
const RECENT_MS = 10 * 60 * 1000;
const RECENT_LIMIT = 50;
const MIN_TERM = 3;

function isBrowser(bundleId) {
  return Boolean(CHROMIUM[bundleId] || FIREFOX[bundleId]) || WEBKIT.has(bundleId);
}

function run(file, args, timeout = 4000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

function subdirs(root) {
  try {
    return fs.readdirSync(root).map((name) => path.join(root, name));
  } catch {
    return [];
  }
}

function historyFiles(bundleId) {
  if (CHROMIUM[bundleId]) {
    const root = path.join(APP_SUPPORT, CHROMIUM[bundleId]);
    return [root, ...subdirs(root)].map((d) => path.join(d, 'History')).filter((f) => fs.existsSync(f));
  }
  if (FIREFOX[bundleId]) {
    return subdirs(path.join(APP_SUPPORT, FIREFOX[bundleId], 'Profiles'))
      .map((d) => path.join(d, 'places.sqlite')).filter((f) => fs.existsSync(f));
  }
  return [];
}

// SQL string literal for a LIKE pattern that matches `text` anywhere, with wildcards escaped.
function likeContains(text) {
  const escaped = String(text).replace(/[\\%_]/g, (c) => `\\${c}`).replace(/'/g, "''");
  return `'%${escaped}%' ESCAPE '\\'`;
}

// Artist / album worth matching on (fallback b): non-empty, not too short, not the title again.
function fallbackTerms(track) {
  const title = String(track.title || '').trim().toLowerCase();
  const terms = [track.artist, track.album].map((t) => String(t || '').trim())
    .filter((t) => t.length >= MIN_TERM && t.toLowerCase() !== title);
  return [...new Set(terms)];
}

// One query per History database: the newest title match (rank 1), the newest artist/album match
// (rank 2) and the recent visits (rank 3). Rows are "rank \t unix ms \t url".
function historySql(engine, track, nowMs = Date.now()) {
  const { table, time, epochUs } = ENGINES[engine];
  const select = (rank, where, limit) => `SELECT * FROM (SELECT ${rank}, (${time} - ${epochUs}) / 1000, url FROM ${table} WHERE ${where} ORDER BY ${time} DESC LIMIT ${limit})`;
  const parts = [];
  if (track.title) parts.push(select(1, `title LIKE ${likeContains(track.title)}`, 1));
  const terms = fallbackTerms(track);
  if (terms.length) parts.push(select(2, terms.map((t) => `title LIKE ${likeContains(t)}`).join(' OR '), 1));
  const sinceUs = BigInt(Math.floor(nowMs - RECENT_MS)) * 1000n + epochUs;
  parts.push(select(3, `${time} >= ${sinceUs}`, RECENT_LIMIT));
  return `${parts.join(' UNION ALL ')};`;
}

function parseRows(text) {
  return String(text || '').split('\n').filter(Boolean).map((line) => {
    const [rank, time, ...url] = line.split('\t');
    return { rank: Number(rank), time: Number(time), url: url.join('\t') };
  });
}

// Best row across profiles: lowest rank, then newest. Rank 3 (a recent visit, no title match) only
// counts for players whose page title never names the track: guessing any media site would pick
// e.g. a Yandex Video search page while the real Rutube tab just isn't in History yet.
function pickPlaying(rows, isGuessable = isGenericTitleSite) {
  let best = null;
  for (const row of rows) {
    if (row.rank === 3 && !isGuessable(row.url)) continue;
    if (!best || row.rank < best.rank || (row.rank === best.rank && row.time > best.time)) best = row;
  }
  return best ? best.url : null;
}

function copyPath(file) {
  return path.join(os.tmpdir(), `oneatdrt-history-${Buffer.from(file).toString('base64url').slice(-40)}.db`);
}

function statKey(file) {
  try {
    const stat = fs.statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return '-';
  }
}

// The browser holds a lock on History, so query a private copy (refreshed only when it changed).
// Firefox keeps recent visits in the write-ahead log beside places.sqlite, so that is copied too;
// Chromium's History uses a rollback journal, so its file alone is complete.
const copies = new Map();
function historyCopy(file, copy = copyPath(file)) {
  const wal = `${file}-wal`;
  const key = `${statKey(file)}|${statKey(wal)}`;
  const cached = copies.get(file);
  if (cached && cached.key === key) return cached.copy;
  for (const stale of [`${copy}-wal`, `${copy}-shm`]) fs.rmSync(stale, { force: true });
  // WAL first: a checkpoint in between then only moves its pages into the main file we copy next.
  if (fs.existsSync(wal)) fs.copyFileSync(wal, `${copy}-wal`);
  fs.copyFileSync(file, copy);
  copies.set(file, { key, copy });
  return copy;
}

function engineOf(bundleId) {
  if (CHROMIUM[bundleId]) return 'chromium';
  if (FIREFOX[bundleId]) return 'firefox';
  return null;
}

// Query every History file (copies of them) of one engine and pick the playing page.
async function queryHistory(engine, files, track, nowMs = Date.now()) {
  const sql = historySql(engine, track, nowMs);
  const rows = [];
  for (const file of files) {
    try {
      // Opened read-write: a WAL-mode copy without a -wal file cannot be opened with mode=ro.
      rows.push(...parseRows(await run('/usr/bin/sqlite3', ['-separator', '\t', historyCopy(file), sql])));
    } catch {
      // Unreadable profile: try the others.
    }
  }
  return pickPlaying(rows);
}

function parseTabs(text) {
  return String(text || '').split('\n').filter(Boolean).map((line) => {
    const [url, ...rest] = line.split('\t');
    return { url, title: rest.join('\t') };
  });
}

function titleHas(tab, text) {
  const needle = String(text || '').trim().toLowerCase();
  return Boolean(needle) && tab.title.toLowerCase().includes(needle);
}

// The playing tab: its title contains the track title (YouTube: "<title> - YouTube"), else the
// artist or album. `track` may be just the title.
function findPlayingTab(tabs, track) {
  const t = typeof track === 'string' ? { title: track } : track || {};
  return tabs.find((tab) => titleHas(tab, t.title))
    || tabs.find((tab) => fallbackTerms(t).some((term) => titleHas(tab, term)))
    || null;
}

async function webkitPlayingUrl(bundleId, track) {
  // Separators are set outside "tell": inside it, the browser's dictionary turns `tab` into a class.
  const script = `set sep to character id 9
set nl to character id 10
if application id "${bundleId}" is running then
  tell application id "${bundleId}"
    set out to ""
    repeat with w in windows
      repeat with t in tabs of w
        set out to out & (URL of t) & sep & (name of t) & nl
      end repeat
    end repeat
    return out
  end tell
end if`;
  const tabs = parseTabs(await run('/usr/bin/osascript', ['-e', script]));
  // Tabs have no visit time: the first one on a known media site stands in for "recent".
  const tab = findPlayingTab(tabs, track) || tabs.find((t) => isGenericTitleSite(t.url));
  return tab ? tab.url : null;
}

// A page without media metadata reports no artist and the service itself as the title
// ("Netflix"). With an artist, a title like "Start" is a real track, not the Start site.
function titleSite(track) {
  if (!track || String(track.artist || '').trim()) return null;
  return siteByTitle(track.title);
}

// track: { title, artist, album }
async function playingUrl(bundleId, track) {
  if (!track || !(track.title || track.artist || track.album)) return null;
  if (engineOf(bundleId)) return queryHistory(engineOf(bundleId), historyFiles(bundleId), track);
  if (WEBKIT.has(bundleId)) return webkitPlayingUrl(bundleId, track);
  return null;
}

module.exports = {
  CHROMIUM, FIREFOX, WEBKIT, isBrowser, playingUrl, likeContains, fallbackTerms, historySql,
  parseRows, pickPlaying, historyCopy, queryHistory, parseTabs, findPlayingTab, titleSite
};
