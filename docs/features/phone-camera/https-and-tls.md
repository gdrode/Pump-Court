# HTTPS, Self-Signed Certificate & Laptop Addresses

> **Module**: `backend/src/phone/server.rs`, `backend/src/phone/net.rs`  
> **Key Types**: `ServerStatus`, `LanAddress`, `LanInfo`, `axum_server::tls_rustls::RustlsConfig`  
> **Related Documents**: [Phone Camera Overview](README.md), [Pairing & Protocol](pairing-and-websocket.md), [Internet Link](internet-link.md)  
> **Maintenance Status**: Active / Security & Browser Compliance  

---

## 1. Why HTTPS

Phone browsers only allow `getUserMedia()` (the camera) on secure pages: `https://`, or `http://localhost`. On a phone, `localhost` is the phone itself, so the phone must open the laptop by its network address, and that address must be HTTPS.

The server starts with the app (`phone::server::run`, spawned in `lib.rs`) and listens on **`0.0.0.0:47800`** (`PORT` in `phone/mod.rs`) for HTTPS only. Allow the app through the laptop firewall on first run.

---

## 2. The self-signed certificate

No public authority signs certificates for addresses like `192.168.1.20`. So at every start-up the app makes its own, in memory, with `rcgen`:

```rust
// backend/src/phone/server.rs
let _ = rustls::crypto::ring::default_provider().install_default();
let mut names: Vec<String> = net::lan_addresses().into_iter().map(|a| a.address).collect();
names.extend(net::bonjour_name());   // e.g. "Alexs-MacBook.local" on a Mac
names.push("localhost".into());
let cert = rcgen::generate_simple_self_signed(names)?;
let tls = RustlsConfig::from_pem(cert.cert.pem().into_bytes(), cert.key_pair.serialize_pem().into_bytes()).await?;
```

- TLS is `rustls` with the `ring` crypto provider, served by `axum-server`.
- The certificate covers every address the laptop had at start-up, the Bonjour name and `localhost`. If the laptop joins a new network later, the phone still connects but its warning may mention a name mismatch.
- Each phone shows "This connection is not private" once: Safari *Show Details → visit this website*, Chrome *Advanced → Proceed*. The traffic is still encrypted.
- If the server cannot start (for example port 47800 is taken), the error is kept in `ServerStatus` and shown in the Add camera dialog: "The phone camera server could not use port 47800: …".

The **Phone (any network)** link needs none of this on the phone: the Cloudflare tunnel has a real certificate. See [Internet Link](internet-link.md).

---

## 3. Which address goes in the QR code (`net.rs`)

`phone_lan` returns `LanInfo { addresses, bonjour, port, error }`. `lan_addresses()` lists the laptop's IPv4 addresses, best first:

| Rank | Kind | How it is recognised | Label shown |
| :--- | :--- | :--- | :--- |
| 0 | Phone hotspot | address starts `172.20.10.` (iPhone) or `192.168.43.` (Android) | "phone hotspot" |
| 1 | Wi-Fi or Ethernet | adapter name starts `en`, `wl`, `eth`, `wi-fi`, `wifi`, `wireless`, `ethernet`, `local area connection` | "Wi-Fi or Ethernet" |
| 1 | Other adapter | anything else | "network adapter" |
| 2 | VPN or virtual | `utun`, `tun`, `tap`, `bridge`, `awdl`, `docker`, `veth`, `vmnet`, `vboxnet`, `vEthernet`, `tailscale`, `wg`, … | "VPN or virtual adapter: phones usually cannot reach this" |

Loopback, link-local (`169.254.x.x`) and unspecified addresses are left out. Duplicates are removed.

`bonjour_name()` (macOS only) asks `scutil --get LocalHostName` and returns e.g. `Alexs-MacBook.local`. iPhones find a `.local` name without knowing the number.

### On the Add camera dialog's Wi-Fi tab (removed from the app; kept for reference)
- The first address is used by default. If there are several (or a Bonjour name), a drop-down "Address in the code" lets the operator pick another.
- Until a phone reaches the laptop, the list is refreshed every 5 s, so joining a hotspot updates the QR code by itself.
- With no address at all: "This laptop isn't on a network. Join Wi-Fi or a phone's hotspot; this list refreshes by itself."
- The troubleshooting list shows the first three parts of the chosen address (e.g. `192.168.1.`): the phone's own address should start the same way.

---

## 4. Other protections

- Request bodies are limited to 256 KB (`MAX_BODY`); relay frames to 2 MB (`RELAY_MAX_FRAME`).
- Signalling replies carry `cache-control: no-store`.
- Requests arriving through the Cloudflare tunnel may only reach `/phone.html` and `/relay` (the **tunnel guard**, see [Internet Link](internet-link.md#4-the-tunnel-guard)).
