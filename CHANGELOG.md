# Changelog

All notable changes to this project. Versions follow [Semantic Versioning](https://semver.org).

## [v0.2.0](https://github.com/OneAtDrt/stream_deck_audio_control/releases/tag/v0.2.0) — Now Playing knob

### Added
* **Now Playing** knob action: the panel shows the cover art with the source app as a badge, the source name, play state, artist and title. Press = play/pause, turn right/left = next/previous track (one skip per turn). Needs `media-control` (`brew install media-control`) because macOS 15.4+ blocks the now-playing API; `install.sh` warns if it's missing
* **Source-coloured ring** for Now Playing: the playing website's brand colour for browsers, brand colours for well-known apps (`app-colors.js`), otherwise the app icon's main colour; dimmed while paused. Browsers without a recognised site get no colour of their own
* **~80 known sites** with display names and LED colours (`sites.js`): music, video, podcasts, radio and audiobooks, incl. Russian services (Yandex Music, Zvuk, VK Video, Rutube, Kinopoisk, Okko, Ivi…)
* **Browser site detection without permission prompts**, from browser History (all profiles): Chrome (+ Beta/Dev/Canary), Chromium, Chromium-Gost, Brave, Edge, Arc, Dia, Comet, ChatGPT Atlas, Vivaldi, Opera (+ GX/Air), Thorium, Yandex Browser, and the Firefox family (Firefox, Zen, LibreWolf, Waterfox, Floorp; WAL-aware). Safari, Safari Technology Preview and Orion use their open tabs (one-time permission)
* Detection for pages whose title isn't the track: a service-name title with no artist ("Netflix"), a History match on artist or album, and the newest recent visit to a player whose title never names the track (Netflix, radio, YouTube Music…)
* Apps are found by process path / Spotlight (no AppleScript, so no prompt per app); AppKit icon fallback for apps without a usable `.icns` (Books, Calendar); Safari/WebKit helpers show the real app instead of "GPU"
* Volume and Now Playing knobs share the ring light without overwriting each other

### Fixed
* Turning the volume knob down to 0 now mutes the output, like the keyboard volume keys, instead of leaving faint sound at level 0

### Internal
* Stream updates are processed newest-wins, app lookups are shared, orphaned `media-control stream` processes are cleaned up, panel images are ~30 KB (64 px JPEG cover)
* Files: `manifest.json`, `plugin/nowplaying.js`, `plugin/color.js`, `plugin/browser-site.js`, `plugin/sites.js`, `plugin/app-icon.js`, `plugin/app-colors.js` (new); `plugin/knob-led.js`, `plugin/index.js`, `plugin/audio.js`, `plugin/render.js`, `static/nowplaying.svg`, `install.sh`, `README.md`
* Tests: 35 in `audio.test.js`, `sites.test.js`, `browser-site.test.js`, `app.test.js`

## [v0.1.0](https://github.com/OneAtDrt/stream_deck_audio_control/releases/tag/v0.1.0) — Initial release

* **Volume + Mic Mute** knob action for the Mirabox Stream Dock N4 Pro (macOS)
  * Turn to change output volume (2% per tick); unmutes the speaker
  * Press to mute speaker and microphone together, press again to restore both (mic level remembered in `state.json`)
  * Also works on a regular key (press only)
* Live 176×112 knob panel: volume %, volume bar, speaker/mic icons, status line (`SPEAKER · MIC ON` / `MIC MUTED` / `SPEAKER MUTED` / `ALL MUTED`), red background when all muted; re-syncs with macOS every second
* Knob ring light over USB HID: green (on), amber (mic muted), red (speaker muted); shared (non-exclusive) device access so Stream Dock stays connected; writes delayed 800 ms to avoid colliding with image transfers
* `install.sh` installer, unit tests (`node --test`) ([a6195cf](https://github.com/OneAtDrt/stream_deck_audio_control/commit/a6195cf2f52c1e056b22504851a421bf5405c5d6))
* Files: `com.oneatdrt.audio.sdPlugin/manifest.json`, `plugin/index.js`, `plugin/audio.js`, `plugin/render.js`, `plugin/knob-led.js`, `plugin/audio.test.js`, `static/icon.svg`, `install.sh`, `README.md`
