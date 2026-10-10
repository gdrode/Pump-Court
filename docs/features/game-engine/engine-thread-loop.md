# Engine Thread & The Round Clock

> **Module**: `backend/src/engine.rs`  
> **Key Types**: `Engine`, `EngineCommand`, `Session`  
> **Related Documents**: [Game Engine Overview](README.md), [Architecture Overview](../../ARCHITECTURE.md)  
> **Maintenance Status**: Active / Core Concurrency  

---

## 1. Summary

One background thread, `pump-court-engine`, owns the `Session`. It reads commands from a channel, moves the round clock about ten times a second, and emits events to every window. It does no image work: the camera, MediaPipe and the referee run in the app window.

```text
   Tauri command threads                      Engine thread ("pump-court-engine")
 (start_round, set_ready, …)
             │                                         │
             │ ── mpsc::Sender<EngineCommand> ───────▶ │  handle(cmd) → emit "tick"
             │    (send never waits)                   │            (+ "rep" for a counted report)
             │                                         │
             │                                         │  every 100 ms while a round is active:
             │                                         │    session.tick(now) → emit "tick"
             │                                         │    round over → save to SQLite
             │                                         │               → emit "round-finished"
             │                                         │  every hour: JSON backup
   all windows ◀── app.emit(...) ─────────────────────┘
```

---

## 2. Commands

```rust
pub enum EngineCommand {
    StartRound { mode: RoundMode, player: String },
    CancelRound,
    /// The tracker's posture check: is the player in the push-up position?
    SetReady(bool),
    ReportRep(RepReport),
}
```

`commands.rs` validates input (for example the player name) and then only sends one of these. If the engine thread has stopped, the command returns the error "engine stopped".

---

## 3. The loop

```rust
loop {
    match rx.recv_timeout(time_until_next_tick) {
        Ok(cmd) => { self.handle(cmd); continue; }   // commands first
        Err(Timeout) => {}
        Err(Disconnected) => return,                 // the app is closing
    }
    next_tick = now + TICK_INTERVAL;                 // 100 ms
    self.tick();
    if last_backup_at.elapsed() >= BACKUP_INTERVAL { // 1 hour
        db.export_backup();
    }
}
```

- **`handle(cmd)`** applies the command to the `Session` with the current time, emits `rep` if a reported rep was counted, then emits a `tick` snapshot. So the UI sees every change at once, not only on the next tick.
- **`tick()`** does nothing while no round is active. During a round it calls `session.tick(now)` (countdown → running, time up, failure) and emits a `tick`.
- **When a round ends**, `save()` locks the database, stores `(player, mode, reps)`, sets `run_id` and `rank` (`rank_of` on that mode's board), and only then emits `round-finished`. A failed save leaves both `null`; the result is still shown.
- **Time** is one steady clock (`Instant`) started with the engine, in milliseconds.

---

## 4. Constants

| Constant | Where | Value |
| :--- | :--- | :--- |
| `TICK_INTERVAL` | `engine.rs` | 100 ms |
| `BACKUP_INTERVAL` | `engine.rs` | 1 hour |
| `COUNTDOWN_MS` | `game/session.rs` | 3000 ms |
| `OUT_OF_POSITION_MS` | `game/mode.rs` | 2000 ms |
| `FAIL_BASE_MS` / `FAIL_PER_REP_MS` | `game/mode.rs` | 4000 ms + 250 ms per rep |
| `fail_cap_ms()` | `game/mode.rs` | 6000 (Sprint, Duel) / 8000 (Minute) / 10000 (Max) ms |

---

## 5. Events go to every window

`app.emit` sends each event to all windows. The operator window and the crowd window both listen, so they always agree without talking to each other. See [Crowd Display](../frontend-ui/crowd-display-sync.md).
