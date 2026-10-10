use serde::{Deserialize, Serialize};

/// The clock and end condition of a round.
///
/// The six menu modes from the proposal map onto these four:
/// Duel is two Sprint turns and Ghost race is a Sprint/Minute/Max round
/// with a saved run shown beside it. The frontend handles that framing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RoundMode {
    /// Most clean reps in 30 seconds.
    Sprint,
    /// Most clean reps in 60 seconds.
    Minute,
    /// Untimed; ends after 5 s without a clean rep, 3 minute cap.
    Max,
    /// No clock, no score: live angles and lights. The debug view.
    Practice,
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
    /// Fixed round length, if the mode has one.
    pub fn duration_ms(self) -> Option<u64> {
        match self {
            RoundMode::Sprint => Some(30_000),
            RoundMode::Minute => Some(60_000),
            RoundMode::Max => Some(MAX_CAP_MS),
            RoundMode::Practice => None,
        }
    }

    pub fn category(self) -> Option<Category> {
        match self {
            RoundMode::Sprint => Some(Category::ThirtySecond),
            RoundMode::Minute => Some(Category::OneMinute),
            RoundMode::Max => Some(Category::Most),
            RoundMode::Practice => None,
        }
    }

    /// Practice skips the ready check and countdown and never posts a score.
    pub fn is_practice(self) -> bool {
        self == RoundMode::Practice
    }
}
