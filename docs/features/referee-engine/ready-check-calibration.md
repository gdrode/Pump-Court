# Ready Check Verification & Dynamic Calibration

> **Module**: `backend/src/judge/ready.rs`  
> **Key Types**: `ReadyCheck`, `ReadyItem`, `ReadyChecklist`  
> **Related Documents**: [Referee Engine Overview](README.md), [Rep Segmentation](rep-segmentation.md)  
> **Maintenance Status**: Active / Athlete Onboarding Gate  

---

## 1. Overview & Purpose

Before the match clock starts in any competitive round, the system enters the **`ReadyCheck`** phase. This gate ensures:
1. The camera is running at acceptable competition frame rates.
2. The athlete is fully visible in side-on profile within the camera boundaries.
3. The athlete assumes a valid top plank position.
4. The system **calibrates** the lockout threshold to the athlete's personal anatomy.

---

## 2. The Ready Checklist Items

In the UI, the athlete sees a live 4-point checklist:

```rust
pub struct ReadyItem {
    pub key: String,       // "fps" | "visible" | "side_on" | "plank"
    pub label: String,     // E.g., "Full body visible", "Hold top plank"
    pub ok: bool,
}
```

### Checklist Gate Criteria:
1. **Camera Frame Rate (`fps`)**:
   - `fps >= cfg.min_fps` (default: **`24.0 FPS`**).
   - Prevents starting rounds on laggy Wi-Fi or thermal-throttled phones.
2. **Body Visibility (`visible`)**:
   - All key landmarks (Shoulder, Elbow, Wrist, Hip, Knee, Ankle) must have `visibility >= min_visibility` (default `0.5`).
3. **Side-On Profile (`side_on`)**:
   - Confirms that the athlete is perpendicular to the camera rather than angled toward or away from the lens.
4. **Plank Hold (`plank`)**:
   - Athlete must maintain arms straight (`elbow >= start_position_min_elbow`, default `145.0°`) and hips aligned (`hip >= plank_min_hip`, default `160.0°`) continuously for `start_hold_ms` (default **`1000ms`** / 1 second).

---

## 3. Dynamic Lockout Calibration

Human joints vary naturally: hyperextending elbows reach 190°, while athletes with prior injuries or large bicep mass may naturally lock out at 155°. Judging all humans against a rigid 170° threshold creates unfair disqualifications.

During the 1-second plank hold, `ReadyCheck` records the average elbow extension of the athlete:

```rust
// In backend/src/judge/tracker.rs
pub fn new(cfg: JudgeConfig, calibrated_lockout: Option<f32>) -> Self {
    let lockout = match calibrated_lockout {
        // Judge against the player's own straight arm minus 5 degrees slack,
        // clamped between 140.0° and cfg.lockout_min_elbow (160.0°).
        Some(own) => (own - 5.0).min(cfg.lockout_min_elbow).max(140.0),
        None => cfg.lockout_min_elbow,
    };
    // ...
}
```

- **Fairness Guarantee**: An athlete can never calibrate the rulebook *stricter* than default, nor can they calibrate it looser than `140.0°`.
- Once the plank hold completes, a 3-second audible countdown (`3, 2, 1, GO`) begins, and the round transitions to `Running`.
