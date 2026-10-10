# Feature 05: Leaderboard Engine & Embedded Persistence

> **Module**: `backend/src/leaderboard.rs`  
> **Key Types**: `Leaderboard`, `LeaderboardRow`, `RecentRun`, `BackupRun`  
> **Related Documents**: [Scoring & Ranking](scoring-and-ranking.md), [Name Validation](name-validation.md), [Backup & Recovery](backup-and-recovery.md)  
> **Maintenance Status**: Active / Core Storage  

---

## 1. Executive Summary

Pump-Court stores all tournament records, player scores, attempts, and fault statistics locally on the laptop disk using an embedded **SQLite** database managed via `rusqlite`.

**Key Architectural Guarantees**:
- **Zero Cloud / Zero Database Server**: SQLite is compiled directly into the binary (`bundled` feature). No MySQL, PostgreSQL, or cloud services required.
- **ACID Reliability**: Survives sudden app termination, power loss, or OS crashes without corrupted scores.
- **Automatic Migration**: Database schemas upgrade seamlessly when newer versions of the app boot.
- **Automatic Backups**: Hourly snapshots exported in JSON format to a dedicated backup directory.

---

## 2. Database Schema (`runs` Table)

Located in `app_data_dir/pump_court.db`:

```sql
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,         -- 'sprint', 'minute', 'max'
    mode TEXT NOT NULL,             -- 'sprint', 'minute', 'max', 'duel'
    clean_reps INTEGER NOT NULL,
    attempts INTEGER NOT NULL,
    accuracy REAL NOT NULL,         -- clean_reps / attempts (0.0 .. 1.0)
    is_team INTEGER NOT NULL,       -- 0 = Individual, 1 = Team
    no_rep_depth INTEGER NOT NULL,  -- Cumulative depth faults
    no_rep_lockout INTEGER NOT NULL,-- Cumulative lockout faults
    no_rep_plank INTEGER NOT NULL,  -- Cumulative plank faults
    created_at INTEGER NOT NULL     -- Unix timestamp in milliseconds
);

CREATE INDEX IF NOT EXISTS idx_category_score 
ON runs (category, is_team, clean_reps DESC, accuracy DESC, created_at ASC);
```

---

## 3. Public API Methods

The `Leaderboard` struct provides thread-safe access:

```rust
impl Leaderboard {
    pub fn open(data_dir: &Path) -> rusqlite::Result<Self>;
    pub fn save_run(&self, category: Category, result: &RoundResult) -> rusqlite::Result<i64>;
    pub fn list(&self, category: Category, include_team: bool, limit: u32) -> rusqlite::Result<Vec<LeaderboardRow>>;
    pub fn rank_of(&self, category: Category, player_name: &str) -> rusqlite::Result<Option<u32>>;
    pub fn recent(&self, limit: u32) -> rusqlite::Result<Vec<RecentRun>>;
    pub fn delete_run(&self, run_id: i64) -> rusqlite::Result<()>;
    pub fn export_backup(&self) -> rusqlite::Result<PathBuf>;
}
```
