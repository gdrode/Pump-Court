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
| Depth | lowest height above the floor line (arm lengths) | ≤ 0.70 | ≤ 0.65 | ≤ 0.60 |
| Torso: body line | angle at the **abdominal point** (shoulder–abdomen–knee), worst 10% of frames ignored | ≥ 145° | ≥ 155° | ≥ 165° |
| Torso: knees | hip–knee–ankle | ≥ 140° | ≥ 150° | ≥ 160° |
| Lockout | elbow on the way up reaches the threshold, **or** the shoulders get back within 0.05 arm lengths of the player's straight-arm top height | ≥ 145° | ≥ 155° | ≥ 165° |

2 or 3 white lights = counted; 3 = perfect.

Hard's depth was loosened twice on 2026-10-10 after live testing (0.30 → 0.45 → 0.60): players had to go lower than a conventional push-up. At a conventional bottom (elbows ~90°, forearms vertical) the shoulders sit about half an arm length above the hands, plus the wrist landmark sits above the floor; 0.60 passes that. Without visible hands, depth falls back to the elbow angle (Easy 100°, Normal 95°, Hard 90°).

The game always judges on **Hard** (no toggle since 2026-10-10). Easy/Normal remain in `DIFFICULTY` for tests and tuning only.

**Abdominal point**: 60% of the way from shoulder to hip (`ABDOMEN_FRACTION`), over the abdomen where the trunk folds. MediaPipe has no spine landmarks, so the point lies on the shoulder–hip line; the angle at it, measured to the knee, captures hip flexion and abdominal crunch/sag. `bodyOffset` (its signed distance from the shoulder–ankle line) names the fault: *hips sagging* (below) or *hips piked up* (above).

## 4. Rep segmentation (`SEGMENT` in `judge.ts`)

Reps are found from a **drive signal**: the shoulders' height above the floor line (× `HEIGHT_TO_DRIVE` = 150, so a full rep spans ~100 units like the elbow's ~100°) whenever posture has a floor line, else the elbow angle. This handles **flared elbows**: seen side-on, a flared elbow points at or away from the camera and barely seems to bend, but the shoulders still go all the way down and up. The elbow angle is then only used for the Lockout light (straight arms read straight however they are rotated). The thresholds below are in drive units (≈ degrees).

- Start: drive 20 below its highest value in the last 4 s (≈ 0.13 arm lengths of shoulder drop), and the player is ready.
- Coming up: drive 20 above its lowest point.
- End: **judged immediately on lockout** (elbow threshold, or shoulders back at the top height) once at least 60% back up, or a new descent of 45 (≈ 0.3 arm lengths; smaller dips stay in the same rep), or 1.5 s without getting higher **once the player is at least 60% of the way back up**. Lower than that, the judge keeps waiting: a slow grind still counts when it locks out.
- **A push-up is two parts: down, then back up.** A rep is judged only if the shoulders came back up at least 60% of the way they went down (`minAscent`; measured from the floor line, else shoulder position, else elbow). Collapsing flat to the floor at failure is a descent with no ascent: no rep, no lights. In Max mode, staying collapsed ends the round after 5 s ("couldn't press up").
- An attempt needs ≥ 45 of drive range (or shoulders below 0.75), **≥ 0.25 arm lengths of real shoulder drop toward the floor**, and ≥ 0.12 s.
- Out of position for 0.6 s mid-rep drops the rep.
- 3-frame median on elbow/depth at ≥ 20 fps (off below that); lockout trusts a brief raw peak when a neighbouring frame is within 20° (elbow) or 0.1 arm lengths (height), so touch-and-go tops lasting one frame aren't smoothed away.
- **Lockout by height** (added 2026-10-10): straight arms often read only 155–165° side-on (less with flared elbows), so the 165° Hard elbow threshold missed real lockouts and the rep was only judged when the next one began. The straight-arm top height is the highest shoulder height seen between reps over the last 30 s; getting back within 0.05 arm lengths of it (≈ elbows ≥ 157°) counts as locked out, and the rep is judged on that frame. Coming back only to ~145° (≈ 0.08 short) still fails.
- During posture's 0.6 s grace period the player still counts as ready, but no height is reported, so sitting up can't be read as "back at the top".

## 5. Open items

- Thresholds are tuned on synthetic data only; record real players and replay them with *Diagnostics → Judge this log* (scores on Hard).
- A half rep with straight body and lockout still scores 2 lights (counts). Making depth mandatory is a one-line change.
