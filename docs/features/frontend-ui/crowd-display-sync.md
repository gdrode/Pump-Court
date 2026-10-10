# Crowd Stadium Display & Multi-Window Synchronization

> **Module**: `frontend/src/logic/useCrowd.ts`, `backend/src/commands.rs`  
> **Key Types**: `CrowdView`, `useCrowdControl`, `CrowdScreen`  
> **Related Documents**: [Frontend UI Overview](README.md), [Operator Runbook](../venue-operations/operator-runbook.md)  
> **Maintenance Status**: Active / Multi-Monitor Engine  

---

## 1. Dual-Window Operating Model

When hosting a live competition:
1. The operator runs the app on their laptop.
2. An external HDMI cable or wireless display connects to a secondary projector or large TV facing the athlete and spectators.
3. The operator presses **C** (or clicks "Crowd Screen" on Home).
4. Tauri opens a second native OS window initialized with URL `/#crowd` via `commands::open_crowd_window()`.

---

## 2. Shared State Synchronization (`CrowdView`)

Both windows must stay synchronized without network round-trips. The active crowd view mode is held in the Rust backend's `AppState` and emitted to all windows:

```rust
// In backend/src/commands.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CrowdView {
    Auto,              // Cycles between Sprint, Minute, Max, and Recent every 8 seconds
    Category(Category),// Pinned to Sprint, Minute, or Max leaderboard
    Recent,            // Pinned to recent matches list
}
```

- When the operator switches the view mode from the operator console, the backend updates its mutex and emits `crowd-view-changed`.
- Keyboard shortcuts pressed directly on the crowd window (**1–3** for boards, **R** for Recent, **A** for Auto) update the exact same backend state.

---

## 3. Live Round Interception

When a match begins (`Session::phase` moves from `Idle` to `ReadyCheck` or `Running`):
- The crowd screen automatically suspends the leaderboard carousel.
- It displays the live **Stadium Match View**:
  - Huge 120pt clean rep counter.
  - Active athlete name and mode header.
  - Giant 3-Light Referee Display (white = pass, red = fault).
  - Countdown / match clock bar.
- When the round concludes and the results screen is dismissed, the crowd display automatically resumes cycling leaderboards.
