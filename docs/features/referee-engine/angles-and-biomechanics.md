# Body Angles & Measurements

> **Module**: `pumpCourt/src/geometry.ts`, `pumpCourt/src/pose.ts`  
> **Key Types**: `Point2`, `Landmark`, `PoseAngles`, `Side`  
> **Related Documents**: [Referee Engine Overview](README.md), [Rep Segmentation](rep-segmentation.md), [Ready Check](ready-check-calibration.md)  
> **Maintenance Status**: Active / Mathematical Core  

---

## 1. Summary

`pose.ts` turns the 33 MediaPipe landmarks of one frame into the numbers the posture check and the referee use: joint angles, a body-line angle at the abdomen, how far the belly sags, and how high the shoulders are. It is plain TypeScript with no camera or drawing code.

---

## 2. The angle formula (`geometry.ts`)

All angles are 2D, in the image. For three points $A$, $B$ (the corner) and $C$:

$$\vec{u} = A - B, \qquad \vec{v} = C - B$$

$$\theta = \arccos\left( \frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\| \|\vec{v}\|} \right) \times \frac{180}{\pi}$$

```typescript
// pumpCourt/src/geometry.ts
export function angle(a: Point2, b: Point2, c: Point2) {
  const abx = a.x - b.x, aby = a.y - b.y
  const cbx = c.x - b.x, cby = c.y - b.y
  const dot = abx * cbx + aby * cby
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby)
  if (mag === 0) return NaN
  return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * (180 / Math.PI)
}
```

A zero-length segment gives `NaN`, never a fake 180°. Before measuring, `computeAngles` multiplies every `x` by the video's width/height ratio, because landmarks are normalised to the frame and a wide frame would otherwise squash the angles.

---

## 3. What `computeAngles` returns (`PoseAngles`)

Only the tracked side is used (see [Pose Tracking](../pose-tracking/README.md)).

| Field | Points | Used by | Meaning |
| :--- | :--- | :--- | :--- |
| `elbow` | shoulder–elbow–wrist | referee (lockout; rep splitting and depth only before a floor line exists) | 180 = straight arm |
| `abdomen` | shoulder–**abdominal point**–knee | referee (Torso light), passed as `hip` | 180 = trunk in line with the thighs |
| `knee` | hip–knee–ankle | posture (`knees-down`, < 150°) and referee (Torso light) | catches knee push-ups and bent legs |
| `bodyOffset` | abdominal point vs the shoulder–ankle line | referee fault text | + = belly sagging below the line, − = hips piked above it, as a fraction of the line's length |
| `hip` | shoulder–hip–ankle | diagnostics | body line at the hips |
| `hipFlex` | shoulder–hip–knee | diagnostics | hip flexion |
| `shoulderY` | shoulder | posture, referee | 0 = top of frame, 1 = bottom; larger = lower |
| `depth` | wrist and shoulder | posture (ready) | shoulder height above the wrist, in arm lengths: about 1 at lockout, near 0 chest on the floor |
| `armLength` | shoulder–elbow + elbow–wrist | posture | the unit for all heights |
| `trunkTilt` | shoulder–hip | posture | degrees from horizontal: about 0–30 in a push-up, near 90 sitting or standing |
| `bodyTilt` | shoulder–ankle | posture | degrees from horizontal |
| `wrist`, `wristVisibility`, `shoulderX` | wrist, shoulder | posture | where the hands are planted |
| `visibility` | the six side points | side tracker | mean visibility, 0..1 |

### 3.1 The abdominal point
MediaPipe has no spine points. The abdominal point is placed `ABDOMEN_FRACTION` = **0.6** of the way from shoulder to hip, over the belly, where the trunk folds when the hips pike or the belly sags. The angle at that point, measured to the knee, catches both a sagging belly and piked hips better than the plain shoulder–hip–ankle angle.

### 3.2 Depth in arm lengths, not degrees
The Depth light does not use the elbow angle (unless the hands are hidden). It uses how high the shoulders are above the floor, divided by the arm length. That works for any body size and any distance from the camera. During a round the floor is the planted **floor line** from the posture check, not the wrist point, because a fixed line is steadier (see [Ready Check](ready-check-calibration.md)):

$$\text{height} = \frac{\text{floorY} - \text{shoulderY}}{\text{armLength at the moment of getting ready}}$$

About 1 at the top, about 0.2–0.35 with the chest near the floor. The Depth light compares the bottom with the player's own straight-arm top height: the shoulders must drop at least **30%** of it (`depthDrop`). The same height, × 150, is the drive signal that splits reps (see [Rep Segmentation](rep-segmentation.md#2-the-drive-signal)).

---

## 4. Noise handling

There is no moving-average filter on the angles. Noise is handled in the referee instead:
- a 3-frame rolling **median** on the elbow and depth values, at 20 fps or faster (`SEGMENT.median`, `SEGMENT.medianMaxFrameMs`);
- the Torso light ignores the worst 10% of frames (`robustLow`, always skipping the single worst frame when there are 3 or more);
- lockout ignores a one-frame spike (`SEGMENT.peakNeighbourDeg` for the elbow, `SEGMENT.peakHeightNeighbour` for height).

See [Rep Segmentation](rep-segmentation.md).
