# Rust Architecture & Backend Engineering Guide

> **Module**: `backend/src/`  
> **Key Crates**: `tauri`, `rusqlite`, `axum`, `serde`, `tokio`, `rcgen`  
> **Related Documents**: [Developer Guides Overview](README.md), [Architecture](../../ARCHITECTURE.md)  
> **Maintenance Status**: Active / Core Reference  

---

## 1. Rust Concepts in Pump-Court

This guide explains the foundational Rust design patterns used throughout `backend/`.

### 1.1 Cargo & Crate Layout
- `backend/Cargo.toml`: Package manifest defining dependencies ("crates") such as `rusqlite`, `axum`, `serde`, and `tauri`.
- `backend/build.rs`: Custom build script executed before compilation. Generates Tauri bindings and links native libraries.
- `backend/src/main.rs`: Lightweight process entry point that delegates directly to `lib.rs::run()`.

```text
backend/src/
├── main.rs         Entry point; calls lib.rs
├── lib.rs          Tauri builder, command registration, async server spawn
├── commands.rs     Tauri IPC handlers callable from React via invoke()
├── engine.rs       Dedicated background thread driving the 30-60Hz pipeline
├── leaderboard.rs  Embedded SQLite storage, migrations & queries
├── pose/           PoseSource traits, Inbox, Mock athlete, phone frames
├── judge/          Euclidean angle math, ready check calibration, rep tracker
├── game/           Round modes (Sprint/Minute/Max/Duel = Versus turn) & session state machine
└── phone/          Axum HTTPS daemon, self-signed TLS, WebSockets & PhoneHub
```

---

## 2. Concurrency & Memory Management

### 2.1 The Thread-Channel Model
The engine runs on an isolated thread spawned via `std::thread::Builder::new().name("pump-court-engine")`. It receives commands via an `mpsc::channel` (`Sender<EngineCommand>`). This guarantees that camera and judging pipelines never stutter during heavy UI re-renders.

### 2.2 Shared State (`Arc<Mutex<T>>`)
When data must be shared across threads (e.g. SQLite database connection, judge configuration, or phone hub):
- **`Arc<T>`** (Atomic Reference Count): Enables thread-safe shared ownership.
- **`Mutex<T>`**: Enforces mutual exclusion. Taking the lock (`db.lock().unwrap()`) guarantees that only one thread reads or writes at a time. The lock is automatically dropped when leaving scope (RAII).

---

## 3. Tauri 2 Inter-Process Communication (IPC)

### 3.1 Commands (Frontend ➔ Backend)
Functions decorated with `#[tauri::command]` and registered inside `tauri::generate_handler![...]` in `lib.rs` can be invoked from TypeScript:

```rust
#[tauri::command]
pub fn start_round(
    mode: RoundMode,
    player: String,
    is_team: bool,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let player = validate_name(&player)?;
    state.engine.lock().unwrap().send(EngineCommand::StartRound { mode, player, is_team })
        .map_err(|e| e.to_string())
}
```

### 3.2 Events (Backend ➔ Frontend)
The engine emits real-time events to all open windows via `app.emit(event_name, payload)`. Frontends listen using `listen(event_name, callback)`:
- `tick`: Emitted every video frame (~30–60Hz).
- `rep`: Emitted whenever a rep concludes (carries verdict, 3 lights, fault text).
- `round-finished`: Emitted when time expires or round is terminated.
