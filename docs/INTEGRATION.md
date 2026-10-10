# The motion tracker inside the app

> 💡 **Notice for AI Agents and Developers**: This guide is part of the documentation suite. See the full feature documentation in [`docs/features/developer-guides/tracker-integration.md`](features/developer-guides/tracker-integration.md) and [`docs/features/pose-tracking/`](features/pose-tracking/README.md).

The tracker is the teammate's code in `pumpCourt/src`: **MediaPipe Pose
Landmarker running in the browser** (`@mediapipe/tasks-vision` 1.0.1), plus a
side tracker, a posture check and a three-light referee, all in plain
TypeScript. The app uses it directly. There is no copy in `frontend/` and no
landmark processing in Rust.

## How it is wired

* `frontend/vite.config.ts` and `frontend/tsconfig.json` map `@tracker/*` to
  `../pumpCourt/src/*`. So `import { RepJudge } from "@tracker/judge"` loads
  the teammate's file. Vite's `dedupe` makes `pumpCourt/` use the frontend's
  copy of `@mediapipe/tasks-vision`.
* `frontend/scripts/setup-assets.mjs` (run by `npm install`, `npm run dev` and
  `npm run build`) copies the MediaPipe wasm into `frontend/public/wasm/` and
  the model `pose_landmarker_full.task` into `frontend/public/models/`. Both
  folders are git-ignored. After that, tracking needs no internet.
* `frontend/src/logic/tracker/TrackerProvider.tsx` runs the camera and the
  detection loop in the operator window and hands every frame to subscribers.
  It also turns a sideways picture upright before tracking (rotation, ported
  from `pumpCourt/src/useLane.ts`; see
  [Pose Tracking](features/pose-tracking/README.md#5-picture-rotation)).
* `frontend/src/logic/useRound.ts` runs the referee and talks to Rust.

## What goes to Rust

Rust never sees landmarks or video. It only hears two things:

| Call | When | Rust does |
| --- | --- | --- |
| `set_ready(ready)` | the posture check's `ready` flag changes | in `getReady`, `true` starts the 3-second countdown |
| `report_rep(rep)` | `RepJudge.push()` returns a finished rep | counts it if the clock is running, emits `rep` |

`rep` is `{ counted, perfect, lights: { depth, torso, lockout }, faults }`,
copied from the judge's `RepResult`.

```ts
// frontend/src/logic/useRound.ts (simplified)
useTrackerFrames(({ t, angles, posture }) => {
  if (posture.ready !== sentReady) backend.setReady(posture.ready);
  const rep = judge?.push(t, angles && {
    elbow: angles.elbow, hip: angles.abdomen, knee: angles.knee,
    bodyOffset: angles.bodyOffset, depth: posture.height,
    shoulderY: angles.shoulderY, ready: posture.ready,
  });
  if (rep) backend.reportRep({ counted: rep.counted, perfect: rep.perfect, lights: rep.lights, faults: rep.faults });
});
```

A fresh `RepJudge(REFEREE_RULES)` is made when the backend's phase becomes
`running`, so nothing from the get-ready phase leaks into the round.

## Changing the tracker

* Rules: `DIFFICULTY` in `pumpCourt/src/judge.ts`. The app uses
  `DIFFICULTY.normal` (`REFEREE_RULES` in `frontend/src/config/modes.ts`):
  lockout 155°, torso 155°, knee 150°, depth = shoulders drop 30% of the
  player's straight-arm top height. The prototype itself judges on Hard.
* Rep splitting: `SEGMENT` in `pumpCourt/src/judge.ts`.
* Ready check: `POSTURE` in `pumpCourt/src/posture.ts`. A new posture state
  needs a row in `STEPS` and `ORDER` in `frontend/src/ui/screens/Round.tsx`
  (as `knees-down` got).
* Run `npm test` in `pumpCourt/` after any change.
