//! Phone camera link: the phone streams its camera to the desktop app.
//!
//! ```text
//!  operator screen shows a QR code ─────────────┐
//!                                               ▼  (scan)
//!  phone browser ── https://<laptop-ip>:47800/?code=123456 ──▶ camera page
//!       │                                         (served by THIS app)
//!       └── wss://…/ws?code=123456  JPEG frames ──▶ PhoneHub (this module)
//!                                                     ├─▶ PhoneSource → engine → referees
//!                                                     └─▶ frontend subscribers (JS tracker, preview)
//! ```
//!
//! Everything stays on the local network: no internet, no cloud server, no
//! database; pairing lives in memory.
//!
//! **Pairing codes are single-use.** The moment a phone pairs, the 6-digit
//! code (and the QR code on screen) changes, so the next person must scan the
//! new one, which takes over from the previous phone. The paired phone gets a
//! private session token so it can reconnect after a network blip without
//! the old code.

pub mod server;

use crate::pose::inbox::Inbox;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;

/// Port the phone connects to (HTTPS).
pub const PORT: u16 = 47800;
/// Frames larger than this are rejected (a 1280×720 JPEG is ~100–200 KB).
pub const MAX_FRAME_BYTES: usize = 2 * 1024 * 1024;

/// One camera frame from the phone.
#[derive(Clone)]
pub struct PhoneFrame {
    pub jpeg: Arc<Vec<u8>>,
    pub width: u32,
    pub height: u32,
}

/// What the operator sees about the phone link.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhoneStatus {
    /// The HTTPS server is up.
    pub listening: bool,
    /// Why the server could not start, if it didn't.
    pub error: Option<String>,
    pub connected: bool,
    /// Phone model / browser string the phone reported.
    pub device: Option<String>,
    pub width: u32,
    pub height: u32,
    /// Frames per second actually arriving.
    pub fps: f32,
    /// How many phones have paired since the app started.
    pub pairings: u32,
}

/// The pairing details shown on the settings screen.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhoneLink {
    /// The address the QR code encodes.
    pub url: String,
    /// The current single-use pairing code.
    pub code: String,
    /// QR code as an SVG string, ready to drop into the page.
    pub qr_svg: String,
    pub status: PhoneStatus,
}

/// How a WebSocket proved it may stream.
#[derive(Debug, Clone, PartialEq)]
pub enum Auth {
    /// Used the current pairing code: a new phone (the code is now spent).
    NewPairing,
    /// Used the session token of the phone already paired: a reconnect.
    Reconnect,
}

/// Result of a successful connection.
pub struct Connection {
    pub id: u64,
    /// Token the phone keeps for reconnecting.
    pub token: String,
}

struct HubState {
    code: String,
    /// Session token of the currently paired phone.
    token: Option<String>,
    ip: Option<String>,
    status: PhoneStatus,
    /// Id of the connection allowed to stream.
    active_conn: u64,
    next_conn: u64,
    last_frame_at: Option<Instant>,
}

impl HubState {
    fn rotate_code(&mut self) {
        let mut code = new_code();
        while code == self.code {
            code = new_code();
        }
        self.code = code;
    }

    fn drop_phone(&mut self) {
        self.active_conn = 0;
        self.status.connected = false;
        self.status.device = None;
        self.status.fps = 0.0;
        self.last_frame_at = None;
    }
}

type Listener = Box<dyn Fn(PhoneLink) + Send + Sync>;
type FrameSubscriber = Box<dyn Fn(&PhoneFrame) -> bool + Send + Sync>;

/// Shared between the network server, the engine and the Tauri commands.
pub struct PhoneHub {
    state: Mutex<HubState>,
    /// Newest frame for the engine thread.
    pub frames: Inbox<PhoneFrame>,
    on_change: Mutex<Option<Listener>>,
    subscribers: Mutex<Vec<FrameSubscriber>>,
}

fn new_code() -> String {
    format!("{:06}", rand::random::<u32>() % 1_000_000)
}

fn new_token() -> String {
    format!("{:032x}", rand::random::<u128>())
}

impl PhoneHub {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(HubState {
                code: new_code(),
                token: None,
                ip: None,
                status: PhoneStatus::default(),
                active_conn: 0,
                next_conn: 1,
                last_frame_at: None,
            }),
            frames: Inbox::new(),
            on_change: Mutex::new(None),
            subscribers: Mutex::new(Vec::new()),
        })
    }

    /// Called with the new link whenever the code or status changes
    /// (used to emit the "phone-link" Tauri event, which redraws the QR).
    pub fn set_change_listener(&self, f: impl Fn(PhoneLink) + Send + Sync + 'static) {
        *self.on_change.lock().unwrap() = Some(Box::new(f));
    }

    /// Receive every frame (e.g. to forward to the frontend). The callback
    /// returns `false` to unsubscribe.
    pub fn subscribe(&self, f: impl Fn(&PhoneFrame) -> bool + Send + Sync + 'static) {
        self.subscribers.lock().unwrap().push(Box::new(f));
    }

    fn update(&self, f: impl FnOnce(&mut HubState)) {
        f(&mut self.state.lock().unwrap());
        if let Some(listener) = self.on_change.lock().unwrap().as_ref() {
            listener(self.link());
        }
    }

    /// Checks a WebSocket's credentials without using them up.
    pub fn check(&self, code: Option<&str>, token: Option<&str>) -> Option<Auth> {
        let s = self.state.lock().unwrap();
        if token.is_some() && token == s.token.as_deref() {
            Some(Auth::Reconnect)
        } else if code == Some(s.code.as_str()) {
            Some(Auth::NewPairing)
        } else {
            None
        }
    }

    /// Makes a new pairing code and disconnects the current phone.
    pub fn new_pairing_code(&self) {
        self.update(|s| {
            s.rotate_code();
            s.token = None;
            s.drop_phone();
        });
    }

    pub fn set_listening(&self, ip: Option<String>, error: Option<String>) {
        self.update(|s| {
            s.status.listening = error.is_none();
            s.status.error = error;
            s.ip = ip;
        });
    }

    /// A phone opened the WebSocket. Credentials are checked again here, so
    /// two phones racing for one code can't both win. A new pairing spends
    /// the code (a fresh one is shown) and replaces any previous phone.
    pub fn connect(&self, code: Option<&str>, token: Option<&str>, device: String) -> Option<Connection> {
        let mut result = None;
        self.update(|s| {
            let reconnect = token.is_some() && token == s.token.as_deref();
            let pairing = !reconnect && code == Some(s.code.as_str());
            if !reconnect && !pairing {
                return;
            }
            if pairing {
                s.rotate_code();
                s.token = Some(new_token());
                s.status.pairings += 1;
            }
            s.drop_phone();
            let id = s.next_conn;
            s.next_conn += 1;
            s.active_conn = id;
            s.status.connected = true;
            s.status.device = Some(device);
            result = Some(Connection { id, token: s.token.clone().unwrap_or_default() });
        });
        result
    }

    pub fn disconnect(&self, conn: u64) {
        let is_active = self.state.lock().unwrap().active_conn == conn;
        if is_active {
            self.update(|s| {
                if s.active_conn == conn {
                    s.drop_phone();
                }
            });
        }
    }

    /// Accepts a JPEG from connection `conn`. Returns `false` if that
    /// connection is no longer the active one (it should hang up).
    pub fn push_frame(&self, conn: u64, jpeg: Vec<u8>) -> bool {
        let Some((width, height)) = jpeg_size(&jpeg) else { return true }; // skip a bad frame
        let size_changed;
        {
            let mut s = self.state.lock().unwrap();
            if s.active_conn != conn {
                return false;
            }
            let now = Instant::now();
            if let Some(prev) = s.last_frame_at {
                let inst = 1.0 / now.duration_since(prev).as_secs_f32().max(1e-3);
                s.status.fps = if s.status.fps == 0.0 { inst } else { s.status.fps * 0.9 + inst * 0.1 };
            }
            s.last_frame_at = Some(now);
            size_changed = (s.status.width, s.status.height) != (width, height);
            s.status.width = width;
            s.status.height = height;
        }
        if size_changed {
            self.update(|_| {});
        }
        let frame = PhoneFrame { jpeg: Arc::new(jpeg), width, height };
        self.subscribers.lock().unwrap().retain(|sub| sub(&frame));
        self.frames.put(frame);
        true
    }

    pub fn link(&self) -> PhoneLink {
        let s = self.state.lock().unwrap();
        let host = s.ip.clone().unwrap_or_else(|| "<laptop-ip>".into());
        let url = format!("https://{host}:{PORT}/?code={}", s.code);
        let qr_svg = qrcode::QrCode::new(url.as_bytes())
            .map(|qr| qr.render::<qrcode::render::svg::Color>().min_dimensions(220, 220).build())
            .unwrap_or_default();
        PhoneLink { url, code: s.code.clone(), qr_svg, status: s.status.clone() }
    }
}

/// Reads width and height from a JPEG's frame header without decoding it.
pub fn jpeg_size(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 4 || data[0] != 0xFF || data[1] != 0xD8 {
        return None;
    }
    let mut i = 2;
    while i + 9 < data.len() {
        if data[i] != 0xFF {
            return None;
        }
        let marker = data[i + 1];
        let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
        // SOF0..SOF15 hold the size, except DHT (C4), JPG (C8) and DAC (CC).
        if (0xC0..=0xCF).contains(&marker) && ![0xC4, 0xC8, 0xCC].contains(&marker) {
            let h = u16::from_be_bytes([data[i + 5], data[i + 6]]) as u32;
            let w = u16::from_be_bytes([data[i + 7], data[i + 8]]) as u32;
            return (w > 0 && h > 0).then_some((w, h));
        }
        i += 2 + len;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// SOI, an APP0 segment, then a baseline frame header for 640×360.
    fn tiny_jpeg() -> Vec<u8> {
        let mut j = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00];
        j.extend([0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0x68, 0x02, 0x80, 0x03]);
        j.extend([0u8; 12]);
        j
    }

    #[test]
    fn reads_jpeg_size() {
        assert_eq!(jpeg_size(&tiny_jpeg()), Some((640, 360)));
        assert_eq!(jpeg_size(b"not a jpeg"), None);
    }

    #[test]
    fn code_is_single_use() {
        let hub = PhoneHub::new();
        let code = hub.link().code;
        let first = hub.connect(Some(&code), None, "phone A".into()).expect("fresh code pairs");
        assert_ne!(hub.link().code, code, "pairing must change the code");
        assert!(hub.connect(Some(&code), None, "phone B".into()).is_none(), "a used code is refused");
        assert_eq!(hub.link().status.pairings, 1);
        assert!(hub.push_frame(first.id, tiny_jpeg()));
    }

    #[test]
    fn next_person_scans_new_code_and_takes_over() {
        let hub = PhoneHub::new();
        let a = hub.connect(Some(&hub.link().code), None, "phone A".into()).unwrap();
        let b = hub.connect(Some(&hub.link().code), None, "phone B".into()).unwrap();
        assert!(!hub.push_frame(a.id, tiny_jpeg()), "the old phone must hang up");
        assert!(hub.push_frame(b.id, tiny_jpeg()));
        assert!(hub.check(None, Some(&a.token)).is_none(), "the old phone's token is revoked");
        let link = hub.link();
        assert_eq!(link.status.device.as_deref(), Some("phone B"));
        assert_eq!((link.status.width, link.status.height), (640, 360));
        assert!(link.qr_svg.contains("<svg"));
    }

    #[test]
    fn paired_phone_reconnects_with_its_token() {
        let hub = PhoneHub::new();
        let a = hub.connect(Some(&hub.link().code), None, "phone A".into()).unwrap();
        let code_after = hub.link().code;
        hub.disconnect(a.id);
        assert_eq!(hub.check(None, Some(&a.token)), Some(Auth::Reconnect));
        let again = hub.connect(None, Some(&a.token), "phone A".into()).unwrap();
        assert_eq!(again.token, a.token);
        assert_eq!(hub.link().code, code_after, "a reconnect does not spend the code");
    }

    #[test]
    fn new_code_disconnects_and_revokes() {
        let hub = PhoneHub::new();
        let a = hub.connect(Some(&hub.link().code), None, "phone".into()).unwrap();
        hub.new_pairing_code();
        assert!(!hub.push_frame(a.id, tiny_jpeg()));
        assert!(hub.check(None, Some(&a.token)).is_none());
    }
}
