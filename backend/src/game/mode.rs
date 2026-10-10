use serde::{Deserialize, Serialize};

/// The mode a round is played in: its clock, end condition and leaderboard.
///
/// A Duel is two players taking turns; each turn is a 30-second round. The
/// frontend runs the two turns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RoundMode {
    /// Most valid push-ups in 30 seconds.
    Sprint,
    /// Most valid push-ups in 60 seconds.
    Minute,
    /// Untimed; ends after 5 s without a valid push-up, 3 minute cap.
    Max,
    /// One turn of a two-player duel: plays like Sprint.
    Duel,
}

pub const MAX_IDLE_MS: i64 = 5_000;
pub const MAX_CAP_MS: i64 = 180_000;

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

    /// Longest the round can last.
    pub fn duration_ms(self) -> i64 {
        match self {
            RoundMode::Sprint | RoundMode::Duel => 30_000,
            RoundMode::Minute => 60_000,
            RoundMode::Max => MAX_CAP_MS,
        }
    }
}
