# Pump-Court app (camera and pose)

Browser app for the game laptop: camera feed, MediaPipe pose overlay, live
elbow/hip/knee angles, and the fast-rep go/no-go test. Video is processed live
and discarded; nothing is recorded or uploaded.

## First run

```bash
npm install      # also copies MediaPipe wasm to public/wasm and fetches models if missing
npm run dev      # open the printed http://localhost URL in Chrome
```

After `npm install`, tracking needs no network: wasm comes from `public/wasm`
(copied from `node_modules`, git-ignored) and models from `public/models`.

## Layout

| File | Role |
|---|---|
| `src/geometry.ts` | `angle(a, b, c)` helper |
| `src/pose.ts` | Landmark indices, side picking, `computeAngles` (plain TS, no camera) |
| `src/repLog.ts` | Per-frame log type, rep-bottom analysis, go/no-go verdict (plain TS) |
| `src/camera.ts` | `getUserMedia`, device list, saved camera choice |
| `src/landmarker.ts` | Creates the Pose Landmarker once (GPU, CPU fallback) |
| `src/draw.ts` | Skeleton, visibility and angle overlay |
| `src/RepChart.tsx` | Elbow angle and shoulder height plotted over time |
| `src/CameraTable.tsx` | Frame-rate table for the three camera options |

## Fast-rep test

1. Start log (or Space), player does 10 flat-out reps, Stop log.
2. The app finds each elbow bottom and checks the shoulder bottom lands within
   the sync window (default 120 ms). **Go** = at least 9 of 10 clear.
3. Export JSON to compare runs (`replog-*.json` is git-ignored; keep it off the repo).
   Load JSON re-plots a saved run, and the tuning fields re-run the analysis.

No smoothing is applied, on purpose.

## Tests

```bash
npm test
```
