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
| **1** | `sprint` – Sprint | 30 s | time is up, or the player fails | Sprint |
| **2** | `minute` – Minute | 60 s | time is up, or the player fails | Minute |
| **3** | `max` – Max | counts up, no limit | the player fails (section 2) | Max |
| **4** | `duel` – Duel | 30 s, both at once (or one turn each) | time is up, or both have failed | Duel |

`RoundMode::duration_ms()` gives the clock length: `Some(30 000)` (Sprint, Duel), `Some(60 000)` (Minute), `None` (Max: no time limit). The value stored in the database is `RoundMode::as_str()`: `"sprint"`, `"minute"`, `"max"`, `"duel"`.

Every round starts with the ready check and a 3-second countdown (see [Game Engine](README.md)).

---

## 2. Failure: when a round ends early (every mode)

Same rules for Singleplayer (the Rust `Session`) and the side-by-side Duel (`pumpCourt/src/game.ts`), so both play alike. A player's round ends early when they:

| Reason (`FinishReason`) | When | Screen text |
| :--- | :--- | :--- |
| `left` | out of the push-up position (stood up, knees down, walked off, out of view) for **2 s** (`OUT_OF_POSITION_MS`) | "Got up out of position" |
| `stuck` | partway through a rep for the **failure window** (couldn't press back up) | "Couldn’t press back up" |
| `stopped` | holding the top with no rep attempt for the **failure window** | "Stopped: no push-up in time" |
| `time` | the clock ran out (Sprint, Minute, Duel) | "Time!" |
| `ended` | the operator pressed Stop (side-by-side Duel only) | "Ended by the operator" |

- **Failure window** grows with fatigue: **4 s + 0.25 s per rep attempted**, capped at **6 s** (Sprint, Duel), **8 s** (Minute), **10 s** (Max). Rust: `RoundMode::fail_window_ms`; TypeScript: `failWindow`.
- Any rep attempt (a no-rep too) restarts the "stopped" window.
- The Round screen shows **"Keep going! N"** in the last 3 s before a fail (`failRemainingMs`). The Results screen shows why the round ended.

---

## 3. Mode details

### 3.1 Sprint (30 seconds)
- Most valid push-ups in 30 seconds. The main mode.
- The last five seconds beep and the clock turns red.

### 3.2 Minute (60 seconds)
- Most valid push-ups in 60 seconds. Pacing matters.

### 3.3 Max (untimed)
- The clock counts up, with no time limit. The round ends when the player fails (section 2): the window reaches its 10 s cap after 24 reps.

### 3.4 Duel (2 players)
- Exactly **two** players. A Duel starts as a **split screen** on two cameras (below); with only one camera the players take turns instead.
- **Split screen (two cameras)**: `ui/screens/DuelRound.tsx`, rules in `logic/useDuelMatch.ts`.
  - The screen is cut in half **top to bottom**: player 1 on top (camera slot 0), player 2 below (slot 1). Each half has the player's camera on the left and a panel on the right with their score, three lights and, before the clock, a camera picker with **+ Add camera** (pair a phone).
  - One clock for both, in the top bar. The 3-2-1 starts when both players hold the push-up position and then **always runs to GO**: it never stops if someone wobbles (once running, 2 s out of position is a fail). The countdown covers the whole split screen, faded, so both players stay visible; the screen layout never moves.
  - Each player can fail on their own. When both are done, the Duel result shows; each player can post from their phone, and **P** posts the scores still waiting (posting is opt-in).
  - **Only one camera? Take turns instead** switches to the turn-based flow below.
- **Taking turns (one camera)**: each player has a turn of the picked mode (Sprint = `RoundMode::Duel`, 30 s). The frontend runs the two turns; Rust sees two separate rounds.
- Turn flow:
  1. The operator enters two different names.
  2. Player 1 does the ready check and a 30 s turn. The Results screen shows the score: **Enter** posts it and calls player 2; **Esc** redoes the turn (deletes the saved run).
  3. Player 2 sees a "To beat" box with player 1's score.
  4. The Duel result screen ranks them. **Winner: most valid push-ups; perfect push-ups break a tie.** Equal on both = a tie ("It's a tie! Rematch?"). **R** starts a rematch.
- Duel + Sprint is saved on the **Duel** board; Duel + Minute or Max on that mode's board. Under each player's name either way.
- Logic: `rankResults`, `duelOutcome`, `scoreToBeat` in `frontend/src/logic/results.ts`.

---

## 4. Where modes are defined

- **Rust** (`backend/src/game/mode.rs`): the enum, its database name, its clock length, the failure window (`fail_window_ms`, `fail_cap_ms`, `OUT_OF_POSITION_MS`).
- **Frontend** (`frontend/src/config/modes.ts`):
  - `PLAY_STYLES`: the home screen's top bar, **Singleplayer** or **Duel**.
  - `GAME_MODES`: Sprint / Minute / Max with key, title, solo blurb, duel blurb, optional note.
  - `menuMode(style, mode)`: turns a pick into the `MenuModeInfo` that is played. Singleplayer = 1 player. Duel = 2 players, side by side on two cameras (or taking turns): **Duel + Sprint** is saved as the backend's `duel` mode (its own Duel board); **Duel + Minute** and **Duel + Max** are saved to that mode's board.
  - `MODE_LABELS`: names on boards and results.
  - `BOARDS`: leaderboard tabs — All time (`mode: null`), Sprint, Minute, Max, Duel.

To add a mode: add the variant and its `as_str`/`duration_ms`/`fail_cap_ms` in Rust (and to `GAME_MODE` in `logic/useDuelMatch.ts`), add it to `RoundMode` in `frontend/src/api/types.ts`, then add it to `GAME_MODES` (and `menuMode` if Duel needs special handling), `MODE_LABELS` and `BOARDS`.
