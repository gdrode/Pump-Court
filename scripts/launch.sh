#!/usr/bin/env bash
# Builds Pump Court (frontend + Rust backend) into one desktop executable and
# starts it. macOS and Linux. Run from anywhere:  ./scripts/launch.sh
#
#   ./scripts/launch.sh            build (only what changed) and launch
#   ./scripts/launch.sh --no-run   build only; prints where the executable is
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN=1
[[ "${1:-}" == "--no-run" ]] && RUN=0

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing '$1'. $2" >&2; exit 1; }
}
need cargo "Install Rust from https://rustup.rs"
need npm "Install Node.js 18+ from https://nodejs.org"

echo "==> Frontend (React + TypeScript)"
cd "$ROOT/frontend"
# Install packages when they're missing or package-lock.json changed since the
# last install (e.g. after a pull or patch that added a package).
if [[ ! -f node_modules/.package-lock.json || package-lock.json -nt node_modules/.package-lock.json ]]; then
  npm install
fi
npm run build

echo "==> Desktop app (Rust + Tauri, release build; the first one takes a few minutes)"
cd "$ROOT/backend"
cargo build --release --features custom-protocol

APP="$ROOT/backend/target/release/pump-court"
echo "==> Built: $APP"
if [[ $RUN == 1 ]]; then
  echo "==> Launching Pump Court"
  exec "$APP"
fi
