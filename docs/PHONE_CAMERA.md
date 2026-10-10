# Phone camera (QR code link)

A phone can be the camera, so it can sit on the floor next to the mat while
the laptop stays on the table. The **desktop app is the server**: the phone
only captures video and sends it to the laptop; all tracking, judging and
scoring happen on the laptop.

## How it works

```text
 Laptop (Pump Court desktop app)                         Phone
 ┌───────────────────────────────────────┐
 │ Settings → Phone camera shows a QR     │   1. scan QR
 │ code for https://<laptop-ip>:47800/?code=123456  ◀──────────── camera app
 │                                        │
 │ built-in HTTPS server (port 47800)     │   2. page loads in the phone's
 │   GET /      → camera page ───────────────────▶ browser (no app install)
 │   GET /ws    ← JPEG frames ◀────────────────── 3. "Start camera": ~30 fps
 │        │                               │
 │   PhoneHub ──▶ engine → referees → scores → leaderboard (SQLite)
 │        └────▶ frontend (preview, JS tracker)
 └───────────────────────────────────────┘
```

1. The operator opens **Settings (S) → Phone camera**. The app shows a QR code,
   the address and a 6-digit pairing code.
2. The phone scans the QR code. Its browser opens the camera page **served by
   the laptop**. Nothing is installed on the phone.
3. The phone shows a one-time "connection not private" warning (see HTTPS
   below): tap *Advanced → Proceed*.
4. Press **Start camera**. The page streams JPEG frames over a WebSocket.
   The settings screen shows "Connected: 960×540 at 30 fps".
5. Press **Use phone camera**. Rounds now use the phone feed.

Code: `backend/src/phone/` (server, hub, the phone page `page.html`) and
`frontend/src/ui/components/PhoneLinkPanel.tsx`.

## Questions this design answers

**Can it use `localhost`?** Not for the phone. `localhost` always means "this
same device", so on the phone it would point at the phone itself. The QR code
therefore holds the laptop's address on the local network (e.g.
`192.168.1.20`). Both devices must be on the same network: venue Wi-Fi, the
phone's hotspot, or a USB cable with tethering.

**Does it need a server or a database?** It needs a *server*, but that server is
built into the desktop app (Rust, `axum`), starts automatically, and runs only
on the local network. No internet and no cloud server are involved. The
connection needs **no database**: the pairing code and live status are kept in
memory. Scores already go to the app's **SQLite** database, which is plenty for
the demo and beyond (it is a single file on the laptop; `rusqlite` with the
`bundled` feature compiles SQLite into the app, so nothing needs installing).

**Why HTTPS and a warning?** Phone browsers only allow camera access on secure
(`https://`) pages. The app makes its own certificate when it starts. No public
authority has signed it (that is impossible for a local address), so the phone
warns once. The traffic is still encrypted.

**What stops someone else streaming?** The pairing code in the QR code, and it
is **single-use**: the moment a phone pairs, the laptop makes a new 6-digit code
and redraws the QR code. Anyone else who wants to be the camera scans the new
code, which takes over from the previous phone (that phone is told to rescan).
A used or wrong code is refused. **New code** also resets it by hand and
disconnects the current phone. Only one phone streams at a time.

The paired phone gets a private session token, so if Wi-Fi drops for a moment
it reconnects by itself without needing the spent code. A phone that has been
replaced stops and asks for a rescan.

**Why not Bluetooth?** Bluetooth Classic manages roughly 2 Mbps in practice; a
30 fps video stream that pose tracking can use needs about 7–12 Mbps, and fast
reps need the frame rate. Phone browsers also cannot stream a camera over
Bluetooth. Because this link is ordinary networking (IP), it also works over
Bluetooth *tethering* without code changes, just slowly. Wi-Fi or the phone
hotspot is the recommended setup.

## Setup checklist for the venue

* Laptop and phone on the same network. Simplest: turn on the phone's hotspot
  and join it from the laptop.
* Allow the app through the laptop firewall on first run (Windows and macOS
  ask). The port is **47800**.
* If the settings panel shows "No network connection found", the laptop is not
  on any network yet.
* Phone in landscape, side-on to the mat, about 1.5 m away. Keep the page open
  (the screen is kept awake while streaming).
* The phone page has a size picker: 640 px is fastest; 960 px is the default.

## Protocol (for anyone writing a native phone app later)

* Connect a WebSocket to `wss://<laptop-ip>:47800/ws?code=<pairing code>`.
  A used or wrong code gets HTTP 403.
* First message (text): `{"type":"hello","device":"<any label>"}`.
  The server answers `{"type":"welcome","token":"<session token>"}`, or
  `{"type":"refused"}` if another phone used the code first.
* To reconnect later, use `wss://<laptop-ip>:47800/ws?token=<session token>`
  instead of the code.
* Then send each frame as one **binary JPEG** message (max 2 MB). Width and
  height are read from the JPEG itself.
* If the server sends `{"type":"replaced"}`, another phone scanned the new
  code or the operator reset it; stop and rescan.

## Where frames go on the laptop

* `backend.subscribePhoneFrames(cb)` (TypeScript) hands every JPEG to the
  frontend, where the tracker (the MediaPipe JavaScript engine from
  `pumpCourt/`) finds the body and sends the landmarks back with
  `backend.pushPoseFrame`. See docs/INTEGRATION.md.
* `PhoneSource` (Rust) shows the phone video on the round screen and pairs
  each frame with the newest landmarks from the tracker. Until the tracker is
  plugged in, the video shows but nobody is found, so the ready check does not
  pass.
