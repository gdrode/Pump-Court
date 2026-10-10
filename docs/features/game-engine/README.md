# Feature 03: Game Engine & Round Control

> **Module**: `backend/src/game/` (`mode.rs`, `session.rs`) and `backend/src/engine.rs`  
> **Key Types**: `Session`, `RoundPhase`, `RoundMode`, `RepReport`, `RepVerdict`, `RoundResult`, `SessionSnapshot`  
> **Related Documents**: [Game Modes](game-modes.md), [Engine Thread Loop](engine-thread-loop.md), [Referee Engine](../referee-engine/README.md), [Frontend UI](../frontend-ui/README.md), [Browser Prototype Modes](browser-prototype-modes.md)  
> **Maintenance Status**: Active / Match Governance  

---

## 1. Summary

The Rust game engine keeps the **clock and the score**. The tracker and referee in the app window tell it two things: whether the player is in position (`set_ready`) and each judged rep (`report_rep`). The `Session` state machine turns that into a round: get ready, a 3-second countdown, the round itself, and the result.

`Session` is plain logic. All times are milliseconds passed in from outside, so the tests in `session.rs` play a whole round instantly.

---

## 2. Round phases

`RoundPhase` (sent as `"idle" | "getReady" | "countdown" | "running" | "finished"`):

```text
    ┌───────────────┐
    │     Idle      │ ◀── start of the app; cancel_round from any phase
    └───────┬───────┘
            │ start_round(mode, player)
            ▼
    ┌───────────────┐
    │   GetReady    │ ◀── waiting for the posture check
    └───────┬───────┘
            │ set_ready(true)
            ▼
    ┌───────────────┐
    │   Countdown   │ ◀── COUNTDOWN_MS = 3000 (3, 2, 1); set_ready(false) → back to GetReady
    └───────┬───────┘
            │ 3 s passed (checked on tick)
            ▼
    ┌───────────────┐
    │    Running    │ ◀── report_rep counts here and only here
    └───────┬───────┘
            │ time up, or Max: 5 s without a valid push-up
            ▼
    ┌───────────────┐
    │   Finished    │ ── engine saves the result, then emits "round-finished"
    └───────────────┘
```

- `set_ready(false)` never moves the phase back. It only updates `inPosition`.
- Reps reported in any phase other than `running` are ignored (the tracker may still be finishing a rep as the buzzer goes).
- `start_round` always starts clean, even right after a finished round.
- A round is never voided. If tracking is lost, the clock runs on and no reps are reported.

---

## 3. Data contracts

### 3.1 `SessionSnapshot` (the `tick` event)

Sent about 10 times a second while a round is active (get ready, countdown, running), and once after every command.

```rust
pub struct SessionSnapshot {
    pub phase: RoundPhase,
    pub mode: Option<RoundMode>,         // sprint | minute | max | duel
    pub player: Option<String>,
    pub in_position: bool,               // the tracker last said "ready"
    pub countdown_ms: Option<i64>,       // only in Countdown
    pub elapsed_ms: i64,                 // only counts while Running
    pub remaining_ms: Option<i64>,       // while Running; for Max: time to the 3-minute cap
    pub idle_remaining_ms: Option<i64>,  // Max only: time left to get the next valid push-up
    pub reps: u32,                       // valid push-ups
    pub attempts: u32,
    pub perfect: u32,
    pub last_rep: Option<RepVerdict>,
}
```

### 3.2 `RepVerdict` (the `rep` event)

```rust
pub struct RepVerdict {
    pub attempt: u32,          // 1 for the first attempt of the round
    pub counted: bool,         // 2 or 3 white lights
    pub perfect: bool,         // 3 white lights
    pub lights: Lights,        // { depth, torso, lockout }: true = white
    pub faults: Vec<String>,
}
```

### 3.3 `RoundResult` (the `round-finished` event)

```rust
pub struct RoundResult {
    pub mode: RoundMode,
    pub player: String,
    pub reps: u32,             // valid push-ups: the score
    pub attempts: u32,
    pub perfect: u32,
    pub no_reps: NoRepCounts,  // red lights per light: { depth, torso, lockout }
    pub duration_ms: i64,
    pub run_id: Option<i64>,   // filled in by the engine after saving
    pub rank: Option<u32>,     // the player's place on this mode's board
}
```

Only `player`, `mode` and `reps` are stored in the database. The rest is for the Results screen.

---

## 4. Ending a round

- **Time up**: `elapsed ≥ mode.duration_ms()`. `durationMs` is capped at the mode's length.
- **Max idle limit**: in Max, 5 s (`MAX_IDLE_MS`) after the start or the last **valid** push-up. A no-rep does not reset it.
- **Operator abort** (`cancel_round`, Esc on the Round screen, or leaving the screen): back to `Idle`, nothing saved.
- **Discard**: after a round, "Discard" (or "Redo turn" in a Duel) calls `delete_run` with the saved `runId`.

The teammate's standalone prototype has its own game rules (`pumpCourt/src/game.ts`: Sprint / Marathon / Max, co-op, failure windows). The app does not use them. See [Browser Prototype Modes](browser-prototype-modes.md).
