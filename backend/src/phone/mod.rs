//! Phone cameras, the way the tracker prototype (`pumpCourt/`) pairs them.
//!
//! The laptop opens a pairing *room* with a fresh 8-letter code and shows a QR
//! code for `https://<laptop>:47800/phone.html?room=<code>`. The phone page
//! (`pumpCourt/phone.html`, built into this app) then streams its camera:
//!
//! ```text
//!  Wi-Fi (default)   phone ──WebRTC video──────────────────────────▶ app window
//!                      └─ offer/answer/ICE: /signal-http/* ─▶ Room ─▶ app window (IPC)
//!
//!  Any network       phone ──JPEG frames: wss://<tunnel>/relay ─▶ Room ─▶ app window (IPC)
//!                    (Cloudflare quick tunnel, see `tunnel.rs`)
//! ```
//!
//! On Wi-Fi the video goes straight from the phone to the app window; this
//! module only introduces the two. The app window's side of a room talks to
//! Rust through Tauri commands and channels, never the network.
//!
//! Codes are single-use in practice: every "Add camera" opens a new room, and
//! a room closes when the laptop stops using it. A second phone on the same
//! code replaces the first (the first is told `closed`, code 4000).

pub mod net;
pub mod server;
pub mod tunnel;

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, Notify};

/// Port the phone connects to (HTTPS).
pub const PORT: u16 = 47800;
/// A phone polling over HTTP that hasn't been heard from for this long has gone.
pub const HTTP_PEER_TIMEOUT: Duration = Duration::from_secs(15);
/// How long a poll is held open waiting for a message.
pub const POLL_HOLD: Duration = Duration::from_secs(20);
/// Largest JPEG frame the relay accepts (a 960-wide frame is ~60 KB).
pub const RELAY_MAX_FRAME: usize = 2 * 1024 * 1024;

const EXPIRED: &str = "This pairing code has expired. Open \"Add camera\" on the laptop and scan the new code.";

/// The app window's side of a room: where messages and relay frames go.
pub struct HostLink {
    /// JSON messages: joined, peer-joined, peer-left, signal, phone-visit.
    pub events: Box<dyn Fn(Value) + Send + Sync>,
    /// Relayed JPEG frames (internet link only).
    pub frames: Box<dyn Fn(Vec<u8>) + Send + Sync>,
}

/// A phone signalling over plain HTTPS requests (long-polling).
pub struct HttpPeer {
    pub id: String,
    room: String,
    queue: Mutex<Vec<Value>>,
    notify: Notify,
    last_seen: Mutex<Instant>,
    /// Bumped by every poll, so a newer poll replaces an older one.
    polls: AtomicU64,
    waiting: AtomicBool,
    closed: AtomicBool,
}

impl HttpPeer {
    fn send(&self, msg: Value) {
        self.queue.lock().unwrap().push(msg);
        self.notify.notify_waiters();
    }

    /// Tells the phone it was closed (4000 = another phone took over the code).
    fn close(&self, code: u16) {
        self.closed.store(true, Ordering::SeqCst);
        self.send(json!({ "type": "closed", "code": code }));
    }

    fn touch(&self) {
        *self.last_seen.lock().unwrap() = Instant::now();
    }
}

/// What the relay socket task should send to its phone.
pub enum RelayOut {
    Text(String),
    Close(u16),
}

/// A phone sending JPEG frames over the relay WebSocket.
struct RelayPhone {
    id: u64,
    tx: mpsc::UnboundedSender<RelayOut>,
}

impl RelayPhone {
    fn send(&self, msg: Value) {
        let _ = self.tx.send(RelayOut::Text(msg.to_string()));
    }
}

#[derive(Default)]
struct Room {
    host: Option<Arc<HostLink>>,
    phone: Option<Arc<HttpPeer>>,
    relay: Option<RelayPhone>,
}

#[derive(Default)]
struct Inner {
    rooms: HashMap<String, Room>,
    http_peers: HashMap<String, Arc<HttpPeer>>,
    next_relay: u64,
}

/// All pairing rooms. Shared by the HTTPS server and the Tauri commands.
#[derive(Default)]
pub struct PhoneHub {
    inner: Mutex<Inner>,
}

/// An 8-character code without look-alike letters (no I, O, 0, 1).
pub fn new_room_code() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    (0..8).map(|_| ALPHABET[rand::random::<usize>() % ALPHABET.len()] as char).collect()
}

/// Room codes the phone may send: what [`new_room_code`] makes, give or take.
pub fn valid_room(room: &str) -> bool {
    (4..=32).contains(&room.len()) && room.chars().all(|c| c.is_ascii_alphanumeric())
}

impl PhoneHub {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    // --- The app window's side ---------------------------------------------

    /// Opens a room with a new code for the app window. Returns the code.
    pub fn open_room(&self, host: HostLink) -> String {
        let mut inner = self.inner.lock().unwrap();
        let mut room = new_room_code();
        while inner.rooms.contains_key(&room) {
            room = new_room_code();
        }
        (host.events)(json!({ "type": "joined" }));
        inner.rooms.insert(room.clone(), Room { host: Some(Arc::new(host)), ..Room::default() });
        room
    }

    /// The app window is done with a room: its phone is told and the code stops working.
    pub fn close_room(&self, room: &str) {
        let mut inner = self.inner.lock().unwrap();
        let Some(r) = inner.rooms.remove(room) else { return };
        if let Some(phone) = r.phone {
            phone.send(json!({ "type": "peer-left" }));
            inner.http_peers.remove(&phone.id);
        }
        if let Some(relay) = r.relay {
            relay.send(json!({ "type": "peer-left" }));
            let _ = relay.tx.send(RelayOut::Close(1000));
        }
    }

    /// Passes an answer or ICE candidate from the app window to the phone.
    pub fn host_signal(&self, room: &str, data: Value) {
        let inner = self.inner.lock().unwrap();
        if let Some(phone) = inner.rooms.get(room).and_then(|r| r.phone.as_ref()) {
            phone.send(json!({ "type": "signal", "data": data }));
        }
    }

    fn host_of(&self, room: &str) -> Option<Arc<HostLink>> {
        self.inner.lock().unwrap().rooms.get(room).and_then(|r| r.host.clone())
    }

    /// A phone loaded the pairing page: it can reach this laptop.
    pub fn visit(&self, room: &str, from: String) {
        if let Some(host) = self.host_of(room) {
            (host.events)(json!({ "type": "phone-visit", "from": from }));
        }
    }

    // --- Phones over HTTP (Wi-Fi pairing) ------------------------------------

    /// A phone joins a room. Only rooms the laptop opened can be joined.
    pub fn phone_join(&self, room: &str, role: &str) -> Result<String, String> {
        if !valid_room(room) || role != "phone" {
            return Err("bad join".into());
        }
        let mut inner = self.inner.lock().unwrap();
        let Some(r) = inner.rooms.get_mut(room).filter(|r| r.host.is_some()) else {
            return Err(EXPIRED.into());
        };
        let peer = Arc::new(HttpPeer {
            id: format!("{:032x}", rand::random::<u128>()),
            room: room.to_string(),
            queue: Mutex::new(Vec::new()),
            notify: Notify::new(),
            last_seen: Mutex::new(Instant::now()),
            polls: AtomicU64::new(0),
            waiting: AtomicBool::new(false),
            closed: AtomicBool::new(false),
        });
        let old = r.phone.replace(peer.clone());
        peer.send(json!({ "type": "joined" }));
        if let Some(host) = &r.host {
            (host.events)(json!({ "type": "peer-joined" }));
            peer.send(json!({ "type": "peer-joined" }));
        }
        if let Some(old) = old {
            old.close(4000);
            inner.http_peers.remove(&old.id);
        }
        inner.http_peers.insert(peer.id.clone(), peer.clone());
        Ok(peer.id.clone())
    }

    fn http_peer(&self, id: &str) -> Option<Arc<HttpPeer>> {
        self.inner.lock().unwrap().http_peers.get(id).cloned()
    }

    /// Long-poll: waits up to 20 s for messages. `None` = unknown peer (HTTP 410).
    pub async fn poll(&self, id: &str) -> Option<Vec<Value>> {
        self.poll_for(id, POLL_HOLD).await
    }

    async fn poll_for(&self, id: &str, hold: Duration) -> Option<Vec<Value>> {
        let peer = self.http_peer(id)?;
        let generation = peer.polls.fetch_add(1, Ordering::SeqCst) + 1;
        peer.notify.notify_waiters(); // an older poll returns empty
        let _waiting = Waiting::new(&peer);
        let deadline = tokio::time::Instant::now() + hold;
        loop {
            let notified = peer.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if peer.polls.load(Ordering::SeqCst) != generation {
                return Some(Vec::new());
            }
            let messages = std::mem::take(&mut *peer.queue.lock().unwrap());
            if !messages.is_empty() || peer.closed.load(Ordering::SeqCst) {
                return Some(messages);
            }
            if tokio::time::timeout_at(deadline, notified).await.is_err() {
                return Some(Vec::new());
            }
        }
    }

    /// The phone's offer or ICE candidate, for the app window. `false` = unknown peer.
    pub fn phone_send(&self, id: &str, data: Value) -> bool {
        let Some(peer) = self.http_peer(id) else { return false };
        peer.touch();
        if let Some(host) = self.host_of(&peer.room) {
            (host.events)(json!({ "type": "signal", "data": data }));
        }
        true
    }

    /// The phone page closed. `false` = unknown peer.
    pub fn phone_leave(&self, id: &str) -> bool {
        let Some(peer) = self.http_peer(id) else { return false };
        self.drop_http_peer(&peer);
        true
    }

    fn drop_http_peer(&self, peer: &Arc<HttpPeer>) {
        let host = {
            let mut inner = self.inner.lock().unwrap();
            if inner.http_peers.remove(&peer.id).is_none() {
                return;
            }
            let Some(r) = inner.rooms.get_mut(&peer.room) else { return };
            if !r.phone.as_ref().is_some_and(|p| Arc::ptr_eq(p, peer)) {
                return;
            }
            r.phone = None;
            r.host.clone()
        };
        if let Some(host) = host {
            (host.events)(json!({ "type": "peer-left" }));
        }
    }

    /// Drops phones that stopped polling (closed tab, lost Wi-Fi). Run every few seconds.
    pub fn sweep(&self) {
        let gone: Vec<_> = {
            let inner = self.inner.lock().unwrap();
            inner
                .http_peers
                .values()
                .filter(|p| !p.waiting.load(Ordering::SeqCst) && p.last_seen.lock().unwrap().elapsed() > HTTP_PEER_TIMEOUT)
                .cloned()
                .collect()
        };
        for peer in gone {
            self.drop_http_peer(&peer);
        }
    }

    // --- Phones over the relay (internet link) ----------------------------------

    /// A phone opened the relay socket. Returns its id and what to send it.
    pub fn relay_connect(&self, room: &str) -> Result<(u64, mpsc::UnboundedReceiver<RelayOut>), String> {
        let mut inner = self.inner.lock().unwrap();
        inner.next_relay += 1;
        let id = inner.next_relay;
        let Some(r) = inner.rooms.get_mut(room).filter(|r| r.host.is_some()) else {
            return Err(EXPIRED.into());
        };
        let (tx, rx) = mpsc::unbounded_channel();
        let phone = RelayPhone { id, tx };
        if let Some(old) = r.relay.replace(phone) {
            let _ = old.tx.send(RelayOut::Close(4000));
        }
        if let (Some(host), Some(phone)) = (&r.host, &r.relay) {
            (host.events)(json!({ "type": "peer-joined" }));
            phone.send(json!({ "type": "peer-joined" }));
        }
        Ok((id, rx))
    }

    /// The app window's link for a room, if `id` is still the room's relay phone.
    fn relay_host(&self, room: &str, id: u64) -> Option<Arc<HostLink>> {
        let inner = self.inner.lock().unwrap();
        inner.rooms.get(room).filter(|r| r.relay.as_ref().is_some_and(|p| p.id == id)).and_then(|r| r.host.clone())
    }

    /// One JPEG from the relay phone, passed to the app window as it is.
    pub fn relay_frame(&self, room: &str, id: u64, jpeg: Vec<u8>) {
        if let Some(host) = self.relay_host(room, id) {
            (host.frames)(jpeg);
        }
    }

    /// A text note from the relay phone. The only one is which way up the
    /// phone is: `{"type": "orientation", "rotation": 0|90|180|270}`, the
    /// clockwise turn that makes its picture upright. Anything else is dropped.
    pub fn relay_text(&self, room: &str, id: u64, text: &str) {
        let Ok(msg) = serde_json::from_str::<Value>(text) else { return };
        let rotation = msg["rotation"].as_u64().filter(|r| [0, 90, 180, 270].contains(r));
        if let (Some("orientation"), Some(rotation)) = (msg["type"].as_str(), rotation) {
            if let Some(host) = self.relay_host(room, id) {
                (host.events)(json!({ "type": "orientation", "rotation": rotation }));
            }
        }
    }

    pub fn relay_disconnect(&self, room: &str, id: u64) {
        let host = {
            let mut inner = self.inner.lock().unwrap();
            let Some(r) = inner.rooms.get_mut(room) else { return };
            if !r.relay.as_ref().is_some_and(|p| p.id == id) {
                return;
            }
            r.relay = None;
            r.host.clone()
        };
        if let Some(host) = host {
            (host.events)(json!({ "type": "peer-left" }));
        }
    }
}

/// Marks a peer as polling, so the sweep leaves it alone; also when the
/// request is dropped half-way (the phone went away).
struct Waiting<'a>(&'a HttpPeer);

impl<'a> Waiting<'a> {
    fn new(peer: &'a HttpPeer) -> Self {
        peer.touch();
        peer.waiting.store(true, Ordering::SeqCst);
        Self(peer)
    }
}

impl Drop for Waiting<'_> {
    fn drop(&mut self) {
        self.0.waiting.store(false, Ordering::SeqCst);
        self.0.touch();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A host that records its messages and frames.
    fn host() -> (HostLink, Arc<Mutex<Vec<Value>>>, Arc<Mutex<Vec<Vec<u8>>>>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let frames = Arc::new(Mutex::new(Vec::new()));
        let (e, f) = (events.clone(), frames.clone());
        let link = HostLink {
            events: Box::new(move |m| e.lock().unwrap().push(m)),
            frames: Box::new(move |j| f.lock().unwrap().push(j)),
        };
        (link, events, frames)
    }

    fn types(events: &Mutex<Vec<Value>>) -> Vec<String> {
        events.lock().unwrap().iter().map(|m| m["type"].as_str().unwrap().to_string()).collect()
    }

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread().enable_time().build().unwrap()
    }

    #[test]
    fn codes_are_eight_easy_characters() {
        let code = new_room_code();
        assert_eq!(code.len(), 8);
        assert!(valid_room(&code));
        assert!(!code.contains(['I', 'O', '0', '1']));
        assert!(!valid_room("ab") && !valid_room("../etc"));
    }

    #[test]
    fn phone_and_laptop_exchange_signals() {
        let hub = PhoneHub::new();
        let (link, events, _) = host();
        let room = hub.open_room(link);
        let id = hub.phone_join(&room, "phone").unwrap();
        assert_eq!(types(&events), ["joined", "peer-joined"]);

        assert!(hub.phone_send(&id, json!({ "sdp": { "type": "offer" } })));
        assert_eq!(events.lock().unwrap()[2], json!({ "type": "signal", "data": { "sdp": { "type": "offer" } } }));

        hub.host_signal(&room, json!({ "sdp": { "type": "answer" } }));
        let got = rt().block_on(hub.poll(&id)).unwrap();
        let got_types: Vec<_> = got.iter().map(|m| m["type"].as_str().unwrap()).collect();
        assert_eq!(got_types, ["joined", "peer-joined", "signal"]);
        assert_eq!(got[2]["data"]["sdp"]["type"], "answer");

        assert!(hub.phone_leave(&id));
        assert_eq!(types(&events).last().unwrap(), "peer-left");
        assert!(rt().block_on(hub.poll(&id)).is_none(), "a peer that left is gone (410)");
    }

    #[test]
    fn only_rooms_the_laptop_opened_can_be_joined() {
        let hub = PhoneHub::new();
        assert!(hub.phone_join("ABCDEFGH", "phone").unwrap_err().contains("expired"));
        let (link, _, _) = host();
        let room = hub.open_room(link);
        assert_eq!(hub.phone_join(&room, "host").unwrap_err(), "bad join", "the network can't act as the laptop");
        hub.close_room(&room);
        assert!(hub.phone_join(&room, "phone").is_err(), "a closed code stops working");
    }

    #[test]
    fn a_second_phone_replaces_the_first() {
        let hub = PhoneHub::new();
        let (link, _, _) = host();
        let room = hub.open_room(link);
        let first = hub.phone_join(&room, "phone").unwrap();
        let second = hub.phone_join(&room, "phone").unwrap();
        // The first phone's waiting messages end with "closed 4000"; after that it is gone.
        let msgs = rt().block_on(hub.poll_for(&first, Duration::from_millis(10)));
        assert!(msgs.is_none(), "the replaced phone is removed");
        assert!(!hub.phone_send(&first, json!({})));
        assert!(hub.phone_send(&second, json!({})));
    }

    #[test]
    fn closing_the_room_tells_the_phone() {
        let hub = PhoneHub::new();
        let (link, _, _) = host();
        let room = hub.open_room(link);
        let id = hub.phone_join(&room, "phone").unwrap();
        let peer = hub.http_peer(&id).unwrap();
        hub.close_room(&room);
        let queued: Vec<_> = peer.queue.lock().unwrap().iter().map(|m| m["type"].clone()).collect();
        assert_eq!(queued.last().unwrap(), "peer-left");
    }

    #[test]
    fn an_empty_poll_returns_after_the_hold_time() {
        let hub = PhoneHub::new();
        let (link, _, _) = host();
        let room = hub.open_room(link);
        let id = hub.phone_join(&room, "phone").unwrap();
        let rt = rt();
        assert_eq!(rt.block_on(hub.poll(&id)).unwrap().len(), 2); // joined, peer-joined
        let empty = rt.block_on(hub.poll_for(&id, Duration::from_millis(20))).unwrap();
        assert!(empty.is_empty());
    }

    #[test]
    fn silent_phones_are_swept() {
        let hub = PhoneHub::new();
        let (link, events, _) = host();
        let room = hub.open_room(link);
        let id = hub.phone_join(&room, "phone").unwrap();
        hub.sweep();
        assert!(hub.http_peer(&id).is_some(), "recently seen");
        *hub.http_peer(&id).unwrap().last_seen.lock().unwrap() -= HTTP_PEER_TIMEOUT + Duration::from_secs(1);
        hub.sweep();
        assert!(hub.http_peer(&id).is_none());
        assert_eq!(types(&events).last().unwrap(), "peer-left");
    }

    #[test]
    fn relay_frames_reach_the_laptop() {
        let hub = PhoneHub::new();
        let (link, events, frames) = host();
        let room = hub.open_room(link);
        assert!(hub.relay_connect("NOSUCHRM").is_err());
        let (a, mut a_rx) = hub.relay_connect(&room).unwrap();
        hub.relay_frame(&room, a, vec![0xFF, 0xD8]);
        let (b, _b_rx) = hub.relay_connect(&room).unwrap();
        hub.relay_frame(&room, a, vec![1]); // the replaced phone's frames are dropped
        hub.relay_frame(&room, b, vec![2]);
        assert_eq!(*frames.lock().unwrap(), vec![vec![0xFF, 0xD8], vec![2]]);
        let mut a_got = vec![];
        while let Ok(m) = a_rx.try_recv() {
            a_got.push(matches!(m, RelayOut::Close(4000)));
        }
        assert_eq!(a_got.last(), Some(&true), "the first phone is told it was replaced");
        hub.relay_disconnect(&room, b);
        assert_eq!(types(&events).last().unwrap(), "peer-left");
    }

    #[test]
    fn relay_orientation_reaches_the_laptop() {
        let hub = PhoneHub::new();
        let (link, events, _) = host();
        let room = hub.open_room(link);
        let (id, _rx) = hub.relay_connect(&room).unwrap();
        hub.relay_text(&room, id, r#"{"type":"orientation","rotation":90}"#);
        assert_eq!(events.lock().unwrap().last().unwrap(), &json!({ "type": "orientation", "rotation": 90 }));
        for bad in [r#"{"type":"orientation","rotation":45}"#, r#"{"type":"other"}"#, "not json"] {
            hub.relay_text(&room, id, bad);
        }
        hub.relay_text(&room, id + 1, r#"{"type":"orientation","rotation":180}"#); // not this room's phone
        assert_eq!(events.lock().unwrap().last().unwrap()["rotation"], 90, "bad notes are dropped");
    }

    #[test]
    fn visits_are_reported() {
        let hub = PhoneHub::new();
        let (link, events, _) = host();
        let room = hub.open_room(link);
        hub.visit(&room, "192.168.1.20".into());
        hub.visit("OTHERONE", "x".into());
        assert_eq!(events.lock().unwrap().last().unwrap(), &json!({ "type": "phone-visit", "from": "192.168.1.20" }));
    }
}
