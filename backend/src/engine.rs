//! The engine: one background thread that runs the round clock.
//!
//! ```text
//! tracker (app window) ── set_ready / report_rep ──▶ Session
//!                                                     │
//!                         "tick" ~10× a second ◀──────┤  (timer, count, lights)
//!                         "rep" per judged rep  ◀─────┤
//!                         "round-finished"      ◀─────┘  (saved to SQLite first)
//! ```
//!
//! Events go to every window, so the operator screen and the crowd screen
//! always agree. Tauri commands only drop an [`EngineCommand`] into a channel;
//! nothing here ever waits on the UI.

use crate::game::{RepReport, RoundMode, RoundResult, Session};
use crate::leaderboard::Leaderboard;
use serde::Serialize;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Messages the commands send to the engine thread.
pub enum EngineCommand {
    StartRound { mode: RoundMode, player: String },
    CancelRound,
    /// The tracker's posture check (in the push-up position?) and whether its
    /// referee is partway through a rep.
    SetReady { ready: bool, in_rep: bool },
    ReportRep(RepReport),
}

const TICK_INTERVAL: Duration = Duration::from_millis(100);
const BACKUP_INTERVAL: Duration = Duration::from_secs(60 * 60);

/// Starts the engine thread and returns the channel to talk to it.
pub fn spawn(app: AppHandle, db: Arc<Mutex<Leaderboard>>) -> Sender<EngineCommand> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::Builder::new()
        .name("pump-court-engine".into())
        .spawn(move || Engine::new(app, db).run(rx))
        .expect("failed to start engine thread");
    tx
}

struct Engine {
    app: AppHandle,
    db: Arc<Mutex<Leaderboard>>,
    session: Session,
    clock: Instant,
    last_backup_at: Instant,
}

impl Engine {
    fn new(app: AppHandle, db: Arc<Mutex<Leaderboard>>) -> Self {
        Self { app, db, session: Session::new(), clock: Instant::now(), last_backup_at: Instant::now() }
    }

    fn now(&self) -> i64 {
        self.clock.elapsed().as_millis() as i64
    }

    fn run(mut self, rx: Receiver<EngineCommand>) {
        let mut next_tick = Instant::now();
        loop {
            let wait = next_tick.saturating_duration_since(Instant::now());
            match rx.recv_timeout(wait) {
                Ok(cmd) => {
                    self.handle(cmd);
                    continue;
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return, // the app is closing
            }
            next_tick = Instant::now() + TICK_INTERVAL;
            self.tick();
            if self.last_backup_at.elapsed() >= BACKUP_INTERVAL {
                self.last_backup_at = Instant::now();
                let _ = self.db.lock().unwrap().export_backup();
            }
        }
    }

    fn handle(&mut self, cmd: EngineCommand) {
        let now = self.now();
        match cmd {
            EngineCommand::StartRound { mode, player } => self.session.start(mode, player, now),
            EngineCommand::CancelRound => self.session.cancel(),
            EngineCommand::SetReady { ready, in_rep } => self.session.set_ready(ready, in_rep, now),
            EngineCommand::ReportRep(rep) => {
                if let Some(verdict) = self.session.report_rep(rep, now) {
                    self.emit("rep", verdict);
                }
            }
        }
        self.emit("tick", self.session.snapshot());
    }

    fn tick(&mut self) {
        if !self.session.is_active() {
            return;
        }
        let finished = self.session.tick(self.now());
        self.emit("tick", self.session.snapshot());
        if let Some(result) = finished {
            let result = self.save(result);
            self.emit("round-finished", result);
        }
    }

    /// Posts the round to the leaderboard and fills in its rank.
    fn save(&self, mut result: RoundResult) -> RoundResult {
        let db = self.db.lock().unwrap();
        if let Ok(id) = db.save_run(&result.player, result.mode, result.reps) {
            result.run_id = Some(id);
            result.rank = db.rank_of(Some(result.mode), &result.player).ok().flatten();
        }
        result
    }

    fn emit<T: Serialize + Clone>(&self, event: &str, payload: T) {
        // Sends to every window: the operator screen and the crowd screen.
        let _ = self.app.emit(event, payload);
    }
}
