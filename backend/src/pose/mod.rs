//! Where pose data comes from.
//!
//! The motion tracker is the MediaPipe JavaScript engine (`pumpCourt/` on
//! main). It runs in the app's window and sends each frame's landmarks here
//! with the `push_pose_frame` command. Everything after this module (angles,
//! referees, rounds, leaderboard) only ever sees [`PoseFrame`]s.
//! See docs/INTEGRATION.md.
//!
//! Sources:
//! * [`mock::MockSource`]       – synthetic athlete, no camera needed
//! * [`sources::PhoneSource`]   – phone camera over the QR link: video from the
//!                                phone, landmarks from the frontend tracker
//! * [`sources::PushedSource`]  – laptop camera: the frontend tracker owns the
//!                                camera and pushes landmarks

pub mod inbox;
pub mod mock;
pub mod sources;

use serde::{Deserialize, Serialize};

/// Number of landmarks MediaPipe Pose Landmarker returns per person.
pub const LANDMARK_COUNT: usize = 33;

/// MediaPipe Pose landmark indices that the referees use.
pub mod idx {
    pub const NOSE: usize = 0;
    pub const LEFT_SHOULDER: usize = 11;
    pub const RIGHT_SHOULDER: usize = 12;
    pub const LEFT_ELBOW: usize = 13;
    pub const RIGHT_ELBOW: usize = 14;
    pub const LEFT_WRIST: usize = 15;
    pub const RIGHT_WRIST: usize = 16;
    pub const LEFT_HIP: usize = 23;
    pub const RIGHT_HIP: usize = 24;
    pub const LEFT_KNEE: usize = 25;
    pub const RIGHT_KNEE: usize = 26;
    pub const LEFT_ANKLE: usize = 27;
    pub const RIGHT_ANKLE: usize = 28;
}

/// One body point, in the same shape MediaPipe's `NormalizedLandmark` uses:
/// `x` and `y` are 0..1 of the image width and height.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct Landmark {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// How likely the point is visible (not hidden) in the image, 0..1.
    pub visibility: f32,
}

/// Everything a source produces for one video frame.
#[derive(Debug, Clone)]
pub struct PoseFrame {
    /// Milliseconds since the source started. Must keep increasing.
    pub timestamp_ms: i64,
    /// Image size in pixels (angles are measured in pixel space).
    pub width: u32,
    pub height: u32,
    /// The 33 landmarks of the tracked person, or `None` if nobody was found.
    pub landmarks: Option<Vec<Landmark>>,
    /// Optional JPEG of the camera image, shown behind the skeleton.
    pub preview_jpeg: Option<Vec<u8>>,
}

/// Anything that can hand us pose frames one at a time.
///
/// `Send` means the source can be moved onto the engine's worker thread.
pub trait PoseSource: Send {
    /// Blocks until the next frame is ready. An `Err` stops the source and
    /// shows the message to the operator.
    fn next_frame(&mut self) -> Result<PoseFrame, String>;
}

/// Which source the operator picked in the camera picker.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SourceSpec {
    /// Synthetic athlete; needs no camera.
    Mock,
    /// The phone camera, connected by scanning the QR code.
    Phone,
    /// Laptop camera: landmarks pushed by the tracker running in the frontend.
    Pushed,
}

/// What sources need from the rest of the app.
#[derive(Clone)]
pub struct SourceDeps {
    pub phone: std::sync::Arc<crate::phone::PhoneHub>,
    pub pushed: std::sync::Arc<inbox::Inbox<sources::PushedPoseFrame>>,
}

/// One entry in the camera picker.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub label: String,
    pub spec: SourceSpec,
}

/// Lists what the operator can choose from.
pub fn list_sources() -> Vec<SourceInfo> {
    // TODO(tracker): add the laptop camera (`SourceSpec::Pushed`) once the
    // frontend tracker is integrated.
    vec![
        SourceInfo { label: "Mock athlete (no camera)".into(), spec: SourceSpec::Mock },
        SourceInfo { label: "Phone camera (QR link)".into(), spec: SourceSpec::Phone },
    ]
}

/// Creates the source the operator picked.
pub fn open_source(spec: &SourceSpec, deps: &SourceDeps) -> Result<Box<dyn PoseSource>, String> {
    Ok(match spec {
        SourceSpec::Mock => Box::new(mock::MockSource::new()),
        SourceSpec::Phone => Box::new(sources::PhoneSource::new(deps.phone.clone(), deps.pushed.clone())),
        SourceSpec::Pushed => Box::new(sources::PushedSource::new(deps.pushed.clone())),
    })
}
