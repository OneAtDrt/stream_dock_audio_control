#!/usr/bin/env bash
# Installs (or updates) the Audio Control plugin into Mirabox Stream Dock and restarts Stream Dock.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/com.oneatdrt.audio.sdPlugin"
DEST="$HOME/Library/Application Support/HotSpot/StreamDock/plugins/com.oneatdrt.audio.sdPlugin"

(cd "$SRC/plugin" && npm install --omit=dev --silent)
mkdir -p "$DEST"
rsync -a --delete --exclude 'log/' --exclude 'state.json' --exclude '*.test.js' "$SRC/" "$DEST/"
echo "Installed to $DEST"

if pgrep -x StreamDock >/dev/null; then
  osascript -e 'quit app "StreamDock"' || pkill -x StreamDock || true
  while pgrep -x StreamDock >/dev/null; do sleep 0.5; done
fi
open -a StreamDock
echo "Stream Dock restarted. Drag 'Volume + Mic Mute' from 'Audio Control' onto a knob."
