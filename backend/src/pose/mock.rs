//! A synthetic athlete doing push-ups, seen side-on.
//!
//! It lets the whole app (ready check, referees, rounds, leaderboard) run on
//! any machine with no camera and no MediaPipe build. The script mixes clean
//! reps with the classic mistakes so every referee light gets exercised.

use super::{idx, Landmark, PoseFrame, PoseSource, LANDMARK_COUNT};
use std::time::{Duration, Instant};

const WIDTH: f32 = 1280.0;
const HEIGHT: f32 = 720.0;
const FPS: u64 = 30;

/// What the athlete does in one rep.
#[derive(Clone, Copy)]
enum Rep {
    Clean,
    /// Does not go low enough (bottom elbow angle).
    Shallow(f32),
    /// Hips drop by this many pixels.
    Sag(f32),
    /// Does not straighten the arms (top elbow angle).
    NoLockout(f32),
}

const SCRIPT: [Rep; 8] = [
    Rep::Clean,
    Rep::Clean,
    Rep::Shallow(112.0),
    Rep::Clean,
    Rep::Sag(90.0),
    Rep::NoLockout(138.0),
    Rep::Clean,
    Rep::Clean,
];

const TOP: f32 = 172.0;
const BOTTOM: f32 = 75.0;

/// (time in ms, elbow angle, hip sag in px) points we interpolate between.
type Keyframe = (f32, f32, f32);

pub struct MockSource {
    start: Instant,
    frame_no: u64,
    keyframes: Vec<Keyframe>,
    loop_ms: f32,
    noise_seed: u32,
}

impl MockSource {
    pub fn new() -> Self {
        // Hold the top for 2 s first so the ready check can calibrate.
        let mut keyframes = vec![(0.0, TOP, 0.0), (2000.0, TOP, 0.0)];
        let mut t = 2000.0;
        for rep in SCRIPT {
            let (bottom, top, sag) = match rep {
                Rep::Clean => (BOTTOM, TOP, 0.0),
                Rep::Shallow(b) => (b, TOP, 0.0),
                Rep::Sag(s) => (BOTTOM, TOP, s),
                Rep::NoLockout(top) => (BOTTOM, top, 0.0),
            };
            keyframes.push((t + 600.0, bottom, sag));
            keyframes.push((t + 1200.0, top, sag));
            keyframes.push((t + 1400.0, top, 0.0));
            t += 1400.0;
        }
        // Return to a full top before looping.
        keyframes.push((t + 400.0, TOP, 0.0));
        let loop_ms = t + 400.0;
        Self { start: Instant::now(), frame_no: 0, keyframes, loop_ms, noise_seed: 12345 }
    }

    /// Elbow angle and hip sag at time `t_ms`, smoothly eased between keyframes.
    fn sample(&self, t_ms: f32) -> (f32, f32) {
        let t = t_ms % self.loop_ms;
        for pair in self.keyframes.windows(2) {
            let (t0, e0, s0) = pair[0];
            let (t1, e1, s1) = pair[1];
            if t >= t0 && t <= t1 {
                let p = (t - t0) / (t1 - t0);
                let eased = 0.5 - 0.5 * (p * std::f32::consts::PI).cos();
                return (e0 + (e1 - e0) * eased, s0 + (s1 - s0) * eased);
            }
        }
        (TOP, 0.0)
    }

    /// Tiny deterministic jitter in pixels, like a real tracker's wobble.
    fn jitter(&mut self) -> f32 {
        self.noise_seed = self.noise_seed.wrapping_mul(1_103_515_245).wrapping_add(12345);
        ((self.noise_seed >> 16) as f32 / 65535.0 - 0.5) * 3.0
    }

    fn build_landmarks(&mut self, elbow_deg: f32, sag: f32) -> Vec<Landmark> {
        let (upper_arm, forearm) = (150.0_f32, 140.0_f32);
        let wrist = (380.0, 640.0);
        let ankle = (1080.0, 630.0);

        // Law of cosines: distance wrist->shoulder for this elbow angle.
        let theta = elbow_deg.to_radians();
        let d = (upper_arm.powi(2) + forearm.powi(2) - 2.0 * upper_arm * forearm * theta.cos()).sqrt();
        let shoulder = (wrist.0, wrist.1 - d);
        // Angle at the wrist between "up" and the forearm; elbows point to the feet.
        let alpha = ((forearm.powi(2) + d.powi(2) - upper_arm.powi(2)) / (2.0 * forearm * d)).clamp(-1.0, 1.0).acos();
        let elbow = (wrist.0 + forearm * alpha.sin(), wrist.1 - forearm * alpha.cos());

        let lerp = |a: (f32, f32), b: (f32, f32), p: f32| (a.0 + (b.0 - a.0) * p, a.1 + (b.1 - a.1) * p);
        let hip_line = lerp(shoulder, ankle, 0.42);
        let hip = (hip_line.0, hip_line.1 + sag);
        let knee = lerp(hip, ankle, 0.5);
        let body_dir = {
            let (dx, dy) = (shoulder.0 - ankle.0, shoulder.1 - ankle.1);
            let len = (dx * dx + dy * dy).sqrt();
            (dx / len, dy / len)
        };
        let nose = (shoulder.0 + body_dir.0 * 70.0, shoulder.1 + body_dir.1 * 70.0 + 10.0);

        let mut out = vec![Landmark::default(); LANDMARK_COUNT];
        let mut put = |i: usize, p: (f32, f32), vis: f32, j: f32| {
            out[i] = Landmark { x: (p.0 + j) / WIDTH, y: (p.1 + j) / HEIGHT, z: 0.0, visibility: vis };
        };
        // Head points (0..=10) cluster around the nose.
        for i in 0..=10 {
            let j = self.jitter();
            put(i, nose, 0.9, j);
        }
        let near = [
            (idx::LEFT_SHOULDER, shoulder),
            (idx::LEFT_ELBOW, elbow),
            (idx::LEFT_WRIST, wrist),
            (idx::LEFT_HIP, hip),
            (idx::LEFT_KNEE, knee),
            (idx::LEFT_ANKLE, ankle),
        ];
        for (i, p) in near {
            let j = self.jitter();
            put(i, p, 0.95, j);
            // The far side sits almost exactly behind the near side when side-on.
            let j = self.jitter();
            put(i + 1, (p.0 + 6.0, p.1 - 4.0), 0.5, j);
        }
        // Hands (17..=22) at the wrists, feet (29..=32) at the ankles.
        for i in 17..=22 {
            put(i, wrist, 0.8, 0.0);
        }
        for i in 29..=32 {
            put(i, ankle, 0.8, 0.0);
        }
        out
    }
}

impl MockSource {
    /// The frame the athlete shows at `t_ms` into the script (no waiting).
    pub fn frame_at(&mut self, t_ms: i64) -> PoseFrame {
        let (elbow, sag) = self.sample(t_ms as f32);
        PoseFrame {
            timestamp_ms: t_ms,
            width: WIDTH as u32,
            height: HEIGHT as u32,
            landmarks: Some(self.build_landmarks(elbow, sag)),
            preview_jpeg: None,
        }
    }
}

impl PoseSource for MockSource {
    fn next_frame(&mut self) -> Result<PoseFrame, String> {
        // Pace ourselves like a real 30 fps camera.
        self.frame_no += 1;
        let due = self.start + Duration::from_millis(self.frame_no * 1000 / FPS);
        if let Some(wait) = due.checked_duration_since(Instant::now()) {
            std::thread::sleep(wait);
        }
        let t_ms = self.start.elapsed().as_millis() as i64;
        Ok(self.frame_at(t_ms))
    }
}
