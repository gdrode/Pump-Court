# Feature 03: Game Engine & Match Session Control

> **Module**: `backend/src/game/` and `backend/src/engine.rs`  
> **Key Types**: `Session`, `RoundPhase`, `RoundMode`, `RoundResult`, `SessionSnapshot`  
> **Related Documents**: [Game Modes](game-modes.md), [Engine Thread Loop](engine-thread-loop.md), [Frontend UI](../frontend-ui/README.md)  
> **Maintenance Status**: Active / Match Governance  

---

## 1. Executive Summary

The **Game Engine** coordinates competitive match sessions. It couples the raw output of the referee pipeline with round timers, idle countdowns, athlete identity, and multi-turn Versus games (2–4 players).

The entire match progression is encapsulated inside the `Session` state machine, which is updated frame-by-frame by the engine thread.

---

## 2. Match Phase State Machine

```text
    ┌───────────────────────────┐
    │           Idle            │ ◀─── Default state; awaiting start_round command
    └─────────────┬─────────────┘
                  │ (start_round)
                  ▼
    ┌───────────────────────────┐
    │        ReadyCheck         │ ◀─── Athlete assumes plank position;
    └─────────────┬─────────────┘      FPS and body framing verified (1s hold)
                  │ (hold satisfied)
                  ▼
    ┌───────────────────────────┐
    │        Countdown          │ ◀─── 3-second countdown (audio beeps: 3, 2, 1)
    └─────────────┬─────────────┘
                  │ (countdown reaches 0)
                  ▼
    ┌───────────────────────────┐
    │         Running           │ ◀─── Clock ticks; reps counted;
    └─────────────┬─────────────┘      idle timeouts monitored
                  │ (timer expires OR 5s idle in Max mode OR tracking lost)
                  ▼
    ┌───────────────────────────┐
    │        Finished           │ ─── Results saved to SQLite; emitted to UI
    └───────────────────────────┘
```

---

## 3. The `SessionSnapshot` Data Contract

On every single video frame (~30–60 times per second), `Session::snapshot()` produces a serialized snapshot emitted in the `tick` payload:

```rust
pub struct SessionSnapshot {
    pub phase: RoundPhase,             // Idle | ReadyCheck | Countdown | Running | Finished
    pub mode: Option<RoundMode>,       // Sprint | Minute | Max | Duel (one Versus turn)
    pub player: Option<String>,        // Validated athlete / team name
    pub ready_items: Vec<ReadyItem>,   // Status of ready checklist
    pub countdown_ms: Option<i64>,     // Remaining countdown time
    pub elapsed_ms: i64,               // Active match duration
    pub remaining_ms: Option<i64>,     // Time left on round clock
    pub idle_remaining_ms: Option<i64>,// Time left before 5s idle cutoff (Max mode)
    pub clean_reps: u32,               // Total counted reps
    pub attempts: u32,                 // Total attempts
    pub last_rep: Option<RepVerdict>,  // Most recent rep details & lights
    pub lockout_threshold: Option<f32>,// Calibrated lockout angle
    pub tracking_ok: bool,             // Current tracking health flag
}
```

---

## 4. Match Cancellation and Void Rules

A round can terminate cleanly or abnormally:
- **Operator Abort (`cancel_round`)**: If an operator presses Escape or clicks Cancel, the session reverts immediately to `Idle` without writing to the database.
- **Tracking Loss Void**: If athlete leaves frame or camera disconnects for longer than `JudgeConfig.tracking_loss_ms` (500ms), the round ends with `voided: Some("Tracking lost")`. Voided rounds are not posted to the public leaderboard.
- **Idle Timeout**: In Max mode, if 5 seconds elapse without an athlete completing a clean rep, the buzzer sounds and the round ends automatically.
