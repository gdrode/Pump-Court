# Tournament Scoring & Ranking Logic

> **Module**: `backend/src/leaderboard.rs` and `frontend/src/logic/useLeaderboard.ts`  
> **Key Types**: `Category`, `LeaderboardRow`, `RecentRun`  
> **Related Documents**: [Leaderboard Overview](README.md), [Game Modes](../game-engine/game-modes.md)  
> **Maintenance Status**: Active / Tournament Rules  

---

## 1. Competitive Categories

The leaderboard partitions records into three distinct competitive categories:
- **`sprint`**: 30-second speed push-ups.
- **`minute`**: 60-second endurance push-ups.
- **`max`**: Sudden-death unbroken push-ups.

*(Duel mode matches record their individual Sprint turns into the Sprint category while declaring a direct match winner on stage).*

---

## 2. Ranking Algorithm & Tie-Breaker Precedence

When querying rankings, rows are ordered according to standard international rules:

$$\text{Order Priority: } \text{Clean Reps} \downarrow \implies \text{Accuracy} \downarrow \implies \text{Posted Timestamp} \uparrow$$

```sql
SELECT rank, id, name, clean_reps, attempts, accuracy, created_at
FROM runs
WHERE category = ?1 AND (?2 OR is_team = 0)
ORDER BY clean_reps DESC, accuracy DESC, created_at ASC
LIMIT ?3;
```

### Tie-Breaker Breakdown:
1. **Primary Metric (Clean Reps)**: The total number of valid push-ups with $\ge 2$ white lights.
2. **First Tie-Breaker (Accuracy)**:
   $$\text{Accuracy} = \frac{\text{Clean Reps}}{\text{Attempts}}$$
   An athlete who achieves 25 clean reps in 26 attempts ($96.1\%$) outranks an athlete who rushed 25 clean reps in 35 attempts ($71.4\%$).
3. **Second Tie-Breaker (Timestamp)**:
   The athlete who posted the score earlier in the tournament day retains the higher ranking.

---

## 3. Team vs Individual Filtering

In many venue tournaments, athletes participate in team relays or gym squads.
- The `is_team` flag distinguishes corporate/gym teams from individual athletes.
- By default, leaderboards show individual scores. Toggling "Include Teams" on the operator console or crowd screen includes team attempts without overwriting individual records.
