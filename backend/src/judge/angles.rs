//! Joint angles from 2D landmarks.

use crate::pose::{idx, Landmark};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Left,
    Right,
}

/// The near-side landmark indices for one side of the body.
pub struct SideIdx {
    pub shoulder: usize,
    pub elbow: usize,
    pub wrist: usize,
    pub hip: usize,
    pub knee: usize,
    pub ankle: usize,
}

impl SideIdx {
    pub fn all(&self) -> [usize; 6] {
        [self.shoulder, self.elbow, self.wrist, self.hip, self.knee, self.ankle]
    }
}

pub const LEFT: SideIdx = SideIdx {
    shoulder: idx::LEFT_SHOULDER,
    elbow: idx::LEFT_ELBOW,
    wrist: idx::LEFT_WRIST,
    hip: idx::LEFT_HIP,
    knee: idx::LEFT_KNEE,
    ankle: idx::LEFT_ANKLE,
};

pub const RIGHT: SideIdx = SideIdx {
    shoulder: idx::RIGHT_SHOULDER,
    elbow: idx::RIGHT_ELBOW,
    wrist: idx::RIGHT_WRIST,
    hip: idx::RIGHT_HIP,
    knee: idx::RIGHT_KNEE,
    ankle: idx::RIGHT_ANKLE,
};

impl Side {
    pub fn indices(self) -> &'static SideIdx {
        match self {
            Side::Left => &LEFT,
            Side::Right => &RIGHT,
        }
    }
}

/// Elbow, hip and knee angles in degrees, measured on the side nearest the camera.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyAngles {
    pub side: Side,
    pub elbow: f32,
    pub hip: f32,
    pub knee: f32,
    /// Lowest visibility among the six near-side points.
    pub visibility: f32,
}

/// The side whose arm and leg the camera sees best.
pub fn near_side(lms: &[Landmark]) -> Side {
    let score = |s: &SideIdx| s.all().iter().map(|&i| lms[i].visibility).sum::<f32>();
    if score(&LEFT) >= score(&RIGHT) {
        Side::Left
    } else {
        Side::Right
    }
}

/// Angle ABC at point B, in degrees (0..=180).
///
/// Landmarks are normalised 0..1 on both axes, so we scale by the image
/// size first; otherwise a 16:9 frame would squash every angle.
pub fn angle_at(a: Landmark, b: Landmark, c: Landmark, width: f32, height: f32) -> f32 {
    let (bax, bay) = ((a.x - b.x) * width, (a.y - b.y) * height);
    let (bcx, bcy) = ((c.x - b.x) * width, (c.y - b.y) * height);
    let dot = bax * bcx + bay * bcy;
    let len = (bax.hypot(bay) * bcx.hypot(bcy)).max(f32::EPSILON);
    (dot / len).clamp(-1.0, 1.0).acos().to_degrees()
}

/// Computes all three angles for a frame.
pub fn body_angles(lms: &[Landmark], width: u32, height: u32) -> BodyAngles {
    let side = near_side(lms);
    let s = side.indices();
    let (w, h) = (width as f32, height as f32);
    let visibility = s.all().iter().map(|&i| lms[i].visibility).fold(1.0, f32::min);
    BodyAngles {
        side,
        elbow: angle_at(lms[s.shoulder], lms[s.elbow], lms[s.wrist], w, h),
        hip: angle_at(lms[s.shoulder], lms[s.hip], lms[s.ankle], w, h),
        knee: angle_at(lms[s.hip], lms[s.knee], lms[s.ankle], w, h),
        visibility,
    }
}

/// Exponential smoothing. `alpha` = weight of the newest value.
pub struct Smoother {
    alpha: f32,
    last: Option<BodyAngles>,
}

impl Smoother {
    pub fn new(alpha: f32) -> Self {
        Self { alpha: alpha.clamp(0.05, 1.0), last: None }
    }

    pub fn reset(&mut self) {
        self.last = None;
    }

    pub fn smooth(&mut self, raw: BodyAngles) -> BodyAngles {
        let out = match self.last {
            // If the near side flips, start fresh rather than blending two arms.
            Some(prev) if prev.side == raw.side => {
                let mix = |old: f32, new: f32| old + (new - old) * self.alpha;
                BodyAngles {
                    elbow: mix(prev.elbow, raw.elbow),
                    hip: mix(prev.hip, raw.hip),
                    knee: mix(prev.knee, raw.knee),
                    ..raw
                }
            }
            _ => raw,
        };
        self.last = Some(out);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lm(x: f32, y: f32) -> Landmark {
        Landmark { x, y, z: 0.0, visibility: 1.0 }
    }

    #[test]
    fn right_angle() {
        let a = angle_at(lm(0.0, 0.0), lm(0.0, 1.0), lm(1.0, 1.0), 100.0, 100.0);
        assert!((a - 90.0).abs() < 0.01);
    }

    #[test]
    fn straight_line() {
        let a = angle_at(lm(0.0, 0.5), lm(0.5, 0.5), lm(1.0, 0.5), 1280.0, 720.0);
        assert!((a - 180.0).abs() < 0.01);
    }

    #[test]
    fn aspect_ratio_is_respected() {
        // 45 degrees in pixels on a 2:1 image is NOT 45 degrees in 0..1 units.
        let a = angle_at(lm(0.5, 0.0), lm(0.0, 0.0), lm(0.25, 0.5), 200.0, 100.0);
        assert!((a - 45.0).abs() < 0.01, "got {a}");
    }
}
