# Feature 02: Referee Engine & Biomechanical Rules

> **Module**: `backend/src/judge/` and `pumpCourt/src/judge.ts`  
> **Key Types**: `Referee`, `Light`, `RepVerdict`, `RepTracker`, `JudgeConfig`, `BodyAngles`  
> **Related Documents**: [Angles & Biomechanics](angles-and-biomechanics.md), [Rep Segmentation](rep-segmentation.md), [Ready Check & Calibration](ready-check-calibration.md), [Browser Prototype Judge](browser-prototype-judge.md)  
> **Maintenance Status**: Core Business Logic / Highly Sensitive to Tuning  

---

## 1. Executive Summary

The **Referee Engine** is the deterministic core of Pump-Court. It evaluates skeletal angles frame-by-frame and renders instant competitive verdicts. It implements the international powerlifting / push-up competition standard: **three referee lights** independently assessing separate criteria.

A rep requires at least **two white lights** to count as a clean rep. **Three white lights** constitutes a perfect rep. Any rep with fewer than two white lights is ruled a **no-rep**, accompanied by explicit verbal/visual feedback explaining the fault.

```text
               ┌───────────────────────────┐
               │    SKELETAL LANDMARKS     │
               └─────────────┬─────────────┘
                             │
                             ▼
               ┌───────────────────────────┐
               │    ANGLES CALCULATION     │
               │   (Elbow, Hip, Knee)      │
               └─────────────┬─────────────┘
                             │
                             ▼
               ┌───────────────────────────┐
               │  REP SEGMENTATION TRACKER │
               │ (AwaitLockout ➔ InRep ➔ …)│
               └─────────────┬─────────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
     [ LIGHT 1 ]        [ LIGHT 2 ]      [ LIGHT 3 ]
      🟢 Depth           🟢 Lockout       🟢 Plank
    Elbow <= 90°       Elbow >= 160°    Hip & Knee >= 160°
            │                │                │
            └────────────────┼────────────────┘
                             │
                             ▼
               ┌───────────────────────────┐
               │        REP VERDICT        │
               │  Clean: 2–3 White Lights  │
               │  Faults: Reasons Array    │
               └───────────────────────────┘
```

---

## 2. The Three Referee Lights

### 2.1 Referee 1: Depth (The Elbow Flexion Test)
- **Measurement**: Evaluates the minimum interior angle between Shoulder ➔ Elbow ➔ Wrist during the lowest inflection point of the rep.
- **Rule**: Minimum elbow angle must be `<= depth_max_elbow` (default: **`90.0°`**).
- **Rationale**: Guarantees that the athlete lowered their chest all the way to fist/floor level rather than performing half-reps.

### 2.2 Referee 2: Lockout (The Extension Test)
- **Measurement**: Evaluates the maximum elbow extension angle achieved after ascending from the bottom inflection point.
- **Rule**: Must reach `>= lockout_min_elbow` (default: **`160.0°`**, dynamically calibrated downward during ready check).
- **Rationale**: Enforces full range of motion. Prevents rapid "pumping" reps that never return to complete arm extension.

### 2.3 Referee 3: Plank / Torso (The Body Alignment Test)
- **Measurement**: Evaluates the minimum hip angle (Shoulder ➔ Hip ➔ Ankle) and knee angle (Hip ➔ Knee ➔ Ankle) sustained throughout the entire rep window.
- **Rule**: Hip angle must stay `>= plank_min_hip` (default: **`160.0°`**) AND Knee angle must stay `>= plank_min_knee` (default: **`160.0°`**).
- **Rationale**: Eliminates sagging bellies (touching the floor before the chest), piking hips (butt in the air reducing shoulder load), and resting on knees.

---

## 3. Rep Verdict Data Contract

Upon rep completion, `RepTracker` yields a `RepVerdict` broadcast via the `rep` Tauri event:

```rust
pub struct RepVerdict {
    pub attempt: u32,               // 1-based attempt sequence
    pub clean: bool,                // True if >= 2 lights passed
    pub lights: [Light; 3],         // [Depth, Lockout, Plank]
    pub reasons: Vec<String>,       // Human-readable fault strings
    pub start_ms: i64,              // Timestamp rep began
    pub end_ms: i64,                // Timestamp rep concluded
}

pub struct Light {
    pub referee: Referee,           // Depth | Lockout | Plank
    pub pass: bool,                 // Pass (white) or Fail (red)
    pub measured: f32,              // Measured degrees (e.g., 94.2)
    pub needed: f32,                // Threshold degrees (e.g., 90.0)
}
```

---

## 4. Key Configuration Parameters (`JudgeConfig`)

All numbers can be adjusted live in the Settings window (`S`) or via `set_judge_config`:

```rust
pub struct JudgeConfig {
    pub depth_max_elbow: f32,          // Default 90.0°
    pub lockout_min_elbow: f32,        // Default 160.0°
    pub plank_min_hip: f32,            // Default 160.0°
    pub plank_min_knee: f32,           // Default 160.0°
    pub top_exit_margin: f32,          // Default 15.0° (drop needed to leave top)
    pub min_attempt_drop: f32,         // Default 30.0° (filters out minor twitches)
    pub ascent_margin: f32,            // Default 25.0° (rise needed to confirm ascent)
    pub redip_margin: f32,             // Default 20.0° (drop during ascent = lockout fail)
    pub confirm_frames: u32,           // Default 2 frames (anti-flicker hysteresis)
    pub smoothing_alpha: f32,          // Default 0.6 (EMA factor: 1.0=raw, 0.1=heavy)
    pub tracking_loss_ms: u64,         // Default 500ms
}
```
