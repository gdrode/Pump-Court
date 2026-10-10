# Crowd Display & Multi-Window Sync

> **Module**: `frontend/src/logic/useCrowd.ts`, `frontend/src/ui/screens/Crowd.tsx`, `backend/src/commands.rs` (`open_crowd_window`)  
> **Key Constants**: `CROWD_ROWS = 10`, `CROWD_POSTED_MS = 8000` (`frontend/src/config/modes.ts`)  
> **Related Documents**: [Frontend UI Overview](README.md), [Operator Runbook](../venue-operations/operator-runbook.md)  
> **Maintenance Status**: Active / Multi-Monitor Engine  

---

## 1. Opening it

1. The operator runs the app on the laptop.
2. A second monitor or projector faces the player and the people watching.
3. The operator presses **W** on the home screen (or clicks "W crowd screen" in the key hints).
4. Rust opens a window with label `crowd` (1280×720, "Pump Court — Crowd") that loads the same `index.html`. If it is already open, it is brought to the front.
5. Drag it to the second screen and make it full screen.

`open_crowd_window` is an **async** command on purpose. On Windows, a synchronous command that creates a window can deadlock: the new window stays blank and the buttons in the main window stop working.

The crowd window has **no keys** and needs no operator. It shows nothing from the camera; the tracker runs only in the operator window.

---

## 2. How the windows stay in step

There is no shared "view" state. Both windows listen to the same backend events:

- `tick` (via `useSession`): the live round snapshot (phase, player, mode, reps, clock, last lights).
- `rep`: when a rep was judged, so the dragon reacts at the same moment as on the operator screen.
- `round-finished`: the round ended (not saved yet).
- `round-posted`: a score was posted to the leaderboard (operator or the player's phone).

The board is read with `get_leaderboard(null, 10)` (all time, `CROWD_ROWS`) and `get_player_count()`, at start, after every `round-posted`, and every **10 s**. The poll also picks up deletes and discards made on the operator screen.

---

## 3. Between rounds: the all-time board

- Title, the dragon, and **Most push-ups · all time**: each player's best round in any mode, top 10, with name, mode and push-ups.
- "N people have competed so far" under the board.
- The dragon says "Can anyone beat Rosa's 19?" (or "Step up and be the first on the board!" on an empty board).
- **Just posted**: when a score is posted (`round-posted`), its player's row is highlighted and the dragon dances and says "Rosa just posted 19, that's #2!" for 8 s (`CROWD_POSTED_MS`). The `#2` is the round's place on the all-time board shown beside it (looked up by `runId` in the board rows; left out if the round is not in the top 10).

A discarded run is deleted a moment later; the next poll takes it off the board.

---

## 4. During a round: the live view

While the phase is `getReady`, `countdown` or `running`:
- Mode and "now on the mat", and the player's name.
- Before the clock: "Get ready", then 3, 2, 1.
- Running: a huge push-up count, the seconds left (red in the last five), and "All-time best: Rosa 19" or "Passed Rosa's 19!".
- Three extra-large referee lights (no fault text) and the dragon, reacting to each rep like on the operator screen (shared `ui/hostMood.ts`).

When the round ends, the crowd window goes back to the board.
