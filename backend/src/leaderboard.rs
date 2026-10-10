//! Scores on disk, in a small SQLite database on the game laptop.
//!
//! Survives refreshes and crashes, needs no internet, and writes a JSON
//! backup file every hour (see the engine).

use crate::game::{Category, RoundResult};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_NAME_LEN: usize = 12;

/// Names the operator never wants on the crowd screen. Extend as needed.
const BLOCKLIST: &[&str] = &["admin", "fuck", "shit", "cunt", "nigg", "fag", "rape", "nazi"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardRow {
    pub rank: u32,
    pub run_id: i64,
    pub name: String,
    pub clean_reps: u32,
    pub attempts: u32,
    pub accuracy: f32,
    /// Unix time in ms when the score was posted.
    pub posted_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupRun {
    id: i64,
    name: String,
    category: String,
    clean_reps: u32,
    attempts: u32,
    accuracy: f32,
    is_team: bool,
    created_at: i64,
}

pub struct Leaderboard {
    conn: Connection,
    backup_dir: PathBuf,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Trims and checks a player name. Returns the cleaned name or why it's rejected.
pub fn validate_name(raw: &str) -> Result<String, String> {
    let name = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err("Enter a name".into());
    }
    if name.chars().count() > MAX_NAME_LEN {
        return Err(format!("Names are {MAX_NAME_LEN} characters at most"));
    }
    let lower = name.to_lowercase();
    if BLOCKLIST.iter().any(|bad| lower.contains(bad)) {
        return Err("Please pick another name".into());
    }
    Ok(name)
}

impl Leaderboard {
    /// Opens (or creates) the database in `dir`.
    pub fn open(dir: &Path) -> rusqlite::Result<Self> {
        std::fs::create_dir_all(dir).ok();
        let conn = Connection::open(dir.join("pump-court.sqlite3"))?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS runs (
                 id           INTEGER PRIMARY KEY AUTOINCREMENT,
                 name         TEXT    NOT NULL,
                 category     TEXT    NOT NULL,
                 clean_reps   INTEGER NOT NULL,
                 attempts     INTEGER NOT NULL,
                 accuracy     REAL    NOT NULL,
                 is_team      INTEGER NOT NULL DEFAULT 0,
                 created_at   INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS runs_by_category ON runs(category, clean_reps DESC);",
        )?;
        Ok(Self { conn, backup_dir: dir.join("backups") })
    }

    /// A fresh database in a temp folder, for tests.
    #[cfg(test)]
    pub fn temporary() -> Self {
        let dir = std::env::temp_dir().join(format!("pump-court-test-{}", now_ms()));
        Self::open(&dir).unwrap()
    }

    /// Saves a finished round. Returns the new run id.
    pub fn save_run(&self, category: Category, r: &RoundResult) -> rusqlite::Result<i64> {
        self.conn.execute(
            "INSERT INTO runs (name, category, clean_reps, attempts, accuracy, is_team, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![r.player, category.as_str(), r.clean_reps, r.attempts, r.accuracy, r.is_team, now_ms()],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Each player's best run in a category, ranked. Ties break on accuracy,
    /// then on who posted first.
    pub fn top(&self, category: Category, include_team: bool, limit: u32) -> rusqlite::Result<Vec<LeaderboardRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, clean_reps, attempts, accuracy, created_at FROM (
                 SELECT *, ROW_NUMBER() OVER (
                     PARTITION BY lower(name)
                     ORDER BY clean_reps DESC, accuracy DESC, created_at ASC
                 ) AS best
                 FROM runs
                 WHERE category = ?1 AND (?2 OR is_team = 0)
             )
             WHERE best = 1
             ORDER BY clean_reps DESC, accuracy DESC, created_at ASC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![category.as_str(), include_team, limit], |row| {
            Ok(LeaderboardRow {
                rank: 0,
                run_id: row.get(0)?,
                name: row.get(1)?,
                clean_reps: row.get(2)?,
                attempts: row.get(3)?,
                accuracy: row.get::<_, f64>(4)? as f32,
                posted_at: row.get(5)?,
            })
        })?;
        let mut out = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        for (i, row) in out.iter_mut().enumerate() {
            row.rank = i as u32 + 1;
        }
        Ok(out)
    }

    /// Where a player's best run sits on the public board.
    pub fn rank_of(&self, category: Category, name: &str) -> rusqlite::Result<Option<u32>> {
        Ok(self
            .top(category, false, u32::MAX)?
            .into_iter()
            .find(|r| r.name.eq_ignore_ascii_case(name))
            .map(|r| r.rank))
    }

    /// Moderation: the operator's delete key.
    pub fn delete_run(&self, run_id: i64) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM runs WHERE id = ?1", [run_id])?;
        Ok(())
    }

    /// How many different people have competed (for the demo).
    pub fn player_count(&self) -> rusqlite::Result<u32> {
        self.conn.query_row("SELECT COUNT(DISTINCT lower(name)) FROM runs WHERE is_team = 0", [], |r| r.get(0))
    }

    /// Writes every run to a timestamped JSON file. Returns its path.
    pub fn export_backup(&self) -> Result<PathBuf, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, category, clean_reps, attempts, accuracy, is_team, created_at FROM runs")
            .map_err(|e| e.to_string())?;
        let runs = stmt
            .query_map([], |row| {
                Ok(BackupRun {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: row.get(2)?,
                    clean_reps: row.get(3)?,
                    attempts: row.get(4)?,
                    accuracy: row.get::<_, f64>(5)? as f32,
                    is_team: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })
            .and_then(|rows| rows.collect::<rusqlite::Result<Vec<_>>>())
            .map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&self.backup_dir).map_err(|e| e.to_string())?;
        let path = self.backup_dir.join(format!("runs-{}.json", now_ms()));
        let json = serde_json::to_string_pretty(&runs).map_err(|e| e.to_string())?;
        std::fs::write(&path, json).map_err(|e| e.to_string())?;
        Ok(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::session::NoRepCounts;
    use crate::game::RoundMode;

    fn result(name: &str, clean: u32, attempts: u32) -> RoundResult {
        RoundResult {
            mode: RoundMode::Sprint,
            player: name.into(),
            is_team: false,
            clean_reps: clean,
            attempts,
            accuracy: clean as f32 / attempts as f32,
            no_reps: NoRepCounts::default(),
            duration_ms: 30_000,
            voided: None,
            run_id: None,
            rank: None,
        }
    }

    #[test]
    fn best_run_per_name_and_tie_break() {
        let db = Leaderboard::temporary();
        let cat = Category::ThirtySecond;
        db.save_run(cat, &result("Ana", 10, 12)).unwrap();
        db.save_run(cat, &result("ana", 14, 20)).unwrap(); // same person, better score
        db.save_run(cat, &result("Ben", 14, 14)).unwrap(); // ties on reps, wins on accuracy
        let top = db.top(cat, false, 10).unwrap();
        assert_eq!(top.len(), 2);
        assert_eq!(top[0].name, "Ben");
        assert_eq!(top[1].clean_reps, 14);
        assert_eq!(db.rank_of(cat, "ANA").unwrap(), Some(2));
    }

    #[test]
    fn names_are_checked() {
        assert_eq!(validate_name("  Jo   Lee ").unwrap(), "Jo Lee");
        assert!(validate_name("").is_err());
        assert!(validate_name("ThirteenChars").is_err());
    }
}
