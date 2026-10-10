//! One round from "get in position" to the final buzzer.
//!
//! The referee itself runs in the app window (the motion tracker in
//! `pumpCourt/src/judge.ts`). It tells the session two things:
//! * whether the player is in the push-up position ([`Session::set_ready`]),
//! * each judged rep ([`Session::report_rep`]).
//!
//! The session owns the clock: countdown, round length, Max mode's idle limit.
//! [`Session::tick`] is called by the engine thread about ten times a second.
//! All times are milliseconds on one steady clock, passed in, so tests can
//! play a whole round instantly.

use super::mode::{RoundMode, MAX_IDLE_MS};
use serde::{Deserialize, Serialize};

pub const COUNTDOWN_MS: i64 = 3_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RoundPhase {
    Idle,
    /// Waiting for the player to hold the top of a push-up.
    GetReady,
    Countdown,
    Running,
    Finished,
}

/// The three referee lights for one rep: `true` = white (good).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Lights {
    pub depth: bool,
    pub torso: bool,
    pub lockout: bool,
}

/// One rep as the tracker judged it.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepReport {
    /// At least 2 of 3 white lights: the push-up counts.
    pub counted: bool,
    /// All 3 white lights.
    pub perfect: bool,
    pub lights: Lights,
    /// Why each red light was given, in plain words.
    #[serde(default)]
    pub faults: Vec<String>,
}

/// A rep after the session numbered it. Sent to every window as "rep".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepVerdict {
    /// 1 for the first attempt of the round.
    pub attempt: u32,
    pub counted: bool,
    pub perfect: bool,
    pub lights: Lights,
    pub faults: Vec<String>,
}

/// How many red lights each referee gave in a round.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NoRepCounts {
    pub depth: u32,
    pub torso: u32,
    pub lockout: u32,
}

/// Final numbers for the results screen. Only `player`, `mode` and `reps`
/// are stored on the leaderboard.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundResult {
    pub mode: RoundMode,
    pub player: String,
    /// Valid push-ups: the score.
    pub reps: u32,
    pub attempts: u32,
    pub perfect: u32,
    pub no_reps: NoRepCounts,
    pub duration_ms: i64,
    /// Filled in by the engine after saving.
    pub run_id: Option<i64>,
    pub rank: Option<u32>,
}

/// Everything the windows need to draw a round. Sent as "tick".
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub phase: RoundPhase,
    pub mode: Option<RoundMode>,
    pub player: Option<String>,
    /// The tracker last said the player is in the push-up position.
    pub in_position: bool,
    pub countdown_ms: Option<i64>,
    pub elapsed_ms: i64,
    /// Time left on the clock (for Max: before the 3 minute cap).
    pub remaining_ms: Option<i64>,
    /// Max mode: time left to get the next valid push-up.
    pub idle_remaining_ms: Option<i64>,
    pub reps: u32,
    pub attempts: u32,
    pub perfect: u32,
    pub last_rep: Option<RepVerdict>,
}

pub struct Session {
    phase: RoundPhase,
    mode: Option<RoundMode>,
    player: Option<String>,
    in_position: bool,
    /// When the current phase began.
    phase_start: i64,
    now: i64,
    reps: u32,
    attempts: u32,
    perfect: u32,
    no_reps: NoRepCounts,
    /// Elapsed time of the last valid push-up (Max mode's idle limit).
    last_valid_at: i64,
    last_rep: Option<RepVerdict>,
}

impl Default for Session {
    fn default() -> Self {
        Self::new()
    }
}

impl Session {
    pub fn new() -> Self {
        Self {
            phase: RoundPhase::Idle,
            mode: None,
            player: None,
            in_position: false,
            phase_start: 0,
            now: 0,
            reps: 0,
            attempts: 0,
            perfect: 0,
            no_reps: NoRepCounts::default(),
            last_valid_at: 0,
            last_rep: None,
        }
    }

    pub fn phase(&self) -> RoundPhase {
        self.phase
    }

    /// A round is on (from "get ready" to the last second).
    pub fn is_active(&self) -> bool {
        matches!(self.phase, RoundPhase::GetReady | RoundPhase::Countdown | RoundPhase::Running)
    }

    /// Starts a new round, beginning with "get in position".
    pub fn start(&mut self, mode: RoundMode, player: String, now: i64) {
        *self = Session::new();
        self.mode = Some(mode);
        self.player = Some(player);
        self.now = now;
        self.set_phase(RoundPhase::GetReady);
    }

    /// Abandons the round without posting anything.
    pub fn cancel(&mut self) {
        *self = Session::new();
    }

    fn set_phase(&mut self, phase: RoundPhase) {
        self.phase = phase;
        self.phase_start = self.now;
    }

    fn elapsed(&self) -> i64 {
        self.now - self.phase_start
    }

    /// The tracker's posture check. Holding the top of a push-up starts the
    /// countdown; leaving the position during the countdown stops it.
    pub fn set_ready(&mut self, ready: bool, now: i64) {
        self.now = now.max(self.now);
        self.in_position = ready;
        match self.phase {
            RoundPhase::GetReady if ready => self.set_phase(RoundPhase::Countdown),
            RoundPhase::Countdown if !ready => self.set_phase(RoundPhase::GetReady),
            _ => {}
        }
    }

    /// A rep the tracker judged. Only counts while the clock runs.
    pub fn report_rep(&mut self, rep: RepReport, now: i64) -> Option<RepVerdict> {
        self.now = now.max(self.now);
        if self.phase != RoundPhase::Running {
            return None;
        }
        self.attempts += 1;
        if rep.counted {
            self.reps += 1;
            self.last_valid_at = self.elapsed();
        }
        if rep.perfect {
            self.perfect += 1;
        }
        self.no_reps.depth += u32::from(!rep.lights.depth);
        self.no_reps.torso += u32::from(!rep.lights.torso);
        self.no_reps.lockout += u32::from(!rep.lights.lockout);
        let verdict = RepVerdict {
            attempt: self.attempts,
            counted: rep.counted,
            perfect: rep.perfect,
            lights: rep.lights,
            faults: rep.faults,
        };
        self.last_rep = Some(verdict.clone());
        Some(verdict)
    }

    /// Moves the clock on. Returns the result once, when the round ends.
    pub fn tick(&mut self, now: i64) -> Option<RoundResult> {
        self.now = now.max(self.now);
        match self.phase {
            RoundPhase::Countdown if self.elapsed() >= COUNTDOWN_MS => {
                self.set_phase(RoundPhase::Running);
                self.last_valid_at = 0;
                None
            }
            RoundPhase::Running => {
                let mode = self.mode?;
                let elapsed = self.elapsed();
                let time_up = elapsed >= mode.duration_ms();
                let idle = mode == RoundMode::Max && elapsed - self.last_valid_at >= MAX_IDLE_MS;
                if !time_up && !idle {
                    return None;
                }
                let duration_ms = elapsed.min(mode.duration_ms());
                self.set_phase(RoundPhase::Finished);
                Some(RoundResult {
                    mode,
                    player: self.player.clone().unwrap_or_default(),
                    reps: self.reps,
                    attempts: self.attempts,
                    perfect: self.perfect,
                    no_reps: self.no_reps.clone(),
                    duration_ms,
                    run_id: None,
                    rank: None,
                })
            }
            _ => None,
        }
    }

    pub fn snapshot(&self) -> SessionSnapshot {
        let running = self.phase == RoundPhase::Running;
        let elapsed = if running { self.elapsed() } else { 0 };
        SessionSnapshot {
            phase: self.phase,
            mode: self.mode,
            player: self.player.clone(),
            in_position: self.in_position,
            countdown_ms: (self.phase == RoundPhase::Countdown).then(|| (COUNTDOWN_MS - self.elapsed()).max(0)),
            elapsed_ms: elapsed,
            remaining_ms: self.mode.filter(|_| running).map(|m| (m.duration_ms() - elapsed).max(0)),
            idle_remaining_ms: (running && self.mode == Some(RoundMode::Max))
                .then(|| (MAX_IDLE_MS - (elapsed - self.last_valid_at)).max(0)),
            reps: self.reps,
            attempts: self.attempts,
            perfect: self.perfect,
            last_rep: self.last_rep.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rep(depth: bool, torso: bool, lockout: bool) -> RepReport {
        let whites = [depth, torso, lockout].iter().filter(|&&w| w).count();
        RepReport { counted: whites >= 2, perfect: whites == 3, lights: Lights { depth, torso, lockout }, faults: vec![] }
    }

    /// Starts a round and gets it to the running clock. Returns the time it started.
    fn running(s: &mut Session, mode: RoundMode) -> i64 {
        s.start(mode, "Ana".into(), 0);
        assert!(s.tick(1_000).is_none());
        assert_eq!(s.phase(), RoundPhase::GetReady, "waits for the player");
        s.set_ready(true, 2_000);
        assert_eq!(s.phase(), RoundPhase::Countdown);
        assert!(s.tick(4_000).is_none());
        assert!(s.tick(5_000).is_none());
        assert_eq!(s.phase(), RoundPhase::Running);
        5_000
    }

    #[test]
    fn sprint_counts_valid_pushups_and_ends_on_time() {
        let mut s = Session::new();
        let t0 = running(&mut s, RoundMode::Sprint);
        assert!(s.report_rep(rep(true, true, true), t0 + 1_000).unwrap().perfect);
        assert!(s.report_rep(rep(false, true, true), t0 + 2_000).unwrap().counted, "2 of 3 counts");
        assert!(!s.report_rep(rep(false, false, true), t0 + 3_000).unwrap().counted);
        assert!(s.tick(t0 + 29_000).is_none());
        let r = s.tick(t0 + 30_100).expect("time up");
        assert_eq!((r.reps, r.attempts, r.perfect), (2, 3, 1));
        assert_eq!((r.no_reps.depth, r.no_reps.torso, r.no_reps.lockout), (2, 1, 0));
        assert_eq!(r.duration_ms, 30_000);
        assert!(s.tick(t0 + 31_000).is_none(), "the result comes once");
        assert!(s.report_rep(rep(true, true, true), t0 + 31_000).is_none(), "no reps after the buzzer");
    }

    #[test]
    fn reps_before_the_clock_starts_do_not_count() {
        let mut s = Session::new();
        s.start(RoundMode::Sprint, "Ana".into(), 0);
        assert!(s.report_rep(rep(true, true, true), 100).is_none());
        s.set_ready(true, 200);
        assert!(s.report_rep(rep(true, true, true), 300).is_none(), "not during the countdown");
        assert_eq!(s.snapshot().reps, 0);
    }

    #[test]
    fn leaving_position_during_the_countdown_stops_it() {
        let mut s = Session::new();
        s.start(RoundMode::Sprint, "Ana".into(), 0);
        s.set_ready(true, 1_000);
        s.tick(2_500);
        s.set_ready(false, 2_600);
        assert_eq!(s.phase(), RoundPhase::GetReady, "back to get ready");
        s.set_ready(true, 3_000);
        assert!(s.tick(5_500).is_none());
        assert_eq!(s.phase(), RoundPhase::Countdown, "the countdown starts again from 3");
        s.tick(6_000);
        assert_eq!(s.phase(), RoundPhase::Running);
        s.set_ready(false, 7_000);
        assert_eq!(s.phase(), RoundPhase::Running, "the clock keeps going once started");
    }

    #[test]
    fn max_ends_after_five_seconds_without_a_valid_pushup() {
        let mut s = Session::new();
        let t0 = running(&mut s, RoundMode::Max);
        s.report_rep(rep(true, true, true), t0 + 4_000);
        s.report_rep(rep(false, false, true), t0 + 8_000); // a no-rep does not reset the limit
        assert!(s.tick(t0 + 8_900).is_none());
        assert_eq!(s.snapshot().idle_remaining_ms, Some(100));
        let r = s.tick(t0 + 9_000).expect("idle limit");
        assert_eq!(r.reps, 1);
    }

    #[test]
    fn cancel_goes_back_to_idle() {
        let mut s = Session::new();
        running(&mut s, RoundMode::Minute);
        s.cancel();
        assert_eq!(s.phase(), RoundPhase::Idle);
        assert!(!s.is_active());
        assert!(s.tick(100_000).is_none());
    }

    #[test]
    fn a_new_round_starts_clean_after_a_finished_one() {
        let mut s = Session::new();
        let t0 = running(&mut s, RoundMode::Duel);
        s.report_rep(rep(true, true, true), t0 + 100);
        s.tick(t0 + 30_000).unwrap();
        s.start(RoundMode::Duel, "Ben".into(), t0 + 40_000);
        let snap = s.snapshot();
        assert_eq!((snap.phase, snap.reps, snap.player.as_deref()), (RoundPhase::GetReady, 0, Some("Ben")));
    }
}
