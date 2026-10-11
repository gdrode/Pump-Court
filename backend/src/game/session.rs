//! One round from "get in position" to the final buzzer.
//!
//! The referee itself runs in the app window (the motion tracker in
//! `pumpCourt/src/judge.ts`). It tells the session two things:
//! * whether the player is in the push-up position, and partway through a rep
//!   ([`Session::set_ready`]),
//! * each judged rep ([`Session::report_rep`]).
//!
//! The session owns the clock: countdown, round length, and failure (the
//! player gets up, gets stuck in a rep or stops; the window grows with fatigue,
//! see [`RoundMode::fail_window_ms`]).
//! [`Session::tick`] is called by the engine thread about ten times a second.
//! All times are milliseconds on one steady clock, passed in, so tests can
//! play a whole round instantly.

use super::mode::{RoundMode, OUT_OF_POSITION_MS};
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
    /// The push-up counts: Depth white plus one more (the referee in judge.ts decides).
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

/// Why a round ended. Same names as the tracker's `FinishReason` (game.ts).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FinishReason {
    /// The clock ran out.
    Time,
    /// No push-up within the failure window.
    Stopped,
    /// Stuck partway through a rep for the failure window (couldn't press up).
    Stuck,
    /// Out of the push-up position (stood up, knees down, walked off) for 2 s.
    Left,
    /// The operator stopped it (side-by-side Duel only).
    Ended,
}

/// How many red lights each referee gave in a round.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NoRepCounts {
    pub depth: u32,
    pub torso: u32,
    pub lockout: u32,
}

/// Perfect reps in a row that unlock the next streak tier.
pub const STREAK_EVERY: u32 = 5;

/// The multiplier for the next perfect rep after `run` perfect reps in a row,
/// in tenths: 10 (1x) under 5, then 12 (1.2x), +1 every 5 more, up to 15 (1.5x).
/// Same rules as `streakMultiplier` in pumpCourt/src/game.ts.
pub fn streak_tenths(run: u32) -> u32 {
    match run / STREAK_EVERY {
        0 => 10,
        tiers => (11 + tiers).min(15),
    }
}

/// Points for one rep, in tenths: perfect = 1 + multiplier (2, or 2.2–2.5 on a
/// streak), 2 white lights = 1, else 0.
pub fn rep_points_tenths(counted: bool, perfect: bool, run: u32) -> u32 {
    if perfect {
        10 + streak_tenths(run)
    } else {
        10 * u32::from(counted)
    }
}

/// Final numbers for the results screen. Only `player`, `mode`, `points` and
/// `reps` are stored on the leaderboard.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundResult {
    pub mode: RoundMode,
    pub player: String,
    /// The score, to one decimal: 1 per 2-light rep, 2 per 3-light rep, more
    /// on a streak (see [`rep_points_tenths`]).
    pub points: f64,
    /// Valid push-ups (counted: Depth plus one more white light).
    pub reps: u32,
    pub attempts: u32,
    pub perfect: u32,
    /// Longest run of perfect reps.
    pub best_streak: u32,
    pub no_reps: NoRepCounts,
    pub duration_ms: i64,
    /// Why the round ended.
    pub finish: FinishReason,
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
    /// Time left on the clock (none for Max).
    pub remaining_ms: Option<i64>,
    /// While running: time left before the player fails (stuck in a rep, or no
    /// push-up in time).
    pub fail_remaining_ms: Option<i64>,
    /// The score so far (see [`rep_points_tenths`]).
    pub points: f64,
    pub reps: u32,
    pub attempts: u32,
    pub perfect: u32,
    /// Perfect reps in a row right now.
    pub streak: u32,
    /// Multiplier for the next perfect rep (1 = no streak bonus).
    pub multiplier: f64,
    pub last_rep: Option<RepVerdict>,
}

pub struct Session {
    phase: RoundPhase,
    mode: Option<RoundMode>,
    player: Option<String>,
    in_position: bool,
    /// The tracker's referee is partway through a rep.
    in_rep: bool,
    /// When the current phase began.
    phase_start: i64,
    now: i64,
    /// The score in tenths of a point.
    points: u32,
    /// Perfect reps in a row.
    streak: u32,
    best_streak: u32,
    reps: u32,
    attempts: u32,
    perfect: u32,
    no_reps: NoRepCounts,
    /// Elapsed time of the last rep attempt (counted or not), or 0.
    last_rep_at: i64,
    /// Elapsed time the player left the push-up position, while out of it.
    out_since: Option<i64>,
    /// Elapsed time the player got stuck in a rep, while in one.
    stuck_since: Option<i64>,
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
            in_rep: false,
            phase_start: 0,
            now: 0,
            points: 0,
            streak: 0,
            best_streak: 0,
            reps: 0,
            attempts: 0,
            perfect: 0,
            no_reps: NoRepCounts::default(),
            last_rep_at: 0,
            out_since: None,
            stuck_since: None,
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

    /// The tracker's posture check, and whether its referee is partway through
    /// a rep. Holding the top of a push-up starts the countdown; once started
    /// it always runs to GO (a wobble never stops it).
    pub fn set_ready(&mut self, ready: bool, in_rep: bool, now: i64) {
        self.now = now.max(self.now);
        self.in_position = ready;
        self.in_rep = in_rep;
        match self.phase {
            RoundPhase::GetReady if ready => self.set_phase(RoundPhase::Countdown),
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
        self.last_rep_at = self.elapsed();
        self.stuck_since = None;
        if rep.counted {
            self.reps += 1;
        }
        if rep.perfect {
            self.perfect += 1;
        }
        self.points += rep_points_tenths(rep.counted, rep.perfect, self.streak);
        self.streak = if rep.perfect { self.streak + 1 } else { 0 };
        self.best_streak = self.best_streak.max(self.streak);
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
                self.last_rep_at = 0;
                None
            }
            RoundPhase::Running => {
                let mode = self.mode?;
                let elapsed = self.elapsed();
                let finish = self.check_finish(mode, elapsed)?;
                let duration_ms = mode.duration_ms().map_or(elapsed, |d| elapsed.min(d));
                self.set_phase(RoundPhase::Finished);
                Some(RoundResult {
                    mode,
                    player: self.player.clone().unwrap_or_default(),
                    points: f64::from(self.points) / 10.0,
                    reps: self.reps,
                    attempts: self.attempts,
                    perfect: self.perfect,
                    best_streak: self.best_streak,
                    no_reps: self.no_reps.clone(),
                    duration_ms,
                    finish,
                    run_id: None,
                    rank: None,
                })
            }
            _ => None,
        }
    }

    /// Whether the running round is over at `elapsed`, and why. Same order as
    /// game.ts: clock, then out of position, stuck, stopped.
    fn check_finish(&mut self, mode: RoundMode, elapsed: i64) -> Option<FinishReason> {
        if mode.duration_ms().is_some_and(|d| elapsed >= d) {
            return Some(FinishReason::Time);
        }
        self.out_since = if self.in_position { None } else { Some(self.out_since.unwrap_or(elapsed)) };
        self.stuck_since =
            if self.in_position && self.in_rep { Some(self.stuck_since.unwrap_or(elapsed)) } else { None };
        let window = mode.fail_window_ms(self.attempts);
        if self.out_since.is_some_and(|t| elapsed - t >= OUT_OF_POSITION_MS) {
            Some(FinishReason::Left)
        } else if self.stuck_since.is_some_and(|t| elapsed - t >= window) {
            Some(FinishReason::Stuck)
        } else if self.in_position && !self.in_rep && elapsed - self.last_rep_at >= window {
            Some(FinishReason::Stopped)
        } else {
            None
        }
    }

    /// ms left before the player fails (stuck, or no push-up in time), while running.
    fn fail_remaining(&self, elapsed: i64) -> Option<i64> {
        let mode = self.mode?;
        let since = if self.in_rep { self.stuck_since? } else { self.last_rep_at };
        Some((mode.fail_window_ms(self.attempts) - (elapsed - since)).max(0))
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
            remaining_ms: self.mode.filter(|_| running).and_then(|m| m.duration_ms()).map(|d| (d - elapsed).max(0)),
            fail_remaining_ms: if running { self.fail_remaining(elapsed) } else { None },
            points: f64::from(self.points) / 10.0,
            reps: self.reps,
            attempts: self.attempts,
            perfect: self.perfect,
            streak: self.streak,
            multiplier: f64::from(streak_tenths(self.streak)) / 10.0,
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
        s.set_ready(true, false, 2_000);
        assert_eq!(s.phase(), RoundPhase::Countdown);
        assert!(s.tick(4_000).is_none());
        assert!(s.tick(5_000).is_none());
        assert_eq!(s.phase(), RoundPhase::Running);
        5_000
    }

    /// Good push-ups every `every` ms from `from` up to (not including) `to`, ticking as it goes.
    fn keep_going(s: &mut Session, from: i64, to: i64, every: i64) {
        let mut t = from;
        while t < to {
            assert!(s.tick(t).is_none(), "still going at {t}");
            s.report_rep(rep(true, true, true), t);
            t += every;
        }
    }

    #[test]
    fn sprint_counts_valid_pushups_and_ends_on_time() {
        let mut s = Session::new();
        let t0 = running(&mut s, RoundMode::Sprint);
        assert!(s.report_rep(rep(true, true, true), t0 + 1_000).unwrap().perfect);
        assert!(s.report_rep(rep(false, true, true), t0 + 2_000).unwrap().counted, "2 of 3 counts");
        assert!(!s.report_rep(rep(false, false, true), t0 + 3_000).unwrap().counted);
        keep_going(&mut s, t0 + 6_000, t0 + 30_000, 3_000);
        let r = s.tick(t0 + 30_100).expect("time up");
        assert_eq!((r.reps, r.attempts, r.perfect), (10, 11, 9));
        // 1 perfect (2), 1 two-light (1), a no-rep, then 8 perfect in a row: 5 × 2 + 3 × 2.2.
        assert_eq!(r.points, 19.6);
        assert_eq!(r.best_streak, 8);
        assert_eq!((r.no_reps.depth, r.no_reps.torso, r.no_reps.lockout), (2, 1, 0));
        assert_eq!((r.duration_ms, r.finish), (30_000, FinishReason::Time));
        assert!(s.tick(t0 + 31_000).is_none(), "the result comes once");
        assert!(s.report_rep(rep(true, true, true), t0 + 31_000).is_none(), "no reps after the buzzer");
    }

    #[test]
    fn perfect_streaks_raise_the_multiplier_up_to_1_5x_and_break_on_a_lesser_rep() {
        assert_eq!([0, 4, 5, 9, 10, 15, 20, 50].map(streak_tenths), [10, 10, 12, 12, 13, 14, 15, 15]);
        let mut s = Session::new();
        let t0 = running(&mut s, RoundMode::Max);
        let mut t = t0;
        let mut perfect = |s: &mut Session, n: u32| {
            for _ in 0..n {
                t += 500;
                s.report_rep(rep(true, true, true), t);
            }
            t
        };
        perfect(&mut s, 5);
        assert_eq!((s.snapshot().points, s.snapshot().multiplier), (10.0, 1.2));
        perfect(&mut s, 1);
        assert_eq!(s.snapshot().points, 12.2, "the 6th perfect rep scores 2.2");
        let t = perfect(&mut s, 14);
        assert_eq!((s.snapshot().streak, s.snapshot().multiplier), (20, 1.5));
        s.report_rep(rep(false, true, true), t + 500);
        let snap = s.snapshot();
        assert_eq!((snap.streak, snap.multiplier), (0, 1.0), "2 lights break the streak");
    }

    #[test]
    fn reps_before_the_clock_starts_do_not_count() {
        let mut s = Session::new();
        s.start(RoundMode::Sprint, "Ana".into(), 0);
        assert!(s.report_rep(rep(true, true, true), 100).is_none());
        s.set_ready(true, false, 200);
        assert!(s.report_rep(rep(true, true, true), 300).is_none(), "not during the countdown");
        assert_eq!(s.snapshot().reps, 0);
    }

    #[test]
    fn once_started_the_countdown_never_stops() {
        let mut s = Session::new();
        s.start(RoundMode::Sprint, "Ana".into(), 0);
        s.set_ready(true, false, 1_000);
        s.tick(2_500);
        s.set_ready(false, false, 2_600);
        assert_eq!(s.phase(), RoundPhase::Countdown, "a wobble doesn't stop it");
        assert!(s.tick(3_900).is_none());
        assert_eq!(s.phase(), RoundPhase::Countdown);
        s.tick(4_000);
        assert_eq!(s.phase(), RoundPhase::Running, "GO 3 s after it started");
    }

    #[test]
    fn getting_up_for_two_seconds_ends_the_round() {
        let mut s = Session::new();
        let t0 = running(&mut s, RoundMode::Minute);
        s.report_rep(rep(true, true, true), t0 + 1_000);
        s.set_ready(false, false, t0 + 1_500);
        assert!(s.tick(t0 + 1_500).is_none());
        assert!(s.tick(t0 + 3_400).is_none(), "a short wobble is fine");
        let r = s.tick(t0 + 3_500).expect("out of position for 2 s");
        assert_eq!((r.finish, r.reps), (FinishReason::Left, 1));
    }

    #[test]
    fn stopping_ends_the_round_after_the_failure_window() {
        let mut s = Session::new();
        let t0 = running(&mut s, RoundMode::Sprint);
        s.report_rep(rep(true, true, true), t0 + 1_000);
        s.report_rep(rep(false, false, true), t0 + 2_000); // a no-rep resets the window too
        // 2 reps attempted: 4 s + 2 × 0.25 s = 4.5 s.
        assert!(s.tick(t0 + 6_400).is_none());
        assert_eq!(s.snapshot().fail_remaining_ms, Some(100));
        let r = s.tick(t0 + 6_500).expect("stopped");
        assert_eq!((r.finish, r.reps, r.duration_ms), (FinishReason::Stopped, 1, 6_500));
    }

    #[test]
    fn getting_stuck_in_a_rep_ends_the_round() {
        let mut s = Session::new();
        let t0 = running(&mut s, RoundMode::Max);
        s.set_ready(true, true, t0 + 1_000);
        assert!(s.tick(t0 + 1_000).is_none());
        assert!(s.tick(t0 + 4_900).is_none());
        let r = s.tick(t0 + 5_000).expect("stuck for 4 s");
        assert_eq!(r.finish, FinishReason::Stuck);
    }

    #[test]
    fn the_failure_window_grows_with_fatigue_up_to_the_cap() {
        assert_eq!(RoundMode::Max.fail_window_ms(0), 4_000);
        assert_eq!(RoundMode::Max.fail_window_ms(8), 6_000);
        assert_eq!(RoundMode::Max.fail_window_ms(100), 10_000);
        assert_eq!(RoundMode::Minute.fail_window_ms(100), 8_000);
        assert_eq!(RoundMode::Sprint.fail_window_ms(100), 6_000);
        assert_eq!(RoundMode::Duel.fail_window_ms(100), 6_000);
    }

    #[test]
    fn max_has_no_time_limit() {
        let mut s = Session::new();
        let t0 = running(&mut s, RoundMode::Max);
        keep_going(&mut s, t0 + 1_000, t0 + 400_000, 3_000);
        assert_eq!(s.phase(), RoundPhase::Running, "still going after 6+ minutes");
        assert_eq!(s.snapshot().remaining_ms, None);
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
        keep_going(&mut s, t0 + 100, t0 + 30_000, 2_000);
        s.tick(t0 + 30_000).unwrap();
        s.start(RoundMode::Duel, "Ben".into(), t0 + 40_000);
        let snap = s.snapshot();
        assert_eq!((snap.phase, snap.reps, snap.player.as_deref()), (RoundPhase::GetReady, 0, Some("Ben")));
    }
}
