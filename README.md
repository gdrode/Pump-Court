# Pump-Court

A push-up contest judged by software. A side-on webcam tracks your body, three referee lights call each rep, and clean reps go on a public leaderboard.

Pump-Court is a push-up contest judged by software. Get into position side-on to the camera, and pose tracking counts only clean reps. Three referee lights show pass or fail for each rep, with the reason for any failed rep, such as “depth” or “lockout”. Scores go on a leaderboard that runs during judging, and each round ends with a report on the player’s main problems.

All video is processed live on the game laptop. Nothing is recorded or uploaded.

## Stack

| Part | Tool | Folder |
| --- | --- | --- |
| Desktop app + backend | Rust, [Tauri 2](https://tauri.app) | `backend/` |
| Frontend | React + TypeScript (Vite) | `frontend/` |
| Pose tracking | MediaPipe Pose Landmarker, built separately | `pumpCourt/`; plugs in per [docs/INTEGRATION.md](docs/INTEGRATION.md) |
| Phone camera | QR code link to a built-in local HTTPS server | `backend/src/phone/` |
| Storage | SQLite (bundled, via `rusqlite`) | app data folder |

```
camera ─▶ motion tracker (MediaPipe C++) ─▶ PoseSource ─▶ engine thread (Rust)
                                                             │ angles → ready check → rep tracker → 3 referees
                                                             ├─ "tick" / "rep" / "round-finished" events ─▶ React (operator + crowd windows)
                                                             └─ SQLite leaderboard
```

Until the motion tracker is integrated, the backend ships a **mock athlete** that does scripted push-ups (clean, shallow, sagging, no lockout), so the whole game runs on any machine. See [docs/INTEGRATION.md](docs/INTEGRATION.md) for how the tracker plugs in.

Using a phone as the camera? Read [docs/PHONE_CAMERA.md](docs/PHONE_CAMERA.md).

Bringing in a new UI design? Read [docs/FRONTEND.md](docs/FRONTEND.md).

New to Rust? Read [docs/RUST_GUIDE.md](docs/RUST_GUIDE.md).

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

## Run

```bash
cd backend
cargo tauri dev        # starts the Vite dev server and the app, with hot reload
```

Other useful commands, all from `backend/`:

```bash
cargo test             # run the Rust unit tests (referees, rounds, leaderboard)
cargo build            # compile only
cargo tauri build      # release build + installer in backend/target/release/bundle
```

Frontend alone (from `frontend/`): `npm run build` type-checks and bundles. The UI needs the Rust backend to show anything, so use `cargo tauri dev` to see it.

## Using it

Operator keys on the home screen: **1–4** pick a mode, **L** leaderboard, **S** camera & thresholds, **C** opens the crowd screen as a second window (drag it to the external monitor). Between rounds the crowd screen cycles the three boards and a **Recent** list (name, mode, results); pin one view from the Leaderboard screen, or press 1–3 / R / A on the crowd window. **Enter** / **Esc** move through screens.

Modes: Sprint (30 s), Minute (60 s), Max (until 5 s without a clean rep, 3 min cap) and Duel (two Sprint turns).

The referee thresholds (90° depth, 160° lockout, 160° plank, …) are editable live under **S** and documented in `backend/src/judge/config.rs`.
