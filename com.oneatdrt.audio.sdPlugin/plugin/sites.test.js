'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SITES, siteInfo, isMediaHost, siteByTitle } = require('./sites');

test('siteInfo matches a site from each category by host', () => {
  assert.deepEqual(siteInfo('https://open.spotify.com/track/1'), { name: 'Spotify', color: [30, 215, 96] });
  assert.deepEqual(siteInfo('https://www.netflix.com/watch/1'), { name: 'Netflix', color: [229, 9, 20] });
  assert.equal(siteInfo('https://pocketcasts.com/podcasts/1').name, 'Pocket Casts');
  assert.equal(siteInfo('https://www.audible.co.uk/pd/1').name, 'Audible');
  assert.equal(siteInfo('https://radio.garden/listen/x').name, 'Radio Garden');
  assert.equal(siteInfo('https://music.yandex.com.tr/album/1').name, 'Yandex Music');
  assert.equal(siteInfo('https://www.youtube-nocookie.com/embed/1').name, 'YouTube');
  assert.equal(siteInfo('https://www.max.com/video/1').name, 'HBO Max');
  assert.equal(siteInfo('https://twitter.com/i/status/1').name, 'X');
});

test('siteInfo checks the path where an entry has one', () => {
  assert.equal(siteInfo('https://play.google.com/store/books/details?id=1').name, 'Google Play Books');
  assert.equal(siteInfo('https://play.google.com/books/reader?id=1').name, 'Google Play Books');
  assert.deepEqual(siteInfo('https://play.google.com/store/apps'), { name: 'play.google.com', color: null });
  assert.equal(siteInfo('https://yandex.ru/video/preview/1').name, 'Yandex Video');
  assert.deepEqual(siteInfo('https://yandex.ru/search/?text=a'), { name: 'yandex.ru', color: null });
});

test('siteInfo prefers specific entries over their parent domain', () => {
  assert.equal(siteInfo('https://music.youtube.com/watch?v=1').name, 'YouTube Music');
  assert.equal(siteInfo('https://www.youtube.com/watch?v=1').name, 'YouTube');
  assert.equal(siteInfo('https://vk.com/audios123').name, 'VK Music');
  assert.equal(siteInfo('https://vk.ru/music/playlist/1').name, 'VK Music');
  assert.equal(siteInfo('https://vk.com/video-1_2').name, 'VK');
  assert.equal(siteInfo('https://www.amazon.de/gp/video/detail/1').name, 'Prime Video');
  assert.equal(siteInfo('https://music.amazon.com/albums/1').name, 'Amazon Music');
  assert.deepEqual(siteInfo('https://www.amazon.com/dp/1'), { name: 'amazon.com', color: null });
  assert.equal(siteInfo('https://podcasts.apple.com/us/podcast/1').name, 'Apple Podcasts');
  assert.equal(siteInfo('https://tv.apple.com/show/1').name, 'Apple TV');
  assert.equal(siteInfo('https://books.yandex.ru/audiobooks/1').name, 'Yandex Books');
});

test('siteInfo: unknown host -> bare domain, invalid URL -> null', () => {
  assert.deepEqual(siteInfo('https://www.example.org/a'), { name: 'example.org', color: null });
  assert.deepEqual(siteInfo('https://notyoutube.com/'), { name: 'notyoutube.com', color: null });
  assert.equal(siteInfo('not a url'), null);
  assert.equal(siteInfo('about:blank'), null);
  assert.equal(siteInfo(''), null);
});

test('isMediaHost is true only for known sites', () => {
  assert.equal(isMediaHost('https://www.twitch.tv/x'), true);
  assert.equal(isMediaHost('https://vk.com/audio'), true);
  assert.equal(isMediaHost('https://example.com/'), false);
  assert.equal(isMediaHost('https://www.amazon.com/dp/1'), false);
  assert.equal(isMediaHost('garbage'), false);
});

test('siteByTitle maps a bare service-name title to its site', () => {
  assert.deepEqual(siteByTitle('Netflix'), { name: 'Netflix', color: [229, 9, 20] });
  assert.equal(siteByTitle('  youtube music ').name, 'YouTube Music');
  assert.equal(siteByTitle('TWITCH').name, 'Twitch');
  assert.equal(siteByTitle('Disney+').name, 'Disney+');
  assert.equal(siteByTitle('Radio Garden').name, 'Radio Garden');
  assert.equal(siteByTitle('Hulu').name, 'Hulu');
  assert.equal(siteByTitle('Plex').name, 'Plex');
  assert.deepEqual(siteByTitle('Jellyfin'), { name: 'Jellyfin', color: [170, 92, 195] });
  assert.equal(siteByTitle('Netflix - Stranger Things'), null);
  assert.equal(siteByTitle(''), null);
  assert.equal(siteByTitle(undefined), null);
});

test('every SITES entry is well-formed and unique', () => {
  const seen = new Set();
  for (const s of SITES) {
    assert.ok(s.re instanceof RegExp, `${s.name}: re`);
    assert.ok(typeof s.name === 'string' && s.name, 'name');
    assert.ok(!s.path || s.path instanceof RegExp, `${s.name}: path`);
    assert.equal(s.color.length, 3, `${s.name}: color`);
    for (const c of s.color) assert.ok(Number.isInteger(c) && c >= 0 && c <= 255, `${s.name}: ${c}`);
    const key = `${s.re.source}|${s.path?.source || ''}`;
    assert.ok(!seen.has(key), `duplicate entry ${key}`);
    seen.add(key);
  }
});
