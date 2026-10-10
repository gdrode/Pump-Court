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
| **`duel`** | Duel (1v1) | 2 × 30s turns | Both players finish 30s | None (Direct Winner) |

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

### 2.4 Duel (Turn-Based 1v1 Head-to-Head)
- **Concept**: Direct bracket tournament showdown between two athletes.
- **Progression**:
  1. Player 1 completes a 30s Sprint turn.
  2. The UI pauses on an intermediate turn card showing Player 1's score.
  3. Player 2 steps onto the mat, performs ready check, and completes their 30s Sprint turn.
  4. The Results screen proclaims the winner, margin of victory, or tie.
