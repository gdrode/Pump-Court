# Game Modes & Rules

> **Module**: `backend/src/game/mode.rs` and `frontend/src/config/modes.ts`  
> **Key Types**: `RoundMode`, `MenuModeInfo`, `PLAY_STYLES`, `GAME_MODES`, `menuMode`, `BOARDS`  
> **Related Documents**: [Game Engine Overview](README.md), [Leaderboard](../leaderboard/README.md)  
> **Maintenance Status**: Active / Tournament Rules  

---

## 1. The four modes

The score in every mode is the number of **valid push-ups** (2 or 3 white lights).

| Key | Mode (`RoundMode`) | Clock | Ends when | Board |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `sprint` – Sprint | 30 s | time is up | Sprint |
| **2** | `minute` – Minute | 60 s | time is up | Minute |
| **3** | `max` – Max | counts up, 3-minute cap | 5 s without a valid push-up, or the cap | Max |
| **4** | `duel` – Duel | 30 s per player | both players have had a turn | Duel |

`RoundMode::duration_ms()` gives the longest a round can last: 30 000 (Sprint, Duel), 60 000 (Minute), 180 000 (Max, `MAX_CAP_MS`). The value stored in the database is `RoundMode::as_str()`: `"sprint"`, `"minute"`, `"max"`, `"duel"`.

Every round starts with the ready check and a 3-second countdown (see [Game Engine](README.md)).

---

## 2. Mode details

### 2.1 Sprint (30 seconds)
- Most valid push-ups in 30 seconds. The main mode.
- The last five seconds beep and the clock turns red.

### 2.2 Minute (60 seconds)
- Most valid push-ups in 60 seconds. Pacing matters.

### 2.3 Max (untimed)
- The clock counts up. The round ends after **5 seconds without a valid push-up** (`MAX_IDLE_MS`), or at the 3-minute cap.
- The 5 seconds start when the clock starts, and restart after each valid push-up. A no-rep does **not** restart them.
- The Round screen shows "x.x s left to get the next push-up" (`idleRemainingMs`).
- The menu marks it "only when nobody is queuing".

### 2.4 Duel (2 players)
- Exactly **two** players. A Duel starts as a **split screen** on two cameras (below); with only one camera the players take turns instead.
- **Split screen (two cameras)**: `ui/screens/DuelRound.tsx`, rules in `logic/useDuelMatch.ts`.
  - The screen is cut in half **top to bottom**: player 1 on top (camera slot 0), player 2 below (slot 1). Each half has the player's camera on the left and a panel on the right with their score, three lights and, before the clock, a camera picker with **+ Add camera** (pair a phone).
  - One clock for both, in the top bar. The 3-2-1 starts when both players hold the push-up position; each player can fail on their own. Both scores are saved through `save_round` when both are done.
  - **Only one camera? Take turns instead** switches to the turn-based flow below.
- **Taking turns (one camera)**: each player has a 30-second turn (`RoundMode::Duel`, played like a Sprint). The frontend runs the two turns; Rust sees two separate rounds.
- Turn flow:
  1. The operator enters two different names.
  2. Player 1 does the ready check and a 30 s turn. The Results screen shows the score: **Enter** posts it and calls player 2; **Esc** redoes the turn (deletes the saved run).
  3. Player 2 sees a "To beat" box with player 1's score.
  4. The Duel result screen ranks them. **Winner: most valid push-ups; perfect push-ups break a tie.** Equal on both = a tie ("It's a tie! Rematch?"). **R** starts a rematch.
- Each turn is saved on the **Duel** board, under the player's name.
- Logic: `rankResults`, `duelOutcome`, `scoreToBeat` in `frontend/src/logic/results.ts`.

---

## 3. Where modes are defined

- **Rust** (`backend/src/game/mode.rs`): the enum, its database name, its length, `MAX_IDLE_MS` and `MAX_CAP_MS`.
- **Frontend** (`frontend/src/config/modes.ts`):
  - `PLAY_STYLES`: the home screen's top bar, **Singleplayer** or **Duel**.
  - `GAME_MODES`: Sprint / Minute / Max with key, title, solo blurb, duel blurb, optional note.
  - `menuMode(style, mode)`: turns a pick into the `MenuModeInfo` that is played. Singleplayer = 1 player. Duel = 2 players taking turns: **Duel + Sprint** plays the backend's `duel` mode (30 s turns, its own Duel board); **Duel + Minute** and **Duel + Max** play two turns of that mode, saved to that mode's board. No backend change was needed: the frontend already runs a plan as one turn per player.
  - `MODE_LABELS`: names on boards and results.
  - `BOARDS`: leaderboard tabs — All time (`mode: null`), Sprint, Minute, Max, Duel.

To add a mode: add the variant and its `as_str`/`duration_ms` in Rust, add it to `RoundMode` in `frontend/src/api/types.ts`, then add it to `GAME_MODES` (and `menuMode` if Duel needs special handling), `MODE_LABELS` and `BOARDS`.
