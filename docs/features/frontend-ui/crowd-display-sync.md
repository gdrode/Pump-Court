# Crowd Display & Multi-Window Synchronization

> **Module**: `frontend/src/logic/useCrowd.ts`, `frontend/src/logic/useCrowdControl.ts`, `backend/src/commands.rs`  
> **Key Types**: `CrowdView`, `useCrowd`, `Crowd` screen  
> **Related Documents**: [Frontend UI Overview](README.md), [Operator Runbook](../venue-operations/operator-runbook.md)  
> **Maintenance Status**: Active / Multi-Monitor Engine  

---

## 1. Dual-Window Operating Model

When hosting a live competition:
1. The operator runs the app on their laptop.
2. An external monitor or projector faces the athlete and spectators.
3. The operator presses **W** on the home screen (or clicks "crowd screen").
4. Tauri opens a second window at `index.html#/crowd` via `commands::open_crowd_window()`.

---

## 2. Shared State Synchronization (`CrowdView`)

The view the crowd screen shows between rounds is held in the Rust backend's `AppState` and sent to every window:

```rust
// backend/src/commands.rs
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CrowdView {
    Auto,                          // cycle all pages
    Board { category: Category },  // stay on one leaderboard
    Recent,                        // stay on the latest results
}
```

- The operator picks a view on the Leaderboard screen ("Crowd screen shows"). The backend stores it and emits the `crowd-view` event.
- Keys on the crowd window (**1–3** boards, **R** recent, **A** cycle) change the same backend state, so both windows always agree.

---

## 3. Idle Pages

- Pages: **30-second**, **1-minute**, **Most** and **Recent** (`CROWD_PAGES` in `config/modes.ts`).
- In Auto, pages change every 9 seconds (`CROWD_CYCLE_MS`).
- Boards show the top 10 and a dragon line like "Can anyone beat Rosa's 19?".
- **Recent** lists the latest runs across all modes: name, mode, clean reps, accuracy, no-reps per referee, time.
- **New score**: when a public run is saved, the crowd screen jumps to its board, highlights the name, and the dragon announces it for 8 seconds (`CROWD_POSTED_MS`). Team and voided runs are not announced.

---

## 4. Live Round View

When a round is in the ready check, countdown or running phase, the crowd screen switches to the live view:
- Mode and athlete name.
- Huge clean-rep count and the clock (red in the last five seconds).
- The board record to beat, or "Passed Rosa's 19!".
- Three extra-large referee lights with the measured angle on a no-rep.
- The dragon, reacting to each rep exactly like on the operator screen (shared `hostMood.ts`).

When the round ends, the crowd screen goes back to the idle pages.
