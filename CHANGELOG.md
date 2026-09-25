# Changelog

All notable changes to this project. Versions follow [Semantic Versioning](https://semver.org).

## [v0.1.0](https://github.com/OneAtDrt/stream_deck_audio_control/releases/tag/v0.1.0) — Initial release

* **Volume + Mic Mute** knob action for the Mirabox Stream Dock N4 Pro (macOS)
  * Turn to change output volume (2% per tick); unmutes the speaker
  * Press to mute speaker and microphone together, press again to restore both (mic level remembered in `state.json`)
  * Also works on a regular key (press only)
* Live 176×112 knob panel: volume %, volume bar, speaker/mic icons, status line (`SPEAKER · MIC ON` / `MIC MUTED` / `SPEAKER MUTED` / `ALL MUTED`), red background when all muted; re-syncs with macOS every second
* Knob ring light over USB HID: green (on), amber (mic muted), red (speaker muted); shared (non-exclusive) device access so Stream Dock stays connected; writes delayed 800 ms to avoid colliding with image transfers
* `install.sh` installer, unit tests (`node --test`)
* Files: `com.oneatdrt.audio.sdPlugin/manifest.json`, `plugin/index.js`, `plugin/audio.js`, `plugin/render.js`, `plugin/knob-led.js`, `plugin/audio.test.js`, `static/icon.svg`, `install.sh`, `README.md`
