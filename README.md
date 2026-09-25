# Stream Dock Audio Control

> **macOS only.** Audio is controlled through AppleScript (`osascript`), and the plugin ships only a macOS build.

A [Mirabox Stream Dock](https://mirabox.net) plugin for macOS that puts system volume and a "mute everything" toggle on one knob of the **N4 Pro**. The panel above the knob and the knob's ring light always show the current state.

| Input | Effect |
|---|---|
| Turn | Changes output volume by 2% per tick and unmutes the speaker. The mic isn't touched. |
| Press | If the speaker or the mic is live, mutes **both**. If both are already muted, turns both back on. |

## Features

- **Live panel** (176×112, above the knob) with:
  - volume % and a volume bar
  - speaker and mic icons, red and crossed out when muted
  - a status line: `SPEAKER · MIC ON`, `MIC MUTED`, `SPEAKER MUTED` or `ALL MUTED`
  - a red background when everything is muted
- **Always in sync:** the plugin checks macOS audio every second, so changes from the keyboard volume keys, the menu bar or other apps show up too.
- **Knob ring light:**
  - **green** when the speaker and mic are on
  - **amber** when only the mic is muted
  - **red** when the speaker is muted
  - back to the colour set in the Stream Dock app when you leave the page
- **Works on a normal key too** (press only). The panel is drawn to fit a 144×144 key.
- **Mic level restored on unmute:** the plugin remembers the mic level you had, even across restarts.

## Requirements

- macOS
- Stream Dock app 3.10.191 or newer. It runs the plugin with its built-in Node 20.
- Mirabox **N4 Pro**, for the knob and ring light. Tested on an N4 Pro E (`5548:1021`).
- Node.js / npm, used by `install.sh` to install dependencies.

## Install

```sh
git clone https://github.com/OneAtDrt/stream_deck_audio_control.git
cd stream_deck_audio_control
./install.sh
```

`install.sh` does three things:
1. Installs dependencies.
2. Copies `com.oneatdrt.audio.sdPlugin` into `~/Library/Application Support/HotSpot/StreamDock/plugins/`.
3. Restarts Stream Dock.

Then, in Stream Dock, drag **Volume + Mic Mute** from the **Audio Control** category onto a knob. It works in both Button Mode and Control Bar Mode.

To update, pull and run `./install.sh` again.

## How it works

| Part | File | Details |
|---|---|---|
| Stream Dock wiring | `plugin/index.js` | Handles `dialRotate`, `dialDown` and `keyUp`, draws the panel with `setImage`, checks audio every 1 s, and batches fast knob turns into one volume change. |
| Audio | `plugin/audio.js` | Uses `osascript` (`get/set volume settings`), so nothing extra needs installing. Muting the mic sets its input level to 0, and the previous level is saved in `plugin/state.json`. If nothing was saved, unmuting uses 50. |
| Panel images | `plugin/render.js` | SVG images for the 176×112 panel and 144×144 keys. |
| Ring light | `plugin/knob-led.js` | See below. |

### Ring light

The Stream Dock plugin API has no call for knob ring colours, so the plugin talks to the device over USB HID with [`node-hid`](https://github.com/node-hid/node-hid). It uses the N4 Pro's own command, as documented by [mirajazz](https://github.com/ambiso/mirajazz): report `0` + `CRT\0\0SETLB` + one RGB triple per knob, padded to 1024 bytes.

- **Opened in shared mode** (`nonExclusive: true`). By default, hidapi on macOS takes the device exclusively. That disconnects Stream Dock, and the device screen freezes until you reconnect it in the app.
- **Delayed 800 ms** after a state change, so the packet doesn't land in the middle of Stream Dock's image transfer.
- **Re-sent every 60 s**, in case Stream Dock repaints the rings on a page switch or profile load.
- **Other knobs keep their colours:** the plugin reads the colours you set in the Stream Dock app from its config, under `[DeviceLightBrightness]`.

Supported USB IDs: `5548:1021` (N4 Pro E), `5548:1023`, `5548:1008`.

### Limitations

- The mic mute sets the input level to 0. An app that manages its own mic gain can raise it again.
- The ring light works by sending the device's own USB command directly, so a Stream Dock firmware or app update could break it.

## Development

```sh
cd com.oneatdrt.audio.sdPlugin/plugin
npm install
npm test
```

The plugin writes its log to `plugin/log/plugin.log` inside the installed plugin folder.

## Version history

See [CHANGELOG.md](./CHANGELOG.md).
