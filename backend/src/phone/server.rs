//! The HTTPS server phones connect to, on port 47800.
//!
//! * `GET  /phone.html?room=…`      – the phone camera page (`pumpCourt/phone.html`, built into the app)
//! * `POST /signal-http/join`        – `{room, role: "phone"}` → `{id}` or `{error}`
//! * `GET  /signal-http/poll?id=`    – long-poll, up to 20 s → `{messages: [...]}`; unknown id → 410
//! * `POST /signal-http/send`        – `{id, data}`: an offer or ICE candidate for the laptop
//! * `POST /signal-http/leave`       – `{id}`: the page closed
//! * `GET  /relay?room=…&role=phone` – WebSocket of JPEG frames and orientation notes (internet link only)
//!
//! Phone browsers only open the camera on HTTPS pages, so the server uses a
//! self-signed certificate made at start-up; each phone shows a one-time
//! warning. Signalling uses plain requests rather than a WebSocket because
//! iPhone Safari often refuses WebSockets to a self-signed certificate.

use super::{net, PhoneHub, RelayOut, PORT, RELAY_MAX_FRAME};
use axum::body::Bytes;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, DefaultBodyLimit, Query, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Built from `pumpCourt/phone.html` by `npm run build` in frontend/ (see build.rs).
const PHONE_PAGE: &str = include_str!(concat!(env!("OUT_DIR"), "/phone.html"));
const MAX_BODY: usize = 256 * 1024;

/// Whether the server is up, for the Add camera dialog.
#[derive(Default)]
pub struct ServerStatus {
    pub error: Mutex<Option<String>>,
}

/// Runs the server until the app exits. A start-up error is kept in `status`.
pub async fn run(hub: Arc<PhoneHub>, status: Arc<ServerStatus>) {
    // Drop phones that stopped polling.
    let sweeper = hub.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            sweeper.sweep();
        }
    });
    if let Err(e) = serve(hub).await {
        *status.error.lock().unwrap() = Some(e);
    }
}

async fn serve(hub: Arc<PhoneHub>) -> Result<(), String> {
    // Self-signed certificate for every address a phone might use.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut names: Vec<String> = net::lan_addresses().into_iter().map(|a| a.address).collect();
    names.extend(net::bonjour_name());
    names.push("localhost".into());
    let cert = rcgen::generate_simple_self_signed(names).map_err(|e| e.to_string())?;
    let tls = axum_server::tls_rustls::RustlsConfig::from_pem(
        cert.cert.pem().into_bytes(),
        cert.key_pair.serialize_pem().into_bytes(),
    )
    .await
    .map_err(|e| e.to_string())?;

    let app = Router::new()
        .route("/phone.html", get(page))
        .route("/signal-http/join", post(join))
        .route("/signal-http/poll", get(poll))
        .route("/signal-http/send", post(send))
        .route("/signal-http/leave", post(leave))
        .route("/relay", get(relay))
        .layer(DefaultBodyLimit::max(MAX_BODY))
        .layer(middleware::from_fn(tunnel_guard))
        .with_state(hub);
    axum_server::bind_rustls(SocketAddr::from(([0, 0, 0, 0], PORT)), tls)
        .serve(app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .map_err(|e| format!("The phone camera server could not use port {PORT}: {e}"))
}

fn is_tunnel_host(host: &str) -> bool {
    host.split(':').next().unwrap_or("").to_lowercase().ends_with(".trycloudflare.com")
}

/// True when a request came in through the Cloudflare tunnel rather than from this laptop or the LAN.
/// HTTP/2 requests carry the host in the URI instead of a `host` header, so both are checked.
fn via_tunnel(headers: &HeaderMap, uri_host: Option<&str>) -> bool {
    headers.contains_key("cf-connecting-ip")
        || headers.get("host").and_then(|h| h.to_str().ok()).is_some_and(is_tunnel_host)
        || uri_host.is_some_and(is_tunnel_host)
}

/// Visitors through the tunnel only get the phone page and the relay.
async fn tunnel_guard(req: Request, next: Next) -> Response {
    let path = req.uri().path();
    if via_tunnel(req.headers(), req.uri().host()) && path != "/phone.html" && path != "/relay" {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }
    next.run(req).await
}

fn no_store(status: StatusCode, body: Value) -> Response {
    (status, [("cache-control", "no-store")], Json(body)).into_response()
}

/// The page holds nothing secret. Loading it tells the laptop the phone got through.
async fn page(
    State(hub): State<Arc<PhoneHub>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    if let Some(room) = q.get("room") {
        let from = match headers.get("cf-connecting-ip").and_then(|v| v.to_str().ok()) {
            Some(ip) => format!("{ip}, via the internet link"),
            None => addr.ip().to_canonical().to_string(),
        };
        hub.visit(room, from);
    }
    ([("cache-control", "no-store")], Html(PHONE_PAGE)).into_response()
}

fn parse(body: &Bytes) -> Option<Value> {
    serde_json::from_slice::<Value>(body).ok().filter(Value::is_object)
}

async fn join(State(hub): State<Arc<PhoneHub>>, body: Bytes) -> Response {
    let Some(body) = parse(&body) else { return no_store(StatusCode::BAD_REQUEST, json!({ "error": "bad join" })) };
    let room = body["room"].as_str().unwrap_or("");
    let role = body["role"].as_str().unwrap_or("");
    match hub.phone_join(room, role) {
        Ok(id) => no_store(StatusCode::OK, json!({ "id": id })),
        Err(e) if e == "bad join" => no_store(StatusCode::BAD_REQUEST, json!({ "error": e })),
        Err(e) => no_store(StatusCode::OK, json!({ "error": e })),
    }
}

#[derive(Deserialize)]
struct PollQuery {
    #[serde(default)]
    id: String,
}

async fn poll(State(hub): State<Arc<PhoneHub>>, Query(q): Query<PollQuery>) -> Response {
    match hub.poll(&q.id).await {
        Some(messages) => no_store(StatusCode::OK, json!({ "messages": messages })),
        None => no_store(StatusCode::GONE, json!({ "error": "gone" })),
    }
}

async fn send(State(hub): State<Arc<PhoneHub>>, body: Bytes) -> Response {
    let body = parse(&body).unwrap_or_default();
    let id = body["id"].as_str().unwrap_or("");
    if hub.phone_send(id, body["data"].clone()) {
        no_store(StatusCode::OK, json!({ "ok": true }))
    } else {
        no_store(StatusCode::GONE, json!({ "error": "gone" }))
    }
}

async fn leave(State(hub): State<Arc<PhoneHub>>, body: Bytes) -> Response {
    let body = parse(&body).unwrap_or_default();
    if hub.phone_leave(body["id"].as_str().unwrap_or("")) {
        no_store(StatusCode::OK, json!({ "ok": true }))
    } else {
        no_store(StatusCode::GONE, json!({ "error": "gone" }))
    }
}

#[derive(Deserialize)]
struct RelayQuery {
    #[serde(default)]
    room: String,
    #[serde(default)]
    role: String,
}

async fn relay(State(hub): State<Arc<PhoneHub>>, Query(q): Query<RelayQuery>, ws: WebSocketUpgrade) -> Response {
    ws.max_message_size(RELAY_MAX_FRAME).on_upgrade(move |socket| relay_phone(socket, hub, q))
}

async fn close(socket: &mut WebSocket, code: u16, reason: &'static str) {
    let frame = axum::extract::ws::CloseFrame { code, reason: reason.into() };
    let _ = socket.send(Message::Close(Some(frame))).await;
}

/// One phone on the internet link: its binary frames go to the laptop as they
/// are; its text notes (which way up the phone is) are checked first.
async fn relay_phone(mut socket: WebSocket, hub: Arc<PhoneHub>, q: RelayQuery) {
    // The laptop's side is the app window (IPC), so only phones connect here.
    if !super::valid_room(&q.room) || q.role != "phone" {
        return close(&mut socket, 4001, "bad join").await;
    }
    let (id, mut outbox) = match hub.relay_connect(&q.room) {
        Ok(ok) => ok,
        Err(message) => {
            let _ = socket.send(Message::Text(json!({ "type": "error", "message": message }).to_string())).await;
            return close(&mut socket, 4002, "expired").await;
        }
    };
    loop {
        tokio::select! {
            out = outbox.recv() => match out {
                Some(RelayOut::Text(text)) => {
                    if socket.send(Message::Text(text)).await.is_err() { break; }
                }
                Some(RelayOut::Close(code)) => {
                    close(&mut socket, code, if code == 4000 { "replaced" } else { "closed" }).await;
                    break;
                }
                None => break,
            },
            msg = socket.recv() => match msg {
                Some(Ok(Message::Binary(jpeg))) => hub.relay_frame(&q.room, id, jpeg),
                Some(Ok(Message::Text(note))) => hub.relay_text(&q.room, id, &note),
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                Some(Ok(_)) => {}
            },
        }
    }
    hub.relay_disconnect(&q.room, id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tunnel_visitors_are_recognised() {
        let mut h = HeaderMap::new();
        assert!(!via_tunnel(&h, None));
        h.insert("host", "192.168.1.5:47800".parse().unwrap());
        assert!(!via_tunnel(&h, Some("192.168.1.5")));
        h.insert("host", "quiet-river.trycloudflare.com".parse().unwrap());
        assert!(via_tunnel(&h, None));
        // HTTP/2: no host header, the host is in the URI.
        assert!(via_tunnel(&HeaderMap::new(), Some("quiet-river.trycloudflare.com")));
        let mut cf = HeaderMap::new();
        cf.insert("cf-connecting-ip", "1.2.3.4".parse().unwrap());
        assert!(via_tunnel(&cf, None));
    }

    #[test]
    fn the_phone_page_is_built_in() {
        assert!(PHONE_PAGE.contains("<html"), "build.rs always provides a page");
    }
}
