use serde::{Deserialize, Serialize};

/// The mode a round is played in: its clock, end condition and leaderboard.
///
/// A Duel is two players taking turns; each turn is a 30-second round that
/// posts to the 30-second board. The frontend runs the two turns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RoundMode {
    /// Most clean reps in 30 seconds.
    Sprint,
    /// Most clean reps in 60 seconds.
    Minute,
    /// Untimed; ends after 5 s without a clean rep, 3 minute cap.
    Max,
    /// One turn of a two-player duel: plays like Sprint.
    Duel,
}

/// Leaderboard tab a mode posts to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    ThirtySecond,
    OneMinute,
    Most,
}

impl Category {
    /// The value stored in the database.
    pub fn as_str(self) -> &'static str {
        match self {
            Category::ThirtySecond => "thirtySecond",
            Category::OneMinute => "oneMinute",
            Category::Most => "most",
        }
    }
}

pub const MAX_IDLE_MS: u64 = 5_000;
pub const MAX_CAP_MS: u64 = 180_000;

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

    /// Fixed round length, if the mode has one.
    /// Longest the round can last.
    pub fn duration_ms(self) -> u64 {
        match self {
            RoundMode::Sprint | RoundMode::Duel => 30_000,
            RoundMode::Minute => 60_000,
            RoundMode::Max => MAX_CAP_MS,
        }
    }

    pub fn category(self) -> Category {
        match self {
            RoundMode::Sprint | RoundMode::Duel => Category::ThirtySecond,
            RoundMode::Minute => Category::OneMinute,
            RoundMode::Max => Category::Most,
        }
    }
}
