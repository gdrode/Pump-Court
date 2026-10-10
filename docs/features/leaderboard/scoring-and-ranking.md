# Scoring & Ranking

> **Module**: `backend/src/leaderboard.rs`, `frontend/src/logic/useLeaderboard.ts`, `frontend/src/config/modes.ts`  
> **Key Types**: `LeaderboardRow`, `BOARDS`  
> **Related Documents**: [Leaderboard Overview](README.md), [Game Modes](../game-engine/game-modes.md)  
> **Maintenance Status**: Active / Tournament Rules  

---

## 1. The score

The score is **points**:

| Rep | Points |
| :--- | :--- |
| 3 white lights (perfect) | **2**, or **1 + streak multiplier** on a streak (2.2 – 2.5) |
| 2 white lights | **1** |
| 0–1 white lights (no-rep) | 0 |

### Perfect streak

Perfect reps in a row build a multiplier for the **next** perfect reps:

| Perfect reps in a row | Multiplier | Each perfect rep after that | On screen |
| :--- | :--- | :--- | :--- |
| 0–4 | 1x | 2 | — |
| 5–9 | **1.2x** | 2.2 | STREAK UNLOCKED |
| 10–14 | **1.3x** | 2.3 | DESTRUCTIVE STREAK |
| 15–19 | **1.4x** | 2.4 | CHAOTIC STREAK |
| 20+ | **1.5x** (cap) | 2.5 | BRUTAL STREAK |

- The 5 reps that unlock a tier score at the old rate; the 6th perfect rep is the first 2.2.
- **Any rep that isn't perfect ends the streak** (a 2-light rep scores its 1 point, then back to 1x). If a multiplier was on, the screen says "lol...".
- Points are kept to **one decimal**. Code works in tenths, so sums stay exact.

Example: 7 perfect, one 2-light, 1 perfect = 5 × 2 + 2 × 2.2 + 1 + 2 = **17.4**.

- **Rust**: `streak_tenths` / `rep_points_tenths` in `backend/src/game/session.rs`; the session counts it as reps come in and sends `points`, `streak` and `multiplier` in every `tick`, and `bestStreak` in the result. `save_round` uses `reps + perfect` (no streak bonus) only if the frontend doesn't send `points`.
- **TypeScript**: `STREAK`, `streakMultiplier`, `streakTier`, `repPoints`, `score` and `points` in `pumpCourt/src/game.ts`, used for the side-by-side Duel. Same rules; tests in both.
- **Showing a score**: always `fmtPoints` (`12`, `12.2`).

The board stores `points` (REAL) and `reps` (valid push-ups) and ranks by **points**. Attempts and no-reps show on the Results screen only.

**Rounds saved before points existed** get `points = reps` when the database opens (`add_points`), because their perfect count was never stored.

---

## 2. Boards

| Tab (`BOARDS`) | `mode` argument | Shows |
| :--- | :--- | :--- |
| **All time** | `null` | each player's best round in **any** mode, with a Mode column |
| **Sprint** | `"sprint"` | each player's best Sprint round |
| **Marathon** | `"minute"` | each player's best Marathon round |
| **Max** | `"max"` | each player's best Max round |
| **Duel** | `"duel"` | each player's best Duel turn |

The crowd screen always shows the **All time** board (top 10). The operator's Leaderboard screen has all five tabs (keys **1**–**5**, or ←/→).

---

## 3. One row per player: their best run

```sql
SELECT id, name, mode, points, reps FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY points DESC, id ASC) AS best
    FROM runs
    WHERE ?1 IS NULL OR mode = ?1
)
WHERE best = 1
ORDER BY points DESC, id ASC
LIMIT ?2;
```

- **Same person**: names are matched ignoring upper/lower case. "Ana" and "ana" are one player; only their best run shows (under the spelling of that run).
- **Order**: most points first.
- **Ties**: whoever posted first ranks higher (`id ASC`). A player's own tie between two equal runs keeps the earlier one.
- **Rank**: 1, 2, 3… in that order, with no shared places.

On the all-time board, a player who has played several modes appears once, with the mode of their best round. For example Ana with 20 (Sprint) and 55 (Max) shows as "Ana · Max · 55".

---

## 4. Posting is opt-in

Since 2026-10-10 a finished round is **not** saved by itself. It goes on the leaderboard only when someone posts it:

```text
round ends ─▶ "round-finished" (runId, rank = null) ─▶ ScorePost (frontend/src/logic/scorePost.ts), status "pending"
   ├─ operator presses Enter (Post) on the Results / P on the Duel result ─▶ save_round ─▶ "round-posted" ─▶ posted, rank
   ├─ player taps "Post my score" on their phone                       ─▶ save_round ─▶ "round-posted" ─▶ posted, rank
   └─ player taps "Don't post" on their phone                          ─▶ declined (never saved; Enter then just moves on)
```

- `save_round(round)` (`leaderboard::save_finished`): checks the name, `save_run`, `rank_of(Some(mode), player)` (the player's place on **that mode's** board), then emits `round-posted` to every window. That `rank` is shown on the Results screen ("#3"), the phone and the Duel result.
- A score nobody posts is never saved. A player who said no on their phone is not overruled by the operator's Enter.
- If the save fails, the status is "failed" and Enter (or the phone button) tries again.
- **Fixed camera** (switch in the bottom-left gear menu, key **F** on home, remembered on this computer; `frontend/src/logic/fixedCamera.ts`): for a venue camera that stays in place. When on, every score is posted **at once, without asking**, and the camera (phone or not) is not let go after the round. Off is the default (the player's own phone, opt-in posting).

---

## 5. Duel winner (not the board)

Who wins a Duel is decided in the frontend (`duelOutcome` in `frontend/src/logic/results.ts`): most points, then most perfect push-ups. If both are equal it is a tie.

---

## 6. Moderation

- **Discard** (Esc) on the Results screen throws the round away; if it was already posted (e.g. from the phone) the run is deleted (`delete_run`). In a Duel the button is "Redo turn" and the same player goes again.
- On the Leaderboard screen: select a row with ↑/↓, press **Delete** (or Backspace) twice to remove that run. Because boards show each player's best run, removing it makes their next-best run appear.
- `get_player_count` counts different names (ignoring case) that have ever posted; the crowd screen shows "N people have competed so far".
