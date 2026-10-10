# Rep Segmentation State Machine & Anti-Cheat Logic

> **Module**: `backend/src/judge/tracker.rs`  
> **Key Types**: `RepTracker`, `Phase`, `RepWindow`, `RepVerdict`  
> **Related Documents**: [Referee Engine Overview](README.md), [Ready Check & Calibration](ready-check-calibration.md)  
> **Maintenance Status**: Core Algorithmic Component  

---

## 1. Rep State Machine Lifecycle

`RepTracker` segments continuous physical motion into discrete, judicable push-up reps. It cycles through three internal states:

```text
┌───────────────────────────────┐
│       AwaitLockout            │ ◀─── Athlete enters plank; waiting for
└───────────────┬───────────────┘      elbow >= lockout for confirm_frames
                │
                ▼
┌───────────────────────────────┐
│            Top                │ ◀─── Ready for rep. Elbow drops by
└───────────────┬───────────────┘      top_exit_margin (15°) to leave top.
                │
                ▼
┌───────────────────────────────┐
│          InRep                │ ─── Tracks descending & ascending motion:
│   (Descent ➔ Ascent)          │      • min_elbow recorded at inflection
└───────────────┬───────────────┘      • plank faults checked continuously
                │                      • redip checked on ascent
                │
                ▼ (Elbow reaches lockout for confirm_frames)
┌───────────────────────────────┐
│      RepVerdict Emitted       │ ─── [Depth, Lockout, Plank] evaluated;
└───────────────┬───────────────┘     transition back to `Top` for next rep!
                │
                └───────────────────────────────┘
```

---

## 2. InRep Tracking Window Dynamics

When the athlete leaves `Top`, a new `RepWindow` struct is instantiated:

```rust
struct RepWindow {
    start_ms: i64,
    min_elbow: f32,          // Lowest elbow angle seen in the rep
    bottom_run: u32,         // Consecutive frames below depth threshold
    bottom_confirmed: bool,
    ascending: bool,         // Set true when elbow rises >= ascent_margin
    max_since_ascent: f32,
    top_run: u32,            // Consecutive frames at/above lockout
    plank_run: u32,          // Consecutive frames below plank threshold
    plank_failed: bool,      // Latched true if plank_run >= confirm_frames
    worst_hip: f32,
    worst_knee: f32,
}
```

---

## 3. Anti-Cheat Hysteresis Mechanisms

Push-up competitions are fraught with subtle attempts to fool software. Pump-Court implements strict heuristic safeguards:

### 3.1 The "Wobble" Filter (`min_attempt_drop = 30.0°`)
Athletes shifting their weight or breathing heavily in top plank cause elbow angle fluctuations of 5°–15°. A rep is not registered as an attempt until the elbow drops at least `30.0°` below lockout. Small dips that return to top are disregarded without penalty.

### 3.2 Confirmation Hysteresis (`confirm_frames = 2`)
Single-frame sensor dropouts could falsely indicate that an athlete hit 90° or that hips sagged. The engine requires fault or landmark criteria to persist for `confirm_frames` (default 2 consecutive frames, ~66ms) before committing to a pass or fault.

### 3.3 The "Re-Dip" Penalty (`redip_margin = 20.0°`)
Cheating athletes frequently ascend halfway, realize they are tiring, and dip back down before locking out to gain elastic rebound. 
- Once `ascending` is confirmed (`elbow >= min_elbow + ascent_margin`), the engine tracks `max_since_ascent`.
- If the elbow drops by `> redip_margin` (20.0°) before hitting lockout, the rep is immediately marked with a **Lockout Fault**.

### 3.4 Incomplete Lockout Lock
A new rep cannot begin from a previous un-locked-out rep. If an athlete fails lockout, the state machine transitions to `AwaitLockout`, forcing the athlete to demonstrate full arm extension before any subsequent reps are counted.
