# Mock Athlete Specification & Testing Simulator

> **Module**: `backend/src/pose/mock.rs`  
> **Key Types**: `MockAthlete`, `MockPattern`, `MockSource`  
> **Related Documents**: [Pose Tracking Overview](README.md), [Referee Engine](../referee-engine/README.md)  
> **Maintenance Status**: Active / Essential for CI & Headless Dev  

---

## 1. Overview & Purpose

The **Mock Athlete** is an internal kinematic simulation built directly into the Rust backend (`backend/src/pose/mock.rs`). It generates synthetic 33-landmark skeleton vectors at a guaranteed 30 frames per second without requiring a physical camera, human athlete, or GPU inference pipeline.

It serves as the gold standard for unit tests, continuous integration, and UI design testing.

---

## 2. Scripted Push-Up Patterns

The mock athlete executes scripted movement cycles through mathematical kinematics, simulating distinct human failure modes:

| Pattern Variant | Biomechanical Characteristics | Expected Referee Outcome |
| :--- | :--- | :--- |
| **`Clean`** | Elbow bends down to `75°` (depth passes), body stays locked at `175°` (plank passes), arms straighten to `168°` (lockout passes). | 🟢 **3 White Lights** (Ding / Counted rep) |
| **`Shallow`** | Elbow only dips to `105°` (fails `<= 90°` threshold), body stays straight, arms lockout. | 🔴 **Depth Fault** (Buzzer / No Rep: "Depth: 105°, needed 90°") |
| **`Sagging`** | Elbow reaches `78°` (depth passes), but hips sag to `142°` (fails `>= 160°` plank threshold). | 🔴 **Plank Fault** (Buzzer / No Rep: "Plank: 142°, needed 160°") |
| **`NoLockout`**| Elbow dips to `75°`, but on ascent only extends to `148°` (fails `>= 160°` lockout threshold) before beginning next rep. | 🔴 **Lockout Fault** (Buzzer / No Rep: "Lockout: 148°, needed 160°") |

---

## 3. Kinematic Synthesis Algorithm

Movement is parameterized as a function of elapsed frame index `frame_idx`:

```rust
// Phase angle oscillating between 0.0 (top lockout) and 1.0 (bottom depth)
let phase = ((frame_idx as f32 % REP_FRAMES as f32) / REP_FRAMES as f32 * std::f32::consts::TAU).sin() * 0.5 + 0.5;

// Interpolate elbow angle between top (170 deg) and bottom (target_min_elbow)
let elbow_deg = 170.0 - phase * (170.0 - target_min_elbow);

// Synthesize 2D landmark coordinates based on trigonometric arm geometry
let shoulder_y = base_y + phase * arm_stroke;
let elbow_x = shoulder_x - (elbow_deg.to_radians() / 2.0).sin() * upper_arm_len;
```

---

## 4. How to Use in Development

To start the app with the mock athlete:
1. Open the app (`cargo tauri dev`).
2. Press **S** to open Settings.
3. In the Camera Source dropdown, select **Mock Athlete**.
4. Press **Esc** to return to Home, press **1** for Sprint, enter a name, and observe the mock athlete performing scripted push-ups with precise referee calls.
