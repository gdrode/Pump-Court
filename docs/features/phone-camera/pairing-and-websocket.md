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

---

## Browser app (`pumpCourt/`): WebRTC relay with HTTP fallback

> **Module**: `pumpCourt/server/phoneSignal.ts` (Vite plugin), `pumpCourt/src/phone/`, `pumpCourt/src/phoneLink.ts`, `pumpCourt/src/AddCameraDialog.tsx`

**Problem fixed:** scanning the QR code "led to nothing" on phones on the same
hotspot / Wi-Fi. iPhone Safari often refuses a WebSocket to a self-signed
certificate even after the warning is accepted.

**How it works now:**
- The video goes **phone → laptop directly** (WebRTC). The relay only passes
  the connection offers back and forth.
- Laptop page talks to the relay over **WebSocket** `/signal`.
- Phone page uses **plain HTTPS requests** instead:

| Request | Does |
|---|---|
| `POST /signal-http/join` | Join a room (room id: 4–32 letters/digits). Returns a peer `id`. |
| `GET /signal-http/poll?id=` | Long-poll: held up to **20 s** for messages. |
| `POST /signal-http/send` | Relay a message to the other side. |
| `POST /signal-http/leave` | Leave. Sent on `pagehide`, so the laptop knows at once when the tab closes. |

- A phone that stops polling for **15 s** is dropped. Unknown `id` → **410 gone**.
- `GET /api/lan` lists the laptop's network addresses (best first) plus its
  **Bonjour name** (`<name>.local`). The QR dialog lets the operator pick one.
  The by-name address helps iPhones / Macs when the number is wrong.
- **Diagnostics:** when a phone opens `/phone.html?room=…`, the laptop gets a
  `phone-visit` message (with the phone's IP), *before* Start is tapped. So the
  dialog shows whether the phone reached the laptop at all.
