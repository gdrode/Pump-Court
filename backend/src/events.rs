//! Events: a named contest (e.g. "Knight Hacks") with its own leaderboards.
//!
//! An event picks which game modes it ranks (Sprint, Marathon, Max; never the
//! Duel). Each picked mode gets an "Everyone" board plus one board per role
//! (e.g. one per role the operator adds). Team leaderboards are one per mode:
//! a team's score is the sum of its members' best rounds (points) in that mode.
//!
//! A run is tagged with the event (and the player's role and team) when it is
//! posted, so it shows on the event's boards *and* the usual global boards.
//! One event at a time is active: new solo rounds are tagged with it.

use crate::game::RoundMode;
use crate::leaderboard::{validate_label, Leaderboard, LeaderboardRow};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const MAX_EVENT_NAME_LEN: usize = 24;
pub const MAX_ROLE_LEN: usize = 16;
pub const MAX_TEAM_LEN: usize = 16;
/// The modes an event can rank. Duels don't get event boards.
pub const EVENT_MODES: [RoundMode; 3] = [RoundMode::Sprint, RoundMode::Minute, RoundMode::Max];

/// An event and its boards.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInfo {
    pub id: i64,
    pub name: String,
    /// Modes with individual boards (an "Everyone" board + one per role each).
    pub modes: Vec<RoundMode>,
    /// Roles players pick at name entry, e.g. one per kind of guest.
    pub roles: Vec<String>,
    /// Modes with a team leaderboard.
    pub team_modes: Vec<RoundMode>,
    /// New solo rounds are tagged with this event.
    pub active: bool,
}

/// What the event screen sends to create (`id: None`) or change an event.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDraft {
    pub id: Option<i64>,
    pub name: String,
    pub modes: Vec<RoundMode>,
    pub roles: Vec<String>,
    pub team_modes: Vec<RoundMode>,
}

/// One team on a team leaderboard.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamRow {
    pub rank: u32,
    pub team: String,
    /// Sum of the members' best rounds (points) in the board's mode.
    pub points: f64,
    pub members: u32,
}

/// Run once when the database opens: the event tables, and the event, role
/// and team columns on `runs` (old databases get them empty).
pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS events (
             id         INTEGER PRIMARY KEY AUTOINCREMENT,
             name       TEXT NOT NULL,
             modes      TEXT NOT NULL,
             roles      TEXT NOT NULL,
             team_modes TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);",
    )?;
    let columns = conn
        .prepare("SELECT name FROM pragma_table_info('runs')")?
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (col, kind) in [("event_id", "INTEGER"), ("role", "TEXT"), ("team", "TEXT")] {
        if !columns.iter().any(|c| c == col) {
            conn.execute_batch(&format!("ALTER TABLE runs ADD COLUMN {col} {kind};"))?;
        }
    }
    conn.execute_batch("CREATE INDEX IF NOT EXISTS runs_by_event ON runs(event_id, mode, points DESC);")
}

fn to_json<T: Serialize>(v: &T) -> String {
    serde_json::to_string(v).unwrap_or_else(|_| "[]".into())
}

fn from_json<T: for<'de> Deserialize<'de> + Default>(s: String) -> T {
    serde_json::from_str(&s).unwrap_or_default()
}

/// Cleans a draft: name and roles checked, modes kept in menu order without repeats.
fn clean(draft: EventDraft) -> Result<EventDraft, String> {
    let name = validate_label(&draft.name, MAX_EVENT_NAME_LEN).map_err(|e| format!("Event name: {e}"))?;
    let pick = |modes: &[RoundMode]| EVENT_MODES.iter().copied().filter(|m| modes.contains(m)).collect::<Vec<_>>();
    let modes = pick(&draft.modes);
    let team_modes = pick(&draft.team_modes);
    if modes.is_empty() && team_modes.is_empty() {
        return Err("Pick at least one game mode or team leaderboard".into());
    }
    let mut roles: Vec<String> = Vec::new();
    for raw in &draft.roles {
        let role = validate_label(raw, MAX_ROLE_LEN).map_err(|e| format!("Role: {e}"))?;
        if !roles.iter().any(|r| r.eq_ignore_ascii_case(&role)) {
            roles.push(role);
        }
    }
    Ok(EventDraft { id: draft.id, name, modes, roles, team_modes })
}

impl Leaderboard {
    /// Every event, newest first.
    pub fn events(&self) -> rusqlite::Result<Vec<EventInfo>> {
        let active = self.active_event_id()?;
        let mut stmt = self.conn.prepare("SELECT id, name, modes, roles, team_modes FROM events ORDER BY id DESC")?;
        let rows = stmt.query_map([], |r| {
            let id: i64 = r.get(0)?;
            Ok(EventInfo {
                id,
                name: r.get(1)?,
                modes: from_json(r.get(2)?),
                roles: from_json(r.get(3)?),
                team_modes: from_json(r.get(4)?),
                active: active == Some(id),
            })
        })?;
        rows.collect()
    }

    pub fn event(&self, id: i64) -> rusqlite::Result<Option<EventInfo>> {
        Ok(self.events()?.into_iter().find(|e| e.id == id))
    }

    /// Creates or updates an event. A new event becomes the active one.
    pub fn save_event(&self, draft: EventDraft) -> Result<EventInfo, String> {
        let d = clean(draft)?;
        let db = |e: rusqlite::Error| e.to_string();
        let id = match d.id {
            Some(id) => {
                let n = self
                    .conn
                    .execute(
                        "UPDATE events SET name = ?2, modes = ?3, roles = ?4, team_modes = ?5 WHERE id = ?1",
                        params![id, d.name, to_json(&d.modes), to_json(&d.roles), to_json(&d.team_modes)],
                    )
                    .map_err(db)?;
                if n == 0 {
                    return Err("That event no longer exists".into());
                }
                id
            }
            None => {
                self.conn
                    .execute(
                        "INSERT INTO events (name, modes, roles, team_modes) VALUES (?1, ?2, ?3, ?4)",
                        params![d.name, to_json(&d.modes), to_json(&d.roles), to_json(&d.team_modes)],
                    )
                    .map_err(db)?;
                let id = self.conn.last_insert_rowid();
                self.set_active_event(Some(id)).map_err(db)?;
                id
            }
        };
        self.event(id).map_err(db)?.ok_or_else(|| "That event no longer exists".into())
    }

    /// Deletes an event. Its rounds stay on the global boards, untagged.
    pub fn delete_event(&self, id: i64) -> rusqlite::Result<()> {
        if self.active_event_id()? == Some(id) {
            self.set_active_event(None)?;
        }
        self.conn.execute("UPDATE runs SET event_id = NULL, role = NULL, team = NULL WHERE event_id = ?1", [id])?;
        self.conn.execute("DELETE FROM events WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn active_event_id(&self) -> rusqlite::Result<Option<i64>> {
        let v: Option<Option<String>> = self
            .conn
            .query_row("SELECT value FROM settings WHERE key = 'active_event'", [], |r| r.get(0))
            .optional()?;
        Ok(v.flatten().and_then(|s| s.parse().ok()))
    }

    /// Picks the event new rounds go to (`None` = no event).
    pub fn set_active_event(&self, id: Option<i64>) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('active_event', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [id.map(|i| i.to_string())],
        )?;
        Ok(())
    }

    pub fn active_event(&self) -> rusqlite::Result<Option<EventInfo>> {
        Ok(self.events()?.into_iter().find(|e| e.active))
    }

    /// Checks the tags of a round posted to an event: the event exists, the
    /// role is one of its roles. Returns the cleaned (role, team).
    pub fn check_tags(
        &self,
        event_id: i64,
        role: Option<&str>,
        team: Option<&str>,
    ) -> Result<(Option<String>, Option<String>), String> {
        let event = self.event(event_id).map_err(|e| e.to_string())?.ok_or("That event no longer exists")?;
        let role = match role.map(str::trim).filter(|r| !r.is_empty()) {
            None => None,
            Some(r) => Some(
                event
                    .roles
                    .iter()
                    .find(|x| x.eq_ignore_ascii_case(r))
                    .cloned()
                    .ok_or_else(|| format!("{r} is not a role in {}", event.name))?,
            ),
        };
        let team = match team.map(str::trim).filter(|t| !t.is_empty()) {
            None => None,
            Some(t) => Some(validate_label(t, MAX_TEAM_LEN).map_err(|e| format!("Team: {e}"))?),
        };
        Ok((role, team))
    }

    /// An event board: each player's best round in `mode`, for everyone at the
    /// event or (with `role`) only that role's players.
    pub fn event_top(
        &self,
        event_id: i64,
        mode: RoundMode,
        role: Option<&str>,
        limit: u32,
    ) -> rusqlite::Result<Vec<LeaderboardRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, mode, points, reps FROM (
                 SELECT *, ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY points DESC, id ASC) AS best
                 FROM runs
                 WHERE event_id = ?1 AND mode = ?2 AND (?3 IS NULL OR lower(role) = lower(?3))
             )
             WHERE best = 1
             ORDER BY points DESC, id ASC
             LIMIT ?4",
        )?;
        let rows = stmt.query_map(params![event_id, mode.as_str(), role, limit], LeaderboardRow::from_row)?;
        let mut out = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        for (i, row) in out.iter_mut().enumerate() {
            row.rank = i as u32 + 1;
        }
        Ok(out)
    }

    /// A team leaderboard: each team's members' best rounds in `mode`, added
    /// up. Team names match ignoring case; the first spelling posted is shown.
    /// A tie goes to the team that reached its score first.
    pub fn team_top(&self, event_id: i64, mode: RoundMode, limit: u32) -> rusqlite::Result<Vec<TeamRow>> {
        let mut stmt = self.conn.prepare(
            "WITH best AS (
                 SELECT lower(team) AS key, points, id,
                        ROW_NUMBER() OVER (PARTITION BY lower(team), lower(name) ORDER BY points DESC, id ASC) AS n
                 FROM runs
                 WHERE event_id = ?1 AND mode = ?2 AND team IS NOT NULL AND team <> ''
             ),
             spelling AS (
                 SELECT lower(team) AS key, team, ROW_NUMBER() OVER (PARTITION BY lower(team) ORDER BY id ASC) AS n
                 FROM runs WHERE event_id = ?1 AND team IS NOT NULL AND team <> ''
             )
             SELECT s.team, SUM(b.points) AS total, COUNT(*) AS members, MAX(b.id) AS last
             FROM best b JOIN spelling s ON s.key = b.key AND s.n = 1
             WHERE b.n = 1
             GROUP BY b.key
             ORDER BY total DESC, last ASC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![event_id, mode.as_str(), limit], |r| {
            Ok(TeamRow { rank: 0, team: r.get(0)?, points: r.get(1)?, members: r.get(2)? })
        })?;
        let mut out = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        for (i, row) in out.iter_mut().enumerate() {
            row.rank = i as u32 + 1;
        }
        Ok(out)
    }

    /// Team names already used at an event (for the name screen's suggestions).
    pub fn event_teams(&self, event_id: i64) -> rusqlite::Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT team, MIN(id) FROM runs WHERE event_id = ?1 AND team IS NOT NULL AND team <> ''
             GROUP BY lower(team) ORDER BY lower(team)",
        )?;
        let rows = stmt.query_map([event_id], |r| r.get(0))?;
        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft(name: &str) -> EventDraft {
        EventDraft {
            id: None,
            name: name.into(),
            modes: vec![RoundMode::Max, RoundMode::Sprint, RoundMode::Duel, RoundMode::Sprint],
            roles: vec!["Alpha".into(), "beta".into(), "ALPHA".into()],
            team_modes: vec![RoundMode::Sprint],
        }
    }

    #[test]
    fn create_cleans_and_activates() {
        let db = Leaderboard::temporary();
        let e = db.save_event(draft("  Test   Fest ")).unwrap();
        assert_eq!(e.name, "Test Fest");
        assert_eq!(e.modes, [RoundMode::Sprint, RoundMode::Max], "menu order, no duel, no repeats");
        assert_eq!(e.roles, ["Alpha", "beta"]);
        assert!(e.active);
        let other = db.save_event(draft("Other")).unwrap();
        assert!(other.active && !db.event(e.id).unwrap().unwrap().active, "one active event at a time");
        db.set_active_event(None).unwrap();
        assert!(db.active_event().unwrap().is_none());
    }

    #[test]
    fn bad_drafts_are_refused() {
        let db = Leaderboard::temporary();
        assert!(db.save_event(EventDraft { name: "".into(), ..draft("x") }).is_err());
        let none = EventDraft { modes: vec![RoundMode::Duel], team_modes: vec![], ..draft("Empty") };
        assert!(db.save_event(none).is_err());
        assert!(db.save_event(EventDraft { roles: vec!["sh1t".into()], ..draft("x") }).is_err());
        assert!(db.save_event(EventDraft { id: Some(999), ..draft("Gone") }).is_err());
    }

    #[test]
    fn edit_keeps_the_id() {
        let db = Leaderboard::temporary();
        let e = db.save_event(draft("Fest")).unwrap();
        let edited = db
            .save_event(EventDraft { id: Some(e.id), name: "Fest 2".into(), modes: vec![RoundMode::Minute], ..draft("") })
            .unwrap();
        assert_eq!((edited.id, edited.name.as_str()), (e.id, "Fest 2"));
        assert_eq!(edited.modes, [RoundMode::Minute]);
        assert_eq!(db.events().unwrap().len(), 1);
    }

    #[test]
    fn role_boards_and_team_sums() {
        let db = Leaderboard::temporary();
        let ev = db.save_event(draft("Fest")).unwrap().id;
        let post = |name: &str, mode, reps, role: Option<&str>, team: Option<&str>| {
            db.save_tagged_run(name, mode, f64::from(reps), reps, Some(ev), role, team).unwrap()
        };
        post("Ana", RoundMode::Sprint, 20, Some("Alpha"), Some("Red"));
        post("Ana", RoundMode::Sprint, 25, Some("Alpha"), Some("red")); // her best counts once
        post("Ben", RoundMode::Sprint, 18, Some("beta"), Some("RED"));
        post("Cy", RoundMode::Sprint, 30, Some("beta"), Some("Blue"));
        post("Dee", RoundMode::Max, 90, None, Some("Blue")); // other mode: not on the Sprint team board
        db.save_run("Eve", RoundMode::Sprint, 99).unwrap(); // not at the event

        let everyone = db.event_top(ev, RoundMode::Sprint, None, 10).unwrap();
        let names: Vec<_> = everyone.iter().map(|r| (r.name.as_str(), r.points)).collect();
        assert_eq!(names, [("Cy", 30.0), ("Ana", 25.0), ("Ben", 18.0)]);
        let beta = db.event_top(ev, RoundMode::Sprint, Some("BETA"), 10).unwrap();
        assert_eq!(beta.iter().map(|r| r.name.as_str()).collect::<Vec<_>>(), ["Cy", "Ben"]);

        let teams = db.team_top(ev, RoundMode::Sprint, 10).unwrap();
        let got: Vec<_> = teams.iter().map(|t| (t.team.as_str(), t.points, t.members, t.rank)).collect();
        assert_eq!(got, [("Red", 43.0, 2, 1), ("Blue", 30.0, 1, 2)]);
        assert_eq!(db.event_teams(ev).unwrap(), ["Blue", "Red"]);
        assert_eq!(db.top(Some(RoundMode::Sprint), 1).unwrap()[0].name, "Eve", "event rounds stay on the global boards too");

        db.delete_event(ev).unwrap();
        assert!(db.events().unwrap().is_empty());
        assert_eq!(db.top(Some(RoundMode::Sprint), 10).unwrap().len(), 4, "rounds are kept");
    }

    #[test]
    fn tags_are_checked() {
        let db = Leaderboard::temporary();
        let ev = db.save_event(draft("Fest")).unwrap().id;
        assert_eq!(db.check_tags(ev, Some("alpha"), Some("  Red  ")).unwrap(), (Some("Alpha".into()), Some("Red".into())));
        assert_eq!(db.check_tags(ev, Some(""), None).unwrap(), (None, None));
        assert!(db.check_tags(ev, Some("Gamma"), None).is_err());
        assert!(db.check_tags(ev, None, Some("fuck")).is_err());
        assert!(db.check_tags(ev + 1, None, None).is_err());
    }

    #[test]
    fn old_databases_get_the_new_columns() {
        let db = Leaderboard::temporary();
        init(&db.conn).unwrap(); // running it twice is harmless
        let id = db.save_run("Ana", RoundMode::Sprint, 10).unwrap();
        let tags: (Option<i64>, Option<String>) =
            db.conn.query_row("SELECT event_id, role FROM runs WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(tags, (None, None));
    }
}
