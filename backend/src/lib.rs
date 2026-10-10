//! Pump Court backend.
//!
//! Module map:
//! * `pose`        – where landmarks come from (mock now, MediaPipe tracker later)
//! * `judge`       – angle maths, ready check, rep tracker and the three referees
//! * `game`        – modes and the round state machine
//! * `leaderboard` – SQLite storage
//! * `engine`      – the background thread that runs the live pipeline
//! * `commands`    – the functions the React frontend calls

pub mod commands;
pub mod engine;
pub mod game;
pub mod judge;
pub mod leaderboard;
pub mod pose;

use commands::AppState;
use judge::JudgeConfig;
use leaderboard::Leaderboard;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Per-user app data folder, e.g. ~/.local/share/com.pumpcourt.app on Linux.
            let data_dir = app.path().app_data_dir()?;
            let db = Arc::new(Mutex::new(Leaderboard::open(&data_dir)?));
            let config = JudgeConfig::default();
            let engine = engine::spawn(app.handle().clone(), db.clone(), config.clone());
            app.manage(AppState { engine: Mutex::new(engine), db, config: Mutex::new(config) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_sources,
            commands::start_source,
            commands::stop_source,
            commands::check_name,
            commands::start_round,
            commands::cancel_round,
            commands::get_judge_config,
            commands::set_judge_config,
            commands::get_leaderboard,
            commands::get_ghost_run,
            commands::get_player_count,
            commands::delete_run,
            commands::export_backup,
            commands::open_crowd_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pump Court");
}
