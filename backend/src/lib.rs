//! Pump Court backend.
//!
//! Module map:
//! * `pose`        – where landmarks come from (mock now, MediaPipe tracker later)
//! * `judge`       – angle maths, ready check, rep tracker and the three referees
//! * `game`        – modes and the round state machine
//! * `leaderboard` – SQLite storage
//! * `phone`       – QR-code phone camera link (local HTTPS server)
//! * `engine`      – the background thread that runs the live pipeline
//! * `commands`    – the functions the React frontend calls

pub mod commands;
pub mod engine;
pub mod game;
pub mod judge;
pub mod leaderboard;
pub mod phone;
pub mod pose;

use commands::AppState;
use judge::JudgeConfig;
use leaderboard::Leaderboard;
use pose::inbox::Inbox;
use pose::SourceDeps;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Per-user app data folder, e.g. ~/.local/share/com.pumpcourt.app on Linux.
            let data_dir = app.path().app_data_dir()?;
            let db = Arc::new(Mutex::new(Leaderboard::open(&data_dir)?));
            let config = JudgeConfig::default();

            // Phone camera link: a local HTTPS server the phone streams to.
            let phone = phone::PhoneHub::new();
            let handle = app.handle().clone();
            let last_code = Mutex::new(String::new());
            phone.set_change_listener(move |link| {
                let mut last = last_code.lock().unwrap();
                if *last != link.code && link.status.listening {
                    println!("Phone camera link: {}", link.url);
                    *last = link.code.clone();
                }
                drop(last);
                let _ = handle.emit("phone-link", link);
            });
            tauri::async_runtime::spawn(phone::server::run(phone.clone()));

            let pushed = Arc::new(Inbox::new());
            let deps = SourceDeps { phone: phone.clone(), pushed: pushed.clone() };
            let engine = engine::spawn(app.handle().clone(), db.clone(), config.clone(), deps);
            app.manage(AppState {
                engine: Mutex::new(engine),
                db,
                config: Mutex::new(config),
                phone,
                pushed,
                crowd_view: Mutex::new(commands::CrowdView::default()),
            });
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
            commands::get_player_count,
            commands::get_recent_runs,
            commands::get_crowd_view,
            commands::set_crowd_view,
            commands::get_phone_link,
            commands::new_pairing_code,
            commands::subscribe_phone_frames,
            commands::push_pose_frame,
            commands::delete_run,
            commands::export_backup,
            commands::open_crowd_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pump Court");
}
