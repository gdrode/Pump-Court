#!/bin/sh
# Renders icon.html to backend/icons/icon-source.png (1024×1024, transparent)
# with headless Chrome, then makes every icon size with `cargo tauri icon`.
set -e
here=$(cd "$(dirname "$0")" && pwd)
root="$here/../../.."
out="$root/backend/icons/icon-source.png"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --allow-file-access-from-files --default-background-color=00000000 --force-device-scale-factor=1 \
  --window-size=1024,1024 --virtual-time-budget=3000 --screenshot="$out" "file://$here/icon.html"
cd "$root/backend" && cargo tauri icon icons/icon-source.png
# Keep only the files tauri.conf.json uses (cargo tauri icon also makes mobile and Store sizes).
cd icons && rm -rf android ios Square*Logo.png StoreLogo.png 64x64.png
