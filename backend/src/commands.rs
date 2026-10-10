//! Functions the React frontend can call with `invoke("name", { args })`.
//!
//! Each `#[tauri::command]` becomes callable from TypeScript. Arguments
//! arrive as JSON and are converted with serde; camelCase in TypeScript
//! maps to snake_case here automatically.

use crate::engine::EngineCommand;
use crate::game::{Category, RoundMode};
use crate::judge::JudgeConfig;
use crate::leaderboard::{self, Leaderboard, LeaderboardRow};
use crate::pose::{self, SourceInfo, SourceSpec};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

/// Shared state handed to every command by Tauri.
pub struct AppState {
    pub engine: Mutex<Sender<EngineCommand>>,
    pub db: Arc<Mutex<Leaderboard>>,
    pub config: Mutex<JudgeConfig>,
}

impl AppState {
    fn send(&self, cmd: EngineCommand) -> Result<(), String> {
        self.engine.lock().unwrap().send(cmd).map_err(|_| "engine stopped".to_string())
    }
}

/// Commands return `Result<T, String>`: an `Err` becomes a rejected promise in JS.
type CmdResult<T> = Result<T, String>;

#[tauri::command]
pub fn list_sources() -> Vec<SourceInfo> {
    pose::list_sources()
}

#[tauri::command]
pub fn start_source(state: State<AppState>, spec: SourceSpec) -> CmdResult<()> {
    state.send(EngineCommand::SetSource(spec))
}

#[tauri::command]
pub fn stop_source(state: State<AppState>) -> CmdResult<()> {
    state.send(EngineCommand::StopSource)
}

/// Checks a name before the round (same rules the round uses).
#[tauri::command]
pub fn check_name(name: String) -> CmdResult<String> {
    leaderboard::validate_name(&name)
}

#[tauri::command]
pub fn start_round(state: State<AppState>, mode: RoundMode, player: String, is_team: bool) -> CmdResult<()> {
    let player = leaderboard::validate_name(&player)?;
    state.send(EngineCommand::StartRound { mode, player, is_team })
}

#[tauri::command]
pub fn cancel_round(state: State<AppState>) -> CmdResult<()> {
    state.send(EngineCommand::CancelRound)
}

#[tauri::command]
pub fn get_judge_config(state: State<AppState>) -> JudgeConfig {
    state.config.lock().unwrap().clone()
}

/// Change thresholds live, e.g. while tuning on recorded clips.
/// Takes effect from the next round.
#[tauri::command]
pub fn set_judge_config(state: State<AppState>, config: JudgeConfig) -> CmdResult<()> {
    *state.config.lock().unwrap() = config.clone();
    state.send(EngineCommand::SetConfig(config))
}

#[tauri::command]
pub fn get_leaderboard(state: State<AppState>, category: Category, include_team: bool, limit: u32) -> CmdResult<Vec<LeaderboardRow>> {
    state.db.lock().unwrap().top(category, include_team, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_player_count(state: State<AppState>) -> CmdResult<u32> {
    state.db.lock().unwrap().player_count().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_run(state: State<AppState>, run_id: i64) -> CmdResult<()> {
    state.db.lock().unwrap().delete_run(run_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_backup(state: State<AppState>) -> CmdResult<String> {
    state.db.lock().unwrap().export_backup().map(|p| p.display().to_string())
}

/// Opens the crowd-facing screen as a second window (drag it to the
/// external monitor). It loads the same frontend at `#/crowd`.
#[tauri::command]
pub fn open_crowd_window(app: AppHandle) -> CmdResult<()> {
    if let Some(win) = app.get_webview_window("crowd") {
        return win.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(&app, "crowd", WebviewUrl::App("index.html#/crowd".into()))
        .title("Pump Court — Crowd")
        .inner_size(1280.0, 720.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
