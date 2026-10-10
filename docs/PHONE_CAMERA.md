# Phone camera (QR code link)

> 💡 **Notice for AI Agents and Developers**: This guide is part of the documentation suite. See the full feature documentation in [`docs/features/phone-camera/`](features/phone-camera/README.md), including [HTTPS & TLS](features/phone-camera/https-and-tls.md), [Pairing & Protocol](features/phone-camera/pairing-and-websocket.md), [Internet Link](features/phone-camera/internet-link.md) and [The Phone Page](features/phone-camera/mobile-web-client.md).

A phone can be the camera, so it can sit on the floor next to the mat while
the laptop stays on the table. The phone only films. Tracking, judging and
scoring all happen on the laptop. Nothing is installed on the phone and
nothing is recorded.

## How to connect

| Tab in **Add camera** | Works when | Video path |
| --- | --- | --- |
| **Phone (any network)** (default) | always, even on mobile data; needs `cloudflared` installed on the laptop and internet | JPEG frames through a Cloudflare tunnel → Rust → app window |
| **USB / system camera** | the camera is plugged in or built in | the computer's own camera list |

The second tab explains how to add a USB webcam, Continuity Camera or a
webcam app (DroidCam, Camo); those appear in the camera list by themselves.

The dialog opens on **Phone (any network)** and starts the tunnel straight
away.

**Wi-Fi pairing is not offered in the app.** An older "same Wi-Fi" link
(WebRTC, QR code pointing at the laptop's own address, self-signed
certificate) was removed from the dialog: only the any-network link was
tested at venues. Its code is still there (the `/signal-http/*` routes,
`phone_lan`, and the WebRTC handling in `phoneLink.ts`), but nothing in the
app opens it. It is untested.

## How pairing works

```text
 Laptop (Pump Court)                                          Phone
 ┌──────────────────────────────────────────────┐
 │ Camera screen → Add camera (A)                │  1. scan QR
 │ QR: https://<random>.trycloudflare.com/phone.html?room=K7MX2PQA&mode=relay
 │                                               │
 │ cloudflared tunnel → Rust HTTPS server (47800)│  2. page loads in the
 │   GET  /phone.html          → phone page ─────────▶ phone's browser
 │   WSS  /relay               ← JPEG frames ◀──────── 3. "Start camera"
 │        │ IPC (Tauri Channel)                  │
 │   app window: draws each frame ◀══════════════════ 4. streaming
 └──────────────────────────────────────────────┘
```

1. The operator opens the **Camera** screen (gear menu → **Camera settings**,
   or **S** on Home) and presses **A** (Add camera). The app starts the
   Cloudflare tunnel, opens a pairing room with an 8-character code and,
   once the tunnel is reachable (about 5–10 s), shows a QR code.
2. The phone scans it. Its browser opens the camera page through the tunnel.
   There is no certificate warning.
3. The phone taps **Start camera** and allows camera access.
4. The dialog shows "Connected" and closes. The phone becomes the camera in
   use.

Code: `backend/src/phone/` (rooms, server, tunnel, addresses),
`frontend/src/logic/tracker/{phoneLink.ts,usePhonePairing.ts}`,
`frontend/src/ui/components/AddCameraDialog.tsx`, and the phone page
`pumpCourt/phone.html` + `pumpCourt/src/phone/main.ts`.

## Questions this design answers

**Can it use `localhost`?** Not for the phone. On the phone, `localhost` is
the phone. The QR code holds the tunnel's public address instead, so the
phone and laptop don't need to share a network.

**Does it need a server or a database?** A small server is built into the
desktop app (Rust, `axum`) and starts by itself. Rooms live in memory only.
Scores go to the app's SQLite file as usual.

**Why HTTPS?** Phone browsers only open the camera on `https://` pages. The
tunnel address has a real certificate, so the phone shows no warning. (The
app also makes its own certificate at start-up for its local server; only
the unused Wi-Fi link would show it to a phone.)

**What stops someone else streaming?** A phone can only join a room the laptop
opened, using its code. Every "Add camera" opens a new room, and the room
closes when the dialog closes without a phone or when the camera is removed.
A second phone on the same code replaces the first (the first is told
"Another phone took over this code").

**Why plain HTTPS requests for the Wi-Fi signalling?** iPhone Safari often
refuses WebSockets to a self-signed certificate even after the warning was
accepted. This only matters for the Wi-Fi link, which the app no longer
offers. The any-network relay uses a WebSocket through the tunnel's real
certificate.

## Setup checklist for the venue

* Install `cloudflared` on the laptop: `brew install cloudflared`, or
  `winget install --id Cloudflare.cloudflared` on Windows.
* Laptop and phone both need internet (any network, mobile data is fine).
  The phone needs about 6–10 Mbit/s of upload.
* Allow the app through the laptop firewall on first run. The local port is
  **47800**.
* Phone in landscape, side-on to the mat. Keep the page open; the screen
  stays on while streaming.
* With rotation lock on, the phone still sends a portrait picture. The app
  turns it upright by itself (the phone reports its tilt). If the player
  still looks sideways, press **⟳ Rotate** on the camera picture. See
  [Phone on its side](features/phone-camera/README.md#5-phone-on-its-side-rotation).
