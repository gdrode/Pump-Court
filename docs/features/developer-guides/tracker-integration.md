# Motion Tracker Integration

> **Module**: `pumpCourt/src/` (imported as `@tracker/…`), `frontend/src/logic/tracker/TrackerProvider.tsx`, `frontend/src/logic/useRound.ts`  
> **Key Types**: `TrackerFrame`, `PoseAngles`, `Posture`, `RepJudge`, `RepResult`, `RepReport`  
> **Related Documents**: [Pose Tracking Overview](../pose-tracking/README.md), [Referee Engine](../referee-engine/README.md), [Architecture](../../ARCHITECTURE.md)  
> **Maintenance Status**: Active / Hardware & CV Integration  

---

## 1. Overview

The motion tracker and the referee are the teammate's plain TypeScript modules in `pumpCourt/src/`. The app does **not** copy them. It imports them through the `@tracker` alias, so there is one copy, tested by `pumpCourt`'s own tests.

```text
camera / phone stream ─▶ <video> ─▶ @tracker/landmarker (MediaPipe pose, GPU or CPU)
   ─▶ @tracker/pose   createSideTracker: near-side angles   ─┐
   ─▶ @tracker/posture createPostureTracker: ready check     ├─ TrackerProvider (operator window)
   ─▶ @tracker/draw   drawOverlay: skeleton on the canvas   ─┘
         │ useTrackerFrames({ t, angles, posture })
         ▼
useRound ─▶ @tracker/judge RepJudge(REFEREE_RULES)
         │ invoke("set_ready", { ready, inRep }) when posture.ready or "in a rep" changes
         │ invoke("report_rep", { rep })      for every judged rep
         ▼
Rust engine: countdown, clock, score, save ─▶ tick / rep / round-finished
```

Rust never sees landmarks or angles. It trusts the window's `RepReport { counted, perfect, lights, faults }` and only counts reps while the clock runs.

---

## 2. How the alias is wired

| File | Setting |
| :--- | :--- |
| `frontend/vite.config.ts` | `resolve.alias: { "@tracker": "../pumpCourt/src" }`, `dedupe: ["@mediapipe/tasks-vision"]`, `server.fs.allow` includes the tracker folder |
| `frontend/tsconfig.json` | `paths`: `@tracker/*` → `../pumpCourt/src/*`, and `@mediapipe/tasks-vision` → `frontend/node_modules` |
| `frontend/scripts/setup-assets.mjs` | copies the wasm files and `pose_landmarker_full.task` into `frontend/public/` |

`pumpCourt/` has no `node_modules` of its own in the app build. Its modules take `@mediapipe/tasks-vision` (pinned to 1.0.1 in both `package.json` files) from `frontend/`.

Modules the app uses: `camera`, `landmarker`, `pose`, `posture`, `judge`, `draw`, `geometry` (through the others), and `phone/protocol` (through `phoneLink.ts` and the phone page).

---

## 3. Changing the rules

The competition rules are `REFEREE_RULES = DIFFICULTY.normal` in `frontend/src/config/modes.ts`. They are the same for everyone and not shown in any settings screen.

- To change a threshold for everyone, change `DIFFICULTY.normal` in `pumpCourt/src/judge.ts` and run `npm test` in `pumpCourt/`. Then update the table in [Referee Engine](../referee-engine/README.md#2-the-rules-are-fixed).
- To change rep timing, edit `SEGMENT` in `judge.ts`. To change the ready check, edit `POSTURE` in `posture.ts`. Update [Rep Segmentation](../referee-engine/rep-segmentation.md) or [Ready Check](../referee-engine/ready-check-calibration.md).
- A new `PostureState` (like `knees-down`) also needs a checklist row in `STEPS` and its place in `ORDER` in `frontend/src/ui/screens/Round.tsx`, or the get-ready panel ticks the wrong rows.
- The phone page (`pumpCourt/src/phone/main.ts`) is bundled as it is. A new message it sends (like `{orientation}`) needs handling in `frontend/src/logic/tracker/phoneLink.ts`, and in `backend/src/phone/mod.rs` if it goes over the relay socket.
- The light names come from `LIGHTS` and `LIGHT_LABEL` in `judge.ts`. The backend stores `noReps` per light key (`depth`, `torso`, `lockout`); renaming a key needs the matching Rust change in `backend/src/game/session.rs` (`Lights`, `NoRepCounts`).

---

## 4. Rules for changing `pumpCourt/src`

- **Keep the modules plain**: no React, no Tauri, no DOM beyond the video and canvas they are given. The standalone app (`pumpCourt/src/App.tsx`) and the desktop app both use them.
- **Keep them deterministic**: the judge and posture check take a time `t` with each frame, so tests can replay frames.
- Run `npm test` in `pumpCourt/` and `npm run build` in `frontend/` (which type-checks the imported modules) after a change.
- If a type crosses into Rust (e.g. `RepReport`, `Light`), update `backend/src/game/session.rs` and `frontend/src/api/types.ts` together.
