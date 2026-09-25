#!/usr/bin/env bash
# Installs (or updates) the Audio Control plugin into Mirabox Stream Dock and restarts Stream Dock.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/com.oneatdrt.audio.sdPlugin"
DEST="$HOME/Library/Application Support/HotSpot/StreamDock/plugins/com.oneatdrt.audio.sdPlugin"

(cd "$SRC/plugin" && npm install --omit=dev --silent)
if ! command -v media-control >/dev/null && [ ! -x /opt/homebrew/bin/media-control ] && [ ! -x /usr/local/bin/media-control ]; then
  echo "Note: 'Now Playing' needs media-control. Install it with: brew install media-control"
fi
mkdir -p "$DEST"
rsync -a --delete --exclude 'log/' --exclude 'state.json' --exclude '*.test.js' "$SRC/" "$DEST/"
echo "Installed to $DEST"

if pgrep -x StreamDock >/dev/null; then
  osascript -e 'quit app "StreamDock"' || pkill -x StreamDock || true
  while pgrep -x StreamDock >/dev/null; do sleep 0.5; done
fi
open -a StreamDock
echo "Stream Dock restarted. Actions are in the 'Audio Control' category: 'Volume + Mic Mute' and 'Now Playing'."
