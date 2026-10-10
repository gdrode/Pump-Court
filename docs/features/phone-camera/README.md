# Feature 04: Phone Cameras

> **Module**: `backend/src/phone/` (`mod.rs`, `server.rs`, `net.rs`, `tunnel.rs`), `frontend/src/logic/tracker/` (`phoneLink.ts`, `usePhonePairing.ts`, `TrackerProvider.tsx`), `frontend/src/ui/components/AddCameraDialog.tsx`, `CameraView.tsx`, the phone page `pumpCourt/phone.html` + `pumpCourt/src/phone/`  
> **Key Types**: `PhoneHub`, `HostLink`, `LanInfo`, `TunnelStatus`, `PhoneLink`, `PhoneRoomMessage`  
> **Related Documents**: [HTTPS & TLS](https-and-tls.md), [Pairing & Protocol](pairing-and-websocket.md), [Internet Link](internet-link.md), [The Phone Page](mobile-web-client.md), [Prototype → App Port](browser-prototype-pairing.md)  
> **Maintenance Status**: Active / Core Event Capability  

---

## 1. Summary

A phone can be the camera, so it sits on the floor by the mat while the laptop stays on the table. The player or operator scans a QR code; the phone's browser opens a page served by the laptop and streams its camera. No app is installed and nothing is recorded.

The phone code was ported from the teammate's prototype (a Vite dev-server plugin) to Rust, so it runs inside the desktop app. The laptop side of each connection runs in the app window and talks to Rust over IPC.

```text
 ┌──────────────────────────── LAPTOP (Pump Court) ─────────────────────────────┐
 │ Camera screen ─▶ Add camera ─▶ phone_open() ─▶ room code "K7MX2PQA"          │
 │                                                                               │
 │ Rust HTTPS server, port 47800 (axum + rustls, self-signed cert)               │
 │   GET  /phone.html?room=…           the phone page (built in)                 │
 │   POST /signal-http/{join,send,leave}, GET /signal-http/poll   Wi-Fi signalling│
 │   GET  /relay?room=…&role=phone     JPEG frames + orientation (any network)   │
 │          │                                                                    │
 │      PhoneHub (rooms) ──IPC: events Channel, frames Channel, phone_signal──┐  │
 │                                                                            ▼  │
 │ App window: phoneLink.ts                                                      │
 │   Wi-Fi:       RTCPeerConnection ◀═════ WebRTC video straight from the phone  │
 │   any network: JPEG → canvas → captureStream() ─▶ a normal MediaStream        │
 │   ─▶ TrackerProvider uses it like any camera                                  │
 └───────────────────────────────────────▲───────────────────────────────────────┘
                                         │ local Wi-Fi / hotspot, or Cloudflare tunnel
 ┌───────────────────────────────────────┴───────────────────────────────────────┐
 │ PHONE: scan QR ─▶ browser opens the page ─▶ "Start camera"                    │
 └────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The two links

| Add camera tab | Address in the QR code | Video path | Signalling |
| :--- | :--- | :--- | :--- |
| **Phone (any network)** (default) | `https://<random>.trycloudflare.com/phone.html?room=<code>&mode=relay` | JPEG frames over `wss://…/relay` → Rust → Tauri Channel → app window | none needed |
| ~~Phone · same Wi-Fi (offline)~~ (not offered in the app; code kept) | `https://<laptop address>:47800/phone.html?room=<code>` | WebRTC, phone → app window, no STUN/TURN, never leaves the local network | `/signal-http/*` ↔ room ↔ IPC |

Venue and school Wi-Fi often stop devices from seeing each other; the phone page then never loads. That is why **Phone (any network)** is the only phone tab: it works on every network, even mobile data. It needs `cloudflared` installed on the laptop and an internet connection. See [Internet Link](internet-link.md). The old same-Wi-Fi tab was removed from the dialog (untested at events); its server code is still there.

The third tab, **USB / system camera**, is help text plus a "Refresh camera list" button. USB webcams, Continuity Camera and webcam apps (DroidCam, Camo) appear as system cameras by themselves.

---

## 3. Files

```text
backend/src/phone/
├── mod.rs      PhoneHub: pairing rooms, codes, HTTP peers, relay phones, PORT = 47800
├── server.rs   axum HTTPS server: routes, self-signed cert, tunnel guard, embedded page
├── net.rs      laptop addresses for the QR code, ranked; macOS Bonjour name
└── tunnel.rs   Cloudflare quick tunnel ("Phone (any network)")
backend/build.rs            embeds frontend/dist/phone.html into the app
frontend/scripts/build-phone.mjs   builds pumpCourt/phone.html + src/phone/main.ts into one file
frontend/src/logic/tracker/phoneLink.ts        laptop side of one phone (WebRTC or relay)
frontend/src/logic/tracker/usePhonePairing.ts  Add camera logic: room, QR, addresses, tunnel
frontend/src/ui/components/AddCameraDialog.tsx the dialog
pumpCourt/phone.html, pumpCourt/src/phone/{main,protocol}.ts   the phone page
```

---

## 4. Life of a phone camera

1. **Add camera** opens on **Phone (any network)**: it opens a room (`phone_open`) and starts the tunnel straight away, then shows the QR code. The other tab is **USB / system camera**. Tabs stay mounted once opened, so a code a phone is scanning stays valid while the operator switches tabs.
2. The phone loads the page. Rust tells the app `phone-visit` with the phone's address, and the dialog shows "✓ A phone reached this laptop".
3. (The 12 s no-visit hint belonged to the removed Wi-Fi tab.)
4. The phone taps **Start camera**; video starts; status goes to "Connected". The dialog closes after 1.2 s and the phone is added to the camera list as "Phone 1", "Phone 2"… and becomes the camera in use.
5. If the phone drops, the camera list marks it "disconnected", and the camera view (or, on other screens, a red banner) says so. The room stays open: if the phone page is reloaded, it joins the same room again and brings a new stream.
6. Removing the phone (× in the camera list) closes the room; the phone is told and the code stops working.
7. **When a round ends**, the phone that filmed it is let go (`releasePhone`): it leaves the camera list (player 1 falls back to the default camera), so the next player pairs their own phone. Its room stays open a little longer: the laptop sends the round's stats (`phone_notify`, a `round-over` note), the phone stops filming and shows them with **Post my score / Don't post**, and the choice comes back (`{post}`). The room closes a few seconds after the choice, or after 10 minutes. With **Fixed camera** on (gear menu, or key F on home) none of this happens: the phone keeps filming for the next player and the score is posted at once. See [The Phone Page](mobile-web-client.md#4-after-the-round-stats-and-posting).

The pairing dialog closes 1.2 s after "Connected" on every screen (its timer no longer restarts when a busy screen, like the Duel's clock, redraws).

---

## 5. Phone on its side (rotation)

A phone propped on its side with rotation lock on still sends a portrait picture, so the player appears lying sideways and the pose tracker can't follow them. The laptop turns the picture (ported from `pumpCourt/src/useLane.ts`).

- **Automatic**: the phone page reads gravity (`devicemotion`), compares it with its picture's shape, and sends the clockwise turn it needs (0/90/180/270) when it changes. Same Wi-Fi: as signal data `{orientation}` through the room. Any network: as a relay text message `{type: "orientation", rotation}`, which `PhoneHub::relay_text` checks and forwards to the app window on the events Channel. `phoneLink.ts` keeps the last value and replays it when the camera list takes the link over from the pairing dialog. It becomes `PhoneCamera.rotationHint`.
- **Manual**: the camera picture has **⟳ Rotate** (90° clockwise) and, once used, **auto** (back to the phone's value). A label shows the turn, e.g. "90° auto". The override is kept per camera. It is shown on the Camera screen, and on the round screen until the clock runs. Use it for USB cameras too.
- When the turn is not 0, `TrackerProvider` draws the turned picture on a canvas (`canvas.camera-view__frame`), tracks the pose on it, and shows it instead of the video. A new turn restarts the side tracker and forgets the floor line.
- iOS asks for motion permission on the **Start camera** tap. If it is declined, **⟳ Rotate** still works.
- Both pairing panels in **Add camera** carry a tip under the code: "Phone on its side? The picture turns upright by itself; if not, use ⟳ Rotate on the camera picture."

---

---

## 6. Limits

- One phone per room. A second phone on the same code replaces the first.
- No certificate warning: the tunnel uses Cloudflare's certificate.
- The any-network link adds internet delay (typically 100–300 ms) and needs upload bandwidth on the phone.
- Neither link has been tested on a real iPhone yet (2026-10-10); both were tested with a simulated phone in Chromium in the prototype. Automatic rotation has not been tested on a real phone either; the gravity sign on some phones isn't certain.
