//! One round from ready check to final buzzer.
//!
//! `Session::update` is called once per camera frame by the engine thread.
//! It moves through the phases and returns what happened on that frame.

use super::mode::{RoundMode, MAX_IDLE_MS};
use crate::judge::angles::{body_angles, Smoother};
use crate::judge::tracker::Referee;
use crate::judge::{BodyAngles, JudgeConfig, ReadyCheck, ReadyItem, RepTracker, RepVerdict};
use crate::pose::PoseFrame;
use serde::Serialize;

const COUNTDOWN_MS: i64 = 3_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RoundPhase {
    Idle,
    ReadyCheck,
    Countdown,
    Running,
    Finished,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoRepCounts {
    pub depth: u32,
    pub lockout: u32,
    pub plank: u32,
}

/// Final numbers for the results screen and the leaderboard.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundResult {
    pub mode: RoundMode,
    pub player: String,
    pub is_team: bool,
    pub clean_reps: u32,
    pub attempts: u32,
    /// Clean reps / attempts, 0..1. Breaks ties on the leaderboard.
    pub accuracy: f32,
    pub no_reps: NoRepCounts,
    /// When each clean rep finished, in ms from the start. Used by ghost races.
    pub rep_times_ms: Vec<i64>,
    pub duration_ms: i64,
    /// Set when the round did not count, e.g. tracking was lost.
    pub voided: Option<String>,
    /// Filled in by the engine after saving.
    pub run_id: Option<i64>,
    pub rank: Option<u32>,
}

/// Everything the UI needs to draw the round screen, sent every frame.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub phase: RoundPhase,
    pub mode: Option<RoundMode>,
    pub player: Option<String>,
    pub ready_items: Vec<ReadyItem>,
    pub countdown_ms: Option<i64>,
    pub elapsed_ms: i64,
    pub remaining_ms: Option<i64>,
    /// Max mode: time left before 5 s without a clean rep ends the round.
    pub idle_remaining_ms: Option<i64>,
    pub clean_reps: u32,
    pub attempts: u32,
    pub last_rep: Option<RepVerdict>,
    pub lockout_threshold: Option<f32>,
    pub tracking_ok: bool,
}

/// What happened on one frame.
pub struct FrameOutcome {
    pub angles: Option<BodyAngles>,
    pub verdict: Option<RepVerdict>,
    pub finished: Option<RoundResult>,
}

pub struct Session {
    cfg: JudgeConfig,
    phase: RoundPhase,
    /// Time the current phase began; set on its first frame.
    phase_start_ms: Option<i64>,
    mode: Option<RoundMode>,
    player: Option<String>,
    is_team: bool,
    ready: ReadyCheck,
    ready_items: Vec<ReadyItem>,
    calibrated: Option<f32>,
    tracker: RepTracker,
    smoother: Smoother,
    clean_reps: u32,
    no_reps: NoRepCounts,
    rep_times_ms: Vec<i64>,
    last_clean_ms: i64,
    last_rep: Option<RepVerdict>,
    last_tracked_ms: Option<i64>,
    tracking_ok: bool,
    now_ms: i64,
}

impl Session {
    pub fn new(cfg: JudgeConfig) -> Self {
        Self {
            ready: ReadyCheck::new(cfg.clone()),
            tracker: RepTracker::new(cfg.clone(), None),
            smoother: Smoother::new(cfg.smoothing_alpha),
            cfg,
            phase: RoundPhase::Idle,
            phase_start_ms: None,
            mode: None,
            player: None,
            is_team: false,
            ready_items: Vec::new(),
            calibrated: None,
            clean_reps: 0,
            no_reps: NoRepCounts::default(),
            rep_times_ms: Vec::new(),
            last_clean_ms: 0,
            last_rep: None,
            last_tracked_ms: None,
            tracking_ok: false,
            now_ms: 0,
        }
    }

    pub fn phase(&self) -> RoundPhase {
        self.phase
    }

    /// Start a new round. Practice goes straight to running.
    pub fn start(&mut self, mode: RoundMode, player: String, is_team: bool, cfg: JudgeConfig) {
        *self = Session::new(cfg);
        self.mode = Some(mode);
        self.player = Some(player);
        self.is_team = is_team;
        self.set_phase(if mode.is_practice() { RoundPhase::Running } else { RoundPhase::ReadyCheck });
    }

    /// Abandon the round without posting anything.
    pub fn cancel(&mut self) {
        let cfg = self.cfg.clone();
        *self = Session::new(cfg);
    }

    fn set_phase(&mut self, phase: RoundPhase) {
        self.phase = phase;
        self.phase_start_ms = None;
    }

    fn phase_elapsed(&mut self) -> i64 {
        let start = *self.phase_start_ms.get_or_insert(self.now_ms);
        self.now_ms - start
    }

    pub fn update(&mut self, frame: &PoseFrame, fps: f32) -> FrameOutcome {
        self.now_ms = frame.timestamp_ms;
        let lms = frame.landmarks.as_deref();
        let angles = lms.map(|l| self.smoother.smooth(body_angles(l, frame.width, frame.height)));
        self.tracking_ok = angles.map_or(false, |a| a.visibility >= self.cfg.min_visibility);
        if self.tracking_ok {
            self.last_tracked_ms = Some(self.now_ms);
        }
        let mut out = FrameOutcome { angles, verdict: None, finished: None };

        match self.phase {
            RoundPhase::Idle | RoundPhase::Finished => {}
            RoundPhase::ReadyCheck => {
                self.phase_elapsed();
                let status = self.ready.update(lms, frame.width, frame.height, fps, self.now_ms);
                self.ready_items = status.items;
                if let Some(cal) = status.calibrated_lockout {
                    self.calibrated = Some(cal);
                    self.set_phase(RoundPhase::Countdown);
                }
            }
            RoundPhase::Countdown => {
                if self.phase_elapsed() >= COUNTDOWN_MS {
                    self.tracker = RepTracker::new(self.cfg.clone(), self.calibrated);
                    self.smoother.reset();
                    self.set_phase(RoundPhase::Running);
                    self.phase_elapsed();
                    self.last_tracked_ms = Some(self.now_ms);
                }
            }
            RoundPhase::Running => {
                let elapsed = self.phase_elapsed();
                if self.tracking_ok {
                    if let Some(v) = self.tracker.update(angles.as_ref().unwrap(), self.now_ms) {
                        self.record(&v, elapsed);
                        out.verdict = Some(v);
                    }
                }
                out.finished = self.check_end(elapsed);
            }
        }
        out
    }

    fn record(&mut self, v: &RepVerdict, elapsed: i64) {
        if v.clean {
            self.clean_reps += 1;
            self.rep_times_ms.push(elapsed);
            self.last_clean_ms = elapsed;
        }
        for light in v.lights.iter().filter(|l| !l.pass) {
            match light.referee {
                Referee::Depth => self.no_reps.depth += 1,
                Referee::Lockout => self.no_reps.lockout += 1,
                Referee::Plank => self.no_reps.plank += 1,
            }
        }
        self.last_rep = Some(v.clone());
    }

    fn check_end(&mut self, elapsed: i64) -> Option<RoundResult> {
        let mode = self.mode?;
        let lost_for = self.now_ms - self.last_tracked_ms.unwrap_or(self.now_ms);
        let voided = (!mode.is_practice() && lost_for > self.cfg.tracking_loss_ms as i64)
            .then(|| "Tracking lost: stay in frame and try again".to_string());
        let time_up = mode.duration_ms().map_or(false, |d| elapsed >= d as i64);
        let max_idle = mode == RoundMode::Max && elapsed - self.last_clean_ms >= MAX_IDLE_MS as i64;
        if voided.is_none() && !time_up && !max_idle {
            return None;
        }
        self.set_phase(RoundPhase::Finished);
        Some(self.result(elapsed, voided))
    }

    fn result(&self, duration_ms: i64, voided: Option<String>) -> RoundResult {
        let attempts = self.tracker.attempts();
        RoundResult {
            mode: self.mode.unwrap_or(RoundMode::Practice),
            player: self.player.clone().unwrap_or_default(),
            is_team: self.is_team,
            clean_reps: self.clean_reps,
            attempts,
            accuracy: if attempts == 0 { 0.0 } else { self.clean_reps as f32 / attempts as f32 },
            no_reps: self.no_reps.clone(),
            rep_times_ms: self.rep_times_ms.clone(),
            duration_ms,
            voided,
            run_id: None,
            rank: None,
        }
    }

    pub fn snapshot(&self) -> SessionSnapshot {
        let elapsed = match (self.phase, self.phase_start_ms) {
            (RoundPhase::Running, Some(s)) => self.now_ms - s,
            _ => 0,
        };
        let running = self.phase == RoundPhase::Running;
        SessionSnapshot {
            phase: self.phase,
            mode: self.mode,
            player: self.player.clone(),
            ready_items: self.ready_items.clone(),
            countdown_ms: match (self.phase, self.phase_start_ms) {
                (RoundPhase::Countdown, Some(s)) => Some((COUNTDOWN_MS - (self.now_ms - s)).max(0)),
                (RoundPhase::Countdown, None) => Some(COUNTDOWN_MS),
                _ => None,
            },
            elapsed_ms: elapsed,
            remaining_ms: self
                .mode
                .and_then(|m| m.duration_ms())
                .filter(|_| running)
                .map(|d| (d as i64 - elapsed).max(0)),
            idle_remaining_ms: (running && self.mode == Some(RoundMode::Max))
                .then(|| (MAX_IDLE_MS as i64 - (elapsed - self.last_clean_ms)).max(0)),
            clean_reps: self.clean_reps,
            attempts: self.tracker.attempts(),
            last_rep: self.last_rep.clone(),
            lockout_threshold: running.then(|| self.tracker.lockout_threshold()),
            tracking_ok: self.tracking_ok,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pose::mock::MockSource;
    use crate::pose::PoseSource;

    /// Plays the mock athlete through a full Sprint, without the real-time
    /// sleeps, by rewriting timestamps.
    #[test]
    fn mock_sprint_round_counts_clean_reps() {
        let mut source = MockSource::new();
        let mut session = Session::new(JudgeConfig::default());
        session.start(RoundMode::Sprint, "Tester".into(), false, JudgeConfig::default());
        let mut result = None;
        let mut verdicts = vec![];
        for i in 0..2_000 {
            let mut frame = source.frame_at(i * 33);
            frame.timestamp_ms = i * 33;
            let out = session.update(&frame, 30.0);
            verdicts.extend(out.verdict);
            if let Some(r) = out.finished {
                result = Some(r);
                break;
            }
        }
        let result = result.expect("round should finish");
        assert!(result.voided.is_none());
        assert!(result.clean_reps >= 8, "clean reps: {}", result.clean_reps);
        assert!(result.no_reps.depth >= 1 && result.no_reps.lockout >= 1 && result.no_reps.plank >= 1,
            "{:?} / {:?}", result.no_reps, verdicts.iter().map(|v| &v.reasons).collect::<Vec<_>>());
    }

    #[test]
    fn losing_tracking_voids_the_round() {
        let mut source = MockSource::new();
        let mut session = Session::new(JudgeConfig::default());
        session.start(RoundMode::Sprint, "Tester".into(), false, JudgeConfig::default());
        let mut result = None;
        for i in 0..2_000 {
            let mut frame = source.frame_at(i * 33);
            if session.phase() == RoundPhase::Running && i % 200 > 150 {
                frame.landmarks = None; // the player walks out of frame
            }
            if let Some(r) = session.update(&frame, 30.0).finished {
                result = Some(r);
                break;
            }
        }
        assert!(result.unwrap().voided.is_some());
    }
}
