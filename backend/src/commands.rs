//! Functions the React frontend can call with `invoke("name", { args })`.
//!
//! Each `#[tauri::command]` becomes callable from TypeScript. Arguments
//! arrive as JSON and are converted with serde; camelCase in TypeScript
//! maps to snake_case here automatically.

use crate::engine::EngineCommand;
use crate::game::{RepReport, RoundMode, RoundResult};
use crate::leaderboard::{self, Leaderboard, LeaderboardRow};
use crate::phone::net::{self, LanInfo};
use crate::phone::server::ServerStatus;
use crate::phone::tunnel::{Tunnel, TunnelStatus};
use crate::phone::{HostLink, PhoneHub, PORT};
use serde_json::Value;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

/// Shared state handed to every command by Tauri.
pub struct AppState {
    pub engine: Mutex<Sender<EngineCommand>>,
    pub db: Arc<Mutex<Leaderboard>>,
    pub phone: Arc<PhoneHub>,
    pub phone_server: Arc<ServerStatus>,
    pub tunnel: Tunnel,
}

impl AppState {
    fn send(&self, cmd: EngineCommand) -> Result<(), String> {
        self.engine.lock().unwrap().send(cmd).map_err(|_| "engine stopped".to_string())
    }
}

/// Commands return `Result<T, String>`: an `Err` becomes a rejected promise in JS.
type CmdResult<T> = Result<T, String>;

// --- Rounds -------------------------------------------------------------------

/// Checks a name before the round (same rules the round uses).
#[tauri::command]
pub fn check_name(name: String) -> CmdResult<String> {
    leaderboard::validate_name(&name)
}

/// Starts a round. It waits for the tracker to say the player is in position.
#[tauri::command]
pub fn start_round(state: State<AppState>, mode: RoundMode, player: String) -> CmdResult<()> {
    let player = leaderboard::validate_name(&player)?;
    state.send(EngineCommand::StartRound { mode, player })
}

#[tauri::command]
pub fn cancel_round(state: State<AppState>) -> CmdResult<()> {
    state.send(EngineCommand::CancelRound)
}

/// The tracker's posture check changed (the player is, or isn't, in the
/// push-up position), or its referee started or finished a rep.
#[tauri::command]
pub fn set_ready(state: State<AppState>, ready: bool, in_rep: Option<bool>) -> CmdResult<()> {
    state.send(EngineCommand::SetReady { ready, in_rep: in_rep.unwrap_or(false) })
}

/// The tracker judged a rep.
#[tauri::command]
pub fn report_rep(state: State<AppState>, rep: RepReport) -> CmdResult<()> {
    state.send(EngineCommand::ReportRep(rep))
}

/// Posts a finished round to the leaderboard and tells every window
/// ("round-posted"). Rounds are never saved by themselves: this runs when the
/// operator presses Post, or the player taps "Post my score" on their phone.
#[tauri::command]
pub fn save_round(app: AppHandle, state: State<AppState>, round: leaderboard::FinishedRound) -> CmdResult<RoundResult> {
    let result = leaderboard::save_finished(&state.db.lock().unwrap(), round)?;
    let _ = app.emit("round-posted", result.clone());
    Ok(result)
}

// --- Leaderboard ----------------------------------------------------------------

/// Each player's best round. `mode: null` = every mode (the all-time board).
#[tauri::command]
pub fn get_leaderboard(state: State<AppState>, mode: Option<RoundMode>, limit: u32) -> CmdResult<Vec<LeaderboardRow>> {
    state.db.lock().unwrap().top(mode, limit).map_err(|e| e.to_string())
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
/// external monitor). It loads the same frontend; the window's label tells
/// it to show the crowd screen.
///
/// Must be `async`: on Windows, building a window inside a plain (sync)
/// command deadlocks the app, which froze every button and left the crowd
/// window blank.
#[tauri::command]
pub async fn open_crowd_window(app: AppHandle) -> CmdResult<()> {
    if let Some(win) = app.get_webview_window("crowd") {
        return win.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(&app, "crowd", WebviewUrl::App("index.html".into()))
        .title("Pump Court — Crowd")
        .inner_size(1280.0, 720.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// --- Phone cameras ----------------------------------------------------------------

/// Opens a pairing room for a phone and returns its code. Messages
/// (`joined`, `peer-joined`, `peer-left`, `signal`, `phone-visit`) arrive on
/// `events`; relayed JPEG frames (internet link) on `frames`.
#[tauri::command]
pub fn phone_open(state: State<AppState>, events: Channel<Value>, frames: Channel<InvokeResponseBody>) -> String {
    state.phone.open_room(HostLink {
        events: Box::new(move |msg| {
            let _ = events.send(msg);
        }),
        frames: Box::new(move |jpeg| {
            let _ = frames.send(InvokeResponseBody::Raw(jpeg));
        }),
    })
}

/// The app window's WebRTC answer or ICE candidate, for the phone.
#[tauri::command]
pub fn phone_signal(state: State<AppState>, room: String, data: Value) {
    state.phone.host_signal(&room, data);
}

/// A note for the phone in `room` (e.g. the round's stats after it ends).
#[tauri::command]
pub fn phone_notify(state: State<AppState>, room: String, data: Value) {
    state.phone.host_notify(&room, data);
}

/// Done with a room: the phone is told and the code stops working.
#[tauri::command]
pub fn phone_close(state: State<AppState>, room: String) {
    state.phone.close_room(&room);
}

/// This laptop's addresses for the QR code, best first.
#[tauri::command]
pub fn phone_lan(state: State<AppState>) -> LanInfo {
    LanInfo {
        addresses: net::lan_addresses(),
        bonjour: net::bonjour_name(),
        port: PORT,
        error: state.phone_server.error.lock().unwrap().clone(),
    }
}

#[tauri::command]
pub fn tunnel_status(state: State<AppState>) -> TunnelStatus {
    state.tunnel.status()
}

/// Starts the internet link (Cloudflare quick tunnel). Poll `tunnel_status` for its address.
#[tauri::command]
pub fn tunnel_start(state: State<AppState>) -> TunnelStatus {
    state.tunnel.start()
}

#[tauri::command]
pub fn tunnel_stop(state: State<AppState>) -> TunnelStatus {
    state.tunnel.stop()
}
