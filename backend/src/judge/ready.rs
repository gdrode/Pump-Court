//! The ready check: the countdown only starts when every row passes.
//!
//! Holding the start position also calibrates the player's own lockout angle.

use super::angles::{body_angles, near_side};
use super::JudgeConfig;
use crate::pose::{idx, Landmark};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadyItem {
    pub id: &'static str,
    pub label: &'static str,
    pub pass: bool,
    /// What to tell the player (or operator) when it fails.
    pub prompt: Option<String>,
}

impl ReadyItem {
    fn new(id: &'static str, label: &'static str, pass: bool, prompt: impl Into<String>) -> Self {
        Self { id, label, pass, prompt: (!pass).then(|| prompt.into()) }
    }
}

pub struct ReadyCheck {
    cfg: JudgeConfig,
    hold_started_ms: Option<i64>,
    hold_samples: Vec<f32>,
}

/// Result of one ready-check frame.
pub struct ReadyStatus {
    pub items: Vec<ReadyItem>,
    /// Set once everything passed for the full hold time: the player's
    /// average straight-arm elbow angle.
    pub calibrated_lockout: Option<f32>,
}

impl ReadyCheck {
    pub fn new(cfg: JudgeConfig) -> Self {
        Self { cfg, hold_started_ms: None, hold_samples: Vec::new() }
    }

    pub fn update(&mut self, lms: Option<&[Landmark]>, width: u32, height: u32, fps: f32, t_ms: i64) -> ReadyStatus {
        let cfg = &self.cfg;
        let fps_item = ReadyItem::new("fps", "Frame rate", fps >= cfg.min_fps, format!("Tracking too slow ({fps:.0} fps)"));

        let Some(lms) = lms else {
            self.reset_hold();
            return ReadyStatus {
                items: vec![
                    ReadyItem::new("body", "Whole body in frame", false, "Step into frame"),
                    ReadyItem::new("sideOn", "Side-on", false, "Turn sideways to the camera"),
                    ReadyItem::new("onePlayer", "One player", false, "Step into the marked zone"),
                    ReadyItem::new("distance", "Distance", false, "Step into frame"),
                    fps_item,
                    ReadyItem::new("startPosition", "Start position", false, "Hold the top, arms straight"),
                ],
                calibrated_lockout: None,
            };
        };

        let (w, h) = (width as f32, height as f32);
        let side = near_side(lms).indices();
        let near: Vec<&Landmark> = side.all().iter().map(|&i| &lms[i]).collect();

        let in_frame = near
            .iter()
            .all(|l| l.visibility >= cfg.min_visibility + 0.1 && (0.0..=1.0).contains(&l.x) && (0.0..=1.0).contains(&l.y));
        let body = ReadyItem::new("body", "Whole body in frame", in_frame, "Move back so your hands and feet are in view");

        // Side-on: both shoulders nearly overlap, relative to torso length.
        let (ls, rs) = (lms[idx::LEFT_SHOULDER], lms[idx::RIGHT_SHOULDER]);
        let shoulder_gap = ((ls.x - rs.x) * w).hypot((ls.y - rs.y) * h);
        let (s, hp) = (lms[side.shoulder], lms[side.hip]);
        let torso = ((s.x - hp.x) * w).hypot((s.y - hp.y) * h).max(1.0);
        let side_on = ReadyItem::new("sideOn", "Side-on", shoulder_gap / torso < 0.35, "Turn sideways to the camera");

        // One player: the tracked body must be inside the marked zone.
        let hip_x = (lms[idx::LEFT_HIP].x + lms[idx::RIGHT_HIP].x) / 2.0;
        let one_player =
            ReadyItem::new("onePlayer", "One player", (0.05..=0.95).contains(&hip_x), "Step into the marked zone");

        // Distance: body spans between half and most of the frame width.
        let min_x = near.iter().map(|l| l.x).fold(f32::MAX, f32::min);
        let max_x = near.iter().map(|l| l.x).fold(f32::MIN, f32::max);
        let span = max_x - min_x;
        let distance = ReadyItem::new(
            "distance",
            "Distance",
            (0.5..=0.95).contains(&span),
            if span < 0.5 { "Move closer" } else { "Move back" },
        );

        // Start position: arms straight, held for the hold time.
        let elbow = body_angles(lms, width, height).elbow;
        let others_ok = body.pass && side_on.pass && one_player.pass && distance.pass && fps_item.pass;
        let straight = elbow >= cfg.start_position_min_elbow;
        let mut calibrated_lockout = None;
        let mut start_pass = false;
        if others_ok && straight {
            let started = *self.hold_started_ms.get_or_insert(t_ms);
            self.hold_samples.push(elbow);
            if t_ms - started >= cfg.start_hold_ms as i64 {
                start_pass = true;
                let n = self.hold_samples.len() as f32;
                calibrated_lockout = Some(self.hold_samples.iter().sum::<f32>() / n);
            }
        } else {
            self.reset_hold();
        }
        let start = ReadyItem::new(
            "startPosition",
            "Start position",
            start_pass,
            if straight { "Hold still…" } else { "Hold the top, arms straight" },
        );

        ReadyStatus { items: vec![body, side_on, one_player, distance, fps_item, start], calibrated_lockout }
    }

    fn reset_hold(&mut self) {
        self.hold_started_ms = None;
        self.hold_samples.clear();
    }
}
