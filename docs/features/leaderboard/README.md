# Feature 05: Leaderboard & Local Storage

> **Module**: `backend/src/leaderboard.rs`  
> **Key Types**: `Leaderboard`, `LeaderboardRow`, `BackupRun`, `validate_name`  
> **Related Documents**: [Events](events.md), [Scoring & Ranking](scoring-and-ranking.md), [Name Validation](name-validation.md), [Backup & Recovery](backup-and-recovery.md)  
> **Maintenance Status**: Active / Core Storage  

---

## 1. Summary

Scores are kept in a small **SQLite** database on the game laptop, through `rusqlite`. One row per finished round: who, which mode, how many valid push-ups, and, for a solo round at an event, the event, role and team. Nothing else about the player or the round is stored.

- **Events** (`backend/src/events.rs`): per-event boards per mode (Everyone and per role) and team leaderboards (members' bests added up). See [Events](events.md).

- **No server, no internet**: SQLite is compiled into the app (`bundled` feature). Nothing needs installing.
- **Opt-in**: a round is saved only when it is posted: by the operator (Enter on the Results screen) or by the player on their phone. See [Scoring & Ranking](scoring-and-ranking.md#4-posting-is-opt-in). The database runs in WAL mode.
- **Old databases are converted** on start-up (see §3).
- **Hourly JSON backups** (see [Backup & Recovery](backup-and-recovery.md)).

---

## 2. Database file and schema

The file is `pump-court.sqlite3` in the app data folder (`app.path().app_data_dir()`, app id `com.pumpcourt.app`):

| OS | Folder |
| :--- | :--- |
| Windows | `%APPDATA%\com.pumpcourt.app\` |
| macOS | `~/Library/Application Support/com.pumpcourt.app/` |
| Linux | `~/.local/share/com.pumpcourt.app/` |

```sql
CREATE TABLE IF NOT EXISTS runs (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT    NOT NULL,   -- validated player name
    mode  TEXT    NOT NULL,   -- 'sprint' | 'minute' | 'max' | 'duel'
    reps  INTEGER NOT NULL    -- valid push-ups
);

CREATE INDEX IF NOT EXISTS runs_by_mode ON runs(mode, reps DESC);
```

`events::init` adds `event_id`, `role` and `team` columns to `runs` (empty unless the round was played at an event), plus the `events` and `settings` tables. See [Events §4](events.md#4-storage).

There are no timestamps, attempts, accuracy, fault counts or team flags in the database. The order of `id` is the order rounds were posted.

---

## 3. Migration from the old layout

Older versions had a much wider `runs` table (`category`, `clean_reps`, `attempts`, `accuracy`, `is_team`, `created_at`, fault counts…). On start-up `migrate()` checks for a `clean_reps` column. If it finds one, in one transaction it:

1. renames the old table to **`runs_v1`** (nothing is deleted),
2. creates the new `runs` table,
3. copies `name`, the mode and `clean_reps` → `reps` into it, in posting order.
   - The mode comes from the old `mode` column, or from `category` (`oneMinute` → `minute`, `most` → `max`, anything else → `sprint`) if there was no `mode` column.
   - Team runs (`is_team = 1`) were never public, so they are not copied.

Opening the converted database again leaves it alone.

---

## 4. API (`impl Leaderboard`)

```rust
impl Leaderboard {
    pub fn open(dir: &Path) -> rusqlite::Result<Self>;
    pub fn save_run(&self, name: &str, mode: RoundMode, reps: u32) -> rusqlite::Result<i64>;
    /// Same, for a round at an event (role and team already checked with `check_tags`).
    pub fn save_tagged_run(&self, name: &str, mode: RoundMode, reps: u32,
                           event_id: Option<i64>, role: Option<&str>, team: Option<&str>) -> rusqlite::Result<i64>;
    // Events (events.rs): events, save_event, delete_event, set_active_event,
    // active_event, check_tags, event_top, team_top, event_teams.
    /// Each player's best round; `None` = every mode (the all-time board).
    pub fn top(&self, mode: Option<RoundMode>, limit: u32) -> rusqlite::Result<Vec<LeaderboardRow>>;
    pub fn rank_of(&self, mode: Option<RoundMode>, name: &str) -> rusqlite::Result<Option<u32>>;
    pub fn delete_run(&self, run_id: i64) -> rusqlite::Result<()>;
    pub fn player_count(&self) -> rusqlite::Result<u32>;
    pub fn export_backup(&self) -> Result<PathBuf, String>;
}

pub struct LeaderboardRow {  // sent as { rank, runId, name, mode, reps }
    pub rank: u32,
    pub run_id: i64,
    pub name: String,
    pub mode: String,        // "sprint", "minute", "max" or "duel"
    pub reps: u32,
}
```

Tauri commands: `save_round(round)` (post a finished round, with `eventId`, `role` and `team` when played at an event; emits `round-posted`), `get_leaderboard(mode, limit)`, `get_player_count()`, `delete_run(runId)`, `export_backup()`, `check_name(name)`, and the event commands in [Events §5](events.md#5-commands-and-events). The database sits behind an `Arc<Mutex<Leaderboard>>` shared by the commands and the engine thread.
