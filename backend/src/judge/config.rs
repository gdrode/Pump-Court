use serde::{Deserialize, Serialize};

/// Every tunable number the referees use.
///
/// These are starting values from the proposal. Tune them on recorded clips
/// and change them live from the frontend with `set_judge_config`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgeConfig {
    /// Depth referee: the elbow must bend to this angle or less.
    pub depth_max_elbow: f32,
    /// Lockout referee: the elbow must straighten to this angle or more
    /// (lowered per player by calibration, never raised).
    pub lockout_min_elbow: f32,
    /// Plank referee: hip angle (shoulder-hip-ankle) must stay at or above this.
    pub plank_min_hip: f32,
    /// Plank referee: knee angle (hip-knee-ankle) must stay at or above this.
    pub plank_min_knee: f32,

    /// The rep starts once the elbow drops this far below the lockout angle.
    /// The gap between "enter top" and "leave top" stops jitter double-counting.
    pub top_exit_margin: f32,
    /// A dip smaller than this (from lockout) is ignored as a wobble.
    pub min_attempt_drop: f32,
    /// Rising this far above the lowest point counts as pushing back up.
    pub ascent_margin: f32,
    /// Falling this far again before lockout fails the lockout referee.
    pub redip_margin: f32,
    /// Top, bottom and plank faults must each be seen in this many frames in a row.
    pub confirm_frames: u32,

    /// Light smoothing of angles (1.0 = none). Heavy smoothing flattens fast reps.
    pub smoothing_alpha: f32,
    /// Landmarks less visible than this count as not tracked.
    pub min_visibility: f32,
    /// A round is voided if tracking drops for longer than this.
    pub tracking_loss_ms: u64,

    /// Ready check: lowest elbow angle accepted as "arms straight" for calibration.
    pub start_position_min_elbow: f32,
    /// Ready check: how long the start position must be held.
    pub start_hold_ms: u64,
    /// Ready check: lowest tracking frame rate allowed.
    pub min_fps: f32,
}

impl Default for JudgeConfig {
    fn default() -> Self {
        Self {
            depth_max_elbow: 90.0,
            lockout_min_elbow: 160.0,
            plank_min_hip: 160.0,
            plank_min_knee: 160.0,
            top_exit_margin: 15.0,
            min_attempt_drop: 30.0,
            ascent_margin: 25.0,
            redip_margin: 20.0,
            confirm_frames: 2,
            smoothing_alpha: 0.6,
            min_visibility: 0.5,
            tracking_loss_ms: 500,
            start_position_min_elbow: 145.0,
            start_hold_ms: 1000,
            min_fps: 24.0,
        }
    }
}
