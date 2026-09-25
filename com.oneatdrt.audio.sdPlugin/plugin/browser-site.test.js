'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CHROMIUM, FIREFOX, WEBKIT, isBrowser, likeContains, fallbackTerms, historySql, parseRows, pickPlaying,
  historyCopy, queryHistory, findPlayingTab, titleSite
} = require('./browser-site');

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const MIN = 60 * 1000;
// Unix ms -> each engine's visit time (Chromium: µs since 1601-01-01, Firefox: µs since 1970).
const chromiumTime = (ms) => BigInt(ms) * 1000n + 11644473600000000n;
const firefoxTime = (ms) => BigInt(ms) * 1000n;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oneatdrt-browser-site-test-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

function chromiumDb(name, rows) {
  const file = path.join(tmp, name, 'History');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const inserts = rows.map((r) => `INSERT INTO urls (url, title, last_visit_time) VALUES (${quote(r.url)}, ${quote(r.title)}, ${chromiumTime(r.at)});`);
  execFileSync('/usr/bin/sqlite3', [file, `CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, last_visit_time INTEGER); ${inserts.join(' ')}`]);
  return file;
}

function firefoxSql(rows) {
  return rows.map((r) => `INSERT INTO moz_places (url, title, last_visit_date) VALUES (${quote(r.url)}, ${r.title == null ? 'NULL' : quote(r.title)}, ${r.at == null ? 'NULL' : firefoxTime(r.at)});`).join(' ');
}

function firefoxDb(name, rows) {
  const file = path.join(tmp, name, 'places.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execFileSync('/usr/bin/sqlite3', [file, `PRAGMA journal_mode=WAL; CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT, last_visit_date INTEGER); ${firefoxSql(rows)}`]);
  return file;
}

// Keeps a sqlite3 writer open on `file` (like a running Firefox), with rows only in the WAL.
function openWriter(file, rows) {
  const proc = spawn('/usr/bin/sqlite3', [file]);
  return new Promise((resolve, reject) => {
    let out = '';
    proc.on('error', reject);
    proc.stdout.on('data', (d) => {
      out += d;
      if (out.includes('ready')) resolve(proc);
    });
    proc.stdin.write(`PRAGMA wal_autocheckpoint=0; ${firefoxSql(rows)}\n.print ready\n`);
  });
}

test('browser sets', () => {
  for (const id of ['com.google.Chrome', 'ru.cryptopro.chromium-gost', 'org.chromium.Chromium', 'ai.perplexity.comet', 'company.thebrowser.dia']) assert.ok(CHROMIUM[id], id);
  assert.equal(CHROMIUM['ru.cryptopro.chromium-gost'], 'Chromium');
  for (const id of ['org.mozilla.firefox', 'app.zen-browser.zen', 'one.ablaze.floorp']) assert.ok(FIREFOX[id], id);
  for (const id of ['com.apple.Safari', 'com.apple.SafariTechnologyPreview', 'com.kagi.kagimacOS']) assert.ok(WEBKIT.has(id), id);
  assert.ok(isBrowser('org.mozilla.firefox'));
  assert.ok(isBrowser('com.kagi.kagimacOS'));
  assert.ok(!isBrowser('com.apple.WebKit.GPU'));
  assert.ok(!isBrowser('com.spotify.client'));
});

test('likeContains escapes LIKE wildcards and quotes', () => {
  assert.equal(likeContains('100% it\'s_ok\\'), "'%100\\% it''s\\_ok\\\\%' ESCAPE '\\'");
  const db = path.join(tmp, 'like.db');
  execFileSync('/usr/bin/sqlite3', [db, "CREATE TABLE t (title TEXT); INSERT INTO t VALUES ('50% off'), ('500 off'), ('a_b'), ('axb'), ('it''s');"]);
  const q = (text) => execFileSync('/usr/bin/sqlite3', [db, `SELECT title FROM t WHERE title LIKE ${likeContains(text)} ORDER BY title;`]).toString().trim();
  assert.equal(q('50%'), '50% off');
  assert.equal(q('a_b'), 'a_b');
  assert.equal(q("it's"), "it's");
});

test('fallback terms: artist and album, long enough, not the title', () => {
  assert.deepEqual(fallbackTerms({ title: 'Song', artist: 'Band', album: 'Record' }), ['Band', 'Record']);
  assert.deepEqual(fallbackTerms({ title: 'Song', artist: 'AB', album: '' }), []);
  assert.deepEqual(fallbackTerms({ title: 'Band', artist: 'Band', album: 'Band' }), []);
  assert.deepEqual(fallbackTerms({ title: 'Song', artist: 'Same', album: 'Same' }), ['Same']);
});

test('SQL builders use each engine\'s table and time base', () => {
  const since = NOW - 10 * MIN;
  const chromium = historySql('chromium', { title: 'Song', artist: 'Band' }, NOW);
  assert.match(chromium, /FROM urls WHERE title LIKE '%Song%'/);
  assert.match(chromium, /FROM urls WHERE title LIKE '%Band%'/);
  assert.ok(chromium.includes(`last_visit_time >= ${chromiumTime(since)}`));
  const firefox = historySql('firefox', { title: 'Song' }, NOW);
  assert.match(firefox, /FROM moz_places WHERE title LIKE '%Song%'/);
  assert.ok(!firefox.includes('SELECT 2'));
  assert.ok(firefox.includes(`last_visit_date >= ${firefoxTime(since)}`));
});

test('pickPlaying: title beats artist/album beats recent media site', () => {
  const isMedia = (url) => url.includes('media');
  const rows = [
    { rank: 3, time: 50, url: 'https://media/new' },
    { rank: 3, time: 60, url: 'https://other/newest' },
    { rank: 2, time: 40, url: 'https://artist' },
    { rank: 1, time: 10, url: 'https://title/old' },
    { rank: 1, time: 20, url: 'https://title/new' }
  ];
  assert.equal(pickPlaying(rows, isMedia), 'https://title/new');
  assert.equal(pickPlaying(rows.filter((r) => r.rank > 1), isMedia), 'https://artist');
  assert.equal(pickPlaying(rows.filter((r) => r.rank > 2), isMedia), 'https://media/new');
  assert.equal(pickPlaying(rows.filter((r) => r.url.includes('other')), isMedia), null);
  assert.deepEqual(parseRows('1\t5\thttps://a/?q=1\n'), [{ rank: 1, time: 5, url: 'https://a/?q=1' }]);
});

test('Chromium History: fallback order and 10-minute window across profiles', async () => {
  const a = chromiumDb('chromium/Default', [
    { url: 'https://www.youtube.com/watch?v=title', title: 'Great Song - YouTube', at: NOW - 60 * MIN },
    { url: 'https://example.com/band', title: 'The Band live', at: NOW - 30 * MIN },
    { url: 'https://www.netflix.com/watch/old', title: 'Something', at: NOW - 11 * MIN }
  ]);
  const b = chromiumDb('chromium/Profile 1', [
    { url: 'https://example.com/blog', title: 'Blog', at: NOW - MIN },
    { url: 'https://music.youtube.com/watch?v=recent', title: 'YouTube Music', at: NOW - 5 * MIN }
  ]);
  const q = (track) => queryHistory('chromium', [a, b], track, NOW);
  assert.equal(await q({ title: 'great song', artist: 'The Band' }), 'https://www.youtube.com/watch?v=title');
  assert.equal(await q({ title: 'Nope', artist: 'The Band' }), 'https://example.com/band');
  assert.equal(await q({ title: 'Nope', artist: '' }), 'https://music.youtube.com/watch?v=recent');
  // 11 minutes ago is outside the window; the blog is not a media site.
  assert.equal(await queryHistory('chromium', [a], { title: 'Nope' }, NOW), null);
  assert.equal(await queryHistory('chromium', [a], { title: 'Nope' }, NOW - 2 * MIN), 'https://www.netflix.com/watch/old');
});

test('Firefox places: fallback order, µs-since-1970 window, NULL visits ignored', async () => {
  const f = firefoxDb('firefox/Profiles/abc.default-release', [
    { url: 'https://www.youtube.com/watch?v=album', title: 'Full Record stream', at: NOW - 40 * MIN },
    { url: 'https://www.netflix.com/watch/recent', title: 'Watch', at: NOW - 9 * MIN },
    { url: 'https://www.youtube.com/bookmark', title: null, at: null }
  ]);
  const q = (track, now = NOW) => queryHistory('firefox', [f], track, now);
  assert.equal(await q({ title: 'Full Record' }), 'https://www.youtube.com/watch?v=album');
  assert.equal(await q({ title: 'Nope', album: 'Full Record' }), 'https://www.youtube.com/watch?v=album');
  assert.equal(await q({ title: 'Nope' }), 'https://www.netflix.com/watch/recent');
  assert.equal(await q({ title: 'Nope' }, NOW + 2 * MIN), null);
});

test('Firefox copy includes the WAL of a database that is open for writing', async () => {
  const file = firefoxDb('wal/Profiles/w.default', [{ url: 'https://example.com/old', title: 'Old page', at: NOW - 60 * MIN }]);
  const writer = await openWriter(file, [{ url: 'https://www.youtube.com/watch?v=wal', title: 'Fresh Tune - YouTube', at: NOW - MIN }]);
  try {
    assert.ok(fs.statSync(`${file}-wal`).size > 0, 'rows are still in the WAL');
    const copy = path.join(tmp, 'wal-copy.db');
    fs.writeFileSync(`${copy}-shm`, 'stale');
    historyCopy(file, copy);
    assert.ok(fs.existsSync(`${copy}-wal`));
    assert.equal(execFileSync('/usr/bin/sqlite3', [copy, "SELECT url FROM moz_places WHERE title LIKE '%Fresh Tune%';"]).toString().trim(),
      'https://www.youtube.com/watch?v=wal');
    assert.equal(await queryHistory('firefox', [file], { title: 'Fresh Tune' }, NOW), 'https://www.youtube.com/watch?v=wal');
    // A later write changes the WAL, so the cached copy is refreshed.
    await new Promise((resolve) => {
      writer.stdout.once('data', resolve);
      writer.stdin.write(`${firefoxSql([{ url: 'https://www.youtube.com/watch?v=later', title: 'Later Tune', at: NOW }])}\n.print again\n`);
    });
    assert.equal(await queryHistory('firefox', [file], { title: 'Later Tune' }, NOW), 'https://www.youtube.com/watch?v=later');
  } finally {
    writer.stdin.end();
    await new Promise((resolve) => writer.on('close', resolve));
  }
});

test('WebKit tabs: title, then artist/album', () => {
  const tabs = [
    { url: 'https://example.com/', title: 'Band interview' },
    { url: 'https://www.youtube.com/watch?v=1', title: 'Great Song (Live) - YouTube' }
  ];
  assert.equal(findPlayingTab(tabs, { title: 'great song (live)', artist: 'Band' }).url, 'https://www.youtube.com/watch?v=1');
  assert.equal(findPlayingTab(tabs, { title: 'Other', artist: 'Band' }).url, 'https://example.com/');
  assert.equal(findPlayingTab(tabs, { title: 'Other', artist: 'AB' }), null);
  assert.equal(findPlayingTab(tabs, 'Other'), null);
});

test('service-name title maps to the site only when the track has no artist', () => {
  assert.equal(titleSite({ title: 'Netflix', artist: '' }).name, 'Netflix');
  assert.equal(titleSite({ title: '  start ', artist: '' }).name, 'Start');
  assert.equal(titleSite({ title: 'Start', artist: 'Some Band' }), null);
  assert.equal(titleSite({ title: 'Netflix', artist: 'Some Band' }), null);
  assert.equal(titleSite({ title: 'Great Song', artist: '' }), null);
  assert.equal(titleSite(null), null);
});

test('pickPlaying never guesses a site whose titles name the video (Rutube tab missing from History)', () => {
  const rows = [
    { rank: 3, time: 3, url: 'https://yandex.ru/video/preview/123' },
    { rank: 3, time: 2, url: 'https://rutube.ru/video/abc/' },
    { rank: 3, time: 1, url: 'https://www.youtube.com/watch?v=x' }
  ];
  assert.equal(pickPlaying(rows), null);
  assert.equal(pickPlaying([...rows, { rank: 3, time: 0, url: 'https://www.netflix.com/watch/1' }]), 'https://www.netflix.com/watch/1');
  assert.equal(pickPlaying([...rows, { rank: 1, time: 0, url: 'https://rutube.ru/video/abc/' }]), 'https://rutube.ru/video/abc/');
});
