# Phone camera (QR code link)

> 💡 **Notice for AI Agents and Developers**: This guide is part of the documentation suite. See the full feature documentation in [`docs/features/phone-camera/`](features/phone-camera/README.md), including [HTTPS & TLS](features/phone-camera/https-and-tls.md), [Pairing & Protocol](features/phone-camera/pairing-and-websocket.md), [Internet Link](features/phone-camera/internet-link.md) and [The Phone Page](features/phone-camera/mobile-web-client.md).

A phone can be the camera, so it can sit on the floor next to the mat while
the laptop stays on the table. The phone only films. Tracking, judging and
scoring all happen on the laptop. Nothing is installed on the phone and
nothing is recorded.

## Two ways to connect

| Tab in **Add camera** | Works when | Video path |
| --- | --- | --- |
| **Phone · any network** (default) | always, even on mobile data; needs `cloudflared` installed on the laptop and internet | JPEG frames through a Cloudflare tunnel → Rust → app window |
| **Phone · same Wi-Fi (offline)** | phone and laptop can reach each other on the local network (a phone hotspot is most reliable) | WebRTC, phone → app window directly; never leaves the network |

A third tab, **USB / system camera**, explains how to add a USB webcam,
Continuity Camera or a webcam app (DroidCam, Camo); those appear in the
camera list by themselves.

The dialog opens on **Phone · any network** and starts the tunnel straight
away. The Wi-Fi tab opens its pairing room only when picked.

## How Wi-Fi pairing works

```text
 Laptop (Pump Court)                                          Phone
 ┌──────────────────────────────────────────────┐
 │ Camera screen (S) → Add camera (A)            │  1. scan QR
 │ QR: https://<laptop>:47800/phone.html?room=K7MX2PQA ◀──── camera app
 │                                               │
 │ Rust HTTPS server (port 47800)                │  2. page loads in the
 │   GET  /phone.html          → phone page ─────────▶ phone's browser
 │   POST /signal-http/join    ← joins the room ◀──── 3. "Start camera"
 │   GET  /signal-http/poll    → answer, ICE ────────▶
 │   POST /signal-http/send    ← offer, ICE ◀────────
 │        │ IPC (Tauri Channel / phone_signal)   │
 │   app window: RTCPeerConnection ◀═══ WebRTC video ═══ 4. streaming
 └──────────────────────────────────────────────┘
```

1. The operator opens the **Camera** screen (**S** on Home) and presses
   **A** (Add camera), then picks **Phone · same Wi-Fi (offline)**. The app
   opens a pairing room with an 8-character code and shows a QR code.
2. The phone scans it. Its browser opens the camera page **served by the
   laptop**.
3. The phone shows a one-time certificate warning: Safari *Show Details →
   visit this website*; Chrome *Advanced → Proceed*.
4. The phone taps **Start camera**. The dialog shows "A phone reached this
   laptop", then "Connected", and closes. The phone becomes the camera in use.

Code: `backend/src/phone/` (rooms, server, tunnel, addresses),
`frontend/src/logic/tracker/{phoneLink.ts,usePhonePairing.ts}`,
`frontend/src/ui/components/AddCameraDialog.tsx`, and the phone page
`pumpCourt/phone.html` + `pumpCourt/src/phone/main.ts`.

## Questions this design answers

**Can it use `localhost`?** Not for the phone. On the phone, `localhost` is
the phone. The QR code holds the laptop's network address. The dialog ranks
the laptop's addresses (phone hotspot first, VPNs last) and lets the
operator pick another one, or the Mac's `.local` name.

**Does it need a server or a database?** A small server is built into the
desktop app (Rust, `axum`) and starts by itself. Rooms live in memory only.
Scores go to the app's SQLite file as usual.

**Why HTTPS and a warning?** Phone browsers only open the camera on `https://`
pages. The app makes its own certificate at start-up; no public authority can
sign one for a local address, so each phone warns once. The traffic is still
encrypted. The **Phone · any network** link has a real certificate, so no warning.

**What stops someone else streaming?** A phone can only join a room the laptop
opened, using its code. Every "Add camera" opens a new room, and the room
closes when the dialog closes without a phone or when the camera is removed.
A second phone on the same code replaces the first (the first is told
"Another phone took over this code").

**Why plain HTTPS requests instead of a WebSocket for signalling?** iPhone
Safari often refuses WebSockets to a self-signed certificate even after the
warning was accepted. Ordinary requests work.

## Setup checklist for the venue

* Laptop and phone on the same network. Simplest: turn on the phone's
  hotspot and join it from the laptop (iPhone: turn on *Maximize
  Compatibility*).
* Allow the app through the laptop firewall on first run. The port is
  **47800**.
* If Wi-Fi pairing never loads on the phone, use **Phone · any network** (install
  `cloudflared` first: `brew install cloudflared`, or
  `winget install --id Cloudflare.cloudflared` on Windows).
* Phone in landscape, side-on to the mat. Keep the page open; the screen
  stays on while streaming.
* With rotation lock on, the phone still sends a portrait picture. The app
  turns it upright by itself (the phone reports its tilt). If the player
  still looks sideways, press **⟳ Rotate** on the camera picture. See
  [Phone on its side](features/phone-camera/README.md#5-phone-on-its-side-rotation).
