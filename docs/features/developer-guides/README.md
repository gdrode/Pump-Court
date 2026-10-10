# Feature 08: Developer Guides & Engineering Toolchains

> **Target Audience**: Software Engineers, Contributors, and AI Coding Agents  
> **Key Commands**: `cargo tauri dev`, `cargo test`, `npm test`, `npm run build`  
> **Related Documents**: [Rust Backend Guide](rust-backend-guide.md), [Tracker Integration](tracker-integration.md), [Architecture](../../ARCHITECTURE.md)  
> **Maintenance Status**: Active / Developer Onboarding  

---

## 1. Requirements

To build, run and test Pump Court:

1. **Rust**: a current stable toolchain via [rustup](https://rustup.rs) (edition 2021).
2. **Node.js**: Node.js 18+ and npm.
3. **Tauri CLI** (only for `cargo tauri dev`): `cargo install tauri-cli --version "^2" --locked`.
4. **Linux only** (Windows and macOS need nothing extra):
   ```bash
   sudo apt update && sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev build-essential libssl-dev
   ```
5. **Optional**: `cloudflared`, for the phone **Phone · any network** link (the default tab in Add camera). See [Internet Link](../phone-camera/internet-link.md).

---

## 2. Quickstart

### Step 1: Install the frontend packages
```bash
cd frontend && npm install && cd ..
```
`npm install` also runs `scripts/setup-assets.mjs`, which copies the MediaPipe wasm files and the `pose_landmarker_full.task` model into `frontend/public/wasm` and `frontend/public/models` (not committed). `pumpCourt/` needs no `npm install` for the app: Vite and TypeScript take its `@mediapipe/tasks-vision` from `frontend/node_modules`.

### Step 2a: Build and launch (one command)
```bash
./scripts/launch.sh          # macOS / Linux
scripts\launch.cmd           # Windows (double-click works too; it runs launch.ps1)
```
- Runs `npm install` when `frontend/node_modules` is missing or `frontend/package-lock.json` is newer than the last install.
- Runs `npm run build` (assets, type check, Vite, then the phone page), then `cargo build --release --features custom-protocol`, then starts `backend/target/release/pump-court`.
- First build: 5–15 minutes. Later builds: about a minute.
- `--no-run` (`-NoRun` on Windows) builds without launching.
- **macOS / Linux**: `launch.sh` must be executable. If you get "Permission denied", run `chmod +x scripts/launch.sh` and commit the bit with `git update-index --chmod=+x scripts/launch.sh`.

### Step 2b: Development with hot reload
```bash
cd backend
cargo tauri dev
```
This runs `npm run dev` in `frontend/` (assets, the phone page with esbuild, then Vite on port 5173), compiles the Rust backend, and opens the window. React changes reload at once; Rust changes rebuild the app.

The phone page is baked into the Rust binary when it compiles. After changing `pumpCourt/phone.html` or `pumpCourt/src/phone/`, rebuild the frontend **and** the Rust app. See [The Phone Page](../phone-camera/mobile-web-client.md).

---

## 3. Tests

### 3.1 Rust backend
```bash
cd backend
cargo test
```
34 tests. They cover the round session (phases, countdown, modes, ending rules), the leaderboard (names, migration, ranking, backups), pairing rooms and HTTP signalling, the relay's orientation notes (`relay_orientation_reaches_the_laptop`), the server's tunnel guard, laptop address ranking, and the tunnel's URL and DNS parsing.

### 3.2 Tracker and referee (the teammate's code)
```bash
cd pumpCourt
npm install
npm test
```
Unit tests for geometry, angles, side tracker, posture check, rep judge, rep log, the prototype's game modes, and the prototype's phone signalling and relay. The app uses the same tracker modules, so they test the app's referee too (the game-mode tests don't apply to the app).

### 3.3 Run the standalone tracker
```bash
cd pumpCourt
npm run dev        # https://localhost:5173 on the network (phones need HTTPS)
npm run dev:local  # http only on this laptop; for previews that refuse the self-signed certificate
```
It uses port 5173 too, so stop `cargo tauri dev` first. See [Browser Prototype Judge](../referee-engine/browser-prototype-judge.md) and [Prototype Pairing](../phone-camera/browser-prototype-pairing.md).

### 3.4 Frontend type check and production bundle
```bash
cd frontend
npm run build
```
Type-checks (including the `@tracker` modules it imports) and writes `frontend/dist/`, including `dist/phone.html`.
