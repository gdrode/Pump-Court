//! Scores on disk, in a small SQLite database on the game laptop.
//!
//! One table, one row per finished round: who, which mode, the points (the
//! score: 1 per 2-light push-up, 2 per 3-light), how many valid push-ups, and (for a round at an event) the event, role and team; see
//! `events.rs`. Survives refreshes and crashes, needs no internet, and writes a
//! JSON backup file every hour (see the engine).

use crate::game::{FinishReason, NoRepCounts, RoundMode, RoundResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_NAME_LEN: usize = 12;

/// Names the operator never wants on the crowd screen. Keep it short and add
/// to it at the event. Matching ignores case, spaces and common swaps (see `normalise`).
const BLOCKLIST: &[&str] = &[
    "admin", "fuck", "shit", "cunt", "nigg", "fag", "bitch", "dick", "cock", "pussy", "nazi", "hitler", "rape",
    "slut", "whore",
];

/// Lower-cases and undoes the usual dodges: "F.u_c-k", "sh1t", "$lut".
fn normalise(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .filter(|c| !matches!(c, ' ' | '.' | '_' | '-'))
        .map(|c| match c {
            '0' => 'o',
            '1' => 'i',
            '3' => 'e',
            '4' => 'a',
            '5' | '$' => 's',
            other => other,
        })
        .collect()
}

/// One player's best round on a board.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardRow {
    pub rank: u32,
    pub run_id: i64,
    pub name: String,
    /// "sprint", "minute", "max" or "duel".
    pub mode: String,
    /// The score the board ranks by.
    /// To one decimal (streaks give 2.2–2.5 per perfect rep).
    pub points: f64,
    /// Valid push-ups.
    pub reps: u32,
}

impl LeaderboardRow {
    /// From `SELECT id, name, mode, points, reps` (rank set by the caller).
    pub(crate) fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        Ok(Self { rank: 0, run_id: row.get(0)?, name: row.get(1)?, mode: row.get(2)?, points: row.get(3)?, reps: row.get(4)? })
    }
}

/// A stored round, as written to the backup file.
#[derive(Debug, Clone, Serialize)]
struct BackupRun {
    id: i64,
    name: String,
    mode: String,
    points: f64,
    reps: u32,
    event_id: Option<i64>,
    role: Option<String>,
    team: Option<String>,
}

pub struct Leaderboard {
    pub(crate) conn: Connection,
    backup_dir: PathBuf,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Trims and checks a player name. Returns the cleaned name or why it's rejected.
pub fn validate_name(raw: &str) -> Result<String, String> {
    validate_label(raw, MAX_NAME_LEN)
}

/// Same rules as names, for any text shown on the crowd screen (event names,
/// roles, teams) with its own length limit.
pub fn validate_label(raw: &str, max_len: usize) -> Result<String, String> {
    let name = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err("Enter a name".into());
    }
    if name.chars().count() > max_len {
        return Err(format!("Names are {max_len} characters at most"));
    }
    let plain = normalise(&name);
    if BLOCKLIST.iter().any(|bad| plain.contains(bad)) {
        return Err("Please pick another name".into());
    }
    Ok(name)
}

/// Databases from before this layout had a `clean_reps` column and many more.
/// Their table is renamed to `runs_v1` (nothing is deleted) and its public
/// rounds are copied into the new table.
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let columns = conn
        .prepare("SELECT name FROM pragma_table_info('runs')")?
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if !columns.iter().any(|c| c == "clean_reps") {
        return Ok(());
    }
    let has = |c: &str| columns.iter().any(|x| x == c);
    let mode = if has("mode") {
        "mode"
    } else {
        "CASE category WHEN 'oneMinute' THEN 'minute' WHEN 'most' THEN 'max' ELSE 'sprint' END"
    };
    let public = if has("is_team") { "WHERE is_team = 0" } else { "" };
    let order = if has("created_at") { "created_at, id" } else { "id" };
    conn.execute_batch(&format!(
        "BEGIN;
         ALTER TABLE runs RENAME TO runs_v1;
         {CREATE_RUNS}
         INSERT INTO runs (name, mode, reps) SELECT name, {mode}, clean_reps FROM runs_v1 {public} ORDER BY {order};
         COMMIT;"
    ))
}

const CREATE_RUNS: &str = "CREATE TABLE IF NOT EXISTS runs (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT    NOT NULL,
    mode  TEXT    NOT NULL,
    reps  INTEGER NOT NULL
);";

/// Points came later: older rounds get `points = reps` (their perfect count was never stored).
fn add_points(conn: &Connection) -> rusqlite::Result<()> {
    let has = conn
        .prepare("SELECT name FROM pragma_table_info('runs')")?
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .iter()
        .any(|c| c == "points");
    if !has {
        conn.execute_batch("ALTER TABLE runs ADD COLUMN points REAL;")?;
    }
    conn.execute_batch(
        "UPDATE runs SET points = reps WHERE points IS NULL;
         CREATE INDEX IF NOT EXISTS runs_by_points ON runs(mode, points DESC);",
    )
}

impl Leaderboard {
    /// Opens (or creates) the database in `dir`.
    pub fn open(dir: &Path) -> rusqlite::Result<Self> {
        std::fs::create_dir_all(dir).ok();
        let conn = Connection::open(dir.join("pump-court.sqlite3"))?;
        conn.execute_batch("PRAGMA journal_mode = WAL;")?;
        migrate(&conn)?;
        conn.execute_batch(CREATE_RUNS)?;
        conn.execute_batch("CREATE INDEX IF NOT EXISTS runs_by_mode ON runs(mode, reps DESC);")?;
        add_points(&conn)?;
        crate::events::init(&conn)?;
        Ok(Self { conn, backup_dir: dir.join("backups") })
    }

    /// A fresh database in a temp folder, for tests.
    #[cfg(test)]
    pub fn temporary() -> Self {
        let dir = std::env::temp_dir().join(format!("pump-court-test-{}-{}", now_ms(), rand::random::<u32>()));
        Self::open(&dir).unwrap()
    }

    /// Saves a round scored only by its points (counted as that many push-ups too). Returns the run id.
    pub fn save_run(&self, name: &str, mode: RoundMode, points: u32) -> rusqlite::Result<i64> {
        self.save_tagged_run(name, mode, f64::from(points), points, None, None, None)
    }

    /// Saves a finished round played at an event, with the player's role and team.
    pub fn save_tagged_run(
        &self,
        name: &str,
        mode: RoundMode,
        points: f64,
        reps: u32,
        event_id: Option<i64>,
        role: Option<&str>,
        team: Option<&str>,
    ) -> rusqlite::Result<i64> {
        self.conn.execute(
            "INSERT INTO runs (name, mode, points, reps, event_id, role, team) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![name, mode.as_str(), points, reps, event_id, role, team],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Each player's best round, ranked by points. `None` = every mode
    /// (the all-time board). A tie goes to whoever posted first.
    pub fn top(&self, mode: Option<RoundMode>, limit: u32) -> rusqlite::Result<Vec<LeaderboardRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, mode, points, reps FROM (
                 SELECT *, ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY points DESC, id ASC) AS best
                 FROM runs
                 WHERE ?1 IS NULL OR mode = ?1
             )
             WHERE best = 1
             ORDER BY points DESC, id ASC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![mode.map(RoundMode::as_str), limit], LeaderboardRow::from_row)?;
        let mut out = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        for (i, row) in out.iter_mut().enumerate() {
            row.rank = i as u32 + 1;
        }
        Ok(out)
    }

    /// Where a player's best round sits on a board.
    pub fn rank_of(&self, mode: Option<RoundMode>, name: &str) -> rusqlite::Result<Option<u32>> {
        Ok(self.top(mode, u32::MAX)?.into_iter().find(|r| r.name.eq_ignore_ascii_case(name)).map(|r| r.rank))
    }

    /// Moderation, and "Discard" on the results screen.
    pub fn delete_run(&self, run_id: i64) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM runs WHERE id = ?1", [run_id])?;
        Ok(())
    }

    /// How many different people have competed.
    pub fn player_count(&self) -> rusqlite::Result<u32> {
        self.conn.query_row("SELECT COUNT(DISTINCT lower(name)) FROM runs", [], |r| r.get(0))
    }

    /// The stored round with this id, if any.
    #[cfg(test)]
    fn run(&self, id: i64) -> rusqlite::Result<Option<(String, String, u32)>> {
        use rusqlite::OptionalExtension;
        self.conn
            .query_row("SELECT name, mode, reps FROM runs WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()
    }

    /// Writes every round to a timestamped JSON file. Returns its path.
    pub fn export_backup(&self) -> Result<PathBuf, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, mode, points, reps, event_id, role, team FROM runs ORDER BY id")
            .map_err(|e| e.to_string())?;
        let runs = stmt
            .query_map([], |row| {
                Ok(BackupRun {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    mode: row.get(2)?,
                    points: row.get(3)?,
                    reps: row.get(4)?,
                    event_id: row.get(5)?,
                    role: row.get(6)?,
                    team: row.get(7)?,
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

/// A round the frontend played itself and asks to save: a side-by-side Duel,
/// where two players go at once on two cameras (the engine's single session
/// runs one round at a time).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishedRound {
    pub mode: RoundMode,
    pub player: String,
    /// The score; if missing, worked out from `reps` and `perfect` (see `rep_points`).
    #[serde(default)]
    pub points: Option<f64>,
    pub reps: u32,
    pub attempts: u32,
    pub perfect: u32,
    /// Longest run of perfect reps.
    #[serde(default)]
    pub best_streak: u32,
    pub no_reps: NoRepCounts,
    pub duration_ms: i64,
    /// Why this player's round ended.
    pub finish: FinishReason,
    /// The event the round was played at (its boards get the score too).
    #[serde(default)]
    pub event_id: Option<i64>,
    /// The player's role at the event (one of its roles).
    #[serde(default)]
    pub role: Option<String>,
    /// The player's team at the event (any name).
    #[serde(default)]
    pub team: Option<String>,
}

/// Checks the name, posts the score and returns the full result with its id
/// and the player's rank on that mode's board.
pub fn save_finished(db: &Leaderboard, round: FinishedRound) -> Result<RoundResult, String> {
    let player = validate_name(&round.player)?;
    // 2 points per perfect rep, 1 per other valid rep: reps + perfect (no streak bonus).
    let points = round.points.unwrap_or(f64::from(round.reps + round.perfect.min(round.reps)));
    let (role, team) = match round.event_id {
        Some(ev) => db.check_tags(ev, round.role.as_deref(), round.team.as_deref())?,
        None => (None, None),
    };
    let id = db
        .save_tagged_run(&player, round.mode, points, round.reps, round.event_id, role.as_deref(), team.as_deref())
        .map_err(|e| e.to_string())?;
    let rank = db.rank_of(Some(round.mode), &player).ok().flatten();
    Ok(RoundResult {
        mode: round.mode,
        player,
        points,
        reps: round.reps,
        attempts: round.attempts,
        perfect: round.perfect,
        best_streak: round.best_streak,
        no_reps: round.no_reps,
        duration_ms: round.duration_ms.max(0),
        finish: round.finish,
        run_id: Some(id),
        rank,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_name_mode_and_reps() {
        let db = Leaderboard::temporary();
        let id = db.save_run("Ana", RoundMode::Minute, 31).unwrap();
        assert_eq!(db.run(id).unwrap(), Some(("Ana".into(), "minute".into(), 31)));
        db.delete_run(id).unwrap();
        assert_eq!(db.run(id).unwrap(), None);
    }

    #[test]
    fn best_round_per_name_and_tie_break() {
        let db = Leaderboard::temporary();
        db.save_run("Ana", RoundMode::Sprint, 10).unwrap();
        db.save_run("ana", RoundMode::Sprint, 14).unwrap(); // same person, better score
        db.save_run("Ben", RoundMode::Sprint, 14).unwrap(); // ties on reps, posted later
        let top = db.top(Some(RoundMode::Sprint), 10).unwrap();
        assert_eq!(top.len(), 2);
        assert_eq!((top[0].name.as_str(), top[0].reps), ("ana", 14));
        assert_eq!(top[1].name, "Ben");
        assert_eq!(db.rank_of(Some(RoundMode::Sprint), "BEN").unwrap(), Some(2));
        assert_eq!(db.player_count().unwrap(), 2);
    }

    #[test]
    fn all_time_board_ignores_the_mode() {
        let db = Leaderboard::temporary();
        db.save_run("Ana", RoundMode::Sprint, 20).unwrap();
        db.save_run("Ana", RoundMode::Max, 55).unwrap();
        db.save_run("Ben", RoundMode::Minute, 40).unwrap();
        db.save_run("Cy", RoundMode::Duel, 18).unwrap();
        let all = db.top(None, 10).unwrap();
        let got: Vec<_> = all.iter().map(|r| (r.name.as_str(), r.mode.as_str(), r.reps)).collect();
        assert_eq!(got, [("Ana", "max", 55), ("Ben", "minute", 40), ("Cy", "duel", 18)]);
        assert_eq!(db.top(Some(RoundMode::Minute), 10).unwrap().len(), 1);
    }

    #[test]
    fn old_databases_are_converted() {
        let dir = std::env::temp_dir().join(format!("pump-court-migrate-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let old = Connection::open(dir.join("pump-court.sqlite3")).unwrap();
        old.execute_batch(
            "CREATE TABLE runs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
             clean_reps INTEGER NOT NULL, attempts INTEGER NOT NULL, accuracy REAL NOT NULL,
             is_team INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
             mode TEXT NOT NULL DEFAULT 'sprint', no_rep_depth INTEGER NOT NULL DEFAULT 0);
             CREATE INDEX runs_by_category ON runs(category, clean_reps DESC);
             INSERT INTO runs (name, category, clean_reps, attempts, accuracy, created_at, mode)
             VALUES ('Old', 'oneMinute', 25, 30, 0.83, 1, 'minute'), ('Staff', 'thirtySecond', 99, 99, 1, 2, 'sprint');
             UPDATE runs SET is_team = 1 WHERE name = 'Staff';",
        )
        .unwrap();
        drop(old);
        let db = Leaderboard::open(&dir).unwrap();
        let all = db.top(None, 10).unwrap();
        assert_eq!(all.len(), 1, "team runs were never public");
        assert_eq!((all[0].name.as_str(), all[0].mode.as_str(), all[0].reps), ("Old", "minute", 25));
        let kept: u32 = db.conn.query_row("SELECT COUNT(*) FROM runs_v1", [], |r| r.get(0)).unwrap();
        assert_eq!(kept, 2, "the old table is kept as it was");
        drop(db);
        // Opening again leaves the converted database alone.
        assert_eq!(Leaderboard::open(&dir).unwrap().top(None, 10).unwrap().len(), 1);
    }

    #[test]
    fn boards_rank_by_points_not_push_ups() {
        let db = Leaderboard::temporary();
        db.save_tagged_run("Ana", RoundMode::Sprint, 20.0, 20, None, None, None).unwrap(); // 20 two-light reps
        db.save_tagged_run("Ben", RoundMode::Sprint, 24.2, 12, None, None, None).unwrap(); // 12 perfect reps
        let top = db.top(Some(RoundMode::Sprint), 10).unwrap();
        let got: Vec<_> = top.iter().map(|r| (r.name.as_str(), r.points, r.reps)).collect();
        assert_eq!(got, [("Ben", 24.2, 12), ("Ana", 20.0, 20)]);
    }

    #[test]
    fn rounds_from_before_points_score_their_push_ups() {
        let db = Leaderboard::temporary();
        db.conn.execute("INSERT INTO runs (name, mode, reps) VALUES ('Old', 'sprint', 17)", []).unwrap();
        add_points(&db.conn).unwrap();
        assert_eq!(db.top(None, 10).unwrap()[0].points, 17.0);
    }

    #[test]
    fn names_are_checked() {
        assert_eq!(validate_name("  Jo   Lee ").unwrap(), "Jo Lee");
        assert!(validate_name("").is_err());
        assert!(validate_name("ThirteenChars").is_err());
        assert!(validate_name("sh1t").is_err());
        assert!(validate_name("F.u_c-k").is_err());
        assert!(validate_name("Dick Lee").is_err());
        assert!(validate_name("Rosa").is_ok());
    }

    #[test]
    fn save_finished_posts_the_score_and_ranks_it() {
        let db = Leaderboard::temporary();
        let round = |name: &str, reps| FinishedRound {
            mode: RoundMode::Minute,
            player: name.into(),
            points: None,
            reps,
            best_streak: 1,
            attempts: reps + 2,
            perfect: 1,
            no_reps: NoRepCounts { depth: 2, torso: 0, lockout: 1 },
            duration_ms: 60_000,
            finish: FinishReason::Time,
            event_id: None,
            role: None,
            team: None,
        };
        let a = save_finished(&db, round("Ana", 20)).unwrap();
        let b = save_finished(&db, round("Ben", 25)).unwrap();
        assert!(a.run_id.is_some() && b.run_id.is_some());
        assert_eq!((b.rank, b.reps, b.attempts), (Some(1), 25, 27));
        assert_eq!(b.points, 26.0, "25 valid push-ups, 1 of them perfect");
        assert_eq!(db.rank_of(Some(RoundMode::Minute), "Ana").unwrap(), Some(2));
        assert!(save_finished(&db, round("", 5)).is_err(), "names are checked like any round");
    }
}
