# Biomechanical Angle Calculations & Signal Smoothing

> **Module**: `backend/src/judge/angles.rs` and `pumpCourt/src/geometry.ts`  
> **Key Types**: `BodyAngles`, `Smoother`, `Landmark`  
> **Related Documents**: [Referee Engine Overview](README.md), [Rep Segmentation](rep-segmentation.md)  
> **Maintenance Status**: Active / Mathematical Core  

---

## 1. Geometric Angle Formula

All joint angles are calculated in 2D Euclidean image space using the vector dot product formula. Given three joint landmarks $A$, $B$ (vertex), and $C$:

$$\vec{u} = A - B = (A_x - B_x, A_y - B_y)$$
$$\vec{v} = C - B = (C_x - B_x, C_y - B_y)$$

The interior angle $\theta$ in radians is:

$$\theta = \arccos\left( \frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\| \|\vec{v}\|} \right)$$

Converted to degrees:

$$\text{degrees} = \theta \times \frac{180}{\pi}$$

```rust
// In backend/src/judge/angles.rs
pub fn angle(a: &Landmark, b: &Landmark, c: &Landmark) -> f32 {
    let ux = a.x - b.x;
    let uy = a.y - b.y;
    let vx = c.x - b.x;
    let vy = c.y - b.y;
    let dot = ux * vx + uy * vy;
    let len_u = (ux * ux + uy * uy).sqrt();
    let len_v = (vx * vx + vy * vy).sqrt();
    if len_u < 1e-4 || len_v < 1e-4 {
        return 180.0;
    }
    let cos = (dot / (len_u * len_v)).clamp(-1.0, 1.0);
    cos.acos().to_degrees()
}
```

---

## 2. Anatomical Angles Evaluated

1. **Elbow Flexion**: Calculated with vertex at Elbow: $A = \text{Shoulder}$, $B = \text{Elbow}$, $C = \text{Wrist}$.
   - $180^\circ$: Completely straight arm.
   - $90^\circ$: Right-angle bend (competition depth threshold).
   - $< 70^\circ$: Deep chest-to-floor touch.
2. **Hip Alignment (Plank)**: Calculated with vertex at Hip: $A = \text{Shoulder}$, $B = \text{Hip}$, $C = \text{Ankle}$.
   - $180^\circ$: Perfect linear alignment from shoulder to ankle.
   - $< 160^\circ$: Sagging pelvis or excessive butt piking.
3. **Knee Extension**: Calculated with vertex at Knee: $A = \text{Hip}$, $B = \text{Knee}$, $C = \text{Ankle}$.
   - $180^\circ$: Rigid straight legs.
   - $< 140^\circ$: Knees touching mat or excessively bent.

---

## 3. Signal Smoothing (Exponential Moving Average)

Camera feeds exhibit micro-jitter and high-frequency noise from sensor gain. Directly judging raw instantaneous angles causes false fault triggers. However, excessive filtering introduces phase lag and blunts sharp bottom reversal points.

Pump-Court uses a calibrated **Exponential Moving Average (EMA)**:

$$\theta_{\text{smoothed}}^{(t)} = \alpha \cdot \theta_{\text{raw}}^{(t)} + (1 - \alpha) \cdot \theta_{\text{smoothed}}^{(t-1)}$$

- Default `smoothing_alpha`: **`0.6`**.
- An $\alpha$ of $0.6$ provides immediate responsiveness during rapid 2-rep-per-second sprints while dampening sensor jitter without clipping the minimum depth spike.
