//! The engine: one background thread that runs the whole live pipeline.
//!
//! ```text
//! PoseSource ──frame──▶ Session (angles → ready check → rep tracker → referees)
//!                           │
//!                           ├─▶ "tick" event every frame  (skeleton, angles, timer, count)
//!                           ├─▶ "rep" event per judged rep (lights + sounds)
//!                           └─▶ "round-finished" event      (results, saved to SQLite)
//! ```
//!
//! The UI never blocks the camera: Tauri commands just drop an
//! [`EngineCommand`] into a channel, and the thread picks it up between frames.

use crate::game::{RoundMode, RoundResult, Session, SessionSnapshot};
use crate::judge::{BodyAngles, JudgeConfig, RepVerdict};
use crate::leaderboard::Leaderboard;
use crate::pose::{open_source, Landmark, PoseSource, SourceSpec};
use base64::Engine as _;
use serde::Serialize;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Messages the commands send to the engine thread.
pub enum EngineCommand {
    SetSource(SourceSpec),
    StopSource,
    StartRound { mode: RoundMode, player: String, is_team: bool },
    CancelRound,
    SetConfig(JudgeConfig),
}

/// Sent to every window once per frame.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Tick {
    width: u32,
    height: u32,
    landmarks: Option<Vec<Landmark>>,
    angles: Option<BodyAngles>,
    fps: f32,
    /// `data:image/jpeg;base64,...`, at most ~15 times a second.
    preview: Option<String>,
    session: SessionSnapshot,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SourceStatus {
    running: bool,
    error: Option<String>,
}

const PREVIEW_INTERVAL: Duration = Duration::from_millis(66);
const BACKUP_INTERVAL: Duration = Duration::from_secs(60 * 60);

/// Starts the engine thread and returns the channel to talk to it.
pub fn spawn(app: AppHandle, db: Arc<Mutex<Leaderboard>>, config: JudgeConfig) -> Sender<EngineCommand> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::Builder::new()
        .name("pump-court-engine".into())
        .spawn(move || Engine::new(app, db, config).run(rx))
        .expect("failed to start engine thread");
    tx
}

struct Engine {
    app: AppHandle,
    db: Arc<Mutex<Leaderboard>>,
    config: JudgeConfig,
    source: Option<Box<dyn PoseSource>>,
    session: Session,
    fps: f32,
    last_frame_at: Option<Instant>,
    last_preview_at: Option<Instant>,
    last_backup_at: Instant,
}

impl Engine {
    fn new(app: AppHandle, db: Arc<Mutex<Leaderboard>>, config: JudgeConfig) -> Self {
        Self {
            app,
            db,
            session: Session::new(config.clone()),
            config,
            source: None,
            fps: 0.0,
            last_frame_at: None,
            last_preview_at: None,
            last_backup_at: Instant::now(),
        }
    }

    fn run(mut self, rx: Receiver<EngineCommand>) {
        loop {
            // 1. Handle any waiting commands. With no source, sleep until one arrives.
            if self.source.is_none() {
                match rx.recv_timeout(Duration::from_millis(200)) {
                    Ok(cmd) => self.handle(cmd),
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => return, // app is closing
                }
            }
            while let Ok(cmd) = rx.try_recv() {
                self.handle(cmd);
            }

            // 2. Process one frame.
            if let Some(source) = self.source.as_mut() {
                match source.next_frame() {
                    Ok(frame) => self.on_frame(frame),
                    Err(error) => {
                        self.source = None;
                        self.session.cancel();
                        self.emit("source-status", SourceStatus { running: false, error: Some(error) });
                    }
                }
            }

            // 3. Hourly backup.
            if self.last_backup_at.elapsed() >= BACKUP_INTERVAL {
                self.last_backup_at = Instant::now();
                let _ = self.db.lock().unwrap().export_backup();
            }
        }
    }

    fn handle(&mut self, cmd: EngineCommand) {
        match cmd {
            EngineCommand::SetSource(spec) => {
                self.session.cancel();
                self.fps = 0.0;
                self.last_frame_at = None;
                match open_source(&spec) {
                    Ok(source) => {
                        self.source = Some(source);
                        self.emit("source-status", SourceStatus { running: true, error: None });
                    }
                    Err(error) => {
                        self.source = None;
                        self.emit("source-status", SourceStatus { running: false, error: Some(error) });
                    }
                }
            }
            EngineCommand::StopSource => {
                self.source = None;
                self.session.cancel();
                self.emit("source-status", SourceStatus { running: false, error: None });
            }
            EngineCommand::StartRound { mode, player, is_team } => {
                self.session.start(mode, player, is_team, self.config.clone());
            }
            EngineCommand::CancelRound => self.session.cancel(),
            EngineCommand::SetConfig(cfg) => self.config = cfg,
        }
    }

    fn on_frame(&mut self, frame: crate::pose::PoseFrame) {
        // Measured frame rate (smoothed), used by the ready check.
        let now = Instant::now();
        if let Some(prev) = self.last_frame_at {
            let instant_fps = 1.0 / now.duration_since(prev).as_secs_f32().max(1e-3);
            self.fps = if self.fps == 0.0 { instant_fps } else { self.fps * 0.9 + instant_fps * 0.1 };
        }
        self.last_frame_at = Some(now);

        let outcome = self.session.update(&frame, self.fps);

        if let Some(verdict) = &outcome.verdict {
            self.emit::<RepVerdict>("rep", verdict.clone());
        }
        if let Some(result) = outcome.finished {
            let result = self.save(result);
            self.emit("round-finished", result);
        }

        let preview = frame.preview_jpeg.as_ref().filter(|_| {
            let due = self.last_preview_at.map_or(true, |t| t.elapsed() >= PREVIEW_INTERVAL);
            if due {
                self.last_preview_at = Some(now);
            }
            due
        });
        let tick = Tick {
            width: frame.width,
            height: frame.height,
            landmarks: frame.landmarks.clone(),
            angles: outcome.angles,
            fps: self.fps,
            preview: preview.map(|jpeg| {
                format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(jpeg))
            }),
            session: self.session.snapshot(),
        };
        self.emit("tick", tick);
    }

    /// Posts a valid, non-practice round to the leaderboard and fills in its rank.
    fn save(&self, mut result: RoundResult) -> RoundResult {
        let Some(category) = result.mode.category() else { return result };
        if result.voided.is_some() {
            return result;
        }
        let db = self.db.lock().unwrap();
        if let Ok(id) = db.save_run(category, &result) {
            result.run_id = Some(id);
            result.rank = db.rank_of(category, &result.player).ok().flatten();
        }
        result
    }

    fn emit<T: Serialize + Clone>(&self, event: &str, payload: T) {
        // Sends to every window: the operator screen and the crowd screen.
        let _ = self.app.emit(event, payload);
    }
}
