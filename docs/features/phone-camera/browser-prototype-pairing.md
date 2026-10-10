# From the Prototype's Pairing to the App's

> **Module**: prototype `pumpCourt/server/phoneSignal.ts`, `pumpCourt/server/tunnel.ts`, `pumpCourt/src/phoneLink.ts`, `pumpCourt/src/relayLink.ts`, `pumpCourt/src/AddCameraDialog.tsx`, `pumpCourt/src/useLane.ts`, `pumpCourt/phone.html`, `pumpCourt/src/phone/`; app `backend/src/phone/`, `frontend/src/logic/tracker/`, `frontend/src/ui/components/AddCameraDialog.tsx`  
> **Key APIs**: WebRTC, `getUserMedia`, `fetch` long-polling, WebSocket, `devicemotion`, Tauri Channels, Cloudflare quick tunnel (`cloudflared`)  
> **Related Documents**: [Phone Camera Overview](README.md), [Pairing & Protocol](pairing-and-websocket.md), [Internet Link](internet-link.md), [Mobile Web Client](mobile-web-client.md), [Browser Prototype Modes](../game-engine/browser-prototype-modes.md)  
> **Last Updated**: 2026-10-10  

---

## 1. Summary

Phone pairing was designed and tested in the teammate's standalone app (`pumpCourt/`), where a Vite dev-server plugin did the server work. The desktop app keeps the **same phone page** and the **same protocol**, and moves the server side into Rust so it runs inside the app. This page maps one to the other, for anyone changing either.

---

## 2. The tabs in **+ Add camera**

Both apps show the same three tabs, in this order:

| Tab | Works when | Video path | Leaves the laptop? |
| --- | --- | --- | --- |
| **Phone · any network** (default) | always: any phone, any network, even mobile data | JPEG frames through a Cloudflare tunnel | Yes, encrypted, not stored |
| **Phone · same Wi-Fi (offline)** | phone and laptop can reach each other on the local network (phone hotspot is most reliable) | WebRTC, phone → laptop directly | No |
| **USB / system camera** | webcams, Continuity Camera, webcam apps | the OS camera | No |

- Venue and school Wi-Fi usually blocks devices from talking to each other: the phone's page then loads forever. That is why **Phone · any network** is the default. The Wi-Fi tab's troubleshooting box links back to it.
- The prototype's Bluetooth tab was removed on 2026-10-10: Bluetooth cannot carry live video.
- In the prototype's co-op, each player's **+ Add camera** assigns the paired phone to that player. The desktop app has one camera at a time.

---

## 3. Where each piece went

| Job | Prototype (`pumpCourt/`) | Desktop app |
| :--- | :--- | :--- |
| Phone page | `phone.html`, `src/phone/main.ts`, served by Vite | same files, built into one HTML file (`frontend/scripts/build-phone.mjs`) and embedded (`backend/build.rs`) |
| HTTPS | `@vitejs/plugin-basic-ssl`, port 5173 | `rcgen` + `rustls` in `backend/src/phone/server.rs`, port **47800** |
| Rooms and phone signalling | `server/phoneSignal.ts` | `backend/src/phone/mod.rs` (`PhoneHub`) + `server.rs` routes |
| Phone routes | `/signal-http/{join,poll,send,leave}`, `/relay` | the same paths |
| Laptop side of a room | WebSocket `/signal` (`role: "host"`) | Tauri commands `phone_open` / `phone_signal` / `phone_close` and Channels |
| Laptop side of the relay | WebSocket `/relay?role=host` (`src/relayLink.ts`) | `frames` Channel from `phone_open` → `relayCanvas()` in `phoneLink.ts` |
| WebRTC on the laptop | `src/phoneLink.ts` | `frontend/src/logic/tracker/phoneLink.ts` (ported) |
| Address list | `GET /api/lan` | `phone_lan` command (`backend/src/phone/net.rs`) |
| Tunnel | `server/tunnel.ts`, `/api/tunnel/{start,stop}` | `backend/src/phone/tunnel.rs`, `tunnel_start` / `tunnel_status` / `tunnel_stop` |
| Tunnel guard | allows `/phone.html`, `/src/phone/*`, Vite's client, `/relay` | allows `/phone.html` and `/relay` only |
| Dialog | `src/AddCameraDialog.tsx` | `frontend/src/logic/tracker/usePhonePairing.ts` (logic) + `frontend/src/ui/components/AddCameraDialog.tsx` (look) |
| Picture rotation | `src/useLane.ts` (`rotation`, per player) | `frontend/src/logic/tracker/TrackerProvider.tsx` (per camera) + `CameraView` `rotatable` |
| Relay orientation note | `server/phoneSignal.ts` checks the text message (0/90/180/270) and passes it to the host WebSocket | `PhoneHub::relay_text` checks it (0/90/180/270) and forwards `{type: "orientation", rotation}` on the events Channel |

---

## 4. What stayed the same

- 8-character room codes; a phone can only join a room the laptop opened; a second phone replaces the first (`closed` / 4000).
- Long-poll holds 20 s; a phone silent for 15 s is dropped; unknown peer → HTTP 410.
- `phone-visit` when a phone loads the page; troubleshooting after 12 s without one.
- Addresses ranked: phone hotspot → Wi-Fi/Ethernet → VPN/virtual last; Bonjour `.local` name on a Mac; refreshed every 5 s.
- Tunnel address reported only after public DNS (1.1.1.1 / 8.8.8.8) resolves it.
- No STUN/TURN: Wi-Fi video never leaves the local network.
- The phone reports which way up it is, the same way in both (section 6).

## 5. What changed

- **The host is not on the network.** In the prototype the laptop page was just another WebSocket client, so the server had to trust `role: "host"`. In the app, only `role: "phone"` can join over the network; the host side is IPC.
- As in the prototype, the tunnel stops when the last internet phone is removed (or the dialog closes with none paired), and always when the app quits.
- **Port 47800**, not 5173, so it doesn't clash with the frontend dev server.

---

## 6. Camera on its side (landscape)

Players are easier to fit in frame with the phone on its side. With rotation lock on, the phone keeps sending a portrait picture, so the player appears lying sideways and the pose tracker can't follow them. The laptop turns the picture (prototype: `src/useLane.ts`, `rotation`; app: `TrackerProvider.tsx`).

- **Automatic**: the phone page (`src/phone/main.ts`, the same file in both) reads its tilt from `devicemotion` gravity every 0.7 s. This works with rotation lock on; iOS asks for motion permission on the Start tap. It compares the tilt with its picture's shape and sends the clockwise turn needed (0/90/180/270), only when it changes: `{orientation}` over the signalling channel (Wi-Fi) or `{type: "orientation", rotation}` as a text message on the relay (any network). The links remember the last value and replay it when the app takes over from the pairing dialog.
- **Manual**: **⟳ Rotate** turns the picture 90° clockwise; **auto** goes back to the phone's own value. Use it for USB cameras, or if automatic picks the wrong way (the gravity sign on some phones isn't certain). Prototype: on each player's stage until the clock starts. App: on the Camera screen, and on the round screen until the clock runs.
- The laptop draws the turned picture onto a canvas, tracks the pose on that canvas, and shows it instead of the video. Changing rotation restarts the side tracker and forgets the floor line.

Tested 2026-10-10 in the prototype with a simulated phone: upright tilt with a landscape picture → 90° auto, stage portrait; sideways tilt → 0°; manual cycling and auto reset. Not yet tested on a real phone.

---

## 7. Running the prototype

```bash
cd pumpCourt
npm run dev        # https://localhost:5173, on the network: needed for phones
npm run dev:local  # http://127.0.0.1:5173 only, no certificate, no phone pairing
npm test           # includes server/__tests__/phoneSignal.test.ts and relay.test.ts
```

## 8. Known limits

- Neither phone tab has been tested on a real iPhone yet (2026-10-10); both were tested with a simulated phone in Chromium.
- Any network adds internet latency (typically 100–300 ms) and needs upload bandwidth on the phone.
- Each device shows a certificate warning once on the Wi-Fi tab.
