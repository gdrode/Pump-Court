# Feature 02: Referee Engine & Three Lights

> **Module**: `pumpCourt/src/judge.ts` (the referee), `pumpCourt/src/posture.ts` (ready check), used by `frontend/src/logic/useRound.ts`  
> **Key Types**: `RepJudge`, `Thresholds`, `DIFFICULTY`, `JudgeInput`, `RepResult`, `Light`; Rust `RepReport`, `RepVerdict`, `Lights`  
> **Related Documents**: [Angles & Biomechanics](angles-and-biomechanics.md), [Rep Segmentation](rep-segmentation.md), [Ready Check](ready-check-calibration.md), [The Standalone Tracker App](browser-prototype-judge.md)  
> **Maintenance Status**: Core Business Logic / Sensitive to Tuning  

---

## 1. Summary

The referee watches the body angles frame by frame, splits the motion into reps, and gives each rep **three lights**. It is the teammate's plain-TypeScript `RepJudge` in `pumpCourt/src/judge.ts`, run in the operator window. Rust does not judge anything; it only counts the reps it is told about.

- **2 or 3 white lights** = a valid push-up. It counts.
- **3 white lights** = a perfect push-up.
- **0 or 1 white light** = a no-rep. Each red light comes with a reason.

```text
 PoseAngles (pose.ts) + Posture (posture.ts)
                │  one JudgeInput per frame
                ▼
 ┌──────────────────────────────┐
 │ RepJudge.push(t, input)      │  top → down → up (→ turning) → top
 │ (rep segmentation, SEGMENT)  │
 └──────────────┬───────────────┘
                │  RepResult when a rep finishes
   ┌────────────┼────────────┐
   ▼            ▼            ▼
 Depth        Torso        Lockout
 shoulders    body line    elbows ≥ 155°,
 drop ≥ 30%   ≥ 155° and   or shoulders
 of top       knees ≥ 150° back at the top
   └────────────┼────────────┘
                ▼
 counted = 2+ white, perfect = 3 white, faults = reasons
                │ backend.reportRep(...)
                ▼
 Rust Session: counts it while the clock runs, emits "rep"
```

---

## 2. The rules are fixed

The app always uses the tracker's **normal** level:

```typescript
// frontend/src/config/modes.ts
export const REFEREE_RULES = DIFFICULTY.normal;
```

| Threshold (`Thresholds`) | Normal (used) | Easy | Hard | Meaning |
| :--- | :--- | :--- | :--- | :--- |
| `depthDrop` | **0.30** | 0.25 | 0.35 | Share of the player's own straight-arm top height the shoulders must drop |
| `depthElbowFallback` | **95°** | 100° | 90° | Used only when the hands can't be seen: the elbow must bend below this |
| `torsoHip` | **155°** | 145° | 165° | Body-line angle at the abdominal point must stay above this (180 = straight) |
| `knee` | **150°** | 140° | 160° | Knee angle must stay above this (catches knee push-ups) |
| `lockoutElbow` | **155°** | 145° | 165° | Elbows must open to this at the top |

Easy and Hard are used only by the standalone `pumpCourt` app (which now always judges on Hard). There is no thresholds editor and no "apply thresholds" button in Pump Court; the operator cannot change the rules at the event. To change them, edit `DIFFICULTY` in `pumpCourt/src/judge.ts` (it changes the prototype too) or point `REFEREE_RULES` at other numbers.

---

## 3. The three lights

`LIGHTS = ['depth', 'torso', 'lockout']`, shown as **Depth**, **Torso**, **Lockout** (`LIGHT_LABEL`).

### 3.1 Depth: chest towards the floor
- Measured as **how far the shoulders drop, as a share of the player's own straight-arm top height**. Heights are shoulder heights above the floor line, in arm lengths (`posture.height`, see [Ready Check](ready-check-calibration.md)).
- The top height is the highest shoulder height seen between reps over the last 30 s (`SEGMENT.topHeightWindowMs`). The bottom ignores the single lowest frame, so one bad frame can't pass depth.
- White if the drop is at least `depthDrop` (30%). Guide: a quarter rep drops about 10–25%, a push-up with elbows near 90° about 40–50%.
- Why relative: a player's top height depends on where the hands are placed and how the camera sees the arm, so a fixed height in arm lengths was first too strict and then let quarter reps pass.
- If no height was measured during the rep (`posture.height` is `NaN` until the posture check has planted the floor line), the lowest elbow angle is used instead: white if it bent to `depthElbowFallback` (95°) or less. The fault text then says "hands not visible".
- Fault text: "Not deep enough: shoulders dropped 22% of their height (needs 30%)".

### 3.2 Torso: body held straight
- Measured as the body-line angle at the **abdominal point** (shoulder–abdomen–knee), ignoring the worst 10% of frames, and the knee angle measured the same way.
- White if the body angle is at least `torsoHip` (155°) **and** the knees are at least `knee` (150°) or not visible.
- Fault text names the direction from `bodyOffset`: "Body not straight (hips sagging): 148° at the abdomen (needs 155°)", "(hips piked up)", or "Knees bent: 132° (needs 150°)".

### 3.3 Lockout: arms straight at the top
- White if, on the way up, **either** the elbow reached `lockoutElbow` (155°) **or** the shoulders got back within 0.05 arm lengths of the straight-arm top height (`SEGMENT.lockoutHeightTol`, "lockout by height").
- Why by height: straight arms often read only 155–165° side-on, less with flared elbows. The shoulders can only get back to the top with the arms straight.
- A single-frame spike is ignored; a brief real peak on a fast rep is kept (see [Rep Segmentation](rep-segmentation.md)).
- Fault text: "No lockout: didn't get back to the top (elbows 141°, needs 155°)".

---

## 4. Data contracts

### 4.1 Inside the tracker (`judge.ts`)

```typescript
interface JudgeInput {          // one per frame; null when nobody is tracked
  elbow: number;                // pose.ts elbow
  hip: number;                  // pose.ts abdomen (shoulder–abdomen–knee)
  depth: number;                // posture.ts height (arm lengths above the floor line); NaN before the floor is known
  knee?: number;
  bodyOffset?: number;          // + sagging, − piked; only words the fault
  ready?: boolean;              // posture.ts ready
  shoulderY?: number;           // to confirm the body really moved
}

interface RepResult {
  rep: number; startT: number; endT: number;
  lights: Record<Light, boolean>;
  whiteCount: number;
  counted: boolean;             // whiteCount >= 2
  perfect: boolean;             // whiteCount === 3
  measured: { depth; depthDrop; bottomElbow; hip; knee; lockout };  // depthDrop = share of top height
  faults: string[];
}
```

`useRound` builds the `JudgeInput` from each `TrackerFrame` (see [Tracker Integration](../developer-guides/tracker-integration.md)).

### 4.2 Sent to Rust (`report_rep`)

```rust
// backend/src/game/session.rs
pub struct Lights { pub depth: bool, pub torso: bool, pub lockout: bool }

pub struct RepReport {
    pub counted: bool,        // at least 2 of 3 white lights
    pub perfect: bool,        // all 3 white
    pub lights: Lights,
    pub faults: Vec<String>,  // why each red light was given
}
```

The backend numbers it and sends it to every window as the `rep` event (`RepVerdict`: the same fields plus `attempt`, 1 for the first attempt of the round). Reps reported outside the `running` phase are ignored.

---

## 5. Where the referee runs during a round

- `useRound` creates `new RepJudge(REFEREE_RULES)` when the backend's phase becomes `running`, and drops it when the phase changes again. So motion during get-ready and the countdown is never judged.
- A push-up must finish before the buzzer. One still in progress when the clock stops is not counted (`useRound` drops the judge; `RepJudge.finish()` is not used).
- The Results screen shows red lights per light (`noReps`) from the backend's `RoundResult`.
