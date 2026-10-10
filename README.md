# Pump-Court

A push-up contest judged by software. A side-on camera (laptop webcam or a phone) tracks your body, three referee lights call each push-up, and valid push-ups go on a public leaderboard.

Get into position side-on to the camera. Three referee lights (Depth, Torso, Lockout) judge every push-up. 2 of 3 white lights = it counts; 3 white = perfect. Failed lights show the reason, such as “depth” or “lockout”. Scores go on a leaderboard (name, mode, valid push-ups), and the crowd screen shows the all-time top 10.

All video is processed live on the game laptop. Nothing is recorded or uploaded.

## Stack

| Part | Tool | Folder |
| --- | --- | --- |
| Desktop app + backend | Rust, [Tauri 2](https://tauri.app) | `backend/` |
| Frontend | React + TypeScript (Vite) | `frontend/` |
| Pose tracking + referee | MediaPipe Pose Landmarker, runs in the app window | `pumpCourt/src` (imported by the frontend as `@tracker/*`) |
| Phone camera | QR code → built-in HTTPS server (port 47800); any network (Cloudflare tunnel, the default) or same Wi-Fi (WebRTC); sideways picture turned upright | `backend/src/phone/` |
| Storage | SQLite (bundled, via `rusqlite`) | app data folder |

```
laptop or phone camera ─▶ app window (TypeScript, pumpCourt/src)
                           MediaPipe pose → posture (ready check) → judge (3 lights)
                             │ set_ready / report_rep
                             ▼
                           engine thread (Rust): round clock + score
                             ├─ "tick" / "rep" / "round-finished" events ─▶ operator + crowd windows
                             └─ SQLite leaderboard: runs(name, mode, reps)
```

The referee rules are fixed (`DIFFICULTY.normal` in `pumpCourt/src/judge.ts`). There is no mock athlete: you need a real camera.

## Documentation

Full architectural specifications, developer manuals, and AI agent guides are available in [`docs/`](docs/README.md):

* 📚 [Documentation Portal & Index](docs/README.md)
* 🏛️ [System Architecture & Data Flow](docs/ARCHITECTURE.md)
* 🤖 [AI Agent Operations Guide](docs/AGENTS.md)
* 📐 [Feature: Referee Engine & 3 Lights](docs/features/referee-engine/README.md)
* 📱 [Feature: Phone Camera QR Streaming](docs/features/phone-camera/README.md)
* 🎮 [Feature: Game Engine & Modes](docs/features/game-engine/README.md)
* 📊 [Feature: Leaderboard & SQLite](docs/features/leaderboard/README.md)
* 🖥️ [Feature: Dual-Window Frontend UI](docs/features/frontend-ui/README.md)
* 🏟️ [Feature: Venue Setup & Runbook](docs/features/venue-operations/README.md)
* 🛠️ [Feature: Developer & Rust Guides](docs/features/developer-guides/README.md)

## Setup

You need:

* Rust (via [rustup](https://rustup.rs))
* Node.js 18+ and npm (only to run the React dev server / build)
* The Tauri CLI: `cargo install tauri-cli --version "^2" --locked`
* Linux only: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev build-essential libssl-dev`
  (Windows and macOS need nothing extra; see [Tauri prerequisites](https://tauri.app/start/prerequisites/)).

```bash
cd frontend && npm install && cd ..
```

`npm install` also copies the MediaPipe files into `frontend/public/wasm` and
`frontend/public/models` (`scripts/setup-assets.mjs`; the model is copied from
`pumpCourt/public/models` or downloaded once).

For the **Phone · any network** link (the default tab in Add camera), install
[`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
on the game laptop. The **Phone · same Wi-Fi (offline)** tab needs nothing extra.

## Build and launch (one command)

The launch script builds the frontend, compiles the Rust backend with the
frontend baked in, and opens the app:

```bash
./scripts/launch.sh          # macOS / Linux
scripts\launch.cmd           # Windows (double-click works too)
```

The first build takes a few minutes; later ones only rebuild what changed.
Add `--no-run` (`-NoRun` on Windows) to build without launching. The result is
one standalone program: `backend/target/release/pump-court` (`pump-court.exe`
on Windows). Copy it to the game laptop and run it there; no Rust, Node or
dev server is needed on that machine, though Windows needs the WebView2
runtime, which Windows 10/11 already include.

An executable only runs on the operating system it was built on, so build on
the same kind of machine as the game laptop.

For an installer (`.msi`, `.dmg`, `.deb`/`.AppImage`) instead, run
`cargo tauri build` in `backend/`; the files land in
`backend/target/release/bundle/`.

## Develop (hot reload)

```bash
cd backend
cargo tauri dev        # starts the Vite dev server and the app; edits reload live
```

Other useful commands, all from `backend/`:

```bash
cargo test             # run the Rust unit tests (rounds, leaderboard, phone link)
cargo build            # compile only (debug)
```

Frontend alone (from `frontend/`): `npm run build` type-checks and bundles the app and the phone page (`dist/phone.html`, baked into the Rust app by `backend/build.rs`).

## Using it

Operator keys on the home screen: **1–4** pick a mode, **L** leaderboard, **S** camera, **W** opens the crowd screen as a second window (drag it to the external monitor). Every key hint on screen is also a clickable button. **Enter** / **Esc** move through screens.

The crowd screen shows the all-time leaderboard (each player's best round in any mode: name, mode, push-ups) between rounds, and the live count and lights during a round.

Modes: Sprint (30 s), Minute (60 s), Max (until 5 s without a valid push-up, 3 min cap) and Duel (exactly 2 players, 30 s each; most push-ups wins, perfect push-ups break a tie).

Cameras: press **S** → **Add camera** → tabs **Phone · any network** (default; needs `cloudflared` and internet), **Phone · same Wi-Fi (offline)** (scan the QR on a shared network), or **USB / system camera**. A phone on its side is turned upright by itself; if not, press **⟳ Rotate** on the camera picture.
