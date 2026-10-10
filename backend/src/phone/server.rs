//! The HTTPS + WebSocket server the phone connects to.
//!
//! * `GET /`                       – the camera page (phone/page.html, built in)
//! * `GET /ws?code=…` or `?token=…` – WebSocket. The phone sends one JSON
//!   `hello`, gets `welcome` with its session token, then sends each camera
//!   frame as a binary JPEG.
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
struct Credentials {
    code: Option<String>,
    token: Option<String>,
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
    server
        .serve(app.into_make_service())
        .await
        .map_err(|e| format!("Phone link could not use port {PORT}: {e}"))
}

/// The page itself holds nothing secret; the WebSocket checks the code.
async fn page() -> Html<&'static str> {
    Html(PAGE)
}

async fn socket(State(hub): State<Arc<PhoneHub>>, Query(c): Query<Credentials>, ws: WebSocketUpgrade) -> Response {
    if hub.check(c.code.as_deref(), c.token.as_deref()).is_none() {
        // Wrong or already-used code: the phone page asks for a fresh scan.
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.max_message_size(MAX_FRAME_BYTES).on_upgrade(move |socket| handle(socket, hub, c))
}

async fn handle(mut socket: WebSocket, hub: Arc<PhoneHub>, creds: Credentials) {
    let mut conn = None;
    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(text) if conn.is_none() => {
                let Ok(PhoneMessage::Hello { device }) = serde_json::from_str(&text) else { continue };
                // Checked again here: another phone may have used the code meanwhile.
                match hub.connect(creds.code.as_deref(), creds.token.as_deref(), device) {
                    Some(c) => {
                        let welcome = serde_json::json!({ "type": "welcome", "token": c.token });
                        let _ = socket.send(Message::Text(welcome.to_string())).await;
                        conn = Some(c.id);
                    }
                    None => {
                        let _ = socket.send(Message::Text(r#"{"type":"refused"}"#.into())).await;
                        break;
                    }
                }
            }
            Message::Binary(jpeg) => {
                let Some(id) = conn else { continue };
                if !hub.push_frame(id, jpeg) {
                    // Another phone scanned the new code, or the operator reset it.
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
