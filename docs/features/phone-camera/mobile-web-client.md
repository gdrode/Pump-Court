# The Phone Page

> **Module**: `pumpCourt/phone.html`, `pumpCourt/src/phone/main.ts`, `pumpCourt/src/phone/protocol.ts`, built by `frontend/scripts/build-phone.mjs`, embedded by `backend/build.rs`  
> **Key APIs**: `getUserMedia`, `RTCPeerConnection`, `fetch` long-polling, `WebSocket`, `canvas.toBlob`, Screen Wake Lock  
> **Related Documents**: [Phone Camera Overview](README.md), [Pairing & Protocol](pairing-and-websocket.md), [Internet Link](internet-link.md)  
> **Maintenance Status**: Active / Client Specification  

---

## 1. Summary

The page the phone opens is the teammate's phone page, restyled to look like the game: same font, colours, hand-drawn borders and the dragon host. After a round it shows the player their stats and lets them post the score. The app builds it into **one HTML file** and bakes that file into the executable, so the Rust server can serve it without any other files.

```text
pumpCourt/phone.html  +  pumpCourt/src/phone/main.ts (imports protocol.ts)
          │  frontend/scripts/build-phone.mjs (esbuild: bundle, minify, inline the script)
          ▼
frontend/dist/phone.html            (one file)
          │  backend/build.rs copies it to OUT_DIR at compile time
          ▼
include_str!(…/phone.html) in backend/src/phone/server.rs  →  GET /phone.html
```

- `build-phone.mjs` runs at the end of `npm run build` and before Vite in `npm run dev`. It replaces `<script type="module" src="/src/phone/main.ts">` with the bundled script, and stops with an error if `phone.html` no longer contains that tag.
- It also gives the page the app's look: `<!-- app-style -->` becomes the Patrick Hand font (inlined as base64), `frontend/src/theme/tokens.css` and `styles.css`; `<!-- app-defs -->` becomes the sketch-border SVG filters plus the dragon in three moods (`<template id="dragon-wave|cheer|sad">`), rendered once with React from `ui/components/Dragon.tsx`; each `data-host="…"` box gets its dragon. The page is about 120 KB. Opened from the prototype's dev server (no build) it keeps working with plain colours.
- **Colours follow the app's rules** (see [Styling & Tokens](../frontend-ui/styling-and-tokens.md)): **purple** (Knight Hacks) is the main accent — the dragon's bandana, the *Start camera* / *Post my score* buttons, the wavy labels, the rank, and the pressed look of the other buttons. **Green** is only for good news ("Posted", the ready bubble), **red** only for bad news (failed post, camera errors). Change `--purple` in `tokens.css` and the phone follows on the next build.
- If `frontend/dist/phone.html` doesn't exist when Rust compiles, `build.rs` embeds a placeholder page that says "The phone page isn't built yet. On the laptop, run `npm run build` in the frontend folder, then rebuild the app."
- The page has a Content-Security-Policy `connect-src 'self'`: it can only talk back to the address it was loaded from.

---

## 2. What the phone does

1. Reads `room` and `mode` from the address. No room: "Missing pairing code. Scan the QR code on the laptop again." Not a secure page: "The camera needs https. Open the exact link from the QR code."
2. **Start camera** asks for motion permission (iOS only asks from a tap; declining is fine), then opens the rear camera (`facingMode: "environment"`), ideal 1280×720 at 30 fps (`PHONE_FPS`), sets `contentHint = "motion"`, and shows a preview. **Flip camera** switches front/back.
3. Asks for a **screen wake lock** so the phone doesn't sleep while streaming (asked again when the page becomes visible).
4. Connects in one of two ways:

### 2.1 Same Wi-Fi (no `mode` in the address): WebRTC
- `httpSignal(room, "phone", …)` joins the room over `/signal-http/*` and long-polls for messages.
- On `peer-joined` it creates an `RTCPeerConnection` (no STUN/TURN), adds the camera track, sends the offer first and then ICE candidates. Candidates that arrive before the laptop's answer are held and applied afterwards.
- Sender tuning: `degradationPreference = "maintain-framerate"`, `maxBitrate` 4 Mbit/s, `maxFramerate` 30. Fast reps need every frame, so detail drops before frame rate.
- Status: "Streaming to the laptop", or "Connection failed. Are the phone and laptop on the same Wi-Fi?"
- If signalling is lost while video is already flowing, the video keeps going (it doesn't need the server).

### 2.2 Any network (`mode=relay`): JPEG frames
- Opens `wss://<host>/relay?room=<code>&role=phone`.
- Every 1/30 s it draws the camera onto a canvas **640 px wide** (`RELAY_WIDTH`) and sends it as a JPEG at quality **0.6** (`RELAY_QUALITY`).
- It skips a frame while a previous one is still being encoded, or while more than **256 KB** is still waiting to be sent (`RELAY_BACKLOG`). That keeps the delay low on a slow connection.
- Status: "Streaming to the laptop (internet link)".

### 2.3 Which way up the phone is
- The page listens to `devicemotion` and keeps the latest gravity (`accelerationIncludingGravity` x/y). This works with rotation lock on. iOS reports the opposite sign, so the page flips it on iPhone/iPad.
- Every 0.7 s it works out the clockwise turn that makes its picture upright (0/90/180/270), from the tilt and the picture's shape (portrait or landscape). Flat on a table or mid-turn: no answer, the last one stands.
- It sends the turn only when it changes (and again after each reconnect): `{orientation}` as signal data on Wi-Fi, or the text message `{"type": "orientation", "rotation": …}` on the relay socket.
- The laptop turns the picture; see [Phone on its side](README.md#5-phone-on-its-side-rotation).

---

## 3. Stopping

| Event | Phone shows |
| :--- | :--- |
| Laptop closed the room (`peer-left`) | "The laptop closed this camera. Scan a new code to reconnect." |
| Another phone used the code (`closed` 4000 / close code 4000) | "Another phone took over this code." |
| Expired code | "This pairing code has expired. Open "Add camera" on the laptop and scan the new code." |
| Poll fails 4 times in a row (with growing waits) | "Lost contact with the laptop." |
| Relay socket drops | "Lost the connection to the laptop. Reload to try again." |

Closing or reloading the page sends `leave` with `keepalive`, closes the peer connection and the relay socket, and releases the wake lock.

---

## 4. After the round: stats and posting

In the Pump Court app, when the round ends the laptop lets the phone go as a camera and sends it a `round-over` note (see [Pairing](pairing-and-websocket.md)):

1. The phone **stops filming** (camera off, WebRTC closed or relay frames stopped) but keeps its link for the choice.
2. It shows the **stats card**, like the Results screen: mode, name, why the round ended, push-ups, attempts, perfect, rank, time, and the red lights per referee. The dragon cheers (or comforts after 0).
3. **Post my score** sends `{post: true}`; **Don't post** sends `{post: false}`. Posting is opt-in: nothing is on the leaderboard until someone posts it.
4. `post-status` notes update the card: "Posting…", "✓ Posted! You're #3 on the board." (also when the operator posted it: "(posted by the host)"), "Not posted. Only you saw this score.", "The host discarded this round.", or "Could not save the score. Try again."
5. The laptop closes the link a few seconds after the choice (or after 10 minutes). If it closes while the score is still waiting: "The laptop has moved on: this score was not posted."

In this mode, `peer-left`, `closed` and a dropped relay socket no longer reset the page to **Start camera**; the stats stay on screen.

---

## 5. Tips for the venue

- Prop the phone side-on to the player, in landscape. Rotation lock can stay on: the laptop turns the picture, and **⟳ Rotate** on the laptop fixes it if the automatic turn is wrong.
- Keep the page open and in front; the screen stays on while streaming.
- Plug the phone in for long sessions.
