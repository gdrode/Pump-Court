//! The optional internet link ("Any network" in Add camera), for phones that
//! can't reach the laptop over the local network (venue Wi-Fi often blocks
//! devices from seeing each other).
//!
//! It runs a Cloudflare quick tunnel (`cloudflared`, free, no account), which
//! gives the phone server a public https address with a real certificate, so
//! any phone on any network (even mobile data) opens the pairing page with no
//! warning. Off until the operator opens that tab. While it runs, video from a
//! phone using it passes through Cloudflare, encrypted and not stored.
//! Requests through the tunnel may only reach the phone page and the video
//! relay (see `server.rs`).

use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::net::UdpSocket;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TunnelState {
    Off,
    Starting,
    On,
    Error,
    /// cloudflared isn't installed.
    Missing,
}

#[derive(Debug, Clone, Serialize)]
pub struct TunnelStatus {
    pub status: TunnelState,
    pub url: Option<String>,
    pub error: Option<String>,
}

struct State {
    status: TunnelStatus,
    child: Option<Child>,
    /// Bumped on every start and stop, so a stale start can't overwrite a newer one.
    run: u64,
}

pub struct Tunnel {
    port: u16,
    state: Arc<Mutex<State>>,
}

fn install_hint() -> &'static str {
    if cfg!(windows) {
        "cloudflared is not installed. In a terminal run: winget install --id Cloudflare.cloudflared, then restart Pump Court."
    } else if cfg!(target_os = "macos") {
        "cloudflared is not installed. In a terminal run: brew install cloudflared"
    } else {
        "cloudflared is not installed. See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    }
}

fn cloudflared() -> String {
    let known = [
        "/opt/homebrew/bin/cloudflared",
        "/usr/local/bin/cloudflared",
        "/usr/bin/cloudflared",
        r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
        r"C:\Program Files\cloudflared\cloudflared.exe",
    ];
    known.iter().find(|p| std::path::Path::new(p).exists()).map_or("cloudflared".into(), |p| p.to_string())
}

/// Finds `https://<name>.trycloudflare.com` in a line of cloudflared's output.
pub fn find_url(line: &str) -> Option<String> {
    let start = line.find("https://")?;
    let rest = &line[start + 8..];
    let end = rest.find(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '.')).unwrap_or(rest.len());
    let host = &rest[..end];
    let name = host.strip_suffix(".trycloudflare.com")?;
    (!name.is_empty() && !name.contains('.')).then(|| format!("https://{host}"))
}

impl Tunnel {
    pub fn new(port: u16) -> Self {
        Self {
            port,
            state: Arc::new(Mutex::new(State {
                status: TunnelStatus { status: TunnelState::Off, url: None, error: None },
                child: None,
                run: 0,
            })),
        }
    }

    pub fn status(&self) -> TunnelStatus {
        self.state.lock().unwrap().status.clone()
    }

    /// Starts the tunnel (no-op while it runs). Poll [`Tunnel::status`] for the address.
    pub fn start(&self) -> TunnelStatus {
        let mut s = self.state.lock().unwrap();
        if s.child.is_some() {
            return s.status.clone();
        }
        s.run += 1;
        let run = s.run;
        let mut cmd = Command::new(cloudflared());
        // 127.0.0.1, not localhost: the phone server listens on IPv4 only, and on
        // Windows "localhost" can resolve to IPv6 first, so Cloudflare can't reach it.
        cmd.args(["tunnel", "--no-autoupdate", "--url", &format!("https://127.0.0.1:{}", self.port), "--no-tls-verify"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console pops up
        }
        match cmd.spawn() {
            Ok(mut child) => {
                s.status = TunnelStatus { status: TunnelState::Starting, url: None, error: None };
                let outputs: [Option<Box<dyn Read + Send>>; 2] = [
                    child.stdout.take().map(|o| Box::new(o) as Box<dyn Read + Send>),
                    child.stderr.take().map(|o| Box::new(o) as Box<dyn Read + Send>),
                ];
                s.child = Some(child);
                for out in outputs.into_iter().flatten() {
                    let state = self.state.clone();
                    std::thread::spawn(move || watch(state, run, out));
                }
            }
            Err(e) => {
                let missing = e.kind() == std::io::ErrorKind::NotFound;
                s.status = TunnelStatus {
                    status: if missing { TunnelState::Missing } else { TunnelState::Error },
                    url: None,
                    error: Some(if missing { install_hint().into() } else { e.to_string() }),
                };
            }
        }
        s.status.clone()
    }

    /// Stops the tunnel: the laptop is no longer reachable from outside.
    pub fn stop(&self) -> TunnelStatus {
        let mut s = self.state.lock().unwrap();
        s.run += 1;
        if let Some(mut child) = s.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        s.status = TunnelStatus { status: TunnelState::Off, url: None, error: None };
        s.status.clone()
    }
}

impl Drop for Tunnel {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Reads cloudflared's output until it prints its address, then waits for the
/// address to be reachable before reporting it.
fn watch(state: Arc<Mutex<State>>, run: u64, out: Box<dyn Read + Send>) {
    let mut url = None;
    for line in BufReader::new(out).lines() {
        let Ok(line) = line else { break };
        if url.is_none() {
            url = find_url(&line);
            if let Some(found) = url.clone() {
                let state = state.clone();
                std::thread::spawn(move || {
                    let ok = wait_until_reachable(&found, || state.lock().unwrap().run == run);
                    let mut s = state.lock().unwrap();
                    if s.run != run {
                        return;
                    }
                    s.status = if ok {
                        TunnelStatus { status: TunnelState::On, url: Some(found), error: None }
                    } else {
                        TunnelStatus {
                            status: TunnelState::Error,
                            url: None,
                            error: Some("The internet link started but never became reachable.".into()),
                        }
                    };
                });
            }
        }
    }
    // Output closed: cloudflared exited. Only report it if this is still the current run.
    let mut s = state.lock().unwrap();
    if s.run == run && s.child.is_some() {
        if let Some(mut child) = s.child.take() {
            let code = child.wait().ok().and_then(|c| c.code());
            s.status = TunnelStatus {
                status: TunnelState::Error,
                url: None,
                error: Some(format!("The internet link stopped (cloudflared exited with {}).", code.map_or("no code".into(), |c| c.to_string()))),
            };
        }
    }
}

/// cloudflared prints its address a few seconds before the name resolves on
/// the internet; a phone scanning that early gets "server not found". Wait
/// until public DNS (what phones use) knows the name, up to 45 s. The system
/// resolver is avoided on purpose: asking it too early caches "not found".
fn wait_until_reachable(url: &str, still_wanted: impl Fn() -> bool) -> bool {
    let host = url.trim_start_matches("https://");
    for _ in 0..45 {
        if !still_wanted() {
            return false;
        }
        if ["1.1.1.1:53", "8.8.8.8:53"].iter().any(|server| resolves(host, server)) {
            std::thread::sleep(Duration::from_millis(1500)); // let the edge finish routing to this tunnel
            return true;
        }
        std::thread::sleep(Duration::from_secs(1));
    }
    false
}

/// Asks one DNS server for an A record. True if it answered with at least one.
fn resolves(host: &str, server: &str) -> bool {
    let Ok(socket) = UdpSocket::bind("0.0.0.0:0") else { return false };
    let _ = socket.set_read_timeout(Some(Duration::from_secs(3)));
    let id: u16 = rand::random();
    let query = dns_query(id, host);
    if socket.send_to(&query, server).is_err() {
        return false;
    }
    let mut buf = [0u8; 512];
    match socket.recv(&mut buf) {
        Ok(n) => has_answer(&buf[..n], id),
        Err(_) => false,
    }
}

/// A standard recursive query for `host`'s A record.
fn dns_query(id: u16, host: &str) -> Vec<u8> {
    let mut q = Vec::with_capacity(32 + host.len());
    q.extend(id.to_be_bytes());
    q.extend([0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]); // recursion desired, 1 question
    for label in host.split('.').filter(|l| !l.is_empty()) {
        q.push(label.len().min(63) as u8);
        q.extend(label.bytes().take(63));
    }
    q.extend([0, 0, 1, 0, 1]); // end of name, type A, class IN
    q
}

/// The reply matches our id, has no error and carries at least one answer.
fn has_answer(reply: &[u8], id: u16) -> bool {
    reply.len() >= 12 && reply[..2] == id.to_be_bytes() && reply[3] & 0x0F == 0 && u16::from_be_bytes([reply[6], reply[7]]) > 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_address_in_cloudflared_output() {
        let line = "2026-10-10T10:00:00Z INF |  https://quiet-river-lamp.trycloudflare.com                    |";
        assert_eq!(find_url(line).as_deref(), Some("https://quiet-river-lamp.trycloudflare.com"));
        assert_eq!(find_url("INF Requesting new quick Tunnel on trycloudflare.com..."), None);
        assert_eq!(find_url("see https://www.cloudflare.com/website-terms/"), None);
    }

    #[test]
    fn builds_a_dns_query_and_reads_the_reply() {
        let q = dns_query(0xABCD, "a-b.trycloudflare.com");
        assert_eq!(&q[..4], &[0xAB, 0xCD, 0x01, 0x00]);
        assert_eq!(&q[12..16], &[3, b'a', b'-', b'b']);
        assert_eq!(&q[q.len() - 5..], &[0, 0, 1, 0, 1]);
        let mut reply = q.clone();
        reply[2] = 0x81;
        reply[3] = 0x80;
        assert!(!has_answer(&reply, 0xABCD), "no answers yet");
        reply[7] = 1;
        assert!(has_answer(&reply, 0xABCD));
        assert!(!has_answer(&reply, 0x1111), "someone else's reply");
        reply[3] = 0x83; // NXDOMAIN
        assert!(!has_answer(&reply, 0xABCD));
    }

    #[test]
    fn missing_cloudflared_is_reported() {
        if std::process::Command::new("cloudflared").arg("--version").output().is_ok() {
            return; // installed here: nothing to check
        }
        let t = Tunnel::new(1);
        let s = t.start();
        assert!(matches!(s.status, TunnelState::Missing | TunnelState::Starting), "{s:?}");
        t.stop();
        assert_eq!(t.status().status, TunnelState::Off);
    }
}
