//! Turning landmarks into referee calls. Pure maths, no camera or UI.

pub mod angles;
pub mod config;
pub mod ready;
pub mod tracker;

pub use angles::BodyAngles;
pub use config::JudgeConfig;
pub use ready::{ReadyCheck, ReadyItem};
pub use tracker::{RepTracker, RepVerdict};
