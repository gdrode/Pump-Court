# Rust Architecture & Backend Engineering Guide

> **Module**: `backend/src/`  
> **Key Crates**: `tauri`, `rusqlite`, `axum`, `axum-server`, `rustls`, `rcgen`, `serde`, `tokio`  
> **Related Documents**: [Developer Guides Overview](README.md), [Architecture](../../ARCHITECTURE.md), [Rust Guide](../../RUST_GUIDE.md)  
> **Maintenance Status**: Active / Core Reference  

---

## 1. Rust Concepts in Pump Court

The backend keeps the round clock and score, the leaderboard, and the phone camera server. It does **not** see the camera or judge reps: the tracker and referee run in the app window and report to Rust.

### 1.1 Cargo & Crate Layout
- `backend/Cargo.toml`: the package manifest and its dependencies ("crates").
- `backend/build.rs`: runs before compiling. It copies the built phone page (`frontend/dist/phone.html`, or a placeholder) into the build, then runs `tauri_build::build()`.
- `backend/src/main.rs`: a tiny entry point that calls `pump_court_lib::run()` in `lib.rs`.

```text
backend/src/
├── main.rs         entry point; calls lib.rs
├── lib.rs          Tauri builder: data folder, engine, phone server, commands, Linux camera, exit
├── commands.rs     #[tauri::command] functions the frontend calls; AppState
├── engine.rs       the "pump-court-engine" thread: commands in, tick/rep/round-finished out
├── leaderboard.rs  SQLite storage, names, migration, ranking, backups
├── game/
│   ├── mod.rs      re-exports
│   ├── mode.rs     RoundMode (sprint, minute, max, duel) and their timings
│   └── session.rs  the round state machine (idle → getReady → countdown → running → finished)
│                   and its types: Lights, RepReport, RepVerdict, NoRepCounts, RoundResult, SessionSnapshot
└── phone/
    ├── mod.rs      PhoneHub: pairing rooms, HTTP peers, relay phones; PORT 47800
    ├── server.rs   axum HTTPS server, self-signed cert, tunnel guard, embedded phone page
    ├── net.rs      laptop addresses for the QR code
    └── tunnel.rs   cloudflared quick tunnel ("Phone · any network")
```

---

## 2. Threads and Shared State

### 2.1 The engine thread
The engine runs on its own thread, made with `std::thread::Builder::new().name("pump-court-engine")`. Commands reach it through an `mpsc` channel (`Sender<EngineCommand>`, kept in `AppState`). It waits with `recv_timeout`, so it wakes for a command or every 100 ms to move the clock. It never does heavy work, so the clock stays smooth. See [Engine Thread Loop](../game-engine/engine-thread-loop.md).

### 2.2 The phone server
The HTTPS server and the tunnel run as async tasks on Tauri's tokio runtime (`tauri::async_runtime::spawn`). They share the `PhoneHub` with the commands through an `Arc`.

### 2.3 Shared state (`Arc<Mutex<T>>`)
When data is used from more than one thread (the database, the engine's sender):
- **`Arc<T>`** (atomic reference count) lets several owners share one value.
- **`Mutex<T>`** lets one thread at a time use it. `db.lock().unwrap()` takes the lock; it is released when the guard goes out of scope.

---

## 3. Tauri 2 IPC

### 3.1 Commands (frontend → backend)
Functions marked `#[tauri::command]` and listed in `tauri::generate_handler![...]` in `lib.rs` can be called from TypeScript with `invoke`:

```rust
// backend/src/commands.rs
#[tauri::command]
pub fn start_round(state: State<AppState>, mode: RoundMode, player: String) -> CmdResult<()> {
    let player = leaderboard::validate_name(&player)?;
    state.send(EngineCommand::StartRound { mode, player })
}
```

`CmdResult<T>` is `Result<T, String>`; an `Err` becomes a rejected promise in JavaScript. Argument names in camelCase on the TypeScript side map to snake_case here.

The round commands are `check_name`, `start_round`, `cancel_round`, `set_ready`, `report_rep`. The full list is in [Architecture](../../ARCHITECTURE.md).

### 3.2 Events (backend → all windows)
The engine sends events to every window with `app.emit(name, payload)`. The frontend listens with `listen` (wrapped as `events.onTick`, `events.onRep`, `events.onRoundFinished` in `api/backend.ts`):
- `tick`: the `SessionSnapshot`, after every command and every 100 ms while a round is on.
- `rep`: a `RepVerdict` for each rep the window reported while the clock ran.
- `round-finished`: the `RoundResult`, sent after the run was saved.

### 3.3 Channels (backend → one caller)
Phone pairing uses `tauri::ipc::Channel` instead of events: `phone_open` takes two channels, one for JSON messages and one for raw JPEG bytes (`InvokeResponseBody::Raw`). Only the window that opened the room gets them. See [Pairing & Protocol](../phone-camera/pairing-and-websocket.md).

### 3.4 Async commands
`open_crowd_window` is `async`, so it runs off the main thread. Creating a window from a synchronous command can deadlock on Windows.
