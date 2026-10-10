//! The rep tracker and the three referees.
//!
//! Feed it one set of angles per frame. When a rep finishes it returns a
//! [`RepVerdict`] with one light per referee:
//!
//! * **Depth**   – lowest elbow angle in the rep is at or below the limit.
//! * **Lockout** – the arms straighten fully before the next rep.
//! * **Plank**   – hips and knees stay straight for the whole rep.
//!
//! Anti-cheat rules from the proposal live here too: depth uses the lowest
//! angle seen (not one instant), top and bottom must each hold for
//! `confirm_frames` frames, and a new rep can't start without lockout.

use super::{BodyAngles, JudgeConfig};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Referee {
    Depth,
    Lockout,
    Plank,
}

/// One referee light.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Light {
    pub referee: Referee,
    pub pass: bool,
    /// The number the referee measured, e.g. lowest elbow angle.
    pub measured: f32,
    /// The number it needed.
    pub needed: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepVerdict {
    /// 1-based count of attempts in this round.
    pub attempt: u32,
    pub clean: bool,
    /// Always [depth, lockout, plank].
    pub lights: [Light; 3],
    /// Human readable reasons for a no-rep, e.g. "Depth: 104°, needed 90°".
    pub reasons: Vec<String>,
    pub start_ms: i64,
    pub end_ms: i64,
}

/// Data collected while a rep is in progress.
#[derive(Debug, Clone)]
struct RepWindow {
    start_ms: i64,
    min_elbow: f32,
    bottom_run: u32,
    bottom_confirmed: bool,
    ascending: bool,
    max_since_ascent: f32,
    top_run: u32,
    plank_run: u32,
    plank_failed: bool,
    worst_hip: f32,
    worst_knee: f32,
}

impl RepWindow {
    fn new(a: &BodyAngles, t: i64) -> Self {
        Self {
            start_ms: t,
            min_elbow: a.elbow,
            bottom_run: 0,
            bottom_confirmed: false,
            ascending: false,
            max_since_ascent: a.elbow,
            top_run: 0,
            plank_run: 0,
            plank_failed: false,
            worst_hip: a.hip,
            worst_knee: a.knee,
        }
    }
}

#[derive(Debug, Clone)]
enum Phase {
    /// Waiting for straight arms before the first rep.
    AwaitLockout { run: u32 },
    /// Arms locked out, ready for the next rep.
    Top,
    /// Somewhere between leaving the top and getting back.
    InRep(RepWindow),
}

pub struct RepTracker {
    cfg: JudgeConfig,
    /// The lockout angle actually used (lowered for this player by calibration).
    lockout: f32,
    phase: Phase,
    attempts: u32,
}

impl RepTracker {
    pub fn new(cfg: JudgeConfig, calibrated_lockout: Option<f32>) -> Self {
        let lockout = match calibrated_lockout {
            // Judge against the player's own straight arm, a few degrees of slack,
            // but never stricter than the rulebook and never absurdly loose.
            Some(own) => (own - 5.0).min(cfg.lockout_min_elbow).max(140.0),
            None => cfg.lockout_min_elbow,
        };
        Self { cfg, lockout, phase: Phase::AwaitLockout { run: 0 }, attempts: 0 }
    }

    pub fn lockout_threshold(&self) -> f32 {
        self.lockout
    }

    pub fn attempts(&self) -> u32 {
        self.attempts
    }

    /// True while the player is mid-rep (used to say "push!" on screen).
    pub fn in_rep(&self) -> bool {
        matches!(self.phase, Phase::InRep(_))
    }

    /// Process one frame. Returns a verdict when a rep ends.
    pub fn update(&mut self, a: &BodyAngles, t_ms: i64) -> Option<RepVerdict> {
        let cfg = &self.cfg;
        let top_exit = self.lockout - cfg.top_exit_margin;
        match &mut self.phase {
            Phase::AwaitLockout { run } => {
                *run = if a.elbow >= self.lockout { *run + 1 } else { 0 };
                if *run >= cfg.confirm_frames {
                    self.phase = Phase::Top;
                }
                None
            }
            Phase::Top => {
                if a.elbow < top_exit {
                    self.phase = Phase::InRep(RepWindow::new(a, t_ms));
                }
                None
            }
            Phase::InRep(w) => {
                // Depth: lowest angle, and the bottom must hold for N frames.
                w.min_elbow = w.min_elbow.min(a.elbow);
                w.bottom_run = if a.elbow <= cfg.depth_max_elbow { w.bottom_run + 1 } else { 0 };
                if w.bottom_run >= cfg.confirm_frames {
                    w.bottom_confirmed = true;
                }

                // Plank: checked on every frame of the rep, not only top and bottom.
                let bad_plank = a.hip < cfg.plank_min_hip || a.knee < cfg.plank_min_knee;
                w.plank_run = if bad_plank { w.plank_run + 1 } else { 0 };
                if bad_plank {
                    w.worst_hip = w.worst_hip.min(a.hip);
                    w.worst_knee = w.worst_knee.min(a.knee);
                }
                if w.plank_run >= cfg.confirm_frames {
                    w.plank_failed = true;
                }

                // Pushing back up?
                if !w.ascending && a.elbow > w.min_elbow + cfg.ascent_margin {
                    w.ascending = true;
                    w.max_since_ascent = a.elbow;
                }
                if w.ascending {
                    w.max_since_ascent = w.max_since_ascent.max(a.elbow);
                }

                // Lockout reached and held: the rep is complete.
                w.top_run = if a.elbow >= self.lockout { w.top_run + 1 } else { 0 };
                if w.top_run >= cfg.confirm_frames {
                    let window = w.clone();
                    self.phase = Phase::Top;
                    if self.lockout - window.min_elbow < cfg.min_attempt_drop {
                        return None; // just a wobble at the top
                    }
                    return Some(self.verdict(&window, true, window.max_since_ascent, t_ms));
                }

                // Went back down without locking out: lockout fails, and the
                // movement continues as the next attempt.
                if w.ascending && a.elbow < w.max_since_ascent - cfg.redip_margin {
                    let window = w.clone();
                    self.phase = Phase::InRep(RepWindow::new(a, t_ms));
                    return Some(self.verdict(&window, false, window.max_since_ascent, t_ms));
                }
                None
            }
        }
    }

    fn verdict(&mut self, w: &RepWindow, locked_out: bool, top_angle: f32, end_ms: i64) -> RepVerdict {
        self.attempts += 1;
        let cfg = &self.cfg;
        let depth = Light {
            referee: Referee::Depth,
            pass: w.bottom_confirmed,
            measured: w.min_elbow,
            needed: cfg.depth_max_elbow,
        };
        let lockout = Light {
            referee: Referee::Lockout,
            pass: locked_out,
            measured: if locked_out { top_angle.max(self.lockout) } else { top_angle },
            needed: self.lockout,
        };
        // Report whichever plank angle was worst relative to its limit.
        let hip_gap = cfg.plank_min_hip - w.worst_hip;
        let knee_gap = cfg.plank_min_knee - w.worst_knee;
        let (plank_measured, plank_needed) =
            if hip_gap >= knee_gap { (w.worst_hip, cfg.plank_min_hip) } else { (w.worst_knee, cfg.plank_min_knee) };
        let plank = Light { referee: Referee::Plank, pass: !w.plank_failed, measured: plank_measured, needed: plank_needed };

        let mut reasons = Vec::new();
        if !depth.pass {
            reasons.push(format!("Depth: {:.0}°, needed {:.0}°", depth.measured, depth.needed));
        }
        if !lockout.pass {
            reasons.push(format!("Lockout: {:.0}°, needed {:.0}°", lockout.measured, lockout.needed));
        }
        if !plank.pass {
            let part = if hip_gap >= knee_gap { "hips" } else { "knees" };
            reasons.push(format!("Plank ({part}): {:.0}°, needed {:.0}°", plank.measured, plank.needed));
        }
        RepVerdict {
            attempt: self.attempts,
            clean: reasons.is_empty(),
            lights: [depth, lockout, plank],
            reasons,
            start_ms: w.start_ms,
            end_ms,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::judge::angles::Side;

    fn angles(elbow: f32, hip: f32) -> BodyAngles {
        BodyAngles { side: Side::Left, elbow, hip, knee: 175.0, visibility: 1.0 }
    }

    /// Runs a sequence of (elbow, hip) frames, each repeated `hold` times.
    fn run(tracker: &mut RepTracker, frames: &[(f32, f32)], hold: usize) -> Vec<RepVerdict> {
        let mut t = 0;
        let mut out = vec![];
        for &(e, h) in frames {
            for _ in 0..hold {
                t += 33;
                out.extend(tracker.update(&angles(e, h), t));
            }
        }
        out
    }

    #[test]
    fn clean_rep() {
        let mut tr = RepTracker::new(JudgeConfig::default(), None);
        let v = run(&mut tr, &[(170.0, 175.0), (120.0, 175.0), (80.0, 175.0), (130.0, 175.0), (170.0, 175.0)], 3);
        assert_eq!(v.len(), 1);
        assert!(v[0].clean, "{:?}", v[0].reasons);
    }

    #[test]
    fn shallow_rep_fails_depth() {
        let mut tr = RepTracker::new(JudgeConfig::default(), None);
        let v = run(&mut tr, &[(170.0, 175.0), (110.0, 175.0), (170.0, 175.0)], 3);
        assert_eq!(v.len(), 1);
        assert!(!v[0].lights[0].pass);
        assert!(v[0].reasons[0].starts_with("Depth: 110"));
    }

    #[test]
    fn single_frame_bottom_does_not_count() {
        let mut tr = RepTracker::new(JudgeConfig::default(), None);
        let v = run(&mut tr, &[(170.0, 175.0), (120.0, 175.0)], 3);
        assert!(v.is_empty());
        let v = run(&mut tr, &[(85.0, 175.0)], 1);
        assert!(v.is_empty());
        let v = run(&mut tr, &[(120.0, 175.0), (170.0, 175.0)], 3);
        assert!(!v[0].lights[0].pass, "bouncing through the bottom must not pass depth");
    }

    #[test]
    fn no_lockout_then_redip() {
        let mut tr = RepTracker::new(JudgeConfig::default(), None);
        let v = run(&mut tr, &[(170.0, 175.0), (80.0, 175.0), (140.0, 175.0), (100.0, 175.0)], 3);
        assert_eq!(v.len(), 1);
        assert!(!v[0].lights[1].pass);
        assert!(v[0].lights[0].pass);
    }

    #[test]
    fn sagging_hips_fail_plank() {
        let mut tr = RepTracker::new(JudgeConfig::default(), None);
        let v = run(&mut tr, &[(170.0, 175.0), (80.0, 145.0), (170.0, 175.0)], 3);
        assert_eq!(v.len(), 1);
        assert!(!v[0].lights[2].pass);
        assert!(v[0].lights[0].pass && v[0].lights[1].pass);
    }

    #[test]
    fn wobble_is_ignored() {
        let mut tr = RepTracker::new(JudgeConfig::default(), None);
        let v = run(&mut tr, &[(170.0, 175.0), (140.0, 175.0), (170.0, 175.0)], 3);
        assert!(v.is_empty());
    }

    #[test]
    fn calibration_lowers_lockout() {
        let tr = RepTracker::new(JudgeConfig::default(), Some(155.0));
        assert_eq!(tr.lockout_threshold(), 150.0);
        let tr = RepTracker::new(JudgeConfig::default(), Some(178.0));
        assert_eq!(tr.lockout_threshold(), 160.0);
    }
}
