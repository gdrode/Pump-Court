//! The HTTPS + WebSocket server the phone connects to.
//!
//! * `GET /?code=…`   – the camera page (phone/page.html, built into the app)
//! * `GET /ws?code=…` – WebSocket. The phone sends one JSON `hello` text
//!                      message, then each camera frame as a binary JPEG.
//!
//! Phone browsers only allow camera access on HTTPS pages, so the server uses
//! a self-signed certificate made at start-up. The phone shows a one-time
//! "not private" warning that the operator accepts.

use super::{PhoneHub, MAX_FRAME_BYTES, PORT};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use std::net::SocketAddr;
use std::sync::Arc;

const PAGE: &str = include_str!("page.html");

#[derive(Deserialize)]
struct CodeQuery {
    code: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum PhoneMessage {
    Hello { device: String },
}

/// Runs the server until the app exits. Errors are reported through the hub.
pub async fn run(hub: Arc<PhoneHub>) {
    if let Err(e) = serve(hub.clone()).await {
        hub.set_listening(None, Some(e));
    }
}

async fn serve(hub: Arc<PhoneHub>) -> Result<(), String> {
    let ip = local_ip_address::local_ip()
        .map_err(|e| format!("No network connection found ({e}). Join the same Wi-Fi or hotspot as the phone."))?
        .to_string();

    // Self-signed certificate for this laptop's address.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let cert = rcgen::generate_simple_self_signed(vec![ip.clone(), "localhost".into()]).map_err(|e| e.to_string())?;
    let tls = axum_server::tls_rustls::RustlsConfig::from_pem(
        cert.cert.pem().into_bytes(),
        cert.key_pair.serialize_pem().into_bytes(),
    )
    .await
    .map_err(|e| e.to_string())?;

    let app = Router::new().route("/", get(page)).route("/ws", get(socket)).with_state(hub.clone());
    let addr = SocketAddr::from(([0, 0, 0, 0], PORT));
    let server = axum_server::bind_rustls(addr, tls);
    hub.set_listening(Some(ip), None);
    println!("Phone camera link: {}", hub.link().url);
    server
        .serve(app.into_make_service())
        .await
        .map_err(|e| format!("Phone link could not use port {PORT}: {e}"))
}

async fn page(State(hub): State<Arc<PhoneHub>>, Query(q): Query<CodeQuery>) -> Response {
    if !q.code.as_deref().is_some_and(|c| hub.code_matches(c)) {
        return (StatusCode::FORBIDDEN, Html("<h1>Scan the QR code on the Pump Court screen</h1>")).into_response();
    }
    Html(PAGE).into_response()
}

async fn socket(State(hub): State<Arc<PhoneHub>>, Query(q): Query<CodeQuery>, ws: WebSocketUpgrade) -> Response {
    if !q.code.as_deref().is_some_and(|c| hub.code_matches(c)) {
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.max_message_size(MAX_FRAME_BYTES).on_upgrade(move |socket| handle(socket, hub))
}

async fn handle(mut socket: WebSocket, hub: Arc<PhoneHub>) {
    let mut conn = None;
    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(text) => {
                if let Ok(PhoneMessage::Hello { device }) = serde_json::from_str(&text) {
                    conn = Some(hub.connect(device));
                    let _ = socket.send(Message::Text(r#"{"type":"welcome"}"#.into())).await;
                }
            }
            Message::Binary(jpeg) => {
                let Some(id) = conn else { continue };
                if !hub.push_frame(id, jpeg) {
                    // Another phone took over, or the operator made a new code.
                    let _ = socket.send(Message::Text(r#"{"type":"replaced"}"#.into())).await;
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    if let Some(id) = conn {
        hub.disconnect(id);
    }
}
