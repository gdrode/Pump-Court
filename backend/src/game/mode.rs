use serde::{Deserialize, Serialize};

/// The mode a round is played in: its clock, end condition and leaderboard.
///
/// `Duel` is the 30-second Duel board. A Duel is played side by side on two
/// cameras (the frontend runs it and saves through `save_round`), or as two
/// turns on one camera, each turn an engine round in this mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RoundMode {
    /// Most valid push-ups in 30 seconds.
    Sprint,
    /// Most valid push-ups in 60 seconds.
    Minute,
    /// Untimed; ends when the player fails (see [`fail_window_ms`]).
    Max,
    /// One turn of a two-player duel: plays like Sprint.
    Duel,
}

/// When a player fails, in every mode (the same rules as the tracker's
/// `pumpCourt/src/game.ts`, which the side-by-side Duel uses). The round ends
/// early if the player gets out of the push-up position, gets stuck in a rep
/// (can't press up) or stops doing push-ups.
///
/// Out of position (stood up, knees down, walked off) this long. Not fatigue-based.
pub const OUT_OF_POSITION_MS: i64 = 2_000;
/// Stuck / stopped window at the first rep.
pub const FAIL_BASE_MS: i64 = 4_000;
/// Added to the window for each rep attempted: people slow down as they tire.
pub const FAIL_PER_REP_MS: i64 = 250;

impl RoundMode {
    /// The value stored in the database.
    pub fn as_str(self) -> &'static str {
        match self {
            RoundMode::Sprint => "sprint",
            RoundMode::Minute => "minute",
            RoundMode::Max => "max",
            RoundMode::Duel => "duel",
        }
    }

    /// Length of the clock, or `None` for Max (no time limit).
    pub fn duration_ms(self) -> Option<i64> {
        match self {
            RoundMode::Sprint | RoundMode::Duel => Some(30_000),
            RoundMode::Minute => Some(60_000),
            RoundMode::Max => None,
        }
    }

    /// The failure window never grows past this: Sprint 6 s, Minute 8 s, Max 10 s.
    pub fn fail_cap_ms(self) -> i64 {
        match self {
            RoundMode::Sprint | RoundMode::Duel => 6_000,
            RoundMode::Minute => 8_000,
            RoundMode::Max => 10_000,
        }
    }

    /// How long a player may be stuck in a rep, or go without one, before
    /// they've failed: 4 s + 0.25 s per rep attempted, up to the mode's cap.
    pub fn fail_window_ms(self, reps_done: u32) -> i64 {
        (FAIL_BASE_MS + FAIL_PER_REP_MS * i64::from(reps_done)).min(self.fail_cap_ms())
    }
}
