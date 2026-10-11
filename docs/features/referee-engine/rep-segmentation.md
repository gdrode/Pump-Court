# Rep Segmentation (`RepJudge`)

> **Module**: `pumpCourt/src/judge.ts`  
> **Key Types**: `RepJudge`, `SEGMENT`, `RepAcc`, `RepResult`  
> **Related Documents**: [Referee Engine Overview](README.md), [Angles & Biomechanics](angles-and-biomechanics.md), [Ready Check](ready-check-calibration.md)  
> **Maintenance Status**: Core Algorithmic Component  

---

## 1. Summary

`RepJudge` turns a stream of frames into separate reps. Feed it one frame at a time with `push(t, input)`; it returns a `RepResult` on the frame a rep finishes, and `null` otherwise.

It follows a **drive signal**: a rep starts when the drive drops, comes up when it rises again, and ends at lockout, after a stall near the top, or when the next rep clearly starts.

All the tuning numbers are in one object, `SEGMENT`, at the top of `judge.ts`.

---

## 2. The drive signal

- When the posture check has a floor line, the drive is the **shoulders' height above the floor line × `HEIGHT_TO_DRIVE` (150)**. A full rep then spans about 100 units, like the elbow's ~100°.
- Otherwise (no floor line yet, `depth` is `NaN`) the drive is the **elbow angle**.
- So the thresholds below are in drive units (≈ degrees). For height, 20 units ≈ 0.13 arm lengths.
- Why height: seen side-on, a **flared elbow** points at or away from the camera and barely seems to bend, but the shoulders still go all the way down and up. The elbow angle is then only used for the Lockout light.
- A rep is measured with one signal from start to end. Frames with the other signal are only tracked.

---

## 3. Phases

```text
             drive 20 below the highest value
             of the last 4 s, and player ready
  ┌────────┐ ───────────────────────────────▶ ┌────────┐
  │  top   │                                  │  down  │  tracks the lowest drive, elbow,
  └────────┘ ◀──────────┐                     └───┬────┘  depth, shoulder, body angles
      ▲                 │                         │ drive 20 above its lowest
      │                 │                         ▼
      │   rep scored    │                     ┌────────┐
      ├─────────────────┴──── locked out,     │   up   │  tracks the highest drive,
      │             or 1.5 s with no new high └───┬────┘  elbow and height
      │             (both once ≥ 60% back up)     │ drive 25 below the highest so far
      │                                           ▼
      │                                     ┌──────────┐
      │   new descent of 45 from the top:   │ turning  │  a dip, or the next rep?
      └──── score this rep, next one is ◀── └────┬─────┘
            already in "down"                    │ drive rises 20 again:
                                                 └─▶ just a dip, back to "up"
```

- **top**: waiting. Keeps the last `topWindowMs` (4 s) of drive values; the "recent top" is the highest of them, so settling slightly lower can't block a start. Shoulder heights seen here also feed the **straight-arm top height** (highest over the last `topHeightWindowMs`, 30 s), used for depth and lockout by height.
- **down**: going down. If the drive sets no new low for `restartMs` (1.5 s), the rep's clock restarts from there, so a slow relax at the top is not judged.
- **up**: coming up. Once the player is at least `minAscent` (60%) of the way back up, the rep is **judged on the frame it locks out**: elbow at `lockoutElbow`, or shoulders back within `lockoutHeightTol` (0.05 arm lengths) of the top height. It is also judged after `stallMs` (1.5 s) with no new high, but only once 60% back up. Lower than that, the judge keeps waiting: a slow grind still counts when it locks out.
- **turning**: going down again without locking out. The frames go to a possible next rep. If the drive drops `minRangeDeg` (45) below that new top, the old rep is scored (without lockout) and the new one carries on. If the drive rises `rise` (20) again, it was only a dip at the sticking point, and the frames are folded back into the same rep.

---

## 4. `SEGMENT` constants

| Constant | Value | Meaning |
| :--- | :--- | :--- |
| `startDrop` | 20 | Drive must drop this much below the recent top to start a rep |
| `topWindowMs` | 4000 ms | Window for the "recent top" |
| `rise` | 20 | Drive must rise this much from the bottom to count as coming up |
| `turn` | 25 | Going down again this much on the way up may be the next rep |
| `stallMs` | 1500 ms | No new high this long on the way up ends the rep (no lockout), once ≥ `minAscent` back up |
| `maxGapMs` | 1500 ms | Losing the player this long mid-rep discards the rep |
| `minRangeDeg` | 45 | Elbow drive only: smaller movements are not attempts; also the new descent that ends a rep in `turning` |
| `minAttemptDrop` | 0.15 | Height drive: the shoulders must drop at least 15% of the top height within the rep to be an attempt (judged, no-rep if shallow). 0.12 gave a phantom rep from tracking noise while holding still |
| `minAttemptAscent` | 0.3 | An attempt must push back up at least 30% of its descent; 30–60% = no-rep "didn't come back up" |
| `minStartHeight` | 0.5 | Height drive: a rep must start in the top half of the player's height (seeing the player again near the bottom is not a push-up) |
| `minShoulderDrop` | 0.03 | Elbow drive only: the shoulder must drop this much of the frame height |
| `minAscent` | 0.6 | The shoulders (else the elbow) must come back up 60% of the way they went down before the rep is judged |
| `lockoutHeightTol` | 0.05 | Shoulders within this many arm lengths of the top height count as locked out |
| `topHeightWindowMs` | 30 000 ms | The straight-arm top height is the highest shoulder height at the top over this window |
| `peakNeighbourDeg` | 20° | A real elbow peak has a neighbouring frame within this; a spike doesn't |
| `peakHeightNeighbour` | 0.1 | The same for height (arm lengths) |
| `restartMs` | 1500 ms | Holding still this long going down restarts the rep's clock |
| `notReadyMs` | 600 ms | Out of position this long mid-rep discards the rep |
| `minRepMs` | 120 ms | Shorter "reps" are tracking glitches |
| `median` | 3 frames | Rolling median on elbow and depth, removes one-frame spikes |
| `medianMaxFrameMs` | 50 ms | The median is skipped below 20 fps, so fast reps keep their peaks |

`minRangeDepth` (0.75) and `minDepthDrop` (0.25) are still in `SEGMENT` but are no longer read by the judge.

---

## 5. What makes an attempt (anti-cheat and anti-glitch)

When a rep ends, `score()` first checks it was a real attempt. If not, it returns `null`: nothing is reported, not even a no-rep.

With shoulder height known:
1. **Long enough**: at least `minRepMs` (120 ms).
2. **A real descent**: the shoulders dropped at least `minAttemptDrop` (15%) of the top height, measured from where this rep started. Smaller moves (shifting, settling at the top) get no lights. A real but shallow rep (15–30%) **is** judged: Depth red, no-rep, buzzer.
3. **Started high enough**: from at least `minStartHeight` (50%) of the top height.
4. **Some way back up**: at least `minAttemptAscent` (30%). Collapsing flat to the floor at failure is a descent with no ascent: no rep, no lights. 30–60% back up then down again = a no-rep ("Didn't come back up", Lockout red).

Then `counted` = Depth white **and** at least `minAscent` (60%) back up **and** 2+ white lights. So with Depth white, one of Torso / Lockout may be red and the rep still counts; with Depth red it never does.

Elbow only (no height): at least 120 ms, at least `minRangeDeg` (45°) of elbow range, the shoulder visibly moved (`minShoulderDrop`, 3% of the frame; a glitching elbow point alone doesn't move it), and 30% back up (60% to count).

Other guards:
- **In position only.** If the frame says `ready: false`, no rep starts. A rep in progress is dropped after `notReadyMs` (600 ms) out of position (the player sat up or walked off). During posture's 0.6 s grace period the player still counts as ready, but no height is reported, so sitting up can't be read as "back at the top".
- **Tracking gaps.** A gap longer than `maxGapMs` (1.5 s) resets the judge. Time the player was out of view doesn't count towards the stall timer. The straight-arm top height is kept (it expires after 30 s).
- **Time never runs backwards.** A frame stamped earlier than the last one is treated as the same time.
- **Lockout spikes.** Lockout uses the highest raw elbow reading only if the second highest is within `peakNeighbourDeg` (20°) of it; otherwise it uses the second highest. Height works the same way with `peakHeightNeighbour` (0.1 arm lengths). One bad frame can't fake a lockout, but a touch-and-go top lasting one frame isn't smoothed away.

---

## 6. Then the lights

After the checks, the three lights are computed as described in the [Referee Overview](README.md#3-the-three-lights). `RepResult.rep` numbers attempts from 1; the Rust backend numbers them again per round (`RepVerdict.attempt`).

`finish()` scores a rep that was at least 60% back up (phase `up` or `turning`) and drops one still going down or lower. The app does not use it: a push-up still in progress at the buzzer does not count.

The behaviour is covered by `pumpCourt/src/__tests__/judge.test.ts` and `judge.adversarial.test.ts` (fast reps, glitches, dips, flared elbows, collapses, sitting up, knee push-ups and more).
