# Scoring & Ranking

> **Module**: `backend/src/leaderboard.rs`, `frontend/src/logic/useLeaderboard.ts`, `frontend/src/config/modes.ts`  
> **Key Types**: `LeaderboardRow`, `BOARDS`  
> **Related Documents**: [Leaderboard Overview](README.md), [Game Modes](../game-engine/game-modes.md)  
> **Maintenance Status**: Active / Tournament Rules  

---

## 1. The score

The score is the number of **valid push-ups** in a round: reps with 2 or 3 white lights. Perfect push-ups, attempts and no-reps are shown on the Results screen but are not stored and do not affect the board.

---

## 2. Boards

| Tab (`BOARDS`) | `mode` argument | Shows |
| :--- | :--- | :--- |
| **All time** | `null` | each player's best round in **any** mode, with a Mode column |
| **Sprint** | `"sprint"` | each player's best Sprint round |
| **Minute** | `"minute"` | each player's best Minute round |
| **Max** | `"max"` | each player's best Max round |
| **Duel** | `"duel"` | each player's best Duel turn |

The crowd screen always shows the **All time** board (top 10). The operator's Leaderboard screen has all five tabs (keys **1**–**5**, or ←/→).

---

## 3. One row per player: their best run

```sql
SELECT id, name, mode, reps FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY reps DESC, id ASC) AS best
    FROM runs
    WHERE ?1 IS NULL OR mode = ?1
)
WHERE best = 1
ORDER BY reps DESC, id ASC
LIMIT ?2;
```

- **Same person**: names are matched ignoring upper/lower case. "Ana" and "ana" are one player; only their best run shows (under the spelling of that run).
- **Order**: most valid push-ups first.
- **Ties**: whoever posted first ranks higher (`id ASC`). A player's own tie between two equal runs keeps the earlier one.
- **Rank**: 1, 2, 3… in that order, with no shared places.

On the all-time board, a player who has played several modes appears once, with the mode of their best round. For example Ana with 20 (Sprint) and 55 (Max) shows as "Ana · Max · 55".

---

## 4. Rank after a round

When a round ends, the engine saves it and asks `rank_of(Some(mode), player)`: the player's place on **that mode's** board. That is the `rank` in `RoundResult`, shown on the Results screen ("#3") and by the dragon ("Top three!").

---

## 5. Duel winner (not the board)

Who wins a Duel is decided in the frontend (`duelOutcome` in `frontend/src/logic/results.ts`): most valid push-ups, then most perfect push-ups. If both are equal it is a tie. The board does not use perfect push-ups.

---

## 6. Moderation

- **Discard** on the Results screen deletes the run just saved (`delete_run`). In a Duel the button is "Redo turn" and the same player goes again.
- On the Leaderboard screen: select a row with ↑/↓, press **Delete** (or Backspace) twice to remove that run. Because boards show each player's best run, removing it makes their next-best run appear.
- `get_player_count` counts different names (ignoring case) that have ever posted; the crowd screen shows "N people have competed so far".
