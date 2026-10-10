# Pump-Court System Architecture

> **Audience**: Systems engineers, architects, and AI coding agents  
> **Status**: Verified against the code on 2026-10-10  

---

## 1. High-Level Architecture Overview

Pump-Court is a Tauri 2 desktop app. The work is split in two:

* **The app window (TypeScript)** sees the player. It opens the camera, runs MediaPipe pose tracking, checks the push-up position, and judges each rep with three lights. This code is the teammate's tracker in `pumpCourt/src`, imported by the frontend as `@tracker/*`.
* **The Rust backend** keeps score. It runs the round clock (get ready, 3-2-1 countdown, round time, failure: out of position, stuck, stopped), counts valid push-ups, saves posted results to SQLite, and serves phone cameras.

```text
┌──────────────────────────── CAMERAS ─────────────────────────────┐
│ Laptop / USB webcam         Phone on Wi-Fi          Phone, any network
│   (getUserMedia)            (WebRTC video)          (JPEG frames)
└──────┬───────────────────────────┬──────────────────────┬────────┘
       │                           │                      │ wss://<tunnel>/relay
       │                           │                      ▼
       │                           │        Rust HTTPS server :47800 (axum)
       │                           │        PhoneHub room ── Tauri Channel ──┐
       │                           │ offer/answer/ICE via the room (IPC)     │ JPEG bytes
       ▼                           ▼                                         ▼
┌──────────────────── OPERATOR WINDOW ("main", TypeScript) ────────────────────────┐
│ TrackerProvider: one <video> ─▶ MediaPipe Pose Landmarker (GPU, else CPU)          │
│   ─▶ pose.ts side tracker (angles) ─▶ posture.ts (ready? floor line)               │
│   ─▶ useRound: judge.ts RepJudge (Depth / Torso / Lockout)                         │
│        │ set_ready(ready, inRep)      │ report_rep({counted, perfect, lights, faults})
└────────┼──────────────────────────────┼─────────────────────────────────────────────┘
         ▼                              ▼
┌──────────────────── RUST BACKEND (backend/src) ──────────────────────────────────┐
│ commands.rs ─▶ mpsc channel ─▶ engine thread "pump-court-engine"                  │
│                                  Session: idle → getReady → countdown → running   │
│                                           → finished                              │
│                                  emits "tick" (~10 Hz while a round is active),   │
│                                        "rep", "round-finished", "round-posted"    │
│                                  saves RoundResult ─▶ SQLite runs + events        │
└──────────────────────────────────────┬─────────────────────────────────────────────┘
                                       │ events go to every window
                     ┌─────────────────┴──────────────────┐
                     ▼                                    ▼
             Operator window (screens)          Crowd window ("crowd")
                                                live count / all-time top 10
```

---

## 2. Core Subsystems and Responsibility Boundaries

### 2.1 Tracker and referee (`pumpCourt/src/`, used from `frontend/src/logic/`)
- **Plain TypeScript**: `geometry.ts`, `pose.ts`, `posture.ts` and `judge.ts` have no camera or drawing code. They take numbers and return numbers, so they run the same live, in tests (`pumpCourt/src/__tests__/`) and on replayed logs.
- **Runs in the operator window**: `frontend/src/logic/tracker/TrackerProvider.tsx` owns the one `<video>`, the rotated-picture `<canvas>`, the overlay `<canvas>` and the detection loop. The crowd window never runs the tracker.
- **Rotation**: a phone on its side sends a sideways picture. The phone reports the turn it needs, or the operator presses **⟳ Rotate**; the tracker then turns the picture on the frame canvas and tracks that. See [Phone on its side](features/phone-camera/README.md#5-phone-on-its-side-rotation).
- **Fixed rules**: `REFEREE_RULES = DIFFICULTY.normal` in `frontend/src/config/modes.ts` (lockout 155°, torso 155°, knee 150°, depth = shoulders drop at least 30% of the player's straight-arm top height, depth fallback 95°). The posture check also needs straight legs (knee ≥ 150°) before the countdown. There is no thresholds editor.
- **Three lights**: Depth, Torso, Lockout. 2 or 3 white = a valid push-up (counted); 3 = perfect.
- See [Pose Tracking](features/pose-tracking/README.md) and [Referee Engine](features/referee-engine/README.md).

### 2.2 The engine thread (`backend/src/engine.rs`, `backend/src/game/`)
- **Its own thread**, named `pump-court-engine`. Tauri commands only drop an `EngineCommand` into an `mpsc` channel; the thread never waits on the UI.
- **Clock only**: the thread wakes every 100 ms (`TICK_INTERVAL`) while a round is on, moves the `Session` clock and emits `tick`. It does no image work.
- **Session phases**: `idle → getReady → countdown (3 s) → running → finished`. `set_ready(true)` moves get-ready to countdown, which then always runs to GO. Reps only count while running.
- **Saving is opt-in**: when a round finishes the engine emits `round-finished` with `runId`/`rank` empty. It is saved only when posted (`save_round`, by the operator or from the player's phone), which emits `round-posted`. See [Scoring & Ranking](features/leaderboard/scoring-and-ranking.md#4-posting-is-opt-in).
- **Hourly backup**: the same thread writes a JSON backup every hour.
- See [Game Engine](features/game-engine/README.md).

### 2.3 Phone cameras (`backend/src/phone/`, `frontend/src/logic/tracker/`)
- **HTTPS server** on port `47800` (axum + rustls), self-signed certificate made with `rcgen` at start-up.
- **Pairing rooms** with 8-character codes. The app window is the room's host and talks to Rust over IPC (commands and Tauri Channels), never over the network.
- **Phone (any network)** (the default tab): a Cloudflare quick tunnel (`cloudflared`) gives a public address. The phone sends JPEG frames over `wss://<tunnel>/relay`; Rust forwards each frame to the app window over a Channel. Text notes on the same socket (`{type: "orientation", rotation}`) are checked by `PhoneHub::relay_text` and forwarded on the events Channel.
- **Phone · same Wi-Fi (offline)** (not offered in the app; code kept): WebRTC video goes straight from the phone to the app window. Rust only passes the offer, answer, ICE candidates and the phone's `{orientation}` (`/signal-http/*`).
- **Tunnel guard**: requests that come through the tunnel may only reach `/phone.html` and `/relay`.
- See [Phone Camera](features/phone-camera/README.md).

### 2.4 Persistence (`backend/src/leaderboard.rs`)
- **SQLite** via `rusqlite` with the `bundled` feature, file `pump-court.sqlite3` in the app data folder.
- **One table of rounds**: `runs(id, name, mode, reps, event_id, role, team)`. Only name, mode, valid push-ups and (at an event) the event, role and team are stored.
- **Events** (`backend/src/events.rs`): `events` table; per-event boards per mode (Everyone and per role) and team leaderboards (members' bests added up). See [Events](features/leaderboard/events.md).
- **Boards**: each player's best run, per mode or across all modes (all time).
- **Names**: 12 characters at most, blocklist checked (`validate_name`).
- See [Leaderboard](features/leaderboard/README.md).

### 2.5 Two windows (`frontend/src/`)
- **Operator window** (label `main`): all screens, the camera and the tracker.
- **Crowd window** (label `crowd`): opened by `open_crowd_window`, loads the same `index.html`. `App.tsx` checks the window label (`isCrowdWindow()` in `api/backend.ts`) and shows only the crowd screen.
- **Layers**: `ui/` never calls Tauri; it uses hooks in `logic/`, which use `api/backend.ts`.
- See [Frontend UI](features/frontend-ui/README.md).

---

## 3. Data Contracts & IPC Message Specification

Rust structs and their TypeScript mirrors in `frontend/src/api/types.ts` must match. Rust `snake_case` fields become `camelCase` in JSON (`#[serde(rename_all = "camelCase")]`).

### 3.1 Backend events (Rust ➔ every window)

| Event | When | Payload | Description |
| :--- | :--- | :--- | :--- |
| `tick` | about 10 times a second while a round is active, and after every engine command | `SessionSnapshot` | phase, mode, player, `inPosition`, `countdownMs`, `elapsedMs`, `remainingMs`, `failRemainingMs`, `reps`, `attempts`, `perfect`, `lastRep` |
| `rep` | each rep reported while the clock runs | `RepVerdict` | `attempt`, `counted`, `perfect`, `lights {depth, torso, lockout}`, `faults[]` |
| `round-finished` | once, at the end of a round (not saved: `runId`, `rank` null) | `RoundResult` | `mode`, `player`, `reps`, `attempts`, `perfect`, `noReps {depth, torso, lockout}`, `durationMs`, `runId`, `rank` |
| `round-posted` | when a score is posted (operator or phone) | `RoundResult` | as `round-finished`, with `runId` and `rank` |

### 3.2 Tauri commands (React ➔ Rust)

Registered in `backend/src/lib.rs`, wrapped in `frontend/src/api/backend.ts`.

| Command | Arguments | Returns | Job |
| :--- | :--- | :--- | :--- |
| `check_name` | `name` | cleaned name | Same rules as `start_round` |
| `start_round` | `mode`, `player` | – | New round, waits in `getReady` |
| `cancel_round` | – | – | Back to idle, nothing saved |
| `set_ready` | `ready: bool`, `inRep: bool` (optional) | – | Posture check or "in a rep" changed; `true` in `getReady` starts the countdown; while running feeds the failure checks |
| `report_rep` | `rep: RepReport` | – | A judged rep; counted only while running |
| `get_leaderboard` | `mode: RoundMode \| null`, `limit` | `LeaderboardRow[]` | Best run per player; `null` = all time |
| `get_player_count` | – | number | Different names that have played |
| `delete_run` | `runId` | – | Moderation and "Discard" |
| `save_round` | `round: FinishedRound` | `RoundResult` | Posts a finished round; emits `round-posted` |
| `phone_notify` | `room`, `data: PhoneNote` | – | A note for the phone (its stats after the round) |
| `export_backup` | – | file path | JSON backup now |
| `open_crowd_window` | – | – | Opens or focuses the `crowd` window (an `async` command) |
| `phone_open` | `events: Channel`, `frames: Channel` | 8-character room code | Opens a pairing room |
| `phone_signal` | `room`, `data` | – | The app's WebRTC answer or ICE candidate, for the phone |
| `phone_close` | `room` | – | Closes the room; the phone is told |
| `phone_lan` | – | `LanInfo` | Laptop addresses for the QR code, Bonjour name, port, server error |
| `tunnel_status` / `tunnel_start` / `tunnel_stop` | – | `TunnelStatus` | The "Phone (any network)" Cloudflare tunnel |

`open_crowd_window` must stay `async`: on Windows, creating a window inside a plain (sync) command deadlocks the app. That bug froze every button and left the crowd window blank.

### 3.3 Linux camera permission
On Linux the web view (webkit2gtk) keeps the camera and WebRTC off. `allow_camera` in `backend/src/lib.rs` turns on media streams and WebRTC for the `main` window and allows its permission requests.
