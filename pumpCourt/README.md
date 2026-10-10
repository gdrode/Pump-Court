# Pump-Court app

Browser app for the game laptop: camera feed (laptop, USB or a phone over
Wi-Fi), MediaPipe pose tracking, and a three-light push-up referee. Video is
processed live and discarded; nothing is recorded or uploaded.

## First run

```bash
npm install      # also copies MediaPipe wasm to public/wasm and fetches the model if missing
npm run dev      # open https://localhost:5173 in Chrome
```

The dev server uses HTTPS with a self-signed certificate (phones need HTTPS to
open their camera), so each browser shows a warning once: choose to continue.
It also listens on the local network so phones can reach it.

After `npm install`, tracking needs no internet. The page's Content-Security-Policy
only allows connections back to the laptop, which also blocks MediaPipe's
built-in usage logging.

## Using it

1. Pick a camera, or **+ Add camera** → *Phone over Wi-Fi* and scan the QR code.
   Phone and laptop must be on the same network (a hotspot is most reliable).
2. Choose a difficulty, press **Start judging**. Each rep lights three lights:
   **Depth** (chest to floor), **Torso** (straight body), **Lockout** (straight arms).
   2–3 white = counts (ding), 3 white = perfect, fewer = no rep (buzzer).
3. **Stop judging** shows accuracy, perfect push-ups and attempts, with every rep's faults.

**Diagnostics** (collapsed) has frame rates, live angles, the fast-rep go/no-go
test, the camera frame-rate table, and *Judge this log* to replay a recorded log
through the referee at any difficulty.

## Layout

| File | Role |
|---|---|
| `src/geometry.ts` | `angle(a, b, c)` |
| `src/pose.ts` | Tracked-side selection, angles and depth (plain TS) |
| `src/judge.ts` | The referee: rep segmentation, three lights, difficulty, summary (plain TS) |
| `src/repLog.ts` | Fast-rep log, rep-bottom analysis, log replay (plain TS) |
| `src/camera.ts` | `getUserMedia`, device list, saved camera |
| `src/landmarker.ts` | Pose Landmarker (full model), GPU with CPU fallback |
| `src/draw.ts` | Skeleton overlay (tracked side only, no numbers) |
| `src/sfx.ts` | Ding and buzzer, synthesised with Web Audio |
| `src/Judging.tsx` | Lights, counters, controls, session report |
| `src/AddCameraDialog.tsx`, `src/phoneLink.ts` | Pairing a phone (laptop side) |
| `phone.html`, `src/phone/` | The page the phone opens |
| `server/phoneSignal.ts` | Vite plugin: WebSocket relay that introduces phone and laptop |

## Tests

```bash
npm test
```
