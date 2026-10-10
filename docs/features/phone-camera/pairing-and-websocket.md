# Pairing Rooms, Signalling & Relay Protocol

> **Module**: `backend/src/phone/mod.rs`, `backend/src/phone/server.rs`, `backend/src/commands.rs`, `frontend/src/logic/tracker/phoneLink.ts`, `pumpCourt/src/phone/protocol.ts`  
> **Key Constants**: `PORT = 47800`, `POLL_HOLD = 20 s`, `HTTP_PEER_TIMEOUT = 15 s`, `RELAY_MAX_FRAME = 2 MB`  
> **Related Documents**: [Phone Camera Overview](README.md), [The Phone Page](mobile-web-client.md), [Internet Link](internet-link.md)  
> **Maintenance Status**: Active / Network Specification  

---

## 1. Rooms and codes

`PhoneHub` holds all pairing **rooms** in memory. A room has three slots: the **host** (the app window), one **phone** signalling over HTTP (same Wi-Fi), and one **relay** phone sending frames (any network).

- `phone_open` creates a room with a fresh **8-character code** from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no look-alikes `I`, `O`, `0`, `1`), e.g. `K7MX2PQA`.
- Codes the server accepts (`valid_room`): 4–32 letters or digits. Anything else is refused before lookup.
- A phone can only join a room the **laptop opened**. An unknown or closed code gets: "This pairing code has expired. Open "Add camera" on the laptop and scan the new code."
- Only `role: "phone"` may join over the network. The host side is the app window, over IPC only, so nobody on the network can act as the laptop.
- **One phone per room.** A second phone replaces the first: an HTTP phone gets `{type: "closed", code: 4000}`, a relay phone gets WebSocket close code 4000 ("Another phone took over this code").
- `phone_close` removes the room. Its phone gets `peer-left` and the code stops working. Every "Add camera" opens new rooms, so codes are single-use in practice.

---

## 2. The app window's side (IPC)

The app window never connects to the HTTPS server. It uses Tauri commands and **Channels**:

```typescript
// frontend/src/api/backend.ts
phoneOpen(onMessage, onFrame)   // invoke("phone_open", { events: Channel, frames: Channel }) → room code
phoneSignal(room, data)         // invoke("phone_signal", { room, data }): answer or ICE candidate
phoneClose(room)                // invoke("phone_close", { room })
```

```rust
// backend/src/phone/mod.rs
pub struct HostLink {
    pub events: Box<dyn Fn(Value) + Send + Sync>,   // JSON messages → events Channel
    pub frames: Box<dyn Fn(Vec<u8>) + Send + Sync>, // relay JPEGs → frames Channel (raw bytes)
}
```

Messages to the app window (`PhoneRoomMessage` in `frontend/src/api/types.ts`):

| Message | Meaning | `phoneLink.ts` status |
| :--- | :--- | :--- |
| `{type: "joined"}` | the room is open (sent at once by `phone_open`) | `waiting` |
| `{type: "phone-visit", from}` | a phone loaded `/phone.html?room=…`; `from` is its IP, or "`<ip>`, via the internet link" | (dialog shows "A phone reached this laptop") |
| `{type: "peer-joined"}` | a phone joined (HTTP or relay) | `connecting` |
| `{type: "signal", data}` | the phone's WebRTC offer, ICE candidate, or `{orientation}` (Wi-Fi) | (answered; orientation → `onOrientation`) |
| `{type: "orientation", rotation}` | any network: the clockwise turn (0/90/180/270) that makes the phone's picture upright | (`onOrientation`) |
| `{type: "peer-left"}` | the phone left, was swept, or its relay socket closed | `disconnected` |
| `{type: "error", message}` | – | `failed` |

`connected` comes from the WebRTC connection state (Wi-Fi) or from the first relay frame drawn (any network). WebRTC `failed` shows "Could not reach the phone. Put both on the same Wi-Fi or hotspot."

---

## 3. Phone · same Wi-Fi: HTTP signalling

Phones signal with plain HTTPS requests (long-polling) instead of a WebSocket, because iPhone Safari often refuses WebSockets to a self-signed certificate even after the warning was accepted.

| Route | Body / query | Reply |
| :--- | :--- | :--- |
| `GET /phone.html?room=<code>` | – | the phone page; also sends `phone-visit` to the room's host |
| `POST /signal-http/join` | `{room, role: "phone"}` | `{id}`, or `{error}` (expired code, 200) / `{error: "bad join"}` (400) |
| `GET /signal-http/poll?id=<id>` | – | `{messages: [...]}` after up to 20 s (`POLL_HOLD`); unknown id → **410** `{error: "gone"}` |
| `POST /signal-http/send` | `{id, data}` | `{ok: true}`; `data` goes to the host as `signal`; unknown id → 410 |
| `POST /signal-http/leave` | `{id}` | `{ok: true}`; host gets `peer-left`; unknown id → 410 |

- On join, the phone's queue gets `joined` and `peer-joined`. `peer-joined` tells the phone to create its WebRTC offer.
- A newer poll for the same id makes an older one return empty at once.
- A phone not heard from for 15 s (`HTTP_PEER_TIMEOUT`) and not currently polling is dropped by a sweep that runs every 5 s; the host gets `peer-left`.
- The phone sends `leave` with `keepalive` when the page closes, so the laptop knows at once.

```text
   Phone                          Rust PhoneHub                    App window (phoneLink.ts)
     │                                  │  ◀── phone_open ──────────────│  → "joined"
     │ GET /phone.html?room=K7MX2PQA ─▶ │ ── phone-visit ─────────────▶ │
     │ POST join {room, role:"phone"} ▶ │ ── peer-joined ─────────────▶ │  status "connecting"
     │ ◀─ poll: joined, peer-joined ─── │                               │
     │ POST send {sdp: offer} ────────▶ │ ── signal {sdp: offer} ─────▶ │  new RTCPeerConnection,
     │                                  │ ◀── phone_signal {sdp:answer} │  setRemote/answer
     │ ◀─ poll: signal {sdp: answer} ── │                               │
     │ POST send {candidate} ─────────▶ │ ── signal {candidate} ──────▶ │  (queued until the
     │ ◀─ poll: signal {candidate} ──── │ ◀── phone_signal {candidate} ─│   offer is applied)
     │                                  │                               │
     │ ════════════ WebRTC video, phone → app window directly ════════════▶ │ "connected"
```

Signal data (`SignalData`) is one of `{sdp}`, `{candidate}`, or, phone → laptop only, `{orientation: 0|90|180|270}`: the clockwise turn its picture needs (see [Phone on its side](README.md#5-phone-on-its-side-rotation)). Rust passes signal data on unchanged; `phoneLink.ts` ignores an orientation that is not 0/90/180/270.

`RTC_CONFIG` (`pumpCourt/src/phone/protocol.ts`) has **no STUN or TURN servers**, so the video never leaves the local network. On the laptop, a new offer always gets a fresh `RTCPeerConnection`, and signals are handled one at a time in order.

---

## 4. Phone · any network: the relay WebSocket

`GET /relay?room=<code>&role=phone` upgrades to a WebSocket.

- Bad room or a role other than `phone`: closed with code **4001** "bad join".
- Unknown room: the server sends `{type: "error", message}` then closes with **4002** "expired".
- On connect, the host and the phone both get `peer-joined`.
- Every **binary** message is one JPEG frame (max 2 MB, `RELAY_MAX_FRAME`). Rust passes it unchanged to the host's `frames` Channel. Frames from a replaced phone are dropped.
- A **text** message is a note from the phone. The only one is `{"type": "orientation", "rotation": 0|90|180|270}`. `PhoneHub::relay_text` checks it and sends `{type: "orientation", rotation}` to the host's `events` Channel. Anything else (bad JSON, another type, another angle, a replaced phone) is dropped. Test: `relay_orientation_reaches_the_laptop`.
- When the room closes, the phone gets `{type: "peer-left"}` and close code 1000. When the phone disconnects, the host gets `peer-left`.

In the app window, `relayCanvas()` (`phoneLink.ts`) decodes the newest frame with `createImageBitmap`, draws it on a canvas, and exposes `canvas.captureStream(0)` with one `requestFrame()` per phone frame. If decoding falls behind, older frames are skipped. The tracker then uses that stream like any other camera.

The tunnel that makes `/relay` reachable from anywhere is described in [Internet Link](internet-link.md).
