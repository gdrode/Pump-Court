# HTTPS, Self-Signed TLS & Local Network Discovery

> **Module**: `backend/src/phone/server.rs`  
> **Key Types**: `axum_server::tls_rustls`, `rcgen::generate_simple_self_signed`  
> **Related Documents**: [Phone Camera Overview](README.md), [Pairing & Protocol](pairing-and-websocket.md)  
> **Maintenance Status**: Active / Security & Browser Compliance  

---

## 1. Why Local HTTPS is Mandatory

Modern mobile browsers (iOS WebKit / Safari and Android Google Chrome) implement strict security sandbox restrictions: **`navigator.mediaDevices.getUserMedia()` is blocked on non-secure origins**. The browser will refuse to access the camera hardware unless the page origin is `https://` (or `http://localhost`).

Because `localhost` on a smartphone points to the phone itself, the phone must access the laptop via its LAN IP address (e.g. `https://192.168.1.50:47800/`). Therefore, the laptop **must** serve HTTPS with TLS encryption.

---

## 2. On-the-Fly Self-Signed Certificate Generation

Public Certificate Authorities (like Let's Encrypt) do not issue certificates for private local IP subnets (`192.168.x.x` or `10.x.x.x`). Pump-Court generates its own ephemeral TLS certificate and private key in-memory upon launch using `rcgen`:

```rust
// In backend/src/phone/server.rs
let subject_alt_names = vec![
    "localhost".to_string(),
    local_ip.clone(),
];
let cert = rcgen::generate_simple_self_signed(subject_alt_names)?;
let cert_der = cert.cert.der();
let key_der = cert.key_pair.serialize_der();
```

- **Browser Warning**: Because the certificate is self-signed, mobile browsers display a standard warning ("This Connection is Not Private"). The athlete or operator taps *Advanced ➔ Proceed to site (unsafe)* once. The connection is still 100% encrypted over the air.

---

## 3. Local IP Interface Resolution

To construct the pairing URL encoded into the QR code, the server determines the laptop's outward-facing local IP address using `local_ip_address`:

```rust
let ip = local_ip_address::local_ip()
    .map(|ip| ip.to_string())
    .unwrap_or_else(|_| "127.0.0.1".into());
```

If the laptop is disconnected from all networks, the UI warns: *"No local network found. Connect to Wi-Fi or enable phone hotspot."*
