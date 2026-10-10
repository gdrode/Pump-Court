# Competition Game Modes & Rules

> **Module**: `backend/src/game/mode.rs` and `frontend/src/config/modes.ts`  
> **Key Types**: `RoundMode`, `Category`, `RoundResult`  
> **Related Documents**: [Game Engine Overview](README.md), [Leaderboard](../leaderboard/README.md)  
> **Maintenance Status**: Active / Tournament Rules  

---

## 1. Game Modes Specification

Pump-Court features four distinct competition formats designed for varying fitness profiles, spectator excitement, and tournament scheduling.

| Mode Key | Title | Time Limit | End Condition | Leaderboard Category |
| :--- | :--- | :--- | :--- | :--- |
| **`sprint`** | Sprint | 30.0 seconds | Timer hits zero | `Category::Sprint` |
| **`minute`** | Minute | 60.0 seconds | Timer hits zero | `Category::Minute` |
| **`max`** | Max Reps | 3 mins hard cap | 5.0 seconds without a clean rep | `Category::Max` |
| **`duel`** | Versus (shown as "Versus") | 2–4 × 30s turns | Every player finishes a 30s turn | `Category::ThirtySecond` (each turn) |

---

## 2. Detailed Mode Rules

### 2.1 Sprint (30 Seconds)
- **Concept**: Maximum explosive speed and endurance.
- **Rules**: Exactly 30,000 milliseconds on the game clock. Athletes strive for highest clean count. Fast rep segmentation allows rates exceeding 1.5 reps per second.
- **Tie-Breaker**: Accuracy percentage ($\frac{\text{clean reps}}{\text{attempts}}$).

### 2.2 Minute (60 Seconds)
- **Concept**: Aerobic stamina and pacing.
- **Rules**: 60,000 milliseconds on the game clock. Pacing and maintaining locked out plank under extreme fatigue are paramount.

### 2.3 Max (Sudden Death)
- **Concept**: Unbroken density and mental fortitude.
- **Rules**:
  - The match clock counts up from 0 to a hard cap of 180,000 milliseconds (3 minutes).
  - An **Idle Timer** starts at 5,000 milliseconds (`MAX_IDLE_MS`).
  - Every time a **clean rep** is completed, the idle timer resets to 5,000 ms.
  - A no-rep does *not* reset the idle timer.
  - If the idle timer hits zero (athlete collapses, rests on knees, or fails to complete a clean rep within 5 seconds), the match ends instantly with a buzzer.

### 2.4 Versus (Turn-Based, 2–4 Players)
- **Concept**: 2–4 athletes take turns; most clean reps wins.
- **Backend mode**: `RoundMode::Duel` (stored as `"duel"`), shown in the UI as **Versus**. Each turn plays exactly like a 30s Sprint.
- **Progression**:
  1. The operator enters 2–4 names (`Alt+N` adds a player).
  2. Each player in turn does the ready check and a 30s round.
  3. After each turn the Results screen shows that player's score. **Enter** posts it and calls the next player; **Esc** redoes the turn.
  4. Every player after the first sees a "To beat" box with the best score so far.
  5. The Versus standings screen ranks everyone on clean reps, then accuracy, and names the winner or a tie. **R** starts a rematch.
- **Leaderboard**: every turn is saved to the 30-second board, like a Sprint.
