//! Pump Court backend.
//!
//! The motion tracker and referee run in the app window (the teammate's
//! MediaPipe tracker in `pumpCourt/src`, used by `frontend/`). This side keeps
//! score and serves the phones:
//!
//! * `game`        – modes and the round state machine (clock, count)
//! * `engine`      – the background thread that runs the round clock
//! * `leaderboard` – SQLite storage
//! * `phone`       – phone cameras: pairing rooms, HTTPS server, internet link
//! * `commands`    – the functions the React frontend calls

pub mod commands;
pub mod engine;
pub mod game;
pub mod leaderboard;
pub mod phone;

use commands::AppState;
use leaderboard::Leaderboard;
use std::sync::{Arc, Mutex};
use tauri::{Manager, RunEvent};

pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            // Per-user app data folder, e.g. %APPDATA%\com.pumpcourt.app on Windows.
            let data_dir = app.path().app_data_dir()?;
            let db = Arc::new(Mutex::new(Leaderboard::open(&data_dir)?));

            // Phone cameras: a local HTTPS server phones open the camera page from.
            let phone = phone::PhoneHub::new();
            let phone_server = Arc::new(phone::server::ServerStatus::default());
            tauri::async_runtime::spawn(phone::server::run(phone.clone(), phone_server.clone()));

            let engine = engine::spawn(app.handle().clone(), db.clone());
            app.manage(AppState {
                engine: Mutex::new(engine),
                db,
                phone,
                phone_server,
                tunnel: phone::tunnel::Tunnel::new(phone::PORT),
            });

            #[cfg(target_os = "linux")]
            if let Some(window) = app.get_webview_window("main") {
                allow_camera(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_name,
            commands::start_round,
            commands::cancel_round,
            commands::set_ready,
            commands::report_rep,
            commands::save_round,
            commands::get_leaderboard,
            commands::get_player_count,
            commands::delete_run,
            commands::export_backup,
            commands::open_crowd_window,
            commands::phone_open,
            commands::phone_signal,
            commands::phone_notify,
            commands::phone_close,
            commands::phone_lan,
            commands::tunnel_status,
            commands::tunnel_start,
            commands::tunnel_stop,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Pump Court");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            // Close the internet link, so the laptop isn't reachable from outside after the app quits.
            app.state::<AppState>().tunnel.stop();
        }
    });
}

/// Linux's web view keeps the camera switched off unless asked.
#[cfg(target_os = "linux")]
fn allow_camera(window: &tauri::WebviewWindow) {
    use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};
    let _ = window.with_webview(|webview| {
        let view = webview.inner();
        if let Some(settings) = view.settings() {
            settings.set_enable_media_stream(true);
            settings.set_enable_webrtc(true);
        }
        view.connect_permission_request(|_, request| {
            request.allow();
            true
        });
    });
}
