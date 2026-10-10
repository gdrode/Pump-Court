# Internet Link ("Phone · any network")

> **Module**: `backend/src/phone/tunnel.rs`, `backend/src/phone/server.rs` (tunnel guard), `frontend/src/logic/tracker/usePhonePairing.ts` (`useInternetPairing`)  
> **Key Types**: `Tunnel`, `TunnelState`, `TunnelStatus`  
> **Related Documents**: [Phone Camera Overview](README.md), [Pairing & Protocol](pairing-and-websocket.md), [HTTPS & TLS](https-and-tls.md)  
> **Maintenance Status**: Active  

---

## 1. Summary

Venue and school Wi-Fi often stop devices from seeing each other, so a phone can't load the laptop's page. The **Phone · any network** tab, the default in **Add camera**, works around that with a free [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/): `cloudflared` gives the laptop's phone server a public `https://<random>.trycloudflare.com` address with a real certificate. Any phone on any network, even mobile data, can then open the page with no warning.

While it runs, the video of a phone using it passes through Cloudflare, encrypted and not stored. Use **Phone · same Wi-Fi (offline)** to keep everything on the local network.

---

## 2. Installing `cloudflared`

It is not bundled. Install it once on the laptop:

| OS | Command |
| :--- | :--- |
| macOS | `brew install cloudflared` |
| Windows | `winget install --id Cloudflare.cloudflared`, then restart Pump Court |
| Linux | see Cloudflare's downloads page |

The app looks in the usual install folders (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `C:\Program Files (x86)\cloudflared\`, `C:\Program Files\cloudflared\`) and then on the `PATH`. If it isn't found, the tab shows that install hint (status `missing`).

---

## 3. How it runs

1. Opening **Add camera** calls `tunnel_start` at once, because **Phone · any network** is the tab it opens on. It runs:
   ```text
   cloudflared tunnel --no-autoupdate --url https://localhost:47800 --no-tls-verify
   ```
   (on Windows without a console window). A second start while it runs does nothing.
2. Status becomes `starting`. The dialog polls `tunnel_status` every second.
3. Rust reads cloudflared's output for the `https://<name>.trycloudflare.com` address (`find_url`).
4. It then waits until **public DNS** (1.1.1.1 and 8.8.8.8, asked directly over UDP) knows the name, up to 45 s, then 1.5 s more for Cloudflare's edge. Only then does the status become `on` with the `url`. A phone scanning earlier would get "server not found". The system resolver is avoided on purpose: asking it too early caches "not found".
5. The QR code becomes `<url>/phone.html?room=<code>&mode=relay`. The phone page sees `mode=relay` and sends JPEG frames over `wss://<tunnel>/relay` (see [The Phone Page](mobile-web-client.md)).
6. If cloudflared exits, the status becomes `error` with "The internet link stopped (cloudflared exited with …)". If the address never resolves: "The internet link started but never became reachable."

```typescript
// TunnelStatus (frontend/src/api/types.ts)
{ status: "off" | "starting" | "on" | "error" | "missing"; url: string | null; error: string | null }
```

The app calls `tunnel_stop` when the dialog closes without an internet phone pairing (and none paired before), and when the last internet phone is removed (`releaseTunnel` in `TrackerProvider.tsx`). The tunnel is also always stopped when the app quits (`RunEvent::Exit` in `lib.rs`, and `Drop for Tunnel`), so the laptop is not reachable from outside after the app closes.

---

## 4. The tunnel guard

Everything that arrives through the tunnel is from the internet. A middleware in `server.rs` (`tunnel_guard`) recognises those requests by:
- a `cf-connecting-ip` header, or
- a `host` header, or a host in the URI (HTTP/2), ending in `.trycloudflare.com`.

Such requests may only reach **`/phone.html`** and **`/relay`**. Everything else, including the `/signal-http/*` routes, returns 404. The tunnel can't be controlled from outside either: starting and stopping it are Tauri commands, not web routes.

The phone page is a single HTML file with its script inlined, so it needs nothing else from the server.

---

## 5. Performance

Measured in the prototype on 2026-10-10: tunnel ready in about 9 s, phone page loads in about 1 s, relay keeps up with 30 fps (synthetic camera). A real camera frame at 640 px wide, quality 0.6, is roughly 25–40 KB, so the phone needs about 6–10 Mbit/s of upload. Expect 100–300 ms of extra delay compared with Wi-Fi.
