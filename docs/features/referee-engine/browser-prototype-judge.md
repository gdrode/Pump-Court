# Referee in the Browser Prototype (`pumpCourt/`)

> **Module**: `pumpCourt/src/pose.ts`, `pumpCourt/src/posture.ts`, `pumpCourt/src/judge.ts`
> **Tests**: `pumpCourt/src/__tests__/` (`npm test`, 213 tests)
> **Related Documents**: [Referee Overview](README.md), [Angles & Biomechanics](angles-and-biomechanics.md), [Rep Segmentation](rep-segmentation.md)
> **Last Updated**: 2026-10-10

---

## 1. Pipeline per frame

```
MediaPipe landmarks → pose.ts (nearest side, angles) → posture.ts (in position? floor line) → judge.ts (reps, 3 lights)
```

All three are plain TypeScript with no camera code, so they run the same live, in tests and on replayed logs (**Diagnostics → Judge this log**).

## 2. Posture gate (`posture.ts`)

No rep is judged unless the player is in the push-up position. This fixes reps being counted while someone sits upright.

| Check | Rule |
| --- | --- |
| Trunk (shoulder → hip) | less than 40° from horizontal (sitting/standing ≈ 90°) |
| Whole body (shoulder → ankle) | less than 35° from horizontal |
| Hands | wrist visible (≥ 0.5), below the shoulder, within one arm length of it horizontally |
| Getting ready | arms nearly straight (shoulder ≥ 0.7 arm lengths above hands) and wrist still (< 0.04 frame) for 0.5 s |
| Staying ready | hands stay within 0.08 frame of where they were planted; 0.6 s grace for blips |

When ready, the planted hands' height becomes the **floor line**. Shoulder height is then measured from it: `height = (floorY − shoulderY) / armLength` (≈ 1 at the top, ≈ 0.2–0.35 chest near floor).

Each player's stage shows the state: *Get down into the push-up position*, *Put the hands on the floor*, *Hold still at the top…*, *✓ Ready*. The game's countdown waits until every player is ready ([Browser Prototype Modes](../game-engine/browser-prototype-modes.md)).

## 3. Three lights (`judge.ts`)

| Light | Measured as | Easy | Normal | Hard |
| --- | --- | --- | --- | --- |
| Depth | lowest height above the floor line (arm lengths) | ≤ 0.55 | ≤ 0.42 | ≤ 0.30 |
| Torso: body line | angle at the **abdominal point** (shoulder–abdomen–knee), worst 10% of frames ignored | ≥ 145° | ≥ 155° | ≥ 165° |
| Torso: knees | hip–knee–ankle | ≥ 140° | ≥ 150° | ≥ 160° |
| Lockout | highest elbow angle on the way up | ≥ 145° | ≥ 155° | ≥ 165° |

2 or 3 white lights = counted; 3 = perfect.

The game always judges on **Hard** (no toggle since 2026-10-10). Easy/Normal remain in `DIFFICULTY` for tests and tuning only.

**Abdominal point**: 60% of the way from shoulder to hip (`ABDOMEN_FRACTION`), over the abdomen where the trunk folds. MediaPipe has no spine landmarks, so the point lies on the shoulder–hip line; the angle at it, measured to the knee, captures hip flexion and abdominal crunch/sag. `bodyOffset` (its signed distance from the shoulder–ankle line) names the fault: *hips sagging* (below) or *hips piked up* (above).

## 4. Rep segmentation (`SEGMENT` in `judge.ts`)

- Start: elbow 20° below its highest value in the last 4 s, and the player is ready.
- Coming up: elbow 20° above its lowest point.
- End: lockout reached, or 1.5 s without getting higher, or a new descent of 45°. Smaller dips stay in the same rep.
- An attempt needs ≥ 45° of elbow range (or shoulders below 0.75), **≥ 0.25 arm lengths of real shoulder drop toward the floor**, and ≥ 0.12 s.
- Out of position for 0.6 s mid-rep drops the rep.
- 3-frame median on elbow/depth at ≥ 20 fps (off below that); lockout trusts a brief raw peak when a neighbouring frame is within 20°.

## 5. Open items

- Thresholds are tuned on synthetic data only; record real players and replay them with *Diagnostics → Judge this log* (scores on Hard).
- A half rep with straight body and lockout still scores 2 lights (counts). Making depth mandatory is a one-line change.
