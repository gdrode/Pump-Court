# Phone Pairing in the Browser Prototype (`pumpCourt/`)

> **Module**: `pumpCourt/server/phoneSignal.ts`, `pumpCourt/server/tunnel.ts`, `pumpCourt/src/phoneLink.ts`, `pumpCourt/src/relayLink.ts`, `pumpCourt/src/AddCameraDialog.tsx`, `pumpCourt/phone.html`, `pumpCourt/src/phone/`
> **Key APIs**: WebRTC, `getUserMedia`, `fetch` long-polling, WebSocket, Screen Wake Lock, Cloudflare quick tunnel (`cloudflared`)
> **Related Documents**: [Phone Camera Overview](README.md), [Mobile Web Client](mobile-web-client.md), [HTTPS & TLS](https-and-tls.md)
> **Last Updated**: 2026-10-10

---

## 0. Two ways to pair

| Tab in **+ Add camera** | Works when | Video path | Leaves the laptop? |
| --- | --- | --- | --- |
| **Phone over Wi-Fi** (default) | phone and laptop can reach each other on the local network (phone hotspot is most reliable) | WebRTC, phone → laptop directly | No |
| **Any network** | always: any phone, any network, even mobile data | JPEG frames through a Cloudflare tunnel | Yes, encrypted, not stored |

Venue and school Wi-Fi usually blocks devices from talking to each other: the phone's page then loads forever. That is the case **Any network** exists for. The Wi-Fi tab's troubleshooting box links to it.

## 1. How it works (Phone over Wi-Fi)

The phone sends live video straight to the laptop over WebRTC on the local network. A small relay inside the Vite dev server only introduces the two devices; it never carries video.

1. Laptop: **+ Add camera → Phone over Wi-Fi** opens a pairing room and shows a QR code: `https://<laptop address>:5173/phone.html?room=<8-letter code>`.
2. Phone: scans it, accepts the certificate warning once, taps **Start camera**.
3. The relay passes the WebRTC offer, answer and ICE candidates between them.
4. Video flows phone → laptop directly. No STUN/TURN servers, so nothing leaves the network.

## 2. Two transports into the same rooms

| Side | Transport | Why |
| --- | --- | --- |
| Laptop page | WebSocket `/signal` | Desktop Chrome handles it fine |
| Phone page | HTTPS requests `/signal-http/{join,poll,send,leave}` | iPhone Safari often refuses WebSockets to a self-signed certificate even after the warning is accepted; plain requests work |

HTTP transport details:

- `POST /join {room, role}` → `{id}` or `{error}`. A phone can only join a room the laptop opened.
- `GET /poll?id=` long-polls up to 20 s and returns `{messages: [...]}`. Unknown id → `410`.
- `POST /send {id, data}` relays a signal; `POST /leave {id}` leaves (sent with `keepalive` when the phone page closes).
- A phone that stops polling for 15 s is dropped and the laptop gets `peer-left`.
- A second phone on the same code replaces the first, which gets `{type: "closed", code: 4000}`.

## 3. Finding the right address

`GET /api/lan` returns `{ips, addresses: [{address, iface, label}], bonjour, port}`:

- Addresses are ranked: phone hotspot (`172.20.10.x`, `192.168.43.x`) → Wi-Fi/Ethernet → VPN/virtual adapters last. Link-local `169.254.x.x` is skipped.
- `bonjour` is the Mac's `.local` name (e.g. `Alejandros-MacBook-Air.local`). iPhones resolve it without knowing the IP. `vite.config.ts` allows `.local` hosts.
- The dialog refreshes this list every 5 s, so switching the laptop onto a hotspot updates the QR code.

## 4. Seeing whether the phone got through

- When any phone loads `/phone.html?room=X`, the server sends the laptop `{type: "phone-visit", from: <phone IP>}`. The dialog shows **"✓ A phone reached this laptop"**.
- After 12 s with no visit, the dialog shows a troubleshooting list: compare the phone's IP prefix, iPhone hotspot steps (*Maximize Compatibility*, address should start `172.20.10.`), try the `.local` name, turn off VPNs, fall back to USB/Continuity Camera.

## 4b. Any network (internet link)

`server/tunnel.ts` runs a [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) on demand. No account needed; needs `brew install cloudflared` once.

1. Opening the **Any network** tab calls `POST /api/tunnel/start`; the server spawns `cloudflared tunnel --url https://localhost:<port> --no-tls-verify`.
2. The address (`https://<random>.trycloudflare.com`) is reported only after public DNS (1.1.1.1 / 8.8.8.8) resolves it, so a phone never scans a code that doesn't work yet. Usually ~9 s. The system resolver is avoided on purpose: asking it too early caches "not found" on the Mac.
3. QR → `https://<tunnel>/phone.html?room=<code>&mode=relay`. Real certificate, so no warning on any phone.
4. Phone (`mode=relay`): draws the camera to a 640-wide canvas and sends JPEG frames (quality 0.6, up to 30 fps) over `wss://<tunnel>/relay?role=phone`. Skips frames while more than 256 KB is still queued.
5. Laptop (`src/relayLink.ts`): listens on `/relay?role=host`, decodes the newest frame onto a canvas, and exposes `canvas.captureStream(0)` (one frame per `requestFrame()`), so the rest of the app treats it as a normal camera.
6. Removing the last internet phone calls `POST /api/tunnel/stop`.

Endpoints: `GET /api/tunnel` → `{status: off|starting|on|error|missing, url, error}`, `POST /api/tunnel/start`, `POST /api/tunnel/stop`.

**Guard**: any request that arrives through the tunnel (`cf-connecting-ip` header or a `*.trycloudflare.com` host) may only load `/phone.html`, `/src/phone/*`, Vite's client and `/relay`. Everything else, including source files, `/api/*` and the tunnel controls, returns 404.

Measured 2026-10-10: tunnel ready in ~9 s, phone page loads in ~1 s, relay sustains 30 fps (synthetic camera; a real camera is ~25–40 KB per frame, roughly 6–10 Mbit/s upload).

## 5. Running it

```bash
cd pumpCourt
npm run dev        # https://localhost:5173, on the network: needed for phones
npm run dev:local  # http://127.0.0.1:5173 only, no certificate: for previews that refuse self-signed certs; no phone pairing
```

## 6. Known limits

- Neither tab has been tested on a real iPhone yet (2026-10-10); both were tested with a simulated phone in Chromium.
- Any network adds internet latency (typically 100–300 ms) and needs upload bandwidth on the phone.
- Venue and school Wi-Fi often isolate devices; a phone hotspot is the reliable option.
- Each device shows a certificate warning once.
- The Rust app's phone page (`backend/src/phone/page.html`) streams JPEGs over a WebSocket to a self-signed server, so it may hit the same iPhone Safari WebSocket problem.
