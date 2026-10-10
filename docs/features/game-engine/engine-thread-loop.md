# Engine Thread Architecture & The 60Hz Tick Loop

> **Module**: `backend/src/engine.rs`  
> **Key Types**: `Engine`, `EngineCommand`, `Tick`, `SourceStatus`  
> **Related Documents**: [Game Engine Overview](README.md), [Architecture Overview](../../ARCHITECTURE.md)  
> **Maintenance Status**: Active / Core Concurrency Architecture  

---

## 1. Concurrency Model & Design Rationale

In desktop applications involving camera feeds and computer vision, running frame ingestion and mathematical judging on the UI thread or main event loop inevitably causes dropped frames, input stutter, and audio glitches whenever React re-renders.

Pump-Court eliminates this via a **dedicated OS-level worker thread**:

```text
       UI / Tauri Thread                       Engine Worker Thread
   (React Components & Commands)             ("pump-court-engine")
                 │                                     │
                 │ ─── mpsc::Sender<EngineCommand> ──▶ │
                 │     (Non-blocking send)             │
                 │                                     │ ◀─── Frame Ingestion
                 │                                     │      (30-60 FPS)
                 │                                     │ ◀─── Judge Processing
                 │                                     │
                 │ ◀── app.emit("tick", Tick) ──────── │
                 │ ◀── app.emit("rep", RepVerdict) ─── │
                 │ ◀── app.emit("round-finished", …) ─ │
```

---

## 2. Command Channel Protocol

Communication from Tauri commands into the engine thread is strictly one-way and asynchronous via `std::sync::mpsc`:

```rust
pub enum EngineCommand {
    SetSource(SourceSpec),
    StopSource,
    StartRound { mode: RoundMode, player: String, is_team: bool },
    CancelRound,
    SetConfig(JudgeConfig),
}
```

- When no video source is active, the thread sleeps using `rx.recv_timeout(Duration::from_millis(200))` to consume zero CPU.
- When an active video source is attached, the thread drains all waiting commands with `while let Ok(cmd) = rx.try_recv()` at the head of every frame iteration.

---

## 3. Frame Processing Cycle

On each tick, `Engine::on_frame()` executes:

1. **FPS Smoothing**:
   ```rust
   let instant_fps = 1.0 / now.duration_since(prev).as_secs_f32().max(1e-3);
   self.fps = self.fps * 0.9 + instant_fps * 0.1;
   ```
2. **Session Step**: Passes the `PoseFrame` and smoothed FPS into `Session::update()`.
3. **Verdict & Event Emissions**:
   - If `outcome.verdict` is present, emits `rep` event immediately.
   - If `outcome.finished` is present, saves to SQLite via `self.save()` and emits `round-finished`.
4. **Preview JPEG Rate Limiting**:
   - High-resolution video frames consume significant memory if serialized into base64 every frame.
   - The engine limits JPEG preview generation to `PREVIEW_INTERVAL` (default **`66ms`** / ~15 FPS).
5. **Tick Dispatch**:
   - Assembles and emits the `Tick` struct to all subscribed Tauri windows.
6. **Automated Maintenance**:
   - Evaluates `last_backup_at`. If `> 3600 seconds` (1 hour), invokes `Leaderboard::export_backup()`.
