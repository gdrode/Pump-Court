# Phone Camera Pairing & WebSocket Protocol

> **Module**: `backend/src/phone/mod.rs` and `backend/src/phone/server.rs`  
> **Key Constants**: `PORT = 47800`, `MAX_FRAME_BYTES = 2 * 1024 * 1024`  
> **Related Documents**: [Phone Camera Overview](README.md), [Mobile Web Client](mobile-web-client.md)  
> **Maintenance Status**: Active / Network Specification  

---

## 1. QR Code Pairing & Security Token

To prevent unauthorized spectators in the venue from broadcasting rogue feeds, access is guarded by a 6-digit cryptographic pairing code generated when the server boots:

```rust
let code = format!("{:06}", rand::random::<u32>() % 1_000_000);
let url = format!("https://{ip}:{PORT}/?code={code}");
```

- The pairing URL is rendered as an SVG vector QR code directly into `frontend/src/ui/components/PhoneLinkPanel.tsx`.
- Pressing **"New Code"** invalidates the existing token, severs any active connection, and renders a fresh QR code immediately.

---

## 2. WebSocket Handshake & Lifecycle

The streaming protocol operates over `wss://<laptop-ip>:47800/ws?code=<token>`.

```text
       Phone Browser                              Axum / PhoneHub
             │                                           │
             │ ─── GET /ws?code=654321 ────────────────▶ │
             │     (Token verification)                  │
             │                                           │
             │ ◀── HTTP 101 Switching Protocols ──────── │
             │                                           │
             │ ─── JSON: {"type":"hello","device":"…"} ─▶│
             │                                           │
             │ ◀── JSON: {"type":"welcome"} ──────────── │
             │                                           │
             │ ─── Binary WebSocket Message (JPEG) ────▶ │ ──▶ Decoded & Fan-Out
             │ ─── Binary WebSocket Message (JPEG) ────▶ │     (30 FPS)
             │ ─── Binary WebSocket Message (JPEG) ────▶ │
             │                                           │
             │ [If operator generates new code or phone replaces:]
             │ ◀── JSON: {"type":"replaced"} ─────────── │
             │ ─── TCP Close ─────────────────────────── │
```

---

## 3. Frame Ingestion & Validation Rules

1. **Payload Limit**: Frames larger than `MAX_FRAME_BYTES` (2 MB) are immediately dropped with an error log to protect memory. A 960×540 JPEG frame is typically only 40–80 KB.
2. **Dimension Extraction**: Rather than parsing the full JPEG into uncompressed RGBA pixel buffers in the networking layer, dimensions (`width`, `height`) are read rapidly from the JPEG SOF header.
3. **Connection Succession**: Only one phone may stream at any moment. If Phone B connects with the valid code while Phone A is actively streaming, Phone A receives `{"type":"replaced"}` and Phone B takes over without requiring a desktop app restart.
